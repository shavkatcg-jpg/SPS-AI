/**
 * SPS Project 2.0 — Rasmiy «Climate House» Tovarlar va Kodlar Bazasi (3 790 ta pozitsiya)
 *
 * Manbalar (100% tasdiqlangan lokal hujjatlar, taxminsiz!):
 * 1) Коды товаров Climate House 12.11.2026.xlsx — 3 787 ta rasmiy «Код CH», «Артикул», «Бренд», «Раздел»;
 * 2) Telegram «Общие вопросы» (Sanjar / Climate House): ZONT avtomatika praesi, 8784A uch xodli klapan ($16..$30),
 *    7200 / 7200S sharovoy kranli nerjaveyka kollektorlar 2..15 vyx. ($18..$120);
 * 3) IMRITA Price_17.03.2026.pdf — Imrita suv tozalash va akvastop tizimlari ulgurji/chakana ($) narxlari;
 * 4) S-PRESS and HOMEBASE PRICE_1.png — SS304 nerjaveyka quvur va press-fitinglar ulgurji ($) narxlari.
 *
 * QAT'IY QOIDA: Tasdiqlangan praesda yo'q pozitsiyalarga sun'iy narx qo'yilmaydi (`priceUsd: null`).
 */

import rawSkus from './climate-house-skus.json' with { type: 'json' };

// 1. Telegram screenshotdan tasdiqlangan ZONT ulgurji narxlari (Артикул производителя bo'yicha 1:1)
const ZONT_WHOLESALE_BY_ARTICLE = Object.freeze({
  ML00005696: 200.00, // ZE-44
  ML00005693: 215.00, // ZE-88
  ML00007503: 96.00,  // ZE-99
  ML00005145: 78.00,  // ZRE-66
  ML00007406: 96.00,  // EX-108
  ML00005653: 80.00,  // Адаптер цифровых шин ECO
  ML00005505: 85.00,  // Адаптер цифровых шин DIN
  ML00004837: 14.00,  // МЛ-771 / 774 DS уличный
  ML00004834: 14.00,  // МЛ-774 NTC комнатный
  ML00005144: 40.00,  // МЛ-779 RS-485
  ML00003614: 14.00,  // DS18B20 в гильзе
  ML00005518: 70.00,  // Датчик давления MLD 4-20 мА
  ML00005517: 90.00,  // Датчик давления MLD-10.01
  ML11025: 17.00,     // АСТРА-361 извещатель утечки воды
  ML00007554: 60.00,  // МЛ-595 радиомодуль
  ML00007067: 53.00,  // МЛ-620 репитер
  ML00007555: 87.00,  // МЛ-720 / 731 радиореле
  ML00007377: 55.00,  // МЛ-714 радиопередатчик
  ML00004436: 49.00,  // МЛ-740 радиотермодатчик комнатный
  ML00004439: 65.00,  // МЛ-745 радиодатчик температуры и влажности
  ML00005372: 55.00,  // МЛ-785 / 755 радиодатчик теплоносителя
  ML13866: 60.00,     // МЛ-711 радиотермодатчик уличный
  ML14053: 63.00,     // МЛ-712 радиодатчик протечки воды
  ML12814: 60.00,     // МЛ-570 радиодатчик движения
  ML00004742: 127.00, // Панель ручного управления МЛ-753
  ML00006132: 144.00, // Панель ручного управления МЛ-753 WiFi
  ML00006088: 98.00,  // Термостат комнатный МЛ-232 (RS-485)
  ML00006509: 98.00,  // Термостат комнатный МЛ-232.black (RS-485)
  ML00006557: 97.00,  // Термостат комнатный МЛ-332 (868)
  ML00006089: 97.00,  // Термостат комнатный МЛ-332.black (868)
});

// 2. Код CH bo'yicha tasdiqlangan ulgurji ($) narxlar (7200S kollektorlar, 8784A klapan, IMRITA filtrlar)
const VERIFIED_PRICE_BY_CODE = Object.freeze({
  // Climate House 7200 / 7200S (1" 2..15 выходов, опт цена — Telegram Sanjar)
  'TP-02454': { wholesale: 18.00, alias: '7200S 1"-2ways', src: 'Telegram CH (7200S опт)' },
  'TP-02455': { wholesale: 24.00, alias: '7200S 1"-3ways', src: 'Telegram CH (7200S опт)' },
  'TP-02456': { wholesale: 32.00, alias: '7200S 1"-4ways', src: 'Telegram CH (7200S опт)' },
  'TP-02457': { wholesale: 40.00, alias: '7200S 1"-5ways', src: 'Telegram CH (7200S опт)' },
  'TP-02458': { wholesale: 48.00, alias: '7200S 1"-6ways', src: 'Telegram CH (7200S опт)' },
  'TP-02459': { wholesale: 56.00, alias: '7200S 1"-7ways', src: 'Telegram CH (7200S опт)' },
  'TP-02460': { wholesale: 64.00, alias: '7200S 1"-8ways', src: 'Telegram CH (7200S опт)' },
  'TP-02461': { wholesale: 72.00, alias: '7200S 1"-9ways', src: 'Telegram CH (7200S опт)' },
  'TP-02448': { wholesale: 80.00, alias: '7200S 1"-10ways', src: 'Telegram CH (7200S опт)' },
  'TP-02449': { wholesale: 88.00, alias: '7200S 1"-11ways', src: 'Telegram CH (7200S опт)' },
  'TP-02450': { wholesale: 96.00, alias: '7200S 1"-12ways', src: 'Telegram CH (7200S опт)' },
  'TP-02451': { wholesale: 104.00, alias: '7200S 1"-13ways', src: 'Telegram CH (7200S опт)' },
  'TP-02452': { wholesale: 112.00, alias: '7200S 1"-14ways', src: 'Telegram CH (7200S опт)' },
  'TP-02453': { wholesale: 120.00, alias: '7200S 1"-15ways', src: 'Telegram CH (7200S опт)' },

  // Climate House 8784 / 8784A 3-xodovoy klapan 1" (Telegram Sanjar)
  'MT-01276': { wholesale: 16.00, alias: '8784A 1"', src: 'Telegram CH (8784A опт)' },

  // C.HOUSE price (2).pdf — PRO AQUA PE-RT, PP-R (RUBIS / ХВС / Центрофольга) va Канализация
  'TP-02488': { wholesale: 0.88, src: 'C.HOUSE price (2).pdf' },
  'TP-02489': { wholesale: 1.52, src: 'C.HOUSE price (2).pdf' },
  'TP-02490': { wholesale: 0.39, src: 'C.HOUSE price (2).pdf' },
  'TP-02491': { wholesale: 0.39, src: 'C.HOUSE price (2).pdf' },
  'TR-02639': { wholesale: 26.75, src: 'C.HOUSE price (2).pdf' },
  'TR-02640': { wholesale: 0.87, src: 'C.HOUSE price (2).pdf' },
  'TR-02641': { wholesale: 1.29, src: 'C.HOUSE price (2).pdf' },
  'TR-02642': { wholesale: 2.04, src: 'C.HOUSE price (2).pdf' },
  'TR-02643': { wholesale: 3.18, src: 'C.HOUSE price (2).pdf' },
  'TR-02644': { wholesale: 5.48, src: 'C.HOUSE price (2).pdf' },
  'TR-02645': { wholesale: 8.65, src: 'C.HOUSE price (2).pdf' },
  'TR-02646': { wholesale: 11.77, src: 'C.HOUSE price (2).pdf' },
  'TR-02647': { wholesale: 16.98, src: 'C.HOUSE price (2).pdf' },
  'TR-02648': { wholesale: 0.84, src: 'C.HOUSE price (2).pdf' },
  'TR-02649': { wholesale: 1.40, src: 'C.HOUSE price (2).pdf' },
  'TR-02650': { wholesale: 2.32, src: 'C.HOUSE price (2).pdf' },
  'TR-02651': { wholesale: 3.61, src: 'C.HOUSE price (2).pdf' },
  'TR-02652': { wholesale: 5.93, src: 'C.HOUSE price (2).pdf' },
  'TR-02653': { wholesale: 9.37, src: 'C.HOUSE price (2).pdf' },
  'TR-02654': { wholesale: 1.37, src: 'C.HOUSE price (2).pdf' },
  'TR-02655': { wholesale: 2.00, src: 'C.HOUSE price (2).pdf' },
  'TR-02656': { wholesale: 3.61, src: 'C.HOUSE price (2).pdf' },
  'TR-02657': { wholesale: 5.49, src: 'C.HOUSE price (2).pdf' },
  'TR-02658': { wholesale: 8.39, src: 'C.HOUSE price (2).pdf' },
  'TR-03146': { wholesale: 5.31, src: 'C.HOUSE price (2).pdf' },
  'TR-03147': { wholesale: 8.53, src: 'C.HOUSE price (2).pdf' },
  'TR-03148': { wholesale: 2.41, src: 'C.HOUSE price (2).pdf' },
  'TR-03149': { wholesale: 13.45, src: 'C.HOUSE price (2).pdf' },
  'TR-03150': { wholesale: 3.44, src: 'C.HOUSE price (2).pdf' },
  'TR-03151': { wholesale: 1.32, src: 'C.HOUSE price (2).pdf' },
  'TR-03152': { wholesale: 0.66, src: 'C.HOUSE price (2).pdf' },
  'TR-03153': { wholesale: 2.35, src: 'C.HOUSE price (2).pdf' },
  'TR-03154': { wholesale: 0.76, src: 'C.HOUSE price (2).pdf' },
  'TR-03155': { wholesale: 0.96, src: 'C.HOUSE price (2).pdf' },
  'TR-03156': { wholesale: 1.59, src: 'C.HOUSE price (2).pdf' },
  'TR-03157': { wholesale: 0.77, src: 'C.HOUSE price (2).pdf' },
  'TR-03158': { wholesale: 2.88, src: 'C.HOUSE price (2).pdf' },
  'TR-03159': { wholesale: 0.89, src: 'C.HOUSE price (2).pdf' },
  'TR-03160': { wholesale: 1.16, src: 'C.HOUSE price (2).pdf' },
  'TR-03161': { wholesale: 1.86, src: 'C.HOUSE price (2).pdf' },
  'TR-03162': { wholesale: 3.17, src: 'C.HOUSE price (2).pdf' },
  'TR-03163': { wholesale: 0.91, src: 'C.HOUSE price (2).pdf' },
  'TR-03164': { wholesale: 4.73, src: 'C.HOUSE price (2).pdf' },
  'TR-03165': { wholesale: 1.18, src: 'C.HOUSE price (2).pdf' },
  'TR-03166': { wholesale: 3.45, src: 'C.HOUSE price (2).pdf' },
  'TR-03167': { wholesale: 4.87, src: 'C.HOUSE price (2).pdf' },
  'TR-03168': { wholesale: 6.19, src: 'C.HOUSE price (2).pdf' },
  'TR-03169': { wholesale: 1.46, src: 'C.HOUSE price (2).pdf' },
  'TR-03170': { wholesale: 8.75, src: 'C.HOUSE price (2).pdf' },
  'TR-03171': { wholesale: 1.97, src: 'C.HOUSE price (2).pdf' },
  'TR-03205': { wholesale: 6.57, src: 'C.HOUSE price (2).pdf' },
  'TR-03206': { wholesale: 11.54, src: 'C.HOUSE price (2).pdf' },
  'TR-03207': { wholesale: 18.32, src: 'C.HOUSE price (2).pdf' },
  'TR-03208': { wholesale: 3.93, src: 'C.HOUSE price (2).pdf' },
  'TR-03209': { wholesale: 13.72, src: 'C.HOUSE price (2).pdf' },
  'TR-03210': { wholesale: 25.66, src: 'C.HOUSE price (2).pdf' },
  'TR-03211': { wholesale: 35.85, src: 'C.HOUSE price (2).pdf' },
  'TR-03212': { wholesale: 8.07, src: 'C.HOUSE price (2).pdf' },
  'TR-03213': { wholesale: 22.96, src: 'C.HOUSE price (2).pdf' },
  'TR-03214': { wholesale: 41.76, src: 'C.HOUSE price (2).pdf' },
  'TR-03215': { wholesale: 60.40, src: 'C.HOUSE price (2).pdf' },
  'TR-03216': { wholesale: 14.45, src: 'C.HOUSE price (2).pdf' },

  // IMRITA Price_17.03.2026.pdf (Оптовая / Розничная $)
  'FL-00257': { wholesale: 15.00, retail: 17.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00258': { wholesale: 15.00, retail: 17.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00259': { wholesale: 180.00, retail: 207.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00260': { wholesale: 180.00, retail: 207.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00261': { wholesale: 31.00, retail: 36.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00262': { wholesale: 20.00, retail: 23.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00263': { wholesale: 29.00, retail: 33.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00264': { wholesale: 35.00, retail: 40.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00265': { wholesale: 33.00, retail: 38.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00266': { wholesale: 42.00, retail: 48.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00267': { wholesale: 120.00, retail: 130.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00268': { wholesale: 117.00, retail: 135.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00269': { wholesale: 42.00, retail: 48.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00270': { wholesale: 35.00, retail: 40.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00271': { wholesale: 27.00, retail: 31.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00272': { wholesale: 25.00, retail: 31.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00273': { wholesale: 30.00, retail: 40.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00274': { wholesale: 156.00, retail: 170.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00275': { wholesale: 210.00, retail: 225.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00276': { wholesale: 190.00, retail: 205.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00277': { wholesale: 45.00, retail: 52.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00278': { wholesale: 36.00, retail: 41.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00279': { wholesale: 36.00, retail: 41.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00280': { wholesale: 50.00, retail: 58.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00281': { wholesale: 43.00, retail: 49.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00282': { wholesale: 27.00, retail: 31.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00283': { wholesale: 2800.00, retail: 3000.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00284': { wholesale: 447.00, retail: 514.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00285': { wholesale: 653.00, retail: 751.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00286': { wholesale: 936.00, retail: 1076.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00287': { wholesale: 878.00, retail: 1010.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00288': { wholesale: 260.00, retail: 299.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00289': { wholesale: 300.00, retail: 345.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00290': { wholesale: 400.00, retail: 450.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00291': { wholesale: 495.00, retail: 570.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00292': { wholesale: 495.00, retail: 570.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00293': { wholesale: 610.00, retail: 650.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00294': { wholesale: 724.00, retail: 880.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00295': { wholesale: 724.00, retail: 880.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00296': { wholesale: 79.00, retail: 91.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00297': { wholesale: 269.00, retail: 309.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00298': { wholesale: 400.00, retail: 460.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00299': { wholesale: 390.00, retail: 449.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00300': { wholesale: 410.00, retail: 472.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00301': { wholesale: 269.00, retail: 309.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00302': { wholesale: 36.00, retail: 41.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00303': { wholesale: 86.00, retail: 99.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00304': { wholesale: 111.00, retail: 128.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00305': { wholesale: 135.00, retail: 155.00, src: 'IMRITA Price 17.03.2026' },
  'FL-00306': { wholesale: 184.00, retail: 212.00, src: 'IMRITA Price 17.03.2026' },
});

// 3. S-PRESS & HOMEBASE SS304 nerjaveyka ulgurji narxlari (S-PRESS and HOMEBASE PRICE_1.png)
const SPRESS_WHOLESALE_BY_ARTICLE = Object.freeze({
  'HB-N00002': 5.10, 'HB-N00003': 7.20, 'HB-N00004': 9.20, 'HB-N00005': 13.50,
  'HB-N00006': 16.50, 'HB-N00007': 21.20, 'HB-N00008': 31.00, 'HB-N00009': 41.00, 'HB-N00010': 48.00,
  'CH-N01001': 1.90, 'CH-N01002': 2.20, 'CH-N01003': 3.10, 'CH-N01004': 4.20,
  'CH-N01005': 6.30, 'CH-N01006': 7.90, 'CH-N01007': 20.00, 'CH-N01008': 24.00, 'CH-N01009': 32.00,
  'HB-F19002': 2.00, 'HB-F19003': 2.40, 'HB-F19004': 3.00, 'HB-F19005': 4.00,
  'HB-F19006': 5.00, 'HB-F19007': 6.00, 'HB-F19008': 20.00, 'HB-F19009': 23.00, 'HB-F19010': 35.00,
  'HB-B07002': 2.40, 'HB-B07003': 3.80, 'HB-B07004': 5.60, 'HB-B07005': 7.70,
  'HB-B07006': 11.80, 'HB-B07007': 15.40, 'HB-B07008': 30.00, 'HB-B07009': 40.00, 'HB-B07010': 50.00,
  'HB-B14002': 3.40, 'HB-B14003': 4.40, 'HB-B14004': 5.70, 'HB-B14005': 12.40,
  'HB-B14006': 16.50, 'HB-B14007': 19.40, 'HB-B14008': 30.00, 'HB-B14009': 40.00, 'HB-B14010': 50.00,
  'CH-N13001': 3.50, 'CH-N13002': 4.50, 'CH-N13003': 5.60, 'CH-N13004': 6.40,
  'CH-N13005': 9.50, 'CH-N13006': 12.20, 'CH-N08007': 20.00, 'CH-N08008': 28.00, 'CH-N08009': 32.00,
});

// 4. Telegram screenshotda bor, lekin Excelda alohida o'lchami kiritilmagan 8784A klapanlar (1 1/4", 1 1/2", 2")
const EXTRA_TELEGRAM_SKUS = [
  {
    code: 'MT-8784A-125',
    name: 'Клапан трёхходовой смесительный латунный Climate House 8784A 1 1/4"',
    brand: 'CLIMATE HOUSE',
    article: '8784A',
    unit: 'шт',
    section: 'Металлические товары / Climate House',
    priceUsd: 22.00,
    retailUsd: null,
    priceSource: 'Telegram CH (8784A опт)',
  },
  {
    code: 'MT-8784A-150',
    name: 'Клапан трёхходовой смесительный латунный Climate House 8784A 1 1/2"',
    brand: 'CLIMATE HOUSE',
    article: '8784A',
    unit: 'шт',
    section: 'Металлические товары / Climate House',
    priceUsd: 27.00,
    retailUsd: null,
    priceSource: 'Telegram CH (8784A опт)',
  },
  {
    code: 'MT-8784A-200',
    name: 'Клапан трёхходовой смесительный латунный Climate House 8784A 2"',
    brand: 'CLIMATE HOUSE',
    article: '8784A',
    unit: 'шт',
    section: 'Металлические товары / Climate House',
    priceUsd: 30.00,
    retailUsd: null,
    priceSource: 'Telegram CH (8784A опт)',
  },
];

function enrichSkuItem(item) {
  const code = String(item.code || '').trim();
  const article = String(item.article || '').trim();
  const brand = String(item.brand || '').trim();
  const section = String(item.section || '').trim();
  const topSection = section.split('/')[0].trim() || 'Прочие товары';

  let priceUsd = item.priceUsd ?? null;
  let retailUsd = item.retailUsd ?? null;
  let priceSource = item.priceSource ?? null;
  let alias = '';

  if (VERIFIED_PRICE_BY_CODE[code]) {
    const p = VERIFIED_PRICE_BY_CODE[code];
    priceUsd = p.wholesale;
    retailUsd = p.retail ?? null;
    priceSource = p.src;
    alias = p.alias || '';
  } else if (article && ZONT_WHOLESALE_BY_ARTICLE[article] !== undefined) {
    priceUsd = ZONT_WHOLESALE_BY_ARTICLE[article];
    priceSource = 'Telegram CH (ZONT прайс)';
  } else if (article && SPRESS_WHOLESALE_BY_ARTICLE[article] !== undefined) {
    priceUsd = SPRESS_WHOLESALE_BY_ARTICLE[article];
    priceSource = 'S-PRESS & HOMEBASE прайс';
  }

  const displayArticle = alias ? `${article} (${alias})` : article;
  const searchBlob = `${code} ${item.name} ${brand} ${displayArticle} ${section}`.toLowerCase();

  return Object.freeze({
    code,
    name: String(item.name || '').trim(),
    brand: brand || 'CLIMATE HOUSE',
    article: displayArticle,
    unit: String(item.unit || 'шт').trim(),
    section,
    topSection,
    priceUsd,
    retailUsd,
    priceSource,
    _search: searchBlob,
  });
}

export const CLIMATE_HOUSE_CATALOG = Object.freeze([
  ...rawSkus.map(enrichSkuItem),
  ...EXTRA_TELEGRAM_SKUS.map(enrichSkuItem),
]);

const CODE_INDEX = new Map(CLIMATE_HOUSE_CATALOG.map((it) => [it.code.toUpperCase(), it]));

// Qulay o'zbekcha/ruscha tezkor bo'lim filtrlari
export const CLIMATE_HOUSE_QUICK_FILTERS = Object.freeze([
  { id: 'ALL', label: 'Barchasi (3 790)' },
  { id: 'PRICED', label: '💲 Narxi bor ($)' },
  { id: 'Тёплый пол', label: '🔥 Tyopliy pol & 7200S' },
  { id: 'Котлы', label: '♨ Qozonlar (Ecodense)' },
  { id: 'Насосы', label: '⚙ Nasoslar (Grundfos/Shinhoo)' },
  { id: 'Радиаторы', label: '🌡 Radiatorlar (Royal Thermo)' },
  { id: 'Трубы и фитинги', label: '🔧 Quvur & Fiting (TE-SA / S-Press / PPR)' },
  { id: 'Металлические товары', label: '🔩 Latun & Klapanlar (8784A)' },
  { id: 'Фильтры', label: '💧 Filtrlar (Imrita)' },
  { id: 'Вентиляция', label: '🌀 Ventilyatsiya & Rekuperator' },
  { id: 'Электротовары', label: '⚡ ZONT & Avtomatika' },
  { id: 'Расширительные баки', label: '🛢 Baklar & Boyler' },
]);

export function findClimateHouseSku(code) {
  if (!code) return null;
  return CODE_INDEX.get(String(code).trim().toUpperCase()) || null;
}

export function getClimateHouseBrands() {
  const counts = new Map();
  for (const it of CLIMATE_HOUSE_CATALOG) {
    if (!it.brand) continue;
    counts.set(it.brand, (counts.get(it.brand) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([brand, count]) => ({ brand, count }));
}

export function getClimateHouseStats() {
  let pricedCount = 0;
  for (const it of CLIMATE_HOUSE_CATALOG) {
    if (it.priceUsd !== null) pricedCount += 1;
  }
  return {
    totalSkus: CLIMATE_HOUSE_CATALOG.length,
    pricedCount,
    brandCount: getClimateHouseBrands().length,
  };
}

/**
 * Ko'p so'zli tezkor qidiruv (Код CH, Артикул, Бренд, Наименование bo'yicha).
 */
export function searchClimateHouseCatalog(query = '', options = {}) {
  const { section = 'ALL', brand = 'ALL', limit = 120 } = options;
  const qNorm = String(query || '').trim().toLowerCase();
  const tokens = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];

  const matches = [];
  for (const item of CLIMATE_HOUSE_CATALOG) {
    if (section === 'PRICED') {
      if (item.priceUsd === null) continue;
    } else if (section && section !== 'ALL') {
      if (item.topSection !== section && !item.section.includes(section)) continue;
    }

    if (brand && brand !== 'ALL' && item.brand !== brand) {
      continue;
    }

    if (tokens.length > 0) {
      let ok = true;
      for (const tok of tokens) {
        if (!item._search.includes(tok)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }

    matches.push(item);
    if (matches.length >= limit) break;
  }
  return matches;
}

/**
 * Tanlangan Climate House tovaridan Dala O'lchovi (Zamer) MEP nuqtasi shablonini chiqaradi.
 */
export function inferMepPointPresetFromSku(sku) {
  const sec = (sku?.section || '').toLowerCase();
  const nm = (sku?.name || '').toLowerCase();
  let type = 'Uskuna';
  if (sec.includes('канализац') || nm.includes('канализац') || nm.includes('трап')) type = 'Kanalizatsiya';
  else if (sec.includes('вентиляц') || nm.includes('рекуператор') || nm.includes('воздуховод')) type = 'Vent';
  else if (sec.includes('фильтр') || nm.includes('водоснабж') || nm.includes('умягчител')) type = 'Suv';
  else if (sec.includes('тёплый пол') || sec.includes('радиатор')) type = 'Isitish';

  // O'lchamdan DN taxmin EMAS, faqat zavod nomidagi nominal mm bo'lsa o'qish (quvur uchun joyida tasdiqlanadi)
  const priceTag = sku.priceUsd !== null ? ` · Опт $${sku.priceUsd.toFixed(2)}` : '';
  return {
    name: `${sku.name}`.slice(0, 95),
    type,
    skuCode: sku.code,
    skuBrand: sku.brand,
    skuArticle: sku.article || '',
    priceUsd: sku.priceUsd,
    detail: `Код CH: ${sku.code} | Бренд: ${sku.brand}${sku.article ? ` | Арт: ${sku.article}` : ''}${priceTag}; joyida ulanish va servis gabariti tekshirilsin`,
  };
}
