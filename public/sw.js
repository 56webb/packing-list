// ===== Service Worker：讓網站沒網路也能打開 =====
// 原理：第一次上網打開時，把網頁和程式存一份在手機裡（快取）。
// 之後：
//   - 打開頁面（navigation）→ 先試網路，失敗（沒網路）就拿快取的版本。
//   - 其他檔案（JS、CSS、圖示）→ 先拿快取，同時背景更新。
// 改了這個檔案要「換版本號」，舊快取才會被清掉。
// 快取名稱改成 ezpakku-v1（2026-10 改名）：舊的 packing-list-v1 會在 activate 時自動刪掉。
// 這裡只存網站檔案；使用者的清單在 localStorage（'packing-list:v1'），不受影響、不要改那個 key。
const CACHE = 'ezpakku-v1';
const BASE = new URL('./', self.location).pathname; // 例如 /packing-list/
const PRECACHE = [BASE, `${BASE}zh-tw/`, `${BASE}manifest.webmanifest`, `${BASE}icons/icon-192.png`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // 只處理自己網站的 GET 請求（外部連結、未來的 Supabase API 都不快取）
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(`${BASE}zh-tw/`))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
