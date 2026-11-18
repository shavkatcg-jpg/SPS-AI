/**
 * SPS Project 2.0 — Teplopoterya, 17-Ustunli Ograjeniya Jadvali (GalfDesign standarti),
 * Sovutish Yuklamasi va Havo Almashinuvi Moduli
 * Standart: QMQ 2.04.05-97 / СП 50.13330 / СП 60.13330 (O'zbekiston va Tojikiston iqlim bazasi bilan)
 */

import { getNodeMap, pointInPolygon, projectOnSegment } from '../core/planar-wall-graph.js';

export const UZ_CLIMATE_CITIES = Object.freeze([
  { id: 'tashkent', name: 'Toshkent', tWinterC: -16, tSummerC: 41, tGroundC: 8, heatingDays: 133, windMs: 2.6 },
  { id: 'samarkand', name: 'Samarqand', tWinterC: -14, tSummerC: 40, tGroundC: 9, heatingDays: 129, windMs: 2.8 },
  { id: 'bukhara', name: 'Buxoro', tWinterC: -14, tSummerC: 43, tGroundC: 10, heatingDays: 123, windMs: 3.4 },
  { id: 'fergana', name: 'Farg‘ona / Qo‘qon', tWinterC: -15, tSummerC: 40, tGroundC: 9, heatingDays: 132, windMs: 2.1 },
  { id: 'andijan', name: 'Andijon / Namangan', tWinterC: -16, tSummerC: 40, tGroundC: 9, heatingDays: 136, windMs: 2.2 },
  { id: 'karshi', name: 'Qarshi', tWinterC: -12, tSummerC: 44, tGroundC: 11, heatingDays: 110, windMs: 3.1 },
  { id: 'termez', name: 'Termiz', tWinterC: -9, tSummerC: 45, tGroundC: 13, heatingDays: 92, windMs: 2.9 },
  { id: 'urgench', name: 'Urganch / Xorazm', tWinterC: -18, tSummerC: 42, tGroundC: 8, heatingDays: 146, windMs: 3.5 },
  { id: 'nukus', name: 'Nukus', tWinterC: -22, tSummerC: 43, tGroundC: 7, heatingDays: 158, windMs: 3.8 },
  { id: 'jizzakh', name: 'Jizzax / Guliston', tWinterC: -15, tSummerC: 41, tGroundC: 9, heatingDays: 130, windMs: 2.7 },
  { id: 'dushanbe', name: 'Dushanbe (TJ)', tWinterC: -10, tSummerC: 41, tGroundC: 11, heatingDays: 108, windMs: 2.0 },
  { id: 'khujand', name: 'Xo‘jand (TJ)', tWinterC: -13, tSummerC: 40, tGroundC: 10, heatingDays: 124, windMs: 3.2 },
]);

export const WALL_INSULATION_PRESETS = Object.freeze([
  { id: 'brick_ins_50', label: 'G‘isht 380 mm + Bazalt 50 mm (U=0.58 · R=1.72)', uWall: 0.58, layersLabel: 'Штукатурка 20 мм · Кирпич 380 мм · Минплита 50 мм · Фасад 15 мм' },
  { id: 'gazobeton_ins', label: 'Gazobeton 300 mm + Bazalt 50 mm (U=0.42 · R=2.38)', uWall: 0.42, layersLabel: 'Гипсовая штук. 15 мм · Газоблок D500 300 мм · Базальт 50 мм · Облицовка' },
  { id: 'brick_bare', label: 'Oddiy g‘isht 380 mm uteplitelsiz (U=1.42 · R=0.70)', uWall: 1.42, layersLabel: 'Штукатурка 20 мм · Кирпичная кладка 380 мм · Фасадная штук. 20 мм' },
  { id: 'monolith_ins', label: 'Temir-beton + Bazalt 100 mm (U=0.38 · R=2.63)', uWall: 0.38, layersLabel: 'Ж/Б стена 250 мм · Минплита 100 мм · Фасадная система' },
]);

export const GLAZING_PRESETS = Object.freeze([
  { id: 'pvc_2cam_low_e', label: '2-kamerali Energiya tejovchi steklopaket (Uw=1.35 · R=0.74)', uWin: 1.35, shgc: 0.42 },
  { id: 'pvc_1cam_std', label: '1-kamerali oddiy PVX steklopaket (Uw=1.95 · R=0.51)', uWin: 1.95, shgc: 0.58 },
  { id: 'alum_vitraj', label: 'Alyuminiy panoramali vitraj (Uw=2.15 · R=0.47)', uWin: 2.15, shgc: 0.52 },
]);

export const ROOF_PRESETS = Object.freeze([
  { id: 'roof_minwool_150', label: 'Cherdak / Tom bazalt 150 mm (Ur=0.32 · R=3.13)', uRoof: 0.32, uFloor: 0.38 },
  { id: 'roof_minwool_100', label: 'Tom bazalt 100 mm (Ur=0.46 · R=2.17)', uRoof: 0.46, uFloor: 0.45 },
  { id: 'roof_slab_light', label: 'Kam izolyatsiyali plita (Ur=0.92 · R=1.09)', uRoof: 0.92, uFloor: 0.62 },
]);

const AIR_RATES_BY_TYPE = {
  living: { supplyAch: 1.0, exhaustM3h: 0, minSupplyM3h: 60 },
  bedroom: { supplyAch: 1.0, exhaustM3h: 0, minSupplyM3h: 45 },
  kids: { supplyAch: 1.2, exhaustM3h: 0, minSupplyM3h: 45 },
  office: { supplyAch: 2.6, exhaustM3h: 0, minSupplyM3h: 120 },
  kitchen: { supplyAch: 0.5, exhaustM3h: 90, minSupplyM3h: 30 },
  bathroom: { supplyAch: 0, exhaustM3h: 50, minSupplyM3h: 0 },
  bath: { supplyAch: 0, exhaustM3h: 50, minSupplyM3h: 0 },
  hallway: { supplyAch: 0.3, exhaustM3h: 0, minSupplyM3h: 0 },
  stairwell: { supplyAch: 0, exhaustM3h: 0, minSupplyM3h: 0 },
  hall: { supplyAch: 0.3, exhaustM3h: 0, minSupplyM3h: 0 },
  boiler: { supplyAch: 3.0, exhaustM3h: 90, minSupplyM3h: 90 },
  wardrobe: { supplyAch: 0, exhaustM3h: 25, minSupplyM3h: 0 },
};

function round1(v) {
  return Math.round(v * 10) / 10;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function getOrientationInfo(outNx, outNy) {
  // Plan Y pastga (+Y = Janub/Ю, -Y = Shimol/С, +X = Sharq/В, -X = G'arb/З)
  if (Math.abs(outNy) >= Math.abs(outNx)) {
    return outNy < 0
      ? { code: 'N', ruCode: 'С', label: 'Shimol (С)', factor: 1.10, betaOrient: 0.10, solarWm2: 85 }
      : { code: 'S', ruCode: 'Ю', label: 'Janub (Ю)', factor: 1.00, betaOrient: 0.00, solarWm2: 245 };
  }
  return outNx > 0
    ? { code: 'E', ruCode: 'В', label: 'Sharq (В)', factor: 1.05, betaOrient: 0.05, solarWm2: 210 }
    : { code: 'W', ruCode: 'З', label: 'G‘arb (З)', factor: 1.05, betaOrient: 0.05, solarWm2: 275 };
}

/**
 * Butun bino bo'yicha barcha qavat va xonalarning Teplopoterya + 17-ustunli Ograjeniya jadvali + Havo almashinuvi + Sovutish hisobini bajaradi!
 */
export function computeProjectHeatLoss(project, mepConfig = {}) {
  const city = UZ_CLIMATE_CITIES.find((c) => c.id === mepConfig.cityId) || UZ_CLIMATE_CITIES[0];
  const wallSpec = WALL_INSULATION_PRESETS.find((w) => w.id === mepConfig.wallInsId) || WALL_INSULATION_PRESETS[0];
  const winSpec = GLAZING_PRESETS.find((g) => g.id === mepConfig.glazingId) || GLAZING_PRESETS[0];
  const roofSpec = ROOF_PRESETS.find((r) => r.id === mepConfig.roofInsId) || ROOF_PRESETS[0];
  const safetyFactor = Number(mepConfig.safetyFactor) || 1.12;
  const hasRecuperator = mepConfig.ventMode !== 'natural';

  const floorsSorted = [...(project?.floors || [])].sort((a, b) => (a.elevationM || 0) - (b.elevationM || 0));
  const lowestFloorId = floorsSorted[0]?.id;
  const highestFloorId = floorsSorted[floorsSorted.length - 1]?.id;

  const floorReports = [];
  let totalHeatLossW = 0;
  let totalCoolingW = 0;
  let totalSupplyAirM3h = 0;
  let totalExhaustAirM3h = 0;
  let totalHeatedAreaM2 = 0;

  floorsSorted.forEach((fl, flIdx) => {
    const nm = getNodeMap(fl);
    const hRoom = Number(fl.heightM) || 3.0;
    const isLowest = fl.id === lowestFloorId;
    const isHighest = fl.id === highestFloorId;
    const roomResults = [];
    const wallHeatArrows = [];
    const floorPrefix = fl.id >= 1 ? fl.id : flIdx + 1;

    let rmSeq = 1;
    for (const rm of fl.rooms || []) {
      const area = Number(rm.areaM2) || 0;
      if (area < 0.4) continue;
      const roomCode = `${floorPrefix}.${rmSeq++}`;
      const tIn = Number(rm.targetTempC) || (rm.roomType === 'bath' || rm.roomType === 'bathroom' ? 24 : rm.roomType === 'boiler' ? 16 : 22);
      const dTOut = Math.max(0, tIn - city.tWinterC);

      let qExtWalls = 0;
      let qIntWalls = 0;
      let qWindows = 0;
      let qDoors = 0;
      let extWallLengthM = 0;
      let windowAreaM2 = 0;
      let solarGainW = 0;

      const poly = rm.innerPoly || [];
      const visitedWalls = new Set();
      const rawExtWallEntries = [];
      const rawIntWallEntries = [];

      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i];
        const [bx, by] = poly[(i + 1) % poly.length];
        const segLen = Math.hypot(bx - ax, by - ay);
        if (segLen < 0.15) continue;
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;

        let bestWall = null;
        let bestDist = 0.65;
        for (const w of fl.walls || []) {
          const n1 = nm.get(w.n1);
          const n2 = nm.get(w.n2);
          if (!n1 || !n2) continue;
          const pr = projectOnSegment(mx, my, n1.x, n1.y, n2.x, n2.y);
          const halfT = (Number(w.thickness) || 0.2) * 0.5 + 0.08;
          if (pr.dist <= halfT && pr.dist < bestDist) {
            bestDist = pr.dist;
            bestWall = { w, n1, n2, pr };
          }
        }
        if (!bestWall) continue;

        const { w, n1, n2, pr } = bestWall;
        let outNx = pr.x - mx;
        let outNy = pr.y - my;
        const nLen = Math.hypot(outNx, outNy) || 1;
        outNx /= nLen;
        outNy /= nLen;

        const probeOutX = pr.x + outNx * ((Number(w.thickness) || 0.2) * 0.5 + 0.28);
        const probeOutY = pr.y + outNy * ((Number(w.thickness) || 0.2) * 0.5 + 0.28);
        const neighborRoom = (fl.rooms || []).find(
          (other) => other.id !== rm.id && pointInPolygon(probeOutX, probeOutY, other.innerPoly || []),
        );

        if (!neighborRoom) {
          const orient = getOrientationInfo(outNx, outNy);
          extWallLengthM += segLen;

          let segWinM2 = 0;
          let segDoorM2 = 0;
          const segWinSpecs = [];
          const segDoorSpecs = [];
          if (!visitedWalls.has(w.id)) {
            visitedWalls.add(w.id);
            const ops = (fl.openings || []).filter((o) => o.wallId === w.id);
            for (const op of ops) {
              const ox = n1.x + (n2.x - n1.x) * op.t;
              const oy = n1.y + (n2.y - n1.y) * op.t;
              const prEdge = projectOnSegment(ox, oy, ax, ay, bx, by);
              if (prEdge.dist <= (Number(w.thickness) || 0.2) + 0.25) {
                const ow = Number(op.widthM) || 0.9;
                const oh = Number(op.heightM) || (op.type === 'window' ? 1.5 : 2.1);
                const opArea = ow * oh;
                if (op.type === 'window') {
                  segWinM2 += opArea;
                  segWinSpecs.push({ w: ow, h: oh, area: opArea });
                } else if (op.type === 'door') {
                  segDoorM2 += opArea;
                  segDoorSpecs.push({ w: ow, h: oh, area: opArea });
                }
              }
            }
          }

          const uEffWall = round2(wallSpec.uWall * ((0.38 / Math.max(0.18, Number(w.thickness) || 0.38)) ** 0.35));
          rawExtWallEntries.push({
            segLen,
            hRoom,
            orient,
            uEffWall,
            segWinM2,
            segDoorM2,
            segWinSpecs,
            segDoorSpecs,
            mx,
            my,
            outNx,
            outNy,
          });
        } else {
          const tAdj = Number(neighborRoom.targetTempC) || 20;
          if (tIn - tAdj >= 3) {
            rawIntWallEntries.push({ segLen, hRoom, dT: tIn - tAdj, adjName: neighborRoom.name });
          }
        }
      }

      // GalfDesign qoidasi: agar xonada >= 2 ta har xil yo'nalishdagi tashqi devor bo'lsa — burchak qo'shimchasi β_угл = +0.05
      const uniqueOrients = new Set(rawExtWallEntries.map((e) => e.orient.ruCode));
      const betaCorner = uniqueOrients.size >= 2 ? 0.05 : 0.0;
      const envelopeRows = [];

      for (const ew of rawExtWallEntries) {
        const grossArea = round2(ew.segLen * ew.hRoom);
        const deductArea = round2(ew.segWinM2 + ew.segDoorM2);
        const netWallArea = round2(Math.max(0, grossArea - deductArea));
        const betaSum = round2(ew.orient.betaOrient + betaCorner);

        const qBaseWall = netWallArea * ew.uEffWall * dTOut;
        const qw = qBaseWall * (1 + betaSum) * safetyFactor;
        qExtWalls += qw;

        if (netWallArea > 0.05) {
          envelopeRows.push({
            code: 'НС',
            name: 'Наружная стена',
            orient: ew.orient.ruCode,
            dimA: round2(ew.segLen),
            dimB: round2(ew.hRoom),
            grossArea,
            deductArea,
            netArea: netWallArea,
            rVal: round2(1 / Math.max(0.1, ew.uEffWall)),
            uVal: ew.uEffWall,
            dT: dTOut,
            qBaseW: Math.round(qBaseWall),
            betaOrient: ew.orient.betaOrient,
            betaExtra: round2(betaCorner + (safetyFactor - 1)),
            qTotalW: Math.round(qw),
          });
        }

        let segWinLossSum = 0;
        for (const ws of ew.segWinSpecs) {
          const qBaseWin = ws.area * winSpec.uWin * dTOut;
          const qwin = qBaseWin * (1 + betaSum) * safetyFactor;
          qWindows += qwin;
          segWinLossSum += qwin;
          windowAreaM2 += ws.area;
          solarGainW += ws.area * ew.orient.solarWm2 * winSpec.shgc;
          envelopeRows.push({
            code: 'ОК',
            name: 'Окно / Витраж',
            orient: ew.orient.ruCode,
            dimA: round2(ws.w),
            dimB: round2(ws.h),
            grossArea: round2(ws.area),
            deductArea: 0,
            netArea: round2(ws.area),
            rVal: round2(1 / winSpec.uWin),
            uVal: winSpec.uWin,
            dT: dTOut,
            qBaseW: Math.round(qBaseWin),
            betaOrient: ew.orient.betaOrient,
            betaExtra: round2(betaCorner + (safetyFactor - 1)),
            qTotalW: Math.round(qwin),
          });
        }

        let segDoorLossSum = 0;
        for (const ds of ew.segDoorSpecs) {
          const uDoor = 2.15;
          const qBaseDr = ds.area * uDoor * dTOut;
          const qdr = qBaseDr * (1 + betaSum) * safetyFactor;
          qDoors += qdr;
          segDoorLossSum += qdr;
          envelopeRows.push({
            code: 'ДВ',
            name: 'Дверь наружная',
            orient: ew.orient.ruCode,
            dimA: round2(ds.w),
            dimB: round2(ds.h),
            grossArea: round2(ds.area),
            deductArea: 0,
            netArea: round2(ds.area),
            rVal: round2(1 / uDoor),
            uVal: uDoor,
            dT: dTOut,
            qBaseW: Math.round(qBaseDr),
            betaOrient: ew.orient.betaOrient,
            betaExtra: round2(betaCorner + (safetyFactor - 1)),
            qTotalW: Math.round(qdr),
          });
        }

        wallHeatArrows.push({
          roomId: rm.id,
          x: ew.mx,
          y: ew.my,
          nx: ew.outNx,
          ny: ew.outNy,
          orient: ew.orient.ruCode,
          lossW: Math.round(qw + segWinLossSum + segDoorLossSum),
        });
      }

      for (const iw of rawIntWallEntries) {
        const iwArea = round2(iw.segLen * iw.hRoom);
        const uInt = 1.65;
        const qBaseIw = iwArea * uInt * iw.dT;
        const qiw = qBaseIw * safetyFactor;
        qIntWalls += qiw;
        envelopeRows.push({
          code: 'ВС',
          name: `Внутр. стена (${iw.adjName})`,
          orient: '—',
          dimA: round2(iw.segLen),
          dimB: round2(iw.hRoom),
          grossArea: iwArea,
          deductArea: 0,
          netArea: iwArea,
          rVal: round2(1 / uInt),
          uVal: uInt,
          dT: iw.dT,
          qBaseW: Math.round(qBaseIw),
          betaOrient: 0,
          betaExtra: round2(safetyFactor - 1),
          qTotalW: Math.round(qiw),
        });
      }

      // Pol va Shift yo'qotishlari (subfloorIsHeated=true bo'lsa 2-qavat ostida iliq 1-qavat bor — gruntsiz!)
      const dTGround = Math.max(0, tIn - city.tGroundC);
      const qFloorBase = (isLowest && !fl.subfloorIsHeated) ? area * roofSpec.uFloor * dTGround : 0;
      const qFloor = qFloorBase * safetyFactor;
      if (qFloor > 1) {
        envelopeRows.push({
          code: 'ПЛ',
          name: 'Пол по грунту',
          orient: 'Г',
          dimA: round2(rm.clearWidthM || Math.sqrt(area)),
          dimB: round2(rm.clearHeightM || Math.sqrt(area)),
          grossArea: round2(area),
          deductArea: 0,
          netArea: round2(area),
          rVal: round2(1 / roofSpec.uFloor),
          uVal: roofSpec.uFloor,
          dT: dTGround,
          qBaseW: Math.round(qFloorBase),
          betaOrient: 0,
          betaExtra: round2(safetyFactor - 1),
          qTotalW: Math.round(qFloor),
        });
      }

      const qCeilBase = isHighest ? area * roofSpec.uRoof * dTOut : 0;
      const qCeil = qCeilBase * 1.05 * safetyFactor;
      if (qCeil > 1) {
        envelopeRows.push({
          code: 'КР',
          name: 'Кровля / Перекрытие',
          orient: 'Г',
          dimA: round2(rm.clearWidthM || Math.sqrt(area)),
          dimB: round2(rm.clearHeightM || Math.sqrt(area)),
          grossArea: round2(area),
          deductArea: 0,
          netArea: round2(area),
          rVal: round2(1 / roofSpec.uRoof),
          uVal: roofSpec.uRoof,
          dT: dTOut,
          qBaseW: Math.round(qCeilBase),
          betaOrient: 0.05,
          betaExtra: round2(safetyFactor - 1),
          qTotalW: Math.round(qCeil),
        });
      }

      // Havo almashinuvi va infiltratsiya yo'qotishi (СП 60.13330: ofis va zallarda muvozanatlangan П1/В1, +6 м³/ч подпор!)
      const volM3 = area * hRoom;
      const airSpec = AIR_RATES_BY_TYPE[rm.roomType] || AIR_RATES_BY_TYPE.living;
      const supplyM3h = Math.round(Math.max(airSpec.minSupplyM3h, volM3 * airSpec.supplyAch));
      const exhaustM3h = rm.roomType === 'office'
        ? Math.max(0, supplyM3h - 6)
        : Math.round(airSpec.exhaustM3h);
      const infEffRate = hasRecuperator ? 0.22 : 0.55;
      const qInfiltration = Math.round(0.336 * (volM3 * infEffRate) * dTOut * safetyFactor);

      const qEnvelopeSumW = Math.round(qExtWalls + qIntWalls + qWindows + qDoors + qFloor + qCeil);
      const totalRoomW = qEnvelopeSumW + qInfiltration;
      const specificWm2 = round1(totalRoomW / Math.max(1, area));

      // Yozgi konditsioner / fankoyl sovutish yuklamasi (ofisda kompyuterlar + xodimlar issiqlik ajratishi hisobga olinadi!)
      const dTSummer = Math.max(4, city.tSummerC - 24);
      const qCoolEnvelope = (extWallLengthM * hRoom * wallSpec.uWall + (isHighest ? area * roofSpec.uRoof : 0)) * dTSummer;
      const qCoolInternal = area * (rm.roomType === 'office' ? 68 : rm.roomType === 'kitchen' ? 38 : rm.roomType === 'living' ? 24 : 16);
      const coolingLoadW = ['bath', 'bathroom', 'boiler', 'hall', 'stairwell'].includes(rm.roomType)
        ? 0
        : Math.round((qCoolEnvelope + solarGainW + qCoolInternal) * 1.10);

      totalHeatLossW += totalRoomW;
      totalCoolingW += coolingLoadW;
      totalSupplyAirM3h += supplyM3h;
      totalExhaustAirM3h += exhaustM3h;
      totalHeatedAreaM2 += area;

      roomResults.push({
        roomId: rm.id,
        roomCode,
        roomName: rm.name,
        roomType: rm.roomType || 'living',
        floorId: fl.id,
        floorName: fl.name,
        areaM2: round1(area),
        volumeM3: round1(volM3),
        tInC: tIn,
        tOutC: city.tWinterC,
        isCornerRoom: betaCorner > 0,
        extWallLengthM: round1(extWallLengthM),
        windowAreaM2: round1(windowAreaM2),
        qExtWallsW: Math.round(qExtWalls),
        qIntWallsW: Math.round(qIntWalls),
        qWindowsW: Math.round(qWindows),
        qDoorsW: Math.round(qDoors),
        qFloorW: Math.round(qFloor),
        qCeilW: Math.round(qCeil),
        qEnvelopeW: qEnvelopeSumW,
        qInfiltrationW: qInfiltration,
        heatLossW: totalRoomW,
        specificWm2,
        coolingLoadW,
        supplyAirM3h: supplyM3h,
        exhaustAirM3h: exhaustM3h,
        envelopeRows,
      });
    }

    // Qavat bo'yicha havo balansini tekshirish: agar qavatda sanuzel/oshxona bo'lmasa yoki umumiy вытяжка kam bo'lsa,
    // xoll / koridor / yashash xonalari orqali muvozanatlangan В1 chiqish havosi (+6 м³/ч подпор bilan) taqsimlanadi!
    const flSupSum = roomResults.reduce((s, r) => s + r.supplyAirM3h, 0);
    const flExSum = roomResults.reduce((s, r) => s + r.exhaustAirM3h, 0);
    const targetMinEx = Math.max(0, flSupSum - 6);
    if (flSupSum > 0 && flExSum < Math.round(flSupSum * 0.85)) {
      const missingEx = targetMinEx - flExSum;
      const candidates = roomResults.filter((r) => ['hallway', 'hall', 'office', 'living', 'bedroom', 'kids'].includes(r.roomType));
      const pool = candidates.length > 0 ? candidates : roomResults.filter((r) => r.roomType !== 'stairwell');
      if (pool.length > 0 && missingEx > 0) {
        const baseAdd = Math.floor(missingEx / pool.length);
        let remAdd = missingEx - baseAdd * pool.length;
        for (const r of pool) {
          const addNow = baseAdd + (remAdd > 0 ? 1 : 0);
          if (remAdd > 0) remAdd -= 1;
          r.exhaustAirM3h += addNow;
          totalExhaustAirM3h += addNow;
        }
      }
    }

    floorReports.push({
      floorId: fl.id,
      floorName: fl.name,
      rooms: roomResults,
      wallHeatArrows,
      floorHeatLossW: roomResults.reduce((s, r) => s + r.heatLossW, 0),
      floorCoolingW: roomResults.reduce((s, r) => s + r.coolingLoadW, 0),
    });
  });

  return {
    city,
    wallSpec,
    winSpec,
    roofSpec,
    safetyFactor,
    totalHeatedAreaM2: round1(totalHeatedAreaM2),
    totalHeatLossW,
    totalHeatLossKw: round1(totalHeatLossW / 1000),
    avgSpecificWm2: totalHeatedAreaM2 > 0 ? round1(totalHeatLossW / totalHeatedAreaM2) : 0,
    totalCoolingW,
    totalCoolingKw: round1(totalCoolingW / 1000),
    totalSupplyAirM3h,
    totalExhaustAirM3h,
    balancedAirM3h: Math.max(totalSupplyAirM3h, totalExhaustAirM3h),
    floors: floorReports,
  };
}
