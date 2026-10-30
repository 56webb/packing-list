// ===== SEO 自我檢查（build 之後跑）=====
// 用法：
//   npm run build                                   → 產生 dist/
//   node scripts/check-seo.mjs dist                 → 正式版：每頁都「不能」有 noindex
//   node scripts/check-seo.mjs dist --noindex       → 預覽版（PUBLIC_NOINDEX=1）：每頁都「必須」有 noindex
// 檢查每一頁：有 <title>、description、完整網址的 canonical、og:title、og:image；
// noindex 有沒有照預期；JSON-LD 是不是合法 JSON；sitemap.xml 存在而且都是完整網址。
// 有問題會列出來，並以錯誤碼 1 結束（之後可以放進 GitHub Actions）。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const metaContent = (html, key, val) => {
  for (const tag of html.match(/<meta\b[^>]*>/g) ?? []) if (attr(tag, key) === val) return attr(tag, 'content');
  return undefined;
};

/** 檢查一頁 HTML，回傳問題清單（空陣列＝沒問題） */
export function checkPage(html, { expectNoindex }) {
  const problems = [];
  const isRedirect = /http-equiv="refresh"/.test(html);
  if (!/<title>[^<]+<\/title>/.test(html)) problems.push('缺 <title>');
  const canonicalTag = (html.match(/<link\b[^>]*rel="canonical"[^>]*>/) ?? [])[0];
  const canonical = canonicalTag && attr(canonicalTag, 'href');
  if (!canonical) problems.push('缺 canonical');
  else if (!/^https?:\/\//.test(canonical)) problems.push(`canonical 不是完整網址：${canonical}`);
  if (!isRedirect) {
    if (!metaContent(html, 'name', 'description')) problems.push('缺 meta description');
    if (!metaContent(html, 'property', 'og:title')) problems.push('缺 og:title');
    if (!metaContent(html, 'property', 'og:image')) problems.push('缺 og:image');
  }
  const robots = metaContent(html, 'name', 'robots') ?? '';
  const hasNoindex = /noindex/i.test(robots);
  if (expectNoindex && !hasNoindex) problems.push('預覽版應該要有 noindex，但沒有');
  if (!expectNoindex && hasNoindex) problems.push('正式版不應該有 noindex，但有');
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { problems.push('JSON-LD 不是合法 JSON'); }
  }
  return problems;
}

/** 檢查 sitemap.xml 內容 */
export function checkSitemap(xml) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const problems = [];
  if (!locs.length) problems.push('sitemap.xml 沒有任何網址');
  for (const l of locs) if (!/^https?:\/\//.test(l)) problems.push(`sitemap 網址不完整：${l}`);
  return problems;
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'admin') return []; // CMS 後台不檢查
    return statSync(p).isDirectory() ? htmlFiles(p) : name.endsWith('.html') ? [p] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? 'dist';
  const expectNoindex = process.argv.includes('--noindex');
  let bad = 0;
  for (const f of htmlFiles(dist)) {
    const problems = checkPage(readFileSync(f, 'utf8'), { expectNoindex });
    if (problems.length) { bad++; console.log(`✗ ${relative(dist, f)}：${problems.join('；')}`); }
  }
  const sm = join(dist, 'sitemap.xml');
  const smProblems = existsSync(sm) ? checkSitemap(readFileSync(sm, 'utf8')) : ['找不到 sitemap.xml'];
  if (smProblems.length) { bad++; console.log(`✗ sitemap.xml：${smProblems.join('；')}`); }
  console.log(bad ? `有 ${bad} 個地方要修` : `✓ 全部通過（${expectNoindex ? '預覽版：每頁都有 noindex' : '正式版：沒有 noindex'}）`);
  process.exit(bad ? 1 : 0);
}
