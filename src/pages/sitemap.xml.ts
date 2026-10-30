// ===== 網站地圖 sitemap.xml =====
// 給搜尋引擎看的「網站有哪些頁面」清單，build 時自動產生（/sitemap.xml）。
// 新文章不用手動加：只要不是 draft，就會自動列進來。
// 一般頁面也不用手動加：src/pages 底下的 .astro 頁會自動列（規則見 src/lib/sitemapRoutes.mjs）。
// 網址的網域來自 SITE_URL（astro.config.mjs 的 site），所以正式版和預覽版會各自正確。
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { pagePathsFromFiles } from '../lib/sitemapRoutes.mjs';

const pageFiles = Object.keys(import.meta.glob('./**/*.astro'));

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const abs = (p: string) => new URL(`${base}${p}`, site).href;
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  const latest = posts[0] ? ymd(posts[0].data.updatedDate ?? posts[0].data.pubDate) : undefined;
  const pages = pagePathsFromFiles(pageFiles, { sponsorHide: import.meta.env.PUBLIC_SPONSOR_HIDE === '1' });
  const urls: { loc: string; lastmod?: string }[] = pages.flatMap((p) => {
    if (p === 'zh-tw/blog/') return [
      { loc: abs(p), lastmod: latest },
      ...posts.map((x) => ({ loc: abs(`zh-tw/blog/${x.id}/`), lastmod: ymd(x.data.updatedDate ?? x.data.pubDate) })),
    ];
    return [{ loc: abs(p) }];
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
