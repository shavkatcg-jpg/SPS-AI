/**
 * SPS Project 2.0 — Markaziy State Store, Undo/Redo (50 qadam) va Barcha oxirgi sozlamalarni saqlash
 */

import { createEmptyFloor, planarizeFloorGraph, STANDARD_WALL_TYPES, makeArchId } from './planar-wall-graph.js';
import { buildPrototypeProject } from '../ai/scan-and-ai-engine.js';
import { computeFullMepSuite } from '../docs/smeta-and-sheets-engine.js';

const SETTINGS_KEY = 'sps_arch2_settings_v2';
const PROJECT_KEY = 'sps_arch2_project_v2';

const DEFAULT_SETTINGS = {
  theme: 'dark', // 'dark' | 'light'
  viewMode: 'split', // '2d' | 'split' | '3d'
  activeStage: 'arch', // 'arch' | 'heat' | 'ov' | 'vk' | 'tm' | 'smeta' | 'docs'
  flowSimEnabled: true,
  wallTypeId: 'ext_brick_400',
  wallChainMode: 'auto', // 'auto' | 'collinear_chain' | 'segment'
  doorSubType: 'single',
  doorWidthM: 0.90,
  windowSubType: 'standard',
  windowWidthM: 1.60,
  windowSillM: 0.85,
  snapEnabled: true,
  scanSnapEnabled: true,
  orthoEnabled: true,
  showDims: true,
  showGhostBelow: true,
  style3d: 'realistic', // 'clay' | 'realistic' | 'lidar'
  cutawayMode: 'dollhouse', // 'dollhouse' | 'waist' | 'full'
  lidarVisible: false,
  scanOrthoVisible: true,
  showOfficeFurniture: true,
  lidarSliceZ: 1.20,
  lastAiPrompt: '12.4x10.8 m 1-qavatli uy: zal, oshxona, 2 yotoqxona, 2 sanuzel, qozonxona',
  stepByStepMigratedV241: true,
  officeMepReadyV260: false,
  visibleLayers: {
    heat: false,
    tp: false,
    rad: false,
    vent: false,
    vk: false,
    tm: false,
  },
  mepConfig: {
    cityId: 'tashkent',
    wallInsId: 'brick_ins_50',
    glazingId: 'pvc_2cam_low_e',
    roofInsId: 'roof_minwool_150',
    safetyFactor: 1.12,
    heatingScheme: 'none', // 'none' (bosqichma-bosqich) | 'combined' | 'uf_only' | 'radiators_only'
    coolingSystemMode: 'fancoil_4way', // 'fancoil_4way' | 'fancoil_wall' | 'split'
    ventDiffuserType: '4apn_ksd', // '4apn_ksd' | 'dkv_swirl' | 'dsh_slot' | 'dpu_anemostat'
    ufPipeId: 'pex_16_20',
    ufScreedType: 'wet', // 'wet' | 'semidry'
    ufXpsMm: 50,
    ufSupplyTempC: 42,
    ufReturnTempC: 35,
    ufStepMm: 150,
    radModelId: 'rt_panel_c22', // 'rt_panel_c22' | 'kermi_ftv_22' | 'rifar_tubog_2' | 'rt_biliner_500' | 'rt_rev_500' | 'rt_pianoforte_500' | 'konveka_fc_floor'
    lowWindowEmitterMode: 'floor_convector', // 'floor_convector' (Konveka FC на ножках) | 'trench_convector' (Atrium / Konveka FH)
    radTopology: 'two_pipe_dead_end', // 'radial' | 'two_pipe_dead_end' | 'two_pipe_tichelmann'
    convectorModelId: 'rt_atrium_turbo',
    convectorSpeedPct: 60,
    radSupplyTempC: 70,
    radReturnTempC: 55,
    radConnection: 'bottom_h',
    radConnectionId: 'bottom_right_50', // 'bottom_right_50' | 'bottom_center_50' | 'diag_lr' | 'side_left'
    radFeedMount: 'wall', // 'wall' (из стены) | 'floor' (из пола)
    radEnclosureId: 'sill_shelf',
    trunkPipeFamilyId: 'te_sa_press', // 'te_sa_press' | 'pro_aqua_ppr'
    ovShowBarePipes: true,
    enableVent: false,
    enableVk: false,
    enableTm: false,
    compactOfficeTm: false,
    enableGvsRecirc: true,
  },
  smetaPrefs: {
    usdToUzs: 12850,
    discountPct: 0,
    includeLabor: true,
    useMarketFallback: true,
    customPrices: {},
  },
  stampMeta: {
    cipher: 'SPS-2026-ОВВК-ТМ',
    projectTitle: 'Индивидуальный жилой дом (ОВ·ВК·ТМ)',
    siteAddress: 'г. Ташкент',
    engineer: 'SPS AI ГИП',
    org: 'SPS Project · Climate House',
  },
};

function safeReadStorage(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeWriteStorage(key, val) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (key === PROJECT_KEY && val && Array.isArray(val.floors)) {
      const hasExternalBin = val.floors.some((f) => f?.scanOverlay?.cloudBinUrl);
      if (hasExternalBin) {
        const slim = {
          ...val,
          floors: val.floors.map((f) => (f?.scanOverlay?.cloudBinUrl
            ? { ...f, scanOverlay: { ...f.scanOverlay, pointStride6: [] } }
            : f)),
        };
        localStorage.setItem(key, JSON.stringify(slim));
        return;
      }
    }
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore quota errors
  }
}

export function cloneProject(proj) {
  return JSON.parse(JSON.stringify(proj));
}

export function normalizeLoadedProject(raw) {
  if (!raw || !Array.isArray(raw.floors) || raw.floors.length === 0) {
    return buildPrototypeProject('sps-office-135528');
  }
  const copy = cloneProject(raw);
  for (const fl of copy.floors) {
    planarizeFloorGraph(fl);
  }
  return copy;
}

export class ArchStore {
  constructor() {
    const savedSettings = safeReadStorage(SETTINGS_KEY) || {};
    const savedProject = safeReadStorage(PROJECT_KEY);
    let project = normalizeLoadedProject(savedProject);

    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
      visibleLayers: { ...DEFAULT_SETTINGS.visibleLayers, ...(savedSettings.visibleLayers || {}) },
      mepConfig: { ...DEFAULT_SETTINGS.mepConfig, ...(savedSettings.mepConfig || {}) },
      smetaPrefs: {
        ...DEFAULT_SETTINGS.smetaPrefs,
        ...(savedSettings.smetaPrefs || {}),
        customPrices: { ...(savedSettings.smetaPrefs?.customPrices || {}) },
      },
      stampMeta: { ...DEFAULT_SETTINGS.stampMeta, ...(savedSettings.stampMeta || {}) },
    };

    const isStoredSpsOffice = project?.isOfficeProject || project?.floors?.[0]?.scanOverlay?.presetId === 'sps-office-135528';
    if (!savedSettings.officeMepReadyV260 && isStoredSpsOffice) {
      project = buildPrototypeProject('sps-office-135528');
      mergedSettings.stepByStepMigratedV241 = true;
      mergedSettings.officeMepReadyV260 = true;
      mergedSettings.activeStage = 'ov';
      mergedSettings.lidarVisible = false;
      mergedSettings.showOfficeFurniture = true;
      mergedSettings.visibleLayers = {
        heat: false,
        tp: true,
        rad: true,
        vent: true,
        vk: false,
        tm: true,
      };
      mergedSettings.mepConfig = {
        ...mergedSettings.mepConfig,
        heatingScheme: 'combined',
        coolingSystemMode: 'fancoil_4way',
        ventDiffuserType: '4apn_ksd',
        radModelId: 'rt_panel_c22',
        radTopology: 'two_pipe_dead_end',
        trunkPipeFamilyId: 'te_sa_press',
        enableVent: true,
        enableVk: false,
        enableTm: true,
        compactOfficeTm: true,
      };
      mergedSettings.stampMeta = {
        ...mergedSettings.stampMeta,
        cipher: 'SPS-2026-ОФИС-ОВиК-ТМ',
        projectTitle: 'Офис SPS Project (2-этаж · ОВиК + Фанкойл + ТМ)',
      };
      safeWriteStorage(PROJECT_KEY, project);
      safeWriteStorage(SETTINGS_KEY, mergedSettings);
    } else if (!savedSettings.stepByStepMigratedV241) {
      mergedSettings.stepByStepMigratedV241 = true;
      mergedSettings.activeStage = 'arch';
      mergedSettings.visibleLayers = {
        heat: false,
        tp: false,
        rad: false,
        vent: false,
        vk: false,
        tm: false,
      };
      mergedSettings.mepConfig = {
        ...mergedSettings.mepConfig,
        heatingScheme: 'none',
        enableVent: false,
        enableVk: false,
        enableTm: false,
      };
      safeWriteStorage(SETTINGS_KEY, mergedSettings);
    } else if ((mergedSettings.activeStage || 'arch') === 'arch') {
      mergedSettings.visibleLayers = {
        heat: false,
        tp: false,
        rad: false,
        vent: false,
        vk: false,
        tm: false,
      };
    }

    this.state = {
      settings: mergedSettings,
      project,
      mepSuite: computeFullMepSuite(project, mergedSettings.mepConfig),
      activeFloorId: project.floors[0]?.id ?? 1,
      activeTool: 'select', // QAT'IY QOIDA: Har doim 'select' (Tanlash) rejimida ochiladi — tasodifiy devor chizilmaydi!
      selection: null, // { kind: 'wall' | 'room' | 'opening' | 'element', id }
    };

    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason = 'update') {
    for (const fn of this.listeners) fn(this.state, reason);
  }

  getActiveFloor() {
    return (
      this.state.project.floors.find((f) => f.id === this.state.activeFloorId) ||
      this.state.project.floors[0]
    );
  }

  getLowerGhostFloor() {
    if (!this.state.settings.showGhostBelow) return null;
    const cur = this.getActiveFloor();
    if (!cur) return null;
    const sorted = [...this.state.project.floors].sort((a, b) => a.elevationM - b.elevationM);
    const idx = sorted.findIndex((f) => f.id === cur.id);
    return idx > 0 ? sorted[idx - 1] : null;
  }

  getSelectedWallSpec() {
    return STANDARD_WALL_TYPES.find((t) => t.id === this.state.settings.wallTypeId) || STANDARD_WALL_TYPES[0];
  }

  _recomputeMep() {
    this.state.mepSuite = computeFullMepSuite(this.state.project, this.state.settings.mepConfig);
  }

  updateSettings(patch, reason = 'settings') {
    this.state.settings = { ...this.state.settings, ...patch };
    if (patch.mepConfig) {
      this._recomputeMep();
    }
    safeWriteStorage(SETTINGS_KEY, this.state.settings);
    this.emit(reason);
  }

  updateMepConfig(patch) {
    const nextCfg = { ...this.state.settings.mepConfig, ...patch };
    this.updateSettings({ mepConfig: nextCfg }, 'mep-config');
  }

  setStage(stageId) {
    const vis = { ...this.state.settings.visibleLayers };
    const cfg = this.state.settings.mepConfig || {};
    if (stageId === 'heat') {
      vis.heat = true; vis.tp = false; vis.rad = false; vis.vent = false; vis.vk = false; vis.tm = false;
    } else if (stageId === 'arch') {
      vis.heat = false; vis.tp = false; vis.rad = false; vis.vent = false; vis.vk = false; vis.tm = false;
    } else if (stageId === 'ov') {
      const hs = cfg.heatingScheme || 'none';
      vis.heat = false;
      vis.tp = hs === 'combined' || hs === 'uf_only';
      vis.rad = hs === 'combined' || hs === 'radiators_only';
      vis.vent = cfg.enableVent === true;
      vis.vk = false;
      vis.tm = Boolean(this.state.project?.isOfficeProject && cfg.enableTm);
    } else if (stageId === 'vk') {
      vis.heat = false; vis.tp = false; vis.rad = false; vis.vent = false; vis.vk = true; vis.tm = false;
    } else if (stageId === 'tm') {
      vis.heat = false; vis.tp = false; vis.rad = false; vis.vent = false; vis.vk = false; vis.tm = true;
    }
    this.state.activeTool = 'select';
    this.updateSettings({ activeStage: stageId, visibleLayers: vis }, 'stage');
  }

  setTool(toolId) {
    this.state.activeTool = toolId || 'select';
    this.emit('tool');
  }

  setSelection(sel) {
    this.state.selection = sel || null;
    this.emit('selection');
  }

  setActiveFloor(floorId) {
    if (this.state.project.floors.some((f) => f.id === floorId)) {
      this.state.activeFloorId = floorId;
      this.state.selection = null;
      this.emit('floor');
    }
  }

  commit(mutatorFn, reason = 'model') {
    const before = cloneProject(this.state.project);
    this.undoStack.push(before);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];

    mutatorFn(this.state.project, this.getActiveFloor(), this.state);
    for (const fl of this.state.project.floors) {
      planarizeFloorGraph(fl);
    }
    this._recomputeMep();
    safeWriteStorage(PROJECT_KEY, this.state.project);
    this.emit(reason);
  }

  loadNewProject(newProj, reason = 'load-project') {
    this.undoStack.push(cloneProject(this.state.project));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.state.project = normalizeLoadedProject(newProj);
    this.state.activeFloorId = this.state.project.floors[0]?.id ?? 1;
    this.state.selection = null;
    this.state.activeTool = 'select';
    this._recomputeMep();
    safeWriteStorage(PROJECT_KEY, this.state.project);
    this.emit(reason);
  }

  /**
   * Yangi foydalanuvchi loyihasi yoki yuklangan 3D skan:
   * - Asbob har doim 'select' (hech narsa o'zidan-o'zi chizilib ketmaydi!);
   * - Barcha ОВ / ВК / ТМ tizimlari O'CHIQ ('none' / false) holda bosqichma-bosqich boshlanadi!
   */
  startCleanUserProject(newProj, { lidarVisible = false, viewMode = null } = {}) {
    this.undoStack.push(cloneProject(this.state.project));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.state.project = normalizeLoadedProject(newProj);
    this.state.activeFloorId = this.state.project.floors[0]?.id ?? 1;
    this.state.selection = null;
    this.state.activeTool = 'select';

    const nextSettings = {
      ...this.state.settings,
      activeStage: 'arch',
      lidarVisible: Boolean(lidarVisible),
      viewMode: viewMode || this.state.settings.viewMode,
      visibleLayers: {
        heat: false,
        tp: false,
        rad: false,
        vent: false,
        vk: false,
        tm: false,
      },
      mepConfig: {
        ...this.state.settings.mepConfig,
        heatingScheme: 'none',
        enableVent: false,
        enableVk: false,
        enableTm: false,
      },
    };
    this.state.settings = nextSettings;
    this._recomputeMep();
    safeWriteStorage(PROJECT_KEY, this.state.project);
    safeWriteStorage(SETTINGS_KEY, this.state.settings);
    this.emit('load-project');
  }

  /**
   * Tayyor Demo Prototip kartochkalari uchun:
   * 01 · Arxitektura sahnasini toza ochadi, keyingi 03·ОВ / 04·ВК / 05·ТМ bosqichlarida namuna tizimlarni tayyor saqlaydi.
   */
  loadDemoPrototypeProject(newProj, { lidarVisible = false } = {}) {
    this.undoStack.push(cloneProject(this.state.project));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.state.project = normalizeLoadedProject(newProj);
    this.state.activeFloorId = this.state.project.floors[0]?.id ?? 1;
    this.state.selection = null;
    this.state.activeTool = 'select';

    this.state.settings = {
      ...this.state.settings,
      activeStage: 'arch',
      lidarVisible: Boolean(lidarVisible),
      visibleLayers: {
        heat: false,
        tp: false,
        rad: false,
        vent: false,
        vk: false,
        tm: false,
      },
      mepConfig: {
        ...this.state.settings.mepConfig,
        heatingScheme: 'combined',
        enableVent: true,
        enableVk: true,
        enableTm: true,
      },
    };
    this._recomputeMep();
    safeWriteStorage(PROJECT_KEY, this.state.project);
    safeWriteStorage(SETTINGS_KEY, this.state.settings);
    this.emit('load-project');
  }

  /**
   * Bizning Ofis (2-qavat · Oxirgi etaj) to'liq ОВиК + Фанкойл + ТМ (ВК siz!) loyihasini tayyor 3D interyer bilan yuklaydi!
   */
  loadCompleteOfficeProject(newProj) {
    this.undoStack.push(cloneProject(this.state.project));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.state.project = normalizeLoadedProject(newProj);
    this.state.activeFloorId = this.state.project.floors[0]?.id ?? 2;
    this.state.selection = null;
    this.state.activeTool = 'select';

    this.state.settings = {
      ...this.state.settings,
      activeStage: 'ov',
      officeMepReadyV260: true,
      lidarVisible: false,
      showOfficeFurniture: true,
      visibleLayers: {
        heat: false,
        tp: true,
        rad: true,
        vent: true,
        vk: false,
        tm: true,
      },
      mepConfig: {
        ...this.state.settings.mepConfig,
        heatingScheme: 'combined',
        coolingSystemMode: 'fancoil_4way',
        ventDiffuserType: '4apn_ksd',
        radModelId: 'rt_panel_c22',
        radTopology: 'two_pipe_dead_end',
        trunkPipeFamilyId: 'te_sa_press',
        enableVent: true,
        enableVk: false,
        enableTm: true,
        compactOfficeTm: true,
      },
      stampMeta: {
        ...this.state.settings.stampMeta,
        cipher: 'SPS-2026-ОФИС-ОВиК-ТМ',
        projectTitle: 'Офис SPS Project (2-этаж · ОВиК + Фанкойл + ТМ)',
      },
    };
    this._recomputeMep();
    safeWriteStorage(PROJECT_KEY, this.state.project);
    safeWriteStorage(SETTINGS_KEY, this.state.settings);
    this.emit('load-project');
  }

  resetAllMepSystems() {
    for (const fl of this.state.project.floors || []) {
      if (Array.isArray(fl.elements)) {
        fl.elements = fl.elements.filter((el) => el.kind !== 'vk_fixture');
      }
    }
    this.state.activeTool = 'select';
    const curStage = this.state.settings.activeStage || 'arch';
    this.state.settings = {
      ...this.state.settings,
      visibleLayers: {
        heat: curStage === 'heat',
        tp: false,
        rad: false,
        vent: false,
        vk: curStage === 'vk',
        tm: curStage === 'tm',
      },
      mepConfig: {
        ...this.state.settings.mepConfig,
        heatingScheme: 'none',
        enableVent: false,
        enableVk: false,
        enableTm: false,
      },
    };
    this._recomputeMep();
    safeWriteStorage(PROJECT_KEY, this.state.project);
    safeWriteStorage(SETTINGS_KEY, this.state.settings);
    this.emit('mep-config');
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(cloneProject(this.state.project));
    this.state.project = normalizeLoadedProject(this.undoStack.pop());
    if (!this.state.project.floors.some((f) => f.id === this.state.activeFloorId)) {
      this.state.activeFloorId = this.state.project.floors[0]?.id ?? 1;
    }
    this.state.selection = null;
    this._recomputeMep();
    safeWriteStorage(PROJECT_KEY, this.state.project);
    this.emit('undo');
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(cloneProject(this.state.project));
    this.state.project = normalizeLoadedProject(this.redoStack.pop());
    this.state.selection = null;
    this._recomputeMep();
    safeWriteStorage(PROJECT_KEY, this.state.project);
    this.emit('redo');
    return true;
  }

  addFloorLevel(kind = 'upper', copyWallsFromCurrent = true) {
    const srcFloor = this.getActiveFloor();
    this.commit((proj) => {
      if (kind === 'basement') {
        if (proj.floors.some((f) => f.id === 0)) return;
        const base = createEmptyFloor(0, 'Podval (-1)', -2.8, 2.6);
        if (copyWallsFromCurrent && srcFloor) {
          this._copyStructuralShell(srcFloor, base);
        }
        proj.floors.unshift(base);
        this.state.activeFloorId = 0;
      } else {
        const maxId = Math.max(1, ...proj.floors.map((f) => f.id));
        const nextId = maxId + 1;
        const topFloor = [...proj.floors].sort((a, b) => b.elevationM - a.elevationM)[0];
        const elev = (topFloor?.elevationM || 0) + (topFloor?.heightM || 3.0) + 0.20;
        const nextFl = createEmptyFloor(nextId, `${nextId}-qavat`, Math.round(elev * 100) / 100, 3.0);
        if (copyWallsFromCurrent && srcFloor) {
          this._copyStructuralShell(srcFloor, nextFl);
        }
        proj.floors.push(nextFl);
        this.state.activeFloorId = nextId;
      }
    }, 'add-floor');
  }

  _copyStructuralShell(src, dst) {
    const idMap = new Map();
    dst.nodes = src.nodes.map((n) => {
      const nid = makeArchId('nd');
      idMap.set(n.id, nid);
      return { id: nid, x: n.x, y: n.y };
    });
    // Tashqi va yuk ko'taruvchi (>= 200 mm) devorlarni yangi qavatga tayyor nusxalab beradi!
    dst.walls = src.walls
      .filter((w) => w.kind === 'exterior' || (w.thickness || 0) >= 0.20)
      .map((w) => ({
        ...w,
        id: makeArchId('w'),
        n1: idMap.get(w.n1) || w.n1,
        n2: idMap.get(w.n2) || w.n2,
      }));
    dst.elements = (src.elements || [])
      .filter((el) => el.kind === 'shaft' || el.kind === 'stair')
      .map((el) => ({ ...el, id: makeArchId('el') }));
  }
}
