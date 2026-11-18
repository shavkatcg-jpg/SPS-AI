/**
 * SPS Project 2.0 — ОВиК (Отопление, Вентиляция и Кондиционирование) To'liq Muhandislik Dvigateli
 *
 * 1.0 Raschotlar + GalfDesign Detalizatsiyalari bilan to'liq boyitilgan versiya:
 * 1) Водяной тёплый пол «Улитка» — qatlamli pirog (q_up, q_down, T_pol <= 29°C), kollektor balansirovkasi
 *    (G л/мин, ΔP мм.в.ст / м.в.ст / кПа, настройка клапана Kv, индексная петля) va Uzel podmesa (α, Kvs);
 * 2) Паспортный пересчёт радиаторов и конвекторов (Royal Thermo C22 / Biliner / Revolution / Pianoforte,
 *    Kermi Profil-V FTV 11/22/33, Rifar Tubog Ventil 2-рядный, Atrium Turbo / Konveka EC) — ΔT^1.30 · β1 / β2 · β3;
 * 3) GalfDesign sarf materiallari: Красная и синяя теплоизоляция Energoflex 18×6 мм, ЭППС Пеноплэкс,
 *    Мультифольга с разметкой, Демпферная лента, Якорные скобы и Фиксаторы поворота 90°!
 */

import { getNodeMap, pointInPolygon, getFloorWorldBounds, roundMm } from '../core/planar-wall-graph.js';
import {
  SPS_TRUNK_PIPE_FAMILIES,
  SPS_HEATING_TOPOLOGIES,
  computeUnderfloorFlux,
  computeUfLoopHydraulics,
  computeMixingUnit,
  selectCirculationPumpByDuty,
  computeRadiatorOrConvectorUnit,
  computePipeSegmentHydraulics,
} from './sps-heating-calc.js';

// Climate House 8468 (расходомеры, для тёплого пола) РАСМИЙ Код CH жадвали (2..15 вых. — climate-house-db.js билан 1:1!)
export const CH_8468_COLLECTOR_CODES = Object.freeze({
  2: 'TP-02440', 3: 'TP-02441', 4: 'TP-02442', 5: 'TP-02443', 6: 'TP-02444', 7: 'TP-02445', 8: 'TP-02446',
  9: 'TP-02447', 10: 'TP-02434', 11: 'TP-02435', 12: 'TP-02436', 13: 'TP-02437', 14: 'TP-02438', 15: 'TP-02439',
});

// Climate House 7200 / 7200S (шаровые краны, для радиаторов и ХВС/ГВС) РАСМИЙ Код CH жадвали (2..15 вых.!)
export const CH_7200S_COLLECTOR_CODES = Object.freeze({
  2: 'TP-02454', 3: 'TP-02455', 4: 'TP-02456', 5: 'TP-02457', 6: 'TP-02458', 7: 'TP-02459', 8: 'TP-02460',
  9: 'TP-02461', 10: 'TP-02448', 11: 'TP-02449', 12: 'TP-02450', 13: 'TP-02451', 14: 'TP-02452', 15: 'TP-02453',
});

function splitFlowIntoExactIntegers(totalFlow, count) {
  const n = Math.max(1, Math.round(count));
  const tot = Math.max(0, Math.round(totalFlow));
  const base = Math.floor(tot / n);
  const rem = tot - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function polylineLen2D(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return s;
}

function getPolyBounds(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function decomposePolygonIntoRectZones(poly, wallMarginM = 0.16) {
  const b = getPolyBounds(poly);
  if (b.width <= wallMarginM * 2.2 || b.height <= wallMarginM * 2.2) return [];

  const bboxArea = b.width * b.height;
  let polyArea = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    polyArea += x1 * y2 - x2 * y1;
  }
  polyArea = Math.abs(polyArea) * 0.5;

  if (poly.length === 4 || polyArea >= bboxArea * 0.93) {
    return [{
      x0: roundMm(b.minX + wallMarginM),
      y0: roundMm(b.minY + wallMarginM),
      x1: roundMm(b.maxX - wallMarginM),
      y1: roundMm(b.maxY - wallMarginM),
    }];
  }

  const ys = [...new Set(poly.map((p) => round2(p[1])))].sort((a, c) => a - c);
  const rawBands = [];
  for (let yi = 0; yi < ys.length - 1; yi++) {
    const yA = ys[yi];
    const yB = ys[yi + 1];
    if (yB - yA < 0.45) continue;
    const yMid = (yA + yB) * 0.5;
    const stepX = 0.10;
    let inRun = false;
    let runStart = 0;
    for (let x = b.minX + 0.02; x <= b.maxX - 0.01; x += stepX) {
      const inside = pointInPolygon(x, yMid, poly);
      if (inside && !inRun) {
        inRun = true;
        runStart = Math.abs(x - (b.minX + 0.02)) < 0.05 ? b.minX : x - stepX * 0.5;
      } else if (!inside && inRun) {
        inRun = false;
        const xEnd = x - stepX * 0.5;
        if (xEnd - runStart >= 0.70) {
          rawBands.push({ x0: runStart, y0: yA, x1: xEnd, y1: yB });
        }
      }
    }
    if (inRun && b.maxX - runStart >= 0.70) {
      rawBands.push({ x0: runStart, y0: yA, x1: b.maxX, y1: yB });
    }
  }

  const merged = [];
  for (const r of rawBands) {
    const prev = merged.find((m) => Math.abs(m.x0 - r.x0) < 0.22 && Math.abs(m.x1 - r.x1) < 0.22 && Math.abs(m.y1 - r.y0) < 0.08);
    if (prev) prev.y1 = r.y1;
    else merged.push({ ...r });
  }

  return merged
    .map((z) => ({
      x0: roundMm(z.x0 + wallMarginM),
      y0: roundMm(z.y0 + wallMarginM),
      x1: roundMm(z.x1 - wallMarginM),
      y1: roundMm(z.y1 - wallMarginM),
    }))
    .filter((z) => z.x1 - z.x0 >= 0.55 && z.y1 - z.y0 >= 0.55);
}

function splitZoneForMaxPipeLength(zone, stepM, transitDistM, maxLoopM = 86) {
  const w = zone.x1 - zone.x0;
  const h = zone.y1 - zone.y0;
  const area = w * h;
  const estSpiralM = area / stepM;
  const availSpiralM = Math.max(28, maxLoopM - transitDistM * 2.1);
  const parts = Math.max(1, Math.ceil(estSpiralM / availSpiralM));
  if (parts === 1) return [zone];

  const out = [];
  // Qo'shni konturlar orasida aniq 1.0 × stepM qadam qoladi!
  const gap = stepM;
  if (parts >= 4 && w >= 2.8 && h >= 2.8) {
    const nx = Math.max(2, Math.round(Math.sqrt(parts * (w / h))));
    const ny = Math.max(2, Math.ceil(parts / nx));
    const subW = (w - gap * (nx - 1)) / nx;
    const subH = (h - gap * (ny - 1)) / ny;
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const sx0 = zone.x0 + ix * (subW + gap);
        const sy0 = zone.y0 + iy * (subH + gap);
        out.push({
          x0: roundMm(sx0),
          y0: roundMm(sy0),
          x1: roundMm(sx0 + subW),
          y1: roundMm(sy0 + subH),
        });
      }
    }
    return out.filter((z) => z.x1 - z.x0 >= 0.45 && z.y1 - z.y0 >= 0.45);
  }
  if (w >= h) {
    const subW = (w - gap * (parts - 1)) / parts;
    for (let i = 0; i < parts; i++) {
      const sx0 = zone.x0 + i * (subW + gap);
      out.push({ x0: roundMm(sx0), y0: zone.y0, x1: roundMm(sx0 + subW), y1: zone.y1 });
    }
  } else {
    const subH = (h - gap * (parts - 1)) / parts;
    for (let i = 0; i < parts; i++) {
      const sy0 = zone.y0 + i * (subH + gap);
      out.push({ x0: zone.x0, y0: roundMm(sy0), x1: zone.x1, y1: roundMm(sy0 + subH) });
    }
  }
  return out.filter((z) => z.x1 - z.x0 >= 0.45 && z.y1 - z.y0 >= 0.45);
}

function cleanCollinear2D(pts, eps = 1e-4) {
  if (!pts || pts.length <= 2) return pts || [];
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < eps) continue;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (Math.abs(cross) < eps && dot >= 0) continue;
    out.push(b);
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) >= eps) {
    out.push(last);
  }
  return out;
}

/**
 * Har bir 90° burchakda haqiqiy PE-RT / PE-Xa quvur egilish radiusi (R = 55 мм) bo'yicha
 * silliq chorak-aylana otvod hosil qiladi (keskin burchak va teshik qolmaydi!).
 */
function filletOrthogonalPolyline2D(pts, maxRadiusM = 0.055, arcSegments = 5) {
  const clean = cleanCollinear2D(pts, 1e-4);
  if (clean.length <= 2) return clean;
  const out = [clean[0]];

  for (let i = 1; i < clean.length - 1; i++) {
    const pPrev = clean[i - 1];
    const pCur = clean[i];
    const pNext = clean[i + 1];

    const v1x = pCur[0] - pPrev[0];
    const v1y = pCur[1] - pPrev[1];
    const len1 = Math.hypot(v1x, v1y);

    const v2x = pNext[0] - pCur[0];
    const v2y = pNext[1] - pCur[1];
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 0.025 || len2 < 0.025) {
      out.push(pCur);
      continue;
    }

    const u1x = v1x / len1;
    const u1y = v1y / len1;
    const u2x = v2x / len2;
    const u2y = v2y / len2;

    const dot = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
    const turnAngle = Math.acos(dot); // 90° burilishda ~ PI/2
    if (turnAngle < 0.08 || turnAngle > Math.PI - 0.05) {
      out.push(pCur);
      continue;
    }

    const halfTan = Math.tan(turnAngle * 0.5);
    const maxD = Math.min(len1 * 0.44, len2 * 0.44);
    const d = Math.min(maxRadiusM * halfTan, maxD);
    const rEff = d / Math.max(1e-4, halfTan);
    if (rEff < 0.012) {
      out.push(pCur);
      continue;
    }

    const startX = pCur[0] - u1x * d;
    const startY = pCur[1] - u1y * d;
    const cross = u1x * u2y - u1y * u2x;
    const sign = cross >= 0 ? 1 : -1;
    const nInX = sign > 0 ? -u1y : u1y;
    const nInY = sign > 0 ? u1x : -u1x;

    const cx = startX + nInX * rEff;
    const cy = startY + nInY * rEff;
    const ang0 = Math.atan2(startY - cy, startX - cx);
    const totalSweep = sign * turnAngle;

    for (let s = 0; s <= arcSegments; s++) {
      const a = ang0 + (totalSweep * s) / arcSegments;
      out.push([
        Math.round((cx + Math.cos(a) * rEff) * 10000) / 10000,
        Math.round((cy + Math.sin(a) * rEff) * 10000) / 10000,
      ]);
    }
  }

  out.push(clean[clean.length - 1]);
  return out;
}

/**
 * Markazgacha bo'sh joy va kesishish qoldirmaydigan (Zero-Crossing) Centerline Ribbon!
 */
function buildCenterlineRibbon(nU, nV) {
  const pts = [[1, 0.5]];
  let L = 1;
  let R = nU - 1;
  let B = 1;
  let T = nV - 1;

  while (L <= R && B <= T) {
    if (R - L < 1.5) {
      pts.push([L, T]);
      break;
    }
    pts.push([L, T]);

    if (T - B < 1.5) {
      pts.push([R, T]);
      break;
    }
    pts.push([R, T]);

    if (R - L <= 2.5) {
      pts.push([R, B]);
      break;
    }
    pts.push([R, B]);

    if (T - B <= 2.5) {
      pts.push([L + 2, B]);
      break;
    }
    pts.push([L + 2, B]);

    L += 2;
    B += 2;
    R -= 2;
    T -= 2;
  }
  return cleanCollinear2D(pts, 1e-5);
}

function offsetOrthPolyline(pts, halfOffset) {
  if (!pts || pts.length < 2) return [];
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = (-dy / len) * halfOffset;
    const ny = (dx / len) * halfOffset;
    segs.push({
      x1: x1 + nx,
      y1: y1 + ny,
      x2: x2 + nx,
      y2: y2 + ny,
      dx: dx / len,
      dy: dy / len,
    });
  }
  if (!segs.length) return [];

  const res = [[segs[0].x1, segs[0].y1]];
  for (let i = 0; i < segs.length - 1; i++) {
    const s1 = segs[i];
    const s2 = segs[i + 1];
    const det = s1.dx * (-s2.dy) - s1.dy * (-s2.dx);
    if (Math.abs(det) < 1e-5) {
      res.push([s1.x2, s1.y2]);
    } else {
      const rx = s2.x1 - s1.x1;
      const ry = s2.y1 - s1.y1;
      const t = (rx * (-s2.dy) - ry * (-s2.dx)) / det;
      res.push([s1.x1 + t * s1.dx, s1.y1 + t * s1.dy]);
    }
  }
  res.push([segs[segs.length - 1].x2, segs[segs.length - 1].y2]);
  return res;
}

/**
 * 100% Kesishmas (Zero-Crossing) Bifilyar «Улитка» + silliq R=55mm burchak otvodlari
 * + markazda silliq 180° yarim-aylana qaytish halqasi + ortogonal tranzit!
 */
function generateValtecDoubleSpiral(zone, stepM, colPt, portIdx = 0) {
  const { x0, y0, x1, y1 } = zone;
  const w = Math.max(0.30, x1 - x0);
  const h = Math.max(0.30, y1 - y0);
  const s = Math.max(0.10, Math.min(0.25, Number(stepM) || 0.15));

  const zcx = (x0 + x1) * 0.5;
  const zcy = (y0 + y1) * 0.5;
  const dxCol = colPt.x - zcx;
  const dyCol = colPt.y - zcy;

  // Kollektorga qaragan tomonni tanlaymiz ('minY' | 'maxY' | 'minX' | 'maxX')
  let entrySide;
  if (Math.abs(dyCol) >= Math.abs(dxCol)) {
    entrySide = dyCol >= 0 ? 'maxY' : 'minY';
  } else {
    entrySide = dxCol >= 0 ? 'maxX' : 'minX';
  }

  let flipU = false;
  if (entrySide === 'minY') flipU = colPt.x > zcx;
  else if (entrySide === 'maxY') flipU = colPt.x < zcx;
  else if (entrySide === 'minX') flipU = colPt.y < zcy;
  else if (entrySide === 'maxX') flipU = colPt.y > zcy;

  const isSideX = entrySide === 'minX' || entrySide === 'maxX';
  const localW = isSideX ? h : w;
  const localH = isSideX ? w : h;

  const rawMU = localW / s;
  const rawMV = localH / s;
  const mU = rawMU >= 2.2 ? Math.max(3, Math.round((rawMU - 1) / 2) * 2 + 1) : Math.max(1, Math.round(rawMU));
  const mV = rawMV >= 2.2 ? Math.max(3, Math.round((rawMV - 1) / 2) * 2 + 1) : Math.max(1, Math.round(rawMV));
  const nU = mU + 1;
  const nV = mV + 1;
  const su = localW / Math.max(1, mU);
  const sv = localH / Math.max(1, mV);

  const mapLocal = ([u, v]) => {
    const rawU = (u - 0.5) * su;
    const uu = flipU ? (localW - rawU) : rawU;
    const vv = (v - 0.5) * sv;
    if (entrySide === 'minY') return [x0 + uu, y0 + vv];
    if (entrySide === 'maxY') return [x1 - uu, y1 - vv];
    if (entrySide === 'minX') return [x0 + vv, y1 - uu];
    return [x1 - vv, y0 + uu]; // 'maxX'
  };

  let orthSupply;
  let orthReturn;
  let centerTurnPts = [];

  if (mU < 3 || mV < 3) {
    // Juda tor yo'lakcha uchun U-shakl silliq petlya
    const midU = nU * 0.5;
    orthSupply = [[0.5, 0.5], [0.5, nV - 0.5]].map(mapLocal);
    orthReturn = [[nU - 0.5, nV - 0.5], [nU - 0.5, 0.5]].map(mapLocal);
    const tipA = orthSupply[orthSupply.length - 1];
    const tipB = orthReturn[0];
    const midX = (tipA[0] + tipB[0]) * 0.5;
    const midY = (tipA[1] + tipB[1]) * 0.5;
    centerTurnPts = [tipA, [midX, midY], tipB];
    void midU;
  } else {
    const ribbon = buildCenterlineRibbon(nU, nV);
    const outerLocal = offsetOrthPolyline(ribbon, +0.5);
    const innerLocal = offsetOrthPolyline(ribbon, -0.5);

    orthSupply = outerLocal.map(mapLocal);
    orthReturn = innerLocal.slice().reverse().map(mapLocal);

    // Markazdagi 180° silliq yarim-aylana burilish (hech qachon diagonal kesishmaydi!)
    const rPrev = mapLocal(ribbon[ribbon.length - 2]);
    const rLast = mapLocal(ribbon[ribbon.length - 1]);
    const fdx = rLast[0] - rPrev[0];
    const fdy = rLast[1] - rPrev[1];
    const flen = Math.hypot(fdx, fdy) || 1;
    const fwdX = fdx / flen;
    const fwdY = fdy / flen;

    const tipA = orthSupply[orthSupply.length - 1];
    const tipB = orthReturn[0];
    const mx = (tipA[0] + tipB[0]) * 0.5;
    const my = (tipA[1] + tipB[1]) * 0.5;
    const sideX = tipA[0] - mx;
    const sideY = tipA[1] - my;
    const rTurn = Math.hypot(sideX, sideY);

    const turnSteps = 8;
    for (let k = 0; k <= turnSteps; k++) {
      const ang = (Math.PI * k) / turnSteps;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      centerTurnPts.push([
        Math.round((mx + sideX * ca + fwdX * rTurn * sa) * 10000) / 10000,
        Math.round((my + sideY * ca + fwdY * rTurn * sa) * 10000) / 10000,
      ]);
    }
  }

  // Kirish/chiqish normali va bo'yin manjetasi (cuffSup / cuffRet)
  const outNormals = { minY: [0, -1], maxY: [0, 1], minX: [-1, 0], maxX: [1, 0] };
  const [ox, oy] = outNormals[entrySide];
  const cuffDist = 0.08;
  const entryPt = orthSupply[0];
  const exitPt = orthReturn[orthReturn.length - 1];
  const cuffSup = [roundMm(entryPt[0] + ox * cuffDist), roundMm(entryPt[1] + oy * cuffDist)];
  const cuffRet = [roundMm(exitPt[0] + ox * cuffDist), roundMm(exitPt[1] + oy * cuffDist)];

  // 90° burchaklarni R = 55 mm silliq otvod bilan egamiz!
  const bendR = Math.min(0.056, Math.min(su, sv) * 0.42);
  const filletedSupBody = filletOrthogonalPolyline2D([cuffSup, ...orthSupply], bendR, 5);
  const filletedRetBody = filletOrthogonalPolyline2D([...orthReturn, cuffRet], bendR, 5);

  const midTurnIdx = Math.floor(centerTurnPts.length / 2);
  const cleanSupply = [...filletedSupBody, ...centerTurnPts.slice(1, midTurnIdx + 1)];
  const cleanReturn = [...centerTurnPts.slice(midTurnIdx, centerTurnPts.length - 1), ...filletedRetBody];

  // Kollektordan kontur manjetasigacha 100% ortogonal (90° R=55mm otvodli) tranzit trassasi!
  const laneShift = ((portIdx - 1) % 7 - 3) * 0.032;
  const supColPt = [roundMm(colPt.x + laneShift - 0.012), roundMm(colPt.y)];
  const retColPt = [roundMm(colPt.x + laneShift + 0.012), roundMm(colPt.y)];

  const buildOrthTransit = (pStart, pEnd, shift) => {
    const [ax, ay] = pStart;
    const [bx, by] = pEnd;
    if (Math.abs(ax - bx) < 0.015 || Math.abs(ay - by) < 0.015) {
      return [pStart, pEnd];
    }
    let rawOrth;
    if (entrySide === 'minY' || entrySide === 'maxY') {
      // Gorizontal koridor bo'ylab borib, zona chetidan tik kiradi
      const midY = roundMm(by + oy * (0.06 + Math.abs(shift) * 0.5));
      rawOrth = [[ax, ay], [ax, midY], [bx, midY], [bx, by]];
    } else {
      const midX = roundMm(bx + ox * (0.06 + Math.abs(shift) * 0.5));
      rawOrth = [[ax, ay], [midX, ay], [midX, by], [bx, by]];
    }
    return filletOrthogonalPolyline2D(rawOrth, 0.052, 4);
  };

  const transitSupplyPts = buildOrthTransit(supColPt, cuffSup, laneShift);
  const transitReturnPts = buildOrthTransit(cuffRet, retColPt, laneShift + 0.016);

  const heatingLenM = round2(polylineLen2D(cleanSupply) + polylineLen2D(cleanReturn));
  const transitLenM = round2(polylineLen2D(transitSupplyPts) + polylineLen2D(transitReturnPts) + 1.1);
  const totalLenM = round2(heatingLenM + transitLenM);

  return {
    supplyPts: cleanSupply,
    returnPts: cleanReturn,
    cuffSup,
    cuffRet,
    transitSupplyPts,
    transitReturnPts,
    centerX: roundMm(zcx),
    centerY: roundMm(zcy),
    transitLenM,
    heatingLenM,
    lengthM: totalLenM,
  };
}

function findOptimalCollectorPosition(fl, kind = 'tp') {
  if (fl.mepCornerHint) {
    return {
      x: roundMm(kind === 'rad' ? (fl.mepCornerHint.radX ?? fl.mepCornerHint.x + 0.56) : fl.mepCornerHint.x),
      y: roundMm(fl.mepCornerHint.y),
      roomId: fl.rooms?.[0]?.id || null,
      roomName: fl.mepCornerHint.roomName || 'Тех. бурчак',
    };
  }
  const b = getFloorWorldBounds(fl);
  const rooms = (fl.rooms || []).filter((r) => r.roomType !== 'stairwell');
  const preferred = rooms.find((r) => r.roomType === 'hallway' || r.roomType === 'hall')
    || rooms.find((r) => r.roomType === 'boiler')
    || rooms[0];

  if (!preferred) {
    return { x: roundMm((b.minX + b.maxX) * 0.5), y: roundMm((b.minY + b.maxY) * 0.5) };
  }
  const pb = getPolyBounds(preferred.innerPoly || [[0, 0], [3, 3]]);
  const shiftX = kind === 'rad' ? 0.72 : -0.38;
  return {
    x: roundMm(Math.max(pb.minX + 0.35, Math.min(pb.maxX - 0.35, (pb.minX + pb.maxX) * 0.5 + shiftX))),
    y: roundMm(pb.minY + 0.14),
    roomId: preferred.id,
    roomName: preferred.name,
  };
}

function projectPoint2DOnSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { x: x1, y: y1, t: 0, dist: Math.hypot(px - x1, py - y1) };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const qx = x1 + dx * t;
  const qy = y1 + dy * t;
  return { x: qx, y: qy, t, dist: Math.hypot(px - qx, py - qy) };
}

function find2DSegCross(a1, a2, b1, b2, margin = 0.018) {
  const dax = a2[0] - a1[0];
  const day = a2[1] - a1[1];
  const dbx = b2[0] - b1[0];
  const dby = b2[1] - b1[1];
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-7) return null;
  const t = ((b1[0] - a1[0]) * dby - (b1[1] - a1[1]) * dbx) / denom;
  const u = ((b1[0] - a1[0]) * day - (b1[1] - a1[1]) * dax) / denom;
  const lenA = Math.hypot(dax, day) || 1;
  const lenB = Math.hypot(dbx, dby) || 1;
  const mT = Math.min(0.25, margin / lenA);
  const mU = Math.min(0.25, margin / lenB);
  if (t > mT && t < 1 - mT && u > mU && u < 1 - mU) {
    return {
      x: roundMm(a1[0] + dax * t),
      y: roundMm(a1[1] + day * t),
      t,
    };
  }
  return null;
}

/**
 * Quvur podvodkasining boshqa magistral ustidan sakrab o'tadigan silliq 3D Обвод ko'prikchasini hosil qiladi!
 */
function insertObvodArchOnBranch2DTo3D(pts2d, zBase, zEnd, crossHits = []) {
  if (!pts2d || pts2d.length < 2) return [];
  if (!crossHits.length) {
    const out = pts2d.map(([x, y]) => [x, y, zBase]);
    out.push([pts2d[pts2d.length - 1][0], pts2d[pts2d.length - 1][1], zEnd]);
    return out;
  }

  const out3d = [];
  for (let i = 0; i < pts2d.length - 1; i++) {
    const pA = pts2d[i];
    const pB = pts2d[i + 1];
    const dx = pB[0] - pA[0];
    const dy = pB[1] - pA[1];
    const segLen = Math.hypot(dx, dy);
    if (i === 0) out3d.push([pA[0], pA[1], zBase]);
    if (segLen < 0.09) {
      out3d.push([pB[0], pB[1], zBase]);
      continue;
    }
    const ux = dx / segLen;
    const uy = dy / segLen;

    const segHits = crossHits
      .map((h) => {
        const pr = projectPoint2DOnSeg(h.x, h.y, pA[0], pA[1], pB[0], pB[1]);
        return { ...h, along: pr.t * segLen, dist: pr.dist };
      })
      .filter((h) => h.dist < 0.018 && h.along > 0.045 && h.along < segLen - 0.045)
      .sort((a, b) => a.along - b.along);

    for (const h of segHits) {
      const halfSpan = Math.min(0.052, h.along - 0.015, segLen - h.along - 0.015);
      const zPeak = zBase + 0.038;
      const zShoulder = zBase + 0.024;
      out3d.push(
        [roundMm(pA[0] + ux * (h.along - halfSpan)), roundMm(pA[1] + uy * (h.along - halfSpan)), zBase],
        [roundMm(pA[0] + ux * (h.along - halfSpan * 0.55)), roundMm(pA[1] + uy * (h.along - halfSpan * 0.55)), zShoulder],
        [roundMm(pA[0] + ux * h.along), roundMm(pA[1] + uy * h.along), zPeak],
        [roundMm(pA[0] + ux * (h.along + halfSpan * 0.55)), roundMm(pA[1] + uy * (h.along + halfSpan * 0.55)), zShoulder],
        [roundMm(pA[0] + ux * (h.along + halfSpan)), roundMm(pA[1] + uy * (h.along + halfSpan)), zBase],
      );
    }
    out3d.push([pB[0], pB[1], zBase]);
  }
  const last = pts2d[pts2d.length - 1];
  out3d.push([last[0], last[1], zEnd]);
  return out3d;
}

/**
 * 3 XIL HAQIQIY ISITISH RAZVODKASI MOTORI (LOD 400 TE-SA Press & Pro Aqua PP-R):
 * 1) 'radial' — Коллекторно-лучевая (ШРВ-Р -> 16×2.0 без соединений в стяжке, плавные гибы R=5d);
 * 2) 'two_pipe_dead_end' — Двухтрубная тупиковая (2 крыла по периметру: Ø26 -> Ø20 -> Ø16 + переходные тройники + 3D обводы);
 * 3) 'two_pipe_tichelmann' — Двухтрубная попутная (петля Тихельмана: Т1 26->20->16 и Т2 16->20->26 в одном направлении!).
 */
function routeFloorHeatingNetwork({
  fl,
  radiators = [],
  radCollector,
  radTopology = 'radial',
  trunkPipeFamilyId = 'te_sa_press',
  radSupplyTempC = 70,
  radReturnTempC = 55,
}) {
  const family = SPS_TRUNK_PIPE_FAMILIES[trunkPipeFamilyId] || SPS_TRUNK_PIPE_FAMILIES.te_sa_press;
  const famId = family.id;
  const waterDt = Math.max(8, radSupplyTempC - radReturnTempC);

  const radPipes = [];
  const radFittings = [];
  const pipeBySizeMap = new Map();
  let totalPipeM = 0;
  let totalTrunkWaterVolL = 0;

  const recordPipeLen = (hyd, oneWayM) => {
    const m = Math.max(0.05, oneWayM);
    totalPipeM += m;
    const sizeObj = family.sizes.find((s) => s.outerMm === hyd.outerMm) || family.sizes[0];
    totalTrunkWaterVolL += m * sizeObj.volPerM;
    const key = `${famId}::${sizeObj.outerMm}`;
    const prev = pipeBySizeMap.get(key) || {
      familyId: famId,
      brand: family.brand,
      fittingType: family.fittingType,
      materialCode: family.materialCode || '',
      outerMm: sizeObj.outerMm,
      wallMm: sizeObj.wallMm,
      sizeLabel: sizeObj.label,
      skuCode: sizeObj.skuCode,
      refUsdM: sizeObj.refUsdM || 1.6,
      lengthM: 0,
    };
    prev.lengthM = round2(prev.lengthM + m);
    pipeBySizeMap.set(key, prev);
  };

  if (!radiators.length) {
    return { radPipes, radFittings, riserHub: null, pipeBySize: [], totalPipeM: 0, totalTrunkWaterVolL: 0 };
  }

  // =========================================================================
  // REJIM 1: КОЛЛЕКТОРНО-ЛУЧЕВАЯ РАЗВОДКА (16×2.0 без соединений в стяжке!)
  // =========================================================================
  if (radTopology === 'radial') {
    const nPorts = radiators.length;
    const pitch = 0.050;
    const zMainT1 = 0.044;
    const zMainT2 = 0.028;

    radiators.forEach((rad, idx) => {
      const portOffX = roundMm(-((nPorts - 1) * pitch) * 0.5 + idx * pitch + 0.02);
      const colSupX = roundMm(radCollector.x + portOffX);
      const colRetX = roundMm(radCollector.x + portOffX + 0.014);
      const colY = radCollector.y;

      const [pSupX, pSupY, zSupPort] = rad.supplyPort;
      const [pRetX, pRetY, zRetPort] = rad.returnPort;
      const laneYSup = roundMm(colY + 0.20 + idx * 0.036);
      const laneYRet = roundMm(colY + 0.218 + idx * 0.036);

      const rawSup2d = cleanCollinear2D([
        [colSupX, colY],
        [colSupX, laneYSup],
        [pSupX, laneYSup],
        [pSupX, pSupY],
      ]);
      const rawRet2d = cleanCollinear2D([
        [pRetX, pRetY],
        [pRetX, laneYRet],
        [colRetX, laneYRet],
        [colRetX, colY],
      ]);

      // Styajka ichida hech qanday troynik/ugolniksiz R = 5*d = 80 мм silliq egilgan truba!
      const smoothSup2d = filletOrthogonalPolyline2D(rawSup2d, 0.080, 5);
      const smoothRet2d = filletOrthogonalPolyline2D(rawRet2d, 0.080, 5);

      const lenSup = round2(polylineLen2D(smoothSup2d) + Math.abs(0.40 - zMainT1) + Math.abs(zSupPort - zMainT1));
      const lenRet = round2(polylineLen2D(smoothRet2d) + Math.abs(0.22 - zMainT2) + Math.abs(zRetPort - zMainT2));
      const rayHyd = computePipeSegmentHydraulics({
        loadW: rad.powerW,
        deltaT: waterDt,
        lengthM: Math.max(lenSup, lenRet),
        familyId: famId,
        isBranch: true,
      });

      rad.branchPipeLabel = rayHyd.sizeLabel;
      rad.branchVelocityMs = rayHyd.velocityMs;
      rad.branchDpKpa = rayHyd.dpKpa;

      const t1Pts = [
        [colSupX, colY, 0.40],
        ...smoothSup2d.map(([x, y]) => [x, y, zMainT1]),
        [pSupX, pSupY, zSupPort],
      ];
      const t2Pts = [
        [pRetX, pRetY, zRetPort],
        ...smoothRet2d.map(([x, y]) => [x, y, zMainT2]),
        [colRetX, colY, 0.22],
      ];

      radPipes.push(
        {
          id: `t1_${rad.id}`,
          sys: 'T1',
          role: 'ray',
          dnMm: rayHyd.outerMm,
          sizeLabel: rayHyd.sizeLabel,
          pipeFamilyId: famId,
          insulated: true,
          skuCode: rayHyd.skuCode,
          pts3d: t1Pts,
        },
        {
          id: `t2_${rad.id}`,
          sys: 'T2',
          role: 'ray',
          dnMm: rayHyd.outerMm,
          sizeLabel: rayHyd.sizeLabel,
          pipeFamilyId: famId,
          insulated: true,
          skuCode: rayHyd.skuCode,
          pts3d: t2Pts,
        },
      );

      // Kollektor yevrokonuslari + shtraba/stoyak press-otvodlari (devordan chiqqanda)
      radFittings.push(
        { id: `ek_s_${rad.id}`, kind: 'adapter_ek', sys: 'T1', pipeFamilyId: famId, dnMm: rayHyd.outerMm, x: colSupX, y: colY, z: 0.37, dirA: [0, 0, -1] },
        { id: `ek_r_${rad.id}`, kind: 'adapter_ek', sys: 'T2', pipeFamilyId: famId, dnMm: rayHyd.outerMm, x: colRetX, y: colY, z: 0.19, dirA: [0, 0, -1] },
      );
      if (rad.feedMount === 'wall' || rad.kind === 'towel_warmer') {
        const sPrev = smoothSup2d[Math.max(0, smoothSup2d.length - 2)] || [pSupX, pSupY - 0.1];
        const rNext = smoothRet2d[Math.min(smoothRet2d.length - 1, 1)] || [pRetX, pRetY - 0.1];
        radFittings.push(
          {
            id: `elb_s_${rad.id}`,
            kind: 'elbow_90',
            sys: 'T1',
            pipeFamilyId: famId,
            dnMm: rayHyd.outerMm,
            x: pSupX,
            y: pSupY,
            z: zMainT1,
            dirA: [sPrev[0] - pSupX, sPrev[1] - pSupY, 0],
            dirB: [0, 0, 1],
          },
          {
            id: `elb_r_${rad.id}`,
            kind: 'elbow_90',
            sys: 'T2',
            pipeFamilyId: famId,
            dnMm: rayHyd.outerMm,
            x: pRetX,
            y: pRetY,
            z: zMainT2,
            dirA: [rNext[0] - pRetX, rNext[1] - pRetY, 0],
            dirB: [0, 0, 1],
          },
        );
      }

      recordPipeLen(rayHyd, lenSup);
      recordPipeLen(rayHyd, lenRet);
    });

    return {
      radPipes,
      radFittings,
      riserHub: null,
      pipeBySize: [...pipeBySizeMap.values()],
      totalPipeM: round2(totalPipeM),
      totalTrunkWaterVolL: round2(totalTrunkWaterVolL),
    };
  }

  // =========================================================================
  // REJIM 2 VA 3: ДВУХТРУБНАЯ ТУПИКОВАЯ (26->20->16) VA ПОПУТНАЯ (ПЕТЛЯ ТИХЕЛЬМАНА)
  // =========================================================================
  const heatedRoomsForPerim = (fl.rooms || []).filter((r) => r.roomType !== 'stairwell' && Array.isArray(r.innerPoly) && r.innerPoly.length >= 3);
  const rawFloorB = getFloorWorldBounds(fl);
  let b = rawFloorB;
  if (heatedRoomsForPerim.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const hr of heatedRoomsForPerim) {
      for (const [px, py] of hr.innerPoly) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
    if (Number.isFinite(minX)) {
      b = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }
  }

  const nm = getNodeMap(fl);
  let leftHalfT = 0.0, rightHalfT = 0.0, topHalfT = 0.0, botHalfT = 0.0;
  if (heatedRoomsForPerim.length === 0) {
    leftHalfT = 0.19; rightHalfT = 0.19; topHalfT = 0.19; botHalfT = 0.19;
    for (const w of fl.walls || []) {
      const a = nm.get(w.n1);
      const bNd = nm.get(w.n2);
      if (!a || !bNd) continue;
      const ht = Math.max(0.10, (Number(w.thickness) || 0.38) * 0.5);
      if (Math.abs(bNd.x - a.x) < Math.abs(bNd.y - a.y)) {
        const wx = (a.x + bNd.x) * 0.5;
        if (Math.abs(wx - b.minX) < 0.35) leftHalfT = Math.max(leftHalfT, ht);
        if (Math.abs(wx - b.maxX) < 0.35) rightHalfT = Math.max(rightHalfT, ht);
      } else {
        const wy = (a.y + bNd.y) * 0.5;
        if (Math.abs(wy - b.minY) < 0.35) topHalfT = Math.max(topHalfT, ht);
        if (Math.abs(wy - b.maxY) < 0.35) botHalfT = Math.max(botHalfT, ht);
      }
    }
  }

  // Vnutripolniy konvektor bo'lsa perimetr lotok ortidan o'tadi; Napolniy Konveka FC va radiatorlarda plintus yonidan (70 мм)!
  const hasTrenchL = radiators.some((e) => e.kind === 'convector' && Math.abs(e.x - b.minX) < 1.1);
  const hasTrenchR = radiators.some((e) => e.kind === 'convector' && Math.abs(b.maxX - e.x) < 1.1);
  const hasTrenchT = radiators.some((e) => e.kind === 'convector' && Math.abs(e.y - b.minY) < 1.1);
  const hasTrenchB = radiators.some((e) => e.kind === 'convector' && Math.abs(b.maxY - e.y) < 1.1);

  const baseInsetL = b.minX + leftHalfT + (hasTrenchL ? 0.42 : 0.070);
  const baseInsetR = b.maxX - rightHalfT - (hasTrenchR ? 0.42 : 0.070);
  const baseInsetT = b.minY + topHalfT + (hasTrenchT ? 0.42 : 0.070);
  const baseInsetB = b.maxY - botHalfT - (hasTrenchB ? 0.42 : 0.070);

  // Agar isitiladigan xona G-simon (L-shaped) bo'lsa, quvur devor tashqarisiga chiqmasdan aniq ichki kontur bo'ylab yuradi!
  const singleRoomPoly = heatedRoomsForPerim.length === 1 ? heatedRoomsForPerim[0].innerPoly : null;
  const isNonRectSingleRoom = singleRoomPoly && (heatedRoomsForPerim[0].areaM2 || 0) < b.width * b.height * 0.92;

  const buildCwInsetPoly = (rawPoly, insetM) => {
    const cleaned = cleanCollinear2D([...rawPoly, rawPoly[0]], 0.015);
    if (cleaned.length > 1 && Math.hypot(cleaned[0][0] - cleaned[cleaned.length - 1][0], cleaned[0][1] - cleaned[cleaned.length - 1][1]) < 0.015) {
      cleaned.pop();
    }
    const n = cleaned.length;
    if (n < 3) return [];
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = cleaned[i];
      const [x2, y2] = cleaned[(i + 1) % n];
      s2 += x1 * y2 - x2 * y1;
    }
    const cw = s2 >= 0 ? cleaned : [...cleaned].reverse();
    const edges = [];
    for (let i = 0; i < n; i++) {
      const pA = cw[i];
      const pB = cw[(i + 1) % n];
      const dx = pB[0] - pA[0];
      const dy = pB[1] - pA[1];
      const len = Math.hypot(dx, dy) || 1;
      edges.push({ inNx: -dy / len, inNy: dx / len });
    }
    return cw.map((pt, i) => {
      const prevE = edges[(i - 1 + n) % n];
      const nextE = edges[i];
      const denom = Math.max(0.25, 1 + prevE.inNx * nextE.inNx + prevE.inNy * nextE.inNy);
      const k = insetM / denom;
      return [roundMm(pt[0] + (prevE.inNx + nextE.inNx) * k), roundMm(pt[1] + (prevE.inNy + nextE.inNy) * k)];
    });
  };

  // trackOff = 0.000 -> T1 (подача, tashqi devorga yaqin), trackOff = 0.052 -> T2 (обратка, 52 мм ichkarida parallel!)
  const getTrackVerts = (trackOff = 0) => {
    if (isNonRectSingleRoom) {
      const polyV = buildCwInsetPoly(singleRoomPoly, 0.070 + trackOff);
      if (polyV.length >= 4) return polyV;
    }
    const x0 = roundMm(baseInsetL + trackOff);
    const x1 = roundMm(baseInsetR - trackOff);
    const y0 = roundMm(baseInsetT + trackOff);
    const y1 = roundMm(baseInsetB - trackOff);
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  };

  const refVerts = getTrackVerts(0);
  const refBox = { x0: baseInsetL, x1: baseInsetR, y0: baseInsetT, y1: baseInsetB };
  const nVerts = refVerts.length;
  const edgeLens = [];
  const cornerSs = [];
  let perimAccum = 0;
  for (let i = 0; i < nVerts; i++) {
    cornerSs.push(perimAccum);
    const pA = refVerts[i];
    const pB = refVerts[(i + 1) % nVerts];
    const el = Math.max(0.05, Math.hypot(pB[0] - pA[0], pB[1] - pA[1]));
    edgeLens.push(el);
    perimAccum += el;
  }
  const perimLen = Math.max(1.0, perimAccum);

  const pointOnTrackAtS = (sRaw, trackOff = 0) => {
    const verts = trackOff === 0 ? refVerts : getTrackVerts(trackOff);
    const s = ((sRaw % perimLen) + perimLen) % perimLen;
    for (let i = 0; i < nVerts; i++) {
      const s0 = cornerSs[i];
      const len = edgeLens[i];
      if (s <= s0 + len + 1e-6 || i === nVerts - 1) {
        const f = Math.max(0, Math.min(1, (s - s0) / len));
        const pA = verts[i];
        const pB = verts[(i + 1) % nVerts];
        return [roundMm(pA[0] + (pB[0] - pA[0]) * f), roundMm(pA[1] + (pB[1] - pA[1]) * f)];
      }
    }
    return verts[0];
  };

  const projectOntoRefPerim = (px, py) => {
    const sides = [];
    for (let i = 0; i < nVerts; i++) {
      const pA = refVerts[i];
      const pB = refVerts[(i + 1) % nVerts];
      const dx = pB[0] - pA[0];
      const dy = pB[1] - pA[1];
      const side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3);
      sides.push({
        side,
        s0: cornerSs[i],
        len: edgeLens[i],
        pr: projectPoint2DOnSeg(px, py, pA[0], pA[1], pB[0], pB[1]),
      });
    }
    sides.sort((a, c) => a.pr.dist - c.pr.dist);
    return {
      s: sides[0].s0 + sides[0].pr.t * sides[0].len,
      side: sides[0].side,
      pt: [roundMm(sides[0].pr.x), roundMm(sides[0].pr.y)],
    };
  };

  const traceTrackBetween = (sStartRaw, deltaSigned, trackOff = 0) => {
    if (Math.abs(deltaSigned) < 0.015) {
      const p = pointOnTrackAtS(sStartRaw, trackOff);
      return { pts: [p, p], corners: [] };
    }
    const pts = [pointOnTrackAtS(sStartRaw, trackOff)];
    const corners = [];
    if (deltaSigned > 0) {
      const sEnd = sStartRaw + deltaSigned;
      const stops = [];
      for (const cBase of cornerSs) {
        for (const c of [cBase, cBase + perimLen, cBase + perimLen * 2]) {
          if (c > sStartRaw + 0.035 && c < sEnd - 0.035) stops.push(c);
        }
      }
      stops.sort((a, c) => a - c);
      for (const st of stops) {
        const cp = pointOnTrackAtS(st, trackOff);
        pts.push(cp);
        corners.push(cp);
      }
      pts.push(pointOnTrackAtS(sEnd, trackOff));
    } else {
      const sEnd = sStartRaw + deltaSigned;
      const stops = [];
      for (const cBase of cornerSs) {
        for (const c of [cBase - perimLen, cBase, cBase + perimLen]) {
          if (c < sStartRaw - 0.035 && c > sEnd + 0.035) stops.push(c);
        }
      }
      stops.sort((a, c) => c - a);
      for (const st of stops) {
        const cp = pointOnTrackAtS(st, trackOff);
        pts.push(cp);
        corners.push(cp);
      }
      pts.push(pointOnTrackAtS(sEnd, trackOff));
    }
    return { pts: cleanCollinear2D(pts, 1e-4), corners };
  };

  // Qozonxona (котельная) yoki burchak kotyol uzeli kirish nuqtasi
  const boilerRm = (fl.rooms || []).find((r) => r.roomType === 'boiler') || heatedRoomsForPerim[0] || (fl.rooms || [])[0];
  const boilerBounds = boilerRm ? getPolyBounds(boilerRm.innerPoly || [[0, 0], [2, 2]]) : { minX: refBox.x0, maxX: refBox.x0 + 1, minY: refBox.y0, maxY: refBox.y0 + 1 };
  const boilerAnchorX = fl.mepCornerHint ? roundMm(fl.mepCornerHint.radX ?? fl.mepCornerHint.x) : roundMm((boilerBounds.minX + boilerBounds.maxX) * 0.5);
  const boilerAnchorY = fl.mepCornerHint ? roundMm(fl.mepCornerHint.y) : roundMm((boilerBounds.minY + boilerBounds.maxY) * 0.5);
  const hubProj = projectOntoRefPerim(boilerAnchorX, boilerAnchorY);
  const sHub = hubProj.s;
  const hubPtT1 = pointOnTrackAtS(sHub, 0.000);
  const hubPtT2 = pointOnTrackAtS(sHub + 0.06, 0.052);

  const zTrack = 0.042;
  const riserHub = {
    x: hubPtT1[0],
    y: hubPtT1[1],
    label: radTopology === 'two_pipe_tichelmann' ? 'Ввод Т1·Т2 (Петля Тихельмана)' : 'Ввод / Стояк Т1·Т2',
  };

  // Qozonxona vertikal tushish trubasi (Ввод от коллектора котельной Z=1.35 -> zTrack)
  const fullFloorLoadW = radiators.reduce((s, r) => s + (r.powerW || 500), 0);
  const rootHyd = computePipeSegmentHydraulics({
    loadW: fullFloorLoadW,
    deltaT: waterDt,
    lengthM: 2.8,
    familyId: famId,
    isBranch: false,
  });
  radPipes.push(
    {
      id: `riser_t1_f${fl.id}`,
      sys: 'T1',
      role: 'trunk',
      dnMm: rootHyd.outerMm,
      sizeLabel: rootHyd.sizeLabel,
      pipeFamilyId: famId,
      insulated: false,
      skuCode: rootHyd.skuCode,
      pts3d: [[hubPtT1[0], hubPtT1[1], 1.35], [hubPtT1[0], hubPtT1[1], zTrack]],
    },
    {
      id: `riser_t2_f${fl.id}`,
      sys: 'T2',
      role: 'trunk',
      dnMm: rootHyd.outerMm,
      sizeLabel: rootHyd.sizeLabel,
      pipeFamilyId: famId,
      insulated: false,
      skuCode: rootHyd.skuCode,
      pts3d: [[hubPtT2[0], hubPtT2[1], zTrack], [hubPtT2[0], hubPtT2[1], 1.35]],
    },
  );
  recordPipeLen(rootHyd, 1.35);
  recordPipeLen(rootHyd, 1.35);

  // Har bir priborni perimetr s parametriga bog'lash
  const mappedEmitters = radiators.map((rad) => {
    const prSup = projectOntoRefPerim(rad.supplyPort[0], rad.supplyPort[1]);
    const prRet = projectOntoRefPerim(rad.returnPort[0], rad.returnPort[1]);
    let dCwSup = ((prSup.s - sHub) % perimLen + perimLen) % perimLen;
    let dCwRet = ((prRet.s - sHub) % perimLen + perimLen) % perimLen;
    if (Math.abs(dCwRet - dCwSup) < 0.048) {
      dCwRet = (dCwSup + 0.055) % perimLen;
    }
    const dMidCw = ((projectOntoRefPerim(rad.x, rad.y).s - sHub) % perimLen + perimLen) % perimLen;
    return {
      rad,
      sSup: sHub + dCwSup,
      sRet: sHub + dCwRet,
      dCw: dMidCw,
      dCcw: (perimLen - dMidCw) % perimLen,
      side: prSup.side,
    };
  });

  // Yordamchi: Magistral segmentni qo'shish + burchak 90° press-ugolniklarni ro'yxatga olish
  const trunkSegSegments2D = []; // { sys, p1, p2, dnMm } — Obvod kesishuvini tekshirish uchun!
  const addTrunkRun = (idStr, sys, sFrom, deltaS, loadW, trackOff) => {
    const tr = traceTrackBetween(sFrom, deltaS, trackOff);
    if (tr.pts.length < 2) return rootHyd;
    const lenM = Math.max(0.15, polylineLen2D(tr.pts));
    const hyd = computePipeSegmentHydraulics({
      loadW,
      deltaT: waterDt,
      lengthM: lenM,
      familyId: famId,
      isBranch: false,
    });
    radPipes.push({
      id: idStr,
      sys,
      role: 'trunk',
      dnMm: hyd.outerMm,
      sizeLabel: hyd.sizeLabel,
      pipeFamilyId: famId,
      insulated: false,
      skuCode: hyd.skuCode,
      loadW,
      velocityMs: hyd.velocityMs,
      pts3d: tr.pts.map(([x, y]) => [x, y, zTrack]),
    });
    for (let i = 0; i < tr.pts.length - 1; i++) {
      trunkSegSegments2D.push({ sys, p1: tr.pts[i], p2: tr.pts[i + 1], dnMm: hyd.outerMm });
    }
    // 90° Perimetr burchaklariga LOD 400 TE-SA 812 / PP-R Ugolnik qo'yish!
    for (let k = 1; k < tr.pts.length - 1; k++) {
      const pPrev = tr.pts[k - 1];
      const pCur = tr.pts[k];
      const pNext = tr.pts[k + 1];
      radFittings.push({
        id: `elb_tr_${idStr}_${k}`,
        kind: 'elbow_90',
        sys,
        pipeFamilyId: famId,
        dnMm: hyd.outerMm,
        x: pCur[0],
        y: pCur[1],
        z: zTrack,
        dirA: [pPrev[0] - pCur[0], pPrev[1] - pCur[1], 0],
        dirB: [pNext[0] - pCur[0], pNext[1] - pCur[1], 0],
      });
    }
    recordPipeLen(hyd, lenM);
    return hyd;
  };

  if (radTopology === 'two_pipe_tichelmann') {
    // -----------------------------------------------------------------------
    // ПЕТЛЯ ТИХЕЛЬМАНА (Попутная двухтрубка: T1 26->20->16, T2 16->20->26 CW!)
    // -----------------------------------------------------------------------
    const ordered = [...mappedEmitters].sort((a, c) => a.dCw - c.dCw);
    let prevHydT1 = rootHyd;
    let prevST1 = sHub;

    // 1) Т1 Подача: sHub dan soat mili bo'yicha oxirgi priborgacha kamayib boradi (26 -> 20 -> 16)
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      const remLoadW = ordered.slice(i).reduce((s, x) => s + (x.rad.powerW || 500), 0);
      const sTarget = sHub + ((item.sSup - sHub) % perimLen + perimLen) % perimLen;
      const deltaS = Math.max(0.05, sTarget - prevST1);
      const curHyd = addTrunkRun(`tich_t1_${fl.id}_${i}`, 'T1', prevST1, deltaS, remLoadW, 0.000);
      item.inDnT1 = curHyd.outerMm;
      item.teeSupPt = pointOnTrackAtS(sTarget, 0.000);
      if (i > 0) ordered[i - 1].outDnT1 = curHyd.outerMm;
      prevHydT1 = curHyd;
      prevST1 = sTarget;
    }
    ordered[ordered.length - 1].outDnT1 = null; // Oxirgi priborda T1 90° ugolnik bilan tugaydi!

    // 2) Т2 Обратка: 1-pribordan boshlanib XUDDI SHU SOAT MILI YO'NALISHIDA yig'ilib sHub ga qaytadi (16 -> 20 -> 26)!
    for (let i = 0; i < ordered.length; i++) {
      const sRetCur = sHub + ((ordered[i].sRet - sHub) % perimLen + perimLen) % perimLen;
      ordered[i].sRetAbs = sRetCur;
      ordered[i].teeRetPt = pointOnTrackAtS(sRetCur, 0.052);
    }
    ordered[0].inDnT2 = null; // 1-priborda T2 90° ugolnikdan boshlanadi!
    for (let i = 0; i < ordered.length; i++) {
      const cumRetLoadW = ordered.slice(0, i + 1).reduce((s, x) => s + (x.rad.powerW || 500), 0);
      const sStart = ordered[i].sRetAbs;
      const sEnd = i < ordered.length - 1 ? ordered[i + 1].sRetAbs : sHub + perimLen;
      const deltaS = Math.max(0.06, sEnd - sStart);
      const curHyd = addTrunkRun(`tich_t2_${fl.id}_${i}`, 'T2', sStart, deltaS, cumRetLoadW, 0.052);
      ordered[i].outDnT2 = curHyd.outerMm;
      if (i < ordered.length - 1) ordered[i + 1].inDnT2 = curHyd.outerMm;
    }

    // Vvod ugolniklari
    radFittings.push(
      { id: `hub_elb_t1_${fl.id}`, kind: 'elbow_90', sys: 'T1', pipeFamilyId: famId, dnMm: rootHyd.outerMm, x: hubPtT1[0], y: hubPtT1[1], z: zTrack, dirA: [0, 0, 1], dirB: [1, 0, 0] },
      { id: `hub_elb_t2_${fl.id}`, kind: 'elbow_90', sys: 'T2', pipeFamilyId: famId, dnMm: rootHyd.outerMm, x: hubPtT2[0], y: hubPtT2[1], z: zTrack, dirA: [0, 0, 1], dirB: [-1, 0, 0] },
    );
  } else {
    // -----------------------------------------------------------------------
    // ДВУХТРУБНАЯ ТУПИКОВАЯ (2 muvozanatlangan qanot: М1 soat mili, М2 teskari!)
    // -----------------------------------------------------------------------
    const wingCw = [];
    const wingCcw = [];
    for (const item of mappedEmitters) {
      if (item.dCw <= item.dCcw + 0.20) wingCw.push(item);
      else wingCcw.push(item);
    }
    wingCw.sort((a, c) => a.dCw - c.dCw);
    wingCcw.sort((a, c) => a.dCcw - c.dCcw);

    if (wingCw.length > 0 && wingCcw.length > 0) {
      radFittings.push(
        { id: `hub_tee_t1_${fl.id}`, kind: 'tee', sys: 'T1', pipeFamilyId: famId, dnMm: rootHyd.outerMm, outDnMm: rootHyd.outerMm, branchDnMm: rootHyd.outerMm, x: hubPtT1[0], y: hubPtT1[1], z: zTrack, dirA: [-1, 0, 0], dirB: [1, 0, 0], dirBranch: [0, 0, 1] },
        { id: `hub_tee_t2_${fl.id}`, kind: 'tee', sys: 'T2', pipeFamilyId: famId, dnMm: rootHyd.outerMm, outDnMm: rootHyd.outerMm, branchDnMm: rootHyd.outerMm, x: hubPtT2[0], y: hubPtT2[1], z: zTrack, dirA: [-1, 0, 0], dirB: [1, 0, 0], dirBranch: [0, 0, 1] },
      );
    } else {
      radFittings.push(
        { id: `hub_elb_t1_${fl.id}`, kind: 'elbow_90', sys: 'T1', pipeFamilyId: famId, dnMm: rootHyd.outerMm, x: hubPtT1[0], y: hubPtT1[1], z: zTrack, dirA: [0, 0, 1], dirB: [1, 0, 0] },
        { id: `hub_elb_t2_${fl.id}`, kind: 'elbow_90', sys: 'T2', pipeFamilyId: famId, dnMm: rootHyd.outerMm, x: hubPtT2[0], y: hubPtT2[1], z: zTrack, dirA: [0, 0, 1], dirB: [1, 0, 0] },
      );
    }

    const traceDeadEndWing = (wingList, signDir, wingTag) => {
      let prevSSup = sHub;
      let prevSRet = sHub + (signDir > 0 ? 0.06 : -0.06);
      for (let i = 0; i < wingList.length; i++) {
        const item = wingList[i];
        const remLoadW = wingList.slice(i).reduce((s, x) => s + (x.rad.powerW || 500), 0);
        const dSup = signDir > 0
          ? ((item.sSup - sHub) % perimLen + perimLen) % perimLen
          : -(((sHub - item.sSup) % perimLen + perimLen) % perimLen);
        const dRet = signDir > 0
          ? ((item.sRet - sHub) % perimLen + perimLen) % perimLen
          : -(((sHub - item.sRet) % perimLen + perimLen) % perimLen);

        const targetSSup = sHub + dSup;
        const targetSRet = sHub + dRet;

        const hydT1 = addTrunkRun(`de_${wingTag}_t1_${fl.id}_${i}`, 'T1', prevSSup, targetSSup - prevSSup, remLoadW, 0.000);
        const hydT2 = addTrunkRun(`de_${wingTag}_t2_${fl.id}_${i}`, 'T2', prevSRet, targetSRet - prevSRet, remLoadW, 0.052);

        item.inDnT1 = hydT1.outerMm;
        item.inDnT2 = hydT2.outerMm;
        item.teeSupPt = pointOnTrackAtS(targetSSup, 0.000);
        item.teeRetPt = pointOnTrackAtS(targetSRet, 0.052);

        if (i > 0) {
          wingList[i - 1].outDnT1 = hydT1.outerMm;
          wingList[i - 1].outDnT2 = hydT2.outerMm;
        }
        prevSSup = targetSSup;
        prevSRet = targetSRet;
      }
      if (wingList.length > 0) {
        wingList[wingList.length - 1].outDnT1 = null;
        wingList[wingList.length - 1].outDnT2 = null;
      }
    };

    traceDeadEndWing(wingCw, 1, 'm1');
    traceDeadEndWing(wingCcw, -1, 'm2');
  }

  // Har bir priborga podvodka + Переходной пресс-тройник TE-SA 822/824 + Автоматический 3D Обвод!
  for (const item of mappedEmitters) {
    const { rad, teeSupPt, teeRetPt } = item;
    if (!teeSupPt || !teeRetPt) continue;

    const [pSupX, pSupY, zSupPort] = rad.supplyPort;
    const [pRetX, pRetY, zRetPort] = rad.returnPort;

    const brHyd = computePipeSegmentHydraulics({
      loadW: rad.powerW,
      deltaT: waterDt,
      lengthM: 1.2,
      familyId: famId,
      isBranch: true,
    });
    rad.branchPipeLabel = brHyd.sizeLabel;
    rad.branchVelocityMs = brHyd.velocityMs;
    rad.branchDpKpa = brHyd.dpKpa;

    const buildOrthStub2D = (pStart, pEnd, sideIdx) => {
      if (Math.abs(pStart[0] - pEnd[0]) < 0.006 || Math.abs(pStart[1] - pEnd[1]) < 0.006) {
        return [pStart, pEnd];
      }
      // Avval devorga perpendikulyar chiqish!
      if (sideIdx === 0 || sideIdx === 2) {
        return cleanCollinear2D([pStart, [pEnd[0], pStart[1]], pEnd]);
      }
      return cleanCollinear2D([pStart, [pStart[0], pEnd[1]], pEnd]);
    };

    const stubSup2d = buildOrthStub2D(teeSupPt, [pSupX, pSupY], item.side);
    const stubRet2d = buildOrthStub2D(teeRetPt, [pRetX, pRetY], item.side);

    // 2D kesishuvlarni topib haqiqiy 3D Обвод hosil qilish (T2 podvodka T1 magistral ustidan yoki T1 podvodka T2 ustidan!)
    const hitsSup = [];
    for (let i = 0; i < stubSup2d.length - 1; i++) {
      for (const mSeg of trunkSegSegments2D) {
        if (mSeg.sys !== 'T2') continue;
        const h = find2DSegCross(stubSup2d[i], stubSup2d[i + 1], mSeg.p1, mSeg.p2, 0.010);
        if (h && !hitsSup.some((x) => Math.hypot(x.x - h.x, x.y - h.y) < 0.03)) {
          hitsSup.push({ ...h, crossedDnMm: mSeg.dnMm });
        }
      }
    }

    const hitsRet = [];
    for (let i = 0; i < stubRet2d.length - 1; i++) {
      for (const mSeg of trunkSegSegments2D) {
        if (mSeg.sys !== 'T1') continue;
        const h = find2DSegCross(stubRet2d[i], stubRet2d[i + 1], mSeg.p1, mSeg.p2, 0.010);
        if (h && !hitsRet.some((x) => Math.hypot(x.x - h.x, x.y - h.y) < 0.03)) {
          hitsRet.push({ ...h, crossedDnMm: mSeg.dnMm });
        }
      }
    }

    const brSupPts3d = insertObvodArchOnBranch2DTo3D(stubSup2d, zTrack, zSupPort, hitsSup);
    const brRetPts3d = insertObvodArchOnBranch2DTo3D(stubRet2d, zTrack, zRetPort, hitsRet).reverse();

    radPipes.push(
      {
        id: `br_t1_${rad.id}`,
        sys: 'T1',
        role: 'branch',
        dnMm: brHyd.outerMm,
        sizeLabel: brHyd.sizeLabel,
        pipeFamilyId: famId,
        insulated: false,
        skuCode: brHyd.skuCode,
        pts3d: brSupPts3d,
      },
      {
        id: `br_t2_${rad.id}`,
        sys: 'T2',
        role: 'branch',
        dnMm: brHyd.outerMm,
        sizeLabel: brHyd.sizeLabel,
        pipeFamilyId: famId,
        insulated: false,
        skuCode: brHyd.skuCode,
        pts3d: brRetPts3d,
      },
    );

    recordPipeLen(brHyd, polylineLen2D(stubSup2d) + Math.abs(zSupPort - zTrack));
    recordPipeLen(brHyd, polylineLen2D(stubRet2d) + Math.abs(zRetPort - zTrack));

    // Obvod fitinglarini qo'shish
    for (const h of hitsSup) {
      const bDir = [pSupX - teeSupPt[0], pSupY - teeSupPt[1], 0];
      radFittings.push({
        id: `obv_s_${rad.id}_${h.x}`,
        kind: 'obvod',
        sys: 'T1',
        pipeFamilyId: famId,
        dnMm: brHyd.outerMm,
        crossedDnMm: h.crossedDnMm,
        x: h.x,
        y: h.y,
        z: zTrack,
        dirA: bDir,
      });
    }
    for (const h of hitsRet) {
      const bDir = [pRetX - teeRetPt[0], pRetY - teeRetPt[1], 0];
      radFittings.push({
        id: `obv_r_${rad.id}_${h.x}`,
        kind: 'obvod',
        sys: 'T2',
        pipeFamilyId: famId,
        dnMm: brHyd.outerMm,
        crossedDnMm: h.crossedDnMm,
        x: h.x,
        y: h.y,
        z: zTrack,
        dirA: bDir,
      });
    }

    // Magistral T1 Troynik (yoki oxirgi pribor ugolnigi + perexod)
    const runTangent = item.side === 0 ? [1, 0, 0] : item.side === 1 ? [0, 1, 0] : item.side === 2 ? [-1, 0, 0] : [0, -1, 0];
    const brVecSup = [pSupX - teeSupPt[0], pSupY - teeSupPt[1], 0];
    const brVecRet = [pRetX - teeRetPt[0], pRetY - teeRetPt[1], 0];

    if (item.inDnT1 && item.outDnT1) {
      radFittings.push({
        id: `tee_s_${rad.id}`,
        kind: 'tee',
        sys: 'T1',
        pipeFamilyId: famId,
        dnMm: item.inDnT1,
        outDnMm: item.outDnT1,
        branchDnMm: brHyd.outerMm,
        label: item.inDnT1 !== item.outDnT1 || item.inDnT1 !== brHyd.outerMm
          ? `${item.inDnT1}×${brHyd.outerMm}×${item.outDnT1}`
          : `${item.inDnT1}×${brHyd.outerMm}×${item.inDnT1}`,
        x: teeSupPt[0],
        y: teeSupPt[1],
        z: zTrack,
        dirA: [-runTangent[0], -runTangent[1], 0],
        dirB: runTangent,
        dirBranch: brVecSup,
      });
    } else {
      const endDn = item.inDnT1 || item.outDnT1 || brHyd.outerMm;
      radFittings.push({
        id: `end_s_${rad.id}`,
        kind: 'elbow_90',
        sys: 'T1',
        pipeFamilyId: famId,
        dnMm: endDn,
        outDnMm: brHyd.outerMm,
        x: teeSupPt[0],
        y: teeSupPt[1],
        z: zTrack,
        dirA: [-runTangent[0], -runTangent[1], 0],
        dirB: brVecSup,
      });
      if (endDn !== brHyd.outerMm) {
        radFittings.push({
          id: `red_s_${rad.id}`,
          kind: 'reducer',
          sys: 'T1',
          pipeFamilyId: famId,
          dnMm: endDn,
          outDnMm: brHyd.outerMm,
          x: roundMm((teeSupPt[0] + pSupX) * 0.5),
          y: roundMm((teeSupPt[1] + pSupY) * 0.5),
          z: zTrack,
          dirA: brVecSup,
        });
      }
    }

    if (item.inDnT2 && item.outDnT2) {
      radFittings.push({
        id: `tee_r_${rad.id}`,
        kind: 'tee',
        sys: 'T2',
        pipeFamilyId: famId,
        dnMm: item.inDnT2,
        outDnMm: item.outDnT2,
        branchDnMm: brHyd.outerMm,
        label: item.inDnT2 !== item.outDnT2 || item.inDnT2 !== brHyd.outerMm
          ? `${item.inDnT2}×${brHyd.outerMm}×${item.outDnT2}`
          : `${item.inDnT2}×${brHyd.outerMm}×${item.inDnT2}`,
        x: teeRetPt[0],
        y: teeRetPt[1],
        z: zTrack,
        dirA: [-runTangent[0], -runTangent[1], 0],
        dirB: runTangent,
        dirBranch: brVecRet,
      });
    } else {
      const endDn2 = item.inDnT2 || item.outDnT2 || brHyd.outerMm;
      radFittings.push({
        id: `end_r_${rad.id}`,
        kind: 'elbow_90',
        sys: 'T2',
        pipeFamilyId: famId,
        dnMm: endDn2,
        outDnMm: brHyd.outerMm,
        x: teeRetPt[0],
        y: teeRetPt[1],
        z: zTrack,
        dirA: [-runTangent[0], -runTangent[1], 0],
        dirB: brVecRet,
      });
      if (endDn2 !== brHyd.outerMm) {
        radFittings.push({
          id: `red_r_${rad.id}`,
          kind: 'reducer',
          sys: 'T2',
          pipeFamilyId: famId,
          dnMm: endDn2,
          outDnMm: brHyd.outerMm,
          x: roundMm((teeRetPt[0] + pRetX) * 0.5),
          y: roundMm((teeRetPt[1] + pRetY) * 0.5),
          z: zTrack,
          dirA: brVecRet,
        });
      }
    }

    // Pribor tagida shtraba/pol 90° press-ugolniklari
    radFittings.push(
      { id: `up_s_${rad.id}`, kind: 'elbow_90', sys: 'T1', pipeFamilyId: famId, dnMm: brHyd.outerMm, x: pSupX, y: pSupY, z: zTrack, dirA: [-brVecSup[0], -brVecSup[1], 0], dirB: [0, 0, 1] },
      { id: `up_r_${rad.id}`, kind: 'elbow_90', sys: 'T2', pipeFamilyId: famId, dnMm: brHyd.outerMm, x: pRetX, y: pRetY, z: zTrack, dirA: [-brVecRet[0], -brVecRet[1], 0], dirB: [0, 0, 1] },
    );
  }

  return {
    radPipes,
    radFittings,
    riserHub,
    pipeBySize: [...pipeBySizeMap.values()],
    totalPipeM: round2(totalPipeM),
    totalTrunkWaterVolL: round2(totalTrunkWaterVolL),
  };
}

/**
 * Butun bino bo'yicha ОВиК tizimlarini (1.0 pasport raschotlari + GalfDesign detalizatsiyalari) hisoblab chizadi!
 */
export function buildProjectOvSystems(project, heatReport, mepConfig = {}) {
  const ufStepMainM = (Number(mepConfig.ufStepMm) || 150) / 1000;
  const ufStepBathM = 0.125;
  const heatingScheme = mepConfig.heatingScheme || 'combined';
  const ufPipeId = mepConfig.ufPipeId || 'pex_16_20';
  const ufScreedType = mepConfig.ufScreedType || 'wet';
  const ufXpsMm = Number(mepConfig.ufXpsMm) || 50;
  const ufSupplyTempC = Number(mepConfig.ufSupplyTempC) || 42;
  const ufReturnTempC = Number(mepConfig.ufReturnTempC) || 35;

  const radModelId = mepConfig.radModelId || 'rt_panel_c22';
  const convectorModelId = mepConfig.convectorModelId || 'rt_atrium_turbo';
  const convectorSpeedPct = Number(mepConfig.convectorSpeedPct ?? 60);
  const radSupplyTempC = Number(mepConfig.radSupplyTempC) || 70;
  const radReturnTempC = Number(mepConfig.radReturnTempC) || 55;
  // Legacy 'bottom_h' / 'side_diag' ni yangi 1.0 ulanish ID lariga silliq o'tkazish
  const radConnectionId = mepConfig.radConnectionId
    || (mepConfig.radConnection === 'side_diag' ? 'diag_lr' : 'bottom_right_50');
  const radFeedMount = mepConfig.radFeedMount || 'wall'; // 'wall' (из стены) | 'floor' (из пола)
  const radEnclosureId = mepConfig.radEnclosureId || 'sill_shelf';
  const radTopology = SPS_HEATING_TOPOLOGIES[mepConfig.radTopology] ? mepConfig.radTopology : 'radial';
  const lowWindowEmitterMode = mepConfig.lowWindowEmitterMode === 'trench_convector' ? 'trench_convector' : 'floor_convector';
  const trunkPipeFamilyId = mepConfig.trunkPipeFamilyId || 'te_sa_press';
  const enableVent = mepConfig.enableVent !== false;
  const coolingSystemMode = mepConfig.coolingSystemMode || (project?.isOfficeProject ? 'fancoil_4way' : 'split');
  const ventDiffuserType = mepConfig.ventDiffuserType || (project?.isOfficeProject ? '4apn_ksd' : 'dpu_anemostat');

  const floorsSorted = [...(project.floors || [])].sort((a, b) => (a.elevationM || 0) - (b.elevationM || 0));
  const lowestFloorId = floorsSorted[0]?.id;

  const floorsOut = [];
  const globalPipeSizeMap = new Map();
  const fittingSummary = {
    teesEqual: 0,
    teesReducing: 0,
    elbows90: 0,
    reducers: 0,
    adaptersEk: 0,
    obvods: 0,
  };

  let totalUfPipeM = 0;
  let totalUfTransitM = 0;
  let totalUfAreaM2 = 0;
  let totalUfLoops = 0;
  let totalUfWaterVolL = 0;
  let totalUfLoadW = 0;
  let totalUfFlowLpm = 0;
  let maxProjectLoopDpKpa = 0;

  let totalRadiators = 0;
  let totalConvectors = 0;
  let totalFloorConvectors = 0;
  let totalTowelWarmers = 0;
  let totalRadPipeM = 0;
  let totalRadWaterVolL = 0;
  let totalTrunkWaterVolL = 0;
  let totalRadLoadW = 0;
  let totalDamperTapeM = 0;
  let totalVentDuctM = 0;
  let totalVentDuct160M = 0;
  let totalVentDuct125M = 0;
  let totalVentSilencers = 0;
  let totalVentDampers = 0;
  let totalVentReducers = 0;
  let totalExtGrilles = 0;
  let totalVentSupplyDiffs = 0;
  let totalVentExhaustDiffs = 0;
  let totalVentSupplyM3h = 0;
  let totalVentExhaustM3h = 0;
  let totalSplitUnits = 0;
  let totalFancoilUnits = 0;
  let totalFancoilPipeM = 0;
  let totalCoolingInstalledW = 0;
  const allRoomBalances = [];

  for (const fl of project.floors || []) {
    const flHeat = heatReport.floors.find((f) => f.floorId === fl.id) || { rooms: [] };
    const nm = getNodeMap(fl);
    const hFloor = Number(fl.heightM) || 3.0;
    const isLowest = fl.id === lowestFloorId;

    // 1. ВОДЯНОЙ ТЁПЛЫЙ ПОЛ («УЛИТКА» + 1.0 ПИРОГ И БАЛАНСИРОВКА Kv)
    const tpCollector = findOptimalCollectorPosition(fl, 'tp');
    const rawLoops = [];

    if (heatingScheme !== 'none' && heatingScheme !== 'radiators_only') {
      let loopCounter = 1;
      for (const rm of fl.rooms || []) {
        if (rm.roomType === 'boiler' || rm.roomType === 'wardrobe' || rm.roomType === 'stairwell' || rm.excludeWarmFloor) continue;
        if ((rm.areaM2 || 0) < 1.6) continue;

        totalDamperTapeM += (Number(rm.perimeterM) || Math.sqrt(rm.areaM2) * 4) * 1.05;
        const stepM = rm.roomType === 'bath' || rm.roomType === 'bathroom' ? ufStepBathM : ufStepMainM;
        const rh = flHeat.rooms.find((x) => x.roomId === rm.id);
        const tRoom = rh?.tInC || 22;
        const isGroundSlab = isLowest && !fl.subfloorIsHeated;

        // 1.0 Excel pirog hisobi (Tanlangan ufXpsMm — 30/50/100 мм — sozlama, hisob, chizma va smetada 100% bir xil!)
        const fluxCalc = computeUnderfloorFlux({
          coverType: rm.floorMat || (rm.roomType === 'bath' || rm.roomType === 'bathroom' ? 'tile' : 'laminate'),
          screedType: ufScreedType,
          stepM,
          supplyTemp: ufSupplyTempC,
          returnTemp: ufReturnTempC,
          roomTemp: tRoom,
          subfloorMode: isGroundSlab ? 'ground' : 'interfloor',
          xpsMm: ufXpsMm,
          pipeId: ufPipeId,
          designTempOut: heatReport.city.tWinterC,
          roomType: rm.roomType,
        });

        const rectZones = decomposePolygonIntoRectZones(rm.innerPoly || [], 0.16);
        // Panoramali oyna ostida vnutripolniy konvektor bo'lsa, tyopliy pol zonasini 0.36m ichkariga chekinamiz (ustma-ust tushmasligi uchun!)
        const convWindows = heatingScheme === 'uf_only'
          ? []
          : (fl.openings || []).filter((op) => op.type === 'window' && Number(op.sillM ?? 0.85) <= 0.35);

        const convInset = lowWindowEmitterMode === 'trench_convector' ? 0.34 : 0.23;
        for (const rawRz of rectZones) {
          const rz = { ...rawRz };
          // Chekkadagi kotyol + kollektor burchagi (mepCornerHint) oldidan 0.55 m joy qoldiramiz!
          if (fl.mepCornerHint && Math.abs(rz.y0 - fl.mepCornerHint.y) < 0.45 && rz.x0 <= fl.mepCornerHint.x + 1.5) {
            rz.y0 = roundMm(fl.mepCornerHint.y + 0.55);
          }
          for (const cw of convWindows) {
            const wObj = (fl.walls || []).find((x) => x.id === cw.wallId);
            const a = wObj ? nm.get(wObj.n1) : null;
            const bNd = wObj ? nm.get(wObj.n2) : null;
            if (!a || !bNd) continue;
            const wx = a.x + (bNd.x - a.x) * cw.t;
            const wy = a.y + (bNd.y - a.y) * cw.t;
            if (wx >= rz.x0 - 0.5 && wx <= rz.x1 + 0.5 && Math.abs(wy - rz.y0) < 0.55) rz.y0 = roundMm(rz.y0 + convInset);
            else if (wx >= rz.x0 - 0.5 && wx <= rz.x1 + 0.5 && Math.abs(wy - rz.y1) < 0.55) rz.y1 = roundMm(rz.y1 - convInset);
            else if (wy >= rz.y0 - 0.5 && wy <= rz.y1 + 0.5 && Math.abs(wx - rz.x0) < 0.55) rz.x0 = roundMm(rz.x0 + convInset);
            else if (wy >= rz.y0 - 0.5 && wy <= rz.y1 + 0.5 && Math.abs(wx - rz.x1) < 0.55) rz.x1 = roundMm(rz.x1 - convInset);
          }
          if (rz.x1 - rz.x0 < 0.55 || rz.y1 - rz.y0 < 0.55) continue;

          const zCx = (rz.x0 + rz.x1) * 0.5;
          const zCy = (rz.y0 + rz.y1) * 0.5;
          const transitDist = Math.abs(zCx - tpCollector.x) + Math.abs(zCy - tpCollector.y);
          const subZones = splitZoneForMaxPipeLength(rz, stepM, transitDist, 86);

          for (const sz of subZones) {
            const spiral = generateValtecDoubleSpiral(sz, stepM, tpCollector, loopCounter);
            const zoneAreaM2 = round2((sz.x1 - sz.x0) * (sz.y1 - sz.y0));

            rawLoops.push({
              id: `tp_f${fl.id}_${loopCounter}`,
              loopIndex: loopCounter,
              label: `К-${loopCounter}`,
              roomId: rm.id,
              roomCode: rh?.roomCode || '',
              roomName: rm.name,
              roomTempC: tRoom,
              coverType: fluxCalc.coverType,
              screedName: fluxCalc.screedName,
              xpsMm: fluxCalc.xpsMm,
              stepMm: Math.round(stepM * 1000),
              areaM2: zoneAreaM2,
              heatingLenM: spiral.heatingLenM,
              transitLenM: spiral.transitLenM,
              totalLenM: spiral.lengthM,
              lengthM: spiral.lengthM,
              qUpWm2: fluxCalc.qUpWm2,
              qDownWm2: fluxCalc.qDownWm2,
              surfaceTempC: fluxCalc.surfaceTempC,
              maxAllowedSurfaceTempC: fluxCalc.maxAllowedSurfaceTempC,
              surfaceTempOk: fluxCalc.surfaceTempOk,
              badgeX: spiral.centerX,
              badgeY: spiral.centerY,
              cuffSup: spiral.cuffSup,
              cuffRet: spiral.cuffRet,
              supplyPts: spiral.supplyPts,
              returnPts: spiral.returnPts,
              transitSupplyPts: spiral.transitSupplyPts,
              transitReturnPts: spiral.transitReturnPts,
            });
            totalUfPipeM += spiral.lengthM;
            totalUfTransitM += spiral.transitLenM;
            totalUfAreaM2 += zoneAreaM2;
            totalUfLoops += 1;
            loopCounter += 1;
          }
        }
      }
    }

    // 1.0 Kollektor balansirovkasi (G л/мин, ΔP мм.в.ст / м.в.ст / кПа, Kv, Индексная петля!)
    const ufLoops = computeUfLoopHydraulics(rawLoops, {
      pipeId: ufPipeId,
      deltaT: Math.max(4, ufSupplyTempC - ufReturnTempC),
    });

    for (const lp of ufLoops) {
      totalUfWaterVolL += lp.waterVolumeL || 0;
      totalUfLoadW += lp.qLoopTotalW || lp.outputW || 0;
      totalUfFlowLpm += lp.flowLpm || 0;
      if ((lp.dpKpa || 0) > maxProjectLoopDpKpa) maxProjectLoopDpKpa = lp.dpKpa;
    }

    const tpPorts = Math.min(15, Math.max(2, ufLoops.length));
    const tpCollectorObj = ufLoops.length > 0 ? {
      id: `shrv_tp_${fl.id}`,
      label: `ШРВ-${fl.id} (${tpPorts} вых.)`,
      galfCallout: `Коллектор напольного отопления ${fl.name} — ${tpPorts} вых. (${CH_8468_COLLECTOR_CODES[tpPorts] || 'TP-02445'})`,
      x: tpCollector.x,
      y: tpCollector.y,
      zM: 0.62,
      ports: tpPorts,
      activeLoopCount: ufLoops.length,
      skuCode: CH_8468_COLLECTOR_CODES[tpPorts] || 'TP-02445',
      modelName: `Коллектор с расходомерами нержавеющий Climate House 8468 ${tpPorts} вых.`,
    } : null;

    // 2. РАДИАТОРЫ, НАПОЛЬНЫЕ КОНВЕКТОРЫ KONVEKA FC И ВНУТРИПОЛЬНЫЕ КОНВЕКТОРЫ (Т1/Т2 · LOD 400 + 3 РАЗВОДКИ!)
    const radCollector = findOptimalCollectorPosition(fl, 'rad');
    const radiators = [];

    if (heatingScheme !== 'none' && heatingScheme !== 'uf_only') {
      const b = getFloorWorldBounds(fl);
      const bCx = (b.minX + b.maxX) * 0.5;
      const bCy = (b.minY + b.maxY) * 0.5;

      const windows = (fl.openings || []).filter((o) => o.type === 'window');
      let radIdx = 1;

      for (const win of windows) {
        const w = (fl.walls || []).find((x) => x.id === win.wallId);
        if (!w) continue;
        const a = nm.get(w.n1);
        const bNd = nm.get(w.n2);
        if (!a || !bNd) continue;

        const dx = bNd.x - a.x;
        const dy = bNd.y - a.y;
        const wLen = Math.hypot(dx, dy) || 1;
        const ux = dx / wLen;
        const uy = dy / wLen;

        const wx = a.x + dx * win.t;
        const wy = a.y + dy * win.t;

        let inNx = -uy;
        let inNy = ux;
        if ((bCx - wx) * inNx + (bCy - wy) * inNy < 0) {
          inNx = -inNx;
          inNy = -inNy;
        }

        const wallHalfT = (Number(w.thickness) || 0.38) * 0.5;
        const hostRoom = (fl.rooms || []).find((r) =>
          pointInPolygon(wx + inNx * (wallHalfT + 0.35), wy + inNy * (wallHalfT + 0.35), r.innerPoly || []),
        );
        const rmHeat = flHeat.rooms.find((rh) => rh.roomId === hostRoom?.id);
        const roomUfW = ufLoops.filter((l) => l.roomId === hostRoom?.id).reduce((s, l) => s + l.outputW, 0);
        const roomWinCount = Math.max(1, windows.filter((ow) => ow.wallId === w.id).length);
        const deficitW = Math.max(
          520,
          Math.round(((rmHeat?.heatLossW || 1550) - roomUfW * 0.72) / roomWinCount),
        );

        const sillM = Number(win.sillM ?? 0.85);
        const winWM = Number(win.widthM) || 1.5;
        const isLowPanoramicWindow = sillM <= 0.35;
        const resolvedEmitterKind = radModelId === 'konveka_fc_floor'
          ? 'floor_convector'
          : isLowPanoramicWindow
            ? (lowWindowEmitterMode === 'trench_convector' ? 'convector' : 'floor_convector')
            : 'radiator';

        // 1.0 Pasport qayta hisobi!
        const calcUnit = computeRadiatorOrConvectorUnit({
          kind: resolvedEmitterKind,
          needW: deficitW,
          supplyTemp: radSupplyTempC,
          returnTemp: radReturnTempC,
          roomTemp: rmHeat?.tInC || 22,
          modelId: radModelId,
          convectorModelId,
          connectionId: radConnectionId,
          feedMount: radFeedMount,
          enclosureId: radEnclosureId,
          convectorSpeedPct,
          sillHeightM: sillM,
          winWidthM: winWM,
        });

        const isTrenchConv = calcUnit.kind === 'convector';
        const isStandingFloorConv = calcUnit.kind === 'floor_convector';
        const wallFaceOff = isTrenchConv ? 0.19 : (isStandingFloorConv ? 0.135 : 0.105);
        const offsetFromAxis = wallHalfT + wallFaceOff;
        const rx = roundMm(wx + inNx * offsetFromAxis);
        const ry = roundMm(wy + inNy * offsetFromAxis);
        const angleRad = Math.atan2(uy, ux);

        if (isTrenchConv) totalConvectors += 1;
        else if (isStandingFloorConv) {
          totalConvectors += 1;
          totalFloorConvectors += 1;
        } else {
          totalRadiators += 1;
        }

        // Ulanish portlari (Multiflex 50mm markazda/o'ngda/chapda yoki Diagonal/Yon)
        let mfCenterAlong = 0;
        if (!isTrenchConv && calcUnit.hasMultiflex) {
          const endInset = isStandingFloorConv ? 0.095 : 0.065;
          if (calcUnit.connectionSide === 'right') mfCenterAlong = calcUnit.widthM * 0.5 - endInset;
          else if (calcUnit.connectionSide === 'left') mfCenterAlong = -calcUnit.widthM * 0.5 + endInset;
          else mfCenterAlong = 0; // Rifar Tubog markaziy 50mm!
        }

        const multiflexPt = (!isTrenchConv && calcUnit.hasMultiflex)
          ? [roundMm(rx + ux * mfCenterAlong), roundMm(ry + uy * mfCenterAlong)]
          : null;

        let pSupX, pSupY, pRetX, pRetY;
        if (isTrenchConv) {
          const endShift = -calcUnit.widthM * 0.5 + 0.085;
          pSupX = roundMm(rx + ux * (endShift - 0.028) + inNx * 0.12);
          pSupY = roundMm(ry + uy * (endShift - 0.028) + inNy * 0.12);
          pRetX = roundMm(rx + ux * (endShift + 0.028) + inNx * 0.12);
          pRetY = roundMm(ry + uy * (endShift + 0.028) + inNy * 0.12);
        } else if (multiflexPt) {
          const effFeedWall = calcUnit.feedMount === 'wall';
          const feedBackShift = effFeedWall ? -wallFaceOff + 0.012 : 0;
          pSupX = roundMm(multiflexPt[0] - ux * 0.025 + inNx * feedBackShift);
          pSupY = roundMm(multiflexPt[1] - uy * 0.025 + inNy * feedBackShift);
          pRetX = roundMm(multiflexPt[0] + ux * 0.025 + inNx * feedBackShift);
          pRetY = roundMm(multiflexPt[1] + uy * 0.025 + inNy * feedBackShift);
        } else if (calcUnit.connectionScheme === 'side') {
          const sideSign = calcUnit.connectionSide === 'right' ? 1 : -1;
          const baseTapX = rx + ux * sideSign * (calcUnit.widthM * 0.5 + 0.035);
          const baseTapY = ry + uy * sideSign * (calcUnit.widthM * 0.5 + 0.035);
          pSupX = roundMm(baseTapX + ux * sideSign * 0.045);
          pSupY = roundMm(baseTapY + uy * sideSign * 0.045);
          pRetX = roundMm(baseTapX);
          pRetY = roundMm(baseTapY);
        } else {
          // Diagonal chap-tepa -> o'ng-past
          const wallShift = calcUnit.feedMount === 'wall' ? -wallFaceOff + 0.015 : 0;
          pSupX = roundMm(rx - ux * (calcUnit.widthM * 0.5 + 0.035) + inNx * wallShift);
          pSupY = roundMm(ry - uy * (calcUnit.widthM * 0.5 + 0.035) + inNy * wallShift);
          pRetX = roundMm(rx + ux * (calcUnit.widthM * 0.5 + 0.035) + inNx * wallShift);
          pRetY = roundMm(ry + uy * (calcUnit.widthM * 0.5 + 0.035) + inNy * wallShift);
        }

        const zSupPort = isTrenchConv
          ? 0.02
          : isStandingFloorConv
            ? 0.062
            : (calcUnit.hasMultiflex ? 0.092 : 0.56);
        const zRetPort = isTrenchConv
          ? 0.02
          : isStandingFloorConv
            ? 0.062
            : 0.092;

        const radObj = {
          id: `rad_f${fl.id}_${radIdx}`,
          label: isTrenchConv ? `ВК-${radIdx}` : (isStandingFloorConv ? `НК-${radIdx}` : `Р-${radIdx}`),
          roomId: hostRoom?.id || null,
          roomCode: rmHeat?.roomCode || '',
          roomName: hostRoom?.name || 'Xona',
          connectionType: calcUnit.hasMultiflex ? 'bottom_h' : 'side_diag',
          x: rx,
          y: ry,
          angleRad,
          ux,
          uy,
          inNx,
          inNy,
          wallFaceOff,
          multiflexPt,
          ...calcUnit,
          requiredW: deficitW,
          reservePct: Math.round(((calcUnit.powerW - deficitW) / Math.max(1, deficitW)) * 100),
          branchPipeLabel: 'Ø16×2.0',
          branchVelocityMs: 0.22,
          branchDpKpa: 0.6,
          supplyPort: [pSupX, pSupY, zSupPort],
          returnPort: [pRetX, pRetY, zRetPort],
        };
        radiators.push(radObj);

        totalRadWaterVolL += calcUnit.waterVolumeL || 0;
        totalRadLoadW += calcUnit.powerW || 0;
        radIdx += 1;
      }

      // Sanuzellarga Полотенцесушитель qo'shish
      for (const bth of (fl.rooms || []).filter((r) => r.roomType === 'bathroom' || r.roomType === 'bath')) {
        const pb = getPolyBounds(bth.innerPoly || [[0, 0], [2, 2]]);
        const tx = roundMm(pb.minX + 0.08);
        const ty = roundMm((pb.minY + pb.maxY) * 0.5);
        radiators.push({
          id: `ps_f${fl.id}_${bth.id}`,
          label: 'ПС',
          kind: 'towel_warmer',
          radType: 'towel_warmer',
          skuCode: 'RD-01903',
          model: 'Полотенцесушитель водяной AISI 304 500×800 мм',
          roomId: bth.id,
          roomName: bth.name,
          connectionType: 'bottom_h',
          connectionLabel: 'Настенные эксцентрики 1/2"',
          feedMount: 'wall',
          x: tx,
          y: ty,
          angleRad: Math.PI * 0.5,
          ux: 0,
          uy: 1,
          inNx: 1,
          inNy: 0,
          wallFaceOff: 0.08,
          widthM: 0.50,
          depthM: 0.09,
          heightM: 0.80,
          heightMm: 800,
          zBottomM: 0.95,
          supplyTemp: radSupplyTempC,
          returnTemp: radReturnTempC,
          deltaT: round1((radSupplyTempC + radReturnTempC) / 2 - 24),
          qNomW: 620,
          beta1: 1.0,
          beta2: 1.0,
          beta3: 1.0,
          powerW: 480,
          requiredW: 420,
          reservePct: 14,
          flowLpm: 0.46,
          waterVolumeL: 2.1,
          supplyPort: [tx, roundMm(ty - 0.22), 0.95],
          returnPort: [tx, roundMm(ty + 0.22), 0.95],
        });
        totalTowelWarmers += 1;
        totalRadWaterVolL += 2.1;
        totalRadLoadW += 480;
      }

      // 2B. Ойнасиз ёки зинахона (Zinaxona +16°C, 938 W) каби иссиқлик йўқотиши бор, аммо прибори қўйилмаган хоналарга девор радиатори!
      for (const rm of (fl.rooms || [])) {
        if (['boiler', 'wardrobe', 'bathroom', 'bath'].includes(rm.roomType)) continue;
        if (rm.roomType === 'stairwell' && mepConfig.heatStairwell === false) continue;

        const rmHeat = flHeat.rooms.find((rh) => rh.roomId === rm.id);
        const needRoomW = Math.round(rmHeat?.heatLossW || 0);
        if (needRoomW < 180) continue;

        const curUfW = ufLoops.filter((l) => l.roomId === rm.id).reduce((s, l) => s + (l.outputW || 0), 0);
        const curRadW = radiators.filter((r) => r.roomId === rm.id).reduce((s, r) => s + (r.powerW || 0), 0);
        if (curUfW + curRadW > 0) continue;

        const pb = getPolyBounds(rm.innerPoly || [[0, 0], [2, 2]]);
        const wallFaceOff = 0.105;
        const maxFitWidthM = Math.max(0.8, Math.min(1.6, pb.width - 0.55));
        const calcStairUnit = computeRadiatorOrConvectorUnit({
          kind: 'radiator',
          needW: needRoomW,
          supplyTemp: radSupplyTempC,
          returnTemp: radReturnTempC,
          roomTemp: rmHeat?.tInC || 16,
          modelId: radModelId === 'konveka_fc_floor' ? 'rt_panel_c22' : radModelId,
          convectorModelId,
          connectionId: radConnectionId,
          feedMount: radFeedMount,
          enclosureId: 'open_wall',
          sillHeightM: 0.90,
          winWidthM: maxFitWidthM,
        });

        // Zinaxona yoki xollning eshik/zina marshiga tegmaydigan shimoliy toza devoriga joylashtiramiz
        const ux = 1;
        const uy = 0;
        const inNx = 0;
        const inNy = 1;
        const rx = roundMm(Math.min(pb.maxX - calcStairUnit.widthM * 0.5 - 0.35, Math.max(pb.minX + calcStairUnit.widthM * 0.5 + 0.25, pb.maxX - 0.85)));
        const ry = roundMm(pb.minY + wallFaceOff);

        let mfCenterAlong = 0;
        if (calcStairUnit.hasMultiflex) {
          if (calcStairUnit.connectionSide === 'right') mfCenterAlong = calcStairUnit.widthM * 0.5 - 0.065;
          else if (calcStairUnit.connectionSide === 'left') mfCenterAlong = -calcStairUnit.widthM * 0.5 + 0.065;
        }
        const multiflexPt = calcStairUnit.hasMultiflex
          ? [roundMm(rx + ux * mfCenterAlong), roundMm(ry + uy * mfCenterAlong)]
          : null;

        let pSupX, pSupY, pRetX, pRetY;
        if (multiflexPt) {
          const feedBackShift = calcStairUnit.feedMount === 'wall' ? -wallFaceOff + 0.012 : 0;
          pSupX = roundMm(multiflexPt[0] - 0.025);
          pSupY = roundMm(multiflexPt[1] + feedBackShift);
          pRetX = roundMm(multiflexPt[0] + 0.025);
          pRetY = roundMm(multiflexPt[1] + feedBackShift);
        } else {
          const wallShift = calcStairUnit.feedMount === 'wall' ? -wallFaceOff + 0.015 : 0;
          pSupX = roundMm(rx - (calcStairUnit.widthM * 0.5 + 0.035));
          pSupY = roundMm(ry + wallShift);
          pRetX = roundMm(rx + (calcStairUnit.widthM * 0.5 + 0.035));
          pRetY = roundMm(ry + wallShift);
        }

        const zSupPort = calcStairUnit.hasMultiflex ? 0.092 : 0.56;
        const zRetPort = 0.092;
        const radIdxNext = radiators.filter((x) => x.kind !== 'towel_warmer').length + 1;

        radiators.push({
          id: `rad_f${fl.id}_rm_${rm.id}`,
          label: `Р-${radIdxNext}`,
          roomId: rm.id,
          roomCode: rmHeat?.roomCode || '',
          roomName: rm.name,
          connectionType: calcStairUnit.hasMultiflex ? 'bottom_h' : 'side_diag',
          x: rx,
          y: ry,
          angleRad: 0,
          ux,
          uy,
          inNx,
          inNy,
          wallFaceOff,
          multiflexPt,
          ...calcStairUnit,
          requiredW: needRoomW,
          reservePct: Math.round(((calcStairUnit.powerW - needRoomW) / Math.max(1, needRoomW)) * 100),
          branchPipeLabel: 'Ø16×2.0',
          branchVelocityMs: 0.20,
          branchDpKpa: 0.5,
          supplyPort: [pSupX, pSupY, zSupPort],
          returnPort: [pRetX, pRetY, zRetPort],
        });
        totalRadiators += 1;
        totalRadWaterVolL += calcStairUnit.waterVolumeL || 0;
        totalRadLoadW += calcStairUnit.powerW || 0;
      }
    }

    // Qavat isitish tarmog'ini tanlangan topologiya ('radial' | 'two_pipe_dead_end' | 'two_pipe_tichelmann') bo'yicha marshrutlash!
    const routedNet = routeFloorHeatingNetwork({
      fl,
      radiators,
      radCollector,
      radTopology,
      trunkPipeFamilyId,
      radSupplyTempC,
      radReturnTempC,
    });

    const radPipes = routedNet.radPipes;
    const radFittings = routedNet.radFittings;
    totalRadPipeM += routedNet.totalPipeM;
    totalTrunkWaterVolL += routedNet.totalTrunkWaterVolL;

    for (const ps of routedNet.pipeBySize) {
      const k = `${ps.familyId}::${ps.outerMm}`;
      const prev = globalPipeSizeMap.get(k) || { ...ps, lengthM: 0 };
      prev.lengthM = round2(prev.lengthM + ps.lengthM);
      globalPipeSizeMap.set(k, prev);
    }
    for (const ft of radFittings) {
      if (ft.kind === 'tee') {
        if (ft.dnMm !== ft.outDnMm || ft.dnMm !== ft.branchDnMm) fittingSummary.teesReducing += 1;
        else fittingSummary.teesEqual += 1;
      } else if (ft.kind === 'elbow_90') fittingSummary.elbows90 += 1;
      else if (ft.kind === 'reducer') fittingSummary.reducers += 1;
      else if (ft.kind === 'adapter_ek') fittingSummary.adaptersEk += 1;
      else if (ft.kind === 'obvod') fittingSummary.obvods += 1;
    }

    const radPorts = Math.min(15, Math.max(2, radiators.length));
    const radCollectorObj = (radTopology === 'radial' && radiators.length > 0) ? {
      id: `shrv_rad_${fl.id}`,
      label: `ШРВ-Р${fl.id} (${radPorts} вых.)`,
      galfCallout: `Коллектор радиаторного отопления ${fl.name} — ${radPorts} вых. (${CH_7200S_COLLECTOR_CODES[radPorts] || 'TP-02456'})`,
      x: radCollector.x,
      y: radCollector.y,
      zM: 0.55,
      ports: radPorts,
      activeRadCount: radiators.length,
      skuCode: CH_7200S_COLLECTOR_CODES[radPorts] || 'TP-02456',
      modelName: `Коллекторная группа Climate House 7200 1" ${radPorts} вых.`,
    } : null;

    // 2C. ХОНАЛАР БЎЙИЧА ИСИТИШ БАЛАНСИ ВА ЕТИШМОВЧИЛИК (ДЕФИЦИТ) ТЕКШИРУВИ:
    const roomBalances = flHeat.rooms.map((rh) => {
      const ufOutputW = Math.round(ufLoops.filter((l) => l.roomId === rh.roomId).reduce((s, l) => s + (l.outputW || 0), 0));
      const radOutputW = Math.round(radiators.filter((r) => r.roomId === rh.roomId).reduce((s, r) => s + (r.powerW || 0), 0));
      const installedW = ufOutputW + radOutputW;
      const requiredW = Math.round(rh.heatLossW || 0);
      const isBoilerRoom = rh.roomType === 'boiler';
      const deltaW = installedW - requiredW;
      const deficitW = isBoilerRoom ? 0 : Math.max(0, requiredW - installedW);
      const hasDeficit = heatingScheme !== 'none' && deficitW > 45;
      const coveragePct = requiredW > 0 ? Math.round((installedW / requiredW) * 100) : 100;
      return {
        floorId: fl.id,
        floorName: fl.name,
        roomId: rh.roomId,
        roomCode: rh.roomCode,
        roomName: rh.roomName,
        roomType: rh.roomType,
        tInC: rh.tInC,
        requiredW,
        ufOutputW,
        radOutputW,
        installedW,
        deltaW,
        deficitW,
        coveragePct,
        isBoilerRoom,
        hasDeficit,
      };
    });
    allRoomBalances.push(...roomBalances);

    // 3. ПРИТОЧНО-ВЫТЯЖНАЯ ВЕНТИЛЯЦИЯ С РЕКУПЕРАТОРОМ (П1 / В1 · Galvent + Арктос 4АПН/ДКВ/ДЩ/ДПУ-М + 3КСД + СР + ДК) + ФАНКОЙЛЫ ЧИЛЛЕР–ФАНКОЙЛ
    const ventDucts = [];
    const ventTerminals = [];
    const ventSilencers = [];
    const ventFittings = [];
    const acUnits = [];
    const fancoilPipes = [];
    let ahuUnit = null;

    if (enableVent && (fl.rooms || []).length > 0) {
      const heatedRooms = (fl.rooms || []).filter((r) => r.roomType !== 'stairwell');
      const techOrHall = heatedRooms.find((r) => ['boiler', 'hallway', 'hall'].includes(r.roomType)) || heatedRooms[0] || fl.rooms[0];
      const tb = getPolyBounds(techOrHall.innerPoly || [[0, 0], [3, 3]]);
      const zCeil = roundMm(hFloor - 0.22); // Z = 2.88 m (3.10 m shift plitasi ostida M8 shpilkalarda osilgan!)
      const zDiffFace = roundMm(hFloor - 0.35); // Z = 2.75 m -> 3КСД (H=0.20m) yon shtutseri aynan Z=2.88 m da tushadi!
      const isBigAir = heatReport.balancedAirM3h > 380;

      ahuUnit = {
        id: `pvu_f${fl.id}`,
        label: isBigAir ? 'ПВУ CS-550' : 'ПВУ CS-400',
        skuCode: isBigAir ? 'VT-03766' : 'VT-03765',
        model: isBigAir
          ? 'Рекуператор Climate House CS 550-ERV-B-Z-EC (550 м³/ч)'
          : 'Рекуператор Climate House CS 400-ERV-B-Z-EC (400 м³/ч)',
        x: roundMm(fl.ahuAnchor?.x ?? (tb.minX + tb.maxX) * 0.5),
        y: roundMm(fl.ahuAnchor ? fl.ahuAnchor.y - 0.10 : (tb.minY + tb.maxY) * 0.5),
        zM: zCeil,
        wM: 1.12,
        dM: 0.76,
        hM: 0.26,
      };

      const p1PortX = roundMm(ahuUnit.x + 0.28);
      const v1PortX = roundMm(ahuUnit.x - 0.28);
      const roomPortY = roundMm(ahuUnit.y + ahuUnit.dM * 0.5);
      const extPortY = roundMm(ahuUnit.y - ahuUnit.dM * 0.5);

      // 3A. ПВУ chiqishida 2 ta трубчатый шумоглушитель Арктос СР 160/600 (вентилятор шовқинини <32 дБА гача пасайтиради!)
      ventSilencers.push(
        { id: `sil_p1_${fl.id}`, sys: 'P1', label: 'ШГ-П1 СР160/600', dnMm: 160, outerMm: 260, lenM: 0.58, x: p1PortX, y: roundMm(roomPortY + 0.42), zM: zCeil, dirX: 0, dirY: 1 },
        { id: `sil_v1_${fl.id}`, sys: 'V1', label: 'ШГ-В1 СР160/600', dnMm: 160, outerMm: 260, lenM: 0.58, x: v1PortX, y: roundMm(roomPortY + 0.42), zM: zCeil, dirX: 0, dirY: 1 },
      );
      totalVentSilencers += 2;

      // 3B. Наружный забор воздуха (Н1) ва Выброс (В2) + Наружные решётки ВРН 300×300 (ораси >1.2 м)
      const northExtWallY = roundMm(Math.min(...heatedRooms.map((r) => getPolyBounds(r.innerPoly || [[0, 1]]).minY)) - 0.34);
      if (extPortY - northExtWallY >= 0.35 && extPortY - northExtWallY <= 3.5) {
        const n1Pts = [[v1PortX, extPortY, zCeil], [v1PortX, northExtWallY, zCeil]];
        const v2OutX = roundMm(Math.min(ahuUnit.x + 0.92, p1PortX + 0.62));
        const v2Pts = [
          [p1PortX, extPortY, zCeil],
          [p1PortX, roundMm(extPortY - 0.42), zCeil],
          [v2OutX, roundMm(extPortY - 0.42), zCeil],
          [v2OutX, northExtWallY, zCeil],
        ];
        ventDucts.push(
          { id: `duct_n1_${fl.id}`, sys: 'N1', dnMm: 160, skuCode: 'VT-03777', pts3d: n1Pts },
          { id: `duct_v2_${fl.id}`, sys: 'V2', dnMm: 160, skuCode: 'VT-03777', pts3d: v2Pts },
        );
        const extLen = Math.abs(extPortY - northExtWallY) * 2 + Math.abs(v2OutX - p1PortX);
        totalVentDuctM += extLen;
        totalVentDuct160M += extLen;
        ventFittings.push(
          { id: `vrn_n1_${fl.id}`, kind: 'ext_grille', sys: 'N1', label: 'ВРН-Н1', x: v1PortX, y: northExtWallY, zM: zCeil },
          { id: `vrn_v2_${fl.id}`, kind: 'ext_grille', sys: 'V2', label: 'ВРН-В2', x: v2OutX, y: northExtWallY, zM: zCeil },
        );
        totalExtGrilles += 2;
      }

      const fcRiserX = roundMm(fl.mepCornerHint ? fl.mepCornerHint.x - 0.18 : ahuUnit.x - 0.35);
      const fcRiserY = roundMm(fl.mepCornerHint ? fl.mepCornerHint.y + 0.12 : ahuUnit.y);
      const zFcPipe = roundMm(hFloor - 0.16);
      let fcIdx = 1;

      const diffSku = ventDiffuserType === '4apn_ksd'
        ? 'ARK-4APN-450'
        : ventDiffuserType === 'dkv_swirl'
          ? 'ARK-DKV-450'
          : ventDiffuserType === 'dsh_slot'
            ? 'ARK-DSH-1000'
            : 'VT-03731';

      for (const rm of heatedRooms) {
        const rh = flHeat.rooms.find((x) => x.roomId === rm.id);
        const rb = getPolyBounds(rm.innerPoly || [[0, 0], [3, 3]]);
        const cx = roundMm((rb.minX + rb.maxX) * 0.5);
        const cy = roundMm((rb.minY + rb.maxY) * 0.5);

        if (rm.roomType === 'office' && (rm.areaM2 || 0) >= 38) {
          // Katta 12-kishilik ofis zali:
          // - П1 Приток: ish stollari ustida 4 ta shift diffuzori (аниқ бутун сонлар йиғиндиси = rh.supplyAirM3h!)
          // - В1 Вытяжка: koridor va o'tish yo'laklarida 3 ta diffuzor (аниқ бутун сонлар йиғиндиси = rh.exhaustAirM3h!)
          const yRowTop = roundMm(Math.max(rb.minY + 4.55, 5.32));
          const yRowBot = roundMm(rb.maxY - 1.12);
          const xDiffLeft = roundMm(Math.max(rb.minX + 2.05, 7.15));
          const xDiffRight = roundMm(rb.maxX - 1.26);
          const p1SpineX = roundMm(fl.officeInterior ? 9.48 : (xDiffLeft + xDiffRight) * 0.5 + 0.55);
          const roomSupTotal = rh?.supplyAirM3h ?? 514;
          const roomExTotal = rh?.exhaustAirM3h ?? Math.max(0, roomSupTotal - 6);
          const supFlows4 = splitFlowIntoExactIntegers(roomSupTotal, 4);
          const exFlows3 = splitFlowIntoExactIntegers(roomExTotal, 3);

          // П1 Ø160 bosh magistral (ПВУ -> ШГ-П1 -> Y=4.92 -> X=9.48 -> Y=6.60) + Переход Ø160/125 -> Ø125 davomi (Y=6.60 -> yRowBot)
          const yTurn = roundMm(yRowTop - 0.38);
          const yReduceP1 = roundMm((yRowTop + yRowBot) * 0.5 - 1.10);
          ventDucts.push(
            {
              id: `duct_p1_160_${rm.id}`,
              sys: 'P1',
              dnMm: 160,
              skuCode: 'GALV-160',
              pts3d: [[p1PortX, roomPortY, zCeil], [p1PortX, yTurn, zCeil], [p1SpineX, yTurn, zCeil], [p1SpineX, yReduceP1, zCeil]],
            },
            {
              id: `duct_p1_125_${rm.id}`,
              sys: 'P1',
              dnMm: 125,
              skuCode: 'GALV-125',
              pts3d: [[p1SpineX, yReduceP1, zCeil], [p1SpineX, yRowBot, zCeil]],
            },
          );
          const p1Len160 = Math.abs(yTurn - roomPortY) + Math.abs(p1SpineX - p1PortX) + Math.abs(yReduceP1 - yTurn);
          const p1Len125 = Math.abs(yRowBot - yReduceP1);
          totalVentDuct160M += p1Len160;
          totalVentDuct125M += p1Len125;
          totalVentDuctM += p1Len160 + p1Len125;

          ventFittings.push({
            id: `red_p1_${rm.id}`,
            kind: 'reducer',
            sys: 'P1',
            inDnMm: 160,
            outDnMm: 125,
            x: p1SpineX,
            y: yReduceP1,
            zM: zCeil,
            dirX: 0,
            dirY: 1,
          });
          totalVentReducers += 1;

          let pIdx = 1;
          for (const dy of [yRowTop, yRowBot]) {
            for (const dx of [xDiffLeft, xDiffRight]) {
              const perSupplyM3h = supFlows4[pIdx - 1] || supFlows4[0];
              const spigotSignX = p1SpineX > dx ? 1 : -1;
              const spigotTipX = roundMm(dx + spigotSignX * 0.36);
              const damperX = roundMm((p1SpineX + spigotTipX) * 0.5);

              ventTerminals.push({
                id: `diff_p1_${rm.id}_${pIdx}`,
                code: `П1-${pIdx}`,
                sys: 'P1',
                diffuserType: ventDiffuserType,
                skuCode: diffSku,
                flowM3h: perSupplyM3h,
                label: `П1 +${perSupplyM3h}`,
                x: dx,
                y: dy,
                zM: zDiffFace,
                spigotDir: [spigotSignX, 0],
                slotAngleRad: 0,
              });
              ventDucts.push({
                id: `duct_p1_br_${rm.id}_${pIdx}`,
                sys: 'P1',
                dnMm: 125,
                skuCode: 'GALV-125',
                pts3d: [[p1SpineX, dy, zCeil], [spigotTipX, dy, zCeil]],
              });
              ventFittings.push({
                id: `dk_p1_${rm.id}_${pIdx}`,
                kind: 'damper',
                sys: 'P1',
                dnMm: 125,
                x: damperX,
                y: dy,
                zM: zCeil,
                dirX: dx > p1SpineX ? 1 : -1,
                dirY: 0,
              });
              const brLen = Math.abs(spigotTipX - p1SpineX) + 0.35;
              totalVentDuct125M += brLen;
              totalVentDuctM += brLen;
              totalVentDampers += 1;
              totalVentSupplyDiffs += 1;
              totalVentSupplyM3h += perSupplyM3h;
              pIdx += 1;
            }
          }

          // В1 Вытяжка: chap yo'lak (X = 5.68) bo'ylab П1 bilan hech qayerda kesishmasdan 3 ta вытяжной диффузор oladi!
          const v1SpineX = roundMm(Math.max(rb.minX + 0.62, 5.68));
          const v1DiffX = roundMm(v1SpineX + 0.72);
          const v1Ys = [
            roundMm(Math.max(roomPortY + 1.35, 4.12)),
            roundMm((yRowTop + yRowBot) * 0.5 - 0.25),
            roundMm(rb.maxY - 0.68),
          ];
          const yReduceV1 = roundMm((v1Ys[0] + v1Ys[1]) * 0.5);

          ventDucts.push(
            {
              id: `duct_v1_160_${rm.id}`,
              sys: 'V1',
              dnMm: 160,
              skuCode: 'GALV-160',
              pts3d: [[v1PortX, roomPortY, zCeil], [v1PortX, roundMm(roomPortY + 0.95), zCeil], [v1SpineX, roundMm(roomPortY + 0.95), zCeil], [v1SpineX, yReduceV1, zCeil]],
            },
            {
              id: `duct_v1_125_${rm.id}`,
              sys: 'V1',
              dnMm: 125,
              skuCode: 'GALV-125',
              pts3d: [[v1SpineX, yReduceV1, zCeil], [v1SpineX, v1Ys[2], zCeil]],
            },
          );
          const v1Len160 = Math.abs(yReduceV1 - roomPortY) + Math.abs(v1PortX - v1SpineX);
          const v1Len125 = Math.abs(v1Ys[2] - yReduceV1);
          totalVentDuct160M += v1Len160;
          totalVentDuct125M += v1Len125;
          totalVentDuctM += v1Len160 + v1Len125;

          ventFittings.push({
            id: `red_v1_${rm.id}`,
            kind: 'reducer',
            sys: 'V1',
            inDnMm: 160,
            outDnMm: 125,
            x: v1SpineX,
            y: yReduceV1,
            zM: zCeil,
            dirX: 0,
            dirY: 1,
          });
          totalVentReducers += 1;

          v1Ys.forEach((vy, vi) => {
            const perExM3h = exFlows3[vi] || exFlows3[0];
            const spTipX = roundMm(v1DiffX - 0.34);
            ventTerminals.push({
              id: `diff_v1_off_${rm.id}_${vi}`,
              code: `В1-${vi + 1}`,
              sys: 'V1',
              diffuserType: ventDiffuserType,
              skuCode: diffSku === 'VT-03731' ? 'VT-03730' : diffSku,
              flowM3h: perExM3h,
              label: `В1 -${perExM3h}`,
              x: v1DiffX,
              y: vy,
              zM: zDiffFace,
              spigotDir: [-1, 0],
              slotAngleRad: Math.PI * 0.5,
            });
            ventDucts.push({
              id: `duct_v1_br_${rm.id}_${vi}`,
              sys: 'V1',
              dnMm: 125,
              skuCode: 'GALV-125',
              pts3d: [[v1SpineX, vy, zCeil], [spTipX, vy, zCeil]],
            });
            ventFittings.push({
              id: `dk_v1_${rm.id}_${vi}`,
              kind: 'damper',
              sys: 'V1',
              dnMm: 125,
              x: roundMm((v1SpineX + spTipX) * 0.5),
              y: vy,
              zM: zCeil,
              dirX: 1,
              dirY: 0,
            });
            totalVentDuct125M += Math.abs(spTipX - v1SpineX) + 0.35;
            totalVentDuctM += Math.abs(spTipX - v1SpineX) + 0.35;
            totalVentDampers += 1;
            totalVentExhaustDiffs += 1;
            totalVentExhaustM3h += perExM3h;
          });
        } else {
          const supFlow = Math.round(rh?.supplyAirM3h || 0);
          if (supFlow > 0) {
            const tx = roundMm(cx + 0.35);
            const ty = roundMm(cy - 0.25);
            const spSignY = ahuUnit.y < ty ? -1 : 1;
            ventTerminals.push({
              id: `diff_p1_${rm.id}`,
              code: 'П1',
              sys: 'P1',
              diffuserType: ventDiffuserType,
              skuCode: diffSku,
              flowM3h: supFlow,
              label: `П1 +${supFlow}`,
              x: tx,
              y: ty,
              zM: zDiffFace,
              spigotDir: [0, spSignY],
            });
            const endY = roundMm(ty + spSignY * 0.32);
            const pts = [
              [p1PortX, roomPortY, zCeil],
              [tx, roomPortY, zCeil],
              [tx, endY, zCeil],
            ];
            ventDucts.push({ id: `duct_p1_${rm.id}`, sys: 'P1', dnMm: 125, skuCode: 'VT-03777', pts3d: pts });
            ventFittings.push({ id: `dk_p1_${rm.id}`, kind: 'damper', sys: 'P1', dnMm: 125, x: tx, y: roundMm((roomPortY + endY) * 0.5), zM: zCeil, dirX: 0, dirY: -spSignY });
            const dLen = Math.abs(tx - p1PortX) + Math.abs(endY - roomPortY) + 0.4;
            totalVentDuct125M += dLen;
            totalVentDuctM += dLen;
            totalVentDampers += 1;
            totalVentSupplyDiffs += 1;
            totalVentSupplyM3h += supFlow;
          }

          const exFlow = Math.round(rh?.exhaustAirM3h || 0);
          if (exFlow > 0) {
            const vx = roundMm(cx - 0.25);
            const vy = roundMm(cy + 0.20);
            const spSignY = ahuUnit.y < vy ? -1 : 1;
            const zV = roundMm(zCeil - 0.08);
            ventTerminals.push({
              id: `diff_v1_${rm.id}`,
              code: 'В1',
              sys: 'V1',
              diffuserType: ventDiffuserType,
              skuCode: diffSku === 'VT-03731' ? 'VT-03730' : diffSku,
              flowM3h: exFlow,
              label: `В1 -${exFlow}`,
              x: vx,
              y: vy,
              zM: roundMm(zDiffFace - 0.04),
              spigotDir: [0, spSignY],
            });
            const endY = roundMm(vy + spSignY * 0.32);
            const pts = [
              [v1PortX, roomPortY, zV],
              [vx, roomPortY, zV],
              [vx, endY, zV],
            ];
            ventDucts.push({ id: `duct_v1_${rm.id}`, sys: 'V1', dnMm: 125, skuCode: 'VT-03777', pts3d: pts });
            ventFittings.push({ id: `dk_v1_${rm.id}`, kind: 'damper', sys: 'V1', dnMm: 125, x: vx, y: roundMm((roomPortY + endY) * 0.5), zM: zV, dirX: 0, dirY: -spSignY });
            const dLen = Math.abs(vx - v1PortX) + Math.abs(endY - roomPortY) + 0.4;
            totalVentDuct125M += dLen;
            totalVentDuctM += dLen;
            totalVentDampers += 1;
            totalVentExhaustDiffs += 1;
            totalVentExhaustM3h += exFlow;
          }
        }

        // SOVUTISH TIZIMI: Чиллер–Фанкойл (4-поточный кассетный ФК / настенный ФК Т5/Т6 7/12°C) yoki Сплит!
        if ((rh?.coolingLoadW || 0) >= 700) {
          if (coolingSystemMode === 'fancoil_4way' || coolingSystemMode === 'fancoil_wall') {
            const isCassette = coolingSystemMode === 'fancoil_4way';
            const nUnits = isCassette && (rh.coolingLoadW >= 5200 || (rm.areaM2 || 0) >= 42) ? 2 : 1;
            const unitW = Math.ceil(rh.coolingLoadW / nUnits / 100) * 100;
            const nomKw = unitW <= 2800 ? 2.8 : unitW <= 3600 ? 3.6 : unitW <= 4500 ? 4.5 : 6.0;
            const centers = nUnits === 2
              ? [
                [roundMm(fl.officeInterior ? 8.80 : (rb.minX + rb.maxX) * 0.5), roundMm(fl.officeInterior ? 6.12 : rb.minY + rb.height * 0.34)],
                [roundMm(fl.officeInterior ? 8.80 : (rb.minX + rb.maxX) * 0.5), roundMm(fl.officeInterior ? 9.55 : rb.minY + rb.height * 0.72)],
              ]
              : [[roundMm(cx), isCassette ? roundMm(cy) : roundMm(rb.minY + 0.14)]];

            for (const [fx, fy] of centers) {
              const fcId = `fc_${rm.id}_${fcIdx}`;
              acUnits.push({
                id: fcId,
                kind: isCassette ? 'cassette_4way' : 'wall_fancoil',
                label: `ФК-${fcIdx}`,
                model: isCassette
                  ? `Фанкойл кассетный 4-поточный MKF-${Math.round(nomKw * 100)}C (840×840 · ${nomKw.toFixed(1)} кВт · 7/12°C)`
                  : `Фанкойл настенный MKF-${Math.round(nomKw * 100)}W (${nomKw.toFixed(1)} кВт · 7/12°C)`,
                skuCode: isCassette ? `FC-4W-${Math.round(nomKw * 10)}` : `FC-WL-${Math.round(nomKw * 10)}`,
                roomId: rm.id,
                roomName: rm.name,
                coolingW: Math.round(nomKw * 1000),
                btuClass: `${nomKw.toFixed(1)}kW`,
                x: fx,
                y: fy,
                zM: isCassette ? roundMm(hFloor - 0.28) : roundMm(hFloor - 0.38),
                wM: isCassette ? 0.84 : 0.92,
                dM: isCassette ? 0.84 : 0.23,
                hM: isCassette ? 0.22 : 0.30,
              });

              // Т5 (+7°C подача) va Т6 (+12°C обратка) fankoyl quvurlari (K-Flex ST qora izolyatsiyada!)
              const portX = roundMm(fx - (isCassette ? 0.44 : 0.40));
              const spineX = roundMm(Math.max(rb.minX + 0.32, fcRiserX));
              const t5Pts = [
                [fcRiserX, fcRiserY, zFcPipe],
                [spineX, fcRiserY, zFcPipe],
                [spineX, fy, zFcPipe],
                [portX, fy, zFcPipe],
              ];
              const t6Pts = [
                [portX, roundMm(fy + 0.07), roundMm(zFcPipe - 0.04)],
                [roundMm(spineX + 0.07), roundMm(fy + 0.07), roundMm(zFcPipe - 0.04)],
                [roundMm(spineX + 0.07), fcRiserY, roundMm(zFcPipe - 0.04)],
                [roundMm(fcRiserX + 0.07), fcRiserY, roundMm(zFcPipe - 0.04)],
              ];
              fancoilPipes.push(
                { id: `t5_${fcId}`, sys: 'T5', dnMm: 25, pts3d: t5Pts },
                { id: `t6_${fcId}`, sys: 'T6', dnMm: 25, pts3d: t6Pts },
              );
              const oneWayLen = Math.abs(spineX - fcRiserX) + Math.abs(fy - fcRiserY) + Math.abs(portX - spineX) + 0.8;
              totalFancoilPipeM += oneWayLen * 2;
              totalFancoilUnits += 1;
              totalCoolingInstalledW += nomKw * 1000;
              fcIdx += 1;
            }
          } else {
            const btu = rh.coolingLoadW <= 2500 ? '09K' : rh.coolingLoadW <= 3500 ? '12K' : rh.coolingLoadW <= 5200 ? '18K' : '24K';
            acUnits.push({
              id: `ac_${rm.id}`,
              kind: 'split',
              label: `КД-${btu}`,
              roomId: rm.id,
              roomName: rm.name,
              coolingW: rh.coolingLoadW,
              btuClass: btu,
              x: roundMm(cx),
              y: roundMm(rb.minY + 0.14),
              zM: roundMm(hFloor - 0.38),
              wM: 0.88,
              dM: 0.22,
              hM: 0.29,
            });
            totalSplitUnits += 1;
            totalCoolingInstalledW += rh.coolingLoadW;
          }
        }
      }
    }

    floorsOut.push({
      floorId: fl.id,
      floorName: fl.name,
      tpCollector: tpCollectorObj,
      ufLoops,
      radCollector: radCollectorObj,
      riserHub: routedNet.riserHub,
      radiators,
      radPipes,
      radFittings,
      roomBalances,
      ahuUnit,
      ventDucts,
      ventSilencers,
      ventFittings,
      ventTerminals,
      acUnits,
      fancoilPipes,
    });
  }

  // 1.0 Uzel podmesa hisobi (Тёплый пол смесительный узел)
  const mixingUnit = computeMixingUnit({
    totalUfWaterLoadW: totalUfLoadW,
    totalFlowLpm: totalUfFlowLpm,
    ufSupplyTemp: ufSupplyTempC,
    ufReturnTemp: ufReturnTempC,
    boilerSupplyTemp: radSupplyTempC,
    maxLoopDpKpa: maxProjectLoopDpKpa,
  });

  // 1.0 Радиатор контури насоси ҳисоби (G ва H бўйича ягона selectCirculationPumpByDuty манбаси!)
  const radDtCalc = Math.max(8, radSupplyTempC - radReturnTempC);
  const radFlowM3h = totalRadLoadW > 0 ? round2(((totalRadLoadW / 1000) * 0.86) / radDtCalc) : 0;
  const radPumpHeadM = totalRadLoadW > 0 ? round2((14 + Math.min(18, totalRadPipeM * 0.14)) / 9.81) : 0;
  const radPumpSel = selectCirculationPumpByDuty({ flowM3h: radFlowM3h, headM: radPumpHeadM });
  const radPumpSelection = {
    ...radPumpSel,
    flowM3h: radFlowM3h,
    headM: radPumpHeadM,
  };

  const deficitRooms = allRoomBalances.filter((rb) => rb.hasDeficit);
  const totalDeficitW = deficitRooms.reduce((s, rb) => s + rb.deficitW, 0);

  // GalfDesign sarf materiallari va qizil/ko'k teploizolyatsiya hisobi!
  const consumables = {
    insulationRed18M: Math.ceil((totalRadPipeM * 0.5 + totalUfTransitM * 0.5) * 1.08),
    insulationBlue18M: Math.ceil((totalRadPipeM * 0.5 + totalUfTransitM * 0.5) * 1.08),
    xpsAreaM2: Math.ceil(totalUfAreaM2 * 1.08),
    xpsMm: ufXpsMm,
    gridFoilM2: Math.ceil(totalUfAreaM2 * 1.10),
    damperTapeM: Math.ceil(totalDamperTapeM),
    anchorClipsPacks: totalUfPipeM > 0 ? Math.max(1, Math.ceil((totalUfPipeM * 3.0) / 100)) : 0,
    bendFixators16: totalUfLoops * 2,
  };

  const chillerNomKw = totalFancoilUnits > 0
    ? Math.max(7.0, Math.ceil((totalCoolingInstalledW * 1.05) / 1000))
    : 0;
  const chillerUnit = totalFancoilUnits > 0 ? {
    skuCode: `CHILLER-${chillerNomKw}KW`,
    model: `Мини-чиллер инверторный воздушного охлаждения со встроенным гидромодулем CH-${chillerNomKw} кВт (7/12 °C)`,
    powerKw: chillerNomKw,
  } : null;

  return {
    heatingScheme,
    heatStairwell: mepConfig.heatStairwell !== false,
    coolingSystemMode,
    radTopology,
    lowWindowEmitterMode,
    trunkPipeFamilyId,
    radConnType: radConnectionId,
    radModelId,
    radFeedMount,
    radSupplyTempC,
    radReturnTempC,
    ufPipeId,
    ufScreedType,
    ufXpsMm,
    ufSupplyTempC,
    ufReturnTempC,
    ufStepMm: Math.round(ufStepMainM * 1000),
    totalUfLoops,
    totalUfAreaM2: round2(totalUfAreaM2),
    totalUfPipeM: round2(totalUfPipeM),
    totalUfTransitM: round2(totalUfTransitM),
    totalUfWaterVolL: round1(totalUfWaterVolL),
    totalUfLoadKw: round1(totalUfLoadW / 1000),
    mixingUnit,
    radPumpSelection,
    roomBalances: allRoomBalances,
    deficitRooms,
    totalDeficitW,
    hasHeatingDeficit: deficitRooms.length > 0,
    totalRadiators,
    totalConvectors,
    totalFloorConvectors,
    totalTowelWarmers,
    totalRadPipeM: round2(totalRadPipeM),
    totalRadWaterVolL: round1(totalRadWaterVolL),
    totalTrunkWaterVolL: round1(totalTrunkWaterVolL),
    totalRadLoadKw: round1(totalRadLoadW / 1000),
    pipeTotalsBySize: [...globalPipeSizeMap.values()].sort((a, c) => bOrA(a.outerMm, c.outerMm)),
    fittingSummary,
    ventDiffuserType,
    totalVentDuctM: round2(totalVentDuctM),
    totalVentDuct160M: round2(totalVentDuct160M),
    totalVentDuct125M: round2(totalVentDuct125M),
    totalVentSilencers,
    totalVentDampers,
    totalVentReducers,
    totalExtGrilles,
    totalVentSupplyDiffs,
    totalVentExhaustDiffs,
    totalVentSupplyM3h,
    totalVentExhaustM3h,
    totalSplitUnits,
    totalFancoilUnits,
    totalFancoilPipeM: round2(totalFancoilPipeM),
    chillerUnit,
    consumables,
    floors: floorsOut,
  };
}

function bOrA(a, b) {
  return b - a;
}
