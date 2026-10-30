// ===== 部落格與站內連結 =====
import { test, expect } from './fixtures.mjs';

test.describe('部落格', () => {
  test('文章列表打得開，每篇文章都能點進去', async ({ page }) => {
    await page.goto('/zh-tw/blog/');
    await expect(page).toHaveTitle(/EZpakku/);
    const links = page.locator('main a[href*="/zh-tw/blog/"]:not([href$="/blog/"]):not([href*="disclosure"])');
    const hrefs = [...new Set(await links.evaluateAll((as) => as.map((a) => a.pathname)))];
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    for (const href of hrefs) {
      const res = await page.goto(href);
      expect(res.status(), href).toBe(200);
      await expect(page.locator('h1').first(), href).not.toBeEmpty();
    }
  });

  test('從列表點第一篇文章，再從頁尾回到 App', async ({ page }) => {
    await page.goto('/zh-tw/blog/');
    const first = page.locator('main a[href*="/zh-tw/blog/"]:not([href$="/blog/"]):not([href*="disclosure"])').first();
    const title = (await first.textContent()).trim();
    await first.click();
    await expect(page).not.toHaveURL(/\/zh-tw\/blog\/$/);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(title.length).toBeGreaterThan(0);
  });

  test('首頁根網址會跳到 /zh-tw/', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/zh-tw\/$/);
    await expect(page.getByRole('link', { name: '＋ 新增旅行' })).toBeVisible();
  });
});

// 從首頁開始，把所有頁面上的站內連結（<a href>、圖片、CSS、JS）都檢查一次，不能有 404
test('站內連結、圖片、CSS、JS 都不會 404', async ({ page, request, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '只在桌機跑一次就夠');
  test.setTimeout(120_000);
  const origin = new URL(baseURL).origin;
  const queue = ['/zh-tw/', '/zh-tw/blog/', '/zh-tw/about/', '/zh-tw/privacy/', '/zh-tw/blog/disclosure/'];
  const pages = new Set();
  const assets = new Map(); // url → 在哪一頁看到
  const broken = [];
  while (queue.length) {
    const path = queue.shift();
    if (pages.has(path)) continue;
    pages.add(path);
    const res = await page.goto(path);
    if (res.status() !== 200) { broken.push(`${path}（頁面 ${res.status()}）`); continue; }
    const found = await page.evaluate(() => [
      ...[...document.querySelectorAll('a[href]')].map((a) => ({ kind: 'a', url: a.href })),
      ...[...document.querySelectorAll('img[src], img[srcset], source[srcset]')].flatMap((el) => [
        el.getAttribute('src') ? el.src : null,
        ...(el.getAttribute('srcset') ?? '').split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).map((u) => new URL(u, location.href).href),
      ].filter(Boolean).map((url) => ({ kind: 'asset', url }))),
      ...[...document.querySelectorAll('link[href]')].map((l) => ({ kind: 'asset', url: l.href })),
      ...[...document.querySelectorAll('script[src]')].map((s) => ({ kind: 'asset', url: s.src })),
      ...[...document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')].map((m) => ({ kind: 'meta', url: m.content })),
    ]);
    for (const { kind, url } of found) {
      const u = new URL(url, origin);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      // 預覽站網址（canonical、og:url）換成本機檢查
      const local = u.origin === origin || u.origin === 'https://ezpakku-preview.vercel.app';
      if (!local) continue;
      if (kind === 'a' && !/\.[a-z0-9]+$/i.test(u.pathname)) { if (!pages.has(u.pathname)) queue.push(u.pathname); }
      else assets.set(u.pathname, path);
    }
  }
  for (const [asset, from] of assets) {
    const res = await request.get(asset);
    if (res.status() !== 200) broken.push(`${asset}（${res.status()}，出現在 ${from}）`);
  }
  console.log(`檢查了 ${pages.size} 個頁面、${assets.size} 個檔案`);
  expect(broken, '壞掉的站內連結').toEqual([]);
  expect(pages.size).toBeGreaterThanOrEqual(10);
});
