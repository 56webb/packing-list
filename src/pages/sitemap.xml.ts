// ===== 網站地圖 sitemap.xml =====
// 給搜尋引擎看的「網站有哪些頁面」清單，build 時自動產生（/sitemap.xml）。
// 新文章不用手動加：只要不是 draft，就會自動列進來。
// 網址的網域來自 SITE_URL（astro.config.mjs 的 site），所以正式版和預覽版會各自正確。
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const abs = (p: string) => new URL(`${base}${p}`, site).href;
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  const latest = posts[0] ? ymd(posts[0].data.updatedDate ?? posts[0].data.pubDate) : undefined;
  const urls: { loc: string; lastmod?: string }[] = [
    { loc: abs('zh-tw/') },
    { loc: abs('zh-tw/blog/'), lastmod: latest },
    ...posts.map((p) => ({ loc: abs(`zh-tw/blog/${p.id}/`), lastmod: ymd(p.data.updatedDate ?? p.data.pubDate) })),
    { loc: abs('zh-tw/about/') },
    { loc: abs('zh-tw/privacy/') },
    { loc: abs('zh-tw/blog/disclosure/') },
    // 藍新金流（PR #6）加的公開頁面；付款結果頁和贊助感謝頁不列
    { loc: abs('zh-tw/pricing/') },
    { loc: abs('zh-tw/terms/') },
    { loc: abs('zh-tw/refund/') },
    { loc: abs('zh-tw/contact/') },
    ...(import.meta.env.PUBLIC_SPONSOR_HIDE === '1' ? [] : [{ loc: abs('zh-tw/sponsor/') }]),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
