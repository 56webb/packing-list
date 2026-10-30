// ===== E2E 共用工具 =====
// - 每個測試都在全新的瀏覽器分頁（localStorage 是空的）
// - 擋掉所有外部網路請求：測試不依賴外部網站，也不會真的打 MET Norway 天氣 API
//   （要測天氣的測試，自己用 mockForecast() 換成假資料）
// - 收集頁面上的 JavaScript 錯誤，測試結束時檢查不能有錯
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    page.externalRequests = [];
    await page.route((url) => url.origin !== origin, (route) => {
      page.externalRequests.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await use(page);
    expect(errors, '頁面不能有 JavaScript 錯誤').toEqual([]);
  },
});
export { expect };

/** 今天往後 n 天的日期（台北時間）'YYYY-MM-DD' */
export function dateFromToday(n) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date(Date.now() + n * 86400000));
}

/** 假的 MET Norway 預報：每天（東京時間）14 點 21°、5 點 11°、其他時間 15° */
export function fakeForecast() {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  const timeseries = [];
  for (let h = 0; h < 24 * 11; h++) {
    const time = new Date(start.getTime() + h * 3600000);
    const tokyoHour = (time.getUTCHours() + 9) % 24;
    const air_temperature = tokyoHour === 14 ? 21 : tokyoHour === 5 ? 11 : 15;
    timeseries.push({
      time: time.toISOString(),
      data: { instant: { details: { air_temperature } }, next_6_hours: { summary: { symbol_code: 'partlycloudy_day' } } },
    });
  }
  return { type: 'Feature', properties: { timeseries } };
}

/**
 * 把天氣 API 換成假資料。status 不是 200 就模擬「API 壞掉」。
 * 回傳 calls：被呼叫的網址（檢查座標用）
 */
export async function mockForecast(page, { status = 200 } = {}) {
  const calls = [];
  await page.route('https://api.met.no/**', (route) => {
    calls.push(route.request().url());
    if (status !== 200) return route.fulfill({ status, body: 'error' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', expires: new Date(Date.now() + 3600000).toUTCString() },
      body: JSON.stringify(fakeForecast()),
    });
  });
  return calls;
}

/**
 * 用表單建立一趟旅行，回傳 trip id。
 * opts：{ country: 'JP', startDate, days, luggage: 'checked'|'carryon7', name }
 */
export async function createTrip(page, opts = {}) {
  await page.goto('/zh-tw/');
  await page.getByRole('link', { name: '＋ 新增旅行' }).click();
  await expect(page.getByRole('heading', { name: '新增旅行' })).toBeVisible();
  if (opts.country !== undefined) await page.locator('select[name=country]').selectOption(opts.country);
  if (opts.startDate) await page.locator('input[name=startDate]').fill(opts.startDate);
  if (opts.days) await page.locator('input[name=days]').fill(String(opts.days));
  if (opts.luggage === 'carryon7') await page.getByText('只帶登機箱（廉航 7 公斤）').click();
  if (opts.name) await page.locator('input[name=name]').fill(opts.name);
  await page.getByRole('button', { name: '產生清單' }).click();
  await expect(page).toHaveURL(/#\/trip\/[A-Za-z0-9-]+$/);
  await expect(page.locator('.page.trip li.item').first()).toBeVisible(); // 等清單畫好
  return page.url().split('#/trip/')[1];
}

/** 讀 localStorage 裡存的整份資料 */
export const savedState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('packing-list:v1') ?? 'null'));

/** 某個包包的區塊（section aria-label = 包包名稱） */
export const bagSection = (page, name) => page.getByRole('region', { name, exact: true });

/** 某一個物品那一行（名稱完全相同）。scope 可以是 page 或某個包包區塊 */
export function itemRow(scope, name) {
  const pg = typeof scope.page === 'function' ? scope.page() : scope;
  const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return scope.locator('li.item').filter({ has: pg.locator('.item-name', { hasText: exact }) });
}
