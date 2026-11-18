import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePointCloudScan,
  distance3d,
  isAmbiguous2dProjectionPick,
  evaluateLaserControlCheck,
  validateAndNormalizeMepPoint,
  updateSurveyRoomDimensions,
  normalizeSurveyProject,
  makeSurveyRoomDxfMm,
  makeSurveyCsv,
  buildAiMissingDataAndQuestions,
  approveSurveyByEngineer,
  createTechnicalRoom540x360Sample,
  convertSurveyRoomToPlanarFloor,
} from '../src/survey/field-survey-engine.js';
import {
  CLIMATE_HOUSE_CATALOG,
  findClimateHouseSku,
  getClimateHouseStats,
  searchClimateHouseCatalog,
  inferMepPointPresetFromSku,
} from '../src/data/climate-house-db.js';

function parseDxfEntities(dxfText) {
  const lines = dxfText.trim().split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    pairs.push([Number(lines[i]), lines[i + 1]]);
  }
  const entities = [];
  let cur = null;
  for (const [code, val] of pairs) {
    if (code === 0) {
      if (val === 'LINE' || val === 'TEXT') {
        cur = { entityType: val };
        entities.push(cur);
      } else {
        cur = null;
      }
    } else if (cur) {
      cur[code] = val;
    }
  }
  return { pairs, entities };
}

test('E2E Task 2: XYZ, PTS, ASCII PLY & Binary PLY parsing + XY ambiguous pick guard + Anti-guessing MEP rules', () => {
  // 1. XYZ (m va mm bir xil 5400 mm nazorat masofasi beradi)
  const xyzM = parsePointCloudScan('0 0 0\n5.40 0 0\n0 3.60 2.80', 'xyz', 'm', 'room-m.xyz');
  const ptsMm = parsePointCloudScan('3\n0,0,0\n5400,0,0\n0,3600,2800', 'pts', 'mm', 'room-mm.pts');
  assert.deepEqual(xyzM.points, ptsMm.points);
  assert.equal(Math.round(distance3d(xyzM.points[0], xyzM.points[1]) * 1000), 5400);

  // 2. ASCII PLY va Gaussian Splat rad etilishi
  const asciiPly = [
    'ply',
    'format ascii 1.0',
    'element vertex 2',
    'property float x',
    'property float y',
    'property float z',
    'end_header',
    '0 0 0',
    '5.392 0 0',
  ].join('\n');
  const plyRes = parsePointCloudScan(asciiPly, 'ply', 'm', 'iphone-ascii.ply');
  assert.equal(plyRes.count, 2);
  assert.throws(
    () => parsePointCloudScan(asciiPly.replace('property float z', 'property float z\nproperty float f_dc_0'), 'ply', 'm'),
    /Gaussian Splat/,
  );

  // 3. Binary Little-Endian PLY (Scaniverse / mobil eksport standarti)
  const binHeader = 'ply\nformat binary_little_endian 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nend_header\n';
  const headBytes = new TextEncoder().encode(binHeader);
  const buf = new ArrayBuffer(headBytes.byteLength + 2 * 12);
  new Uint8Array(buf).set(headBytes, 0);
  const dv = new DataView(buf, headBytes.byteLength);
  dv.setFloat32(0, 0, true); dv.setFloat32(4, 0, true); dv.setFloat32(8, 0, true);
  dv.setFloat32(12, 5.4, true); dv.setFloat32(16, 0, true); dv.setFloat32(20, 0, true);
  const binRes = parsePointCloudScan(buf, 'ply', 'm', 'scaniverse-bin.ply');
  assert.equal(binRes.count, 2);
  assert.equal(Math.round(distance3d(binRes.points[0], binRes.points[1]) * 1000), 5400);

  // 4. XY tekisligida ustma-ust nuqtani rad etish (XZ/YZ talab etiladi)
  const stackedPts = [[0, 0, 0], [0, 0, 2.8], [5.4, 0, 0]];
  assert.equal(isAmbiguous2dProjectionPick(stackedPts[0], stackedPts, 'xy'), true);
  assert.equal(isAmbiguous2dProjectionPick(stackedPts[0], stackedPts, 'xz'), false);

  // 5. QAT'IY TAQIQ: Telefon skanidan quvur diametri, kanalizatsiya qiyaligi yoki yashirin quvurni tasdiqlash BLOKLANADI!
  assert.throws(
    () => validateAndNormalizeMepPoint({
      name: 'Quvur taxmin',
      type: 'Suv',
      x: 1.0, y: 1.0, z: 0.5,
      source: 'scan_only',
      diameterMm: 32,
      verified: true,
    }),
    /diametrini/,
  );
  assert.throws(
    () => validateAndNormalizeMepPoint({
      name: 'Kanalizatsiya taxmin',
      type: 'Kanalizatsiya',
      x: 1.5, y: 1.0, z: 0.1,
      source: 'scan_only',
      slopePct: 2.0,
      invertConfirmed: true,
      verified: true,
    }),
    /qiyaligi/,
  );
  assert.throws(
    () => validateAndNormalizeMepPoint({
      name: 'Yashirin truba',
      type: 'Isitish',
      x: 2.0, y: 0.2, z: 0.3,
      source: 'scan_only',
      visibility: 'concealed',
      verified: true,
    }),
    /Yashirin/,
  );
});

test('E2E Task 3: Full 5.40 × 3.60 × 2.80 m Technical Room path (New Project -> Scan & Laser Check -> JSON Save/Reopen -> CSV & 5400mm DXF -> AI Questions -> Engineer Approval)', () => {
  // 1. Yangi loyiha + 5,40 × 3,60 × 2,80 m texnik xona + Suv, Kanalizatsiya, Vent nuqtalari
  const initial = createTechnicalRoom540x360Sample();
  assert.equal(initial.rooms.length, 1);
  const rm0 = initial.rooms[0];
  assert.equal(rm0.length, 5.40);
  assert.equal(rm0.width, 3.60);
  assert.equal(rm0.height, 2.80);

  // 2. Skan va lazer nazorati: ruxsat ichida (9 mm <= 20 mm) vs ruxsatdan oshgan (85 mm > 20 mm)
  assert.equal(rm0.checks[0].deltaMm, 9);
  assert.equal(rm0.checks[0].pass, true);
  const outOfTol = evaluateLaserControlCheck({ name: 'Buzilgan burchak', scanM: 3.515, laserM: 3.600, toleranceMm: 20 });
  assert.equal(outOfTol.deltaMm, 85);
  assert.equal(outOfTol.pass, false);
  assert.equal(outOfTol.flagStatus, 'CHEGARADAN_OSHDI_QAYTA_OLCHANG');

  // Xona balandligini 2.80 -> 2.82 m yangilash ichkaridagi tasdiqlangan MEP nuqtalarni o'chirib yubormaydi!
  const heightAdjusted = updateSurveyRoomDimensions(rm0, { height: 2.82 });
  assert.equal(heightAdjusted.points.filter((p) => p.verified).length, 3);

  // 3. JSON saqlash va qayta ochish (100% lossless round-trip)
  const savedJson = JSON.stringify(initial, null, 2);
  const reopened = normalizeSurveyProject(JSON.parse(savedJson));
  assert.deepEqual(reopened, initial);

  // 4. AI yetishmayotgan ma'lumotlar va dala savollari ro'yxatini tuzadi (muhandis tasdig'idan oldin)
  const aiReportBefore = buildAiMissingDataAndQuestions(reopened);
  assert.ok(aiReportBefore.missingItems.some((m) => m.includes('Taxminiy eski quvur izi')), 'Flags unverified concealed pipe');
  assert.ok(aiReportBefore.missingItems.some((m) => m.includes('Engineer Sign-off')), 'Flags pending engineer sign-off');
  assert.ok(aiReportBefore.fieldQuestions.some((q) => q.includes('invert') && q.includes('qiyaligi')), 'Asks sewer invert & slope question');

  // 5. Muhandis o'lchov va MEP qarorini rasman tasdiqlaydi
  const approvedProj = approveSurveyByEngineer(
    reopened,
    'Muhandis (SPS AI · Climate House)',
    'Lazer o‘lchovlari va B1/K1/VE-1 bog‘lanish nuqtalari tasdiqlandi; yashirin eski iz loyihaga kiritilmaydi.',
  );
  assert.equal(approvedProj.engineerSignOff.approved, true);

  // 6. CSV va Millimetrli DXF eksporti: 5,40 m DXF da ANIQ 5400 mm chiqadi!
  const csvText = makeSurveyCsv(approvedProj);
  assert.equal(csvText.charCodeAt(0), 0xfeff, 'CSV starts with UTF-8 BOM for Excel');
  assert.match(csvText, /Tasdiqlandi: Muhandis \(SPS AI/);
  assert.match(csvText, /Sovuq suv kirishi В1/);

  const dxfText = makeSurveyRoomDxfMm(approvedProj.rooms[0]);
  const { pairs, entities } = parseDxfEntities(dxfText);
  const insUnitsIdx = pairs.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  assert.deepEqual(pairs[insUnitsIdx + 1], [70, '4'], 'DXF $INSUNITS must be 4 (Millimeters)');

  const konturLines = entities.filter((e) => e.entityType === 'LINE' && e[8] === 'XONA_KONTUR');
  assert.deepEqual(
    konturLines.map((l) => [Number(l[10]), Number(l[20]), Number(l[11]), Number(l[21])]),
    [
      [0, 0, 5400, 0],
      [5400, 0, 5400, 3600],
      [5400, 3600, 0, 3600],
      [0, 3600, 0, 0],
    ],
    '5.40 x 3.60 m room MUST output exact 5400 x 3600 mm rectangle in DXF!',
  );

  // Tasdiqlangan Suv, Kanalizatsiya, Vent DXF da bor; tasdiqlanmagan yashirin Isitish nuqtasi DXF ga tushmaydi!
  assert.ok(entities.some((e) => e[8] === 'MEP_SUV'));
  assert.ok(entities.some((e) => e[8] === 'MEP_KANALIZATSIYA'));
  assert.ok(entities.some((e) => e[8] === 'MEP_VENT'));
  assert.equal(entities.some((e) => e[8] === 'MEP_ISITISH'), false, 'Unverified concealed pipe must NEVER enter DXF');

  // 7. SPS Project 2.0 Planar 2D/3D BIM ko'prigi: sof ichki yuza ANIQ 5.40 * 3.60 = 19.44 m²!
  const planarFloor = convertSurveyRoomToPlanarFloor(approvedProj.rooms[0]);
  assert.equal(planarFloor.rooms.length, 1);
  assert.equal(planarFloor.rooms[0].areaM2, 19.44, 'Planar BIM room clear area (в свету) equals exact 5.40 × 3.60 = 19.44 m²');
});

test('E2E Task 4: Official Climate House Catalog (3,790 SKUs + ZONT / 7200S / 8784A / IMRITA / S-PRESS prices + zero price guessing + CSV/DXF SKU export)', () => {
  const stats = getClimateHouseStats();
  assert.equal(CLIMATE_HOUSE_CATALOG.length, 3790);
  assert.ok(stats.pricedCount >= 140);

  // 1. ZONT ZE-44 (Telegram screenshot: ML00005696 -> $200)
  const ze44 = findClimateHouseSku('EL-00013');
  assert.equal(ze44.article, 'ML00005696');
  assert.equal(ze44.priceUsd, 200.00);

  // 2. Climate House 7200 / 7200S 8-ways (Telegram screenshot: 1"-8ways -> $64.00)
  const col8 = findClimateHouseSku('TP-02460');
  assert.equal(col8.priceUsd, 64.00);
  assert.ok(searchClimateHouseCatalog('7200S').length >= 14);

  // 3. Climate House 8784A 3-way mixing valves (1" $16, 1 1/4" $22, 1 1/2" $27, 2" $30)
  assert.equal(findClimateHouseSku('MT-01276').priceUsd, 16.00);
  assert.equal(findClimateHouseSku('MT-8784A-125').priceUsd, 22.00);
  assert.equal(findClimateHouseSku('MT-8784A-150').priceUsd, 27.00);
  assert.equal(findClimateHouseSku('MT-8784A-200').priceUsd, 30.00);

  // 4. IMRITA IMT-U8 (IMRITA Price_17.03.2026.pdf -> $447 wholesale / $514 retail) & S-PRESS HB-N00002 ($5.10)
  const imtU8 = findClimateHouseSku('FL-00284');
  assert.equal(imtU8.priceUsd, 447.00);
  assert.equal(imtU8.retailUsd, 514.00);
  assert.equal(findClimateHouseSku('TR-03511').priceUsd, 5.10);

  // 5. QAT'IY QOIDA: Praes faylida narxi bo'lmagan TE-SA / Royal Thermo tovarlariga taxminiy narx qo'yilmaydi (null)!
  const tesaItems = searchClimateHouseCatalog('', { brand: 'TE-SA', limit: 20 });
  assert.ok(tesaItems.length > 0);
  assert.ok(tesaItems.every((it) => it.priceUsd === null));

  // 6. SKU -> Zamer MEP nuqtasi -> CSV va 5400 mm DXF eksportida Код CH chiqadi!
  const proj = createTechnicalRoom540x360Sample();
  const preset = inferMepPointPresetFromSku(col8);
  proj.rooms[0].points.push(validateAndNormalizeMepPoint({
    ...preset,
    x: 2.50,
    y: 0.25,
    z: 0.90,
    source: 'laser_manual',
    verified: true,
  }, proj.rooms[0]));

  const csv = makeSurveyCsv(proj);
  assert.match(csv, /TP-02460/);
  assert.match(csv, /64\.00/);

  const dxf = makeSurveyRoomDxfMm(proj.rooms[0]);
  assert.match(dxf, /\[CH:TP-02460\]/);
});
