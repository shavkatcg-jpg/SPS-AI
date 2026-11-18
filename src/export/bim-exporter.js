/**
 * SPS Project 2.0 — Haqiqiy BIM IFC2X3 (Revit 2024/2026), AutoCAD DXF va Oflayn QR eksport moduli
 */

import { getNodeMap, roundMm } from '../core/planar-wall-graph.js';

function ifcGuid(seedNum) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let x = Math.abs(seedNum * 2654435761) >>> 0;
  let out = '';
  for (let i = 0; i < 22; i++) {
    x = (x * 1664525 + 1013904223 + i * 37) >>> 0;
    out += chars[x % 64];
  }
  return out;
}

function escIfcStr(str) {
  return String(str || '').replace(/'/g, "''");
}

/**
 * Loyihani haqiqiy ISO-10303-21 IFC2X3 (.ifc) fayliga eksport qiladi.
 * Revit 2024 / 2026 da "Открыть -> IFC" qilinganda devorlar, eshik/oyna teshiklari, plitalar, xonalar hamda ОВ/ВК/ТМ uskunalari tushadi!
 */
export function exportProjectToIfc2x3(project, mepSuite = null) {
  const lines = [];
  let eid = 1;
  const add = (expr) => {
    const id = eid++;
    lines.push(`#${id}=${expr};`);
    return `#${id}`;
  };

  let gSeed = 100;
  const g = () => ifcGuid(gSeed++);

  const origin3d = add('IFCCARTESIANPOINT((0.,0.,0.))');
  const dirZ = add('IFCDIRECTION((0.,0.,1.))');
  const dirX = add('IFCDIRECTION((1.,0.,0.))');
  const worldAxis = add(`IFCAXIS2PLACEMENT3D(${origin3d},${dirZ},${dirX})`);
  const geomCtx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${worldAxis},$)`);
  const bodySubCtx = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${geomCtx},$,.MODEL_VIEW.,$)`);

  const person = add("IFCPERSON($,'SPS Project','Muhandis',$,$,$,$,$)");
  const org = add("IFCORGANIZATION($,'Santex Profi-Servis Project',$,$,$)");
  const pAndO = add(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const app = add(`IFCAPPLICATION(${org},'2.8.0','SPS Project Arch & MEP BIM','SPS_PROJECT_28')`);
  const ownerHist = add(`IFCOWNERHISTORY(${pAndO},${app},$,.ADDED.,$,$,$,1763300000)`);

  const uLen = add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)');
  const uArea = add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)');
  const uVol = add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)');
  const uAng = add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
  const units = add(`IFCUNITASSIGNMENT((${uLen},${uArea},${uVol},${uAng}))`);

  const ifcProject = add(`IFCPROJECT('${g()}',${ownerHist},'${escIfcStr(project.title || 'SPS Project 2.0')}',$,$,$,$,(${geomCtx}),${units})`);
  const sitePl = add(`IFCLOCALPLACEMENT($,${worldAxis})`);
  const ifcSite = add(`IFCSITE('${g()}',${ownerHist},'Uchastka',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldgPl = add(`IFCLOCALPLACEMENT(${sitePl},${worldAxis})`);
  const ifcBldg = add(`IFCBUILDING('${g()}',${ownerHist},'Asosiy Bino',$,$,${bldgPl},$,$,.ELEMENT.,$,$,$)`);

  add(`IFCRELAGGREGATES('${g()}',${ownerHist},$,$,${ifcProject},(${ifcSite}))`);
  add(`IFCRELAGGREGATES('${g()}',${ownerHist},$,$,${ifcSite},(${ifcBldg}))`);

  const storeyRefs = [];
  for (const fl of project.floors || []) {
    const nm = getNodeMap(fl);
    const elev = Number(fl.elevationM) || 0;
    const wallH = Number(fl.heightM) || 3.0;
    const stOrigin = add(`IFCCARTESIANPOINT((0.,0.,${elev.toFixed(4)}))`);
    const stAxis = add(`IFCAXIS2PLACEMENT3D(${stOrigin},${dirZ},${dirX})`);
    const stPl = add(`IFCLOCALPLACEMENT(${bldgPl},${stAxis})`);
    const storey = add(`IFCBUILDINGSTOREY('${g()}',${ownerHist},'${escIfcStr(fl.name)}',$,$,${stPl},$,$,.ELEMENT.,${elev.toFixed(4)})`);
    storeyRefs.push(storey);

    const elemRefs = [];
    const spaceRefs = [];

    // Qavat pol plitasi (IfcSlab)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const nd of fl.nodes || []) {
      if (nd.x < minX) minX = nd.x;
      if (nd.y < minY) minY = nd.y;
      if (nd.x > maxX) maxX = nd.x;
      if (nd.y > maxY) maxY = nd.y;
    }
    if (Number.isFinite(minX) && maxX - minX > 0.3) {
      const sw = roundMm(maxX - minX);
      const sd = roundMm(maxY - minY);
      const scx = roundMm((minX + maxX) * 0.5);
      const scy = roundMm(-(minY + maxY) * 0.5);
      const slPt = add(`IFCCARTESIANPOINT((${scx.toFixed(4)},${scy.toFixed(4)},-0.20))`);
      const slAx = add(`IFCAXIS2PLACEMENT3D(${slPt},${dirZ},${dirX})`);
      const slPl = add(`IFCLOCALPLACEMENT(${stPl},${slAx})`);
      const prof = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${sw.toFixed(4)},${sd.toFixed(4)})`);
      const solid = add(`IFCEXTRUDEDAREASOLID(${prof},${worldAxis},${dirZ},0.20)`);
      const shape = add(`IFCSHAPEREPRESENTATION(${bodySubCtx},'Body','SweptSolid',(${solid}))`);
      const pds = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shape}))`);
      const slab = add(`IFCSLAB('${g()}',${ownerHist},'Pol plitasi',$,$,${slPl},${pds},$,.FLOOR.)`);
      elemRefs.push(slab);
    }

    // Devorlar va ulardagi Oyna/Eshik teshiklari (IfcWallStandardCase + IfcOpeningElement)
    for (const w of fl.walls || []) {
      const a = nm.get(w.n1);
      const b = nm.get(w.n2);
      if (!a || !b) continue;
      // Plan Y-pastga -> IFC Y-yuqoriga (-y)
      const ax = a.x, ay = -a.y;
      const bx = b.x, by = -b.y;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 0.08) continue;
      const ux = dx / len;
      const uy = dy / len;
      const th = Number(w.thickness) || 0.20;
      const h = Number(w.heightM) || wallH;

      const wOrigin = add(`IFCCARTESIANPOINT((${ax.toFixed(4)},${ay.toFixed(4)},0.))`);
      const wDirX = add(`IFCDIRECTION((${ux.toFixed(6)},${uy.toFixed(6)},0.))`);
      const wAx = add(`IFCAXIS2PLACEMENT3D(${wOrigin},${dirZ},${wDirX})`);
      const wPl = add(`IFCLOCALPLACEMENT(${stPl},${wAx})`);

      const profCen = add(`IFCCARTESIANPOINT((${(len * 0.5).toFixed(4)},0.))`);
      const profAx2d = add(`IFCAXIS2PLACEMENT2D(${profCen},$)`);
      const wProf = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${profAx2d},${len.toFixed(4)},${th.toFixed(4)})`);
      const wSolid = add(`IFCEXTRUDEDAREASOLID(${wProf},${worldAxis},${dirZ},${h.toFixed(4)})`);
      const wShape = add(`IFCSHAPEREPRESENTATION(${bodySubCtx},'Body','SweptSolid',(${wSolid}))`);
      const wPds = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${wShape}))`);
      const ifcWall = add(`IFCWALLSTANDARDCASE('${g()}',${ownerHist},'Devor ${Math.round(th * 1000)}mm',$,$,${wPl},${wPds},$)`);
      elemRefs.push(ifcWall);

      // Shu devordagi eshik va oynalar
      const wOps = (fl.openings || []).filter((o) => o.wallId === w.id);
      for (const op of wOps) {
        const distAlong = op.t * len;
        const sill = Number(op.sillM) || 0;
        const oh = Number(op.heightM) || 2.1;
        const ow = Number(op.widthM) || 0.9;

        const opPt = add(`IFCCARTESIANPOINT((${distAlong.toFixed(4)},0.,${sill.toFixed(4)}))`);
        const opAx = add(`IFCAXIS2PLACEMENT3D(${opPt},${dirZ},${dirX})`);
        const opPl = add(`IFCLOCALPLACEMENT(${wPl},${opAx})`);
        const opProf = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${ow.toFixed(4)},${(th + 0.06).toFixed(4)})`);
        const opSolid = add(`IFCEXTRUDEDAREASOLID(${opProf},${worldAxis},${dirZ},${oh.toFixed(4)})`);
        const opShape = add(`IFCSHAPEREPRESENTATION(${bodySubCtx},'Body','SweptSolid',(${opSolid}))`);
        const opPds = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${opShape}))`);
        const openingEl = add(`IFCOPENINGELEMENT('${g()}',${ownerHist},'Proyom',$,$,${opPl},${opPds},$)`);
        add(`IFCRELVOIDSELEMENT('${g()}',${ownerHist},$,$,${ifcWall},${openingEl})`);

        if (op.type === 'door') {
          const fillPl = add(`IFCLOCALPLACEMENT(${opPl},${worldAxis})`);
          const dProf = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${ow.toFixed(4)},0.06)`);
          const dSolid = add(`IFCEXTRUDEDAREASOLID(${dProf},${worldAxis},${dirZ},${oh.toFixed(4)})`);
          const dShape = add(`IFCSHAPEREPRESENTATION(${bodySubCtx},'Body','SweptSolid',(${dSolid}))`);
          const dPds = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${dShape}))`);
          const door = add(`IFCDOOR('${g()}',${ownerHist},'Eshik ${Math.round(ow * 1000)}mm',$,$,${fillPl},${dPds},$,${oh.toFixed(4)},${ow.toFixed(4)})`);
          add(`IFCRELFILLSELEMENT('${g()}',${ownerHist},$,$,${openingEl},${door})`);
          elemRefs.push(door);
        } else if (op.type === 'window') {
          const fillPl = add(`IFCLOCALPLACEMENT(${opPl},${worldAxis})`);
          const winProf = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${ow.toFixed(4)},0.07)`);
          const winSolid = add(`IFCEXTRUDEDAREASOLID(${winProf},${worldAxis},${dirZ},${oh.toFixed(4)})`);
          const winShape = add(`IFCSHAPEREPRESENTATION(${bodySubCtx},'Body','SweptSolid',(${winSolid}))`);
          const winPds = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${winShape}))`);
          const win = add(`IFCWINDOW('${g()}',${ownerHist},'Oyna ${Math.round(ow * 1000)}mm',$,$,${fillPl},${winPds},$,${oh.toFixed(4)},${ow.toFixed(4)})`);
          add(`IFCRELFILLSELEMENT('${g()}',${ownerHist},$,$,${openingEl},${win})`);
          elemRefs.push(win);
        }
      }
    }

    // Xonalar (IfcSpace)
    for (const rm of fl.rooms || []) {
      if (!rm.innerPoly || rm.innerPoly.length < 3) continue;
      const polyRefs = rm.innerPoly.map(([px, py]) => add(`IFCCARTESIANPOINT((${px.toFixed(4)},${(-py).toFixed(4)}))`));
      polyRefs.push(polyRefs[0]);
      const pline = add(`IFCPOLYLINE((${polyRefs.join(',')}))`);
      const spProf = add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${pline})`);
      const spSolid = add(`IFCEXTRUDEDAREASOLID(${spProf},${worldAxis},${dirZ},${wallH.toFixed(4)})`);
      const spShape = add(`IFCSHAPEREPRESENTATION(${bodySubCtx},'Body','SweptSolid',(${spSolid}))`);
      const spPds = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${spShape}))`);
      const spPl = add(`IFCLOCALPLACEMENT(${stPl},${worldAxis})`);
      const space = add(`IFCSPACE('${g()}',${ownerHist},'${escIfcStr(rm.name)}','${rm.areaM2} m2',$,${spPl},${spPds},'${escIfcStr(rm.name)}',.ELEMENT.,.INTERNAL.,$)`);
      spaceRefs.push(space);
    }

    // ОВ · ВК · ТМ jihozlarini IFC2X3 spatial elementlar sifatida eksport qilish
    const addMepBoxEntity = (ifcEntityName, name, desc, tagCode, wx, wy, wz, sizeW, sizeD, sizeH, angRad = 0) => {
      const pt = add(`IFCCARTESIANPOINT((${Number(wx || 0).toFixed(4)},${(-Number(wy || 0)).toFixed(4)},${Number(wz || 0).toFixed(4)}))`);
      const cs = Math.cos(-(angRad || 0));
      const sn = Math.sin(-(angRad || 0));
      const dRef = add(`IFCDIRECTION((${cs.toFixed(6)},${sn.toFixed(6)},0.))`);
      const ax3 = add(`IFCAXIS2PLACEMENT3D(${pt},${dirZ},${dRef})`);
      const pl = add(`IFCLOCALPLACEMENT(${stPl},${ax3})`);
      const prof = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${Math.max(0.08, sizeW).toFixed(4)},${Math.max(0.06, sizeD).toFixed(4)})`);
      const sol = add(`IFCEXTRUDEDAREASOLID(${prof},${worldAxis},${dirZ},${Math.max(0.06, sizeH).toFixed(4)})`);
      const shp = add(`IFCSHAPEREPRESENTATION(${bodySubCtx},'Body','SweptSolid',(${sol}))`);
      const pds = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shp}))`);
      const ent = add(`${ifcEntityName}('${g()}',${ownerHist},'${escIfcStr(name)}','${escIfcStr(desc)}',$,${pl},${pds},'${escIfcStr(tagCode)}')`);
      elemRefs.push(ent);
    };

    if (mepSuite) {
      const flOv = mepSuite.ov?.floors?.find((f) => f.floorId === fl.id);
      const flVk = mepSuite.vk?.floors?.find((f) => f.floorId === fl.id);
      if (flOv) {
        if (flOv.tpCollector) {
          const c = flOv.tpCollector;
          addMepBoxEntity('IFCDISTRIBUTIONCHAMBERELEMENT', c.label, c.modelName, c.skuCode, c.x, c.y, 0.25, 0.62, 0.14, 0.56, 0);
        }
        if (flOv.radCollector) {
          const rc = flOv.radCollector;
          addMepBoxEntity('IFCDISTRIBUTIONCHAMBERELEMENT', rc.label, rc.modelName, rc.skuCode, rc.x, rc.y, 0.25, 0.52, 0.14, 0.50, 0);
        }
        for (const r of flOv.radiators || []) {
          addMepBoxEntity('IFCFLOWTERMINAL', `${r.label} ${r.model}`, `${r.powerW} W`, r.skuCode || r.label, r.x, r.y, r.zBottomM ?? 0.12, r.widthM || 0.8, r.depthM || 0.1, r.heightM || 0.5, r.angleRad || 0);
        }
        if (flOv.ahuUnit) {
          const u = flOv.ahuUnit;
          addMepBoxEntity('IFCENERGYCONVERSIONDEVICE', u.label, u.model, u.skuCode, u.x, u.y, u.zM || 2.8, u.wM || 1.1, u.dM || 0.76, u.hM || 0.26, 0);
        }
        for (const ac of flOv.acUnits || []) {
          addMepBoxEntity('IFCFLOWTERMINAL', ac.label, ac.model || ac.btuClass, ac.skuCode || ac.label, ac.x, ac.y, ac.zM || 2.7, ac.wM || 0.84, ac.dM || 0.84, ac.hM || 0.24, 0);
        }
        for (const vt of flOv.ventTerminals || []) {
          addMepBoxEntity('IFCFLOWTERMINAL', vt.code || vt.sys, vt.label || '', vt.skuCode || vt.sys, vt.x, vt.y, vt.zM || 2.75, 0.45, 0.45, 0.22, 0);
        }
      }
      if (flVk) {
        for (const fx of flVk.fixtures || []) {
          addMepBoxEntity('IFCFLOWTERMINAL', fx.code, fx.title || fx.kind, fx.code, fx.x, fx.y, 0.0, fx.wM || 0.5, fx.dM || 0.5, 0.75, 0);
        }
      }
      if (mepSuite.tm?.enabled !== false && mepSuite.tm?.floorId === fl.id) {
        for (const eq of mepSuite.tm.equipment3d || []) {
          const cls = eq.kind === 'boiler' ? 'IFCENERGYCONVERSIONDEVICE' : 'IFCFLOWSTORAGE';
          const safeCls = cls === 'IFCFLOWSTORAGE' ? 'IFCFLOWTERMINAL' : cls;
          addMepBoxEntity(safeCls, `${eq.tag} ${eq.name}`, eq.skuCode || '', eq.skuCode || eq.tag, eq.x, eq.y, eq.zM || 0, eq.wM || 0.45, eq.dM || 0.36, eq.hM || 0.72, 0);
        }
      }
    }

    if (elemRefs.length) {
      add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${g()}',${ownerHist},$,$,(${elemRefs.join(',')}),${storey})`);
    }
    if (spaceRefs.length) {
      add(`IFCRELAGGREGATES('${g()}',${ownerHist},$,$,${storey},(${spaceRefs.join(',')}))`);
    }
  }

  if (storeyRefs.length) {
    add(`IFCRELAGGREGATES('${g()}',${ownerHist},$,$,${ifcBldg},(${storeyRefs.join(',')}))`);
  }

  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');",
    `FILE_NAME('${escIfcStr(project.title || 'sps_project_2')}.ifc','2026-11-16T20:00:00',('SPS Project'),('Santex Profi-Servis'),'SPS Arch 2.0','SPS Arch 2.0','');`,
    "FILE_SCHEMA(('IFC2X3'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\r\n');
}

/**
 * Qavatni AutoCAD .DXF (millimetrda 1:1, qatlamlar bilan) formatiga eksport qiladi.
 */
export function exportFloorToDxf(floor, mepSuite = null) {
  const out = [];
  const push = (code, val) => {
    out.push(String(code), String(val));
  };

  push(0, 'SECTION');
  push(2, 'HEADER');
  push(9, '$INSUNITS');
  push(70, 4); // 4 = Millimeters
  push(0, 'ENDSEC');

  push(0, 'SECTION');
  push(2, 'ENTITIES');

  const toMmX = (x) => Math.round(x * 1000 * 10) / 10;
  const toMmY = (y) => Math.round(-y * 1000 * 10) / 10;

  // Mitered devor konturlari (LWPOLYLINE)
  for (const wp of floor.wallPolygons || []) {
    const layer = wp.kind === 'exterior' ? 'A-WALL-EXT' : 'A-WALL-INT';
    const color = wp.kind === 'exterior' ? 7 : 8;
    push(0, 'LWPOLYLINE');
    push(8, layer);
    push(62, color);
    push(90, wp.points.length);
    push(70, 1); // closed
    for (const [px, py] of wp.points) {
      push(10, toMmX(px));
      push(20, toMmY(py));
    }
  }

  // Oyna va eshik o'qlari
  const nm = getNodeMap(floor);
  for (const op of floor.openings || []) {
    const w = (floor.walls || []).find((it) => it.id === op.wallId);
    const a = w ? nm.get(w.n1) : null;
    const b = w ? nm.get(w.n2) : null;
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const cx = a.x + (b.x - a.x) * op.t;
    const cy = a.y + (b.y - a.y) * op.t;
    const hw = (op.widthM || 0.9) * 0.5;
    push(0, 'LINE');
    push(8, op.type === 'window' ? 'A-GLAZ' : 'A-DOOR');
    push(62, op.type === 'window' ? 5 : 30);
    push(10, toMmX(cx - ux * hw));
    push(20, toMmY(cy - uy * hw));
    push(11, toMmX(cx + ux * hw));
    push(21, toMmY(cy + uy * hw));
  }

  // Xona nomlari va m2 yozuvlari
  for (const rm of floor.rooms || []) {
    push(0, 'TEXT');
    push(8, 'A-ROOM-TXT');
    push(62, 3);
    push(10, toMmX(rm.labelX - 0.5));
    push(20, toMmY(rm.labelY));
    push(40, 180);
    push(1, `${rm.name} (${rm.areaM2} m2)`);
  }

  // ОВ, ВК va ТМ qatlamlari (agar mepSuite berilgan bo'lsa)
  const emitOpenPoly = (layer, col, pts) => {
    if (!pts || pts.length < 2) return;
    push(0, 'LWPOLYLINE');
    push(8, layer);
    push(62, col);
    push(90, pts.length);
    push(70, 0);
    for (const p of pts) {
      push(10, toMmX(p[0]));
      push(20, toMmY(p[1]));
    }
  };

  if (mepSuite) {
    const flOv = mepSuite.ov?.floors?.find((f) => f.floorId === floor.id);
    const flVk = mepSuite.vk?.floors?.find((f) => f.floorId === floor.id);
    if (flOv) {
      for (const lp of flOv.ufLoops || []) {
        emitOpenPoly('OV-TP-SUPPLY', 1, lp.supplyPts);
        emitOpenPoly('OV-TP-RETURN', 5, lp.returnPts);
      }
      for (const rp of flOv.radPipes || []) {
        emitOpenPoly(rp.sys === 'T1' ? 'OV-RAD-T1' : 'OV-RAD-T2', rp.sys === 'T1' ? 1 : 5, rp.pts3d);
      }
      for (const vd of flOv.ventDucts || []) {
        emitOpenPoly(vd.sys === 'P1' ? 'OV-VENT-P1' : 'OV-VENT-V1', vd.sys === 'P1' ? 4 : 3, vd.pts3d);
      }
    }
    if (flVk) {
      for (const vp of flVk.pipes || []) {
        const lyr = vp.sys === 'B1' ? 'VK-B1-COLD' : vp.sys === 'T3' ? 'VK-T3-HOT' : vp.sys === 'T4' ? 'VK-T4-RECIRC' : 'VK-K1-SEWER';
        const col = vp.sys === 'B1' ? 4 : vp.sys === 'T3' ? 1 : vp.sys === 'T4' ? 2 : 6;
        emitOpenPoly(lyr, col, vp.pts3d);
      }
    }
  }

  push(0, 'ENDSEC');
  push(0, 'EOF');
  return out.join('\r\n');
}

export function showExportFeedbackToast({ ok = true, filename = '', bytes = 0, url = '', error = '' } = {}) {
  if (typeof document === 'undefined' || !document.body) return;
  const prev = document.getElementById('sps-export-toast');
  if (prev) prev.remove();

  const kb = (Math.max(1, bytes) / 1024).toFixed(1);
  const el = document.createElement('div');
  el.id = 'sps-export-toast';
  el.className = `sps-export-toast ${ok ? 'ok' : 'err'}`;
  el.innerHTML = ok ? `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="min-width:0;">
        <div style="font-weight:800;font-size:12.5px;color:#10b981;">✓ Eksport muvaffaqiyatli tayyorlandi!</div>
        <div style="font-size:11.5px;color:var(--text-primary);margin-top:2px;word-break:break-all;">
          <strong>${filename}</strong> <span style="color:var(--text-secondary);">(${kb} KB)</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        ${url ? `<a href="${url}" download="${filename}" class="sps-btn sps-btn-primary" style="height:28px;padding:0 10px;font-size:11.5px;text-decoration:none;">⬇ Saqlash</a>` : ''}
        <button type="button" class="sps-btn" id="sps-exp-toast-close" style="height:28px;padding:0 8px;font-size:11px;">✕</button>
      </div>
    </div>
  ` : `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div>
        <div style="font-weight:800;font-size:12.5px;color:#FF3445;">⚠ Eksportda xatolik yuz berdi</div>
        <div style="font-size:11.5px;color:var(--text-primary);margin-top:2px;">${error || 'Noma’lum xato'}</div>
      </div>
      <button type="button" class="sps-btn" id="sps-exp-toast-close" style="height:28px;padding:0 8px;font-size:11px;">✕</button>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector('#sps-exp-toast-close')?.addEventListener('click', () => el.remove());
  setTimeout(() => {
    if (el.isConnected) el.remove();
  }, 12000);
}

export function triggerTextDownload(filename, content, mime = 'application/octet-stream') {
  try {
    const str = String(content ?? '');
    if (!str.length) {
      throw new Error(`«${filename}» eksport fayli bo‘sh chiqdi.`);
    }
    const bytes = new TextEncoder().encode(str);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
    }, 500);
    // Mobil Safari / Chrome va Cloudflare tunnellarda yuklash uzilib qolmasligi uchun 60 soniya saqlaymiz!
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    showExportFeedbackToast({ ok: true, filename, bytes: bytes.byteLength, url });
    return { ok: true, filename, bytes: bytes.byteLength, url };
  } catch (err) {
    const msg = err?.message || String(err);
    showExportFeedbackToast({ ok: false, filename, error: msg });
    return { ok: false, filename, error: msg };
  }
}

/**
 * Oflayn QR-kod SVG generatori (ISO/IEC 18004 Byte Mode, ECC-L, Version 1..6)
 */
export function renderSimpleQrOrLinkBadgeSvg(url, sizePx = 196) {
  // Toza skanerlanadigan kompakt QR yoki tezkor havola kartochkasi:
  // Haqiqiy Galois GF(256) Reed-Solomon QR kod (Version 4: 33x33, 78 baytgacha URL uchun!)
  const bytes = new TextEncoder().encode(String(url || 'http://localhost:5185/'));
  if (bytes.length > 78) {
    return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" rx="12" fill="#fff" stroke="#cbd5e1"/>
      <text x="100" y="95" text-anchor="middle" font-size="12" fill="#0f172a" font-family="sans-serif">Havolani nusxalang</text>
    </svg>`;
  }

  const ver = bytes.length <= 17 ? 1 : bytes.length <= 32 ? 2 : bytes.length <= 53 ? 3 : 4;
  const totalDataCodewords = [0, 19, 34, 55, 80][ver];
  const ecCodewords = [0, 7, 10, 15, 20][ver];
  const n = 17 + ver * 4;

  // Bit stream (Byte mode = 0100)
  const bits = [];
  const pushBits = (val, count) => {
    for (let i = count - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = totalDataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[pi % 2], 8);
    pi += 1;
  }

  const dataWords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let w = 0;
    for (let k = 0; k < 8; k++) w = (w << 1) | bits[i + k];
    dataWords.push(w);
  }

  // GF(256) Reed-Solomon EC
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let v = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = v;
    log[v] = i;
    v <<= 1;
    if (v & 0x100) v ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]);

  let gen = [1];
  for (let i = 0; i < ecCodewords; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], exp[i]);
    }
    gen = next;
  }

  const rem = new Array(ecCodewords).fill(0);
  for (const d of dataWords) {
    const factor = d ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let j = 0; j < ecCodewords; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  const allCodewords = [...dataWords, ...rem];

  const grid = Array.from({ length: n }, () => new Array(n).fill(0));
  const reserved = Array.from({ length: n }, () => new Array(n).fill(false));

  const placeFinder = (r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        reserved[r][c] = true;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        grid[r][c] = inOuter || inInner ? 1 : 0;
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, n - 7);
  placeFinder(n - 7, 0);

  if (ver >= 2) {
    const ap = [0, 0, 18, 22, 26][ver];
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = ap + dr, c = ap + dc;
        reserved[r][c] = true;
        grid[r][c] = Math.max(Math.abs(dr), Math.abs(dc)) === 2 || (dr === 0 && dc === 0) ? 1 : 0;
      }
    }
  }

  for (let i = 8; i < n - 8; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = i % 2 === 0 ? 1 : 0;
    grid[i][6] = i % 2 === 0 ? 1 : 0;
  }

  for (let i = 0; i <= 8; i++) {
    if (i < n) { reserved[8][i] = true; reserved[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][n - 1 - i] = true;
    reserved[n - 1 - i][8] = true;
  }
  grid[n - 8][8] = 1;

  const streamBits = [];
  for (const cw of allCodewords) {
    for (let b = 7; b >= 0; b--) streamBits.push((cw >> b) & 1);
  }

  let bitIdx = 0;
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < n; step++) {
      const r = upward ? n - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (reserved[r][c]) continue;
        const bit = bitIdx < streamBits.length ? streamBits[bitIdx++] : 0;
        // Mask 0: (r + c) % 2 === 0
        grid[r][c] = ((r + c) % 2 === 0) ? (bit ^ 1) : bit;
      }
    }
    upward = !upward;
  }

  // Format info for ECC-L (01) + Mask 0 (000) -> precomputed 15-bit BCH: 0x77c4
  const fmt = 0x77c4;
  const fmtCoordsA = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const fmtCoordsB = [[n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8], [8, n - 8], [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1]];
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> (14 - i)) & 1;
    grid[fmtCoordsA[i][0]][fmtCoordsA[i][1]] = bit;
    grid[fmtCoordsB[i][0]][fmtCoordsB[i][1]] = bit;
  }

  const quiet = 3;
  const total = n + quiet * 2;
  let pathD = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c]) pathD += `M${c + quiet},${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
    <rect width="${total}" height="${total}" fill="#ffffff"/>
    <path d="${pathD}" fill="#0f172a"/>
  </svg>`;
}
