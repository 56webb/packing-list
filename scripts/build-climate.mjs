// ===== 產生「各目的地每月平均氣候」靜態檔：src/data/climate.json =====
// 用法：npm run data:climate   （需要網路；平常 build 不會跑，結果直接 commit 進 repo）
// 資料來源：NASA POWER（https://power.larc.nasa.gov/）Daily API，2001–2025 每日資料，
// 我們自己算每個月的「平均每日最高溫／最低溫／平均每日降雨量」。
// 為什麼不用 Climatology API：它的 T2M_MAX／T2M_MIN 是該月的「極端值」，不是平均高低溫。
// 注意：POWER 是約 0.5° 的網格資料（MERRA-2），和城市氣象站平年值會有 1～3°C 的差距，只當參考。
import fs from 'node:fs';

const START = '20010101';
const END = '20251231';
const countries = JSON.parse(fs.readFileSync('src/data/countries.json', 'utf8')).countries;
const out = {
  _comment: 'NASA POWER Daily API（MERRA-2）2001-01-01～2025-12-31 每日資料，自行計算每月平均。tmax/tmin：平均每日最高/最低氣溫（°C）；precip：平均每日降雨量（mm/日）。由 scripts/build-climate.mjs 產生，請不要手動修改。',
  source: 'NASA Langley Research Center POWER Project, Daily API v2.x, https://power.larc.nasa.gov/',
  period: '2001–2025',
  accessed: new Date().toISOString().slice(0, 10),
  countries: {},
};
const round1 = (n) => Math.round(n * 10) / 10;

for (const c of countries) {
  if (c.lat == null || c.lon == null) continue;
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=RE&longitude=${c.lon}&latitude=${c.lat}&start=${START}&end=${END}&format=JSON&time-standard=LST`;
  const res = await fetch(url);
  if (!res.ok) { console.error(c.code, res.status); continue; }
  const json = await res.json();
  const fill = json.header?.fill_value ?? -999;
  const p = json.properties.parameter;
  const avg = (param) => Array.from({ length: 12 }, (_, i) => {
    const vals = Object.entries(p[param]).filter(([day, v]) => Number(day.slice(4, 6)) === i + 1 && v !== fill).map(([, v]) => v);
    return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });
  out.countries[c.code] = { tmax: avg('T2M_MAX'), tmin: avg('T2M_MIN'), precip: avg('PRECTOTCORR') };
  console.log(c.code, c.city, 'Jan', out.countries[c.code].tmax[0], '/', out.countries[c.code].tmin[0]);
  await new Promise((r) => setTimeout(r, 300)); // 不要打太快
}
fs.writeFileSync('src/data/climate.json', JSON.stringify(out, null, 1) + '\n');
console.log('寫入 src/data/climate.json：', Object.keys(out.countries).length, '個目的地');
