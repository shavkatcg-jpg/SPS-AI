/**
 * SPS Project 2.0 — 3D LiDAR Skaner (RoomPlan / OBJ / PLY / DXF) + AI Arxitektor Dvigateli
 *
 * Obyektga zamerga borilganda:
 * 1) iPhone Pro / iPad Pro LiDAR (RoomPlan .json) yoki 3D Skaner (.obj / .ply) faylini o'qiydi,
 *    sensor qiyshiqligini (±6°) AI Ortogonal Tekislash orqali ideal 90° BIM devorlarga keltiradi;
 * 2) AutoCAD .DXF ikki-chiziqli yoki o'q chizmalaridan devor qalinligini aniqlab 3D qiladi;
 * 3) Rasm / Kadastr / Qo'lda chizilgan zamer eskizidan (Computer Vision) devorlarni ajratadi;
 * 4) O'zbek va rus tilidagi matnli/ovozli AI topshiriqdan to'liq koridor-bog'langan bino quradi.
 */

import {
  createEmptyFloor,
  addWallSegment,
  addWallOpening,
  planarizeFloorGraph,
  makeArchId,
  roundMm,
  roundCm,
  projectOnSegment,
} from '../core/planar-wall-graph.js';

/**
 * Shovqinli 3D skaner devor segmentlarini (±7° burchak og'ishi va ±12 sm tebranish)
 * haqiqiy muhandislik ortogonal o'qlariga (0° / 90° / 45°) tekislaydi va burchaklarni tutashtiradi.
 */
export function rectifyNoisyScanSegments(rawSegments, { angleSnapDeg = 7.5, axisClusterTolM = 0.12, cornerSnapTolM = 0.28 } = {}) {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) return [];

  // 1. Burchaklarni 0°, 90°, 180°, -90° (yoki aniq 45°) ga tekislash
  const oriented = rawSegments
    .map((s) => {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len = Math.hypot(dx, dy);
      if (len < 0.22) return null;
      const mx = (s.x1 + s.x2) * 0.5;
      const my = (s.y1 + s.y2) * 0.5;
      let angDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const snapTargets = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
      for (const t of snapTargets) {
        const tol = t % 90 === 0 ? angleSnapDeg : 3.5;
        if (Math.abs(angDeg - t) <= tol) {
          angDeg = t;
          break;
        }
      }
      const rad = (angDeg * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      return {
        ...s,
        x1: mx - ux * (len * 0.5),
        y1: my - uy * (len * 0.5),
        x2: mx + ux * (len * 0.5),
        y2: my + uy * (len * 0.5),
        isHoriz: Math.abs(uy) < 0.02,
        isVert: Math.abs(ux) < 0.02,
        len,
      };
    })
    .filter(Boolean);

  // 2. Gorizontal va vertikal o'qlarni klasterlash (sensor 4.02m va 3.97m qilgan bo'lsa -> bitta 4.00m o'q!)
  const cluster1D = (items, getCoord, setCoord) => {
    const sorted = [...items].sort((a, b) => getCoord(a) - getCoord(b));
    let cluster = [];
    const flush = () => {
      if (!cluster.length) return;
      let wSum = 0;
      let cSum = 0;
      for (const it of cluster) {
        const w = Math.max(0.2, it.len || 1);
        wSum += w;
        cSum += getCoord(it) * w;
      }
      // 1 sm qadamga yaxlitlangan o'rtacha o'q
      const avg = roundCm(cSum / wSum);
      for (const it of cluster) setCoord(it, avg);
      cluster = [];
    };
    for (const it of sorted) {
      if (!cluster.length || Math.abs(getCoord(it) - getCoord(cluster[0])) <= axisClusterTolM) {
        cluster.push(it);
      } else {
        flush();
        cluster.push(it);
      }
    }
    flush();
  };

  cluster1D(
    oriented.filter((s) => s.isHoriz),
    (s) => s.y1,
    (s, y) => { s.y1 = y; s.y2 = y; },
  );
  cluster1D(
    oriented.filter((s) => s.isVert),
    (s) => s.x1,
    (s, x) => { s.x1 = x; s.x2 = x; },
  );

  // 3. Burchak uchlarini yaqin ko'ndalang devor o'qiga cho'zib yopish (L va T burchaklar teshiksiz yopiladi!)
  for (const s of oriented) {
    if (s.isHoriz) {
      for (const endKey of ['x1', 'x2']) {
        let bestX = null;
        let bestD = cornerSnapTolM;
        for (const v of oriented) {
          if (!v.isVert) continue;
          const vyMin = Math.min(v.y1, v.y2) - cornerSnapTolM;
          const vyMax = Math.max(v.y1, v.y2) + cornerSnapTolM;
          if (s.y1 >= vyMin && s.y1 <= vyMax) {
            const d = Math.abs(s[endKey] - v.x1);
            if (d < bestD) {
              bestD = d;
              bestX = v.x1;
            }
          }
        }
        if (bestX !== null) s[endKey] = bestX;
      }
    } else if (s.isVert) {
      for (const endKey of ['y1', 'y2']) {
        let bestY = null;
        let bestD = cornerSnapTolM;
        for (const h of oriented) {
          if (!h.isHoriz) continue;
          const hxMin = Math.min(h.x1, h.x2) - cornerSnapTolM;
          const hxMax = Math.max(h.x1, h.x2) + cornerSnapTolM;
          if (s.x1 >= hxMin && s.x1 <= hxMax) {
            const d = Math.abs(s[endKey] - h.y1);
            if (d < bestD) {
              bestD = d;
              bestY = h.y1;
            }
          }
        }
        if (bestY !== null) s[endKey] = bestY;
      }
    }
  }

  return oriented.map((s) => ({
    x1: roundMm(s.x1),
    y1: roundMm(s.y1),
    x2: roundMm(s.x2),
    y2: roundMm(s.y2),
    thickness: s.thickness || 0.20,
    kind: s.kind || ((s.thickness || 0.2) >= 0.28 ? 'exterior' : 'interior'),
    bridgedMidpoints: s.bridgedMidpoints || [],
  }));
}

/**
 * Apple RoomPlan (.json) skaner faylini (iOS LiDAR RoomPlan API) to'g'ridan-to'g'ri BIM qavatiga aylantiradi.
 */
export function parseRoomPlanJsonToFloor(jsonData, floorId = 1, floorName = '1-qavat (LiDAR)') {
  const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
  const rawWalls = [];
  const rawOpenings = [];
  let maxWallH = 2.9;

  const extractTransformElement = (item) => {
    // Variant A: Apple RoomPlan 4x4 column-major transform + dimensions [width, height, length]
    if (Array.isArray(item.transform) && item.transform.length === 16 && Array.isArray(item.dimensions)) {
      const m = item.transform;
      const cx = Number(m[12]) || 0;
      const cz = Number(m[14]) || 0; // Apple ARKit: X-right, Y-up, Z-back -> Plan (X, Z)
      const ux = Number(m[0]) || 1;
      const uz = Number(m[2]) || 0;
      const uLen = Math.hypot(ux, uz) || 1;
      const dx = ux / uLen;
      const dz = uz / uLen;
      const span = Math.max(0.25, Number(item.dimensions[0]) || 1.0);
      const height = Math.max(0.5, Number(item.dimensions[1]) || 2.8);
      const thick = Math.max(0.10, Math.min(0.60, Number(item.dimensions[2]) || 0.20));
      return {
        x1: cx - dx * span * 0.5,
        y1: cz - dz * span * 0.5,
        x2: cx + dx * span * 0.5,
        y2: cz + dz * span * 0.5,
        cx,
        cy: cz,
        widthM: span,
        heightM: height,
        thickness: thick,
      };
    }
    // Variant B: Sodda { x1, y1, x2, y2 } JSON sxemasi
    if (Number.isFinite(Number(item.x1)) && Number.isFinite(Number(item.x2))) {
      return {
        x1: Number(item.x1),
        y1: Number(item.y1),
        x2: Number(item.x2),
        y2: Number(item.y2),
        cx: (Number(item.x1) + Number(item.x2)) * 0.5,
        cy: (Number(item.y1) + Number(item.y2)) * 0.5,
        widthM: Math.hypot(Number(item.x2) - Number(item.x1), Number(item.y2) - Number(item.y1)),
        heightM: Number(item.heightM) || 2.8,
        thickness: Number(item.thickness) || 0.20,
      };
    }
    return null;
  };

  for (const w of data?.walls || []) {
    const parsed = extractTransformElement(w);
    if (!parsed) continue;
    maxWallH = Math.max(maxWallH, Math.min(4.5, parsed.heightM));
    rawWalls.push(parsed);
  }

  for (const d of data?.doors || []) {
    const parsed = extractTransformElement(d);
    if (parsed) rawOpenings.push({ type: 'door', ...parsed, sillM: 0 });
  }
  for (const win of data?.windows || []) {
    const parsed = extractTransformElement(win);
    if (parsed) rawOpenings.push({ type: 'window', ...parsed, sillM: Number(win.sillM) ?? 0.85 });
  }
  for (const op of data?.openings || []) {
    if (op.type === 'door' || op.type === 'window' || op.type === 'arch') {
      rawOpenings.push({
        type: op.type,
        cx: Number(op.x ?? op.cx) || 0,
        cy: Number(op.y ?? op.cy) || 0,
        widthM: Number(op.widthM) || 0.9,
        heightM: Number(op.heightM) || 2.1,
        sillM: Number(op.sillM) || 0,
      });
    }
  }

  // Koordinatalarni (0,0) musbat kvadrantga keltirish
  let minX = Infinity;
  let minY = Infinity;
  for (const w of rawWalls) {
    minX = Math.min(minX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;

  const shiftedWalls = rawWalls.map((w) => ({
    ...w,
    x1: w.x1 - minX,
    y1: w.y1 - minY,
    x2: w.x2 - minX,
    y2: w.y2 - minY,
  }));

  const cleanWalls = rectifyNoisyScanSegments(shiftedWalls);
  const floor = createEmptyFloor(floorId, floorName, 0, roundCm(maxWallH));
  for (const cw of cleanWalls) {
    addWallSegment(floor, cw.x1, cw.y1, cw.x2, cw.y2, {
      thickness: cw.thickness,
      kind: cw.kind,
    });
  }

  if (Array.isArray(data?.rooms)) {
    floor.roomMeta = data.rooms.map((r) => ({
      id: makeArchId('rmeta'),
      seedX: roundCm((Number(r.x) || 0) - minX),
      seedY: roundCm((Number(r.y) || 0) - minY),
      name: r.name || 'Xona',
      roomType: r.roomType || 'living',
      floorMat: r.floorMat || 'parquet',
      targetTempC: r.targetTempC || 22,
    }));
  }

  planarizeFloorGraph(floor);

  // Eshik va oynalarni eng yaqin tekislangan devorga bog'lash
  for (const rop of rawOpenings) {
    const ox = rop.cx - minX;
    const oy = rop.cy - minY;
    let bestWallId = null;
    let bestDist = 0.45;
    const nm = new Map(floor.nodes.map((n) => [n.id, n]));
    for (const w of floor.walls) {
      const a = nm.get(w.n1);
      const b = nm.get(w.n2);
      if (!a || !b) continue;
      const pr = projectOnSegment(ox, oy, a.x, a.y, b.x, b.y);
      if (pr.dist < bestDist) {
        bestDist = pr.dist;
        bestWallId = w.id;
      }
    }
    if (bestWallId) {
      addWallOpening(floor, bestWallId, ox, oy, {
        type: rop.type,
        widthM: rop.widthM,
        heightM: rop.heightM,
        sillM: rop.sillM,
      });
    }
  }

  return floor;
}

const PLY_TYPE_READERS = {
  char: { size: 1, read: (dv, o) => dv.getInt8(o) },
  int8: { size: 1, read: (dv, o) => dv.getInt8(o) },
  uchar: { size: 1, read: (dv, o) => dv.getUint8(o) },
  uint8: { size: 1, read: (dv, o) => dv.getUint8(o) },
  short: { size: 2, read: (dv, o, le) => dv.getInt16(o, le) },
  int16: { size: 2, read: (dv, o, le) => dv.getInt16(o, le) },
  ushort: { size: 2, read: (dv, o, le) => dv.getUint16(o, le) },
  uint16: { size: 2, read: (dv, o, le) => dv.getUint16(o, le) },
  int: { size: 4, read: (dv, o, le) => dv.getInt32(o, le) },
  int32: { size: 4, read: (dv, o, le) => dv.getInt32(o, le) },
  uint: { size: 4, read: (dv, o, le) => dv.getUint32(o, le) },
  uint32: { size: 4, read: (dv, o, le) => dv.getUint32(o, le) },
  float: { size: 4, read: (dv, o, le) => dv.getFloat32(o, le) },
  float32: { size: 4, read: (dv, o, le) => dv.getFloat32(o, le) },
  double: { size: 8, read: (dv, o, le) => dv.getFloat64(o, le) },
  float64: { size: 8, read: (dv, o, le) => dv.getFloat64(o, le) },
};

function decodeRawVerticesFromAnyScan(inputBufOrText, fileName = 'scan.ply', extraOptions = {}) {
  const lowName = String(fileName || 'scan.ply').toLowerCase();
  const isBuf = inputBufOrText instanceof ArrayBuffer || ArrayBuffer.isView(inputBufOrText);
  const u8 = isBuf
    ? (inputBufOrText instanceof Uint8Array
      ? inputBufOrText
      : new Uint8Array(
        inputBufOrText.buffer || inputBufOrText,
        inputBufOrText.byteOffset || 0,
        inputBufOrText.byteLength ?? inputBufOrText.length,
      ))
    : null;

  // 1) ASPRS .LAS 1.1..1.4 Binary Point Cloud (Scaniverse .las, Leica, ReCap)
  if ((u8 && u8.length > 227 && u8[0] === 0x4c && u8[1] === 0x41 && u8[2] === 0x53 && u8[3] === 0x46) || (lowName.endsWith('.las') && u8)) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const verMinor = u8[25];
    const offsetToPts = dv.getUint32(96, true);
    const ptFormat = u8[104] & 0x3f;
    const recLen = dv.getUint16(105, true);
    let ptCount = dv.getUint32(107, true);
    if (ptCount === 0 && verMinor >= 4 && u8.length >= 255) {
      ptCount = Number(dv.getBigUint64(247, true));
    }
    const maxAvail = Math.floor((u8.byteLength - offsetToPts) / Math.max(20, recLen));
    const totalPts = Math.min(ptCount || maxAvail, maxAvail);

    const scaleX = dv.getFloat64(131, true) || 0.001;
    const scaleY = dv.getFloat64(139, true) || 0.001;
    const scaleZ = dv.getFloat64(147, true) || 0.001;
    const minX = dv.getFloat64(187, true);
    const minY = dv.getFloat64(203, true);
    const minZ = dv.getFloat64(219, true);
    const offX = dv.getFloat64(155, true);
    const offY = dv.getFloat64(163, true);
    const offZ = dv.getFloat64(171, true);

    const rgbByteOff = ptFormat === 2 ? 20 : ptFormat === 3 ? 28 : ptFormat === 7 ? 30 : ptFormat === 8 ? 30 : -1;
    const step = Math.max(1, Math.floor(totalPts / 140000));
    const out = [];

    for (let i = 0; i < totalPts; i += step) {
      const pOff = offsetToPts + i * recLen;
      if (pOff + 12 > u8.byteLength) break;
      const x = dv.getInt32(pOff, true) * scaleX + (offX - minX);
      const y = dv.getInt32(pOff + 4, true) * scaleY + (offY - minY);
      const z = dv.getInt32(pOff + 8, true) * scaleZ + (offZ - minZ);
      let r = null, g = null, b = null;
      if (rgbByteOff > 0 && pOff + rgbByteOff + 6 <= u8.byteLength) {
        const r16 = dv.getUint16(pOff + rgbByteOff, true);
        const g16 = dv.getUint16(pOff + rgbByteOff + 2, true);
        const b16 = dv.getUint16(pOff + rgbByteOff + 4, true);
        const div = (r16 > 255 || g16 > 255 || b16 > 255) ? 65535 : 255;
        r = r16 / div; g = g16 / div; b = b16 / div;
      }
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        out.push({ x, y, z, r, g, b });
      }
    }
    return { verts: out, forcedZUp: true };
  }

  // 2) glTF 2.0 Binary .GLB (Scaniverse / Polycam 3D Object mesh export)
  if (u8 && u8.length > 28 && u8[0] === 0x67 && u8[1] === 0x6c && u8[2] === 0x54 && u8[3] === 0x46) {
    try {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const jsonLen = dv.getUint32(12, true);
      const jsonStr = new TextDecoder('utf-8').decode(u8.subarray(20, 20 + jsonLen));
      const gltf = JSON.parse(jsonStr);
      const binChunkHeader = 20 + jsonLen;
      const binStart = binChunkHeader + 8;
      const out = [];
      for (const mesh of gltf.meshes || []) {
        for (const prim of mesh.primitives || []) {
          const posAccIdx = prim.attributes?.POSITION;
          if (posAccIdx === undefined) continue;
          const acc = gltf.accessors?.[posAccIdx];
          const bv = gltf.bufferViews?.[acc?.bufferView];
          if (!acc || !bv || acc.componentType !== 5126) continue;
          const stride = bv.byteStride || 12;
          const baseOff = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
          const step = Math.max(1, Math.floor(acc.count / 120000));
          for (let i = 0; i < acc.count; i += step) {
            const o = baseOff + i * stride;
            if (o + 12 > u8.byteLength) break;
            out.push({
              x: dv.getFloat32(o, true),
              y: dv.getFloat32(o + 4, true),
              z: dv.getFloat32(o + 8, true),
              r: null, g: null, b: null,
            });
          }
        }
      }
      return { verts: out, forcedZUp: false };
    } catch {
      // fallback
    }
  }

  // 3) Binary & ASCII .PLY (Scaniverse, Polycam, Leica, CloudCompare)
  if (lowName.endsWith('.ply') || (u8 && u8[0] === 0x70 && u8[1] === 0x6c && u8[2] === 0x79)) {
    if (u8) {
      // Header oxirini ("end_header\n" yoki "end_header\r\n") topish
      const probeLen = Math.min(u8.length, 8192);
      const headerProbe = new TextDecoder('latin1').decode(u8.subarray(0, probeLen));
      const endMatch = headerProbe.match(/end_header\r?\n/);
      if (endMatch) {
        const bodyOffset = endMatch.index + endMatch[0].length;
        const headerLines = headerProbe.slice(0, endMatch.index).split(/\r?\n/);
        let format = 'ascii';
        let vertCount = 0;
        let inVertexElement = false;
        const props = [];

        for (const rawLn of headerLines) {
          const ln = rawLn.trim();
          if (ln.startsWith('format ')) {
            if (ln.includes('binary_little_endian')) format = 'bin_le';
            else if (ln.includes('binary_big_endian')) format = 'bin_be';
          } else if (ln.startsWith('element ')) {
            const parts = ln.split(/\s+/);
            inVertexElement = parts[1] === 'vertex';
            if (inVertexElement) vertCount = parseInt(parts[2], 10) || 0;
          } else if (inVertexElement && ln.startsWith('property ') && !ln.startsWith('property list')) {
            const [, pType, pName] = ln.split(/\s+/);
            const reader = PLY_TYPE_READERS[pType];
            if (reader) props.push({ name: pName, type: pType, ...reader });
          }
        }

        if ((format === 'bin_le' || format === 'bin_be') && vertCount > 0 && props.length >= 3) {
          const le = format === 'bin_le';
          let vertexStride = 0;
          const propMap = {};
          for (const p of props) {
            propMap[p.name] = { offset: vertexStride, read: p.read, type: p.type };
            vertexStride += p.size;
          }
          const pxP = propMap.x;
          const pyP = propMap.y;
          const pzP = propMap.z;
          const prP = propMap.red || propMap.diffuse_red || propMap.r;
          const pgP = propMap.green || propMap.diffuse_green || propMap.g;
          const pbP = propMap.blue || propMap.diffuse_blue || propMap.b;

          if (pxP && pyP && pzP && vertexStride > 0) {
            const dv = new DataView(u8.buffer, u8.byteOffset + bodyOffset, u8.byteLength - bodyOffset);
            const maxSafeVerts = Math.min(vertCount, Math.floor(dv.byteLength / vertexStride));
            const step = Math.max(1, Math.floor(maxSafeVerts / 140000));
            const out = [];
            for (let i = 0; i < maxSafeVerts; i += step) {
              const base = i * vertexStride;
              const x = pxP.read(dv, base + pxP.offset, le);
              const y = pyP.read(dv, base + pyP.offset, le);
              const z = pzP.read(dv, base + pzP.offset, le);
              if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
              let r = null, g = null, b = null;
              if (prP && pgP && pbP) {
                const rawR = prP.read(dv, base + prP.offset, le);
                const rawG = pgP.read(dv, base + pgP.offset, le);
                const rawB = pbP.read(dv, base + pbP.offset, le);
                const scaleC = prP.type.startsWith('float') ? 1 : 255;
                r = rawR / scaleC; g = rawG / scaleC; b = rawB / scaleC;
              }
              out.push({ x, y, z, r, g, b });
            }
            return { verts: out, forcedZUp: false };
          }
        }
      }
    }
  }

  // 4) Matnli formatlar: ASCII .PLY, Wavefront .OBJ, .XYZ, .PTS
  const textContent = typeof inputBufOrText === 'string'
    ? inputBufOrText
    : new TextDecoder('utf-8').decode(u8 || new Uint8Array());
  const lines = textContent.split(/\r?\n/);
  const rawVerts = [];

  if (lowName.endsWith('.ply')) {
    let headerDone = false;
    let vertCount = 0;
    let readVerts = 0;
    for (const ln of lines) {
      const t = ln.trim();
      if (!t) continue;
      if (!headerDone) {
        if (t.startsWith('element vertex')) vertCount = parseInt(t.split(/\s+/)[2], 10) || 0;
        if (t === 'end_header') headerDone = true;
        continue;
      }
      if (readVerts < vertCount) {
        const parts = t.split(/\s+/).map(Number);
        if (parts.length >= 3 && Number.isFinite(parts[0])) {
          rawVerts.push({
            x: parts[0],
            y: parts[1],
            z: parts[2],
            r: parts.length >= 6 ? parts[3] / 255 : null,
            g: parts.length >= 6 ? parts[4] / 255 : null,
            b: parts.length >= 6 ? parts[5] / 255 : null,
          });
        }
        readVerts += 1;
      }
    }
  } else if (lowName.endsWith('.xyz') || lowName.endsWith('.pts')) {
    for (const ln of lines) {
      const t = ln.trim();
      if (!t || t.startsWith('#') || t.startsWith('//')) continue;
      const parts = t.split(/[\s,;]+/).map(Number);
      if (parts.length >= 3 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && Number.isFinite(parts[2])) {
        const hasRgb = parts.length >= 6 && parts[3] >= 0 && parts[3] <= 255;
        rawVerts.push({
          x: parts[0],
          y: parts[1],
          z: parts[2],
          r: hasRgb ? parts[3] / 255 : null,
          g: hasRgb ? parts[4] / 255 : null,
          b: hasRgb ? parts[5] / 255 : null,
        });
      }
    }
  } else {
    // Wavefront .OBJ parser (v x y z [r g b] + vt u v + f v/vt -> JPG/PNG tekstura ranglarini nuqtalarga ko'chirish!)
    const uvs = [];
    const tex = extraOptions?.texturePixels; // { width, height, data: Uint8ClampedArray }
    for (const ln of lines) {
      if (ln.startsWith('v ')) {
        const parts = ln.trim().split(/\s+/).slice(1).map(Number);
        if (parts.length >= 3 && Number.isFinite(parts[0])) {
          rawVerts.push({
            x: parts[0],
            y: parts[1],
            z: parts[2],
            r: parts.length >= 6 ? parts[3] : null,
            g: parts.length >= 6 ? parts[4] : null,
            b: parts.length >= 6 ? parts[5] : null,
          });
        }
      } else if (tex && ln.startsWith('vt ')) {
        const parts = ln.trim().split(/\s+/).slice(1).map(Number);
        if (parts.length >= 2) uvs.push([parts[0], parts[1]]);
      } else if (tex && uvs.length > 0 && ln.startsWith('f ')) {
        const toks = ln.trim().split(/\s+/).slice(1);
        for (const tok of toks) {
          const sp = tok.split('/');
          const vi = parseInt(sp[0], 10) - 1;
          const ti = sp[1] ? parseInt(sp[1], 10) - 1 : -1;
          if (vi >= 0 && vi < rawVerts.length && ti >= 0 && ti < uvs.length && rawVerts[vi].r === null) {
            const [uRaw, vRaw] = uvs[ti];
            const u = ((uRaw % 1) + 1) % 1;
            const v = ((1 - vRaw) % 1 + 1) % 1;
            const px = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
            const py = Math.min(tex.height - 1, Math.max(0, Math.floor(v * tex.height)));
            const off = (py * tex.width + px) * 4;
            rawVerts[vi].r = tex.data[off] / 255;
            rawVerts[vi].g = tex.data[off + 1] / 255;
            rawVerts[vi].b = tex.data[off + 2] / 255;
          }
        }
      }
    }
  }

  return { verts: rawVerts, forcedZUp: lowName.endsWith('.xyz') || lowName.endsWith('.pts') };
}

/**
 * Skaner bulutidan (pointStride6) aniq 2D «Skan-Magnit» relslari (devor chiziqlari),
 * burchak tutashuv nuqtalari va lazer aniqlagan Oyna / Eshik o'rinlarini chiqaradi!
 */
export function extractScanSnapGuides(floor) {
  const ov = floor?.scanOverlay;
  const arr = ov?.pointStride6;
  if (!Array.isArray(arr) || arr.length < 24) return null;

  const maxH = Number(floor.heightM) || Number(ov?.detectedCeilingM) || 3.0;
  const totalPts = Math.floor(arr.length / 6);
  const wLo = maxH >= 2.60 ? 1.35 : 0.65;
  const wHi = Math.min(maxH - 0.25, Math.max(wLo + 0.55, 2.55));

  const xBins = new Map();
  const yBins = new Map();
  let upperBandPts = 0;
  for (let i = 0; i < arr.length; i += 6) {
    const px = arr[i];
    const py = arr[i + 1];
    const pz = arr[i + 2];
    if (pz < wLo || pz > wHi) continue;
    upperBandPts += 1;
    const xb = Math.round(px * 25) / 25; // 4 sm aniqlik
    const yb = Math.round(py * 25) / 25;
    xBins.set(xb, (xBins.get(xb) || 0) + 1);
    yBins.set(yb, (yBins.get(yb) || 0) + 1);
  }

  const minRailHits = Math.max(10, Math.min(90, Math.round(upperBandPts * 0.014)));

  const buildRails = (binsMap, isX) => {
    const sorted = [...binsMap.entries()].sort((a, b) => b[1] - a[1]);
    const rails = [];
    for (const [binPos, cnt] of sorted) {
      if (cnt < minRailHits) break;
      if (rails.some((r) => Math.abs(r.pos - binPos) < 0.28)) continue;

      // Shu tekislik atrofidagi (±9 sm) yuqori devor nuqtalaridan aniq o'rtacha koordinata va [min..max] oraliqni olish
      let sumCoord = 0;
      let nPts = 0;
      let spanMin = Infinity;
      let spanMax = -Infinity;
      for (let i = 0; i < arr.length; i += 6) {
        const pz = arr[i + 2];
        if (pz < 0.20 || pz > maxH - 0.15) continue;
        const c = isX ? arr[i] : arr[i + 1];
        const s = isX ? arr[i + 1] : arr[i];
        if (Math.abs(c - binPos) <= 0.09) {
          if (pz >= wLo && pz <= wHi) {
            sumCoord += c;
            nPts += 1;
          }
          if (s < spanMin) spanMin = s;
          if (s > spanMax) spanMax = s;
        }
      }
      if (nPts < minRailHits * 0.6 || spanMax - spanMin < 0.95) continue;
      rails.push({
        pos: roundCm(sumCoord / nPts),
        min: roundCm(spanMin),
        max: roundCm(spanMax),
        strength: nPts,
      });
    }
    return rails.sort((a, b) => a.pos - b.pos);
  };

  const xRails = buildRails(xBins, true);
  const yRails = buildRails(yBins, false);

  // Relslar kesishmasidan «Skan Burchak» magnit nuqtalarini chiqarish
  const corners = [];
  for (const xr of xRails) {
    for (const yr of yRails) {
      if (yr.pos >= xr.min - 0.75 && yr.pos <= xr.max + 0.75 && xr.pos >= yr.min - 0.75 && xr.pos <= yr.max + 0.75) {
        corners.push({ x: xr.pos, y: yr.pos });
      }
    }
  }

  // Har bir rels bo'ylab Oyna (podokonnik 0.15..1.05m bor, o'rta shisha ochiq) va Eshik (pol ochiq, tepasi peremichka) o'rinlarini topish!
  const openings = [];
  const scanRailOpenings = (rails, isX) => {
    for (const rl of rails) {
      const step = 0.20;
      const nSlices = Math.floor((rl.max - rl.min) / step);
      if (nSlices < 5) continue;
      const sliceKinds = [];
      for (let k = 0; k < nSlices; k++) {
        const s0 = rl.min + k * step;
        const s1 = s0 + step;
        let low = 0;
        let mid = 0;
        let high = 0;
        for (let i = 0; i < arr.length; i += 6) {
          const c = isX ? arr[i] : arr[i + 1];
          const s = isX ? arr[i + 1] : arr[i];
          if (Math.abs(c - rl.pos) > 0.16 || s < s0 || s >= s1) continue;
          const pz = arr[i + 2];
          if (pz >= 0.16 && pz <= 1.05) low += 1;
          else if (pz >= 1.20 && pz <= 2.25) mid += 1;
          else if (pz >= 2.35 && pz <= maxH - 0.05) high += 1;
        }
        if (mid >= 4) sliceKinds.push({ k, kind: 'wall', low, high });
        else if (low >= 3) sliceKinds.push({ k, kind: 'window', low, high });
        else if (high >= 2) sliceKinds.push({ k, kind: 'door', low, high });
        else sliceKinds.push({ k, kind: 'gap', low, high });
      }

      let idx = 0;
      while (idx < sliceKinds.length) {
        const cur = sliceKinds[idx].kind;
        if (cur === 'wall') { idx += 1; continue; }
        let end = idx;
        let winVotes = 0;
        let doorVotes = 0;
        while (end < sliceKinds.length && sliceKinds[end].kind !== 'wall') {
          if (sliceKinds[end].kind === 'window') winVotes += 1;
          if (sliceKinds[end].kind === 'door') doorVotes += 1;
          end += 1;
        }
        // Faqat ikki tomonida devor bo'lgan haqiqiy ichki proyomlarni olamiz
        if (idx > 0 && end < sliceKinds.length) {
          const spanW = roundCm((end - idx) * step);
          const centerS = roundCm(rl.min + (idx + end) * 0.5 * step);
          if (winVotes >= 2 && spanW >= 0.75 && spanW <= 4.80) {
            openings.push({
              kind: 'window',
              axis: isX ? 'x' : 'y',
              x: isX ? rl.pos : centerS,
              y: isX ? centerS : rl.pos,
              widthM: Math.min(2.60, spanW),
              heightM: 1.80,
              sillM: 0.95,
            });
          } else if ((doorVotes >= 1 || (spanW >= 0.75 && spanW <= 1.35)) && spanW >= 0.75 && spanW <= 1.65) {
            openings.push({
              kind: 'door',
              axis: isX ? 'x' : 'y',
              x: isX ? rl.pos : centerS,
              y: isX ? centerS : rl.pos,
              widthM: Math.min(1.10, Math.max(0.85, spanW)),
              heightM: 2.25,
              sillM: 0,
            });
          }
        }
        idx = end + 1;
      }
    }
  };
  scanRailOpenings(xRails, true);
  scanRailOpenings(yRails, false);

  const guides = { xRails, yRails, corners, openings };
  ov.snapGuides = guides;
  return guides;
}

function buildBrowserOrthoDataUrl(cloudArr, bounds, ceilingM = 3.0) {
  if (typeof document === 'undefined' || !Array.isArray(cloudArr) || cloudArr.length < 24) return null;
  try {
    const minX = Math.max(0, (bounds?.minX ?? 0.5) - 0.25);
    const minY = Math.max(0, (bounds?.minY ?? 0.5) - 0.25);
    const maxX = (bounds?.maxX ?? 12) + 0.25;
    const maxY = (bounds?.maxY ?? 12) + 0.25;
    const pxPerM = 48;
    const w = Math.max(64, Math.min(960, Math.ceil((maxX - minX) * pxPerM)));
    const h = Math.max(64, Math.min(960, Math.ceil((maxY - minY) * pxPerM)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;
    const zBuf = new Float32Array(w * h).fill(-99);
    const zCut = Math.max(1.8, ceilingM - 0.45);

    for (let i = 0; i < cloudArr.length; i += 6) {
      const pz = cloudArr[i + 2];
      if (pz > zCut) continue; // Shift qatlamini olib tashlaymiz — ichki stollar, pol va eshiklar ko'rinadi!
      const px = Math.round(((cloudArr[i] - minX) / (maxX - minX)) * w);
      const py = Math.round(((cloudArr[i + 1] - minY) / (maxY - minY)) * h);
      if (px < 1 || px >= w - 2 || py < 1 || py >= h - 2) continue;
      const R = Math.round(cloudArr[i + 3] * 255);
      const G = Math.round(cloudArr[i + 4] * 255);
      const B = Math.round(cloudArr[i + 5] * 255);
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const k = (py + dy) * w + (px + dx);
          if (pz >= zBuf[k] - 0.04) {
            zBuf[k] = Math.max(zBuf[k], pz);
            const o = k * 4;
            data[o] = R; data[o + 1] = G; data[o + 2] = B; data[o + 3] = 232;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return {
      orthoDataUrl: canvas.toDataURL('image/png'),
      orthoWorldBounds: { minX: roundCm(minX), minY: roundCm(minY), maxX: roundCm(maxX), maxY: roundCm(maxY) },
    };
  } catch {
    return null;
  }
}

/**
 * Skaner nuqtalar bulutidan (ov.pointStride6) toza 90° Manhattan BIM devorlarini va eshik proyomlarini tiklaydi!
 * Mebel va stul-stollarga aldanmaslik uchun yuqori devor belbog'i (Z = 1.55..2.50 m) ishlatiladi.
 */
export function rebuildWallsFromScanCloud(floor, sliceHeightM = 1.20) {
  const arr = floor?.scanOverlay?.pointStride6;
  if (!Array.isArray(arr) || arr.length < 24) return floor;

  const maxH = Number(floor.heightM) || 3.0;
  // Mebeldan baland, shiftdan past bo'lgan eng toza devor belbog'i (kichik sintetik skanlarda sliceHeightM atrofini ham oladi!)
  const bandLo = maxH >= 2.65 ? 1.55 : Math.max(0.45, sliceHeightM - 0.30);
  const bandHi = Math.min(maxH - 0.25, Math.max(bandLo + 0.55, 2.50));

  const cellM = 0.10;
  const counts = new Map();
  const lowSillCounts = new Map(); // Z = 0.16..1.05 m (oyna osti podokonnik devori — 1.00m gacha!)
  const midOpenCounts = new Map(); // Z = 1.15..2.05 m (eshik / oyna shisha bo'shlig'i!)
  const topLintelCounts = new Map(); // Z = 2.35..3.05 m (eshik va panoramali oyna peremichkasi!)
  let maxGx = 0;
  let maxGy = 0;

  const totalPts = Math.floor(arr.length / 6);
  const minCellHits = totalPts >= 8000 ? 3 : 1;

  for (let i = 0; i < arr.length; i += 6) {
    const px = arr[i];
    const py = arr[i + 1];
    const pz = arr[i + 2];
    if (px < -0.5 || py < -0.5) continue;
    const gx = Math.round(px / cellM);
    const gy = Math.round(py / cellM);
    if (gx > maxGx) maxGx = gx;
    if (gy > maxGy) maxGy = gy;

    const key = `${gx},${gy}`;
    if ((pz >= bandLo && pz <= bandHi) || (totalPts < 8000 && Math.abs(pz - sliceHeightM) <= 0.28)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (pz >= 0.16 && pz <= 1.05) {
      lowSillCounts.set(key, (lowSillCounts.get(key) || 0) + 1);
    }
    if (pz >= 1.15 && pz <= 2.05) {
      midOpenCounts.set(key, (midOpenCounts.get(key) || 0) + 1);
    }
    if (pz >= 2.35 && pz <= maxH - 0.04) {
      topLintelCounts.set(key, (topLintelCounts.get(key) || 0) + 1);
    }
  }

  const sliceCells = new Set();
  for (const [k, c] of counts.entries()) {
    if (c >= minCellHits) sliceCells.add(k);
  }

  const rawSegs = extractOrthogonalSegmentsFromGrid(sliceCells, maxGx, maxGy, cellM);
  const clusteredWalls = rectifyNoisyScanSegments(rawSegs, { axisClusterTolM: 0.42, cornerSnapTolM: 0.55 });
  // Keng panoramali oynalar (4.5m gacha, masalan ofis lenta oynasi!) podokonnik+peremichka bo'lsa uzluksiz yopiladi!
  const mergedWalls = mergeCollinearScanWalls(clusteredWalls, 4.65);

  floor.nodes = [];
  floor.walls = [];
  floor.openings = [];
  extractScanSnapGuides(floor);

  if (!mergedWalls.length) {
    planarizeFloorGraph(floor);
    return floor;
  }

  let wMinX = Infinity, wMaxX = -Infinity, wMinY = Infinity, wMaxY = -Infinity;
  for (const cw of mergedWalls) {
    wMinX = Math.min(wMinX, cw.x1, cw.x2);
    wMaxX = Math.max(wMaxX, cw.x1, cw.x2);
    wMinY = Math.min(wMinY, cw.y1, cw.y2);
    wMaxY = Math.max(wMaxY, cw.y1, cw.y2);
  }

  // Ichki skaner (Scaniverse) har doim xonaning ICHKI yuzasini (в свету) o'lchaydi:
  // Tashqi devorlarni yarim-qalinlikka (0.19 m) tashqariga siljitamiz — shunda "в свету" yuzasi lazer chizig'iga 0.0 mm tushadi!
  const outOff = totalPts >= 3000 ? 0.19 : 0.0;
  const adjustX = (x) => {
    if (!outOff) return x;
    if (Math.abs(x - wMinX) < 0.35) return roundCm(x - outOff);
    if (Math.abs(x - wMaxX) < 0.35) return roundCm(x + outOff);
    return x;
  };
  const adjustY = (y) => {
    if (!outOff) return y;
    if (Math.abs(y - wMinY) < 0.35) return roundCm(y - outOff);
    if (Math.abs(y - wMaxY) < 0.35) return roundCm(y + outOff);
    return y;
  };

  for (const cw of mergedWalls) {
    const isOuter = (Math.abs(cw.y1 - cw.y2) < 0.01 && (Math.abs(cw.y1 - wMinY) < 0.45 || Math.abs(cw.y1 - wMaxY) < 0.45))
      || (Math.abs(cw.x1 - cw.x2) < 0.01 && (Math.abs(cw.x1 - wMinX) < 0.45 || Math.abs(cw.x1 - wMaxX) < 0.45));
    addWallSegment(floor, adjustX(cw.x1), adjustY(cw.y1), adjustX(cw.x2), adjustY(cw.y2), {
      thickness: isOuter ? 0.38 : 0.20,
      kind: isOuter ? 'exterior' : 'interior',
    });
  }

  planarizeFloorGraph(floor);

  // Ko'priklangan oraliqlarga va Skan-Magnit aniqlagan proyomlarga haqiqiy Oyna va Eshik qo'yish!
  const nm = new Map(floor.nodes.map((n) => [n.id, n]));
  const placedCenters = [];
  const tryPlaceOpening = (gxM, gyM, gapW, isWin, sillM = 0.90, heightM = 1.75) => {
    if (placedCenters.some((p) => Math.hypot(p.x - gxM, p.y - gyM) < 0.85)) return;
    let bestWall = null;
    let bestD = 0.55;
    for (const fw of floor.walls) {
      const a = nm.get(fw.n1);
      const b = nm.get(fw.n2);
      if (!a || !b) continue;
      const pr = projectOnSegment(gxM, gyM, a.x, a.y, b.x, b.y);
      if (pr.dist < bestD && pr.offsetM > gapW * 0.45 + 0.14 && pr.offsetM < pr.len - (gapW * 0.45 + 0.14)) {
        bestD = pr.dist;
        bestWall = fw;
      }
    }
    if (!bestWall) return;
    placedCenters.push({ x: gxM, y: gyM });
    if (isWin) {
      if (gapW >= 3.40) {
        // Keng lenta oynani 2 ta chiroyli yonma-yon oynaga bo'lib qo'yamiz
        const halfSpan = roundCm(gapW * 0.46);
        const wObj = nm.get(bestWall.n1) && nm.get(bestWall.n2) ? bestWall : null;
        if (wObj) {
          const a = nm.get(wObj.n1), b = nm.get(wObj.n2);
          const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
          const off = halfSpan * 0.52;
          addWallOpening(floor, bestWall.id, gxM - ux * off, gyM - uy * off, { type: 'window', widthM: halfSpan, heightM, sillM });
          addWallOpening(floor, bestWall.id, gxM + ux * off, gyM + uy * off, { type: 'window', widthM: halfSpan, heightM, sillM });
          return;
        }
      }
      addWallOpening(floor, bestWall.id, gxM, gyM, {
        type: 'window',
        widthM: roundCm(Math.min(2.60, Math.max(0.90, gapW * 0.92))),
        heightM,
        sillM,
      });
    } else {
      addWallOpening(floor, bestWall.id, gxM, gyM, {
        type: 'door',
        widthM: roundCm(Math.min(1.05, Math.max(0.82, gapW * 0.92))),
        heightM: 2.20,
        sillM: 0,
      });
    }
  };

  for (const mw of mergedWalls) {
    for (const gapObj of mw.bridgedMidpoints || []) {
      const [gxM, gyM, gapW] = gapObj;
      const gx = Math.round(gxM / cellM);
      const gy = Math.round(gyM / cellM);
      const lowHits = (lowSillCounts.get(`${gx},${gy}`) || 0)
        + (lowSillCounts.get(`${gx + 1},${gy}`) || 0)
        + (lowSillCounts.get(`${gx - 1},${gy}`) || 0)
        + (lowSillCounts.get(`${gx},${gy + 1}`) || 0);
      const topHits = (topLintelCounts.get(`${gx},${gy}`) || 0) + (topLintelCounts.get(`${gx},${gy + 1}`) || 0);
      const midHits = (midOpenCounts.get(`${gx},${gy}`) || 0);
      if (midHits > 8) continue;
      const isWindow = gapW >= 1.30 || lowHits >= 2;
      const sillVal = lowHits >= 3 ? 0.95 : (topHits >= 2 ? 0.15 : 0.85);
      const winH = sillVal >= 0.80 ? 1.80 : 2.35;
      tryPlaceOpening(gxM, gyM, gapW, isWindow, sillVal, winH);
    }
  }

  for (const op of floor.scanOverlay?.snapGuides?.openings || []) {
    tryPlaceOpening(op.x, op.y, op.widthM, op.kind === 'window', op.sillM, op.heightM);
  }

  return floor;
}

function mergeCollinearScanWalls(segs, maxBridgeGapM = 3.15) {
  const horizByY = new Map();
  const vertByX = new Map();

  for (const s of segs) {
    if (Math.abs(s.y2 - s.y1) < 0.01) {
      const yKey = Math.round(s.y1 * 25) / 25;
      if (!horizByY.has(yKey)) horizByY.set(yKey, []);
      horizByY.get(yKey).push([Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]);
    } else if (Math.abs(s.x2 - s.x1) < 0.01) {
      const xKey = Math.round(s.x1 * 25) / 25;
      if (!vertByX.has(xKey)) vertByX.set(xKey, []);
      vertByX.get(xKey).push([Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]);
    }
  }

  const out = [];
  for (const [y, intervals] of horizByY.entries()) {
    intervals.sort((a, b) => a[0] - b[0]);
    const totalSolid = intervals.reduce((acc, [a, b]) => acc + (b - a), 0);
    const effBridge = totalSolid >= 2.6 ? maxBridgeGapM : 1.15;
    let cur = { a: intervals[0][0], b: intervals[0][1], gaps: [] };
    for (let i = 1; i < intervals.length; i++) {
      const [na, nb] = intervals[i];
      const gap = na - cur.b;
      if (gap <= effBridge) {
        if (gap >= 0.58 && gap <= effBridge) cur.gaps.push([(cur.b + na) * 0.5, y, gap]);
        cur.b = Math.max(cur.b, nb);
      } else {
        if (cur.b - cur.a >= 0.85) out.push({ x1: roundCm(cur.a), y1: roundCm(y), x2: roundCm(cur.b), y2: roundCm(y), bridgedMidpoints: cur.gaps });
        cur = { a: na, b: nb, gaps: [] };
      }
    }
    if (cur.b - cur.a >= 0.85) out.push({ x1: roundCm(cur.a), y1: roundCm(y), x2: roundCm(cur.b), y2: roundCm(y), bridgedMidpoints: cur.gaps });
  }

  for (const [x, intervals] of vertByX.entries()) {
    intervals.sort((a, b) => a[0] - b[0]);
    const totalSolid = intervals.reduce((acc, [a, b]) => acc + (b - a), 0);
    const effBridge = totalSolid >= 2.6 ? maxBridgeGapM : 1.15;
    let cur = { a: intervals[0][0], b: intervals[0][1], gaps: [] };
    for (let i = 1; i < intervals.length; i++) {
      const [na, nb] = intervals[i];
      const gap = na - cur.b;
      if (gap <= effBridge) {
        if (gap >= 0.58 && gap <= effBridge) cur.gaps.push([x, (cur.b + na) * 0.5, gap]);
        cur.b = Math.max(cur.b, nb);
      } else {
        if (cur.b - cur.a >= 0.85) out.push({ x1: roundCm(x), y1: roundCm(cur.a), x2: roundCm(x), y2: roundCm(cur.b), bridgedMidpoints: cur.gaps });
        cur = { a: na, b: nb, gaps: [] };
      }
    }
    if (cur.b - cur.a >= 0.85) out.push({ x1: roundCm(x), y1: roundCm(cur.a), x2: roundCm(x), y2: roundCm(cur.b), bridgedMidpoints: cur.gaps });
  }

  // Burchaklarni 0.95 m tolerans bilan tutashtirish (chala skanlangan burchaklar teshiksiz yopiladi!)
  return rectifyNoisyScanSegments(out, { axisClusterTolM: 0.30, cornerSnapTolM: 0.95 });
}

/**
 * Yuklangan skan bulutini 90° ga aylantiradi (shimol / kirish tomonini to'g'rilash uchun!).
 */
export function rotateFloorScan90(floor) {
  const ov = floor?.scanOverlay;
  if (!ov || !Array.isArray(ov.pointStride6) || ov.pointStride6.length < 6) return floor;
  const arr = ov.pointStride6;
  const maxY = ov.bounds?.maxY || 12;
  let nMinX = Infinity, nMinY = Infinity, nMaxX = -Infinity, nMaxY = -Infinity;
  for (let i = 0; i < arr.length; i += 6) {
    const ox = arr[i];
    const oy = arr[i + 1];
    const nx = roundMm(maxY - oy);
    const ny = roundMm(ox);
    arr[i] = nx;
    arr[i + 1] = ny;
    if (nx < nMinX) nMinX = nx; if (nx > nMaxX) nMaxX = nx;
    if (ny < nMinY) nMinY = ny; if (ny > nMaxY) nMaxY = ny;
  }
  const shiftX = Number.isFinite(nMinX) ? nMinX - 0.5 : 0;
  const shiftY = Number.isFinite(nMinY) ? nMinY - 0.5 : 0;
  for (let i = 0; i < arr.length; i += 6) {
    arr[i] = roundMm(arr[i] - shiftX);
    arr[i + 1] = roundMm(arr[i + 1] - shiftY);
  }
  ov.bounds = {
    minX: 0.5,
    minY: 0.5,
    maxX: roundCm((nMaxX - nMinX) + 0.5),
    maxY: roundCm((nMaxY - nMinY) + 0.5),
  };
  delete ov.orthoUrl;
  const nextOrtho = buildBrowserOrthoDataUrl(arr, ov.bounds, Number(floor.heightM) || 3.0);
  if (nextOrtho) {
    ov.orthoDataUrl = nextOrtho.orthoDataUrl;
    ov.orthoWorldBounds = nextOrtho.orthoWorldBounds;
  } else {
    delete ov.orthoDataUrl;
  }
  extractScanSnapGuides(floor);
  return floor;
}

export function parseAny3dScanBufferToFloor(inputBufOrText, fileName = 'scan.ply', {
  sliceHeightM = 1.20,
  autoBuildWalls = true,
  texturePixels = null,
} = {}) {
  const { verts: rawVerts, forcedZUp } = decodeRawVerticesFromAnyScan(inputBufOrText, fileName, { texturePixels });
  if (!rawVerts || rawVerts.length < 8) {
    return createEmptyFloor(1, '1-qavat (Bo‘sh skan)');
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of rawVerts) {
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
  }
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;

  // Y-up vs Z-up: pol/shift yassi gorizontal plitalari qaysi o'qda o'tkir gistogramma cho'qqisi hosil qilishini tekshiramiz!
  let isYUp = false;
  if (!forcedZUp) {
    if (spanY >= 1.8 && spanY <= 5.5 && spanZ > spanY * 1.25) {
      isYUp = true;
    } else if (rawVerts.length >= 1000) {
      const hY = new Map(), hZ = new Map();
      const sStep = Math.max(1, Math.floor(rawVerts.length / 15000));
      for (let i = 0; i < rawVerts.length; i += sStep) {
        const by = Math.round(rawVerts[i].y * 20);
        const bz = Math.round(rawVerts[i].z * 20);
        hY.set(by, (hY.get(by) || 0) + 1);
        hZ.set(bz, (hZ.get(bz) || 0) + 1);
      }
      const maxPeakY = Math.max(...hY.values());
      const maxPeakZ = Math.max(...hZ.values());
      isYUp = maxPeakY > maxPeakZ * 1.25 && spanY <= 6.5;
    }
  }

  // 1) Haqiqiy Pol (Z_floor) va Shift (Z_ceil) sathlarini 5 sm gistogrammadan topish (pastki shovqinni e'tiborsiz qoldiradi!)
  const elevMin = isYUp ? minY : minZ;
  const elevMax = isYUp ? maxY : maxZ;
  const elevSpan = Math.max(0.5, elevMax - elevMin);

  let floorElev = elevMin;
  let detectedHeightM = Math.max(2.7, Math.min(4.2, elevSpan));

  if (rawVerts.length >= 600 && elevSpan > 2.0) {
    const zHist = new Map();
    for (let i = 0; i < rawVerts.length; i++) {
      const ez = isYUp ? rawVerts[i].y : rawVerts[i].z;
      const b = Math.round(ez * 20) / 20;
      zHist.set(b, (zHist.get(b) || 0) + 1);
    }
    // Pol plitasi — pastki 58% balandlikdagi eng katta gorizontal yassi tekislik!
    let bestFloorCnt = 0;
    const upperFloorSearch = elevMin + elevSpan * 0.58;
    for (const [zVal, cnt] of zHist.entries()) {
      if (zVal <= upperFloorSearch && cnt > bestFloorCnt) {
        bestFloorCnt = cnt;
        floorElev = zVal;
      }
    }
    // Shift plitasi — poldan +2.20 m .. +4.60 m oralig'idagi eng katta gorizontal tekislik!
    let bestCeilCnt = 0;
    let ceilElev = null;
    for (const [zVal, cnt] of zHist.entries()) {
      if (zVal >= floorElev + 2.20 && zVal <= floorElev + 4.60 && cnt > bestCeilCnt) {
        bestCeilCnt = cnt;
        ceilElev = zVal;
      }
    }
    if (ceilElev !== null && bestCeilCnt > rawVerts.length * 0.004) {
      detectedHeightM = roundCm(Math.max(2.6, Math.min(4.2, ceilElev - floorElev)));
    } else {
      detectedHeightM = 3.0;
    }
  }

  // 2) Dominant Manhattan devor burchagini (0°..89°) avto-aniqlab 0°/90° ga to'g'rilash!
  let alignRad = 0;
  if (rawVerts.length >= 800) {
    const wallSample = [];
    const sampleStride = Math.max(1, Math.floor(rawVerts.length / 18000));
    const wLo = detectedHeightM >= 2.65 ? 1.45 : 0.75;
    const wHi = Math.min(detectedHeightM - 0.25, 2.45);
    for (let i = 0; i < rawVerts.length; i += sampleStride) {
      const v = rawVerts[i];
      const pz = (isYUp ? v.y : v.z) - floorElev;
      if (pz >= wLo && pz <= wHi) {
        wallSample.push([v.x, isYUp ? v.z : -v.y]);
      }
    }
    if (wallSample.length >= 120) {
      let bestDeg = 0;
      let bestScore = -1;
      for (let deg = 0; deg < 90; deg += 0.25) {
        const rad = (deg * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        const hx = new Map();
        const hy = new Map();
        for (let k = 0; k < wallSample.length; k++) {
          const rx = Math.round((wallSample[k][0] * c + wallSample[k][1] * s) * 12);
          const ry = Math.round((-wallSample[k][0] * s + wallSample[k][1] * c) * 12);
          hx.set(rx, (hx.get(rx) || 0) + 1);
          hy.set(ry, (hy.get(ry) || 0) + 1);
        }
        let sc = 0;
        for (const v of hx.values()) sc += v * v;
        for (const v of hy.values()) sc += v * v;
        if (sc > bestScore) {
          bestScore = sc;
          bestDeg = deg;
        }
      }
      alignRad = (bestDeg * Math.PI) / 180;
    }
  }

  const cosA = Math.cos(alignRad);
  const sinA = Math.sin(alignRad);

  // 3) Pastki zina marshlarini (-1.15 m gacha) ham 3D/2D ko'rinishda saqlab, asosiy xona chegarasini (0.5, 0.5) ga joylashtirish
  const filteredPts = [];
  let rMinX = Infinity, rMaxX = -Infinity, rMinY = Infinity, rMaxY = -Infinity;
  for (let i = 0; i < rawVerts.length; i++) {
    const v = rawVerts[i];
    const pz = (isYUp ? v.y : v.z) - floorElev;
    if (rawVerts.length >= 600 && (pz < -1.15 || pz > detectedHeightM + 0.75)) continue;
    // Sintetik chuqur shovqin nuqtalarini (< -0.85 m va juda kam sonli bo'lsa) e'tiborsiz qoldiramiz
    if (rawVerts.length < 5000 && pz < -0.35) continue;
    const rawPlanX = v.x;
    const rawPlanY = isYUp ? v.z : -v.y;
    const rx = rawPlanX * cosA + rawPlanY * sinA;
    const ry = -rawPlanX * sinA + rawPlanY * cosA;
    filteredPts.push({ x: rx, y: ry, z: pz, r: v.r, g: v.g, b: v.b });
    if (pz >= -0.20 && pz <= detectedHeightM + 0.25) {
      if (rx < rMinX) rMinX = rx; if (rx > rMaxX) rMaxX = rx;
      if (ry < rMinY) rMinY = ry; if (ry > rMaxY) rMaxY = ry;
    }
  }

  const padM = 0.50;
  const shiftX = Number.isFinite(rMinX) ? rMinX - padM : 0;
  const shiftY = Number.isFinite(rMinY) ? rMinY - padM : 0;

  // 36,000 tagacha yuqori aniqlikdagi RGB 3D+2D nuqtalar bulutini saqlash
  const cloudStride = Math.max(1, Math.ceil(filteredPts.length / 36000));
  const cloudArr = [];
  for (let i = 0; i < filteredPts.length; i += cloudStride) {
    const p = filteredPts[i];
    const hRatio = Math.max(0, Math.min(1, p.z / detectedHeightM));
    const liftRgb = (c) => Math.max(0, Math.min(1, Math.pow(Math.max(0, Math.min(1, c)), 0.72) * 1.14));
    const r = p.r !== null && p.r !== undefined ? liftRgb(p.r) : (0.12 + 0.75 * hRatio);
    const g = p.g !== null && p.g !== undefined ? liftRgb(p.g) : (0.55 + 0.28 * (1 - Math.abs(hRatio - 0.5) * 2));
    const b = p.b !== null && p.b !== undefined ? liftRgb(p.b) : (0.92 - 0.55 * hRatio);
    cloudArr.push(
      roundMm(p.x - shiftX),
      roundMm(p.y - shiftY),
      roundMm(p.z),
      roundCm(r),
      roundCm(g),
      roundCm(b),
    );
  }

  const effSliceZ = Math.min(detectedHeightM * 0.65, Math.max(0.4, sliceHeightM));
  const cleanTitle = String(fileName || '3D Skan').replace(/\.[^.]+$/, '');
  const floor = createEmptyFloor(1, `1-qavat (${cleanTitle})`, 0, roundCm(detectedHeightM));
  const scanBounds = {
    minX: padM,
    minY: padM,
    maxX: roundCm((rMaxX - rMinX) + padM),
    maxY: roundCm((rMaxY - rMinY) + padM),
  };
  const browserOrtho = buildBrowserOrthoDataUrl(cloudArr, scanBounds, detectedHeightM);

  floor.scanOverlay = {
    kind: 'lidar_cloud',
    sourceFileName: fileName,
    rawPointCount: rawVerts.length,
    alignedDeg: roundCm((alignRad * 180) / Math.PI),
    detectedFloorZ: roundCm(floorElev),
    detectedCeilingM: roundCm(detectedHeightM),
    visible: true,
    opacity: 0.90,
    sliceHeightM: effSliceZ,
    bounds: scanBounds,
    ...(browserOrtho || {}),
    pointStride6: cloudArr,
  };
  extractScanSnapGuides(floor);

  if (autoBuildWalls) {
    rebuildWallsFromScanCloud(floor, effSliceZ);
  } else {
    planarizeFloorGraph(floor);
  }
  return floor;
}

/**
 * 3D Skaner Mesh / Nuqtalar Buluti (.OBJ, Binary/ASCII .PLY, .LAS, .GLB) faylini BIM qavatga aylantiradi.
 */
export function parse3dMeshScanToFloor(textOrBuf, ext = 'obj', sliceHeightM = 1.20) {
  return parseAny3dScanBufferToFloor(textOrBuf, ext, { sliceHeightM, autoBuildWalls: true });
}

function extractOrthogonalSegmentsFromGrid(cellSet, maxGx, maxGy, cellM) {
  const segs = [];
  const minRunCells = Math.max(5, Math.round(0.55 / cellM));

  // Gorizontal qatorlar
  for (let gy = 0; gy <= maxGy + 1; gy++) {
    let runStart = -1;
    let gap = 0;
    for (let gx = 0; gx <= maxGx + 4; gx++) {
      const hit = cellSet.has(`${gx},${gy}`) || cellSet.has(`${gx},${gy - 1}`);
      if (hit) {
        if (runStart < 0) runStart = gx;
        gap = 0;
      } else if (runStart >= 0) {
        gap += 1;
        if (gap > 2) {
          const runEnd = gx - gap;
          if (runEnd - runStart >= minRunCells) {
            segs.push({
              x1: runStart * cellM,
              y1: gy * cellM,
              x2: runEnd * cellM,
              y2: gy * cellM,
              thickness: 0.25,
            });
          }
          runStart = -1;
          gap = 0;
        }
      }
    }
  }

  // Vertikal ustunlar
  for (let gx = 0; gx <= maxGx + 1; gx++) {
    let runStart = -1;
    let gap = 0;
    for (let gy = 0; gy <= maxGy + 4; gy++) {
      const hit = cellSet.has(`${gx},${gy}`) || cellSet.has(`${gx - 1},${gy}`);
      if (hit) {
        if (runStart < 0) runStart = gy;
        gap = 0;
      } else if (runStart >= 0) {
        gap += 1;
        if (gap > 2) {
          const runEnd = gy - gap;
          if (runEnd - runStart >= minRunCells) {
            segs.push({
              x1: gx * cellM,
              y1: runStart * cellM,
              x2: gx * cellM,
              y2: runEnd * cellM,
              thickness: 0.25,
            });
          }
          runStart = -1;
          gap = 0;
        }
      }
    }
  }
  return segs;
}

/**
 * AutoCAD .DXF faylini o'qish (LINE va LWPOLYLINE, mm yoki m masshtabini avtomatik taniydi!).
 */
export function parseDxfToFloor(dxfText, floorId = 1) {
  const lines = String(dxfText || '').split(/\r?\n/).map((s) => s.trim());
  const rawSegs = [];
  let i = 0;

  while (i < lines.length - 1) {
    const code = lines[i];
    const val = lines[i + 1];
    if (code === '0' && val === 'LINE') {
      i += 2;
      let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
      while (i < lines.length - 1 && lines[i] !== '0') {
        const c = lines[i];
        const v = parseFloat(lines[i + 1]);
        if (c === '10') x1 = v;
        else if (c === '20') y1 = v;
        else if (c === '11') x2 = v;
        else if (c === '21') y2 = v;
        i += 2;
      }
      rawSegs.push({ x1, y1, x2, y2 });
      continue;
    }
    if (code === '0' && val === 'LWPOLYLINE') {
      i += 2;
      const pts = [];
      let closed = false;
      let curX = null;
      while (i < lines.length - 1 && lines[i] !== '0') {
        const c = lines[i];
        const v = lines[i + 1];
        if (c === '70') closed = (parseInt(v, 10) & 1) === 1;
        else if (c === '10') curX = parseFloat(v);
        else if (c === '20' && curX !== null) {
          pts.push([curX, parseFloat(v)]);
          curX = null;
        }
        i += 2;
      }
      for (let k = 0; k < pts.length - 1; k++) {
        rawSegs.push({ x1: pts[k][0], y1: pts[k][1], x2: pts[k + 1][0], y2: pts[k + 1][1] });
      }
      if (closed && pts.length >= 3) {
        rawSegs.push({ x1: pts[pts.length - 1][0], y1: pts[pts.length - 1][1], x2: pts[0][0], y2: pts[0][1] });
      }
      continue;
    }
    i += 2;
  }

  if (!rawSegs.length) return createEmptyFloor(floorId, '1-qavat (DXF)');

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of rawSegs) {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  // Agar DXF millimetrda (masalan 12000) bo'lsa / 1000, santimetrda bo'lsa / 100
  const scale = span > 400 ? 0.001 : span > 85 ? 0.01 : 1.0;

  // Y o'qini ekran plan yo'nalishiga moslab ag'darish va (0,0) ga keltirish
  const metricSegs = rawSegs
    .map((s) => ({
      x1: (s.x1 - minX) * scale,
      y1: (maxY - s.y1) * scale,
      x2: (s.x2 - minX) * scale,
      y2: (maxY - s.y2) * scale,
      thickness: 0.25,
    }))
    .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= 0.25);

  const cleanWalls = rectifyNoisyScanSegments(metricSegs, { axisClusterTolM: 0.22, cornerSnapTolM: 0.30 });
  const floor = createEmptyFloor(floorId, '1-qavat (AutoCAD DXF)', 0, 3.0);
  for (const cw of cleanWalls) {
    addWallSegment(floor, cw.x1, cw.y1, cw.x2, cw.y2, { thickness: cw.thickness });
  }
  planarizeFloorGraph(floor);
  return floor;
}

/**
 * Rasm / Kadastr / Qo'lda chizilgan zamer eskizi piksellaridan (ImageData) qoramtir
 * gorizontal va vertikal devor chiziqlarini avtomatik vektorizatsiya qiladi (100% oflayn CV!).
 */
export function detectWallsFromImageData(imgData, metersPerPx = 0.02, offsetX = 0, offsetY = 0) {
  const { width, height, data } = imgData;
  const stepPx = Math.max(1, Math.round(Math.max(width, height) / 360));
  const gw = Math.floor(width / stepPx);
  const gh = Math.floor(height / stepPx);
  const cellM = stepPx * metersPerPx;
  const darkSet = new Set();

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const idx = (gy * stepPx * width + gx * stepPx) * 4;
      const a = data[idx + 3];
      if (a < 80) continue;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (lum < 145) {
        darkSet.add(`${gx},${gy}`);
      }
    }
  }

  const rawSegs = extractOrthogonalSegmentsFromGrid(darkSet, gw, gh, cellM).map((s) => ({
    ...s,
    x1: s.x1 + offsetX,
    y1: s.y1 + offsetY,
    x2: s.x2 + offsetX,
    y2: s.y2 + offsetY,
  }));
  return rectifyNoisyScanSegments(rawSegs, { axisClusterTolM: 0.24, cornerSnapTolM: 0.35 });
}

/**
 * MATNLI / OVOZLI AI ARXITEKTOR:
 * O'zbek va rus tilidagi topshiriqdan ("13x11 m 1-qavatli uy: zal 26 m2, oshxona 16 m2, 3 yotoqxona, 2 sanuzel, qozonxona")
 * haqiqiy koridor-bog'langan, oynali va eshikli arxitektura loyihasini sintez qiladi!
 */
export function generateProjectFromAiPrompt(promptText = '') {
  const txt = String(promptText || '').toLowerCase();
  const dimMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)/i);
  const twoStory = /2\s*[-\s]?qavat|ikki\s*qavat|2\s*этаж|kottej|коттедж/.test(txt);

  let W = dimMatch ? parseFloat(dimMatch[1].replace(',', '.')) : (twoStory ? 12.6 : 12.4);
  let H = dimMatch ? parseFloat(dimMatch[2].replace(',', '.')) : (twoStory ? 10.2 : 10.8);
  W = Math.max(6.5, Math.min(28, W));
  H = Math.max(6.0, Math.min(24, H));

  const bedMatch = txt.match(/(\d+)\s*(?:ta\s*)?(?:yotoq|spaln|спальн)/);
  const bathMatch = txt.match(/(\d+)\s*(?:ta\s*)?(?:sanuzel|hammom|vanna|сануз)/);
  const hasBoiler = /qozon|kotel|котель|бойлер/.test(txt) || !/kvartira|квартира/.test(txt);
  const bedCount = bedMatch ? Math.max(1, Math.min(5, parseInt(bedMatch[1], 10))) : (twoStory ? 3 : 2);
  const bathCount = bathMatch ? Math.max(1, Math.min(3, parseInt(bathMatch[1], 10))) : 2;

  const floors = [];
  const f1 = buildSynthesizedFloor({
    floorId: 1,
    name: '1-qavat',
    elevationM: 0,
    W,
    H,
    isUpper: false,
    twoStory,
    bedCount: twoStory ? 1 : bedCount,
    bathCount: twoStory ? 1 : bathCount,
    hasBoiler,
  });
  floors.push(f1);

  if (twoStory) {
    const f2 = buildSynthesizedFloor({
      floorId: 2,
      name: '2-qavat',
      elevationM: 3.2,
      W,
      H,
      isUpper: true,
      twoStory: true,
      bedCount: Math.max(2, bedCount),
      bathCount: Math.max(1, bathCount),
      hasBoiler: false,
    });
    floors.push(f2);
  }

  return {
    title: twoStory ? `AI Kottej (${W}×${H} m · 2 qavat)` : `AI Loyiha (${W}×${H} m)`,
    floors,
  };
}

function buildSynthesizedFloor({ floorId, name, elevationM, W, H, isUpper, twoStory, bedCount, bathCount, hasBoiler }) {
  const fl = createEmptyFloor(floorId, name, elevationM, 3.0);
  const extT = 0.40;
  const intT = 0.15;

  // Tashqi 400 mm g'isht perimetr
  addWallSegment(fl, 0, 0, W, 0, { thickness: extT, kind: 'exterior' });
  addWallSegment(fl, W, 0, W, H, { thickness: extT, kind: 'exterior' });
  addWallSegment(fl, W, H, 0, H, { thickness: extT, kind: 'exterior' });
  addWallSegment(fl, 0, H, 0, 0, { thickness: extT, kind: 'exterior' });

  // Markaziy vertikal xoll/koridor yo'lagi
  const hallW = Math.max(2.0, Math.min(2.6, roundCm(W * 0.18)));
  const xHallL = roundCm(W * 0.44);
  const xHallR = roundCm(xHallL + hallW);
  const yTopSplit = roundCm(H * 0.42);

  // Chap qanot: Zal (tepa) + Oshxona / Qozonxona (past)
  addWallSegment(fl, xHallL, 0, xHallL, H, { thickness: intT, kind: 'interior' });
  addWallSegment(fl, xHallR, yTopSplit, xHallR, H, { thickness: intT, kind: 'interior' });
  addWallSegment(fl, xHallL, yTopSplit, W, yTopSplit, { thickness: intT, kind: 'interior' });

  const desiredMeta = [];

  if (!isUpper) {
    const yLeftMid = roundCm(H * (hasBoiler ? 0.50 : 0.56));
    addWallSegment(fl, 0, yLeftMid, xHallL, yLeftMid, { thickness: intT, kind: 'interior' });
    desiredMeta.push({ id: makeArchId('rm'), seedX: xHallL * 0.5, seedY: yLeftMid * 0.5, name: 'Mehmonxona (Zal)', roomType: 'living', floorMat: 'parquet', targetTempC: 22 });

    if (hasBoiler) {
      const yBoil = roundCm(H * 0.78);
      addWallSegment(fl, 0, yBoil, xHallL, yBoil, { thickness: intT, kind: 'interior' });
      desiredMeta.push({ id: makeArchId('rm'), seedX: xHallL * 0.5, seedY: (yLeftMid + yBoil) * 0.5, name: 'Oshxona-studiya', roomType: 'kitchen', floorMat: 'tile_warm', targetTempC: 20 });
      desiredMeta.push({ id: makeArchId('rm'), seedX: xHallL * 0.5, seedY: (yBoil + H) * 0.5, name: 'Qozonxona (TM)', roomType: 'boiler', floorMat: 'concrete', targetTempC: 16 });
    } else {
      desiredMeta.push({ id: makeArchId('rm'), seedX: xHallL * 0.5, seedY: (yLeftMid + H) * 0.5, name: 'Oshxona-studiya', roomType: 'kitchen', floorMat: 'tile_warm', targetTempC: 20 });
    }
  } else {
    const yLeftMid = roundCm(H * 0.52);
    addWallSegment(fl, 0, yLeftMid, xHallL, yLeftMid, { thickness: intT, kind: 'interior' });
    desiredMeta.push({ id: makeArchId('rm'), seedX: xHallL * 0.5, seedY: yLeftMid * 0.5, name: 'Master Yotoqxona', roomType: 'bedroom', floorMat: 'parquet', targetTempC: 22 });
    desiredMeta.push({ id: makeArchId('rm'), seedX: xHallL * 0.5, seedY: (yLeftMid + H) * 0.5, name: 'Bolalar xonasi 1', roomType: 'kids', floorMat: 'laminate', targetTempC: 23 });
  }

  // Yuqori o'ng katta xona (Asosiy Yotoqxona)
  desiredMeta.push({
    id: makeArchId('rm'),
    seedX: (xHallL + W) * 0.5,
    seedY: yTopSplit * 0.5,
    name: isUpper ? 'Bolalar xonasi 2' : 'Asosiy Yotoqxona',
    roomType: isUpper ? 'kids' : 'bedroom',
    floorMat: 'parquet',
    targetTempC: 22,
  });

  // Markaziy Xoll
  desiredMeta.push({
    id: makeArchId('rm'),
    seedX: (xHallL + xHallR) * 0.5,
    seedY: (yTopSplit + H) * 0.5,
    name: isUpper ? '2-qavat Xoll' : 'Markaziy Xoll',
    roomType: 'hallway',
    floorMat: 'tile_grey',
    targetTempC: 20,
  });

  // O'ng qanot pastki qismi: Sanuzel(lar) + qo'shimcha Yotoqxona
  const yBathEnd = roundCm(yTopSplit + (H - yTopSplit) * 0.42);
  addWallSegment(fl, xHallR, yBathEnd, W, yBathEnd, { thickness: intT, kind: 'interior' });

  if (bathCount >= 2 && !isUpper) {
    const xBathMid = roundCm((xHallR + W) * 0.5);
    addWallSegment(fl, xBathMid, yTopSplit, xBathMid, yBathEnd, { thickness: intT, kind: 'interior' });
    desiredMeta.push({ id: makeArchId('rm'), seedX: (xHallR + xBathMid) * 0.5, seedY: (yTopSplit + yBathEnd) * 0.5, name: 'Umumiy Sanuzel', roomType: 'bathroom', floorMat: 'tile_aqua', targetTempC: 25 });
    desiredMeta.push({ id: makeArchId('rm'), seedX: (xBathMid + W) * 0.5, seedY: (yTopSplit + yBathEnd) * 0.5, name: 'Master Sanuzel', roomType: 'bathroom', floorMat: 'tile_aqua', targetTempC: 25 });
  } else {
    desiredMeta.push({ id: makeArchId('rm'), seedX: (xHallR + W) * 0.5, seedY: (yTopSplit + yBathEnd) * 0.5, name: 'Sanuzel / Hammom', roomType: 'bathroom', floorMat: 'tile_aqua', targetTempC: 25 });
  }

  if (bedCount >= 3 && isUpper) {
    const xRightMid = roundCm((xHallR + W) * 0.5);
    addWallSegment(fl, xRightMid, yBathEnd, xRightMid, H, { thickness: intT, kind: 'interior' });
    desiredMeta.push({ id: makeArchId('rm'), seedX: (xHallR + xRightMid) * 0.5, seedY: (yBathEnd + H) * 0.5, name: 'Yotoqxona 3', roomType: 'bedroom', floorMat: 'parquet', targetTempC: 22 });
    desiredMeta.push({ id: makeArchId('rm'), seedX: (xRightMid + W) * 0.5, seedY: (yBathEnd + H) * 0.5, name: 'Kabinet / Garderob', roomType: 'office', floorMat: 'parquet', targetTempC: 21 });
  } else {
    desiredMeta.push({ id: makeArchId('rm'), seedX: (xHallR + W) * 0.5, seedY: (yBathEnd + H) * 0.5, name: isUpper ? 'Mehmon Yotoqxonasi' : 'Bolalar xonasi', roomType: 'kids', floorMat: 'laminate', targetTempC: 23 });
  }

  // Zina va MEP shaxta
  if (twoStory) {
    fl.elements.push({
      id: makeArchId('st'),
      kind: 'stair',
      shape: 'l_turn',
      x: roundCm((xHallL + xHallR) * 0.5),
      y: roundCm(yTopSplit + 1.35),
      wM: roundCm(Math.min(1.9, hallW - 0.25)),
      dM: 2.40,
      rotationDeg: 0,
    });
  }
  fl.elements.push({
    id: makeArchId('sh'),
    kind: 'shaft',
    label: 'ВК/ОВ Shaxta',
    x: roundCm(xHallR + 0.32),
    y: roundCm(yTopSplit + 0.28),
    wM: 0.45,
    dM: 0.30,
    rotationDeg: 0,
  });

  fl.roomMeta = desiredMeta;
  planarizeFloorGraph(fl);
  autoPopulateStandardOpenings(fl, W, H, xHallL, xHallR, yTopSplit, isUpper);
  return fl;
}

function autoPopulateStandardOpenings(fl, W, H, xHallL, xHallR, yTopSplit, isUpper) {
  const nm = new Map(fl.nodes.map((n) => [n.id, n]));
  const placeAt = (tx, ty, spec) => {
    let bestW = null;
    let bestD = 0.45;
    for (const w of fl.walls) {
      const a = nm.get(w.n1);
      const b = nm.get(w.n2);
      if (!a || !b) continue;
      const pr = projectOnSegment(tx, ty, a.x, a.y, b.x, b.y);
      if (pr.dist < bestD && pr.len >= (spec.widthM || 0.9) + 0.25) {
        bestD = pr.dist;
        bestW = w;
      }
    }
    if (bestW) addWallOpening(fl, bestW.id, tx, ty, spec);
  };

  // Tashqi derazalar va asosiy kirish eshigi
  placeAt(xHallL * 0.5, 0, { type: 'window', subType: 'panoramic', widthM: 2.20, heightM: 2.10, sillM: 0.15 });
  placeAt((xHallL + W) * 0.5, 0, { type: 'window', subType: 'standard', widthM: 1.80, heightM: 1.60, sillM: 0.85 });
  placeAt(0, H * 0.25, { type: 'window', subType: 'standard', widthM: 1.60, heightM: 1.60, sillM: 0.85 });
  placeAt(0, H * 0.64, { type: 'window', subType: 'standard', widthM: 1.50, heightM: 1.50, sillM: 0.90 });
  placeAt(W, H * 0.80, { type: 'window', subType: 'standard', widthM: 1.70, heightM: 1.60, sillM: 0.85 });
  placeAt(W, (yTopSplit + H * 0.62) * 0.5, { type: 'window', subType: 'bathroom', widthM: 0.70, heightM: 0.65, sillM: 1.55 });

  if (!isUpper) {
    placeAt((xHallL + xHallR) * 0.5, H, { type: 'door', subType: 'double', widthM: 1.20, heightM: 2.20 });
    placeAt(0, H * 0.89, { type: 'door', subType: 'single', widthM: 0.85, heightM: 2.05 }); // Qozonxona alohida tashqi eshik
  }

  // Ichki xona eshiklari (xoll devorlari bo'ylab)
  placeAt(xHallL, yTopSplit + 0.70, { type: 'door', subType: 'double', widthM: 1.20, heightM: 2.10 });
  placeAt(xHallL, H * 0.68, { type: 'door', subType: 'single', widthM: 0.90, heightM: 2.10 });
  placeAt((xHallL + xHallR) * 0.5, yTopSplit, { type: 'door', subType: 'single', widthM: 0.90, heightM: 2.10 });
  placeAt(xHallR, yTopSplit + 0.75, { type: 'door', subType: 'single', widthM: 0.80, heightM: 2.10 });
  placeAt(xHallR, H - 1.10, { type: 'door', subType: 'single', widthM: 0.90, heightM: 2.10 });
}

/**
 * Mavjud qavat devorlariga mos realistik rangli 3D LiDAR nuqtalar bulutini generatsiya qiladi
 * (obyektda iPhone Pro LiDAR bilan skaner qilingandagi haqiqiy ko'rinishni namoyish va test qilish uchun!).
 */
export function synthesizeRealisticLidarCloudForFloor(floor, densityPerM2 = 55) {
  const nm = new Map((floor.nodes || []).map((n) => [n.id, n]));
  const openingsByWall = new Map();
  for (const op of floor.openings || []) {
    if (!openingsByWall.has(op.wallId)) openingsByWall.set(op.wallId, []);
    openingsByWall.get(op.wallId).push(op);
  }

  // Deterministik pseudo-random (test va vizual barqarorlik uchun)
  let seed = 1337 + (floor.id || 1) * 97;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const jitter = (amp) => (rnd() - 0.5) * 2 * amp;

  const pts = [];
  const H = Number(floor.heightM) || 3.0;

  for (const w of floor.walls || []) {
    const a = nm.get(w.n1);
    const b = nm.get(w.n2);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.1) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const nx = -uy;
    const ny = ux;
    const halfT = (w.thickness || 0.2) * 0.5;
    const ops = openingsByWall.get(w.id) || [];

    const count = Math.min(2200, Math.round(len * H * densityPerM2));
    for (let k = 0; k < count; k++) {
      const sRatio = rnd();
      const sM = sRatio * len;
      const z = rnd() * H;

      // Oyna va eshik o'rni bo'sh qoladi!
      let inOpening = false;
      for (const op of ops) {
        const cM = op.t * len;
        if (Math.abs(sM - cM) <= op.widthM * 0.5) {
          const z0 = op.sillM || 0;
          const z1 = z0 + (op.heightM || 2.1);
          if (z >= z0 && z <= z1) {
            inOpening = true;
            break;
          }
        }
      }
      if (inOpening) continue;

      const side = rnd() < 0.5 ? -1 : 1;
      const px = a.x + ux * sM + nx * side * halfT + jitter(0.016);
      const py = a.y + uy * sM + ny * side * halfT + jitter(0.016);
      const pz = Math.max(0, z + jitter(0.012));

      // Balandlik va devor turiga qarab LiDAR skaner gips/g'isht + balandlik spektri
      const hNorm = pz / H;
      const isExt = w.kind === 'exterior';
      const r = isExt ? (0.10 + 0.72 * hNorm) : (0.20 + 0.55 * hNorm);
      const g = 0.62 + 0.26 * Math.sin(hNorm * Math.PI);
      const bl = 0.94 - 0.52 * hNorm;
      pts.push(roundMm(px), roundMm(py), roundMm(pz), roundCm(r), roundCm(g), roundCm(bl));
    }
  }

  return {
    kind: 'lidar_cloud',
    visible: true,
    opacity: 0.82,
    sliceHeightM: 1.20,
    pointStride6: pts,
  };
}

/**
 * Obyektda daftar varag'iga qo'lda chizilgan zamer eskizi (demo podlojka PNG/SVG data URL).
 */
export function createDemoHandSketchSvgDataUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="800" viewBox="0 0 960 800">
    <rect width="960" height="800" fill="#fcfaf2"/>
    <defs>
      <pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#dbeafe" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="960" height="800" fill="url(#g)"/>
    <g stroke="#1e293b" stroke-width="10" fill="none" stroke-linecap="round">
      <rect x="120" y="90" width="720" height="600"/>
      <line x1="430" y1="90" x2="430" y2="690" stroke-width="6"/>
      <line x1="560" y1="350" x2="560" y2="690" stroke-width="6"/>
      <line x1="430" y1="350" x2="840" y2="350" stroke-width="6"/>
      <line x1="120" y1="410" x2="430" y2="410" stroke-width="6"/>
      <line x1="560" y1="500" x2="840" y2="500" stroke-width="6"/>
    </g>
    <g fill="#0369a1" font-family="monospace" font-size="20" font-weight="bold">
      <text x="435" y="65">12.00 m (Zamer)</text>
      <text x="32" y="400" transform="rotate(-90 52 400)">10.00 m</text>
      <text x="210" y="255">ZAL 25 m²</text>
      <text x="195" y="555">OSHXONA 16 m²</text>
      <text x="580" y="230">SPALNYA 21 m²</text>
      <text x="625" y="435">SANUZEL</text>
      <text x="610" y="605">BOLALAR</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * public/scans/office_135528_cloud.bin (10 bayt/nuqta) formatidagi haqiqiy 3D RGB skan bulutini qavatga ulaydi.
 */
export function decodeCompactCloudBinToFloorOverlay(arrayBuffer, floor) {
  if (!arrayBuffer || !floor?.scanOverlay) return 0;
  const u8 = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const count = Math.floor(u8.byteLength / 10);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const o = i * 10;
    const xM = dv.getUint16(o, true) / 1000;
    const yM = dv.getUint16(o + 2, true) / 1000;
    const zM = dv.getInt16(o + 4, true) / 1000;
    const r = roundCm(u8[o + 6] / 255);
    const g = roundCm(u8[o + 7] / 255);
    const b = roundCm(u8[o + 8] / 255);
    pts.push(roundMm(xM), roundMm(yM), roundMm(zM), r, g, b);
  }
  floor.scanOverlay.pointStride6 = pts;
  if (!floor.scanOverlay.presetId || !floor.scanOverlay.snapGuides) {
    extractScanSnapGuides(floor);
  }
  return count;
}

/**
 * SPS AI Ofis Prototipi — 3D LiDAR (.las / .ply / .obj) lazer o'lchovlari asosida 1:1 BIM model:
 * - Asosiy loyihachilar zali (7.37 × 7.37 m) + kirish xolli (2.35 × 4.02 m) -> jami 63.8 m² в свету (H = 3.10 m);
 * - Zinaxona (Лестничная клетка 4.05 × 2.38 m = 9.6 m²) + tushuvchi zina marshi;
 * - Chap devorda: Kirish eshigi (0.95×2.35 m), Vitraj proyom (1.05×2.40 m, h=0.15 m) va 2 ta Panoramali Lenta Oyna (2×2.15 m, В=1.85 m, h=1.00 m);
 * - Skan-Magnit (snapGuides) barcha devor va burchaklarga ulangan + 2D RGB Ortofoto (12 ta ish stoli ko'rinadi!).
 */
export function buildSpsOffice135528Project({ withWalls = true } = {}) {
  const fl = createEmptyFloor(2, '2-qavat · Oxirgi etaj (Bizning Ofis)', 0, 3.10);
  fl.subfloorIsHeated = true; // Ostida iliq 1-qavat bor (gruntsiz!), tepasi esa oxirgi etaj tomi (Кровля -16°C)!
  fl.isTopFloor = true;
  fl.mepCornerHint = {
    x: 5.56,
    y: 0.86,
    radX: 6.14,
    boilerX: 6.84,
    boilerY: 0.88,
    roomName: 'Loyihachilar ofisi (Тех. бурчак)',
  };
  fl.ahuAnchor = { x: 6.22, y: 2.35 };
  fl.officeInterior = {
    enabled: true,
    upperRow: { y: 6.12, xList: [6.55, 7.95, 9.55, 10.95], chairSide: 1 },
    lowerDoubleRow: { y: 9.55, xList: [6.35, 7.75, 9.35, 10.75] },
    cabinet: { x: 9.15, y: 4.96, wM: 1.65, dM: 0.42, hM: 2.15 },
    plant: { x: 5.42, y: 4.90 },
    doormat: { x: 5.48, y: 2.58, wM: 0.68, dM: 0.96 },
    woodSlatWall: { x: 12.39, y0: 5.60, y1: 11.40 },
    ledLamps: [
      { x: 7.25, y: 6.12, wM: 1.55 },
      { x: 10.25, y: 6.12, wM: 1.55 },
      { x: 7.05, y: 9.55, wM: 1.55 },
      { x: 10.05, y: 9.55, wM: 1.55 },
      { x: 6.20, y: 3.35, wM: 1.30 },
    ],
  };

  fl.scanOverlay = {
    kind: 'lidar_cloud',
    presetId: 'sps-office-135528',
    sourceFileName: 'Scaniverse 2026-11-17 135528 (.las / .ply / .obj)',
    rawPointCount: 620969,
    alignedDeg: 77.70,
    detectedFloorZ: 1.55,
    detectedCeilingM: 3.10,
    visible: true,
    opacity: 0.88,
    sliceHeightM: 1.20,
    orthoUrl: './scans/office_135528_ortho.png',
    cloudBinUrl: './scans/office_135528_cloud.bin',
    orthoWorldBounds: { minX: 0.20, minY: 0.20, maxX: 13.907, maxY: 12.786 },
    bounds: { minX: 0.50, minY: 0.50, maxX: 13.05, maxY: 12.50 },
    pointStride6: [],
    snapGuides: {
      xRails: [
        { pos: 0.77, min: 0.70, max: 3.08, strength: 1900 },
        { pos: 5.04, min: 0.70, max: 12.09, strength: 4800 },
        { pos: 7.39, min: 0.70, max: 4.72, strength: 2500 },
        { pos: 12.41, min: 4.72, max: 12.09, strength: 5500 },
      ],
      yRails: [
        { pos: 0.70, min: 0.77, max: 7.39, strength: 3600 },
        { pos: 3.08, min: 0.77, max: 5.04, strength: 5050 },
        { pos: 4.72, min: 5.04, max: 12.41, strength: 3525 },
        { pos: 12.09, min: 5.04, max: 12.41, strength: 5380 },
      ],
      corners: [
        { x: 0.77, y: 0.70 },
        { x: 5.04, y: 0.70 },
        { x: 7.39, y: 0.70 },
        { x: 0.77, y: 3.08 },
        { x: 5.04, y: 3.08 },
        { x: 5.04, y: 4.72 },
        { x: 7.39, y: 4.72 },
        { x: 12.41, y: 4.72 },
        { x: 5.04, y: 12.09 },
        { x: 12.41, y: 12.09 },
      ],
      openings: [
        { kind: 'door', axis: 'x', x: 4.93, y: 2.58, widthM: 0.95, heightM: 2.35, sillM: 0 },
        { kind: 'window', axis: 'x', x: 4.93, y: 6.95, widthM: 2.10, heightM: 1.75, sillM: 0.90 },
        { kind: 'window', axis: 'x', x: 4.93, y: 10.05, widthM: 2.10, heightM: 1.75, sillM: 0.90 },
      ],
    },
  };

  if (withWalls) {
    // Ichki yuzalar (в свету) lazer o'lchovga 0.0 mm ustma-ust tushadigan aniq devor o'qlari:
    // 1) Zinaxona konturi (1-qavatdan 2-qavatga chiquvchi zinaxona: X_in = 0.77..4.82, Y_in = 0.70..3.08)
    addWallSegment(fl, 0.58, 0.51, 4.93, 0.51, { thickness: 0.38, kind: 'exterior', typeId: 'ext_brick_400' });
    addWallSegment(fl, 0.58, 0.51, 0.58, 3.27, { thickness: 0.38, kind: 'exterior', typeId: 'ext_brick_400' });
    addWallSegment(fl, 0.58, 3.27, 4.93, 3.27, { thickness: 0.38, kind: 'exterior', typeId: 'ext_brick_400' });
    const wEntryDiv = addWallSegment(fl, 4.93, 0.51, 4.93, 3.27, { thickness: 0.22, kind: 'interior', typeId: 'int_brick_250' });

    // 2) Kirish xolli (Тех. бурчак bilan) va Asosiy loyihachilar zali (X_in = 5.04..7.39 / 12.41, Y_in = 0.70 / 4.72..12.09)
    addWallSegment(fl, 4.93, 0.51, 7.58, 0.51, { thickness: 0.38, kind: 'exterior', typeId: 'ext_brick_400' });
    addWallSegment(fl, 7.58, 0.51, 7.58, 4.53, { thickness: 0.38, kind: 'exterior', typeId: 'ext_brick_400' });
    addWallSegment(fl, 7.58, 4.53, 12.60, 4.53, { thickness: 0.38, kind: 'exterior', typeId: 'ext_brick_400' });
    addWallSegment(fl, 12.60, 4.53, 12.60, 12.28, { thickness: 0.38, kind: 'exterior', typeId: 'ext_brick_400' });
    addWallSegment(fl, 4.93, 12.28, 12.60, 12.28, { thickness: 0.38, kind: 'exterior', typeId: 'ext_brick_400' });
    const wLeftFacade = addWallSegment(fl, 4.93, 3.27, 4.93, 12.28, { thickness: 0.22, kind: 'exterior', typeId: 'ext_gasblock_300' });

    fl.roomMeta = [
      {
        id: makeArchId('rmeta'),
        seedX: 8.80,
        seedY: 8.40,
        name: 'Loyihachilar ofisi (2-qavat)',
        roomType: 'office',
        floorMat: 'laminate',
        targetTempC: 22,
      },
      {
        id: makeArchId('rmeta'),
        seedX: 2.80,
        seedY: 1.40,
        name: 'Zinaxona (1→2 qavat)',
        roomType: 'stairwell',
        floorMat: 'tile',
        targetTempC: 16,
      },
    ];

    fl.elements.push({
      id: makeArchId('st'),
      kind: 'stair',
      direction: 'down', // 2-qavat plitasidan 1-qavatga tushuvchi zina (2-qavat ustiga chiqib ketmaydi!)
      dropHeightM: 2.85,
      openingRect: { minX: 0.84, maxX: 3.96, minY: 1.84, maxY: 3.00 },
      label: 'Zina (1-qavatdan chiqish)',
      x: 2.40,
      y: 2.42,
      wM: 1.16,
      dM: 3.12,
      rotationDeg: 90,
    });

    planarizeFloorGraph(fl);

    // Kirish eshigi va 2 ta katta ofis oynasi (ОК-1 va ОК-2 -> ularga mos 2 ta Radiator Р-1 va Р-2 tushadi!):
    if (wEntryDiv) {
      addWallOpening(fl, wEntryDiv.id, 4.93, 2.58, {
        type: 'door',
        subType: 'single',
        widthM: 0.95,
        heightM: 2.35,
        sillM: 0,
        swingDir: 1,
      });
    }
    if (wLeftFacade) {
      addWallOpening(fl, wLeftFacade.id, 4.93, 6.95, {
        type: 'window',
        subType: 'standard',
        widthM: 2.10,
        heightM: 1.75,
        sillM: 0.90,
      });
      addWallOpening(fl, wLeftFacade.id, 4.93, 10.05, {
        type: 'window',
        subType: 'standard',
        widthM: 2.10,
        heightM: 1.75,
        sillM: 0.90,
      });
    }
  } else {
    planarizeFloorGraph(fl);
  }

  return {
    title: 'Bizning Ofis (2-qavat) — ОВиК + ТМ Loyihasi',
    isOfficeProject: true,
    floors: [fl],
  };
}

/**
 * Dastur ochilishi bilan foydalanuvchi 1-klikda sinab ko'rishi uchun tayyor arxitektura va 3D LiDAR Skan namunalari!
 */
export const BUILTIN_ARCH_PROTOTYPES = [
  {
    id: 'sps-office-135528',
    badge: '🏢 Bizning Ofis · 2-etaj',
    title: 'Bizning Ofis (2-qavat) — ОВиК + Фанкойл + ТМ (63.8 m²)',
    subtitle: 'Tyopliy pol + 2 Radiator + ПВУ CS-550 & 2 Кассетных Фанкойла + Бурчак Котёл + 12 ish stoli (3D Yurish)',
    withLidar: false,
    cleanStepByStep: false,
    prompt: null,
  },
  {
    id: 'tashkent-house-132',
    badge: 'Tayyor Loyiha',
    title: 'Toshkent Hovli Uy (12.4×10.8 m · 1-qavat)',
    subtitle: '8 xona: Zal, Oshxona, Xoll, 2 Yotoqxona, 2 Sanuzel, Qozonxona (TM)',
    withLidar: false,
    prompt: '12.4x10.8 m 1-qavatli uy: zal, oshxona, 2 yotoqxona, 2 sanuzel, qozonxona',
  },
  {
    id: 'lidar-iphone-138',
    badge: '📡 LiDAR Prototip',
    title: 'iPhone 16 Pro LiDAR Skan — Sergeli Hovli (3D Nuqtalar + Kesim)',
    subtitle: '18 000+ 3D LiDAR skan nuqtalari + Z=1.20m lazer tekisligi + Avto-tekislangan BIM devorlar',
    withLidar: true,
    prompt: '12.8x10.8 m 1-qavatli uy: zal, oshxona, 2 yotoqxona, 2 sanuzel, qozonxona',
  },
  {
    id: 'lidar-cottage-210',
    badge: '📡 2-Qavat LiDAR',
    title: '2-Qavatli Kottej + Zina + Shaxta (12.6×10.2 m)',
    subtitle: '1 va 2-qavat ustma-ust devorlari, G-zina, vitraj oynalar va LiDAR 3D buluti',
    withLidar: true,
    prompt: '2 qavatli kottej 12.6x10.2 m: zal, oshxona, 3 yotoqxona, 2 sanuzel, qozonxona',
  },
  {
    id: 'blank-clean',
    badge: 'Toza Varaq',
    title: 'Noldan Toza Varaq (0 m²)',
    subtitle: 'Devor, Xona konturi, Podlojka rasm yoki LiDAR skanerdan boshlash',
    withLidar: false,
    prompt: null,
  },
];

export function buildPrototypeProject(protoId = 'tashkent-house-132') {
  if (protoId === 'sps-office-135528') {
    return buildSpsOffice135528Project({ withWalls: true });
  }
  const meta = BUILTIN_ARCH_PROTOTYPES.find((p) => p.id === protoId) || BUILTIN_ARCH_PROTOTYPES[0];
  if (!meta.prompt) {
    return {
      title: 'Yangi Loyiha (SPS 2.0)',
      floors: [createEmptyFloor(1, '1-qavat', 0, 3.0)],
    };
  }
  const built = generateProjectFromAiPrompt(meta.prompt);
  built.title = meta.title;
  if (meta.withLidar) {
    for (const fl of built.floors) {
      fl.scanOverlay = synthesizeRealisticLidarCloudForFloor(fl, 42);
      extractScanSnapGuides(fl);
    }
  }
  return built;
}
