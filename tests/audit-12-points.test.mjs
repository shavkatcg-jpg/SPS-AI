import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrototypeProject, buildSpsOffice135528Project } from '../src/ai/scan-and-ai-engine.js';
import { findClimateHouseSku } from '../src/data/climate-house-db.js';
import { exportProjectToIfc2x3, exportFloorToDxf } from '../src/export/bim-exporter.js';
import {
  createBlankSurveyProject,
  createTechnicalRoom540x360Sample,
  approveSurveyByEngineer,
  makeSurveyRoomDxfMm,
} from '../src/survey/field-survey-engine.js';
import {
  computeFullMepSuite,
  buildClimateHouseSmeta,
  exportSmetaToCsv,
  generateGostAlbumSheets,
} from '../src/docs/smeta-and-sheets-engine.js';

const OFFICE_CFG = {
  cityId: 'tashkent',
  wallInsId: 'brick_ins_50',
  glazingId: 'pvc_2cam_low_e',
  roofInsId: 'roof_minwool_150',
  heatingScheme: 'combined',
  radTopology: 'two_pipe_dead_end',
  trunkPipeFamilyId: 'te_sa_press',
  radModelId: 'rt_panel_c22',
  radConnectionId: 'bottom_right_50',
  radFeedMount: 'wall',
  ufStepMm: 150,
  ufScreedType: 'wet',
  ufXpsMm: 50,
  enableVent: true,
  ventDiffuserType: '4apn_ksd',
  coolingSystemMode: 'fancoil_4way',
  enableVk: false,
  enableTm: true,
  heatStairwell: true,
};

test('Audit #1–#7: Unified Model ↔ Calculation ↔ GOST Album ↔ Smeta Parity on Bizning Ofis', () => {
  const project = buildSpsOffice135528Project({ withWalls: true });
  const suite = computeFullMepSuite(project, OFFICE_CFG);
  const smeta = buildClimateHouseSmeta(suite, { usdToUzs: 12850, includeLabor: true, useMarketFallback: true });
  const sheets = generateGostAlbumSheets(project, suite, smeta, {
    cipher: 'SPS-2026-AUDIT',
    projectTitle: project.title,
  });

  const flOv = suite.ov.floors[0];

  // 1) Kollektor tanlovi: 7 kontur === TP-02445 (7 chiqishli kollektor) barcha bo'limlarda bir xil!
  assert.equal(flOv.ufLoops.length, 7, 'Office has 7 warm floor loops');
  assert.equal(flOv.tpCollector.ports, 7, '3D/2D collector model has 7 outlets');
  assert.equal(flOv.tpCollector.skuCode, 'TP-02445', '7-outlet collector uses official TP-02445');
  const chCol = findClimateHouseSku('TP-02445');
  assert.ok(chCol && chCol.name.includes('7 вых'), `TP-02445 is officially 7-way: ${chCol?.name}`);
  assert.ok(!smeta.rows.some((r) => r.skuCode === 'TP-02443'), '5-outlet TP-02443 must NOT appear for 7 loops');
  const smetaCol = smeta.rows.find((r) => r.skuCode === 'TP-02445');
  assert.ok(smetaCol && smetaCol.qty === 1, 'Smeta contains 1 pc of TP-02445');
  const shOv1 = sheets.find((s) => s.id === 'OV-1');
  const shUz1 = sheets.find((s) => s.id === 'UZ-1');
  assert.ok(shOv1.fullPageHtml.includes('TP-02445'), 'GOST ОВ-1 displays TP-02445');
  assert.ok(shUz1.fullPageHtml.includes('TP-02445') && shUz1.fullPageHtml.includes('7 ВЫХ.'), 'GOST УЗ-1 displays 7-way TP-02445');

  // 2) Xonalar bo'yicha isitish balansi: Zinaxona (938 W) Р-3 radiator bilan to'liq yopilgan; o'chirilsa ogohlantirish chiqadi!
  assert.equal(suite.ov.hasHeatingDeficit, false, 'Zero heating deficit when stairwell radiator Р-3 is enabled');
  const stairBal = flOv.roomBalances.find((b) => b.roomName.toLowerCase().includes('zina'));
  assert.ok(stairBal, 'Zinaxona heating balance tracked');
  assert.ok(stairBal.requiredW > 800, `Zinaxona heat loss calculated (${stairBal.requiredW} W)`);
  assert.ok(stairBal.installedW >= stairBal.requiredW, `Zinaxona emitter covers demand (${stairBal.installedW} >= ${stairBal.requiredW} W)`);
  assert.equal(stairBal.deficitW, 0);

  const suiteNoStairRad = computeFullMepSuite(project, { ...OFFICE_CFG, heatStairwell: false });
  assert.equal(suiteNoStairRad.ov.hasHeatingDeficit, true, 'Deficit warning raised when stairwell has no emitter');
  assert.ok(suiteNoStairRad.ov.deficitRooms.some((d) => d.roomName.toLowerCase().includes('zina') && d.deficitW > 800));
  const sheetsDeficit = generateGostAlbumSheets(project, suiteNoStairRad, smeta, {});
  const shArDef = sheetsDeficit.find((s) => s.id === 'AR-TE');
  assert.ok(shArDef.fullPageHtml.includes('Обнаружен дефицит тепловой мощности'), 'GOST АР-ТЭ prints explicit deficit warning');

  // 3) Quvur va fiting mosligi: TE-SA metalloplastik tanlanganda smetada PRO AQUA PE-RT 20×2.8 chiqmasin!
  assert.ok(!smeta.rows.some((r) => r.skuCode === 'TP-02488' || r.name.includes('20×2.8') || r.name.includes('20x2,8')), 'Zero PRO AQUA PE-RT 20×2.8 when TE-SA Press is selected');
  const pipeSkus = smeta.rows.filter((r) => ['TR-03037', 'TR-03038', 'TR-03039', 'TR-03040'].includes(r.skuCode));
  assert.ok(pipeSkus.length >= 2, 'Official TE-SA PE-Xb/Al/PE-Xb pipe SKUs (TR-03037..TR-03040) present in Smeta');
  for (const pr of pipeSkus) {
    assert.equal(pr.brand, 'TE-SA');
  }
  assert.ok(smeta.rows.some((r) => r.skuCode === 'TR-02949' || r.skuCode === 'TR-02927'), 'TE-SA press tees in Smeta');
  assert.ok(smeta.rows.some((r) => r.skuCode === 'TR-02959'), 'TE-SA press 90° elbows in Smeta');

  // Pro Aqua PP-R tanlanganda esa faqat PP-R quvur va fitinglar chiqadi:
  const suitePpr = computeFullMepSuite(project, { ...OFFICE_CFG, trunkPipeFamilyId: 'pro_aqua_ppr' });
  const smetaPpr = buildClimateHouseSmeta(suitePpr, { usdToUzs: 12850, useMarketFallback: true });
  assert.ok(smetaPpr.rows.some((r) => ['TR-02640', 'TR-02641', 'TR-02642'].includes(r.skuCode)), 'Pro Aqua PP-R pipes in Smeta');
  assert.ok(!smetaPpr.rows.some((r) => ['TR-03038', 'TR-03039'].includes(r.skuCode)), 'No TE-SA trunk pipes in PP-R mode');

  // 4) Issiq pol izolyatsiyasi: 30 / 50 / 100 mm tanlovi Hisob, Chizma va Smetada 100% bir xil!
  for (const xpsMm of [30, 50, 100]) {
    const sXps = computeFullMepSuite(project, { ...OFFICE_CFG, ufXpsMm: xpsMm });
    const smXps = buildClimateHouseSmeta(sXps, { usdToUzs: 12850, useMarketFallback: true });
    const shXps = generateGostAlbumSheets(project, sXps, smXps, {});
    assert.equal(sXps.ov.ufXpsMm, xpsMm);
    for (const lp of sXps.ov.floors[0].ufLoops) {
      assert.equal(lp.xpsMm, xpsMm, `Calc table loop ${lp.label} uses ${xpsMm} mm XPS`);
    }
    assert.ok(smXps.rows.some((r) => r.skuCode === `XPS-${xpsMm}` && r.name.includes(`${xpsMm} мм`)), `Smeta uses XPS-${xpsMm}`);
    const od1 = shXps.find((s) => s.id === 'OD-1');
    assert.ok(od1.fullPageHtml.includes(`ЭППС Пеноплэкс Комфорт — ${xpsMm} мм`), `GOST ОД-1 displays ЭППС ${xpsMm} мм`);
  }

  // 5) Nasos tanlovi: Hisob, ОВ-1/ОВ-2, ТМ kotelxona va Smetada bir xil model va SKU!
  const ufPumpSku = suite.ov.mixingUnit.pumpSku;
  const radPumpSku = suite.ov.radPumpSelection.pumpSku;
  const tmNk1 = suite.tm.pumpCircuits.find((c) => c.code === 'НК-1');
  const tmNk2 = suite.tm.pumpCircuits.find((c) => c.code === 'НК-2');
  assert.equal(tmNk2.pumpSku, ufPumpSku, 'TM НК-2 pump matches OV mixing unit pump');
  assert.equal(tmNk1.pumpSku, radPumpSku, 'TM НК-1 pump matches OV radiator circuit pump');
  assert.ok(shOv1.fullPageHtml.includes(ufPumpSku), 'GOST ОВ-1 shows identical UF pump SKU');
  const shTm1 = sheets.find((s) => s.id === 'TM-1');
  assert.ok(shTm1.fullPageHtml.includes(ufPumpSku) && shTm1.fullPageHtml.includes(radPumpSku), 'GOST ТМ-1 shows identical pump SKUs');
  const expectedPumpQty = ufPumpSku === radPumpSku ? 2 : 1;
  const smetaUfPump = smeta.rows.find((r) => r.skuCode === ufPumpSku);
  assert.ok(smetaUfPump && smetaUfPump.qty === expectedPumpQty, `Smeta pump ${ufPumpSku} qty matches circuits (${expectedPumpQty})`);

  // 6) Ventilyatsiya balansi: Chiqish havosi nol emas va Teplopoterya === ОВ === ГОСТ ОВ-2!
  assert.ok(suite.heat.totalSupplyAirM3h > 400, 'Supply air calculated');
  assert.ok(suite.heat.totalExhaustAirM3h > 400, 'Exhaust air is non-zero in office mode');
  assert.equal(suite.ov.totalVentSupplyM3h, suite.heat.totalSupplyAirM3h, 'OV ∑П1 equals Heat totalSupplyAirM3h');
  assert.equal(suite.ov.totalVentExhaustM3h, suite.heat.totalExhaustAirM3h, 'OV ∑В1 equals Heat totalExhaustAirM3h');
  const sumTermP1 = flOv.ventTerminals.filter((t) => t.sys === 'P1').reduce((a, t) => a + t.flowM3h, 0);
  const sumTermV1 = flOv.ventTerminals.filter((t) => t.sys === 'V1').reduce((a, t) => a + t.flowM3h, 0);
  assert.equal(sumTermP1, suite.ov.totalVentSupplyM3h, 'Terminal P1 sum equals totalVentSupplyM3h');
  assert.equal(sumTermV1, suite.ov.totalVentExhaustM3h, 'Terminal V1 sum equals totalVentExhaustM3h');

  // 7) Smeta va ГОСТ СО-1 komplektatsiyasi: ZONT ZE-44 (EL-00013) va barcha model jihozlari tushib qolmagan!
  const ze44 = smeta.rows.find((r) => r.skuCode === 'EL-00013');
  assert.ok(ze44 && ze44.qty === 1 && ze44.unitUsd === 200, 'ZONT ZE-44 (EL-00013, $200) included in Office Smeta');
  assert.ok(smeta.rows.some((r) => r.skuCode === 'KT-00704'), 'Coaxial chimney KT-00704 included in Smeta');
  assert.ok(smeta.rows.some((r) => r.skuCode === 'TR-02987'), 'Boiler safety group TR-02987 included in Smeta');
  assert.ok(smeta.rows.some((r) => r.skuCode === 'MT-01587'), 'Expansion tank cap valve MT-01587 included in Smeta');
  assert.ok(smeta.rows.some((r) => r.skuCode === 'GALV-RED-160-125'), 'Galvent Ø160/125 duct reducers included in Smeta');

  const shSo1 = sheets.find((s) => s.id === 'SO-1');
  assert.equal(sheets.length, 9, 'GOST album preserves 9 standard A3 sheets');
  for (const row of smeta.rows) {
    assert.ok(shSo1.fullPageHtml.includes(row.skuCode), `GOST СО-1 includes SKU ${row.skuCode} (zero rows truncated)`);
  }
});

test('Audit #10 & #11: Target-Program Structural Validation of IFC2X3, AutoCAD DXF, Excel CSV & Survey Separation', () => {
  const project = buildSpsOffice135528Project({ withWalls: true });
  const suite = computeFullMepSuite(project, OFFICE_CFG);
  const smeta = buildClimateHouseSmeta(suite, { usdToUzs: 12850, includeLabor: true, useMarketFallback: true });

  // A) IFC2X3 STEP parser check (Revit 2024/2026 target format):
  const ifcText = exportProjectToIfc2x3(project, suite);
  assert.ok(ifcText.startsWith('ISO-10303-21;'), 'Valid ISO-10303-21 STEP header');
  assert.ok(ifcText.includes("FILE_SCHEMA(('IFC2X3'));"), 'IFC2X3 schema declared');
  assert.ok(ifcText.includes("'2.8.0'"), 'IFC application version unified to 2.8.0');
  assert.ok(ifcText.trim().endsWith('END-ISO-10303-21;'), 'Valid ISO-10303-21 footer');

  const definedIds = new Set();
  const referencedIds = [];
  for (const line of ifcText.split(/\r?\n/)) {
    const m = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);$/);
    if (m) {
      definedIds.add(`#${m[1]}`);
      // Strip single-quoted string literals before scanning #id references
      const argsNoStrings = m[3].replace(/'[^']*'/g, '');
      const refs = argsNoStrings.match(/#\d+/g) || [];
      referencedIds.push(...refs);
    }
  }
  assert.ok(definedIds.size > 120, `Substantial BIM model exported (${definedIds.size} STEP entities)`);
  for (const ref of referencedIds) {
    assert.ok(definedIds.has(ref), `Every STEP entity reference resolves cleanly (${ref})`);
  }
  assert.ok(ifcText.includes('IFCWALLSTANDARDCASE('), 'Walls exported to IFC');
  assert.ok(ifcText.includes('IFCSPACE('), 'Rooms (IfcSpace) exported to IFC');
  assert.ok(ifcText.includes('IFCFLOWTERMINAL('), 'MEP terminals (radiators/diffusers/fancoils) exported to IFC');
  assert.ok(ifcText.includes('IFCENERGYCONVERSIONDEVICE('), 'TM boiler equipment exported to IFC');

  // B) AutoCAD DXF parser check ($INSUNITS = 4 mm, balanced SECTION/ENDSEC, EOF):
  const dxfText = exportFloorToDxf(project.floors[0], suite);
  const dxfLines = dxfText.trim().split(/\r?\n/);
  assert.equal(dxfLines.length % 2, 0, 'DXF has valid group-code/value line pairs');
  assert.equal(dxfLines[dxfLines.length - 2].trim(), '0');
  assert.equal(dxfLines[dxfLines.length - 1].trim(), 'EOF', 'DXF terminates with 0 / EOF');
  const secCount = dxfLines.filter((l, idx) => idx % 2 === 1 && l.trim() === 'SECTION').length;
  const endSecCount = dxfLines.filter((l, idx) => idx % 2 === 1 && l.trim() === 'ENDSEC').length;
  assert.ok(secCount >= 2 && secCount === endSecCount, `Balanced DXF sections (${secCount})`);
  assert.ok(dxfText.includes('$INSUNITS\n70\n4') || dxfText.includes('$INSUNITS\r\n70\r\n4'), 'DXF units set to millimeters ($INSUNITS = 4)');
  assert.ok(dxfText.includes('OV-TP-SUPPLY') && dxfText.includes('OV-RAD-T1') && dxfText.includes('OV-VENT-P1'), 'Architecture + MEP CAD layers present');

  // C) Excel Smeta CSV check:
  const csvText = exportSmetaToCsv(smeta, project.title);
  assert.ok(csvText.startsWith('\uFEFF'), 'CSV starts with UTF-8 BOM for Excel Cyrillic compatibility');
  assert.ok(csvText.includes('TP-02445') && csvText.includes('EL-00013'), 'Key SKUs exported to CSV');

  // D) Dala o'lchovi (Zamer) namunasi va haqiqiy o'lchov ajratilganligi:
  const blankSurvey = createBlankSurveyProject('Haqiqiy Obyekt');
  assert.equal(blankSurvey.isSampleDemo, false, 'Blank survey is marked as real project');
  assert.equal(blankSurvey.rooms[0].verified, false, 'Blank survey room starts unverified');
  assert.equal(blankSurvey.engineerSignOff.approved, false, 'Blank survey starts unapproved');
  assert.equal(blankSurvey.rooms[0].points.length, 0, 'Blank survey has zero pre-filled sample points');

  const demoSurvey = createTechnicalRoom540x360Sample();
  assert.equal(demoSurvey.isSampleDemo, true, '5.40x3.60 sample is explicitly flagged isSampleDemo: true');
  assert.equal(demoSurvey.engineerSignOff.approved, false, 'Sample demo is never pre-approved by engineer');
  const demoDxf = makeSurveyRoomDxfMm(demoSurvey.rooms[0]);
  assert.ok(demoDxf.includes('5400') && demoDxf.trim().endsWith('EOF'), 'Survey room DXF exports valid 5400x3600 mm geometry');

  assert.throws(() => approveSurveyByEngineer(blankSurvey, 'Muhandis'), /tasdiqlanmagan|nazorat/i, 'Unverified blank survey cannot be prematurely signed off');
});
