import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPrototypeProject,
  generateProjectFromAiPrompt,
  parseAny3dScanBufferToFloor,
  rebuildWallsFromScanCloud,
} from '../src/ai/scan-and-ai-engine.js';
import { exportFloorToDxf } from '../src/export/bim-exporter.js';
import {
  computeUnderfloorFlux,
  computeRadiatorOrConvectorUnit,
  computeBoilerRoomHydraulics,
} from '../src/mep/sps-heating-calc.js';
import {
  computeFullMepSuite,
  buildClimateHouseSmeta,
  exportSmetaToCsv,
  generateGostAlbumSheets,
  buildPrintableGostAlbumDocumentHtml,
} from '../src/docs/smeta-and-sheets-engine.js';

test('Full Pipeline E2E: Teplopoterya (17 граф Galf) -> ОВ (1.0 Пирог + Kv + β1·β2·β3) -> ВК -> ТМ (1.0 ГС/РБ/БКН) -> Smeta -> 9-листный ГОСТ А3 Альбом', () => {
  const project = buildPrototypeProject('lidar-iphone-138');
  const suite = computeFullMepSuite(project, {
    cityId: 'tashkent',
    wallInsId: 'brick_ins_50',
    glazingId: 'pvc_2cam_low_e',
    roofInsId: 'roof_minwool_150',
    heatingScheme: 'combined',
    ufStepMm: 150,
    ufScreedType: 'wet',
    ufXpsMm: 50,
    radModelId: 'rifar_tubog_2',
    radConnectionId: 'bottom_center_50',
    radFeedMount: 'wall',
    enableVent: true,
    enableGvsRecirc: true,
  });

  // 1. Teplopoterya + 17-ustunli GalfDesign Ograjeniya qatorlari
  assert.equal(suite.heat.city.tWinterC, -16);
  assert.ok(suite.heat.totalHeatedAreaM2 > 80);
  assert.ok(suite.heat.totalHeatLossKw > 4 && suite.heat.totalHeatLossKw < 35);
  const firstRoomHeat = suite.heat.floors[0].rooms[0];
  assert.ok(firstRoomHeat.roomCode.startsWith('1.'));
  assert.ok(Array.isArray(firstRoomHeat.envelopeRows) && firstRoomHeat.envelopeRows.length >= 2, '17-column envelope rows generated');
  assert.ok(firstRoomHeat.envelopeRows.some((r) => r.rVal > 0 && r.qTotalW > 0));

  const suiteNukus = computeFullMepSuite(project, { cityId: 'nukus' });
  assert.ok(suiteNukus.heat.totalHeatLossW > suite.heat.totalHeatLossW);

  // 2. ОВ: 1.0 Тёплый пол пирог + Kv балансировка + Узел подмеса + Rifar Tubog 2-рядный LOD 400!
  assert.ok(suite.ov.totalUfLoops >= 4);
  let hasIndexLoop = false;
  for (const fl of suite.ov.floors) {
    for (const lp of fl.ufLoops) {
      assert.ok(lp.lengthM <= 95, `Warm floor loop ${lp.label} <= 95 m`);
      assert.ok(lp.surfaceTempC > 22 && lp.surfaceTempC <= 31.5, `Valid floor surface temperature: ${lp.surfaceTempC}°C`);
      assert.ok(lp.kvSetting > 0, `Collector Kv setting calculated: ${lp.kvSetting}`);
      assert.ok(lp.dpMWc > 0, `Pressure drop in m.w.c calculated: ${lp.dpMWc}`);
      // Hech qanday uzun diagonal kesishuv chizig'i bo'lmasligi shart (faqat ortogonal to'g'ri uchastkalar yoki qisqa silliq otvod yoylari)!
      for (const poly of [lp.supplyPts, lp.returnPts, lp.transitSupplyPts, lp.transitReturnPts]) {
        for (let i = 1; i < poly.length; i++) {
          const dx = Math.abs(poly[i][0] - poly[i - 1][0]);
          const dy = Math.abs(poly[i][1] - poly[i - 1][1]);
          const segLen = Math.hypot(dx, dy);
          if (segLen > 0.12) {
            assert.ok(dx < 0.002 || dy < 0.002, `Long segment in ${lp.label} must be 100% orthogonal, got dx=${dx.toFixed(3)}, dy=${dy.toFixed(3)}`);
          }
        }
      }
      if (lp.isIndexLoop) hasIndexLoop = true;
    }
  }
  assert.ok(hasIndexLoop, 'Index (critical) warm-floor loop identified');
  assert.ok(suite.ov.mixingUnit.kvsRecommended >= 1.6);
  assert.ok(suite.ov.mixingUnit.pumpHeadM > 1.0);
  assert.ok(suite.ov.consumables.insulationRed18M > 5 && suite.ov.consumables.insulationBlue18M > 5);

  const tubularRad = suite.ov.floors[0].radiators.find((r) => r.kind === 'radiator');
  assert.equal(tubularRad.radType, 'tubular');
  assert.ok(tubularRad.sections >= 8);
  assert.equal(tubularRad.beta1, 0.97);

  // 3. ВК: В1 ХВС, Т3/Т4 ГВС рециркуляция va К1 Канализация (Ø110 i=0.02, Ø50 i=0.03)
  assert.ok(suite.vk.fixturesCount >= 4);
  for (const vp of suite.vk.floors[0].pipes) {
    if (vp.slope > 0) {
      assert.ok(vp.invertStartM > vp.invertEndM);
    }
  }

  // 4. ТМ: Котельная + 1.0 ГС / РБ / БКН гидравлик ҳисоби
  assert.ok(suite.tm.hydraulics10.hydroarrow.chamberDiameterMm >= 60);
  assert.ok(suite.tm.hydraulics10.expansionTank.vCalcL > 4);
  assert.ok(suite.tm.hydraulics10.dhw.heatUpMin > 10 && suite.tm.hydraulics10.dhw.heatUpMin < 65);

  // 5. Smeta (Climate House + GalfDesign Energoflex изоляция и крепёж)
  const smeta = buildClimateHouseSmeta(suite, { usdToUzs: 12850, includeLabor: true, useMarketFallback: true });
  assert.ok(smeta.rows.length >= 22);
  assert.ok(smeta.rows.some((r) => r.skuCode === 'TP-02490' && r.priceKind === 'official_ch'));
  assert.ok(smeta.rows.some((r) => r.skuCode === 'INS-RED-18'));
  assert.ok(smeta.rows.some((r) => r.skuCode === 'INS-BLUE-18'));
  assert.ok(smeta.rows.some((r) => r.skuCode === 'TP-DAMPER-150'));
  const smetaCsv = exportSmetaToCsv(smeta, project.title);
  assert.equal(smetaCsv.charCodeAt(0), 0xfeff);
  assert.match(smetaCsv, /Energoflex/);

  // 6. ГОСТ Р 21.1101-2013 А3 Альбом рабочих чертежей (9 листов: ОД-1, АР-ТЭ, ТЭ-1, ОВ-1, ОВ-2, ВК-1, УЗ-1, ТМ-1, СО-1)
  const sheets = generateGostAlbumSheets(project, suite, smeta, {
    cipher: 'SPS-2026-ОВВК',
    projectTitle: 'Коттедж 138 м²',
    engineer: 'SPS AI ГИП',
  });
  assert.equal(sheets.length, 9);
  assert.deepEqual(sheets.map((s) => s.code), ['ОД-1', 'АР-ТЭ', 'ТЭ-1', 'ОВ-1', 'ОВ-2', 'ВК-1', 'УЗ-1', 'ТМ-1', 'СО-1']);
  assert.match(sheets[0].fullPageHtml, /СОСТАВ ПИРОГА ТЁПЛОГО ПОЛА/);
  assert.match(sheets[6].fullPageHtml, /УЗЕЛ 1\. ОБВЯЗКА КОЛЛЕКТОРА ТЁПЛОГО ПОЛА/);

  const printableHtml = buildPrintableGostAlbumDocumentHtml(sheets, 'Коттедж 138 м²');
  assert.match(printableHtml, /size: A3 landscape/);

  const fullDxf = exportFloorToDxf(project.floors[0], suite);
  assert.match(fullDxf, /OV-TP-SUPPLY/);

  // 7. 2-qavatli AI Kottej + Bimetall sektsiyali radiatorlar tekshiruvi
  const twoStory = generateProjectFromAiPrompt('2 qavatli kottej 13x10.5 m: zal, oshxona, 4 yotoqxona, 2 sanuzel, qozonxona');
  const suite2 = computeFullMepSuite(twoStory, { cityId: 'samarkand', radModelId: 'rt_biliner_500', radConnectionId: 'diag_lr' });
  assert.equal(suite2.ov.floors.length, 2);
  assert.equal(suite2.vk.floors.length, 2);
});

test('1.0 Exact Excel Formulas Unit Check: Pirog Flux, Sectional Beta1/2/3, Trench Convector EC & Boiler Hydraulics', () => {
  const fluxWet = computeUnderfloorFlux({ coverType: 'tile', screedType: 'wet', stepM: 0.15, supplyTemp: 45, returnTemp: 35, roomTemp: 22, xpsMm: 50 });
  const fluxSemi = computeUnderfloorFlux({ coverType: 'laminate', screedType: 'semidry', stepM: 0.15, supplyTemp: 45, returnTemp: 35, roomTemp: 22, xpsMm: 50 });
  assert.ok(fluxWet.qUpWm2 > fluxSemi.qUpWm2, 'Wet screed + tile yields higher upward heat flux than semidry + laminate');
  assert.ok(fluxWet.surfaceTempOk);

  const biliner = computeRadiatorOrConvectorUnit({
    kind: 'radiator',
    needW: 1350,
    supplyTemp: 70,
    returnTemp: 55,
    roomTemp: 22,
    modelId: 'rt_biliner_500',
    connectionId: 'diag_lr',
    enclosureId: 'sill_shelf',
  });
  assert.equal(biliner.radType, 'sectional');
  assert.ok(biliner.sections >= 10);
  assert.equal(biliner.beta1, 1.0);
  assert.equal(biliner.beta2, 1.03);

  const conv = computeRadiatorOrConvectorUnit({
    kind: 'convector',
    needW: 1100,
    supplyTemp: 70,
    returnTemp: 55,
    roomTemp: 22,
    convectorModelId: 'rt_atrium_turbo',
    convectorSpeedPct: 60,
    winWidthM: 2.2,
  });
  assert.equal(conv.kind, 'convector');
  assert.ok(conv.panelLengthMm >= 1200);
  assert.ok(conv.powerW >= 600);

  const bHyd = computeBoilerRoomHydraulics({ totalHeatKw: 28, ufWaterVolL: 65, radWaterVolL: 48, trunkWaterVolL: 22, boilerCylinderL: 200 });
  assert.ok(bHyd.hydroarrow.chamberDiameterMm >= 70);
  assert.equal(bHyd.expansionTank.dhwTankL, 18);
});

test('v2.3.0 LOD 400 Konveka FC Floor Convector, TE-SA Press / Pro Aqua PP-R Fittings & 3 Topologies (Radial, Dead-End, Tichelmann)', () => {
  const project = buildPrototypeProject('lidar-iphone-138');

  // 1) Konveka FC 15/15 Напольный конвектор на ножках pasport va geometriya tekshiruvi
  const fcUnit = computeRadiatorOrConvectorUnit({
    kind: 'floor_convector',
    needW: 1150,
    supplyTemp: 70,
    returnTemp: 55,
    roomTemp: 22,
    feedMount: 'floor',
    winWidthM: 2.4,
  });
  assert.equal(fcUnit.kind, 'floor_convector');
  assert.equal(fcUnit.brand, 'KONVEKA');
  assert.equal(fcUnit.zBottomM, 0.09);
  assert.equal(fcUnit.heightMm, 150);
  assert.equal(fcUnit.hasMultiflex, true);

  // 2) Коллекторно-лучевая ('radial'): ШРВ-Р mavjud, styajkada 0 ta troynik!
  const radialSuite = computeFullMepSuite(project, {
    heatingScheme: 'combined',
    radTopology: 'radial',
    trunkPipeFamilyId: 'te_sa_press',
    lowWindowEmitterMode: 'floor_convector',
  });
  const flRad = radialSuite.ov.floors[0];
  assert.ok(flRad.radCollector, 'Radial mode includes ШРВ-Р collector');
  assert.equal(radialSuite.ov.fittingSummary.teesReducing, 0, 'Zero buried tees in radial screed');
  assert.equal(radialSuite.ov.fittingSummary.teesEqual, 0, 'Zero buried tees in radial screed');
  assert.ok(radialSuite.ov.fittingSummary.adaptersEk >= flRad.radiators.length * 2, 'Eurocone adapters counted at ШРВ-Р');
  assert.ok(flRad.radiators.some((r) => r.kind === 'floor_convector' && r.label.startsWith('НК-')), 'Konveka FC НК-* placed at panoramic window');

  // 3) Двухтрубная тупиковая ('two_pipe_dead_end') + TE-SA Press: 26 -> 20 -> 16 kaskad, troyniklar va 3D obvodlar!
  const deadEndSuite = computeFullMepSuite(project, {
    heatingScheme: 'radiators_only',
    radTopology: 'two_pipe_dead_end',
    trunkPipeFamilyId: 'te_sa_press',
    radModelId: 'rt_panel_c22',
    radConnectionId: 'bottom_right_50',
    radFeedMount: 'wall',
  });
  const flDe = deadEndSuite.ov.floors[0];
  assert.equal(flDe.radCollector, null, '2-pipe mode uses boiler riser instead of ШРВ-Р');
  assert.ok(flDe.riserHub, 'Boiler/riser hub present in 2-pipe mode');
  const sizesUsed = deadEndSuite.ov.pipeTotalsBySize.map((p) => p.outerMm);
  assert.ok(sizesUsed.includes(16), 'TE-SA Ø16×2.0 branches/tails used');
  assert.ok(sizesUsed.some((d) => d >= 20), 'TE-SA Ø20/Ø26 trunks sized by Altschul');
  assert.ok((deadEndSuite.ov.fittingSummary.teesReducing + deadEndSuite.ov.fittingSummary.teesEqual) >= 4, 'TE-SA press tees placed on trunks');
  assert.ok(deadEndSuite.ov.fittingSummary.obvods >= 2, 'Clash-free 3D Obvod bridges placed where branches cross parallel trunk');

  const smetaDe = buildClimateHouseSmeta(deadEndSuite, { usdToUzs: 12850, useMarketFallback: true });
  assert.ok(smetaDe.rows.some((r) => r.skuCode === 'TR-02959'), 'TE-SA 812 press elbows (TR-02959) itemized in Smeta');
  assert.ok(smetaDe.rows.some((r) => r.skuCode === 'TESA-OBVOD-16'), 'TE-SA Obvod bridges itemized in Smeta');

  // 4) Двухтрубная попутная — Петля Тихельмана ('two_pipe_tichelmann') + Pro Aqua PP-R RUBIS
  const tichSuite = computeFullMepSuite(project, {
    heatingScheme: 'radiators_only',
    radTopology: 'two_pipe_tichelmann',
    trunkPipeFamilyId: 'pro_aqua_ppr',
    radModelId: 'rt_biliner_500',
    radConnectionId: 'diag_lr',
    radFeedMount: 'floor',
  });
  const pprSizes = tichSuite.ov.pipeTotalsBySize.map((p) => p.outerMm);
  assert.ok(pprSizes.includes(20), 'Pro Aqua PP-R Ø20 branches used');
  assert.ok(pprSizes.some((d) => d >= 25), 'Pro Aqua PP-R Ø25/Ø32 ring sized');
  const smetaTich = buildClimateHouseSmeta(tichSuite, { usdToUzs: 12850, useMarketFallback: true });
  assert.ok(smetaTich.rows.some((r) => r.skuCode === 'PPR-ELB-90'), 'Pro Aqua PP-R 90° elbows itemized in Smeta');
});

test('v2.4.1 Step-by-Step Clean Project Mode: Zero premature MEP systems until user enables each stage', () => {
  const cleanCfg = {
    heatingScheme: 'none',
    enableVent: false,
    enableVk: false,
    enableTm: false,
  };

  // 1) Toza Yangi Loyiha (0 m²): 0 devor, 0 xona, 0 ОВ/ВК/ТМ jihoz va $0.00 Smeta!
  const blankProj = buildPrototypeProject('blank-clean');
  const blankSuite = computeFullMepSuite(blankProj, cleanCfg);
  assert.equal(blankSuite.ov.totalUfLoops, 0);
  assert.equal(blankSuite.ov.totalRadiators, 0);
  assert.equal(blankSuite.vk.fixturesCount, 0);
  assert.equal(blankSuite.vk.floors[0].pipes.length, 0);
  assert.equal(blankSuite.tm.equipment3d.length, 0);
  const blankSmeta = buildClimateHouseSmeta(blankSuite, { usdToUzs: 12850, includeLabor: true });
  assert.equal(blankSmeta.rows.length, 0, 'Zero unrequested materials on blank project');
  assert.equal(blankSmeta.grandTotalUsd, 0, 'Zero unrequested cost on blank project');

  // 2) Skaner yoki xonali yangi loyiha ochildi, lekin hali ОВ/ВК/ТМ yoqilmadi -> xona va Teplopoterya bor, ichida 0 ta sistema!
  const realLasPath = process.env.SPS_TEST_LAS_PATH || '';
  let userProj;
  if (realLasPath && fs.existsSync(realLasPath)) {
    const lasBuf = fs.readFileSync(realLasPath);
    const scanOnlyFl = parseAny3dScanBufferToFloor(lasBuf, 'Scaniverse 2026-11-17 135528.las', { autoBuildWalls: false });
    assert.equal(scanOnlyFl.walls.length, 0, 'Scan loads calm with 0 auto-walls when autoBuildWalls=false');
    rebuildWallsFromScanCloud(scanOnlyFl, 1.20);
    assert.ok(scanOnlyFl.rooms.length >= 1, '1-click Avto-Devor reconstructs scanned room');
    userProj = { title: 'Scaniverse 2026-11-17 135528', floors: [scanOnlyFl] };
  } else {
    userProj = buildPrototypeProject('lidar-iphone-138');
  }

  const stage1Suite = computeFullMepSuite(userProj, cleanCfg);
  assert.ok(stage1Suite.heat.totalHeatLossW > 0, 'Stage 02 Teplopoterya calculates heat loss cleanly');
  assert.equal(stage1Suite.ov.totalUfLoops, 0, 'Zero warm floor coils before user enables TP');
  assert.equal(stage1Suite.ov.totalRadiators, 0, 'Zero radiators before user enables Rad');
  assert.equal(stage1Suite.ov.floors[0].ahuUnit, null, 'Zero ceiling ПВУ CS-400 before user enables Vent');
  assert.equal(stage1Suite.ov.floors[0].acUnits.length, 0, 'Zero split AC before user enables Vent');
  assert.equal(stage1Suite.vk.fixturesCount, 0, 'Zero plumbing before user enables VK');
  assert.equal(stage1Suite.tm.equipment3d.length, 0, 'Zero boiler equipment before user enables TM');

  const stage1Sheets = generateGostAlbumSheets(userProj, stage1Suite, buildClimateHouseSmeta(stage1Suite));
  assert.equal(stage1Sheets.length, 9, 'GOST A3 sheets render cleanly without errors even when all MEP systems are off');

  // 3) Foydalanuvchi 03·ОВ da "Faqat Tyopliy pol" ni yoqsa -> faqat ТП chiqadi, ВК va ТМ hali ham bo'sh!
  const tpOnlySuite = computeFullMepSuite(userProj, { ...cleanCfg, heatingScheme: 'uf_only' });
  assert.ok(tpOnlySuite.ov.totalUfLoops >= 1, 'Warm floor loops generated when user selects uf_only');
  assert.equal(tpOnlySuite.ov.totalRadiators, 0, 'Radiators stay 0 when uf_only selected');
  assert.equal(tpOnlySuite.vk.fixturesCount, 0, 'VK stays 0 until Stage 04');
  assert.equal(tpOnlySuite.tm.equipment3d.length, 0, 'TM stays 0 until Stage 05');

  // 4) Foydalanuvchi 05·ТМ da Kotelxonani yoqsa -> ТМ uskunalari yig'iladi!
  const withTmSuite = computeFullMepSuite(userProj, { ...cleanCfg, heatingScheme: 'uf_only', enableTm: true });
  assert.ok(withTmSuite.tm.equipment3d.length >= 5, 'Boiler room equipment appears once user enables TM');
});
