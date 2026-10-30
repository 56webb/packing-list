// ===== Playwright 端對端（E2E）測試設定 =====
// 跑法：npm run test:e2e（說明見 README「端對端測試」）
// 1. 先用預覽站同一組設定 build 一份網站到 E2E_OUT_DIR（預設 .e2e-dist/，已加進 .gitignore）
// 2. 用 tests/e2e/serve.mjs 開一個本機伺服器
// 3. 用「手機（390×844）」和「桌機（1280×800）」兩種視窗各跑一次所有測試
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4399);
const OUT = process.env.E2E_OUT_DIR ?? '.e2e-dist';
// 已經 build 好了（例如 CI 分開跑）可以設 E2E_SKIP_BUILD=1 跳過 build
const build = process.env.E2E_SKIP_BUILD
  ? ''
  : `BASE_PATH=/ SITE_URL=https://ezpakku-preview.vercel.app PUBLIC_NOINDEX=1 npx astro build --outDir "${OUT}" && `;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    // Service Worker 會快取網頁，測試時關掉，每次都拿最新 build
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `${build}node tests/e2e/serve.mjs "${OUT}" ${PORT}`,
    url: `http://127.0.0.1:${PORT}/zh-tw/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
