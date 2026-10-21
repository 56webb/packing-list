// 推廣（分潤）商品卡片：資料在 src/data/affiliate-products.json（RY 可以在 CMS「推廣商品」裡改）
// - 文章裡寫一行 [[商品:polywell-lanyard]]（或 [[product:polywell-lanyard]]）就會變成卡片（見 src/plugins/remark-affiliate.mjs）
// - .astro 頁面用 <AffiliateProduct id="polywell-lanyard" post="文章slug" />（src/components/AffiliateProduct.astro）
// - 規則：不顯示價格、分潤率、每筆分潤；連結一律 rel="sponsored nofollow noopener"；
//   active=false 的商品不顯示（build 時會出警告）
// - 每篇文章用自己的分潤連結（每篇的 Sub_id 不同）：商品的 links 是 [{ post: 文章 slug, url: 分潤短連結 }]。
//   文章沒有自己的連結 → 這篇不顯示卡片（build 時警告），不會退回用別篇或共用的連結。
import { readFileSync } from 'node:fs';

const DATA = new URL('../data/affiliate-products.json', import.meta.url);
const PLATFORM = {
  shopee: { button: '到蝦皮看看（推廣連結）', price: '價格以蝦皮頁面為準', hosts: ['s.shopee.tw', 'shopee.tw'] },
};

export function loadProducts() {
  // 每次重新讀檔：npm run dev 時在 CMS／編輯器改了 JSON 不用重開
  return JSON.parse(readFileSync(DATA, 'utf8')).products ?? [];
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 這個商品在這篇文章（slug）用的分潤連結；沒有就回傳 ''
export function linkFor(p, slug) {
  if (!slug || !Array.isArray(p.links)) return '';
  const hit = p.links.find((l) => l && l.post === slug);
  return hit?.url ?? '';
}

// 回傳 { html, warning }；不能顯示時 html 是空字串
// slug：目前這篇文章的 slug（決定用哪一條分潤連結）
export function renderProduct(id, slug) {
  const p = loadProducts().find((x) => x.id === id);
  if (!p) return { html: '', warning: `找不到推廣商品「${id}」（檢查 src/data/affiliate-products.json 的 id）` };
  if (!p.active) return { html: '', warning: `推廣商品「${id}」目前 active=false，不顯示` };
  const plat = PLATFORM[p.platform];
  if (!plat) return { html: '', warning: `推廣商品「${id}」的 platform「${p.platform}」不支援` };
  const raw = linkFor(p, slug);
  if (!raw) return { html: '', warning: `推廣商品「${id}」沒有文章「${slug || '（不明）'}」專用的分潤連結（links），這篇不顯示卡片` };
  let url;
  try { url = new URL(raw); } catch { return { html: '', warning: `推廣商品「${id}」給文章「${slug}」的分潤連結格式不對，不顯示` }; }
  if (url.protocol !== 'https:' || !plat.hosts.includes(url.hostname)) {
    return { html: '', warning: `推廣商品「${id}」給文章「${slug}」的分潤連結不是 ${plat.hosts.join(' / ')} 的 https 連結，不顯示` };
  }
  const html =
    `<aside class="affiliate-box affiliate-product" data-product="${esc(p.id)}">` +
    `<p class="affiliate-label">推廣連結：透過此連結購買，EZpakku 可能獲得分潤，不影響你的價格</p>` +
    `<p class="affiliate-product-name">${esc(p.name)}</p>` +
    (p.note ? `<p class="affiliate-note">${esc(p.note)}</p>` : '') +
    `<p class="affiliate-cta"><a class="affiliate-button" href="${esc(url.href)}" rel="sponsored nofollow noopener" target="_blank">${esc(plat.button)}</a></p>` +
    `<p class="affiliate-price">${esc(plat.price)}</p>` +
    `</aside>`;
  return { html, warning: '' };
}
