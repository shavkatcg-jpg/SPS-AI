/**
 * SPS Project 2.0 — Santex & Climate House Dala O'lchovi (Field Survey -> Revit) Moduli
 *
 * Qat'iy muhandislik qoidalari:
 * 1) XYZ, PTS, ASCII PLY va Binary Little-Endian PLY nuqta bulutlarini m / mm birlikda xavfsiz o'qiydi;
 * 2) Skan A–B 3D masofasini mustaqil Lazer Ruletka o'lchovi bilan solishtiradi va ruxsat etilgan chegaradan (mm) oshsa belgilaydi;
 * 3) Telefon LiDAR skanidan quvur diametri, kanalizatsiya qiyaligi/inverti yoki yashirin quvurni taxmin qilib tasdiqlashni QAT'IY BLOKLAYDI;
 * 4) Lazerda tasdiqlangan 5,40 × 3,60 × 2,80 m xonani DXF'da aniq 5400 × 3600 mm (Millimeters, $INSUNITS=4) va CSV jadvaliga chiqaradi;
 * 5) Yetishmayotgan dala ma'lumotlari + savollar ro'yxatini (AI Checklist) shakllantiradi va Mas'ul Muhandis tasdig'ini yuritadi.
 */

import {
  createEmptyFloor,
  addRectWalls,
  planarizeFloorGraph,
  roundMm,
  makeArchId,
} from '../core/planar-wall-graph.js';

export const MEP_POINT_TYPES = Object.freeze(['Suv', 'Kanalizatsiya', 'Vent', 'Isitish', 'Uskuna', 'Boshqa']);

export const MEP_DXF_LAYERS = Object.freeze({
  Suv: 'MEP_SUV',
  Kanalizatsiya: 'MEP_KANALIZATSIYA',
  Vent: 'MEP_VENT',
  Isitish: 'MEP_ISITISH',
  Uskuna: 'MEP_USKUNA',
  Boshqa: 'MEP_BOSHQA',
});

export const SURVEY_LIMITS = Object.freeze({
  maxScanBytes: 32_000_000,
  maxPointsRead: 1_000_000,
  previewSampleLimit: 8000,
  maxCoordAbsM: 10_000,
});

const NUM_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function assertFiniteNum(val, label, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${label} qiymati noto‘g‘ri (${min}..${max} oralig‘ida bo‘lishi kerak).`);
  }
  return n;
}

export function distance3d(a, b) {
  const ax = Array.isArray(a) ? a[0] : a.x;
  const ay = Array.isArray(a) ? a[1] : a.y;
  const az = Array.isArray(a) ? a[2] : a.z;
  const bx = Array.isArray(b) ? b[0] : b.x;
  const by = Array.isArray(b) ? b[1] : b.y;
  const bz = Array.isArray(b) ? b[2] : b.z;
  return Math.hypot(bx - ax, by - ay, bz - az);
}

/**
 * XY/XZ/YZ proyeksiyasida ikki nuqta ustma-ust tushib balandlikni yashirayotganini tekshiradi.
 */
export function isAmbiguous2dProjectionPick(targetPt, allPts, plane = 'xy', tol2dM = 0.004) {
  const axes = plane === 'xz' ? [0, 2] : plane === 'yz' ? [1, 2] : [0, 1];
  const [u, v] = axes;
  for (const pt of allPts || []) {
    if (pt === targetPt) continue;
    const d2 = Math.hypot(pt[u] - targetPt[u], pt[v] - targetPt[v]);
    const d3 = distance3d(pt, targetPt);
    if (d2 <= tol2dM && d3 > 0.008) {
      return true;
    }
  }
  return false;
}

/**
 * Skan A–B 3D masofasi va Lazer ruletka o'lchovi solishtiruvi.
 */
export function evaluateLaserControlCheck(rawCheck) {
  const name = String(rawCheck?.name || 'Nazorat masofasi').trim();
  if (!name) throw new Error('Nazorat nomini kiriting.');
  const scanM = assertFiniteNum(rawCheck?.scanM, 'Skan masofasi (m)', 0.001, 1000);
  const laserM = assertFiniteNum(rawCheck?.laserM, 'Lazer masofasi (m)', 0.001, 1000);
  const toleranceMm = assertFiniteNum(rawCheck?.toleranceMm ?? 20, 'Ruxsat etilgan farq (mm)', 0, 5000);

  const deltaMm = Math.round(Math.abs(scanM - laserM) * 1000 * 100) / 100;
  const signedDeltaMm = Math.round((scanM - laserM) * 1000 * 100) / 100;
  const pass = deltaMm <= toleranceMm + 1e-7;

  return {
    name,
    pointA: Array.isArray(rawCheck?.pointA) ? rawCheck.pointA.map(roundMm) : null,
    pointB: Array.isArray(rawCheck?.pointB) ? rawCheck.pointB.map(roundMm) : null,
    scanM: roundMm(scanM),
    laserM: roundMm(laserM),
    toleranceMm,
    deltaMm,
    signedDeltaMm,
    pass,
    flagStatus: pass ? 'MOS' : 'CHEGARADAN_OSHDI_QAYTA_OLCHANG',
  };
}

/**
 * MEP nuqtasini qat'iy muhandislik qoidalari asosida tekshiradi:
 * Telefon LiDAR skanidan quvur diametri, kanalizatsiya qiyaligi/inverti yoki yashirin quvurni
 * taxmin qilib "verified = true" qilish QAT'IY MAN ETILADI!
 */
export function validateAndNormalizeMepPoint(rawPt, roomBounds = null) {
  if (!rawPt || typeof rawPt !== 'object') throw new Error('MEP nuqtasi formati noto‘g‘ri.');
  const name = String(rawPt.name || '').trim();
  if (!name || name.length > 100) throw new Error('MEP nuqtasi nomini kiriting (1..100 belgi).');
  const type = rawPt.type;
  if (!MEP_POINT_TYPES.includes(type)) {
    throw new Error(`MEP tizim turi noto‘g‘ri: ${type}`);
  }

  const x = assertFiniteNum(rawPt.x, 'X koordinata (m)', -1000, 1000);
  const y = assertFiniteNum(rawPt.y, 'Y koordinata (m)', -1000, 1000);
  const z = assertFiniteNum(rawPt.z, 'Z polga nisbatan balandlik (m)', -100, 1000);

  const source = ['laser_manual', 'scan_only', 'unknown'].includes(rawPt.source)
    ? rawPt.source
    : 'laser_manual';
  const visibility = rawPt.visibility === 'concealed' ? 'concealed' : 'exposed';
  const diameterMm =
    rawPt.diameterMm !== null && rawPt.diameterMm !== undefined && rawPt.diameterMm !== ''
      ? assertFiniteNum(rawPt.diameterMm, 'Quvur diametri (mm)', 8, 2000)
      : null;
  const slopePct =
    rawPt.slopePct !== null && rawPt.slopePct !== undefined && rawPt.slopePct !== ''
      ? assertFiniteNum(rawPt.slopePct, 'Kanalizatsiya qiyaligi (%)', 0, 50)
      : null;
  const invertConfirmed = Boolean(rawPt.invertConfirmed);
  const verified = Boolean(rawPt.verified);
  const detail = String(rawPt.detail || '').trim().slice(0, 1000);
  const skuCode = String(rawPt.skuCode || '').trim().slice(0, 40);
  const skuBrand = String(rawPt.skuBrand || '').trim().slice(0, 60);
  const skuArticle = String(rawPt.skuArticle || '').trim().slice(0, 80);
  const priceUsd =
    rawPt.priceUsd !== null && rawPt.priceUsd !== undefined && rawPt.priceUsd !== ''
      ? assertFiniteNum(rawPt.priceUsd, 'Ulgurji narx ($)', 0, 1_000_000)
      : null;

  // QAT'IY MUHANDISLIK CHEKLOVLARI (Task 2 talabi):
  if (verified) {
    if (source === 'scan_only' && diameterMm !== null) {
      throw new Error(
        `«${name}»: Telefon LiDAR skanidan quvur diametrini (Ø${diameterMm} mm) tasdiqlab bo‘lmaydi — joyida shtangensirkul yoki markirovka bilan o‘lchang!`,
      );
    }
    if (source === 'scan_only' && type === 'Kanalizatsiya' && (slopePct !== null || invertConfirmed)) {
      throw new Error(
        `«${name}»: Telefon skanidan kanalizatsiya qiyaligi (uklon) yoki invert otmetkasini tasdiqlab bo‘lmaydi — joyida uroven va ruletka bilan tekshiring!`,
      );
    }
    if (visibility === 'concealed' && (source === 'scan_only' || detail.length < 5)) {
      throw new Error(
        `«${name}»: Yashirin (devor/pol ichidagi) quvurni skan yoki taxmin bilan tasdiqlab bo‘lmaydi — reviziya/ochib ko‘rish dalilini izohga yozing!`,
      );
    }
    if (roomBounds && roomBounds.length > 0 && roomBounds.width > 0) {
      if (x < -1e-6 || x > roomBounds.length + 1e-6 || y < -1e-6 || y > roomBounds.width + 1e-6) {
        throw new Error(
          `«${name}»: Tasdiqlangan nuqtaning X/Y koordinatasi (${x}, ${y}) xona chegarasidan (${roomBounds.length}×${roomBounds.width} m) tashqarida!`,
        );
      }
    }
  }

  return {
    id: String(rawPt.id || makeArchId('mep')),
    name,
    type,
    x: roundMm(x),
    y: roundMm(y),
    z: roundMm(z),
    source,
    visibility,
    diameterMm,
    slopePct,
    invertConfirmed,
    detail,
    skuCode,
    skuBrand,
    skuArticle,
    priceUsd,
    verified,
  };
}

/**
 * XYZ, PTS, ASCII PLY va Binary Little-Endian PLY nuqta buluti fayllarini o'qiydi!
 */
export function parsePointCloudScan(input, formatExt, unit = 'm', fileName = 'skan.xyz') {
  if (unit !== 'm' && unit !== 'mm') {
    throw new Error('Skan birligi aniq "m" yoki "mm" bo‘lishi shart.');
  }
  const scale = unit === 'mm' ? 0.001 : 1.0;
  const ext = String(formatExt || '').toLowerCase().replace(/^\./, '');
  if (!['xyz', 'pts', 'ply'].includes(ext)) {
    throw new Error('Faqat .xyz, .pts yoki .ply skan fayli qo‘llanadi.');
  }

  // Binary PLY (ArrayBuffer / Uint8Array) qo'llovi
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (bytes.byteLength > SURVEY_LIMITS.maxScanBytes) {
      throw new Error('Skan fayli 32 MB chegaradan katta.');
    }
    const headAscii = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(4096, bytes.byteLength)));
    if (ext === 'ply' && headAscii.includes('format binary_little_endian 1.0')) {
      return parseBinaryLittleEndianPly(bytes, headAscii, scale, unit, fileName);
    }
    const fullText = new TextDecoder('utf-8').decode(bytes);
    return parseTextPointCloud(fullText, ext, scale, unit, fileName);
  }

  return parseTextPointCloud(String(input || ''), ext, scale, unit, fileName);
}

function createSampler(unit, fileName) {
  let count = 0;
  let stride = 1;
  let sample = [];
  const extrema = Array(6).fill(null);

  const pushPoint = (pt) => {
    const idx = count++;
    if (count > SURVEY_LIMITS.maxPointsRead) {
      throw new Error('1 000 000 nuqtadan katta bulutni CloudCompare’da xona bo‘yicha qirqib yuklang.');
    }
    for (let a = 0; a < 3; a++) {
      if (!Number.isFinite(pt[a]) || Math.abs(pt[a]) > SURVEY_LIMITS.maxCoordAbsM) {
        throw new Error(`Skan nuqtasi (${idx + 1}) koordinatasi chegaradan tashqarida.`);
      }
      if (!extrema[a * 2] || pt[a] < extrema[a * 2].pt[a]) extrema[a * 2] = { idx, pt };
      if (!extrema[a * 2 + 1] || pt[a] > extrema[a * 2 + 1].pt[a]) extrema[a * 2 + 1] = { idx, pt };
    }
    if (idx % stride !== 0) return;
    sample.push({ idx, pt });
    if (sample.length > SURVEY_LIMITS.previewSampleLimit) {
      stride *= 2;
      sample = sample.filter((r) => r.idx % stride === 0);
    }
  };

  const finalize = () => {
    if (count === 0) throw new Error('Skan faylida yaroqli nuqtalar topilmadi.');
    const extMap = new Map(extrema.filter(Boolean).map((e) => [e.idx, e]));
    const rest = sample.filter((r) => !extMap.has(r.idx)).slice(0, SURVEY_LIMITS.previewSampleLimit - extMap.size);
    const points = [...extMap.values(), ...rest]
      .sort((a, b) => a.idx - b.idx)
      .map((r) => [roundMm(r.pt[0]), roundMm(r.pt[1]), roundMm(r.pt[2])]);
    return { name: fileName, unit, count, points };
  };

  return { pushPoint, finalize };
}

function parseBinaryLittleEndianPly(bytes, headAscii, scale, unit, fileName) {
  const endMarker = 'end_header\n';
  const endMarkerCrLf = 'end_header\r\n';
  let dataStart = headAscii.indexOf(endMarkerCrLf);
  if (dataStart >= 0) dataStart += endMarkerCrLf.length;
  else {
    dataStart = headAscii.indexOf(endMarker);
    if (dataStart >= 0) dataStart += endMarker.length;
  }
  if (dataStart < 0) throw new Error('Binary PLY end_header topilmadi.');

  const headerLines = headAscii.slice(0, dataStart).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let vertexCount = 0;
  let inVertex = false;
  const props = [];
  const typeByteSizes = {
    char: 1, int8: 1, uchar: 1, uint8: 1,
    short: 2, int16: 2, ushort: 2, uint16: 2,
    int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4,
    double: 8, float64: 8,
  };

  for (const ln of headerLines) {
    const parts = ln.split(/\s+/);
    if (parts[0] === 'element') {
      inVertex = parts[1] === 'vertex';
      if (inVertex) vertexCount = parseInt(parts[2], 10) || 0;
    } else if (parts[0] === 'property' && inVertex) {
      if (parts[1] === 'list') throw new Error('Vertex ichida list xossali Binary PLY qo‘llanmaydi.');
      const t = parts[1];
      const name = parts[2];
      if (/^(?:f_dc_|f_rest_|scale_\d|rot_\d|opacity$)/.test(name)) {
        throw new Error('Gaussian Splat PLY fayli o‘lchov nuqta buluti emas — oddiy Point Cloud PLY/XYZ tanlang.');
      }
      if (!typeByteSizes[t]) throw new Error(`Noma’lum PLY ustun turi: ${t}`);
      props.push({ name, type: t, size: typeByteSizes[t] });
    }
  }

  const rowStride = props.reduce((s, p) => s + p.size, 0);
  if (!vertexCount || bytes.byteLength < dataStart + vertexCount * rowStride) {
    throw new Error('Binary PLY bayt uzunligi vertex soniga yetmaydi.');
  }

  let off = 0;
  const propOffsets = {};
  for (const p of props) {
    propOffsets[p.name] = { offset: off, type: p.type };
    off += p.size;
  }
  if (!propOffsets.x || !propOffsets.y || !propOffsets.z) {
    throw new Error('Binary PLY vertex qismida x, y, z topilmadi.');
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset + dataStart, vertexCount * rowStride);
  const readCoord = (base, spec) => {
    const pos = base + spec.offset;
    if (spec.type === 'float' || spec.type === 'float32') return dv.getFloat32(pos, true);
    if (spec.type === 'double' || spec.type === 'float64') return dv.getFloat64(pos, true);
    if (spec.type === 'int' || spec.type === 'int32') return dv.getInt32(pos, true);
    if (spec.type === 'short' || spec.type === 'int16') return dv.getInt16(pos, true);
    return dv.getUint8(pos);
  };

  const sampler = createSampler(unit, fileName);
  for (let i = 0; i < vertexCount; i++) {
    const base = i * rowStride;
    sampler.pushPoint([
      readCoord(base, propOffsets.x) * scale,
      readCoord(base, propOffsets.y) * scale,
      readCoord(base, propOffsets.z) * scale,
    ]);
  }
  return sampler.finalize();
}

function parseTextPointCloud(text, ext, scale, unit, fileName) {
  if (!text.trim() || text.length > SURVEY_LIMITS.maxScanBytes) {
    throw new Error('Skan fayli bo‘sh yoki 32 MB dan katta.');
  }
  const sampler = createSampler(unit, fileName);
  const rawLines = text.split(/\r?\n/);

  if (ext === 'ply') {
    let idx = 0;
    const nextNonEmpty = () => {
      while (idx < rawLines.length) {
        const s = rawLines[idx++].trim();
        if (s && !s.startsWith('comment') && !s.startsWith('obj_info')) return s;
      }
      return null;
    };
    if (nextNonEmpty() !== 'ply') throw new Error('PLY sarlavhasi topilmadi.');
    const fmt = nextNonEmpty();
    if (fmt !== 'format ascii 1.0') {
      throw new Error('Matnli o‘qishda faqat ASCII PLY 1.0 (yoki ArrayBuffer orqali Binary PLY) qo‘llanadi.');
    }
    const elements = [];
    let curEl = null;
    let headerClosed = false;
    while (idx < rawLines.length) {
      const ln = rawLines[idx++].trim();
      if (!ln || ln.startsWith('comment') || ln.startsWith('obj_info')) continue;
      if (ln === 'end_header') { headerClosed = true; break; }
      const parts = ln.split(/\s+/);
      if (parts[0] === 'element') {
        curEl = { name: parts[1], count: parseInt(parts[2], 10) || 0, props: [] };
        elements.push(curEl);
      } else if (parts[0] === 'property' && curEl) {
        const pName = parts[parts.length - 1];
        if (/^(?:f_dc_|f_rest_|scale_\d|rot_\d|opacity$)/.test(pName)) {
          throw new Error('Gaussian Splat PLY qo‘llanmaydi — oddiy XYZ/PTS/PLY nuqta bulutini eksport qiling.');
        }
        curEl.props.push({ name: pName, isList: parts[1] === 'list' });
      }
    }
    const vEl = elements.find((e) => e.name === 'vertex');
    if (!headerClosed || !vEl || !vEl.count) throw new Error('PLY vertex sarlavhasi topilmadi.');
    const xIdx = vEl.props.findIndex((p) => p.name === 'x');
    const yIdx = vEl.props.findIndex((p) => p.name === 'y');
    const zIdx = vEl.props.findIndex((p) => p.name === 'z');
    if (xIdx < 0 || yIdx < 0 || zIdx < 0) throw new Error('PLY vertex qismida x, y, z topilmadi.');

    for (const el of elements) {
      for (let r = 0; r < el.count; r++) {
        while (idx < rawLines.length && !rawLines[idx].trim()) idx++;
        if (idx >= rawLines.length) throw new Error(`PLY ${el.name} qatorlari sarlavhadagidan kam.`);
        const toks = rawLines[idx++].trim().split(/\s+/);
        if (el.name === 'vertex') {
          if (toks.length < vEl.props.length) throw new Error('PLY vertex ustunlar soni mos emas.');
          const vx = Number(toks[xIdx]);
          const vy = Number(toks[yIdx]);
          const vz = Number(toks[zIdx]);
          if (!NUM_RE.test(toks[xIdx]) || !NUM_RE.test(toks[yIdx]) || !NUM_RE.test(toks[zIdx])) {
            throw new Error('PLY vertex qatorida son noto‘g‘ri.');
          }
          sampler.pushPoint([vx * scale, vy * scale, vz * scale]);
        }
      }
    }
    return sampler.finalize();
  }

  // .XYZ va .PTS o'qish
  let expectedPtsCount = null;
  let readPtsRows = 0;
  let firstDataLine = true;

  for (let li = 0; li < rawLines.length; li++) {
    const ln = rawLines[li].trim();
    if (!ln || ln.startsWith('#')) continue;
    if (firstDataLine && ext === 'pts' && /^\d+$/.test(ln)) {
      expectedPtsCount = parseInt(ln, 10);
      firstDataLine = false;
      continue;
    }
    firstDataLine = false;
    const toks = /[,;]/.test(ln) ? ln.split(/[,;]/).map((s) => s.trim()) : ln.split(/\s+/);
    if (toks.length < 3 || toks.length > 9) {
      throw new Error(`Skan ${li + 1}-qatorda kamida X Y Z sonlari bo‘lishi kerak.`);
    }
    for (let k = 0; k < 3; k++) {
      if (!NUM_RE.test(toks[k])) throw new Error(`Skan ${li + 1}-qatorda noto‘g‘ri son: ${toks[k]}`);
    }
    sampler.pushPoint([Number(toks[0]) * scale, Number(toks[1]) * scale, Number(toks[2]) * scale]);
    readPtsRows += 1;
  }

  if (expectedPtsCount !== null && expectedPtsCount !== readPtsRows) {
    throw new Error(`PTS sarlavhasida ${expectedPtsCount} ta, amalda ${readPtsRows} ta nuqta topildi.`);
  }
  return sampler.finalize();
}

/**
 * Xona o'lchamini yangilash — ichkarida qolgan tasdiqlangan MEP nuqtalarining tasdig'ini BEKOR QILMAYDI!
 * (Faqat yangi chegaradan tashqariga chiqib qolgan nuqtalargina qayta tekshiruvga tushadi.)
 */
export function updateSurveyRoomDimensions(room, { length, width, height, verified }) {
  const nextL = length !== undefined ? assertFiniteNum(length, 'Xona uzunligi (m)', 0, 1000) : room.length;
  const nextW = width !== undefined ? assertFiniteNum(width, 'Xona kengligi (m)', 0, 1000) : room.width;
  const nextH = height !== undefined ? assertFiniteNum(height, 'Xona balandligi (m)', 0, 100) : room.height;
  const dimsChangedPlan = Math.abs(nextL - room.length) > 1e-6 || Math.abs(nextW - room.width) > 1e-6;

  const updatedPoints = (room.points || []).map((pt) => {
    const outOfPlan = nextL > 0 && nextW > 0 && (pt.x < 0 || pt.x > nextL || pt.y < 0 || pt.y > nextW);
    return outOfPlan ? { ...pt, verified: false } : { ...pt };
  });

  const nextVerified = verified !== undefined
    ? Boolean(verified)
    : (dimsChangedPlan ? false : Boolean(room.verified));

  if (nextVerified && (!nextL || !nextW || !nextH)) {
    throw new Error('Xonani lazer bilan tasdiqlash uchun Uzunlik, Kenglik va Balandlik kiritilgan bo‘lishi shart.');
  }

  return {
    ...room,
    length: roundMm(nextL),
    width: roundMm(nextW),
    height: roundMm(nextH),
    verified: nextVerified,
    points: updatedPoints,
  };
}

/**
 * Loyiha ma'lumotlarini saqlash va qayta ochish (JSON lossless round-trip validatsiyasi bilan).
 */
export function normalizeSurveyProject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Dala o‘lchovi loyihasi formati noto‘g‘ri.');
  }
  if (['__proto__', 'constructor', 'prototype'].some((k) => Object.hasOwn(raw, k))) {
    throw new Error('Xavfli kalit aniqlandi.');
  }

  const rooms = (raw.rooms || []).map((r) => {
    const length = assertFiniteNum(r.length ?? 0, 'Uzunlik', 0, 1000);
    const width = assertFiniteNum(r.width ?? 0, 'Kenglik', 0, 1000);
    const height = assertFiniteNum(r.height ?? 0, 'Balandlik', 0, 100);
    const diagonalLaserM = r.diagonalLaserM ? assertFiniteNum(r.diagonalLaserM, 'Diagonal lazer (m)', 0, 1500) : null;
    const verified = Boolean(r.verified);
    if (verified && (!length || !width || !height)) {
      throw new Error(`«${r.name}»: Tasdiqlash uchun 3 ta o‘lcham bo‘lishi kerak.`);
    }
    const points = (r.points || []).map((p) => validateAndNormalizeMepPoint(p, { length, width, height }));
    const checks = (r.checks || []).map((c) => evaluateLaserControlCheck(c));
    return {
      id: String(r.id || makeArchId('srm')),
      name: String(r.name || 'Xona').trim(),
      floor: String(r.floor || '1-qavat').trim(),
      wallThicknessM: assertFiniteNum(r.wallThicknessM ?? 0.38, 'Devor qalinligi', 0.08, 1.0),
      length: roundMm(length),
      width: roundMm(width),
      height: roundMm(height),
      diagonalLaserM: diagonalLaserM ? roundMm(diagonalLaserM) : null,
      verified,
      scan: r.scan || null,
      checks,
      points,
    };
  });

  const signOff = raw.engineerSignOff
    ? {
        approved: Boolean(raw.engineerSignOff.approved),
        engineerName: String(raw.engineerSignOff.engineerName || '').trim(),
        role: String(raw.engineerSignOff.role || 'MEP Muhandis-loyihachi').trim(),
        approvedAt: raw.engineerSignOff.approvedAt || null,
        note: String(raw.engineerSignOff.note || '').trim(),
      }
    : { approved: false, engineerName: '', role: 'MEP Muhandis-loyihachi', approvedAt: null, note: '' };

  return {
    schema: 'sps-field-survey-v2',
    isSampleDemo: Boolean(raw.isSampleDemo),
    name: String(raw.name || 'Yangi Obyekt').trim(),
    site: String(raw.site || '').trim(),
    organization: String(raw.organization || 'Santex · Climate House').trim(),
    rooms,
    engineerSignOff: signOff,
  };
}

/**
 * Revit "Insert -> Link CAD (Millimeters)" uchun 1:1 millimetrli AutoCAD AC1015 DXF eksporti!
 * 5.40 m xona aniq 5400.000 mm chiqadi, tasdiqlangan MEP nuqtalari xoch (+) va TEXT otmetkasi bilan tushadi!
 */
export function makeSurveyRoomDxfMm(rawRoom) {
  const lengthM = assertFiniteNum(rawRoom?.length, 'Uzunlik', 0.1, 1000);
  const widthM = assertFiniteNum(rawRoom?.width, 'Kenglik', 0.1, 1000);
  if (!rawRoom?.verified) {
    throw new Error('DXF chiqarishdan oldin xona o‘lchovlarini lazer ruletka bilan tasdiqlang.');
  }

  const out = [];
  const pair = (c, v) => { out.push(String(c), String(v)); };

  pair(0, 'SECTION');
  pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, 'AC1015');
  pair(9, '$INSUNITS'); pair(70, 4); // 4 = Millimeters (Revit Link CAD standarti!)
  pair(9, '$MEASUREMENT'); pair(70, 1); // Metric
  pair(9, '$INSBASE'); pair(10, 0); pair(20, 0); pair(30, 0);
  pair(0, 'ENDSEC');

  const layerDefs = [
    ['0', 7],
    ['XONA_KONTUR', 7],
    ['DEVOR_TASHQI', 8],
    ['QA_OGOHLANTIRISH', 1],
    ['MEP_SUV', 4],
    ['MEP_KANALIZATSIYA', 6],
    ['MEP_VENT', 30],
    ['MEP_ISITISH', 2],
    ['MEP_USKUNA', 3],
    ['MEP_BOSHQA', 9],
  ];

  pair(0, 'SECTION');
  pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(5, '10'); pair(330, 0);
  pair(100, 'AcDbSymbolTable'); pair(70, layerDefs.length);
  for (const [lname, col] of layerDefs) {
    pair(0, 'LAYER');
    pair(100, 'AcDbSymbolTableRecord');
    pair(100, 'AcDbLayerTableRecord');
    pair(2, lname);
    pair(70, 0);
    pair(62, col);
    pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');

  pair(0, 'SECTION');
  pair(2, 'ENTITIES');

  const emitLine = (layer, x1, y1, x2, y2) => {
    pair(0, 'LINE');
    pair(100, 'AcDbEntity');
    pair(8, layer);
    pair(100, 'AcDbLine');
    pair(10, x1.toFixed(3)); pair(20, y1.toFixed(3)); pair(30, '0.000');
    pair(11, x2.toFixed(3)); pair(21, y2.toFixed(3)); pair(31, '0.000');
  };

  const emitText = (layer, x, y, heightMm, text) => {
    pair(0, 'TEXT');
    pair(100, 'AcDbEntity');
    pair(8, layer);
    pair(100, 'AcDbText');
    pair(10, x.toFixed(3)); pair(20, y.toFixed(3)); pair(30, '0.000');
    pair(40, heightMm.toFixed(1));
    pair(1, String(text).replace(/[\r\n]/g, ' '));
    pair(100, 'AcDbText');
  };

  const Lmm = lengthM * 1000;
  const Wmm = widthM * 1000;
  const Hmm = (Number(rawRoom.height) || 2.8) * 1000;

  // 1. Ichki lazerda tasdiqlangan xona konturi (masalan 5.40 x 3.60 m -> aniq 5400.000 x 3600.000 mm!)
  emitLine('XONA_KONTUR', 0, 0, Lmm, 0);
  emitLine('XONA_KONTUR', Lmm, 0, Lmm, Wmm);
  emitLine('XONA_KONTUR', Lmm, Wmm, 0, Wmm);
  emitLine('XONA_KONTUR', 0, Wmm, 0, 0);

  // 2. Tashqi devor qalinligi konturi
  const thMm = (Number(rawRoom.wallThicknessM) || 0.38) * 1000;
  emitLine('DEVOR_TASHQI', -thMm, -thMm, Lmm + thMm, -thMm);
  emitLine('DEVOR_TASHQI', Lmm + thMm, -thMm, Lmm + thMm, Wmm + thMm);
  emitLine('DEVOR_TASHQI', Lmm + thMm, Wmm + thMm, -thMm, Wmm + thMm);
  emitLine('DEVOR_TASHQI', -thMm, Wmm + thMm, -thMm, -thMm);

  emitText('XONA_KONTUR', Lmm * 0.5 - 450, Wmm * 0.5, 110, `${rawRoom.name} (${Lmm.toFixed(0)}x${Wmm.toFixed(0)}x${Hmm.toFixed(0)} mm)`);

  // 3. Faqat joyida tasdiqlangan MEP nuqtalarini chiqarish (tasdiqlanmagan taxminlar Revit'ga tushmaydi!)
  for (const pt of rawRoom.points || []) {
    if (!pt.verified) continue;
    const layer = MEP_DXF_LAYERS[pt.type] || 'MEP_BOSHQA';
    const xMm = pt.x * 1000;
    const yMm = pt.y * 1000;
    const zMm = Math.round(pt.z * 1000);
    emitLine(layer, xMm - 45, yMm, xMm + 45, yMm);
    emitLine(layer, xMm, yMm - 45, xMm, yMm + 45);
    const diaTag = pt.diameterMm ? ` DN${pt.diameterMm}` : '';
    const chTag = pt.skuCode ? ` [CH:${pt.skuCode}]` : '';
    emitText(layer, xMm + 60, yMm + 25, 65, `${pt.name}${diaTag}${chTag} (Z=${zMm >= 0 ? '+' : ''}${zMm}mm)`);
  }

  // 4. Agar nazorat tekshiruvida ruxsat chegarasidan oshgan farq bo'lsa, CAD ichida ogohlantirish yozuvi chiqadi!
  const failedChecks = (rawRoom.checks || []).map(evaluateLaserControlCheck).filter((c) => !c.pass);
  if (failedChecks.length > 0) {
    emitText(
      'QA_OGOHLANTIRISH',
      0,
      -260,
      90,
      `DIQQAT: Skan va lazer orasida ruxsatdan katta farq bor (${failedChecks.map((f) => `${f.name}: ${f.deltaMm}mm`).join(', ')})!`,
    );
  }

  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return `${out.join('\r\n')}\r\n`;
}

function safeCsvCell(val) {
  if (typeof val === 'number') return String(val);
  const str = String(val ?? '');
  const guarded = /^[\s\u200B-\u200F\u2060\uFEFF]*[=+@\-＝＋＠－]|^[\t\r\n]/u.test(str) ? `'${str}` : str;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/**
 * UTF-8 BOM bilan Excel'da buzilmasdan ochiladigan to'liq muhandislik o'lchovlar jadvali (.CSV).
 */
export function makeSurveyCsv(rawProject) {
  const proj = normalizeSurveyProject(rawProject);
  const cols = [
    'yozuv_turi', 'loyiha', 'obyekt', 'xona', 'qavat', 'tizim', 'nom',
    'kod_ch', 'brend', 'artikul', 'narx_usd',
    'x_m', 'y_m', 'z_m', 'x_mm', 'y_mm', 'z_mm',
    'uzunlik_m', 'kenglik_m', 'balandlik_m', 'diametr_mm',
    'manba', 'korinishi', 'tasdiq', 'skan_m', 'lazer_m', 'ruxsat_mm', 'farq_mm', 'nazorat_holati', 'muhandis_tasdigi', 'izoh',
  ];
  const rows = [cols];
  const pushRow = (obj) => rows.push(cols.map((k) => obj[k] ?? ''));
  const engStatus = proj.engineerSignOff.approved
    ? `Tasdiqlandi: ${proj.engineerSignOff.engineerName || proj.engineerSignOff.role}`
    : 'Muhandis tasdig‘i kutilmoqda';

  for (const rm of proj.rooms) {
    const base = { loyiha: proj.name, obyekt: proj.site, xona: rm.name, qavat: rm.floor, muhandis_tasdigi: engStatus };
    pushRow({
      ...base,
      yozuv_turi: 'XONA',
      nom: rm.name,
      uzunlik_m: rm.length,
      kenglik_m: rm.width,
      balandlik_m: rm.height,
      manba: 'Lazer ruletka',
      tasdiq: rm.verified ? 'Tasdiqlangan' : 'Tekshirilmagan',
      izoh: rm.diagonalLaserM ? `Diagonal lazer: ${rm.diagonalLaserM} m` : '',
    });

    for (const pt of rm.points) {
      pushRow({
        ...base,
        yozuv_turi: 'MEP_NUQTA',
        tizim: pt.type,
        nom: pt.name,
        kod_ch: pt.skuCode || '',
        brend: pt.skuBrand || '',
        artikul: pt.skuArticle || '',
        narx_usd: pt.priceUsd !== null && pt.priceUsd !== undefined ? pt.priceUsd.toFixed(2) : '',
        x_m: pt.x,
        y_m: pt.y,
        z_m: pt.z,
        x_mm: Math.round(pt.x * 1000),
        y_mm: Math.round(pt.y * 1000),
        z_mm: Math.round(pt.z * 1000),
        diametr_mm: pt.diameterMm ?? '',
        manba: pt.source === 'scan_only' ? 'Faqat Skan' : 'Lazer / Joyida o‘lchov',
        korinishi: pt.visibility === 'concealed' ? 'Yashirin' : 'Ochiq',
        tasdiq: pt.verified ? 'Tasdiqlangan' : 'Tekshirilmagan',
        izoh: pt.detail,
      });
    }

    for (const chk of rm.checks) {
      pushRow({
        ...base,
        yozuv_turi: 'NAZORAT_A_B',
        nom: chk.name,
        manba: 'Skan 3D vs Lazer',
        skan_m: chk.scanM,
        lazer_m: chk.laserM,
        ruxsat_mm: chk.toleranceMm,
        farq_mm: chk.deltaMm,
        nazorat_holati: chk.pass ? 'MOS (Chegarada)' : 'XATO: Qayta o‘lchang!',
      });
    }
  }

  return `\uFEFF${rows.map((r) => r.map(safeCsvCell).join(',')).join('\r\n')}\r\n`;
}

/**
 * AI yordamchisi va MEP muhandisi uchun yetishmayotgan ma'lumotlar hamda obyektdagi aniq savollar ro'yxatini tuzadi!
 */
export function buildAiMissingDataAndQuestions(rawProject) {
  const proj = normalizeSurveyProject(rawProject);
  const missingItems = [];
  const fieldQuestions = [];

  if (!proj.site) {
    missingItems.push('Obyekt manzili / geozonasi kiritilmagan.');
  }

  for (const rm of proj.rooms) {
    const prefix = `[${rm.name} · ${rm.floor}]`;
    if (!rm.verified) {
      missingItems.push(`${prefix} Xonaning L×W×H o‘lchamlari lazer ruletkada tasdiqlanmagan.`);
    }
    if (!rm.diagonalLaserM) {
      fieldQuestions.push(`${prefix} Xona burchaklari 90° ekanini tekshirish uchun diagonal lazer masofasi olinganmi (nazariy diagonal: ${Math.hypot(rm.length, rm.width).toFixed(3)} m)?`);
    }
    if (rm.scan && rm.checks.length === 0) {
      missingItems.push(`${prefix} Skan yuklangan, lekin birorta ham mustaqil lazer nazorat jufti (A–B) solishtirilmagan.`);
    }
    for (const chk of rm.checks) {
      if (!chk.pass) {
        missingItems.push(`${prefix} «${chk.name}» nazoratida skan (${chk.scanM} m) va lazer (${chk.laserM} m) farqi ${chk.deltaMm} mm > ${chk.toleranceMm} mm! Joyida qayta o‘lchash shart.`);
      }
    }

    for (const pt of rm.points) {
      const pLabel = `${prefix} ${pt.type} — «${pt.name}»`;
      if (!pt.verified) {
        missingItems.push(`${pLabel}: joyida muhandis tomonidan tasdiqlanmagan.`);
      }
      if (pt.diameterMm === null && ['Suv', 'Kanalizatsiya', 'Vent', 'Isitish'].includes(pt.type)) {
        fieldQuestions.push(`${pLabel}: haqiqiy tashqi/ichki diametr (DN/Ø mm) va ulanish rezba/rastrub turi qanday? (LiDAR skandan diametr taxmin qilinmaydi!)`);
      }
      if (pt.type === 'Kanalizatsiya' && !pt.invertConfirmed) {
        fieldQuestions.push(`${pLabel}: kanalizatsiya trubasining pastki lotok (invert) otmetkasi, stoyak yo‘nalishi va mavjud qiyaligi (uklon ≥ 2%) joyida o‘lchandimi?`);
      }
      if (pt.type === 'Suv' && !/bar|bosim|schyotchik|filtr/i.test(pt.detail)) {
        fieldQuestions.push(`${pLabel}: kirishdagi statik suv bosimi (bar), mavjud hisoblagich DN va asosiy yopish krani holati qanday?`);
      }
      if (pt.type === 'Vent' && !/shaxta|m3|kanal|d\d+/i.test(pt.detail)) {
        fieldQuestions.push(`${pLabel}: ventilyatsiya shaxtasi/kanali kesim o‘lchami, alohida kanal ekanligi va tabiiy tortish (tyaga) borligi tekshirildimi?`);
      }
      if (pt.type === 'Uskuna' && !/servis|elektr|gaz|mo'ri|dymoxod/i.test(pt.detail)) {
        fieldQuestions.push(`${pLabel}: Climate House uskunasi oldida 700–800 mm servis bo‘shlig‘i, elektr (220/380V), gaz ulanishi va tutun mo‘risi (дымоход) diametri tasdiqlandimi?`);
      }
      if (pt.visibility === 'concealed') {
        fieldQuestions.push(`${pLabel}: devor/pol ostidagi yashirin trassani tasdiqlovchi ijro chizmasi, teplovizor yoki ochib ko‘rish dalili bormi?`);
      }
    }
  }

  if (!proj.engineerSignOff.approved) {
    missingItems.push('Mas’ul MEP muhandis yakuniy o‘lchov va ulanish qarorini hali imzolamagan (Engineer Sign-off = false).');
  }

  return {
    projectSummary: {
      name: proj.name,
      site: proj.site,
      roomCount: proj.rooms.length,
      engineerSignOff: proj.engineerSignOff,
    },
    missingItems,
    fieldQuestions,
    promptText: [
      '=== SANTEX · CLIMATE HOUSE OBYEKT O‘LCHOVI VA AI NAZORAT TOPSHIRIG‘I ===',
      'QAT’IY QOIDA: Null yoki tasdiqlanmagan o‘lchovni aslo uydirmang. Telefon skanidan quvur diametri, kanalizatsiya qiyaligi yoki yashirin quvurni taxmin qilib tasdiqlamang. Yakuniy MEP qarorini mas’ul muhandis tasdiqlaydi.',
      '',
      `Loyiha: ${proj.name} (${proj.site || 'Manzil kiritilmagan'})`,
      `Muhandis tasdig‘i: ${proj.engineerSignOff.approved ? `TASDIQLANGAN (${proj.engineerSignOff.engineerName})` : 'KUTILMOQDA'}`,
      '',
      '1. YETISHMAYOTGAN DALILLAR VA OGOHLANTIRISHLAR:',
      ...(missingItems.length ? missingItems.map((m, i) => `  ${i + 1}) ${m}`) : ['  - Barcha bazaviy nazoratlar to‘ldirilgan.']),
      '',
      '2. OBYEKTDA ANIQLASHTIRILADIGAN MUHANDISLIK SAVOLLARI:',
      ...(fieldQuestions.length ? fieldQuestions.map((q, i) => `  ${i + 1}) ${q}`) : ['  - Qo‘shimcha savollar yo‘q.']),
      '',
      '3. STRUKTURAVIY MA’LUMOT (JSON):',
      JSON.stringify(proj, null, 2),
      '',
    ].join('\n'),
  };
}

/**
 * Muhandis o'lchov va MEP qarorini rasman tasdiqlashi (Engineer Sign-Off).
 */
export function approveSurveyByEngineer(rawProject, engineerName = 'Muhandis (SPS AI)', note = '') {
  const proj = normalizeSurveyProject(rawProject);
  if (!engineerName || !engineerName.trim()) {
    throw new Error('Tasdiqlovchi muhandis ismini kiriting.');
  }
  for (const rm of proj.rooms) {
    if (!rm.verified) {
      throw new Error(`«${rm.name}» xonasi lazer o‘lchovi bilan tasdiqlanmagan — avval xonani tasdiqlang.`);
    }
    const badCheck = rm.checks.find((c) => !c.pass);
    if (badCheck) {
      throw new Error(`«${rm.name}» xonasida «${badCheck.name}» nazorati ruxsat chegarasidan oshgan (${badCheck.deltaMm} mm > ${badCheck.toleranceMm} mm)!`);
    }
  }
  proj.engineerSignOff = {
    approved: true,
    engineerName: engineerName.trim(),
    role: 'Mas’ul MEP Muhandis-loyihachi (ОВиК / ВК / ТМ)',
    approvedAt: new Date().toISOString(),
    note: String(note || '').trim(),
  };
  return proj;
}

/**
 * Haqiqiy yangi loyiha o'lchovi uchun toza (namunasiz, oldindan "tasdiqlangan" belgisisiz!) Dala O'lchov varag'i.
 */
export function createBlankSurveyProject(projectName = 'Yangi Obyekt Dala O‘lchovi', site = '') {
  return normalizeSurveyProject({
    isSampleDemo: false,
    name: projectName,
    site,
    organization: 'SPS Project · Climate House',
    rooms: [
      {
        id: 'rm_real_1',
        name: '1-xona (Haqiqiy o‘lchov)',
        floor: '1-qavat',
        wallThicknessM: 0.38,
        length: 5.00,
        width: 4.00,
        height: 3.00,
        diagonalLaserM: null,
        verified: false,
        scan: null,
        checks: [],
        points: [],
      },
    ],
  });
}

/**
 * Topshiriq 3 bo'yicha aniq 5,40 × 3,60 × 2,80 m Texnik Xona (Santex & Climate House) etalon namunasi!
 * Eslatma: isSampleDemo = true — interfeysda haqiqiy dala o'lchovidan qat'iy ajratib ko'rsatiladi!
 */
export function createTechnicalRoom540x360Sample() {
  // Sun'iy 3D skan buluti (mm birlikdagi PTS/XYZ bilan bir xil geometriya: 5.391 m skan vs 5.400 m lazer = 9 mm farq <= 20 mm!)
  const scanRows = ['0 0 0', '5.391 0 0', '5.391 3.594 0', '0 3.594 2.802'];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    for (const z of [0.15, 0.70, 1.20, 1.85, 2.45, 2.78]) {
      scanRows.push(`${(t * 5.391).toFixed(3)} 0.004 ${z}`);
      scanRows.push(`${(t * 5.391).toFixed(3)} 3.594 ${z}`);
      scanRows.push(`0.004 ${(t * 3.594).toFixed(3)} ${z}`);
      scanRows.push(`5.391 ${(t * 3.594).toFixed(3)} ${z}`);
    }
  }
  const scan = parsePointCloudScan(scanRows.join('\n'), 'xyz', 'm', 'texnik-xona-iphone-lidar.xyz');

  return normalizeSurveyProject({
    isSampleDemo: true,
    name: 'NAMUNA: Climate House · Texnik Xona (5,40×3,60 m)',
    site: 'Sinov namunasi (haqiqiy obyekt o‘lchovi emas)',
    organization: 'Santex · Climate House',
    rooms: [
      {
        id: 'rm_tech_540_360',
        name: 'Texnik xona (Qozonxona & XVS)',
        floor: '1-qavat',
        wallThicknessM: 0.38,
        length: 5.40,
        width: 3.60,
        height: 2.80,
        diagonalLaserM: 6.490,
        verified: true,
        scan,
        checks: [
          {
            name: 'Uzun devor A–B (Shimol)',
            pointA: [0, 0, 0],
            pointB: [5.391, 0, 0],
            scanM: 5.391,
            laserM: 5.400,
            toleranceMm: 20,
          },
          {
            name: 'Ko‘ndalang devor A–D (G‘arb)',
            pointA: [0, 0, 0.15],
            pointB: [0.004, 3.594, 0.15],
            scanM: 3.594,
            laserM: 3.600,
            toleranceMm: 20,
          },
        ],
        points: [
          {
            id: 'mep_b1_water',
            name: 'Sovuq suv kirishi В1',
            type: 'Suv',
            x: 0.85,
            y: 0.22,
            z: 0.55,
            source: 'laser_manual',
            visibility: 'exposed',
            diameterMm: 32,
            detail: 'PE100 SDR11 Ø32 sharovoy kran bilan; statik bosim manometrda o‘lchanishi kerak',
            verified: true,
          },
          {
            id: 'mep_k1_sewer',
            name: 'Kanalizatsiya chiqishi К1 (Trap va sliv)',
            type: 'Kanalizatsiya',
            x: 4.20,
            y: 3.15,
            z: 0.08,
            source: 'laser_manual',
            visibility: 'exposed',
            diameterMm: 110,
            invertConfirmed: false,
            detail: 'Ostendorf Ø110 rastrub pol sathidan +80 mm; tashqi kolodets invert otmetkasi va qiyalik aniqlanadi',
            verified: true,
          },
          {
            id: 'mep_v1_vent',
            name: 'Tabiiy ventilyatsiya kanali ВЕ-1',
            type: 'Vent',
            x: 4.75,
            y: 0.18,
            z: 2.50,
            source: 'laser_manual',
            visibility: 'exposed',
            diameterMm: 160,
            detail: 'Shaxta teshigi markazi Z=+2.50 m; tutun mo‘risi bilan alohida kanal ekani tekshiriladi',
            verified: true,
          },
          {
            id: 'mep_hidden_draft',
            name: 'Taxminiy eski quvur izi (devor ichida)',
            type: 'Isitish',
            x: 2.10,
            y: 0.10,
            z: 0.35,
            source: 'scan_only',
            visibility: 'concealed',
            diameterMm: null,
            detail: 'Shtukaturka izidan ko‘rindi — teplovizor yoki ochib ko‘rmasdan tasdiqlanmaydi',
            verified: false,
          },
        ],
      },
    ],
  });
}

/**
 * Dala o'lchovi xonasini (masalan 5,40 × 3,60 × 2,80 m) to'g'ridan-to'g'ri SPS Project 2.0
 * 2D/3D Planar BIM qavatiga aylantiradi (aniq ichki sof o'lcham 5.40 × 3.60 m saqlangan holda!).
 */
export function convertSurveyRoomToPlanarFloor(surveyRoom) {
  const th = Number(surveyRoom.wallThicknessM) || 0.38;
  const halfT = th * 0.5;
  const L = Number(surveyRoom.length) || 5.40;
  const W = Number(surveyRoom.width) || 3.60;
  const H = Number(surveyRoom.height) || 2.80;

  // Ichki suvoq yuzasi ANIQ [0..L] x [0..W] (5.40 x 3.60 m = 19.44 m²!) chiqishi uchun
  // devor o'qlarini [-halfT .. L + halfT] x [-halfT .. W + halfT] qilib joylashtiramiz!
  const fl = createEmptyFloor(1, `${surveyRoom.floor} · ${surveyRoom.name}`, 0, H);
  addRectWalls(fl, -halfT, -halfT, L + halfT, W + halfT, {
    thickness: th,
    kind: 'exterior',
    roomName: surveyRoom.name,
    roomType: 'boiler',
    floorMat: 'concrete',
    targetTempC: 16,
  });

  // Skan bulutini 3D LiDAR ko'ruvchisiga ulash
  if (surveyRoom.scan?.points?.length) {
    const stride6 = [];
    for (const [px, py, pz] of surveyRoom.scan.points) {
      const hNorm = Math.max(0, Math.min(1, pz / H));
      stride6.push(px, py, pz, 0.15 + 0.65 * hNorm, 0.72, 0.95 - 0.45 * hNorm);
    }
    fl.scanOverlay = {
      kind: 'lidar_cloud',
      visible: true,
      opacity: 0.90,
      sliceHeightM: 1.20,
      pointStride6: stride6,
    };
  }

  // MEP nuqtalarini 2D/3D marker ('mep_pin') sifatida qavatga qo'shish (sof pol yuzasi 19.44 m² o'zgarmaydi!)
  for (const pt of surveyRoom.points || []) {
    if (!pt.verified) continue;
    fl.elements.push({
      id: pt.id,
      kind: 'mep_pin',
      mepType: pt.type,
      zM: pt.z,
      diameterMm: pt.diameterMm,
      label: `${pt.type}: ${pt.name} (Z=${pt.z >= 0 ? '+' : ''}${pt.z}m)`,
      x: pt.x,
      y: pt.y,
      wM: 0.22,
      dM: 0.22,
      rotationDeg: 0,
    });
  }

  planarizeFloorGraph(fl);
  return fl;
}
