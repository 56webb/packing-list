// ===== 清單產生器（規則引擎）=====
// 不是一國一國手寫清單，而是用「條件」組合：
//   目的地（氣候、插頭、電壓、是否出國）＋ 天數 ＋ 旅行類型 ＋ 行李方案
// 物品範本在 src/data/items.json，每一項都寫了出現條件（when）。
import countriesData from '../data/countries.json';
import itemsData from '../data/items.json';
import rulesData from '../data/rules.json';
import { t, pick } from '../i18n/index.js';
import { uuid } from './store.js';

export const COUNTRIES = countriesData.countries;
export const CATEGORIES = itemsData.categories;
export const TAGS = rulesData.tags;

// 台灣的插頭是 A、B 型，電壓 110V
const TAIWAN_PLUGS = ['A', 'B'];

export const getCountry = (code) => COUNTRIES.find((c) => c.code === code) ?? null;

/** 平均氣溫 → 氣候等級 */
export function tempToClimate(temp) {
  if (temp == null) return null;
  if (temp >= 25) return 'hot';
  if (temp >= 18) return 'warm';
  if (temp >= 10) return 'cool';
  return 'cold';
}

/** 旅行會經過哪些月份（1–12）。沒填日期就用這個月。 */
export function tripMonths(startDate, days) {
  const start = startDate ? new Date(startDate + 'T00:00:00') : new Date();
  if (Number.isNaN(start.getTime())) return [new Date().getMonth() + 1];
  const months = new Set();
  for (let d = 0; d < Math.max(1, days); d++) {
    const day = new Date(start);
    day.setDate(start.getDate() + d);
    months.add(day.getMonth() + 1);
  }
  return [...months];
}

/**
 * 算出這趟旅行的氣候等級（可能不只一個，例如 11 月底到 12 月初）
 * 回傳 { climates: ['cool','cold'], avgTemps: [12.5, 7.7], months: [11,12] }
 */
export function tripClimate(trip) {
  const months = tripMonths(trip.startDate, trip.days);
  if (trip.climate && trip.climate !== 'auto') return { climates: [trip.climate], avgTemps: [], months };
  const country = getCountry(trip.countryCode);
  const temps = country?.meanTempC ? months.map((m) => country.meanTempC[m - 1]).filter((v) => v != null) : [];
  if (temps.length === 0) return { climates: [], avgTemps: [], months }; // 沒資料：不加任何氣候相關物品
  return { climates: [...new Set(temps.map(tempToClimate))], avgTemps: temps, months };
}

/** 目的地插頭跟台灣不一樣嗎？（目的地沒有 A 或 B 型插座就需要轉接頭） */
export function needsAdapter(country) {
  if (!country?.plugs?.length) return false;
  return !country.plugs.some((p) => TAIWAN_PLUGS.includes(p));
}
/** 目的地電壓 ≥ 200V？ */
export function isHighVoltage(country) {
  const v = Number.parseInt(country?.voltage ?? '', 10);
  return Number.isFinite(v) && v >= 200;
}

/** 依天數算數量：{ perDay, extra, min, max } */
export function calcQty(qty, days) {
  if (typeof qty === 'number') return qty;
  const raw = Math.ceil(days * (qty.perDay ?? 0) + (qty.extra ?? 0));
  return Math.min(qty.max ?? 99, Math.max(qty.min ?? 1, raw));
}

/** 這個範本符合這趟旅行嗎？（when 裡的每個條件都要符合） */
function matches(when = {}, ctx) {
  if (when.international != null && when.international !== ctx.international) return false;
  if (when.climate && !when.climate.some((c) => ctx.climates.includes(c))) return false;
  if (when.types && !when.types.some((x) => ctx.types.includes(x))) return false;
  if (when.luggage && !when.luggage.includes(ctx.luggage)) return false;
  if (when.needsAdapter && !ctx.needsAdapter) return false;
  if (when.highVoltage && !ctx.highVoltage) return false;
  if (when.minDays && ctx.days < when.minDays) return false;
  return true;
}

/**
 * 主程式：輸入表單資料，回傳 { trip, bags, items }
 * form = { name, countryCode, startDate, days, types[], luggage, climate }
 */
export function generateTrip(form) {
  const country = getCountry(form.countryCode);
  const days = Math.max(1, Math.min(90, Number(form.days) || 1));
  const { climates } = tripClimate({ ...form, days });
  const ctx = {
    international: country ? country.international : true, // 「其他國家」當作出國
    climates,
    types: form.types ?? [],
    luggage: form.luggage,
    needsAdapter: needsAdapter(country),
    highVoltage: isHighVoltage(country),
    days,
  };

  const tripId = uuid();
  const trip = {
    id: tripId,
    name: form.name?.trim() || defaultTripName(country, form.startDate),
    countryCode: country?.code ?? '',
    startDate: form.startDate || '',
    days,
    types: ctx.types,
    luggage: form.luggage,
    climate: form.climate || 'auto',
  };

  // 預設包包：隨身包包＋（登機箱 或 托運行李箱）
  const personal = { id: uuid(), tripId, name: t('bag.default.personal'), icon: '🎒', kind: 'personal', order: 0 };
  const main =
    form.luggage === 'carryon7'
      ? { id: uuid(), tripId, name: t('bag.default.carryon'), icon: '🧳', kind: 'carryon', order: 1 }
      : { id: uuid(), tripId, name: t('bag.default.checked'), icon: '🧳', kind: 'checked', order: 1 };
  const bags = [personal, main];

  const items = [];
  itemsData.items.forEach((tpl, index) => {
    if (!matches(tpl.when, ctx)) return;
    // 不能托運的東西（有 forbidChecked 標籤）一律放隨身包包
    const forbid = (tpl.tags ?? []).some((tag) => TAGS[tag]?.forbidChecked);
    const bagId = tpl.bag === 'personal' || forbid ? personal.id : main.id;
    // 國內線不顯示「液體 100ml」這類只適用國際線的標籤
    const tags = (tpl.tags ?? []).filter((tag) => !(TAGS[tag]?.internationalOnly && !ctx.international));
    let note = pick(tpl.note);
    if (tpl.id === 'adapter' && country) note = t('trip.adapterNote', { plugs: country.plugs.join('/'), voltage: country.voltage });
    items.push({
      id: uuid(),
      tripId,
      bagId,
      name: pick(tpl.name),
      category: tpl.category,
      qty: calcQty(tpl.qty ?? 1, days),
      checked: false,
      tags,
      note,
      templateId: tpl.id,
      buyKey: tpl.buyKey ?? null,
      order: index,
    });
  });
  return { trip, bags, items };
}

function defaultTripName(country, startDate) {
  const place = country ? country.name.replace(/（.*）/, '') : '旅行';
  if (!startDate) return place;
  const [, m, d] = startDate.split('-');
  return `${place} ${Number(m)}/${Number(d)}`;
}
