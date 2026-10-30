// 測試：SEO 自我檢查工具（scripts/check-seo.mjs）會抓到該抓的問題（執行：npm test）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, checkSitemap } from '../scripts/check-seo.mjs';

const good = (extra = '') => `<html><head><title>T</title><meta name="description" content="d">${extra}
<link rel="canonical" href="https://example.com/zh-tw/"><meta property="og:title" content="T"><meta property="og:image" content="https://example.com/a.png">
<script type="application/ld+json">{"@type":"BlogPosting"}</script></head></html>`;

test('正式版：完整的頁面沒有問題', () => {
  assert.deepEqual(checkPage(good(), { expectNoindex: false }), []);
});
test('預覽版：沒有 noindex 會被抓到', () => {
  assert.match(checkPage(good(), { expectNoindex: true }).join(), /noindex/);
});
test('預覽版：有 noindex 就通過；正式版有 noindex 會被抓到', () => {
  const html = good('<meta name="robots" content="noindex, nofollow">');
  assert.deepEqual(checkPage(html, { expectNoindex: true }), []);
  assert.match(checkPage(html, { expectNoindex: false }).join(), /正式版不應該有 noindex/);
});
test('canonical 不是完整網址、JSON-LD 壞掉都會被抓到', () => {
  const html = good().replace('https://example.com/zh-tw/', '/zh-tw/').replace('{"@type":"BlogPosting"}', '{bad');
  const p = checkPage(html, { expectNoindex: false }).join();
  assert.match(p, /canonical 不是完整網址/);
  assert.match(p, /JSON-LD/);
});
test('sitemap 檢查', () => {
  assert.deepEqual(checkSitemap('<urlset><url><loc>https://e.com/zh-tw/</loc></url></urlset>'), []);
  assert.equal(checkSitemap('<urlset></urlset>').length, 1);
  assert.equal(checkSitemap('<urlset><url><loc>/zh-tw/</loc></url></urlset>').length, 1);
});
