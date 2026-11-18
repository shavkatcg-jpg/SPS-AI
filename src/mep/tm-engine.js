/**
 * SPS Project 2.0 — ТМ (Тепломеханическая часть котельной Climate House + 1.0 Excel Гидравлика) Dvigateli
 *
 * - Qozonxona quvvati, 1.0 Excel formulalari bo'yicha Gidrostrelka (3D-qoida: D_korpus, d_patrubok),
 *   Kengaytirish baki (V_syst, V_exp, P_precharge, V_calc), Boyler ГВС (qizish vaqti daqiqada, V_45°C),
 *   Imrita suv tayyorlash va ZONT avtomatikasini to'liq hisoblaydi;
 * - Qozonxona xonasi ichida 2D/3D haqiqiy LOD 400 jihozlar + S-Press SS304 obvyazka quvurlarini joylashtiradi;
 * - ГОСТ bo'yicha vektorli «Принципиальная тепломеханическая схема котельной (ТМ)» SVG chizmasini yaratadi!
 */

import { roundMm } from '../core/planar-wall-graph.js';
import { computeBoilerRoomHydraulics, selectCirculationPumpByDuty } from './sps-heating-calc.js';

function getPolyBounds(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly || []) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 3.6, maxY: 2.8, width: 3.6, height: 2.8 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

export function buildProjectTmBoilerRoom(project, heatReport, ovReport, vkReport, mepConfig = {}) {
  const floorsSorted = [...(project.floors || [])].sort((a, b) => (a.elevationM || 0) - (b.elevationM || 0));
  const groundFl = floorsSorted[0];
  const topFl = floorsSorted[floorsSorted.length - 1];
  const buildingHeightM = Math.max(3.2, (Number(topFl?.elevationM) || 0) + (Number(topFl?.heightM) || 3.0) + 0.5);

  const isCompactHeatingOnly = Boolean(
    project?.isOfficeProject
    || mepConfig.compactOfficeTm,
  );

  const boilerRoom = (groundFl?.rooms || []).find((r) => r.roomType === 'boiler')
    || (groundFl?.rooms || []).find((r) => r.roomType === 'kitchen')
    || (groundFl?.rooms || []).find((r) => r.roomType !== 'stairwell')
    || (groundFl?.rooms || [])[0];

  const qHeatingKw = Number(heatReport?.totalHeatLossKw) || 14;
  const qGvsPriorityKw = isCompactHeatingOnly ? 0 : Math.max(6, round1((vkReport?.fixturesCount || 4) * 1.6));
  const designBoilerKw = round1((qHeatingKw + qGvsPriorityKw * 0.35) * 1.15);

  // 1. Qozon (К1) tanlash — Rasmiy Climate House kodlari bo'yicha
  let boilerSku = 'KT-00642';
  let boilerModel = 'Газовый котёл конденсационный BATHELLO LN1GBQ-24 (24 кВт)';
  let boilerNomKw = 24;
  let boilerCount = 1;

  if (designBoilerKw <= 24) {
    boilerSku = 'KT-00642'; boilerModel = 'Газовый котёл конденсационный BATHELLO LN1GBQ-24 (24 кВт)'; boilerNomKw = 24;
  } else if (designBoilerKw <= 28) {
    boilerSku = 'KT-00643'; boilerModel = 'Газовый котёл конденсационный BATHELLO LN1GBQ-28 (28 кВт)'; boilerNomKw = 28;
  } else if (designBoilerKw <= 32) {
    boilerSku = 'KT-00644'; boilerModel = 'Газовый котёл конденсационный BATHELLO LN1GBQ-32 (32 кВт)'; boilerNomKw = 32;
  } else if (designBoilerKw <= 38) {
    boilerSku = 'KT-00645'; boilerModel = 'Газовый котёл конденсационный BATHELLO LN1GBQ-36 (36 кВт)'; boilerNomKw = 36;
  } else if (designBoilerKw <= 72) {
    boilerSku = 'KT-00645'; boilerModel = 'Каскад 2× BATHELLO LN1GBQ-36 (2×36 = 72 кВт)'; boilerNomKw = 36; boilerCount = 2;
  } else {
    boilerSku = 'KT-00656'; boilerModel = 'Котёл конденсационный Ecodense WT-SS 150 (150 кВт)'; boilerNomKw = 150;
  }

  // 2. Бойлер косвенного нагрева ГВС (БКН)
  const bknLiters = (vkReport?.fixturesCount || 4) <= 5 ? 150 : (vkReport?.fixturesCount || 4) <= 9 ? 200 : 300;
  const bknSku = bknLiters === 150 ? 'VN-03609' : bknLiters === 200 ? 'VN-03610' : 'VN-03611';
  const bknModel = `Бойлер косвенного нагрева BATHELLO BT ${bknLiters} л`;

  // 3. 1.0 Aniq Gidrostrelka, Kengaytirish baki va Boyler qizish vaqti hisobi!
  const hyd10 = computeBoilerRoomHydraulics({
    totalHeatKw: designBoilerKw,
    radLoadKw: ovReport?.totalRadLoadKw || qHeatingKw * 0.5,
    ufLoadKw: ovReport?.totalUfLoadKw || qHeatingKw * 0.5,
    boilerDeltaT: 15,
    buildingHeightM,
    ufWaterVolL: ovReport?.totalUfWaterVolL || (ovReport?.totalUfPipeM || 0) * 0.113,
    radWaterVolL: ovReport?.totalRadWaterVolL || qHeatingKw * 4.5,
    trunkWaterVolL: (ovReport?.totalTrunkWaterVolL || 12) + 8,
    boilerCylinderL: bknLiters,
    ufPumpHeadM: ovReport?.mixingUnit?.pumpHeadM || 3.2,
  });

  const systemWaterLiters = Math.round(hyd10.expansionTank.vSystL);
  const expTankLiters = hyd10.expansionTank.heatingTankL >= 80 ? 100 : 50;
  const expTankSku = expTankLiters === 100 ? 'OT-01804' : 'OT-01802';

  // 4. Qozonxona (yoki ofisning chekkadagi Тех. бурчак kotyol uzeli) ichida 2D/3D haqiqiy gabaritli uskunalarni joylashtirish
  const rb = getPolyBounds(boilerRoom?.innerPoly || [[0, 0], [3.6, 2.8]]);
  const hint = groundFl?.mepCornerHint;
  const wallY = hint ? roundMm(hint.boilerY ?? hint.y + 0.02) : roundMm(rb.minY + 0.24);
  const xStart = hint ? roundMm(hint.boilerX ?? hint.x + 1.25) : roundMm(rb.minX + 0.42);
  const spanW = Math.max(1.8, rb.width - 0.75);

  const equipment3d = isCompactHeatingOnly ? [
    {
      id: 'tm_boiler_1',
      tag: 'К1',
      kind: 'boiler',
      skuCode: boilerSku,
      name: boilerModel,
      powerKw: boilerNomKw * boilerCount,
      x: roundMm(xStart),
      y: wallY,
      zM: 1.05,
      wM: 0.44,
      dM: 0.34,
      hM: 0.74,
    },
    {
      id: 'tm_gidrostrelka',
      tag: 'ГС+НК',
      kind: 'manifold_tm',
      skuCode: 'MT-01563',
      name: `Гидрострелка Climate House 22187 (Ø${hyd10.hydroarrow.chamberDiameterMm}/DN${hyd10.hydroarrow.nozzleDiameterMm}) + Коллектор НК-1/НК-2`,
      x: roundMm(hint ? xStart - 0.64 : Math.min(rb.maxX - 0.40, xStart + spanW * 0.32)),
      y: roundMm(hint ? wallY - 0.02 : rb.minY + 0.18),
      zM: 1.05,
      wM: 0.52,
      dM: 0.22,
      hM: 0.54,
    },
    {
      id: 'tm_exp_tank',
      tag: `РБ ${expTankLiters}л`,
      kind: 'exp_tank',
      skuCode: expTankSku,
      name: `Бак расширительный отопления Ecodense ${expTankLiters} л (P₀=${hyd10.expansionTank.pPrechargeBar} бар)`,
      volumeL: expTankLiters,
      x: roundMm(hint ? xStart + 0.30 : Math.min(rb.maxX - 0.32, xStart + spanW * 0.72)),
      y: roundMm(wallY + 0.06),
      zM: 0.0,
      wM: 0.36,
      dM: 0.36,
      hM: 0.58,
    },
    {
      id: 'tm_zont_panel',
      tag: 'ЩА ZONT',
      kind: 'automation_panel',
      skuCode: 'EL-00003',
      name: 'Щит автоматики ZONT H1000+ PRO.V2 + ZE-44 + МЛ-232 RS-485',
      x: roundMm(hint ? xStart + 0.42 : rb.maxX - 0.14),
      y: roundMm(hint ? wallY + 0.58 : (rb.minY + rb.maxY) * 0.5),
      zM: 1.38,
      wM: 0.14,
      dM: 0.38,
      hM: 0.46,
    },
  ] : [
    {
      id: 'tm_boiler_1',
      tag: 'К1',
      kind: 'boiler',
      skuCode: boilerSku,
      name: boilerModel,
      powerKw: boilerNomKw * boilerCount,
      x: roundMm(xStart),
      y: wallY,
      zM: 0.95,
      wM: 0.45,
      dM: 0.36,
      hM: 0.76,
    },
    {
      id: 'tm_gidrostrelka',
      tag: 'ГС+КР',
      kind: 'manifold_tm',
      skuCode: 'MT-01563',
      name: `Гидрострелка Climate House 22187 (Ø${hyd10.hydroarrow.chamberDiameterMm}/DN${hyd10.hydroarrow.nozzleDiameterMm}) + Коллектор 22186`,
      x: roundMm(Math.min(rb.maxX - 0.40, xStart + spanW * 0.28)),
      y: roundMm(rb.minY + 0.18),
      zM: 1.05,
      wM: 0.64,
      dM: 0.22,
      hM: 0.56,
    },
    {
      id: 'tm_bkn_gvs',
      tag: `БКН ${bknLiters}л`,
      kind: 'bkn_tank',
      skuCode: bknSku,
      name: `${bknModel} (нагрев ${hyd10.dhw.heatUpMin} мин)`,
      volumeL: bknLiters,
      x: roundMm(Math.min(rb.maxX - 0.38, xStart + spanW * 0.58)),
      y: roundMm(rb.minY + 0.34),
      zM: 0.0,
      wM: 0.56,
      dM: 0.56,
      hM: 1.32,
    },
    {
      id: 'tm_exp_tank',
      tag: `РБ ${expTankLiters}л`,
      kind: 'exp_tank',
      skuCode: expTankSku,
      name: `Бак расширительный Ecodense ${expTankLiters} л (P₀=${hyd10.expansionTank.pPrechargeBar} бар)`,
      volumeL: expTankLiters,
      x: roundMm(Math.min(rb.maxX - 0.32, xStart + spanW * 0.84)),
      y: roundMm(rb.minY + 0.28),
      zM: 0.0,
      wM: 0.38,
      dM: 0.38,
      hM: 0.62,
    },
    {
      id: 'tm_imrita_skid',
      tag: 'ХВО Imrita',
      kind: 'water_treatment',
      skuCode: 'FL-00293',
      name: 'Узел водоподготовки Imrita IMT-M4 + Умягчитель IMT-S30 Pro + Аквастоп',
      x: roundMm(rb.minX + 0.32),
      y: roundMm(Math.min(rb.maxY - 0.38, rb.minY + 1.25)),
      zM: 0.0,
      wM: 0.44,
      dM: 0.52,
      hM: 1.08,
    },
    {
      id: 'tm_zont_panel',
      tag: 'ЩА ZONT',
      kind: 'automation_panel',
      skuCode: 'EL-00003',
      name: 'Щит автоматики ZONT H1000+ PRO.V2 + ZE-44 + МЛ-232 RS-485',
      x: roundMm(rb.maxX - 0.14),
      y: roundMm((rb.minY + rb.maxY) * 0.5),
      zM: 1.35,
      wM: 0.14,
      dM: 0.42,
      hM: 0.50,
    },
  ];

  const bEq = equipment3d[0];
  const gsEq = equipment3d[1];
  const bknEq = equipment3d.find((e) => e.kind === 'bkn_tank');
  const headerPipes3d = [
    {
      id: 'tm_spress_sup',
      sys: 'TM_SUP',
      dnMm: 28,
      skuCode: 'TR-03513',
      pts3d: [
        [bEq.x - 0.08, bEq.y, bEq.zM],
        [bEq.x - 0.08, bEq.y, 0.76],
        [gsEq.x + (gsEq.x < bEq.x ? 0.18 : -0.25), gsEq.y, 0.76],
        [gsEq.x + (gsEq.x < bEq.x ? 0.18 : -0.25), gsEq.y, 1.05],
      ],
    },
    {
      id: 'tm_spress_ret',
      sys: 'TM_RET',
      dnMm: 28,
      skuCode: 'TR-03513',
      pts3d: [
        [gsEq.x + (gsEq.x < bEq.x ? 0.18 : -0.25), gsEq.y + 0.05, 0.92],
        [gsEq.x + (gsEq.x < bEq.x ? 0.18 : -0.25), gsEq.y + 0.05, 0.68],
        [bEq.x + 0.08, bEq.y + 0.05, 0.68],
        [bEq.x + 0.08, bEq.y + 0.05, bEq.zM],
      ],
    },
    ...(bknEq ? [{
      id: 'tm_bkn_load',
      sys: 'TM_SUP',
      dnMm: 22,
      skuCode: 'TR-03512',
      pts3d: [
        [gsEq.x + 0.18, gsEq.y, 1.32],
        [gsEq.x + 0.18, gsEq.y, 1.62],
        [bknEq.x, gsEq.y, 1.62],
        [bknEq.x, bknEq.y, 1.15],
      ],
    }] : []),
  ];

  const radKw = Math.max(1.5, ovReport?.totalRadLoadKw || round1(qHeatingKw * 0.45));
  const ufKw = Math.max(1.5, ovReport?.totalUfLoadKw || round1(qHeatingKw * 0.55));
  const radDt = Math.max(8, (ovReport?.radSupplyTempC || 70) - (ovReport?.radReturnTempC || 55));
  const ufDt = Math.max(4, (ovReport?.ufSupplyTempC || 42) - (ovReport?.ufReturnTempC || 35));

  const radFlowCalc = ovReport?.radPumpSelection?.flowM3h > 0
    ? ovReport.radPumpSelection.flowM3h
    : round1((radKw * 0.86) / radDt);
  const radHeadCalc = ovReport?.radPumpSelection?.headM > 0
    ? ovReport.radPumpSelection.headM
    : 2.4;
  const radPump = selectCirculationPumpByDuty({ flowM3h: radFlowCalc, headM: radHeadCalc });

  const ufFlowCalc = ovReport?.mixingUnit?.totalFlowM3h > 0
    ? ovReport.mixingUnit.totalFlowM3h
    : round1((ufKw * 0.86) / ufDt);
  const ufHeadCalc = ovReport?.mixingUnit?.pumpHeadM > 0
    ? ovReport.mixingUnit.pumpHeadM
    : 2.8;
  const ufPump = selectCirculationPumpByDuty({ flowM3h: ufFlowCalc, headM: ufHeadCalc });

  const bknFlowCalc = round1((hyd10.dhw.coilKw * 0.86) / 20);
  const bknPump = selectCirculationPumpByDuty({ flowM3h: bknFlowCalc, headM: 2.5 });

  const pumpCircuits = [
    {
      code: 'НК-1',
      title: 'Радиаторы / Конвекторы (Т1/Т2)',
      tempRegime: `${ovReport?.radSupplyTempC || 70} / ${ovReport?.radReturnTempC || 55} °C`,
      powerKw: radKw,
      flowM3h: radFlowCalc,
      headM: radHeadCalc,
      groupSku: 'MT-01559',
      groupName: `Группа быстрого монтажа Climate House 15424 прямая (H=${radHeadCalc}м)`,
      pumpSku: radPump.pumpSku,
      pumpName: radPump.pumpName,
      valveSku: null,
    },
    {
      code: 'НК-2',
      title: 'Водяной тёплый пол (Улитка)',
      tempRegime: `${ovReport?.ufSupplyTempC || 42} / ${ovReport?.ufReturnTempC || 35} °C`,
      powerKw: ufKw,
      flowM3h: ufFlowCalc,
      headM: ufHeadCalc,
      groupSku: 'MT-01558',
      groupName: `Группа со смесителем 15419 (Kvs=${ovReport?.mixingUnit?.kvsRecommended || 4.5}, H=${ufHeadCalc}м)`,
      pumpSku: ufPump.pumpSku,
      pumpName: ufPump.pumpName,
      valveSku: 'MT-01276',
    },
    ...(isCompactHeatingOnly ? [] : [{
      code: 'НК-3',
      title: 'Загрузка бойлера ГВС (БКН)',
      tempRegime: '80 / 60 °C',
      powerKw: hyd10.dhw.coilKw,
      flowM3h: bknFlowCalc,
      headM: 2.5,
      groupSku: 'MT-01559',
      groupName: 'Группа быстрого монтажа Climate House 15424 прямая',
      pumpSku: bknPump.pumpSku,
      pumpName: bknPump.pumpName,
      valveSku: null,
    }]),
  ];

  const tmEnabled = mepConfig.enableTm !== false && ((groundFl?.rooms?.length || 0) > 0);

  return {
    enabled: tmEnabled,
    isCompactHeatingOnly,
    floorId: groundFl?.id ?? 1,
    roomId: boilerRoom?.id || null,
    roomName: hint?.roomName || boilerRoom?.name || 'Котельная',
    roomAreaM2: boilerRoom?.areaM2 || 6.5,
    roomVolumeM3: round1((boilerRoom?.areaM2 || 6.5) * (groundFl?.heightM || 3.0)),
    normVolumePass: ((boilerRoom?.areaM2 || 6.5) * (groundFl?.heightM || 3.0)) >= 15.0,
    designBoilerKw,
    boilerCount,
    boilerSku,
    boilerModel,
    boilerNomKw,
    bknLiters,
    bknSku,
    bknModel,
    systemWaterLiters,
    expTankLiters,
    expTankSku,
    hydraulics10: hyd10,
    pumpCircuits: tmEnabled ? pumpCircuits : [],
    equipment3d: tmEnabled ? equipment3d : [],
    headerPipes3d: tmEnabled ? headerPipes3d : [],
  };
}

export function renderTmPrincipleSchemeSvg(tmData, lightBg = false) {
  const bg = lightBg ? '#ffffff' : '#0b1220';
  const fg = lightBg ? '#0f172a' : '#f1f5f9';
  const sub = lightBg ? '#475569' : '#94a3b8';
  const card = lightBg ? '#f8fafc' : '#131d31';
  const stroke = lightBg ? '#334155' : '#64748b';
  const h10 = tmData.hydraulics10;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 445" style="width:100%;height:auto;background:${bg};border-radius:8px;font-family:Inter,Arial,sans-serif;">
  <defs>
    <marker id="arrRed" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <polygon points="0 0, 7 3.5, 0 7" fill="#ef4444"/>
    </marker>
    <marker id="arrBlue" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <polygon points="0 0, 7 3.5, 0 7" fill="#0284c7"/>
    </marker>
  </defs>

  <text x="20" y="26" fill="${fg}" font-size="13.5" font-weight="800">ПРИНЦИПИАЛЬНАЯ ТЕПЛОМЕХАНИЧЕСКАЯ СХЕМА КОТЕЛЬНОЙ (ТМ · S-PRESS SS304 · РАСЧЁТ 1.0)</text>
  <text x="20" y="43" fill="${sub}" font-size="10.5">Qрасч = ${tmData.designBoilerKw} кВт · ГС: G=${h10?.hydroarrow?.flowM3h ?? 1.2} м³/ч (Dкорп=Ø${h10?.hydroarrow?.chamberDiameterMm ?? 80} мм) · Vсис = ${tmData.systemWaterLiters} л (Vрасч РБ = ${h10?.expansionTank?.vCalcL ?? 18} л, P₀=${h10?.expansionTank?.pPrechargeBar ?? 0.8} бар)</text>

  <!-- 1. Котёл К1 -->
  <rect x="28" y="95" width="142" height="175" rx="8" fill="${card}" stroke="#ef4444" stroke-width="2"/>
  <text x="99" y="122" text-anchor="middle" fill="#ef4444" font-size="13" font-weight="800">КОТЁЛ К1</text>
  <text x="99" y="142" text-anchor="middle" fill="${fg}" font-size="10.5" font-weight="700">${tmData.boilerCount}× ${tmData.boilerNomKw} кВт</text>
  <text x="99" y="159" text-anchor="middle" fill="${sub}" font-size="9.5">Код CH: ${tmData.boilerSku}</text>
  <path d="M84,215 C84,192 114,192 114,215 C114,230 99,238 99,245 C99,238 84,230 84,215 Z" fill="#f97316"/>
  <text x="99" y="260" text-anchor="middle" fill="${sub}" font-size="9">T1=80°C / T2=65°C</text>

  <!-- Котловой контур S-Press DN28 -->
  <path d="M170,135 L255,135" stroke="#ef4444" stroke-width="3.5" fill="none" marker-end="url(#arrRed)"/>
  <path d="M255,225 L170,225" stroke="#0284c7" stroke-width="3.5" fill="none" marker-end="url(#arrBlue)"/>
  <text x="212" y="127" text-anchor="middle" fill="#ef4444" font-size="9.5" font-weight="700">S-Press Ø28</text>
  <text x="212" y="241" text-anchor="middle" fill="#0284c7" font-size="9.5" font-weight="700">Грязевик + ОК</text>

  <!-- Расширительный бак РБ -->
  <line x1="215" y1="225" x2="215" y2="335" stroke="#0284c7" stroke-width="2" stroke-dasharray="4,3"/>
  <rect x="176" y="335" width="80" height="82" rx="22" fill="#fee2e2" stroke="#dc2626" stroke-width="2"/>
  <text x="216" y="366" text-anchor="middle" fill="#991b1b" font-size="11" font-weight="800">РБ ${tmData.expTankLiters}л</text>
  <text x="216" y="381" text-anchor="middle" fill="#7f1d1d" font-size="8.8">P₀=${h10?.expansionTank?.pPrechargeBar ?? 0.8} бар</text>
  <text x="216" y="395" text-anchor="middle" fill="#7f1d1d" font-size="8.5">${tmData.expTankSku}</text>

  <!-- 2. Гидрострелка ГС + Коллектор КР -->
  <rect x="255" y="95" width="46" height="175" rx="6" fill="${card}" stroke="${stroke}" stroke-width="2.2"/>
  <line x1="278" y1="105" x2="278" y2="260" stroke="#a855f7" stroke-width="2" stroke-dasharray="5,4"/>
  <text x="278" y="86" text-anchor="middle" fill="${fg}" font-size="10" font-weight="800">ГС Ø${h10?.hydroarrow?.chamberDiameterMm ?? 80}</text>

  <!-- Подающий (красный) и Обратный (синий) коллекторы 22186 -->
  <rect x="301" y="124" width="375" height="18" rx="3" fill="#ef4444"/>
  <text x="488" y="136" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="700">ПОДАЮЩИЙ ГИДРОКОЛЛЕКТОР CLIMATE HOUSE 22186 Ф40 (MT-01560)</text>
  <rect x="301" y="216" width="375" height="18" rx="3" fill="#0284c7"/>
  <text x="488" y="228" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="700">ОБРАТНЫЙ ГИДРОКОЛЛЕКТОР Ф40</text>

  <!-- 3. Насосные группы НК-1, НК-2, НК-3 -->
  ${tmData.pumpCircuits.map((c, idx) => {
    const cx = 365 + idx * 132;
    return `
      <line x1="${cx - 16}" y1="124" x2="${cx - 16}" y2="62" stroke="#ef4444" stroke-width="2.8" marker-end="url(#arrRed)"/>
      <line x1="${cx + 16}" y1="62" x2="${cx + 16}" y2="216" stroke="#0284c7" stroke-width="2.8" marker-end="url(#arrBlue)"/>
      <circle cx="${cx - 16}" cy="92" r="12" fill="${card}" stroke="#ef4444" stroke-width="2"/>
      <polygon points="${cx - 21},96 ${cx - 16},84 ${cx - 11},96" fill="#ef4444"/>
      ${c.valveSku ? `<rect x="${cx - 28}" y="106" width="24" height="12" rx="2" fill="#f59e0b"/><text x="${cx - 16}" y="115" text-anchor="middle" fill="#111827" font-size="7.5" font-weight="800">8784A</text>` : ''}
      <rect x="${cx - 58}" y="14" width="116" height="46" rx="6" fill="${card}" stroke="${stroke}" stroke-width="1.4"/>
      <text x="${cx}" y="29" text-anchor="middle" fill="${fg}" font-size="10" font-weight="800">${c.code}: ${c.tempRegime}</text>
      <text x="${cx}" y="42" text-anchor="middle" fill="${sub}" font-size="8.8">${c.pumpName} (${c.pumpSku})</text>
      <text x="${cx}" y="54" text-anchor="middle" fill="#10b981" font-size="8.5" font-weight="700">${c.powerKw} кВт · ${c.flowM3h} м³/ч</text>
    `;
  }).join('')}

  ${tmData.isCompactHeatingOnly ? `
  <!-- 4. Погодозависимая автоматика ZONT H1000+ PRO.V2 + ZE-44 (Офисный тепловой пункт без ГВС/ВК) -->
  <rect x="705" y="95" width="188" height="175" rx="12" fill="${card}" stroke="#10b981" stroke-width="2.2"/>
  <text x="799" y="122" text-anchor="middle" fill="#10b981" font-size="11" font-weight="800">ЩА ZONT H1000+ + ZE-44</text>
  <text x="799" y="142" text-anchor="middle" fill="${fg}" font-size="9.2" font-weight="700">EL-00003 + EL-00013 + МЛ-232</text>
  <text x="799" y="164" text-anchor="middle" fill="${sub}" font-size="9">• Контур НК-1: Радиаторы (${tmData.pumpCircuits[0]?.pumpName || 'UPS 25/4'})</text>
  <text x="799" y="182" text-anchor="middle" fill="${sub}" font-size="9">• Контур НК-2: Тёплый пол (${tmData.pumpCircuits[1]?.pumpName || 'UPS 25/4'})</text>
  <text x="799" y="200" text-anchor="middle" fill="#38bdf8" font-size="9" font-weight="700">• Охлаждение: Чиллер Т5/Т6 (7/12°C)</text>
  <text x="799" y="238" text-anchor="middle" fill="${sub}" font-size="8.8">БКН и ХВО не требуются (без ВК)</text>

  <rect x="310" y="330" width="583" height="84" rx="8" fill="${card}" stroke="#06b6d4" stroke-width="1.8"/>
  <text x="326" y="352" fill="#06b6d4" font-size="11" font-weight="800">ОФИСНЫЙ УЗЕЛ ТЕПЛО- И ХОЛОДОСНАБЖЕНИЯ (ОВиК + ТМ · БЕЗ ВК):</text>
  <text x="326" y="372" fill="${fg}" font-size="10">1) Отопление: Котёл Bathello ${tmData.boilerNomKw} кВт (${tmData.boilerSku}) + Коакс. дымоход KT-00704 + ГС + НК-1 + НК-2</text>
  <text x="326" y="391" fill="${fg}" font-size="10">2) Автоматика и Климат: ZONT H1000+ PRO + ZE-44 (EL-00013) + ПВУ с рекуперацией + Чиллер–Фанкойл (Т5/Т6)</text>
  ` : `
  <!-- 4. Бойлер косвенного нагрева ГВС БКН + Рециркуляция -->
  <rect x="725" y="88" width="165" height="205" rx="16" fill="${card}" stroke="#06b6d4" stroke-width="2.2"/>
  <text x="807" y="114" text-anchor="middle" fill="#06b6d4" font-size="12" font-weight="800">БОЙЛЕР БКН ${tmData.bknLiters} л</text>
  <text x="807" y="131" text-anchor="middle" fill="${fg}" font-size="9.5" font-weight="700">Нагрев: ${h10?.dhw?.heatUpMin ?? 28} мин (${h10?.dhw?.mixed45L ?? 214}л 45°C)</text>
  <path d="M755,165 Q807,145 855,165 Q807,185 755,205 Q807,225 855,205" stroke="#ef4444" stroke-width="2.5" fill="none"/>
  <text x="807" y="250" text-anchor="middle" fill="#10b981" font-size="9.5" font-weight="700">Т3 ГВС +60°C / Т4 Рецирк.</text>
  <text x="807" y="266" text-anchor="middle" fill="${sub}" font-size="9">Насос Т4: UP 15-14B + РБ ГВС ${h10?.expansionTank?.dhwTankL ?? 18}л</text>

  <!-- 5. Водоподготовка ХВО Imrita -->
  <rect x="310" y="325" width="580" height="92" rx="8" fill="${card}" stroke="#0ea5e9" stroke-width="1.8"/>
  <text x="326" y="346" fill="#0ea5e9" font-size="11" font-weight="800">УЗЕЛ ВВОДА В1 И ВОДОПОДГОТОВКИ ХВО (IMRITA · CLIMATE HOUSE):</text>
  <text x="326" y="366" fill="${fg}" font-size="10">1) Аквастоп Wi-Fi Imrita IMT-P-ZL6 (FL-00259 · $180)  →  2) Редуктор давления FAR + Промывной фильтр IMT-M4 (FL-00303 · $86)</text>
  <text x="326" y="384" fill="${fg}" font-size="10">3) Ионообменный умягчитель Imrita IMT-S30 Pro (FL-00293 · $610)  →  4) Коллектор ХВС 7200S в синей теплоизоляции</text>
  <text x="326" y="402" fill="${sub}" font-size="9.5">Автоматическая подпитка котлового контура с обратным клапаном и манометром 1,5 бар.</text>
  `}
</svg>`.trim();
}
