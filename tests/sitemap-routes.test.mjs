// 測試：sitemap 自動列頁規則（src/lib/sitemapRoutes.mjs）（執行：npm test）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileToPath, pagePathsFromFiles } from '../src/lib/sitemapRoutes.mjs';

const all = ['./index.astro', './zh-tw/index.astro', './zh-tw/about/index.astro', './zh-tw/blog/index.astro',
  './zh-tw/blog/[slug].astro', './zh-tw/blog/disclosure.astro', './zh-tw/pricing/index.astro',
  './zh-tw/payment/result/index.astro', './zh-tw/sponsor/index.astro', './zh-tw/sponsor/thanks/index.astro'];

test('檔名轉網址', () => {
  assert.equal(fileToPath('./index.astro'), '');
  assert.equal(fileToPath('./zh-tw/index.astro'), 'zh-tw/');
  assert.equal(fileToPath('./zh-tw/blog/disclosure.astro'), 'zh-tw/blog/disclosure/');
});
test('排除跳轉頁、動態路由、付款結果與贊助感謝頁', () => {
  const p = pagePathsFromFiles(all);
  assert.deepEqual(p, ['zh-tw/', 'zh-tw/about/', 'zh-tw/blog/', 'zh-tw/pricing/', 'zh-tw/sponsor/', 'zh-tw/blog/disclosure/']);
});
test('PUBLIC_SPONSOR_HIDE=1 時不列贊助頁', () => {
  assert.ok(!pagePathsFromFiles(all, { sponsorHide: true }).some((p) => p.includes('sponsor')));
});
test('這個分支實際的頁面都能轉換', () => {
  const walk = (d) => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walk(join(d, n)).map((x) => `${n}/${x}`) : [n]);
  const files = walk('src/pages').filter((f) => f.endsWith('.astro')).map((f) => `./${f}`);
  const p = pagePathsFromFiles(files);
  assert.ok(p.includes('zh-tw/') && p.includes('zh-tw/blog/'));
});
