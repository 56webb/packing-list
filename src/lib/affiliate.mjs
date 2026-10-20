// 推廣（分潤）商品卡片：資料在 src/data/affiliate-products.json（RY 可以在 CMS「推廣商品」裡改）
// - 文章裡寫一行 [[商品:polywell-lanyard]]（或 [[product:polywell-lanyard]]）就會變成卡片（見 src/plugins/remark-affiliate.mjs）
// - .astro 頁面用 <AffiliateProduct id="polywell-lanyard" />（src/components/AffiliateProduct.astro）
// - 規則：不顯示價格、分潤率、每筆分潤；連結一律 rel="sponsored nofollow noopener"；
//   active=false 或沒有 affiliateUrl 的商品不顯示（build 時會出警告）
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

// 回傳 { html, warning }；不能顯示時 html 是空字串
export function renderProduct(id) {
  const p = loadProducts().find((x) => x.id === id);
  if (!p) return { html: '', warning: `找不到推廣商品「${id}」（檢查 src/data/affiliate-products.json 的 id）` };
  if (!p.active) return { html: '', warning: `推廣商品「${id}」目前 active=false，不顯示` };
  const plat = PLATFORM[p.platform];
  if (!plat) return { html: '', warning: `推廣商品「${id}」的 platform「${p.platform}」不支援` };
  let url;
  try { url = new URL(p.affiliateUrl); } catch { return { html: '', warning: `推廣商品「${id}」沒有可用的 affiliateUrl，不顯示` }; }
  if (url.protocol !== 'https:' || !plat.hosts.includes(url.hostname)) {
    return { html: '', warning: `推廣商品「${id}」的 affiliateUrl 不是 ${plat.hosts.join(' / ')} 的 https 連結，不顯示` };
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
