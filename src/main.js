/**
 * SPS Project 2.0 — Asosiy Ilova (Arxitektura & 3D Skaner AI Prototipi)
 */

import './styles/sps-ui-kit.css';
import {
  STANDARD_WALL_TYPES,
  ROOM_TYPES_CATALOG,
  getNodeMap,
  flipOpeningSwing,
  computeWallWitnessDimensions,
  setWallWitnessDistance,
} from './core/planar-wall-graph.js';
import { ArchStore } from './core/arch-store.js';
import { ArchCanvas2D } from './canvas/arch-canvas-2d.js';
import { ArchViewer3D } from './viewer3d/arch-viewer-3d.js';
import {
  BUILTIN_ARCH_PROTOTYPES,
  buildPrototypeProject,
  buildSpsOffice135528Project,
  decodeCompactCloudBinToFloorOverlay,
  extractScanSnapGuides,
  parseRoomPlanJsonToFloor,
  parse3dMeshScanToFloor,
  parseAny3dScanBufferToFloor,
  rebuildWallsFromScanCloud,
  rotateFloorScan90,
  parseDxfToFloor,
  detectWallsFromImageData,
  generateProjectFromAiPrompt,
  synthesizeRealisticLidarCloudForFloor,
  createDemoHandSketchSvgDataUrl,
} from './ai/scan-and-ai-engine.js';
import {
  exportProjectToIfc2x3,
  exportFloorToDxf,
  triggerTextDownload,
  renderSimpleQrOrLinkBadgeSvg,
} from './export/bim-exporter.js';
import {
  MEP_POINT_TYPES,
  parsePointCloudScan,
  evaluateLaserControlCheck,
  validateAndNormalizeMepPoint,
  normalizeSurveyProject,
  makeSurveyRoomDxfMm,
  makeSurveyCsv,
  buildAiMissingDataAndQuestions,
  approveSurveyByEngineer,
  createBlankSurveyProject,
  createTechnicalRoom540x360Sample,
  convertSurveyRoomToPlanarFloor,
} from './survey/field-survey-engine.js';
import {
  CLIMATE_HOUSE_QUICK_FILTERS,
  findClimateHouseSku,
  getClimateHouseBrands,
  getClimateHouseStats,
  searchClimateHouseCatalog,
  inferMepPointPresetFromSku,
} from './data/climate-house-db.js';
import {
  UZ_CLIMATE_CITIES,
  WALL_INSULATION_PRESETS,
  GLAZING_PRESETS,
  ROOF_PRESETS,
} from './mep/teplopoterya-engine.js';
import { renderTmPrincipleSchemeSvg } from './mep/tm-engine.js';
import {
  SPS_RADIATOR_MODELS,
  SPS_CONVECTOR_MODELS,
  SPS_RAD_CONNECTIONS,
  SPS_UF_SCREED_TYPES,
  SPS_HEATING_TOPOLOGIES,
} from './mep/sps-heating-calc.js';
import {
  buildClimateHouseSmeta,
  exportSmetaToCsv,
  generateGostAlbumSheets,
  buildPrintableGostAlbumDocumentHtml,
} from './docs/smeta-and-sheets-engine.js';

const chStats = getClimateHouseStats();

const store = new ArchStore();
const appRoot = document.getElementById('app');

document.title = 'SPS Project · Arxitektura · ОВ · ВК · ТМ v2.8.0';

appRoot.innerHTML = `
  <div class="sps-shell">
    <!-- 58px SpsUiKit Tepa Brend-Shapka -->
    <header class="sps-header">
      <div class="sps-brand">
        <img src="/brand/sps_project_icon.png" alt="SPS Project" onerror="this.style.display='none'" />
        <div class="sps-brand-title">
          SPS Project <span class="sps-brand-dot">·</span> <span class="hide-sm hide-md">Arxitektura · ОВ · ВК · ТМ</span>
        </div>
        <span class="sps-ver-badge">v2.8.0</span>
      </div>

      <div class="sps-header-center">
        <button type="button" class="sps-btn" id="btn-new-proj" title="Noldan toza loyiha boshlash yoki o‘z 3D skaneringizni yuklash">📄 Yangi<span class="hide-md"> Loyiha</span></button>
        <button type="button" class="sps-btn sps-btn-primary" id="btn-load-my-office" title="Bizning Ofis (2-qavat oxirgi etaj): Tyopliy pol + Radiatorlar + ПВУ &amp; 2 Кассетных Фанкойла + Бурчак Котёл + 3D Yurish + Smeta">🏢 Bizning Ofis</button>
        <div class="sps-chip-group" id="hdr-view-modes">
          <button type="button" class="sps-chip" data-view="2d">2D<span class="hide-md"> Chizma</span></button>
          <button type="button" class="sps-chip" data-view="split">Split<span class="hide-md"> 2D+3D</span></button>
          <button type="button" class="sps-chip" data-view="3d">3D BIM</button>
        </div>

        <div class="sps-chip-group" id="hdr-floors"></div>
        <button type="button" class="sps-btn" id="btn-add-upper" title="Devorlarni nusxalab yangi qavat qo‘shish">+ Qavat</button>
        <span class="sps-kpi-pill" id="hdr-area-kpi">0.0 m² · 0 xona</span>
      </div>

      <div class="sps-header-right">
        <button type="button" class="sps-btn" id="btn-open-ch-catalog" title="Climate House rasmiy tovarlar va kodlar bazasi">🏪 <span class="hide-md">Climate House </span>(${chStats.totalSkus})</button>
        <button type="button" class="sps-btn sps-btn-primary" id="btn-open-survey" title="Dala o‘lchovi va lazer nazorati">📋 <span class="hide-md">Dala O‘lchovi </span>(Zamer)</button>
        <button type="button" class="sps-btn sps-btn-accent" id="btn-open-scan-ai" title="3D LiDAR Skaner va AI Arxitektor">📡 <span class="hide-md">3D </span>Skaner &amp; AI</button>
        <button type="button" class="sps-btn" id="btn-open-mobile" title="Telefon va boshqa kompyuterdan QR / HTTPS havola orqali ochish">📱 Telefon</button>
        <button type="button" class="sps-btn" id="btn-theme-toggle">🌙 Тёмная</button>
      </div>
    </header>

    <!-- 42px To'liq Muhandislik Bosqichlari va 2D/3D Oqim Simulyatsiyasi Lentasi -->
    <nav class="sps-stage-ribbon">
      <div class="sps-stage-steps" id="stage-ribbon-steps">
        <button type="button" class="sps-layer-chip" id="btn-toggle-left-panel" title="Chap panelni yig‘ish / ochish">◧ Chap</button>
        <button type="button" class="sps-step-pill" data-stage="arch">01 · Arxitektura</button>
        <button type="button" class="sps-step-pill" data-stage="heat">02 · Teplopoterya</button>
        <button type="button" class="sps-step-pill" data-stage="ov">03 · ОВ<span class="hide-md"> (Isitish &amp; Vent)</span></button>
        <button type="button" class="sps-step-pill" data-stage="vk">04 · ВК<span class="hide-md"> (Suv &amp; Kan)</span></button>
        <button type="button" class="sps-step-pill" data-stage="tm">05 · ТМ<span class="hide-md"> (Kotelxona)</span></button>
        <button type="button" class="sps-step-pill" data-stage="smeta">06 · Smeta<span class="hide-md"> ($ / сўм)</span></button>
        <button type="button" class="sps-step-pill" data-stage="docs">07 · ГОСТ А3<span class="hide-md"> (Oformleniya)</span></button>
      </div>

      <div class="sps-layer-toggles">
        <button type="button" class="sps-btn sps-btn-primary" id="btn-open-calc10" style="padding:3px 9px;font-size:11.5px;" title="1.0 Excel pasport hisoblari: ТП пирог, Kv балансировка, Радиатор β1·β2·β3 ва 17-устунли Теплопотеря">📊 Расчёты<span class="hide-md"> 1.0</span></button>
        <button type="button" class="sps-layer-chip" data-lyr="tp" title="Тёплый пол «улитка»">🔥 TP</button>
        <button type="button" class="sps-layer-chip" data-lyr="rad" title="Радиаторы и конвекторы Т1/Т2">🌡 Rad</button>
        <button type="button" class="sps-layer-chip" data-lyr="vent" title="Вентиляция ПВУ (П1/В1) + Чиллер–Фанкойл (Т5/Т6)">🌀 Vent</button>
        <button type="button" class="sps-layer-chip" data-lyr="vk" title="Водопровод и Канализация К1">💧 ВК</button>
        <button type="button" class="sps-layer-chip" data-lyr="tm" title="Оборудование котельной ТМ">⚙ ТМ</button>
        <button type="button" class="sps-btn" id="btn-ribbon-walk" style="padding:2px 9px;font-size:11.5px;" title="Ofis ichiga tushib 1-shaxs ko‘zi bilan yurib ko‘rish (WASD + Pol Rentgen)">🚶<span class="hide-md"> Ichida</span> Yurish</button>
        <button type="button" class="sps-btn" id="btn-reset-mep-all" style="padding:2px 8px;font-size:11px;" title="Barcha ОВ·ВК·ТМ sistemalarni o‘chirib, binoni toza arxitektura holiga qaytarish">🧹 Toza<span class="hide-md"> Bino</span></button>
        <button type="button" class="sps-sim-btn" id="btn-flow-sim">🌊 Simulyatsiya</button>
        <button type="button" class="sps-layer-chip" id="btn-toggle-right-panel" title="O‘ng inspektorni yig‘ish / ochish">O‘ng ◨</button>
      </div>
    </nav>

    <!-- Markaziy Ish Maydoni -->
    <main class="sps-workspace" id="main-workspace">
      <div class="sps-doc-overlay" id="doc-stage-overlay"></div>
      <!-- Chap Panel: Bosqichga qarab dinamik + Arxitektura Asboblari -->
      <aside class="sps-side-panel" id="left-stage-panel">
        <div id="mep-stage-left-box"></div>
        <div id="arch-stage-left-box">
        <section class="sps-card">
          <div class="sps-sec-head"><span class="sps-sec-num">01</span> Arxitektura Asboblari</div>
          <div class="sps-tool-grid" id="tool-buttons">
            <button type="button" class="sps-tool-btn wide" data-tool="select">↖ Tanlash va Surish (Esc)</button>
            <button type="button" class="sps-tool-btn" data-tool="wall">🧱 Devor (W)</button>
            <button type="button" class="sps-tool-btn" data-tool="rect_room">⬜ Xona kontur (R)</button>
            <button type="button" class="sps-tool-btn" data-tool="door">🚪 Eshik</button>
            <button type="button" class="sps-tool-btn" data-tool="window">🪟 Oyna / Vitraj</button>
            <button type="button" class="sps-tool-btn" data-tool="column">⬛ Ustun</button>
            <button type="button" class="sps-tool-btn" data-tool="shaft">⭕ ВК/ОВ Shaxta</button>
            <button type="button" class="sps-tool-btn wide" data-tool="stair">🪜 Zina marshi (1→2 qavat)</button>
          </div>
        </section>

        <section class="sps-card">
          <div class="sps-sec-head"><span class="sps-sec-num">02</span> Devor va Proyom Standarti</div>
          <div class="sps-field">
            <label>Yangi devor turi va qalinligi</label>
            <select class="sps-select" id="sel-wall-type">
              ${STANDARD_WALL_TYPES.map((w) => `<option value="${w.id}">${w.label}</option>`).join('')}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <div class="sps-field">
              <label>Eshik eni (m)</label>
              <input type="number" step="0.05" min="0.6" max="2.4" class="sps-input" id="inp-door-w" />
            </div>
            <div class="sps-field">
              <label>Oyna eni (m)</label>
              <input type="number" step="0.10" min="0.5" max="4.5" class="sps-input" id="inp-win-w" />
            </div>
          </div>
          <div class="sps-field">
            <label>Devor surish rejimi</label>
            <select class="sps-select" id="sel-chain-mode">
              <option value="auto">Avto (Tashqi=Butun o‘q, Ichki=Xona)</option>
              <option value="collinear_chain">Butun devor o‘qi birga</option>
              <option value="segment">Faqat tanlangan bo‘lak</option>
            </select>
          </div>
        </section>

        <section class="sps-card" style="flex:1;display:flex;flex-direction:column;min-height:160px;">
          <div class="sps-sec-head">
            <span class="sps-sec-num">03</span> Xonalar Eksplikatsiyasi (в свету)
          </div>
          <div class="sps-room-list" id="room-schedule-list"></div>
        </section>
        </div>
        <section class="sps-card sps-mob-only-exports">
          <div class="sps-sec-head"><span class="sps-sec-num">⬇</span> Eksport va Ulashish (BIM / CAD)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button type="button" class="sps-btn sps-btn-primary" id="mob-exp-ifc" style="justify-content:center;">🏗 IFC (Revit)</button>
            <button type="button" class="sps-btn" id="mob-exp-dxf" style="justify-content:center;">📐 DXF (CAD)</button>
            <button type="button" class="sps-btn" id="mob-exp-json" style="justify-content:center;">💾 .JSON</button>
            <button type="button" class="sps-btn" id="mob-open-qr" style="justify-content:center;">📱 QR / Link</button>
          </div>
        </section>
      </aside>

      <!-- Markaziy 2D + 3D Sahna -->
      <section class="sps-stage mode-split" id="main-stage">
        <div class="sps-pane sps-pane-2d" id="pane-2d">
          <div class="sps-pane-badge">2D Arxitektura Plani (в свету · Millimetr aniqlik)</div>
        </div>
        <div class="sps-pane sps-pane-3d" id="pane-3d">
          <div class="sps-pane-badge" id="badge-3d">3D BIM + LiDAR Ko‘rinish</div>
        </div>
      </section>

      <!-- O'ng Panel: 04 Tanlangan Element Xossalari, 05 3D va LiDAR Boshqaruvi -->
      <aside class="sps-side-panel sps-side-right">
        <section class="sps-card" id="inspector-card">
          <div class="sps-sec-head"><span class="sps-sec-num">04</span> Xossalar (Inspektor)</div>
          <div id="inspector-body"></div>
        </section>

        <section class="sps-card">
          <div class="sps-sec-head"><span class="sps-sec-num">05</span> 3D Kesim &amp; LiDAR Buluti</div>
          <div class="sps-field">
            <label>3D Vizual Uslub</label>
            <select class="sps-select" id="sel-style-3d">
              <option value="realistic">Realistik BIM Materiallar</option>
              <option value="clay">Oq Arxitektura Maketi (Enscape Clay)</option>
            </select>
          </div>
          <div class="sps-field">
            <label>Devor Kesimi (Ichini ko‘rish)</label>
            <select class="sps-select" id="sel-cutaway">
              <option value="dollhouse">Avto-Dollhouse (Kameraga qarab ochiladi)</option>
              <option value="waist">Plan kesimi (H = 1.25 m)</option>
              <option value="full">To‘liq balandlik (3.00 m)</option>
            </select>
          </div>
          <div class="sps-field">
            <label style="display:flex;justify-content:space-between;">
              <span>LiDAR Skan Lazer Kesimi (Z)</span>
              <strong id="lbl-slice-z">1.20 m</strong>
            </label>
            <input type="range" min="0.30" max="2.80" step="0.05" id="rng-slice-z" style="width:100%;" />
          </div>
          <div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;">
            <button type="button" class="sps-btn" id="btn-toggle-lidar" style="flex:1;padding:0 6px;font-size:11px;">📡 LiDAR: O‘chiq</button>
            <button type="button" class="sps-btn" id="btn-toggle-furn" style="flex:1;padding:0 6px;font-size:11px;" title="3D Ofis mebellari (12 ta ish stoli, monitorlar, kreslo, shkaf) ko‘rinishi">🪑 Mebel: ON</button>
            <button type="button" class="sps-btn" id="btn-walk-3d" style="width:100%;">🚶 Ofis Ichida Yurish (WASD / Sichqoncha)</button>
          </div>
          <div id="scan-live-controls" style="display:none;margin-top:8px;padding:8px;border-radius:8px;background:var(--bg-subtle);border:1px solid var(--border);">
            <div id="scan-live-status" style="font-size:11px;line-height:1.4;color:var(--text-secondary);margin-bottom:6px;"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:5px;">
              <button type="button" class="sps-btn" id="btn-toggle-ortho" style="padding:0 6px;font-size:11px;" title="2D sahnada skanning shift olib tashlangan haqiqiy rangli ko‘rinishini yoqish/o‘chirish">🖼 Ortofoto: ON</button>
              <button type="button" class="sps-btn" id="btn-toggle-scansnap" style="padding:0 6px;font-size:11px;" title="Skan burchaklari va devor chiziqlariga magnit tortishni yoqish/o‘chirish">🧲 Skan-Magnit: ON</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
              <button type="button" class="sps-btn" id="btn-clear-walls-keep-scan" style="padding:0 6px;font-size:11px;" title="Devorlarni o‘chirib, Skan-Magnit yordamida noldan o‘zingiz chizasiz">🧹 Devorni tozalash</button>
              <button type="button" class="sps-btn sps-btn-primary" id="btn-rebuild-scan-walls" style="padding:0 6px;font-size:11px;" title="Skan nuqtalaridan aniq BIM devor, oyna va eshiklarni tiklash">⚡ Devor + Oyna</button>
            </div>
            <button type="button" class="sps-btn" id="btn-rot-scan-90" style="width:100%;margin-top:5px;font-size:11px;">↻ Skanni 90° ga aylantirish</button>
          </div>
          <button type="button" class="sps-btn" id="btn-gen-lidar" style="width:100%;margin-top:6px;">
            ✨ Joriy binoga 3D LiDAR Buluti tushirish
          </button>
        </section>
      </aside>
    </main>

    <!-- 56px SpsUiKit Pastki Holat va Eksport Paneli -->
    <footer class="sps-footer">
      <div class="sps-footer-left">
        <span class="sps-coords-pill" id="lbl-coords">X: 0.00 m · Y: 0.00 m · 100%</span>
        <div class="sps-chip-group">
          <button type="button" class="sps-chip" id="chip-snap">🧲 Magnit</button>
          <button type="button" class="sps-chip" id="chip-scan-snap" title="3D Skaner burchaklari, devor chiziqlari va oyna/eshik o‘qlariga magnit tortish">🧲 Skan-Magnit</button>
          <button type="button" class="sps-chip" id="chip-ortho">📐 Ortho 90°</button>
          <button type="button" class="sps-chip" id="chip-dims">📏 O‘lchamlar</button>
          <button type="button" class="sps-chip" id="chip-fit">🔍 Markazlash</button>
        </div>
        <span class="sps-status-hint" id="lbl-tool-hint">Devorni bosing — ikki tomonida ichki sof masofa (в свету) chiqadi.</span>
      </div>

      <div class="sps-footer-right">
        <button type="button" class="sps-btn" id="btn-undo" title="Orqaga (Ctrl+Z)">↶<span class="hide-md"> Orqaga</span></button>
        <button type="button" class="sps-btn" id="btn-redo" title="Oldinga (Ctrl+Y)">↷<span class="hide-md"> Oldinga</span></button>
        <label class="sps-btn" style="cursor:pointer;" title="Saqlangan .json loyihani yoki 3D skan (.ply/.las/.glb/.obj+.jpg/.dxf) fayllarini ochish">📂 Ochish<input type="file" id="inp-footer-open" multiple accept=".json,.ply,.las,.glb,.obj,.mtl,.jpg,.jpeg,.png,.xyz,.pts,.dxf" style="display:none;" /></label>
        <button type="button" class="sps-btn" id="btn-save-json" title="Loyihani .JSON fayl sifatida saqlash">💾 .JSON</button>
        <button type="button" class="sps-btn" id="btn-export-dxf" title="AutoCAD millimetrli .DXF chizmani eksport qilish">📐 DXF<span class="hide-md"> (AutoCAD)</span></button>
        <button type="button" class="sps-btn sps-btn-primary" id="btn-export-ifc" title="Revit 2024/2026 uchun haqiqiy IFC2X3 BIM modelni yuklab olish">🏗 IFC<span class="hide-md"> (Revit 2024/2026)</span></button>
      </div>
    </footer>

    <!-- 📱 Telefon va Planshetlar uchun Maxsus Pastki Prezentatsiya Navigatsiyasi -->
    <nav class="sps-mobile-nav" id="mobile-bottom-nav">
      <button type="button" class="sps-mob-tab active" data-mob="3d"><span class="mob-ico">🧊</span><span>3D Model</span></button>
      <button type="button" class="sps-mob-tab" data-mob="walk"><span class="mob-ico">🚶</span><span>Yurish</span></button>
      <button type="button" class="sps-mob-tab" data-mob="2d"><span class="mob-ico">📐</span><span>2D Plan</span></button>
      <button type="button" class="sps-mob-tab" data-mob="smeta"><span class="mob-ico">💰</span><span>Smeta</span></button>
      <button type="button" class="sps-mob-tab" data-mob="docs"><span class="mob-ico">📄</span><span>ГОСТ А3</span></button>
      <button type="button" class="sps-mob-tab" data-mob="drawer"><span class="mob-ico">⚙</span><span>Tizimlar</span></button>
    </nav>
  </div>
`;

const pane2d = document.getElementById('pane-2d');
const pane3d = document.getElementById('pane-3d');

const canvas2d = new ArchCanvas2D(pane2d, store, {
  onCursorMove: ({ x, y, zoomPct }) => {
    const el = document.getElementById('lbl-coords');
    if (el) el.textContent = `X: ${x.toFixed(2)} m · Y: ${y.toFixed(2)} m · ${zoomPct}%`;
  },
  onCalibrateMeasured: (measuredWorldDist) => {
    const actualStr = window.prompt('O‘lchangan chiziqning haqiqiy uzunligini metrda kiriting (masalan 6.00):', '6.00');
    const actualM = parseFloat(String(actualStr || '').replace(',', '.'));
    if (Number.isFinite(actualM) && actualM > 0.2 && measuredWorldDist > 0.05) {
      const ratio = actualM / measuredWorldDist;
      store.commit((_proj, fl) => {
        if (fl.scanOverlay) {
          fl.scanOverlay.metersPerPx = (Number(fl.scanOverlay.metersPerPx) || 0.0167) * ratio;
        }
      }, 'calibrate-underlay');
      canvas2d.fitToBuilding();
    }
  },
});

const viewer3d = new ArchViewer3D(pane3d, store);

function renderInspector() {
  const box = document.getElementById('inspector-body');
  if (!box) return;
  const fl = store.getActiveFloor();
  const sel = store.state.selection;

  if (!sel || !fl) {
    box.innerHTML = `
      <div style="font-size:12px;line-height:1.5;color:var(--text-secondary);">
        Chizmadagi istalgan <strong>devor</strong>, <strong>xona</strong>, <strong>eshik</strong> yoki <strong>oyna</strong> ustiga bosing:<br/>
        • Devor bosilsa — aniq <em>в свету</em> o‘lchamni son bilan kiritib surishingiz mumkin.<br/>
        • Bo‘sh joy bosilsa — tasodifiy hech narsa chizilmaydi.
      </div>
      <div class="sps-field" style="margin-top:10px;">
        <label>Qavat shift balandligi H (m)</label>
        <input type="number" step="0.05" min="2.2" max="6.0" class="sps-input" id="inp-floor-h" value="${(fl?.heightM || 3.0).toFixed(2)}" />
      </div>
    `;
    box.querySelector('#inp-floor-h')?.addEventListener('change', (e) => {
      const h = parseFloat(e.target.value);
      if (Number.isFinite(h) && h >= 2.2) {
        store.commit((_p, activeFl) => { activeFl.heightM = h; }, 'floor-height');
      }
    });
    return;
  }

  if (sel.kind === 'wall') {
    const nm = getNodeMap(fl);
    const w = fl.walls.find((x) => x.id === sel.id);
    if (!w) return;
    const a = nm.get(w.n1);
    const b = nm.get(w.n2);
    const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    const dims = computeWallWitnessDimensions(fl, w.id);

    box.innerHTML = `
      <div class="sps-field">
        <label>Devor uzunligi (o‘q bo‘yicha)</label>
        <input type="text" class="sps-input" readonly value="${len.toFixed(3)} m" />
      </div>
      <div class="sps-field">
        <label>Devor konstruksiyasi va qalinligi</label>
        <select class="sps-select" id="insp-wall-type">
          ${STANDARD_WALL_TYPES.map((wt) => `<option value="${wt.id}" ${Math.abs(wt.thickness - w.thickness) < 0.015 ? 'selected' : ''}>${wt.label}</option>`).join('')}
        </select>
      </div>
      ${dims.map((d, idx) => `
        <div class="sps-field">
          <label>Sof ichki masofa ${idx + 1} (в свету, m)</label>
          <div style="display:flex;gap:5px;">
            <input type="number" step="0.01" class="sps-input insp-wit-val" data-side="${d.sideSign}" value="${d.clearDistanceM.toFixed(2)}" />
            <button type="button" class="sps-btn sps-btn-primary insp-wit-btn" data-side="${d.sideSign}">Qo‘llash</button>
          </div>
        </div>
      `).join('')}
      <button type="button" class="sps-btn sps-btn-accent" id="insp-del-wall" style="width:100%;margin-top:8px;">🗑 Devorni o‘chirish (Xonalar birlashadi)</button>
    `;

    box.querySelector('#insp-wall-type')?.addEventListener('change', (e) => {
      const spec = STANDARD_WALL_TYPES.find((t) => t.id === e.target.value);
      if (!spec) return;
      store.commit((_p, activeFl) => {
        const target = activeFl.walls.find((x) => x.id === w.id);
        if (target) {
          target.thickness = spec.thickness;
          target.kind = spec.kind;
          target.typeId = spec.id;
        }
      }, 'change-wall-thickness');
    });

    box.querySelectorAll('.insp-wit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const side = Number(btn.dataset.side);
        const inp = box.querySelector(`.insp-wit-val[data-side="${side}"]`);
        const val = parseFloat(inp?.value);
        if (Number.isFinite(val) && val >= 0.30) {
          store.commit((_p, activeFl) => {
            setWallWitnessDistance(activeFl, w.id, side, val);
          }, 'insp-witness');
        }
      });
    });

    box.querySelector('#insp-del-wall')?.addEventListener('click', () => {
      canvas2d.deleteSelection(sel);
    });
    return;
  }

  if (sel.kind === 'room') {
    const rm = (fl.rooms || []).find((r) => r.id === sel.id);
    if (!rm) return;
    box.innerHTML = `
      <div class="sps-field">
        <label>Sof ichki kvadratura (в свету)</label>
        <input type="text" class="sps-input" readonly value="${rm.areaM2.toFixed(2)} m²  (Perimetr: ${rm.perimeterM.toFixed(2)} m)" />
      </div>
      <div class="sps-field">
        <label>Xona nomi</label>
        <input type="text" class="sps-input" id="insp-rm-name" value="${rm.name}" />
      </div>
      <div class="sps-field">
        <label>Xona vazifasi va pol qoplamasi</label>
        <select class="sps-select" id="insp-rm-type">
          ${ROOM_TYPES_CATALOG.map((c) => `<option value="${c.id}" ${c.id === rm.roomType ? 'selected' : ''}>${c.name} (${c.tempC}°C)</option>`).join('')}
        </select>
      </div>
    `;
    box.querySelector('#insp-rm-name')?.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (!val) return;
      store.commit((_p, activeFl) => {
        const meta = activeFl.roomMeta.find((m) => m.id === rm.id);
        if (meta) meta.name = val;
      }, 'rename-room');
    });
    box.querySelector('#insp-rm-type')?.addEventListener('change', (e) => {
      const cat = ROOM_TYPES_CATALOG.find((c) => c.id === e.target.value);
      if (!cat) return;
      store.commit((_p, activeFl) => {
        const meta = activeFl.roomMeta.find((m) => m.id === rm.id);
        if (meta) {
          meta.roomType = cat.id;
          meta.name = cat.name;
          meta.floorMat = cat.floorMat;
          meta.targetTempC = cat.tempC;
        }
      }, 'change-room-type');
    });
    return;
  }

  if (sel.kind === 'opening') {
    const op = (fl.openings || []).find((o) => o.id === sel.id);
    if (!op) return;
    box.innerHTML = `
      <div class="sps-field">
        <label>${op.type === 'window' ? 'Oyna / Vitraj eni (m)' : 'Eshik eni (m)'}</label>
        <input type="number" step="0.05" min="0.45" max="4.50" class="sps-input" id="insp-op-w" value="${op.widthM.toFixed(2)}" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div class="sps-field">
          <label>Balandligi H (m)</label>
          <input type="number" step="0.05" class="sps-input" id="insp-op-h" value="${op.heightM.toFixed(2)}" />
        </div>
        <div class="sps-field">
          <label>Podokonnik (m)</label>
          <input type="number" step="0.05" class="sps-input" id="insp-op-sill" value="${(op.sillM || 0).toFixed(2)}" />
        </div>
      </div>
      ${op.type === 'door' ? `<button type="button" class="sps-btn" id="insp-flip-door" style="width:100%;margin-top:6px;">⇄ Ochilish tomonini aylantirish (Space)</button>` : ''}
      <button type="button" class="sps-btn sps-btn-accent" id="insp-del-op" style="width:100%;margin-top:6px;">🗑 O‘chirish</button>
    `;
    const applyOp = () => {
      store.commit((_p, activeFl) => {
        const target = (activeFl.openings || []).find((o) => o.id === op.id);
        if (!target) return;
        target.widthM = Math.max(0.40, parseFloat(box.querySelector('#insp-op-w').value) || target.widthM);
        target.heightM = Math.max(0.45, parseFloat(box.querySelector('#insp-op-h').value) || target.heightM);
        target.sillM = Math.max(0, parseFloat(box.querySelector('#insp-op-sill').value) || 0);
      }, 'edit-opening');
    };
    box.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', applyOp));
    box.querySelector('#insp-flip-door')?.addEventListener('click', () => {
      store.commit((_p, activeFl) => flipOpeningSwing(activeFl, op.id), 'flip-door');
    });
    box.querySelector('#insp-del-op')?.addEventListener('click', () => canvas2d.deleteSelection(sel));
    return;
  }

  if (sel.kind === 'element') {
    const el = (fl.elements || []).find((x) => x.id === sel.id);
    if (!el) return;
    box.innerHTML = `
      <div class="sps-field">
        <label>Element: ${el.label || el.kind}</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <input type="number" step="0.05" class="sps-input" id="insp-el-w" value="${(el.wM || 0.4).toFixed(2)}" />
          <input type="number" step="0.05" class="sps-input" id="insp-el-d" value="${(el.dM || 0.4).toFixed(2)}" />
        </div>
      </div>
      <button type="button" class="sps-btn" id="insp-rot-el" style="width:100%;margin-top:6px;">↻ 90° ga aylantirish</button>
      <button type="button" class="sps-btn sps-btn-accent" id="insp-del-el" style="width:100%;margin-top:6px;">🗑 O‘chirish</button>
    `;
    box.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
      store.commit((_p, activeFl) => {
        const t = (activeFl.elements || []).find((x) => x.id === el.id);
        if (t) {
          t.wM = Math.max(0.2, parseFloat(box.querySelector('#insp-el-w').value) || t.wM);
          t.dM = Math.max(0.2, parseFloat(box.querySelector('#insp-el-d').value) || t.dM);
        }
      }, 'resize-el');
    }));
    box.querySelector('#insp-rot-el')?.addEventListener('click', () => {
      store.commit((_p, activeFl) => {
        const t = (activeFl.elements || []).find((x) => x.id === el.id);
        if (t) t.rotationDeg = ((t.rotationDeg || 0) + 90) % 360;
      }, 'rotate-el');
    });
    box.querySelector('#insp-del-el')?.addEventListener('click', () => canvas2d.deleteSelection(sel));
  }
}

let activeGostSheetId = 'OD-1';
let showTmSchemeOverlay = false;

function syncUi(state, reason) {
  const s = state.settings;
  document.body.classList.toggle('theme-light', s.theme === 'light');

  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) themeBtn.textContent = s.theme === 'light' ? '☀ Светлая' : '🌙 Тёмная';

  // View Mode (2D / Split / 3D)
  const stage = document.getElementById('main-stage');
  stage.className = `sps-stage mode-${s.viewMode}`;
  pane2d.style.display = s.viewMode === '3d' ? 'none' : 'block';
  pane3d.style.display = s.viewMode === '2d' ? 'none' : 'block';
  document.querySelectorAll('#hdr-view-modes .sps-chip').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === s.viewMode);
  });

  // Qavat tugmalari
  const flWrap = document.getElementById('hdr-floors');
  if (flWrap) {
    flWrap.innerHTML = state.project.floors
      .map((f) => `<button type="button" class="sps-chip ${f.id === state.activeFloorId ? 'active' : ''}" data-fl="${f.id}">${f.name}</button>`)
      .join('');
    flWrap.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => store.setActiveFloor(Number(b.dataset.fl)));
    });
  }

  // Sof maydon + Issiqlik KPI
  const fl = store.getActiveFloor();
  const totalM2 = (fl?.rooms || []).reduce((acc, r) => acc + r.areaM2, 0);
  const kpi = document.getElementById('hdr-area-kpi');
  const qKw = state.mepSuite?.heat?.totalHeatLossKw ?? 0;
  if (kpi) kpi.textContent = `${totalM2.toFixed(1)} m² · Q=${qKw} kW · ${(fl?.rooms || []).length} xona`;

  // 7-Bosqich Lentasi + Qatlamlar + Oqim Simulyatsiyasi holati
  const curStage = s.activeStage || 'arch';
  document.querySelectorAll('#stage-ribbon-steps .sps-step-pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.stage === curStage);
  });
  document.querySelectorAll('.sps-layer-chip').forEach((b) => {
    const lyr = b.dataset.lyr;
    b.classList.toggle('on', Boolean(s.visibleLayers?.[lyr]));
  });
  const simBtn = document.getElementById('btn-flow-sim');
  if (simBtn) {
    simBtn.classList.toggle('active', Boolean(s.flowSimEnabled));
    simBtn.textContent = s.flowSimEnabled ? '🌊 Simulyatsiya: ON' : '🌊 Simulyatsiya';
  }

  // Asbob tugmalari
  document.querySelectorAll('#tool-buttons .sps-tool-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === state.activeTool);
  });

  const hints = {
    select: 'Tanlash rejimi: devorni bosib suring yoki ko‘k o‘lcham ustiga bosib son yozing (tasodifiy devor chizilmaydi!).',
    wall: 'Devor chizish: 1-nuqtani bosing -> yo‘nalish bering -> uzunlikni yozib Enter bosing yoki 2-nuqtani bosing (Esc = Bekor).',
    rect_room: 'Xona konturi: 1-burchakni bosing -> "4.5x6" yozib Enter bosing yoki 2-burchakni bosing.',
    door: 'Eshik qo‘yish: devor ustiga olib borib bosing (Space = ochilish tomonini aylantirish).',
    window: 'Oyna / Vitraj qo‘yish: tashqi yoki ichki devor ustiga bosing.',
    calibrate: 'Podlojka masshtablash: rasmdagi ma’lum devorning 2 uchini bosing.',
  };
  const hintEl = document.getElementById('lbl-tool-hint');
  if (hintEl) hintEl.textContent = hints[state.activeTool] || hints.select;

  // Chap paneldagi select/input qiymatlar
  document.getElementById('sel-wall-type').value = s.wallTypeId;
  document.getElementById('inp-door-w').value = Number(s.doorWidthM || 0.9).toFixed(2);
  document.getElementById('inp-win-w').value = Number(s.windowWidthM || 1.6).toFixed(2);
  document.getElementById('sel-chain-mode').value = s.wallChainMode || 'auto';
  document.getElementById('sel-style-3d').value = s.style3d || 'realistic';
  document.getElementById('sel-cutaway').value = s.cutawayMode || 'dollhouse';
  document.getElementById('rng-slice-z').value = s.lidarSliceZ ?? 1.20;
  document.getElementById('lbl-slice-z').textContent = `${Number(s.lidarSliceZ ?? 1.20).toFixed(2)} m`;
  document.getElementById('btn-toggle-lidar').textContent = s.lidarVisible !== false ? '📡 LiDAR: Yoniq' : '📡 LiDAR: O‘chiq';
  const furnBtn = document.getElementById('btn-toggle-furn');
  if (furnBtn) {
    const fOn = s.showOfficeFurniture !== false;
    furnBtn.textContent = fOn ? '🪑 Mebel: ON' : '🪑 Mebel: OFF';
    furnBtn.classList.toggle('sps-btn-primary', fOn);
  }

  // Jonli yuklangan 3D Skaner boshqaruv bloki
  const scanBox = document.getElementById('scan-live-controls');
  const scanStat = document.getElementById('scan-live-status');
  const ovScan = fl?.scanOverlay;
  if (scanBox && scanStat) {
    const hasCloud = ovScan && ((Array.isArray(ovScan.pointStride6) && ovScan.pointStride6.length >= 6) || Boolean(ovScan.cloudBinUrl));
    if (hasCloud) {
      scanBox.style.display = 'block';
      const cloudPts = Math.floor((ovScan.pointStride6?.length || 0) / 6);
      const rawTotal = ovScan.rawPointCount || cloudPts;
      const fName = ovScan.sourceFileName || '3D LiDAR Skan';
      const degTxt = ovScan.alignedDeg ? ` · Tekislandi ${ovScan.alignedDeg}°` : '';
      const guideCnt = (ovScan.snapGuides?.xRails?.length || 0) + (ovScan.snapGuides?.yRails?.length || 0);
      scanStat.innerHTML = `<strong>📡 ${fName}</strong><br/>Nuqtalar: ${rawTotal.toLocaleString('ru-RU')} (3D: ${cloudPts.toLocaleString('ru-RU')}) · H=${(fl?.heightM || 3.0).toFixed(2)}m${degTxt}${guideCnt ? `<br/><span style="color:#10b981;">🧲 Skan-Magnit: ${guideCnt} devor o‘qi · ${ovScan.snapGuides?.corners?.length || 0} burchak</span>` : ''}`;
      const orthoBtn = document.getElementById('btn-toggle-ortho');
      if (orthoBtn) {
        orthoBtn.textContent = s.scanOrthoVisible !== false ? '🖼 Ortofoto: ON' : '🖼 Ortofoto: OFF';
        orthoBtn.classList.toggle('sps-btn-primary', s.scanOrthoVisible !== false);
      }
      const sSnapBtn = document.getElementById('btn-toggle-scansnap');
      if (sSnapBtn) {
        sSnapBtn.textContent = s.scanSnapEnabled !== false ? '🧲 Skan-Magnit: ON' : '🧲 Skan-Magnit: OFF';
        sSnapBtn.classList.toggle('sps-btn-primary', s.scanSnapEnabled !== false);
      }
    } else {
      scanBox.style.display = 'none';
    }
  }

  const wsEl = document.getElementById('main-workspace');
  if (wsEl) {
    wsEl.classList.toggle('left-collapsed', Boolean(s.leftPanelCollapsed));
    wsEl.classList.toggle('right-collapsed', Boolean(s.rightPanelCollapsed));
  }
  const btnLeftCol = document.getElementById('btn-toggle-left-panel');
  if (btnLeftCol) {
    btnLeftCol.classList.toggle('on', !s.leftPanelCollapsed);
    btnLeftCol.textContent = s.leftPanelCollapsed ? '▶ Chap' : '◧ Chap';
  }
  const btnRightCol = document.getElementById('btn-toggle-right-panel');
  if (btnRightCol) {
    btnRightCol.classList.toggle('on', !s.rightPanelCollapsed);
    btnRightCol.textContent = s.rightPanelCollapsed ? 'O‘ng ◀' : 'O‘ng ◨';
  }

  document.getElementById('chip-snap').classList.toggle('active', s.snapEnabled !== false);
  document.getElementById('chip-scan-snap')?.classList.toggle('active', s.scanSnapEnabled !== false);
  document.getElementById('chip-ortho').classList.toggle('active', s.orthoEnabled !== false);
  document.getElementById('chip-dims').classList.toggle('active', s.showDims !== false);
  document.getElementById('btn-undo').disabled = !store.canUndo();
  document.getElementById('btn-redo').disabled = !store.canRedo();

  // Xonalar jadvali
  const rList = document.getElementById('room-schedule-list');
  if (rList) {
    if (!fl?.rooms?.length) {
      rList.innerHTML = `<div style="font-size:11.5px;color:var(--text-secondary);padding:6px;">Yopiq devor konturi chizilishi bilan xona va m² avtomatik paydo bo‘ladi.</div>`;
    } else {
      rList.innerHTML = fl.rooms
        .map(
          (r) => `
          <div class="sps-room-row ${state.selection?.kind === 'room' && state.selection.id === r.id ? 'active' : ''}" data-rm="${r.id}">
            <span>${r.name}</span>
            <span class="sps-room-area">${r.areaM2.toFixed(2)} m²</span>
          </div>`,
        )
        .join('');
      rList.querySelectorAll('.sps-room-row').forEach((row) => {
        row.addEventListener('click', () => store.setSelection({ kind: 'room', id: row.dataset.rm }));
      });
    }
  }

  renderInspector();
  renderMepStagePanelsAndOverlays(state);

  if (reason === 'settings' || reason === 'load-project' || reason === 'floor') {
    setTimeout(() => {
      canvas2d.resize();
      viewer3d.resize();
      if (reason === 'load-project' || reason === 'floor') {
        canvas2d.fitToBuilding();
        viewer3d.fitCameraToBuilding();
      }
    }, 20);
  }
  canvas2d.requestRender();
  if (reason !== 'tool' && reason !== 'selection') {
    viewer3d.rebuildScene();
  }
}

let _hydratingBinUrl = null;
async function hydrateExternalScanCloudIfNeeded() {
  const fl = store.getActiveFloor();
  const ov = fl?.scanOverlay;
  if (!ov) return;
  if (Array.isArray(ov.pointStride6) && ov.pointStride6.length >= 24) {
    if (!ov.snapGuides) {
      extractScanSnapGuides(fl);
      canvas2d.requestRender();
    }
    return;
  }
  if (!ov.cloudBinUrl || _hydratingBinUrl === ov.cloudBinUrl) return;
  _hydratingBinUrl = ov.cloudBinUrl;
  try {
    const resp = await fetch(ov.cloudBinUrl);
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const targetFl = store.getActiveFloor();
      if (targetFl?.scanOverlay?.cloudBinUrl === ov.cloudBinUrl) {
        decodeCompactCloudBinToFloorOverlay(buf, targetFl);
        syncUi(store.state, 'scan-hydrated');
      }
    }
  } catch {
    // ignore offline fetch errors
  } finally {
    _hydratingBinUrl = null;
  }
}

store.subscribe((st, rsn) => {
  syncUi(st, rsn);
  if (rsn === 'load-project' || rsn === 'floor') {
    hydrateExternalScanCloudIfNeeded();
  }
});
syncUi(store.state, 'load-project');
hydrateExternalScanCloudIfNeeded();

// === UI Event Listeners ===
document.querySelectorAll('#hdr-view-modes .sps-chip').forEach((btn) => {
  btn.addEventListener('click', () => store.updateSettings({ viewMode: btn.dataset.view }));
});

document.getElementById('btn-add-upper')?.addEventListener('click', () => {
  store.addFloorLevel('upper', true);
});

document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
  store.updateSettings({ theme: store.state.settings.theme === 'light' ? 'dark' : 'light' });
});

document.getElementById('btn-toggle-left-panel')?.addEventListener('click', () => {
  store.updateSettings({ leftPanelCollapsed: !store.state.settings.leftPanelCollapsed });
  setTimeout(() => { canvas2d.resize(); viewer3d.resize(); }, 25);
});

document.getElementById('btn-toggle-right-panel')?.addEventListener('click', () => {
  store.updateSettings({ rightPanelCollapsed: !store.state.settings.rightPanelCollapsed });
  setTimeout(() => { canvas2d.resize(); viewer3d.resize(); }, 25);
});

document.querySelectorAll('#tool-buttons .sps-tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    canvas2d.cancelActiveDraft();
    store.setTool(btn.dataset.tool);
  });
});

document.getElementById('sel-wall-type')?.addEventListener('change', (e) => store.updateSettings({ wallTypeId: e.target.value }));
document.getElementById('inp-door-w')?.addEventListener('change', (e) => store.updateSettings({ doorWidthM: parseFloat(e.target.value) || 0.9 }));
document.getElementById('inp-win-w')?.addEventListener('change', (e) => store.updateSettings({ windowWidthM: parseFloat(e.target.value) || 1.6 }));
document.getElementById('sel-chain-mode')?.addEventListener('change', (e) => store.updateSettings({ wallChainMode: e.target.value }));
document.getElementById('sel-style-3d')?.addEventListener('change', (e) => store.updateSettings({ style3d: e.target.value }));
document.getElementById('sel-cutaway')?.addEventListener('change', (e) => store.updateSettings({ cutawayMode: e.target.value }));
document.getElementById('rng-slice-z')?.addEventListener('input', (e) => store.updateSettings({ lidarSliceZ: parseFloat(e.target.value) }));
document.getElementById('btn-toggle-lidar')?.addEventListener('click', () => {
  store.updateSettings({ lidarVisible: store.state.settings.lidarVisible === false });
});
document.getElementById('btn-toggle-ortho')?.addEventListener('click', () => {
  store.updateSettings({ scanOrthoVisible: store.state.settings.scanOrthoVisible === false });
});
document.getElementById('btn-toggle-scansnap')?.addEventListener('click', () => {
  store.updateSettings({ scanSnapEnabled: store.state.settings.scanSnapEnabled === false });
});

document.getElementById('btn-toggle-furn')?.addEventListener('click', () => {
  store.updateSettings({ showOfficeFurniture: store.state.settings.showOfficeFurniture === false });
});

document.getElementById('btn-load-my-office')?.addEventListener('click', () => {
  if (viewer3d.walkMode) viewer3d.setWalkthroughMode(false);
  store.loadCompleteOfficeProject(buildSpsOffice135528Project({ withWalls: true }));
  if (store.state.settings.viewMode === '2d') {
    store.updateSettings({ viewMode: 'split' });
  }
});

const syncWalkButtons = (on) => {
  const b1 = document.getElementById('btn-walk-3d');
  const b2 = document.getElementById('btn-ribbon-walk');
  if (b1) {
    b1.classList.toggle('sps-btn-primary', on);
    b1.textContent = on ? '🚶 Yurish Rejimi: ON (Chiqish)' : '🚶 Ofis Ichida Yurish (WASD / Sichqoncha)';
  }
  if (b2) {
    b2.classList.toggle('sps-btn-primary', on);
    b2.textContent = on ? '🚶 Yurish: ON' : '🚶 Ichida Yurish';
  }
};
viewer3d.onWalkModeChange = syncWalkButtons;

const toggleWalkModeUi = () => {
  const next = !viewer3d.walkMode;
  if (next && store.state.settings.viewMode === '2d') {
    store.updateSettings({ viewMode: '3d' });
  }
  setTimeout(() => {
    viewer3d.resize();
    viewer3d.setWalkthroughMode(next, 'entry');
    syncWalkButtons(next);
  }, 25);
};

document.getElementById('btn-walk-3d')?.addEventListener('click', toggleWalkModeUi);
document.getElementById('btn-ribbon-walk')?.addEventListener('click', toggleWalkModeUi);

document.getElementById('btn-gen-lidar')?.addEventListener('click', () => {
  store.commit((_proj, fl) => {
    fl.scanOverlay = synthesizeRealisticLidarCloudForFloor(fl, 45);
  }, 'synth-lidar');
  store.updateSettings({ lidarVisible: true });
});

document.getElementById('btn-clear-walls-keep-scan')?.addEventListener('click', () => {
  store.commit((_proj, fl) => {
    fl.nodes = [];
    fl.walls = [];
    fl.openings = [];
    fl.elements = [];
    fl.roomMeta = [];
  }, 'clear-walls-keep-scan');
  store.setStage('arch');
  store.updateSettings({ lidarVisible: true });
  setTimeout(() => {
    canvas2d.fitToBuilding();
    viewer3d.fitCameraToBuilding();
  }, 30);
});

document.getElementById('btn-rebuild-scan-walls')?.addEventListener('click', () => {
  const sliceZ = store.state.settings.lidarSliceZ || 1.20;
  store.commit((_proj, fl) => {
    if (fl.scanOverlay?.presetId === 'sps-office-135528') {
      const refFl = buildSpsOffice135528Project({ withWalls: true }).floors[0];
      fl.nodes = refFl.nodes;
      fl.walls = refFl.walls;
      fl.openings = refFl.openings;
      fl.elements = refFl.elements;
      fl.roomMeta = refFl.roomMeta;
    } else {
      rebuildWallsFromScanCloud(fl, sliceZ);
    }
  }, 'rebuild-scan-walls');
  store.updateSettings({ lidarVisible: true });
  setTimeout(() => {
    canvas2d.fitToBuilding();
    viewer3d.fitCameraToBuilding();
  }, 30);
});

document.getElementById('btn-rot-scan-90')?.addEventListener('click', () => {
  const hasWalls = (store.getActiveFloor()?.walls?.length || 0) > 0;
  const sliceZ = store.state.settings.lidarSliceZ || 1.20;
  store.commit((_proj, fl) => {
    rotateFloorScan90(fl);
    if (hasWalls) rebuildWallsFromScanCloud(fl, sliceZ);
  }, 'rotate-scan-90');
  setTimeout(() => {
    canvas2d.fitToBuilding();
    viewer3d.fitCameraToBuilding();
  }, 30);
});

async function decodeImageFileToPixels(imgFile) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(imgFile);
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const id = ctx.getImageData(0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve({ width: w, height: h, data: id.data });
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function importProjectOrScanFiles(fileOrList, { autoBuildWalls = false } = {}) {
  const files = Array.isArray(fileOrList)
    ? fileOrList
    : (fileOrList && typeof fileOrList.length === 'number' ? [...fileOrList] : [fileOrList]);
  const validFiles = files.filter(Boolean);
  if (!validFiles.length) return;

  // Agar bir nechta fayl tanlangan bo'lsa (.obj + .mtl + .jpg tekstura!) — asosiy 3D geometriyani va rasmni ajratib olamiz!
  const geomFile = validFiles.find((f) => /\.(ply|las|glb|obj|xyz|pts|dxf|json)$/i.test(f.name)) || validFiles[0];
  const texFile = validFiles.find((f) => /\.(jpe?g|png|webp)$/i.test(f.name)) || null;
  const low = geomFile.name.toLowerCase();

  if (low.endsWith('.json')) {
    const text = await geomFile.text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.floors)) {
      store.loadNewProject(parsed);
      store.setStage('arch');
      return;
    }
    const fl = parseRoomPlanJsonToFloor(parsed, 1, `1-qavat (${geomFile.name})`);
    store.startCleanUserProject({ title: geomFile.name, floors: [fl] }, { lidarVisible: false });
    return;
  }

  if (low.endsWith('.dxf')) {
    const text = await geomFile.text();
    const fl = parseDxfToFloor(text, 1);
    store.startCleanUserProject({ title: geomFile.name, floors: [fl] }, { lidarVisible: false });
    return;
  }

  // Binary va ASCII 3D Skaner formatlar (.ply, .las, .glb, .obj+.jpg, .xyz, .pts):
  // Bosqichma-bosqich rejim: ichiga darhol ОВ/ВК/ТМ sistemalari tushib qolmaydi!
  const [buf, texturePixels] = await Promise.all([
    geomFile.arrayBuffer(),
    low.endsWith('.obj') && texFile ? decodeImageFileToPixels(texFile) : Promise.resolve(null),
  ]);
  const fl = parseAny3dScanBufferToFloor(buf, geomFile.name, {
    sliceHeightM: store.state.settings.lidarSliceZ || 1.20,
    autoBuildWalls,
    texturePixels,
  });
  store.startCleanUserProject(
    { title: geomFile.name, floors: [fl] },
    {
      lidarVisible: true,
      viewMode: store.state.settings.viewMode === '2d' ? 'split' : store.state.settings.viewMode,
    },
  );
  store.updateSettings({ scanOrthoVisible: true, scanSnapEnabled: true });
  setTimeout(() => {
    canvas2d.fitToBuilding();
    viewer3d.fitCameraToBuilding();
  }, 40);
}

document.getElementById('btn-new-proj')?.addEventListener('click', () => openScanAndAiModal());
document.getElementById('inp-footer-open')?.addEventListener('change', async (e) => {
  const list = e.target.files;
  if (list?.length) {
    try {
      await importProjectOrScanFiles(list, { autoBuildWalls: false });
    } catch (err) {
      alert(`Fayl o‘qishda xatolik: ${err.message || err}`);
    }
    e.target.value = '';
  }
});

document.getElementById('chip-snap')?.addEventListener('click', () => store.updateSettings({ snapEnabled: store.state.settings.snapEnabled === false }));
document.getElementById('chip-scan-snap')?.addEventListener('click', () => store.updateSettings({ scanSnapEnabled: store.state.settings.scanSnapEnabled === false }));
document.getElementById('chip-ortho')?.addEventListener('click', () => store.updateSettings({ orthoEnabled: store.state.settings.orthoEnabled === false }));
document.getElementById('chip-dims')?.addEventListener('click', () => store.updateSettings({ showDims: store.state.settings.showDims === false }));
document.getElementById('chip-fit')?.addEventListener('click', () => {
  canvas2d.fitToBuilding();
  viewer3d.fitCameraToBuilding();
});

document.getElementById('btn-undo')?.addEventListener('click', () => store.undo());
document.getElementById('btn-redo')?.addEventListener('click', () => store.redo());

document.getElementById('btn-save-json')?.addEventListener('click', () => {
  triggerTextDownload('sps_arch_2_project.json', JSON.stringify(store.state.project, null, 2), 'application/json');
});
document.getElementById('btn-export-dxf')?.addEventListener('click', () => {
  triggerTextDownload('sps_project_2_full_mep.dxf', exportFloorToDxf(store.getActiveFloor(), store.state.mepSuite), 'application/dxf');
});

// === 7-Bosqich Lentasi, Qatlamlar va Oqim Simulyatsiyasi Boshqaruvi ===
document.querySelectorAll('#stage-ribbon-steps .sps-step-pill').forEach((btn) => {
  btn.addEventListener('click', () => store.setStage(btn.dataset.stage));
});

document.querySelectorAll('.sps-layer-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    const lyr = btn.dataset.lyr;
    const curVis = store.state.settings.visibleLayers || {};
    const nextOn = !curVis[lyr];
    const nextVis = { ...curVis, [lyr]: nextOn };
    const cfg = store.state.settings.mepConfig || {};
    const mepPatch = {};

    // Bosqichma-bosqich rejimda tepa qatlam tugmasi bosilganda, mos tizim hali 'none'/false bo'lsa faqat o'shani yoqadi!
    if (nextOn) {
      const hs = cfg.heatingScheme || 'none';
      if (lyr === 'tp' && (hs === 'none' || hs === 'radiators_only')) {
        mepPatch.heatingScheme = hs === 'radiators_only' ? 'combined' : 'uf_only';
      } else if (lyr === 'rad' && (hs === 'none' || hs === 'uf_only')) {
        mepPatch.heatingScheme = hs === 'uf_only' ? 'combined' : 'radiators_only';
      } else if (lyr === 'vent' && !cfg.enableVent) {
        mepPatch.enableVent = true;
      } else if (lyr === 'vk' && cfg.enableVk === false) {
        mepPatch.enableVk = true;
      } else if (lyr === 'tm' && cfg.enableTm === false) {
        mepPatch.enableTm = true;
      }
    }

    if (Object.keys(mepPatch).length > 0) {
      store.updateSettings({
        visibleLayers: nextVis,
        mepConfig: { ...cfg, ...mepPatch },
      }, 'mep-config');
    } else {
      store.updateSettings({ visibleLayers: nextVis }, 'layers');
    }
  });
});

document.getElementById('btn-reset-mep-all')?.addEventListener('click', () => {
  store.resetAllMepSystems();
});

document.getElementById('btn-flow-sim')?.addEventListener('click', () => {
  store.updateSettings({ flowSimEnabled: !store.state.settings.flowSimEnabled }, 'flow-sim');
});

function renderMepStagePanelsAndOverlays(state) {
  const s = state.settings;
  const stage = s.activeStage || 'arch';
  const suite = state.mepSuite;
  const fl = store.getActiveFloor();
  const mepLeft = document.getElementById('mep-stage-left-box');
  const archLeft = document.getElementById('arch-stage-left-box');
  const docOverlay = document.getElementById('doc-stage-overlay');

  if (!mepLeft || !archLeft || !docOverlay || !suite) return;

  // Arxitektura chap paneli faqat 'arch' bosqichida ko'rinadi
  archLeft.style.display = stage === 'arch' ? 'flex' : 'none';
  archLeft.style.flexDirection = 'column';
  archLeft.style.gap = '10px';
  mepLeft.style.display = stage !== 'arch' && stage !== 'smeta' && stage !== 'docs' ? 'flex' : 'none';
  mepLeft.style.flexDirection = 'column';
  mepLeft.style.gap = '10px';

  if (stage !== 'tm') showTmSchemeOverlay = false;

  // 1) SMETA BOSQICHI (To'liq sahna oynasi — Climate House Код CH + USD/UZS + CSV + 390px Mobil Kartochka)
  if (stage === 'smeta') {
    docOverlay.classList.add('open');
    const prefs = s.smetaPrefs || {};
    const smetaViewMode = prefs.viewMode || 'auto'; // 'auto' | 'cards' | 'table'
    const smeta = buildClimateHouseSmeta(suite, prefs);
    const perM2Usd = smeta.heatedAreaM2 > 0 ? (smeta.grandTotalUsd / smeta.heatedAreaM2).toFixed(1) : '0.0';
    const smetaWrapCls = smetaViewMode === 'cards'
      ? 'sps-smeta-view-cards'
      : smetaViewMode === 'auto'
        ? 'sps-smeta-auto-responsive'
        : '';

    docOverlay.innerHTML = `
      <div class="${smetaWrapCls}" style="max-width:1240px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
          <div>
            <h2 style="margin:0;font-size:18px;">💰 Tijorat Smetasi va Spetsifikatsiya (Climate House · ОВ · ВК · ТМ)</h2>
            <p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary);">
              3D modeldagi haqiqiy quvur metrajlari (+10% zaxira), kollektorlar, nasoslar va kotelxona jihozlari rasmiy <strong>Код CH</strong> bilan bog‘langan
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="sps-btn" id="sm-open-ch">🏪 Climate House Baza (${chStats.totalSkus})</button>
            <button type="button" class="sps-btn" id="sm-goto-docs">📐 ГОСТ А3 Albom →</button>
            <button type="button" class="sps-btn sps-btn-primary" id="sm-dl-csv">📊 Excel Smeta (.CSV)</button>
          </div>
        </div>

        <!-- KPI Kartochkalar -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:12px;">
          <div class="sps-card">
            <div style="font-size:11px;color:var(--text-secondary);font-weight:700;">MATERIALLAR VA USKUNALAR</div>
            <div style="font-size:20px;font-weight:800;color:#38bdf8;margin-top:4px;">$${smeta.materialsUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${smeta.totalItemsCount} pozitsiya</div>
          </div>
          <div class="sps-card">
            <div style="font-size:11px;color:var(--text-secondary);font-weight:700;">MONTAJ VA PUSKONALADKA</div>
            <div style="font-size:20px;font-weight:800;color:#fbbf24;margin-top:4px;">$${smeta.laborUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${prefs.includeLabor !== false ? 'Usta haqi kiritilgan' : 'O‘chirilgan'}</div>
          </div>
          <div class="sps-card">
            <div style="font-size:11px;color:var(--text-secondary);font-weight:700;">JAMI YAKUNIY SMETA ($)</div>
            <div style="font-size:22px;font-weight:900;color:#10b981;margin-top:4px;">$${smeta.grandTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div style="font-size:11px;color:var(--text-secondary);">≈ $${perM2Usd} / m² (${smeta.heatedAreaM2} m²)</div>
          </div>
          <div class="sps-card">
            <div style="font-size:11px;color:var(--text-secondary);font-weight:700;">MILLIY VALYUTADA (UZS)</div>
            <div style="font-size:18px;font-weight:800;color:var(--text-primary);margin-top:4px;">${smeta.grandTotalUzs.toLocaleString('ru-RU')} сўм</div>
            <div style="font-size:11px;color:var(--text-secondary);">Kurs: 1$ = ${prefs.usdToUzs || 12850} сўм</div>
          </div>
        </div>

        <!-- Sozlamalar satri -->
        <div class="sps-card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
          <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
            <strong>Kurs (1$ = сўм):</strong>
            <input type="number" step="50" id="sm-rate" class="sps-input" style="width:98px;" value="${prefs.usdToUzs || 12850}" />
          </label>
          <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
            <strong>Chegirma (%):</strong>
            <input type="number" step="1" min="0" max="45" id="sm-disc" class="sps-input" style="width:68px;" value="${prefs.discountPct || 0}" />
          </label>
          <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="sm-labor" ${prefs.includeLabor !== false ? 'checked' : ''} />
            <strong>Montaj ishlari</strong>
          </label>
          <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="sm-mkt" ${prefs.useMarketFallback !== false ? 'checked' : ''} />
            <strong>Orientir ($) narxlar</strong>
          </label>
          <div class="sps-chip-group" style="margin-left:auto;" title="Telefon va kompyuter uchun smeta ko‘rinishi">
            <button type="button" class="sps-chip ${smetaViewMode === 'auto' ? 'active' : ''}" data-smview="auto">📱 Avto</button>
            <button type="button" class="sps-chip ${smetaViewMode === 'cards' ? 'active' : ''}" data-smview="cards">🗂 Kartochka</button>
            <button type="button" class="sps-chip ${smetaViewMode === 'table' ? 'active' : ''}" data-smview="table">📊 Jadval</button>
          </div>
        </div>

        <!-- 1) Kompyuter / Gorizontal Suriladigan Smeta Jadvali -->
        <div class="sps-card sps-smeta-table-card" style="padding:0;overflow:hidden;">
          <div class="sps-smeta-table-wrap">
            <table class="sps-data-table" style="min-width:860px;">
              <thead>
                <tr>
                  <th>№</th><th>Bo‘lim</th><th>Код CH</th><th>Tovar va texnik tavsifi</th><th>Brend</th>
                  <th>Miqdori</th><th>Narx ($)</th><th>Jami ($)</th><th>Jami (сўм)</th><th>Manba</th>
                </tr>
              </thead>
              <tbody>
                ${smeta.rows.map((r) => `
                  <tr>
                    <td>${r.pos}</td>
                    <td style="font-size:11px;color:var(--text-secondary);">${r.group}</td>
                    <td><span class="sps-ver-badge">${r.skuCode}</span></td>
                    <td><strong>${r.name}</strong>${r.note ? `<div style="font-size:10.5px;color:var(--text-secondary);">${r.note}</div>` : ''}</td>
                    <td>${r.brand}</td>
                    <td style="white-space:nowrap;"><strong>${r.qty} ${r.unit}</strong></td>
                    <td style="width:105px;">
                      <input type="number" step="0.1" class="sps-input sm-price-inp" data-sku="${r.skuCode}" placeholder="Praes $" value="${r.unitUsd !== null ? r.unitUsd : ''}" style="padding:4px 6px;font-size:12px;" />
                    </td>
                    <td style="font-weight:800;color:#10b981;white-space:nowrap;">${r.lineUsd !== null ? `$${r.lineUsd.toFixed(2)}` : '—'}</td>
                    <td style="font-size:11.5px;white-space:nowrap;">${r.lineUzs !== null ? r.lineUzs.toLocaleString('ru-RU') : '—'}</td>
                    <td style="font-size:10.5px;white-space:nowrap;color:${r.priceKind === 'official_ch' ? '#10b981' : '#94a3b8'};">
                      ${r.priceKind === 'official_ch' ? '✓ Опт CH' : r.priceKind === 'custom' ? 'Qo‘lda' : r.priceKind === 'market_ref' ? 'Orientir' : 'Kiritilmagan'}
                    </td>
                  </tr>
                `).join('')}
                ${smeta.laborRows.map((lb) => `
                  <tr style="background:rgba(245,158,11,0.06);">
                    <td>🔧</td>
                    <td>06. Монтаж</td>
                    <td><span class="sps-ver-badge">WORK</span></td>
                    <td><strong>${lb.title}</strong></td>
                    <td>SPS Project</td>
                    <td style="white-space:nowrap;"><strong>${lb.qty} ${lb.unit}</strong></td>
                    <td>$${lb.unitUsd.toFixed(2)}</td>
                    <td style="font-weight:800;color:#fbbf24;white-space:nowrap;">$${lb.lineUsd.toFixed(2)}</td>
                    <td style="white-space:nowrap;">${Math.round(lb.lineUsd * smeta.usdToUzs).toLocaleString('ru-RU')}</td>
                    <td style="font-size:10.5px;color:#fbbf24;white-space:nowrap;">Montaj stavka</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2) 390px Mobil Kartochka Ko'rinishi (Narx $ va Jami $ / сўм kesilmasdan to'liq chiqadi!) -->
        <div class="sps-smeta-mobile-cards">
          ${smeta.rows.map((r) => `
            <div class="sps-smeta-mob-card">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                <span style="display:inline-flex;align-items:center;gap:6px;">
                  <strong style="font-size:11.5px;color:var(--text-secondary);">#${r.pos}</strong>
                  <span class="sps-ver-badge">${r.skuCode}</span>
                  <strong style="font-size:11px;color:var(--brand-blue);">${r.brand}</strong>
                </span>
                <span style="font-size:10.5px;color:${r.priceKind === 'official_ch' ? '#10b981' : 'var(--text-secondary)'};">
                  ${r.priceKind === 'official_ch' ? '✓ Опт CH' : r.priceKind === 'custom' ? 'Qo‘lda' : r.priceKind === 'market_ref' ? 'Orientir' : '—'}
                </span>
              </div>
              <div style="font-size:12.5px;font-weight:700;line-height:1.35;">${r.name}</div>
              ${r.note ? `<div style="font-size:11px;color:var(--text-secondary);">${r.note}</div>` : ''}
              <div class="sps-smeta-mob-grid">
                <div>
                  <div style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;">Miqdori</div>
                  <div style="font-size:12.5px;font-weight:800;">${r.qty} ${r.unit}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;">Narx ($)</div>
                  <input type="number" step="0.1" class="sps-input sm-price-inp" data-sku="${r.skuCode}" placeholder="$" value="${r.unitUsd !== null ? r.unitUsd : ''}" style="padding:4px 6px;font-size:12px;height:28px;" />
                </div>
                <div style="text-align:right;">
                  <div style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;">Jami ($ / сўм)</div>
                  <div style="font-size:13.5px;font-weight:900;color:#10b981;">${r.lineUsd !== null ? `$${r.lineUsd.toFixed(2)}` : '—'}</div>
                  <div style="font-size:10.5px;color:var(--text-secondary);">${r.lineUzs !== null ? `${r.lineUzs.toLocaleString('ru-RU')} сўм` : ''}</div>
                </div>
              </div>
            </div>
          `).join('')}
          ${smeta.laborRows.map((lb) => `
            <div class="sps-smeta-mob-card labor">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <span class="sps-ver-badge">🔧 WORK</span>
                <span style="font-size:10.5px;color:#fbbf24;font-weight:700;">06. Монтаж · SPS Project</span>
              </div>
              <div style="font-size:12.5px;font-weight:700;">${lb.title}</div>
              <div class="sps-smeta-mob-grid">
                <div>
                  <div style="font-size:10px;color:var(--text-secondary);">Miqdori</div>
                  <div style="font-size:12.5px;font-weight:800;">${lb.qty} ${lb.unit}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--text-secondary);">Stavka ($)</div>
                  <div style="font-size:12.5px;font-weight:700;">$${lb.unitUsd.toFixed(2)}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:10px;color:var(--text-secondary);">Jami</div>
                  <div style="font-size:13.5px;font-weight:900;color:#fbbf24;">$${lb.lineUsd.toFixed(2)}</div>
                  <div style="font-size:10.5px;color:var(--text-secondary);">${Math.round(lb.lineUsd * smeta.usdToUzs).toLocaleString('ru-RU')} сўм</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const patchSmeta = (patch) => {
      store.updateSettings({ smetaPrefs: { ...s.smetaPrefs, ...patch } }, 'smeta-prefs');
    };
    docOverlay.querySelector('#sm-rate')?.addEventListener('change', (e) => patchSmeta({ usdToUzs: parseFloat(e.target.value) || 12850 }));
    docOverlay.querySelector('#sm-disc')?.addEventListener('change', (e) => patchSmeta({ discountPct: parseFloat(e.target.value) || 0 }));
    docOverlay.querySelector('#sm-labor')?.addEventListener('change', (e) => patchSmeta({ includeLabor: e.target.checked }));
    docOverlay.querySelector('#sm-mkt')?.addEventListener('change', (e) => patchSmeta({ useMarketFallback: e.target.checked }));
    docOverlay.querySelectorAll('[data-smview]').forEach((btn) => {
      btn.addEventListener('click', () => patchSmeta({ viewMode: btn.dataset.smview }));
    });
    docOverlay.querySelectorAll('.sm-price-inp').forEach((inp) => {
      inp.addEventListener('change', () => {
        const nextCustom = { ...(s.smetaPrefs?.customPrices || {}) };
        if (inp.value === '') delete nextCustom[inp.dataset.sku];
        else nextCustom[inp.dataset.sku] = parseFloat(inp.value);
        patchSmeta({ customPrices: nextCustom });
      });
    });
    docOverlay.querySelector('#sm-open-ch')?.addEventListener('click', () => openClimateHouseCatalogModal());
    docOverlay.querySelector('#sm-goto-docs')?.addEventListener('click', () => store.setStage('docs'));
    docOverlay.querySelector('#sm-dl-csv')?.addEventListener('click', () => {
      triggerTextDownload('sps_climate_house_smeta.csv', exportSmetaToCsv(smeta, state.project.title), 'text/csv;charset=utf-8');
    });
    return;
  }

  // 2) GOST A3 OFORMLENIYA BOSQICHI (7 varaq — ОД-1, АР-ТЭ, ОВ-1, ОВ-2, ВК-1, ТМ-1, СО-1 Spetsifikatsiya!)
  if (stage === 'docs') {
    docOverlay.classList.add('open');
    const smeta = buildClimateHouseSmeta(suite, s.smetaPrefs);
    const meta = s.stampMeta || {};
    const sheets = generateGostAlbumSheets(state.project, suite, smeta, meta);
    const activeSheet = sheets.find((sh) => sh.id === activeGostSheetId) || sheets[0];

    docOverlay.innerHTML = `
      <div style="max-width:1240px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
          <div>
            <h2 style="margin:0;font-size:18px;">📐 ГОСТ Р 21.1101-2013 — Ishchi Loyiha Oformleniyasi (A3 · Форма 3 Штамп · ${sheets.length} List)</h2>
            <p style="margin:3px 0 0;font-size:12px;color:var(--text-secondary);">
              Vektorli chizma albomi: ОД-1 (Пирог пола/стены), АР-ТЭ, ТЭ-1 (17 граф теплопотерь), ОВ-1 (Улитка + Kv), ОВ-2 (Радиаторы β1·β2·β3), ВК-1, УЗ-1 (Монтажные узлы), ТМ-1 va СО-1
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="sps-btn" id="doc-dl-dxf">📐 To‘liq ОВ·ВК·ТМ (.DXF)</button>
            <button type="button" class="sps-btn" id="doc-dl-html">📄 Albomni (.HTML) Saqlash</button>
            <button type="button" class="sps-btn sps-btn-primary" id="doc-print-pdf">🖨 A3 PDF Chop Etish / Saqlash (${sheets.length} List)</button>
          </div>
        </div>

        <!-- Shtamp rekvizitlarini jonli tahrirlash -->
        <div class="sps-card" style="display:grid;grid-template-columns:1fr 1.4fr 1.1fr 0.9fr 1.1fr;gap:8px;margin-bottom:10px;">
          <div class="sps-field"><label>Shifr (Шифр)</label><input id="st-cipher" class="sps-input" value="${meta.cipher || 'SPS-2026-ОВВК-ТМ'}" /></div>
          <div class="sps-field"><label>Obyekt nomi</label><input id="st-title" class="sps-input" value="${meta.projectTitle || state.project.title}" /></div>
          <div class="sps-field"><label>Manzil</label><input id="st-addr" class="sps-input" value="${meta.siteAddress || 'г. Ташкент'}" /></div>
          <div class="sps-field"><label>Loyihachi / ГИП</label><input id="st-eng" class="sps-input" value="${meta.engineer || 'SPS AI ГИП'}" /></div>
          <div class="sps-field"><label>Tashkilot (Штамп)</label><input id="st-org" class="sps-input" value="${meta.org || 'SPS Project · Climate House'}" /></div>
        </div>

        <!-- 7 List tanlash pillari -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          ${sheets.map((sh) => `
            <button type="button" class="sps-step-pill gost-tab-btn ${sh.id === activeSheet.id ? 'active' : ''}" data-sh="${sh.id}">
              Лист ${sh.sheetNo} · ${sh.code}
            </button>
          `).join('')}
        </div>

        <!-- Jonli A3 GOST Varaq Ko'rinishi -->
        <div class="gost-preview-sheet-host">${activeSheet.fullPageHtml}</div>
      </div>
    `;

    docOverlay.querySelectorAll('.gost-tab-btn').forEach((b) => {
      b.addEventListener('click', () => {
        activeGostSheetId = b.dataset.sh;
        renderMepStagePanelsAndOverlays(store.state);
      });
    });

    const saveStamp = () => {
      store.updateSettings({
        stampMeta: {
          cipher: docOverlay.querySelector('#st-cipher').value,
          projectTitle: docOverlay.querySelector('#st-title').value,
          siteAddress: docOverlay.querySelector('#st-addr').value,
          engineer: docOverlay.querySelector('#st-eng').value,
          org: docOverlay.querySelector('#st-org').value,
        },
      }, 'stamp-meta');
    };
    ['#st-cipher', '#st-title', '#st-addr', '#st-eng', '#st-org'].forEach((sel) => {
      docOverlay.querySelector(sel)?.addEventListener('change', saveStamp);
    });

    docOverlay.querySelector('#doc-dl-dxf')?.addEventListener('click', () => {
      triggerTextDownload('sps_gost_ov_vk_tm.dxf', exportFloorToDxf(fl, suite), 'application/dxf');
    });
    docOverlay.querySelector('#doc-dl-html')?.addEventListener('click', () => {
      const fullHtml = buildPrintableGostAlbumDocumentHtml(sheets, meta.projectTitle || state.project.title);
      triggerTextDownload('sps_rabochiy_albom_A3.html', fullHtml, 'text/html;charset=utf-8');
    });
    docOverlay.querySelector('#doc-print-pdf')?.addEventListener('click', () => {
      const fullHtml = buildPrintableGostAlbumDocumentHtml(sheets, meta.projectTitle || state.project.title);
      const w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write(fullHtml);
        w.document.close();
        setTimeout(() => w.print(), 350);
      } else {
        triggerTextDownload('sps_rabochiy_albom_A3.html', fullHtml, 'text/html;charset=utf-8');
      }
    });
    return;
  }

  // Agar ТМ bosqichida "Принципиальная схема ТМ" katta rejimda ochilgan bo'lsa:
  if (stage === 'tm' && showTmSchemeOverlay) {
    docOverlay.classList.add('open');
    docOverlay.innerHTML = `
      <div style="max-width:1050px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;">⚙ Принципиальная тепломеханическая схема котельной (ТМ · S-Press SS304)</h3>
          <button type="button" class="sps-btn sps-btn-primary" id="btn-close-tm-svg">← 2D/3D Kotelxona Sahnaga Qaytish</button>
        </div>
        ${renderTmPrincipleSchemeSvg(suite.tm, s.theme === 'light')}
      </div>
    `;
    docOverlay.querySelector('#btn-close-tm-svg')?.addEventListener('click', () => {
      showTmSchemeOverlay = false;
      renderMepStagePanelsAndOverlays(store.state);
    });
  } else {
    docOverlay.classList.remove('open');
    docOverlay.innerHTML = '';
  }

  // CHAP PANEL: 02 Teplopoterya / 03 ОВ / 04 ВК / 05 ТМ boshqaruvlari
  const cfg = s.mepConfig || {};
  const flHeat = suite.heat.floors.find((f) => f.floorId === fl?.id) || { rooms: [] };
  const flOv = suite.ov.floors.find((f) => f.floorId === fl?.id) || { ufLoops: [], radiators: [] };

  if (stage === 'heat') {
    const heatBalances = flOv.roomBalances || [];
    const balByRoom = new Map(heatBalances.map((b) => [b.roomId, b]));
    const activeHeating = cfg.heatingScheme && cfg.heatingScheme !== 'none';
    mepLeft.innerHTML = `
      ${activeHeating && suite.ov.hasHeatingDeficit ? `
        <section class="sps-card" style="border-color:#FF3445;background:rgba(255,52,69,0.12);">
          <div style="font-size:11.5px;line-height:1.45;color:#fecaca;">
            <strong style="color:#FF3445;">⚠ Isitish quvvati yetishmovchiligi (−${suite.ov.totalDeficitW} W):</strong><br/>
            ${(suite.ov.deficitRooms || []).map((d) => `• <strong>${d.roomName}</strong>: talab ${d.requiredW} W, o‘rnatilgan ${d.installedW} W (<strong>−${d.deficitW} W</strong>)`).join('<br/>')}
          </div>
        </section>
      ` : ''}
      <section class="sps-card">
        <div class="sps-sec-head"><span class="sps-sec-num">02</span> Iqlim va Konstruksiya (QMQ)</div>
        <div class="sps-field">
          <label>Hudud / Qishki hisobiy harorat</label>
          <select id="ht-city" class="sps-select">
            ${UZ_CLIMATE_CITIES.map((c) => `<option value="${c.id}" ${c.id === cfg.cityId ? 'selected' : ''}>${c.name} (${c.tWinterC}°C / +${c.tSummerC}°C)</option>`).join('')}
          </select>
        </div>
        <div class="sps-field">
          <label>Tashqi devor izolyatsiyasi</label>
          <select id="ht-wall" class="sps-select">
            ${WALL_INSULATION_PRESETS.map((w) => `<option value="${w.id}" ${w.id === cfg.wallInsId ? 'selected' : ''}>${w.label}</option>`).join('')}
          </select>
        </div>
        <div class="sps-field">
          <label>Oyna / Vitraj steklopaketi</label>
          <select id="ht-win" class="sps-select">
            ${GLAZING_PRESETS.map((g) => `<option value="${g.id}" ${g.id === cfg.glazingId ? 'selected' : ''}>${g.label}</option>`).join('')}
          </select>
        </div>
        <div class="sps-field">
          <label>Tom / Cherdak utepliteli</label>
          <select id="ht-roof" class="sps-select">
            ${ROOF_PRESETS.map((r) => `<option value="${r.id}" ${r.id === cfg.roofInsId ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
      </section>
      <section class="sps-card">
        <div class="sps-sec-head"><span class="sps-sec-num">∑</span> Bino Issiqlik va Havo Balansi</div>
        <div style="font-size:12px;line-height:1.65;">
          • Umumiy teplopoterya: <strong style="color:#f97316;">${suite.heat.totalHeatLossKw} kW (${suite.heat.totalHeatLossW} W)</strong><br/>
          • Solishtirma yuklama: <strong>${suite.heat.avgSpecificWm2} W/m²</strong><br/>
          • Yozgi sovutish (КД): <strong style="color:#38bdf8;">${suite.heat.totalCoolingKw} kW</strong><br/>
          • Havo balansi (П1 / В1): <strong>+${suite.heat.totalSupplyAirM3h} / −${suite.heat.totalExhaustAirM3h} м³/ч</strong>
        </div>
        <button type="button" class="sps-btn sps-btn-primary" id="ht-open-17col" style="width:100%;margin-top:8px;">
          📊 17-ustunli Ograjeniya Jadvali (Galf + 1.0)
        </button>
      </section>
      <section class="sps-card" style="flex:1;overflow-y:auto;">
        <div class="sps-sec-head"><span class="sps-sec-num">03</span> Xonalar Teplopoteryasi &amp; Balansi</div>
        <div class="sps-room-list">
          ${flHeat.rooms.map((r) => {
            const rb = balByRoom.get(r.roomId);
            return `
            <div class="sps-room-row" style="flex-direction:column;align-items:stretch;gap:2px;">
              <div style="display:flex;justify-content:space-between;gap:6px;">
                <span><strong>${r.roomCode}</strong> ${r.roomName} (${r.areaM2} m²)</span>
                <strong style="color:#f97316;">${r.heatLossW} W</strong>
              </div>
              ${activeHeating && rb ? `
                <div style="font-size:10.5px;display:flex;justify-content:space-between;color:${rb.hasDeficit ? '#FF3445' : '#10b981'};">
                  <span>O‘rnatilgan: ${rb.installedW} W (ТП ${rb.ufOutputW} + Рад ${rb.radOutputW})</span>
                  <strong>${rb.hasDeficit ? `⚠ −${rb.deficitW} W` : `✓ +${rb.deltaW} W`}</strong>
                </div>
              ` : ''}
            </div>
          `;
          }).join('')}
        </div>
      </section>
    `;
    mepLeft.querySelector('#ht-city')?.addEventListener('change', (e) => store.updateMepConfig({ cityId: e.target.value }));
    mepLeft.querySelector('#ht-wall')?.addEventListener('change', (e) => store.updateMepConfig({ wallInsId: e.target.value }));
    mepLeft.querySelector('#ht-win')?.addEventListener('change', (e) => store.updateMepConfig({ glazingId: e.target.value }));
    mepLeft.querySelector('#ht-roof')?.addEventListener('change', (e) => store.updateMepConfig({ roofInsId: e.target.value }));
    mepLeft.querySelector('#ht-open-17col')?.addEventListener('click', () => openEngineeringCalc10Modal('heat17'));
  } else if (stage === 'ov') {
    const radModelsList = Object.values(SPS_RADIATOR_MODELS).filter((m) => m.id !== 'rt_rev_350');
    const radConnsList = Object.values(SPS_RAD_CONNECTIONS);
    const topologiesList = Object.values(SPS_HEATING_TOPOLOGIES);
    const curTopo = cfg.radTopology || 'two_pipe_dead_end';
    const curFam = String(cfg.trunkPipeFamilyId || 'te_sa_press').includes('ppr') ? 'pro_aqua_ppr' : 'te_sa_press';
    const curLowWinMode = cfg.lowWindowEmitterMode === 'trench_convector' ? 'trench_convector' : 'floor_convector';
    const fs = suite.ov.fittingSummary || {};
    const sizePills = (suite.ov.pipeTotalsBySize || [])
      .map((p) => `${p.sizeLabel}: ${p.lengthM}м`)
      .join(' · ');

    const curScheme = cfg.heatingScheme || 'none';
    const isOvClean = curScheme === 'none' && !cfg.enableVent;
    const xpsVal = Number(cfg.ufXpsMm) || 50;

    mepLeft.innerHTML = `
      ${isOvClean ? `
        <section class="sps-card" style="border-color:rgba(7,136,245,0.55);background:rgba(7,136,245,0.08);">
          <div style="font-size:11.8px;line-height:1.45;margin-bottom:7px;">
            <strong style="color:#38bdf8;">🧭 Bosqichma-bosqich ОВ:</strong><br/>
            Bino ichida hozircha hech qanday ОВ sistemasi yo‘q. Qaysi tizimni loyihalashni tanlang:
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;">
            <button type="button" class="sps-btn sps-btn-primary ov-quick-pick" data-sch="radiators_only">+ 🌡 Radiatorlar va Konvektorlar</button>
            <button type="button" class="sps-btn ov-quick-pick" data-sch="uf_only">+ 🔥 Tyopliy pol («Улитка»)</button>
            <button type="button" class="sps-btn ov-quick-pick" data-sch="combined">+ 🔥+🌡 Kombinatsiya (TP + Rad)</button>
          </div>
        </section>
      ` : ''}
      ${curScheme !== 'none' && suite.ov.hasHeatingDeficit ? `
        <section class="sps-card" style="border-color:#FF3445;background:rgba(255,52,69,0.13);">
          <div style="font-size:11.4px;line-height:1.45;color:#fecaca;">
            <strong style="color:#FF3445;">⚠ Xonalar isitish balansida yetishmovchilik (−${suite.ov.totalDeficitW} W):</strong><br/>
            ${(suite.ov.deficitRooms || []).map((d) => `• <strong>${d.roomName}</strong>: talab ${d.requiredW} W · o‘rnatilgan ${d.installedW} W · <strong>−${d.deficitW} W</strong>`).join('<br/>')}
          </div>
          <button type="button" class="sps-btn sps-btn-accent" id="ov-fix-deficit" style="width:100%;margin-top:7px;height:29px;font-size:11.2px;">
            ⚡ Yetishmovchilikni yopish (Радиатор qo‘shish)
          </button>
        </section>
      ` : ''}
      <section class="sps-card">
        <div class="sps-sec-head"><span class="sps-sec-num">03</span> ОВ · Pribor, Armatura &amp; Razvodka</div>
        <div class="sps-field">
          <label>Isitish tizimi tarkibi</label>
          <select id="ov-scheme" class="sps-select">
            <option value="none" ${curScheme === 'none' ? 'selected' : ''}>— Tanlanmagan (O‘chiq) —</option>
            <option value="combined" ${curScheme === 'combined' ? 'selected' : ''}>Kombinatsiya: ТП + Радиатор</option>
            <option value="radiators_only" ${curScheme === 'radiators_only' ? 'selected' : ''}>Faqat Радиатор / Конвектор</option>
            <option value="uf_only" ${curScheme === 'uf_only' ? 'selected' : ''}>Faqat Тёплый пол («Улитка»)</option>
          </select>
        </div>

        <div class="sps-field">
          <label>Truba razvodka sxemasi (Т1/Т2)</label>
          <select id="ov-topology" class="sps-select">
            ${topologiesList.map((t) => `<option value="${t.id}" ${curTopo === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>
        </div>

        <div class="sps-field">
          <label>Quvur va fiting tizimi</label>
          <select id="ov-pipefam" class="sps-select">
            <option value="te_sa_press" ${curFam === 'te_sa_press' ? 'selected' : ''}>TE-SA Press (PE-Xb/Al/PE-Xb 16·20·26)</option>
            <option value="pro_aqua_ppr" ${curFam === 'pro_aqua_ppr' ? 'selected' : ''}>Pro Aqua PP-R RUBIS (SDR 7.4)</option>
          </select>
        </div>

        <div class="sps-field">
          <label>Asosiy radiator modeli</label>
          <select id="ov-radmodel" class="sps-select">
            ${radModelsList.map((m) => `<option value="${m.id}" ${(cfg.radModelId || 'rt_panel_c22') === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
          </select>
        </div>

        <div class="sps-field">
          <label>Vitraj / past podokonnik oldida</label>
          <select id="ov-lowwin" class="sps-select">
            <option value="floor_convector" ${curLowWinMode === 'floor_convector' ? 'selected' : ''}>Напольный конвектор (Konveka FC)</option>
            <option value="trench_convector" ${curLowWinMode === 'trench_convector' ? 'selected' : ''}>Внутрипольный конвектор (Konveka FH)</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,0.95fr);gap:6px;">
          <div class="sps-field">
            <label>Ulanish sxemasi (β1)</label>
            <select id="ov-radconn" class="sps-select">
              ${radConnsList.map((c) => `<option value="${c.id}" ${(cfg.radConnectionId || 'bottom_right_50') === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="sps-field">
            <label>Podvodka chiqishi</label>
            <select id="ov-feedmount" class="sps-select">
              <option value="wall" ${(cfg.radFeedMount || 'wall') === 'wall' ? 'selected' : ''}>Devordan (из стены)</option>
              <option value="floor" ${cfg.radFeedMount === 'floor' ? 'selected' : ''}>Poldan (из пола)</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div class="sps-field">
            <label>ТП qadami</label>
            <select id="ov-step" class="sps-select">
              <option value="150" ${Number(cfg.ufStepMm) === 150 ? 'selected' : ''}>150 mm (С/У 125)</option>
              <option value="200" ${Number(cfg.ufStepMm) === 200 ? 'selected' : ''}>200 mm</option>
              <option value="100" ${Number(cfg.ufStepMm) === 100 ? 'selected' : ''}>100 mm</option>
            </select>
          </div>
          <div class="sps-field">
            <label>Styajka &amp; ЭППС</label>
            <select id="ov-pirog" class="sps-select">
              <option value="wet_30" ${cfg.ufScreedType !== 'semidry' && xpsVal === 30 ? 'selected' : ''}>Мокрая + ЭППС 30 мм</option>
              <option value="wet_50" ${cfg.ufScreedType !== 'semidry' && xpsVal === 50 ? 'selected' : ''}>Мокрая + ЭППС 50 мм</option>
              <option value="wet_100" ${cfg.ufScreedType !== 'semidry' && xpsVal === 100 ? 'selected' : ''}>Мокрая + ЭППС 100 мм</option>
              <option value="semidry_50" ${cfg.ufScreedType === 'semidry' ? 'selected' : ''}>Полусухая + ЭППС 50 мм</option>
            </select>
          </div>
        </div>

        <div class="sps-field">
          <label>Shift diffuzori va КСД turi</label>
          <select id="ov-difftype" class="sps-select">
            <option value="4apn_ksd" ${(cfg.ventDiffuserType || '4apn_ksd') === '4apn_ksd' ? 'selected' : ''}>🌀 4АПН 450×450 + 3КСД</option>
            <option value="dkv_swirl" ${cfg.ventDiffuserType === 'dkv_swirl' ? 'selected' : ''}>🌀 ДКВ-450 (Вихревой) + КСД</option>
            <option value="dsh_slot" ${cfg.ventDiffuserType === 'dsh_slot' ? 'selected' : ''}>🌀 ДЩ-1000 (Щелевой) + КСД</option>
            <option value="dpu_anemostat" ${cfg.ventDiffuserType === 'dpu_anemostat' ? 'selected' : ''}>🌀 ДПУ-М Ø200 (Анемостат) + КСД</option>
          </select>
        </div>

        <div class="sps-field">
          <label>Sovutish tizimi (Фанкойл / Сплит)</label>
          <select id="ov-coolmode" class="sps-select">
            <option value="fancoil_4way" ${(cfg.coolingSystemMode || 'fancoil_4way') === 'fancoil_4way' ? 'selected' : ''}>❄ Кассетный Фанкойл 840×840 (7/12°C)</option>
            <option value="fancoil_wall" ${cfg.coolingSystemMode === 'fancoil_wall' ? 'selected' : ''}>❄ Настенный Фанкойл (7/12°C)</option>
            <option value="split" ${cfg.coolingSystemMode === 'split' ? 'selected' : ''}>Сплит-система инверторная</option>
          </select>
        </div>

        <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;font-size:11.2px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="ov-stair-rad" ${cfg.heatStairwell !== false ? 'checked' : ''} />
            <span>🪜 Zinaxonaga devor radiatori qo‘yish (Р-3)</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="ov-barepipes" ${cfg.ovShowBarePipes !== false ? 'checked' : ''} />
            <span>Ochiq truba &amp; press-fitinglarni ko‘rsatish</span>
          </label>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="ov-vent" ${cfg.enableVent === true ? 'checked' : ''} />
              <span>ПВУ Рекуператор + Фанкойл</span>
            </label>
            <button type="button" class="sps-btn sps-btn-primary" id="ov-open-calc10" style="padding:3px 8px;font-size:11px;">
              📊 Расчёты 1.0
            </button>
          </div>
        </div>

        <!-- Muhandislik Komplektatsiyasi va Balans Xulosasi -->
        <div style="margin-top:7px;padding:6px 8px;border-radius:7px;background:var(--bg-subtle);border:1px solid var(--border);font-size:10.6px;line-height:1.45;">
          ${flOv.ufLoops.length > 0 ? `<div>• <strong>Коллектор ТП:</strong> ${flOv.ufLoops.length} вых. · <span class="sps-ver-badge">${flOv.tpCollector?.skuCode || 'TP-02445'}</span> · ЭППС ${suite.ov.ufXpsMm} мм</div>` : ''}
          ${suite.ov.mixingUnit ? `<div>• <strong>Насос ТП:</strong> ${suite.ov.mixingUnit.pumpModel} (<span class="sps-ver-badge">${suite.ov.mixingUnit.pumpSku}</span>)</div>` : ''}
          ${suite.ov.radPumpSelection && flOv.radiators.length > 0 ? `<div>• <strong>Насос РО:</strong> ${suite.ov.radPumpSelection.pumpModel} (<span class="sps-ver-badge">${suite.ov.radPumpSelection.pumpSku}</span>)</div>` : ''}
          ${cfg.enableVent ? `<div>• <strong>Баланс П1/В1:</strong> +${suite.ov.totalVentSupplyM3h} / −${suite.ov.totalVentExhaustM3h} м³/ч</div>` : ''}
        </div>

        <!-- 🔍 1-Klikda 3D LOD 400 Uzel Yaqinlashtirish Tugmalari -->
        <div style="margin-top:7px;padding-top:7px;border-top:1px solid var(--border);">
          <div style="font-size:10.5px;font-weight:800;color:var(--text-secondary);margin-bottom:4px;">🔍 3D UZELNI YAQINDAN KO‘RISH:</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            <button type="button" class="sps-btn" id="ov-zoom-rad" style="padding:4px 6px;font-size:10.8px;">🔍 Радиатор + Термо</button>
            <button type="button" class="sps-btn" id="ov-zoom-diff" style="padding:4px 6px;font-size:10.8px;">🌀 Диффузор + КСД</button>
            <button type="button" class="sps-btn" id="ov-zoom-fancoil" style="padding:4px 6px;font-size:10.8px;">❄ Фанкойл 840×840</button>
            <button type="button" class="sps-btn" id="ov-zoom-tee" style="padding:4px 6px;font-size:10.8px;">🔍 Тройник / Обвод</button>
          </div>
          ${sizePills ? `<div style="margin-top:5px;font-size:10.4px;color:var(--text-secondary);line-height:1.35;"><strong>Quvurlar:</strong> ${sizePills}<br/><strong>Fitinglar:</strong> Тройники ${(fs.teesReducing || 0) + (fs.teesEqual || 0)} · Углы ${fs.elbows90 || 0} · Обводы ${fs.obvods || 0}</div>` : ''}
        </div>
      </section>
      <section class="sps-card" style="flex:1;overflow-y:auto;min-height:130px;">
        <div class="sps-sec-head"><span class="sps-sec-num">ОВиК</span> ТП (${flOv.ufLoops.length}) · Рад (${flOv.radiators.length}) · П1/В1 (${(flOv.ventTerminals || []).length}) · ФК (${(flOv.acUnits || []).length})</div>
        ${curScheme !== 'none' && (flOv.roomBalances || []).length > 0 ? `
          <div style="margin-bottom:6px;padding-bottom:5px;border-bottom:1px dashed var(--border);">
            ${(flOv.roomBalances || []).map((rb) => `
              <div style="display:flex;justify-content:space-between;font-size:10.6px;padding:2px 0;color:${rb.hasDeficit ? '#FF3445' : 'var(--text-secondary)'};">
                <span><strong>${rb.roomName}</strong>: ${rb.installedW} / ${rb.requiredW} W</span>
                <strong style="color:${rb.hasDeficit ? '#FF3445' : '#10b981'};">${rb.hasDeficit ? `⚠ −${rb.deficitW}W` : `✓ +${rb.deltaW}W`}</strong>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="sps-room-list" style="max-height:240px;">
          ${(flOv.ventTerminals || []).map((vt, vi) => `
            <div class="sps-room-row ov-focus-diff" data-vidx="${vi}" style="font-size:10.8px;cursor:pointer;" title="3D kamerani shu diffuzor va 3КСД kamerasiga yaqinlashtirish">
              <span><strong>🌀 ${vt.code || vt.sys}</strong> ${vt.diffuserType === '4apn_ksd' ? '4АПН+3КСД' : vt.diffuserType === 'dkv_swirl' ? 'ДКВ-450' : vt.diffuserType === 'dsh_slot' ? 'ДЩ-1000' : 'ДПУ-М'}</span>
              <span style="color:${vt.sys === 'P1' ? '#0ea5e9' : '#10b981'};font-weight:700;">${vt.label} м³/ч</span>
            </div>
          `).join('')}
          ${(flOv.acUnits || []).map((ac, ai) => `
            <div class="sps-room-row ov-focus-fancoil" data-aidx="${ai}" style="font-size:10.8px;cursor:pointer;" title="3D kamerani shu fankoyl / sovutish blokiga yaqinlashtirish">
              <span><strong>❄ ${ac.label}</strong> ${ac.kind === 'cassette_4way' ? 'Кассетный 840×840' : ac.roomName}</span>
              <span style="color:#06b6d4;font-weight:700;">${(ac.coolingW / 1000).toFixed(1)} kW</span>
            </div>
          `).join('')}
          ${flOv.radiators.map((r, ri) => `
            <div class="sps-room-row ov-focus-emitter" data-ridx="${ri}" style="font-size:10.8px;cursor:pointer;" title="3D kamerani shu priborga yaqinlashtirish">
              <span><strong>🔍 ${r.label}</strong> ${r.roomName} (${r.branchPipeLabel || 'Ø16'})</span>
              <span style="color:#38bdf8;font-weight:700;">${r.powerW}W</span>
            </div>
          `).join('')}
          ${flOv.ufLoops.map((lp) => `
            <div class="sps-room-row" style="font-size:10.8px;">
              <span><strong>${lp.label}${lp.isIndexLoop ? '*' : ''}</strong> ${lp.roomName} (${lp.surfaceTempC}°C)</span>
              <span style="color:#ef4444;font-weight:700;">${lp.lengthM}m · Kv=${lp.kvSetting}</span>
            </div>
          `).join('')}
        </div>
      </section>
    `;
    const applyOvScheme = (val) => {
      const curVis = store.state.settings.visibleLayers || {};
      store.updateSettings({
        visibleLayers: {
          ...curVis,
          tp: val === 'combined' || val === 'uf_only',
          rad: val === 'combined' || val === 'radiators_only',
        },
        mepConfig: { ...store.state.settings.mepConfig, heatingScheme: val },
      }, 'mep-config');
    };
    mepLeft.querySelector('#ov-scheme')?.addEventListener('change', (e) => applyOvScheme(e.target.value));
    mepLeft.querySelector('#ov-fix-deficit')?.addEventListener('click', () => {
      const nextSch = curScheme === 'uf_only' ? 'combined' : curScheme;
      const curVis = store.state.settings.visibleLayers || {};
      store.updateSettings({
        visibleLayers: { ...curVis, rad: true, tp: nextSch === 'combined' || curVis.tp },
        mepConfig: { ...store.state.settings.mepConfig, heatingScheme: nextSch, heatStairwell: true },
      }, 'mep-config');
    });
    mepLeft.querySelectorAll('.ov-quick-pick').forEach((btn) => {
      btn.addEventListener('click', () => applyOvScheme(btn.dataset.sch));
    });
    mepLeft.querySelector('#ov-topology')?.addEventListener('change', (e) => {
      const nextTopo = e.target.value;
      store.updateMepConfig({
        radTopology: nextTopo,
        ovShowBarePipes: nextTopo !== 'radial',
      });
    });
    mepLeft.querySelector('#ov-pipefam')?.addEventListener('change', (e) => store.updateMepConfig({ trunkPipeFamilyId: e.target.value }));
    mepLeft.querySelector('#ov-lowwin')?.addEventListener('change', (e) => store.updateMepConfig({ lowWindowEmitterMode: e.target.value }));
    mepLeft.querySelector('#ov-radmodel')?.addEventListener('change', (e) => {
      const m = SPS_RADIATOR_MODELS[e.target.value];
      const patch = { radModelId: e.target.value };
      if (m?.kind === 'tubular') patch.radConnectionId = 'bottom_center_50';
      else if (m?.kind === 'floor_convector') patch.radConnectionId = 'bottom_right_50';
      else if (m?.kind === 'sectional' && store.state.settings.mepConfig.radConnectionId === 'bottom_center_50') patch.radConnectionId = 'diag_lr';
      store.updateMepConfig(patch);
    });
    mepLeft.querySelector('#ov-radconn')?.addEventListener('change', (e) => store.updateMepConfig({ radConnectionId: e.target.value }));
    mepLeft.querySelector('#ov-feedmount')?.addEventListener('change', (e) => store.updateMepConfig({ radFeedMount: e.target.value }));
    mepLeft.querySelector('#ov-step')?.addEventListener('change', (e) => store.updateMepConfig({ ufStepMm: Number(e.target.value) }));
    mepLeft.querySelector('#ov-pirog')?.addEventListener('change', (e) => {
      const v = e.target.value;
      if (v === 'semidry_50') store.updateMepConfig({ ufScreedType: 'semidry', ufXpsMm: 50 });
      else if (v === 'wet_30') store.updateMepConfig({ ufScreedType: 'wet', ufXpsMm: 30 });
      else if (v === 'wet_100') store.updateMepConfig({ ufScreedType: 'wet', ufXpsMm: 100 });
      else store.updateMepConfig({ ufScreedType: 'wet', ufXpsMm: 50 });
    });
    mepLeft.querySelector('#ov-difftype')?.addEventListener('change', (e) => {
      store.updateSettings({
        visibleLayers: { ...(store.state.settings.visibleLayers || {}), vent: true },
        mepConfig: { ...store.state.settings.mepConfig, ventDiffuserType: e.target.value, enableVent: true },
      }, 'mep-config');
    });
    mepLeft.querySelector('#ov-coolmode')?.addEventListener('change', (e) => {
      store.updateSettings({
        visibleLayers: { ...(store.state.settings.visibleLayers || {}), vent: true },
        mepConfig: { ...store.state.settings.mepConfig, coolingSystemMode: e.target.value, enableVent: true },
      }, 'mep-config');
    });
    mepLeft.querySelector('#ov-stair-rad')?.addEventListener('change', (e) => {
      const on = e.target.checked;
      store.updateSettings({
        visibleLayers: { ...(store.state.settings.visibleLayers || {}), rad: on ? true : store.state.settings.visibleLayers?.rad },
        mepConfig: { ...store.state.settings.mepConfig, heatStairwell: on },
      }, 'mep-config');
    });
    mepLeft.querySelector('#ov-barepipes')?.addEventListener('change', (e) => store.updateMepConfig({ ovShowBarePipes: e.target.checked }));
    mepLeft.querySelector('#ov-vent')?.addEventListener('change', (e) => {
      const on = e.target.checked;
      store.updateSettings({
        visibleLayers: { ...(store.state.settings.visibleLayers || {}), vent: on },
        mepConfig: { ...store.state.settings.mepConfig, enableVent: on },
      }, 'mep-config');
    });
    mepLeft.querySelector('#ov-open-calc10')?.addEventListener('click', () => openEngineeringCalc10Modal('tp'));

    const ensure3dPaneVisible = () => {
      if (store.state.settings.viewMode === '2d') {
        store.updateSettings({ viewMode: 'split' });
      }
    };
    const focusEmitterObj = (em, distM = 0.88) => {
      if (!em) return;
      ensure3dPaneVisible();
      const targetZ = em.kind === 'floor_convector' ? 0.14 : (em.kind === 'convector' ? 0.04 : 0.28);
      setTimeout(() => {
        viewer3d.focusOnWorldTarget({
          x: em.x,
          y: em.y,
          z: targetZ,
          normalX: em.inNx ?? 0,
          normalY: em.inNy ?? 1,
          distanceM: distM,
        });
      }, 30);
    };

    mepLeft.querySelectorAll('.ov-focus-emitter').forEach((row) => {
      row.addEventListener('click', () => {
        const em = flOv.radiators[Number(row.dataset.ridx)];
        focusEmitterObj(em, 0.86);
      });
    });
    const closeMobDrawerIfOpen = () => {
      document.getElementById('left-stage-panel')?.classList.remove('mob-drawer-open');
    };
    const focusFancoilObj = (ac) => {
      if (!ac) return;
      closeMobDrawerIfOpen();
      ensure3dPaneVisible();
      setTimeout(() => {
        viewer3d.focusOnWorldTarget({
          x: ac.x,
          y: ac.y,
          z: ac.zM || 2.82,
          normalX: -0.7,
          normalY: 0.7,
          distanceM: 1.55,
          elevOffsetM: -0.58,
        });
      }, 30);
    };
    mepLeft.querySelectorAll('.ov-focus-fancoil').forEach((row) => {
      row.addEventListener('click', () => {
        focusFancoilObj((flOv.acUnits || [])[Number(row.dataset.aidx)]);
      });
    });
    const focusDiffuserObj = (vt) => {
      if (!vt) return;
      closeMobDrawerIfOpen();
      ensure3dPaneVisible();
      setTimeout(() => {
        viewer3d.focusOnWorldTarget({
          x: vt.x,
          y: vt.y,
          z: (vt.zM || 2.75) + 0.05,
          normalX: -0.65,
          normalY: 0.75,
          distanceM: 0.92,
          elevOffsetM: -0.44,
        });
      }, 30);
    };
    mepLeft.querySelectorAll('.ov-focus-diff').forEach((row) => {
      row.addEventListener('click', () => {
        focusDiffuserObj((flOv.ventTerminals || [])[Number(row.dataset.vidx)]);
      });
    });
    mepLeft.querySelector('#ov-zoom-diff')?.addEventListener('click', () => {
      focusDiffuserObj((flOv.ventTerminals || [])[0]);
    });
    mepLeft.querySelector('#ov-zoom-rad')?.addEventListener('click', () => {
      const em = flOv.radiators.find((r) => r.kind === 'radiator') || flOv.radiators[0];
      focusEmitterObj(em, 0.84);
    });
    mepLeft.querySelector('#ov-zoom-fancoil')?.addEventListener('click', () => {
      const ac = (flOv.acUnits || [])[0];
      if (ac) focusFancoilObj(ac);
      else {
        const fc = flOv.radiators.find((r) => r.kind === 'floor_convector' || r.kind === 'convector') || flOv.radiators[0];
        focusEmitterObj(fc, 0.86);
      }
    });
    mepLeft.querySelector('#ov-zoom-tee')?.addEventListener('click', () => {
      ensure3dPaneVisible();
      const obvOrTee = (flOv.radFittings || []).find((f) => f.kind === 'obvod')
        || (flOv.radFittings || []).find((f) => f.kind === 'tee')
        || (flOv.radFittings || [])[0];
      if (!obvOrTee) return;
      const bFl = store.getActiveFloor();
      const cx = bFl?.rooms?.[0]?.labelX ?? obvOrTee.x;
      const cy = bFl?.rooms?.[0]?.labelY ?? (obvOrTee.y + 1);
      setTimeout(() => {
        viewer3d.focusOnWorldTarget({
          x: obvOrTee.x,
          y: obvOrTee.y,
          z: 0.05,
          normalX: cx - obvOrTee.x,
          normalY: cy - obvOrTee.y,
          distanceM: 0.52,
        });
      }, 30);
    });
    mepLeft.querySelector('#ov-zoom-all')?.addEventListener('click', () => {
      viewer3d.fitCameraToBuilding();
    });
  } else if (stage === 'vk') {
    const isVkClean = cfg.enableVk === false && suite.vk.fixturesCount === 0;
    mepLeft.innerHTML = `
      <section class="sps-card" style="${isVkClean ? 'border-color:rgba(6,182,212,0.55);background:rgba(6,182,212,0.08);' : ''}">
        <div class="sps-sec-head"><span class="sps-sec-num">04</span> ВК · Bosqichma-bosqich Санфаянс &amp; Quvur</div>
        ${isVkClean ? `
          <div style="font-size:11.6px;line-height:1.45;margin-bottom:8px;">
            Hozir ВК bo‘sh: quyidagi tugmalardan birini tanlab chizmaga bittalab <strong>o‘zingiz qo‘ying</strong> yoki 1-klikda avto-yig‘ing:
          </div>
          <button type="button" class="sps-btn sps-btn-primary" id="btn-vk-auto-build" style="width:100%;margin-bottom:8px;">⚡ Sanuzel va Oshxonaga Avto-ВК Yig‘ish</button>
        ` : `
          <button type="button" class="sps-btn" id="btn-vk-clear" style="width:100%;margin-bottom:8px;font-size:11.5px;">🧹 ВК tizimini tozalash (O‘chirish)</button>
        `}
        <div class="sps-tool-grid">
          <button type="button" class="sps-tool-btn wide ${state.activeTool === 'select' ? 'active' : ''}" data-vktool="select">↖ Tanlash va Surish</button>
          <button type="button" class="sps-tool-btn ${state.activeTool === 'vk_wc' ? 'active' : ''}" data-vktool="vk_wc">🚽 Unitaz Ø110</button>
          <button type="button" class="sps-tool-btn ${state.activeTool === 'vk_sink' ? 'active' : ''}" data-vktool="vk_sink">🚰 Rakovina</button>
          <button type="button" class="sps-tool-btn ${state.activeTool === 'vk_bath' ? 'active' : ''}" data-vktool="vk_bath">🛁 Vanna</button>
          <button type="button" class="sps-tool-btn ${state.activeTool === 'vk_shower' ? 'active' : ''}" data-vktool="vk_shower">🚿 Dush / Trap</button>
          <button type="button" class="sps-tool-btn ${state.activeTool === 'vk_kitchen_sink' ? 'active' : ''}" data-vktool="vk_kitchen_sink">🍽 Moyka</button>
          <button type="button" class="sps-tool-btn ${state.activeTool === 'vk_washer' ? 'active' : ''}" data-vktool="vk_washer">🧺 Kir mashina</button>
        </div>
        <label style="display:flex;align-items:center;gap:7px;font-size:12px;margin-top:9px;cursor:pointer;">
          <input type="checkbox" id="vk-recirc" ${cfg.enableGvsRecirc !== false ? 'checked' : ''} />
          <span>ГВС Retsirkulyatsiya halqasi (Т4)</span>
        </label>
      </section>
      <section class="sps-card">
        <div class="sps-sec-head"><span class="sps-sec-num">СП</span> ВК Gidravlika va Nishablik</div>
        <div style="font-size:12px;line-height:1.65;">
          • Sanfayans nuqtalari: <strong>${suite.vk.fixturesCount} ta</strong><br/>
          • Hisobiy suv sarfi: <strong style="color:#06b6d4;">${suite.vk.designFlowTotalLs} л/с (${suite.vk.peakHourlyM3h} м³/ч)</strong><br/>
          • Suv o‘lchagich / Bosim: <strong>DN${suite.vk.meterDn} · H=${suite.vk.requiredPressureBar} бар</strong><br/>
          • В1 ХВС / Т3+Т4 ГВС: <strong>${suite.vk.totalColdPipeM} m / ${(suite.vk.totalHotPipeM + suite.vk.totalRecircPipeM).toFixed(1)} m</strong><br/>
          • К1 Ø110 (i=0.02): <strong style="color:#a855f7;">${suite.vk.totalSewer110M} m</strong><br/>
          • К1 Ø50 (i=0.03): <strong style="color:#a855f7;">${suite.vk.totalSewer50M} m</strong>
        </div>
      </section>
    `;
    mepLeft.querySelector('#btn-vk-auto-build')?.addEventListener('click', () => {
      store.updateSettings({
        visibleLayers: { ...(store.state.settings.visibleLayers || {}), vk: true },
        mepConfig: { ...store.state.settings.mepConfig, enableVk: true },
      }, 'mep-config');
    });
    mepLeft.querySelector('#btn-vk-clear')?.addEventListener('click', () => {
      store.commit((proj) => {
        for (const f of proj.floors || []) {
          if (Array.isArray(f.elements)) f.elements = f.elements.filter((el) => el.kind !== 'vk_fixture');
        }
      }, 'clear-vk-fixtures');
      store.updateMepConfig({ enableVk: false });
    });
    mepLeft.querySelectorAll('[data-vktool]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.vktool !== 'select' && !store.state.settings.visibleLayers?.vk) {
          store.updateSettings({ visibleLayers: { ...(store.state.settings.visibleLayers || {}), vk: true } }, 'layers');
        }
        store.setTool(b.dataset.vktool);
      });
    });
    mepLeft.querySelector('#vk-recirc')?.addEventListener('change', (e) => store.updateMepConfig({ enableGvsRecirc: e.target.checked }));
  } else if (stage === 'tm') {
    const tm = suite.tm;
    const isTmEnabled = tm.enabled !== false && (tm.equipment3d?.length || 0) > 0;
    mepLeft.innerHTML = isTmEnabled ? `
      <section class="sps-card">
        <div class="sps-sec-head"><span class="sps-sec-num">05</span> ТМ Kotelxona Pasporti</div>
        <div style="font-size:12px;line-height:1.6;">
          • Xona: <strong>${tm.roomName} (${tm.roomAreaM2} m² · V=${tm.roomVolumeM3} m³ ${tm.normVolumePass ? '✓ ≥15m³' : '⚠ <15m³'})</strong><br/>
          • Hisobiy quvvat: <strong style="color:#ef4444;">${tm.designBoilerKw} kW</strong><br/>
          • Qozon: <strong>${tm.boilerModel}</strong> <span class="sps-ver-badge">${tm.boilerSku}</span><br/>
          ${tm.isCompactHeatingOnly
            ? '• Режим ТМ: <strong>Бурчак иссиқлик узели (Фақат иситиш — ВК/ГВС шартмас)</strong><br/>'
            : `• Boyler ГВС: <strong>${tm.bknModel}</strong> <span class="sps-ver-badge">${tm.bknSku}</span><br/>• Suv tozalash: <strong>Imrita M4 + S30 Pro + Аквастоп</strong><br/>`}
          • Kengayish baki: <strong>${tm.expTankLiters} л (Vсис=${tm.systemWaterLiters} л)</strong><br/>
          • Avtomatika: <strong>ZONT H1000+ PRO + ZE-44</strong>
        </div>
        <button type="button" class="sps-btn sps-btn-primary" id="btn-open-tm-svg" style="width:100%;margin-top:10px;">
          📐 Принципиальная схема ТМ (Катта очиш)
        </button>
        <button type="button" class="sps-btn" id="btn-open-tm-calc10" style="width:100%;margin-top:6px;">
          📊 ГС · РБ · БКН Гидравлик Расчёт (1.0)
        </button>
        <button type="button" class="sps-btn" id="btn-tm-disable" style="width:100%;margin-top:6px;font-size:11.5px;">
          🧹 Kotelxona uskunalarini o‘chirish
        </button>
      </section>
      <section class="sps-card" style="flex:1;overflow-y:auto;">
        <div class="sps-sec-head"><span class="sps-sec-num">НК</span> Nasos Guruhlari (Climate House)</div>
        <div class="sps-room-list">
          ${tm.pumpCircuits.map((pc) => `
            <div class="sps-room-row" style="flex-direction:column;align-items:flex-start;gap:2px;">
              <strong>${pc.code}: ${pc.title} (${pc.tempRegime})</strong>
              <span style="font-size:11px;color:var(--text-secondary);">${pc.pumpName} (${pc.pumpSku}) · ${pc.powerKw} кВт · ${pc.flowM3h} м³/ч</span>
            </div>
          `).join('')}
        </div>
      </section>
    ` : `
      <section class="sps-card" style="border-color:rgba(16,185,129,0.55);background:rgba(16,185,129,0.08);">
        <div class="sps-sec-head"><span class="sps-sec-num">05</span> ТМ · Bosqichma-bosqich Kotelxona</div>
        <div style="font-size:12px;line-height:1.55;margin-bottom:10px;">
          Bino teplopoteryasi bo‘yicha talab etiladigan hisobiy quvvat: <strong style="color:#ef4444;">${tm.designBoilerKw} kW</strong>.<br/>
          Kotelxona uskunalarini (Bathello qozon + Gidrostrelka + БКН + Imrita + ZONT) yig‘ish uchun bosing:
        </div>
        <button type="button" class="sps-btn sps-btn-primary" id="btn-tm-enable" style="width:100%;">
          ⚡ Kotelxona Uskunalarini Yig‘ish (ТМ)
        </button>
      </section>
    `;
    mepLeft.querySelector('#btn-tm-enable')?.addEventListener('click', () => {
      store.updateSettings({
        visibleLayers: { ...(store.state.settings.visibleLayers || {}), tm: true },
        mepConfig: { ...store.state.settings.mepConfig, enableTm: true },
      }, 'mep-config');
    });
    mepLeft.querySelector('#btn-tm-disable')?.addEventListener('click', () => {
      store.updateMepConfig({ enableTm: false });
    });
    mepLeft.querySelector('#btn-open-tm-svg')?.addEventListener('click', () => {
      showTmSchemeOverlay = true;
      renderMepStagePanelsAndOverlays(store.state);
    });
    mepLeft.querySelector('#btn-open-tm-calc10')?.addEventListener('click', () => openEngineeringCalc10Modal('tm'));
  }
}
const runIfcExport = () => {
  triggerTextDownload(
    'sps_project_2_8_revit.ifc',
    exportProjectToIfc2x3(store.state.project, store.state.mepSuite),
    'application/x-step',
  );
};
document.getElementById('btn-export-ifc')?.addEventListener('click', runIfcExport);
document.getElementById('mob-exp-ifc')?.addEventListener('click', runIfcExport);
document.getElementById('mob-exp-dxf')?.addEventListener('click', () => {
  const fl = store.getActiveFloor();
  if (fl) triggerTextDownload('sps_project_plan.dxf', exportFloorToDxf(fl, store.state.mepSuite), 'application/dxf');
});
document.getElementById('mob-exp-json')?.addEventListener('click', () => {
  triggerTextDownload('sps_project_2_8.json', JSON.stringify(store.state.project, null, 2), 'application/json');
});
document.getElementById('mob-open-qr')?.addEventListener('click', () => openMobileQrModal());

// === 📡 3D Skaner (LiDAR) & AI Arxitektor Modal ===
document.getElementById('btn-open-scan-ai')?.addEventListener('click', () => openScanAndAiModal());
document.getElementById('btn-open-mobile')?.addEventListener('click', () => openMobileQrModal());

function openScanAndAiModal() {
  const bd = document.createElement('div');
  bd.className = 'sps-modal-backdrop';
  let tab = 'lidar';
  let autoBuildWalls = false;

  const renderModal = () => {
    bd.innerHTML = `
      <div class="sps-modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <h3 style="margin:0;font-size:16px;">📄 Yangi Loyiha &amp; 📡 3D Skaner (Bosqichma-bosqich Rejim)</h3>
            <p style="margin:3px 0 0;font-size:12px;color:var(--text-secondary);">
              Yangi loyiha yoki skan ochilganda ichiga hech qanday ОВ·ВК·ТМ sistemasi darhol qo‘yilmaydi — sekin-asta bosqichma-bosqich o‘zingiz qurib borasiz!
            </p>
          </div>
          <button type="button" class="sps-btn" id="mod-close">✕ Yopish</button>
        </div>

        <!-- Noldan toza loyiha boshlash tezkor paneli -->
        <div style="margin-top:11px;padding:10px 12px;border-radius:10px;background:rgba(16,185,129,0.10);border:1px solid rgba(16,185,129,0.38);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="font-size:12px;line-height:1.4;">
            <strong style="color:#10b981;">⬜ Boshqattan noldan o‘zingiz chizmoqchimisiz?</strong><br/>
            Toza varaq ochiladi (0 m², 0 sistema, Tanlash rejimida) — avval <code>01·Arxitektura</code>, keyin <code>02·Teplopoterya</code> → <code>03·ОВ</code> → <code>04·ВК</code> → <code>05·ТМ</code>.
          </div>
          <button type="button" class="sps-btn sps-btn-primary" id="btn-start-blank-zero">📄 Toza Yangi Loyiha (0 m²)</button>
        </div>

        <div class="sps-chip-group" style="margin-top:12px;width:100%;">
          <button type="button" class="sps-chip ${tab === 'lidar' ? 'active' : ''}" data-mtab="lidar" style="flex:1;">1. 📡 3D Skaner Yuklash &amp; Namunalar</button>
          <button type="button" class="sps-chip ${tab === 'ai' ? 'active' : ''}" data-mtab="ai" style="flex:1;">2. 🤖 AI Matn / Ovozli Arxitektor</button>
          <button type="button" class="sps-chip ${tab === 'sketch' ? 'active' : ''}" data-mtab="sketch" style="flex:1;">3. 📐 Zamer Eskizi / Rasm (Avto-CV)</button>
        </div>

        <div style="margin-top:14px;">
          ${tab === 'lidar' ? `
            <div style="padding:12px;border-radius:10px;border:1px dashed var(--brand-blue);background:rgba(7,136,245,0.08);display:flex;flex-direction:column;gap:9px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                <div style="font-size:12px;line-height:1.45;">
                  <strong>Haqiqiy 3D Skaner (Scaniverse / Polycam / Leica / ReCap) yoki CAD fayllarini yuklash:</strong><br/>
                  Binary/ASCII <code>.ply</code>, <code>.las</code>, <code>.glb</code>, <code>.obj + .mtl + .jpg</code> (birga belgilab tanlang!), <code>.xyz</code>, <code>.pts</code>, <code>.dxf</code>
                </div>
                <label class="sps-btn sps-btn-primary" style="cursor:pointer;">
                  📂 Skan fayllarini tanlash (.ply / .las / .obj+.jpg / .glb / .dxf)
                  <input type="file" id="inp-scan-file" multiple accept=".ply,.las,.glb,.obj,.mtl,.jpg,.jpeg,.png,.xyz,.pts,.dxf,.json" style="display:none;" />
                </label>
              </div>
              <label style="display:flex;align-items:center;gap:7px;font-size:11.8px;cursor:pointer;padding-top:4px;border-top:1px solid rgba(148,163,184,0.2);">
                <input type="checkbox" id="chk-scan-autowalls" ${autoBuildWalls ? 'checked' : ''} />
                <span><strong>Skanerdan devorlarni darhol avto-tiklash</strong> <em>(odatiy o‘chiq: avval faqat toza 2D+3D skan tushadi; xohlasangiz keyin o‘ng paneldan «⚡ Avto-Devor» ni bosasiz yoki o‘zingiz chizasiz!)</em></span>
              </label>
            </div>

            <div style="margin-top:12px;font-size:11.5px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;">
              1-Klikda Sinash Uchun Prototip Skanlar:
            </div>
            <div class="sps-proto-grid">
              ${BUILTIN_ARCH_PROTOTYPES.map((p) => `
                <div class="sps-proto-card" data-proto="${p.id}">
                  <span class="sps-ver-badge">${p.badge}</span>
                  <div style="font-weight:800;font-size:13px;margin-top:7px;">${p.title}</div>
                  <div style="font-size:11.5px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">${p.subtitle}</div>
                </div>
              `).join('')}
            </div>
          ` : tab === 'ai' ? `
            <div class="sps-field">
              <label>Kerakli binoni oddiy o‘zbek yoki rus tilida yozing (yoki mikrofonda ayting):</label>
              <textarea rows="3" class="sps-textarea" id="inp-ai-prompt">${store.state.settings.lastAiPrompt}</textarea>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
              <button type="button" class="sps-btn" id="btn-voice-prompt">🎙 Ovoz bilan aytish</button>
              <button type="button" class="sps-btn sps-btn-primary" id="btn-run-ai-gen" style="margin-left:auto;">⚡ AI Bino Generatsiya Qilish</button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
              <button type="button" class="sps-chip ai-preset" data-p="14x11.5 m 1-qavatli uy: zal, oshxona, 3 yotoqxona, 2 sanuzel, qozonxona">14×11.5 m Hovli (3 yotoq + qozonxona)</button>
              <button type="button" class="sps-chip ai-preset" data-p="2 qavatli kottej 13x10.5 m: katta zal, oshxona, 4 yotoqxona, 2 sanuzel, qozonxona">2-qavatli Kottej (13×10.5 m)</button>
              <button type="button" class="sps-chip ai-preset" data-p="Kvartira 10.5x8.8 m: zal, oshxona, 2 yotoqxona, 1 sanuzel">Kvartira (10.5×8.8 m)</button>
            </div>
          ` : `
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <label class="sps-btn sps-btn-primary" style="cursor:pointer;">
                🖼 Rasm / Kadastr / Eskiz yuklash (PNG/JPG)
                <input type="file" id="inp-sketch-img" accept="image/*" style="display:none;" />
              </label>
              <button type="button" class="sps-btn" id="btn-load-demo-sketch">📝 Demo Zamer Eskizini yuklash</button>
              <button type="button" class="sps-btn" id="btn-cv-vectorize">🔍 Rasmdan Avto-Devor Chiqarish (CV)</button>
              <button type="button" class="sps-btn" id="btn-start-calibrate">📏 2-Nuqtali Masshtab Kalibrlash</button>
            </div>
            <p style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.5;">
              Obyektda daftar varag‘iga chizgan zamer rasmingizni yoki kadastr planini yuklang -> <strong>«Rasmdan Avto-Devor Chiqarish»</strong> tugmasi qoramtir devor chiziqlarini avtomatik 3D BIM devorlarga aylantiradi!
            </p>
          `}
        </div>
      </div>
    `;

    bd.querySelector('#mod-close')?.addEventListener('click', () => bd.remove());
    bd.querySelectorAll('[data-mtab]').forEach((b) => {
      b.addEventListener('click', () => { tab = b.dataset.mtab; renderModal(); });
    });

    bd.querySelector('#btn-start-blank-zero')?.addEventListener('click', () => {
      store.startCleanUserProject(buildPrototypeProject('blank-clean'), { lidarVisible: false });
      bd.remove();
    });

    bd.querySelector('#chk-scan-autowalls')?.addEventListener('change', (e) => {
      autoBuildWalls = e.target.checked;
    });

    bd.querySelectorAll('[data-proto]').forEach((card) => {
      card.addEventListener('click', () => {
        const pid = card.dataset.proto;
        if (pid === 'blank-clean') {
          store.startCleanUserProject(buildPrototypeProject('blank-clean'), { lidarVisible: false });
        } else if (pid === 'sps-office-135528') {
          if (viewer3d.walkMode) viewer3d.setWalkthroughMode(false);
          store.loadCompleteOfficeProject(buildSpsOffice135528Project({ withWalls: true }));
          if (store.state.settings.viewMode === '2d') {
            store.updateSettings({ viewMode: 'split' });
          }
        } else {
          store.loadDemoPrototypeProject(buildPrototypeProject(pid), {
            lidarVisible: pid.includes('lidar'),
          });
        }
        bd.remove();
      });
    });

    bd.querySelector('#inp-scan-file')?.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files?.length) return;
      const shouldAutoWalls = bd.querySelector('#chk-scan-autowalls')
        ? bd.querySelector('#chk-scan-autowalls').checked
        : autoBuildWalls;
      try {
        await importProjectOrScanFiles(files, { autoBuildWalls: shouldAutoWalls });
        bd.remove();
      } catch (err) {
        alert(`Skaner faylini o‘qishda xatolik: ${err.message || err}`);
      }
    });

    bd.querySelectorAll('.ai-preset').forEach((chip) => {
      chip.addEventListener('click', () => {
        const ta = bd.querySelector('#inp-ai-prompt');
        if (ta) ta.value = chip.dataset.p;
      });
    });

    bd.querySelector('#btn-run-ai-gen')?.addEventListener('click', () => {
      const promptVal = bd.querySelector('#inp-ai-prompt')?.value || '';
      store.updateSettings({ lastAiPrompt: promptVal });
      store.startCleanUserProject(generateProjectFromAiPrompt(promptVal), { lidarVisible: false });
      bd.remove();
    });

    bd.querySelector('#btn-voice-prompt')?.addEventListener('click', (ev) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        alert('Brauzeringizda Web Speech ovozli kiritish mavjud emas — matn yozishingiz mumkin.');
        return;
      }
      const rec = new SR();
      rec.lang = 'uz-UZ';
      const btn = ev.currentTarget;
      btn.textContent = '🔴 Gapiring...';
      rec.onresult = (res) => {
        const transcript = res.results?.[0]?.[0]?.transcript || '';
        const ta = bd.querySelector('#inp-ai-prompt');
        if (ta && transcript) ta.value = transcript;
        btn.textContent = '🎙 Ovoz bilan aytish';
      };
      rec.onerror = () => { btn.textContent = '🎙 Ovoz bilan aytish'; };
      rec.start();
    });

    const applyUnderlayUrl = (dataUrl) => {
      store.commit((_p, fl) => {
        fl.scanOverlay = {
          ...(fl.scanOverlay || {}),
          kind: 'underlay',
          visible: true,
          opacity: 0.62,
          underlayDataUrl: dataUrl,
          metersPerPx: 0.0167,
          offsetX: -2.0,
          offsetY: -1.5,
        };
      }, 'set-underlay');
    };

    bd.querySelector('#btn-load-demo-sketch')?.addEventListener('click', () => {
      store.startCleanUserProject(buildPrototypeProject('blank-clean'), { lidarVisible: false });
      applyUnderlayUrl(createDemoHandSketchSvgDataUrl());
      bd.remove();
    });

    bd.querySelector('#inp-sketch-img')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const rdr = new FileReader();
      rdr.onload = () => {
        applyUnderlayUrl(String(rdr.result));
        bd.remove();
      };
      rdr.readAsDataURL(f);
    });

    bd.querySelector('#btn-cv-vectorize')?.addEventListener('click', () => {
      const fl = store.getActiveFloor();
      const url = fl?.scanOverlay?.underlayDataUrl || createDemoHandSketchSvgDataUrl();
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = img.naturalWidth || 960;
        off.height = img.naturalHeight || 800;
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0);
        const imgData = octx.getImageData(0, 0, off.width, off.height);
        const mPerPx = Number(fl?.scanOverlay?.metersPerPx) || 0.0167;
        const walls = detectWallsFromImageData(imgData, mPerPx, 0, 0);
        store.commit((_p, activeFl) => {
          activeFl.nodes = [];
          activeFl.walls = [];
          activeFl.openings = [];
          for (const w of walls) {
            const n1 = { id: `cv_${Math.random()}`, x: w.x1, y: w.y1 };
            const n2 = { id: `cv_${Math.random()}`, x: w.x2, y: w.y2 };
            activeFl.nodes.push(n1, n2);
            activeFl.walls.push({ id: `w_${Math.random()}`, n1: n1.id, n2: n2.id, thickness: 0.25, kind: 'interior' });
          }
          activeFl.scanOverlay = {
            kind: 'underlay',
            visible: true,
            opacity: 0.35,
            underlayDataUrl: url,
            metersPerPx: mPerPx,
            offsetX: 0,
            offsetY: 0,
          };
        }, 'cv-vectorize');
        canvas2d.fitToBuilding();
        bd.remove();
      };
      img.src = url;
    });

    bd.querySelector('#btn-start-calibrate')?.addEventListener('click', () => {
      store.setTool('calibrate');
      bd.remove();
    });
  };

  document.body.appendChild(bd);
  bd.addEventListener('click', (e) => { if (e.target === bd) bd.remove(); });
  renderModal();
}

// === 📱 Mobil Smartfon / Planshet Prezentatsiya Navigatsiyasi ===
const urlSearch = new URLSearchParams(window.location.search);
if (urlSearch.get('mobile') === '1') {
  document.body.classList.add('force-mobile-demo');
}
if (window.innerWidth <= 960 || document.body.classList.contains('force-mobile-demo')) {
  if (store.state.settings.viewMode === 'split') {
    store.updateSettings({ viewMode: '3d' });
  }
}

function syncMobileBottomTabs() {
  const st = store.state.settings.activeStage;
  const vm = store.state.settings.viewMode;
  const drawerOpen = document.getElementById('left-stage-panel')?.classList.contains('mob-drawer-open');
  document.querySelectorAll('#mobile-bottom-nav .sps-mob-tab').forEach((btn) => {
    const k = btn.dataset.mob;
    let active = false;
    if (k === 'drawer') active = Boolean(drawerOpen);
    else if (k === 'smeta') active = st === 'smeta';
    else if (k === 'docs') active = st === 'docs';
    else if (k === 'walk') active = Boolean(viewer3d.walkMode) && st !== 'smeta' && st !== 'docs';
    else if (k === '2d') active = vm === '2d' && st !== 'smeta' && st !== 'docs';
    else if (k === '3d') active = vm !== '2d' && !viewer3d.walkMode && st !== 'smeta' && st !== 'docs';
    btn.classList.toggle('active', active);
  });
}

document.querySelectorAll('#mobile-bottom-nav .sps-mob-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const k = btn.dataset.mob;
    const leftPanel = document.getElementById('left-stage-panel');
    if (k === 'drawer') {
      if (store.state.settings.activeStage === 'smeta' || store.state.settings.activeStage === 'docs') {
        store.setStage('ov');
      }
      leftPanel?.classList.toggle('mob-drawer-open');
      syncMobileBottomTabs();
      return;
    }
    leftPanel?.classList.remove('mob-drawer-open');
    if (k === '3d') {
      if (viewer3d.walkMode) viewer3d.setWalkthroughMode(false);
      if (store.state.settings.activeStage === 'smeta' || store.state.settings.activeStage === 'docs') store.setStage('ov');
      store.updateSettings({ viewMode: '3d' });
      setTimeout(() => { viewer3d.resize(); viewer3d.fitCameraToBuilding(); }, 30);
    } else if (k === 'walk') {
      if (store.state.settings.activeStage === 'smeta' || store.state.settings.activeStage === 'docs') store.setStage('ov');
      store.updateSettings({ viewMode: '3d' });
      setTimeout(() => {
        viewer3d.resize();
        viewer3d.setWalkthroughMode(!viewer3d.walkMode, 'entry');
        syncMobileBottomTabs();
      }, 30);
    } else if (k === '2d') {
      if (viewer3d.walkMode) viewer3d.setWalkthroughMode(false);
      if (store.state.settings.activeStage === 'smeta' || store.state.settings.activeStage === 'docs') store.setStage('ov');
      store.updateSettings({ viewMode: '2d' });
      setTimeout(() => { canvas2d.resize(); canvas2d.fitToBuilding(); }, 30);
    } else if (k === 'smeta') {
      store.setStage('smeta');
    } else if (k === 'docs') {
      store.setStage('docs');
    }
    syncMobileBottomTabs();
  });
});

store.subscribe(() => syncMobileBottomTabs());

function openMobileQrModal() {
  const isHttpsOrigin = window.location.protocol === 'https:';
  let info = {
    ips: [],
    port: Number(window.location.port) || 5188,
    publicUrl: isHttpsOrigin ? window.location.origin : null,
    tunnelStatus: isHttpsOrigin ? 'ready' : 'checking',
  };
  let qrMode = 'public'; // 'public' | 'lan'
  let pollTimer = null;

  const bd = document.createElement('div');
  bd.className = 'sps-modal-backdrop';

  const closeModal = () => {
    if (pollTimer) clearInterval(pollTimer);
    bd.remove();
  };

  const fetchWithTimeout = async (url, ms = 2200) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchLan = async (restart = false) => {
    if (!restart) {
      try {
        const r2 = await fetchWithTimeout(`./tunnel-status.json?t=${Date.now()}`, 1800);
        if (r2.ok) {
          const d2 = await r2.json();
          if (d2?.publicUrl || d2?.ips?.length) {
            info = { ...info, ...d2, publicUrl: d2.publicUrl || info.publicUrl };
            return;
          }
        }
      } catch {
        // ignore
      }
    }
    try {
      const r = await fetchWithTimeout(restart ? '/api/lan-info?restart=1' : '/api/lan-info', 2200);
      if (r.ok) {
        const d = await r.json();
        if (d && (d.publicUrl || d.ips?.length)) info = { ...info, ...d };
      }
    } catch {
      // ignore
    }
  };

  const renderQrCard = () => {
    const lanUrl = info.ips?.[0] ? `http://${info.ips[0]}:${info.port || 5188}/` : `${window.location.origin}/`;
    const pubUrl = info.publicUrl ? `${info.publicUrl.replace(/\/$/, '')}/` : '';
    const shownUrl = (qrMode === 'public' && pubUrl) ? pubUrl : lanUrl;
    const isSim = document.body.classList.contains('force-mobile-demo');

    bd.innerHTML = `
      <div class="sps-modal-card" style="max-width:550px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <h3 style="margin:0;font-size:16px;">📱 Telefon va Boshqa Kompyuterdan Kirish (Prototip)</h3>
            <p style="margin:3px 0 0;font-size:11.8px;color:var(--text-secondary);">
              Istalgan telefon (4G/5G mobil internet yoki Wi-Fi) va boshqa kompyuterga QR yoki link orqali ochib ko‘rsating!
            </p>
          </div>
          <button type="button" class="sps-btn" id="qr-close">✕</button>
        </div>

        <div class="sps-chip-group" style="margin-top:12px;width:100%;">
          <button type="button" class="sps-chip ${qrMode === 'public' ? 'active' : ''}" id="qr-tab-pub" style="flex:1;">🌍 Internet (4G/5G · Boshqa tel/PC)</button>
          <button type="button" class="sps-chip ${qrMode === 'lan' ? 'active' : ''}" id="qr-tab-lan" style="flex:1;">📶 Ofis Wi-Fi (Lokal tarmoq)</button>
        </div>

        <div style="text-align:center;margin:14px 0 10px;">
          <div style="display:inline-block;padding:10px;background:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.28);">
            ${renderSimpleQrOrLinkBadgeSvg(shownUrl, 196)}
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:5px;">
            Telefon kamerasini QR kodga tuting — 3D Mobil Prezentatsiya va Kartochkali Smeta ochiladi!
          </div>
        </div>

        <div class="sps-field">
          <label style="display:flex;justify-content:space-between;align-items:center;">
            <span>🌍 Global 4G/5G &amp; Boshqa Kompyuter HTTPS havolasi:</span>
            <span style="color:${pubUrl ? '#10b981' : '#f59e0b'};font-weight:700;">${pubUrl ? '● Faol (Tayyor)' : '⏳ Tekshirilmoqda...'}</span>
          </label>
          <div style="display:flex;gap:6px;">
            <input type="text" class="sps-input" id="inp-pub-url" readonly value="${pubUrl || 'Lokal rejim faol — global HTTPS link aniqlanmoqda...'}" style="font-family:'JetBrains Mono',monospace;font-size:11.5px;" />
            <button type="button" class="sps-btn sps-btn-primary" id="btn-copy-pub" ${pubUrl ? '' : 'disabled'}>📋 Nusxa</button>
            ${pubUrl ? `<a href="${pubUrl}" target="_blank" rel="noopener" class="sps-btn" style="text-decoration:none;" title="Yangi oynada ochish">↗</a>` : ''}
          </div>
        </div>

        <div class="sps-field" style="margin-top:8px;">
          <label>📶 Ofis / Uy Wi-Fi havolasi (bitta routerdagi telefon va kompyuterlar uchun):</label>
          <div style="display:flex;gap:6px;">
            <input type="text" class="sps-input" id="inp-lan-url" readonly value="${lanUrl}" style="font-family:'JetBrains Mono',monospace;font-size:11.5px;" />
            <button type="button" class="sps-btn" id="btn-copy-lan">📋 Nusxa</button>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">
          <button type="button" class="sps-btn ${isSim ? 'sps-btn-accent' : 'sps-btn-primary'}" id="btn-sim-phone" style="flex:1;">
            ${isSim ? '🖥 Kompyuter Ekraniga Qaytish' : '📱 Shu Ekranda Telefon Ko‘rinishini Sinash (390 px)'}
          </button>
          <button type="button" class="sps-btn" id="btn-restart-tunnel" title="Global HTTPS link holatini yangilash">🔄 Yangilash</button>
        </div>
      </div>
    `;

    bd.querySelector('#qr-close')?.addEventListener('click', closeModal);
    bd.querySelector('#qr-tab-pub')?.addEventListener('click', () => { qrMode = 'public'; renderQrCard(); });
    bd.querySelector('#qr-tab-lan')?.addEventListener('click', () => { qrMode = 'lan'; renderQrCard(); });

    const copyTxt = async (txt, btnEl) => {
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        btnEl.textContent = '✓ Nusxalandi!';
        setTimeout(() => { btnEl.textContent = '📋 Nusxa'; }, 1600);
      } catch {
        window.prompt('Havolani nusxalab oling:', txt);
      }
    };
    bd.querySelector('#btn-copy-pub')?.addEventListener('click', (e) => copyTxt(pubUrl, e.currentTarget));
    bd.querySelector('#btn-copy-lan')?.addEventListener('click', (e) => copyTxt(lanUrl, e.currentTarget));

    bd.querySelector('#btn-sim-phone')?.addEventListener('click', () => {
      const nextSim = !document.body.classList.contains('force-mobile-demo');
      document.body.classList.toggle('force-mobile-demo', nextSim);
      if (nextSim) {
        store.updateSettings({ viewMode: '3d' });
      } else {
        store.updateSettings({ viewMode: 'split' });
      }
      setTimeout(() => {
        canvas2d.resize();
        viewer3d.resize();
        viewer3d.fitCameraToBuilding();
        syncMobileBottomTabs();
      }, 40);
      closeModal();
    });

    bd.querySelector('#btn-restart-tunnel')?.addEventListener('click', async () => {
      if (!isHttpsOrigin) info.publicUrl = null;
      renderQrCard();
      await fetchLan(true);
      if (bd.isConnected) renderQrCard();
    });
  };

  // Modal oynani 0 ms da darhol ochamiz (tarmoq kutishisiz!)
  document.body.appendChild(bd);
  bd.addEventListener('click', (e) => { if (e.target === bd) closeModal(); });
  renderQrCard();

  fetchLan(false).then(() => {
    if (!bd.isConnected) return;
    renderQrCard();
    if (!info.publicUrl) {
      pollTimer = setInterval(async () => {
        await fetchLan(false);
        if (!bd.isConnected) {
          clearInterval(pollTimer);
          return;
        }
        if (info.publicUrl) {
          clearInterval(pollTimer);
          pollTimer = null;
          renderQrCard();
        }
      }, 2000);
    }
  });
}

// === 📋 Santex · Climate House Dala O'lchovi (Toza Haqiqiy O'lchov vs 5,40×3,60 m O'quv Namunasi) ===
const SURVEY_CACHE_KEY = 'sps_arch2_field_survey_v2';
let activeSurveyDoc = (() => {
  try {
    const raw = localStorage.getItem(SURVEY_CACHE_KEY);
    if (raw) {
      const parsed = normalizeSurveyProject(JSON.parse(raw));
      if (String(parsed.name || '').includes('Texnik Xona Piloti') && parsed.isSampleDemo === undefined) {
        parsed.isSampleDemo = true;
      }
      return parsed;
    }
    return createBlankSurveyProject('Yangi Obyekt · Haqiqiy Dala O‘lchovi');
  } catch {
    return createBlankSurveyProject('Yangi Obyekt · Haqiqiy Dala O‘lchovi');
  }
})();

function persistSurveyDoc() {
  try {
    localStorage.setItem(SURVEY_CACHE_KEY, JSON.stringify(activeSurveyDoc));
  } catch {
    // ignore
  }
}

document.getElementById('btn-open-survey')?.addEventListener('click', () => openFieldSurveyWorkbenchModal());
document.getElementById('btn-open-ch-catalog')?.addEventListener('click', () => openClimateHouseCatalogModal());

function openFieldSurveyWorkbenchModal() {
  const bd = document.createElement('div');
  bd.className = 'sps-modal-backdrop';
  let errBanner = '';

  const renderWb = () => {
    const rm = activeSurveyDoc.rooms[0];
    const isDemo = Boolean(activeSurveyDoc.isSampleDemo);
    const aiInfo = buildAiMissingDataAndQuestions(activeSurveyDoc);

    bd.innerHTML = `
      <div class="sps-modal-card" style="width:min(940px,97vw);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <h3 style="margin:0;font-size:16px;">📋 Santex · Climate House — Dala O‘lchovi va Lazer Nazorati</h3>
              <span class="sps-ver-badge" style="${isDemo ? 'background:rgba(245,158,11,0.22);border-color:#f59e0b;color:#fbbf24;' : 'background:rgba(16,185,129,0.18);border-color:#10b981;color:#10b981;'}">
                ${isDemo ? '🧪 O‘QUV NAMUNASI (DEMO)' : '📐 HAQIQIY LOYIHA O‘LCHOVI'}
              </span>
            </div>
            <p style="margin:3px 0 0;font-size:12px;color:var(--text-secondary);">
              XYZ / PTS / PLY skan + Lazer A–B solishtiruvi + MEP nuqtalar (taxminsiz!) + DXF, CSV va AI savollar
            </p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="sps-btn sps-btn-primary" id="sv-new-blank">➕ Toza Haqiqiy O‘lchov</button>
            <button type="button" class="sps-btn" id="sv-reset-demo">🧪 5,40×3,60 m Demo Namuna</button>
            <label class="sps-btn" style="cursor:pointer;">📂 JSON<input type="file" id="sv-open-json" accept=".json" style="display:none;"/></label>
            <button type="button" class="sps-btn" id="sv-save-json">💾 Saqlash</button>
            <button type="button" class="sps-btn" id="sv-close">✕</button>
          </div>
        </div>

        ${isDemo ? `
          <div style="margin-top:10px;padding:9px 12px;border-radius:9px;background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.55);color:#fde68a;font-size:11.8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <span>
              <strong>🧪 DIQQAT — O‘QUV NAMUNASI:</strong> Bu 5,40×3,60×2,80 m namunaviy ma’lumot bo‘lib, <strong>haqiqiy obyekt dala o‘lchovi tasdig‘i emas!</strong> Haqiqiy loyiha uchun yangi o‘lchov varag‘ini oching:
            </span>
            <button type="button" class="sps-btn sps-btn-primary" id="sv-banner-start-real" style="height:29px;padding:0 10px;font-size:11.5px;">➕ Haqiqiy O‘lchov Boshlash</button>
          </div>
        ` : ''}

        ${errBanner ? `<div style="margin-top:10px;padding:8px 11px;border-radius:8px;background:rgba(255,52,69,0.16);border:1px solid #FF3445;color:#fecaca;font-size:12px;font-weight:700;">⚠ ${errBanner}</div>` : ''}

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px;">
          <!-- 1-ustun: Xona Lazer O'lchovi + Skan A-B Nazorati -->
          <div class="sps-card">
            <div class="sps-sec-head"><span class="sps-sec-num">01</span> Xona Lazer O‘lchovi &amp; Skan Nazorati</div>
            <div class="sps-field" style="margin-bottom:6px;">
              <label>Obyekt / Xona nomi</label>
              <input id="sv-proj-name" type="text" class="sps-input" value="${activeSurveyDoc.name || ''}" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
              <div class="sps-field"><label>Uzunlik L (m)</label><input id="sv-l" type="number" step="0.01" class="sps-input" value="${rm.length.toFixed(2)}" /></div>
              <div class="sps-field"><label>Kenglik W (m)</label><input id="sv-w" type="number" step="0.01" class="sps-input" value="${rm.width.toFixed(2)}" /></div>
              <div class="sps-field"><label>Balandlik H (m)</label><input id="sv-h" type="number" step="0.01" class="sps-input" value="${rm.height.toFixed(2)}" /></div>
            </div>
            <label style="display:flex;align-items:center;gap:7px;font-size:12px;margin:8px 0;cursor:pointer;">
              <input type="checkbox" id="sv-rm-ver" ${!isDemo && rm.verified ? 'checked' : ''} />
              <strong>${isDemo ? 'Lazer ruletka bilan haqiqiy o‘lchov tasdig‘i (Namuna rejimida emas)' : 'Xona o‘lchovlari lazer ruletka (Bosch/Leica) bilan tasdiqlandi'}</strong>
            </label>

            <div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;">
              <select id="sv-scan-unit" class="sps-select" style="width:118px;">
                <option value="m">Skan: Metr (m)</option>
                <option value="mm">Skan: mm</option>
              </select>
              <label class="sps-btn" style="cursor:pointer;flex:1;">
                📡 XYZ / PTS / PLY Yuklash (${rm.scan ? `${rm.scan.count} nuqta` : 'yo‘q'})
                <input type="file" id="sv-scan-file" accept=".xyz,.pts,.ply" style="display:none;" />
              </label>
            </div>

            <div style="margin-top:10px;font-size:11px;font-weight:800;color:var(--text-secondary);">SKAN MASOFASI vs LAZER RULETKA NAZORATI:</div>
            <div style="display:flex;flex-direction:column;gap:5px;margin-top:5px;">
              ${rm.checks.length === 0 ? `<div style="font-size:11.5px;color:var(--text-secondary);padding:6px 8px;border-radius:6px;background:var(--bg-subtle);">Hali nazorat masofasi kiritilmagan — skan va lazer ruletka qiymatini solishtiring.</div>` : ''}
              ${rm.checks.map((c) => `
                <div style="display:flex;justify-content:space-between;padding:6px 8px;border-radius:6px;background:var(--bg-subtle);font-size:11.5px;border:1px solid ${isDemo ? 'rgba(245,158,11,0.45)' : c.pass ? 'rgba(16,185,129,0.4)' : '#FF3445'};">
                  <span>${c.name} (Skan ${c.scanM}m / Lazer ${c.laserM}m)</span>
                  <strong style="color:${isDemo ? '#fbbf24' : c.pass ? '#10b981' : '#FF3445'};">Δ ${c.deltaMm} mm · ${isDemo ? '🧪 NAMUNA' : c.pass ? 'MOS' : 'QAYTA O‘LCHANG!'}</strong>
                </div>
              `).join('')}
            </div>
            <div style="display:grid;grid-template-columns:1.1fr 0.8fr 0.8fr 0.7fr auto;gap:4px;margin-top:7px;">
              <input id="sv-chk-name" class="sps-input" placeholder="Nazorat nomi" value="Diagonal A–C" />
              <input id="sv-chk-scan" type="number" step="0.001" class="sps-input" placeholder="Skan m" value="6.482" />
              <input id="sv-chk-laser" type="number" step="0.001" class="sps-input" placeholder="Lazer m" value="6.490" />
              <input id="sv-chk-tol" type="number" step="1" class="sps-input" placeholder="mm" value="20" />
              <button type="button" class="sps-btn" id="sv-add-chk">＋</button>
            </div>
          </div>

          <!-- 2-ustun: MEP Nuqtalari (Taxminsiz!) + Muhandis Tasdig'i -->
          <div class="sps-card">
            <div class="sps-sec-head" style="justify-content:space-between;">
              <span style="display:flex;align-items:center;gap:6px;"><span class="sps-sec-num">02</span> MEP Ulanish &amp; Climate House Uskunalar</span>
              <button type="button" class="sps-btn" id="sv-pick-ch-sku" style="height:24px;padding:0 8px;font-size:11px;">🏪 CH Katalog (${chStats.totalSkus})</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;max-height:175px;overflow-y:auto;">
              ${rm.points.length === 0 ? `<div style="font-size:11.5px;color:var(--text-secondary);padding:8px;border-radius:6px;background:var(--bg-subtle);">MEP ulanish nuqtalari hali kiritilmagan — obyektda lazer / shtangensirkul bilan o‘lchab qo‘shing.</div>` : ''}
              ${rm.points.map((p) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;background:var(--bg-subtle);font-size:11.5px;gap:6px;">
                  <span>
                    <strong>[${p.type}]</strong> ${p.name} · (${p.x}, ${p.y}, Z=${p.z}m)${p.diameterMm ? ` · Ø${p.diameterMm}` : ''}
                    ${p.skuCode ? `<span class="sps-ver-badge" style="margin-left:4px;">${p.skuCode}${p.priceUsd !== null && p.priceUsd !== undefined ? ` · $${Number(p.priceUsd).toFixed(2)}` : ''}</span>` : ''}
                  </span>
                  <span style="color:${isDemo ? '#fbbf24' : p.verified ? '#10b981' : '#f59e0b'};font-weight:700;white-space:nowrap;">${isDemo ? '🧪 Namuna' : p.verified ? '✓ Tasdiq' : '○ Qoralama'}</span>
                </div>
              `).join('')}
            </div>

            <div style="display:grid;grid-template-columns:1.15fr 0.75fr 0.85fr 0.55fr 0.55fr 0.55fr 0.55fr;gap:4px;margin-top:8px;">
              <input id="sv-pt-name" class="sps-input" placeholder="Nuqta / Uskuna nomi" />
              <input id="sv-pt-sku" class="sps-input" placeholder="Код CH (EL-00013)" title="Rasmiy Climate House tovar kodi" />
              <select id="sv-pt-type" class="sps-select">${MEP_POINT_TYPES.map((t) => `<option>${t}</option>`).join('')}</select>
              <input id="sv-pt-x" type="number" step="0.01" class="sps-input" placeholder="X m" value="1.20" />
              <input id="sv-pt-y" type="number" step="0.01" class="sps-input" placeholder="Y m" value="0.25" />
              <input id="sv-pt-z" type="number" step="0.01" class="sps-input" placeholder="Z m" value="0.50" />
              <input id="sv-pt-dn" type="number" step="1" class="sps-input" placeholder="Ø mm" />
            </div>
            <div style="display:flex;gap:6px;margin-top:5px;align-items:center;">
              <select id="sv-pt-src" class="sps-select" style="flex:1;">
                <option value="laser_manual">Manba: Lazer / Shtangensirkul (Joyida)</option>
                <option value="scan_only">Manba: Faqat Telefon Skani (Taxmin bloklanadi!)</option>
              </select>
              <button type="button" class="sps-btn sps-btn-primary" id="sv-add-pt">＋ Qo‘shish</button>
            </div>

            <div style="margin-top:10px;padding:8px;border-radius:8px;background:var(--bg-subtle);border:1px solid var(--border);">
              <div style="font-size:11px;font-weight:800;color:var(--brand-blue);">AI ANIQLAGAN SAVOLLAR (${aiInfo.fieldQuestions.length}) VA KAMCHILIKLAR (${aiInfo.missingItems.length}):</div>
              <div style="font-size:11px;color:var(--text-secondary);max-height:74px;overflow-y:auto;margin-top:4px;line-height:1.45;">
                ${[...aiInfo.missingItems, ...aiInfo.fieldQuestions].slice(0, 5).map((q) => `• ${q}`).join('<br/>')}
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border);">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <input id="sv-eng-name" class="sps-input" style="width:190px;" value="${activeSurveyDoc.engineerSignOff.engineerName || 'Muhandis (SPS AI)'}" />
            <button type="button" class="sps-btn ${!isDemo && activeSurveyDoc.engineerSignOff.approved ? 'sps-btn-primary' : ''}" id="sv-approve-btn">
              ${isDemo ? '🧪 Namuna (Tasdiqlanmagan)' : activeSurveyDoc.engineerSignOff.approved ? '✓ Muhandis Tasdiqlagan' : '✍ Muhandis Tasdig‘i'}
            </button>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="sps-btn" id="sv-dl-ai">🤖 AI Savollar (.TXT)</button>
            <button type="button" class="sps-btn" id="sv-dl-csv">📊 Jadval (.CSV)</button>
            <button type="button" class="sps-btn" id="sv-dl-dxf">📐 DXF (${Math.round(rm.length * 1000)}×${Math.round(rm.width * 1000)} mm)</button>
            <button type="button" class="sps-btn sps-btn-primary" id="sv-push-3d">🏗 2D/3D BIM Sahnaga Chiqarish</button>
          </div>
        </div>
      </div>
    `;

    const safeRun = (fn) => {
      try {
        errBanner = '';
        fn();
        persistSurveyDoc();
        renderWb();
      } catch (err) {
        errBanner = err.message || String(err);
        renderWb();
      }
    };

    const startCleanRealSurvey = () => safeRun(() => {
      const curFl = store.getActiveFloor();
      const firstRoom = curFl?.rooms?.[0];
      activeSurveyDoc = createBlankSurveyProject(
        store.state.project?.title ? `${store.state.project.title} · Dala O‘lchovi` : 'Yangi Obyekt · Haqiqiy Dala O‘lchovi',
      );
      if (firstRoom && firstRoom.bboxW > 1 && firstRoom.bboxH > 1) {
        activeSurveyDoc.rooms[0].name = firstRoom.name || 'Asosiy xona';
        activeSurveyDoc.rooms[0].length = Number(firstRoom.bboxW.toFixed(2));
        activeSurveyDoc.rooms[0].width = Number(firstRoom.bboxH.toFixed(2));
        activeSurveyDoc.rooms[0].height = Number((curFl.height || 3.0).toFixed(2));
      }
    });

    bd.querySelector('#sv-close')?.addEventListener('click', () => bd.remove());
    bd.querySelector('#sv-new-blank')?.addEventListener('click', startCleanRealSurvey);
    bd.querySelector('#sv-banner-start-real')?.addEventListener('click', startCleanRealSurvey);
    bd.querySelector('#sv-reset-demo')?.addEventListener('click', () => safeRun(() => {
      activeSurveyDoc = createTechnicalRoom540x360Sample();
    }));

    for (const idKey of ['sv-proj-name', 'sv-l', 'sv-w', 'sv-h', 'sv-rm-ver']) {
      bd.querySelector(`#${idKey}`)?.addEventListener('change', () => safeRun(() => {
        activeSurveyDoc.name = bd.querySelector('#sv-proj-name')?.value?.trim() || activeSurveyDoc.name;
        activeSurveyDoc.isSampleDemo = false; // Foydalanuvchi haqiqiy o'lchov kiritdi
        rm.length = parseFloat(bd.querySelector('#sv-l').value) || rm.length;
        rm.width = parseFloat(bd.querySelector('#sv-w').value) || rm.width;
        rm.height = parseFloat(bd.querySelector('#sv-h').value) || rm.height;
        rm.verified = bd.querySelector('#sv-rm-ver').checked;
        activeSurveyDoc = normalizeSurveyProject(activeSurveyDoc);
      }));
    }

    bd.querySelector('#sv-scan-file')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const unit = bd.querySelector('#sv-scan-unit').value;
      const ext = f.name.split('.').pop().toLowerCase();
      const buf = await f.arrayBuffer();
      safeRun(() => {
        activeSurveyDoc.isSampleDemo = false;
        rm.scan = parsePointCloudScan(buf, ext, unit, f.name);
      });
    });

    bd.querySelector('#sv-add-chk')?.addEventListener('click', () => safeRun(() => {
      activeSurveyDoc.isSampleDemo = false;
      const chk = evaluateLaserControlCheck({
        name: bd.querySelector('#sv-chk-name').value,
        scanM: parseFloat(bd.querySelector('#sv-chk-scan').value),
        laserM: parseFloat(bd.querySelector('#sv-chk-laser').value),
        toleranceMm: parseFloat(bd.querySelector('#sv-chk-tol').value),
      });
      rm.checks.push(chk);
    }));

    bd.querySelector('#sv-pick-ch-sku')?.addEventListener('click', () => {
      openClimateHouseCatalogModal((sku) => {
        const preset = inferMepPointPresetFromSku(sku);
        const nmInp = bd.querySelector('#sv-pt-name');
        const skuInp = bd.querySelector('#sv-pt-sku');
        const tpSel = bd.querySelector('#sv-pt-type');
        if (nmInp) nmInp.value = preset.name;
        if (skuInp) skuInp.value = preset.skuCode;
        if (tpSel) tpSel.value = preset.type;
      });
    });

    bd.querySelector('#sv-add-pt')?.addEventListener('click', () => safeRun(() => {
      activeSurveyDoc.isSampleDemo = false;
      const dnRaw = bd.querySelector('#sv-pt-dn').value;
      const rawSkuCode = bd.querySelector('#sv-pt-sku')?.value?.trim() || '';
      const matchedSku = rawSkuCode ? findClimateHouseSku(rawSkuCode) : null;
      const preset = matchedSku ? inferMepPointPresetFromSku(matchedSku) : null;
      const pt = validateAndNormalizeMepPoint(
        {
          name: bd.querySelector('#sv-pt-name').value || preset?.name || 'Yangi nuqta',
          type: bd.querySelector('#sv-pt-type').value,
          x: parseFloat(bd.querySelector('#sv-pt-x').value),
          y: parseFloat(bd.querySelector('#sv-pt-y').value),
          z: parseFloat(bd.querySelector('#sv-pt-z').value),
          diameterMm: dnRaw ? parseFloat(dnRaw) : null,
          source: bd.querySelector('#sv-pt-src').value,
          skuCode: matchedSku ? matchedSku.code : rawSkuCode,
          skuBrand: matchedSku ? matchedSku.brand : '',
          skuArticle: matchedSku ? matchedSku.article : '',
          priceUsd: matchedSku ? matchedSku.priceUsd : null,
          detail: preset ? preset.detail : '',
          verified: true,
        },
        rm,
      );
      rm.points.push(pt);
    }));

    bd.querySelector('#sv-approve-btn')?.addEventListener('click', () => safeRun(() => {
      if (activeSurveyDoc.isSampleDemo) {
        throw new Error('O‘quv namunasi (Demo) ma’lumotlarini haqiqiy o‘lchov sifatida tasdiqlab bo‘lmaydi! Avval «➕ Toza Haqiqiy O‘lchov» tugmasini bosing.');
      }
      activeSurveyDoc = approveSurveyByEngineer(activeSurveyDoc, bd.querySelector('#sv-eng-name').value);
    }));

    bd.querySelector('#sv-save-json')?.addEventListener('click', () => {
      triggerTextDownload('santex-climate-zamer.json', JSON.stringify(activeSurveyDoc, null, 2), 'application/json');
    });
    bd.querySelector('#sv-open-json')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const txt = await f.text();
      safeRun(() => {
        activeSurveyDoc = normalizeSurveyProject(JSON.parse(txt));
      });
    });

    bd.querySelector('#sv-dl-ai')?.addEventListener('click', () => {
      triggerTextDownload('santex-ai-savollar.txt', buildAiMissingDataAndQuestions(activeSurveyDoc).promptText, 'text/plain;charset=utf-8');
    });
    bd.querySelector('#sv-dl-csv')?.addEventListener('click', () => {
      triggerTextDownload('santex-olchovlar.csv', makeSurveyCsv(activeSurveyDoc), 'text/csv;charset=utf-8');
    });
    bd.querySelector('#sv-dl-dxf')?.addEventListener('click', () => safeRun(() => {
      triggerTextDownload('texnik-xona-5400x3600-mm.dxf', makeSurveyRoomDxfMm(rm), 'application/dxf');
    }));
    bd.querySelector('#sv-push-3d')?.addEventListener('click', () => {
      const floor3d = convertSurveyRoomToPlanarFloor(rm);
      store.loadNewProject({ title: activeSurveyDoc.name, floors: [floor3d] });
      bd.remove();
    });
  };

  document.body.appendChild(bd);
  bd.addEventListener('click', (e) => { if (e.target === bd) bd.remove(); });
  renderWb();
}

// === 🏪 Rasmiy «Climate House» Tovarlar va Kodlar Bazasi Modali (3 790 ta SKU + ZONT / 7200S / 8784A / IMRITA / S-PRESS) ===
const CH_PREF_KEY = 'sps_arch2_ch_catalog_prefs_v1';

function openClimateHouseCatalogModal(onSelectSku = null) {
  let saved = { query: '', section: 'ALL', brand: 'ALL' };
  try {
    const raw = localStorage.getItem(CH_PREF_KEY);
    if (raw) saved = { ...saved, ...JSON.parse(raw) };
  } catch {
    // ignore
  }

  const brands = getClimateHouseBrands();
  const bd = document.createElement('div');
  bd.className = 'sps-modal-backdrop';
  bd.style.zIndex = '1150';
  let toastMsg = '';

  const savePrefs = () => {
    try {
      localStorage.setItem(CH_PREF_KEY, JSON.stringify(saved));
    } catch {
      // ignore
    }
  };

  bd.innerHTML = `
    <div class="sps-modal-card" style="width:min(960px,97vw);max-height:92vh;display:flex;flex-direction:column;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <h3 style="margin:0;font-size:16px;">🏪 Climate House — Rasmiy Tovarlar va Kodlar Bazasi (${chStats.totalSkus} pozitsiya)</h3>
          <p style="margin:3px 0 0;font-size:12px;color:var(--text-secondary);">
            Манба: «Коды товаров Climate House 12.11.2026.xlsx» + Telegram прайс (ZONT, 7200S, 8784A, Imrita, S-Press) · ${chStats.pricedCount} ta tasdiqlangan ($) narx
          </p>
        </div>
        <button type="button" class="sps-btn" id="ch-mod-close">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:8px;margin-top:10px;">
        <input id="ch-search-inp" type="search" class="sps-input" placeholder="Код CH, Бренд, Артикул yoki nom yozing (masalan: 7200S, 8784A, ZONT, TE-SA, Imrita, EL-00013)..." />
        <select id="ch-brand-sel" class="sps-select">
          <option value="ALL">Barcha brendlar (${brands.length} ta)</option>
          ${brands.map((b) => `<option value="${b.brand}">${b.brand} (${b.count})</option>`).join('')}
        </select>
      </div>

      <div id="ch-sec-chips" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;">
        ${CLIMATE_HOUSE_QUICK_FILTERS.map((f) => `
          <button type="button" class="sps-chip ch-sec-chip" data-sec="${f.id}">${f.label}</button>
        `).join('')}
      </div>

      <div id="ch-toast-bar" style="display:none;margin-top:8px;padding:6px 10px;border-radius:7px;background:rgba(16,185,129,0.16);border:1px solid rgba(16,185,129,0.45);color:#10b981;font-size:12px;font-weight:700;"></div>

      <div id="ch-results-meta" style="margin-top:8px;font-size:11.5px;color:var(--text-secondary);font-weight:700;"></div>

      <div id="ch-results-box" style="margin-top:6px;flex:1;overflow-y:auto;max-height:430px;border:1px solid var(--border);border-radius:10px;background:var(--bg-subtle);"></div>
    </div>
  `;

  const searchInp = bd.querySelector('#ch-search-inp');
  const brandSel = bd.querySelector('#ch-brand-sel');
  const resultsBox = bd.querySelector('#ch-results-box');
  const metaBox = bd.querySelector('#ch-results-meta');
  const toastBar = bd.querySelector('#ch-toast-bar');

  searchInp.value = saved.query || '';
  brandSel.value = saved.brand || 'ALL';

  const renderRows = () => {
    bd.querySelectorAll('.ch-sec-chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.sec === saved.section);
    });
    if (toastMsg) {
      toastBar.style.display = 'block';
      toastBar.textContent = toastMsg;
    } else {
      toastBar.style.display = 'none';
    }

    const rows = searchClimateHouseCatalog(saved.query, {
      section: saved.section,
      brand: saved.brand,
      limit: 150,
    });

    metaBox.textContent = rows.length >= 150
      ? 'Birinchi 150 ta mos tovar ko‘rsatilmoqda — qidiruvni aniqlashtiring:'
      : `Topildi: ${rows.length} ta pozitsiya`;

    if (rows.length === 0) {
      resultsBox.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary);font-size:13px;">Mos tovar topilmadi — filtr yoki qidiruv so‘zini o‘zgartiring.</div>`;
      return;
    }

    resultsBox.innerHTML = rows.map((it) => `
      <div style="display:grid;grid-template-columns:96px 1fr 140px 118px auto;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;">
        <button type="button" class="sps-ver-badge ch-copy-code" data-code="${it.code}" style="cursor:pointer;text-align:center;border:none;" title="Kodni nusxalash">${it.code}</button>
        <div>
          <div style="font-weight:700;color:var(--text-primary);">${it.name}</div>
          <div style="font-size:10.5px;color:var(--text-secondary);">${it.section} · ${it.unit}</div>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);">
          <strong style="color:var(--text-primary);">${it.brand}</strong>${it.article ? `<br/><span>Арт: ${it.article}</span>` : ''}
        </div>
        <div style="text-align:right;">
          ${it.priceUsd !== null
            ? `<span style="color:#10b981;font-weight:800;font-size:12.5px;" title="${it.priceSource || ''}">$${it.priceUsd.toFixed(2)}</span>${it.retailUsd ? `<div style="font-size:10px;color:var(--text-secondary);">Розн: $${it.retailUsd.toFixed(2)}</div>` : '<div style="font-size:10px;color:var(--text-secondary);">Опт ($)</div>'}`
            : `<span style="font-size:10.5px;color:var(--text-secondary);">Praesdan aniqlanadi</span>`}
        </div>
        <button type="button" class="sps-btn sps-btn-primary ch-pick-btn" data-code="${it.code}" style="height:28px;padding:0 10px;font-size:11.5px;">
          ${onSelectSku ? '✓ Tanlash' : '＋ Zamerga'}
        </button>
      </div>
    `).join('');

    resultsBox.querySelectorAll('.ch-copy-code').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigator.clipboard?.writeText(btn.dataset.code).catch(() => {});
        toastMsg = `✓ Код CH «${btn.dataset.code}» buferga nusxalandi!`;
        renderRows();
      });
    });

    resultsBox.querySelectorAll('.ch-pick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sku = findClimateHouseSku(btn.dataset.code);
        if (!sku) return;
        if (onSelectSku) {
          onSelectSku(sku);
          bd.remove();
          return;
        }
        const rm = activeSurveyDoc.rooms[0];
        const preset = inferMepPointPresetFromSku(sku);
        const draftPt = validateAndNormalizeMepPoint({
          name: preset.name,
          type: preset.type,
          x: Math.min(1.0, rm.length * 0.5),
          y: Math.min(0.35, rm.width * 0.5),
          z: 1.10,
          source: 'laser_manual',
          skuCode: preset.skuCode,
          skuBrand: preset.skuBrand,
          skuArticle: preset.skuArticle,
          priceUsd: preset.priceUsd,
          detail: preset.detail,
          verified: false, // Obyektda haqiqiy X/Y/Z o'lchangach tasdiqlanadi (taxminsiz!)
        }, rm);
        rm.points.push(draftPt);
        persistSurveyDoc();
        toastMsg = `✓ «${sku.code} · ${sku.name.slice(0, 48)}» Dala O‘lchovi (Zamer) ro‘yxatiga qo‘shildi!`;
        renderRows();
      });
    });
  };

  searchInp.addEventListener('input', () => {
    saved.query = searchInp.value;
    toastMsg = '';
    savePrefs();
    renderRows();
  });

  brandSel.addEventListener('change', () => {
    saved.brand = brandSel.value;
    toastMsg = '';
    savePrefs();
    renderRows();
  });

  bd.querySelectorAll('.ch-sec-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      saved.section = chip.dataset.sec;
      toastMsg = '';
      savePrefs();
      renderRows();
    });
  });

  bd.querySelector('#ch-mod-close')?.addEventListener('click', () => bd.remove());
  document.body.appendChild(bd);
  bd.addEventListener('click', (e) => { if (e.target === bd) bd.remove(); });
  renderRows();
  setTimeout(() => searchInp.focus(), 40);
}

// ============================================================================
// 📊 1.0 MUHANDISLIK HISOB-KITOBLARI VA GALFDESIGN 17-USTUNLI JADVAL MODALI
// ============================================================================
document.getElementById('btn-open-calc10')?.addEventListener('click', () => {
  const stg = store.state.settings.activeStage;
  openEngineeringCalc10Modal(stg === 'heat' ? 'heat17' : stg === 'tm' ? 'tm' : 'tp');
});

function openEngineeringCalc10Modal(initialTab = 'tp') {
  const bd = document.createElement('div');
  bd.className = 'sps-modal-backdrop';
  let tab = initialTab || 'tp';

  const renderCalcModal = () => {
    const suite = store.state.mepSuite;
    const fl = store.getActiveFloor();
    const flHeat = suite.heat.floors.find((f) => f.floorId === fl?.id) || suite.heat.floors[0] || { rooms: [] };
    const flOv = suite.ov.floors.find((f) => f.floorId === fl?.id) || suite.ov.floors[0] || { ufLoops: [], radiators: [] };
    const mix = suite.ov.mixingUnit || {};
    const cons = suite.ov.consumables || {};
    const h10 = suite.tm.hydraulics10 || {};

    bd.innerHTML = `
      <div class="sps-modal-card" style="max-width:1180px;width:96vw;max-height:90vh;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0;font-size:16.5px;">📊 SPS Project 1.0 — To‘liq Muhandislik Hisob-Kitoblari (Excel 1:1 + GalfDesign Standart)</h3>
            <p style="margin:3px 0 0;font-size:12px;color:var(--text-secondary);">
              Тёплый пол пироги ва коллектор Kv балансировкаси · Радиатор/Конвектор паспорт қайта ҳисоби (ΔT^1.30 · β1·β2·β3) · 17-устунли Теплопотеря · Котельная ГС/РБ/БКН
            </p>
          </div>
          <button type="button" class="sps-btn" id="calc10-close">✕ Yopish</button>
        </div>

        <div class="sps-chip-group" style="margin-top:10px;width:100%;flex-wrap:wrap;">
          <button type="button" class="sps-chip ${tab === 'tp' ? 'active' : ''}" data-ctab="tp" style="flex:1;">1. 🔥 Тёплый пол (Пирог · Kv · Узел подмеса)</button>
          <button type="button" class="sps-chip ${tab === 'rad' ? 'active' : ''}" data-ctab="rad" style="flex:1;">2. 🌡 Радиатор &amp; Конвектор (β1·β2·β3)</button>
          <button type="button" class="sps-chip ${tab === 'heat17' ? 'active' : ''}" data-ctab="heat17" style="flex:1;">3. 🧱 Ограждения (17 граф Galf)</button>
          <button type="button" class="sps-chip ${tab === 'tm' ? 'active' : ''}" data-ctab="tm" style="flex:1;">4. ⚙ Гидравлика ТМ (ГС · РБ · БКН)</button>
        </div>

        <div style="margin-top:12px;overflow-y:auto;flex:1;padding-right:4px;">
          ${tab === 'tp' ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-bottom:10px;">
              <div class="sps-card" style="padding:8px 10px;">
                <div style="font-size:10.5px;color:var(--text-secondary);font-weight:700;">УЗЕЛ ПОДМЕСА ТП (${mix.ufSupplyTemp}/${mix.ufReturnTemp} °C)</div>
                <div style="font-size:14px;font-weight:800;margin-top:3px;color:#ef4444;">α = ${mix.alpha} · Kvs = ${mix.kvsRecommended} м³/ч</div>
                <div style="font-size:11px;color:var(--text-secondary);">G_общ = ${mix.totalFlowLpm} л/мин (${mix.totalFlowM3h} м³/ч)</div>
              </div>
              <div class="sps-card" style="padding:8px 10px;">
                <div style="font-size:10.5px;color:var(--text-secondary);font-weight:700;">ТРЕБУЕМЫЙ НАПОР НАСОСА ТП</div>
                <div style="font-size:14px;font-weight:800;margin-top:3px;color:#38bdf8;">H = ${mix.pumpHeadM} м.в.ст.</div>
                <div style="font-size:11px;color:var(--text-secondary);">${mix.recommendedPumpModel}</div>
              </div>
              <div class="sps-card" style="padding:8px 10px;">
                <div style="font-size:10.5px;color:var(--text-secondary);font-weight:700;">ТЕПЛОИЗОЛЯЦИЯ ТРАНЗИТОВ И ПОДВОДОК</div>
                <div style="font-size:14px;font-weight:800;margin-top:3px;color:#10b981;">Красн: ${cons.insulationRed18M} м · Син: ${cons.insulationBlue18M} м</div>
                <div style="font-size:11px;color:var(--text-secondary);">Energoflex 18×6 мм · Демпфер: ${cons.damperTapeM} м</div>
              </div>
            </div>

            <table class="sps-data-table" style="font-size:11.5px;">
              <thead>
                <tr>
                  <th>Контур</th><th>Xona</th><th>Qoplama / Pirog</th><th>Qadam</th><th>S, м²</th>
                  <th>L_общ (тр.), м</th><th>q_up / q_dn, Вт/м²</th><th>T_пола (°C)</th><th>Q_пол, Вт</th>
                  <th>G, л/мин</th><th>v, м/с</th><th>ΔP, мм.в.ст (м.в.ст)</th><th>Kv клапан</th>
                </tr>
              </thead>
              <tbody>
                ${flOv.ufLoops.map((lp) => `
                  <tr style="${lp.isIndexLoop ? 'background:rgba(245,158,11,0.12);' : ''}">
                    <td><strong>${lp.label}${lp.isIndexLoop ? ' ★' : ''}</strong></td>
                    <td>${lp.roomName}</td>
                    <td>${lp.coverType} · ЭППС ${lp.xpsMm}мм</td>
                    <td>${lp.stepMm} мм</td>
                    <td>${lp.areaM2}</td>
                    <td><strong>${lp.lengthM}</strong> (${lp.transitLenM})</td>
                    <td>${lp.qUpWm2} / ${lp.qDownWm2}</td>
                    <td style="color:${lp.surfaceTempOk ? '#10b981' : '#ef4444'};font-weight:700;">${lp.surfaceTempC}°C ${lp.surfaceTempOk ? '✓' : '⚠'}</td>
                    <td><strong>${lp.outputW}</strong></td>
                    <td><strong>${lp.flowLmin}</strong></td>
                    <td>${lp.velocityMs}</td>
                    <td>${lp.dpTotalMmAq} (${lp.dpMWc})</td>
                    <td style="color:#38bdf8;font-weight:800;">${lp.kvSetting}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">
              ★ — <strong>Индексная (энг оғир) петля</strong>: балансировка клапани тўлиқ очиқ туради, қолган контурлар эса ҳисобланган <strong>Kv</strong> ва ротаметр (л/мин) бўйича созланади.
            </div>
          ` : tab === 'rad' ? `
            ${(flOv.roomBalances || []).length > 0 ? `
              <div style="margin-bottom:10px;">
                <div style="font-size:11.5px;font-weight:800;margin-bottom:5px;color:${suite.ov.hasHeatingDeficit ? '#FF3445' : '#10b981'};">
                  ${suite.ov.hasHeatingDeficit
                    ? `⚠ XONALAR ISITISH BALANSI: YETISHMOVCHILIK (−${suite.ov.totalDeficitW} Вт)`
                    : '✓ XONALAR BO‘YICHA ISITISH BALANSI TO‘LIQ TA’MINLANGAN'}
                </div>
                <table class="sps-data-table" style="font-size:11.5px;margin-bottom:10px;">
                  <thead>
                    <tr>
                      <th>Xona</th><th>Maydoni, м²</th><th>Talab (Теплопотеря), Вт</th>
                      <th>Тёплый пол, Вт</th><th>Радиатор / Конвектор, Вт</th><th>Jami O‘rnatilgan, Вт</th><th>Balans (ΔQ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(flOv.roomBalances || []).map((rb) => `
                      <tr style="${rb.hasDeficit ? 'background:rgba(255,52,69,0.12);' : ''}">
                        <td><strong>${rb.roomCode} · ${rb.roomName}</strong></td>
                        <td>${rb.areaM2}</td>
                        <td><strong>${rb.requiredW} Вт</strong></td>
                        <td>${rb.ufOutputW} Вт</td>
                        <td>${rb.radOutputW} Вт</td>
                        <td><strong>${rb.installedW} Вт</strong></td>
                        <td style="font-weight:800;color:${rb.hasDeficit ? '#FF3445' : '#10b981'};">
                          ${rb.hasDeficit ? `⚠ Дефицит −${rb.deficitW} Вт` : `✓ +${rb.deltaW} Вт`}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}
            <table class="sps-data-table" style="font-size:11.5px;">
              <thead>
                <tr>
                  <th>Марка</th><th>Xona</th><th>Модель / Тип</th><th>Уланиш ва Чиқиш</th>
                  <th>t1/t2/t_вн</th><th>ΔT, °C</th><th>Q_ном(70°)</th><th>β1 · β2 · β3</th>
                  <th>Q_талаб, Вт</th><th>Q_факт, Вт</th><th>Захира</th><th>G, л/мин</th><th>Подводка</th>
                </tr>
              </thead>
              <tbody>
                ${flOv.radiators.map((r) => `
                  <tr>
                    <td><strong>${r.label}</strong></td>
                    <td>${r.roomName}</td>
                    <td><strong>${r.model}</strong> <span class="sps-ver-badge">${r.skuCode}</span></td>
                    <td style="font-size:10.8px;">${r.connectionLabel || ''} · <strong>${r.feedMount === 'floor' ? 'из пола' : 'из стены'}</strong></td>
                    <td>${r.supplyTemp}/${r.returnTemp}/${r.roomTemp || 22}°</td>
                    <td><strong>${r.deltaT}°C</strong></td>
                    <td>${r.qNomW} Вт</td>
                    <td>${r.beta1} · ${r.beta2} · ${r.beta3}</td>
                    <td>${r.requiredW}</td>
                    <td style="color:#10b981;font-weight:800;">${r.powerW} Вт</td>
                    <td>${r.reservePct >= 0 ? `+${r.reservePct}%` : `${r.reservePct}%`}</td>
                    <td>${r.flowLpm}</td>
                    <td>${r.branchPipeLabel || 'Ø16×2.0'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : tab === 'heat17' ? `
            <table class="sps-data-table" style="font-size:11px;">
              <thead>
                <tr>
                  <th>№ пом</th><th>Xona (t_вн)</th><th>Огр.</th><th>Ор.</th><th>a, м</th><th>b, м</th>
                  <th>A_бр</th><th>A_выч</th><th>A_расч</th><th>R₀</th><th>U</th><th>Δt</th>
                  <th>Q_осн</th><th>β_ор</th><th>β_доп</th><th>Q_огр, Вт</th><th>Q_инф / Q_общ, Вт</th>
                </tr>
              </thead>
              <tbody>
                ${flHeat.rooms.map((rm) =>
                  (rm.envelopeRows || []).map((er, idx) => `
                    <tr>
                      <td>${idx === 0 ? `<strong>${rm.roomCode}</strong>` : ''}</td>
                      <td>${idx === 0 ? `<strong>${rm.roomName}</strong> (+${rm.tInC}°C)` : ''}</td>
                      <td>${er.code} · ${er.name}</td>
                      <td><strong>${er.orient}</strong></td>
                      <td>${er.dimA}</td><td>${er.dimB}</td>
                      <td>${er.grossArea}</td><td>${er.deductArea || '—'}</td><td><strong>${er.netArea}</strong></td>
                      <td>${er.rVal}</td><td>${er.uVal}</td><td>${er.dT}°</td>
                      <td>${er.qBaseW}</td><td>${er.betaOrient}</td><td>${er.betaExtra}</td>
                      <td><strong>${er.qTotalW}</strong></td>
                      <td>${idx === 0 ? `Инф: ${rm.qInfiltrationW} · <strong style="color:#f97316;">Σ ${rm.heatLossW} Вт</strong>` : ''}</td>
                    </tr>
                  `).join(''),
                ).join('')}
              </tbody>
            </table>
          ` : `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
              <div class="sps-card">
                <div class="sps-sec-head"><span class="sps-sec-num">01</span> Гидравлический разделитель (Гидрострелка 3D-қоида)</div>
                <div style="font-size:12.5px;line-height:1.7;">
                  • Ҳисобий қувват: <strong>${suite.tm.designBoilerKw} кВт (ΔT_кот = 15 °C)</strong><br/>
                  • Котёл контури сарфи: <strong>G = ${h10.hydroarrow?.flowM3h} м³/ч</strong><br/>
                  • Корпус диаметри (v ≤ 0.1 м/с): <strong style="color:#38bdf8;">D_корп = Ø${h10.hydroarrow?.chamberDiameterMm} мм</strong><br/>
                  • Патрубок диаметри (v ≤ 0.7 м/с): <strong>d_патр = DN${h10.hydroarrow?.nozzleDiameterMm}</strong><br/>
                  • Танланган модел: <strong>Climate House 22187 (MT-01563)</strong>
                </div>
              </div>
              <div class="sps-card">
                <div class="sps-sec-head"><span class="sps-sec-num">02</span> Расширительный бак отопления (РБ 1.0 Excel)</div>
                <div style="font-size:12.5px;line-height:1.7;">
                  • ТП сув ҳажми: <strong>${h10.expansionTank?.ufWaterVolL} л</strong> · Радиаторлар: <strong>${h10.expansionTank?.radWaterVolL} л</strong><br/>
                  • Магистрал + Котёл: <strong>${(h10.expansionTank?.trunkWaterVolL || 0) + (h10.expansionTank?.boilerHeatExchangerL || 0)} л</strong> → Жами <strong>V_сист = ${h10.expansionTank?.vSystL} л</strong><br/>
                  • Иссиқлик кенгайиши (2.82%): <strong>V_расш = ${h10.expansionTank?.vExpL} л</strong> (+ захира ${h10.expansionTank?.vReserveL} л)<br/>
                  • Дастлабки ҳаво босими: <strong>P₀ = ${h10.expansionTank?.pPrechargeBar} бар</strong> (P_max = 2.7 бар)<br/>
                  • Ҳисобий ҳажм: <strong style="color:#ef4444;">V_расч = ${h10.expansionTank?.vCalcL} л → қабул қилинди ${suite.tm.expTankLiters} л (${suite.tm.expTankSku})</strong>
                </div>
              </div>
              <div class="sps-card">
                <div class="sps-sec-head"><span class="sps-sec-num">03</span> Бойлер косвенного нагрева ГВС (БКН 1.0 Excel)</div>
                <div style="font-size:12.5px;line-height:1.7;">
                  • Бойлер ҳажми: <strong>${suite.tm.bknLiters} л (${suite.tm.bknSku})</strong><br/>
                  • Змеевик қуввати: <strong>Q_зм = ${h10.dhw?.coilKw} кВт</strong><br/>
                  • 10°C дан 60°C гача тўлиқ қизиш вақти: <strong style="color:#10b981;">t_нагр = ${h10.dhw?.heatUpMin} дақиқа</strong><br/>
                  • 45°C аралаш иссиқ сув чиқиши: <strong>${h10.dhw?.mixed45L} литр</strong><br/>
                  • ГВС кенгайтириш баки: <strong>WAV ${h10.expansionTank?.dhwTankL} л</strong>
                </div>
              </div>
            </div>
          `}
        </div>
      </div>
    `;

    bd.querySelector('#calc10-close')?.addEventListener('click', () => bd.remove());
    bd.querySelectorAll('[data-ctab]').forEach((b) => {
      b.addEventListener('click', () => {
        tab = b.dataset.ctab;
        renderCalcModal();
      });
    });
  };

  document.body.appendChild(bd);
  bd.addEventListener('click', (e) => { if (e.target === bd) bd.remove(); });
  renderCalcModal();
}
