// ===== sitemap 要列哪些頁面（自動判斷）=====
// 輸入：src/pages 底下的 .astro 檔路徑（import.meta.glob 的 key，例如 './zh-tw/about/index.astro'）
// 輸出：網址路徑（例如 'zh-tw/about/'），不含開頭的 /。
// 規則：
//   - 動態路由（檔名有 [ ]，例如文章頁 [slug]）不在這裡列，文章另外從內容集合列出。
//   - 根目錄 index.astro 只是跳轉頁，不列。
//   - EXCLUDE 裡的頁面（付款結果、贊助感謝頁）是付款流程的中間頁，不給搜尋引擎。
//   - 贊助頁 zh-tw/sponsor/ 在 PUBLIC_SPONSOR_HIDE=1 時不列（頁面本身也會被隱藏）。
// 新增一般頁面時不用改這裡，會自動列進 sitemap。
export const EXCLUDE = new Set(['', 'zh-tw/payment/result/', 'zh-tw/sponsor/thanks/']);
export const SPONSOR_PATH = 'zh-tw/sponsor/';

export function fileToPath(file) {
  let p = file.replace(/^\.\//, '').replace(/^.*src\/pages\//, '').replace(/\.astro$/, '');
  if (p === 'index') return '';
  p = p.replace(/\/index$/, '');
  return `${p}/`;
}

export function pagePathsFromFiles(files, { sponsorHide = false } = {}) {
  return [...new Set(files.filter((f) => !/\[.*\]/.test(f)).map(fileToPath))]
    .filter((p) => !EXCLUDE.has(p))
    .filter((p) => !(sponsorHide && (p === SPONSOR_PATH || p.startsWith(SPONSOR_PATH))))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
}
