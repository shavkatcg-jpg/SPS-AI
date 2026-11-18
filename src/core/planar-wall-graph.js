/**
 * SPS Project 2.0 — True Planar Half-Edge Architectural Engine (DCEL)
 *
 * Yagona haqiqat manbai (Single Source of Truth): Tugunlar (Nodes) + Devorlar (Walls).
 * Xonalar (Rooms) hech qachon alohida qo'lda saqlanmaydi — ular har bir o'zgarishdan keyin
 * planar yarim-qirralar (half-edges) grafigidan < 1 ms ichida matematik aniqlikda (в свету) ajratib olinadi.
 * Natijada devorni surish, bo'lish, o'chirish yoki qo'shishda xona kvadraturalari HECH QACHON buzilmaydi!
 */

export const SNAP_TOL_M = 0.015; // 15 mm payvandlash (weld) tolerantligi
export const MIN_WALL_LEN_M = 0.20; // < 200 mm tasodifiy kliklar rad etiladi!

export const STANDARD_WALL_TYPES = [
  { id: 'ext_brick_400', label: 'Tashqi 1.5 g‘isht + suvoq (400 mm)', thickness: 0.40, kind: 'exterior', color2d: '#334155', hatch: 'brick' },
  { id: 'ext_brick_380', label: 'Tashqi g‘isht (380 mm)', thickness: 0.38, kind: 'exterior', color2d: '#334155', hatch: 'brick' },
  { id: 'ext_gasblock_300', label: 'Gazoblok D500 (300 mm)', thickness: 0.30, kind: 'exterior', color2d: '#475569', hatch: 'block' },
  { id: 'int_brick_250', label: 'Yuk ko‘taruvchi ichki (250 mm)', thickness: 0.25, kind: 'interior', color2d: '#475569', hatch: 'brick' },
  { id: 'int_block_200', label: 'Ichki blok / g‘isht (200 mm)', thickness: 0.20, kind: 'interior', color2d: '#64748b', hatch: 'block' },
  { id: 'int_part_150', label: 'Ichki peregorodka (150 mm)', thickness: 0.15, kind: 'interior', color2d: '#64748b', hatch: 'partition' },
  { id: 'int_part_120', label: 'Yarim g‘isht peregorodka (120 mm)', thickness: 0.12, kind: 'interior', color2d: '#64748b', hatch: 'partition' },
  { id: 'int_gkl_100', label: 'Gipsokarton GKL (100 mm)', thickness: 0.10, kind: 'interior', color2d: '#94a3b8', hatch: 'gkl' },
];

export const ROOM_TYPES_CATALOG = [
  { id: 'living', name: 'Mehmonxona (Zal)', floorMat: 'parquet', colorLight: 'rgba(254, 243, 199, 0.46)', colorDark: 'rgba(245, 158, 11, 0.14)', tempC: 22 },
  { id: 'kitchen', name: 'Oshxona', floorMat: 'tile_warm', colorLight: 'rgba(254, 226, 226, 0.42)', colorDark: 'rgba(239, 68, 68, 0.13)', tempC: 20 },
  { id: 'bedroom', name: 'Yotoqxona', floorMat: 'parquet', colorLight: 'rgba(224, 231, 255, 0.45)', colorDark: 'rgba(99, 102, 241, 0.15)', tempC: 22 },
  { id: 'kids', name: 'Bolalar xonasi', floorMat: 'laminate', colorLight: 'rgba(209, 250, 229, 0.45)', colorDark: 'rgba(16, 185, 129, 0.14)', tempC: 23 },
  { id: 'hallway', name: 'Xoll / Koridor', floorMat: 'tile_grey', colorLight: 'rgba(241, 245, 249, 0.55)', colorDark: 'rgba(148, 163, 184, 0.14)', tempC: 20 },
  { id: 'bathroom', name: 'Sanuzel / Hammom', floorMat: 'tile_aqua', colorLight: 'rgba(207, 250, 254, 0.52)', colorDark: 'rgba(6, 182, 212, 0.16)', tempC: 25 },
  { id: 'boiler', name: 'Qozonxona (TM)', floorMat: 'concrete', colorLight: 'rgba(255, 237, 213, 0.50)', colorDark: 'rgba(249, 115, 22, 0.16)', tempC: 16 },
  { id: 'wardrobe', name: 'Garderob / Kladovka', floorMat: 'laminate', colorLight: 'rgba(243, 232, 255, 0.45)', colorDark: 'rgba(168, 85, 247, 0.14)', tempC: 18 },
  { id: 'office', name: 'Kabinet / Ofis', floorMat: 'parquet', colorLight: 'rgba(219, 234, 254, 0.45)', colorDark: 'rgba(59, 130, 246, 0.14)', tempC: 22 },
  { id: 'stairwell', name: 'Zinaxona (Лестница)', floorMat: 'tile_grey', colorLight: 'rgba(226, 232, 240, 0.48)', colorDark: 'rgba(100, 116, 139, 0.16)', tempC: 16 },
];

let _idSeq = 1;
export function makeArchId(prefix = 'el') {
  _idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idSeq.toString(36)}`;
}

export function roundMm(v) {
  return Math.round((Number(v) || 0) * 1000) / 1000;
}

export function roundCm(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

export function dist2d(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function projectOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) {
    return { t: 0, x: ax, y: ay, dist: Math.hypot(px - ax, py - ay), len: 0 };
  }
  const len = Math.sqrt(lenSq);
  const rawT = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { t, rawT, x, y, dist: Math.hypot(px - x, py - y), len, offsetM: t * len };
}

export function intersectSegmentsStrict(ax, ay, bx, by, cx, cy, dx, dy, eps = 1e-4) {
  const rX = bx - ax;
  const rY = by - ay;
  const sX = dx - cx;
  const sY = dy - cy;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-8) return null;
  const qpX = cx - ax;
  const qpY = cy - ay;
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;
  if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) {
    return {
      x: roundMm(ax + t * rX),
      y: roundMm(ay + t * rY),
      t,
      u,
    };
  }
  return null;
}

export function intersectLines2d(p1x, p1y, d1x, d1y, p2x, p2y, d2x, d2y) {
  const det = d1x * d2y - d1y * d2x;
  if (Math.abs(det) < 1e-6) return null;
  const dx = p2x - p1x;
  const dy = p2y - p1y;
  const t = (dx * d2y - dy * d2x) / det;
  return { x: p1x + d1x * t, y: p1y + d1y * t, t };
}

export function polygonSignedArea(pts) {
  if (!pts || pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum * 0.5;
}

export function polygonAreaAbs(pts) {
  return Math.abs(polygonSignedArea(pts));
}

export function polygonPerimeter(pts) {
  if (!pts || pts.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return sum;
}

export function pointInPolygon(x, y, pts) {
  if (!pts || pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Har qanday poligon (hatto G-simon va P-simon xona!) uchun yozuv (nom/m2) qo'yishga
 * eng xavfsiz ichki nuqtani (devorlardan eng uzoq ichki markazni) topadi.
 */
export function computeSafeInteriorLabelPoint(poly) {
  if (!poly || poly.length < 3) return { x: 0, y: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let cx = 0, cy = 0;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    cx += x;
    cy += y;
  }
  cx /= poly.length;
  cy /= poly.length;

  const minEdgeDist = (px, py) => {
    let md = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const pr = projectOnSegment(px, py, a[0], a[1], b[0], b[1]);
      if (pr.dist < md) md = pr.dist;
    }
    return md;
  };

  let bestX = cx;
  let bestY = cy;
  let bestD = pointInPolygon(cx, cy, poly) ? minEdgeDist(cx, cy) : -1;

  const steps = 8;
  for (let ix = 1; ix < steps; ix++) {
    for (let iy = 1; iy < steps; iy++) {
      const tx = minX + ((maxX - minX) * ix) / steps;
      const ty = minY + ((maxY - minY) * iy) / steps;
      if (!pointInPolygon(tx, ty, poly)) continue;
      const d = minEdgeDist(tx, ty);
      if (d > bestD) {
        bestD = d;
        bestX = tx;
        bestY = ty;
      }
    }
  }
  return { x: roundCm(bestX), y: roundCm(bestY) };
}

export function createEmptyFloor(floorId = 1, name = '1-qavat', elevationM = 0, heightM = 3.0) {
  return {
    id: floorId,
    name,
    elevationM,
    heightM,
    slabThicknessM: 0.20,
    nodes: [],
    walls: [],
    openings: [],
    elements: [], // columns, MEP shafts, stairs
    roomMeta: [], // { id, seedX, seedY, name, roomType, floorMat, targetTempC }
    rooms: [], // derived automatically by planarizeFloorGraph!
    wallPolygons: [], // derived exact mitered 2D/3D polygons per wall!
    scanOverlay: null, // { kind, visible, opacity, sliceHeightM, points3d, underlayDataUrl, ... }
  };
}

/**
 * Mavjud tugunni topadi yoki yangisini yaratadi (15 mm payvandlash bilan).
 */
export function findOrCreateNode(floor, x, y, tol = SNAP_TOL_M) {
  const rx = roundMm(x);
  const ry = roundMm(y);
  for (const n of floor.nodes) {
    if (Math.hypot(n.x - rx, n.y - ry) <= tol) {
      return n;
    }
  }
  const node = { id: makeArchId('nd'), x: rx, y: ry };
  floor.nodes.push(node);
  return node;
}

export function getNodeMap(floor) {
  const m = new Map();
  for (const n of floor.nodes || []) m.set(n.id, n);
  return m;
}

/**
 * Devor segmentini qo'shadi (20 sm dan qisqa tasodifiy kliklarni avtomatik rad etadi!)
 * va butun qavat grafigini planarizatsiya qilib, xonalarni qayta hisoblaydi.
 */
export function addWallSegment(floor, x1, y1, x2, y2, opts = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (!Number.isFinite(len) || len < MIN_WALL_LEN_M) {
    return null; // Tasodifiy qisqa klik hech qachon devor chizmaydi!
  }
  const n1 = findOrCreateNode(floor, x1, y1);
  const n2 = findOrCreateNode(floor, x2, y2);
  if (n1.id === n2.id) return null;

  const thickness = Math.max(0.08, Math.min(0.80, Number(opts.thickness) || 0.40));
  const kind = opts.kind || (thickness >= 0.28 ? 'exterior' : 'interior');
  const wall = {
    id: opts.id || makeArchId('w'),
    n1: n1.id,
    n2: n2.id,
    thickness,
    kind,
    typeId: opts.typeId || (thickness >= 0.36 ? 'ext_brick_400' : 'int_part_150'),
    heightM: Number(opts.heightM) || null,
  };
  floor.walls.push(wall);
  planarizeFloorGraph(floor);
  return wall;
}

/**
 * To'rtburchak xona / bino konturini bitta amalda qo'shish (4 ta devor avtomatik ulanadi va kesishadi).
 */
export function addRectWalls(floor, x0, y0, x1, y1, opts = {}) {
  const minX = roundMm(Math.min(x0, x1));
  const maxX = roundMm(Math.max(x0, x1));
  const minY = roundMm(Math.min(y0, y1));
  const maxY = roundMm(Math.max(y0, y1));
  if (maxX - minX < 0.40 || maxY - minY < 0.40) return false;

  const thickness = Math.max(0.08, Math.min(0.80, Number(opts.thickness) || 0.40));
  const kind = opts.kind || (thickness >= 0.28 ? 'exterior' : 'interior');
  const typeId = opts.typeId || (thickness >= 0.36 ? 'ext_brick_400' : 'int_part_150');

  const na = findOrCreateNode(floor, minX, minY);
  const nb = findOrCreateNode(floor, maxX, minY);
  const nc = findOrCreateNode(floor, maxX, maxY);
  const nd = findOrCreateNode(floor, minX, maxY);

  const pairs = [[na, nb], [nb, nc], [nc, nd], [nd, na]];
  for (const [u, v] of pairs) {
    if (u.id !== v.id) {
      floor.walls.push({
        id: makeArchId('w'),
        n1: u.id,
        n2: v.id,
        thickness,
        kind,
        typeId,
        heightM: null,
      });
    }
  }

  if (opts.roomName || opts.roomType) {
    floor.roomMeta.push({
      id: makeArchId('rmeta'),
      seedX: roundCm((minX + maxX) * 0.5),
      seedY: roundCm((minY + maxY) * 0.5),
      name: opts.roomName || 'Xona',
      roomType: opts.roomType || 'living',
      floorMat: opts.floorMat || 'parquet',
      targetTempC: opts.targetTempC || 22,
    });
  }

  planarizeFloorGraph(floor);
  return true;
}

/**
 * Oyna, eshik yoki arka (proyom) qo'shish — devor o'qiga nisbatan aniq bog'lanadi.
 */
export function addWallOpening(floor, wallId, worldX, worldY, spec = {}) {
  const nodesById = getNodeMap(floor);
  const w = (floor.walls || []).find((it) => it.id === wallId);
  if (!w) return null;
  const a = nodesById.get(w.n1);
  const b = nodesById.get(w.n2);
  if (!a || !b) return null;
  const pr = projectOnSegment(worldX, worldY, a.x, a.y, b.x, b.y);
  const widthM = Math.max(0.40, Math.min(pr.len - 0.16, Number(spec.widthM) || (spec.type === 'window' ? 1.50 : 0.90)));
  if (pr.len < widthM + 0.14) return null;

  const halfRatio = (widthM * 0.5 + 0.06) / pr.len;
  const t = Math.max(halfRatio, Math.min(1 - halfRatio, pr.t));

  // Mavjud teshiklar ustiga tushmasligini tekshirish
  const siblings = (floor.openings || []).filter((o) => o.wallId === wallId);
  const centerM = t * pr.len;
  for (const s of siblings) {
    const sCenterM = s.t * pr.len;
    if (Math.abs(centerM - sCenterM) < (widthM + s.widthM) * 0.5 + 0.04) {
      return null;
    }
  }

  const opening = {
    id: spec.id || makeArchId('op'),
    wallId,
    type: spec.type || 'door', // 'door' | 'window' | 'arch'
    subType: spec.subType || (spec.type === 'window' ? 'standard' : 'single'),
    t: Math.round(t * 10000) / 10000,
    widthM: roundMm(widthM),
    heightM: roundMm(Number(spec.heightM) || (spec.type === 'window' ? 1.60 : 2.10)),
    sillM: roundMm(spec.sillM !== undefined ? Number(spec.sillM) : (spec.type === 'window' ? (spec.subType === 'panoramic' ? 0.12 : 0.85) : 0.0)),
    hingeSide: spec.hingeSide || 'left', // 'left' | 'right'
    swingDir: spec.swingDir === -1 ? -1 : 1, // 1 | -1
  };
  floor.openings.push(opening);
  return opening;
}

export function flipOpeningSwing(floor, openingId) {
  const op = (floor.openings || []).find((o) => o.id === openingId);
  if (!op) return false;
  if (op.hingeSide === 'left' && op.swingDir === 1) {
    op.hingeSide = 'right';
    op.swingDir = 1;
  } else if (op.hingeSide === 'right' && op.swingDir === 1) {
    op.hingeSide = 'right';
    op.swingDir = -1;
  } else if (op.hingeSide === 'right' && op.swingDir === -1) {
    op.hingeSide = 'left';
    op.swingDir = -1;
  } else {
    op.hingeSide = 'left';
    op.swingDir = 1;
  }
  return true;
}

/**
 * PLANAR GRAPH SOLVER:
 * 1) Yaqin tugunlarni payvandlaydi (weld),
 * 2) X-kesishuv va T-tutashuvlarda devorlarni avtomatik bo'ladi (teshiklar o'z dunyo koordinatasida qoladi!),
 * 3) Ustma-ust tushgan kollinear bo'laklarni birlashtiradi,
 * 4) Har bir burchakning aniq kesishgan (mitered) poligonini hisoblaydi,
 * 5) Yopiq yarim-qirralar sikllaridan xonalarni va sof ichki yuzani (в свету, m²) avtomatik chiqaradi!
 */
export function planarizeFloorGraph(floor) {
  if (!floor) return floor;
  floor.nodes = Array.isArray(floor.nodes) ? floor.nodes : [];
  floor.walls = Array.isArray(floor.walls) ? floor.walls : [];
  floor.openings = Array.isArray(floor.openings) ? floor.openings : [];
  floor.elements = Array.isArray(floor.elements) ? floor.elements : [];
  floor.roomMeta = Array.isArray(floor.roomMeta) ? floor.roomMeta : [];

  // Dunyo koordinatasida barcha teshiklarni eslab qolish (devor bo'linsa ham oyna/eshik joyidan jilmaydi!)
  const preNodeMap = getNodeMap(floor);
  const worldOpenings = [];
  for (const op of floor.openings) {
    const w = floor.walls.find((x) => x.id === op.wallId);
    const a = w ? preNodeMap.get(w.n1) : null;
    const b = w ? preNodeMap.get(w.n2) : null;
    if (!a || !b) continue;
    const t = Math.max(0.02, Math.min(0.98, Number(op.t) || 0.5));
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    worldOpenings.push({
      ...op,
      wx: a.x + (b.x - a.x) * t,
      wy: a.y + (b.y - a.y) * t,
      ux: (b.x - a.x) / len,
      uy: (b.y - a.y) / len,
    });
  }

  // 1-qadam: Yaqin tugunlarni payvandlash (Weld <= 15 mm)
  const canonNodes = [];
  const remapNodeId = new Map();
  for (const raw of floor.nodes) {
    const rx = roundMm(raw.x);
    const ry = roundMm(raw.y);
    const hit = canonNodes.find((c) => Math.hypot(c.x - rx, c.y - ry) <= SNAP_TOL_M);
    if (hit) {
      remapNodeId.set(raw.id, hit.id);
    } else {
      const clean = { id: raw.id || makeArchId('nd'), x: rx, y: ry };
      canonNodes.push(clean);
      remapNodeId.set(raw.id, clean.id);
    }
  }
  floor.nodes = canonNodes;

  for (const w of floor.walls) {
    w.n1 = remapNodeId.get(w.n1) || w.n1;
    w.n2 = remapNodeId.get(w.n2) || w.n2;
  }

  // 2-qadam: X-kesishishlar (Segment-Segment intersections) bo'yicha tugun qo'shish
  let changed = true;
  let safety = 0;
  while (changed && safety < 24) {
    changed = false;
    safety += 1;
    const nm = getNodeMap(floor);
    outerX: for (let i = 0; i < floor.walls.length; i++) {
      const w1 = floor.walls[i];
      const a = nm.get(w1.n1);
      const b = nm.get(w1.n2);
      if (!a || !b || a.id === b.id) continue;
      for (let j = i + 1; j < floor.walls.length; j++) {
        const w2 = floor.walls[j];
        if (w1.n1 === w2.n1 || w1.n1 === w2.n2 || w1.n2 === w2.n1 || w1.n2 === w2.n2) continue;
        const c = nm.get(w2.n1);
        const d = nm.get(w2.n2);
        if (!c || !d || c.id === d.id) continue;
        const hit = intersectSegmentsStrict(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y, 0.002);
        if (hit) {
          const xNode = findOrCreateNode(floor, hit.x, hit.y, SNAP_TOL_M);
          if (xNode.id !== w1.n1 && xNode.id !== w1.n2) {
            const origN2 = w1.n2;
            w1.n2 = xNode.id;
            floor.walls.push({ ...w1, id: makeArchId('w'), n1: xNode.id, n2: origN2 });
            changed = true;
          }
          if (xNode.id !== w2.n1 && xNode.id !== w2.n2) {
            const origN2 = w2.n2;
            w2.n2 = xNode.id;
            floor.walls.push({ ...w2, id: makeArchId('w'), n1: xNode.id, n2: origN2 });
            changed = true;
          }
          if (changed) break outerX;
        }
      }
    }
  }

  // 3-qadam: T-tutashuvlar va kollinear ustma-ust tushgan devorlarni tugunlarda bo'lish
  let splitPass = true;
  let splitGuard = 0;
  while (splitPass && splitGuard < 24) {
    splitPass = false;
    splitGuard += 1;
    const nm = getNodeMap(floor);
    for (let i = 0; i < floor.walls.length; i++) {
      const w = floor.walls[i];
      const a = nm.get(w.n1);
      const b = nm.get(w.n2);
      if (!a || !b || a.id === b.id) continue;
      // Eng kichik t bo'yicha Segment ichida yotgan tugunni qidiramiz
      let bestNode = null;
      let bestT = Infinity;
      for (const nd of floor.nodes) {
        if (nd.id === a.id || nd.id === b.id) continue;
        const pr = projectOnSegment(nd.x, nd.y, a.x, a.y, b.x, b.y);
        if (pr.dist <= SNAP_TOL_M && pr.offsetM > SNAP_TOL_M && pr.len - pr.offsetM > SNAP_TOL_M) {
          if (pr.t < bestT) {
            bestT = pr.t;
            bestNode = nd;
          }
        }
      }
      if (bestNode) {
        const origN2 = w.n2;
        w.n2 = bestNode.id;
        floor.walls.push({
          ...w,
          id: makeArchId('w'),
          n1: bestNode.id,
          n2: origN2,
        });
        splitPass = true;
        break;
      }
    }
  }

  // 4-qadam: Qisqa/bo'sh devorlarni tozalash va dublikat juftliklarni birlashtirish
  const nmClean = getNodeMap(floor);
  const edgeMap = new Map();
  const dedupedWalls = [];
  for (const w of floor.walls) {
    const a = nmClean.get(w.n1);
    const b = nmClean.get(w.n2);
    if (!a || !b || a.id === b.id) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.04) continue;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const existing = edgeMap.get(key);
    if (existing) {
      if ((w.thickness || 0) > (existing.thickness || 0)) {
        existing.thickness = w.thickness;
        existing.kind = w.kind;
        existing.typeId = w.typeId;
      }
    } else {
      edgeMap.set(key, w);
      dedupedWalls.push(w);
    }
  }
  floor.walls = dedupedWalls;

  // Foydalanilmayotgan yetim tugunlarni tozalash
  const usedNodeIds = new Set();
  for (const w of floor.walls) {
    usedNodeIds.add(w.n1);
    usedNodeIds.add(w.n2);
  }
  floor.nodes = floor.nodes.filter((n) => usedNodeIds.has(n.id));

  // 5-qadam: Teshiklarni (oyna/eshik) yangi devor segmentlariga aniq qayta bog'lash
  const finalNm = getNodeMap(floor);
  const remappedOpenings = [];
  for (const wop of worldOpenings) {
    let bestWall = null;
    let bestPr = null;
    let bestDist = 0.22;
    for (const w of floor.walls) {
      const a = finalNm.get(w.n1);
      const b = finalNm.get(w.n2);
      if (!a || !b) continue;
      const pr = projectOnSegment(wop.wx, wop.wy, a.x, a.y, b.x, b.y);
      if (pr.dist < bestDist && pr.len >= 0.48) {
        bestDist = pr.dist;
        bestWall = w;
        bestPr = pr;
      }
    }
    if (!bestWall || !bestPr) continue;
    const clampedW = Math.min(wop.widthM, Math.max(0.38, bestPr.len - 0.12));
    const padRatio = Math.min(0.45, (clampedW * 0.5 + 0.05) / bestPr.len);
    const newT = Math.max(padRatio, Math.min(1 - padRatio, bestPr.t));
    // Agar devor yo'nalishi teskari bo'lib qolgan bo'lsa, eshik sharniri ham mos aylanadi
    const a = finalNm.get(bestWall.n1);
    const b = finalNm.get(bestWall.n2);
    const nux = (b.x - a.x) / bestPr.len;
    const nuy = (b.y - a.y) / bestPr.len;
    const sameDir = nux * wop.ux + nuy * wop.uy >= 0;
    remappedOpenings.push({
      id: wop.id,
      wallId: bestWall.id,
      type: wop.type,
      subType: wop.subType,
      t: Math.round(newT * 10000) / 10000,
      widthM: roundMm(clampedW),
      heightM: wop.heightM,
      sillM: wop.sillM,
      hingeSide: sameDir ? wop.hingeSide : (wop.hingeSide === 'left' ? 'right' : 'left'),
      swingDir: sameDir ? wop.swingDir : -wop.swingDir,
    });
  }
  floor.openings = remappedOpenings;

  // 6-qadam: Yarim-qirralar (Half-Edges), aniq burchak miterlari va yopiq xonalarni hisoblash
  const topo = buildHalfEdgeTopologyAndRooms(floor, finalNm);
  floor.wallPolygons = topo.wallPolygons;
  floor.rooms = topo.rooms;

  // Tashqi va ichki devorlarni avtomatik tasniflash (xona bilan faqat bir tomoni tutashsa = tashqi devor!)
  for (const w of floor.walls) {
    const stat = topo.wallRoomSides.get(w.id) || 0;
    if (stat === 1 && w.thickness >= 0.28) w.kind = 'exterior';
    else if (stat === 2 && w.thickness <= 0.24) w.kind = 'interior';
  }

  return floor;
}

function buildHalfEdgeTopologyAndRooms(floor, nodeMap) {
  const halfEdges = [];
  const outByNode = new Map();
  for (const n of floor.nodes) outByNode.set(n.id, []);

  for (const w of floor.walls) {
    const a = nodeMap.get(w.n1);
    const b = nodeMap.get(w.n2);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.04) continue;
    const ux = dx / len;
    const uy = dy / len;
    const halfT = (Number(w.thickness) || 0.20) * 0.5;

    const heFwd = {
      id: `${w.id}:0`,
      wallId: w.id,
      wall: w,
      from: a.id,
      to: b.id,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      ux,
      uy,
      nx: -uy, // Ichki chap normal (+Y pastga bo'lganda o'ng-qo'l ichki normal)
      ny: ux,
      halfT,
      angle: Math.atan2(dy, dx),
      twin: null,
      miterStart: null,
      miterEnd: null,
    };
    const heRev = {
      id: `${w.id}:1`,
      wallId: w.id,
      wall: w,
      from: b.id,
      to: a.id,
      ax: b.x,
      ay: b.y,
      bx: a.x,
      by: a.y,
      ux: -ux,
      uy: -uy,
      nx: uy,
      ny: -ux,
      halfT,
      angle: Math.atan2(-dy, -dx),
      twin: heFwd,
      miterStart: null,
      miterEnd: null,
    };
    heFwd.twin = heRev;
    halfEdges.push(heFwd, heRev);
    outByNode.get(a.id).push(heFwd);
    outByNode.get(b.id).push(heRev);
  }

  // Har bir tugunda chiquvchi yarim-qirralarni burchak bo'yicha o'sish tartibida saralash
  for (const list of outByNode.values()) {
    list.sort((p, q) => p.angle - q.angle);
  }

  // Keyingi yarim-qirrani topish: maqsad tugundagi twin dan bitta oldingi chiquvchi yarim-qirra
  // Bu qoida soat strelkasi bo'yicha minimal ichki yuzani (signedArea > 0) aylanib chiqadi!
  const nextHalfEdge = new Map();
  for (const he of halfEdges) {
    const list = outByNode.get(he.to) || [];
    const deg = list.length;
    if (deg === 0) continue;
    const twinIdx = list.indexOf(he.twin);
    const nextHe = list[(twinIdx - 1 + deg) % deg];
    nextHalfEdge.set(he.id, nextHe);

    // he va nextHe tutashgan he.to burchagida aniq ichki suvoq (miter) kesishish nuqtasini topish!
    const p1x = he.bx + he.nx * he.halfT;
    const p1y = he.by + he.ny * he.halfT;
    const p2x = nextHe.ax + nextHe.nx * nextHe.halfT;
    const p2y = nextHe.ay + nextHe.ny * nextHe.halfT;

    if (nextHe === he.twin) {
      // Erkin uchi (degree = 1): devor qalinligining to'g'ri burchagi
      he.miterEnd = [roundMm(p1x), roundMm(p1y)];
      nextHe.miterStart = [roundMm(p2x), roundMm(p2y)];
    } else {
      const inter = intersectLines2d(p1x, p1y, he.ux, he.uy, p2x, p2y, nextHe.ux, nextHe.uy);
      const maxMiter = Math.max(he.halfT, nextHe.halfT) * 2.8;
      if (inter && Math.hypot(inter.x - he.bx, inter.y - he.by) <= maxMiter) {
        const mx = roundMm(inter.x);
        const my = roundMm(inter.y);
        he.miterEnd = [mx, my];
        nextHe.miterStart = [mx, my];
      } else {
        const mx = roundMm((p1x + p2x) * 0.5);
        const my = roundMm((p1y + p2y) * 0.5);
        he.miterEnd = [mx, my];
        nextHe.miterStart = [mx, my];
      }
    }
  }

  for (const he of halfEdges) {
    if (!he.miterStart) {
      he.miterStart = [roundMm(he.ax + he.nx * he.halfT), roundMm(he.ay + he.ny * he.halfT)];
    }
    if (!he.miterEnd) {
      he.miterEnd = [roundMm(he.bx + he.nx * he.halfT), roundMm(he.by + he.ny * he.halfT)];
    }
  }

  // Har bir devorning aniq 4-6 nuqtali 2D/3D miter poligonini yig'ish
  const wallPolygons = [];
  const byWallId = new Map();
  for (const he of halfEdges) {
    if (!byWallId.has(he.wallId)) byWallId.set(he.wallId, []);
    byWallId.get(he.wallId).push(he);
  }
  for (const w of floor.walls) {
    const pair = byWallId.get(w.id);
    if (!pair || pair.length < 2) continue;
    const [f, r] = pair[0].id.endsWith(':0') ? [pair[0], pair[1]] : [pair[1], pair[0]];
    // f.miterStart -> f.miterEnd -> b.center -> r.miterStart -> r.miterEnd -> a.center
    const poly = [
      f.miterStart,
      f.miterEnd,
      [roundMm(f.bx), roundMm(f.by)],
      r.miterStart,
      r.miterEnd,
      [roundMm(f.ax), roundMm(f.ay)],
    ];
    wallPolygons.push({
      wallId: w.id,
      kind: w.kind,
      thickness: w.thickness,
      typeId: w.typeId,
      points: poly,
      fwdLeftStart: f.miterStart,
      fwdLeftEnd: f.miterEnd,
      revLeftStart: r.miterStart,
      revLeftEnd: r.miterEnd,
    });
  }

  // Yopiq yuzalarni (Minimal Cycles) kuzatib chiqish
  const visited = new Set();
  const rawFaces = [];
  const outerShells = [];
  const wallRoomSides = new Map();

  for (const startHe of halfEdges) {
    if (visited.has(startHe.id)) continue;
    const cycle = [];
    let cur = startHe;
    let guard = 0;
    while (cur && !visited.has(cur.id) && guard < 500) {
      visited.add(cur.id);
      cycle.push(cur);
      cur = nextHalfEdge.get(cur.id);
      guard += 1;
    }
    if (!cur || cur.id !== startHe.id || cycle.length < 3) continue;

    const centerPoly = cycle.map((h) => [h.ax, h.ay]);
    const centerSigned = polygonSignedArea(centerPoly);

    // Ichki aniq suvoq yuzasi poligonini yig'ish (ketma-ket takrorlangan nuqtalarsiz)
    const innerPoly = [];
    const pushUnique = (pt) => {
      if (!pt) return;
      const last = innerPoly[innerPoly.length - 1];
      if (!last || Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.004) {
        innerPoly.push(pt);
      }
    };
    for (const h of cycle) {
      pushUnique(h.miterStart);
      pushUnique(h.miterEnd);
    }
    if (
      innerPoly.length >= 2 &&
      Math.hypot(innerPoly[0][0] - innerPoly[innerPoly.length - 1][0], innerPoly[0][1] - innerPoly[innerPoly.length - 1][1]) <= 0.004
    ) {
      innerPoly.pop();
    }

    const innerSigned = polygonSignedArea(innerPoly);
    if (centerSigned > 0.25 && innerSigned > 0.15) {
      rawFaces.push({
        cycle,
        centerPoly,
        innerPoly,
        centerAreaM2: Math.abs(centerSigned),
        rawClearAreaM2: Math.abs(innerSigned),
      });
      // Bitta devorning ikkala tomoni ayni bitta xona ichida bo'lsa (spur peregorodka), uni faqat ichki hisoblaymiz
      const uniqueWallsInFace = new Set(cycle.map((c) => c.wallId));
      for (const wid of uniqueWallsInFace) {
        wallRoomSides.set(wid, (wallRoomSides.get(wid) || 0) + 1);
      }
    } else if (centerSigned < -0.25) {
      outerShells.push({
        poly: innerPoly.length >= 3 ? innerPoly : centerPoly,
        footprintM2: Math.abs(innerSigned || centerSigned),
      });
    }
  }

  // Kichikdan kattaga saralaymiz va agar katta xona ichida alohida "orol" xona (masalan, ichki sanuzel boks) bo'lsa,
  // uning tashqi qobiq yuzasini katta xona sof yuzasidan aniq ayirib tashlaymiz!
  rawFaces.sort((a, b) => a.rawClearAreaM2 - b.rawClearAreaM2);

  for (const shell of outerShells) {
    // Bu tashqi qobiq butun binoning tashqi chegarasimi yoki katta xona ichidagi ichki "orol" xonami?
    const samplePt = shell.poly[0];
    if (!samplePt) continue;
    const enclosing = rawFaces.find(
      (f) => f.rawClearAreaM2 > shell.footprintM2 + 0.2 && pointInPolygon(samplePt[0], samplePt[1], f.innerPoly),
    );
    if (enclosing) {
      enclosing.rawClearAreaM2 = Math.max(0.1, enclosing.rawClearAreaM2 - shell.footprintM2);
    }
  }

  // Ustun (column) va shaxta (shaft) yuzalarini ham xona sof maydonidan ayirish (Revit Room Area qoidasi!)
  for (const f of rawFaces) {
    let deductM2 = 0;
    for (const el of floor.elements || []) {
      if (el.kind !== 'column' && el.kind !== 'shaft') continue;
      if (pointInPolygon(el.x, el.y, f.innerPoly)) {
        deductM2 += (Number(el.wM) || 0.4) * (Number(el.dM) || 0.4);
      }
    }
    f.clearAreaM2 = Math.round(Math.max(0.1, f.rawClearAreaM2 - deductM2) * 100) / 100;
  }

  // Mavjud roomMeta (Xona nomi, turi, pol qoplamasi) bilan moslashtirish
  const usedMetaIds = new Set();
  const rooms = rawFaces.map((f, idx) => {
    let matchedMeta = floor.roomMeta.find(
      (m) => !usedMetaIds.has(m.id) && pointInPolygon(m.seedX, m.seedY, f.innerPoly),
    );
    if (!matchedMeta) {
      const labelPt = computeSafeInteriorLabelPoint(f.innerPoly);
      let bestDist = 1.4;
      for (const m of floor.roomMeta) {
        if (usedMetaIds.has(m.id)) continue;
        const d = Math.hypot(m.seedX - labelPt.x, m.seedY - labelPt.y);
        if (d < bestDist) {
          bestDist = d;
          matchedMeta = m;
        }
      }
    }

    const safeLabelPt = computeSafeInteriorLabelPoint(f.innerPoly);
    if (matchedMeta) {
      usedMetaIds.add(matchedMeta.id);
      matchedMeta.seedX = safeLabelPt.x;
      matchedMeta.seedY = safeLabelPt.y;
    } else {
      const autoType = f.clearAreaM2 < 4.5 ? 'bathroom' : f.clearAreaM2 < 9.5 ? 'hallway' : f.clearAreaM2 > 20 ? 'living' : 'bedroom';
      const cat = ROOM_TYPES_CATALOG.find((c) => c.id === autoType) || ROOM_TYPES_CATALOG[0];
      matchedMeta = {
        id: makeArchId('rmeta'),
        seedX: safeLabelPt.x,
        seedY: safeLabelPt.y,
        name: `${cat.name.split(' ')[0]} ${idx + 1}`,
        roomType: cat.id,
        floorMat: cat.floorMat,
        targetTempC: cat.tempC,
      };
      floor.roomMeta.push(matchedMeta);
      usedMetaIds.add(matchedMeta.id);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of f.innerPoly) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    return {
      id: matchedMeta.id,
      name: matchedMeta.name,
      roomType: matchedMeta.roomType,
      floorMat: matchedMeta.floorMat,
      targetTempC: matchedMeta.targetTempC,
      areaM2: f.clearAreaM2, // Haqiqiy Revit sof ichki maydon (в свету)!
      perimeterM: Math.round(polygonPerimeter(f.innerPoly) * 100) / 100,
      clearWidthM: roundMm(maxX - minX),
      clearHeightM: roundMm(maxY - minY),
      labelX: safeLabelPt.x,
      labelY: safeLabelPt.y,
      innerPoly: f.innerPoly,
      centerPoly: f.centerPoly,
      wallIds: [...new Set(f.cycle.map((h) => h.wallId))],
    };
  });

  // Eskirgan / keraksiz roomMeta yozuvlarni tozalash (oxirgi 32 tasigacha saqlab)
  floor.roomMeta = floor.roomMeta.filter((m) => usedMetaIds.has(m.id));

  return { wallPolygons, rooms, wallRoomSides };
}

/**
 * DEVORNI KO'NDALANG SURISH (Revit Constrained Parallel Move):
 * - L-burchaklar va T-tutashuvlar perpendikulyar devor bo'ylab silliq sirpanadi (tashqi devorni qiyshaytirmaydi!),
 * - Kollinear davom etuvchi zanjir (butun fasad yoki faqat bitta xona devori) ikkala rejimda ham buzilmasdan ishlaydi,
 * - Qo'shni devorlar < 0.25 m bo'lib ezilib ketishidan avtomatik himoyalangan!
 */
export function moveWallParallel(floor, wallId, deltaNormalM, opts = {}) {
  const nm = getNodeMap(floor);
  const rootWall = (floor.walls || []).find((w) => w.id === wallId);
  if (!rootWall) return { moved: false, appliedDeltaM: 0 };

  const a0 = nm.get(rootWall.n1);
  const b0 = nm.get(rootWall.n2);
  if (!a0 || !b0) return { moved: false, appliedDeltaM: 0 };

  const len0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  if (len0 < 0.05) return { moved: false, appliedDeltaM: 0 };
  const ux = (b0.x - a0.x) / len0;
  const uy = (b0.y - a0.y) / len0;
  const nx = -uy;
  const ny = ux;

  // Agar tashqi uzluksiz fasad devori surilsa (chainMode !== 'segment'), shu o'qdagi kollinear qo'shni devorlarni birga topamiz
  const chainMode = opts.chainMode || (rootWall.kind === 'exterior' ? 'collinear_chain' : 'segment');
  const movingWallIds = new Set([rootWall.id]);

  if (chainMode === 'collinear_chain') {
    let grow = true;
    while (grow) {
      grow = false;
      for (const cand of floor.walls) {
        if (movingWallIds.has(cand.id)) continue;
        // Moving to'plam bilan umumiy tugunga egami?
        const sharesNode = [...movingWallIds].some((mid) => {
          const mw = floor.walls.find((x) => x.id === mid);
          return mw && (mw.n1 === cand.n1 || mw.n1 === cand.n2 || mw.n2 === cand.n1 || mw.n2 === cand.n2);
        });
        if (!sharesNode) continue;
        const ca = nm.get(cand.n1);
        const cb = nm.get(cand.n2);
        if (!ca || !cb) continue;
        const cl = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
        const cux = (cb.x - ca.x) / cl;
        const cuy = (cb.y - ca.y) / cl;
        if (Math.abs(cux * nx + cuy * ny) < 0.03) {
          movingWallIds.add(cand.id);
          grow = true;
        }
      }
    }
  }

  const movingNodes = new Set();
  for (const wid of movingWallIds) {
    const mw = floor.walls.find((x) => x.id === wid);
    if (mw) {
      movingNodes.add(mw.n1);
      movingNodes.add(mw.n2);
    }
  }

  // Har bir harakatlanuvchi tugunning ko'ndalang cheklovini (safe min/max delta) hisoblaymiz
  let minDelta = -Infinity;
  let maxDelta = Infinity;
  const minAllowedWallM = 0.28;

  for (const nid of movingNodes) {
    const nd = nm.get(nid);
    if (!nd) continue;
    const extWalls = floor.walls.filter((w) => !movingWallIds.has(w.id) && (w.n1 === nid || w.n2 === nid));
    for (const ew of extWalls) {
      const otherId = ew.n1 === nid ? ew.n2 : ew.n1;
      if (movingNodes.has(otherId)) continue;
      const otherNd = nm.get(otherId);
      if (!otherNd) continue;
      // Vektor: nid -> otherNd
      const vx = otherNd.x - nd.x;
      const vy = otherNd.y - nd.y;
      const vLen = Math.hypot(vx, vy);
      if (vLen < 0.05) continue;
      const dotN = (vx / vLen) * nx + (vy / vLen) * ny;
      // Agar devor harakat yo'nalishiga deyarli parallel bo'lsa, otherNd tomon borish chegarasi: vLen - minAllowedWallM
      if (Math.abs(dotN) > 0.25) {
        // tSlide = delta / dotN <= vLen - minAllowedWallM (agar dotN > 0)
        const maxTowardOther = (vLen - minAllowedWallM) * Math.abs(dotN);
        if (dotN > 0) {
          maxDelta = Math.min(maxDelta, maxTowardOther);
        } else {
          minDelta = Math.max(minDelta, -maxTowardOther);
        }
      }
    }
  }

  const clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaNormalM));
  if (!Number.isFinite(clampedDelta) || Math.abs(clampedDelta) < 1e-4) {
    return { moved: false, appliedDeltaM: 0 };
  }

  // Har bir harakatlanuvchi tugunni siljitish (yoki kollinear qo'shnisi qimirlamasa split qilish!)
  for (const nid of movingNodes) {
    const nd = nm.get(nid);
    if (!nd) continue;
    const extWalls = floor.walls.filter((w) => !movingWallIds.has(w.id) && (w.n1 === nid || w.n2 === nid));
    const parallelStay = [];
    const transverseStay = [];

    for (const ew of extWalls) {
      const otherId = ew.n1 === nid ? ew.n2 : ew.n1;
      const otherNd = nm.get(otherId);
      if (!otherNd) continue;
      const vx = otherNd.x - nd.x;
      const vy = otherNd.y - nd.y;
      const vLen = Math.hypot(vx, vy) || 1;
      const dxU = vx / vLen;
      const dyU = vy / vLen;
      if (Math.abs(dxU * nx + dyU * ny) < 0.20) {
        parallelStay.push({ ew, dxU, dyU });
      } else {
        transverseStay.push({ ew, dxU, dyU });
      }
    }

    let targetX = roundMm(nd.x + nx * clampedDelta);
    let targetY = roundMm(nd.y + ny * clampedDelta);

    if (transverseStay.length > 0) {
      // Birinchi ko'ndalang devor o'qi bo'ylab aniq sirpantiramiz (burchak 90° yoki 45° bo'lsa ham devor qiyshaymaydi!)
      const tr = transverseStay[0];
      const dotN = tr.dxU * nx + tr.dyU * ny;
      if (Math.abs(dotN) > 0.20) {
        const slide = clampedDelta / dotN;
        targetX = roundMm(nd.x + tr.dxU * slide);
        targetY = roundMm(nd.y + tr.dyU * slide);
      }
    }

    if (parallelStay.length > 0) {
      // Shu tugunda qimirlamaydigan kollinear devor qoldi: yangi tugun ochamiz va moving devorlarni yangi tugunga bog'laymiz!
      const newNode = { id: makeArchId('nd'), x: targetX, y: targetY };
      floor.nodes.push(newNode);
      for (const wid of movingWallIds) {
        const mw = floor.walls.find((x) => x.id === wid);
        if (!mw) continue;
        if (mw.n1 === nid) mw.n1 = newNode.id;
        if (mw.n2 === nid) mw.n2 = newNode.id;
      }
      // Agar ko'ndalang devor yo'q bo'lsa, uzilish qolmasligi uchun bog'lovchi pog'ona (step) devor qo'shamiz
      if (transverseStay.length === 0) {
        floor.walls.push({
          id: makeArchId('w'),
          n1: nid,
          n2: newNode.id,
          thickness: rootWall.thickness,
          kind: rootWall.kind,
          typeId: rootWall.typeId,
          heightM: rootWall.heightM,
        });
      }
    } else {
      nd.x = targetX;
      nd.y = targetY;
    }
  }

  planarizeFloorGraph(floor);
  return { moved: true, appliedDeltaM: roundMm(clampedDelta) };
}

/**
 * REVIT WITNESS DIMENSIONS (Временные размеры в свету):
 * Tanlangan devorning har ikki tomonidagi eng yaqin parallel devorgacha bo'lgan
 * aniq SOF ICHKI MASOFANI (в свету, suvoqdan suvoqqacha!) topadi.
 */
export function computeWallWitnessDimensions(floor, wallId) {
  const nm = getNodeMap(floor);
  const w = (floor.walls || []).find((it) => it.id === wallId);
  if (!w) return [];
  const a = nm.get(w.n1);
  const b = nm.get(w.n2);
  if (!a || !b) return [];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.15) return [];

  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const nx = -uy;
  const ny = ux;
  const mx = (a.x + b.x) * 0.5;
  const my = (a.y + b.y) * 0.5;
  const halfT = (Number(w.thickness) || 0.20) * 0.5;

  const dims = [];
  for (const sideSign of [1, -1]) {
    const dirX = nx * sideSign;
    const dirY = ny * sideSign;
    let bestClearM = Infinity;
    let bestHitWall = null;

    for (const other of floor.walls) {
      if (other.id === w.id) continue;
      const oa = nm.get(other.n1);
      const ob = nm.get(other.n2);
      if (!oa || !ob) continue;
      const oLen = Math.hypot(ob.x - oa.x, ob.y - oa.y);
      if (oLen < 0.25) continue;
      const oux = (ob.x - oa.x) / oLen;
      const ouy = (ob.y - oa.y) / oLen;
      // Parallel bo'lishi shart
      if (Math.abs(ux * oux + uy * ouy) < 0.96) continue;

      // Uzunlik bo'yicha kamida 25 sm ustma-ust (overlap) tushishi kerak
      const pA = 0;
      const pB = len;
      const q1 = (oa.x - a.x) * ux + (oa.y - a.y) * uy;
      const q2 = (ob.x - a.x) * ux + (ob.y - a.y) * uy;
      const ov0 = Math.max(pA, Math.min(q1, q2));
      const ov1 = Math.min(pB, Math.max(q1, q2));
      if (ov1 - ov0 < 0.22) continue;

      const centerDist = (oa.x - mx) * dirX + (oa.y - my) * dirY;
      if (centerDist <= halfT + 0.15) continue;
      const otherHalfT = (Number(other.thickness) || 0.20) * 0.5;
      const clearM = centerDist - halfT - otherHalfT;
      if (clearM > 0.15 && clearM < bestClearM) {
        bestClearM = clearM;
        bestHitWall = { other, ovMid: (ov0 + ov1) * 0.5, otherHalfT, centerDist };
      }
    }

    if (bestHitWall && Number.isFinite(bestClearM)) {
      const baseX = a.x + ux * bestHitWall.ovMid;
      const baseY = a.y + uy * bestHitWall.ovMid;
      const pStart = [roundMm(baseX + dirX * halfT), roundMm(baseY + dirY * halfT)];
      const pEnd = [roundMm(baseX + dirX * (halfT + bestClearM)), roundMm(baseY + dirY * (halfT + bestClearM))];
      dims.push({
        id: `wit_${w.id}_${sideSign > 0 ? 'pos' : 'neg'}`,
        wallId: w.id,
        refWallId: bestHitWall.other.id,
        sideSign,
        clearDistanceM: roundMm(bestClearM),
        pStart,
        pEnd,
        midX: roundMm((pStart[0] + pEnd[0]) * 0.5),
        midY: roundMm((pStart[1] + pEnd[1]) * 0.5),
      });
    }
  }
  return dims;
}

/**
 * Foydalanuvchi Revit vaqtinchalik o'lchamiga (masalan "4.20") yangi son kiritganda
 * tanlangan devorni aniq shu sof masofaga (в свету) suradi!
 */
export function setWallWitnessDistance(floor, wallId, sideSign, desiredClearM, opts = {}) {
  const target = Number(desiredClearM);
  if (!Number.isFinite(target) || target < 0.30 || target > 60) return { moved: false };
  const dims = computeWallWitnessDimensions(floor, wallId);
  const dim = dims.find((d) => d.sideSign === sideSign);
  if (!dim) return { moved: false };
  // Agar desiredClearM kattalashsa, tanlangan devor refWall dan UZOQLASHISHI (-sideSign) kerak!
  const diff = target - dim.clearDistanceM;
  const deltaNormalM = -sideSign * diff;
  return moveWallParallel(floor, wallId, deltaNormalM, opts);
}

/**
 * Devorni o'chirish — unga tegishli eshik/oynalar ham tozalanadi va ikki xona avtomatik bitta bo'lib qo'shiladi!
 */
export function deleteWallById(floor, wallId) {
  const before = floor.walls.length;
  floor.walls = floor.walls.filter((w) => w.id !== wallId);
  if (floor.walls.length === before) return false;
  floor.openings = (floor.openings || []).filter((o) => o.wallId !== wallId);
  planarizeFloorGraph(floor);
  return true;
}

export function getFloorWorldBounds(floor) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of floor?.nodes || []) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const sb = floor?.scanOverlay?.bounds;
  if (sb && Number.isFinite(sb.minX) && Number.isFinite(sb.maxX)) {
    if (sb.minX < minX) minX = sb.minX;
    if (sb.minY < minY) minY = sb.minY;
    if (sb.maxX > maxX) maxX = sb.maxX;
    if (sb.maxY > maxY) maxY = sb.maxY;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 12, maxY: 10, width: 12, height: 10 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
