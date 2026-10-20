# AGENTS.md：給 AI 助手（L、Cursor）和 RY 的協作規則

EZpakku（repo 名稱還是 `56webb/packing-list`）有三個「人」會改這個 repo：**RY（用 Cursor）**、**L（AI 開發夥伴）**、**網頁 CMS（Sveltia CMS，RY 在 /admin/ 寫文章）**。為了不互相蓋掉，請遵守下面的規則。

## 0. 開始工作前：先 `git pull`
CMS 會直接在 GitHub 上新增 commit。**RY 在 Cursor 開始工作前，一定先拉最新版：**
```bash
git checkout <你要改的分支>   # 例如 feat/blog-preview
git pull
```

## 1. 專案結構
| 位置 | 內容 | 誰可以改 |
|---|---|---|
| `src/content/blog/<slug>/post.md` | 文章（Markdown＋frontmatter） | **CMS 為主**。程式碼改動不要順手改文章，除非 RY 要求 |
| `src/content/blog/<slug>/images/` | 該篇文章的圖片 | CMS 上傳；或 RY 手動放 |
| `src/content/blog/_media/` | CMS 素材庫共用上傳區（盡量不用） | CMS |
| `src/content.config.ts` | 文章欄位格式檢查（schema） | 程式碼（PR） |
| `src/pages/zh-tw/blog/` | 文章列表、文章頁、推廣連結揭露頁 | 程式碼（PR） |
| `src/layouts/BlogBase.astro`、`src/styles/blog.css` | 部落格版面、樣式 | 程式碼（PR） |
| `src/pages/zh-tw/index.astro`、`src/scripts/`、`src/data/` | 打包清單工具 | 程式碼（PR） |
| `src/data/affiliate-products.json` | 推廣商品清單（文章裡的商品卡片） | **CMS「推廣商品」**或程式碼 |
| `public/admin/`（`index.html`、`config.yml`） | CMS 設定 | **不要隨便動**；改之前先問 RY |
| `vercel.json` | 只給 Vercel 預覽用的 header（noindex 等） | 程式碼（PR） |
| `.github/workflows/deploy.yml` | GitHub Pages 正式版部署 | 只有 RY 同意才改 |

## 2. 文章格式（frontmatter 每個欄位）
```yaml
---
title: "標題"                    # 必填
slug: japan-packing-list         # 必填，小寫英文＋數字＋「-」，等於網址 /zh-tw/blog/<slug>/，也等於資料夾名稱
description: "1～2 句摘要"        # 必填
pubDate: 2026-10-20              # 必填，YYYY-MM-DD
updatedDate: 2026-11-01          # 選填，大改時填
tags: ["日本", "行前準備"]         # 選填
cover: "./images/01-cover.png"   # 選填，封面圖（相對路徑）
country: JP                      # 選填
affiliate: true                  # 選填，文章含推廣連結時設 true → 自動顯示揭露說明
draft: true                      # 選填，true = 不出現在網站上
---
```
- 內文**不要寫 H1**（`# 標題`），版面會用 `title`。
- 圖片用相對路徑：`![說明](images/檔名.png)`，下一行寫 `*圖片來源：…*`。
- 每個事實要有來源（腳註 `[^id]`），沒有來源不寫價格。
- 站內連結寫 `/zh-tw/blog/<slug>/`，build 時會自動加上 base（GitHub Pages 的 `/packing-list`）。
- 圖片待補時用占位框：`<div class="img-placeholder" role="note"><strong>📷 圖片待補：…</strong></div>`

## 3. 推廣（分潤）連結規則
- 每個推廣連結都要 `rel="sponsored nofollow noopener"`，旁邊要看得到「**推廣連結**」標示，例如：
  ```html
  <aside class="affiliate-box">
  <p class="affiliate-label">推廣連結：透過此連結購買，EZpakku 可能獲得分潤，不影響你的價格</p>
  <p><a href="…" rel="sponsored nofollow noopener" target="_blank">…</a></p>
  </aside>
  ```
- 有推廣連結的文章，frontmatter 設 `affiliate: true`。
- **蝦皮等商品推廣：用商品卡片，不要手寫連結。** 商品資料在 `src/data/affiliate-products.json`（CMS「推廣商品」），文章裡單獨一行寫 `[[商品:商品代號]]`，build 時會變成卡片（按鈕「到蝦皮看看（推廣連結）」＋「價格以蝦皮頁面為準」）。
  - **不顯示、也不寫進 repo：價格、分潤率、每筆分潤、收入**（repo 是公開的）。
  - 分潤短連結（`https://s.shopee.tw/…`）只能用 Armin／蝦皮分潤後台產生的，**不要自己產生或改 Sub_id**。還沒有連結的商品：`affiliateUrl` 留空、`active: false`，卡片就不會出現。
  - 程式在 `src/lib/affiliate.mjs`（畫面）、`src/plugins/remark-affiliate.mjs`（短碼）、`src/components/AffiliateProduct.astro`（.astro 頁面用）。
- **Saily：不能用 Saily 品牌字買關鍵字廣告**（Google Ads 等）。
- **旅遊保險不放推廣連結。**
- 還沒有真的連結時，只放 HTML 註解 `<!-- AFFILIATE: … -->`，不要編造商品網址。
- 不要把 Token、密碼、金鑰、個資（身分證、護照號碼、QR 碼）寫進 repo 或文章。

## 4. 分支與部署流程
- `main` = **正式版**（push 到 main 會自動部署到 GitHub Pages https://56webb.github.io/packing-list/）。
- **任何程式碼改動**：開新分支 → 開 PR → **RY 看過才合併**。AI 不可以自己合併到 main、不可以直接 push main、不可以改 Pages 部署設定。
- **CMS 發文（建議用編輯流程 editorial workflow）**：每篇文章存草稿時，CMS 會開一個 `cms/…` 分支和 PR；**RY 在 CMS 按「發佈」才會合併**。測試期間，CMS 的目標分支是 `feat/blog-preview`（不是 main）。
- 預覽版：`feat/blog-preview` 用 `BASE_PATH=/ PUBLIC_NOINDEX=1 npm run build` 建置，部署到 Vercel 預覽網址（noindex）。

## 5. 不要做的事
- 不要因為改程式碼就順手改 `src/content/blog/` 的文章（除非 RY 要求）。
- 不要隨便改 `public/admin/config.yml`（特別是 `branch`、`repo`、`folder`）。
- 不要放沒有轉載權的官方圖片。
- 不要把 secret 寫進程式碼；OAuth 的 client secret 只能放在部署平台的環境變數。
