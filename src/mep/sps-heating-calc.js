/**
 * SPS Project 2.0 — 1.0 dan ko'chirilgan 100% Aniq Muhandislik Hisob-Kitoblar Bazasi (Excel 1:1)
 *
 * Manbalar (SPS AI PRO 1.0 & Santex Profi-Servis):
 * 1) Тёплый пол шаблон 09,25.xlsx — qatlamli pol pirogi (q_up, q_down, T_pol <= 29°C / 31°C)
 * 2) Raschet-balansirovki-kollektorov-TP.xlsx — kontur gidravlikasi, mm.v.st / m.v.st, Kv balansirovka va Indeks kontur
 * 3) РАДИАТОР хисоб-китоблари.xlsx & КОНВЕКТОР ROYAL THERMO.xlsx — pasport qayta hisobi (ΔT^1.30, β1, β2, β3)
 * 4) ГИДРАВЛИК, ГИДРОСТРЕЛКА, РАСШИРИТЕЛЬНЫЙ БАК, БОЙЛЕР хисоб-китоби.xlsx — Altshul va Kotelxona ТМ hisobi
 */

function round1(v) {
  return Math.round(v * 10) / 10;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ============================================================================
// 1. ВОДЯНОЙ ТЁПЛЫЙ ПОЛ: ПИРОГ ПОЛА, ТЕПЛООТДАЧА И БАЛАНСИРОВКА КОЛЛЕКТОРА (Kv)
// ============================================================================

export const SPS_UF_PIPES = Object.freeze({
  pex_16_20: {
    id: 'pex_16_20',
    name: 'PE-RT / PE-Xa EVOH Ø16×2.0 mm (PRO AQUA)',
    shortName: 'Ø16×2.0',
    dOutMm: 16,
    wallMm: 2.0,
    dInMm: 12.0,
    catalogCode: 'TP-02490',
    maxRecommendedM: 86,
    fluxFactor: 1.0,
  },
  pex_16_22: {
    id: 'pex_16_22',
    name: 'PE-Xa EVOH Ø16×2.2 mm (SDR 7.4)',
    shortName: 'Ø16×2.2',
    dOutMm: 16,
    wallMm: 2.2,
    dInMm: 11.6,
    catalogCode: 'TP-02490',
    maxRecommendedM: 80,
    fluxFactor: 0.985,
  },
  pex_20_20: {
    id: 'pex_20_20',
    name: 'PE-RT / PE-Xa EVOH Ø20×2.0 mm',
    shortName: 'Ø20×2.0',
    dOutMm: 20,
    wallMm: 2.0,
    dInMm: 16.0,
    catalogCode: 'TP-02488',
    maxRecommendedM: 110,
    fluxFactor: 1.045,
  },
});

export const SPS_UF_SCREED_TYPES = Object.freeze({
  wet: {
    id: 'wet',
    name: 'Цементно-песчаная мокрая стяжка 65–70 мм (λ=1.4)',
    shortName: 'Мокрая стяжка (λ=1.4)',
    lambda: 1.4,
  },
  semidry: {
    id: 'semidry',
    name: 'Полусухая стяжка с фиброволокном 70 мм (λ=0.65)',
    shortName: 'Полусухая (λ=0.65)',
    lambda: 0.65,
  },
});

export const SPS_SUBFLOOR_MODES = Object.freeze({
  ground: {
    id: 'ground',
    name: 'По грунту (+8°C)',
    defaultBelowTempC: 8,
    rSubBase: 2.19,
  },
  interfloor: {
    id: 'interfloor',
    name: 'Межэтажное перекрытие (+20°C)',
    defaultBelowTempC: 20,
    rSubBase: 0.30,
  },
  passage: {
    id: 'passage',
    name: 'Над холодным подвалом / проездом',
    defaultBelowTempC: null,
    rSubBase: 0.28,
  },
});

export const SPS_UF_INSULATION_MATS = Object.freeze({
  penopleks_30: { id: 'penopleks_30', name: 'ЭППС Пеноплэкс 30 мм + Мультифольга', thicknessMm: 30, lambda: 0.032 },
  penopleks_50: { id: 'penopleks_50', name: 'ЭППС Пеноплэкс 50 мм + Мультифольга (Galf стандарт)', thicknessMm: 50, lambda: 0.032 },
  penopleks_100: { id: 'penopleks_100', name: 'ЭППС Пеноплэкс 100 мм (1-й этаж по грунту)', thicknessMm: 100, lambda: 0.032 },
});

// Тёплый пол шаблон 09,25.xlsx — tayanch oqim qiymatlari (T_mean=50°C, T_room=22°C, dT_ref=28°C, Ø16×2.0)
const UF_FLUX_REF_TABLE = {
  wet: {
    tile: { 0.10: 91.7, 0.15: 77.2, 0.20: 66.8 },
    laminate: { 0.10: 74.1, 0.15: 62.9, 0.20: 55.1 },
    parquet: { 0.10: 62.5, 0.15: 50.8, 0.20: 43.2 },
    carpet: { 0.10: 52.7, 0.15: 39.9, 0.20: 31.7 },
  },
  semidry: {
    tile: { 0.10: 68.2, 0.15: 56.4, 0.20: 48.1 },
    laminate: { 0.10: 55.9, 0.15: 46.8, 0.20: 40.5 },
    parquet: { 0.10: 49.2, 0.15: 40.0, 0.20: 33.8 },
    carpet: { 0.10: 43.3, 0.15: 33.7, 0.20: 27.3 },
  },
};

function interpolateStepFlux(rowByStep, stepM) {
  const s = clamp(Number(stepM) || 0.15, 0.08, 0.25);
  if (s <= 0.15) {
    const t = (s - 0.10) / 0.05;
    return rowByStep[0.10] + (rowByStep[0.15] - rowByStep[0.10]) * t;
  }
  const t = (s - 0.15) / 0.05;
  return rowByStep[0.15] + (rowByStep[0.20] - rowByStep[0.15]) * t;
}

/**
 * Tyopliy pol qatlamli pirogi bo'yicha yuqoriga (q_up), pastga (q_down) issiqlik oqimi va pol sirti haroratini (T_pol) hisoblaydi.
 */
export function computeUnderfloorFlux({
  coverType = 'laminate',
  screedType = 'wet',
  stepM = 0.15,
  supplyTemp = 42,
  returnTemp = 35,
  roomTemp = 22,
  subfloorMode = 'ground',
  xpsMm = 50,
  pipeId = 'pex_16_20',
  designTempOut = -16,
  roomType = 'living',
} = {}) {
  const screed = SPS_UF_SCREED_TYPES[screedType] || SPS_UF_SCREED_TYPES.wet;
  const screedTable = UF_FLUX_REF_TABLE[screed.id] || UF_FLUX_REF_TABLE.wet;
  const normCover = String(coverType || '').startsWith('tile')
    ? 'tile'
    : coverType === 'parquet'
      ? 'parquet'
      : coverType === 'carpet'
        ? 'carpet'
        : 'laminate';
  const coverRow = screedTable[normCover] || screedTable.laminate;
  const pipe = SPS_UF_PIPES[pipeId] || SPS_UF_PIPES.pex_16_20;
  const sub = SPS_SUBFLOOR_MODES[subfloorMode] || SPS_SUBFLOOR_MODES.ground;

  const qRef = interpolateStepFlux(coverRow, stepM);
  const tSup = Number(supplyTemp) || 42;
  const tRet = Number(returnTemp) || 35;
  const tRoom = Number(roomTemp) || 22;
  const tMean = (tSup + tRet) / 2;

  const qUpWm2 = round1(Math.max(12, qRef * pipe.fluxFactor * (Math.max(4, tMean - tRoom) / 28.0)));
  // EN 1264 / СП 60.13330 pol yuzasi harorati: T_pol = T_room + (q_up / 8.92)^(1/1.1)
  const surfaceTempC = round1(qUpWm2 > 0 ? tRoom + Math.pow(qUpWm2 / 8.92, 1 / 1.1) : tRoom);

  const rXps = Math.max(0, Number(xpsMm) || 50) / 1000 / 0.034;
  const rDown = sub.rSubBase + rXps;
  const tBelow = sub.defaultBelowTempC !== null ? sub.defaultBelowTempC : (Number(designTempOut) ?? -16);
  const tPlane = tMean - 0.085 * qUpWm2;
  const qDownWm2 = round1(Math.max(0, (tPlane - tBelow) / Math.max(0.25, rDown)));
  const qTotalWm2 = round1(qUpWm2 + qDownWm2);

  const isWetOrTransit = ['bathroom', 'bath', 'hallway', 'hall'].includes(roomType);
  const maxAllowedSurfaceTempC = isWetOrTransit ? 31.0 : 29.0;
  const surfaceTempOk = surfaceTempC <= maxAllowedSurfaceTempC;

  return {
    coverType: normCover,
    qUpWm2,
    qDownWm2,
    qTotalWm2,
    surfaceTempC,
    maxAllowedSurfaceTempC,
    surfaceTempOk,
    tMean: round1(tMean),
    tBelow,
    xpsMm: Number(xpsMm) || 50,
    screedId: screed.id,
    screedName: screed.shortName,
    subfloorId: sub.id,
    pipeId: pipe.id,
    pipeName: pipe.shortName,
  };
}

/**
 * Raschet-balansirovki-kollektorov-TP.xlsx asosida tyopliy pol konturlari gidravlikasi
 * va kollektor klapanlari balansirovkasini (Kv, м.в.ст., индексная петля) hisoblaydi!
 */
export function computeUfLoopHydraulics(rawLoops = [], { pipeId = 'pex_16_20', deltaT = 7, minRotameterLpm = 0.60 } = {}) {
  const pipe = SPS_UF_PIPES[pipeId] || SPS_UF_PIPES.pex_16_20;
  const dInMm = pipe.dInMm;
  const rho = 990.2; // suv zichligi ~42°C da, kg/m3
  const nu = 0.632; // kinematik yopishqoqlik, mm2/s
  const kvShut = 2.4;
  const kvReg = 1.1;
  const effDt = Math.max(3, Number(deltaT) || 7);

  const pass1 = (rawLoops || []).map((lp) => {
    const areaM2 = Math.max(0.1, Number(lp.areaM2) || 0);
    const transitLenM = Math.max(0, Number(lp.transitLenM) || 0);
    const totalLenM = Math.max(0.5, Number(lp.totalLenM ?? lp.lengthM) || 0);
    const qUpWm2 = Number(lp.qUpWm2) || 64;
    const qDownWm2 = Number(lp.qDownWm2) || 7;

    const qUsefulW = Math.round(areaM2 * qUpWm2);
    const qDownW = Math.round(areaM2 * qDownWm2);
    const qTransitW = Math.round(transitLenM * 5.5); // Energoflex 6mm izolyatsiyada tranzit issiqligi
    const qLoopTotalW = qUsefulW + qDownW + qTransitW;

    const designFlowLph = (0.86 * qLoopTotalW) / effDt;
    const designFlowLpm = round2(designFlowLph / 60);
    const flowLpm = round2(Math.max(minRotameterLpm, designFlowLpm));
    const flowLph = round1(flowLpm * 60);
    const actualDeltaT = flowLph > 0 ? round1((0.86 * qLoopTotalW) / flowLph) : effDt;

    const velocityMs = round2((0.278 * 4 * flowLph) / (Math.PI * dInMm * dInMm));
    const rMmAqPerM = 14.7 * Math.pow(nu * 1e-6, 0.25) * rho * (Math.pow(flowLph, 1.75) / Math.pow(dInMm, 4.75));
    const dpPipeMmAq = 1.3 * rMmAqPerM * totalLenM;
    const dpShutMmAq = Math.pow((flowLph * 0.001) / kvShut, 2) * 10000;
    const dpRegMmAq = Math.pow((flowLph * 0.001) / kvReg, 2) * 10000;
    const dpTotalMmAq = Math.round(dpPipeMmAq + dpShutMmAq + dpRegMmAq);
    const dpMWc = round2(dpTotalMmAq / 1000); // м.в.ст. (GalfDesign jadvali formati!)
    const dpKpa = round2(dpTotalMmAq / 101.97);
    const waterVolumeL = round2(totalLenM * Math.PI * Math.pow(dInMm / 2000, 2) * 1000);
    const hydraulicWarn = totalLenM > pipe.maxRecommendedM || dpKpa > 22 || velocityMs > 0.75;

    return {
      ...lp,
      pipeId: pipe.id,
      pipeName: pipe.shortName,
      pipeSku: pipe.catalogCode,
      waterVolumeL,
      outputW: qUsefulW,
      qUsefulW,
      qDownW,
      qTransitW,
      qLoopTotalW,
      designFlowLpm,
      flowLmin: flowLpm,
      flowLpm,
      flowLph,
      actualDeltaT,
      velocityMs,
      rMmAqPerM: round2(rMmAqPerM),
      dpPipeMmAq: Math.round(dpPipeMmAq),
      dpShutMmAq: Math.round(dpShutMmAq),
      dpRegMmAq: Math.round(dpRegMmAq),
      dpTotalMmAq,
      dpMWc,
      pressureDropKpa: dpKpa,
      dpKpa,
      hydraulicWarn,
    };
  });

  const maxDpMmAq = pass1.length ? Math.max(...pass1.map((l) => l.dpTotalMmAq)) : 0;

  return pass1.map((lp) => {
    const dpThrottleMmAq = Math.max(lp.dpRegMmAq, maxDpMmAq - lp.dpPipeMmAq - lp.dpShutMmAq);
    const kvSetting = round2((lp.flowLph * 0.001) / Math.sqrt(Math.max(1e-6, dpThrottleMmAq * 0.0001)));
    const isIndexLoop = maxDpMmAq > 0 && lp.dpTotalMmAq === maxDpMmAq;
    return {
      ...lp,
      dpThrottleMmAq: Math.round(dpThrottleMmAq),
      kvSetting,
      isIndexLoop,
    };
  });
}

/**
 * Yagona markazlashgan nasos tanlash funksiyasi (1.0 Расчёт · ОВ-1 · ТМ-1 · Смета СО-1 100% bir xil!).
 * Hisobiy sarf G (м³/ч) va talab etiladigan bosim H (м.в.ст.) bo'yicha rasmiy Climate House Grundfos modelini tanlaydi.
 */
export function selectCirculationPumpByDuty({ flowM3h = 0.5, headM = 2.5 } = {}) {
  const g = Math.max(0, Number(flowM3h) || 0);
  const h = Math.max(0, Number(headM) || 0);
  if (h <= 3.8 && g <= 2.2) {
    return {
      pumpSku: 'NS-01636',
      pumpName: 'Grundfos UPS 25/4',
      fullLabel: 'Grundfos UPS 25/4 (NS-01636)',
      nomHeadM: 4.0,
    };
  }
  if (h <= 5.6 && g <= 3.2) {
    return {
      pumpSku: 'NS-01637',
      pumpName: 'Grundfos UPS 25/6',
      fullLabel: 'Grundfos UPS 25/6 (NS-01637)',
      nomHeadM: 6.0,
    };
  }
  return {
    pumpSku: 'NS-01639',
    pumpName: 'Grundfos UPS 25/8',
    fullLabel: 'Grundfos UPS 25/8 (NS-01639)',
    nomHeadM: 8.0,
  };
}

/**
 * Nasos-aralashtirish uzeli (Узел подмеса ТП: α, Kvs, Напор насоса) hisobi.
 */
export function computeMixingUnit({
  totalUfWaterLoadW = 0,
  totalFlowLpm = 0,
  ufSupplyTemp = 42,
  ufReturnTemp = 35,
  boilerSupplyTemp = 70,
  maxLoopDpKpa = 0,
} = {}) {
  const tSupUf = Number(ufSupplyTemp) || 42;
  const tRetUf = Number(ufReturnTemp) || 35;
  const tBoiler = Number(boilerSupplyTemp) || 70;
  const flowTotal = Math.max(0, Number(totalFlowLpm) || 0);

  const needsMixing = tBoiler > tSupUf + 1;
  const alpha = needsMixing
    ? clamp((tSupUf - tRetUf) / Math.max(1, tBoiler - tRetUf), 0.05, 1.0)
    : 1.0;

  const primaryHotFlowLpm = round2(flowTotal * alpha);
  const recircBypassLpm = round2(Math.max(0, flowTotal - primaryHotFlowLpm));
  const mixTempCheckC = flowTotal > 0.01
    ? round1((tBoiler * primaryHotFlowLpm + tRetUf * recircBypassLpm) / flowTotal)
    : tSupUf;

  const kvsRequired = round2((primaryHotFlowLpm * 0.06) / Math.sqrt(0.15));
  const stdKvs = [1.6, 2.5, 3.5, 4.5, 6.3, 10.0];
  const kvsRecommended = stdKvs.find((k) => k >= kvsRequired) || 10.0;
  const totalFlowM3h = round2(flowTotal * 0.06);
  const pumpHeadM = flowTotal > 0 ? round2((Number(maxLoopDpKpa || 0) + 15) / 9.81) : 0;
  const pumpSel = selectCirculationPumpByDuty({ flowM3h: totalFlowM3h, headM: pumpHeadM });

  return {
    needsMixing,
    boilerSupplyTemp: tBoiler,
    ufSupplyTemp: tSupUf,
    ufReturnTemp: tRetUf,
    alpha: round2(alpha),
    totalUfWaterLoadKw: round2((Number(totalUfWaterLoadW) || 0) / 1000),
    totalFlowLpm: round2(flowTotal),
    totalFlowM3h,
    primaryHotFlowLpm,
    recircBypassLpm,
    mixTempCheckC,
    kvsRequired,
    kvsRecommended,
    pumpHeadM,
    pumpSku: pumpSel.pumpSku,
    pumpName: pumpSel.pumpName,
    recommendedPumpModel: pumpSel.fullLabel,
  };
}

// ============================================================================
// 2. РАДИАТОРЫ И ВНУТРИПОЛЬНЫЕ КОНВЕКТОРЫ — ПАСПОРТНЫЙ ПЕРЕСЧЁТ (ΔT^1.30, β1, β2, β3)
// ============================================================================

export const SPS_RAD_CONNECTIONS = Object.freeze({
  bottom_right_50: { id: 'bottom_right_50', name: 'Нижнее правое 50 мм (Бинокль / Multiflex)', beta1: 0.98, scheme: 'bottom50', side: 'right', hasMultiflex: true },
  bottom_left_50: { id: 'bottom_left_50', name: 'Нижнее левое 50 мм (Бинокль / Multiflex)', beta1: 0.98, scheme: 'bottom50', side: 'left', hasMultiflex: true },
  bottom_center_50: { id: 'bottom_center_50', name: 'Нижнее центральное 50 мм (Rifar Tubog)', beta1: 0.97, scheme: 'bottom_center', side: 'center', hasMultiflex: true },
  diag_lr: { id: 'diag_lr', name: 'Диагональное (верх-низ, максимальный КПД)', beta1: 1.00, scheme: 'diag_lr', side: 'both', hasMultiflex: false },
  side_left: { id: 'side_left', name: 'Боковое одностороннее (верх-низ)', beta1: 0.97, scheme: 'side', side: 'left', hasMultiflex: false },
  bottom_saddle: { id: 'bottom_saddle', name: 'Седловидное (низ-низ)', beta1: 0.84, scheme: 'saddle', side: 'both', hasMultiflex: false },
});

export const SPS_RAD_ENCLOSURES = Object.freeze({
  open_wall: { id: 'open_wall', name: 'Открыто на стене (β2=1.00)', beta2: 1.00 },
  sill_shelf: { id: 'sill_shelf', name: 'Под подоконником (β2=1.03)', beta2: 1.03 },
  wall_niche: { id: 'wall_niche', name: 'В стеновой нише (β2=1.07)', beta2: 1.07 },
  decor_grille: { id: 'decor_grille', name: 'За декоративным экраном (β2=1.18)', beta2: 1.18 },
});

export const SPS_RADIATOR_MODELS = Object.freeze({
  rt_panel_c22: {
    id: 'rt_panel_c22',
    kind: 'panel',
    panelType: 22,
    panelTypeFactor: 1.0,
    brand: 'ROYAL THERMO',
    name: 'Royal Thermo Compact C22',
    material: 'Стальной панельный Тип 22',
    heightMm: 500,
    depthM: 0.102,
    nominalDt: 70,
    exponent: 1.30,
    defaultConnection: 'bottom_right_50',
    catalogCode: 'RD-01898',
  },
  kermi_ftv_22: {
    id: 'kermi_ftv_22',
    kind: 'panel',
    panelType: 22,
    panelTypeFactor: 1.02,
    brand: 'KERMI',
    name: 'Kermi Profil-V FTV 22',
    material: 'Стальной панельный FTV 22 (50 мм)',
    heightMm: 500,
    depthM: 0.100,
    nominalDt: 70,
    exponent: 1.30,
    defaultConnection: 'bottom_right_50',
    catalogCode: 'RD-01898',
  },
  kermi_ftv_11: {
    id: 'kermi_ftv_11',
    kind: 'panel',
    panelType: 11,
    panelTypeFactor: 0.62,
    brand: 'KERMI',
    name: 'Kermi Profil-V FTV 11',
    material: 'Стальной панельный FTV 11 (тонкий)',
    heightMm: 500,
    depthM: 0.064,
    nominalDt: 70,
    exponent: 1.30,
    defaultConnection: 'bottom_right_50',
    catalogCode: 'RD-01903',
  },
  kermi_ftv_33: {
    id: 'kermi_ftv_33',
    kind: 'panel',
    panelType: 33,
    panelTypeFactor: 1.42,
    brand: 'KERMI',
    name: 'Kermi Profil-V FTV 33',
    material: 'Стальной панельный FTV 33 (усиленный)',
    heightMm: 500,
    depthM: 0.155,
    nominalDt: 70,
    exponent: 1.30,
    defaultConnection: 'bottom_right_50',
    catalogCode: 'RD-01901',
  },
  rifar_tubog_2: {
    id: 'rifar_tubog_2',
    kind: 'tubular',
    brand: 'RIFAR',
    name: 'Rifar Tubog Ventil 2180/500',
    material: 'Стальной трубчатый 2-рядный (Galf стандарт)',
    heightMm: 500,
    depthM: 0.066,
    sectionWidthM: 0.046,
    qNom70W: 66,
    nominalDt: 70,
    exponent: 1.30,
    defaultConnection: 'bottom_center_50',
    catalogCode: 'RD-01899',
  },
  rt_biliner_500: {
    id: 'rt_biliner_500',
    kind: 'sectional',
    brand: 'ROYAL THERMO',
    name: 'Royal Thermo Biliner 500',
    material: 'Биметаллический секционный',
    heightMm: 500,
    depthM: 0.087,
    sectionWidthM: 0.080,
    qNom70W: 175,
    nominalDt: 70,
    exponent: 1.30,
    lowHeightPair: 'rt_rev_350',
    defaultConnection: 'diag_lr',
    catalogCode: 'RD-01919',
  },
  rt_rev_500: {
    id: 'rt_rev_500',
    kind: 'sectional',
    brand: 'ROYAL THERMO',
    name: 'Royal Thermo Revolution 500',
    material: 'Алюминиевый секционный',
    heightMm: 500,
    depthM: 0.080,
    sectionWidthM: 0.080,
    qNom70W: 170,
    nominalDt: 70,
    exponent: 1.30,
    lowHeightPair: 'rt_rev_350',
    defaultConnection: 'diag_lr',
    catalogCode: 'RD-01916',
  },
  rt_rev_350: {
    id: 'rt_rev_350',
    kind: 'sectional',
    brand: 'ROYAL THERMO',
    name: 'Royal Thermo Revolution 350',
    material: 'Алюминиевый низкий 350 мм',
    heightMm: 350,
    depthM: 0.080,
    sectionWidthM: 0.080,
    qNom70W: 128,
    nominalDt: 70,
    exponent: 1.30,
    lowHeightPair: null,
    defaultConnection: 'diag_lr',
    catalogCode: 'RD-01916',
  },
  rt_pianoforte_500: {
    id: 'rt_pianoforte_500',
    kind: 'sectional',
    brand: 'ROYAL THERMO',
    name: 'Royal Thermo Pianoforte 500',
    material: 'Дизайн-биметалл секционный',
    heightMm: 500,
    depthM: 0.096,
    sectionWidthM: 0.080,
    qNom70W: 189,
    nominalDt: 70,
    exponent: 1.30,
    lowHeightPair: 'rt_rev_350',
    defaultConnection: 'diag_lr',
    catalogCode: 'RD-01917',
  },
  konveka_fc_floor: {
    id: 'konveka_fc_floor',
    kind: 'floor_convector',
    brand: 'KONVEKA',
    name: 'Konveka FC 15/15 (Напольный на ножках)',
    material: 'Напольный конвектор Cu-Al на ножках (H=240 мм)',
    heightMm: 150,
    legHeightMm: 90,
    depthM: 0.155,
    nominalDt: 70,
    exponent: 1.32,
    defaultConnection: 'bottom_right_50',
    catalogCode: 'RD-01954',
  },
});

export const SPS_FLOOR_CONVECTOR_KONVEKA_FC = Object.freeze([
  { lengthMm: 800, catalogCode: 'RD-01953', q70W: 860 },
  { lengthMm: 1000, catalogCode: 'RD-01953', q70W: 1120 },
  { lengthMm: 1200, catalogCode: 'RD-01954', q70W: 1390 },
  { lengthMm: 1400, catalogCode: 'RD-01954', q70W: 1660 },
  { lengthMm: 1600, catalogCode: 'RD-01956', q70W: 1930 },
  { lengthMm: 1800, catalogCode: 'RD-01956', q70W: 2210 },
  { lengthMm: 2000, catalogCode: 'RD-01956', q70W: 2480 },
  { lengthMm: 2200, catalogCode: 'RD-01956', q70W: 2760 },
  { lengthMm: 2400, catalogCode: 'RD-01956', q70W: 3040 },
]);

// Royal Thermo Compact Type 22 pasport jadvali (Q_nom, ΔT=70°C) + mos Climate House SKU kodlari
export const SPS_PANEL_22_TABLE = Object.freeze({
  300: { 600: 838, 800: 1118, 1000: 1397, 1200: 1676, 1400: 1956, 1600: 2235, 1800: 2515, 2000: 2794 },
  400: { 600: 1092, 800: 1456, 1000: 1820, 1200: 2184, 1400: 2548, 1600: 2912, 1800: 3276, 2000: 3640 },
  500: { 600: 1323, 800: 1764, 1000: 2205, 1200: 2646, 1400: 3087, 1600: 3528, 1800: 3969, 2000: 4410 },
});

const PANEL_CH_SKU_BY_LEN = {
  600: 'RD-01903',
  800: 'RD-01904',
  1000: 'RD-01897',
  1200: 'RD-01898',
  1400: 'RD-01899',
  1600: 'RD-01900',
  1800: 'RD-01901',
  2000: 'RD-01902',
};

export const SPS_CONVECTOR_ATRIUM = Object.freeze([
  { lengthMm: 800, catalogCode: 'RD-01953', q70BySpeed: { 0: 290, 40: 552, 60: 652, 80: 828, 100: 1015 } },
  { lengthMm: 1000, catalogCode: 'RD-01953', q70BySpeed: { 0: 415, 40: 793, 60: 937, 80: 1191, 100: 1459 } },
  { lengthMm: 1200, catalogCode: 'RD-01954', q70BySpeed: { 0: 555, 40: 1055, 60: 1247, 80: 1585, 100: 1942 } },
  { lengthMm: 1400, catalogCode: 'RD-01954', q70BySpeed: { 0: 690, 40: 1315, 60: 1553, 80: 1974, 100: 2419 } },
  { lengthMm: 1600, catalogCode: 'RD-01956', q70BySpeed: { 0: 790, 40: 1502, 60: 1774, 80: 2255, 100: 2763 } },
  { lengthMm: 1800, catalogCode: 'RD-01956', q70BySpeed: { 0: 930, 40: 1765, 60: 2085, 80: 2650, 100: 3247 } },
  { lengthMm: 2000, catalogCode: 'RD-01956', q70BySpeed: { 0: 1060, 40: 2022, 60: 2388, 80: 3036, 100: 3720 } },
  { lengthMm: 2200, catalogCode: 'RD-01956', q70BySpeed: { 0: 1195, 40: 2276, 60: 2688, 80: 3418, 100: 4187 } },
  { lengthMm: 2400, catalogCode: 'RD-01956', q70BySpeed: { 0: 1325, 40: 2521, 60: 2978, 80: 3786, 100: 4639 } },
]);

export const SPS_CONVECTOR_KONVEKA_FH4H = Object.freeze([
  { lengthMm: 850, catalogCode: 'RD-01953', q70BySpeed: { 0: 330, 40: 680, 60: 960, 80: 1220, 100: 1490 } },
  { lengthMm: 1050, catalogCode: 'RD-01953', q70BySpeed: { 0: 455, 40: 930, 60: 1310, 80: 1680, 100: 2040 } },
  { lengthMm: 1250, catalogCode: 'RD-01954', q70BySpeed: { 0: 590, 40: 1190, 60: 1670, 80: 2140, 100: 2610 } },
  { lengthMm: 1450, catalogCode: 'RD-01954', q70BySpeed: { 0: 720, 40: 1460, 60: 2040, 80: 2620, 100: 3190 } },
  { lengthMm: 1650, catalogCode: 'RD-01956', q70BySpeed: { 0: 850, 40: 1730, 60: 2410, 80: 3090, 100: 3760 } },
  { lengthMm: 1950, catalogCode: 'RD-01956', q70BySpeed: { 0: 1040, 40: 2110, 60: 2950, 80: 3790, 100: 4610 } },
  { lengthMm: 2250, catalogCode: 'RD-01956', q70BySpeed: { 0: 1240, 40: 2510, 60: 3500, 80: 4490, 100: 5470 } },
  { lengthMm: 2450, catalogCode: 'RD-01956', q70BySpeed: { 0: 1370, 40: 2780, 60: 3870, 80: 4960, 100: 6040 } },
]);

export const SPS_CONVECTOR_MODELS = Object.freeze({
  rt_atrium_turbo: {
    id: 'rt_atrium_turbo',
    brand: 'ROYAL THERMO',
    name: 'Royal Thermo Atrium Turbo',
    depthM: 0.25,
    heightMm: 85,
    rows: SPS_CONVECTOR_ATRIUM,
  },
  konveka_fh4h: {
    id: 'konveka_fh4h',
    brand: 'KONVEKA',
    name: 'Konveka FH4-H (EC 24V)',
    depthM: 0.255,
    heightMm: 110,
    rows: SPS_CONVECTOR_KONVEKA_FH4H,
  },
});

export function getSectionBeta3(sections) {
  if (sections <= 15) return 1.0;
  if (sections <= 20) return 0.98;
  return 0.96;
}

/**
 * Radiator yoki vnutripolniy konvektorni haqiqiy pasport jadvali va (ΔT/70)^1.30 · β1 / β2 · β3
 * bo'yicha 1:1 hisoblab tanlaydi!
 */
export function computeRadiatorOrConvectorUnit({
  kind = 'radiator',
  needW = 800,
  supplyTemp = 70,
  returnTemp = 55,
  roomTemp = 22,
  modelId = 'rt_panel_c22',
  convectorModelId = 'rt_atrium_turbo',
  connectionId = 'bottom_right_50',
  feedMount = 'wall',
  enclosureId = 'sill_shelf',
  convectorSpeedPct = 60,
  sillHeightM = 0.85,
  winWidthM = 1.6,
} = {}) {
  const tSup = Number(supplyTemp) || 70;
  const tRet = Number(returnTemp) || 55;
  const tRoom = Number(roomTemp) || 22;
  const waterDt = Math.max(5, tSup - tRet);
  const deltaT = round1(Math.max(8, (tSup + tRet) / 2 - tRoom));

  let baseModel = SPS_RADIATOR_MODELS[modelId] || SPS_RADIATOR_MODELS.rt_panel_c22;

  // B1. НАПОЛЬНЫЙ КОНВЕКТОР НА НОЖКАХ (Konveka FC 15/15 — панорамные и низкие окна!)
  if (kind === 'floor_convector' || baseModel.kind === 'floor_convector') {
    const fcModel = SPS_RADIATOR_MODELS.konveka_fc_floor;
    const dtFactorFc = Math.pow(deltaT / fcModel.nominalDt, fcModel.exponent);
    const maxLenMm = Math.max(800, Math.round(winWidthM * 920));
    const resolvedFeedFc = feedMount === 'wall' ? 'wall' : 'floor';
    const connSideFc = connectionId === 'bottom_left_50' ? 'left' : 'right';

    let chosenFc = SPS_FLOOR_CONVECTOR_KONVEKA_FC[0];
    for (const row of SPS_FLOOR_CONVECTOR_KONVEKA_FC) {
      const qNomW = row.q70W;
      const qActualW = Math.round(qNomW * dtFactorFc * 0.98);
      chosenFc = { ...row, qNomW, qActualW };
      if (qActualW >= needW && row.lengthMm <= Math.max(1200, maxLenMm)) break;
      if (qActualW >= needW) break;
    }

    const lenM = round2(chosenFc.lengthMm / 1000);
    const flowLpm = round2((0.86 * chosenFc.qActualW) / (waterDt * 60));
    return {
      kind: 'floor_convector',
      radType: 'floor_convector',
      modelId: fcModel.id,
      brand: fcModel.brand,
      skuCode: chosenFc.catalogCode,
      model: `Konveka FC 15/15-${chosenFc.lengthMm} (напольный на ножках, H=240 мм)`,
      connectionId: connSideFc === 'left' ? 'bottom_left_50' : 'bottom_right_50',
      connectionScheme: 'bottom50',
      connectionSide: connSideFc,
      connectionLabel: `Нижнее ${connSideFc === 'left' ? 'левое' : 'правое'} 50 мм (Бинокль 3/4" ЕК + M30×1.5)`,
      hasMultiflex: true,
      feedMount: resolvedFeedFc,
      supplyTemp: tSup,
      returnTemp: tRet,
      roomTemp: tRoom,
      deltaT,
      qNomW: chosenFc.qNomW,
      beta1: 0.98,
      beta2: 1.0,
      beta3: 1.0,
      qUnitActualW: chosenFc.qActualW,
      sections: null,
      panelLengthMm: chosenFc.lengthMm,
      heightMm: fcModel.heightMm,
      legHeightMm: fcModel.legHeightMm,
      widthM: lenM,
      depthM: fcModel.depthM,
      heightM: round2(fcModel.heightMm / 1000),
      zBottomM: round2(fcModel.legHeightMm / 1000),
      powerW: chosenFc.qActualW,
      flowLpm,
      waterVolumeL: round2(lenM * 1.35),
    };
  }

  if (kind === 'convector') {
    const convDef = SPS_CONVECTOR_MODELS[convectorModelId] || SPS_CONVECTOR_MODELS.rt_atrium_turbo;
    const speed = [0, 40, 60, 80, 100].includes(Number(convectorSpeedPct)) ? Number(convectorSpeedPct) : 60;
    const exp = speed === 0 ? 1.30 : 1.319;
    const dtFactor = Math.pow(deltaT / 70, exp);
    const maxLenMm = Math.max(800, Math.round(winWidthM * 920));

    let chosen = convDef.rows[0];
    for (const row of convDef.rows) {
      const qNomW = row.q70BySpeed[speed];
      const qActualW = Math.round(qNomW * dtFactor);
      chosen = { ...row, qNomW, qActualW };
      if (qActualW >= needW && row.lengthMm <= Math.max(1200, maxLenMm)) break;
      if (qActualW >= needW) break;
    }

    const flowLpm = round2((0.86 * chosen.qActualW) / (waterDt * 60));
    const lenM = round2(chosen.lengthMm / 1000);
    return {
      kind: 'convector',
      radType: 'convector',
      modelId: convDef.id,
      brand: convDef.brand,
      skuCode: chosen.catalogCode,
      model: `${convDef.name} ${chosen.lengthMm}×${Math.round(convDef.depthM * 1000)}×${convDef.heightMm} (${speed === 0 ? 'Естеств.' : `EC ${speed}%`})`,
      connectionId: 'convector_left',
      connectionScheme: 'convector_end',
      connectionSide: 'left',
      connectionLabel: 'Торцевое G 1/2" + сервопривод 24V',
      hasMultiflex: false,
      feedMount: 'floor',
      supplyTemp: tSup,
      returnTemp: tRet,
      roomTemp: tRoom,
      deltaT,
      qNomW: chosen.qNomW,
      beta1: 1.0,
      beta2: 1.0,
      beta3: 1.0,
      qUnitActualW: chosen.qActualW,
      sections: null,
      panelLengthMm: chosen.lengthMm,
      heightMm: convDef.heightMm,
      widthM: lenM,
      depthM: convDef.depthM,
      heightM: round2(convDef.heightMm / 1000),
      zBottomM: -0.08,
      powerW: chosen.qActualW,
      flowLpm,
      waterVolumeL: round2(lenM * 1.4),
      convectorSpeedPct: speed,
    };
  }

  if (sillHeightM < 0.65 && baseModel.kind === 'sectional' && baseModel.lowHeightPair && SPS_RADIATOR_MODELS[baseModel.lowHeightPair]) {
    baseModel = SPS_RADIATOR_MODELS[baseModel.lowHeightPair];
  }

  // Rifar Tubog tanlanganda agar bottom_right_50 tursa markaziy yoki mos ulanishni tanlaymiz
  const effConnId = (baseModel.kind === 'tubular' && connectionId === 'bottom_right_50')
    ? 'bottom_center_50'
    : (connectionId || baseModel.defaultConnection || 'bottom_right_50');
  const conn = SPS_RAD_CONNECTIONS[effConnId] || SPS_RAD_CONNECTIONS.bottom_right_50;
  const encl = SPS_RAD_ENCLOSURES[enclosureId] || SPS_RAD_ENCLOSURES.sill_shelf;
  const resolvedFeed = feedMount === 'floor' ? 'floor' : 'wall';
  const dtFactor = Math.pow(deltaT / baseModel.nominalDt, baseModel.exponent);

  if (baseModel.kind === 'panel') {
    const heightMm = sillHeightM < 0.52 ? 300 : sillHeightM < 0.66 ? 400 : 500;
    const lengthsMap = SPS_PANEL_22_TABLE[heightMm] || SPS_PANEL_22_TABLE[500];
    const lengths = Object.keys(lengthsMap).map(Number).sort((a, b) => a - b);
    const maxAllowMm = Math.max(600, Math.round(winWidthM * 880));
    const typeFactor = baseModel.panelTypeFactor || 1.0;

    let chosenLenMm = lengths[0];
    let qNomW = Math.round(lengthsMap[chosenLenMm] * typeFactor);
    let qActualW = Math.round((qNomW * dtFactor * conn.beta1) / encl.beta2);

    for (const lenMm of lengths) {
      if (lenMm > maxAllowMm + 120 && lenMm > 600) break;
      const qN = Math.round(lengthsMap[lenMm] * typeFactor);
      const qAct = Math.round((qN * dtFactor * conn.beta1) / encl.beta2);
      chosenLenMm = lenMm;
      qNomW = qN;
      qActualW = qAct;
      if (qAct >= needW) break;
    }

    const widthM = round2(chosenLenMm / 1000);
    const flowLpm = round2((0.86 * qActualW) / (waterDt * 60));
    const skuCode = PANEL_CH_SKU_BY_LEN[chosenLenMm] || baseModel.catalogCode || 'RD-01898';

    return {
      kind: 'radiator',
      radType: 'panel',
      panelType: baseModel.panelType || 22,
      modelId: baseModel.id,
      brand: baseModel.brand,
      skuCode,
      model: `${baseModel.name} ${heightMm}×${chosenLenMm}`,
      connectionId: conn.id,
      connectionScheme: conn.scheme,
      connectionSide: conn.side,
      connectionLabel: conn.name,
      hasMultiflex: Boolean(conn.hasMultiflex),
      feedMount: resolvedFeed,
      supplyTemp: tSup,
      returnTemp: tRet,
      roomTemp: tRoom,
      deltaT,
      qNomW,
      beta1: conn.beta1,
      beta2: encl.beta2,
      beta3: 1.0,
      qUnitActualW: qActualW,
      sections: null,
      panelLengthMm: chosenLenMm,
      heightMm,
      widthM,
      depthM: baseModel.depthM,
      heightM: round2(heightMm / 1000),
      zBottomM: 0.12,
      powerW: qActualW,
      flowLpm,
      waterVolumeL: round2(widthM * 5.2 * typeFactor),
    };
  }

  // Sektsiyali (Biliner / Revolution / Pianoforte) yoki Trubchali (Rifar Tubog Ventil) radiator hisobi!
  const isTubular = baseModel.kind === 'tubular';
  const q1Base = baseModel.qNom70W * dtFactor * (conn.beta1 / encl.beta2);
  const minSec = isTubular ? 8 : 4;
  const maxFitSec = Math.max(minSec, Math.floor((Math.max(0.65, winWidthM * 0.88)) / baseModel.sectionWidthM));
  const maxSec = Math.min(isTubular ? 34 : 22, maxFitSec);

  let sections = Math.max(minSec, Math.ceil(needW / Math.max(10, q1Base)));
  let beta3 = isTubular ? 1.0 : getSectionBeta3(sections);
  sections = clamp(Math.ceil(needW / Math.max(10, q1Base * beta3)), minSec, maxSec);
  beta3 = isTubular ? 1.0 : getSectionBeta3(sections);

  const qUnitActualW = round1(q1Base * beta3);
  const powerW = Math.round(sections * qUnitActualW);
  const widthM = round2(sections * baseModel.sectionWidthM);
  const flowLpm = round2((0.86 * powerW) / (waterDt * 60));
  const qNomTotalW = Math.round(sections * baseModel.qNom70W);

  return {
    kind: 'radiator',
    radType: isTubular ? 'tubular' : 'sectional',
    panelType: null,
    modelId: baseModel.id,
    brand: baseModel.brand,
    skuCode: baseModel.catalogCode,
    model: isTubular
      ? `${baseModel.name} — ${sections} секц. (${Math.round(widthM * 1000)} мм)`
      : `${baseModel.name} — ${sections} секц.`,
    connectionId: conn.id,
    connectionScheme: conn.scheme,
    connectionSide: conn.side,
    connectionLabel: conn.name,
    hasMultiflex: Boolean(conn.hasMultiflex),
    feedMount: resolvedFeed,
    supplyTemp: tSup,
    returnTemp: tRet,
    roomTemp: tRoom,
    deltaT,
    qNomW: qNomTotalW,
    qNomPerSecW: baseModel.qNom70W,
    beta1: conn.beta1,
    beta2: encl.beta2,
    beta3,
    qUnitActualW,
    sections,
    panelLengthMm: Math.round(widthM * 1000),
    heightMm: baseModel.heightMm,
    widthM,
    depthM: baseModel.depthM,
    heightM: round2(baseModel.heightMm / 1000),
    zBottomM: 0.12,
    powerW,
    flowLpm,
    waterVolumeL: round2(sections * (isTubular ? 0.44 : 0.32)),
  };
}

// ============================================================================
// 3. ГИДРАВЛИКА ТРУБОПРОВОДОВ (АЛЬТШУЛЬ) И РАСЧЁТ КОТЕЛЬНОЙ (ГС · РБ · БКН)
// ============================================================================

export const SPS_HEATING_TOPOLOGIES = Object.freeze({
  radial: {
    id: 'radial',
    name: 'Коллекторно-лучевая (ШРВ-Р · 16×2.0 без тройников в стяжке)',
    shortName: 'Лучевая (ШРВ-Р)',
  },
  two_pipe_dead_end: {
    id: 'two_pipe_dead_end',
    name: 'Двухтрубная тупиковая (2 крыла по периметру · 26→20→16)',
    shortName: 'Двухтрубная тупиковая',
  },
  two_pipe_tichelmann: {
    id: 'two_pipe_tichelmann',
    name: 'Двухтрубная попутная (петля Тихельмана · равные петли)',
    shortName: 'Попутная (Тихельман)',
  },
});

export const SPS_TRUNK_PIPE_FAMILIES = Object.freeze({
  te_sa_press: {
    id: 'te_sa_press',
    brand: 'TE-SA',
    fittingType: 'press_mp',
    materialCode: 'PE-Xb/Al/PE-Xb',
    name: 'TE-SA Металлопластик PE-Xb/Al/PE-Xb + Пресс-фитинги (CW617N / AISI 304)',
    shortName: 'TE-SA Press MP',
    roughnessMm: 0.007,
    sizes: [
      { outerMm: 16, wallMm: 2.0, innerMm: 12.0, volPerM: 0.113, label: 'Ø16×2.0', skuCode: 'TR-03037', refUsdM: 1.35 },
      { outerMm: 20, wallMm: 2.0, innerMm: 16.0, volPerM: 0.201, label: 'Ø20×2.0', skuCode: 'TR-03038', refUsdM: 1.95 },
      { outerMm: 26, wallMm: 3.0, innerMm: 20.0, volPerM: 0.314, label: 'Ø26×3.0', skuCode: 'TR-03039', refUsdM: 3.20 },
      { outerMm: 32, wallMm: 3.0, innerMm: 26.0, volPerM: 0.531, label: 'Ø32×3.0', skuCode: 'TR-03040', refUsdM: 4.65 },
    ],
  },
  pex_al_pex: {
    id: 'te_sa_press',
    brand: 'TE-SA',
    fittingType: 'press_mp',
    materialCode: 'PE-Xb/Al/PE-Xb',
    name: 'TE-SA Металлопластик PE-Xb/Al/PE-Xb + Пресс-фитинги (CW617N / AISI 304)',
    shortName: 'TE-SA Press MP',
    roughnessMm: 0.007,
    sizes: [
      { outerMm: 16, wallMm: 2.0, innerMm: 12.0, volPerM: 0.113, label: 'Ø16×2.0', skuCode: 'TR-03037', refUsdM: 1.35 },
      { outerMm: 20, wallMm: 2.0, innerMm: 16.0, volPerM: 0.201, label: 'Ø20×2.0', skuCode: 'TR-03038', refUsdM: 1.95 },
      { outerMm: 26, wallMm: 3.0, innerMm: 20.0, volPerM: 0.314, label: 'Ø26×3.0', skuCode: 'TR-03039', refUsdM: 3.20 },
      { outerMm: 32, wallMm: 3.0, innerMm: 26.0, volPerM: 0.531, label: 'Ø32×3.0', skuCode: 'TR-03040', refUsdM: 4.65 },
    ],
  },
  pro_aqua_ppr: {
    id: 'pro_aqua_ppr',
    brand: 'PRO AQUA',
    fittingType: 'socket_ppr',
    materialCode: 'PP-R RUBIS SDR 7.4',
    name: 'Pro Aqua PP-R RUBIS армированный стекловолокном SDR 7.4',
    shortName: 'Pro Aqua PP-R',
    roughnessMm: 0.007,
    sizes: [
      { outerMm: 20, wallMm: 3.4, innerMm: 13.2, volPerM: 0.137, label: 'Ø20×3.4', skuCode: 'TR-02640', refUsdM: 1.25 },
      { outerMm: 25, wallMm: 4.2, innerMm: 16.6, volPerM: 0.216, label: 'Ø25×4.2', skuCode: 'TR-02641', refUsdM: 1.85 },
      { outerMm: 32, wallMm: 5.4, innerMm: 21.2, volPerM: 0.353, label: 'Ø32×5.4', skuCode: 'TR-02642', refUsdM: 2.95 },
      { outerMm: 40, wallMm: 6.7, innerMm: 26.6, volPerM: 0.556, label: 'Ø40×6.7', skuCode: 'PPR-RUB-40', refUsdM: 4.50 },
    ],
  },
  ppr_pn20: {
    id: 'pro_aqua_ppr',
    brand: 'PRO AQUA',
    fittingType: 'socket_ppr',
    materialCode: 'PP-R RUBIS SDR 7.4',
    name: 'Pro Aqua PP-R RUBIS армированный стекловолокном SDR 7.4',
    shortName: 'Pro Aqua PP-R',
    roughnessMm: 0.007,
    sizes: [
      { outerMm: 20, wallMm: 3.4, innerMm: 13.2, volPerM: 0.137, label: 'Ø20×3.4', skuCode: 'TR-02640', refUsdM: 1.25 },
      { outerMm: 25, wallMm: 4.2, innerMm: 16.6, volPerM: 0.216, label: 'Ø25×4.2', skuCode: 'TR-02641', refUsdM: 1.85 },
      { outerMm: 32, wallMm: 5.4, innerMm: 21.2, volPerM: 0.353, label: 'Ø32×5.4', skuCode: 'TR-02642', refUsdM: 2.95 },
      { outerMm: 40, wallMm: 6.7, innerMm: 26.6, volPerM: 0.556, label: 'Ø40×6.7', skuCode: 'PPR-RUB-40', refUsdM: 4.50 },
    ],
  },
});

function evalAltschulAtSize(flowKgh, size, roughnessMm) {
  const rho = 980.5;
  const nu = 0.443e-6;
  const dM = Math.max(0.004, size.innerMm / 1000);
  const epsM = roughnessMm / 1000;
  const areaM2 = (Math.PI * dM * dM) / 4;
  const flowM3s = Math.max(0, flowKgh) / (rho * 3600);
  const velocityMs = flowM3s / areaM2;
  if (velocityMs <= 1e-6) return { velocityMs: 0, reynolds: 0, lambda: 0, rPaPerM: 0 };
  const reynolds = (velocityMs * dM) / nu;
  const lambda = reynolds < 2300
    ? 64 / Math.max(1, reynolds)
    : 0.11 * Math.pow(epsM / dM + 68 / reynolds, 0.25);
  const rPaPerM = lambda * (rho * velocityMs * velocityMs) / (2 * dM);
  return {
    velocityMs: round2(velocityMs),
    reynolds: Math.round(reynolds),
    lambda: Math.round(lambda * 10000) / 10000,
    rPaPerM: round1(rPaPerM),
  };
}

export function computePipeSegmentHydraulics({
  loadW = 0,
  deltaT = 15,
  lengthM = 1,
  familyId = 'te_sa_press',
  isBranch = true,
  localLossFactor = 1.30,
} = {}) {
  const family = SPS_TRUNK_PIPE_FAMILIES[familyId] || SPS_TRUNK_PIPE_FAMILIES.te_sa_press;
  const effDt = Math.max(5, Number(deltaT) || 15);
  const effLoadW = Math.max(0, Number(loadW) || 0);
  const flowKgh = round1((0.86 * effLoadW) / effDt);
  const flowLpm = round2(flowKgh / 60);
  const lenM = Math.max(0.1, Number(lengthM) || 0.1);

  // Shovqinsiz gidravlika standarti:
  // Podvodka (isBranch=true): v <= 0.65 м/с, R <= 165 Па/м -> Ø16×2.0 (PP-R Ø20)
  // Magistral (isBranch=false): v <= 0.42 м/с, R <= 90 Па/м -> kaskad Ø26 -> Ø20 -> Ø16 (PP-R Ø32 -> Ø25 -> Ø20)!
  const maxVel = isBranch ? 0.65 : 0.42;
  const maxR = isBranch ? 165 : 90;

  let chosen = family.sizes[family.sizes.length - 1];
  let chosenHyd = evalAltschulAtSize(flowKgh, chosen, family.roughnessMm);

  for (let i = 0; i < family.sizes.length; i++) {
    const cand = family.sizes[i];
    const hyd = evalAltschulAtSize(flowKgh, cand, family.roughnessMm);
    chosen = cand;
    chosenHyd = hyd;
    if (hyd.velocityMs <= maxVel && hyd.rPaPerM <= maxR) break;
  }

  const pairPipeLenM = round2(lenM * 2);
  const dpPa = Math.round(chosenHyd.rPaPerM * pairPipeLenM * localLossFactor);
  const dpKpa = round2(dpPa / 1000);
  const waterVolL = round2(pairPipeLenM * chosen.volPerM);

  return {
    familyId: family.id,
    familyName: family.shortName,
    brand: family.brand,
    fittingType: family.fittingType,
    materialCode: family.materialCode || '',
    outerMm: chosen.outerMm,
    wallMm: chosen.wallMm,
    innerMm: chosen.innerMm,
    sizeLabel: chosen.label,
    skuCode: chosen.skuCode,
    refUsdM: chosen.refUsdM,
    flowKgh,
    flowLpm,
    velocityMs: chosenHyd.velocityMs,
    rPaPerM: chosenHyd.rPaPerM,
    dpKpa,
    waterVolL,
  };
}

/**
 * ГИДРОСТРЕЛКА, РАСШИРИТЕЛЬНЫЙ БАК ва БОЙЛЕР ГВС (1.0 Excel formulalari 1:1)
 */
export function computeBoilerRoomHydraulics({
  totalHeatKw = 15,
  radLoadKw = 8,
  ufLoadKw = 7,
  boilerDeltaT = 15,
  buildingHeightM = 3.5,
  ufWaterVolL = 0,
  trunkWaterVolL = 0,
  radWaterVolL = 0,
  boilerCylinderL = 150,
  ufPumpHeadM = 3.2,
} = {}) {
  const qTotKw = Math.max(4, Number(totalHeatKw) || 15);
  const dtKot = clamp(Number(boilerDeltaT) || 15, 10, 25);

  // 1) Gidrostrelka (3D-qoida: D_korpus = 18.811 * sqrt(G / 0.1), d_patrubok = 18.811 * sqrt(G / 0.7))
  const flowM3h = round2(qTotKw / (1.163 * dtKot));
  const chamberDiameterMm = Math.max(60, Math.round(18.811 * Math.sqrt(flowM3h / 0.1)));
  const nozzleDiameterMm = Math.max(25, Math.round(18.811 * Math.sqrt(flowM3h / 0.7)));

  // 2) Kengaytirish baki (РАСШИРИТЕЛЬНЫЙ БАК хисоб-китоби.xlsx)
  const boilerHeatExchangerL = Math.max(8, Math.round(qTotKw * 0.55));
  const vSystL = round1(ufWaterVolL + trunkWaterVolL + radWaterVolL + boilerHeatExchangerL);
  const expansionCoeff = 0.0282; // 80°C da suv kengayishi 2.82%
  const vExpL = round2(vSystL * expansionCoeff);
  const vReserveL = round2(Math.max(3, vSystL * 0.005));
  const pStaticBar = round2(Math.max(0.5, buildingHeightM / 10 + 0.2));
  const pPrechargeBar = round2(pStaticBar + 0.2);
  const pMaxBar = 2.7;
  const efficiency = round2(Math.max(0.18, ((pMaxBar + 1) - (pStaticBar + 1)) / (pMaxBar + 1)));
  const vCalcL = round1((vExpL + vReserveL) / efficiency);
  const stdTankSizes = [18, 24, 35, 50, 80, 100];
  const heatingTankL = stdTankSizes.find((s) => s >= vCalcL) || 100;
  const dhwTankL = boilerCylinderL >= 250 ? 24 : boilerCylinderL >= 150 ? 18 : 12;

  // 3) Kosvenniy Boyler ГВС (БОЙЛЕР хисоб-китоби.xlsx)
  const cylL = Number(boilerCylinderL) || 150;
  const coilKw = cylL >= 300 ? 32 : cylL >= 200 ? 24 : 19;
  const effCoilKw = Math.min(Math.max(qTotKw, 24), coilKw);
  const heatUpMin = Math.round(((cylL * 1.163 * (60 - 10)) / (1000 * effCoilKw)) * 60);
  const mixed45L = Math.round(cylL * ((60 - 10) / (45 - 10)));

  return {
    hydroarrow: {
      flowM3h,
      chamberDiameterMm,
      nozzleDiameterMm,
      velocityChamberMs: 0.1,
      velocityNozzleMs: 0.7,
    },
    expansionTank: {
      ufWaterVolL: round1(ufWaterVolL),
      trunkWaterVolL: round1(trunkWaterVolL),
      radWaterVolL: round1(radWaterVolL),
      boilerHeatExchangerL,
      vSystL,
      expansionCoeffPct: 2.82,
      vExpL,
      vReserveL,
      pStaticBar,
      pPrechargeBar,
      pMaxBar,
      efficiency,
      vCalcL,
      heatingTankL,
      dhwTankL,
    },
    dhw: {
      cylinderL: cylL,
      coilKw: round1(effCoilKw),
      heatUpMin,
      mixed45L,
    },
    radLoadKw: round1(radLoadKw),
    ufLoadKw: round1(ufLoadKw),
    ufPumpHeadM: round2(ufPumpHeadM),
  };
}
