/**
 * SPS Project 2.0 — Enscape / Matterport Darajasidagi 3D BIM + LiDAR Nuqtalar Buluti Ko'ruvchisi
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getNodeMap, getFloorWorldBounds } from '../core/planar-wall-graph.js';
import {
  buildEmitterLod4003D,
  buildHeatingNetworkFittingsLod4003D,
  buildCollectorCabinetLod4003D,
  buildSanitaryFixtureLod4003D,
  addSewerRastrubSocket3D,
  buildBoilerRoomEquipmentLod4003D,
  buildVentilationLod4003D,
  getLod400SharedGeoms,
  getLod400SharedMats,
} from './mep-lod400-3d.js';

function makeProceduralFloorTexture(kind = 'parquet') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  if (kind === 'parquet' || kind === 'laminate') {
    ctx.fillStyle = kind === 'parquet' ? '#d4a97b' : '#c8ad8d';
    ctx.fillRect(0, 0, 256, 256);
    const plankH = 32;
    for (let y = 0; y < 256; y += plankH) {
      const shift = ((y / plankH) % 2) * 64;
      ctx.fillStyle = ((y / plankH) % 3 === 0) ? 'rgba(120, 72, 32, 0.08)' : 'rgba(255, 245, 230, 0.07)';
      ctx.fillRect(0, y, 256, plankH - 1);
      ctx.strokeStyle = 'rgba(78, 46, 18, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(0, y, 256, plankH);
      for (let x = shift; x < 256; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + plankH);
        ctx.stroke();
      }
    }
  } else if (kind.startsWith('tile')) {
    ctx.fillStyle = kind === 'tile_aqua' ? '#d9f2f4' : kind === 'tile_warm' ? '#efe7dc' : '#e2e8f0';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.24)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, 256);
      ctx.moveTo(0, i); ctx.lineTo(256, i);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, 256, 256);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.75, 0.75);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ArchViewer3D {
  constructor(containerEl, store) {
    this.container = containerEl;
    this.store = store;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 250);
    this.camera.position.set(14, 13, 16);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(6, 1.0, 5);

    this._setupLightsAndGround();

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.dollhouseWallEntries = [];
    this.flowSegments = [];
    this.flowPointsMesh = null;
    this.roomFloorMeshes = [];
    this.walkMode = false;
    this.floorXray = false;
    this.onWalkModeChange = null;
    this.keysDown = new Set();

    this.texCache = new Map();
    this._createWalkHud();
    this._bindEvents();
    this.resize();
    this.rebuildScene();
    this._animate();
  }

  _getFloorTex(matId) {
    if (!this.texCache.has(matId)) {
      this.texCache.set(matId, makeProceduralFloorTexture(matId));
    }
    return this.texCache.get(matId);
  }

  _setupLightsAndGround() {
    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x94a3b8, 0.96);
    hemi.position.set(0, 28, 0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.35);
    sun.position.set(18, 26, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 75;
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xe0f2fe, 0.45);
    fill.position.set(-14, 12, -12);
    this.scene.add(fill);

    this.groundGrid = new THREE.GridHelper(60, 60, 0x334155, 0x1e293b);
    this.groundGrid.position.y = -0.21;
    this.scene.add(this.groundGrid);

    this.shadowGround = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ opacity: 0.22 }),
    );
    this.shadowGround.rotation.x = -Math.PI * 0.5;
    this.shadowGround.position.y = -0.205;
    this.shadowGround.receiveShadow = true;
    this.scene.add(this.shadowGround);
  }

  _createWalkHud() {
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }
    const hud = document.createElement('div');
    hud.className = 'sps-walk-hud';
    hud.style.cssText = [
      'position:absolute',
      'bottom:14px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:28',
      'display:none',
      'align-items:center',
      'gap:6px',
      'flex-wrap:wrap',
      'justify-content:center',
      'padding:7px 11px',
      'border-radius:12px',
      'background:rgba(15,23,42,0.88)',
      'border:1px solid rgba(56,189,248,0.42)',
      'backdrop-filter:blur(10px)',
      'box-shadow:0 10px 28px rgba(0,0,0,0.45)',
      'color:#f8fafc',
      'font-size:11.5px',
      'user-select:none',
      'max-width:96%',
    ].join(';');

    const btnStyle = 'padding:5px 9px;border-radius:7px;border:1px solid rgba(148,163,184,0.32);background:rgba(30,41,59,0.92);color:#f8fafc;font-size:11px;font-weight:600;cursor:pointer;line-height:1.1;';
    const accStyle = 'padding:5px 9px;border-radius:7px;border:1px solid rgba(7,136,245,0.55);background:rgba(7,136,245,0.22);color:#bae6fd;font-size:11px;font-weight:600;cursor:pointer;line-height:1.1;';

    hud.innerHTML = `
      <span style="font-weight:700;color:#38bdf8;margin-right:2px;">🚶 Ofis ichida yurish:</span>
      <button type="button" data-walk-key="KeyA" style="${btnStyle}" title="Chapga yurish (A)">◀ Chap</button>
      <button type="button" data-walk-key="KeyW" style="${btnStyle}" title="Oldinga yurish (W)">▲ Oldinga</button>
      <button type="button" data-walk-key="KeyS" style="${btnStyle}" title="Orqaga yurish (S)">▼ Orqaga</button>
      <button type="button" data-walk-key="KeyD" style="${btnStyle}" title="O‘ngga yurish (D)">▶ O‘ng</button>
      <span style="opacity:0.35;">|</span>
      <button type="button" data-walk-spot="entry" style="${accStyle}">🚪 Kirish</button>
      <button type="button" data-walk-spot="desks" style="${accStyle}">💻 Ish Zali</button>
      <button type="button" data-walk-spot="boiler" style="${accStyle}">🔥 Kotyol & ТП</button>
      <button type="button" data-walk-act="xray" id="sps-walk-xray-btn" style="${btnStyle}">🔍 Pol Rentgen: OFF</button>
      <button type="button" data-walk-act="exit" style="padding:5px 9px;border-radius:7px;border:1px solid rgba(255,52,69,0.55);background:rgba(255,52,69,0.22);color:#fecaca;font-size:11px;font-weight:700;cursor:pointer;line-height:1.1;">✕ Chiqish</button>
    `;

    hud.querySelectorAll('[data-walk-key]').forEach((btn) => {
      const code = btn.getAttribute('data-walk-key');
      const stop = () => this.keysDown.delete(code);
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._nudgeWalkKey(code, 0.42);
        this.keysDown.add(code);
      });
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointerleave', stop);
      btn.addEventListener('pointercancel', stop);
    });

    hud.querySelectorAll('[data-walk-spot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setWalkPreset(btn.getAttribute('data-walk-spot'));
      });
    });

    hud.querySelector('[data-walk-act="xray"]')?.addEventListener('click', () => {
      this.setFloorXray(!this.floorXray);
    });

    hud.querySelector('[data-walk-act="exit"]')?.addEventListener('click', () => {
      this.setWalkthroughMode(false);
    });

    this.container.appendChild(hud);
    this._walkHudEl = hud;
  }

  _nudgeWalkKey(code, stepDist = 0.42) {
    if (!this.walkMode) return;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const delta = new THREE.Vector3();
    if (code === 'KeyW') delta.addScaledVector(fwd, stepDist);
    if (code === 'KeyS') delta.addScaledVector(fwd, -stepDist);
    if (code === 'KeyD') delta.addScaledVector(right, stepDist);
    if (code === 'KeyA') delta.addScaledVector(right, -stepDist);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.controls.update();
  }

  setFloorXray(enabled) {
    this.floorXray = Boolean(enabled);
    const xBtn = this._walkHudEl?.querySelector('#sps-walk-xray-btn');
    if (xBtn) {
      xBtn.textContent = this.floorXray ? '🔍 Pol Rentgen: ON' : '🔍 Pol Rentgen: OFF';
      xBtn.style.borderColor = this.floorXray ? 'rgba(16,185,129,0.75)' : 'rgba(148,163,184,0.32)';
      xBtn.style.background = this.floorXray ? 'rgba(16,185,129,0.25)' : 'rgba(30,41,59,0.92)';
    }
    this.rebuildScene();
  }

  _setFirstPersonCamera(posX, posY, posZ, lookX, lookY, lookZ) {
    const dir = new THREE.Vector3(lookX - posX, lookY - posY, lookZ - posZ);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    this.camera.position.set(posX, posY, posZ);
    // 0.20 m oldindagi nishon: sichqonchani surganda odam turgan joyida 360° boshini aylantiradi!
    this.controls.target.set(posX + dir.x * 0.20, posY + dir.y * 0.20, posZ + dir.z * 0.20);
    this.controls.update();
  }

  setWalkPreset(spot = 'entry') {
    const fl = this.store.getActiveFloor();
    const yBase = Number(fl?.elevationM) || 0;
    const eyeY = yBase + 1.62;
    const b = getFloorWorldBounds(fl);
    if (fl?.officeInterior) {
      if (spot === 'desks') {
        this._setFirstPersonCamera(10.85, eyeY, 7.80, 6.20, eyeY - 0.06, 8.60);
      } else if (spot === 'boiler') {
        this._setFirstPersonCamera(6.25, eyeY - 0.08, 2.72, 6.32, eyeY - 0.24, 0.88);
      } else {
        this._setFirstPersonCamera(6.05, eyeY, 3.65, 8.95, eyeY - 0.08, 8.25);
      }
    } else {
      const cx = (b.minX + b.maxX) * 0.5;
      const cz = (b.minY + b.maxY) * 0.5;
      this._setFirstPersonCamera(cx, eyeY, cz + 1.8, cx, eyeY - 0.05, cz - 1.5);
    }
  }

  _bindEvents() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    window.addEventListener('keydown', (e) => {
      if (!this.walkMode) return;
      if (e.code === 'Escape') {
        this.setWalkthroughMode(false);
        return;
      }
      this.keysDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });
  }

  setWalkthroughMode(enabled, spot = 'entry') {
    const next = Boolean(enabled);
    const changed = this.walkMode !== next;
    this.walkMode = next;
    this.keysDown.clear();
    if (this._walkHudEl) {
      this._walkHudEl.style.display = this.walkMode ? 'flex' : 'none';
    }
    if (this.walkMode) {
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
      this.controls.enableZoom = false;
      this.controls.enablePan = false;
      this.controls.minPolarAngle = Math.PI * 0.12;
      this.controls.maxPolarAngle = Math.PI * 0.88;
      this.controls.rotateSpeed = -0.45;
      this.rebuildScene();
      this.setWalkPreset(spot);
    } else {
      this.floorXray = false;
      this.camera.fov = 44;
      this.camera.updateProjectionMatrix();
      this.controls.enableZoom = true;
      this.controls.enablePan = true;
      this.controls.minPolarAngle = 0.05;
      this.controls.maxPolarAngle = Math.PI * 0.495;
      this.controls.rotateSpeed = 1.0;
      this.rebuildScene();
      this.fitCameraToBuilding();
    }
    if (changed) {
      this.onWalkModeChange?.(this.walkMode);
    }
  }

  fitCameraToBuilding() {
    if (this.walkMode) return;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    const fl = this.store.getActiveFloor();
    const b = getFloorWorldBounds(fl);
    const cx = (b.minX + b.maxX) * 0.5;
    const cz = (b.minY + b.maxY) * 0.5;
    const span = Math.max(b.width, b.height, 8);
    this.controls.target.set(cx, 1.2, cz);
    this.camera.position.set(cx + span * 0.88, span * 0.86, cz + span * 0.96);
    this.controls.update();
  }

  /**
   * Istalgan LOD 400 radiator, diffuzor 4АПН+3КСД, fankoyl yoki TE-SA press-troynik / Obvod uzeliga
   * 3D kamerani xona ichidan 1 klikda yaqinlashtiradi!
   */
  focusOnWorldTarget({ x, y, z = 0.22, normalX = 0, normalY = 1, distanceM = 0.92, elevOffsetM = null } = {}) {
    if (this.walkMode) {
      this.setWalkthroughMode(false);
    }
    const fl = this.store.getActiveFloor();
    const yBase = Number(fl?.elevationM) || 0;
    const nLen = Math.hypot(normalX, normalY) || 1;
    const nx = normalX / nLen;
    const nz = normalY / nLen;
    const sideX = -nz * 0.32;
    const sideZ = nx * 0.32;
    const targetY = yBase + z;
    const dy = elevOffsetM !== null ? Number(elevOffsetM) : distanceM * 0.52;
    this.controls.maxPolarAngle = dy < 0 ? Math.PI * 0.86 : Math.PI * 0.495;
    this.controls.target.set(x, targetY, y);
    this.camera.position.set(
      x + (nx + sideX) * distanceM,
      targetY + dy,
      y + (nz + sideZ) * distanceM,
    );
    this.controls.update();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(120, Math.floor(rect.width));
    const h = Math.max(120, Math.floor(rect.height));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  rebuildScene() {
    const state = this.store.state;
    const isLight = state.settings.theme === 'light';
    const isClay = state.settings.style3d === 'clay';
    const cutaway = this.walkMode ? 'full' : (state.settings.cutawayMode || 'dollhouse');

    this.scene.background = new THREE.Color(isLight ? 0xeef2f6 : 0x0b111d);
    if (this.groundGrid) {
      this.groundGrid.material.color.setHex(isLight ? 0xcbd5e1 : 0x1e293b);
    }

    // Eski mesh/geometriyalarni xotiradan tozalash (keshlangan shared LOD 400 geometriyalarga tegmasdan!)
    while (this.modelRoot.children.length > 0) {
      const ch = this.modelRoot.children.pop();
      ch.traverse?.((obj) => {
        if (obj.geometry && !obj.geometry.userData?.shared) {
          obj.geometry.dispose?.();
        }
      });
    }
    this.dollhouseWallEntries = [];
    this.flowSegments = [];
    this.flowPointsMesh = null;
    this.roomFloorMeshes = [];

    const matExtWall = new THREE.MeshStandardMaterial({
      color: isClay ? 0xf8fafc : (isLight ? 0xe7e5e4 : 0xd6d3d1),
      roughness: 0.82,
      metalness: 0.04,
    });
    const matIntWall = new THREE.MeshStandardMaterial({
      color: isClay ? 0xffffff : 0xf8fafc,
      roughness: 0.75,
      metalness: 0.02,
    });
    const matCapTop = new THREE.MeshStandardMaterial({
      color: isClay ? 0xcbd5e1 : 0x334155,
      roughness: 0.65,
    });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.55 });
    const matGlass = new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.36,
      roughness: 0.08,
      transmission: 0.45,
    });
    const matDoorWood = new THREE.MeshStandardMaterial({
      color: isClay ? 0xe2e8f0 : 0x92400e,
      roughness: 0.58,
      metalness: 0.06,
    });
    const matBrass = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.85 });
    const matSlab = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88 });
    const matStairMarble = new THREE.MeshStandardMaterial({
      color: isClay ? 0xf1f5f9 : 0xe2e8f0,
      roughness: 0.34,
      metalness: 0.06,
    });

    // Barcha qavatlarni (yoki faol qavatgacha bo'lgan qavatlarni) ustma-ust ko'rsatish
    const activeFl = this.store.getActiveFloor();
    const maxElev = activeFl ? activeFl.elevationM + 0.05 : 99;
    const visibleFloors = state.project.floors.filter((f) => f.elevationM <= maxElev);

    let minGroundY = -0.21;
    for (const fl of visibleFloors) {
      const yB = Number(fl.elevationM) || 0;
      for (const el of fl.elements || []) {
        if (el.kind === 'stair' && el.direction === 'down') {
          minGroundY = Math.min(minGroundY, yB - (Number(el.dropHeightM) || 2.85) - 0.16);
        }
      }
    }
    if (this.groundGrid) this.groundGrid.position.y = minGroundY;
    if (this.shadowGround) this.shadowGround.position.y = minGroundY + 0.005;

    for (const fl of visibleFloors) {
      const yBase = Number(fl.elevationM) || 0;
      const fullH = Number(fl.heightM) || 3.0;
      const effH = cutaway === 'waist' && fl.id === activeFl?.id ? Math.min(1.25, fullH) : fullH;
      const nm = getNodeMap(fl);
      const b = getFloorWorldBounds(fl);
      const downStairs = (fl.elements || []).filter((e) => e.kind === 'stair' && e.direction === 'down' && e.openingRect);

      // 1. Asosiy temir-beton pol plitasi (agar tushuvchi zina shaxtasi bo'lsa, plitada haqiqiy o'yiq proyom ochiladi!)
      if (fl.walls.length > 0) {
        if (downStairs.length > 0) {
          const sx0 = b.minX - 0.2;
          const sx1 = b.maxX + 0.2;
          const sy0 = b.minY - 0.2;
          const sy1 = b.maxY + 0.2;
          const slabShape = new THREE.Shape();
          // (x, -y) tekisligida CCW kontur:
          slabShape.moveTo(sx0, -sy0);
          slabShape.lineTo(sx0, -sy1);
          slabShape.lineTo(sx1, -sy1);
          slabShape.lineTo(sx1, -sy0);
          slabShape.closePath();

          for (const ds of downStairs) {
            const r = ds.openingRect;
            const hole = new THREE.Path();
            // CW teshik:
            hole.moveTo(r.minX, -r.minY);
            hole.lineTo(r.maxX, -r.minY);
            hole.lineTo(r.maxX, -r.maxY);
            hole.lineTo(r.minX, -r.maxY);
            hole.closePath();
            slabShape.holes.push(hole);
          }

          const slabGeo = new THREE.ExtrudeGeometry(slabShape, { depth: 0.20, bevelEnabled: false });
          slabGeo.rotateX(-Math.PI * 0.5);
          const slabMesh = new THREE.Mesh(slabGeo, matSlab);
          slabMesh.position.y = yBase - 0.205;
          slabMesh.receiveShadow = true;
          this.modelRoot.add(slabMesh);

          // Oxirgi 2-qavat ostida iliq 1-qavat borligini bildiruvi nafis yarim-shaffof 1-qavat silueti:
          if (fl.subfloorIsHeated) {
            const dropH = Number(downStairs[0].dropHeightM) || 2.85;
            const podH = Math.max(1.2, dropH - 0.22);
            const podGeo = new THREE.BoxGeometry(b.width + 0.12, podH, b.height + 0.12);
            const podEdges = new THREE.EdgesGeometry(podGeo);
            const podLines = new THREE.LineSegments(
              podEdges,
              new THREE.LineBasicMaterial({ color: isLight ? 0x94a3b8 : 0x334155, transparent: true, opacity: 0.45 }),
            );
            podLines.position.set((b.minX + b.maxX) * 0.5, yBase - 0.21 - podH * 0.5, (b.minY + b.maxY) * 0.5);
            this.modelRoot.add(podLines);
          }
        } else {
          const slabGeo = new THREE.BoxGeometry(b.width + 0.4, 0.20, b.height + 0.4);
          const slabMesh = new THREE.Mesh(slabGeo, matSlab);
          slabMesh.position.set((b.minX + b.maxX) * 0.5, yBase - 0.105, (b.minY + b.maxY) * 0.5);
          slabMesh.receiveShadow = true;
          this.modelRoot.add(slabMesh);
        }
      }

      // 2. Xonalar pol qoplamasi (parket / laminat / kafel) + tushuvchi zina o'yig'i + WalkMode shift plitasi
      for (const rm of fl.rooms || []) {
        if (!rm.innerPoly || rm.innerPoly.length < 3) continue;
        const pts2d = rm.innerPoly.map(([px, py]) => [px, -py]);
        let signedArea = 0;
        for (let i = 0; i < pts2d.length; i++) {
          const [x1, y1] = pts2d[i];
          const [x2, y2] = pts2d[(i + 1) % pts2d.length];
          signedArea += x1 * y2 - x2 * y1;
        }
        if (signedArea < 0) pts2d.reverse(); // CCW garantiyasi

        const shape = new THREE.Shape();
        let rmMinX = Infinity, rmMaxX = -Infinity, rmMinY = Infinity, rmMaxY = -Infinity;
        for (const [px, py] of rm.innerPoly) {
          rmMinX = Math.min(rmMinX, px);
          rmMaxX = Math.max(rmMaxX, px);
          rmMinY = Math.min(rmMinY, py);
          rmMaxY = Math.max(rmMaxY, py);
        }
        pts2d.forEach(([sx, sy], i) => (i === 0 ? shape.moveTo(sx, sy) : shape.lineTo(sx, sy)));
        shape.closePath();

        for (const ds of downStairs) {
          const r = ds.openingRect;
          const hx0 = Math.max(rmMinX + 0.03, r.minX);
          const hx1 = Math.min(rmMaxX - 0.03, r.maxX);
          const hy0 = Math.max(rmMinY + 0.03, r.minY);
          const hy1 = Math.min(rmMaxY - 0.03, r.maxY);
          if (hx1 - hx0 > 0.35 && hy1 - hy0 > 0.35) {
            const hole = new THREE.Path();
            hole.moveTo(hx0, -hy0);
            hole.lineTo(hx1, -hy0);
            hole.lineTo(hx1, -hy1);
            hole.lineTo(hx0, -hy1);
            hole.closePath();
            shape.holes.push(hole);
          }
        }

        const fGeo = new THREE.ShapeGeometry(shape);
        fGeo.rotateX(-Math.PI * 0.5);
        const fMat = isClay
          ? new THREE.MeshStandardMaterial({
              color: 0xf1f5f9,
              roughness: 0.85,
              transparent: this.floorXray,
              opacity: this.floorXray ? 0.28 : 1.0,
              depthWrite: !this.floorXray,
            })
          : new THREE.MeshStandardMaterial({
              map: this._getFloorTex(rm.floorMat || 'parquet'),
              roughness: 0.62,
              transparent: this.floorXray,
              opacity: this.floorXray ? 0.28 : 1.0,
              depthWrite: !this.floorXray,
            });
        const fMesh = new THREE.Mesh(fGeo, fMat);
        fMesh.position.y = this.walkMode ? yBase + 0.025 : yBase + 0.008;
        fMesh.receiveShadow = true;
        this.modelRoot.add(fMesh);
        this.roomFloorMeshes.push(fMesh);

        // Ichida yurish (WalkMode) yoqilganda: xona ustida haqiqiy oq akustik shift + ichki yoritish!
        if (this.walkMode && fl.id === activeFl?.id) {
          const ceilShape = new THREE.Shape();
          pts2d.forEach(([sx, sy], i) => (i === 0 ? ceilShape.moveTo(sx, sy) : ceilShape.lineTo(sx, sy)));
          ceilShape.closePath();
          const cGeo = new THREE.ShapeGeometry(ceilShape);
          cGeo.rotateX(-Math.PI * 0.5);
          const cMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.90,
            side: THREE.DoubleSide,
          });
          const cMesh = new THREE.Mesh(cGeo, cMat);
          cMesh.position.y = yBase + fullH;
          this.modelRoot.add(cMesh);
        }
      }

      if (this.walkMode && fl.id === activeFl?.id) {
        const ptLight1 = new THREE.PointLight(0xfffbeb, 1.15, 16);
        ptLight1.position.set((b.minX + b.maxX) * 0.55, yBase + fullH - 0.35, (b.minY + b.maxY) * 0.58);
        const ptLight2 = new THREE.PointLight(0xe0f2fe, 0.75, 12);
        ptLight2.position.set((b.minX + b.maxX) * 0.42, yBase + fullH - 0.35, b.minY + 2.2);
        this.modelRoot.add(ptLight1, ptLight2);
      }

      // 3. Devorlar (teshiksiz devorlar aniq miter poligoni bilan, teshikli devorlar podokonnik + peremichka bilan!)
      const bCenter = { x: (b.minX + b.maxX) * 0.5, z: (b.minY + b.maxY) * 0.5 };

      for (const w of fl.walls || []) {
        const a = nm.get(w.n1);
        const bNd = nm.get(w.n2);
        if (!a || !bNd) continue;
        const ops = (fl.openings || []).filter((o) => o.wallId === w.id).sort((p, q) => p.t - q.t);
        const wMat = w.kind === 'exterior' ? matExtWall : matIntWall;
        const wallH = Math.min(effH, Number(w.heightM) || fullH);

        const buildWallGroupForHeight = (targetH) => {
          const grp = new THREE.Group();
          if (ops.length === 0) {
            const wp = (fl.wallPolygons || []).find((p) => p.wallId === w.id);
            if (wp && wp.points.length >= 3) {
              const sh = new THREE.Shape();
              wp.points.forEach(([px, py], idx) => (idx === 0 ? sh.moveTo(px, -py) : sh.lineTo(px, -py)));
              sh.closePath();
              const extGeo = new THREE.ExtrudeGeometry(sh, { depth: targetH, bevelEnabled: false });
              extGeo.rotateX(-Math.PI * 0.5);
              const mesh = new THREE.Mesh(extGeo, [wMat, matCapTop]);
              mesh.position.y = yBase;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              grp.add(mesh);
            }
            return grp;
          }

          // Oyna yoki eshik bor devor: tirgaklar (piers) + podokonnik + peremichka + 3D oyna/eshik bloki!
          const dx = bNd.x - a.x;
          const dz = bNd.y - a.y;
          const len = Math.hypot(dx, dz) || 1;
          const angY = -Math.atan2(dz, dx);
          const th = w.thickness || 0.20;

          const localGrp = new THREE.Group();
          localGrp.position.set(a.x, yBase, a.y);
          localGrp.rotation.y = angY;

          const addSpanBox = (s0, s1, y0, y1, mat = wMat) => {
            const spW = s1 - s0;
            const spH = y1 - y0;
            if (spW <= 0.01 || spH <= 0.01) return;
            const g = new THREE.BoxGeometry(spW, spH, th);
            const m = new THREE.Mesh(g, mat);
            m.position.set((s0 + s1) * 0.5, y0 + spH * 0.5, 0);
            m.castShadow = true;
            m.receiveShadow = true;
            localGrp.add(m);
          };

          let cursor = 0;
          for (const op of ops) {
            const cM = op.t * len;
            const o0 = Math.max(cursor, cM - op.widthM * 0.5);
            const o1 = Math.min(len, cM + op.widthM * 0.5);
            if (o0 > cursor + 0.01) {
              addSpanBox(cursor, o0, 0, targetH);
            }
            const sillTop = Math.min(targetH, Number(op.sillM) || 0);
            const headBot = Math.min(targetH, (Number(op.sillM) || 0) + (Number(op.heightM) || 2.1));
            if (sillTop > 0.02) addSpanBox(o0, o1, 0, sillTop);
            if (targetH > headBot + 0.02) addSpanBox(o0, o1, headBot, targetH);

            // 3D Oyna yoki Eshik detalizatsiyasi (faqat teshik balandligi ko'rinsa)
            const visOpH = Math.max(0, Math.min(targetH, headBot) - sillTop);
            if (visOpH > 0.18) {
              const ow = o1 - o0;
              const midX = (o0 + o1) * 0.5;
              if (op.type === 'window') {
                // Anodlangan ramka + oyna shishasi + podokonnik
                addSpanBox(o0 - 0.02, o1 + 0.02, Math.max(0, sillTop - 0.03), sillTop, matCapTop);
                const glassM = new THREE.Mesh(new THREE.BoxGeometry(ow - 0.06, visOpH - 0.06, 0.024), matGlass);
                glassM.position.set(midX, sillTop + visOpH * 0.5, 0);
                localGrp.add(glassM);

                const frameT = 0.04;
                const mullions = ow > 1.35 ? [-ow * 0.5 + frameT * 0.5, 0, ow * 0.5 - frameT * 0.5] : [-ow * 0.5 + frameT * 0.5, ow * 0.5 - frameT * 0.5];
                for (const fx of mullions) {
                  const post = new THREE.Mesh(new THREE.BoxGeometry(frameT, visOpH, 0.075), matFrame);
                  post.position.set(midX + fx, sillTop + visOpH * 0.5, 0);
                  localGrp.add(post);
                }
                for (const fy of [sillTop + frameT * 0.5, sillTop + visOpH - frameT * 0.5]) {
                  const rail = new THREE.Mesh(new THREE.BoxGeometry(ow, frameT, 0.075), matFrame);
                  rail.position.set(midX, fy, 0);
                  localGrp.add(rail);
                }
              } else if (op.type === 'door') {
                // Eshik korobkasi + tabaqasi + dastagi (yarim ochiq 25° burchakda chiroyli ko'rinadi!)
                const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.045, visOpH, th + 0.02), matDoorWood);
                jambL.position.set(o0 + 0.022, visOpH * 0.5, 0);
                const jambR = jambL.clone();
                jambR.position.x = o1 - 0.022;
                localGrp.add(jambL, jambR);

                const leafW = Math.max(0.2, ow - 0.09);
                const pivot = new THREE.Group();
                const hSign = op.hingeSide === 'right' ? 1 : -1;
                const sSign = op.swingDir === -1 ? -1 : 1;
                pivot.position.set(midX + hSign * (leafW * 0.5), 0, 0);
                pivot.rotation.y = -hSign * sSign * 0.36; // ~21° yarim ochiq

                const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, visOpH - 0.03, 0.044), matDoorWood);
                leaf.position.set(-hSign * (leafW * 0.5), (visOpH - 0.03) * 0.5, 0);
                leaf.castShadow = true;
                pivot.add(leaf);

                const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.12), matBrass);
                handle.position.set(-hSign * (leafW - 0.09), Math.min(1.02, visOpH * 0.5), 0);
                pivot.add(handle);
                localGrp.add(pivot);
              }
            }
            cursor = o1;
          }
          if (cursor < len - 0.01) {
            addSpanBox(cursor, len, 0, targetH);
          }
          grp.add(localGrp);
          return grp;
        };

        const fullGrp = buildWallGroupForHeight(wallH);
        this.modelRoot.add(fullGrp);

        // Dollhouse rejimi uchun tashqi devorning past (0.50m) versiyasini tayyorlab qo'yamiz
        if (cutaway === 'dollhouse' && w.kind === 'exterior' && fl.id === activeFl?.id) {
          const lowGrp = buildWallGroupForHeight(0.48);
          lowGrp.visible = false;
          this.modelRoot.add(lowGrp);

          const mx = (a.x + bNd.x) * 0.5;
          const mz = (a.y + bNd.y) * 0.5;
          const dx = bNd.x - a.x;
          const dz = bNd.y - a.y;
          const l = Math.hypot(dx, dz) || 1;
          let outNx = -dz / l;
          let outNz = dx / l;
          // Tashqi normal bino markazidan TASHQARIGA qaragan bo'lsin
          if ((mx - bCenter.x) * outNx + (mz - bCenter.z) * outNz < 0) {
            outNx = -outNx;
            outNz = -outNz;
          }
          this.dollhouseWallEntries.push({ fullGrp, lowGrp, outNx, outNz, mx, mz });
        }
      }

      // 4. Ustun, Shaxta va Zinalar (1-qavatga tushuvchi marsh YOKI yuqoriga chiquvchi marsh!)
      for (const el of fl.elements || []) {
        const w = el.wM || 0.4;
        const d = el.dM || 0.4;
        if (el.kind === 'column' || el.kind === 'shaft') {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(w, effH, d),
            el.kind === 'shaft'
              ? new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 })
              : matExtWall,
          );
          m.position.set(el.x, yBase + effH * 0.5, el.y);
          m.castShadow = true;
          this.modelRoot.add(m);
        } else if (el.kind === 'mep_pin') {
          const hexMap = { Suv: 0x06b6d4, Kanalizatsiya: 0xa855f7, Vent: 0xf97316, Isitish: 0xef4444, Uskuna: 0x10b981 };
          const pinColor = hexMap[el.mepType] || 0x38bdf8;
          const zElev = Math.max(0.06, Math.min(fullH - 0.08, Number(el.zM) || 0.35));
          const sph = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 16, 16),
            new THREE.MeshStandardMaterial({ color: pinColor, emissive: pinColor, emissiveIntensity: 0.25, roughness: 0.3 }),
          );
          sph.position.set(el.x, yBase + zElev, el.y);
          const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.018, zElev, 8),
            new THREE.MeshStandardMaterial({ color: pinColor, roughness: 0.5 }),
          );
          stem.position.set(el.x, yBase + zElev * 0.5, el.y);
          this.modelRoot.add(sph, stem);
        } else if (el.kind === 'stair' && el.direction === 'down') {
          // 2-qavat plitasidan 1-qavatga PASTGA tushuvchi temir-beton + marmar zina (tepaga 0 mm ham chiqmaydi!)
          const r = el.openingRect || { minX: el.x - d * 0.5, maxX: el.x + d * 0.5, minY: el.y - w * 0.5, maxY: el.y + w * 0.5 };
          const dropH = Number(el.dropHeightM) || 2.85;
          const steps = 15;
          const spanX = r.maxX - r.minX;
          const stairW = r.maxY - r.minY;
          const zMid = (r.minY + r.maxY) * 0.5;
          const stepRun = spanX / steps;
          const stepRise = dropH / steps;
          const stGrp = new THREE.Group();

          for (let s = 0; s < steps; s++) {
            const topY = yBase - stepRise * (s + 1);
            const tx = r.maxX - stepRun * (s + 0.5);
            // Marmar pog'ona (tread)
            const tread = new THREE.Mesh(
              new THREE.BoxGeometry(stepRun + 0.024, 0.042, stairW - 0.02),
              matStairMarble,
            );
            tread.position.set(tx, topY - 0.021, zMid);
            tread.castShadow = true;
            tread.receiveShadow = true;
            stGrp.add(tread);

            // Podstupenok + temir-beton asos
            const carriage = new THREE.Mesh(
              new THREE.BoxGeometry(stepRun + 0.01, stepRise + 0.14, stairW - 0.05),
              matSlab,
            );
            carriage.position.set(tx + stepRun * 0.18, topY - (stepRise + 0.14) * 0.5 + stepRise * 0.5, zMid);
            stGrp.add(carriage);
          }

          // 1-qavat pastki zina maydonchasi (ploshadka Z = -2.85 m)
          const lowerPad = new THREE.Mesh(
            new THREE.BoxGeometry(spanX + 1.05, 0.16, stairW + 1.35),
            matSlab,
          );
          lowerPad.position.set((r.minX + r.maxX) * 0.5, yBase - dropH - 0.08, zMid - 0.45);
          lowerPad.receiveShadow = true;
          stGrp.add(lowerPad);

          // 2-qavat ochiq zina chetida zamonaviy antratsit + shisha to'siq (perila H = 0.92 m)
          const railZ = r.minY - 0.025;
          const topRail = new THREE.Mesh(new THREE.BoxGeometry(spanX + 0.06, 0.036, 0.042), matFrame);
          topRail.position.set((r.minX + r.maxX) * 0.5, yBase + 0.92, railZ);
          stGrp.add(topRail);

          const glassGuard = new THREE.Mesh(new THREE.BoxGeometry(spanX - 0.04, 0.78, 0.014), matGlass);
          glassGuard.position.set((r.minX + r.maxX) * 0.5, yBase + 0.48, railZ);
          stGrp.add(glassGuard);

          for (let p = 0; p <= 4; p++) {
            const px = r.minX + (spanX * p) / 4;
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.92, 0.032), matFrame);
            post.position.set(px, yBase + 0.46, railZ);
            stGrp.add(post);
          }

          this.modelRoot.add(stGrp);
        } else if (el.kind === 'stair') {
          const steps = 14;
          const stGrp = new THREE.Group();
          stGrp.position.set(el.x, yBase, el.y);
          stGrp.rotation.y = -((el.rotationDeg || 0) * Math.PI) / 180;
          const stepH = fullH / steps;
          const stepD = d / steps;
          for (let s = 0; s < steps; s++) {
            const tread = new THREE.Mesh(
              new THREE.BoxGeometry(w, stepH * (s + 1), stepD),
              matDoorWood,
            );
            tread.position.set(0, stepH * (s + 1) * 0.5, d * 0.5 - stepD * (s + 0.5));
            tread.castShadow = true;
            tread.receiveShadow = true;
            stGrp.add(tread);
          }
          this.modelRoot.add(stGrp);
        }
      }

      // 4B. Haqiqiy Ofis Mebellari va Interyeri (12 ta ikki-monitorli BIM ish stoli, kreslo, shkaf, fikus va LED chiroqlar!)
      if (fl.officeInterior && state.settings.showOfficeFurniture !== false) {
        this._buildOfficeInterior3D(fl, yBase, fullH, isClay);
      }

      // 5. 3D LiDAR Nuqtalar Buluti + Yashil Lazer Kesim Tekisligi (Z = lidarSliceZ)
      const scan = fl.scanOverlay;
      if (state.settings.lidarVisible !== false && scan && Array.isArray(scan.pointStride6) && scan.pointStride6.length >= 6) {
        const raw = scan.pointStride6;
        const count = Math.floor(raw.length / 6);
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sliceZ = Number(state.settings.lidarSliceZ) || 1.20;

        for (let i = 0; i < count; i++) {
          const px = raw[i * 6];
          const py = raw[i * 6 + 1];
          const pz = raw[i * 6 + 2];
          positions[i * 3] = px;
          positions[i * 3 + 1] = yBase + pz;
          positions[i * 3 + 2] = py;

          // Kesim tekisligiga tushgan nuqtalarni yorqin zumrad lazer rangda ko'rsatish!
          if (Math.abs(pz - sliceZ) <= 0.08) {
            colors[i * 3] = 0.06;
            colors[i * 3 + 1] = 0.98;
            colors[i * 3 + 2] = 0.58;
          } else {
            colors[i * 3] = raw[i * 6 + 3];
            colors[i * 3 + 1] = raw[i * 6 + 4];
            colors[i * 3 + 2] = raw[i * 6 + 5];
          }
        }

        const ptGeo = new THREE.BufferGeometry();
        ptGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        ptGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const ptMat = new THREE.PointsMaterial({
          size: 0.055,
          vertexColors: true,
          transparent: true,
          opacity: 0.88,
        });
        this.modelRoot.add(new THREE.Points(ptGeo, ptMat));

        // Yarim-shaffof lazer kesim tekisligi (Z = sliceZ)
        const slicePlane = new THREE.Mesh(
          new THREE.PlaneGeometry(b.width + 1.4, b.height + 1.4),
          new THREE.MeshBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.11,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        slicePlane.rotation.x = -Math.PI * 0.5;
        slicePlane.position.set((b.minX + b.maxX) * 0.5, yBase + sliceZ, (b.minY + b.maxY) * 0.5);
        this.modelRoot.add(slicePlane);
      }

      // 6. 3D ОВ, ВК va ТМ Muhandislik Tizimlari (60 FPS mobil va kompyuter optimizatsiyasi bilan!)
      this._buildFloorMep3D(fl, yBase, fullH, state);
    }

    // 7. Yagona GPU buferli Oqim Simulyatsiyasi zarralari (1 ta draw call!)
    this._initFlowSimulationParticles();
  }

  _getFlowParticleCircleTex() {
    if (this._flowCircleTex) return this._flowCircleTex;
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.88)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    this._flowCircleTex = new THREE.CanvasTexture(c);
    return this._flowCircleTex;
  }

  _addMergedPipePolylines(polylines3d, radiusM, material, flowRgb = null) {
    // Uzluksiz (tutashtirilgan halqali + bissektrisa tekisligida miter qilingan) 10-qirrali 3D quvur:
    // Har qanday burilish va R=55mm otvodda 0.0 mm yoriqsiz, silliq yumaloq truba chiqadi!
    const sides = 10;
    const cosTab = [];
    const sinTab = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      cosTab.push(Math.cos(ang));
      sinTab.push(Math.sin(ang));
    }

    const verts = [];
    const norms = [];
    const indices = [];
    let vOffset = 0;

    const upVec = new THREE.Vector3(0, 1, 0);
    const altVec = new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3();
    const v = new THREE.Vector3();
    const bisector = new THREE.Vector3();
    const rotQ = new THREE.Quaternion();
    const offVec = new THREE.Vector3();

    for (const rawPts of polylines3d) {
      if (!rawPts || rawPts.length < 2) continue;

      // Ketma-ket bir xil nuqtalarni tozalash
      const pts = [rawPts[0]];
      for (let i = 1; i < rawPts.length; i++) {
        const prev = pts[pts.length - 1];
        const cur = rawPts[i];
        const d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
        if (d >= 0.003) pts.push(cur);
      }
      if (pts.length < 2) continue;

      const segDirs = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0];
        const dy = pts[i + 1][1] - pts[i][1];
        const dz = pts[i + 1][2] - pts[i][2];
        const len = Math.hypot(dx, dy, dz) || 1;
        segDirs.push(new THREE.Vector3(dx / len, dy / len, dz / len));
        if (flowRgb && len >= 0.16) {
          this.flowSegments.push({
            ax: pts[i][0], ay: pts[i][1], az: pts[i][2],
            bx: pts[i + 1][0], by: pts[i + 1][1], bz: pts[i + 1][2],
            r: flowRgb[0], g: flowRgb[1], b: flowRgb[2],
          });
        }
      }

      // Boshlang'ich ortogonal bazis (U, V)
      const d0 = segDirs[0];
      const ref = Math.abs(d0.y) > 0.92 ? altVec : upVec;
      u.crossVectors(d0, ref).normalize();
      v.crossVectors(d0, u).normalize();

      const ringStartOffset = vOffset;
      const numRings = pts.length;

      for (let k = 0; k < numRings; k++) {
        const [px, py, pz] = pts[k];
        const dPrev = k === 0 ? segDirs[0] : segDirs[k - 1];
        const dNext = k === numRings - 1 ? segDirs[numRings - 2] : segDirs[k];

        bisector.copy(dPrev).add(dNext);
        if (bisector.lengthSq() < 1e-5) {
          bisector.copy(dPrev);
        } else {
          bisector.normalize();
        }

        const denom = Math.max(0.42, dPrev.dot(bisector));

        for (let s = 0; s < sides; s++) {
          const ca = cosTab[s];
          const sa = sinTab[s];
          const nx = u.x * ca + v.x * sa;
          const ny = u.y * ca + v.y * sa;
          const nz = u.z * ca + v.z * sa;

          offVec.set(nx * radiusM, ny * radiusM, nz * radiusM);
          // Silindr nuri bissektrisa tekisligini aniq kesib o'tadi (0.0 mm yoriqsiz miter!)
          const slide = -offVec.dot(bisector) / denom;
          verts.push(
            px + offVec.x + dPrev.x * slide,
            py + offVec.y + dPrev.y * slide,
            pz + offVec.z + dPrev.z * slide,
          );
          norms.push(nx, ny, nz);
        }
        vOffset += sides;

        // Keyingi segment yo'nalishiga burilishsiz parallel-transport qilish
        if (k < numRings - 1 && k > 0) {
          if (dPrev.dot(dNext) > -0.995) {
            rotQ.setFromUnitVectors(dPrev, dNext);
            u.applyQuaternion(rotQ).normalize();
            v.crossVectors(dNext, u).normalize();
          }
        }
      }

      // Qo'shni halqalarni yagona uzluksiz quvur sirtiga tikish
      for (let k = 0; k < numRings - 1; k++) {
        const rA = ringStartOffset + k * sides;
        const rB = ringStartOffset + (k + 1) * sides;
        for (let s = 0; s < sides; s++) {
          const next = (s + 1) % sides;
          const a0 = rA + s;
          const a1 = rB + s;
          const b0 = rA + next;
          const b1 = rB + next;
          indices.push(a0, a1, b0, b0, a1, b1);
        }
      }
    }

    if (!verts.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, material);
    this.modelRoot.add(mesh);
  }

  _buildFloorMep3D(fl, yBase, fullH, state) {
    const suite = state.mepSuite;
    if (!suite) return;
    const vis = state.settings.visibleLayers || {};
    const flOv = suite.ov.floors.find((f) => f.floorId === fl.id);
    const flVk = suite.vk.floors.find((f) => f.floorId === fl.id);
    const tmData = suite.tm.floorId === fl.id ? suite.tm : null;

    const gg = getLod400SharedGeoms();
    const lm = getLod400SharedMats();
    const matRedPipe = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.30, metalness: 0.14 });
    const matBluePipe = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.30, metalness: 0.14 });
    const matCyanPipe = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.30 });
    const matAmberPipe = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.34 });
    const matDuctP1 = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.35, metalness: 0.38 });
    const matDuctV1 = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35, metalness: 0.38 });

    // 1) 3D Водяной тёплый пол «Улитка» (2-поғонали: Level 1 изоляциядаги транзит -> Level 2 silliq R=55мм Улитка!)
    if ((vis.tp || (this.walkMode && this.floorXray)) && flOv) {
      const yTransit = this.walkMode ? yBase + 0.007 : yBase + 0.015;
      const yCoil = this.walkMode ? yBase + 0.012 : yBase + 0.030;

      const supPolys = flOv.ufLoops.map((lp) => lp.supplyPts.map(([px, py]) => [px, yCoil, py]));
      const retPolys = flOv.ufLoops.map((lp) => lp.returnPts.map(([px, py]) => [px, yCoil, py]));
      this._addMergedPipePolylines(supPolys, 0.0095, matRedPipe, [1.0, 0.88, 0.22]);
      this._addMergedPipePolylines(retPolys, 0.0095, matBluePipe, [0.38, 0.82, 1.0]);

      // Kollektordan xonagacha tranzit uchastkalar Level 1 da qizil/ko'k Energoflex 18×6mm g'ilofda o'tadi va manjetada yCoil ga silliq chiqadi!
      const trSup = flOv.ufLoops
        .filter((lp) => lp.transitSupplyPts?.length >= 2)
        .map((lp) => lp.transitSupplyPts.map(([px, py], idx, arr) => [px, idx === arr.length - 1 ? yCoil : yTransit, py]));
      const trRet = flOv.ufLoops
        .filter((lp) => lp.transitReturnPts?.length >= 2)
        .map((lp) => lp.transitReturnPts.map(([px, py], idx) => [px, idx === 0 ? yCoil : yTransit, py]));
      this._addMergedPipePolylines(trSup, 0.0135, lm.energoflexRed, null);
      this._addMergedPipePolylines(trRet, 0.0135, lm.energoflexBlue, null);

      buildCollectorCabinetLod4003D(this.modelRoot, flOv.tpCollector, yBase, true);
    }

    // 2) 3D LOD 400 Радиаторы (C22 / Kermi / Rifar Tubog / Biliner) + Konveka FC Напольный + Бинокль 50 мм + TE-SA Press / PP-R фитинги и обводы!
    if (vis.rad && flOv) {
      const mCfg = state.settings?.mepConfig || {};
      const isTwoPipe = suite.ov?.radTopology && suite.ov.radTopology !== 'radial';
      const showBareMpOrPpr = mCfg.ovShowBarePipes !== undefined ? Boolean(mCfg.ovShowBarePipes) : isTwoPipe;

      const matBareT1 = new THREE.MeshStandardMaterial({ color: 0xfef2f2, roughness: 0.24, metalness: 0.08 });
      const matBareT2 = new THREE.MeshStandardMaterial({ color: 0xf0f9ff, roughness: 0.24, metalness: 0.08 });

      const groupedPipes = new Map();
      for (const p of flOv.radPipes || []) {
        const dn = Number(p.dnMm) || 16;
        const useBare = showBareMpOrPpr || !p.insulated;
        const key = `${p.sys}::${dn}::${useBare ? 'bare' : 'ins'}`;
        if (!groupedPipes.has(key)) groupedPipes.set(key, { sys: p.sys, dn, useBare, polys: [] });
        groupedPipes.get(key).polys.push(p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
      }

      for (const grp of groupedPipes.values()) {
        const baseRad = Math.max(0.008, grp.dn * 0.0005);
        const effRad = grp.useBare ? baseRad : baseRad + 0.0045;
        const mat = grp.useBare
          ? (grp.sys === 'T1' ? matBareT1 : matBareT2)
          : (grp.sys === 'T1' ? lm.energoflexRed : lm.energoflexBlue);
        const flowCol = grp.sys === 'T1' ? [1.0, 0.28, 0.18] : [0.20, 0.68, 1.0];
        this._addMergedPipePolylines(grp.polys, effRad, mat, flowCol);
      }

      buildHeatingNetworkFittingsLod4003D(this.modelRoot, flOv, yBase);
      buildCollectorCabinetLod4003D(this.modelRoot, flOv.radCollector, yBase, false);
      for (const r of flOv.radiators) {
        buildEmitterLod4003D(this.modelRoot, r, yBase);
      }
    }

    // 3) 3D LOD 400 Вентиляция (Galvent оцинкованные воздуховоды + Шумоглушители СР + ДК + 3КСД + 4АПН/ДКВ/ДЩ/ДПУ-М) + Чиллер–Фанкойл
    if (vis.vent && flOv) {
      const matGalvDuct = new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: 0.27, metalness: 0.78 });
      const matInsExt = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.18 });

      const groupedDucts = new Map();
      for (const vd of flOv.ventDucts || []) {
        const dn = Number(vd.dnMm) || 125;
        const isExt = vd.sys === 'N1' || vd.sys === 'V2';
        const key = `${vd.sys}::${dn}::${isExt ? 'ins' : 'galv'}`;
        if (!groupedDucts.has(key)) groupedDucts.set(key, { sys: vd.sys, dn, isExt, polys: [] });
        groupedDucts.get(key).polys.push(vd.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
      }
      for (const grp of groupedDucts.values()) {
        const radM = Math.max(0.052, grp.dn * 0.0005) + (grp.isExt ? 0.012 : 0);
        const flowRgb = grp.sys === 'P1' || grp.sys === 'N1' ? [0.25, 0.90, 1.0] : [0.30, 1.0, 0.68];
        this._addMergedPipePolylines(grp.polys, radM, grp.isExt ? matInsExt : matGalvDuct, flowRgb);
      }

      // LOD 400 ПВУ, Трубчатые шумоглушители СР, Переходы, Дроссель-клапаны ДК, Ниппели EPDM, Шпильки М8, 3КСД и Диффузоры:
      buildVentilationLod4003D(this.modelRoot, flOv, yBase, fullH);

      // Чиллер–Фанкойл магистрали Т5 (+7°C) ва Т6 (+12°C) антиконденсатли K-Flex ST изоляцияда:
      if (Array.isArray(flOv.fancoilPipes) && flOv.fancoilPipes.length > 0) {
        const matKflexT5 = new THREE.MeshStandardMaterial({ color: 0x0891b2, roughness: 0.42, metalness: 0.12 });
        const matKflexT6 = new THREE.MeshStandardMaterial({ color: 0x4338ca, roughness: 0.42, metalness: 0.12 });
        const t5Polys = flOv.fancoilPipes.filter((p) => p.sys === 'T5').map((p) => p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
        const t6Polys = flOv.fancoilPipes.filter((p) => p.sys === 'T6').map((p) => p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
        this._addMergedPipePolylines(t5Polys, 0.017, matKflexT5, [0.06, 0.92, 1.0]);
        this._addMergedPipePolylines(t6Polys, 0.017, matKflexT6, [0.45, 0.62, 1.0]);

        // Tashqi blok: Инверторный Мини-Чиллер CH-10 кВт (shimoliy texnik fasadda konsolda o'rnatilgan!)
        if (suite.ov?.chillerUnit && t5Polys[0]?.length) {
          const r0 = t5Polys[0][0]; // [fcRiserX, yBase + zFcPipe, fcRiserY]
          const chX = r0[0];
          const chZ = Math.min(0.18, r0[2] - 0.80);
          const chY = yBase + 0.58;

          // Tashqi chillerga tushuvchi Т5/Т6 stoyak trubalari:
          this._addMergedPipePolylines(
            [[[r0[0], r0[1], r0[2]], [chX, r0[1], chZ + 0.20], [chX, chY + 0.42, chZ + 0.20]]],
            0.017,
            matKflexT5,
            [0.06, 0.92, 1.0],
          );
          this._addMergedPipePolylines(
            [[[r0[0] + 0.07, r0[1] - 0.04, r0[2]], [chX + 0.07, r0[1] - 0.04, chZ + 0.20], [chX + 0.07, chY + 0.42, chZ + 0.20]]],
            0.017,
            matKflexT6,
            [0.45, 0.62, 1.0],
          );

          const chGrp = new THREE.Group();
          chGrp.position.set(chX + 0.04, chY, chZ);
          const chBody = new THREE.Mesh(gg.box1, lm.porcelain);
          chBody.scale.set(1.06, 0.86, 0.42);
          chBody.castShadow = true;
          const chTop = new THREE.Mesh(gg.box1, lm.anthracite);
          chTop.scale.set(1.08, 0.04, 0.44);
          chTop.position.y = 0.44;
          chGrp.add(chBody, chTop);

          // 2 ta katta o'qaviy ventilyator panjarasi:
          for (const fx of [-0.26, 0.20]) {
            const shroud = new THREE.Mesh(gg.cyl18, lm.anthracite);
            shroud.scale.set(0.19, 0.03, 0.19);
            shroud.rotation.x = Math.PI * 0.5;
            shroud.position.set(fx, 0.04, -0.215);
            const hub = new THREE.Mesh(gg.cyl14, lm.imritaBlue);
            hub.scale.set(0.06, 0.04, 0.06);
            hub.rotation.x = Math.PI * 0.5;
            hub.position.set(fx, 0.04, -0.22);
            chGrp.add(shroud, hub);
          }
          // Fasad konsol kronshteynlari:
          for (const bx of [-0.42, 0.42]) {
            const brk = new THREE.Mesh(gg.box1, lm.anthracite);
            brk.scale.set(0.05, 0.06, 0.48);
            brk.position.set(bx, -0.45, 0.04);
            chGrp.add(brk);
          }
          this.modelRoot.add(chGrp);
        }
      }

      for (const ac of flOv.acUnits) {
        const acGrp = new THREE.Group();
        if (ac.kind === 'cassette_4way') {
          // LOD 400 Потолочный 4-поточный кассетный фанкойл (840×840 мм + 4 жалюзи + 3-ходовой узел обвязки + шпильки М8!)
          acGrp.position.set(ac.x, yBase + ac.zM, ac.y);
          // 1. Oq dekorativ shift paneli (840×840×42 мм)
          const fascia = new THREE.Mesh(gg.box1, lm.porcelain);
          fascia.scale.set(ac.wM, 0.042, ac.dM);
          fascia.position.y = -0.02;
          acGrp.add(fascia);

          // 2. Markaziy havo tortish mikro-panjarasi (480×480 мм)
          const intake = new THREE.Mesh(gg.box1, lm.anthracite);
          intake.scale.set(0.48, 0.014, 0.48);
          intake.position.y = -0.038;
          acGrp.add(intake);
          for (let g = -0.20; g <= 0.201; g += 0.05) {
            const slat = new THREE.Mesh(gg.box1, lm.silverAlum);
            slat.scale.set(0.45, 0.006, 0.012);
            slat.position.set(0, -0.043, g);
            acGrp.add(slat);
          }

          // 3. 4 tomonga sovuq havo haydovchi jalyuzilar (4-way supply slots)
          const slotMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0284c7, emissiveIntensity: 0.28, roughness: 0.3 });
          for (const [sx, sz, sw, sd] of [
            [0, -0.33, 0.54, 0.052],
            [0, 0.33, 0.54, 0.052],
            [-0.33, 0, 0.052, 0.54],
            [0.33, 0, 0.052, 0.54],
          ]) {
            const slot = new THREE.Mesh(gg.box1, slotMat);
            slot.scale.set(sw, 0.016, sd);
            slot.position.set(sx, -0.039, sz);
            acGrp.add(slot);
          }

          // 4. Burchak LED indikator va yashirin ruxlangan korpus + 3-xodovoy latun klapan uzeli + M8 shpilkalar:
          const led = new THREE.Mesh(gg.box1, lm.lcdScreen);
          led.scale.set(0.055, 0.012, 0.055);
          led.position.set(0.34, -0.041, 0.34);
          const plenum = new THREE.Mesh(gg.box1, lm.stainless);
          plenum.scale.set(0.66, 0.18, 0.66);
          plenum.position.y = 0.09;
          const valveKit = new THREE.Mesh(gg.box1, lm.forgedBrass);
          valveKit.scale.set(0.12, 0.09, 0.14);
          valveKit.position.set(-0.39, 0.06, 0.03);
          acGrp.add(led, plenum, valveKit);

          const rodLen = Math.max(0.04, fullH - (ac.zM + 0.18));
          for (const [rx, rz] of [[-0.30, -0.30], [0.30, -0.30], [-0.30, 0.30], [0.30, 0.30]]) {
            const rod = new THREE.Mesh(gg.cyl10, lm.stainless);
            rod.scale.set(0.0042, rodLen, 0.0042);
            rod.position.set(rx, 0.18 + rodLen * 0.5, rz);
            acGrp.add(rod);
          }
        } else {
          acGrp.position.set(ac.x, yBase + ac.zM, ac.y);
          const shell = new THREE.Mesh(gg.box1, lm.porcelain);
          shell.scale.set(ac.wM, ac.hM, ac.dM);
          const louvre = new THREE.Mesh(gg.box1, lm.silverAlum);
          louvre.scale.set(ac.wM - 0.04, 0.024, 0.03);
          louvre.position.set(0, -ac.hM * 0.42, ac.dM * 0.48);
          const disp = new THREE.Mesh(gg.box1, lm.lcdScreen);
          disp.scale.set(0.08, 0.028, 0.008);
          disp.position.set(ac.wM * 0.32, 0.02, ac.dM * 0.5 + 0.004);
          acGrp.add(shell, louvre, disp);
        }
        this.modelRoot.add(acGrp);
      }
    }

    // 4) 3D LOD 400 ВК — Санфаянс + ХВС/ГВС/Рецирк + Канализация Ostendorf К1 с раструбами и уклоном!
    if (vis.vk && flVk) {
      const b1Polys = flVk.pipes.filter((p) => p.sys === 'B1').map((p) => p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
      const t3Polys = flVk.pipes.filter((p) => p.sys === 'T3').map((p) => p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
      const t4Polys = flVk.pipes.filter((p) => p.sys === 'T4').map((p) => p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
      const k110Polys = flVk.pipes.filter((p) => p.sys === 'K1_110').map((p) => p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
      const k50Polys = flVk.pipes.filter((p) => p.sys === 'K1_50').map((p) => p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));

      this._addMergedPipePolylines(b1Polys, 0.013, matCyanPipe, [0.1, 0.9, 1.0]);
      this._addMergedPipePolylines(t3Polys, 0.013, matRedPipe, [1.0, 0.35, 0.35]);
      this._addMergedPipePolylines(t4Polys, 0.011, matAmberPipe, [1.0, 0.78, 0.2]);
      this._addMergedPipePolylines(k110Polys, 0.054, lm.ostendorfOrange, [0.82, 0.55, 1.0]);
      this._addMergedPipePolylines(k50Polys, 0.026, lm.ostendorfGray, [0.82, 0.55, 1.0]);

      // Kanalizatsiya rastrublari (EPDM salnik halqalari bilan!)
      for (const sp of flVk.pipes.filter((p) => p.sys.startsWith('K1_'))) {
        const pts = sp.pts3d || [];
        if (pts.length >= 2) {
          const p0 = new THREE.Vector3(pts[0][0], yBase + pts[0][2], pts[0][1]);
          const p1 = new THREE.Vector3(pts[1][0], yBase + pts[1][2], pts[1][1]);
          const dir = p0.clone().sub(p1);
          if (dir.lengthSq() > 0.02) {
            addSewerRastrubSocket3D(this.modelRoot, p1, dir, sp.dnMm >= 110);
          }
        }
      }

      for (const fx of flVk.fixtures) {
        buildSanitaryFixtureLod4003D(this.modelRoot, fx, yBase);
      }
    }

    // 5) 3D LOD 400 ТМ — Котельная (Котёл Bathello + Коаксиал + ГС и 3 Насосные группы + БКН + РБ + ХВО Imrita + ЩА ZONT)
    if (vis.tm && tmData) {
      const tmSup = tmData.headerPipes3d.filter((p) => p.sys === 'TM_SUP').map((p) => p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
      const tmRet = tmData.headerPipes3d.filter((p) => p.sys === 'TM_RET').map((p) => p.pts3d.map(([x, y, z]) => [x, yBase + z, y]));
      this._addMergedPipePolylines(tmSup, 0.016, lm.stainless, [1.0, 0.35, 0.2]);
      this._addMergedPipePolylines(tmRet, 0.016, lm.stainless, [0.25, 0.75, 1.0]);

      for (const eq of tmData.equipment3d) {
        buildBoilerRoomEquipmentLod4003D(this.modelRoot, eq, yBase);
      }
    }
  }

  _buildOfficeInterior3D(fl, yBase, fullH, isClay) {
    const inf = fl.officeInterior;
    if (!inf) return;
    const gg = getLod400SharedGeoms();
    const lm = getLod400SharedMats();

    const matOak = new THREE.MeshStandardMaterial({
      color: isClay ? 0xe2e8f0 : 0xc99663,
      roughness: 0.48,
      metalness: 0.04,
    });
    const matWalnut = new THREE.MeshStandardMaterial({
      color: isClay ? 0xcbd5e1 : 0x7c4a24,
      roughness: 0.56,
      metalness: 0.05,
    });
    const matDarkSteel = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.38,
      metalness: 0.62,
    });
    const matChairMesh = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.72,
      metalness: 0.12,
    });
    const matCadScreen = new THREE.MeshStandardMaterial({
      color: 0x0c1929,
      emissive: 0x0284c7,
      emissiveIntensity: isClay ? 0.05 : 0.45,
      roughness: 0.18,
    });
    const matSpecScreen = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0xbae6fd,
      emissiveIntensity: isClay ? 0.05 : 0.38,
      roughness: 0.22,
    });
    const matLedGlow = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfffbeb,
      emissiveIntensity: 0.92,
      roughness: 0.15,
    });
    const matLeaf = new THREE.MeshStandardMaterial({
      color: isClay ? 0xcbd5e1 : 0x15803d,
      roughness: 0.68,
    });

    const root = new THREE.Group();

    const addWorkstation = (wx, wz, chairSide = 1) => {
      const g = new THREE.Group();
      g.position.set(wx, yBase, wz);

      // 1. Eman (Oak) stol usti (1.32 × 0.68 m, H = 0.74 m)
      const top = new THREE.Mesh(gg.box1, matOak);
      top.scale.set(1.32, 0.030, 0.68);
      top.position.y = 0.735;
      top.castShadow = true;
      top.receiveShadow = true;
      g.add(top);

      // 2. Loft П-simon qora metall oyoqlar
      for (const lx of [-0.60, 0.60]) {
        const leg = new THREE.Mesh(gg.box1, matDarkSteel);
        leg.scale.set(0.036, 0.72, 0.62);
        leg.position.set(lx, 0.36, 0);
        g.add(leg);
      }

      // 3. Orqa akustik yog'och-reykali peregorodka
      const screenZ = -chairSide * 0.315;
      const priv = new THREE.Mesh(gg.box1, matWalnut);
      priv.scale.set(1.26, 0.30, 0.022);
      priv.position.set(0, 0.89, screenZ);
      g.add(priv);

      // 4. Ikki-monitorli (2×27") Revit/CAD + Excel Spetsifikatsiya ish stansiyasi!
      const monZ = -chairSide * 0.14;
      const stand = new THREE.Mesh(gg.cyl14, matDarkSteel);
      stand.scale.set(0.018, 0.22, 0.018);
      stand.position.set(0, 0.86, monZ - chairSide * 0.05);
      g.add(stand);

      for (const [mx, yaw, scrMat] of [
        [-0.29, chairSide * 0.14, matCadScreen],
        [0.29, -chairSide * 0.14, matSpecScreen],
      ]) {
        const monGrp = new THREE.Group();
        monGrp.position.set(mx, 0.985, monZ);
        monGrp.rotation.y = yaw;
        const bezel = new THREE.Mesh(gg.box1, matDarkSteel);
        bezel.scale.set(0.56, 0.33, 0.018);
        const lcd = new THREE.Mesh(gg.box1, scrMat);
        lcd.scale.set(0.53, 0.30, 0.006);
        lcd.position.z = chairSide * 0.011;
        monGrp.add(bezel, lcd);
        g.add(monGrp);
      }

      // Klaviatura + sichqoncha
      const kb = new THREE.Mesh(gg.box1, lm.silverAlum);
      kb.scale.set(0.36, 0.010, 0.12);
      kb.position.set(-0.04, 0.755, chairSide * 0.12);
      const mouse = new THREE.Mesh(gg.box1, matDarkSteel);
      mouse.scale.set(0.06, 0.016, 0.10);
      mouse.position.set(0.24, 0.756, chairSide * 0.12);
      g.add(kb, mouse);

      // 5. Ergonomik aylanma ofis kreslosi
      const chZ = chairSide * 0.50;
      const chGrp = new THREE.Group();
      chGrp.position.set(0, 0, chZ);

      const gasLift = new THREE.Mesh(gg.cyl14, matDarkSteel);
      gasLift.scale.set(0.024, 0.38, 0.024);
      gasLift.position.y = 0.24;
      const baseStar = new THREE.Mesh(gg.cyl14, matDarkSteel);
      baseStar.scale.set(0.26, 0.03, 0.26);
      baseStar.position.y = 0.05;
      const seat = new THREE.Mesh(gg.box1, matChairMesh);
      seat.scale.set(0.47, 0.06, 0.45);
      seat.position.y = 0.45;
      const back = new THREE.Mesh(gg.box1, matChairMesh);
      back.scale.set(0.45, 0.52, 0.04);
      back.position.set(0, 0.74, chairSide * 0.21);
      chGrp.add(gasLift, baseStar, seat, back);

      for (const ax of [-0.24, 0.24]) {
        const arm = new THREE.Mesh(gg.box1, matDarkSteel);
        arm.scale.set(0.035, 0.18, 0.24);
        arm.position.set(ax, 0.56, 0);
        chGrp.add(arm);
      }
      g.add(chGrp);
      root.add(g);
    };

    // Yuqori qator: 4 ta loyihachi ish o'rni
    if (inf.upperRow?.xList) {
      for (const wx of inf.upperRow.xList) {
        addWorkstation(wx, inf.upperRow.y, inf.upperRow.chairSide || 1);
      }
    }

    // Pastki qo'shaloq (qarama-qarshi 8 kishilik) orol:
    if (inf.lowerDoubleRow?.xList) {
      const cy = inf.lowerDoubleRow.y;
      for (const wx of inf.lowerDoubleRow.xList) {
        addWorkstation(wx, cy - 0.35, -1);
        addWorkstation(wx, cy + 0.35, 1);
      }
    }

    // Arxiv va loyiha papkalari shkafi («Корона» ОВиК / ТМ papkalari bilan!)
    if (inf.cabinet) {
      const cb = inf.cabinet;
      const cabGrp = new THREE.Group();
      cabGrp.position.set(cb.x, yBase, cb.y);
      const carcass = new THREE.Mesh(gg.box1, matOak);
      carcass.scale.set(cb.wM, cb.hM, cb.dM);
      carcass.position.y = cb.hM * 0.5;
      carcass.castShadow = true;
      cabGrp.add(carcass);

      const binderMats = [
        new THREE.MeshStandardMaterial({ color: 0x0788f5, roughness: 0.5 }),
        new THREE.MeshStandardMaterial({ color: 0xff3445, roughness: 0.5 }),
        new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.5 }),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 }),
      ];
      for (let s = 0; s < 4; s++) {
        const sy = 0.52 + s * 0.42;
        const recess = new THREE.Mesh(gg.box1, matDarkSteel);
        recess.scale.set(cb.wM - 0.10, 0.34, 0.04);
        recess.position.set(0, sy, cb.dM * 0.49);
        cabGrp.add(recess);
        for (let b = 0; b < 9; b++) {
          const bx = -cb.wM * 0.40 + b * 0.15;
          const folder = new THREE.Mesh(gg.box1, binderMats[(s + b) % binderMats.length]);
          folder.scale.set(0.065, 0.29, 0.06);
          folder.position.set(bx, sy - 0.01, cb.dM * 0.50);
          cabGrp.add(folder);
        }
      }
      root.add(cabGrp);
    }

    // Dekorativ yashil fikus daraxti (kirish burchagida):
    if (inf.plant) {
      const pot = new THREE.Mesh(gg.cyl18, lm.porcelain);
      pot.scale.set(0.19, 0.36, 0.19);
      pot.position.set(inf.plant.x, yBase + 0.18, inf.plant.y);
      const stem = new THREE.Mesh(gg.cyl14, matWalnut);
      stem.scale.set(0.025, 0.95, 0.025);
      stem.position.set(inf.plant.x, yBase + 0.72, inf.plant.y);
      root.add(pot, stem);
      for (const [dx, dy, dz, r] of [
        [0, 1.18, 0, 0.28],
        [-0.14, 1.02, 0.10, 0.21],
        [0.15, 1.06, -0.09, 0.22],
      ]) {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), matLeaf);
        crown.position.set(inf.plant.x + dx, yBase + dy, inf.plant.y + dz);
        root.add(crown);
      }
    }

    // Kirish gilamchasi:
    if (inf.doormat) {
      const dm = new THREE.Mesh(gg.box1, matDarkSteel);
      dm.scale.set(inf.doormat.wM, 0.012, inf.doormat.dM);
      dm.position.set(inf.doormat.x, yBase + 0.015, inf.doormat.y);
      root.add(dm);
    }

    // O'ng devordagi zamonaviy akustik yog'och reykalar (Wood-Slat Accent Wall):
    if (inf.woodSlatWall) {
      const sw = inf.woodSlatWall;
      for (let wz = sw.y0; wz <= sw.y1; wz += 0.18) {
        const slat = new THREE.Mesh(gg.box1, matOak);
        slat.scale.set(0.026, Math.min(2.76, fullH - 0.24), 0.065);
        slat.position.set(sw.x, yBase + Math.min(2.76, fullH - 0.24) * 0.5 + 0.08, wz);
        root.add(slat);
      }
    }

    // Shiftga osilgan zamonaviy chiziqli LED chiroqlar (Linear Office Luminaires):
    if (Array.isArray(inf.ledLamps)) {
      const zLamp = yBase + Math.max(2.45, fullH - 0.34);
      const wireLen = Math.max(0.15, yBase + fullH - zLamp);
      for (const lp of inf.ledLamps) {
        const housing = new THREE.Mesh(gg.box1, matDarkSteel);
        housing.scale.set(lp.wM, 0.048, 0.068);
        housing.position.set(lp.x, zLamp, lp.y);
        const glow = new THREE.Mesh(gg.box1, matLedGlow);
        glow.scale.set(lp.wM - 0.02, 0.014, 0.056);
        glow.position.set(lp.x, zLamp - 0.024, lp.y);
        root.add(housing, glow);

        for (const wx of [lp.x - lp.wM * 0.38, lp.x + lp.wM * 0.38]) {
          const cable = new THREE.Mesh(gg.cyl14, lm.silverAlum);
          cable.scale.set(0.004, wireLen, 0.004);
          cable.position.set(wx, zLamp + wireLen * 0.5, lp.y);
          root.add(cable);
        }
      }
    }

    this.modelRoot.add(root);
  }

  _initFlowSimulationParticles() {
    if (!this.flowSegments.length) return;
    const count = Math.min(420, this.flowSegments.length * 2);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this._flowParticleMeta = [];

    for (let i = 0; i < count; i++) {
      const seg = this.flowSegments[i % this.flowSegments.length];
      const phase = Math.random();
      this._flowParticleMeta.push({ seg, phase, speed: 0.55 + (i % 5) * 0.12 });
      pos[i * 3] = seg.ax + (seg.bx - seg.ax) * phase;
      pos[i * 3 + 1] = seg.ay + (seg.by - seg.ay) * phase;
      pos[i * 3 + 2] = seg.az + (seg.bz - seg.az) * phase;
      col[i * 3] = seg.r;
      col[i * 3 + 1] = seg.g;
      col[i * 3 + 2] = seg.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.09,
      map: this._getFlowParticleCircleTex(),
      alphaTest: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
    });
    this.flowPointsMesh = new THREE.Points(geo, mat);
    this.flowPointsMesh.visible = Boolean(this.store.state.settings.flowSimEnabled);
    this.modelRoot.add(this.flowPointsMesh);
  }

  _stepFlowSimulation() {
    if (!this.flowPointsMesh || !this._flowParticleMeta?.length) return;
    const enabled = Boolean(this.store.state.settings.flowSimEnabled);
    this.flowPointsMesh.visible = enabled;
    if (!enabled) return;

    const posAttr = this.flowPointsMesh.geometry.getAttribute('position');
    const arr = posAttr.array;
    for (let i = 0; i < this._flowParticleMeta.length; i++) {
      const m = this._flowParticleMeta[i];
      m.phase = (m.phase + 0.014 * m.speed) % 1.0;
      const t = m.phase;
      arr[i * 3] = m.seg.ax + (m.seg.bx - m.seg.ax) * t;
      arr[i * 3 + 1] = m.seg.ay + (m.seg.by - m.seg.ay) * t;
      arr[i * 3 + 2] = m.seg.az + (m.seg.bz - m.seg.az) * t;
    }
    posAttr.needsUpdate = true;
  }

  _updateDollhouseVisibility() {
    if (!this.dollhouseWallEntries.length) return;
    const camPos = this.camera.position;
    for (const item of this.dollhouseWallEntries) {
      const toCamX = camPos.x - item.mx;
      const toCamZ = camPos.z - item.mz;
      const facingCam = toCamX * item.outNx + toCamZ * item.outNz > 0.35;
      item.fullGrp.visible = !facingCam;
      item.lowGrp.visible = facingCam;
    }
  }

  _stepWalkthrough() {
    if (!this.walkMode || !this.keysDown.size) return;
    const speed = 0.09;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const delta = new THREE.Vector3();
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) delta.addScaledVector(fwd, speed);
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) delta.addScaledVector(fwd, -speed);
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) delta.addScaledVector(right, speed);
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) delta.addScaledVector(right, -speed);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this._stepWalkthrough();
    this._stepFlowSimulation();
    this.controls.update();
    this._updateDollhouseVisibility();
    this.renderer.render(this.scene, this.camera);
  }
}
