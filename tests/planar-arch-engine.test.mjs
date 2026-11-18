import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createEmptyFloor,
  addWallSegment,
  addRectWalls,
  addWallOpening,
  moveWallParallel,
  computeWallWitnessDimensions,
  setWallWitnessDistance,
  deleteWallById,
  planarizeFloorGraph,
} from '../src/core/planar-wall-graph.js';
import {
  parseRoomPlanJsonToFloor,
  parse3dMeshScanToFloor,
  parseAny3dScanBufferToFloor,
  rebuildWallsFromScanCloud,
  parseDxfToFloor,
  generateProjectFromAiPrompt,
  buildPrototypeProject,
  buildSpsOffice135528Project,
  decodeCompactCloudBinToFloorOverlay,
} from '../src/ai/scan-and-ai-engine.js';
import { exportProjectToIfc2x3, exportFloorToDxf } from '../src/export/bim-exporter.js';
import { ArchStore } from '../src/core/arch-store.js';
import { computeFullMepSuite, buildClimateHouseSmeta, generateGostAlbumSheets } from '../src/docs/smeta-and-sheets-engine.js';

test('1. Anti-accidental click & exact clear room area (в свету)', () => {
  const store = new ArchStore();
  assert.equal(store.state.activeTool, 'select', 'Default tool MUST always be select, never wall!');

  const fl = createEmptyFloor(1, '1-qavat');
  // Tasodifiy qisqa klik (< 20 sm) hech qachon devor qo'shmasligi shart!
  assert.equal(addWallSegment(fl, 2, 2, 2.05, 2.03), null);
  assert.equal(fl.walls.length, 0);

  // 10.00 x 8.00 m (markaz o'qlari bo'yicha), tashqi devor 0.40 m -> ichki suvoq o'lchami: 9.60 x 7.60 = 72.96 m²!
  addRectWalls(fl, 0, 0, 10, 8, { thickness: 0.40, roomName: 'Katta Zal', roomType: 'living' });
  assert.equal(fl.rooms.length, 1);
  assert.equal(fl.rooms[0].areaM2, 72.96, 'Clear interior area (в свету) of 10x8 with 400mm walls must be exact 72.96 m²');
  assert.equal(fl.rooms[0].name, 'Katta Zal');
});

test('2. Splitting room with partition wall & merging back on delete preserves exact m² conservation', () => {
  const fl = createEmptyFloor(1, '1-qavat');
  addRectWalls(fl, 0, 0, 10, 8, { thickness: 0.40 });

  // O'rtadan x = 5.00 da 0.20 m qalinlikdagi peregorodka tortamiz:
  // Chap xona ichki eni: (5.00 - 0.20 - 0.10) = 4.70 m x 7.60 m = 35.72 m²
  // O'ng xona ichki eni: (5.00 - 0.20 - 0.10) = 4.70 m x 7.60 m = 35.72 m²
  // Peregorodka egallagan yuzasi: 0.20 x 7.60 = 1.52 m² -> 35.72 + 35.72 + 1.52 = ANIQ 72.96 m²!
  const partWall = addWallSegment(fl, 5, 0, 5, 8, { thickness: 0.20, kind: 'interior' });
  assert.ok(partWall);
  assert.equal(fl.rooms.length, 2, 'Partition wall splits 1 room into 2 rooms');

  const totalClearAfterSplit = fl.rooms.reduce((s, r) => s + r.areaM2, 0);
  assert.ok(Math.abs(totalClearAfterSplit - 71.44) < 0.02, `Expected 71.44 m², got ${totalClearAfterSplit}`);

  // Peregorodkani o'chiramiz -> 2 xona qayta bitta 72.96 m² xonaga aylanadi!
  deleteWallById(fl, partWall.id);
  assert.equal(fl.rooms.length, 1);
  assert.equal(fl.rooms[0].areaM2, 72.96);
});

test('3. Constrained Wall Move & Revit Witness Dimension editing NEVER corrupts room m² across 30 consecutive moves', () => {
  const fl = createEmptyFloor(1, '1-qavat');
  addRectWalls(fl, 0, 0, 12, 8, { thickness: 0.40 }); // Ichki: 11.60 x 7.60 = 88.16 m²
  const partWall = addWallSegment(fl, 6, 0, 6, 8, { thickness: 0.20, kind: 'interior' }); // Peregorodka: 0.20 x 7.60 = 1.52 m² -> sof jami = 86.64 m²

  // 30 marta ketma-ket u yoqdan bu yoqqa suramiz!
  const deltas = [0.8, -1.5, 2.1, -0.9, -1.2, 1.7, -0.4, 0.6, -1.1, 0.9, 0.5, -0.7, 1.3, -1.8, 0.4];
  for (const d of deltas) {
    // Ichki peregorodkani topish (x o'qi 0 va 12 orasidagi vertikal devor)
    const innerVert = fl.walls.find((w) => w.kind === 'interior');
    assert.ok(innerVert, 'Interior partition wall exists');
    moveWallParallel(fl, innerVert.id, d, { chainMode: 'segment' });

    assert.equal(fl.rooms.length, 2, 'Must always remain exact 2 valid rooms without corruption');
    const sumClear = fl.rooms.reduce((s, r) => s + r.areaM2, 0);
    assert.ok(
      Math.abs(sumClear - 86.64) < 0.03,
      `Conservation of area violated after moving wall by ${d}m: expected 86.64, got ${sumClear}`,
    );
  }

  // Revit Witness Dimension sinovi: sof masofani aniq 4.250 m ga o'rnatish!
  const innerVert = fl.walls.find((w) => w.kind === 'interior');
  const dimsBefore = computeWallWitnessDimensions(fl, innerVert.id);
  assert.equal(dimsBefore.length, 2, 'Interior wall has witness dimensions to both left and right exterior walls');

  setWallWitnessDistance(fl, innerVert.id, dimsBefore[0].sideSign, 4.25, { chainMode: 'segment' });
  const innerAfter = fl.walls.find((w) => w.kind === 'interior');
  const dimsAfter = computeWallWitnessDimensions(fl, innerAfter.id);
  const updatedSide = dimsAfter.find((d) => d.sideSign === dimsBefore[0].sideSign);
  assert.ok(Math.abs(updatedSide.clearDistanceM - 4.25) < 0.005, `Witness distance must become exact 4.25m, got ${updatedSide.clearDistanceM}`);
});

test('4. Multi-room house wall dragging preserves all 8 rooms without losing or breaking any room', () => {
  const proj = buildPrototypeProject('lidar-iphone-138');
  const fl = proj.floors[0];
  const initialRoomCount = fl.rooms.length;
  assert.ok(initialRoomCount >= 6, `Prototype house has ${initialRoomCount} rooms`);
  assert.ok(fl.scanOverlay?.pointStride6?.length > 3000, 'Prototype includes 3D LiDAR point cloud');

  // Tashqi o'ng fasadni +1.0 m kengaytiramiz (collinear_chain)
  const rightExtWall = fl.walls.find((w) => w.kind === 'exterior');
  moveWallParallel(fl, rightExtWall.id, -0.60, { chainMode: 'collinear_chain' });
  assert.equal(fl.rooms.length, initialRoomCount, 'Expanding exterior facade preserves exact room count without tearing');
});

test('5. Apple RoomPlan LiDAR JSON rectifier, 3D .OBJ mesh slicer, .DXF importer & IFC2X3/DXF exporters', () => {
  // 5a. Biroz qiyshiq (±2.5° sensor og'ishi bilan) Apple RoomPlan JSON skani -> ideal 90° BIM xonaga tekislanadi!
  const noisyRoomPlan = {
    walls: [
      { x1: 0.02, y1: 0.04, x2: 6.03, y2: -0.05, thickness: 0.38, heightM: 2.95 },
      { x1: 6.05, y1: -0.02, x2: 5.98, y2: 4.97, thickness: 0.38, heightM: 2.95 },
      { x1: 6.01, y1: 5.03, x2: -0.03, y2: 4.98, thickness: 0.38, heightM: 2.95 },
      { x1: -0.01, y1: 4.99, x2: 0.03, y2: 0.01, thickness: 0.38, heightM: 2.95 },
    ],
    openings: [
      { type: 'door', x: 3.0, y: 5.0, widthM: 0.90, heightM: 2.10 },
      { type: 'window', x: 3.0, y: 0.0, widthM: 1.60, heightM: 1.50, sillM: 0.85 },
    ],
  };
  const lidarFloor = parseRoomPlanJsonToFloor(noisyRoomPlan, 1);
  assert.equal(lidarFloor.rooms.length, 1, 'Noisy LiDAR scan closes into 1 exact watertight room');
  assert.equal(lidarFloor.openings.length, 2, 'Scanned door & window attach cleanly to rectified walls');

  // 5b. 3D .OBJ Skaner kesimi (Z = 1.20 m)
  const objLines = [];
  for (let x = 0; x <= 5.0; x += 0.1) {
    objLines.push(`v ${x.toFixed(2)} 0.00 1.20`, `v ${x.toFixed(2)} 4.00 1.20`);
  }
  for (let y = 0; y <= 4.0; y += 0.1) {
    objLines.push(`v 0.00 ${y.toFixed(2)} 1.20`, `v 5.00 ${y.toFixed(2)} 1.20`);
  }
  objLines.push('v 2.50 2.00 0.00', 'v 2.50 2.00 2.80');
  const meshFloor = parse3dMeshScanToFloor(objLines.join('\n'), 'scan.obj', 1.20);
  assert.equal(meshFloor.rooms.length, 1, '3D OBJ horizontal slice reconstructs enclosed room');

  // 5c. AutoCAD DXF eksport -> qayta import sikli
  const aiProj = generateProjectFromAiPrompt('2 qavatli kottej 12x10 m: zal, oshxona, 3 yotoqxona, 2 sanuzel, qozonxona');
  assert.equal(aiProj.floors.length, 2, '2-story AI prompt generates 2 floors');

  const dxfStr = exportFloorToDxf(aiProj.floors[0]);
  assert.match(dxfStr, /A-WALL-EXT/);
  const reimportedDxf = parseDxfToFloor(dxfStr, 1);
  assert.ok(reimportedDxf.walls.length >= 4, 'DXF parser extracts walls in millimeters accurately');

  // 5d. Revit 2024/2026 IFC2X3 eksporti
  const ifcStr = exportProjectToIfc2x3(aiProj);
  assert.match(ifcStr, /FILE_SCHEMA\(\('IFC2X3'\)\)/);
  assert.match(ifcStr, /IFCWALLSTANDARDCASE/);
  assert.match(ifcStr, /IFCOPENINGELEMENT/);
  assert.match(ifcStr, /IFCSPACE/);
});

test('6. Scaniverse Binary Little-Endian .PLY (rotated 13°, noisy floor outliers) + Scan-Only From-Scratch Mode', () => {
  // 6×5 m xona, Z_floor = +1.55 m, Z_ceil = +4.65 m, 13° burilgan + pastki -1.0 m shovqin nuqtalari!
  const pts = [];
  const rad = (-13 * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const pushRot = (x, y, z, r = 180, g = 190, b = 200) => {
    pts.push([x * c - y * s, x * s + y * c, z, r, g, b]);
  };

  // Pol va Shift plitalari
  for (let x = 0; x <= 6.0; x += 0.25) {
    for (let y = 0; y <= 5.0; y += 0.25) {
      pushRot(x, y, 1.55, 160, 140, 120);
      pushRot(x, y, 4.65, 240, 240, 245);
    }
  }
  // 4 ta tashqi devor (Z = 1.55..4.65)
  for (let z = 1.60; z <= 4.60; z += 0.20) {
    for (let x = 0; x <= 6.0; x += 0.08) {
      pushRot(x, 0, z);
      pushRot(x, 5.0, z);
    }
    for (let y = 0; y <= 5.0; y += 0.08) {
      pushRot(0, y, z);
      pushRot(6.0, y, z);
    }
  }
  // Chuqur aks-shovqin (-1.05 m)
  pushRot(1.0, 1.0, -1.05);
  pushRot(2.0, 2.0, -0.95);

  const header = [
    'ply',
    'format binary_little_endian 1.0',
    'comment Created with Scaniverse',
    `element vertex ${pts.length}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header\n',
  ].join('\n');

  const hdrBytes = new TextEncoder().encode(header);
  const totalBuf = new Uint8Array(hdrBytes.length + pts.length * 15);
  totalBuf.set(hdrBytes, 0);
  const dv = new DataView(totalBuf.buffer, hdrBytes.length);
  pts.forEach((p, idx) => {
    const o = idx * 15;
    dv.setFloat32(o, p[0], true);
    dv.setFloat32(o + 4, p[1], true);
    dv.setFloat32(o + 8, p[2], true);
    dv.setUint8(o + 12, p[3]);
    dv.setUint8(o + 13, p[4]);
    dv.setUint8(o + 14, p[5]);
  });

  // A) Scan-Only rejim (autoBuildWalls = false): devorlar 0 ta, lekin skan buluti va balandlik (3.10 m) aniq!
  const scanOnlyFl = parseAny3dScanBufferToFloor(totalBuf.buffer, 'Scaniverse_Test.ply', { autoBuildWalls: false });
  assert.equal(scanOnlyFl.walls.length, 0);
  assert.ok(Math.abs(scanOnlyFl.heightM - 3.10) <= 0.12, `Detected ceiling height ~3.10 m, got ${scanOnlyFl.heightM}`);
  assert.ok(scanOnlyFl.scanOverlay.pointStride6.length >= 600);

  // B) Skan ustidan 1-klikda Avto-Devor tiklash: 13° burilgan skan to'g'rilanib yopiq xona (m²) hosil qiladi!
  rebuildWallsFromScanCloud(scanOnlyFl, 1.20);
  assert.ok(scanOnlyFl.rooms.length >= 1, 'Rotated binary Scaniverse PLY reconstructs enclosed room');
  assert.ok(scanOnlyFl.rooms[0].areaM2 > 22 && scanOnlyFl.rooms[0].areaM2 < 36, `Room area accurate: ${scanOnlyFl.rooms[0].areaM2} m²`);
});

test('7. v2.6.0 Bizning Ofis (2-qavat oxirgi etaj) Descending Stair, Tyopliy Pol, 2 Radiators, ПВУ + 2 Cassette Fan-Coils, Corner Boiler & Full Smeta', () => {
  const proj = buildSpsOffice135528Project({ withWalls: true });
  const fl = proj.floors[0];

  assert.equal(fl.id, 2, 'Office is on 2nd floor (oxirgi 2-etaj)');
  assert.equal(fl.subfloorIsHeated, true, 'Heated 1st floor underneath -> zero ground loss');
  assert.equal(fl.isTopFloor, true, 'Top floor -> roof heat loss included');
  assert.equal(fl.rooms.length, 2, 'Two enclosed spaces: Loyihachilar ofisi + Zinaxona');
  const officeRoom = fl.rooms.find((r) => r.roomType === 'office');
  const stairRoom = fl.rooms.find((r) => r.roomType === 'stairwell');
  assert.ok(officeRoom && Math.abs(officeRoom.areaM2 - 63.77) < 0.6, `Office clear area ~63.8 m², got ${officeRoom?.areaM2}`);
  assert.ok(stairRoom && Math.abs(stairRoom.areaM2 - 9.64) < 0.5, `Stairwell clear area ~9.6 m², got ${stairRoom?.areaM2}`);

  const stairEl = fl.elements.find((e) => e.kind === 'stair');
  assert.equal(stairEl?.direction, 'down', 'Stairwell descends DOWN to 1st floor (never protrudes above 2nd floor)');
  assert.equal(fl.openings.length, 3, '1 entrance door + 2 main office windows (ОК-1, ОК-2)');
  assert.equal(fl.openings.filter((o) => o.type === 'window' && Math.abs(o.sillM - 0.90) < 0.02).length, 2, 'Two h=900mm windows for 2 radiators');

  // To'liq Ofis ОВиК + Фанкойл + Бурчак ТМ (ВК shartmas!) tekshiruvi:
  const store = new ArchStore();
  store.loadCompleteOfficeProject(proj);
  const suite = store.state.mepSuite;

  assert.equal(suite.ov.totalRadiators, 3, '2 Radiators (Р-1, Р-2) under office windows + 1 Radiator (Р-3) covering Zinaxona heat loss');
  assert.equal(suite.ov.hasHeatingDeficit, false, 'Zero room heating deficit across both Office and Zinaxona');
  for (const rp of suite.ov.floors[0].radPipes) {
    for (const [px] of rp.pts3d) {
      assert.ok(px >= 0.05 && px <= 14.40, `Radiator pipe ${rp.id} stays strictly inside building walls (got x=${px})`);
    }
  }
  assert.ok(suite.ov.totalUfLoops >= 3, `Warm floor «Улитка» loops built in office (${suite.ov.totalUfLoops})`);
  assert.ok(!suite.ov.floors[0].ufLoops.some((lp) => lp.roomName.includes('Zinaxona')), 'Zero warm-floor loops inside unheated stairwell');
  assert.equal(suite.ov.totalFancoilUnits, 2, '2 Ceiling 4-Way Cassette Fan-Coils (ФК-1, ФК-2) placed over workstation islands');
  assert.ok(suite.ov.chillerUnit && suite.ov.chillerUnit.powerKw >= 9, 'Outdoor inverter mini-chiller sized for 2 fan-coils');
  assert.ok(suite.ov.floors[0].ahuUnit?.label.includes('CS-550'), 'ПВУ CS-550 recuperator sized for 12-person office');
  assert.equal(suite.ov.ventDiffuserType, '4apn_ksd', 'Default office ceiling diffuser is Arktos 4АПН 450×450 + 3КСД');
  assert.equal(suite.ov.totalVentSilencers, 2, '2 tubular silencers СР 160/600 placed on П1 and В1 outlets');
  assert.equal(suite.ov.totalVentSupplyDiffs, 4, '4 supply diffusers П1 over workstation zones');
  assert.equal(suite.ov.totalVentExhaustDiffs, 3, '3 exhaust diffusers В1 along non-crossing return spine');
  assert.equal(suite.ov.totalVentDampers, 7, '7 Galvent ДК Ø125 balancing dampers on every diffuser branch');
  assert.equal(suite.vk.fixturesCount, 0, 'Water & sewage disabled as requested (Suv kanalizatsiya shartmas)');
  assert.equal(suite.tm.isCompactHeatingOnly, true, 'Corner office heating unit without БКН or ХВО');
  assert.equal(suite.tm.equipment3d.length, 4, 'Compact corner boiler has К1, ГС+НК, РБ, ЩА ZONT');

  const smeta = buildClimateHouseSmeta(suite, { usdToUzs: 12850, includeLabor: true, useMarketFallback: true });
  assert.ok(smeta.rows.some((r) => r.skuCode === 'ARK-4APN-450'), 'Arktos 4АПН + 3КСД itemized in specification');
  assert.ok(smeta.rows.some((r) => r.skuCode === 'ARK-SR-160-600'), 'Tubular silencers СР 160/600 itemized');
  assert.ok(smeta.rows.some((r) => r.skuCode === 'GALV-DK-125'), 'Galvent ДК Ø125 dampers itemized');
  assert.ok(smeta.rows.some((r) => r.skuCode === 'SONODFLEX-125'), 'SonoDFlex acoustic flexible sleeves itemized');
  assert.ok(smeta.rows.some((r) => r.skuCode.startsWith('FC-4W-')), '4-way cassette fan-coils itemized in specification');
  assert.ok(smeta.rows.some((r) => r.skuCode === 'KFLEX-25-13'), 'K-Flex ST anti-condensate insulation itemized');
  assert.ok(smeta.rows.some((r) => r.skuCode.startsWith('CHILLER-')), 'Mini-chiller itemized in specification');
  assert.ok(!smeta.rows.some((r) => r.skuCode === 'VN-03609'), 'Zero БКН cylinder in office specification');

  const sheets = generateGostAlbumSheets(proj, suite, smeta);
  assert.equal(sheets.length, 9, 'All 9 GOST A3 sheets including СО-1 specification generated cleanly');

  // Tozalangan 35,270 nuqtali bin bulutidan avto Skan-Magnit devor o'qlari va burchaklarini chiqarish
  const binPath = path.resolve('public/scans/office_135528_cloud.bin');
  if (fs.existsSync(binPath)) {
    const binBuf = fs.readFileSync(binPath);
    const rawScanFl = createEmptyFloor(2, 'Raw Scan Check', 0, 3.10);
    rawScanFl.scanOverlay = { kind: 'lidar_cloud', pointStride6: [] };
    const nPts = decodeCompactCloudBinToFloorOverlay(binBuf, rawScanFl);
    assert.ok(nPts >= 34000, `Cleaned office cloud has >= 34k points, got ${nPts}`);
    const g = rawScanFl.scanOverlay.snapGuides;
    assert.ok(g.xRails.length >= 4, `Extracted >= 4 X magnetic wall rails, got ${g.xRails.length}`);
    assert.ok(g.yRails.length >= 4, `Extracted >= 4 Y magnetic wall rails, got ${g.yRails.length}`);
    assert.ok(g.corners.length >= 8, `Extracted >= 8 magnetic scan corners, got ${g.corners.length}`);
  }
});
