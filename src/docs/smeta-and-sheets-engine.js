/**
 * SPS Project 2.0 — Smeta (Climate House + GalfDesign Изоляция/Крепёж), ГОСТ 21.110-2013 Spetsifikatsiya va
 * ГОСТ Р 21.1101-2013 Ishchi Chizmalar Albomi (9 List A3: ОД-1, АР-ТЭ, ТЭ-1, ОВ-1, ОВ-2, ВК-1, УЗ-1, ТМ-1, СО-1)!
 */

import { findClimateHouseSku } from '../data/climate-house-db.js';
import { computeProjectHeatLoss } from '../mep/teplopoterya-engine.js';
import { buildProjectOvSystems, CH_8468_COLLECTOR_CODES, CH_7200S_COLLECTOR_CODES } from '../mep/ov-engine.js';
import { buildProjectVkSystems } from '../mep/vk-engine.js';
import { buildProjectTmBoilerRoom, renderTmPrincipleSchemeSvg } from '../mep/tm-engine.js';
import { getFloorWorldBounds } from '../core/planar-wall-graph.js';

export const MARKET_REFERENCE_USD_BY_SKU = Object.freeze({
  'KT-00642': 680, 'KT-00643': 740, 'KT-00644': 810, 'KT-00645': 890, 'KT-00656': 4200,
  'KT-00704': 36,
  'VN-03609': 460, 'VN-03610': 540, 'VN-03611': 690,
  'OT-01802': 75, 'OT-01804': 135,
  'MT-01563': 95, 'MT-01560': 145, 'MT-01559': 125, 'MT-01558': 168, 'MT-01587': 14.5,
  'NS-01635': 128, 'NS-01636': 105, 'NS-01637': 115, 'NS-01638': 126, 'NS-01639': 138,
  // Climate House 8468 (расходомеры) нархлари чиқишлар сонига кўра тартибли (2..15 вых.):
  'TP-02440': 38, 'TP-02441': 48, 'TP-02442': 58, 'TP-02443': 68, 'TP-02444': 78,
  'TP-02445': 88, 'TP-02446': 98, 'TP-02447': 110, 'TP-02434': 122, 'TP-02435': 134,
  'TP-02436': 146, 'TP-02437': 158, 'TP-02438': 170, 'TP-02439': 182,
  // TE-SA Металлопластик қувур ва пресс-фитинглар расмий Код CH бўйича ориентир нархлар:
  'TR-02835': 1.85, 'TR-02871': 2.15, 'TR-02872': 2.65,
  'TR-03037': 1.35, 'TR-03038': 1.95, 'TR-03039': 3.20, 'TR-03040': 4.65,
  'TR-02949': 5.40, 'TR-02927': 4.90, 'TR-02959': 3.60, 'TR-02960': 4.10, 'TR-02880': 3.20,
  'TR-02987': 24.0,
  // Pro Aqua PP-R фитинглар:
  'TR-02615': 0.95, 'TR-02607': 0.85, 'TR-02547': 0.45, 'TR-02556': 2.10,
  'RD-01903': 54, 'RD-01904': 68, 'RD-01897': 82, 'RD-01898': 96, 'RD-01899': 112, 'RD-01900': 128, 'RD-01901': 144, 'RD-01902': 162,
  'RD-01916': 11.50, 'RD-01917': 14.80, 'RD-01919': 12.60,
  'RD-01953': 195, 'RD-01954': 235, 'RD-01956': 290,
  'VT-03765': 980, 'VT-03766': 1240, 'VT-03777': 3.40, 'VT-03731': 11.50, 'VT-03730': 9.80,
  'EL-00003': 310,
});

function round2(v) {
  return Math.round(v * 100) / 100;
}

function escHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Barcha 4 muhandislik bo'limini (Teplopoterya + ОВ + ВК + ТМ) yagona paketda hisoblaydi!
 */
export function computeFullMepSuite(project, mepConfig = {}) {
  const heat = computeProjectHeatLoss(project, mepConfig);
  const ov = buildProjectOvSystems(project, heat, mepConfig);
  const vk = buildProjectVkSystems(project, mepConfig);
  const tm = buildProjectTmBoilerRoom(project, heat, ov, vk, mepConfig);
  return { heat, ov, vk, tm, config: mepConfig };
}

/**
 * ОВ + ВК + ТМ + GalfDesign Теплоизоляция/Крепёж bo'yicha to'liq Smeta va ГОСТ Spetsifikatsiya!
 */
export function buildClimateHouseSmeta(suite, prefs = {}) {
  const {
    usdToUzs = 12850,
    discountPct = 0,
    includeLabor = true,
    useMarketFallback = false,
    customPrices = {},
  } = prefs;

  const itemsMap = new Map();

  const addSkuQty = (group, skuCode, qty, fallbackMeta = {}) => {
    if (!qty || qty <= 0) return;
    const ch = findClimateHouseSku(skuCode);
    const key = `${group}::${skuCode || fallbackMeta.name}`;
    const prev = itemsMap.get(key);
    if (prev) {
      prev.qty = round2(prev.qty + qty);
      return;
    }

    const officialUsd = ch?.priceUsd ?? null;
    const customUsd = customPrices[skuCode] !== undefined && customPrices[skuCode] !== ''
      ? Number(customPrices[skuCode])
      : null;
    const marketUsd = useMarketFallback ? (MARKET_REFERENCE_USD_BY_SKU[skuCode] ?? fallbackMeta.refUsd ?? null) : null;

    let unitUsd = null;
    let priceKind = 'unpriced';
    if (Number.isFinite(customUsd) && customUsd >= 0) {
      unitUsd = customUsd;
      priceKind = 'custom';
    } else if (officialUsd !== null) {
      unitUsd = officialUsd;
      priceKind = 'official_ch';
    } else if (marketUsd !== null) {
      unitUsd = marketUsd;
      priceKind = 'market_ref';
    }

    itemsMap.set(key, {
      group,
      skuCode: ch?.code || skuCode || '—',
      name: ch?.name || fallbackMeta.name || 'Материал',
      specMark: ch?.article || fallbackMeta.mark || '',
      brand: ch?.brand || fallbackMeta.brand || 'CLIMATE HOUSE',
      unit: ch?.unit || fallbackMeta.unit || 'шт',
      qty: round2(qty),
      unitUsd,
      priceKind,
      priceSource: ch?.priceSource || (priceKind === 'market_ref' ? 'Ориентир рынка ($)' : ''),
      note: fallbackMeta.note || '',
    });
  };

  const { ov, vk, tm, heat } = suite;

  // --- 01. ОВ: Водяной тёплый пол (Улитка) ---
  if (ov.totalUfPipeM > 0) {
    const ufSku = ov.ufPipeId === 'pex_20_20' ? 'TP-02488' : 'TP-02490';
    addSkuQty('01. ОВ · Тёплый пол', ufSku, Math.ceil(ov.totalUfPipeM * 1.10), { note: '+10% монтажный запас' });
    for (const fl of ov.floors) {
      if (fl.tpCollector) {
        addSkuQty('01. ОВ · Тёплый пол', fl.tpCollector.skuCode, 1, { note: fl.tpCollector.label });
      }
    }
    addSkuQty('01. ОВ · Тёплый пол', 'TR-02835', ov.totalUfLoops * 2, { note: 'Евроконусы 3/4"×16 к коллектору' });
  }

  // --- 02. ОВ: Радиаторное и конвекторное отопление (Т1/Т2 · LOD 400 + TE-SA Press / Pro Aqua PP-R) ---
  for (const fl of ov.floors) {
    if (fl.radCollector) {
      addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', fl.radCollector.skuCode, 1, { note: fl.radCollector.label });
    }
    for (const rad of fl.radiators) {
      if (rad.kind === 'floor_convector') {
        addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', `KONVEKA-FC-${rad.panelLengthMm || 1400}`, 1, {
          name: rad.model,
          mark: `FC 15/15-${rad.panelLengthMm || 1400}`,
          brand: 'KONVEKA',
          unit: 'шт',
          refUsd: 195,
          note: `${rad.roomName} (${rad.powerW} Вт, ножки H=90 мм)`,
        });
        addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', 'H-VALVE-50', 1, {
          name: `Узел нижнего подключения Н-образный («бинокль» 50 мм, ${rad.feedMount === 'floor' ? 'прямой из пола + розетки' : 'угловой из стены + двойная розетка'}) + термоголовка Oventrop Uni LH M30×1.5`,
          mark: '3/4" ЕК',
          brand: 'OVENTROP / TE-SA',
          unit: 'компл',
          refUsd: 26,
        });
      } else if (rad.kind === 'convector') {
        addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', rad.skuCode || 'RD-01954', 1, {
          name: rad.model,
          mark: 'ВК EC-24V',
          brand: rad.brand || 'ROYAL THERMO',
          unit: 'шт',
          refUsd: 225,
          note: `${rad.roomName} (${rad.powerW} Вт)`,
        });
      } else if (rad.kind === 'towel_warmer') {
        addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', 'PS-500-800', 1, {
          name: rad.model,
          mark: 'ПС AISI 304',
          brand: 'CLIMATE HOUSE',
          unit: 'шт',
          refUsd: 65,
          note: rad.roomName,
        });
      } else if (rad.radType === 'sectional') {
        // Sektsiyali radiatorlar sektsiya soni bo'yicha yig'iladi!
        addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', rad.skuCode, rad.sections || 8, {
          name: `${rad.brand} (${rad.model}) — секция`,
          mark: `${rad.heightMm} мм`,
          brand: rad.brand,
          unit: 'секц',
          refUsd: 12.5,
          note: `${rad.roomName}: ${rad.sections} секц.`,
        });
        if (rad.hasMultiflex) {
          addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', 'H-VALVE-50', 1, {
            name: `Узел нижнего подключения Н-образный («бинокль» 50 мм, ${rad.feedMount === 'floor' ? 'прямой из пола + розетки' : 'угловой из стены + двойная розетка'}) + термоголовка Oventrop Uni LH M30×1.5`,
            mark: '3/4" ЕК',
            brand: 'OVENTROP / TE-SA',
            unit: 'компл',
            refUsd: 26,
          });
        } else {
          addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', 'RAD-KIT-12', 1, {
            name: 'Комплект запорно-регулирующий радиаторный 1/2" (термоклапан + балансировочный клапан с американками, термоголовка Oventrop M30×1.5, кран Маевского, кронштейны)',
            mark: '1/2" Oventrop',
            brand: 'OVENTROP / TE-SA',
            unit: 'компл',
            refUsd: 28,
          });
        }
      } else {
        addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', rad.skuCode, 1, {
          name: rad.model,
          brand: rad.brand || 'ROYAL THERMO',
          unit: 'шт',
          refUsd: 108,
          note: `${rad.roomName} (${rad.powerW} Вт)`,
        });
        addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', 'H-VALVE-50', 1, {
          name: `Узел нижнего подключения Н-образный («бинокль» 50 мм, ${rad.feedMount === 'floor' ? 'прямой из пола + розетки' : 'угловой из стены + двойная розетка'}) + термоголовка Oventrop Uni LH M30×1.5`,
          mark: '3/4" ЕК',
          brand: 'OVENTROP / TE-SA',
          unit: 'компл',
          refUsd: 26,
        });
      }
    }
  }

  // Quvurlarni haqiqiy diametri (Ø26, Ø20, Ø16 yoki PP-R Ø32, Ø25, Ø20) bo'yicha hisoblash!
  const isPprTrunk = String(ov.trunkPipeFamilyId || '').includes('ppr');
  if (Array.isArray(ov.pipeTotalsBySize) && ov.pipeTotalsBySize.length > 0) {
    for (const ps of ov.pipeTotalsBySize) {
      const mWithReserve = Math.ceil(ps.lengthM * 1.10);
      addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', ps.skuCode, mWithReserve, {
        name: ps.fittingType === 'socket_ppr'
          ? `Труба полипропиленовая Pro Aqua PP-R RUBIS армированная стекловолокном ${ps.sizeLabel}`
          : `Труба металлопластиковая TE-SA PE-Xb/Al/PE-Xb ${ps.sizeLabel} (PN10, 95 °C)`,
        mark: ps.sizeLabel,
        brand: ps.brand || (isPprTrunk ? 'PRO AQUA' : 'TE-SA'),
        unit: 'м',
        refUsd: ps.refUsdM || 1.85,
        note: `Т1/Т2 ${ov.radTopology === 'radial' ? 'лучевая' : 'магистраль'} (${ps.sizeLabel}, +10% запас)`,
      });
    }
  } else if (ov.totalRadPipeM > 0) {
    addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', isPprTrunk ? 'TR-02640' : 'TR-03037', Math.ceil(ov.totalRadPipeM * 1.10), {
      note: 'Т1/Т2 подводка (+10% запас)',
    });
  }

  // LOD 400 Фитинги отопления (Расмий Climate House Код CH: TE-SA Press CW617N/AISI 304 ёки Pro Aqua PP-R)
  const fs = ov.fittingSummary || {};
  if ((fs.teesReducing || 0) + (fs.teesEqual || 0) > 0) {
    if ((fs.teesReducing || 0) > 0) {
      addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', isPprTrunk ? 'TR-02615' : 'TR-02949', fs.teesReducing, {
        name: isPprTrunk
          ? 'Тройник переходной PP-R PRO AQUA 25-20-25'
          : 'Пресс-фитинг тройник с уменьшенным центральным отводом TE-SA 20x2-16x2-20x2 (823-200-160-200)',
        mark: isPprTrunk ? 'PP-R Перех.' : '823-200-160-200',
        brand: isPprTrunk ? 'PRO AQUA' : 'TE-SA',
        unit: 'шт',
        refUsd: isPprTrunk ? 0.95 : 5.40,
        note: 'Ответвления к приборам Т1/Т2',
      });
    }
    if ((fs.teesEqual || 0) > 0) {
      addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', isPprTrunk ? 'TR-02607' : 'TR-02927', fs.teesEqual, {
        name: isPprTrunk
          ? 'Тройник PP-R PRO AQUA 20'
          : 'Пресс-фитинг тройник TE-SA 20x2-20x2-20x2 (822-200-200-200)',
        mark: isPprTrunk ? 'PP-R Равн.' : '822-200-200-200',
        brand: isPprTrunk ? 'PRO AQUA' : 'TE-SA',
        unit: 'шт',
        refUsd: isPprTrunk ? 0.85 : 4.90,
      });
    }
  }
  if ((fs.elbows90 || 0) > 0) {
    addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', isPprTrunk ? 'PPR-ELB-90' : 'TR-02959', fs.elbows90, {
      name: isPprTrunk
        ? 'Угольник 90° полипропиленовый Pro Aqua PP-R'
        : 'Пресс-фитинг угольник 90° TE-SA 16x2-16x2 (812-160-160)',
      mark: isPprTrunk ? 'PP-R 90°' : '812-160-160',
      brand: isPprTrunk ? 'PRO AQUA' : 'TE-SA',
      unit: 'шт',
      refUsd: isPprTrunk ? 0.55 : 3.60,
    });
  }
  if ((fs.reducers || 0) > 0) {
    addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', isPprTrunk ? 'TR-02547' : 'TR-02880', fs.reducers, {
      name: isPprTrunk
        ? 'Муфта белая PP-R PRO AQUA 20'
        : 'Пресс-фитинг муфта переходная TE-SA 20x2-16x2 (803-200-160)',
      mark: isPprTrunk ? 'PP-R Муфта' : '803-200-160',
      brand: isPprTrunk ? 'PRO AQUA' : 'TE-SA',
      unit: 'шт',
      refUsd: isPprTrunk ? 0.45 : 3.20,
    });
  }
  if ((fs.obvods || 0) > 0) {
    addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', isPprTrunk ? 'PPR-OBVOD' : 'TESA-OBVOD-16', fs.obvods, {
      name: isPprTrunk
        ? 'Обвод полипропиленовый длинный Pro Aqua PP-R Ø20'
        : 'Узел обвода трубы (пересечение Т1/Т2) с пресс-муфтами TE-SA Ø16×2.0',
      mark: 'Обвод Т1/Т2',
      brand: isPprTrunk ? 'PRO AQUA' : 'TE-SA',
      unit: 'шт',
      refUsd: isPprTrunk ? 1.10 : 4.20,
      note: 'Бесколлизионный обход магистрали',
    });
  }
  if ((fs.adaptersEk || 0) > 0) {
    addSkuQty('02. ОВ · Радиаторы (Т1/Т2)', isPprTrunk ? 'TR-02556' : 'TR-02871', fs.adaptersEk, {
      name: isPprTrunk
        ? 'Муфта накидная PP-R PRO AQUA 20-3/4'
        : 'Пресс-фитинг евроконус TE-SA 16x2-3/4" (831-05-160)',
      mark: isPprTrunk ? 'PP-R 20-3/4"' : '831-05-160',
      brand: isPprTrunk ? 'PRO AQUA' : 'TE-SA',
      unit: 'шт',
      refUsd: isPprTrunk ? 2.10 : 2.15,
    });
  }

  // --- 02а. GalfDesign стандарт: Теплоизоляция и расходные материалы ТП/ОВ/ВК ---
  const cons = ov.consumables || {};
  const insRedM = (cons.insulationRed18M || 0) + Math.ceil((vk.totalHotPipeM + vk.totalRecircPipeM) * 1.05);
  const insBlueM = (cons.insulationBlue18M || 0) + Math.ceil(vk.totalColdPipeM * 1.05);
  if (insRedM > 0) {
    addSkuQty('02а. Изоляция и крепёж (Galf)', 'INS-RED-18', insRedM, {
      name: 'Труба теплоизолирующая Energoflex Super 18×6 мм КРАСНАЯ (подача Т1, транзиты ТП, ГВС Т3)',
      mark: '18/6 Красная',
      brand: 'ENERGOFLEX',
      unit: 'м',
      refUsd: 0.42,
      note: 'Защита стяжки от перегрева',
    });
  }
  if (insBlueM > 0) {
    addSkuQty('02а. Изоляция и крепёж (Galf)', 'INS-BLUE-18', insBlueM, {
      name: 'Труба теплоизолирующая Energoflex Super 18×6 мм СИНЯЯ (обратка Т2, транзиты ТП, ХВС В1)',
      mark: '18/6 Синяя',
      brand: 'ENERGOFLEX',
      unit: 'м',
      refUsd: 0.42,
      note: 'Защита от конденсата и теплопотерь',
    });
  }
  if ((cons.xpsAreaM2 || 0) > 0) {
    addSkuQty('02а. Изоляция и крепёж (Galf)', `XPS-${cons.xpsMm || 50}`, cons.xpsAreaM2, {
      name: `Плиты теплоизоляционные ЭППС Пеноплэкс Комфорт ${cons.xpsMm || 50} мм`,
      mark: `ЭППС ${cons.xpsMm || 50}мм`,
      brand: 'ПЕНОПЛЭКС',
      unit: 'м²',
      refUsd: (cons.xpsMm || 50) >= 100 ? 6.80 : (cons.xpsMm || 50) >= 50 ? 3.50 : 2.20,
      note: 'Пирог тёплого пола',
    });
    addSkuQty('02а. Изоляция и крепёж (Galf)', 'TP-FOIL-GRID', cons.gridFoilM2, {
      name: 'Плёнка мультифольга ламинированная с разметкой шага 50×50 мм',
      mark: 'Рулон',
      brand: 'VALTEC / STOUT',
      unit: 'м²',
      refUsd: 0.75,
    });
    addSkuQty('02а. Изоляция и крепёж (Galf)', 'TP-DAMPER-150', cons.damperTapeM, {
      name: 'Лента демпферная кромочная с фартуком 10×150 мм',
      mark: '10×150',
      brand: 'STOUT',
      unit: 'м',
      refUsd: 0.32,
      note: 'По периметру всех помещений',
    });
    addSkuQty('02а. Изоляция и крепёж (Galf)', 'TP-CLIPS-100', cons.anchorClipsPacks, {
      name: 'Скоба якорная для крепления труб ТП 45 мм (упаковка 100 шт.)',
      mark: 'Уп. 100 шт.',
      brand: 'PRO AQUA',
      unit: 'уп',
      refUsd: 2.60,
    });
    addSkuQty('02а. Изоляция и крепёж (Galf)', 'TP-BEND-90', cons.bendFixators16, {
      name: 'Фиксатор поворота трубы 90° Ø16 мм металлический (под коллектором)',
      mark: 'Ø16 90°',
      brand: 'STOUT',
      unit: 'шт',
      refUsd: 0.65,
    });
  }

  // --- 03. ОВиК: Вентиляция с рекуперацией (Galvent + Арктос + 3КСД) и Холодоснабжение (Чиллер–Фанкойл Т5/Т6) ---
  for (const fl of ov.floors) {
    if (fl.ahuUnit) {
      addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', fl.ahuUnit.skuCode, 1, { note: fl.ahuUnit.label });
    }
    for (const term of fl.ventTerminals) {
      if (term.skuCode === 'ARK-4APN-450') {
        addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'ARK-4APN-450', 1, {
          name: 'Диффузор потолочный 4-сторонний Арктос 4АПН 450×450 (RAL 9016) + камера стат. давления 3КСД с теплошумоизоляцией (Ø125)',
          mark: '4АПН+3КСД',
          brand: 'АРКТОС',
          unit: 'компл',
          refUsd: 54.0,
          note: `${term.sys} (${term.label || ''})`,
        });
      } else if (term.skuCode === 'ARK-DKV-450') {
        addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'ARK-DKV-450', 1, {
          name: 'Диффузор потолочный вихревой Арктос ДКВ-450 (16 ламелей, RAL 9016) + камера стат. давления КСД (Ø125)',
          mark: 'ДКВ-450+КСД',
          brand: 'АРКТОС',
          unit: 'компл',
          refUsd: 62.0,
          note: `${term.sys} (${term.label || ''})`,
        });
      } else if (term.skuCode === 'ARK-DSH-1000') {
        addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'ARK-DSH-1000', 1, {
          name: 'Диффузор линейный щелевой Арктос ДЩ-1000 (2-щелевой скрытого монтажа) + адаптер КСД (Ø125)',
          mark: 'ДЩ-1000+КСД',
          brand: 'АРКТОС',
          unit: 'компл',
          refUsd: 78.0,
          note: `${term.sys} (${term.label || ''})`,
        });
      } else {
        addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', term.skuCode, 1, { note: term.sys });
      }
    }
    for (const ac of fl.acUnits) {
      if (ac.kind === 'cassette_4way' || ac.kind === 'wall_fancoil') {
        addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', ac.skuCode || 'FC-4W-45', 1, {
          name: ac.model,
          mark: ac.kind === 'cassette_4way' ? '840×840 4-way' : 'Wall FC',
          brand: 'CLIMATE HOUSE',
          unit: 'компл',
          refUsd: ac.kind === 'cassette_4way' ? 485 : 320,
          note: `${ac.roomName} (${ac.label})`,
        });
        addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'FC-VALVE-3W', 1, {
          name: 'Узел обвязки фанкойла 3/4" (3-ходовой клапан с сервоприводом 230В + шаровые краны + гибкие подводки в изоляции)',
          mark: '3-way DN20',
          brand: 'CLIMATE HOUSE',
          unit: 'компл',
          refUsd: 68,
          note: ac.label,
        });
      } else {
        addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', `SPLIT-${ac.btuClass}`, 1, {
          name: `Настенная инверторная сплит-система ${ac.btuClass} (${(ac.coolingW / 1000).toFixed(1)} кВт)`,
          mark: ac.btuClass,
          brand: 'CLIMATE HOUSE',
          unit: 'компл',
          refUsd: ac.btuClass === '09K' ? 340 : ac.btuClass === '12K' ? 395 : 540,
          note: ac.roomName,
        });
      }
    }
  }
  if ((ov.totalVentSilencers || 0) > 0) {
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'ARK-SR-160-600', ov.totalVentSilencers, {
      name: 'Шумоглушитель трубчатый оцинкованный Арктос СР 160/600 (Ø160/260 мм, L=600 мм)',
      mark: 'СР 160/600',
      brand: 'АРКТОС',
      unit: 'шт',
      refUsd: 42.0,
      note: 'Шумоглушение П1 и В1 у ПВУ (<32 дБА)',
    });
  }
  if ((ov.totalVentDampers || 0) > 0) {
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'GALV-DK-125', ov.totalVentDampers, {
      name: 'Дроссель-клапан воздушный регулирующий Galvent ДК Ø125 с сектором фиксации и уплотнением EPDM',
      mark: 'ДК Ø125',
      brand: 'GALVENT',
      unit: 'шт',
      refUsd: 11.5,
      note: 'Балансировка веток диффузоров',
    });
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'SONODFLEX-125', Math.max(2, Math.ceil(ov.totalVentDampers * 0.75)), {
      name: 'Воздуховод гибкий звукотеплоизолированный SonoDFlex Ø125 мм (подводки к камерам 3КСД)',
      mark: 'Ø125 Акустик',
      brand: 'DEC / SONODFLEX',
      unit: 'м',
      refUsd: 6.4,
    });
  }
  if ((ov.totalExtGrilles || 0) > 0) {
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'ARK-VRN-300', ov.totalExtGrilles, {
      name: 'Решётка вентиляционная наружная алюминиевая Арктос ВРН 300×300 (забор Н1 и выброс В2)',
      mark: 'ВРН 300×300',
      brand: 'АРКТОС',
      unit: 'шт',
      refUsd: 28.0,
    });
  }
  if (ov.chillerUnit) {
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', ov.chillerUnit.skuCode, 1, {
      name: ov.chillerUnit.model,
      mark: `CH-${ov.chillerUnit.powerKw} кВт`,
      brand: 'CLIMATE HOUSE',
      unit: 'шт',
      refUsd: ov.chillerUnit.powerKw <= 10 ? 1950 : 2650,
      note: 'Холодоснабжение Т5/Т6 (7/12 °C)',
    });
  }
  if ((ov.totalFancoilPipeM || 0) > 0) {
    const fcPipeM = Math.ceil(ov.totalFancoilPipeM * 1.10);
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'TR-02641', fcPipeM, {
      name: 'Труба полипропиленовая армированная стекловолокном Pro Aqua PP-R Ø25×3.5 (магистрали холодоснабжения Т5/Т6)',
      mark: 'PP-R Ø25',
      brand: 'PRO AQUA',
      unit: 'м',
      refUsd: 1.95,
      note: 'Т5/Т6 +7/+12 °C (+10% запас)',
    });
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'KFLEX-25-13', fcPipeM, {
      name: 'Теплоизоляция каучуковая антиконденсатная K-Flex ST 25×13 мм (чёрная, для труб фанкойлов Т5/Т6)',
      mark: 'ST 25×13',
      brand: 'K-FLEX',
      unit: 'м',
      refUsd: 1.65,
      note: 'Защита от конденсата +7 °C',
    });
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'FC-DRAIN-25', Math.ceil(fcPipeM * 0.48), {
      name: 'Труба дренажная ПВХ/ПП Ø25 мм для отвода конденсата фанкойлов (К3, i=0.01)',
      mark: 'К3 Ø25',
      brand: 'OSTENDORF / PRO AQUA',
      unit: 'м',
      refUsd: 0.90,
    });
  }
  if ((ov.totalVentDuct160M || 0) > 0) {
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'GALV-SP-160', Math.ceil(ov.totalVentDuct160M * 1.08), {
      name: 'Воздуховод спирально-навивной оцинкованный Galvent Ø160 мм (класс П, с ниппелями EPDM и шпильками М8)',
      mark: 'Galvent Ø160',
      brand: 'GALVENT / LINDAB',
      unit: 'м',
      refUsd: 8.90,
      note: 'Магистрали П1/В1/Н1/В2',
    });
  }
  if ((ov.totalVentReducers || 0) > 0) {
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'GALV-RED-160-125', ov.totalVentReducers, {
      name: 'Переход концентрический оцинкованный Galvent Ø160/125 мм с резиновым уплотнением EPDM',
      mark: 'Ø160/125',
      brand: 'GALVENT',
      unit: 'шт',
      refUsd: 7.50,
      note: 'Переход магистрали П1 и В1',
    });
  }
  if ((ov.totalVentDuct125M || 0) > 0) {
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'GALV-SP-125', Math.ceil(ov.totalVentDuct125M * 1.08), {
      name: 'Воздуховод спирально-навивной оцинкованный Galvent Ø125 мм (класс П, с ниппелями EPDM и шпильками М8)',
      mark: 'Galvent Ø125',
      brand: 'GALVENT / LINDAB',
      unit: 'м',
      refUsd: 6.80,
      note: 'Ответвления П1/В1',
    });
  } else if (ov.totalVentDuctM > 0) {
    addSkuQty('03. ОВиК · Вентиляция и Фанкойлы', 'VT-03777', Math.ceil(ov.totalVentDuctM * 1.08), { note: 'Воздуховод спирально-навивной Galvent / HDPE (П1/В1)' });
  }

  // --- 04. ВК: Водоснабжение (В1/Т3/Т4) и Канализация (К1) ---
  if (vk.totalColdPipeM > 0) {
    const coldPorts = Math.min(15, Math.max(2, vk.fixturesCount || 4));
    const coldColSku = CH_7200S_COLLECTOR_CODES[coldPorts] || 'TP-02458';
    addSkuQty('04. ВК · Водопровод и К1', 'TR-02650', 8, { note: 'Ввод ХВС В1 Ø32' });
    addSkuQty('04. ВК · Водопровод и К1', 'TR-02648', Math.ceil(vk.totalColdPipeM * 1.10), { note: 'Разводка В1 Ø20' });
    addSkuQty('04. ВК · Водопровод и К1', coldColSku, 1, { note: `Коллектор ХВС 7200 ${coldPorts} вых.` });
    addSkuQty('04. ВК · Водопровод и К1', 'VK-PLATE-150', Math.max(2, vk.fixturesCount), {
      name: 'Планка монтажная для водорозеток 150 мм оцинкованная',
      mark: '150 мм',
      brand: 'PRO AQUA',
      unit: 'шт',
      refUsd: 0.95,
    });
  }
  if (vk.totalHotPipeM + vk.totalRecircPipeM > 0) {
    const hotPorts = Math.min(15, Math.max(2, Math.ceil((vk.fixturesCount || 4) * 0.75)));
    const hotColSku = CH_7200S_COLLECTOR_CODES[hotPorts] || 'TP-02456';
    addSkuQty('04. ВК · Водопровод и К1', 'TR-02640', Math.ceil((vk.totalHotPipeM + vk.totalRecircPipeM) * 1.10), { note: 'ГВС Т3 + Рецирк. Т4' });
    addSkuQty('04. ВК · Водопровод и К1', hotColSku, 1, { note: `Коллектор ГВС 7200 ${hotPorts} вых.` });
  }
  if (vk.totalSewer110M > 0) {
    addSkuQty('04. ВК · Водопровод и К1', 'TR-03147', Math.max(2, Math.ceil(vk.totalSewer110M / 2)), { note: 'К1 стояк и лежак Ø110 (по 2 м)' });
    addSkuQty('04. ВК · Водопровод и К1', 'TR-03206', 3, { note: 'Выпуск К1 наружный SN4 Ø110×2000' });
  }
  if (vk.totalSewer50M > 0) {
    addSkuQty('04. ВК · Водопровод и К1', 'TR-03162', Math.max(2, Math.ceil(vk.totalSewer50M / 2)), { note: 'Отводные линии К1 Ø50 (по 2 м)' });
  }

  // --- 05. ТМ: Котельная / Компактный котельный узел и Автоматика ZONT ---
  if (tm && tm.enabled !== false && (tm.equipment3d?.length || 0) > 0) {
    addSkuQty('05. ТМ · Котельная и ZONT', tm.boilerSku, tm.boilerCount, { note: `${tm.designBoilerKw} кВт расч.` });
    addSkuQty('05. ТМ · Котельная и ZONT', 'KT-00704', tm.boilerCount, { note: 'Коаксиальный дымоход Ø60/100' });
    addSkuQty('05. ТМ · Котельная и ZONT', 'MT-01563', 1, { note: `Гидрострелка Ø${tm.hydraulics10?.hydroarrow?.chamberDiameterMm || 80}` });
    addSkuQty('05. ТМ · Котельная и ZONT', 'MT-01560', 1, { note: tm.isCompactHeatingOnly ? 'Гидроколлектор Ф40 (2 контура)' : 'Гидроколлектор Ф40 (4 вых.)' });
    for (const pc of tm.pumpCircuits) {
      addSkuQty('05. ТМ · Котельная и ZONT', pc.groupSku, 1, { note: pc.code });
      addSkuQty('05. ТМ · Котельная и ZONT', pc.pumpSku, 1, { note: `${pc.code} (${pc.pumpName})` });
      if (pc.valveSku) addSkuQty('05. ТМ · Котельная и ZONT', pc.valveSku, 1, { note: '3-ходовой клапан ТП' });
    }
    if (!tm.isCompactHeatingOnly) {
      addSkuQty('05. ТМ · Котельная и ZONT', tm.bknSku, 1, { note: `ГВС БКН (нагрев ${tm.hydraulics10?.dhw?.heatUpMin || 28} мин)` });
      addSkuQty('05. ТМ · Котельная и ZONT', 'NS-01635', 1, { note: 'Рециркуляция ГВС Т4' });
    }
    addSkuQty('05. ТМ · Котельная и ZONT', tm.expTankSku, 1, { note: `Vсис=${tm.systemWaterLiters} л` });
    addSkuQty('05. ТМ · Котельная и ZONT', 'TR-02987', 1, { note: 'Группа безопасности котла 3 бар' });
    addSkuQty('05. ТМ · Котельная и ZONT', 'MT-01587', 1, { note: 'Кран-консоль РБ 3 в 1' });
    addSkuQty('05. ТМ · Котельная и ZONT', 'TR-03513', tm.isCompactHeatingOnly ? 6 : 12, { note: 'Обвязка котла S-Press SS304 Ø28' });
    if (!tm.isCompactHeatingOnly) {
      addSkuQty('05. ТМ · Котельная и ZONT', 'FL-00259', 1, { note: 'Защита от протечек Wi-Fi' });
      addSkuQty('05. ТМ · Котельная и ZONT', 'FL-00303', 1, { note: 'Промывной фильтр В1' });
      addSkuQty('05. ТМ · Котельная и ZONT', 'FL-00293', 1, { note: 'Умягчитель воды ХВО' });
    }
    addSkuQty('05. ТМ · Котельная и ZONT', 'EL-00003', 1, { note: 'Контроллер ZONT H1000+ PRO.V2' });
    addSkuQty('05. ТМ · Котельная и ZONT', 'EL-00013', 1, { note: 'Блок расширения ZONT ZE-44' });
    addSkuQty('05. ТМ · Котельная и ZONT', 'EL-00020', 1, { note: 'Комнатный термостат МЛ-232 RS-485' });
    addSkuQty('05. ТМ · Котельная и ZONT', 'EL-00035', 1, { note: 'Датчик ПЗА уличный' });
  }

  const rows = [...itemsMap.values()].map((r, i) => {
    const discFactor = Math.max(0, 1 - (Number(discountPct) || 0) / 100);
    const effUnitUsd = r.unitUsd !== null ? round2(r.unitUsd * discFactor) : null;
    const lineUsd = effUnitUsd !== null ? round2(effUnitUsd * r.qty) : null;
    const lineUzs = lineUsd !== null ? Math.round(lineUsd * usdToUzs) : null;
    return {
      pos: i + 1,
      ...r,
      effUnitUsd,
      lineUsd,
      lineUzs,
    };
  });

  // --- 06. Монтажные работы ---
  const laborRows = [];
  if (includeLabor) {
    const ufArea = round2(ov.floors.reduce((s, f) => s + f.ufLoops.reduce((a, l) => a + l.areaM2, 0), 0));
    if (ufArea > 0) {
      laborRows.push({ title: 'Монтаж водяного тёплого пола («улитка» с ЭППС, демпферной лентой и опрессовкой)', unit: 'м²', qty: ufArea, unitUsd: 5.50, lineUsd: round2(ufArea * 5.50) });
    }
    const radTotal = ov.totalRadiators + ov.totalConvectors + ov.totalTowelWarmers;
    if (radTotal > 0) {
      laborRows.push({ title: 'Монтаж радиаторов / конвекторов и двухтрубной трассы Т1/Т2 в теплоизоляции', unit: 'точка', qty: radTotal, unitUsd: 35.00, lineUsd: round2(radTotal * 35.00) });
    }
    if ((ov.totalFancoilUnits || 0) > 0 || ov.totalVentDuctM > 0) {
      const ventPts = (ov.totalFancoilUnits || 0) + (ov.floors[0]?.ahuUnit ? 1 : 0);
      if (ventPts > 0) {
        laborRows.push({
          title: (ov.totalFancoilUnits || 0) > 0
            ? 'Монтаж ПВУ с воздуховодами, кассетных фанкойлов, трасс Т5/Т6 в K-Flex и дренажа'
            : 'Монтаж ПВУ с рекуперацией и воздуховодов П1/В1',
          unit: 'точка',
          qty: ventPts,
          unitUsd: 85.00,
          lineUsd: round2(ventPts * 85.00),
        });
      }
    }
    if (vk.fixturesCount > 0) {
      laborRows.push({ title: 'Монтаж внутренних точек ВК (ХВС В1, ГВС Т3/Т4 и канализация К1)', unit: 'точка', qty: vk.fixturesCount, unitUsd: 30.00, lineUsd: round2(vk.fixturesCount * 30.00) });
    }
    if (tm && tm.enabled !== false && (tm.equipment3d?.length || 0) > 0) {
      const tmRate = tm.isCompactHeatingOnly ? 260.00 : 450.00;
      laborRows.push({
        title: tm.isCompactHeatingOnly
          ? 'Обвязка компактного котельного узла офиса (Котёл + ГС + НК-1/НК-2 + ZONT)'
          : 'Обвязка котельной ТМ (нерж. S-Press), ХВО Imrita и пусконаладка ZONT',
        unit: 'компл',
        qty: 1,
        unitUsd: tmRate,
        lineUsd: tmRate,
      });
    }
  }

  const materialsUsd = round2(rows.reduce((s, r) => s + (r.lineUsd || 0), 0));
  const laborUsd = round2(laborRows.reduce((s, l) => s + l.lineUsd, 0));
  const grandTotalUsd = round2(materialsUsd + laborUsd);
  const grandTotalUzs = Math.round(grandTotalUsd * usdToUzs);
  const unpricedCount = rows.filter((r) => r.effUnitUsd === null).length;

  return {
    usdToUzs,
    discountPct,
    includeLabor,
    useMarketFallback,
    rows,
    laborRows,
    materialsUsd,
    laborUsd,
    grandTotalUsd,
    grandTotalUzs,
    unpricedCount,
    totalItemsCount: rows.length,
    heatedAreaM2: heat.totalHeatedAreaM2,
  };
}

export function exportSmetaToCsv(smeta, projectTitle = 'SPS Project 2.0') {
  const header = [
    'Поз.', 'Раздел', 'Код CH', 'Наименование и техническая характеристика',
    'Тип / Артикул', 'Бренд (Завод)', 'Ед. изм.', 'Кол-во', 'Цена ($)', 'Сумма ($)', 'Сумма (UZS)', 'Статус цены', 'Примечание',
  ];
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const lines = [header.map(esc).join(',')];

  for (const r of smeta.rows) {
    const status = r.priceKind === 'official_ch'
      ? `Опт CH (${r.priceSource})`
      : r.priceKind === 'custom'
        ? 'Введено вручную'
        : r.priceKind === 'market_ref'
          ? 'Ориентир рынка'
          : 'Уточнить по прайсу';
    lines.push([
      r.pos, r.group, r.skuCode, r.name, r.specMark, r.brand, r.unit, r.qty,
      r.effUnitUsd !== null ? r.effUnitUsd.toFixed(2) : '',
      r.lineUsd !== null ? r.lineUsd.toFixed(2) : '',
      r.lineUzs !== null ? r.lineUzs : '',
      status, r.note,
    ].map(esc).join(','));
  }

  for (const lb of smeta.laborRows) {
    lines.push([
      'РАБ', '06. Монтажные работы', 'SPS-WORK', lb.title, '', 'SPS Project Монтаж', lb.unit, lb.qty,
      lb.unitUsd.toFixed(2), lb.lineUsd.toFixed(2), Math.round(lb.lineUsd * smeta.usdToUzs), 'Смета работ', '',
    ].map(esc).join(','));
  }

  lines.push(['', '', '', `ИТОГО (${projectTitle}):`, '', '', '', '', '', smeta.grandTotalUsd.toFixed(2), smeta.grandTotalUzs, '', ''].map(esc).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * GalfDesign uslubidagi vektorli СОСТАВ ПОЛА va СОСТАВ НАРУЖНОЙ СТЕНЫ qatlamli kesim diagrammasi!
 */
export function renderConstructionPiesSvg(suite) {
  const xpsMm = suite.ov.ufXpsMm || 50;
  const stepMm = suite.ov.ufStepMm || 150;
  const rWall = (1 / Math.max(0.1, suite.heat.wallSpec.uWall)).toFixed(2);
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 162" style="width:100%;height:auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:4px;font-family:Arial,sans-serif;">
  <!-- СОСТАВ ПОЛА ТЁПЛОГО ПОЛА -->
  <text x="12" y="18" font-size="10.5" font-weight="800" fill="#0f172a">СОСТАВ ПИРОГА ТЁПЛОГО ПОЛА 1-ГО ЭТАЖА:</text>
  <rect x="12" y="26" width="165" height="12" fill="#eab308" stroke="#334155" stroke-width="0.8"/>
  <rect x="12" y="38" width="165" height="28" fill="#cbd5e1" stroke="#334155" stroke-width="0.8"/>
  <circle cx="38" cy="54" r="5" fill="#dc2626"/><circle cx="72" cy="54" r="5" fill="#2563eb"/><circle cx="106" cy="54" r="5" fill="#dc2626"/><circle cx="140" cy="54" r="5" fill="#2563eb"/>
  <line x1="12" y1="66" x2="177" y2="66" stroke="#0284c7" stroke-width="2.2" stroke-dasharray="4,2"/>
  <rect x="12" y="67" width="165" height="22" fill="#fed7aa" stroke="#ea580c" stroke-width="0.8"/>
  <rect x="12" y="89" width="165" height="24" fill="#94a3b8" stroke="#334155" stroke-width="0.8"/>

  <text x="184" y="35" font-size="8.5" fill="#0f172a">1. Чистовое покрытие (плитка / ламинат) — 12..15 мм</text>
  <text x="184" y="51" font-size="8.5" fill="#0f172a">2. Стяжка с фиброволокном 65–70 мм + PE-RT Ø16 (шаг ${stepMm})</text>
  <text x="184" y="66" font-size="8.5" fill="#0369a1">3. Мультифольга с разметкой + Демпферная лента 10×150</text>
  <text x="184" y="81" font-size="8.5" fill="#c2410c" font-weight="700">4. Утеплитель ЭППС Пеноплэкс Комфорт — ${xpsMm} мм</text>
  <text x="184" y="102" font-size="8.5" fill="#334155">5. Черновая Ж/Б плита перекрытия — 150..200 мм</text>

  <!-- СОСТАВ НАРУЖНОЙ СТЕНЫ -->
  <line x1="12" y1="121" x2="528" y2="121" stroke="#cbd5e1" stroke-width="1"/>
  <text x="12" y="136" font-size="10" font-weight="800" fill="#0f172a">СОСТАВ НАРУЖНОЙ СТЕНЫ (R₀ = ${rWall} м²·°C/Вт):</text>
  <text x="12" y="151" font-size="9" fill="#334155">${escHtml(suite.heat.wallSpec.layersLabel || suite.heat.wallSpec.label)} · Окна: ${escHtml(suite.heat.winSpec.label)}</text>
</svg>`.trim();
}

/**
 * GalfDesign darajasidagi Лист УЗ-1: МОНТАЖНЫЕ УЗЛЫ СИСТЕМ ОВ И ВК (3 ta detalli vektorli chizma + pozitsion spiska)!
 */
export function renderMontajnieUzliSheetSvg(suite) {
  const tpCol = suite.ov.floors[0]?.tpCollector;
  const tpPorts = tpCol?.ports || 6;
  const tpSku = tpCol?.skuCode || CH_8468_COLLECTOR_CODES[tpPorts] || 'TP-02444';
  const shownPorts = Math.min(9, Math.max(2, tpPorts));
  const portPitch = shownPorts > 6 ? 170 / shownPorts : 28;
  return `
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:8px 10px;height:100%;font-size:9px;color:#0f172a;">
  <!-- УЗЕЛ 1: КОЛЛЕКТОР ТЁПЛОГО ПОЛА 8468 -->
  <div style="border:1px solid #334155;padding:7px;display:flex;flex-direction:column;justify-content:space-between;">
    <div>
      <div style="font-weight:800;font-size:10.5px;border-bottom:1px solid #cbd5e1;padding-bottom:3px;margin-bottom:5px;">
        УЗЕЛ 1. ОБВЯЗКА КОЛЛЕКТОРА ТЁПЛОГО ПОЛА (${tpPorts} ВЫХ. · ${escHtml(tpSku)})
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 215" style="width:100%;height:auto;background:#f8fafc;border:1px solid #e2e8f0;">
        <!-- Шкаф ШРВ -->
        <rect x="16" y="14" width="308" height="156" fill="#ffffff" stroke="#475569" stroke-width="1.6" stroke-dasharray="5,3"/>
        <!-- Вводные шаровые краны + термометры -->
        <rect x="34" y="52" width="28" height="16" rx="2" fill="#dc2626"/>
        <circle cx="74" cy="60" r="10" fill="#fff" stroke="#dc2626" stroke-width="1.8"/><text x="74" y="63" text-anchor="middle" font-size="7" font-weight="800" fill="#dc2626">${suite.ov.ufSupplyTempC || 42}°</text>
        <rect x="34" y="112" width="28" height="16" rx="2" fill="#0284c7"/>
        <circle cx="74" cy="120" r="10" fill="#fff" stroke="#0284c7" stroke-width="1.8"/><text x="74" y="123" text-anchor="middle" font-size="7" font-weight="800" fill="#0284c7">${suite.ov.ufReturnTempC || 35}°</text>

        <!-- Подающая и обратная балки 8468 -->
        <rect x="90" y="52" width="186" height="16" rx="2" fill="#cbd5e1" stroke="#334155" stroke-width="1.4"/>
        <rect x="90" y="112" width="186" height="16" rx="2" fill="#cbd5e1" stroke="#334155" stroke-width="1.4"/>

        <!-- Ротаметры сверху, сервоприводы и трубы в красной/синей изоляции (динамически под число контуров!) -->
        ${Array.from({ length: shownPorts }, (_, i) => {
          const px = 102 + i * portPitch;
          return `
            <rect x="${(px - 4).toFixed(1)}" y="31" width="8" height="21" rx="1.5" fill="#e0f2fe" stroke="#0284c7" stroke-width="1"/>
            <line x1="${(px - 3).toFixed(1)}" y1="41" x2="${(px + 3).toFixed(1)}" y2="41" stroke="#dc2626" stroke-width="2"/>
            <rect x="${(px - 4.5).toFixed(1)}" y="92" width="9" height="20" rx="1.5" fill="#2563eb"/>
            <line x1="${(px - 3.5).toFixed(1)}" y1="68" x2="${(px - 3.5).toFixed(1)}" y2="205" stroke="#dc2626" stroke-width="2.6"/>
            <line x1="${(px - 3.5).toFixed(1)}" y1="152" x2="${(px - 3.5).toFixed(1)}" y2="205" stroke="#e11d48" stroke-width="5.5" stroke-opacity="0.45"/>
            <line x1="${(px + 3.5).toFixed(1)}" y1="128" x2="${(px + 3.5).toFixed(1)}" y2="205" stroke="#0284c7" stroke-width="2.6"/>
            <line x1="${(px + 3.5).toFixed(1)}" y1="152" x2="${(px + 3.5).toFixed(1)}" y2="205" stroke="#0369a1" stroke-width="5.5" stroke-opacity="0.45"/>
          `;
        }).join('')}

        <!-- Воздухоотводчик и сливной кран справа -->
        <rect x="284" y="32" width="16" height="24" rx="2" fill="#d97706" stroke="#78350f"/>
        <rect x="284" y="92" width="16" height="24" rx="2" fill="#d97706" stroke="#78350f"/>
        <circle cx="292" cy="74" r="5" fill="#b45309"/><circle cx="292" cy="134" r="5" fill="#b45309"/>

        <!-- Выноски ①..⑥ -->
        <circle cx="48" cy="36" r="8" fill="#fff" stroke="#0f172a"/><text x="48" y="39" text-anchor="middle" font-size="8" font-weight="800">1</text>
        <circle cx="146" cy="20" r="8" fill="#fff" stroke="#0f172a"/><text x="146" y="23" text-anchor="middle" font-size="8" font-weight="800">2</text>
        <circle cx="214" cy="84" r="8" fill="#fff" stroke="#0f172a"/><text x="214" y="87" text-anchor="middle" font-size="8" font-weight="800">3</text>
        <circle cx="310" cy="40" r="8" fill="#fff" stroke="#0f172a"/><text x="310" y="43" text-anchor="middle" font-size="8" font-weight="800">4</text>
        <circle cx="92" cy="188" r="8" fill="#fff" stroke="#0f172a"/><text x="92" y="191" text-anchor="middle" font-size="8" font-weight="800">5</text>
      </svg>
    </div>
    <table class="gost-tbl" style="margin-top:5px;font-size:8.2px;">
      <thead><tr><th>Поз.</th><th>Наименование узла коллектора ТП</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>Шаровые краны 1" со сгоном и термометрами 0–120°C</td></tr>
        <tr><td>2</td><td>Коллектор Climate House 8468 с ротаметрами 0,5–5 л/мин</td></tr>
        <tr><td>3</td><td>Сервоприводы электротермические НЗ 230В / 24В (M30×1.5)</td></tr>
        <tr><td>4</td><td>Автоматические воздухоотводчики 1/2" + сливные краны</td></tr>
        <tr><td>5</td><td>Евроконусы 3/4"×16 + Труба PE-RT в изоляции Energoflex 18×6 (кр./син.)</td></tr>
      </tbody>
    </table>
  </div>

  <!-- УЗЕЛ 2: НИЖНЕЕ ПОДКЛЮЧЕНИЕ РАДИАТОРА («БИНОКЛЬ» 50 ММ) -->
  <div style="border:1px solid #334155;padding:7px;display:flex;flex-direction:column;justify-content:space-between;">
    <div>
      <div style="font-weight:800;font-size:10.5px;border-bottom:1px solid #cbd5e1;padding-bottom:3px;margin-bottom:5px;">
        УЗЕЛ 2. НИЖНЕЕ ПОДКЛЮЧЕНИЕ РАДИАТОРА (ИЗ СТЕНЫ 50 ММ)
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 215" style="width:100%;height:auto;background:#f8fafc;border:1px solid #e2e8f0;">
        <!-- Пол и стена -->
        <rect x="285" y="10" width="38" height="190" fill="#cbd5e1" stroke="#334155"/>
        <rect x="15" y="185" width="308" height="18" fill="#94a3b8" stroke="#334155"/>
        <!-- Радиатор -->
        <rect x="48" y="34" width="188" height="106" rx="4" fill="#ffffff" stroke="#0f172a" stroke-width="2"/>
        ${[0, 1, 2, 3, 4, 5, 6].map((k) => `<line x1="${68 + k * 25}" y1="42" x2="${68 + k * 25}" y2="132" stroke="#cbd5e1" stroke-width="2"/>`).join('')}
        <!-- Кран Маевского слева вверху -->
        <rect x="36" y="42" width="12" height="10" fill="#94a3b8" stroke="#0f172a"/>
        <!-- Термоголовка справа вверху -->
        <rect x="236" y="38" width="34" height="18" rx="3" fill="#f8fafc" stroke="#0f172a" stroke-width="1.5"/>
        <!-- Узел нижнего подключения «Бинокль» 50 мм + трубки в стену -->
        <rect x="192" y="140" width="34" height="22" rx="2" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.5"/>
        <line x1="201" y1="162" x2="285" y2="162" stroke="#dc2626" stroke-width="3.2"/>
        <line x1="217" y1="154" x2="285" y2="154" stroke="#0284c7" stroke-width="3.2"/>
        <rect x="281" y="147" width="6" height="22" fill="#475569"/>
        <!-- Штраба в стене вниз в стяжку -->
        <polyline points="296,162 296,193 120,193" fill="none" stroke="#dc2626" stroke-width="2.8" stroke-dasharray="4,2"/>
        <polyline points="306,154 306,198 120,198" fill="none" stroke="#0284c7" stroke-width="2.8" stroke-dasharray="4,2"/>

        <circle cx="135" cy="84" r="8" fill="#fff" stroke="#0f172a"/><text x="135" y="87" text-anchor="middle" font-size="8" font-weight="800">1</text>
        <circle cx="254" cy="24" r="8" fill="#fff" stroke="#0f172a"/><text x="254" y="27" text-anchor="middle" font-size="8" font-weight="800">2</text>
        <circle cx="30" cy="30" r="8" fill="#fff" stroke="#0f172a"/><text x="30" y="33" text-anchor="middle" font-size="8" font-weight="800">3</text>
        <circle cx="174" cy="154" r="8" fill="#fff" stroke="#0f172a"/><text x="174" y="157" text-anchor="middle" font-size="8" font-weight="800">4</text>
        <circle cx="255" cy="175" r="8" fill="#fff" stroke="#0f172a"/><text x="255" y="178" text-anchor="middle" font-size="8" font-weight="800">5</text>
      </svg>
    </div>
    <table class="gost-tbl" style="margin-top:5px;font-size:8.2px;">
      <thead><tr><th>Поз.</th><th>Наименование узла подключения прибора</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>Радиатор отопления (Royal Thermo / Kermi FTV / Rifar Tubog)</td></tr>
        <tr><td>2</td><td>Термостатическая головка жидкостная M30×1.5 (Oventrop Uni LH)</td></tr>
        <tr><td>3</td><td>Воздухоотводчик ручной 1/2" (кран Маевского) + заглушка</td></tr>
        <tr><td>4</td><td>Узел нижнего подключения Н-образный угловой 50 мм (3/4" ЕК)</td></tr>
        <tr><td>5</td><td>Хромированные Г-трубки Ø16 + двойная декоративная розетка в стену</td></tr>
      </tbody>
    </table>
  </div>

  <!-- УЗЕЛ 3: УЗЕЛ ВВОДА ВОДЫ В1 И КОЛЛЕКТОРОВ ХВС/ГВС -->
  <div style="border:1px solid #334155;padding:7px;display:flex;flex-direction:column;justify-content:space-between;">
    <div>
      <div style="font-weight:800;font-size:10.5px;border-bottom:1px solid #cbd5e1;padding-bottom:3px;margin-bottom:5px;">
        УЗЕЛ 3. ВВОД ВОДОПРОВОДА В1, ЗАЩИТА И КОЛЛЕКТОРЫ ХВС/ГВС
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 215" style="width:100%;height:auto;background:#f8fafc;border:1px solid #e2e8f0;">
        <!-- Линия ХВС В1 -->
        <polyline points="20,65 312,65 312,135 235,135" fill="none" stroke="#0284c7" stroke-width="3.6"/>
        <!-- 1. Кран + Аквастоп -->
        <rect x="34" y="53" width="22" height="22" rx="2" fill="#0284c7"/>
        <rect x="64" y="45" width="28" height="34" rx="3" fill="#1d4ed8"/>
        <!-- 2. Косой фильтр + Счётчик -->
        <polygon points="104,65 120,65 116,84" fill="#d97706"/>
        <circle cx="144" cy="65" r="13" fill="#ffffff" stroke="#0284c7" stroke-width="2"/><text x="144" y="68" text-anchor="middle" font-size="7.5" font-weight="800">м³</text>
        <!-- 3. Редуктор давления FAR с манометром -->
        <rect x="172" y="52" width="26" height="26" rx="3" fill="#d97706"/>
        <circle cx="185" cy="34" r="9" fill="#fff" stroke="#0f172a" stroke-width="1.4"/><text x="185" y="37" text-anchor="middle" font-size="6.5" font-weight="700">3бар</text>
        <!-- 4. Промывной фильтр Imrita IMT-M4 -->
        <rect x="216" y="48" width="28" height="54" rx="4" fill="#0369a1" stroke="#0f172a"/>
        <!-- 5. Компенсатор гидроудара + Коллектор ХВС 7200S -->
        <circle cx="276" cy="46" r="10" fill="#dc2626"/>
        <rect x="118" y="126" width="122" height="18" rx="2" fill="#0284c7"/>
        ${[0, 1, 2, 3, 4].map((m) => `<line x1="${132 + m * 23}" y1="144" x2="${132 + m * 23}" y2="198" stroke="#0284c7" stroke-width="4.5"/>`).join('')}

        <!-- Коллектор ГВС Т3 слева -->
        <rect x="22" y="126" width="76" height="18" rx="2" fill="#dc2626"/>
        ${[0, 1, 2].map((m) => `<line x1="${36 + m * 23}" y1="144" x2="${36 + m * 23}" y2="198" stroke="#dc2626" stroke-width="4.5"/>`).join('')}

        <circle cx="76" cy="28" r="8" fill="#fff" stroke="#0f172a"/><text x="76" y="31" text-anchor="middle" font-size="8" font-weight="800">1</text>
        <circle cx="144" cy="36" r="8" fill="#fff" stroke="#0f172a"/><text x="144" y="39" text-anchor="middle" font-size="8" font-weight="800">2</text>
        <circle cx="185" cy="92" r="8" fill="#fff" stroke="#0f172a"/><text x="185" y="95" text-anchor="middle" font-size="8" font-weight="800">3</text>
        <circle cx="255" cy="92" r="8" fill="#fff" stroke="#0f172a"/><text x="255" y="95" text-anchor="middle" font-size="8" font-weight="800">4</text>
        <circle cx="178" cy="114" r="8" fill="#fff" stroke="#0f172a"/><text x="178" y="117" text-anchor="middle" font-size="8" font-weight="800">5</text>
      </svg>
    </div>
    <table class="gost-tbl" style="margin-top:5px;font-size:8.2px;">
      <thead><tr><th>Поз.</th><th>Наименование узла ввода водоснабжения В1</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>Вводной кран 1" + Защита от протечек Imrita Wi-Fi (FL-00259)</td></tr>
        <tr><td>2</td><td>Фильтр косой 500 мкм + Счётчик воды + Обратный клапан</td></tr>
        <tr><td>3</td><td>Редуктор давления мембранный с манометром 0–6 бар (настр. 3,0 бар)</td></tr>
        <tr><td>4</td><td>Фильтр тонкой очистки промывной Imrita IMT-M4 (FL-00303) + гаситель</td></tr>
        <tr><td>5</td><td>Коллекторы ХВС и ГВС Climate House 7200S в синей и красной изоляции</td></tr>
      </tbody>
    </table>
  </div>
</div>`.trim();
}

function renderFloorPlanDisciplineSvg(floor, suite, mode = 'arch') {
  const b = getFloorWorldBounds(floor);
  const pad = 1.25;
  const vx = b.minX - pad;
  const vy = b.minY - pad;
  const vw = Math.max(6, b.width + pad * 2);
  const vh = Math.max(5, b.height + pad * 2);

  const flOv = suite.ov.floors.find((f) => f.floorId === floor.id);
  const flVk = suite.vk.floors.find((f) => f.floorId === floor.id);
  const flHeat = suite.heat.floors.find((f) => f.floorId === floor.id);

  const polyAttr = (pts) => pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
  const pts3dAttr = (pts) => pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}" style="width:100%;height:100%;max-height:535px;background:#ffffff;">
  <!-- Xonalar ichki konturi -->
  ${(floor.rooms || []).map((rm) => `
    <polygon points="${polyAttr(rm.innerPoly || [])}" fill="${mode === 'heat' ? '#fff7ed' : '#f8fafc'}" stroke="#cbd5e1" stroke-width="0.03"/>
  `).join('')}

  <!-- Devorlar (Mitered poligonlar) -->
  ${(floor.wallPolygons || []).map((wp) => `
    <polygon points="${polyAttr(wp.points || [])}" fill="${wp.kind === 'exterior' ? '#334155' : '#64748b'}" stroke="#0f172a" stroke-width="0.02"/>
  `).join('')}

  <!-- ОВ-1: Водяной тёплый пол «Улитка» + кружки контуров ①..⑳ -->
  ${mode === 'ov_tp' && flOv ? `
    ${flOv.ufLoops.map((lp) => `
      <polyline points="${polyAttr(lp.supplyPts)}" fill="none" stroke="#dc2626" stroke-width="0.034" stroke-linejoin="round"/>
      <polyline points="${polyAttr(lp.returnPts)}" fill="none" stroke="#2563eb" stroke-width="0.030" stroke-dasharray="0.09,0.05" stroke-linejoin="round"/>
      ${Number.isFinite(lp.badgeX) ? `
        <circle cx="${lp.badgeX.toFixed(2)}" cy="${(lp.badgeY + 0.34).toFixed(2)}" r="0.18" fill="#ffffff" stroke="#dc2626" stroke-width="0.035"/>
        <text x="${lp.badgeX.toFixed(2)}" y="${(lp.badgeY + 0.40).toFixed(2)}" text-anchor="middle" font-size="0.19" font-weight="800" fill="#b91c1c">${lp.loopIndex}</text>
      ` : ''}
    `).join('')}
    ${flOv.tpCollector ? `
      <rect x="${(flOv.tpCollector.x - 0.32).toFixed(2)}" y="${(flOv.tpCollector.y - 0.09).toFixed(2)}" width="0.64" height="0.18" fill="#fef2f2" stroke="#dc2626" stroke-width="0.04"/>
      <text x="${flOv.tpCollector.x.toFixed(2)}" y="${(flOv.tpCollector.y - 0.17).toFixed(2)}" text-anchor="middle" font-size="0.21" font-weight="800" fill="#b91c1c">${escHtml(flOv.tpCollector.galfCallout || flOv.tpCollector.label)}</text>
    ` : ''}
  ` : ''}

  <!-- ОВ-2: Отопление (Лучевая / Тупиковая / Тихельмана Т1/Т2) + Вентиляция (П1/В1) -->
  ${mode === 'ov_rad_vent' && flOv ? `
    ${flOv.radPipes.map((rp) => {
      const sw = rp.dnMm >= 26 ? '0.055' : rp.dnMm >= 20 ? '0.044' : '0.034';
      return `<polyline points="${pts3dAttr(rp.pts3d)}" fill="none" stroke="${rp.sys === 'T1' ? '#dc2626' : '#0284c7'}" stroke-width="${sw}" ${rp.sys === 'T2' ? 'stroke-dasharray="0.12,0.06"' : ''}/>`;
    }).join('')}
    ${(flOv.radFittings || []).filter((ft) => ft.kind === 'tee' || ft.kind === 'obvod').map((ft) => (
      ft.kind === 'tee'
        ? `<circle cx="${ft.x.toFixed(2)}" cy="${ft.y.toFixed(2)}" r="0.032" fill="${ft.sys === 'T1' ? '#dc2626' : '#0284c7'}"/>`
        : `<circle cx="${ft.x.toFixed(2)}" cy="${ft.y.toFixed(2)}" r="0.052" fill="none" stroke="#0369a1" stroke-width="0.026"/>`
    )).join('')}
    ${flOv.radiators.map((r) => `
      <g transform="translate(${r.x.toFixed(3)},${r.y.toFixed(3)}) rotate(${((r.angleRad * 180) / Math.PI).toFixed(1)})">
        <rect x="${(-r.widthM * 0.5).toFixed(3)}" y="${(-r.depthM * 0.5).toFixed(3)}" width="${r.widthM.toFixed(3)}" height="${r.depthM.toFixed(3)}" fill="${r.kind === 'floor_convector' ? '#e0f2fe' : (r.kind === 'convector' ? '#fef3c7' : '#fee2e2')}" stroke="${r.kind === 'floor_convector' ? '#0369a1' : '#b91c1c'}" stroke-width="0.035"/>
      </g>
      <text x="${r.x.toFixed(2)}" y="${(r.y - 0.18).toFixed(2)}" text-anchor="middle" font-size="0.17" font-weight="800" fill="#991b1b">${escHtml(r.label)} · ${r.powerW}Вт</text>
    `).join('')}
    ${flOv.ventDucts.map((vd) => `
      <polyline points="${pts3dAttr(vd.pts3d)}" fill="none" stroke="${vd.sys === 'P1' ? '#0ea5e9' : '#16a34a'}" stroke-width="0.06" stroke-opacity="0.78"/>
    `).join('')}
    ${(flOv.fancoilPipes || []).map((fp) => `
      <polyline points="${pts3dAttr(fp.pts3d)}" fill="none" stroke="${fp.sys === 'T5' ? '#06b6d4' : '#6366f1'}" stroke-width="0.038" ${fp.sys === 'T6' ? 'stroke-dasharray="0.10,0.05"' : ''}/>
    `).join('')}
    ${(flOv.acUnits || []).map((ac) => `
      <rect x="${(ac.x - ac.wM * 0.5).toFixed(2)}" y="${(ac.y - ac.dM * 0.5).toFixed(2)}" width="${ac.wM.toFixed(2)}" height="${ac.dM.toFixed(2)}" rx="0.04" fill="#ecfeff" stroke="#0891b2" stroke-width="0.04"/>
      <text x="${ac.x.toFixed(2)}" y="${(ac.y + 0.05).toFixed(2)}" text-anchor="middle" font-size="0.18" font-weight="800" fill="#0e7490">${escHtml(ac.label)} · ${(ac.coolingW / 1000).toFixed(1)}кВт</text>
    `).join('')}
    ${flOv.ahuUnit ? `
      <rect x="${(flOv.ahuUnit.x - 0.55).toFixed(2)}" y="${(flOv.ahuUnit.y - 0.38).toFixed(2)}" width="1.10" height="0.76" rx="0.06" fill="#e0f2fe" stroke="#0369a1" stroke-width="0.045"/>
      <text x="${flOv.ahuUnit.x.toFixed(2)}" y="${flOv.ahuUnit.y.toFixed(2)}" text-anchor="middle" font-size="0.21" font-weight="800" fill="#0c4a6e">${escHtml(flOv.ahuUnit.label)}</text>
    ` : ''}
  ` : ''}

  <!-- ВК-1: Водоснабжение (В1/Т3/Т4) и Канализация (К1 с выносками уклона i=0,02 / 0,03) -->
  ${mode === 'vk' && flVk ? `
    ${flVk.pipes.map((vp) => {
      const col = vp.sys === 'B1' ? '#0284c7' : vp.sys === 'T3' ? '#dc2626' : vp.sys === 'T4' ? '#f59e0b' : '#7e22ce';
      const w = vp.sys === 'K1_110' ? '0.075' : vp.sys === 'K1_50' ? '0.05' : '0.038';
      return `<polyline points="${pts3dAttr(vp.pts3d)}" fill="none" stroke="${col}" stroke-width="${w}" ${vp.sys === 'T4' ? 'stroke-dasharray="0.10,0.05"' : ''}/>`;
    }).join('')}
    ${flVk.fixtures.map((fx) => `
      <circle cx="${fx.x.toFixed(2)}" cy="${fx.y.toFixed(2)}" r="0.16" fill="#f0f9ff" stroke="#0369a1" stroke-width="0.035"/>
      <text x="${fx.x.toFixed(2)}" y="${(fx.y + 0.06).toFixed(2)}" text-anchor="middle" font-size="0.16" font-weight="800" fill="#0f172a">${escHtml(fx.code)}</text>
    `).join('')}
    ${flVk.sewerRiserXY ? `
      <circle cx="${flVk.sewerRiserXY.x.toFixed(2)}" cy="${flVk.sewerRiserXY.y.toFixed(2)}" r="0.14" fill="#7e22ce"/>
      <text x="${(flVk.sewerRiserXY.x + 0.22).toFixed(2)}" y="${flVk.sewerRiserXY.y.toFixed(2)}" font-size="0.18" font-weight="800" fill="#6b21a8">Фановый стояк К1 Ø110 (+500 выше кровли, i=0,02)</text>
    ` : ''}
  ` : ''}

  <!-- GalfDesign 4-katakchali Xona shtamplari -->
  ${(floor.rooms || []).map((rm) => {
    const rh = flHeat?.rooms.find((x) => x.roomId === rm.id);
    const code = rh?.roomCode || '1.1';
    const tIn = rh?.tInC || 22;
    const qW = rh?.heatLossW || 0;
    return `
      <g transform="translate(${rm.labelX.toFixed(2)},${rm.labelY.toFixed(2)})">
        <rect x="-0.85" y="-0.38" width="1.70" height="0.76" rx="0.05" fill="rgba(255,255,255,0.92)" stroke="#334155" stroke-width="0.025"/>
        <line x1="-0.85" y1="-0.14" x2="0.85" y2="-0.14" stroke="#64748b" stroke-width="0.02"/>
        <line x1="0" y1="-0.38" x2="0" y2="-0.14" stroke="#64748b" stroke-width="0.02"/>
        <text x="-0.42" y="-0.21" text-anchor="middle" font-size="0.16" font-weight="800" fill="#334155">${escHtml(code)}</text>
        <text x="0.42" y="-0.21" text-anchor="middle" font-size="0.16" font-weight="800" fill="#059669">+${tIn}°C</text>
        <text x="0" y="0.07" text-anchor="middle" font-size="0.19" font-weight="800" fill="#0f172a">${escHtml(rm.name)}</text>
        <text x="0" y="0.29" text-anchor="middle" font-size="0.16" font-weight="700" fill="#0369a1">${qW} Вт · ${rm.areaM2.toFixed(1)} м²</text>
      </g>
    `;
  }).join('')}

  <!-- Gabarit o'lcham chiziqlari (mm) -->
  <line x1="${b.minX}" y1="${b.maxY + 0.55}" x2="${b.maxX}" y2="${b.maxY + 0.55}" stroke="#0f172a" stroke-width="0.025"/>
  <text x="${((b.minX + b.maxX) * 0.5).toFixed(2)}" y="${(b.maxY + 0.46).toFixed(2)}" text-anchor="middle" font-size="0.23" font-weight="700" fill="#0f172a">${Math.round(b.width * 1000)}</text>
  <line x1="${b.minX - 0.55}" y1="${b.minY}" x2="${b.minX - 0.55}" y2="${b.maxY}" stroke="#0f172a" stroke-width="0.025"/>
  <text x="${(b.minX - 0.65).toFixed(2)}" y="${((b.minY + b.maxY) * 0.5).toFixed(2)}" text-anchor="middle" font-size="0.23" font-weight="700" fill="#0f172a" transform="rotate(-90 ${(b.minX - 0.65).toFixed(2)} ${((b.minY + b.maxY) * 0.5).toFixed(2)})">${Math.round(b.height * 1000)}</text>
</svg>`.trim();
}

function wrapInGostA3Sheet({ sheetNo, totalSheets, cipher, projectTitle, siteAddress, sheetTitle, stage = 'Р', engineer = 'SPS AI ГИП', org = 'SPS Project · Climate House', bodyHtml }) {
  const dateStr = '11.26';
  return `
<section class="gost-a3-page">
  <div class="gost-a3-inner-frame">
    <div class="gost-archive-left">Инв. № подл. · Подп. и дата · Взам. инв. №</div>
    <div class="gost-canvas-area">${bodyHtml}</div>
    <table class="gost-stamp-f3">
      <tbody>
        <tr>
          <td style="width:10mm"></td><td style="width:10mm"></td><td style="width:10mm"></td><td style="width:10mm"></td>
          <td style="width:15mm"></td><td style="width:10mm"></td>
          <td colspan="3" style="text-align:center;font-weight:800;font-size:11px;">${escHtml(cipher)}</td>
        </tr>
        <tr>
          <td>Изм.</td><td>Кол.уч</td><td>Лист</td><td>№док.</td><td>Подп.</td><td>Дата</td>
          <td colspan="3" rowspan="3" style="text-align:center;font-weight:700;font-size:10.5px;">${escHtml(projectTitle)}<br/><span style="font-weight:400;font-size:9px;">${escHtml(siteAddress)}</span></td>
        </tr>
        <tr><td>Разраб.</td><td colspan="3" style="text-align:left;padding-left:3px;">${escHtml(engineer)}</td><td>SPS</td><td>${dateStr}</td></tr>
        <tr><td>Пров.</td><td colspan="3" style="text-align:left;padding-left:3px;">${escHtml(engineer)}</td><td>SPS</td><td>${dateStr}</td></tr>
        <tr>
          <td>ГИП</td><td colspan="3" style="text-align:left;padding-left:3px;">${escHtml(engineer)}</td><td>SPS</td><td>${dateStr}</td>
          <td rowspan="2" style="width:70mm;text-align:center;font-weight:800;font-size:10.5px;">${escHtml(sheetTitle)}</td>
          <td style="width:15mm;text-align:center;font-size:9px;">Стадия<br/><strong>${escHtml(stage)}</strong></td>
          <td style="width:18mm;text-align:center;font-size:9px;">Лист<br/><strong>${sheetNo}</strong></td>
          <td style="width:18mm;text-align:center;font-size:9px;">Листов<br/><strong>${totalSheets}</strong></td>
        </tr>
        <tr>
          <td>Н.контр.</td><td colspan="3"></td><td></td><td></td>
          <td colspan="3" style="text-align:center;font-weight:800;font-size:10px;color:#0369a1;">${escHtml(org)}</td>
        </tr>
      </tbody>
    </table>
  </div>
</section>`.trim();
}

/**
 * 9 varaqdan iborat TO'LIQ ISHCHI LOYIHA ALBOMI (ГОСТ Р 21.1101-2013 A3 + 1.0 Расчёты + GalfDesign Узлы)!
 */
export function generateGostAlbumSheets(project, suite, smeta, meta = {}) {
  const cipher = meta.cipher || 'SPS-2026-ОВВК-ТМ';
  const projectTitle = meta.projectTitle || project.title || 'Индивидуальный жилой дом';
  const siteAddress = meta.siteAddress || `${suite.heat.city.name} sh. (T_нар = ${suite.heat.city.tWinterC}°C)`;
  const engineer = meta.engineer || 'SPS AI ГИП';
  const org = meta.org || 'SPS Project · Climate House';
  const fl0 = project.floors[0];
  const flHeat0 = suite.heat.floors[0] || { rooms: [] };
  const flOv0 = suite.ov.floors[0] || { ufLoops: [], radiators: [] };

  // 17-ustunli Ograjeniya qatorlarini yig'ish (Лист ТЭ-1 uchun)
  const flatEnvRows = [];
  for (const rm of flHeat0.rooms) {
    (rm.envelopeRows || []).forEach((er, idx) => {
      flatEnvRows.push({ rm, er, isFirst: idx === 0, span: rm.envelopeRows.length });
    });
  }

  const sheets = [
    {
      id: 'OD-1',
      code: 'ОД-1',
      title: 'Общие данные. Конструкция пирога пола и наружных стен',
      cipher: `${cipher}-ОД`,
      bodyHtml: `
        <div style="padding:8px 12px;display:grid;grid-template-columns:1.08fr 1fr;gap:12px;font-size:9.8px;color:#0f172a;">
          <div>
            <h4 style="margin:0 0 4px;font-size:11px;text-transform:uppercase;">1. Ведомость рабочих чертежей комплекта (9 листов А3)</h4>
            <table class="gost-tbl" style="font-size:8.8px;">
              <thead><tr><th>Лист</th><th>Марка</th><th>Наименование листа</th><th>Примечание</th></tr></thead>
              <tbody>
                <tr><td>1</td><td>ОД-1</td><td>Общие данные. Состав пирога пола и наружной стены</td><td>КМК / СП</td></tr>
                <tr><td>2</td><td>АР-ТЭ</td><td>Обмерный план со штампами помещений (${fl0.name})</td><td>S = ${suite.heat.totalHeatedAreaM2} м²</td></tr>
                <tr><td>3</td><td>ТЭ-1</td><td>Расчёт теплопотерь по ограждающим конструкциям (17 граф)</td><td>Q = ${suite.heat.totalHeatLossKw} кВт</td></tr>
                <tr><td>4</td><td>ОВ-1</td><td>План водяного тёплого пола («Улитка») и балансировка Kv</td><td>${suite.ov.totalUfLoops} конт. (${suite.ov.totalUfPipeM} м)</td></tr>
                <tr><td>5</td><td>ОВ-2</td><td>План радиаторного отопления (Т1/Т2) и вентиляции (П1/В1)</td><td>Паспорт β1·β2·β3</td></tr>
                <tr><td>6</td><td>ВК-1</td><td>План водоснабжения (В1, Т3, Т4) и канализации (К1)</td><td>i=0,02..0,03</td></tr>
                <tr><td>7</td><td>УЗ-1</td><td>Монтажные узлы (Коллектор ТП · Радиатор 50мм · Ввод В1)</td><td>Узлы 1–3</td></tr>
                <tr><td>8</td><td>ТМ-1</td><td>Принципиальная схема котельной (S-Press · ZONT · Imrita)</td><td>${suite.tm.designBoilerKw} кВт</td></tr>
                <tr><td>9</td><td>СО-1</td><td>Спецификация оборудования и материалов ГОСТ 21.110-2013</td><td>Climate House</td></tr>
              </tbody>
            </table>

            <h4 style="margin:8px 0 4px;font-size:11px;text-transform:uppercase;">2. Основные расчётные показатели</h4>
            <table class="gost-tbl" style="font-size:8.8px;">
              <tbody>
                <tr><td>Расчётная температура наружного воздуха / грунта</td><td><strong>${escHtml(suite.heat.city.name)}: ${suite.heat.city.tWinterC} °C / грунт +${suite.heat.city.tGroundC} °C</strong></td></tr>
                <tr><td>Расчётные теплопотери / Холодопроизводительность</td><td><strong>${suite.heat.totalHeatLossW} Вт (${suite.heat.totalHeatLossKw} кВт) / ${suite.heat.totalCoolingKw} кВт</strong></td></tr>
                <tr><td>Теплоноситель радиаторов / тёплого пола</td><td><strong>${suite.ov.radSupplyTempC}/${suite.ov.radReturnTempC} °C · ТП ${suite.ov.ufSupplyTempC}/${suite.ov.ufReturnTempC} °C (Kvs=${suite.ov.mixingUnit.kvsRecommended})</strong></td></tr>
                <tr><td>Расход воды ХВС / ГВС (СП 30.13330)</td><td><strong>q_общ = ${suite.vk.designFlowTotalLs} л/с (${suite.vk.peakHourlyM3h} м³/ч), H_треб = ${suite.vk.requiredPressureBar} бар</strong></td></tr>
              </tbody>
            </table>
          </div>
          <div>
            ${renderConstructionPiesSvg(suite)}
            <h4 style="margin:8px 0 4px;font-size:11px;text-transform:uppercase;">3. Указания по монтажу (SPS Project + Galf стандарт)</h4>
            <ol style="margin:0;padding-left:15px;line-height:1.38;font-size:9px;">
              <li>Транзитные участки петель тёплого пола и подводки радиаторов Т1/Т2 прокладывать в <strong>теплоизоляции Energoflex Super 18×6 мм (подача — красная, обратка — синяя)</strong> во избежание локального перегрева стяжки и паразитных теплопотерь.</li>
              <li>По всему периметру помещений и вокруг колонн до заливки стяжки уложить <strong>демпферную ленту 10×150 мм</strong>. Максимальная температура поверхности пола в жилых зонах — не выше <strong>+29,0 °C</strong> (в санузлах — до +31,0 °C).</li>
              <li>Балансировку коллектора ТП произвести расходомерами (л/мин) и настройкой клапанов <strong>Kv</strong> согласно ведомости на листе ОВ-1.</li>
              <li>Горизонтальные участки безнапорной канализации К1 монтировать с уклоном <strong>i = 0,02 (Ø110)</strong> и <strong>i = 0,03 (Ø50)</strong> только косыми тройниками и отводами 2×45°. Фановый стояк вывести на +500 мм выше кровли.</li>
            </ol>
          </div>
        </div>`,
    },
    {
      id: 'AR-TE',
      code: 'АР-ТЭ',
      title: `Обмерный план (${fl0.name}) и баланс отопления по помещениям`,
      cipher: `${cipher}-АР`,
      bodyHtml: `
        <div style="display:grid;grid-template-columns:1.26fr 1fr;gap:10px;padding:8px;height:100%;align-items:start;">
          <div>${renderFloorPlanDisciplineSvg(fl0, suite, 'heat')}</div>
          <div>
            <h4 style="margin:0 0 5px;font-size:10.5px;">ВЕДОМОСТЬ ПОМЕЩЕНИЙ И БАЛАНСА ОТОПЛЕНИЯ (${escHtml(suite.heat.city.name)} ${suite.heat.city.tWinterC}°C)</h4>
            <table class="gost-tbl" style="font-size:8.4px;">
              <thead><tr><th>№</th><th>Помещение</th><th>S, м²</th><th>t_вн</th><th>Q_пот, Вт</th><th>ТП + Рад, Вт</th><th>Баланс ΔQ</th></tr></thead>
              <tbody>
                ${flHeat0.rooms.map((r) => {
                  const rb = (flOv0.roomBalances || []).find((b) => b.roomId === r.roomId);
                  const instW = rb ? rb.installedW : 0;
                  const dW = instW - r.heatLossW;
                  const bad = rb?.hasDeficit;
                  return `
                  <tr style="${bad ? 'background:#fef2f2;' : ''}">
                    <td><strong>${escHtml(r.roomCode)}</strong></td><td>${escHtml(r.roomName)}</td><td>${r.areaM2}</td><td>+${r.tInC}°C</td>
                    <td><strong>${r.heatLossW}</strong></td>
                    <td>${rb ? `${instW} (${rb.ufOutputW}+${rb.radOutputW})` : '—'}</td>
                    <td style="color:${bad ? '#b91c1c' : '#15803d'};font-weight:700;">${suite.ov.heatingScheme === 'none' ? '—' : `${dW >= 0 ? `+${dW}` : dW} Вт${bad ? ' ⚠' : ''}`}</td>
                  </tr>
                `;
                }).join('')}
                <tr><td colspan="2"><strong>ИТОГО по этажу</strong></td><td><strong>${suite.heat.totalHeatedAreaM2}</strong></td><td>—</td><td><strong>${flHeat0.floorHeatLossW} Вт</strong></td><td colspan="2"><strong>Уд. потери: ${suite.heat.avgSpecificWm2} Вт/м²</strong></td></tr>
              </tbody>
            </table>
            ${suite.ov.hasHeatingDeficit ? `<div style="margin-top:6px;padding:4px 6px;border:1px solid #dc2626;background:#fef2f2;color:#991b1b;font-size:8.4px;font-weight:700;">⚠ ВНИМАНИЕ: Обнаружен дефицит тепловой мощности (${suite.ov.totalDeficitW} Вт) в помещениях: ${suite.ov.deficitRooms.map((d) => `${escHtml(d.roomName)} (−${d.deficitW} Вт)`).join(', ')}.</div>` : ''}
          </div>
        </div>`,
    },
    {
      id: 'TE-1',
      code: 'ТЭ-1',
      title: `Расчёт теплопотерь по ограждающим конструкциям (17 граф · ${fl0.name})`,
      cipher: `${cipher}-ТЭ1`,
      bodyHtml: `
        <div style="padding:7px 10px;">
          <h4 style="margin:0 0 5px;font-size:10.5px;">ТАБЛИЦА РАСЧЁТА ТЕПЛОПОТЕРЬ ЧЕРЕЗ ОГРАЖДАЮЩИЕ КОНСТРУКЦИИ (t_нар = ${suite.heat.city.tWinterC} °C, КМК 2.04.05-97 / СП 50.13330)</h4>
          <table class="gost-tbl" style="font-size:8.2px;">
            <thead>
              <tr>
                <th>№ пом</th><th>Помещение (t_вн)</th><th>Огр.</th><th>Ор.</th><th>a, м</th><th>b, м</th>
                <th>A_бр, м²</th><th>A_выч</th><th>A_расч</th><th>R₀</th><th>U</th><th>Δt, °C</th>
                <th>Q_осн, Вт</th><th>β_ор</th><th>β_доп</th><th>Q_огр, Вт</th><th>Q_инф / Q_общ, Вт</th>
              </tr>
            </thead>
            <tbody>
              ${flatEnvRows.slice(0, 26).map(({ rm, er, isFirst, span }) => `
                <tr>
                  <td>${isFirst ? `<strong>${escHtml(rm.roomCode)}</strong>` : ''}</td>
                  <td>${isFirst ? `<strong>${escHtml(rm.roomName)}</strong> (+${rm.tInC}°C)` : ''}</td>
                  <td>${escHtml(er.code)} (${escHtml(er.name)})</td>
                  <td>${escHtml(er.orient)}</td>
                  <td>${er.dimA}</td><td>${er.dimB}</td>
                  <td>${er.grossArea}</td><td>${er.deductArea || '—'}</td><td><strong>${er.netArea}</strong></td>
                  <td>${er.rVal}</td><td>${er.uVal}</td><td>${er.dT}</td>
                  <td>${er.qBaseW}</td><td>${er.betaOrient}</td><td>${er.betaExtra}</td>
                  <td><strong>${er.qTotalW}</strong></td>
                  <td>${isFirst ? `Инф: ${rm.qInfiltrationW} · <strong>Σ ${rm.heatLossW} Вт</strong> (span:${span})` : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`,
    },
    {
      id: 'OV-1',
      code: 'ОВ-1',
      title: `План водяного тёплого пола («Улитка») и ведомость балансировки Kv · ${fl0.name}`,
      cipher: `${cipher}-ОВ1`,
      bodyHtml: `
        <div style="display:grid;grid-template-columns:1.25fr 1.05fr;gap:9px;padding:8px;height:100%;align-items:start;">
          <div>${renderFloorPlanDisciplineSvg(fl0, suite, 'ov_tp')}</div>
          <div>
            <h4 style="margin:0 0 4px;font-size:10.5px;">ВЕДОМОСТЬ КОНТУРОВ ТП — ${escHtml(flOv0.tpCollector?.label || 'ШРВ-1')} (${suite.ov.ufSupplyTempC}/${suite.ov.ufReturnTempC} °C)</h4>
            <table class="gost-tbl" style="font-size:8.4px;">
              <thead>
                <tr>
                  <th>№</th><th>Помещение</th><th>Шаг</th><th>S, м²</th><th>L_общ (тр.), м</th>
                  <th>t° пола</th><th>Q, Вт</th><th>G, л/м</th><th>ΔP, м.в.ст</th><th>Kv</th>
                </tr>
              </thead>
              <tbody>
                ${flOv0.ufLoops.map((lp) => `
                  <tr style="${lp.isIndexLoop ? 'background:#fef3c7;' : ''}">
                    <td><strong>${escHtml(lp.label)}${lp.isIndexLoop ? '*' : ''}</strong></td>
                    <td>${escHtml(lp.roomName)}</td>
                    <td>${lp.stepMm}</td>
                    <td>${lp.areaM2}</td>
                    <td><strong>${lp.lengthM}</strong> (${lp.transitLenM})</td>
                    <td>${lp.surfaceTempC}°C</td>
                    <td>${lp.outputW}</td>
                    <td><strong>${lp.flowLmin}</strong></td>
                    <td>${lp.dpMWc}</td>
                    <td><strong>${lp.kvSetting}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="margin-top:5px;font-size:8.5px;color:#334155;">
              <strong>* Индексная (диктующая) петля.</strong> Смесительный узел ТП: α = ${suite.ov.mixingUnit.alpha}, клапан Kvs = <strong>${suite.ov.mixingUnit.kvsRecommended} м³/ч</strong>, напор насоса H = <strong>${suite.ov.mixingUnit.pumpHeadM} м.в.ст.</strong> (${escHtml(suite.ov.mixingUnit.recommendedPumpModel)}).
            </div>
          </div>
        </div>`,
    },
    {
      id: 'OV-2',
      code: 'ОВ-2',
      title: `План радиаторного отопления (Т1/Т2) и вентиляции (П1/В1) · ${fl0.name}`,
      cipher: `${cipher}-ОВ2`,
      bodyHtml: `
        <div style="display:grid;grid-template-columns:1.28fr 1fr;gap:9px;padding:8px;height:100%;align-items:start;">
          <div>${renderFloorPlanDisciplineSvg(fl0, suite, 'ov_rad_vent')}</div>
          <div>
            <h4 style="margin:0 0 4px;font-size:10.5px;">ПАСПОРТНАЯ ВЕДОМОСТЬ ПРИБОРОВ (${suite.ov.radSupplyTempC}/${suite.ov.radReturnTempC} °C · пересчёт 1.0)</h4>
            <table class="gost-tbl" style="font-size:8.4px;">
              <thead>
                <tr><th>Марка</th><th>Помещение</th><th>Модель / Тип</th><th>ΔT</th><th>β1/β2/β3</th><th>Q_факт, Вт</th><th>G, л/м</th></tr>
              </thead>
              <tbody>
                ${flOv0.radiators.map((r) => `
                  <tr>
                    <td><strong>${escHtml(r.label)}</strong></td>
                    <td>${escHtml(r.roomName)}</td>
                    <td>${escHtml(r.model)}</td>
                    <td>${r.deltaT ?? 40}°</td>
                    <td>${r.beta1 ?? 1}/${r.beta2 ?? 1}/${r.beta3 ?? 1}</td>
                    <td><strong>${r.powerW}</strong></td>
                    <td>${r.flowLpm ?? 0.8}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <p style="font-size:8.5px;margin-top:6px;color:#334155;line-height:1.45;">
              <strong>Трубопроводы Т1/Т2:</strong> ${String(suite.ov.trunkPipeFamilyId || '').includes('ppr') ? 'Pro Aqua PP-R RUBIS SDR 7.4' : 'TE-SA PE-Xb/Al/PE-Xb + пресс-фитинги CW617N/AISI 304'} (${(suite.ov.pipeTotalsBySize || []).map((p) => `${p.sizeLabel}: ${p.lengthM}м`).join(', ') || '—'}) · Насос контура: <strong>${escHtml(suite.ov.radPumpSelection?.fullLabel || 'Grundfos UPS 25/4 (NS-01636)')}</strong>.<br/>
              <strong>Подключение приборов:</strong> ${suite.ov.radFeedMount === 'floor' ? 'из пола (прямой бинокль 50 мм с розетками)' : 'из стены в штрабе (угловой бинокль 50 мм с двойной розеткой)'}.<br/>
              <strong>Вентиляция (П1/В1):</strong> ${escHtml(flOv0.ahuUnit?.model || 'Естественная')} · Приток ∑П1 = <strong>+${suite.ov.totalVentSupplyM3h || 0} м³/ч</strong>, Вытяжка ∑В1 = <strong>−${suite.ov.totalVentExhaustM3h || 0} м³/ч</strong>.
            </p>
          </div>
        </div>`,
    },
    {
      id: 'VK-1',
      code: 'ВК-1',
      title: `План систем водоснабжения (В1, Т3, Т4) и канализации (К1) · ${fl0.name}`,
      cipher: `${cipher}-ВК`,
      bodyHtml: `
        <div style="display:grid;grid-template-columns:1.35fr 0.9fr;gap:10px;padding:8px;height:100%;align-items:start;">
          <div>${renderFloorPlanDisciplineSvg(fl0, suite, 'vk')}</div>
          <div>
            <h4 style="margin:0 0 5px;font-size:11px;">ГИДРАВЛИЧЕСКИЕ ДАННЫЕ СИСТЕМ В1, Т3, Т4, К1</h4>
            <table class="gost-tbl">
              <tbody>
                <tr><td>Сантехнических приборов (N)</td><td><strong>${suite.vk.fixturesCount} шт.</strong></td></tr>
                <tr><td>Расчётный расход общий / ХВС / ГВС</td><td><strong>${suite.vk.designFlowTotalLs} / ${suite.vk.designFlowColdLs} / ${suite.vk.designFlowHotLs} л/с</strong></td></tr>
                <tr><td>Водомерный узел ввода В1</td><td><strong>Счётчик DN${suite.vk.meterDn} + Imrita IMT-M4 (FL-00303)</strong></td></tr>
                <tr><td>Уклон магистрали К1 Ø110 / отводов Ø50</td><td><strong>i = 0,02 (2 см/м) / i = 0,03 (3 см/м)</strong></td></tr>
                <tr><td>Длина труб В1 / Т3+Т4 / К1</td><td><strong>${suite.vk.totalColdPipeM} м / ${round2(suite.vk.totalHotPipeM + suite.vk.totalRecircPipeM)} м / ${round2(suite.vk.totalSewer110M + suite.vk.totalSewer50M)} м</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>`,
    },
    {
      id: 'UZ-1',
      code: 'УЗ-1',
      title: 'Монтажные узлы систем ОВ и ВК (Коллектор ТП · Радиатор 50 мм · Ввод воды В1)',
      cipher: `${cipher}-УЗ1`,
      bodyHtml: renderMontajnieUzliSheetSvg(suite),
    },
    {
      id: 'TM-1',
      code: 'ТМ-1',
      title: 'Принципиальная тепломеханическая схема котельной (ТМ · Расчёт ГС, РБ и БКН)',
      cipher: `${cipher}-ТМ`,
      bodyHtml: `<div style="padding:8px 10px;">${renderTmPrincipleSchemeSvg(suite.tm, true)}</div>`,
    },
    {
      id: 'SO-1',
      code: 'СО-1',
      title: `Спецификация оборудования, изделий и материалов ГОСТ 21.110-2013 (${smeta.rows.length} поз.)`,
      cipher: `${cipher}-СО`,
      bodyHtml: (() => {
        const renderSpecChunk = (chunk) => `
          <table class="gost-tbl" style="font-size:${smeta.rows.length > 26 ? '7.2px' : '8.2px'};">
            <thead>
              <tr>
                <th style="width:18px">П.</th><th>Наименование и тех. характеристика</th>
                <th>Код CH</th><th>Бренд</th><th>Ед.</th><th>Кол.</th>
              </tr>
            </thead>
            <tbody>
              ${chunk.map((r) => `
                <tr>
                  <td>${r.pos}</td><td>${escHtml(r.name)}</td>
                  <td><strong>${escHtml(r.skuCode)}</strong></td><td>${escHtml(r.brand)}</td>
                  <td>${escHtml(r.unit)}</td><td><strong>${r.qty}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>`;
        if (smeta.rows.length > 24) {
          const mid = Math.ceil(smeta.rows.length / 2);
          return `<div style="padding:5px 8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start;">
            <div>${renderSpecChunk(smeta.rows.slice(0, mid))}</div>
            <div>${renderSpecChunk(smeta.rows.slice(mid))}</div>
          </div>`;
        }
        return `<div style="padding:6px 10px;">${renderSpecChunk(smeta.rows)}</div>`;
      })(),
    },
  ];

  return sheets.map((sh, i) => ({
    ...sh,
    sheetNo: i + 1,
    totalSheets: sheets.length,
    fullPageHtml: wrapInGostA3Sheet({
      sheetNo: i + 1,
      totalSheets: sheets.length,
      cipher: sh.cipher,
      projectTitle,
      siteAddress,
      sheetTitle: sh.title,
      engineer,
      org,
      bodyHtml: sh.bodyHtml,
    }),
  }));
}

export function buildPrintableGostAlbumDocumentHtml(sheets, projectTitle = 'SPS Project Рабочий Альбом') {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>${escHtml(projectTitle)} — Рабочий проект ОВ·ВК·ТМ (ГОСТ А3 · SPS Project v2.8.0)</title>
  <style>
    @page { size: A3 landscape; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #cbd5e1; font-family: Arial, sans-serif; color: #0f172a; }
    .gost-a3-page {
      width: 420mm; height: 297mm; background: #ffffff; margin: 6mm auto;
      position: relative; page-break-after: always; overflow: hidden;
      box-shadow: 0 6px 24px rgba(0,0,0,0.18);
    }
    @media print {
      body { background: #ffffff; }
      .gost-a3-page { margin: 0; box-shadow: none; }
      .no-print { display: none !important; }
    }
    .gost-a3-inner-frame {
      position: absolute; left: 20mm; top: 5mm; right: 5mm; bottom: 5mm;
      border: 0.7mm solid #0f172a; display: flex; flex-direction: column;
    }
    .gost-archive-left {
      position: absolute; left: -14mm; bottom: 35mm; transform: rotate(-90deg); transform-origin: left bottom;
      font-size: 8px; color: #334155; border: 1px solid #334155; padding: 2px 8px;
    }
    .gost-canvas-area { flex: 1; overflow: hidden; padding-bottom: 56mm; }
    .gost-stamp-f3 {
      position: absolute; right: 0; bottom: 0; width: 185mm; height: 55mm;
      border-collapse: collapse; background: #ffffff; font-size: 9px;
    }
    .gost-stamp-f3 td { border: 0.4mm solid #0f172a; padding: 1px 3px; text-align: center; }
    .gost-tbl { width: 100%; border-collapse: collapse; font-size: 9px; }
    .gost-tbl th, .gost-tbl td { border: 1px solid #334155; padding: 2.2px 4px; text-align: left; }
    .gost-tbl th { background: #f1f5f9; font-weight: 700; }
  </style>
</head>
<body>
  <div class="no-print" style="position:sticky;top:0;z-index:99;background:#0f172a;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;">
    <strong>📐 SPS Project v2.8.0 — ГОСТ Р 21.1101 Альбом рабочих чертежей (${sheets.length} листов А3)</strong>
    <button onclick="window.print()" style="background:#0788F5;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-weight:700;cursor:pointer;">🖨 PDF Сақлаш / Печать (A3 Landscape)</button>
  </div>
  ${sheets.map((s) => s.fullPageHtml).join('\n')}
</body>
</html>`;
}
