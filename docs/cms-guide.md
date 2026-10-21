# EZpakku 內容管理（CMS）使用說明

後台網址（預覽版）：**https://ezpakku-preview.vercel.app/admin/**
畫面會自動用繁體中文（跟著瀏覽器語言）。

> 目前是**測試期間**：CMS 只會改 GitHub 上的 `feat/blog-preview` 分支，**不會動到正式版（main）**。
> 每篇文章都會先變成「草稿」，要你按「發佈」才算數（這叫「編輯流程」）。

## 10 步驟

1. **第一次：做一把登入用的鑰匙（Token）**
   打開 https://github.com/settings/personal-access-tokens/new （要用 56webb 帳號登入）
   - Token name：`EZpakku CMS`；Expiration：**30 天**
   - Repository access：**Only select repositories** → 只選 `56webb/packing-list`
   - Permissions → Repository permissions：**Contents：Read and write**、**Pull requests：Read and write**（其他都不要開）
   - 按 Generate token，複製那串字（只會顯示一次）。
2. **登入**：打開後台網址 → 按「使用存取權杖登入」→ 貼上 Token → 登入。
   ⚠️ Token 等於你的鑰匙：不要貼到 LINE、不要給別人、不要在公用電腦登入。用完可按右上角頭像 →「登出」。
3. **看文章**：左邊選「旅行文章」，就會看到全部文章。
4. **新增文章**：按「新增」→ 依序填 **標題、網址代稱**（小寫英文和「-」，例如 `japan-ski-packing`）、**摘要**、**發佈日期**。
5. **寫內文**：在「內文」欄打字。小標題用工具列的「標題」，不用再寫大標題。每個事實記得附官方來源。
6. **上傳圖片**：封面圖按「封面圖」→ 上傳；內文圖片按工具列的圖片按鈕 → 上傳。
   只能用 **JPG／PNG／WebP／GIF、2 MB 以內**。個資、護照號碼、QR 碼要先打馬賽克；沒有轉載權的官方圖片不要放。
7. **存草稿**：按「儲存」。文章會變成「草稿」（GitHub 上會出現一個 `cms/...` 分支和 PR），**網站還看不到**。
8. **修改文章**：在列表點文章 → 改內容 → 再按「儲存」。已發佈的文章改完也會先變草稿。
9. **送審與發佈**：上方切到「編輯流程」（Workflow）看板，把文章從「草稿」拖到「待審核」→「可發佈」，再按「**發佈**」。這時 CMS 才會把它合併到 `feat/blog-preview`。
10. **更新預覽網站**：目前預覽網站沒有自動重建，發佈後請跟 L 說「重新部署預覽」，幾分鐘後就能在 https://ezpakku-preview.vercel.app/zh-tw/blog/ 看到。

## 小提醒
- **用 Cursor 改程式之前，先 `git pull`**（CMS 會直接在 GitHub 新增 commit，不 pull 會衝突）。
- 不想公開但想先存著：打開「先不公開（草稿）」開關。
- 有放推廣（分潤）連結：打開「文章含推廣連結」，並照 AGENTS.md 的格式寫（要有「推廣連結」標示）。旅遊保險不放推廣連結；Saily 不能用品牌字買關鍵字廣告。
- **放蝦皮商品卡片：**
  1. 左邊選「推廣商品」→「推廣商品清單」，確認商品在清單裡、「顯示」是打開的，並在「各文章的分潤連結」新增一筆：填**這篇文章的網址代號**（例如 `japan-packing-list`）和 Armin／蝦皮分潤後台給**這篇**的短連結。
     - 每篇文章的連結不一樣（Sub_id 不同，才分得出是哪篇帶來的訂單），不要拿別篇的連結來用。
     - 文章沒有登記連結，那篇就不會出現卡片（不會借用別篇的連結）。
  2. 到文章內文，在想放的位置**單獨一行**寫 `[[商品:商品代號]]`，例如 `[[商品:polywell-lanyard]]`。
  3. 打開「文章含推廣連結」。
  4. 不要在文章或商品裡寫價格、分潤率；卡片會自動寫「價格以蝦皮頁面為準」。
  5. 改「推廣商品清單」也是存成草稿，RY 按「發佈」後網站才會更新。
- 不能在 CMS 刪文章（防止誤刪）。要刪請找 L。

## 上正式版前（RY 要決定）
- CMS 的目標分支從 `feat/blog-preview` 改成 `main`（改 `public/admin/config.yml` 的 `branch`，走 PR）。
- 登入方式：繼續用 Token，或設定 GitHub OAuth（免費的 Cloudflare Worker「sveltia-cms-auth」），以後按「用 GitHub 登入」就好，不用自己保管 Token。步驟見 PR 說明。
