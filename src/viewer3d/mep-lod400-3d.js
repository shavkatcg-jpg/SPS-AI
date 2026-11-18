/**
 * SPS Project 2.0 — 1:1 Zavod LOD 400 3D BIM Kutubxonasi (SPS AI PRO 1.0 + GalfDesign Detalizatsiyalari)
 *
 * Barcha takrorlanuvchi bazaviy BufferGeometry va PBR materiallar keshda yagona nusxada saqlanadi
 * (`userData.shared = true`), shuning uchun ham kompyuterda, ham telefonda 60 FPS silliq ishlaydi!
 */

import * as THREE from 'three';

const _UP = new THREE.Vector3(0, 1, 0);

let _geoms = null;
let _mats = null;

function markShared(geo) {
  geo.userData = { ...(geo.userData || {}), shared: true };
  return geo;
}

export function getLod400SharedGeoms() {
  if (_geoms) return _geoms;
  _geoms = {
    box1: markShared(new THREE.BoxGeometry(1, 1, 1)),
    cyl10: markShared(new THREE.CylinderGeometry(1, 1, 1, 10)),
    cyl14: markShared(new THREE.CylinderGeometry(1, 1, 1, 14)),
    cyl18: markShared(new THREE.CylinderGeometry(1, 1, 1, 18)),
    hexNut: markShared(new THREE.CylinderGeometry(1, 1, 1, 6)),
    coneBell: markShared(new THREE.CylinderGeometry(1.26, 1.0, 1, 14)),
    sphere10: markShared(new THREE.SphereGeometry(1, 10, 8)),
    torusHalf: markShared(new THREE.TorusGeometry(1, 0.08, 8, 16, Math.PI)),
  };
  return _geoms;
}

export function getLod400SharedMats() {
  if (_mats) return _mats;
  _mats = {
    radiatorWhite: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.24, metalness: 0.12 }),
    porcelain: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.14, metalness: 0.04 }),
    nickelBrass: new THREE.MeshStandardMaterial({ color: 0xdbe2ea, roughness: 0.18, metalness: 0.88 }),
    forgedBrass: new THREE.MeshStandardMaterial({ color: 0xd4a13e, roughness: 0.28, metalness: 0.84 }),
    stainless: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.19, metalness: 0.90 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc86d3b, roughness: 0.26, metalness: 0.85 }),
    silverAlum: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.30, metalness: 0.68 }),
    anthracite: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.44, metalness: 0.42 }),
    eppBlack: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.78, metalness: 0.08 }),
    epdmRing: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.80, metalness: 0.05 }),
    oakGrille: new THREE.MeshStandardMaterial({ color: 0xb6844c, roughness: 0.50, metalness: 0.08 }),
    vanityWood: new THREE.MeshStandardMaterial({ color: 0x7c4a24, roughness: 0.55, metalness: 0.06 }),
    grundfosRed: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.32, metalness: 0.30 }),
    valveBlue: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.32, metalness: 0.25 }),
    servoBlue: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.30, metalness: 0.18 }),
    imritaBlue: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.26, metalness: 0.32 }),
    energoflexRed: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.74, metalness: 0.04 }),
    energoflexBlue: new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.74, metalness: 0.04 }),
    ostendorfGray: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.36, metalness: 0.08 }),
    ostendorfOrange: new THREE.MeshStandardMaterial({ color: 0xd96b27, roughness: 0.38, metalness: 0.08 }),
    waterSheet: new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.48, roughness: 0.08 }),
    showerGlass: new THREE.MeshPhysicalMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.32, roughness: 0.08 }),
    rotameterGlass: new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.45, roughness: 0.08 }),
    mirrorGlow: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.05, metalness: 0.92, emissive: 0x38bdf8, emissiveIntensity: 0.10 }),
    lcdScreen: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.20, emissive: 0x0ea5e9, emissiveIntensity: 0.45 }),
    zontLed: new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.22, emissive: 0x10b981, emissiveIntensity: 0.55 }),
  };
  return _mats;
}

export function addCylinderBetween3D(parent, x0, y0, z0, x1, y1, z1, radius, mat) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.004) return null;
  const gg = getLod400SharedGeoms();
  const m = new THREE.Mesh(gg.cyl10, mat);
  m.scale.set(radius, len, radius);
  m.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
  m.quaternion.setFromUnitVectors(_UP, new THREE.Vector3(dx / len, dy / len, dz / len));
  parent.add(m);
  return m;
}

function addOventropTrvHead3D(parent, originVec, dirVec) {
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();
  const dNorm = dirVec.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_UP, dNorm);

  // 1) M30×1.5 xromlangan gayka
  const nut = new THREE.Mesh(gg.hexNut, lm.nickelBrass);
  nut.scale.set(0.0165, 0.012, 0.0165);
  nut.quaternion.copy(q);
  nut.position.copy(originVec).addScaledVector(dNorm, 0.006);

  // 2) Qora shkalali halqa (1 · 2 · * · 3 · 4 · 5)
  const ring = new THREE.Mesh(gg.cyl18, lm.epdmRing);
  ring.scale.set(0.0195, 0.011, 0.0195);
  ring.quaternion.copy(q);
  ring.position.copy(originVec).addScaledVector(dNorm, 0.017);

  // 3) Oventrop Uni LH pog'onali oq korpus + 8 ta konvektiv tirqish qovurg'asi
  const neck = new THREE.Mesh(gg.cyl18, lm.porcelain);
  neck.scale.set(0.0185, 0.014, 0.0185);
  neck.quaternion.copy(q);
  neck.position.copy(originVec).addScaledVector(dNorm, 0.029);

  const body = new THREE.Mesh(gg.cyl18, lm.porcelain);
  body.scale.set(0.0215, 0.036, 0.0215);
  body.quaternion.copy(q);
  body.position.copy(originVec).addScaledVector(dNorm, 0.052);

  const gHead = new THREE.Group();
  gHead.position.copy(originVec).addScaledVector(dNorm, 0.052);
  gHead.quaternion.copy(q);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rib = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    rib.scale.set(0.0032, 0.028, 0.0045);
    rib.position.set(Math.cos(a) * 0.021, 0, Math.sin(a) * 0.021);
    rib.rotation.y = -a;
    gHead.add(rib);
  }

  // 4) Old kumush-xrom medalyon qopqoq
  const cap = new THREE.Mesh(gg.cyl18, lm.stainless);
  cap.scale.set(0.0165, 0.0045, 0.0165);
  cap.quaternion.copy(q);
  cap.position.copy(originVec).addScaledVector(dNorm, 0.071);

  parent.add(nut, ring, neck, body, gHead, cap);
}

function addRosetteDisc3D(parent, x, y, z, normalVec) {
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();
  const q = new THREE.Quaternion().setFromUnitVectors(_UP, normalVec.clone().normalize());

  const disc = new THREE.Mesh(gg.cyl18, lm.stainless);
  disc.scale.set(0.024, 0.005, 0.024);
  disc.quaternion.copy(q);
  disc.position.set(x, y, z);

  const collar = new THREE.Mesh(gg.cyl14, lm.nickelBrass);
  collar.scale.set(0.013, 0.009, 0.013);
  collar.quaternion.copy(q);
  collar.position.set(x, y, z).addScaledVector(normalVec.clone().normalize(), 0.003);

  parent.add(disc, collar);
}

/**
 * 1:1 ZAVOD LOD 400 Н-ОБРАЗНЫЙ УЗЕЛ НИЖНЕГО ПОДКЛЮЧЕНИЯ 50 ММ («БИНОКЛЬ» / MULTIFLEX):
 * - Прямой (из пола): vertikal Ø16 xrom trubkalar + ikkita pog'onali xrom pol rozetkasi;
 * - Угловой (из стены): gorizontal Г-xrom trubkalar + faskali qo'shaloq devor rozetkasi (50 мм).
 */
function buildBottom50MultiflexNode3D(rootGroup, {
  mfX,
  mfZ,
  tapBottomY,
  yBase,
  yaw,
  ux,
  uy,
  inNx,
  inNy,
  wallFaceOff,
  isWallFeed,
}) {
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();
  const mfY = tapBottomY - 0.028;

  const mfg = new THREE.Group();

  // Markaziy baypas/korpus ko'prigi
  const bridge = new THREE.Mesh(gg.cyl14, lm.nickelBrass);
  bridge.scale.set(0.0105, 0.052, 0.0105);
  bridge.rotation.z = Math.PI * 0.5;
  mfg.add(bridge);

  for (const ox of [-0.025, 0.025]) {
    // Asosiy nikel-latun klapan stvol korpusi
    const barrel = new THREE.Mesh(gg.cyl18, lm.nickelBrass);
    barrel.scale.set(0.0135, 0.042, 0.0135);
    barrel.position.set(ox, 0.004, 0);

    // Yuqori 3/4" ЕК nakidnoy oltiqirrali gayka + pribor shtutseri
    const nutTop = new THREE.Mesh(gg.hexNut, lm.forgedBrass);
    nutTop.scale.set(0.016, 0.011, 0.016);
    nutTop.position.set(ox, 0.022, 0);

    const nippleTop = new THREE.Mesh(gg.cyl14, lm.nickelBrass);
    nippleTop.scale.set(0.0115, 0.012, 0.0115);
    nippleTop.position.set(ox, 0.030, 0);

    // Old tomondagi sharovoy zaporniy shlits-qopqoqcha (otvyortka / shestigrannik uchun)
    const shutBoss = new THREE.Mesh(gg.cyl14, lm.nickelBrass);
    shutBoss.scale.set(0.010, 0.016, 0.010);
    shutBoss.rotation.x = Math.PI * 0.5;
    shutBoss.position.set(ox, 0, 0.012);

    const shutCap = new THREE.Mesh(gg.hexNut, lm.forgedBrass);
    shutCap.scale.set(0.0095, 0.008, 0.0095);
    shutCap.rotation.x = Math.PI * 0.5;
    shutCap.position.set(ox, 0, 0.021);

    // Pastki (из пола) yoki orqa burchakli (из стены) 3/4" ЕК kompression gayka
    const nutOut = new THREE.Mesh(gg.hexNut, lm.nickelBrass);
    nutOut.scale.set(0.0155, 0.011, 0.0155);
    if (isWallFeed) {
      const rearElbow = new THREE.Mesh(gg.cyl14, lm.nickelBrass);
      rearElbow.scale.set(0.0125, 0.020, 0.0125);
      rearElbow.rotation.x = Math.PI * 0.5;
      rearElbow.position.set(ox, -0.002, -0.012);
      nutOut.rotation.x = Math.PI * 0.5;
      nutOut.position.set(ox, -0.002, -0.024);
      mfg.add(rearElbow);
    } else {
      nutOut.position.set(ox, -0.020, 0);
    }

    mfg.add(barrel, nutTop, nippleTop, shutBoss, shutCap, nutOut);
  }

  mfg.position.set(mfX, mfY, mfZ);
  mfg.rotation.y = -yaw;
  rootGroup.add(mfg);

  const mfSupX = mfX - ux * 0.025;
  const mfSupZ = mfZ - uy * 0.025;
  const mfRetX = mfX + ux * 0.025;
  const mfRetZ = mfZ + uy * 0.025;

  if (isWallFeed) {
    // УГЛОВОЙ БИНОКЛЬ ИЗ СТЕНЫ: 2 ta Ø16 xrom trubka devordagi qo'shaloq dekorativ rozetkaga kiradi!
    const wDist = Math.max(0.045, wallFaceOff - 0.006);
    const wSupX = mfSupX - inNx * wDist;
    const wSupZ = mfSupZ - inNy * wDist;
    const wRetX = mfRetX - inNx * wDist;
    const wRetZ = mfRetZ - inNy * wDist;

    addCylinderBetween3D(rootGroup, mfSupX, mfY - 0.002, mfSupZ, wSupX, mfY - 0.002, wSupZ, 0.0082, lm.stainless);
    addCylinderBetween3D(rootGroup, mfRetX, mfY - 0.002, mfRetZ, wRetX, mfY - 0.002, wRetZ, 0.0082, lm.stainless);

    const twinPlateGrp = new THREE.Group();
    const plateMain = new THREE.Mesh(gg.box1, lm.stainless);
    plateMain.scale.set(0.104, 0.048, 0.006);
    twinPlateGrp.add(plateMain);
    for (const ox of [-0.025, 0.025]) {
      const collar = new THREE.Mesh(gg.cyl18, lm.nickelBrass);
      collar.scale.set(0.0135, 0.011, 0.0135);
      collar.rotation.x = Math.PI * 0.5;
      collar.position.set(ox, 0, 0.004);
      twinPlateGrp.add(collar);
    }
    twinPlateGrp.position.set((wSupX + wRetX) * 0.5, mfY - 0.002, (wSupZ + wRetZ) * 0.5);
    twinPlateGrp.rotation.y = -yaw;
    rootGroup.add(twinPlateGrp);
  } else {
    // ПРЯМОЙ БИНОКЛЬ ИЗ ПОЛА: 2 ta Ø16 xrom trubka pol rozetkalariga tushadi!
    const flY = yBase + 0.006;
    addCylinderBetween3D(rootGroup, mfSupX, flY, mfSupZ, mfSupX, mfY - 0.018, mfSupZ, 0.0082, lm.stainless);
    addCylinderBetween3D(rootGroup, mfRetX, flY, mfRetZ, mfRetX, mfY - 0.018, mfRetZ, 0.0082, lm.stainless);
    addRosetteDisc3D(rootGroup, mfSupX, flY + 0.003, mfSupZ, _UP);
    addRosetteDisc3D(rootGroup, mfRetX, flY + 0.003, mfRetZ, _UP);
  }
}

/**
 * 1. LOD 400 ISITISH PRIBORLARI:
 *    - Seksiyali radiator (Royal Thermo Biliner / Revolution / Pianoforte)
 *    - Panelniy radiator (Royal Thermo Compact / Kermi Profil-V FTV 11/22/33)
 *    - Napolniy konvektor na nojkax (Konveka FC 15/15 — Cu-Al teploobmennik + antratsit oyoqlar + 50mm binokl!)
 *    - Vnutripolniy konvektor (Royal Thermo Atrium Turbo / Konveka FH4-H)
 *    - Rifar Tubog trubchali radiator va AISI 304 Polotensesushitel!
 */
export function buildEmitterLod4003D(rootGroup, r, yBase) {
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();

  const rawAngle = Number(r.angleRad) || 0;
  const ux = Number.isFinite(r.ux) ? r.ux : Math.cos(rawAngle);
  const uy = Number.isFinite(r.uy) ? r.uy : Math.sin(rawAngle);
  const inNx = Number.isFinite(r.inNx) ? r.inNx : -uy;
  const inNy = Number.isFinite(r.inNy) ? r.inNy : ux;

  // +local Z har doim xona ichiga (inNx, inNy), -local Z esa devor tomonga qaraydi!
  const frontDot = inNx * (-uy) + inNy * ux;
  const yaw = frontDot >= 0 ? rawAngle : rawAngle + Math.PI;
  const localAlongSign = frontDot >= 0 ? 1 : -1;

  // A. ПОЛОТЕНЦЕСУШИТЕЛЬ («Лесенка» AISI 304)
  if (r.kind === 'towel_warmer') {
    const g = new THREE.Group();
    const w = r.widthM || 0.50;
    const h = r.heightM || 0.80;
    const zBot = r.zBottomM || 0.95;

    for (const sx of [-w * 0.44, w * 0.44]) {
      const col = new THREE.Mesh(gg.cyl14, lm.stainless);
      col.scale.set(0.016, h, 0.016);
      col.position.set(sx, zBot + h * 0.5, 0.035);
      col.castShadow = true;

      for (const sy of [zBot + 0.08, zBot + h - 0.08]) {
        const pin = new THREE.Mesh(gg.cyl10, lm.stainless);
        pin.scale.set(0.008, 0.055, 0.008);
        pin.rotation.x = Math.PI * 0.5;
        pin.position.set(sx, sy, 0.005);
        const ros = new THREE.Mesh(gg.cyl14, lm.nickelBrass);
        ros.scale.set(0.022, 0.006, 0.022);
        ros.rotation.x = Math.PI * 0.5;
        ros.position.set(sx, sy, -0.02);
        g.add(pin, ros);
      }

      const valve = new THREE.Mesh(gg.cyl14, lm.nickelBrass);
      valve.scale.set(0.016, 0.048, 0.016);
      valve.rotation.x = Math.PI * 0.5;
      valve.position.set(sx, zBot - 0.01, 0.012);
      g.add(col, valve);
    }

    const rungs = 7;
    for (let i = 0; i < rungs; i++) {
      const ry = zBot + 0.09 + ((h - 0.18) * i) / (rungs - 1);
      const arc = new THREE.Mesh(gg.torusHalf, lm.stainless);
      arc.rotation.x = Math.PI * 0.5;
      arc.scale.set(w * 0.44, 0.18, 1.0);
      arc.position.set(0, ry, 0.035);
      g.add(arc);
    }

    g.position.set(r.x, yBase, r.y);
    g.rotation.y = -yaw;
    rootGroup.add(g);
    return;
  }

  // A2. НАПОЛЬНЫЙ КОНВЕКТОР НА НОЖКАХ (Konveka FC 15/15 — LOD 400!)
  if (r.kind === 'floor_convector') {
    const g = new THREE.Group();
    const len = Math.max(0.80, Number(r.widthM) || 1.40);
    const dep = Math.max(0.14, Number(r.depthM) || 0.155);
    const legH = Math.max(0.075, Number(r.zBottomM) || 0.090);
    const bodyH = Math.max(0.13, Number(r.heightM) || 0.150);
    const yBodyBot = legH;
    const yBodyTop = legH + bodyH;
    const yBodyMid = legH + bodyH * 0.5;

    // 1) 2 ta antratsit po'lat tayanch oyoqlari (напольные ножки с опорной пяткой и 4 анкерными болтами!)
    const legOffset = Math.max(0.24, len * 0.5 - 0.165);
    for (const lx of [-legOffset, legOffset]) {
      const legCol = new THREE.Mesh(gg.box1, lm.anthracite);
      legCol.scale.set(0.036, legH, dep * 0.62);
      legCol.position.set(lx, legH * 0.5, 0);
      legCol.castShadow = true;

      const footPlate = new THREE.Mesh(gg.box1, lm.anthracite);
      footPlate.scale.set(0.068, 0.006, dep * 0.80);
      footPlate.position.set(lx, 0.003, 0);

      for (const [bx, bz] of [[-0.022, -dep * 0.30], [0.022, -dep * 0.30], [-0.022, dep * 0.30], [0.022, dep * 0.30]]) {
        const bolt = new THREE.Mesh(gg.hexNut, lm.stainless);
        bolt.scale.set(0.0048, 0.006, 0.0048);
        bolt.position.set(lx + bx, 0.007, bz);
        g.add(bolt);
      }
      g.add(legCol, footPlate);
    }

    // 2) Konveka FC monolit oq po'lat korpusi (ichki konveksiya shaxtasi qoramtir kontrastda!)
    const frontWall = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    frontWall.scale.set(len, bodyH, 0.007);
    frontWall.position.set(0, yBodyMid, dep * 0.5 - 0.0035);
    frontWall.castShadow = true;

    const backWall = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    backWall.scale.set(len, bodyH, 0.007);
    backWall.position.set(0, yBodyMid, -dep * 0.5 + 0.0035);
    backWall.castShadow = true;

    for (const ex of [-len * 0.5 + 0.004, len * 0.5 - 0.004]) {
      const endCap = new THREE.Mesh(gg.box1, lm.radiatorWhite);
      endCap.scale.set(0.008, bodyH, dep);
      endCap.position.set(ex, yBodyMid, 0);
      g.add(endCap);
    }

    // Ichki qorong'u havo shaxtasi devori (ustki panjaradan qaraganda mis-alyuminiy teploobmennik aniq ko'rinadi!)
    const innerChamber = new THREE.Mesh(gg.box1, lm.anthracite);
    innerChamber.scale.set(len - 0.024, 0.008, dep - 0.022);
    innerChamber.position.set(0, yBodyBot + 0.016, 0);
    g.add(frontWall, backWall, innerChamber);

    // 3) 4-trubali Mis-Alyuminiy Teploobmennik (Cu Ø15 quvurlar + mis kalachlar + kumush alyuminiy plastina-lamellar!)
    const hxSpan = len - 0.19;
    const valveSideSign = (r.connectionSide === 'left' ? -1 : 1) * localAlongSign;
    const hxShiftX = -valveSideSign * 0.045;
    for (const cy of [yBodyBot + 0.046, yBodyBot + 0.088]) {
      for (const cz of [-dep * 0.19, dep * 0.19]) {
        const cuTube = new THREE.Mesh(gg.cyl10, lm.copper);
        cuTube.scale.set(0.008, hxSpan, 0.008);
        cuTube.rotation.z = Math.PI * 0.5;
        cuTube.position.set(hxShiftX, cy, cz);
        g.add(cuTube);
      }
      // Qarama-qarshi tomondagi 180° mis kalach (U-bend)
      const uBend = new THREE.Mesh(gg.torusHalf, lm.copper);
      uBend.rotation.y = valveSideSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      uBend.rotation.x = Math.PI * 0.5;
      uBend.scale.set(dep * 0.19, 0.026, 1.0);
      uBend.position.set(hxShiftX - valveSideSign * (hxSpan * 0.5), cy, 0);
      g.add(uBend);
    }

    const finCnt = Math.min(40, Math.max(16, Math.floor(hxSpan / 0.028)));
    for (let fi = 0; fi < finCnt; fi++) {
      const fx = hxShiftX - hxSpan * 0.47 + (hxSpan * 0.94 * fi) / Math.max(1, finCnt - 1);
      const fin = new THREE.Mesh(gg.box1, lm.silverAlum);
      fin.scale.set(0.0026, bodyH * 0.56, dep * 0.68);
      fin.position.set(fx, yBodyBot + 0.068, 0);
      g.add(fin);
    }

    // 4) Ustki yechiladigan anodlangan alyuminiy panjara (продольно-поперечная решётка Konveka FC!)
    for (const sz of [-1, 1]) {
      const topRail = new THREE.Mesh(gg.box1, lm.silverAlum);
      topRail.scale.set(len - 0.012, 0.006, 0.012);
      topRail.position.set(0, yBodyTop - 0.002, sz * (dep * 0.5 - 0.010));
      g.add(topRail);
    }
    const barCnt = Math.min(42, Math.max(16, Math.floor((len - 0.04) / 0.032)));
    for (let bi = 0; bi < barCnt; bi++) {
      const bx = -(len - 0.04) * 0.5 + ((len - 0.04) * bi) / Math.max(1, barCnt - 1);
      const bar = new THREE.Mesh(gg.box1, lm.silverAlum);
      bar.scale.set(0.0095, 0.0055, dep - 0.028);
      bar.position.set(bx, yBodyTop - 0.002, 0);
      g.add(bar);
    }

    g.position.set(r.x, yBase, r.y);
    g.rotation.y = -yaw;
    rootGroup.add(g);

    // 5) Pastki 50 мм H-obrazniy Бинокль (oyoq yonida!) + tepa-yon Oventrop Uni LH M30×1.5 termogolovka!
    if (r.multiflexPt) {
      buildBottom50MultiflexNode3D(rootGroup, {
        mfX: r.multiflexPt[0],
        mfZ: r.multiflexPt[1],
        tapBottomY: yBase + yBodyBot,
        yBase,
        yaw,
        ux,
        uy,
        inNx,
        inNy,
        wallFaceOff: Number(r.wallFaceOff) || 0.135,
        isWallFeed: r.feedMount === 'wall',
      });
    }

    const sideSignWorld = r.connectionSide === 'left' ? -1 : 1;
    const trvWorldOrigin = new THREE.Vector3(
      r.x + ux * sideSignWorld * (len * 0.5),
      yBase + yBodyTop - 0.036,
      r.y + uy * sideSignWorld * (len * 0.5),
    );
    const trvWorldDir = new THREE.Vector3(ux * sideSignWorld, 0, uy * sideSignWorld).normalize();
    addOventropTrvHead3D(rootGroup, trvWorldOrigin, trvWorldDir);
    return;
  }

  // B. ВНУТРИПОЛЬНЫЙ КОНВЕКТОР (Royal Thermo Atrium Turbo / Konveka FH4-H)
  if (r.kind === 'convector') {
    const g = new THREE.Group();
    const len = Math.max(0.8, r.widthM || 1.4);
    const dep = Math.max(0.22, r.depthM || 0.25);
    const troughH = 0.078;
    const yRim = 0.016; // Pol yuzasi bilan tekis!

    const bottomPlate = new THREE.Mesh(gg.box1, lm.anthracite);
    bottomPlate.scale.set(len, 0.005, dep);
    bottomPlate.position.y = yRim - troughH;
    g.add(bottomPlate);

    for (const sz of [-1, 1]) {
      const sideWall = new THREE.Mesh(gg.box1, lm.anthracite);
      sideWall.scale.set(len, troughH, 0.005);
      sideWall.position.set(0, yRim - troughH * 0.5, sz * (dep * 0.5 - 0.0025));
      const rim = new THREE.Mesh(gg.box1, lm.silverAlum);
      rim.scale.set(len + 0.024, 0.006, 0.014);
      rim.position.set(0, yRim, sz * (dep * 0.5 + 0.004));
      g.add(sideWall, rim);
    }

    const hxSpan = len - 0.22;
    const zCoilA = -dep * 0.26;
    const zCoilB = -dep * 0.10;
    for (const zc of [zCoilA, zCoilB]) {
      const cuPipe = new THREE.Mesh(gg.cyl10, lm.copper);
      cuPipe.scale.set(0.0085, hxSpan, 0.0085);
      cuPipe.rotation.z = Math.PI * 0.5;
      cuPipe.position.set(0.04, yRim - 0.038, zc);
      g.add(cuPipe);
    }

    const finCnt = Math.min(34, Math.max(12, Math.floor(hxSpan / 0.032)));
    for (let fi = 0; fi < finCnt; fi++) {
      const fx = 0.04 - hxSpan * 0.48 + (hxSpan * 0.96 * fi) / Math.max(1, finCnt - 1);
      const fin = new THREE.Mesh(gg.box1, lm.silverAlum);
      fin.scale.set(0.0028, 0.048, 0.085);
      fin.position.set(fx, yRim - 0.038, (zCoilA + zCoilB) * 0.5);
      g.add(fin);
    }

    if ((Number(r.convectorSpeedPct) ?? 60) > 0) {
      const rotor = new THREE.Mesh(gg.cyl14, lm.anthracite);
      rotor.scale.set(0.020, hxSpan * 0.82, 0.020);
      rotor.rotation.z = Math.PI * 0.5;
      rotor.position.set(0.06, yRim - 0.042, dep * 0.22);
      const ecMotor = new THREE.Mesh(gg.cyl14, lm.imritaBlue);
      ecMotor.scale.set(0.024, 0.065, 0.024);
      ecMotor.rotation.z = Math.PI * 0.5;
      ecMotor.position.set(-hxSpan * 0.42, yRim - 0.042, dep * 0.22);
      g.add(rotor, ecMotor);
    }

    const servo = new THREE.Mesh(gg.cyl14, lm.radiatorWhite);
    servo.scale.set(0.016, 0.032, 0.016);
    servo.position.set(-len * 0.5 + 0.08, yRim - 0.028, zCoilA);
    g.add(servo);

    const isAlum = String(r.modelId || '').includes('konveka');
    const slatMat = isAlum ? lm.silverAlum : lm.oakGrille;
    const slatCnt = Math.min(36, Math.max(14, Math.floor((len - 0.03) / 0.036)));
    for (let si = 0; si < slatCnt; si++) {
      const sx = -(len - 0.04) * 0.5 + ((len - 0.04) * si) / Math.max(1, slatCnt - 1);
      const slat = new THREE.Mesh(gg.box1, slatMat);
      slat.scale.set(0.011, 0.006, dep - 0.018);
      slat.position.set(sx, yRim, 0);
      g.add(slat);
    }

    g.position.set(r.x, yBase, r.y);
    g.rotation.y = -yaw;
    rootGroup.add(g);
    return;
  }

  // C. ZAVOD LOD 400 RADIATORLAR (Panel 11/22/33 · Rifar Tubog Trubchali · Biliner/Revolution Sektsiyali)
  const radH = Math.max(0.30, Number(r.heightM) || 0.50);
  const len = Math.max(0.32, Number(r.widthM) || 1.00);
  const dep = Math.max(0.064, Number(r.depthM) || 0.10);
  const botY = yBase + (Number(r.zBottomM) || 0.12);
  const centerY = botY + radH * 0.5;
  const topHeaderY = centerY + radH * 0.40;
  const botHeaderY = centerY - radH * 0.40;
  const wallFaceOff = Number(r.wallFaceOff) || 0.105;

  const g = new THREE.Group();

  if (r.radType === 'tubular') {
    // 1) RIFAR TUBOG VENTIL: 2 qator silliq Ø25 vertikal po'lat ustunlar + yumaloq D-kollektorlar
    const cols = Math.max(8, Number(r.sections) || Math.round(len / 0.046));
    const colPitch = len / cols;
    const zRowOff = Math.min(0.022, dep * 0.30);

    for (const hy of [radH * 0.43, -radH * 0.43]) {
      const hdr = new THREE.Mesh(gg.cyl14, lm.radiatorWhite);
      hdr.scale.set(0.021, len - 0.016, 0.021);
      hdr.rotation.z = Math.PI * 0.5;
      hdr.position.y = hy;
      for (const sx of [-1, 1]) {
        const cap = new THREE.Mesh(gg.sphere10, lm.radiatorWhite);
        cap.scale.setScalar(0.021);
        cap.position.set(sx * (len - 0.016) * 0.5, hy, 0);
        g.add(cap);
      }
      g.add(hdr);
    }

    for (let ci = 0; ci < cols; ci++) {
      const cx = -len * 0.5 + colPitch * (ci + 0.5);
      for (const rz of [-zRowOff, zRowOff]) {
        const tube = new THREE.Mesh(gg.cyl14, lm.radiatorWhite);
        tube.scale.set(0.0125, radH * 0.85, 0.0125);
        tube.position.set(cx, 0, rz);
        tube.castShadow = true;
        g.add(tube);
      }
    }
  } else if (r.radType === 'sectional') {
    // 2) ROYAL THERMO BILINER / REVOLUTION / PIANOFORTE LOD 400:
    //    80 мм aerodinamik sektsiyalar + ikki qatorli yuqori konvektiv jalyuzi qanotlar +
    //    vertikal po'lat suv stvoli + EPDM prokladkalar + 4 ta oltiqirrali futerka-perehodnik 1"×1/2"!
    const secs = Math.max(4, Number(r.sections) || Math.round(len / 0.08));
    const secW = len / secs;
    const isPianoforte = String(r.modelId || '').includes('pianoforte');

    for (let s = 0; s < secs; s++) {
      const sx = -len * 0.5 + secW * (s + 0.5);
      const tiltZ = isPianoforte ? (s % 2 === 0 ? 0.035 : -0.025) : 0;

      // Old qavariq aerodinamik sektsiya qanoti
      const frontWing = new THREE.Mesh(gg.box1, lm.porcelain);
      frontWing.scale.set(secW * 0.88, radH * 0.86, 0.009);
      frontWing.position.set(sx, -0.022, dep * 0.44);
      frontWing.rotation.x = tiltZ;
      frontWing.castShadow = true;

      // Biliner xarakterli markaziy vertikal qirra
      const frontCrest = new THREE.Mesh(gg.box1, lm.radiatorWhite);
      frontCrest.scale.set(secW * 0.34, radH * 0.85, 0.006);
      frontCrest.position.set(sx, -0.022, dep * 0.48);
      frontCrest.rotation.x = tiltZ;

      // Ichki vertikal suv o'tkazuvchi stvol (Ø22 po'lat/alyumin yadro) + bo'ylama qovurg'a
      const riserCore = new THREE.Mesh(gg.cyl14, lm.radiatorWhite);
      riserCore.scale.set(0.012, radH * 0.84, 0.012);
      riserCore.position.set(sx, 0, 0);

      const webPlate = new THREE.Mesh(gg.box1, lm.radiatorWhite);
      webPlate.scale.set(0.006, radH * 0.84, dep * 0.82);
      webPlate.position.set(sx, -0.01, 0);

      // Orqa sektsiya plastinasi
      const backWing = new THREE.Mesh(gg.box1, lm.radiatorWhite);
      backWing.scale.set(secW * 0.85, radH * 0.90, 0.008);
      backWing.position.set(sx, -0.008, -dep * 0.44);

      // Yuqori qo'shaloq konvektiv jalyuzi qanotlar (24° va 40° qiyalikda!)
      const louvre1 = new THREE.Mesh(gg.box1, lm.porcelain);
      louvre1.scale.set(secW * 0.86, 0.008, dep * 0.44);
      louvre1.position.set(sx, radH * 0.465, dep * 0.16);
      louvre1.rotation.x = 0.42;

      const louvre2 = new THREE.Mesh(gg.box1, lm.porcelain);
      louvre2.scale.set(secW * 0.86, 0.008, dep * 0.38);
      louvre2.position.set(sx, radH * 0.425, dep * 0.22);
      louvre2.rotation.x = 0.65;

      // Konvektiv tirqish qorong'u chuqurligi
      const slotShadow = new THREE.Mesh(gg.box1, lm.anthracite);
      slotShadow.scale.set(secW * 0.78, 0.018, dep * 0.34);
      slotShadow.position.set(sx, radH * 0.435, dep * 0.06);

      g.add(frontWing, frontCrest, riserCore, webPlate, backWing, louvre1, louvre2, slotShadow);

      // Sektsiyalar orasidagi EPDM qora rezina halqalar (nippel birikmasi)
      if (s > 0) {
        const gx = -len * 0.5 + secW * s;
        for (const hy of [radH * 0.40, -radH * 0.40]) {
          const gasket = new THREE.Mesh(gg.cyl14, lm.epdmRing);
          gasket.scale.set(0.0215, 0.0032, 0.0215);
          gasket.rotation.z = Math.PI * 0.5;
          gasket.position.set(gx, hy, 0);
          g.add(gasket);
        }
      }
    }

    // Yuqori va pastki G 1" gorizontal kollektorlar + 4 ta burchak futerka-gaykalar (1"×1/2")
    for (const hy of [radH * 0.40, -radH * 0.40]) {
      const hdr = new THREE.Mesh(gg.cyl18, lm.radiatorWhite);
      hdr.scale.set(0.020, len, 0.020);
      hdr.rotation.z = Math.PI * 0.5;
      hdr.position.y = hy;
      g.add(hdr);

      for (const sx of [-1, 1]) {
        const oRing = new THREE.Mesh(gg.cyl14, lm.epdmRing);
        oRing.scale.set(0.0215, 0.0025, 0.0215);
        oRing.rotation.z = Math.PI * 0.5;
        oRing.position.set(sx * (len * 0.5 + 0.001), hy, 0);

        const reducerHex = new THREE.Mesh(gg.hexNut, lm.porcelain);
        reducerHex.scale.set(0.022, 0.011, 0.022);
        reducerHex.rotation.z = Math.PI * 0.5;
        reducerHex.position.set(sx * (len * 0.5 + 0.006), hy, 0);
        g.add(oRing, reducerHex);
      }
    }
  } else {
    // 3) ROYAL THERMO COMPACT C22 / KERMI PROFIL-V FTV (Tip 11 / 22 / 33) LOD 400:
    //    33.3 мм qadamli oq emal shtamplangan suv yostiqchalari + chuqur soya ariqchalari +
    //    haqiqiy П-obrazniy ichki po'lat zigzag konvektor qanotlari + ramkali ustki panjara!
    const pType = Number(r.panelType) || 22;
    const panelZs = pType === 11
      ? [dep * 0.34]
      : pType === 33
        ? [dep * 0.43, 0, -dep * 0.43]
        : [dep * 0.40, -dep * 0.40];

    for (const pz of panelZs) {
      // Shtamplangan asos va gorizontal suv kollektor kanallari
      const baseSheet = new THREE.Mesh(gg.box1, lm.radiatorWhite);
      baseSheet.scale.set(len - 0.006, radH - 0.008, 0.009);
      baseSheet.position.z = pz;
      baseSheet.castShadow = true;

      const topManifold = new THREE.Mesh(gg.box1, lm.porcelain);
      topManifold.scale.set(len - 0.020, 0.026, 0.015);
      topManifold.position.set(0, radH * 0.5 - 0.024, pz);

      const botManifold = new THREE.Mesh(gg.box1, lm.porcelain);
      botManifold.scale.set(len - 0.020, 0.026, 0.015);
      botManifold.position.set(0, -radH * 0.5 + 0.024, pz);
      g.add(baseSheet, topManifold, botManifold);
    }

    // Old (va orqa) panel yuzasidagi 33.3 мм qadamli oq shtamplangan suv kanallari!
    const pitchM = 0.0333;
    const chCount = Math.min(48, Math.max(10, Math.floor((len - 0.044) / pitchM)));
    const frontZ = panelZs[0];
    for (let ci = 0; ci < chCount; ci++) {
      const cx = -(len - 0.052) * 0.5 + ((len - 0.052) * ci) / Math.max(1, chCount - 1);
      const pillow = new THREE.Mesh(gg.box1, lm.porcelain);
      pillow.scale.set(0.019, radH - 0.056, 0.008);
      pillow.position.set(cx, 0, frontZ + 0.006);
      pillow.castShadow = true;
      g.add(pillow);
    }

    // Ichki po'lat konvektor qanotlari (haqiqiy П-obrazniy vertikal qovurg'alar!)
    const finRows = pType === 11 ? [0] : pType === 33 ? [dep * 0.21, -dep * 0.21] : [0];
    const zigCount = Math.min(36, Math.max(12, Math.floor((len - 0.05) / 0.036)));
    for (const fz of finRows) {
      for (let zi = 0; zi < zigCount; zi++) {
        const zx = -(len - 0.06) * 0.5 + ((len - 0.06) * zi) / Math.max(1, zigCount - 1);
        const fin = new THREE.Mesh(gg.box1, lm.silverAlum);
        fin.scale.set(0.003, radH - 0.054, Math.max(0.028, dep * 0.52 / finRows.length));
        fin.position.set(zx, 0, fz);
        g.add(fin);
      }
    }

    // Ustki dekorativ Kermi/Compact panjarasi (ramka + tirqishli ko'ndalang plitalar)
    for (const sz of [-1, 1]) {
      const topFrame = new THREE.Mesh(gg.box1, lm.porcelain);
      topFrame.scale.set(len, 0.010, 0.014);
      topFrame.position.set(0, radH * 0.5 + 0.002, sz * (dep * 0.44));
      g.add(topFrame);
    }
    const topSlots = Math.min(34, Math.max(10, Math.round(len / 0.034)));
    for (let bi = 0; bi < topSlots; bi++) {
      const bx = -len * 0.5 + 0.024 + ((len - 0.048) * bi) / Math.max(1, topSlots - 1);
      const bar = new THREE.Mesh(gg.box1, lm.porcelain);
      bar.scale.set(0.014, 0.008, dep * 0.88);
      bar.position.set(bx, radH * 0.5 + 0.002, 0);
      g.add(bar);
    }

    // Yon dekorativ qopqoqlar (боковины)
    for (const sx of [-len * 0.5 + 0.005, len * 0.5 - 0.005]) {
      const sideCover = new THREE.Mesh(gg.box1, lm.porcelain);
      sideCover.scale.set(0.010, radH + 0.008, dep * 0.92);
      sideCover.position.x = sx;
      sideCover.castShadow = true;
      g.add(sideCover);
    }
  }

  // Devor konsol-kronshteynlari (-Z orqa devorga qarab boradi!)
  const pinSpan = Math.max(0.04, wallFaceOff - dep * 0.44);
  const brkXs = len >= 1.35 ? [-len * 0.36, 0, len * 0.36] : [-len * 0.32, len * 0.32];
  for (const bx of brkXs) {
    for (const by of [radH * 0.28, -radH * 0.28]) {
      const pin = new THREE.Mesh(gg.cyl10, lm.radiatorWhite);
      pin.scale.set(0.0065, pinSpan, 0.0065);
      pin.rotation.x = Math.PI * 0.5;
      pin.position.set(bx, by, -dep * 0.44 - pinSpan * 0.5);
      const wallPlate = new THREE.Mesh(gg.cyl14, lm.stainless);
      wallPlate.scale.set(0.018, 0.005, 0.018);
      wallPlate.rotation.x = Math.PI * 0.5;
      wallPlate.position.set(bx, by, -wallFaceOff + 0.004);
      g.add(pin, wallPlate);
    }
  }

  g.position.set(r.x, centerY, r.y);
  g.rotation.y = -yaw;
  rootGroup.add(g);

  // =========================================================================
  // D. 1:1 ЗАПОРНО-РЕГУЛИРУЮЩАЯ АРМАТУРА (Бинокль 50 мм · Oventrop TRV + Запорный клапан 1/2" · Маевский)
  // =========================================================================
  const roomNormal3D = new THREE.Vector3(inNx, 0, inNy).normalize();
  const isWallFeed = r.feedMount !== 'floor';
  const leftTap = [r.x - ux * (len * 0.5), r.y - uy * (len * 0.5)];
  const rightTap = [r.x + ux * (len * 0.5), r.y + uy * (len * 0.5)];

  const addMayevsky3D = (tapXZ, yH, sideSign) => {
    const dir3 = new THREE.Vector3(ux * sideSign, 0, uy * sideSign).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_UP, dir3);
    const hex = new THREE.Mesh(gg.hexNut, lm.nickelBrass);
    hex.scale.set(0.014, 0.010, 0.014);
    hex.quaternion.copy(q);
    hex.position.set(tapXZ[0] + dir3.x * 0.009, yH, tapXZ[1] + dir3.z * 0.009);
    const cap = new THREE.Mesh(gg.cyl14, lm.porcelain);
    cap.scale.set(0.0105, 0.009, 0.0105);
    cap.quaternion.copy(q);
    cap.position.set(tapXZ[0] + dir3.x * 0.018, yH, tapXZ[1] + dir3.z * 0.018);
    const spout = new THREE.Mesh(gg.cyl10, lm.forgedBrass);
    spout.scale.set(0.0025, 0.006, 0.0025);
    spout.position.set(tapXZ[0] + dir3.x * 0.018, yH - 0.011, tapXZ[1] + dir3.z * 0.018);
    rootGroup.add(hex, cap, spout);
  };

  const addBlankingPlug3D = (tapXZ, yH, sideSign) => {
    const dir3 = new THREE.Vector3(ux * sideSign, 0, uy * sideSign).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_UP, dir3);
    const plug = new THREE.Mesh(gg.hexNut, lm.nickelBrass);
    plug.scale.set(0.014, 0.009, 0.014);
    plug.quaternion.copy(q);
    plug.position.set(tapXZ[0] + dir3.x * 0.009, yH, tapXZ[1] + dir3.z * 0.009);
    rootGroup.add(plug);
  };

  if (r.multiflexPt && r.hasMultiflex !== false) {
    buildBottom50MultiflexNode3D(rootGroup, {
      mfX: r.multiflexPt[0],
      mfZ: r.multiflexPt[1],
      tapBottomY: botY,
      yBase,
      yaw,
      ux,
      uy,
      inNx,
      inNy,
      wallFaceOff,
      isWallFeed,
    });

    const [mfX, mfZ] = r.multiflexPt;
    const nearRight = ((mfX - r.x) * ux + (mfZ - r.y) * uy) >= -0.01;
    const trvTap = nearRight ? rightTap : leftTap;
    const oppTap = nearRight ? leftTap : rightTap;
    const trvSign = nearRight ? 1 : -1;
    // Kermi Profil-V / Royal Thermo Ventil Compact zavod standarti:
    // Ichki M30×1.5 ventil vstavka va Oventrop termogolovka har doim radiatorning YUQORI YON TORTSIDAN
    // (боковой торец справа/слева, devorga parallel ux*trvSign yo'nalishda) chiqadi — old yuzasidan emas!
    const trvDir = new THREE.Vector3(ux * trvSign, 0, uy * trvSign).normalize();
    const insertBoss = new THREE.Mesh(gg.hexNut, lm.forgedBrass);
    insertBoss.scale.set(0.0155, 0.014, 0.0155);
    insertBoss.quaternion.setFromUnitVectors(_UP, trvDir);
    insertBoss.position.set(
      trvTap[0] + trvDir.x * 0.006,
      topHeaderY,
      trvTap[1] + trvDir.z * 0.006,
    );
    rootGroup.add(insertBoss);

    const trvOrigin = new THREE.Vector3(
      trvTap[0] + trvDir.x * 0.013,
      topHeaderY,
      trvTap[1] + trvDir.z * 0.013,
    );

    addOventropTrvHead3D(rootGroup, trvOrigin, trvDir);
    addMayevsky3D(oppTap, topHeaderY, -trvSign);
    addBlankingPlug3D(oppTap, botHeaderY, -trvSign);
  } else {
    // БОКОВОЕ / ДИАГОНАЛЬНОЕ 1/2" OVENTROP:
    // Yuqori T1 — Termostatik klapan + Amerikanka + Oventrop Uni LH M30×1.5
    // Pastki T2 — Zaporno-balansirovochniy klapan + Amerikanka + oltiqirrali qopqoq
    const isSide = r.connectionScheme === 'side';
    const supSign = -1;
    const retSign = isSide ? -1 : 1;
    const supTap = leftTap;
    const retTap = isSide ? leftTap : rightTap;

    const supValveX = supTap[0] + ux * supSign * 0.036;
    const supValveZ = supTap[1] + uy * supSign * 0.036;
    const retValveX = retTap[0] + ux * retSign * 0.036;
    const retValveZ = retTap[1] + uy * retSign * 0.036;

    // Amerikanka + klapan korpuslari
    addCylinderBetween3D(rootGroup, supTap[0], topHeaderY, supTap[1], supValveX, topHeaderY, supValveZ, 0.011, lm.nickelBrass);
    addCylinderBetween3D(rootGroup, retTap[0], botHeaderY, retTap[1], retValveX, botHeaderY, retValveZ, 0.011, lm.nickelBrass);

    for (const [vx, vy, vz, tapPt, sgn] of [
      [supValveX, topHeaderY, supValveZ, supTap, supSign],
      [retValveX, botHeaderY, retValveZ, retTap, retSign],
    ]) {
      const unionNut = new THREE.Mesh(gg.hexNut, lm.forgedBrass);
      unionNut.scale.set(0.016, 0.011, 0.016);
      unionNut.quaternion.setFromUnitVectors(_UP, new THREE.Vector3(ux * sgn, 0, uy * sgn).normalize());
      unionNut.position.set((tapPt[0] + vx) * 0.5, vy, (tapPt[1] + vz) * 0.5);

      const vBody = new THREE.Mesh(gg.cyl18, lm.nickelBrass);
      vBody.scale.set(0.014, 0.034, 0.014);
      vBody.position.set(vx, vy, vz);
      rootGroup.add(unionNut, vBody);
    }

    // Yuqori T1 Oventrop termogolovka + Pastki T2 balans qopqoqchasi
    addOventropTrvHead3D(rootGroup, new THREE.Vector3(supValveX, topHeaderY, supValveZ), roomNormal3D);
    const lockCap = new THREE.Mesh(gg.hexNut, lm.nickelBrass);
    lockCap.scale.set(0.013, 0.014, 0.013);
    lockCap.quaternion.setFromUnitVectors(_UP, roomNormal3D);
    lockCap.position.set(retValveX + inNx * 0.014, botHeaderY, retValveZ + inNy * 0.014);
    rootGroup.add(lockCap);

    // Bo'sh shtutserlarga Mayevskiy va zaglushka
    addMayevsky3D(rightTap, topHeaderY, 1);
    if (isSide) addBlankingPlug3D(rightTap, botHeaderY, 1);
    else addBlankingPlug3D(leftTap, botHeaderY, -1);

    // Podvodka xrom trubkalari + rozetkalar
    if (isWallFeed) {
      const wDist = Math.max(0.045, wallFaceOff - 0.006);
      const wSupX = supValveX - inNx * wDist;
      const wSupZ = supValveZ - inNy * wDist;
      const wRetX = retValveX - inNx * wDist;
      const wRetZ = retValveZ - inNy * wDist;
      addCylinderBetween3D(rootGroup, supValveX, topHeaderY, supValveZ, wSupX, topHeaderY, wSupZ, 0.0085, lm.stainless);
      addCylinderBetween3D(rootGroup, retValveX, botHeaderY, retValveZ, wRetX, botHeaderY, wRetZ, 0.0085, lm.stainless);
      addRosetteDisc3D(rootGroup, wSupX, topHeaderY, wSupZ, roomNormal3D);
      addRosetteDisc3D(rootGroup, wRetX, botHeaderY, wRetZ, roomNormal3D);
      // Shtraba tushishi
      if (r.supplyPort) addCylinderBetween3D(rootGroup, wSupX, topHeaderY, wSupZ, r.supplyPort[0], yBase + r.supplyPort[2], r.supplyPort[1], 0.0085, lm.energoflexRed);
    } else if (r.supplyPort && r.returnPort) {
      addCylinderBetween3D(rootGroup, r.supplyPort[0], yBase + 0.008, r.supplyPort[1], supValveX, topHeaderY, supValveZ, 0.0085, lm.stainless);
      addCylinderBetween3D(rootGroup, r.returnPort[0], yBase + 0.008, r.returnPort[1], retValveX, botHeaderY, retValveZ, 0.0085, lm.stainless);
      addRosetteDisc3D(rootGroup, r.supplyPort[0], yBase + 0.009, r.supplyPort[1], _UP);
      addRosetteDisc3D(rootGroup, r.returnPort[0], yBase + 0.009, r.returnPort[1], _UP);
    }
  }
}

/**
 * 1B. LOD 400 ТРУБОПРОВОДНЫЕ ФИТИНГИ ОТОПЛЕНИЯ:
 *     - TE-SA Press (металлопластик PE-X/Al/PE-X): латунный корпус CW617N + чёрное диэлектрическое кольцо ПЭ +
 *       нержавеющая пресс-гильза AISI 304 с контрольными окошками (Тройники 822/824/825, Угольники 812, Муфты 803, Евроконусы, Обводы)!
 *     - Pro Aqua PP-R: полипропиленовые сварные раструбы!
 */
function addPressOrPprSocket3D(parent, centerVec, dirVec, dnMm = 16, isPpr = false) {
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();
  const dNorm = dirVec.clone();
  if (dNorm.lengthSq() < 1e-6) dNorm.set(1, 0, 0);
  dNorm.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_UP, dNorm);
  const rPipe = Math.max(0.008, (Number(dnMm) || 16) * 0.0005);

  if (isPpr) {
    // Pro Aqua PP-R oq payvand rastrub gilzasi
    const bell = new THREE.Mesh(gg.cyl14, lm.porcelain);
    bell.scale.set(rPipe * 1.42, rPipe * 2.1, rPipe * 1.42);
    bell.quaternion.copy(q);
    bell.position.copy(centerVec).addScaledVector(dNorm, rPipe * 1.15);
    parent.add(bell);
    return;
  }

  // TE-SA Press LOD 400 razryadi:
  // 1) Latun korpus bo'yni (CW617N)
  const brassNeck = new THREE.Mesh(gg.cyl14, lm.forgedBrass);
  brassNeck.scale.set(rPipe * 1.08, rPipe * 0.95, rPipe * 1.08);
  brassNeck.quaternion.copy(q);
  brassNeck.position.copy(centerVec).addScaledVector(dNorm, rPipe * 0.55);

  // 2) Qora dielektrik ajratuvchi halqa (galvanik korroziyadan himoya — TE-SA vizit kartasi!)
  const dielRing = new THREE.Mesh(gg.cyl14, lm.epdmRing);
  dielRing.scale.set(rPipe * 1.30, 0.0042, rPipe * 1.30);
  dielRing.quaternion.copy(q);
  dielRing.position.copy(centerVec).addScaledVector(dNorm, rPipe * 1.08);

  // 3) AISI 304 zanglamas po'lat press-gilza + kontrol darchasi halqasi + kengaygan bortik!
  const sleeveLen = Math.max(0.017, rPipe * 1.85);
  const sleeve = new THREE.Mesh(gg.cyl18, lm.stainless);
  sleeve.scale.set(rPipe * 1.26, sleeveLen, rPipe * 1.26);
  sleeve.quaternion.copy(q);
  sleeve.position.copy(centerVec).addScaledVector(dNorm, rPipe * 1.12 + sleeveLen * 0.5);

  // Kontrol darchasi (qoramtir indikatsiya kamari — truba to'liq kirganini ko'rsatadi!)
  const winBand = new THREE.Mesh(gg.cyl14, lm.anthracite);
  winBand.scale.set(rPipe * 1.275, 0.0030, rPipe * 1.275);
  winBand.quaternion.copy(q);
  winBand.position.copy(centerVec).addScaledVector(dNorm, rPipe * 1.32);

  // Press-gilza kirish faskasi (развальцовка)
  const flareRim = new THREE.Mesh(gg.cyl18, lm.stainless);
  flareRim.scale.set(rPipe * 1.35, 0.0026, rPipe * 1.35);
  flareRim.quaternion.copy(q);
  flareRim.position.copy(centerVec).addScaledVector(dNorm, rPipe * 1.12 + sleeveLen);

  parent.add(brassNeck, dielRing, sleeve, winBand, flareRim);
}

export function buildHeatingNetworkFittingsLod4003D(rootGroup, flOv, yBase) {
  if (!flOv?.radFittings?.length) return;
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();

  for (const ft of flOv.radFittings) {
    const isPpr = String(ft.pipeFamilyId || '').includes('ppr');
    const center = new THREE.Vector3(ft.x, yBase + (Number(ft.z) || 0.042), ft.y);
    const rMain = Math.max(0.008, (Number(ft.dnMm) || 16) * 0.0005);
    const bodyMat = isPpr ? lm.porcelain : lm.forgedBrass;

    if (ft.kind === 'tee') {
      // TE-SA 822 / 824 / 825 Равнопроходной и Переходной Пресс-тройник (masalan 26×16×20)
      const hub = new THREE.Mesh(gg.sphere10, bodyMat);
      hub.scale.setScalar(rMain * (isPpr ? 1.48 : 1.24));
      hub.position.copy(center);
      rootGroup.add(hub);

      const dA = new THREE.Vector3(ft.dirA?.[0] ?? -1, ft.dirA?.[2] ?? 0, ft.dirA?.[1] ?? 0);
      const dB = new THREE.Vector3(ft.dirB?.[0] ?? 1, ft.dirB?.[2] ?? 0, ft.dirB?.[1] ?? 0);
      const dBr = new THREE.Vector3(ft.dirBranch?.[0] ?? 0, ft.dirBranch?.[2] ?? 1, ft.dirBranch?.[1] ?? 0);

      addPressOrPprSocket3D(rootGroup, center, dA, ft.dnMm || 20, isPpr);
      addPressOrPprSocket3D(rootGroup, center, dB, ft.outDnMm || ft.dnMm || 20, isPpr);
      addPressOrPprSocket3D(rootGroup, center, dBr, ft.branchDnMm || 16, isPpr);
    } else if (ft.kind === 'elbow_90') {
      // TE-SA 812 Угольник пресс 90°
      const knee = new THREE.Mesh(gg.sphere10, bodyMat);
      knee.scale.setScalar(rMain * (isPpr ? 1.44 : 1.20));
      knee.position.copy(center);
      rootGroup.add(knee);

      const dA = new THREE.Vector3(ft.dirA?.[0] ?? -1, ft.dirA?.[2] ?? 0, ft.dirA?.[1] ?? 0);
      const dB = new THREE.Vector3(ft.dirB?.[0] ?? 0, ft.dirB?.[2] ?? 1, ft.dirB?.[1] ?? 0);
      addPressOrPprSocket3D(rootGroup, center, dA, ft.dnMm || 16, isPpr);
      addPressOrPprSocket3D(rootGroup, center, dB, ft.outDnMm || ft.dnMm || 16, isPpr);
    } else if (ft.kind === 'reducer') {
      // TE-SA 803 Муфта переходная пресс (шестигранный буртик + 2 гильзы разного диаметра)
      const dA = new THREE.Vector3(ft.dirA?.[0] ?? 1, ft.dirA?.[2] ?? 0, ft.dirA?.[1] ?? 0).normalize();
      const hex = new THREE.Mesh(gg.hexNut, bodyMat);
      hex.scale.set(rMain * 1.40, 0.011, rMain * 1.40);
      hex.quaternion.setFromUnitVectors(_UP, dA);
      hex.position.copy(center);
      rootGroup.add(hex);

      addPressOrPprSocket3D(rootGroup, center, dA.clone().negate(), ft.dnMm || 20, isPpr);
      addPressOrPprSocket3D(rootGroup, center, dA, ft.outDnMm || 16, isPpr);
    } else if (ft.kind === 'adapter_ek') {
      // TE-SA Евроконус 3/4"×16 (kollektor portida)
      const dA = new THREE.Vector3(ft.dirA?.[0] ?? 0, ft.dirA?.[2] ?? -1, ft.dirA?.[1] ?? 0).normalize();
      const ekNut = new THREE.Mesh(gg.hexNut, lm.forgedBrass);
      ekNut.scale.set(0.016, 0.012, 0.016);
      ekNut.quaternion.setFromUnitVectors(_UP, dA);
      ekNut.position.copy(center);
      rootGroup.add(ekNut);

      addPressOrPprSocket3D(rootGroup, center.clone().addScaledVector(dA, 0.005), dA, ft.dnMm || 16, false);
    } else if (ft.kind === 'obvod') {
      // LOD 400 Обвод ikki uchidagi press-muftalar / PP-R rastrublar!
      const dA = new THREE.Vector3(ft.dirA?.[0] ?? 1, 0, ft.dirA?.[1] ?? 0);
      if (dA.lengthSq() < 1e-6) dA.set(1, 0, 0);
      dA.normalize();
      const pEntry = center.clone().addScaledVector(dA, -0.050);
      const pExit = center.clone().addScaledVector(dA, 0.050);
      addPressOrPprSocket3D(rootGroup, pEntry, dA.clone().negate(), ft.dnMm || 16, isPpr);
      addPressOrPprSocket3D(rootGroup, pExit, dA, ft.dnMm || 16, isPpr);
    }
  }
}

/**
 * 2. LOD 400 КОЛЛЕКТОРНЫЕ ШКАФЫ ШРВ (8468 с расходомерами) и ШРВ-Р (7200S) + Красная/Синяя теплоизоляция Energoflex!
 */
export function buildCollectorCabinetLod4003D(rootGroup, col, yBase, withRotameters = true) {
  if (!col) return;
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();

  const ports = Math.max(2, Math.min(13, Number(col.ports) || 6));
  const pitch = 0.050;
  const barLen = ports * pitch + 0.11;
  const cabW = barLen + 0.16;
  const cabH = 0.56;
  const cabD = 0.12;
  const g = new THREE.Group();

  // Ochiq ramkali oq po'lat shkaf (ichki barcha detallar 100% ko'rinib turadi!)
  const backPlate = new THREE.Mesh(gg.box1, lm.radiatorWhite);
  backPlate.scale.set(cabW, cabH, 0.008);
  backPlate.position.set(0, cabH * 0.5, -cabD * 0.45);
  g.add(backPlate);

  for (const sy of [0.008, cabH - 0.008]) {
    const rail = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    rail.scale.set(cabW, 0.016, cabD);
    rail.position.set(0, sy, 0);
    g.add(rail);
  }
  for (const sx of [-cabW * 0.5 + 0.008, cabW * 0.5 - 0.008]) {
    const post = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    post.scale.set(0.016, cabH, cabD);
    post.position.set(sx, cabH * 0.5, 0);
    g.add(post);
  }

  // Zanglamas po'lat T1 (yuqori) va T2 (pastki) kollektor balka-grebyonkalari
  const ySup = 0.40;
  const yRet = 0.22;
  const barSup = new THREE.Mesh(gg.box1, lm.stainless);
  barSup.scale.set(barLen, 0.036, 0.036);
  barSup.position.set(0.02, ySup, 0.01);
  const barRet = barSup.clone();
  barRet.position.set(0.02, yRet, 0.01);
  g.add(barSup, barRet);

  // Chap tomonda: Kirish sharovoy kranlari (qizil/ko'k kapalak tutqichli) + dumaloq termometrlar!
  const leftX = -barLen * 0.5 - 0.015;
  for (const [yy, hMat] of [[ySup, lm.grundfosRed], [yRet, lm.valveBlue]]) {
    const vBody = new THREE.Mesh(gg.cyl14, lm.nickelBrass);
    vBody.scale.set(0.018, 0.044, 0.018);
    vBody.rotation.z = Math.PI * 0.5;
    vBody.position.set(leftX, yy, 0.01);

    const wing = new THREE.Mesh(gg.box1, hMat);
    wing.scale.set(0.044, 0.014, 0.010);
    wing.position.set(leftX, yy, 0.034);

    const therm = new THREE.Mesh(gg.cyl14, lm.porcelain);
    therm.scale.set(0.019, 0.010, 0.019);
    therm.rotation.x = Math.PI * 0.5;
    therm.position.set(leftX + 0.034, yy, 0.032);
    g.add(vBody, wing, therm);
  }

  // O'ng tomonda: Avtomatik latun vozduxootvodchik + slivnoy kran!
  const rightX = barLen * 0.5 + 0.032;
  for (const yy of [ySup, yRet]) {
    const vent = new THREE.Mesh(gg.cyl14, lm.forgedBrass);
    vent.scale.set(0.014, 0.038, 0.014);
    vent.position.set(rightX, yy + 0.032, 0.01);
    const drain = new THREE.Mesh(gg.cyl10, lm.forgedBrass);
    drain.scale.set(0.008, 0.028, 0.008);
    drain.position.set(rightX, yy - 0.026, 0.01);
    g.add(vent, drain);
  }

  // Har bir kontur chiqishida: Shaffof shisha rotametr + qizil poqildoq, ko'k servoprivod, olti qirrali Yevrokonus
  // va GalfDesign uslubidagi QIZIL / KO'K Energoflex teploizolyatsiya gilzalari!
  const startPortX = -((ports - 1) * pitch) * 0.5 + 0.02;
  for (let p = 0; p < ports; p++) {
    const px = startPortX + p * pitch;

    if (withRotameters) {
      // T1 tepasida shaffof rotametr kolbasi + qizil indikator
      const glass = new THREE.Mesh(gg.cyl14, lm.rotameterGlass);
      glass.scale.set(0.0085, 0.038, 0.0085);
      glass.position.set(px, ySup + 0.038, 0.01);
      const redFloat = new THREE.Mesh(gg.cyl10, lm.grundfosRed);
      redFloat.scale.set(0.006, 0.008, 0.006);
      redFloat.position.set(px, ySup + 0.034 + (p % 3) * 0.004, 0.01);
      g.add(glass, redFloat);

      // T2 tepasida ko'k elektrotermik servoprivod (yoki oq termoklapan qopqog'i)
      const servo = new THREE.Mesh(gg.cyl14, lm.servoBlue);
      servo.scale.set(0.013, 0.034, 0.013);
      servo.position.set(px, yRet + 0.036, 0.01);
      g.add(servo);
    } else {
      // 7200S radiator kollektorida har bir shoxobchada qizil/ko'k sharovoy kran tutqichi
      const hSup = new THREE.Mesh(gg.box1, lm.grundfosRed);
      hSup.scale.set(0.014, 0.022, 0.010);
      hSup.position.set(px, ySup + 0.026, 0.024);
      const hRet = new THREE.Mesh(gg.box1, lm.valveBlue);
      hRet.scale.set(0.014, 0.022, 0.010);
      hRet.position.set(px, yRet + 0.026, 0.024);
      g.add(hSup, hRet);
    }

    // Yevrokonus gaykalari (3/4" ЕК)
    const ekSup = new THREE.Mesh(gg.hexNut, lm.forgedBrass);
    ekSup.scale.set(0.012, 0.014, 0.012);
    ekSup.position.set(px - 0.008, ySup - 0.026, 0.004);
    const ekRet = ekSup.clone();
    ekRet.position.set(px + 0.008, yRet - 0.026, 0.018);
    g.add(ekSup, ekRet);

    // Polgacha tushuvchi trubalar + Qizil / Ko'k Energoflex 18×6mm teploizolyatsiya gilzalari!
    addCylinderBetween3D(g, px - 0.008, 0.02, 0.004, px - 0.008, ySup - 0.028, 0.004, 0.008, lm.porcelain);
    addCylinderBetween3D(g, px + 0.008, 0.02, 0.018, px + 0.008, yRet - 0.028, 0.018, 0.008, lm.porcelain);

    addCylinderBetween3D(g, px - 0.008, 0.02, 0.004, px - 0.008, 0.16, 0.004, 0.0135, lm.energoflexRed);
    addCylinderBetween3D(g, px + 0.008, 0.02, 0.018, px + 0.008, 0.14, 0.018, 0.0135, lm.energoflexBlue);
  }

  g.position.set(col.x, yBase + 0.06, col.y);
  rootGroup.add(g);
}

/**
 * 3. LOD 400 САНТЕХНИЧЕСКИЕ ПРИБОРЫ ВК + РАСТРУБЫ КАНАЛИЗАЦИИ OSTENDORF / PRO AQUA
 */
export function buildSanitaryFixtureLod4003D(rootGroup, fx, yBase) {
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();
  const w = fx.wM || 0.50;
  const d = fx.dM || 0.50;
  const g = new THREE.Group();
  g.position.set(fx.x, yBase, fx.y);
  g.rotation.y = -((Number(fx.rotDeg) || 0) * Math.PI) / 180;

  if (fx.type === 'wc') {
    // Osma unitaz + Geberit Sigma xrom ikki tugmali installyatsiya paneli!
    const frame = new THREE.Mesh(gg.box1, lm.imritaBlue);
    frame.scale.set(0.48, 1.08, 0.12);
    frame.position.set(0, 0.54, -d * 0.36);

    const sigmaPlate = new THREE.Mesh(gg.box1, lm.stainless);
    sigmaPlate.scale.set(0.24, 0.16, 0.016);
    sigmaPlate.position.set(0, 0.96, -d * 0.29);

    const btnBig = new THREE.Mesh(gg.cyl14, lm.nickelBrass);
    btnBig.scale.set(0.028, 0.018, 0.028);
    btnBig.rotation.x = Math.PI * 0.5;
    btnBig.position.set(-0.038, 0.96, -d * 0.282);
    const btnSmall = btnBig.clone();
    btnSmall.scale.set(0.019, 0.018, 0.019);
    btnSmall.position.x = 0.042;

    const bowl = new THREE.Mesh(gg.cyl18, lm.porcelain);
    bowl.scale.set(0.18, 0.30, 0.24);
    bowl.position.set(0, 0.28, 0.06);
    bowl.castShadow = true;

    const seat = new THREE.Mesh(gg.cyl18, lm.porcelain);
    seat.scale.set(0.185, 0.028, 0.245);
    seat.position.set(0, 0.43, 0.06);

    g.add(frame, sigmaPlate, btnBig, btnSmall, bowl, seat);
  } else if (fx.type === 'bath') {
    const tubH = 0.56;
    const wallT = 0.065;
    const base = new THREE.Mesh(gg.box1, lm.porcelain);
    base.scale.set(w, 0.10, d);
    base.position.y = 0.05;

    const rimF = new THREE.Mesh(gg.box1, lm.porcelain);
    rimF.scale.set(w, tubH - 0.10, wallT);
    rimF.position.set(0, 0.33, d * 0.5 - wallT * 0.5);
    const rimB = rimF.clone();
    rimB.position.z = -d * 0.5 + wallT * 0.5;

    const rimL = new THREE.Mesh(gg.box1, lm.porcelain);
    rimL.scale.set(wallT * 1.2, tubH - 0.10, d - wallT * 2);
    rimL.position.set(-w * 0.5 + wallT * 0.6, 0.33, 0);
    const rimR = rimL.clone();
    rimR.position.x = w * 0.5 - wallT * 0.6;

    const water = new THREE.Mesh(gg.box1, lm.waterSheet);
    water.scale.set(w - wallT * 2.6, 0.02, d - wallT * 2.2);
    water.position.set(0, 0.35, 0);

    const mixer = new THREE.Mesh(gg.box1, lm.stainless);
    mixer.scale.set(0.06, 0.11, 0.16);
    mixer.position.set(-w * 0.5 + wallT * 0.6, tubH + 0.05, 0);

    g.add(base, rimF, rimB, rimL, rimR, water, mixer);
  } else if (fx.type === 'shower') {
    const tray = new THREE.Mesh(gg.box1, lm.porcelain);
    tray.scale.set(w, 0.055, d);
    tray.position.y = 0.028;

    const drainSlot = new THREE.Mesh(gg.box1, lm.stainless);
    drainSlot.scale.set(w * 0.72, 0.012, 0.06);
    drainSlot.position.set(0, 0.058, -d * 0.34);

    const glassSide = new THREE.Mesh(gg.box1, lm.showerGlass);
    glassSide.scale.set(0.014, 1.95, d);
    glassSide.position.set(-w * 0.5 + 0.018, 1.00, 0);

    const prof = new THREE.Mesh(gg.box1, lm.anthracite);
    prof.scale.set(0.024, 1.96, 0.024);
    prof.position.set(-w * 0.5 + 0.018, 1.00, d * 0.5 - 0.018);

    const col = new THREE.Mesh(gg.cyl10, lm.stainless);
    col.scale.set(0.012, 1.05, 0.012);
    col.position.set(0, 1.56, -d * 0.44);

    const thermoBar = new THREE.Mesh(gg.cyl14, lm.stainless);
    thermoBar.scale.set(0.020, 0.26, 0.020);
    thermoBar.rotation.z = Math.PI * 0.5;
    thermoBar.position.set(0, 1.05, -d * 0.42);

    const rainHead = new THREE.Mesh(gg.cyl18, lm.stainless);
    rainHead.scale.set(0.13, 0.016, 0.13);
    rainHead.position.set(0, 2.06, -d * 0.16);

    g.add(tray, drainSlot, glassSide, prof, col, thermoBar, rainHead);
  } else if (fx.type === 'kitchen_sink') {
    const counter = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    counter.scale.set(w + 0.04, 0.84, d + 0.02);
    counter.position.y = 0.42;

    const deck = new THREE.Mesh(gg.box1, lm.stainless);
    deck.scale.set(w, 0.028, d);
    deck.position.y = 0.855;

    const basin = new THREE.Mesh(gg.box1, lm.anthracite);
    basin.scale.set(w * 0.50, 0.018, d * 0.72);
    basin.position.set(-w * 0.18, 0.866, 0.02);

    const stem = new THREE.Mesh(gg.cyl14, lm.stainless);
    stem.scale.set(0.015, 0.20, 0.015);
    stem.position.set(-w * 0.18, 0.96, -d * 0.30);

    const arc = new THREE.Mesh(gg.torusHalf, lm.stainless);
    arc.rotation.y = Math.PI * 0.5;
    arc.scale.setScalar(0.095);
    arc.position.set(-w * 0.18, 1.06, -d * 0.205);

    g.add(counter, deck, basin, stem, arc);
  } else if (fx.type === 'washer') {
    const box = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    box.scale.set(w, 0.85, d);
    box.position.y = 0.425;
    box.castShadow = true;

    const ctrl = new THREE.Mesh(gg.box1, lm.anthracite);
    ctrl.scale.set(w - 0.02, 0.11, 0.02);
    ctrl.position.set(0, 0.77, d * 0.5 + 0.005);

    const lcd = new THREE.Mesh(gg.box1, lm.lcdScreen);
    lcd.scale.set(0.12, 0.042, 0.008);
    lcd.position.set(w * 0.22, 0.77, d * 0.5 + 0.016);

    const bezel = new THREE.Mesh(gg.cyl18, lm.anthracite);
    bezel.scale.set(0.19, 0.032, 0.19);
    bezel.rotation.x = Math.PI * 0.5;
    bezel.position.set(0, 0.43, d * 0.5 + 0.008);

    const glass = new THREE.Mesh(gg.cyl18, lm.showerGlass);
    glass.scale.set(0.15, 0.038, 0.15);
    glass.rotation.x = Math.PI * 0.5;
    glass.position.set(0, 0.43, d * 0.5 + 0.012);

    g.add(box, ctrl, lcd, bezel, glass);
  } else if (fx.type === 'floor_drain') {
    const frame = new THREE.Mesh(gg.box1, lm.stainless);
    frame.scale.set(w, 0.022, d);
    frame.position.y = 0.012;
    const slot = new THREE.Mesh(gg.box1, lm.anthracite);
    slot.scale.set(w * 0.76, 0.010, d * 0.76);
    slot.position.y = 0.020;
    g.add(frame, slot);
  } else {
    // Umivalnik + yog'och osma tumba + silliq chanoq + smesitel + xrom sifon + dumaloq LED oyna!
    const cab = new THREE.Mesh(gg.box1, lm.vanityWood);
    cab.scale.set(w - 0.02, 0.44, d - 0.02);
    cab.position.y = 0.56;
    cab.castShadow = true;

    const slab = new THREE.Mesh(gg.box1, lm.porcelain);
    slab.scale.set(w, 0.055, d);
    slab.position.y = 0.81;

    const vessel = new THREE.Mesh(gg.cyl18, lm.porcelain);
    vessel.scale.set(w * 0.36, 0.11, d * 0.34);
    vessel.position.set(0, 0.88, 0.02);

    const faucet = new THREE.Mesh(gg.cyl10, lm.stainless);
    faucet.scale.set(0.014, 0.18, 0.014);
    faucet.position.set(0, 0.93, -d * 0.30);
    const spout = new THREE.Mesh(gg.box1, lm.stainless);
    spout.scale.set(0.020, 0.015, 0.11);
    spout.position.set(0, 1.00, -d * 0.24);

    const siphon = new THREE.Mesh(gg.cyl10, lm.stainless);
    siphon.scale.set(0.020, 0.16, 0.020);
    siphon.position.set(0, 0.26, 0);

    const mirror = new THREE.Mesh(gg.cyl18, lm.mirrorGlow);
    const mr = Math.min(0.32, w * 0.46);
    mirror.scale.set(mr, 0.016, mr);
    mirror.rotation.x = Math.PI * 0.5;
    mirror.position.set(0, 1.42, -d * 0.5 + 0.015);

    g.add(cab, slab, vessel, faucet, spout, siphon, mirror);
  }

  rootGroup.add(g);
}

/**
 * Ostendorf HTsafe (kulrang Ø50) va KG (olovrang Ø110) rastrub muftasi + qora EPDM salnik halqasi!
 */
export function addSewerRastrubSocket3D(rootGroup, posVec, dirVec, is110 = true) {
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();
  const rad = is110 ? 0.055 : 0.027;
  const bellLen = is110 ? 0.095 : 0.056;
  const bellR = rad * 1.25;
  const bodyMat = is110 ? lm.ostendorfOrange : lm.ostendorfGray;
  const dNorm = dirVec.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_UP, dNorm);

  const neck = new THREE.Mesh(gg.coneBell, bodyMat);
  neck.scale.set(rad, bellLen * 0.40, rad);
  neck.quaternion.copy(q);
  neck.position.copy(posVec).addScaledVector(dNorm, bellLen * 0.20);

  const socket = new THREE.Mesh(gg.cyl14, bodyMat);
  socket.scale.set(bellR, bellLen * 0.60, bellR);
  socket.quaternion.copy(q);
  socket.position.copy(posVec).addScaledVector(dNorm, bellLen * 0.70);

  const epdm = new THREE.Mesh(gg.cyl14, lm.epdmRing);
  epdm.scale.set(bellR * 1.05, bellLen * 0.16, bellR * 1.05);
  epdm.quaternion.copy(q);
  epdm.position.copy(posVec).addScaledVector(dNorm, bellLen * 1.02);

  rootGroup.add(neck, socket, epdm);
}

/**
 * 4. LOD 400 КОТЕЛЬНАЯ (ТМ): Котёл Bathello/Viessmann + Гидрострелка и 3 Насосные группы + БКН + РБ + ХВО Imrita + ЩА ZONT!
 */
export function buildBoilerRoomEquipmentLod4003D(rootGroup, eq, yBase) {
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();
  const g = new THREE.Group();
  g.position.set(eq.x, yBase, eq.y);

  if (eq.kind === 'boiler') {
    const zBot = eq.zM || 0.95;
    const w = eq.wM || 0.45;
    const h = eq.hM || 0.76;
    const d = eq.dM || 0.36;

    // Osma kondensatsion gaz qozoni oq korpusi + old fasad paneli + qora LCD kokpit
    const body = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    body.scale.set(w, h, d);
    body.position.y = zBot + h * 0.5;
    body.castShadow = true;

    const doorBevel = new THREE.Mesh(gg.box1, lm.porcelain);
    doorBevel.scale.set(w - 0.03, h - 0.04, 0.018);
    doorBevel.position.set(0, zBot + h * 0.5, d * 0.5 + 0.008);

    const cockpit = new THREE.Mesh(gg.box1, lm.anthracite);
    cockpit.scale.set(0.22, 0.11, 0.022);
    cockpit.position.set(0, zBot + 0.14, d * 0.5 + 0.016);

    const lcd = new THREE.Mesh(gg.box1, lm.lcdScreen);
    lcd.scale.set(0.095, 0.055, 0.008);
    lcd.position.set(0, zBot + 0.145, d * 0.5 + 0.026);

    // Pastki 5 ta latun sharoaviy kran + kosoy gryazevik filtr!
    const xs = [-0.14, -0.07, 0, 0.07, 0.14];
    xs.forEach((px, idx) => {
      const pipe = new THREE.Mesh(gg.cyl10, lm.stainless);
      pipe.scale.set(0.013, 0.16, 0.013);
      pipe.position.set(px, zBot - 0.08, 0);
      const valve = new THREE.Mesh(gg.cyl14, lm.forgedBrass);
      valve.scale.set(0.018, 0.036, 0.018);
      valve.position.set(px, zBot - 0.10, 0);
      const wing = new THREE.Mesh(gg.box1, idx === 2 ? lm.forgedBrass : idx % 2 === 0 ? lm.grundfosRed : lm.valveBlue);
      wing.scale.set(0.036, 0.012, 0.010);
      wing.position.set(px, zBot - 0.10, 0.022);
      g.add(pipe, valve, wing);
    });

    // Koaksial Ø60/100 mo'ri tirsagi + EPDM devor manjeti
    const flueRise = new THREE.Mesh(gg.cyl14, lm.porcelain);
    flueRise.scale.set(0.050, 0.28, 0.050);
    flueRise.position.set(0, zBot + h + 0.14, 0);
    const flueElbow = new THREE.Mesh(gg.sphere10, lm.porcelain);
    flueElbow.scale.setScalar(0.054);
    flueElbow.position.set(0, zBot + h + 0.28, 0);
    const flueWall = new THREE.Mesh(gg.cyl14, lm.porcelain);
    flueWall.scale.set(0.050, 0.26, 0.050);
    flueWall.rotation.x = Math.PI * 0.5;
    flueWall.position.set(0, zBot + h + 0.28, -0.13);
    const collar = new THREE.Mesh(gg.cyl14, lm.epdmRing);
    collar.scale.set(0.076, 0.014, 0.076);
    collar.rotation.x = Math.PI * 0.5;
    collar.position.set(0, zBot + h + 0.28, -0.22);

    g.add(body, doorBevel, cockpit, lcd, flueRise, flueElbow, flueWall, collar);
  } else if (eq.kind === 'manifold_tm') {
    // EPP qora izolyatsiyali Gidrostrelka + Kollektor 22186 + 3 ta Nasos guruhi (Grundfos + termometrlar + 8784A 3-xodovoy)!
    const zMid = eq.zM || 1.05;
    const gsVert = new THREE.Mesh(gg.box1, lm.eppBlack);
    gsVert.scale.set(0.11, 0.48, 0.12);
    gsVert.position.set(-0.26, zMid, 0);

    const headerHoriz = new THREE.Mesh(gg.box1, lm.eppBlack);
    headerHoriz.scale.set(0.56, 0.14, 0.13);
    headerHoriz.position.set(0.06, zMid, 0);
    g.add(gsVert, headerHoriz);

    // 3 ta nasos guruhi: НК-1 (Радиаторы), НК-2 (Тёплый пол с 3-ходовым 8784A), НК-3 (БКН)
    [-0.10, 0.08, 0.26].forEach((gx, idx) => {
      const box = new THREE.Mesh(gg.box1, lm.eppBlack);
      box.scale.set(0.14, 0.28, 0.13);
      box.position.set(gx, zMid + 0.22, 0);

      // Qizil Grundfos UPS nasos korpusi + kumush klemma qutisi
      const pump = new THREE.Mesh(gg.cyl14, lm.grundfosRed);
      pump.scale.set(0.046, 0.065, 0.046);
      pump.rotation.x = Math.PI * 0.5;
      pump.position.set(gx - 0.028, zMid + 0.21, 0.055);
      const cap = new THREE.Mesh(gg.cyl14, lm.silverAlum);
      cap.scale.set(0.026, 0.018, 0.026);
      cap.rotation.x = Math.PI * 0.5;
      cap.position.set(gx - 0.028, zMid + 0.21, 0.092);

      // Qizil T1 va Ko'k T2 dumaloq termometrlar
      const thRed = new THREE.Mesh(gg.cyl14, lm.grundfosRed);
      thRed.scale.set(0.020, 0.016, 0.020);
      thRed.rotation.x = Math.PI * 0.5;
      thRed.position.set(gx - 0.032, zMid + 0.32, 0.068);
      const thBlue = new THREE.Mesh(gg.cyl14, lm.valveBlue);
      thBlue.scale.set(0.020, 0.016, 0.020);
      thBlue.rotation.x = Math.PI * 0.5;
      thBlue.position.set(gx + 0.032, zMid + 0.32, 0.068);

      g.add(box, pump, cap, thRed, thBlue);

      // НК-2 da latun 3-xodovoy smesitelniy klapan 8784A + servoprivod!
      if (idx === 1) {
        const mixValve = new THREE.Mesh(gg.box1, lm.forgedBrass);
        mixValve.scale.set(0.052, 0.048, 0.048);
        mixValve.position.set(gx - 0.028, zMid + 0.11, 0.052);
        g.add(mixValve);
      }
    });
  } else if (eq.kind === 'bkn_tank') {
    // Kosvenniy boyler БКН Bathello BT: kumush silindr + ustki anod qopqog'i + old termometr + yon patrulkalari
    const r = (eq.wM || 0.56) * 0.48;
    const h = eq.hM || 1.32;
    const cyl = new THREE.Mesh(gg.cyl18, lm.silverAlum);
    cyl.scale.set(r, h - 0.06, r);
    cyl.position.y = h * 0.5;
    cyl.castShadow = true;

    const topCap = new THREE.Mesh(gg.cyl18, lm.anthracite);
    topCap.scale.set(r * 0.98, 0.05, r * 0.98);
    topCap.position.y = h - 0.02;

    const dial = new THREE.Mesh(gg.cyl14, lm.porcelain);
    dial.scale.set(0.038, 0.018, 0.038);
    dial.rotation.x = Math.PI * 0.5;
    dial.position.set(0, h * 0.72, r + 0.006);

    for (const py of [0.32, 0.68, 1.02]) {
      const tap = new THREE.Mesh(gg.cyl10, lm.forgedBrass);
      tap.scale.set(0.018, 0.07, 0.018);
      tap.rotation.x = Math.PI * 0.5;
      tap.position.set(0, py, -r - 0.02);
      g.add(tap);
    }

    g.add(cyl, topCap, dial);
  } else if (eq.kind === 'exp_tank') {
    // Qizil kengaytirish baki + po'lat belbog' + Watts xavfsizlik guruhi (manometr + vozduxootvodchik + 3 bar klapan)
    const r = (eq.wM || 0.38) * 0.46;
    const h = eq.hM || 0.62;
    const tank = new THREE.Mesh(gg.cyl18, lm.grundfosRed);
    tank.scale.set(r, h * 0.78, r);
    tank.position.y = h * 0.52;
    tank.castShadow = true;

    const seam = new THREE.Mesh(gg.cyl18, lm.stainless);
    seam.scale.set(r * 1.03, 0.022, r * 1.03);
    seam.position.y = h * 0.52;

    const stand = new THREE.Mesh(gg.cyl14, lm.anthracite);
    stand.scale.set(r * 0.68, 0.14, r * 0.68);
    stand.position.y = 0.07;

    // Xavfsizlik guruhi ustida
    const safetyBar = new THREE.Mesh(gg.box1, lm.forgedBrass);
    safetyBar.scale.set(0.14, 0.032, 0.036);
    safetyBar.position.set(0, h + 0.05, 0);
    const reliefRed = new THREE.Mesh(gg.cyl10, lm.grundfosRed);
    reliefRed.scale.set(0.016, 0.048, 0.016);
    reliefRed.position.set(0.045, h + 0.085, 0);

    g.add(tank, seam, stand, safetyBar, reliefRed);
  } else if (eq.kind === 'water_treatment') {
    // ХВО Imrita IMT-S30 Pro ko'k kolonna + oq tuz baki + latun promivnoy filtr IMT-M4 + ko'k BigBlue kolba!
    const col = new THREE.Mesh(gg.cyl18, lm.imritaBlue);
    col.scale.set(0.13, 0.96, 0.13);
    col.position.set(-0.08, 0.48, 0);
    col.castShadow = true;

    const head = new THREE.Mesh(gg.box1, lm.anthracite);
    head.scale.set(0.18, 0.14, 0.20);
    head.position.set(-0.08, 1.03, 0);

    const lcd = new THREE.Mesh(gg.box1, lm.lcdScreen);
    lcd.scale.set(0.08, 0.035, 0.01);
    lcd.position.set(-0.08, 1.04, 0.102);

    const brineTank = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    brineTank.scale.set(0.24, 0.68, 0.26);
    brineTank.position.set(0.14, 0.34, 0);

    const imtM4 = new THREE.Mesh(gg.cyl14, lm.forgedBrass);
    imtM4.scale.set(0.042, 0.22, 0.042);
    imtM4.position.set(-0.08, 1.25, -0.14);

    g.add(col, head, lcd, brineTank, imtM4);
  } else {
    // ЩА ZONT H1000+ PRO avtomatika shiti: shaffof eshikli elektroshit + ZONT yashil indikatorlari + GSM antenna!
    const box = new THREE.Mesh(gg.box1, lm.radiatorWhite);
    box.scale.set(eq.wM || 0.14, eq.hM || 0.50, eq.dM || 0.42);
    box.position.y = (eq.zM || 1.35) + (eq.hM || 0.50) * 0.5;

    const win = new THREE.Mesh(gg.box1, lm.anthracite);
    win.scale.set(0.015, 0.34, 0.32);
    win.position.set(-(eq.wM || 0.14) * 0.5 - 0.004, (eq.zM || 1.35) + 0.26, 0);

    for (const dz of [-0.08, 0, 0.08]) {
      const led = new THREE.Mesh(gg.box1, lm.zontLed);
      led.scale.set(0.018, 0.045, 0.06);
      led.position.set(-(eq.wM || 0.14) * 0.5 - 0.008, (eq.zM || 1.35) + 0.28, dz);
      g.add(led);
    }

    const ant = new THREE.Mesh(gg.cyl10, lm.epdmRing);
    ant.scale.set(0.008, 0.16, 0.008);
    ant.position.set(0, (eq.zM || 1.35) + (eq.hM || 0.50) + 0.08, 0.12);

    g.add(box, win, ant);
  }

  rootGroup.add(g);
}

/**
 * 6. LOD 400 ВЕНТИЛЯЦИЯ И ВОЗДУХОРАСПРЕДЕЛИТЕЛИ (Galvent + Lindab Safe + Арктос 4АПН / ДКВ / ДЩ / ДПУ-М + 3КСД):
 *    - Рекуператор ПВУ на шпильках М8 с виброопорами и 4 патрубками с EPDM манжетами;
 *    - Трубчатые шумоглушители СР 160/600, переходы Ø160/125, дроссель-клапаны ДК с рукояткой и сектором;
 *    - Оцинкованные спирально-навивные воздуховоды с ниппелями, резиновыми уплотнителями EPDM и хомутами на шпильках М8;
 *    - Камеры статического давления 3КСД с теплошумоизоляцией, гибкой вставкой SonoDFlex и боковым патрубком;
 *    - 4 реальных заводских типа диффузоров: 4АПН (4-сторонний), ДКВ (вихревой 16 ламелей), ДЩ (щелевой 2-рядный), ДПУ-М (анемостат)!
 */
export function buildVentilationLod4003D(rootGroup, flOv, yBase, fullH = 3.10) {
  if (!flOv) return;
  const gg = getLod400SharedGeoms();
  const lm = getLod400SharedMats();
  const ySlab = yBase + fullH;

  if (!lm.galventZinc) {
    lm.galventZinc = new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: 0.27, metalness: 0.78 });
    lm.sonoFlex = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.52, metalness: 0.45 });
    lm.bandP1 = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.30, metalness: 0.25 });
    lm.bandV1 = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.30, metalness: 0.25 });
    lm.bandN1 = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.45, metalness: 0.15 });
    lm.bandV2 = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.15 });
  }

  const addRodToSlab = (wx, yFrom, wz) => {
    const rodLen = ySlab - yFrom;
    if (rodLen <= 0.03) return;
    const rod = new THREE.Mesh(gg.cyl10, lm.stainless);
    rod.scale.set(0.0042, rodLen, 0.0042);
    rod.position.set(wx, yFrom + rodLen * 0.5, wz);
    const anchor = new THREE.Mesh(gg.hexNut, lm.forgedBrass);
    anchor.scale.set(0.011, 0.008, 0.011);
    anchor.position.set(wx, ySlab - 0.005, wz);
    rootGroup.add(rod, anchor);
  };

  // 1) ПВУ с рекуперацией тепла (Climate House CS-400 / CS-550 ERV)
  if (flOv.ahuUnit) {
    const u = flOv.ahuUnit;
    const uy = yBase + u.zM;
    const ahuGrp = new THREE.Group();
    ahuGrp.position.set(u.x, uy, u.y);

    const body = new THREE.Mesh(gg.box1, lm.anthracite);
    body.scale.set(u.wM, u.hM, u.dM);
    body.castShadow = true;

    const botTrim = new THREE.Mesh(gg.box1, lm.imritaBlue);
    botTrim.scale.set(u.wM + 0.016, 0.022, u.dM + 0.016);
    botTrim.position.y = -u.hM * 0.5 + 0.011;

    // Servis lyuklari + EC avtomatika displeyi
    for (const sx of [-u.wM * 0.24, u.wM * 0.24]) {
      const hatch = new THREE.Mesh(gg.box1, lm.galventZinc);
      hatch.scale.set(u.wM * 0.42, 0.006, u.dM * 0.78);
      hatch.position.set(sx, -u.hM * 0.5 - 0.003, 0);
      ahuGrp.add(hatch);
    }
    const ecBox = new THREE.Mesh(gg.box1, lm.lcdScreen);
    ecBox.scale.set(0.11, 0.045, 0.012);
    ecBox.position.set(0, -0.02, u.dM * 0.5 + 0.006);
    ahuGrp.add(body, botTrim, ecBox);

    // Old va orqa 4 ta Ø160 patrubok + Lindab Safe EPDM rezina manjetalari
    for (const [cx, cz, dirZ] of [
      [-0.28, -u.dM * 0.5 - 0.045, -1],
      [0.28, -u.dM * 0.5 - 0.045, -1],
      [-0.28, u.dM * 0.5 + 0.045, 1],
      [0.28, u.dM * 0.5 + 0.045, 1],
    ]) {
      const collar = new THREE.Mesh(gg.cyl18, lm.galventZinc);
      collar.scale.set(0.078, 0.09, 0.078);
      collar.rotation.x = Math.PI * 0.5;
      collar.position.set(cx, 0, cz);
      const epdm = new THREE.Mesh(gg.cyl18, lm.epdmRing);
      epdm.scale.set(0.082, 0.014, 0.082);
      epdm.rotation.x = Math.PI * 0.5;
      epdm.position.set(cx, 0, cz + dirZ * 0.032);
      ahuGrp.add(collar, epdm);
    }
    rootGroup.add(ahuGrp);

    // 4 ta M8 shpilka + vibroopora shift plitasigacha
    for (const [rx, rz] of [
      [-u.wM * 0.46, -u.dM * 0.42],
      [u.wM * 0.46, -u.dM * 0.42],
      [-u.wM * 0.46, u.dM * 0.42],
      [u.wM * 0.46, u.dM * 0.42],
    ]) {
      const vibro = new THREE.Mesh(gg.cyl14, lm.epdmRing);
      vibro.scale.set(0.018, 0.024, 0.018);
      vibro.position.set(u.x + rx, uy + u.hM * 0.5 + 0.012, u.y + rz);
      rootGroup.add(vibro);
      addRodToSlab(u.x + rx, uy + u.hM * 0.5 + 0.02, u.y + rz);
    }
  }

  // 2) Трубчатые шумоглушители Арктос СР 160/600
  for (const sil of flOv.ventSilencers || []) {
    const sy = yBase + sil.zM;
    const gSil = new THREE.Group();
    gSil.position.set(sil.x, sy, sil.y);
    const dir = new THREE.Vector3(sil.dirX || 0, 0, sil.dirY || 1).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_UP, dir);
    gSil.quaternion.copy(q);

    const len = sil.lenM || 0.58;
    const rOuter = (sil.outerMm || 260) * 0.0005;
    const rInner = (sil.dnMm || 160) * 0.0005;

    const drum = new THREE.Mesh(gg.cyl18, lm.galventZinc);
    drum.scale.set(rOuter, len, rOuter);
    drum.castShadow = true;
    gSil.add(drum);

    const sysBand = new THREE.Mesh(gg.cyl18, sil.sys === 'P1' ? lm.bandP1 : lm.bandV1);
    sysBand.scale.set(rOuter + 0.003, 0.042, rOuter + 0.003);
    gSil.add(sysBand);

    for (const endSgn of [-1, 1]) {
      const capRing = new THREE.Mesh(gg.cyl18, lm.anthracite);
      capRing.scale.set(rOuter + 0.004, 0.016, rOuter + 0.004);
      capRing.position.y = endSgn * (len * 0.5);
      const spigot = new THREE.Mesh(gg.cyl18, lm.galventZinc);
      spigot.scale.set(rInner, 0.06, rInner);
      spigot.position.y = endSgn * (len * 0.5 + 0.03);
      const epdm = new THREE.Mesh(gg.cyl18, lm.epdmRing);
      epdm.scale.set(rInner + 0.004, 0.012, rInner + 0.004);
      epdm.position.y = endSgn * (len * 0.5 + 0.045);
      gSil.add(capRing, spigot, epdm);
    }
    rootGroup.add(gSil);
    addRodToSlab(sil.x - dir.z * (rOuter + 0.02), sy, sil.y + dir.x * (rOuter + 0.02));
    addRodToSlab(sil.x + dir.z * (rOuter + 0.02), sy, sil.y - dir.x * (rOuter + 0.02));
  }

  // 3) Воздуховоды: Ниппельные хомуты с EPDM, маркировочные кольца П1/В1 и подвесы М8
  for (const vd of flOv.ventDucts || []) {
    const pts = vd.pts3d || [];
    const rDuct = Math.max(0.052, (Number(vd.dnMm) || 125) * 0.0005);
    const bandMat = vd.sys === 'P1' ? lm.bandP1 : vd.sys === 'V1' ? lm.bandV1 : vd.sys === 'N1' ? lm.bandN1 : lm.bandV2;

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0, h0] = pts[i];
      const [x1, z1, h1] = pts[i + 1];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 0.55) continue;
      const dir = new THREE.Vector3(dx / segLen, 0, dz / segLen);
      const q = new THREE.Quaternion().setFromUnitVectors(_UP, dir);
      const yMid = yBase + (h0 + h1) * 0.5;

      // Har 1.65 m da xomut + M8 shpilka + Lindab EPDM nippel halqasi
      const nSupports = Math.max(1, Math.floor(segLen / 1.65));
      for (let k = 1; k <= nSupports; k++) {
        const t = k / (nSupports + 1);
        const cx = x0 + dx * t;
        const cz = z0 + dz * t;

        const clamp = new THREE.Mesh(gg.cyl18, lm.epdmRing);
        clamp.scale.set(rDuct + 0.005, 0.018, rDuct + 0.005);
        clamp.quaternion.copy(q);
        clamp.position.set(cx, yMid, cz);

        const colorRing = new THREE.Mesh(gg.cyl18, bandMat);
        colorRing.scale.set(rDuct + 0.003, 0.026, rDuct + 0.003);
        colorRing.quaternion.copy(q);
        colorRing.position.set(cx + dir.x * 0.05, yMid, cz + dir.z * 0.05);

        rootGroup.add(clamp, colorRing);
        addRodToSlab(cx, yMid + rDuct, cz);
      }
    }
  }

  // 4) Фасонные элементы: Переходы Ø160/125, Дроссель-клапаны ДК и Наружные решётки ВРН
  for (const ft of flOv.ventFittings || []) {
    const fy = yBase + (ft.zM || 2.88);
    const dir = new THREE.Vector3(ft.dirX || 1, 0, ft.dirY || 0).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_UP, dir);

    if (ft.kind === 'reducer') {
      const rBig = (ft.inDnMm || 160) * 0.0005;
      const cone = new THREE.Mesh(gg.coneBell, lm.galventZinc);
      cone.scale.set(rBig / 1.26, 0.14, rBig / 1.26);
      cone.quaternion.copy(q);
      cone.position.set(ft.x, fy, ft.y);
      const sealA = new THREE.Mesh(gg.cyl18, lm.epdmRing);
      sealA.scale.set(rBig + 0.003, 0.012, rBig + 0.003);
      sealA.quaternion.copy(q);
      sealA.position.set(ft.x - dir.x * 0.07, fy, ft.y - dir.z * 0.07);
      rootGroup.add(cone, sealA);
    } else if (ft.kind === 'damper') {
      // Дроссель-клапан ДК с сектором управления и красной/синей рукояткой!
      const rD = (ft.dnMm || 125) * 0.0005;
      const sleeve = new THREE.Mesh(gg.cyl18, lm.galventZinc);
      sleeve.scale.set(rD + 0.004, 0.13, rD + 0.004);
      sleeve.quaternion.copy(q);
      sleeve.position.set(ft.x, fy, ft.y);

      const stand = new THREE.Mesh(gg.box1, lm.stainless);
      stand.scale.set(0.032, 0.045, 0.022);
      stand.position.set(ft.x, fy - rD - 0.02, ft.y);

      const handle = new THREE.Mesh(gg.box1, ft.sys === 'P1' ? lm.valveBlue : lm.grundfosRed);
      handle.scale.set(0.075, 0.012, 0.016);
      handle.position.set(ft.x + 0.02, fy - rD - 0.042, ft.y);
      rootGroup.add(sleeve, stand, handle);
    } else if (ft.kind === 'ext_grille') {
      // Наружная фасадная вентиляционная решётка Арктос ВРН 300×300
      const gGr = new THREE.Group();
      gGr.position.set(ft.x, fy, ft.y);
      const frame = new THREE.Mesh(gg.box1, lm.silverAlum);
      frame.scale.set(0.34, 0.34, 0.045);
      gGr.add(frame);
      for (let li = -2; li <= 2; li++) {
        const blade = new THREE.Mesh(gg.box1, lm.anthracite);
        blade.scale.set(0.29, 0.016, 0.048);
        blade.rotation.x = 0.45;
        blade.position.set(0, li * 0.052, 0);
        gGr.add(blade);
      }
      rootGroup.add(gGr);
    }
  }

  // 5) Потолочные диффузоры (4АПН / ДКВ / ДЩ / ДПУ-М) + Камера статического давления 3КСД + Гибкая вставка SonoDFlex!
  for (const vt of flOv.ventTerminals || []) {
    const dType = vt.diffuserType || '4apn_ksd';
    const yFace = yBase + (vt.zM || fullH - 0.34);
    const isSupply = vt.sys === 'P1';
    const accentMat = isSupply ? lm.bandP1 : lm.bandV1;

    const ksdW = dType === 'dsh_slot' ? 0.92 : dType === 'dpu_anemostat' ? 0.24 : 0.40;
    const ksdD = dType === 'dsh_slot' ? 0.15 : dType === 'dpu_anemostat' ? 0.24 : 0.40;
    const ksdH = 0.20;
    const yKsdMid = yFace + 0.015 + ksdH * 0.5;

    const termGrp = new THREE.Group();
    termGrp.position.set(vt.x, yFace, vt.y);
    if (dType === 'dsh_slot' && vt.slotAngleRad) {
      termGrp.rotation.y = -vt.slotAngleRad;
    }

    // A) Камера статического давления 3КСД (оцинкованная сталь + чёрный пояс теплошумоизоляции K-Flex)
    const ksdBox = new THREE.Mesh(gg.box1, lm.galventZinc);
    ksdBox.scale.set(ksdW, ksdH, ksdD);
    ksdBox.position.y = 0.015 + ksdH * 0.5;
    ksdBox.castShadow = true;

    const ksdIns = new THREE.Mesh(gg.box1, lm.anthracite);
    ksdIns.scale.set(ksdW + 0.006, ksdH * 0.62, ksdD + 0.006);
    ksdIns.position.y = 0.015 + ksdH * 0.56;
    termGrp.add(ksdBox, ksdIns);

    // 3КСД ni 4 burchagidan shift plitasigacha M8 shpilkalar bilan osish:
    for (const [sx, sz] of [
      [-ksdW * 0.44, -ksdD * 0.44],
      [ksdW * 0.44, -ksdD * 0.44],
      [-ksdW * 0.44, ksdD * 0.44],
      [ksdW * 0.44, ksdD * 0.44],
    ]) {
      addRodToSlab(vt.x + sx, yFace + 0.015 + ksdH, vt.y + sz);
    }

    // Боковой врезной патрубок Ø125 с EPDM манжетой + гофрированная гибкая вставка SonoDFlex:
    const spDx = Number.isFinite(vt.spigotDir?.[0]) ? vt.spigotDir[0] : -1;
    const spDz = Number.isFinite(vt.spigotDir?.[1]) ? vt.spigotDir[1] : 0;
    const spDir = new THREE.Vector3(spDx, 0, spDz);
    if (spDir.lengthSq() < 1e-4) spDir.set(-1, 0, 0);
    spDir.normalize();
    const spQ = new THREE.Quaternion().setFromUnitVectors(_UP, spDir);
    const halfSpan = Math.abs(spDir.x) > Math.abs(spDir.z) ? ksdW * 0.5 : ksdD * 0.5;

    const spigot = new THREE.Mesh(gg.cyl18, lm.galventZinc);
    spigot.scale.set(0.062, 0.075, 0.062);
    spigot.quaternion.copy(spQ);
    spigot.position.set(vt.x + spDir.x * (halfSpan + 0.035), yKsdMid + 0.02, vt.y + spDir.z * (halfSpan + 0.035));

    const spEpdm = new THREE.Mesh(gg.cyl18, lm.epdmRing);
    spEpdm.scale.set(0.066, 0.014, 0.066);
    spEpdm.quaternion.copy(spQ);
    spEpdm.position.set(vt.x + spDir.x * (halfSpan + 0.062), yKsdMid + 0.02, vt.y + spDir.z * (halfSpan + 0.062));
    rootGroup.add(spigot, spEpdm);

    // Gofrali SonoDFlex akustik gibkaya vstavka (4 ta bo'rtma halqa!)
    for (let gr = 0; gr < 4; gr++) {
      const dist = halfSpan + 0.088 + gr * 0.036;
      const rib = new THREE.Mesh(gg.cyl18, gr % 2 === 0 ? lm.sonoFlex : lm.galventZinc);
      rib.scale.set(gr % 2 === 0 ? 0.069 : 0.064, 0.032, gr % 2 === 0 ? 0.069 : 0.064);
      rib.quaternion.copy(spQ);
      rib.position.set(vt.x + spDir.x * dist, yKsdMid + 0.02, vt.y + spDir.z * dist);
      rootGroup.add(rib);
    }

    // B) Юза қисми (Чистовой диффузор пастдан қараганда 100% завод детализациясида!):
    if (dType === '4apn_ksd') {
      // Арктос 4АПН 450×450 (RAL 9016): tashqi faskali oq ramka + qora chuqurlik + 3 pog'onali piramidal 4-tomonlama plastinalar!
      const outerFrame = new THREE.Mesh(gg.box1, lm.porcelain);
      outerFrame.scale.set(0.45, 0.022, 0.45);
      outerFrame.position.y = 0.004;

      const throatShadow = new THREE.Mesh(gg.box1, lm.anthracite);
      throatShadow.scale.set(0.38, 0.012, 0.38);
      throatShadow.position.y = -0.003;
      termGrp.add(outerFrame, throatShadow);

      for (const [ringW, yOff] of [[0.33, -0.008], [0.22, -0.013], [0.11, -0.018]]) {
        const barT = 0.020;
        for (const [bx, bz, bw, bd] of [
          [0, -ringW * 0.5, ringW + barT, barT],
          [0, ringW * 0.5, ringW + barT, barT],
          [-ringW * 0.5, 0, barT, ringW - barT],
          [ringW * 0.5, 0, barT, ringW - barT],
        ]) {
          const vane = new THREE.Mesh(gg.box1, lm.porcelain);
          vane.scale.set(bw, 0.012, bd);
          vane.position.set(bx, yOff, bz);
          termGrp.add(vane);
        }
      }
      const centerCore = new THREE.Mesh(gg.box1, accentMat);
      centerCore.scale.set(0.048, 0.010, 0.048);
      centerCore.position.y = -0.020;
      termGrp.add(centerCore);
    } else if (dType === 'dkv_swirl') {
      // Арктос ДКВ-450: Вихревой потолочный диффузор с 16 радиальными закручивающими ламелями!
      const panel = new THREE.Mesh(gg.box1, lm.porcelain);
      panel.scale.set(0.45, 0.018, 0.45);
      panel.position.y = 0.004;
      const darkDisc = new THREE.Mesh(gg.cyl18, lm.anthracite);
      darkDisc.scale.set(0.185, 0.010, 0.185);
      darkDisc.position.y = -0.003;
      const hub = new THREE.Mesh(gg.cyl18, accentMat);
      hub.scale.set(0.042, 0.012, 0.042);
      hub.position.y = -0.007;
      termGrp.add(panel, darkDisc, hub);

      for (let bi = 0; bi < 16; bi++) {
        const ang = (bi * Math.PI * 2) / 16;
        const rMid = 0.112;
        const blade = new THREE.Mesh(gg.box1, lm.porcelain);
        blade.scale.set(0.115, 0.010, 0.016);
        blade.position.set(Math.cos(ang) * rMid, -0.007, Math.sin(ang) * rMid);
        blade.rotation.y = -ang + 0.32;
        blade.rotation.x = 0.48;
        termGrp.add(blade);
      }
    } else if (dType === 'dsh_slot') {
      // Арктос ДЩ-1000 Look: 2-щелевой линейный архитектурный диффузор!
      const frame = new THREE.Mesh(gg.box1, lm.porcelain);
      frame.scale.set(1.00, 0.024, 0.125);
      frame.position.y = 0.004;
      const slotVoid = new THREE.Mesh(gg.box1, lm.eppBlack);
      slotVoid.scale.set(0.95, 0.014, 0.082);
      slotVoid.position.y = -0.004;
      const midDivider = new THREE.Mesh(gg.box1, lm.silverAlum);
      midDivider.scale.set(0.95, 0.014, 0.016);
      midDivider.position.y = -0.006;
      const badge = new THREE.Mesh(gg.box1, accentMat);
      badge.scale.set(0.06, 0.008, 0.014);
      badge.position.set(0.42, -0.009, 0);
      termGrp.add(frame, slotVoid, midDivider, badge);
    } else {
      // Systemair EFF / Арктос ДПУ-М Ø200: Круглый конусный диффузор-анемостат!
      const flange = new THREE.Mesh(gg.cyl18, lm.porcelain);
      flange.scale.set(0.135, 0.020, 0.135);
      flange.position.y = 0.004;
      const throat = new THREE.Mesh(gg.cyl18, lm.anthracite);
      throat.scale.set(0.098, 0.016, 0.098);
      throat.position.y = -0.003;
      const cone = new THREE.Mesh(gg.coneBell, lm.porcelain);
      cone.scale.set(0.072, 0.022, 0.072);
      cone.position.y = -0.016;
      const tip = new THREE.Mesh(gg.cyl14, accentMat);
      tip.scale.set(0.024, 0.008, 0.024);
      tip.position.y = -0.026;
      termGrp.add(flange, throat, cone, tip);
    }

    rootGroup.add(termGrp);
  }
}
