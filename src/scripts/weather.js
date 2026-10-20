// ===== 旅行頁頂部的天氣 =====
// 1. 出發日在 9 天內：向 MET Norway（挪威氣象局）要真的天氣預報，顯示每天最高／最低溫＋圖示。
//    - 授權 CC BY 4.0（可商用），要標示來源與授權連結。
//    - 瀏覽器不能自己設 User-Agent，MET 允許網站用 Origin 標頭識別（瀏覽器會自動帶）。
//      不加任何自訂標頭，這樣就不會觸發 CORS 預檢（MET 不支援預檢）。
//    - 座標只留 4 位小數（MET 規定），結果存在 localStorage，Expires 之前不重複請求。
//    - 注意：直接從瀏覽器呼叫，使用者的 IP 會出現在 MET 的紀錄裡（隱私權政策要寫）。
// 2. 出發日更遠：用 src/data/climate.json（NASA POWER 2001–2025 每月平均，build 前就算好，不會即時呼叫）。
// 3. 都拿不到（離線、API 失敗）：什麼都不顯示，頂部原本的「涼／熱」季節標籤照常顯示。
import climate from '../data/climate.json';

export const FORECAST_DAYS = 9;
const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const CACHE_PREFIX = 'weather:met:v1:';
export const MET_ATTRIBUTION = { text: 'Weather data: MET Norway (CC BY 4.0)', source: 'https://api.met.no/', license: 'https://creativecommons.org/licenses/by/4.0/' };
export const CLIMATE_ATTRIBUTION = { text: '氣候資料：NASA POWER（2001–2025 每日資料平均）', source: 'https://power.larc.nasa.gov/' };

// 先 toFixed 去掉浮點誤差（139.6503 * 10000 會變成 1396502.9999…），再截斷到 4 位小數
const trunc4 = (n) => Math.trunc(Number((n * 10000).toFixed(6))) / 10000;
const DAY = 86400000;

/** 今天（使用者的當地日期）到出發日差幾天；startDate = 'YYYY-MM-DD' */
export function daysUntil(startDate, now = new Date()) {
  if (!startDate) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(startDate + 'T00:00:00');
  return Math.round((start - today) / DAY);
}

/** 這趟旅行要用哪一種天氣：'forecast'（9 天內）、'climate'（更遠）、null（已結束或沒資料） */
export function weatherMode(trip, country, now = new Date()) {
  if (!country || country.lat == null) return null;
  const d = daysUntil(trip.startDate, now);
  if (d == null) return null;
  if (d + (trip.days ?? 1) - 1 < 0) return null; // 旅行已經結束
  return d <= FORECAST_DAYS ? 'forecast' : 'climate';
}

/** 出發月份的平均氣候（NASA POWER）。沒資料回傳 null */
export function climateFor(country, startDate) {
  const c = climate.countries?.[country?.code];
  if (!c) return null;
  const month = (startDate ? new Date(startDate + 'T00:00:00') : new Date()).getMonth();
  const v = { month: month + 1, tmax: c.tmax[month], tmin: c.tmin[month], precip: c.precip[month] };
  return v.tmax == null || v.tmin == null ? null : v;
}

// ---------- MET Norway 預報 ----------
function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 存不了就算了 */ }
}

/** 拿預報原始資料（有快取就用快取）。失敗回傳 null，不丟錯誤 */
export async function fetchForecast(lat, lon) {
  const la = trunc4(lat), lo = trunc4(lon);
  const key = `${CACHE_PREFIX}${la},${lo}`;
  const cached = readCache(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    // 只用最單純的 GET，不加任何 headers（避免 CORS 預檢）
    const res = await fetch(`${MET_URL}?lat=${la}&lon=${lo}`);
    if (!res.ok) throw new Error(`MET ${res.status}`);
    const data = await res.json();
    const exp = Date.parse(res.headers.get('Expires') ?? '');
    writeCache(key, { expires: Number.isFinite(exp) ? exp : Date.now() + 30 * 60000, data });
    return data;
  } catch (err) {
    console.warn('天氣預報取得失敗，改用季節標籤', err);
    return cached?.data ?? null; // 過期的快取總比沒有好（例如離線）
  }
}

/** MET 的 symbol_code → 簡單圖示 */
export function symbolEmoji(code = '') {
  const c = code.replace(/_(day|night|polartwilight)$/, '');
  if (c.includes('thunder')) return '⛈️';
  if (c.includes('snow')) return '❄️';
  if (c.includes('sleet')) return '🌨️';
  if (c.includes('rain')) return c.includes('showers') ? '🌦️' : '🌧️';
  if (c === 'fog') return '🌫️';
  if (c === 'cloudy') return '☁️';
  if (c === 'partlycloudy') return '⛅';
  if (c === 'fair') return '🌤️';
  if (c === 'clearsky') return '☀️';
  return '🌡️';
}

/**
 * 把逐時預報整理成「當地日期」的每日最高／最低溫＋白天的天氣圖示。
 * dates：要顯示的日期 ['2026-10-22', ...]；tz：目的地時區（IANA）
 */
export function dailySummary(data, dates, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const byDate = new Map();
  for (const step of data?.properties?.timeseries ?? []) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(step.time)).map((p) => [p.type, p.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = Number(parts.hour);
    const temp = step.data?.instant?.details?.air_temperature;
    if (temp == null) continue;
    const d = byDate.get(date) ?? { date, max: -Infinity, min: Infinity, symbol: null, symbolDist: 99 };
    d.max = Math.max(d.max, temp);
    d.min = Math.min(d.min, temp);
    // 圖示：選最接近當地中午的那一段
    const sym = step.data?.next_6_hours?.summary?.symbol_code ?? step.data?.next_1_hours?.summary?.symbol_code;
    if (sym && Math.abs(hour - 12) < d.symbolDist) { d.symbol = sym; d.symbolDist = Math.abs(hour - 12); }
    byDate.set(date, d);
  }
  return dates.map((date) => byDate.get(date)).filter((d) => d && Number.isFinite(d.max))
    .map((d) => ({ date: d.date, max: Math.round(d.max), min: Math.round(d.min), icon: symbolEmoji(d.symbol ?? '') }));
}

/** 旅行的每一天（'YYYY-MM-DD'） */
export function tripDates(startDate, days) {
  const start = new Date(startDate + 'T00:00:00');
  return Array.from({ length: Math.max(1, days) }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}
