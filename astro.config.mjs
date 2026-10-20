// @ts-check
import { defineConfig } from 'astro/config';
import rehypeBaseLinks from './src/plugins/rehype-base-links.mjs';

// Astro 設定檔
// - site / base：部署到 GitHub Pages 時，網址是 https://56webb.github.io/packing-list/
//   所以 base 要設成 '/packing-list'。之後搬到 Cloudflare Pages（自己的網域）時，
//   把 base 改成 '/' 就好（或用環境變數 BASE_PATH 覆蓋，見 README）。
// - 多語言：第一版只有繁體中文，網址一開始就用 /zh-tw/（src/pages/zh-tw/），
//   之後加英文只要新增 src/pages/en/ 和 src/i18n/en.json。
const base = process.env.BASE_PATH ?? '/packing-list';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://56webb.github.io',
  base,
  output: 'static',
  trailingSlash: 'ignore',
  // 部落格 Markdown 裡的站內連結自動加上 base（見 src/plugins/rehype-base-links.mjs）
  markdown: { rehypePlugins: [rehypeBaseLinks(base)] },
});
