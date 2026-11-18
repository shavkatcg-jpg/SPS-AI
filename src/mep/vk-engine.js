/**
 * SPS Project 2.0 — ВК (Внутренний водопровод В1/Т3/Т4 и Бытовая канализация К1) Dvigateli
 *
 * Standart: СП 30.13330 / QMQ 2.04.01-98
 * - В1: Sovuq suv (PP-R PRO AQUA Ø32/25/20 + Imrita IMT-M4 + IMT-U8/S30 Pro suv tozalash uzeli)
 * - Т3 / Т4: Issiq suv va ГВС Retsirkulyatsiya halqasi (PP-R RUBIS kompozit Ø25/20)
 * - К1: O'z oqimli kanalizatsiya (Ø110 asosiy yotiq i = 0.02, Ø50 tarmoqlar i = 0.03, 45° kosoy troynik,
 *   Фановый стояк Ø110 va tashqi SN4 Ø110 vipusk)
 */

import { getFloorWorldBounds, roundMm } from '../core/planar-wall-graph.js';

export const VK_FIXTURE_CATALOG = Object.freeze({
  wc: { type: 'wc', code: 'УН', label: 'Унитаз / Инсталляция', cold: true, hot: false, sewerDn: 110, qLs: 0.14, wM: 0.40, dM: 0.64, hM: 0.78 },
  sink: { type: 'sink', code: 'РК', label: 'Раковина (умывальник)', cold: true, hot: true, sewerDn: 50, qLs: 0.12, wM: 0.56, dM: 0.44, hM: 0.85 },
  shower: { type: 'shower', code: 'ДШ', label: 'Душевая / Трап Ø50', cold: true, hot: true, sewerDn: 50, qLs: 0.18, wM: 0.90, dM: 0.90, hM: 0.12 },
  bath: { type: 'bath', code: 'ВН', label: 'Ванна акриловая 1700×750', cold: true, hot: true, sewerDn: 50, qLs: 0.22, wM: 1.68, dM: 0.74, hM: 0.58 },
  kitchen_sink: { type: 'kitchen_sink', code: 'МЙ', label: 'Мойка кухонная', cold: true, hot: true, sewerDn: 50, qLs: 0.16, wM: 0.76, dM: 0.52, hM: 0.86 },
  washer: { type: 'washer', code: 'СМ', label: 'Стиральная машина', cold: true, hot: false, sewerDn: 50, qLs: 0.14, wM: 0.60, dM: 0.60, hM: 0.85 },
  floor_drain: { type: 'floor_drain', code: 'ТР', label: 'Аварийный трап котельной', cold: false, hot: false, sewerDn: 50, qLs: 0.10, wM: 0.18, dM: 0.18, hM: 0.04 },
});

function round2(v) {
  return Math.round(v * 100) / 100;
}

function getPolyBounds(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly || []) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 3, maxY: 3, width: 3, height: 3 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function polyLen3D(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], (pts[i][2] || 0) - (pts[i - 1][2] || 0));
  }
  return len;
}

/**
 * Xona turlariga qarab (Sanuzel, Oshxona, Qozonxona) avto-santexnika jihozlarini (yoki foydalanuvchi qo'ygan vk_fixture larni) oladi.
 */
function collectOrSynthesizeFloorFixtures(fl, allowAutoSynthesize = true) {
  const manual = (fl.elements || []).filter((el) => el.kind === 'vk_fixture');
  const fixtures = manual.map((el, i) => {
    const spec = VK_FIXTURE_CATALOG[el.fixtureType] || VK_FIXTURE_CATALOG.sink;
    return {
      id: el.id || `vk_man_${fl.id}_${i}`,
      ...spec,
      roomName: el.roomName || 'Xona',
      x: roundMm(el.x),
      y: roundMm(el.y),
      rotDeg: el.rotationDeg || 0,
    };
  });

  if (fixtures.length > 0 || !allowAutoSynthesize) return fixtures;

  let idx = 1;
  for (const rm of fl.rooms || []) {
    const rb = getPolyBounds(rm.innerPoly);
    if (rm.roomType === 'bathroom' || rm.roomType === 'bath') {
      // Devor bo'ylab tartibli joylashuv: Unitaz + Rakovina + Vanna/Dush + Kir mashina
      fixtures.push({
        id: `vk_wc_${fl.id}_${idx++}`,
        ...VK_FIXTURE_CATALOG.wc,
        roomId: rm.id,
        roomName: rm.name,
        x: roundMm(rb.minX + 0.42),
        y: roundMm(rb.minY + 0.36),
        rotDeg: 0,
      });
      fixtures.push({
        id: `vk_sink_${fl.id}_${idx++}`,
        ...VK_FIXTURE_CATALOG.sink,
        roomId: rm.id,
        roomName: rm.name,
        x: roundMm(Math.min(rb.maxX - 0.40, rb.minX + 1.15)),
        y: roundMm(rb.minY + 0.28),
        rotDeg: 0,
      });
      const isBigBath = (rm.areaM2 || 0) >= 4.5 && rb.width >= 1.85;
      fixtures.push({
        id: `vk_bth_${fl.id}_${idx++}`,
        ...(isBigBath ? VK_FIXTURE_CATALOG.bath : VK_FIXTURE_CATALOG.shower),
        roomId: rm.id,
        roomName: rm.name,
        x: roundMm(rb.maxX - (isBigBath ? 0.88 : 0.50)),
        y: roundMm(rb.maxY - 0.45),
        rotDeg: 0,
      });
      if ((rm.areaM2 || 0) >= 4.2) {
        fixtures.push({
          id: `vk_wm_${fl.id}_${idx++}`,
          ...VK_FIXTURE_CATALOG.washer,
          roomId: rm.id,
          roomName: rm.name,
          x: roundMm(rb.minX + 0.38),
          y: roundMm(rb.maxY - 0.38),
          rotDeg: 0,
        });
      }
    } else if (rm.roomType === 'kitchen') {
      fixtures.push({
        id: `vk_ksink_${fl.id}_${idx++}`,
        ...VK_FIXTURE_CATALOG.kitchen_sink,
        roomId: rm.id,
        roomName: rm.name,
        x: roundMm(rb.minX + 0.52),
        y: roundMm(rb.minY + 0.32),
        rotDeg: 0,
      });
    } else if (rm.roomType === 'boiler') {
      fixtures.push({
        id: `vk_trap_${fl.id}_${idx++}`,
        ...VK_FIXTURE_CATALOG.floor_drain,
        roomId: rm.id,
        roomName: rm.name,
        x: roundMm((rb.minX + rb.maxX) * 0.5),
        y: roundMm((rb.minY + rb.maxY) * 0.5),
        rotDeg: 0,
      });
    }
  }

  return fixtures;
}

/**
 * Butun bino bo'yicha ВК (В1 ХВС, Т3 ГВС, Т4 Рециркуляция va К1 Канализация i=0.02..0.03) tizimini quradi!
 */
export function buildProjectVkSystems(project, mepConfig = {}) {
  const floorsSorted = [...(project.floors || [])].sort((a, b) => (a.elevationM || 0) - (b.elevationM || 0));
  const groundFl = floorsSorted[0];
  if (!groundFl) {
    return {
      enabled: false,
      floors: [],
      totalColdPipeM: 0,
      totalHotPipeM: 0,
      totalRecircPipeM: 0,
      totalSewer110M: 0,
      totalSewer50M: 0,
      fixturesCount: 0,
      designFlowTotalLs: 0,
      designFlowColdLs: 0,
      designFlowHotLs: 0,
      peakHourlyM3h: 0,
      meterDn: 20,
      requiredPressureBar: 2.25,
      sewerMainSlope: 0.02,
      sewerBranchSlope: 0.03,
    };
  }

  const allowAutoVk = mepConfig.enableVk !== false;
  const fixturesByFloorId = new Map();
  let anyFixtures = false;
  for (const fl of floorsSorted) {
    const fxs = collectOrSynthesizeFloorFixtures(fl, allowAutoVk);
    fixturesByFloorId.set(fl.id, fxs);
    if (fxs.length > 0) anyFixtures = true;
  }

  const hasAnyRoom = floorsSorted.some((fl) => (fl.rooms || []).length > 0);
  if ((!allowAutoVk && !anyFixtures) || (!hasAnyRoom && !anyFixtures)) {
    return {
      enabled: false,
      fixturesCount: 0,
      designFlowTotalLs: 0,
      designFlowColdLs: 0,
      designFlowHotLs: 0,
      peakHourlyM3h: 0,
      meterDn: 20,
      requiredPressureBar: 2.25,
      sewerMainSlope: 0.02,
      sewerBranchSlope: 0.03,
      totalColdPipeM: 0,
      totalHotPipeM: 0,
      totalRecircPipeM: 0,
      totalSewer110M: 0,
      totalSewer50M: 0,
      floors: floorsSorted.map((fl) => ({
        floorId: fl.id,
        floorName: fl.name,
        fixtures: [],
        pipes: [],
        waterEntryNode: null,
        sewerRiserXY: null,
        sewerReleaseXY: null,
      })),
    };
  }

  // Asosiy В1 suv kirish / vodomerniy uzel va К1 stoyak koordinatasini aniqlash (Qozonxona yoki Sanuzel burchagida)
  const boilerOrBath = (groundFl.rooms || []).find((r) => r.roomType === 'boiler')
    || (groundFl.rooms || []).find((r) => r.roomType === 'bathroom' || r.roomType === 'bath')
    || (groundFl.rooms || [])[0];
  const baseB = getPolyBounds(boilerOrBath?.innerPoly || [[0, 0], [4, 4]]);
  const bldgBounds = getFloorWorldBounds(groundFl);

  const waterEntryNode = {
    x: roundMm(baseB.minX + 0.25),
    y: roundMm(baseB.minY + 0.22),
    zM: 0.45,
    label: 'Ввод В1 Ø32 + Узел учёта & Imrita',
  };

  // Фановый стояк К1 Ø110 — birinchi sanuzel unitaziga eng yaqin burchakda joylashadi (barcha qavatlarni vertikal teshib o'tadi!)
  const firstBath = (groundFl.rooms || []).find((r) => r.roomType === 'bathroom' || r.roomType === 'bath') || boilerOrBath;
  const bathB = getPolyBounds(firstBath?.innerPoly || [[0, 0], [3, 3]]);
  const sewerRiserXY = {
    x: roundMm(bathB.minX + 0.18),
    y: roundMm(bathB.minY + 0.18),
    label: 'СТ-К1 Ø110 (Фановый стояк)',
  };

  // Tashqi kanalizatsiya kolodetsiga chiqish nuqtasi (Выпуск К1 SN4 Ø110, bino konturidan 1.2m tashqarida)
  const sewerReleaseXY = {
    x: sewerRiserXY.x,
    y: roundMm(bldgBounds.minY - 1.25),
  };

  let totalColdPipeM = 0;
  let totalHotPipeM = 0;
  let totalRecircPipeM = 0;
  let totalSewer110M = 0;
  let totalSewer50M = 0;
  let totalFixturesCount = 0;
  let sumFlowLs = 0;

  const floorsOut = [];

  for (const fl of floorsSorted) {
    const fixtures = fixturesByFloorId.get(fl.id) || [];
    const hFloor = Number(fl.heightM) || 3.0;
    const isGround = fl.id === groundFl.id;

    const pipes = []; // { id, sys: 'B1'|'T3'|'T4'|'K1_110'|'K1_50', dnMm, slope, skuCode, pts3d }

    // Vertikal stoyaklar (B1, T3, T4, K1 Ø110)
    pipes.push({
      id: `riser_k1_f${fl.id}`,
      sys: 'K1_110',
      dnMm: 110,
      slope: 0,
      skuCode: 'TR-03147',
      pts3d: [
        [sewerRiserXY.x, sewerRiserXY.y, isGround ? -0.35 : 0],
        [sewerRiserXY.x, sewerRiserXY.y, roundMm(hFloor + (fl.id === floorsSorted[floorsSorted.length - 1].id ? 0.55 : 0.22))],
      ],
    });
    totalSewer110M += hFloor + 0.55;

    const manifoldPt = {
      x: roundMm(sewerRiserXY.x + 0.28),
      y: roundMm(sewerRiserXY.y),
    };

    // Sovuq suv kirishi В1 (1-qavatda tashqaridan vodomer uzeliga -> kollektorga)
    if (isGround) {
      const entryPts = [
        [waterEntryNode.x, roundMm(bldgBounds.minY - 1.10), -0.90],
        [waterEntryNode.x, waterEntryNode.y, -0.90],
        [waterEntryNode.x, waterEntryNode.y, 0.55],
        [manifoldPt.x, waterEntryNode.y, 0.18],
        [manifoldPt.x, manifoldPt.y, 0.18],
      ];
      pipes.push({ id: 'b1_entry_main', sys: 'B1', dnMm: 32, slope: 0, skuCode: 'TR-02650', pts3d: entryPts });
      totalColdPipeM += polyLen3D(entryPts);

      // Tashqi kanalizatsiya vipuski К1 (SN4 Ø110, i = 0.02 qiyalik bilan!)
      const outDist = Math.hypot(sewerReleaseXY.x - sewerRiserXY.x, sewerReleaseXY.y - sewerRiserXY.y);
      const zStart = -0.35;
      const zEnd = roundMm(zStart - outDist * 0.02);
      const outPts = [
        [sewerRiserXY.x, sewerRiserXY.y, zStart],
        [sewerReleaseXY.x, sewerReleaseXY.y, zEnd],
      ];
      pipes.push({
        id: 'k1_outdoor_sn4',
        sys: 'K1_110',
        dnMm: 110,
        slope: 0.02,
        invertStartM: zStart,
        invertEndM: zEnd,
        skuCode: 'TR-03206',
        pts3d: outPts,
      });
      totalSewer110M += outDist;
    } else {
      // Yuqori qavat stoyak ko'tarilishi (В1, Т3, Т4)
      pipes.push(
        { id: `riser_b1_f${fl.id}`, sys: 'B1', dnMm: 25, slope: 0, skuCode: 'TR-02649', pts3d: [[manifoldPt.x, manifoldPt.y, -0.22], [manifoldPt.x, manifoldPt.y, 0.60]] },
        { id: `riser_t3_f${fl.id}`, sys: 'T3', dnMm: 25, slope: 0, skuCode: 'TR-02641', pts3d: [[roundMm(manifoldPt.x + 0.07), manifoldPt.y, -0.22], [roundMm(manifoldPt.x + 0.07), manifoldPt.y, 0.65]] },
      );
      totalColdPipeM += 0.85;
      totalHotPipeM += 0.90;
    }

    // Har bir santexnika jihoziga В1 (Z=0.18m), Т3 (Z=0.26m) va К1 (haqiqiy nishablik i=0.02 / 0.03 va 45° kosoy burilish!) ulash
    let farthestHotPt = null;
    let farthestDist = -1;

    for (const fx of fixtures) {
      totalFixturesCount += 1;
      sumFlowLs += fx.qLs || 0.12;

      if (fx.cold) {
        const zTap = fx.type === 'wc' ? 0.25 : 0.55;
        const pCold = [
          [manifoldPt.x, manifoldPt.y, 0.18],
          [manifoldPt.x, fx.y, 0.18],
          [fx.x, fx.y, 0.18],
          [fx.x, fx.y, zTap],
        ];
        pipes.push({ id: `b1_${fx.id}`, sys: 'B1', dnMm: 20, slope: 0, skuCode: 'TR-02648', pts3d: pCold });
        totalColdPipeM += polyLen3D(pCold);
      }

      if (fx.hot) {
        const hx = roundMm(fx.x + 0.08);
        const pHot = [
          [roundMm(manifoldPt.x + 0.06), manifoldPt.y, 0.26],
          [roundMm(manifoldPt.x + 0.06), fx.y, 0.26],
          [hx, fx.y, 0.26],
          [hx, fx.y, 0.55],
        ];
        pipes.push({ id: `t3_${fx.id}`, sys: 'T3', dnMm: 20, slope: 0, skuCode: 'TR-02640', pts3d: pHot });
        const dHot = polyLen3D(pHot);
        totalHotPipeM += dHot;
        if (dHot > farthestDist) {
          farthestDist = dHot;
          farthestHotPt = [hx, fx.y, 0.32];
        }
      }

      // K1 o'z oqimli kanalizatsiya: 45° kosoy kirish + aniq 2% (Ø110) yoki 3% (Ø50) qiyalik!
      const is110 = fx.sewerDn === 110;
      const slope = is110 ? 0.02 : 0.03;
      const dx = fx.x - sewerRiserXY.x;
      const dy = fx.y - sewerRiserXY.y;
      const diagStep = Math.min(Math.abs(dx), Math.abs(dy)) * 0.65;
      const wyeX = roundMm(sewerRiserXY.x + Math.sign(dx || 1) * diagStep);
      const wyeY = roundMm(sewerRiserXY.y + Math.sign(dy || 1) * diagStep);
      const runLen = Math.hypot(fx.x - wyeX, fx.y - wyeY) + Math.hypot(wyeX - sewerRiserXY.x, wyeY - sewerRiserXY.y);
      const zRiserConnect = isGround ? -0.09 : 0.02;
      const zFixtureStart = roundMm(zRiserConnect + runLen * slope);

      const sewerPts = [
        [fx.x, fx.y, zFixtureStart],
        [wyeX, wyeY, roundMm(zRiserConnect + Math.hypot(wyeX - sewerRiserXY.x, wyeY - sewerRiserXY.y) * slope)],
        [sewerRiserXY.x, sewerRiserXY.y, zRiserConnect],
      ];
      pipes.push({
        id: `k1_${fx.id}`,
        sys: is110 ? 'K1_110' : 'K1_50',
        dnMm: fx.sewerDn,
        slope,
        invertStartM: zFixtureStart,
        invertEndM: zRiserConnect,
        skuCode: is110 ? 'TR-03147' : 'TR-03162',
        pts3d: sewerPts,
      });
      if (is110) totalSewer110M += runLen;
      else totalSewer50M += runLen;
    }

    // ГВС Рециркуляция halqasi (Т4, Z=0.32 m) — issiq suv kran ochilishi bilan darhol issiq kelishi uchun!
    if (farthestHotPt && mepConfig.enableGvsRecirc !== false) {
      const t4Pts = [
        farthestHotPt,
        [roundMm(manifoldPt.x + 0.11), farthestHotPt[1], 0.32],
        [roundMm(manifoldPt.x + 0.11), waterEntryNode.y, 0.32],
      ];
      pipes.push({ id: `t4_recirc_f${fl.id}`, sys: 'T4', dnMm: 20, slope: 0, skuCode: 'TR-02640', pts3d: t4Pts });
      totalRecircPipeM += polyLen3D(t4Pts);
    }

    floorsOut.push({
      floorId: fl.id,
      floorName: fl.name,
      fixtures,
      pipes,
      waterEntryNode: isGround ? waterEntryNode : null,
      sewerRiserXY,
      sewerReleaseXY: isGround ? sewerReleaseXY : null,
    });
  }

  // СП 30.13330 ehtimollik formulasi bo'yicha hisobiy sekundlik va soatlik suv sarfi
  const designFlowTotalLs = round2(Math.max(0.25, sumFlowLs * 0.48));
  const designFlowColdLs = round2(designFlowTotalLs * 0.65);
  const designFlowHotLs = round2(designFlowTotalLs * 0.45);
  const peakHourlyM3h = round2(designFlowTotalLs * 3.6 * 0.62);
  const meterDn = designFlowTotalLs > 0.85 ? 25 : 20;
  const requiredPressureBar = round2(1.8 + (floorsSorted.length - 1) * 0.35 + 0.45);

  return {
    fixturesCount: totalFixturesCount,
    designFlowTotalLs,
    designFlowColdLs,
    designFlowHotLs,
    peakHourlyM3h,
    meterDn,
    requiredPressureBar,
    sewerMainSlope: 0.02,
    sewerBranchSlope: 0.03,
    totalColdPipeM: round2(totalColdPipeM),
    totalHotPipeM: round2(totalHotPipeM),
    totalRecircPipeM: round2(totalRecircPipeM),
    totalSewer110M: round2(totalSewer110M),
    totalSewer50M: round2(totalSewer50M),
    floors: floorsOut,
  };
}
