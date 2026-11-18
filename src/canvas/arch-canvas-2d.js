/**
 * SPS Project 2.0 — Revit-Darajasidagi 2D Arxitektura Chizma Muharriri (ArchCanvas2D)
 *
 * Qat'iy qoidalar:
 * 1) Boshlang'ich rejim har doim 'select' — bo'sh joyga bosish HECH QACHON tasodifiy devor chizmaydi!
 * 2) Devorni surishda (Constrained Drag) xona kvadraturalari real vaqtda (60 FPS) buzilmasdan yangilanadi!
 * 3) Tanlangan devorning har ikki tomonida Revit "Witness Dimensions" (в свету) chiqadi — ustiga bosib aniq son yozsa bo'ladi!
 */

import {
  getNodeMap,
  addWallSegment,
  addRectWalls,
  addWallOpening,
  flipOpeningSwing,
  moveWallParallel,
  computeWallWitnessDimensions,
  setWallWitnessDistance,
  deleteWallById,
  getFloorWorldBounds,
  projectOnSegment,
  pointInPolygon,
  roundMm,
  roundCm,
  makeArchId,
  ROOM_TYPES_CATALOG,
} from '../core/planar-wall-graph.js';
import { cloneProject } from '../core/arch-store.js';

export class ArchCanvas2D {
  constructor(containerEl, store, callbacks = {}) {
    this.container = containerEl;
    this.store = store;
    this.callbacks = callbacks;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'arch-canvas-2d';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Hudud ustidagi interaktiv kiritish oynasi (Witness o'lcham yoki devor uzunligini klaviaturada yozish uchun)
    this.inlineInputWrap = document.createElement('div');
    this.inlineInputWrap.className = 'cad-inline-dim-box';
    this.inlineInputWrap.style.display = 'none';
    this.container.appendChild(this.inlineInputWrap);

    this.zoomPxPerM = 52;
    this.panX = 120;
    this.panY = 90;

    this.mouseWorld = { x: 0, y: 0 };
    this.snappedWorld = { x: 0, y: 0, snapKind: null, guideX: null, guideY: null };
    this.wallChainStart = null; // { x, y }
    this.rectStart = null; // { x, y }
    this.calibrateStart = null; // { x, y }
    this.typedBuf = '';
    this.openingPreview = null;
    this.witnessHitBoxes = []; // [{ x, y, w, h, dim }]

    this.dragState = null;
    this.spaceDown = false;
    this.shiftDown = false;
    this.underlayImgCache = new Map();
    this._rafPending = false;

    this._bindEvents();
    this.resize();
    this.fitToBuilding();
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoomPxPerM + this.panX,
      y: wy * this.zoomPxPerM + this.panY,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.panX) / this.zoomPxPerM,
      y: (sy - this.panY) / this.zoomPxPerM,
    };
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(200, Math.floor(rect.width));
    const h = Math.max(200, Math.floor(rect.height));
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dpr = dpr;
    this.requestRender();
  }

  fitToBuilding() {
    const fl = this.store.getActiveFloor();
    const b = getFloorWorldBounds(fl);
    const padPx = 86;
    const availW = Math.max(160, (this.viewW || 800) - padPx * 2);
    const availH = Math.max(160, (this.viewH || 600) - padPx * 2);
    this.zoomPxPerM = Math.max(18, Math.min(130, Math.min(availW / b.width, availH / b.height)));
    this.panX = (this.viewW - b.width * this.zoomPxPerM) * 0.5 - b.minX * this.zoomPxPerM;
    this.panY = (this.viewH - b.height * this.zoomPxPerM) * 0.5 - b.minY * this.zoomPxPerM;
    this.requestRender();
  }

  requestRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.render();
    });
  }

  cancelActiveDraft() {
    this.wallChainStart = null;
    this.rectStart = null;
    this.calibrateStart = null;
    this.typedBuf = '';
    this._hideInlineDimInput();
    this.requestRender();
  }

  _computeMagneticSnap(rawWorld, anchorPt = null) {
    const settings = this.store.state.settings;
    const fl = this.store.getActiveFloor();
    let x = rawWorld.x;
    let y = rawWorld.y;
    let snapKind = null;
    let guideX = null;
    let guideY = null;

    const snapRadiusM = Math.min(0.28, 12 / this.zoomPxPerM);
    const scanSnapRadiusM = Math.min(0.36, 17 / this.zoomPxPerM);
    const scanGuides = (settings.scanSnapEnabled !== false && settings.lidarVisible !== false)
      ? fl?.scanOverlay?.snapGuides
      : null;
    let snapLabel = null;

    if (settings.snapEnabled !== false && fl) {
      // 1. Tugunlarga (BIM burchaklarga) magnit tortish
      let bestNd = null;
      let bestD = snapRadiusM;
      for (const nd of fl.nodes || []) {
        const d = Math.hypot(nd.x - x, nd.y - y);
        if (d < bestD) {
          bestD = d;
          bestNd = nd;
        }
      }
      if (bestNd) {
        x = bestNd.x;
        y = bestNd.y;
        snapKind = 'endpoint';
        snapLabel = '🧲 Burchak';
      } else {
        // 2. Devor o'rta nuqtasi yoki devor chizig'iga T-tutashuv magniti
        const nm = getNodeMap(fl);
        let bestProj = null;
        let bestWallD = snapRadiusM * 0.85;
        for (const w of fl.walls || []) {
          const a = nm.get(w.n1);
          const b = nm.get(w.n2);
          if (!a || !b) continue;
          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5;
          if (Math.hypot(mx - x, my - y) < snapRadiusM * 0.85) {
            x = roundMm(mx);
            y = roundMm(my);
            snapKind = 'midpoint';
            snapLabel = '🧲 O‘rta nuqta';
            bestProj = null;
            break;
          }
          const pr = projectOnSegment(x, y, a.x, a.y, b.x, b.y);
          if (pr.dist < bestWallD) {
            bestWallD = pr.dist;
            bestProj = pr;
          }
        }
        if (bestProj && !snapKind) {
          x = roundMm(bestProj.x);
          y = roundMm(bestProj.y);
          snapKind = 'edge';
          snapLabel = '🧲 BIM devor';
        }

        // 2B. SKAN-MAGNIT: 3D Skaner burchaklariga va lazer devor chiziqlariga magnit tortish!
        if (!snapKind && scanGuides) {
          let bestCorner = null;
          let bestCornerD = scanSnapRadiusM;
          for (const c of scanGuides.corners || []) {
            const d = Math.hypot(c.x - x, c.y - y);
            if (d < bestCornerD) {
              bestCornerD = d;
              bestCorner = c;
            }
          }
          if (bestCorner) {
            x = bestCorner.x;
            y = bestCorner.y;
            guideX = bestCorner.x;
            guideY = bestCorner.y;
            snapKind = 'scan_corner';
            snapLabel = '🧲 Skan burchagi';
          } else {
            let bestXr = null;
            let bestXd = scanSnapRadiusM * 0.88;
            for (const xr of scanGuides.xRails || []) {
              if (y >= xr.min - 0.9 && y <= xr.max + 0.9) {
                const d = Math.abs(xr.pos - x);
                if (d < bestXd) { bestXd = d; bestXr = xr; }
              }
            }
            let bestYr = null;
            let bestYd = scanSnapRadiusM * 0.88;
            for (const yr of scanGuides.yRails || []) {
              if (x >= yr.min - 0.9 && x <= yr.max + 0.9) {
                const d = Math.abs(yr.pos - y);
                if (d < bestYd) { bestYd = d; bestYr = yr; }
              }
            }
            if (bestXr && bestYr) {
              x = bestXr.pos;
              y = bestYr.pos;
              guideX = bestXr.pos;
              guideY = bestYr.pos;
              snapKind = 'scan_corner';
              snapLabel = '🧲 Skan burchagi';
            } else if (bestXr) {
              x = bestXr.pos;
              guideX = bestXr.pos;
              snapKind = 'scan_rail';
              snapLabel = `🧲 Skan devori (X=${bestXr.pos.toFixed(2)})`;
            } else if (bestYr) {
              y = bestYr.pos;
              guideY = bestYr.pos;
              snapKind = 'scan_rail';
              snapLabel = `🧲 Skan devori (Y=${bestYr.pos.toFixed(2)})`;
            }
          }
        }

        // 3. Mavjud tugunlar bilan X/Y tekislash chiziqlari (Smart Alignment Guides)
        if (!snapKind) {
          for (const nd of fl.nodes || []) {
            if (Math.abs(nd.x - x) < snapRadiusM * 0.65) {
              x = nd.x;
              guideX = nd.x;
            }
            if (Math.abs(nd.y - y) < snapRadiusM * 0.65) {
              y = nd.y;
              guideY = nd.y;
            }
          }
        }
      }

      // 4. 5 sm panjara qadami (agar tugun/skanga yopishmagan bo'lsa)
      if (!snapKind && guideX === null) x = Math.round(x * 20) / 20;
      if (!snapKind && guideY === null) y = Math.round(y * 20) / 20;
    }

    // 5. Ortogonal qulf (90°) + ko'ndalang Skan-Magnit devorga borib taqalish!
    const orthoOn = (settings.orthoEnabled !== false) !== this.shiftDown;
    if (anchorPt && orthoOn && snapKind !== 'endpoint' && snapKind !== 'scan_corner') {
      const dx = x - anchorPt.x;
      const dy = y - anchorPt.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        y = anchorPt.y;
        if (scanGuides) {
          for (const xr of scanGuides.xRails || []) {
            if (Math.abs(xr.pos - x) < scanSnapRadiusM && y >= xr.min - 0.9 && y <= xr.max + 0.9) {
              x = xr.pos;
              guideX = xr.pos;
              snapKind = 'scan_corner';
              snapLabel = '🧲 Skan devoriga tutashuv';
              break;
            }
          }
        }
      } else {
        x = anchorPt.x;
        if (scanGuides) {
          for (const yr of scanGuides.yRails || []) {
            if (Math.abs(yr.pos - y) < scanSnapRadiusM && x >= yr.min - 0.9 && x <= yr.max + 0.9) {
              y = yr.pos;
              guideY = yr.pos;
              snapKind = 'scan_corner';
              snapLabel = '🧲 Skan devoriga tutashuv';
              break;
            }
          }
        }
      }
    }

    return { x: roundMm(x), y: roundMm(y), snapKind, snapLabel, guideX, guideY };
  }

  _bindEvents() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    // Sichqoncha g'ildiragi bilan kursor markazida silliq Zoom
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const before = this.screenToWorld(sx, sy);
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.zoomPxPerM = Math.max(12, Math.min(260, this.zoomPxPerM * factor));
        this.panX = sx - before.x * this.zoomPxPerM;
        this.panY = sy - before.y * this.zoomPxPerM;
        this.requestRender();
      },
      { passive: false },
    );

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.wallChainStart || this.rectStart || this.calibrateStart) {
        this.cancelActiveDraft();
      } else if (this.store.state.activeTool !== 'select') {
        this.store.setTool('select');
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // O'rta tugma, o'ng tugma (bo'shda) yoki Space+Click -> Pan
      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        e.preventDefault();
        this.dragState = { kind: 'pan', startSx: sx, startSy: sy, origPanX: this.panX, origPanY: this.panY };
        return;
      }
      if (e.button !== 0) return;

      // 1) Tanlangan devorning ko'k Witness o'lcham ustiga bosildimi?
      for (const box of this.witnessHitBoxes) {
        if (sx >= box.x && sx <= box.x + box.w && sy >= box.y && sy <= box.y + box.h) {
          this._openInlineWitnessEditor(box);
          return;
        }
      }
      this._hideInlineDimInput();

      const rawW = this.screenToWorld(sx, sy);
      const anchor = this.wallChainStart || this.rectStart || this.calibrateStart;
      this.mouseWorld = rawW;
      this.snappedWorld = this._computeMagneticSnap(rawW, anchor);

      const tool = this.store.state.activeTool;
      if (tool === 'select') {
        this._handleSelectMouseDown(sx, sy, rawW);
      } else {
        this._handleToolClick(rawW, this.snappedWorld);
      }
    });

    this._onWinMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const rawW = this.screenToWorld(sx, sy);
      this.mouseWorld = rawW;

      if (this.dragState) {
        this._handleActiveDrag(sx, sy, rawW);
        return;
      }

      const anchor = this.wallChainStart || this.rectStart || this.calibrateStart;
      this.snappedWorld = this._computeMagneticSnap(rawW, anchor);

      const tool = this.store.state.activeTool;
      if (tool === 'door' || tool === 'window' || tool === 'arch') {
        this.openingPreview = this._findOpeningSnapPreview(rawW.x, rawW.y, tool);
      } else {
        this.openingPreview = null;
      }

      this.callbacks.onCursorMove?.({
        x: this.snappedWorld.x,
        y: this.snappedWorld.y,
        zoomPct: Math.round((this.zoomPxPerM / 52) * 100),
      });
      this.requestRender();
    };

    this._onWinUp = () => {
      if (!this.dragState) return;
      const ds = this.dragState;
      this.dragState = null;

      if (ds.kind === 'wall_move' && ds.movedEnough && Math.abs(ds.lastDeltaM || 0) >= 0.005) {
        const chainMode = this._resolveChainMode(ds.wallKind);
        this.store.commit((_proj, fl) => {
          moveWallParallel(fl, ds.wallId, ds.lastDeltaM, { chainMode });
        }, 'move-wall');
      } else if (ds.kind === 'opening_slide' && ds.movedEnough && ds.newT !== undefined) {
        this.store.commit((_proj, fl) => {
          const op = (fl.openings || []).find((o) => o.id === ds.openingId);
          if (op) op.t = ds.newT;
        }, 'move-opening');
      } else if (ds.kind === 'element_move' && ds.movedEnough && ds.newPos) {
        this.store.commit((_proj, fl) => {
          const el = (fl.elements || []).find((it) => it.id === ds.elId);
          if (el) {
            el.x = ds.newPos.x;
            el.y = ds.newPos.y;
          }
        }, 'move-element');
      }
      this.requestRender();
    };

    this._onKeyDown = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      this.shiftDown = Boolean(e.shiftKey);
      if (e.code === 'Space') {
        // Agar eshik tanlangan bo'lsa, Space eshik ochilish tomonini aylantiradi (xuddi Revitdagidek!)
        const sel = this.store.state.selection;
        if (sel?.kind === 'opening') {
          e.preventDefault();
          this.store.commit((_proj, fl) => {
            flipOpeningSwing(fl, sel.id);
          }, 'flip-door');
          return;
        }
        this.spaceDown = true;
        this.canvas.style.cursor = 'grab';
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.store.redo();
        else this.store.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.store.redo();
        return;
      }

      if (e.key === 'Escape') {
        if (this.wallChainStart || this.rectStart || this.calibrateStart) {
          this.cancelActiveDraft();
        } else {
          this.store.setTool('select');
          this.store.setSelection(null);
        }
        return;
      }

      // Tezkor klaviatura qisqartmalari (V = Tanlash, W = Devor, R = Xona, D = Eshik, N = Oyna)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'v') { this.cancelActiveDraft(); this.store.setTool('select'); return; }
        if (k === 'w') { this.cancelActiveDraft(); this.store.setTool('wall'); return; }
        if (k === 'r') { this.cancelActiveDraft(); this.store.setTool('rect_room'); return; }
      }

      // Devor yoki to'rtburchak chizishda klaviaturadan to'g'ridan-to'g'ri raqam yozish ("4.8" + Enter yoki "4.5x6" + Enter)
      if ((this.wallChainStart && this.store.state.activeTool === 'wall') || (this.rectStart && this.store.state.activeTool === 'rect_room')) {
        if (/^[0-9.,xх*]$/i.test(e.key)) {
          this.typedBuf += e.key === ',' ? '.' : e.key.toLowerCase().replace('х', 'x').replace('*', 'x');
          this.requestRender();
          return;
        }
        if (e.key === 'Backspace' && this.typedBuf.length > 0) {
          e.preventDefault();
          this.typedBuf = this.typedBuf.slice(0, -1);
          this.requestRender();
          return;
        }
        if (e.key === 'Enter' && this.typedBuf.length > 0) {
          e.preventDefault();
          this._commitTypedMeasurement();
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = this.store.state.selection;
        if (!sel) return;
        e.preventDefault();
        this.deleteSelection(sel);
      }
    };

    this._onKeyUp = (e) => {
      this.shiftDown = Boolean(e.shiftKey);
      if (e.code === 'Space') {
        this.spaceDown = false;
        this.canvas.style.cursor = '';
      }
    };

    // Mobil / Planshet sensorli boshqaruv (1 barmoq = tanlash/pan, 2 barmoq = silliq pinch-zoom)
    let touchState = null;
    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const [t1, t2] = [e.touches[0], e.touches[1]];
          touchState = {
            mode: 'pinch',
            dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1,
            midX: (t1.clientX + t2.clientX) * 0.5,
            midY: (t1.clientY + t2.clientY) * 0.5,
            origZoom: this.zoomPxPerM,
            origPanX: this.panX,
            origPanY: this.panY,
          };
        } else if (e.touches.length === 1) {
          const rect = this.canvas.getBoundingClientRect();
          const sx = e.touches[0].clientX - rect.left;
          const sy = e.touches[0].clientY - rect.top;
          touchState = { mode: 'single', startSx: sx, startSy: sy, origPanX: this.panX, origPanY: this.panY, moved: false };
        }
      },
      { passive: false },
    );

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        if (!touchState) return;
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        if (touchState.mode === 'pinch' && e.touches.length === 2) {
          const [t1, t2] = [e.touches[0], e.touches[1]];
          const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1;
          const midSx = (t1.clientX + t2.clientX) * 0.5 - rect.left;
          const midSy = (t1.clientY + t2.clientY) * 0.5 - rect.top;
          const worldBefore = {
            x: (midSx - touchState.origPanX) / touchState.origZoom,
            y: (midSy - touchState.origPanY) / touchState.origZoom,
          };
          this.zoomPxPerM = Math.max(14, Math.min(220, touchState.origZoom * (newDist / touchState.dist)));
          this.panX = midSx - worldBefore.x * this.zoomPxPerM;
          this.panY = midSy - worldBefore.y * this.zoomPxPerM;
          this.requestRender();
        } else if (touchState.mode === 'single' && e.touches.length === 1) {
          const sx = e.touches[0].clientX - rect.left;
          const sy = e.touches[0].clientY - rect.top;
          if (Math.hypot(sx - touchState.startSx, sy - touchState.startSy) > 6) {
            touchState.moved = true;
            this.panX = touchState.origPanX + (sx - touchState.startSx);
            this.panY = touchState.origPanY + (sy - touchState.startSy);
            this.requestRender();
          }
        }
      },
      { passive: false },
    );

    this.canvas.addEventListener('touchend', (e) => {
      if (touchState && touchState.mode === 'single' && !touchState.moved && e.changedTouches.length === 1) {
        const wPt = this.screenToWorld(touchState.startSx, touchState.startSy);
        if (this.store.state.activeTool === 'select') {
          const hit = this._hitTestFloor(this.store.getActiveFloor(), wPt.x, wPt.y);
          this.store.setSelection(hit);
        } else {
          this.snappedWorld = this._computeMagneticSnap(wPt, this.wallChainStart || this.rectStart);
          this._handleToolClick(wPt, this.snappedWorld);
        }
      }
      if (e.touches.length === 0) touchState = null;
    });

    window.addEventListener('mousemove', this._onWinMove);
    window.addEventListener('mouseup', this._onWinUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _resolveChainMode(wallKind) {
    const pref = this.store.state.settings.wallChainMode || 'auto';
    if (this.shiftDown) return 'segment';
    if (pref === 'collinear_chain' || pref === 'segment') return pref;
    return wallKind === 'exterior' ? 'collinear_chain' : 'segment';
  }

  deleteSelection(sel) {
    if (!sel) return;
    this.store.commit((_proj, fl, st) => {
      if (sel.kind === 'wall') {
        deleteWallById(fl, sel.id);
      } else if (sel.kind === 'opening') {
        fl.openings = (fl.openings || []).filter((o) => o.id !== sel.id);
      } else if (sel.kind === 'element') {
        fl.elements = (fl.elements || []).filter((el) => el.id !== sel.id);
      }
      st.selection = null;
    }, 'delete-selection');
  }

  _hitTestFloor(fl, wx, wy) {
    if (!fl) return null;
    const nm = getNodeMap(fl);
    const pickTolM = Math.max(0.14, 9 / this.zoomPxPerM);

    // 1. Eshik / Oyna
    for (const op of fl.openings || []) {
      const w = fl.walls.find((x) => x.id === op.wallId);
      const a = w ? nm.get(w.n1) : null;
      const b = w ? nm.get(w.n2) : null;
      if (!a || !b) continue;
      const cx = a.x + (b.x - a.x) * op.t;
      const cy = a.y + (b.y - a.y) * op.t;
      if (Math.hypot(wx - cx, wy - cy) <= Math.max(0.28, (op.widthM || 0.9) * 0.45)) {
        return { kind: 'opening', id: op.id, wallId: op.wallId };
      }
    }

    // 2. Ustun / Shaxta / Zina
    for (const el of fl.elements || []) {
      const hw = (el.wM || 0.5) * 0.5 + 0.08;
      const hd = (el.dM || 0.5) * 0.5 + 0.08;
      if (Math.abs(wx - el.x) <= hw && Math.abs(wy - el.y) <= hd) {
        return { kind: 'element', id: el.id };
      }
    }

    // 3. Devorlar
    let bestWall = null;
    let bestD = Infinity;
    for (const w of fl.walls || []) {
      const a = nm.get(w.n1);
      const b = nm.get(w.n2);
      if (!a || !b) continue;
      const pr = projectOnSegment(wx, wy, a.x, a.y, b.x, b.y);
      const halfT = (w.thickness || 0.2) * 0.5 + pickTolM * 0.5;
      if (pr.dist <= halfT && pr.dist < bestD) {
        bestD = pr.dist;
        bestWall = w;
      }
    }
    if (bestWall) {
      return { kind: 'wall', id: bestWall.id };
    }

    // 4. Xonalar (sof ichki poligon bo'yicha)
    for (const rm of fl.rooms || []) {
      if (pointInPolygon(wx, wy, rm.innerPoly)) {
        return { kind: 'room', id: rm.id };
      }
    }
    return null;
  }

  _handleSelectMouseDown(sx, sy, rawW) {
    const fl = this.store.getActiveFloor();
    const hit = this._hitTestFloor(fl, rawW.x, rawW.y);
    this.store.setSelection(hit);

    if (!hit) {
      // Bo'sh joyni bosib sursa — xarita silliq suriladi (Pan), hech qachon tasodifiy devor chizilmaydi!
      this.dragState = { kind: 'pan', startSx: sx, startSy: sy, origPanX: this.panX, origPanY: this.panY };
      return;
    }

    if (hit.kind === 'wall') {
      const nm = getNodeMap(fl);
      const w = fl.walls.find((it) => it.id === hit.id);
      const a = w ? nm.get(w.n1) : null;
      const b = w ? nm.get(w.n2) : null;
      if (w && a && b) {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        this.dragState = {
          kind: 'wall_move',
          wallId: w.id,
          wallKind: w.kind,
          origAxisX: a.x,
          origAxisY: a.y,
          halfT: (w.thickness || 0.2) * 0.5,
          startSx: sx,
          startSy: sy,
          startWorld: { ...rawW },
          nx,
          ny,
          movedEnough: false,
          lastDeltaM: 0,
          scanSnapMsg: null,
          previewFloor: null,
        };
      }
    } else if (hit.kind === 'opening') {
      this.dragState = {
        kind: 'opening_slide',
        openingId: hit.id,
        wallId: hit.wallId,
        startSx: sx,
        startSy: sy,
        movedEnough: false,
        newT: undefined,
      };
    } else if (hit.kind === 'element') {
      const el = (fl.elements || []).find((it) => it.id === hit.id);
      if (el) {
        this.dragState = {
          kind: 'element_move',
          elId: el.id,
          startSx: sx,
          startSy: sy,
          offX: el.x - rawW.x,
          offY: el.y - rawW.y,
          movedEnough: false,
          newPos: null,
        };
      }
    }
  }

  _handleActiveDrag(sx, sy, rawW) {
    const ds = this.dragState;
    if (!ds) return;
    if (ds.kind === 'pan') {
      this.panX = ds.origPanX + (sx - ds.startSx);
      this.panY = ds.origPanY + (sy - ds.startSy);
      this.requestRender();
      return;
    }

    // Kamida 6 piksel siljigandagina tahrirlash boshlanadi (oddiy klikda element 1 mm ham siljimaydi!)
    if (!ds.movedEnough && Math.hypot(sx - ds.startSx, sy - ds.startSy) < 6) {
      return;
    }
    ds.movedEnough = true;

    if (ds.kind === 'wall_move') {
      const rawDelta = (rawW.x - ds.startWorld.x) * ds.nx + (rawW.y - ds.startWorld.y) * ds.ny;
      let snappedDelta = this.store.state.settings.snapEnabled !== false
        ? Math.round(rawDelta * 20) / 20 // 5 sm aniq qadam
        : roundMm(rawDelta);
      ds.scanSnapMsg = null;

      // Skan-Magnit: devor surilayotganda ichki yuzasi (yoki o'qi) skan lazer chizig'iga ±16 sm yaqinlashsa — 0.0 mm aniq yopishadi!
      const s = this.store.state.settings;
      const guides = (s.scanSnapEnabled !== false && s.lidarVisible !== false)
        ? this.store.getActiveFloor()?.scanOverlay?.snapGuides
        : null;
      if (guides) {
        if (Math.abs(ds.nx) > 0.9) {
          const curAxisX = ds.origAxisX + rawDelta * ds.nx;
          for (const xr of guides.xRails || []) {
            for (const faceOff of [-ds.halfT, ds.halfT, 0]) {
              const candAxisX = xr.pos + faceOff;
              if (Math.abs(candAxisX - curAxisX) <= 0.16) {
                snappedDelta = roundMm((candAxisX - ds.origAxisX) / ds.nx);
                ds.scanSnapMsg = faceOff === 0 ? `🧲 Skan o‘qi X=${xr.pos.toFixed(2)}m` : `🧲 Skan ichki yuzasi (в свету X=${xr.pos.toFixed(2)}m)`;
                break;
              }
            }
            if (ds.scanSnapMsg) break;
          }
        } else if (Math.abs(ds.ny) > 0.9) {
          const curAxisY = ds.origAxisY + rawDelta * ds.ny;
          for (const yr of guides.yRails || []) {
            for (const faceOff of [-ds.halfT, ds.halfT, 0]) {
              const candAxisY = yr.pos + faceOff;
              if (Math.abs(candAxisY - curAxisY) <= 0.16) {
                snappedDelta = roundMm((candAxisY - ds.origAxisY) / ds.ny);
                ds.scanSnapMsg = faceOff === 0 ? `🧲 Skan o‘qi Y=${yr.pos.toFixed(2)}m` : `🧲 Skan ichki yuzasi (в свету Y=${yr.pos.toFixed(2)}m)`;
                break;
              }
            }
            if (ds.scanSnapMsg) break;
          }
        }
      }

      ds.lastDeltaM = snappedDelta;

      // Jonli 60-FPS preview: xonalar m2 si surilayotgan paytning o'zidayoq aniq ko'rinadi!
      const tempFloor = cloneProject(this.store.getActiveFloor());
      const chainMode = this._resolveChainMode(ds.wallKind);
      moveWallParallel(tempFloor, ds.wallId, snappedDelta, { chainMode });
      ds.previewFloor = tempFloor;
      this.requestRender();
    } else if (ds.kind === 'opening_slide') {
      const fl = this.store.getActiveFloor();
      const nm = getNodeMap(fl);
      const w = fl.walls.find((it) => it.id === ds.wallId);
      const op = (fl.openings || []).find((o) => o.id === ds.openingId);
      const a = w ? nm.get(w.n1) : null;
      const b = w ? nm.get(w.n2) : null;
      if (w && op && a && b) {
        const pr = projectOnSegment(rawW.x, rawW.y, a.x, a.y, b.x, b.y);
        const pad = Math.min(0.45, ((op.widthM || 0.9) * 0.5 + 0.06) / Math.max(0.5, pr.len));
        ds.newT = Math.round(Math.max(pad, Math.min(1 - pad, pr.t)) * 10000) / 10000;
        this.requestRender();
      }
    } else if (ds.kind === 'element_move') {
      ds.newPos = {
        x: roundCm(rawW.x + ds.offX),
        y: roundCm(rawW.y + ds.offY),
      };
      this.requestRender();
    }
  }

  _findOpeningSnapPreview(wx, wy, tool) {
    const fl = this.store.getActiveFloor();
    if (!fl) return null;
    const nm = getNodeMap(fl);
    const s = this.store.state.settings;
    const defaultWidthM = tool === 'window' ? (Number(s.windowWidthM) || 1.6) : (Number(s.doorWidthM) || 0.9);
    const scanOpenings = (s.scanSnapEnabled !== false && s.lidarVisible !== false)
      ? (fl.scanOverlay?.snapGuides?.openings || [])
      : [];
    let best = null;
    let bestD = 0.55;
    for (const w of fl.walls || []) {
      const a = nm.get(w.n1);
      const b = nm.get(w.n2);
      if (!a || !b) continue;
      const pr = projectOnSegment(wx, wy, a.x, a.y, b.x, b.y);
      if (pr.dist < bestD && pr.len >= 0.75) {
        bestD = pr.dist;
        let widthM = Math.min(defaultWidthM, Math.max(0.65, pr.len - 0.18));
        let heightM = tool === 'window' ? 1.65 : 2.15;
        let sillM = tool === 'window' ? (s.windowSubType === 'panoramic' ? 0.12 : Number(s.windowSillM) || 0.85) : 0;
        let snapX = pr.x;
        let snapY = pr.y;
        let scanBadge = null;

        // Agar kursor skan aniqlagan haqiqiy oyna/eshik o'rniga yaqin kelsa — o'lchami va markazini avtomatik ushlaydi!
        for (const sop of scanOpenings) {
          if (sop.kind !== tool) continue;
          const spr = projectOnSegment(sop.x, sop.y, a.x, a.y, b.x, b.y);
          if (spr.dist < 0.42 && Math.hypot(spr.x - pr.x, spr.y - pr.y) < 0.65) {
            snapX = spr.x;
            snapY = spr.y;
            widthM = Math.min(sop.widthM || widthM, Math.max(0.70, pr.len - 0.16));
            heightM = sop.heightM || heightM;
            sillM = tool === 'window' ? (sop.sillM ?? sillM) : 0;
            scanBadge = tool === 'window'
              ? `🧲 Skan oyna: ${widthM.toFixed(2)}m (h=${sillM.toFixed(2)}m)`
              : `🧲 Skan eshik: ${widthM.toFixed(2)}m`;
            break;
          }
        }

        if (pr.len >= widthM + 0.14) {
          best = {
            wallId: w.id,
            x: snapX,
            y: snapY,
            t: pr.t,
            len: pr.len,
            ux: (b.x - a.x) / pr.len,
            uy: (b.y - a.y) / pr.len,
            thickness: w.thickness,
            widthM,
            heightM,
            sillM,
            scanBadge,
          };
        }
      }
    }
    return best;
  }

  _handleToolClick(rawW, snapW) {
    const tool = this.store.state.activeTool;
    const settings = this.store.state.settings;

    if (tool === 'wall') {
      if (!this.wallChainStart) {
        this.wallChainStart = { x: snapW.x, y: snapW.y };
        this.typedBuf = '';
        this.requestRender();
        return;
      }
      const dist = Math.hypot(snapW.x - this.wallChainStart.x, snapW.y - this.wallChainStart.y);
      if (dist < 0.20) return; // < 20 sm tasodifiy ikki-klik rad etiladi!
      const p1 = { ...this.wallChainStart };
      const p2 = { x: snapW.x, y: snapW.y };
      const wSpec = this.store.getSelectedWallSpec();
      this.store.commit((_proj, fl) => {
        addWallSegment(fl, p1.x, p1.y, p2.x, p2.y, {
          thickness: wSpec.thickness,
          kind: wSpec.kind,
          typeId: wSpec.id,
        });
      }, 'draw-wall');
      // Agar mavjud burchak tuguniga borib ulangan bo'lsa, zanjirni toza tugatamiz
      if (snapW.snapKind === 'endpoint') {
        this.wallChainStart = null;
      } else {
        this.wallChainStart = p2;
      }
      this.typedBuf = '';
      this.requestRender();
      return;
    }

    if (tool === 'rect_room') {
      if (!this.rectStart) {
        this.rectStart = { x: snapW.x, y: snapW.y };
        this.typedBuf = '';
        this.requestRender();
        return;
      }
      const w = Math.abs(snapW.x - this.rectStart.x);
      const h = Math.abs(snapW.y - this.rectStart.y);
      if (w < 0.45 || h < 0.45) return;
      const p1 = { ...this.rectStart };
      const wSpec = this.store.getSelectedWallSpec();
      this.store.commit((_proj, fl) => {
        addRectWalls(fl, p1.x, p1.y, snapW.x, snapW.y, {
          thickness: wSpec.thickness,
          kind: wSpec.kind,
          typeId: wSpec.id,
        });
      }, 'draw-rect');
      this.rectStart = null;
      this.typedBuf = '';
      this.store.setTool('select'); // Bitta xona chizilgach xavfsiz Tanlash rejimiga qaytadi!
      return;
    }

    if (tool === 'door' || tool === 'window' || tool === 'arch') {
      const prev = this._findOpeningSnapPreview(rawW.x, rawW.y, tool);
      if (!prev) return;
      this.store.commit((_proj, fl, st) => {
        const added = addWallOpening(fl, prev.wallId, prev.x, prev.y, {
          type: tool,
          subType: tool === 'window' ? (prev.sillM <= 0.28 ? 'panoramic' : settings.windowSubType) : settings.doorSubType,
          widthM: prev.widthM,
          heightM: prev.heightM || (tool === 'window' ? 1.65 : 2.15),
          sillM: tool === 'window' ? (prev.sillM ?? (settings.windowSubType === 'panoramic' ? 0.12 : Number(settings.windowSillM) || 0.85)) : 0,
        });
        if (added) st.selection = { kind: 'opening', id: added.id };
      }, `place-${tool}`);
      return;
    }

    if (tool === 'column' || tool === 'shaft' || tool === 'stair') {
      this.store.commit((_proj, fl, st) => {
        const el = {
          id: makeArchId(tool.slice(0, 2)),
          kind: tool,
          label: tool === 'shaft' ? 'ВК/ОВ Shaxta' : tool === 'column' ? 'K-1' : 'Zina',
          x: snapW.x,
          y: snapW.y,
          wM: tool === 'stair' ? 1.90 : tool === 'shaft' ? 0.50 : 0.40,
          dM: tool === 'stair' ? 2.60 : tool === 'shaft' ? 0.35 : 0.40,
          shape: tool === 'stair' ? 'l_turn' : 'rect',
          rotationDeg: 0,
        };
        fl.elements.push(el);
        st.selection = { kind: 'element', id: el.id };
      }, `place-${tool}`);
      this.store.setTool('select');
      return;
    }

    if (tool.startsWith('vk_')) {
      const fxType = tool.slice(3); // wc | sink | bath | shower | kitchen_sink | washer
      this.store.commit((_proj, fl, st) => {
        const el = {
          id: makeArchId('vk'),
          kind: 'vk_fixture',
          fixtureType: fxType,
          label: fxType.toUpperCase(),
          x: snapW.x,
          y: snapW.y,
          wM: fxType === 'bath' ? 1.65 : 0.55,
          dM: fxType === 'bath' ? 0.72 : 0.55,
          rotationDeg: 0,
        };
        fl.elements.push(el);
        st.selection = { kind: 'element', id: el.id };
      }, `place-${tool}`);
      this.store.setTool('select');
      return;
    }

    if (tool === 'calibrate') {
      if (!this.calibrateStart) {
        this.calibrateStart = { x: rawW.x, y: rawW.y };
        this.requestRender();
        return;
      }
      const p1 = { ...this.calibrateStart };
      this.calibrateStart = null;
      this.store.setTool('select');
      this.callbacks.onCalibrateMeasured?.(Math.hypot(rawW.x - p1.x, rawW.y - p1.y));
    }
  }

  _commitTypedMeasurement() {
    const txt = this.typedBuf.trim();
    this.typedBuf = '';
    if (this.wallChainStart && this.store.state.activeTool === 'wall') {
      const dist = parseFloat(txt);
      if (!Number.isFinite(dist) || dist < 0.20) return;
      const dx = this.snappedWorld.x - this.wallChainStart.x;
      const dy = this.snappedWorld.y - this.wallChainStart.y;
      const len = Math.hypot(dx, dy);
      const ux = len > 0.01 ? dx / len : 1;
      const uy = len > 0.01 ? dy / len : 0;
      const endPt = {
        x: roundMm(this.wallChainStart.x + ux * dist),
        y: roundMm(this.wallChainStart.y + uy * dist),
      };
      const p1 = { ...this.wallChainStart };
      const wSpec = this.store.getSelectedWallSpec();
      this.store.commit((_proj, fl) => {
        addWallSegment(fl, p1.x, p1.y, endPt.x, endPt.y, {
          thickness: wSpec.thickness,
          kind: wSpec.kind,
          typeId: wSpec.id,
        });
      }, 'draw-wall-typed');
      this.wallChainStart = endPt;
      this.requestRender();
    } else if (this.rectStart && this.store.state.activeTool === 'rect_room') {
      const parts = txt.split('x').map( parseFloat );
      if (parts.length === 2 && parts[0] >= 0.45 && parts[1] >= 0.45) {
        const sx = this.snappedWorld.x >= this.rectStart.x ? 1 : -1;
        const sy = this.snappedWorld.y >= this.rectStart.y ? 1 : -1;
        const p1 = { ...this.rectStart };
        const wSpec = this.store.getSelectedWallSpec();
        this.store.commit((_proj, fl) => {
          addRectWalls(fl, p1.x, p1.y, p1.x + sx * parts[0], p1.y + sy * parts[1], {
            thickness: wSpec.thickness,
            kind: wSpec.kind,
            typeId: wSpec.id,
          });
        }, 'draw-rect-typed');
        this.rectStart = null;
        this.store.setTool('select');
      }
    }
  }

  _openInlineWitnessEditor(box) {
    const { dim } = box;
    this.inlineInputWrap.style.display = 'flex';
    this.inlineInputWrap.style.left = `${Math.max(12, Math.min(this.viewW - 190, box.x - 32))}px`;
    this.inlineInputWrap.style.top = `${Math.max(12, Math.min(this.viewH - 48, box.y - 6))}px`;
    this.inlineInputWrap.innerHTML = `
      <input type="number" step="0.01" min="0.30" max="50" value="${dim.clearDistanceM.toFixed(2)}" id="sps-wit-inp" />
      <button type="button" id="sps-wit-ok">OK</button>
    `;
    const inp = this.inlineInputWrap.querySelector('#sps-wit-inp');
    const okBtn = this.inlineInputWrap.querySelector('#sps-wit-ok');
    const apply = () => {
      const val = parseFloat(inp.value);
      this._hideInlineDimInput();
      if (Number.isFinite(val) && val >= 0.30) {
        const fl = this.store.getActiveFloor();
        const w = fl?.walls?.find((x) => x.id === dim.wallId);
        const chainMode = this._resolveChainMode(w?.kind);
        this.store.commit((_proj, activeFl) => {
          setWallWitnessDistance(activeFl, dim.wallId, dim.sideSign, val, { chainMode });
        }, 'witness-dim-edit');
      }
    };
    okBtn?.addEventListener('click', apply);
    inp?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); apply(); }
      if (ev.key === 'Escape') { ev.preventDefault(); this._hideInlineDimInput(); }
    });
    setTimeout(() => { inp?.focus(); inp?.select(); }, 15);
  }

  _hideInlineDimInput() {
    this.inlineInputWrap.style.display = 'none';
    this.inlineInputWrap.innerHTML = '';
  }

  render() {
    const ctx = this.ctx;
    if (!ctx || !this.viewW) return;
    const state = this.store.state;
    const isLight = state.settings.theme === 'light';
    const activeFl = (this.dragState?.kind === 'wall_move' && this.dragState.previewFloor)
      ? this.dragState.previewFloor
      : this.store.getActiveFloor();
    const ghostFl = this.store.getLowerGhostFloor();

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // 1. Orqa fon va muhandislik millimetr setkasi
    ctx.fillStyle = isLight ? '#f4f6f9' : '#0b111d';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    this._drawGrid(ctx, isLight);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoomPxPerM, this.zoomPxPerM);

    // 2. Podlojka rasm / zamer eskizi + 2D LiDAR kesim nuqtalari
    if (activeFl?.scanOverlay) {
      this._drawScanUnderlay2D(ctx, activeFl.scanOverlay, state.settings);
    }

    // 3. Pastki qavat shaffof konturi (2-qavatda zina va stoyakni ustma-ust tushirish uchun)
    if (ghostFl) {
      ctx.save();
      ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.28)' : 'rgba(56, 189, 248, 0.24)';
      ctx.lineWidth = 1.4 / this.zoomPxPerM;
      ctx.setLineDash([0.14, 0.10]);
      for (const wp of ghostFl.wallPolygons || []) {
        ctx.beginPath();
        wp.points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. Xona pol yuzalari (в свету) — Skan 2D Ortofoto yoniq bo'lsa yarim-shaffof qilib ichki stollarni ko'rsatadi!
    const hasOrthoVisible = state.settings.lidarVisible !== false
      && state.settings.scanOrthoVisible !== false
      && Boolean(activeFl?.scanOverlay?.orthoUrl || activeFl?.scanOverlay?.orthoDataUrl);
    for (const rm of activeFl?.rooms || []) {
      const cat = ROOM_TYPES_CATALOG.find((c) => c.id === rm.roomType) || ROOM_TYPES_CATALOG[0];
      const isSel = state.selection?.kind === 'room' && state.selection.id === rm.id;
      ctx.save();
      if (hasOrthoVisible) ctx.globalAlpha = 0.26;
      ctx.beginPath();
      rm.innerPoly.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();
      ctx.fillStyle = isLight ? cat.colorLight : cat.colorDark;
      ctx.fill();

      // Sanuzel / Oshxona kafel setkasi
      if ((rm.floorMat?.startsWith('tile') || rm.roomType === 'bathroom') && this.zoomPxPerM >= 26) {
        ctx.clip();
        ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.055)' : 'rgba(255, 255, 255, 0.045)';
        ctx.lineWidth = 0.7 / this.zoomPxPerM;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [px, py] of rm.innerPoly) {
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (py < y0) y0 = py; if (py > y1) y1 = py;
        }
        ctx.beginPath();
        for (let gx = Math.floor(x0 * 2) / 2; gx <= x1; gx += 0.60) {
          ctx.moveTo(gx, y0); ctx.lineTo(gx, y1);
        }
        for (let gy = Math.floor(y0 * 2) / 2; gy <= y1; gy += 0.60) {
          ctx.moveTo(x0, gy); ctx.lineTo(x1, gy);
        }
        ctx.stroke();
      }
      ctx.restore();

      if (isSel) {
        ctx.save();
        ctx.beginPath();
        rm.innerPoly.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
        ctx.strokeStyle = '#0788F5';
        ctx.lineWidth = 2.6 / this.zoomPxPerM;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 5. Arxitektura devorlari (aniq kesishgan miter poligonlari + GOST g'isht shtrixovka)
    this._drawWalls2D(ctx, activeFl, state, isLight);

    // 6. Eshik, Oyna va Arkalar (GOST / Revit 2D belgilari bilan)
    this._drawOpenings2D(ctx, activeFl, state, isLight);

    // 7. Ustunlar, ВК/ОВ Shaxtalar va Zinalar
    this._drawElements2D(ctx, activeFl, state, isLight);

    // 7A. 2D yozuvlar ustma-ust tushmasligi uchun ekran to'qnashuv buferini yangilash (xona shtamplari zahirasi bilan!)
    this._pillBoxesScreen = [];
    if (this.zoomPxPerM >= 18) {
      for (const rm of activeFl?.rooms || []) {
        const rsx = rm.labelX * this.zoomPxPerM + this.panX;
        const rsy = rm.labelY * this.zoomPxPerM + this.panY;
        const rw = 128;
        const rh = this.zoomPxPerM >= 36 ? 56 : 42;
        this._pillBoxesScreen.push({ x0: rsx - rw * 0.5, y0: rsy - rh * 0.5, x1: rsx + rw * 0.5, y1: rsy + rh * 0.5 });
      }
    }

    // 7B. Muhandislik tizimlari: Teplopoterya, ОВ (Улитка + Т1/Т2 + Вент), ВК (В1/Т3/Т4/К1) va ТМ (Котельная)
    this._drawMepSystems2D(ctx, activeFl, state, isLight);

    // 8. Xona nomlari va Sof Kvadratura yorliqlari (в свету, m²)
    for (const rm of activeFl?.rooms || []) {
      const isSel = state.selection?.kind === 'room' && state.selection.id === rm.id;
      this._drawRoomStamp(ctx, rm, isLight, isSel);
    }

    // 9. Tashqi gabarit o'lcham zanjirlari
    if (state.settings.showDims !== false && (activeFl?.walls?.length || 0) >= 2) {
      this._drawBuildingOuterDimensions(ctx, activeFl, isLight);
    }

    // 10. Chizilayotgan devor / xona jonli preview va magnit yo'riqnomalari
    this._drawLiveToolPreview(ctx, state, isLight);

    ctx.restore();

    // 11. Tanlangan devorning interaktiv Revit Witness o'lchamlari (ekran koordinatasida kliklanadigan pill!)
    this.witnessHitBoxes = [];
    if (state.selection?.kind === 'wall' && activeFl) {
      const dims = computeWallWitnessDimensions(activeFl, state.selection.id);
      this._drawWitnessDimensionsScreen(ctx, dims, isLight);
    }

    ctx.restore();
  }

  _drawGrid(ctx, isLight) {
    const stepM = this.zoomPxPerM >= 42 ? 0.5 : 1.0;
    const majorM = stepM === 0.5 ? 2.0 : 5.0;
    const w0 = this.screenToWorld(0, 0);
    const w1 = this.screenToWorld(this.viewW, this.viewH);

    const startX = Math.floor(w0.x / stepM) * stepM;
    const endX = Math.ceil(w1.x / stepM) * stepM;
    const startY = Math.floor(w0.y / stepM) * stepM;
    const endY = Math.ceil(w1.y / stepM) * stepM;

    ctx.lineWidth = 1;
    for (let x = startX; x <= endX; x = roundCm(x + stepM)) {
      const sx = Math.round(x * this.zoomPxPerM + this.panX) + 0.5;
      const isMajor = Math.abs(x % majorM) < 0.01;
      ctx.strokeStyle = isLight
        ? (isMajor ? 'rgba(15, 23, 42, 0.10)' : 'rgba(15, 23, 42, 0.045)')
        : (isMajor ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.05)');
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, this.viewH);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y = roundCm(y + stepM)) {
      const sy = Math.round(y * this.zoomPxPerM + this.panY) + 0.5;
      const isMajor = Math.abs(y % majorM) < 0.01;
      ctx.strokeStyle = isLight
        ? (isMajor ? 'rgba(15, 23, 42, 0.10)' : 'rgba(15, 23, 42, 0.045)')
        : (isMajor ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.05)');
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(this.viewW, sy);
      ctx.stroke();
    }
  }

  _drawScanUnderlay2D(ctx, ov, settings) {
    if (ov.underlayDataUrl && ov.visible !== false) {
      let img = this.underlayImgCache.get(ov.underlayDataUrl);
      if (!img) {
        img = new Image();
        img.onload = () => this.requestRender();
        img.src = ov.underlayDataUrl;
        this.underlayImgCache.set(ov.underlayDataUrl, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        const mPerPx = Number(ov.metersPerPx) || 0.0167;
        ctx.save();
        ctx.globalAlpha = Number(ov.opacity) || 0.55;
        ctx.drawImage(
          img,
          Number(ov.offsetX) || 0,
          Number(ov.offsetY) || 0,
          img.naturalWidth * mPerPx,
          img.naturalHeight * mPerPx,
        );
        ctx.restore();
      }
    }

    // 2D RGB Ortofoto (Shift olib tashlangan haqiqiy skan — ish stollari, pol, gilamcha va zina ko'rinadi!)
    const orthoSrc = ov.orthoUrl || ov.orthoDataUrl;
    if (settings.lidarVisible !== false && settings.scanOrthoVisible !== false && orthoSrc && ov.orthoWorldBounds) {
      let oImg = this.underlayImgCache.get(orthoSrc);
      if (!oImg) {
        oImg = new Image();
        oImg.onload = () => this.requestRender();
        oImg.src = orthoSrc;
        this.underlayImgCache.set(orthoSrc, oImg);
      }
      if (oImg.complete && oImg.naturalWidth > 0) {
        const ob = ov.orthoWorldBounds;
        ctx.save();
        ctx.globalAlpha = 0.84;
        ctx.drawImage(oImg, ob.minX, ob.minY, ob.maxX - ob.minX, ob.maxY - ob.minY);
        ctx.restore();
      }
    }

    // 2D rejimda: 1) Yuqori devor rentgen konturi + 2) Z = lidarSliceZ jonli lazer kesimi!
    if (settings.lidarVisible !== false && Array.isArray(ov.pointStride6) && ov.pointStride6.length >= 6) {
      const sliceZ = Number(settings.lidarSliceZ) || 1.20;
      const arr = ov.pointStride6;
      const dotR = Math.max(0.032, 2.2 / this.zoomPxPerM);
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.34)';
      for (let i = 0; i < arr.length; i += 6) {
        const pz = arr[i + 2];
        if (pz >= 1.55 && pz <= 2.55) {
          ctx.fillRect(arr[i] - dotR * 0.5, arr[i + 1] - dotR * 0.5, dotR, dotR);
        }
      }
      ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
      for (let i = 0; i < arr.length; i += 6) {
        const pz = arr[i + 2];
        if (Math.abs(pz - sliceZ) <= 0.18) {
          ctx.fillRect(arr[i] - dotR * 0.5, arr[i + 1] - dotR * 0.5, dotR, dotR);
        }
      }
      ctx.restore();
    }

    // 3) Skan-Magnit devor o'qlari va burchak nishonlari (devor chizish va surish uchun jonli magnit yo'riqnomalari!)
    if (settings.lidarVisible !== false && settings.scanSnapEnabled !== false && ov.snapGuides) {
      const g = ov.snapGuides;
      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.52)';
      ctx.lineWidth = 1.2 / this.zoomPxPerM;
      ctx.setLineDash([0.14, 0.10]);
      ctx.beginPath();
      for (const xr of g.xRails || []) {
        ctx.moveTo(xr.pos, xr.min - 0.25);
        ctx.lineTo(xr.pos, xr.max + 0.25);
      }
      for (const yr of g.yRails || []) {
        ctx.moveTo(yr.min - 0.25, yr.pos);
        ctx.lineTo(yr.max + 0.25, yr.pos);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      const dR = Math.max(0.06, 4.2 / this.zoomPxPerM);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.88)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.0 / this.zoomPxPerM;
      for (const c of g.corners || []) {
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - dR);
        ctx.lineTo(c.x + dR, c.y);
        ctx.lineTo(c.x, c.y + dR);
        ctx.lineTo(c.x - dR, c.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawWalls2D(ctx, fl, state, isLight) {
    if (!fl) return;
    for (const wp of fl.wallPolygons || []) {
      const isSel = state.selection?.kind === 'wall' && state.selection.id === wp.wallId;
      const isExt = wp.kind === 'exterior';
      ctx.save();
      ctx.beginPath();
      wp.points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();

      ctx.fillStyle = isSel
        ? (isLight ? '#bfdbfe' : '#1e3a8a')
        : isExt
          ? (isLight ? '#334155' : '#475569')
          : (isLight ? '#64748b' : '#64748b');
      ctx.fill();

      ctx.strokeStyle = isSel ? '#0788F5' : (isLight ? '#0f172a' : '#e2e8f0');
      ctx.lineWidth = (isSel ? 2.4 : 1.2) / this.zoomPxPerM;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawOpenings2D(ctx, fl, state, isLight) {
    if (!fl) return;
    const nm = getNodeMap(fl);
    for (const op of fl.openings || []) {
      const w = fl.walls.find((x) => x.id === op.wallId);
      const a = w ? nm.get(w.n1) : null;
      const b = w ? nm.get(w.n2) : null;
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const cx = a.x + (b.x - a.x) * op.t;
      const cy = a.y + (b.y - a.y) * op.t;
      const ow = op.widthM || 0.90;
      const th = (w.thickness || 0.20) + 0.008;
      const isSel = state.selection?.kind === 'opening' && state.selection.id === op.id;

      // Eshik surilayotgan bo'lsa preview joyida chizish
      const drawT = (this.dragState?.kind === 'opening_slide' && this.dragState.openingId === op.id && this.dragState.newT !== undefined)
        ? this.dragState.newT
        : op.t;
      const dcx = a.x + (b.x - a.x) * drawT;
      const dcy = a.y + (b.y - a.y) * drawT;

      ctx.save();
      ctx.translate(dcx, dcy);
      ctx.rotate(ang);

      // Devor ichini toza ochish (proyom o'yig'i)
      ctx.fillStyle = isLight ? '#ffffff' : '#0f172a';
      ctx.fillRect(-ow * 0.5, -th * 0.5, ow, th);
      ctx.strokeStyle = isSel ? '#0788F5' : (isLight ? '#334155' : '#cbd5e1');
      ctx.lineWidth = 1.2 / this.zoomPxPerM;
      ctx.beginPath();
      ctx.moveTo(-ow * 0.5, -th * 0.5); ctx.lineTo(-ow * 0.5, th * 0.5);
      ctx.moveTo(ow * 0.5, -th * 0.5); ctx.lineTo(ow * 0.5, th * 0.5);
      ctx.stroke();

      if (op.type === 'window') {
        // Uch chiziqli arxitektura oyna ramkasi + podokonnik + GalfDesign oyna gabarit vinoskasi!
        ctx.fillStyle = isLight ? 'rgba(56, 189, 248, 0.22)' : 'rgba(56, 189, 248, 0.28)';
        ctx.fillRect(-ow * 0.5, -th * 0.24, ow, th * 0.48);
        ctx.strokeStyle = isSel ? '#0788F5' : '#0284c7';
        ctx.lineWidth = (isSel ? 2.0 : 1.3) / this.zoomPxPerM;
        ctx.strokeRect(-ow * 0.5, -th * 0.24, ow, th * 0.48);
        ctx.beginPath();
        ctx.moveTo(-ow * 0.5, 0);
        ctx.lineTo(ow * 0.5, 0);
        ctx.stroke();

        if (state.settings.showDims !== false && this.zoomPxPerM >= 32) {
          ctx.save();
          ctx.translate(0, -th * 0.5 - 0.14);
          if (Math.cos(ang) < -0.1) ctx.rotate(Math.PI);
          ctx.scale(1 / this.zoomPxPerM, 1 / this.zoomPxPerM);
          ctx.font = '700 9.5px JetBrains Mono, monospace';
          const wMm = Math.round((op.widthM || 1.5) * 1000);
          const hMm = Math.round((op.heightM || 1.5) * 1000);
          const sMm = Math.round((op.sillM || 0.85) * 1000);
          const tagTxt = `Ш:${wMm} В:${hMm} h:${sMm}`;
          ctx.fillStyle = isLight ? '#0369a1' : '#7dd3fc';
          ctx.textAlign = 'center';
          ctx.fillText(tagTxt, 0, 0);
          ctx.restore();
        }
      } else if (op.type === 'door') {
        const sDir = op.swingDir === -1 ? -1 : 1;
        const hSide = op.hingeSide === 'right' ? 1 : -1;
        ctx.strokeStyle = isSel ? '#0788F5' : (isLight ? '#b45309' : '#fbbf24');
        ctx.lineWidth = (isSel ? 2.2 : 1.5) / this.zoomPxPerM;

        if (op.subType === 'double') {
          const leaf = ow * 0.5;
          ctx.beginPath();
          ctx.moveTo(-leaf, 0); ctx.lineTo(-leaf, sDir * leaf);
          ctx.moveTo(leaf, 0); ctx.lineTo(leaf, sDir * leaf);
          ctx.stroke();
          ctx.lineWidth = 1.0 / this.zoomPxPerM;
          ctx.setLineDash([0.05, 0.04]);
          ctx.beginPath();
          ctx.arc(-leaf, 0, leaf, 0, sDir * Math.PI * 0.5, sDir < 0);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(leaf, 0, leaf, Math.PI, Math.PI - sDir * Math.PI * 0.5, sDir > 0);
          ctx.stroke();
        } else {
          const hx = hSide * (ow * 0.5);
          ctx.beginPath();
          ctx.moveTo(hx, 0);
          ctx.lineTo(hx, sDir * ow);
          ctx.stroke();
          ctx.lineWidth = 1.0 / this.zoomPxPerM;
          ctx.setLineDash([0.05, 0.04]);
          ctx.beginPath();
          if (hSide < 0) {
            ctx.arc(hx, 0, ow, 0, sDir * Math.PI * 0.5, sDir < 0);
          } else {
            ctx.arc(hx, 0, ow, Math.PI, Math.PI - sDir * Math.PI * 0.5, sDir > 0);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  _drawElements2D(ctx, fl, state, isLight) {
    if (!fl) return;
    for (const el of fl.elements || []) {
      const isSel = state.selection?.kind === 'element' && state.selection.id === el.id;
      const pos = (this.dragState?.kind === 'element_move' && this.dragState.elId === el.id && this.dragState.newPos)
        ? this.dragState.newPos
        : el;
      const w = el.wM || 0.4;
      const d = el.dM || 0.4;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(((el.rotationDeg || 0) * Math.PI) / 180);

      if (el.kind === 'column') {
        ctx.fillStyle = isLight ? '#1e293b' : '#cbd5e1';
        ctx.fillRect(-w * 0.5, -d * 0.5, w, d);
      } else if (el.kind === 'shaft') {
        ctx.fillStyle = isLight ? '#fef2f2' : 'rgba(239, 68, 68, 0.16)';
        ctx.strokeStyle = isSel ? '#0788F5' : '#ef4444';
        ctx.lineWidth = 1.5 / this.zoomPxPerM;
        ctx.fillRect(-w * 0.5, -d * 0.5, w, d);
        ctx.strokeRect(-w * 0.5, -d * 0.5, w, d);
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, -d * 0.5); ctx.lineTo(w * 0.5, d * 0.5);
        ctx.moveTo(w * 0.5, -d * 0.5); ctx.lineTo(-w * 0.5, d * 0.5);
        ctx.stroke();
      } else if (el.kind === 'mep_pin') {
        const colMap = { Suv: '#06b6d4', Kanalizatsiya: '#a855f7', Vent: '#f97316', Isitish: '#ef4444', Uskuna: '#10b981' };
        const c = colMap[el.mepType] || '#38bdf8';
        ctx.fillStyle = c;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6 / this.zoomPxPerM;
        ctx.beginPath();
        ctx.arc(0, 0, 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.moveTo(-0.18, 0); ctx.lineTo(0.18, 0);
        ctx.moveTo(0, -0.18); ctx.lineTo(0, 0.18);
        ctx.stroke();
      } else if (el.kind === 'stair') {
        ctx.fillStyle = isLight ? 'rgba(226, 232, 240, 0.85)' : 'rgba(30, 41, 59, 0.85)';
        ctx.strokeStyle = isSel ? '#0788F5' : (isLight ? '#475569' : '#94a3b8');
        ctx.lineWidth = 1.5 / this.zoomPxPerM;
        ctx.fillRect(-w * 0.5, -d * 0.5, w, d);
        ctx.strokeRect(-w * 0.5, -d * 0.5, w, d);
        const steps = 12;
        ctx.beginPath();
        for (let i = 1; i < steps; i++) {
          const sy = -d * 0.5 + (d * i) / steps;
          ctx.moveTo(-w * 0.5, sy);
          ctx.lineTo(w * 0.5, sy);
        }
        // Zina yo'nalishi strelkasi (2-qavatdan 1-qavatga tushish yoki ko'tarilish)
        if (el.direction === 'down') {
          ctx.moveTo(0, -d * 0.38); ctx.lineTo(0, d * 0.38);
          ctx.moveTo(-0.14, d * 0.24); ctx.lineTo(0, d * 0.38); ctx.lineTo(0.14, d * 0.24);
        } else {
          ctx.moveTo(0, d * 0.38); ctx.lineTo(0, -d * 0.38);
          ctx.moveTo(-0.14, -d * 0.24); ctx.lineTo(0, -d * 0.38); ctx.lineTo(0.14, -d * 0.24);
        }
        ctx.stroke();
      }

      if (isSel) {
        ctx.strokeStyle = '#0788F5';
        ctx.lineWidth = 2.4 / this.zoomPxPerM;
        ctx.strokeRect(-w * 0.5 - 0.05, -d * 0.5 - 0.05, w + 0.10, d + 0.10);
      }
      ctx.restore();
    }

    // Ofis mebellari 2D konturi (12 ta ish stoli + shkaf)
    if (fl.officeInterior && state.settings.showOfficeFurniture !== false) {
      const inf = fl.officeInterior;
      ctx.save();
      ctx.strokeStyle = isLight ? 'rgba(100, 116, 139, 0.50)' : 'rgba(148, 163, 184, 0.36)';
      ctx.fillStyle = isLight ? 'rgba(212, 163, 115, 0.14)' : 'rgba(201, 150, 99, 0.10)';
      ctx.lineWidth = 1.1 / this.zoomPxPerM;
      const drawDesk2D = (dx, dy) => {
        ctx.fillRect(dx - 0.66, dy - 0.34, 1.32, 0.68);
        ctx.strokeRect(dx - 0.66, dy - 0.34, 1.32, 0.68);
      };
      for (const wx of inf.upperRow?.xList || []) drawDesk2D(wx, inf.upperRow.y);
      for (const wx of inf.lowerDoubleRow?.xList || []) {
        drawDesk2D(wx, inf.lowerDoubleRow.y - 0.35);
        drawDesk2D(wx, inf.lowerDoubleRow.y + 0.35);
      }
      if (inf.cabinet) {
        const cb = inf.cabinet;
        ctx.fillRect(cb.x - cb.wM * 0.5, cb.y - cb.dM * 0.5, cb.wM, cb.dM);
        ctx.strokeRect(cb.x - cb.wM * 0.5, cb.y - cb.dM * 0.5, cb.wM, cb.dM);
      }
      ctx.restore();
    }
  }

  _drawMepSystems2D(ctx, fl, state, isLight) {
    if (!fl || !state.mepSuite) return;
    const vis = state.settings.visibleLayers || {};
    const suite = state.mepSuite;
    const simOn = Boolean(state.settings.flowSimEnabled);
    const animOff = simOn ? -((performance.now() * 0.00055) % 1.0) : 0;

    const flHeat = suite.heat.floors.find((f) => f.floorId === fl.id);
    const flOv = suite.ov.floors.find((f) => f.floorId === fl.id);
    const flVk = suite.vk.floors.find((f) => f.floorId === fl.id);
    const tmData = suite.tm.floorId === fl.id ? suite.tm : null;

    // 1. Teplopoterya termokarta nuri va tashqi devor Q strelkalari
    if (vis.heat && flHeat) {
      for (const rm of fl.rooms || []) {
        const rh = flHeat.rooms.find((x) => x.roomId === rm.id);
        if (!rh || !rm.innerPoly?.length) continue;
        const intensity = Math.min(1, Math.max(0.15, (rh.specificWm2 - 35) / 75));
        ctx.save();
        ctx.beginPath();
        rm.innerPoly.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = `rgba(249, 115, 22, ${(0.12 + intensity * 0.24).toFixed(2)})`;
        ctx.fill();
        ctx.restore();
      }

      if (this.zoomPxPerM >= 24) {
        for (const ar of flHeat.wallHeatArrows || []) {
          if (ar.lossW < 40) continue;
          ctx.save();
          ctx.strokeStyle = '#f97316';
          ctx.fillStyle = '#f97316';
          ctx.lineWidth = 1.8 / this.zoomPxPerM;
          const x2 = ar.x + ar.nx * 0.42;
          const y2 = ar.y + ar.ny * 0.42;
          ctx.beginPath();
          ctx.moveTo(ar.x, ar.y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x2, y2, 0.045, 0, Math.PI * 2);
          ctx.fill();
          this._drawWorldPill(ctx, x2 + ar.nx * 0.22, y2 + ar.ny * 0.22, `${ar.orient}: ${ar.lossW}W`, 'rgba(194,65,12,0.9)', '#fff');
          ctx.restore();
        }
      }
    }

    // 2. ОВ — Водяной тёплый пол «Улитка» (PE-RT Ø16 + GalfDesign кружки петель ①..⑳ + изоляция транзитов!)
    if (vis.tp && flOv) {
      for (const lp of flOv.ufLoops || []) {
        ctx.save();
        // Tranzit Energoflex qizil/ko'k teploizolyatsiya g'ilofi
        if (lp.transitSupplyPts?.length >= 2) {
          ctx.strokeStyle = 'rgba(225, 29, 72, 0.35)';
          ctx.lineWidth = Math.max(0.052, 3.2 / this.zoomPxPerM);
          ctx.beginPath();
          lp.transitSupplyPts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
          ctx.stroke();
        }
        if (lp.transitReturnPts?.length >= 2) {
          ctx.strokeStyle = 'rgba(2, 132, 199, 0.35)';
          ctx.lineWidth = Math.max(0.052, 3.2 / this.zoomPxPerM);
          ctx.beginPath();
          lp.transitReturnPts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
          ctx.stroke();
        }

        // Podacha (qizil)
        ctx.strokeStyle = isLight ? 'rgba(220, 38, 38, 0.88)' : 'rgba(248, 113, 113, 0.90)';
        ctx.lineWidth = Math.max(0.022, 1.5 / this.zoomPxPerM);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        lp.supplyPts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.stroke();

        // Obratka (ko'k oralatib)
        ctx.strokeStyle = isLight ? 'rgba(37, 99, 235, 0.80)' : 'rgba(96, 165, 250, 0.84)';
        ctx.beginPath();
        lp.returnPts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.stroke();

        // Jonli oqim impulsi (Simulyatsiya yoqilganda!)
        if (simOn) {
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = Math.max(0.028, 2.0 / this.zoomPxPerM);
          ctx.setLineDash([0.14, 0.86]);
          ctx.lineDashOffset = animOff;
          ctx.beginPath();
          lp.supplyPts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // GalfDesign kontur raqamli krujogi ①..⑳ + Kv / Metraj!
        if (this.zoomPxPerM >= 24 && Number.isFinite(lp.badgeX) && Number.isFinite(lp.badgeY)) {
          ctx.save();
          ctx.translate(lp.badgeX, lp.badgeY + 0.34);
          ctx.scale(1 / this.zoomPxPerM, 1 / this.zoomPxPerM);
          ctx.fillStyle = isLight ? '#ffffff' : '#0f172a';
          ctx.strokeStyle = lp.isIndexLoop ? '#f59e0b' : '#dc2626';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = isLight ? '#b91c1c' : '#fca5a5';
          ctx.font = '800 10.5px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(lp.loopIndex), 0, 0.5);
          if (this.zoomPxPerM >= 36) {
            ctx.font = '700 9px JetBrains Mono, monospace';
            ctx.fillStyle = isLight ? '#334155' : '#cbd5e1';
            ctx.fillText(`${lp.lengthM}м·Kv${lp.kvSetting ?? ''}`, 0, 17);
          }
          ctx.restore();
        }
        ctx.restore();
      }

      if (flOv.tpCollector) {
        const c = flOv.tpCollector;
        ctx.save();
        ctx.fillStyle = '#dc2626';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6 / this.zoomPxPerM;
        ctx.fillRect(c.x - 0.28, c.y - 0.08, 0.56, 0.16);
        ctx.strokeRect(c.x - 0.28, c.y - 0.08, 0.56, 0.16);
        if (this.zoomPxPerM >= 26) {
          this._drawWorldPill(ctx, c.x, c.y - 0.24, c.label, '#b91c1c', '#ffffff');
        }
        ctx.restore();
      }
    }

    // 3. ОВ — LOD 400 2D Радиаторы (Панельные zigzag / Трубчатые Tubog / Секционные) и Конвекторы (Т1/Т2)
    if (vis.rad && flOv) {
      for (const rp of flOv.radPipes || []) {
        ctx.save();
        const dnFactor = rp.dnMm >= 32 ? 1.55 : rp.dnMm >= 25 ? 1.32 : rp.dnMm >= 20 ? 1.12 : 0.95;
        ctx.strokeStyle = rp.sys === 'T1' ? '#ef4444' : '#0ea5e9';
        ctx.lineWidth = Math.max(0.020 * dnFactor, (1.8 * dnFactor) / this.zoomPxPerM);
        if (rp.sys === 'T2') ctx.setLineDash([0.10, 0.05]);
        ctx.beginPath();
        rp.pts3d.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.stroke();
        ctx.setLineDash([]);

        // 2-quvurli magistral uchastkalarida haqiqiy diametr markirovkasi (Ø26, Ø20, Ø16)
        if (rp.role === 'trunk' && rp.sys === 'T1' && this.zoomPxPerM >= 30 && rp.pts3d.length >= 2) {
          const p0 = rp.pts3d[0];
          const p1 = rp.pts3d[1];
          const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          if (segLen >= 1.15) {
            this._drawWorldPill(
              ctx,
              (p0[0] + p1[0]) * 0.5,
              (p0[1] + p1[1]) * 0.5,
              `Т1/Т2 Ø${rp.dnMm}`,
              'rgba(15, 23, 42, 0.88)',
              '#fbbf24',
            );
          }
        }
        ctx.restore();
      }

      // 2D GOST Troynik, Perexod va Обвод (⌒) ramzlari!
      for (const ft of flOv.radFittings || []) {
        if (ft.kind === 'tee') {
          ctx.save();
          ctx.fillStyle = ft.sys === 'T1' ? '#dc2626' : '#0284c7';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.0 / this.zoomPxPerM;
          ctx.beginPath();
          ctx.arc(ft.x, ft.y, 0.026, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else if (ft.kind === 'obvod') {
          ctx.save();
          const ang = Math.atan2(ft.dirA?.[1] ?? 0, ft.dirA?.[0] ?? 1);
          ctx.translate(ft.x, ft.y);
          ctx.rotate(ang);
          ctx.strokeStyle = ft.sys === 'T1' ? '#ef4444' : '#38bdf8';
          ctx.lineWidth = Math.max(0.024, 2.2 / this.zoomPxPerM);
          ctx.beginPath();
          ctx.arc(0, 0, 0.048, Math.PI, 0, false);
          ctx.stroke();
          ctx.restore();
        }
      }

      for (const r of flOv.radiators || []) {
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.angleRad);
        const hw = r.widthM * 0.5;
        const hd = Math.max(0.045, r.depthM * 0.5);

        if (r.kind === 'floor_convector') {
          // Konveka FC 15/15 Напольный конвектор на ножках: oq korpus + 2 tayanch oyoq + mis-alyumin teploobmennik!
          ctx.fillStyle = isLight ? '#eff6ff' : '#1e293b';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.8 / this.zoomPxPerM;
          ctx.fillRect(-hw, -hd, r.widthM, hd * 2);
          ctx.strokeRect(-hw, -hd, r.widthM, hd * 2);
          // 2 ta tayanch oyoq belgisi
          const legOff = Math.max(0.20, hw - 0.16);
          ctx.fillStyle = '#334155';
          ctx.fillRect(-legOff - 0.025, -hd * 1.15, 0.050, hd * 2.30);
          ctx.fillRect(legOff - 0.025, -hd * 1.15, 0.050, hd * 2.30);
          // Mis-alyumin U-teploobmennik chiziqlari
          ctx.strokeStyle = '#ea580c';
          ctx.lineWidth = 1.2 / this.zoomPxPerM;
          ctx.beginPath();
          ctx.moveTo(-hw + 0.08, -hd * 0.35); ctx.lineTo(hw - 0.08, -hd * 0.35);
          ctx.moveTo(-hw + 0.08, hd * 0.35); ctx.lineTo(hw - 0.08, hd * 0.35);
          ctx.stroke();
        } else if (r.kind === 'convector') {
          // Vnutripolniy konvektor: antratsit korob + dekorativ panjara lamellari + mis U-trubka
          ctx.fillStyle = isLight ? '#fef3c7' : '#1e293b';
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 1.8 / this.zoomPxPerM;
          ctx.fillRect(-hw, -hd, r.widthM, hd * 2);
          ctx.strokeRect(-hw, -hd, r.widthM, hd * 2);
          ctx.strokeStyle = '#ea580c';
          ctx.lineWidth = 1.2 / this.zoomPxPerM;
          ctx.beginPath();
          ctx.moveTo(-hw + 0.08, -hd * 0.35); ctx.lineTo(hw - 0.06, -hd * 0.35);
          ctx.moveTo(-hw + 0.08, hd * 0.25); ctx.lineTo(hw - 0.06, hd * 0.25);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(217, 119, 6, 0.65)';
          ctx.lineWidth = 0.9 / this.zoomPxPerM;
          const slats = Math.max(8, Math.floor(r.widthM / 0.06));
          ctx.beginPath();
          for (let s = 1; s < slats; s++) {
            const sx = -hw + (r.widthM * s) / slats;
            ctx.moveTo(sx, -hd); ctx.lineTo(sx, hd);
          }
          ctx.stroke();
        } else if (r.radType === 'tubular') {
          // Rifar Tubog 2-trubali dizayn radiatori (2 qator ustun naychalar!)
          ctx.fillStyle = isLight ? '#ffffff' : '#1e293b';
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.5 / this.zoomPxPerM;
          ctx.fillRect(-hw, -hd, r.widthM, hd * 2);
          ctx.strokeRect(-hw, -hd, r.widthM, hd * 2);
          const cols = Math.max(6, r.sections || Math.floor(r.widthM / 0.05));
          ctx.fillStyle = '#ef4444';
          for (let c = 0; c < cols; c++) {
            const cx = -hw + (r.widthM * (c + 0.5)) / cols;
            ctx.beginPath();
            ctx.arc(cx, -hd * 0.42, 0.011, 0, Math.PI * 2);
            ctx.arc(cx, hd * 0.42, 0.011, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (r.radType === 'sectional') {
          // Biliner / Revolution sektsiyali bimetall radiator
          const secs = Math.max(4, r.sections || Math.floor(r.widthM / 0.08));
          const sw = r.widthM / secs;
          ctx.fillStyle = isLight ? '#ffffff' : '#fee2e2';
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.4 / this.zoomPxPerM;
          for (let s = 0; s < secs; s++) {
            ctx.fillRect(-hw + s * sw + 0.004, -hd, sw - 0.008, hd * 2);
            ctx.strokeRect(-hw + s * sw + 0.004, -hd, sw - 0.008, hd * 2);
          }
        } else {
          // Kermi / Compact C22 panelli radiator (qo'sh plastina + ichki zigzag konvektor!)
          ctx.fillStyle = isLight ? '#ffffff' : '#fee2e2';
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.8 / this.zoomPxPerM;
          ctx.fillRect(-hw, -hd, r.widthM, hd * 2);
          ctx.strokeRect(-hw, -hd, r.widthM, hd * 2);
          ctx.lineWidth = 1.0 / this.zoomPxPerM;
          ctx.beginPath();
          const zigs = Math.max(6, Math.floor(r.widthM / 0.07));
          for (let z = 0; z <= zigs; z++) {
            const zx = -hw + (r.widthM * z) / zigs;
            const zy = z % 2 === 0 ? -hd * 0.65 : hd * 0.65;
            if (z === 0) ctx.moveTo(zx, zy);
            else ctx.lineTo(zx, zy);
          }
          ctx.stroke();
        }
        ctx.restore();

        // Binokl / Podacha-Obratka portlari + GalfDesign vinoskasi!
        ctx.save();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(r.supplyPort[0], r.supplyPort[1], 0.032, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0284c7';
        ctx.beginPath(); ctx.arc(r.returnPort[0], r.returnPort[1], 0.032, 0, Math.PI * 2); ctx.fill();
        if (this.zoomPxPerM >= 32) {
          this._drawWorldPill(
            ctx,
            r.x + (r.inNx || 0) * 0.28,
            r.y + (r.inNy || 0) * 0.28,
            `${r.label} · ${r.powerW}Вт`,
            r.kind === 'floor_convector'
              ? 'rgba(3,105,161,0.92)'
              : (isLight ? 'rgba(153,27,27,0.92)' : 'rgba(127,29,29,0.92)'),
            '#ffffff',
          );
        }
        ctx.restore();
      }

      if (flOv.radCollector) {
        const rc = flOv.radCollector;
        ctx.save();
        ctx.fillStyle = '#0284c7';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / this.zoomPxPerM;
        ctx.fillRect(rc.x - 0.24, rc.y - 0.08, 0.48, 0.16);
        ctx.strokeRect(rc.x - 0.24, rc.y - 0.08, 0.48, 0.16);
        if (this.zoomPxPerM >= 28) {
          this._drawWorldPill(ctx, rc.x, rc.y + 0.24, rc.label, '#0369a1', '#ffffff');
        }
        ctx.restore();
      } else if (flOv.riserHub) {
        const rh = flOv.riserHub;
        ctx.save();
        ctx.fillStyle = '#dc2626';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8 / this.zoomPxPerM;
        ctx.beginPath();
        ctx.arc(rh.x, rh.y, 0.095, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (this.zoomPxPerM >= 26) {
          this._drawWorldPill(ctx, rh.x + 0.42, rh.y - 0.18, rh.label, '#991b1b', '#ffffff');
        }
        ctx.restore();
      }
    }

    // 4. ОВиК — Вентиляция с рекуператором (Galvent П1/В1/Н1/В2 + Шумоглушители СР + ДК + Диффузоры 4АПН/ДКВ/ДЩ/ДПУ-М + 3КСД)
    if (vis.vent && flOv) {
      for (const vd of flOv.ventDucts || []) {
        ctx.save();
        const dnM = Math.max(0.10, (Number(vd.dnMm) || 125) * 0.001);
        ctx.strokeStyle = vd.sys === 'P1'
          ? 'rgba(14, 165, 233, 0.86)'
          : vd.sys === 'V1'
            ? 'rgba(16, 185, 129, 0.86)'
            : vd.sys === 'N1'
              ? 'rgba(6, 182, 212, 0.88)'
              : 'rgba(245, 158, 11, 0.88)';
        ctx.lineWidth = dnM;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        vd.pts3d.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.stroke();

        if (simOn) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.032;
          ctx.setLineDash([0.12, 0.55]);
          ctx.lineDashOffset = (vd.sys === 'P1' || vd.sys === 'N1') ? animOff : -animOff;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      // ГОСТ Шумоглушители трубчатые СР 160/600:
      for (const sil of flOv.ventSilencers || []) {
        ctx.save();
        ctx.translate(sil.x, sil.y);
        const ang = Math.atan2(sil.dirY || 1, sil.dirX || 0);
        ctx.rotate(ang);
        const l = sil.lenM || 0.58;
        const w = (sil.outerMm || 260) * 0.001;
        ctx.fillStyle = isLight ? '#e2e8f0' : '#1e293b';
        ctx.strokeStyle = sil.sys === 'P1' ? '#0ea5e9' : '#10b981';
        ctx.lineWidth = 1.8 / this.zoomPxPerM;
        ctx.fillRect(-l * 0.5, -w * 0.5, l, w);
        ctx.strokeRect(-l * 0.5, -w * 0.5, l, w);
        ctx.setLineDash([0.05, 0.04]);
        ctx.beginPath();
        ctx.moveTo(-l * 0.45, -w * 0.28); ctx.lineTo(l * 0.45, -w * 0.28);
        ctx.moveTo(-l * 0.45, w * 0.28); ctx.lineTo(l * 0.45, w * 0.28);
        ctx.stroke();
        ctx.restore();
      }

      // ГОСТ Дроссель-клапаны ДК, Переходы Ø160/125 и Наружные решётки ВРН:
      for (const ft of flOv.ventFittings || []) {
        ctx.save();
        if (ft.kind === 'damper') {
          ctx.fillStyle = isLight ? '#ffffff' : '#0f172a';
          ctx.strokeStyle = ft.sys === 'P1' ? '#0284c7' : '#059669';
          ctx.lineWidth = 1.5 / this.zoomPxPerM;
          ctx.beginPath();
          ctx.arc(ft.x, ft.y, 0.068, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ft.x - 0.055, ft.y - 0.055);
          ctx.lineTo(ft.x + 0.055, ft.y + 0.055);
          ctx.stroke();
        } else if (ft.kind === 'ext_grille') {
          ctx.fillStyle = ft.sys === 'N1' ? '#06b6d4' : '#f59e0b';
          ctx.fillRect(ft.x - 0.17, ft.y - 0.04, 0.34, 0.08);
        }
        ctx.restore();
      }

      // ГОСТ 21.602-2016 Потолочные диффузоры (4АПН / ДКВ / ДЩ / ДПУ-М + 3КСД):
      for (const vt of flOv.ventTerminals || []) {
        ctx.save();
        const isSup = vt.sys === 'P1';
        const col = isSup ? '#0284c7' : '#059669';
        const dType = vt.diffuserType || '4apn_ksd';
        ctx.translate(vt.x, vt.y);
        if (dType === 'dsh_slot' && vt.slotAngleRad) ctx.rotate(vt.slotAngleRad);

        if (dType === '4apn_ksd' || dType === 'dkv_swirl') {
          const s = 0.45;
          ctx.fillStyle = isLight ? '#f0f9ff' : '#0f172a';
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.9 / this.zoomPxPerM;
          ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
          ctx.strokeRect(-s * 0.5, -s * 0.5, s, s);

          if (dType === '4apn_ksd') {
            ctx.lineWidth = 1.2 / this.zoomPxPerM;
            ctx.strokeRect(-0.14, -0.14, 0.28, 0.28);
            ctx.beginPath();
            if (isSup) {
              // 4 yo'nalishga havo tarqatish chiziqlari
              for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                ctx.moveTo(dx * 0.06, dy * 0.06);
                ctx.lineTo(dx * 0.20, dy * 0.20);
              }
            } else {
              // Вытяжка В1 ГОСТ diagonal kresti
              ctx.moveTo(-s * 0.5, -s * 0.5); ctx.lineTo(s * 0.5, s * 0.5);
              ctx.moveTo(s * 0.5, -s * 0.5); ctx.lineTo(-s * 0.5, s * 0.5);
            }
            ctx.stroke();
          } else {
            // ДКВ Вихревой: aylana + 8 radial qanot
            ctx.beginPath();
            ctx.arc(0, 0, 0.17, 0, Math.PI * 2);
            for (let b = 0; b < 8; b++) {
              const a = (b * Math.PI) / 4;
              ctx.moveTo(Math.cos(a) * 0.04, Math.sin(a) * 0.04);
              ctx.lineTo(Math.cos(a + 0.45) * 0.17, Math.sin(a + 0.45) * 0.17);
            }
            ctx.stroke();
          }
        } else if (dType === 'dsh_slot') {
          ctx.fillStyle = isLight ? '#f8fafc' : '#0f172a';
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.8 / this.zoomPxPerM;
          ctx.fillRect(-0.50, -0.065, 1.00, 0.13);
          ctx.strokeRect(-0.50, -0.065, 1.00, 0.13);
          ctx.beginPath();
          ctx.moveTo(-0.46, -0.02); ctx.lineTo(0.46, -0.02);
          ctx.moveTo(-0.46, 0.02); ctx.lineTo(0.46, 0.02);
          ctx.stroke();
        } else {
          ctx.fillStyle = col;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5 / this.zoomPxPerM;
          ctx.beginPath();
          ctx.arc(0, 0, 0.13, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();

        if (this.zoomPxPerM >= 25 && vt.label) {
          this._drawWorldPill(
            ctx,
            vt.x,
            vt.y + (dType === 'dsh_slot' ? 0.18 : 0.32),
            vt.label,
            isSup ? 'rgba(3,105,161,0.92)' : 'rgba(4,120,87,0.92)',
            '#ffffff',
          );
        }
      }

      if (flOv.ahuUnit) {
        const u = flOv.ahuUnit;
        ctx.save();
        ctx.fillStyle = 'rgba(14, 165, 233, 0.24)';
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2.0 / this.zoomPxPerM;
        ctx.fillRect(u.x - u.wM * 0.5, u.y - u.dM * 0.5, u.wM, u.dM);
        ctx.strokeRect(u.x - u.wM * 0.5, u.y - u.dM * 0.5, u.wM, u.dM);
        if (this.zoomPxPerM >= 22) {
          this._drawWorldPill(ctx, u.x, u.y, u.label, '#0284c7', '#ffffff');
        }
        ctx.restore();
      }

      // Чиллер–Фанкойл магистрали Т5 (+7°C) ва Т6 (+12°C) + Наружный Мини-Чиллер:
      for (const fp of flOv.fancoilPipes || []) {
        ctx.save();
        ctx.strokeStyle = fp.sys === 'T5' ? '#06b6d4' : '#6366f1';
        ctx.lineWidth = Math.max(0.032, 2.2 / this.zoomPxPerM);
        if (fp.sys === 'T6') ctx.setLineDash([0.11, 0.05]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        fp.pts3d.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.stroke();
        ctx.setLineDash([]);

        if (simOn && fp.sys === 'T5') {
          ctx.strokeStyle = '#a5f3fc';
          ctx.lineWidth = Math.max(0.024, 1.8 / this.zoomPxPerM);
          ctx.setLineDash([0.10, 0.65]);
          ctx.lineDashOffset = animOff;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      if (suite.ov?.chillerUnit && (flOv.fancoilPipes || []).length > 0) {
        const r0 = flOv.fancoilPipes[0].pts3d[0];
        const chX = r0[0];
        const chY = Math.min(0.16, r0[1] - 0.80);
        ctx.save();
        ctx.fillStyle = isLight ? '#cffafe' : 'rgba(8, 145, 178, 0.28)';
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.0 / this.zoomPxPerM;
        ctx.fillRect(chX - 0.52, chY - 0.21, 1.04, 0.42);
        ctx.strokeRect(chX - 0.52, chY - 0.21, 1.04, 0.42);
        if (this.zoomPxPerM >= 22) {
          this._drawWorldPill(ctx, chX, chY, `Чиллер ${suite.ov.chillerUnit.powerKw}кВт (7/12°C)`, '#0e7490', '#ffffff');
        }
        ctx.restore();
      }

      for (const ac of flOv.acUnits || []) {
        ctx.save();
        if (ac.kind === 'cassette_4way') {
          const hw = ac.wM * 0.5;
          const hd = ac.dM * 0.5;
          ctx.fillStyle = isLight ? 'rgba(224, 242, 254, 0.92)' : 'rgba(15, 23, 42, 0.92)';
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 2.0 / this.zoomPxPerM;
          ctx.fillRect(ac.x - hw, ac.y - hd, ac.wM, ac.dM);
          ctx.strokeRect(ac.x - hw, ac.y - hd, ac.wM, ac.dM);
          // Markaziy panjara + 4 tomonlama jalyuzilar
          ctx.strokeRect(ac.x - 0.24, ac.y - 0.24, 0.48, 0.48);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.4 / this.zoomPxPerM;
          ctx.beginPath();
          ctx.moveTo(ac.x - 0.26, ac.y - 0.34); ctx.lineTo(ac.x + 0.26, ac.y - 0.34);
          ctx.moveTo(ac.x - 0.26, ac.y + 0.34); ctx.lineTo(ac.x + 0.26, ac.y + 0.34);
          ctx.moveTo(ac.x - 0.34, ac.y - 0.26); ctx.lineTo(ac.x - 0.34, ac.y + 0.26);
          ctx.moveTo(ac.x + 0.34, ac.y - 0.26); ctx.lineTo(ac.x + 0.34, ac.y + 0.26);
          ctx.stroke();
          if (this.zoomPxPerM >= 22) {
            this._drawWorldPill(
              ctx,
              ac.x,
              ac.y,
              `${ac.label} · ${(ac.coolingW / 1000).toFixed(1)}кВт`,
              '#0891b2',
              '#ffffff',
            );
          }
        } else {
          ctx.fillStyle = isLight ? '#e0f2fe' : '#1e293b';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.6 / this.zoomPxPerM;
          ctx.fillRect(ac.x - ac.wM * 0.5, ac.y - ac.dM * 0.5, ac.wM, ac.dM);
          ctx.strokeRect(ac.x - ac.wM * 0.5, ac.y - ac.dM * 0.5, ac.wM, ac.dM);
          if (this.zoomPxPerM >= 24 && ac.label) {
            this._drawWorldPill(ctx, ac.x, ac.y + 0.22, ac.label, '#0284c7', '#ffffff');
          }
        }
        ctx.restore();
      }
    }

    // 5. ВК — ХВС (В1), ГВС (Т3/Т4) и Самотечная канализация (К1 с уклонами i=0.02..0.03)
    if (vis.vk && flVk) {
      for (const vp of flVk.pipes || []) {
        ctx.save();
        const isSewer = vp.sys.startsWith('K1');
        ctx.strokeStyle = vp.sys === 'B1'
          ? '#06b6d4'
          : vp.sys === 'T3'
            ? '#f43f5e'
            : vp.sys === 'T4'
              ? '#f59e0b'
              : '#a855f7';
        ctx.lineWidth = vp.sys === 'K1_110' ? 0.085 : isSewer ? 0.055 : Math.max(0.028, 1.8 / this.zoomPxPerM);
        if (vp.sys === 'T4') ctx.setLineDash([0.09, 0.05]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        vp.pts3d.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.stroke();

        if (simOn && vp.pts3d.length >= 2) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.025;
          ctx.setLineDash([0.10, 0.65]);
          ctx.lineDashOffset = animOff;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // GalfDesign kanalizatsiya qiyalik yozuvi (К1-Ø110 i=0,02 / К1-Ø50 i=0,03)
        if (isSewer && vp.slope > 0 && this.zoomPxPerM >= 36 && vp.pts3d.length >= 2) {
          const pA = vp.pts3d[0];
          const pB = vp.pts3d[1];
          const segL = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
          if (segL >= 0.85) {
            this._drawWorldPill(
              ctx,
              (pA[0] + pB[0]) * 0.5,
              (pA[1] + pB[1]) * 0.5 - 0.14,
              `К1-Ø${vp.dnMm} i=${vp.slope.toFixed(2).replace('.', ',')}`,
              'rgba(107,33,168,0.88)',
              '#ffffff',
            );
          }
        }
        ctx.restore();
      }

      for (const fx of flVk.fixtures || []) {
        ctx.save();
        ctx.fillStyle = isLight ? '#ffffff' : '#0f172a';
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.8 / this.zoomPxPerM;
        const fw = fx.wM || 0.5;
        const fd = fx.dM || 0.5;
        ctx.beginPath();
        ctx.roundRect(fx.x - fw * 0.5, fx.y - fd * 0.5, fw, fd, 0.08);
        ctx.fill();
        ctx.stroke();
        if (this.zoomPxPerM >= 24) {
          this._drawWorldPill(ctx, fx.x, fx.y, fx.code, '#0891b2', '#ffffff');
        }
        ctx.restore();
      }

      // Фановый стояк СТ-К1 Ø110
      const sr = flVk.sewerRiserXY;
      if (sr) {
        ctx.save();
        ctx.fillStyle = '#9333ea';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8 / this.zoomPxPerM;
        ctx.beginPath();
        ctx.arc(sr.x, sr.y, 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (this.zoomPxPerM >= 26) {
          this._drawWorldPill(ctx, sr.x + 0.42, sr.y - 0.18, 'СТ-К1 Ø110', '#7e22ce', '#ffffff');
        }
        ctx.restore();
      }
    }

    // 6. ТМ — Котельная (Котёл К1, ГС+КР, Бойлер БКН, РБ, ХВО Imrita, ZONT)
    if (vis.tm && tmData) {
      for (const eq of tmData.equipment3d || []) {
        ctx.save();
        ctx.fillStyle = eq.kind === 'boiler'
          ? 'rgba(239, 68, 68, 0.24)'
          : eq.kind === 'bkn_tank'
            ? 'rgba(6, 182, 212, 0.24)'
            : 'rgba(16, 185, 129, 0.22)';
        ctx.strokeStyle = eq.kind === 'boiler' ? '#ef4444' : eq.kind === 'bkn_tank' ? '#06b6d4' : '#10b981';
        ctx.lineWidth = 2.0 / this.zoomPxPerM;
        ctx.fillRect(eq.x - eq.wM * 0.5, eq.y - eq.dM * 0.5, eq.wM, eq.dM);
        ctx.strokeRect(eq.x - eq.wM * 0.5, eq.y - eq.dM * 0.5, eq.wM, eq.dM);
        if (this.zoomPxPerM >= 26) {
          this._drawWorldPill(ctx, eq.x, eq.y, eq.tag, '#0f172a', '#38bdf8');
        }
        ctx.restore();
      }
    }

    // Simulyatsiya yoniq bo'lsa keyingi kadrni silliq so'rash
    if (simOn && (vis.tp || vis.rad || vis.vent || vis.vk)) {
      this.requestRender();
    }
  }

  _drawRoomStamp(ctx, rm, isLight, isSel) {
    if (this.zoomPxPerM < 18) return;
    const state = this.store.state;
    const flHeat = state.mepSuite?.heat?.floors?.find((f) => f.floorId === this.store.getActiveFloor()?.id);
    const rh = flHeat?.rooms?.find((x) => x.roomId === rm.id);
    const rmCode = rh?.roomCode || '1.1';
    const tInC = rh?.tInC || rm.targetTempC || 22;
    const qW = rh?.heatLossW || 0;

    ctx.save();
    ctx.translate(rm.labelX, rm.labelY);
    const scale = 1 / this.zoomPxPerM;
    ctx.scale(scale, scale);

    // GalfDesign 4-katakchali muhandislik xona shtampi:
    // [ 1.1 | +22°C ]
    // [ Xona nomi   ]
    // [ 1640 Вт | 24.5 м² ]
    ctx.font = '700 11.5px Inter, system-ui, sans-serif';
    const title = rm.name;
    const rowBot = `${qW} Вт · ${rm.areaM2.toFixed(1)} м²`;
    const wPx = Math.max(ctx.measureText(title).width, ctx.measureText(rowBot).width, 88) + 18;
    const hPx = this.zoomPxPerM >= 36 ? 52 : 38;

    ctx.fillStyle = isSel
      ? (isLight ? 'rgba(239, 246, 255, 0.97)' : 'rgba(15, 23, 42, 0.97)')
      : (isLight ? 'rgba(255, 255, 255, 0.91)' : 'rgba(15, 23, 42, 0.88)');
    ctx.strokeStyle = isSel ? '#0788F5' : (isLight ? 'rgba(100, 116, 139, 0.65)' : 'rgba(71, 85, 105, 0.78)');
    ctx.lineWidth = isSel ? 1.9 : 1.1;
    ctx.beginPath();
    ctx.roundRect(-wPx * 0.5, -hPx * 0.5, wPx, hPx, 6);
    ctx.fill();
    ctx.stroke();

    if (this.zoomPxPerM >= 36) {
      // Yuqori qator: [1.1] | [+22°C]
      const yLine1 = -hPx * 0.5 + 15;
      ctx.beginPath();
      ctx.moveTo(-wPx * 0.5, yLine1); ctx.lineTo(wPx * 0.5, yLine1);
      ctx.moveTo(0, -hPx * 0.5); ctx.lineTo(0, yLine1);
      ctx.stroke();

      ctx.font = '700 9.5px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isLight ? '#334155' : '#cbd5e1';
      ctx.fillText(rmCode, -wPx * 0.25, -hPx * 0.5 + 11);
      ctx.fillStyle = '#10b981';
      ctx.fillText(`+${tInC}°C`, wPx * 0.25, -hPx * 0.5 + 11);

      ctx.font = '700 11.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
      ctx.fillText(title, 0, 3);

      ctx.font = '700 10px JetBrains Mono, monospace';
      ctx.fillStyle = '#0788F5';
      ctx.fillText(rowBot, 0, 19);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
      ctx.fillText(title, 0, -4);
      ctx.font = '700 10.5px JetBrains Mono, monospace';
      ctx.fillStyle = '#0788F5';
      ctx.fillText(`${rm.areaM2.toFixed(1)} м²`, 0, 11);
    }
    ctx.restore();
  }

  _drawBuildingOuterDimensions(ctx, fl, isLight) {
    const b = getFloorWorldBounds(fl);
    if (b.width < 0.5 || b.height < 0.5) return;
    const col = isLight ? '#475569' : '#94a3b8';
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.1 / this.zoomPxPerM;

    const yDim = b.minY - 0.68;
    ctx.beginPath();
    ctx.moveTo(b.minX, b.minY - 0.15); ctx.lineTo(b.minX, yDim - 0.12);
    ctx.moveTo(b.maxX, b.minY - 0.15); ctx.lineTo(b.maxX, yDim - 0.12);
    ctx.moveTo(b.minX, yDim); ctx.lineTo(b.maxX, yDim);
    ctx.stroke();

    const xDim = b.minX - 0.68;
    ctx.beginPath();
    ctx.moveTo(b.minX - 0.15, b.minY); ctx.lineTo(xDim - 0.12, b.minY);
    ctx.moveTo(b.minX - 0.15, b.maxY); ctx.lineTo(xDim - 0.12, b.maxY);
    ctx.moveTo(xDim, b.minY); ctx.lineTo(xDim, b.maxY);
    ctx.stroke();

    const drawDimText = (wx, wy, text, rot = 0) => {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(rot);
      ctx.scale(1 / this.zoomPxPerM, 1 / this.zoomPxPerM);
      ctx.font = '700 11px JetBrains Mono, monospace';
      const tw = ctx.measureText(text).width + 12;
      ctx.fillStyle = isLight ? '#f4f6f9' : '#0b111d';
      ctx.fillRect(-tw * 0.5, -9, tw, 18);
      ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };

    drawDimText((b.minX + b.maxX) * 0.5, yDim, `${b.width.toFixed(2)} m`, 0);
    drawDimText(xDim, (b.minY + b.maxY) * 0.5, `${b.height.toFixed(2)} m`, -Math.PI * 0.5);
    ctx.restore();
  }

  _drawLiveToolPreview(ctx, state, isLight) {
    const sw = this.snappedWorld;
    const tool = state.activeTool;

    // Smart Alignment Guide chiziqlari
    if (tool !== 'select' && (sw.guideX !== null || sw.guideY !== null)) {
      ctx.save();
      ctx.strokeStyle = '#0788F5';
      ctx.lineWidth = 1.1 / this.zoomPxPerM;
      ctx.setLineDash([0.12, 0.08]);
      ctx.beginPath();
      if (sw.guideX !== null) { ctx.moveTo(sw.guideX, -50); ctx.lineTo(sw.guideX, 80); }
      if (sw.guideY !== null) { ctx.moveTo(-50, sw.guideY); ctx.lineTo(80, sw.guideY); }
      ctx.stroke();
      ctx.restore();
    }

    if (tool === 'wall' && this.wallChainStart) {
      const p1 = this.wallChainStart;
      const len = Math.hypot(sw.x - p1.x, sw.y - p1.y);
      const th = this.store.getSelectedWallSpec().thickness;
      ctx.save();
      if (len >= 0.05) {
        const ux = (sw.x - p1.x) / len;
        const uy = (sw.y - p1.y) / len;
        const nx = -uy * th * 0.5;
        const ny = ux * th * 0.5;
        ctx.fillStyle = 'rgba(7, 136, 245, 0.25)';
        ctx.strokeStyle = '#0788F5';
        ctx.lineWidth = 1.8 / this.zoomPxPerM;
        ctx.beginPath();
        ctx.moveTo(p1.x + nx, p1.y + ny);
        ctx.lineTo(sw.x + nx, sw.y + ny);
        ctx.lineTo(sw.x - nx, sw.y - ny);
        ctx.lineTo(p1.x - nx, p1.y - ny);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const label = this.typedBuf ? `Yozilmoqda: ${this.typedBuf} m ⏎` : `${len.toFixed(2)} m (son yozish mumkin)`;
        this._drawWorldPill(ctx, (p1.x + sw.x) * 0.5, (p1.y + sw.y) * 0.5 - 0.30, label, '#0788F5', '#ffffff');
      }
      ctx.restore();
    }

    if (tool === 'rect_room' && this.rectStart) {
      const x0 = Math.min(this.rectStart.x, sw.x);
      const y0 = Math.min(this.rectStart.y, sw.y);
      const w = Math.abs(sw.x - this.rectStart.x);
      const h = Math.abs(sw.y - this.rectStart.y);
      const th = this.store.getSelectedWallSpec().thickness;
      const clearM2 = Math.max(0, w - th) * Math.max(0, h - th);
      ctx.save();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.0 / this.zoomPxPerM;
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeRect(x0, y0, w, h);
      const lbl = this.typedBuf
        ? `O‘lcham: ${this.typedBuf} ⏎`
        : `${w.toFixed(2)} × ${h.toFixed(2)} m · Sof ≈ ${clearM2.toFixed(1)} m²`;
      this._drawWorldPill(ctx, x0 + w * 0.5, y0 + h * 0.5, lbl, '#059669', '#ffffff');
      ctx.restore();
    }

    if ((tool === 'door' || tool === 'window' || tool === 'arch') && this.openingPreview) {
      const pr = this.openingPreview;
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(Math.atan2(pr.uy, pr.ux));
      ctx.fillStyle = pr.scanBadge ? 'rgba(16, 185, 129, 0.38)' : 'rgba(7, 136, 245, 0.35)';
      ctx.strokeStyle = pr.scanBadge ? '#10b981' : '#0788F5';
      ctx.lineWidth = 2.2 / this.zoomPxPerM;
      ctx.fillRect(-pr.widthM * 0.5, -pr.thickness * 0.6, pr.widthM, pr.thickness * 1.2);
      ctx.strokeRect(-pr.widthM * 0.5, -pr.thickness * 0.6, pr.widthM, pr.thickness * 1.2);
      ctx.restore();
      if (pr.scanBadge) {
        this._drawWorldPill(ctx, pr.x, pr.y - 0.34, pr.scanBadge, '#059669', '#ffffff');
      }
    }

    if (this.dragState?.kind === 'wall_move' && this.dragState.scanSnapMsg) {
      this._drawWorldPill(ctx, this.mouseWorld.x, this.mouseWorld.y - 0.36, this.dragState.scanSnapMsg, '#059669', '#ffffff');
    }

    if (tool === 'calibrate' && this.calibrateStart) {
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.2 / this.zoomPxPerM;
      ctx.setLineDash([0.10, 0.06]);
      ctx.beginPath();
      ctx.moveTo(this.calibrateStart.x, this.calibrateStart.y);
      ctx.lineTo(this.mouseWorld.x, this.mouseWorld.y);
      ctx.stroke();
      ctx.restore();
    }

    // Magnit kursor indikatori + Skan-Magnit yorlig'i
    if (tool !== 'select') {
      const isScanSnap = sw.snapKind === 'scan_corner' || sw.snapKind === 'scan_rail';
      const r = (isScanSnap ? 6.5 : 5) / this.zoomPxPerM;
      ctx.save();
      ctx.strokeStyle = sw.snapKind ? '#10b981' : '#0788F5';
      ctx.lineWidth = 2.0 / this.zoomPxPerM;
      if (isScanSnap) {
        ctx.beginPath();
        ctx.moveTo(sw.x, sw.y - r * 1.25);
        ctx.lineTo(sw.x + r * 1.25, sw.y);
        ctx.lineTo(sw.x, sw.y + r * 1.25);
        ctx.lineTo(sw.x - r * 1.25, sw.y);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.strokeRect(sw.x - r, sw.y - r, r * 2, r * 2);
      }
      ctx.restore();
      if (isScanSnap && sw.snapLabel) {
        this._drawWorldPill(ctx, sw.x, sw.y + 0.32, sw.snapLabel, 'rgba(5, 150, 105, 0.92)', '#ffffff');
      }
    }
  }

  _drawWorldPill(ctx, wx, wy, text, bg, fg) {
    ctx.save();
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    const w = ctx.measureText(text).width + 16;
    const h = 21;

    const anchorSx = wx * this.zoomPxPerM + this.panX;
    const anchorSy = wy * this.zoomPxPerM + this.panY;
    const boxes = this._pillBoxesScreen || (this._pillBoxesScreen = []);

    const candidates = [
      [0, 0],
      [0, -24],
      [0, 24],
      [0, -48],
      [0, 48],
      [66, -18],
      [-66, -18],
      [66, 18],
      [-66, 18],
      [0, -72],
      [0, 72],
      [98, 0],
      [-98, 0],
      [0, -96],
      [0, 96],
    ];

    let chosenDx = 0;
    let chosenDy = 0;
    let bestPenalty = Infinity;

    for (const [dx, dy] of candidates) {
      const x0 = anchorSx + dx - w * 0.5 - 3;
      const y0 = anchorSy + dy - h * 0.5 - 2;
      const x1 = anchorSx + dx + w * 0.5 + 3;
      const y1 = anchorSy + dy + h * 0.5 + 2;
      let overlapArea = 0;
      for (const b of boxes) {
        const ox = Math.max(0, Math.min(x1, b.x1) - Math.max(x0, b.x0));
        const oy = Math.max(0, Math.min(y1, b.y1) - Math.max(y0, b.y0));
        overlapArea += ox * oy;
      }
      if (overlapArea === 0) {
        chosenDx = dx;
        chosenDy = dy;
        bestPenalty = 0;
        break;
      }
      const penalty = overlapArea + Math.hypot(dx, dy) * 2;
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        chosenDx = dx;
        chosenDy = dy;
      }
    }

    boxes.push({
      x0: anchorSx + chosenDx - w * 0.5,
      y0: anchorSy + chosenDy - h * 0.5,
      x1: anchorSx + chosenDx + w * 0.5,
      y1: anchorSy + chosenDy + h * 0.5,
    });

    const finalWx = wx + chosenDx / this.zoomPxPerM;
    const finalWy = wy + chosenDy / this.zoomPxPerM;

    if (Math.hypot(chosenDx, chosenDy) >= 14) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.72)';
      ctx.lineWidth = 1.1 / this.zoomPxPerM;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(finalWx, finalWy);
      ctx.stroke();
    }

    ctx.translate(finalWx, finalWy);
    ctx.scale(1 / this.zoomPxPerM, 1 / this.zoomPxPerM);
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(-w * 0.5, -h * 0.5, w, h, 5.5);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0.5);
    ctx.restore();
  }

  _drawWitnessDimensionsScreen(ctx, dims, isLight) {
    for (const d of dims) {
      const sA = this.worldToScreen(d.pStart[0], d.pStart[1]);
      const sB = this.worldToScreen(d.pEnd[0], d.pEnd[1]);
      const mx = (sA.x + sB.x) * 0.5;
      const my = (sA.y + sB.y) * 0.5;

      ctx.save();
      ctx.strokeStyle = '#0788F5';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(sA.x, sA.y);
      ctx.lineTo(sB.x, sB.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Chegara nuqtalari
      for (const p of [sA, sB]) {
        ctx.fillStyle = '#0788F5';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }

      const txt = `⇄ ${d.clearDistanceM.toFixed(2)} m`;
      ctx.font = '700 12px JetBrains Mono, monospace';
      const bw = ctx.measureText(txt).width + 18;
      const bh = 25;
      const bx = mx - bw * 0.5;
      const by = my - bh * 0.5;

      ctx.fillStyle = isLight ? '#eff6ff' : '#0f172a';
      ctx.strokeStyle = '#0788F5';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isLight ? '#0369a1' : '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, mx, my);
      ctx.restore();

      this.witnessHitBoxes.push({ x: bx, y: by, w: bw, h: bh, dim: d });
    }
  }
}
