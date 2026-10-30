# 藍新金流（NewebPay）串接說明：給第一次接觸的人

> ⚠️ **目前狀態：草稿，還沒上線、還沒收任何錢。** 方案是「範例方案，價格未定」，付款按鈕預設是停用的。
> 程式只在**測試環境**用手冊公開的範例資料測過，**還沒有在 Vercel 上真的跑過**（這次沒有部署）。

## 1. 整個流程在做什麼（用白話講）

1. 使用者在 `/zh-tw/pricing/` 選方案、勾選同意、按「前往藍新金流付款」。
2. 網頁請我們的後端 `/api/newebpay/create-order/`（單次）或 `/api/newebpay/period/create/`（月訂閱）建立訂單。
   後端從 `src/data/plans.json` 拿價格（**不相信瀏覽器傳來的金額**），用 HashKey / HashIV 加密，回傳要送給藍新的欄位。
3. 網頁用「表單 POST」把使用者帶到藍新的付款頁（藍新規定要用前景 Form Post，手冊 NDNF-1.2.6 第 6 章）。
4. 使用者在**藍新的頁面**輸入信用卡（我們的網站碰不到卡號）。
5. 藍新做兩件事：
   - **NotifyURL（幕後通知）**：藍新的伺服器直接 POST 給 `/api/newebpay/notify/`。**付款成功與否只看這個。**
   - **ReturnURL（使用者被導回）**：使用者的瀏覽器回到 `/api/newebpay/return/`，再被轉到 `/zh-tw/payment/result/` 看結果。這個只是給人看的，**不能拿來開通**（手冊 §3.1、§6）。
6. 後端在 Notify 裡：驗證簽章（TradeSha）→ 解密 → 檢查商店代號、訂單編號、金額 → 同一筆只處理一次（藍新可能重送）→ 回 HTTP 200。

## 2. 每個檔案在做什麼

| 檔案 | 用途 |
|---|---|
| `src/data/plans.json` | **唯一的方案資料**（名稱、價格、說明、訂閱週期）。改價格只改這裡。現在都是範例。 |
| `src/data/business.json` | 客服與經營者資訊（**全部 TODO**）。退款、條款、聯絡、價格頁都讀這裡。 |
| `api/newebpay.js` | Vercel Function 入口（Node.js）。只有一支，所有 `/api/newebpay/*` 都由它處理。 |
| `lib/newebpay/crypto.js` | AES-256-CBC 加解密、TradeSha（SHA256）計算與比對。 |
| `lib/newebpay/config.js` | 讀環境變數、決定測試／正式網址。 |
| `lib/newebpay/plans.js` | 讀方案、產生訂單編號（`EZ_方案代碼_...`，最多 30 字）。 |
| `lib/newebpay/mpg.js` | 單次付款（MPG 幕前支付）：建立表單、處理 Notify。 |
| `lib/newebpay/period.js` | 月訂閱（信用卡定期定額）：建立表單、處理建立結果與每期扣款通知。 |
| `lib/newebpay/store.js` | 訂單暫存。**現在只存在記憶體（重開就不見）**，要換成 Supabase（見第 6 點）。 |
| `lib/newebpay/router.js` | 依網址分派：`status`、`create-order`、`notify`、`return`、`period/create`、`period/notify`、`period/return`。 |
| `tests/newebpay.test.mjs` | 單元測試，用藍新手冊裡公開的範例金鑰與範例結果比對（`tests/fixtures/newebpay-doc-vectors.json`）。 |
| `src/pages/zh-tw/pricing/` | 方案與價格頁。 |
| `src/pages/zh-tw/refund/`、`terms/`、`contact/` | 退款政策、服務條款、客服聯絡（草稿）。 |
| `src/pages/zh-tw/payment/result/` | 付款結果頁（只顯示，不判斷）。 |
| `vercel.json` | 加了 `rewrites`（把 `/api/newebpay/xxx/` 交給同一支 function）和 `functions.includeFiles`。 |
| `.env.example` | 環境變數名稱範例（**空白，不放真的值**）。 |

## 3. 在本機跑測試

```bash
npm ci
npm test          # 等於 node --test tests/*.test.mjs
```

測試不需要網路、不需要真的金鑰（用的是手冊公開的範例金鑰）。

## 4. 在 Vercel 設定環境變數（拿到藍新金鑰之後）

1. 打開 Vercel → 選這個專案 → **Settings → Environment Variables**。
2. 新增下面這幾個（金鑰在藍新後台「商店管理 → 商店資料設定 → API 串接金鑰」）：

| 名稱 | 值 | 說明 |
|---|---|---|
| `NEWEBPAY_MERCHANT_ID` | 商店代號 | 例如 `MS` 開頭 |
| `NEWEBPAY_HASH_KEY` | HashKey | 32 個字元 |
| `NEWEBPAY_HASH_IV` | HashIV | 16 個字元 |
| `NEWEBPAY_ENV` | `test` | 測試用。**改成 `production` 才會真的扣款**，要等 RY 確認 |
| `NEWEBPAY_PUBLIC_URL` | 例如 `https://ezpakku-preview.vercel.app` | 選填；NotifyURL/ReturnURL 用的網址，沒填就用當下網址 |
| `PUBLIC_PAYMENT_ENABLED` | `1` | 選填；設了價格頁按鈕才能按（build 時讀，改完要重新部署） |

3. **Environment** 建議：測試金鑰只勾 Preview；正式金鑰只勾 Production。
4. 金鑰**絕對不要**寫進程式碼、`.env.example`、聊天訊息或公開的地方。
5. 設好後打開 `/api/newebpay/status/`：會顯示 `configured: true/false` 和 `mode: test/production`（不會顯示金鑰）。

> ⚠️ 測試環境與正式環境是**不同的帳號、不同的金鑰**（測試：`ccore.newebpay.com`；正式：`core.newebpay.com`）。

## 5. 測試卡號（只能在測試環境用）

出處：藍新〈線上交易－幕前支付技術串接手冊〉NDNF-1.2.6，附錄 1。

- 一般信用卡（一次付清、分期）：`4000-2211-1111-1111`
- 紅利折抵：`4003-5511-1111-1111`
- 美國運通：`3760-000000-00006`
- 有效月年、背面末三碼：**任意填**
- 銀聯卡：測試環境不能測

定期定額手冊（NDNP-1.0.8）**沒有另外寫測試卡號**；範例資料裡出現的是 `400022******1111`，推測同樣用 `4000-2211-1111-1111`，**未確認**，實測時要看結果。

## 6. 正式上線前還缺什麼（清單）

- [ ] **RY 決定**商品、價格、是否真的要收費（現在全是範例）。
- [ ] 藍新個人會員申請通過，拿到**正式**商店代號與金鑰；網站名稱要和藍新商店名稱相符（藍新〈商店管理規範〉一、1）。
- [ ] **客服資訊**填進 `src/data/business.json`，而且要和藍新後台登記的一樣（〈商店管理規範〉一、3）。
- [ ] **條款、退款政策確認**，拿掉 DRAFT 橫幅（建議找法律專業人士看過）。
- [ ] **正式網域**：NotifyURL 要能從網際網路連到，而且只能用 80／443 埠（手冊 §4.2.1）。
      正式站現在是 GitHub Pages（純靜態），**跑不了 `/api`**，要收款的網站必須在 Vercel（或其他能跑後端的地方）。
- [ ] **資料庫**：把 `lib/newebpay/store.js` 換成 Supabase（建議兩張表：`orders` 和 `payment_events`，`event_key` 設唯一，用來防止重複處理）。現在存在記憶體，Vercel 換一台機器就不見。
- [ ] **會員系統**：付款後要開通給「誰」？現在網站沒有登入，所以 Notify 裡的「開通」是 TODO。
- [ ] **定期定額**：決定週期、期數、金額；取消／改金額要接藍新的「修改委託狀態」「修改委託內容」API（還沒做）。
- [ ] **電子發票**：是否需要開、用哪家服務開（本 PR 沒有串接任何電子發票）。
- [ ] 在 Vercel Preview 用測試金鑰實際跑一次：付款 → Notify 有收到（看 Vercel Logs 的 `[newebpay]`）→ 結果頁正確。

## 7. 還沒確認的地方（誠實列出）

- 根目錄 `api/` 的 Vercel Function 能不能和 Astro 靜態網站一起部署：依 Vercel 文件應該可以，但**沒有實際部署驗證**。
- `vercel.json` 有 `trailingSlash: true`，所以回呼網址都帶結尾斜線（`/api/newebpay/notify/`），避免藍新 POST 被 308 轉址；**沒實測**。
- `src/data/plans.json` 是用 `import ... with { type: 'json' }` 讀的，為保險在 `vercel.json` 加了 `includeFiles`；**沒實測**。
- 手冊寫 Notify 失敗會重送、連續 3 次失敗會寄信通知，但**沒寫重送間隔**。
- 手冊參數表寫 MPG `Version` 為 2.3，但範例程式用 2.0；程式用 2.3。
- 每月扣款日如果設 29–31 號遇到小月怎麼處理，手冊沒寫清楚；程式先把扣款日限制在 1–28 號。
- 個人會員的收款上限、可用付款方式，要看藍新申請結果。

## 8. 參考資料

- 藍新金流 技術文件下載頁：https://www.newebpay.com/website/Page/content/download_api
  - 〈線上交易－幕前支付技術串接手冊〉NDNF-1.2.6（2026-10-01 版）
  - 〈信用卡定期定額技術串接手冊〉NDNP-1.0.8（2026-08-24 版）
- 藍新〈商店管理規範〉：https://www.newebpay.com/website/Page/content/store_policy
- 消費者保護法（第 18、19、19-2 條）：https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170001
- 通訊交易解除權合理例外情事適用準則（第 2 條第 5 款）：https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170012
- 行政院消保處對「事先同意」告知方式的說明：https://www.ey.gov.tw/Page/8F51FEE53AB45EA9/d09b1f97-08be-4e98-9726-3417fce28004
- Vercel Node.js runtime：https://vercel.com/docs/functions/runtimes/node-js

## 9. 贊助（請喝咖啡）

> ⚠️ 草稿，**預設不能按**（和方案一樣要 `PUBLIC_PAYMENT_ENABLED=1`）。金額都是「範例金額，未定」。
> 用詞只用「贊助」「請喝咖啡」。`npm test` 會檢查 `src/`、`lib/`、`api/`、`public/` 裡沒有其他說法。

### 9-1. 放在哪裡

- 每篇文章最後：`src/components/SponsorBlock.astro`（金額選擇＋自訂金額＋「我了解贊助是自願的」勾選）。
- 兩種版型的頁尾：`src/components/SponsorLink.astro`（「☕ 請我喝咖啡（贊助）」按鈕 → `/zh-tw/sponsor/`）。
- `/zh-tw/sponsor/`：說明頁（自願、沒有回報、金額範圍、付款方式、退款）＋同一個贊助區塊。
- `/zh-tw/sponsor/thanks/`：付款後藍新把人帶回來的感謝頁。`status=success` 才說謝謝；`fail` 說沒扣款；其他（參數不對、讀不到）一律顯示「無法確認」。**真正結果以 Notify 為準**。
- 退款政策「4-1. 贊助（請喝咖啡）」（`/zh-tw/refund/#sponsor`）、服務條款「5-1. 贊助（請喝咖啡）」（`/zh-tw/terms/#sponsor`）。

### 9-2. 金額設定：`src/data/sponsor.json`

| 欄位 | 範例值 | 意思 |
|---|---|---|
| `presetsTwd` | `[50, 100, 150]` | 預設按鈕金額 |
| `defaultTwd` | `100` | 預設選哪個 |
| `minTwd` / `maxTwd` | `30` / `5000` | 自訂金額上下限（後端也用這兩個檢查） |
| `itemDesc` | `EZpakku 贊助（請喝咖啡）` | 藍新付款頁和通知信上的品名（最多 50 字） |

改完 JSON 要重新 build 和部署才會生效。

### 9-3. 後端怎麼做

- `POST /api/newebpay/sponsor/create/`，送 `{ amount, agree: true, email? }`。
- 後端（`lib/newebpay/sponsor.js`）檢查：
  - 金額必須是**整數**（數字，或只有數字的字串）；
  - 金額要在 `minTwd`–`maxTwd` 之間；
  - 要勾選同意。

  不合格就回 400。前端送的其他欄位（例如 `priceTwd`）一律忽略。
- 訂單編號格式是 `EZ_SP<金額>_<時間><亂數>`，例如 `EZ_SP150_…`，最多 30 字。
  - 金額是後端放進去的，藍新回傳時有 TradeSha 保護。
  - 所以就算記憶體裡的訂單不見了，Notify 還是能核對金額，金額不符就不記成功。
- 付款流程和單次付款（MPG）共用：同一個 Notify、同一個 Return。Return 看到 `EZ_SP` 開頭，會轉到感謝頁（`NEWEBPAY_SPONSOR_THANKS_PATH` 可改路徑）。
- 贊助成功時**不開通任何東西**，只會記錄下來。
- `PUBLIC_SPONSOR_HIDE=1` 會關掉整個贊助功能：
  - 區塊和頁尾按鈕都不顯示（build 時讀這個值）；
  - API 回 404（執行時讀這個值，Vercel 要兩邊都設）。

### 9-4. 藍新規則怎麼說（2026-10-30 讀官網原文）

結論先講：**沒有找到「個人可以收贊助」的明文，也沒有找到「一般網站贊助一律禁止」的明文；但有好幾條規定以「實質商品或服務的交易」為前提，和「贊助不提供任何商品或服務」衝突。** 所以結果是不明確，而且偏高風險。**開放前請 RY 先問藍新客服**（會員服務條款第二條列的客服：02-2786-3655、cs@newebpay.com）。

以下是原文引用（逐字）：

1. [平台產品使用規範](https://www.newebpay.com/website/Page/content/product_use_rule)（20260805 修訂版）
   - 第 2 條第 3 項：「除法令另有規定外，本公司僅就用戶間基於實質商品或服務之交易，辦理逐筆代收轉付行為。」
   - 第 3 條「信用卡」定義 1：「信用卡收付款方式，係指於用戶完成購買商品、服務交易後，會員接受付款方使用信用卡支付交易款項…」
2. [會員服務條款](https://www.newebpay.com/website/Page/content/new_service_policy)
   - 第三條：付款方是「因實質交易關係，利用本服務付款予交易相對人者」；會員是「因實質交易關係，利用本服務收受付款方支付之款項…之使用者」。
   - 第七條一：「本服務提供會員及付款方於實質交易關係成立後…代會員收受交易價金」。
   - 第二十條是藍新「捐款服務」這個加值服務的規定：要先取得主管機關核可才能申請。**這和本網站的贊助無關，我們不使用那個服務。**
3. [商店管理規範](https://www.newebpay.com/website/Page/content/store_policy)
   - 四、「對於【易生糾紛、部分非法或評估為高風險產業】，暫不受理」：
     - 第 3 點：「遊戲私人伺服器、贊助、代練、代儲服務、販售遊戲帳號」。這裡的「贊助」和遊戲項目寫在同一點，**原文沒有說明是不是只限遊戲**。
     - 第 17 點：「其他經評估屬高風險型產業或提供之商品(或服務)具爭議或無法明確判斷實際提供之服務內容，本平台有最終准駁使用收款服務之權利。」
4. 平台產品使用規範第 3 條「Apple Pay」限制 2(8)：這一條**只適用 Apple Pay**。本網站只開信用卡（`CREDIT=1`），沒有開 Apple Pay。
5. 個人會員額度：會員服務條款第十條只寫「本公司得對會員訂有收款額度上限」，沒有寫數字。修改對照表裡，舊條文的「個人會員 20 萬元」寫著已刪除。

### 9-5. 送藍新審核時要注意

- 審核的人會看網站。如果看到「贊助」按鈕，可能會套用上面的四、3 或四、17。
- **建議 RY 二選一：**
  - 先問清楚藍新可不可以收贊助；
  - 或在問清楚之前，用 `PUBLIC_SPONSOR_HIDE=1` 把贊助功能整個隱藏。
