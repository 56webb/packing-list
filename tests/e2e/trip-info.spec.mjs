// ===== 旅行頁頂部：插頭／電壓、天氣 =====
// 天氣 API（MET Norway）一律用假資料，不打真的外部網站。
import { test, expect, createTrip, itemRow, dateFromToday, mockForecast } from './fixtures.mjs';

test.describe('插頭與電壓', () => {
  test('日本：顯示 A 型插頭 100V 圖示，不加萬用轉接頭', async ({ page }) => {
    await createTrip(page, { country: 'JP', startDate: dateFromToday(30) });
    const plug = page.locator('.trip-info .plug-info');
    await expect(plug.locator('.plug-text')).toHaveText('A 型插頭 100V');
    await expect(plug.locator('svg')).toHaveCount(1);
    await expect(itemRow(page, '萬用轉接頭')).toHaveCount(0);
    await expect(itemRow(page, '確認電器支援 100–240V（吹風機、離子夾）')).toHaveCount(0);
  });

  test('韓國：C/F 型 220V，加萬用轉接頭（顯示插頭圖示）和電壓提醒', async ({ page }) => {
    await createTrip(page, { country: 'KR', startDate: dateFromToday(30) });
    await expect(page.locator('.trip-info .plug-text')).toHaveText('C/F 型插頭 220V');
    await expect(page.locator('.trip-info .plug-info svg')).toHaveCount(2);
    const adapter = itemRow(page, '萬用轉接頭');
    await expect(adapter).toBeVisible();
    await expect(adapter.locator('.item-plugs svg')).toHaveCount(2);
    await expect(adapter.locator('.item-note')).toHaveText('插頭：C/F 型・電壓 220V');
    await expect(itemRow(page, '確認電器支援 100–240V（吹風機、離子夾）')).toBeVisible();
  });

  test('台灣（國內）：不顯示插頭資訊', async ({ page }) => {
    await createTrip(page, { country: 'TW', startDate: dateFromToday(30) });
    await expect(page.locator('.trip-info')).toContainText('台灣（國內）');
    await expect(page.locator('.plug-info')).toHaveCount(0);
  });
});

test.describe('天氣區塊', () => {
  test('出發日超過 9 天：顯示 NASA 過去平均，不打天氣 API', async ({ page }) => {
    const calls = await mockForecast(page);
    await createTrip(page, { country: 'JP', startDate: dateFromToday(30) });
    const box = page.locator('.weather');
    await expect(box).toHaveAttribute('data-mode', 'climate');
    await expect(box.locator('.weather-title')).toContainText('東京');
    await expect(box.locator('.weather-title')).toContainText('過去平均（2001–2025），僅供參考');
    await expect(box.locator('.weather-climate')).toHaveText(/^高 -?\d+° ／ 低 -?\d+°/);
    await expect(box.getByRole('link', { name: /NASA POWER/ })).toHaveAttribute('href', 'https://power.larc.nasa.gov/');
    expect(calls).toEqual([]);
  });

  test('9 天內出發：用天氣預報（假資料），顯示每天高低溫和來源', async ({ page }) => {
    const calls = await mockForecast(page);
    await createTrip(page, { country: 'JP', startDate: dateFromToday(2), days: 3 });
    const box = page.locator('.weather');
    await expect(box).toHaveAttribute('data-mode', 'forecast');
    await expect(box.locator('.weather-title')).toHaveText('🌤️ 東京天氣預報');
    const days = box.locator('.weather-day');
    await expect(days).toHaveCount(3);
    for (const temp of await days.locator('.weather-temp').allTextContents()) expect(temp).toBe('21°/11°');
    await expect(days.first().locator('.weather-icon')).toHaveText('⛅');
    await expect(box.getByRole('link', { name: 'Weather data: MET Norway (CC BY 4.0)' })).toBeVisible();
    // 座標只留 4 位小數（MET 規定）
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toContain('lat=35.6762&lon=139.6503');
  });

  test('預報結果有快取：重新整理不會再打一次 API', async ({ page }) => {
    const calls = await mockForecast(page);
    await createTrip(page, { country: 'JP', startDate: dateFromToday(1), days: 2 });
    await expect(page.locator('.weather-day')).toHaveCount(2);
    const n = calls.length;
    await page.reload();
    await expect(page.locator('.weather-day')).toHaveCount(2);
    expect(calls.length).toBe(n);
  });

  test('天氣 API 壞掉：改顯示過去平均和說明', async ({ page }) => {
    await mockForecast(page, { status: 500 });
    await createTrip(page, { country: 'JP', startDate: dateFromToday(2), days: 3 });
    const box = page.locator('.weather');
    await expect(box).toHaveAttribute('data-mode', 'climate-fallback');
    await expect(box.locator('.weather-note')).toHaveText('天氣預報暫時拿不到（可能沒有網路），先顯示過去平均');
  });

  test('天氣 API 壞掉時，勾選物品不會每次都重打 API', async ({ page }) => {
    const calls = await mockForecast(page, { status: 500 });
    await createTrip(page, { country: 'JP', startDate: dateFromToday(2), days: 3 });
    await expect(page.locator('.weather')).toHaveAttribute('data-mode', 'climate-fallback');
    const n = calls.length;
    for (const name of ['護照', '信用卡', '手機']) await itemRow(page, name).getByRole('checkbox').check();
    await expect(itemRow(page, '手機').getByRole('checkbox')).toBeChecked();
    await expect(page.locator('.weather')).toHaveAttribute('data-mode', 'climate-fallback');
    expect(calls.length).toBe(n);
  });

  test('其他國家（不在清單中）：不顯示天氣區塊，也不顯示插頭', async ({ page }) => {
    await createTrip(page, { country: '', startDate: dateFromToday(30) });
    await expect(page.locator('.trip-info')).toContainText('其他國家（不在清單中）');
    await expect(page.locator('.weather')).toHaveCount(0);
    await expect(page.locator('.plug-info')).toHaveCount(0);
  });
});
