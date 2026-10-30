// ===== E2E 測試用的小型靜態伺服器（不用另外裝套件）=====
// 把 build 出來的資料夾當成網站：/zh-tw/ → /zh-tw/index.html；找不到的檔案回 404（內部連結檢查要靠它）。
// 用法：node tests/e2e/serve.mjs <資料夾> <port>
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4399);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.woff2': 'font/woff2',
};

async function findFile(pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const full = join(root, rel);
  if (!full.startsWith(root)) return null; // 防止 ../ 跑出資料夾
  for (const p of [full, join(full, 'index.html'), `${full}.html`]) {
    try { if ((await stat(p)).isFile()) return p; } catch { /* 下一個 */ }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  const file = await findFile(pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(await readFile(file));
}).listen(port, '127.0.0.1', () => console.log(`e2e server: http://127.0.0.1:${port}/  (${root})`));
