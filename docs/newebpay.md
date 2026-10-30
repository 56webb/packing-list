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

測試檔：`tests/newebpay.test.mjs`（基本流程）、`tests/sponsor.test.mjs`（贊助）、`tests/newebpay-hardening.test.mjs`（邊界、竄改、錯誤處理、不外洩金鑰，見第 11 節）。目前共 47 則，全部通過。

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

## 6. 正式上線前檢查清單

標記說明：**【RY 決定】** = 需要 RY 拍板；**【L 可做】** = 工程可以先做、做完給 RY 看；**【實測】** = 要在 Preview 實際跑過才能打勾。

**商業與法務**
- [ ] **【RY 決定】** 商品、價格、是否真的要收費（`src/data/plans.json` 現在全是範例：一次付清 99 元、月繳 49 元 × 12 期）。
- [ ] **【RY 決定】** 贊助功能要不要上線、上下限是否維持 30–5000 元（`src/data/sponsor.json`）；不上線就在 Vercel 設 `PUBLIC_SPONSOR_HIDE=1`。
- [ ] **【RY 決定】** 藍新個人會員申請、拿到**正式**商店代號與金鑰；網站名稱要和藍新商店名稱相符（藍新〈商店管理規範〉一、1）。
- [ ] **【RY 決定】** 客服資訊（填進 `src/data/business.json`），要和藍新後台登記的一樣（〈商店管理規範〉一、3）。
- [ ] **【RY 決定】** 條款、退款政策定稿、拿掉 DRAFT 橫幅（建議找法律專業人士看過）。
- [ ] **【RY 決定】** 電子發票要不要開、用哪家（本 PR 沒有串接任何電子發票）。
- [ ] **【RY 決定】** 定期定額：週期、期數、金額；月扣款日要「一律 28 號」（現在的做法）還是「照訂閱當天，遇小月由藍新改月底」（手冊 NDNP-1.0.8 第 23 頁允許）。

**工程**
- [ ] **【L 可做】** 資料庫：把 `lib/newebpay/store.js` 換成 Supabase（`orders`、`payment_events` 兩張表，`event_key` 唯一）。**現在存在記憶體，Vercel 換一台機器就不見，正式收錢前一定要換。**（要用哪個 Supabase 專案：**【RY 決定】**）
- [ ] **【RY 決定】＋【L 可做】** 會員系統：付款後要開通給「誰」？現在網站沒有登入，Notify 裡的「開通」是 TODO。
- [ ] **【L 可做】** 定期定額的取消／改金額：接藍新「修改委託狀態」（`/MPG/period/AlterStatus`）、「修改委託內容」（`/MPG/period/AlterAmt`）API（NDNP-1.0.8 §4.4、§4.5），還沒做。
- [ ] **【L 可做】** 對帳：用「單筆交易查詢」API（`/API/QueryTradeInfo`，NDNF-1.2.6 §4.3 第 58 頁）定期補查 Notify 沒收到的訂單，還沒做。
- [ ] **【RY 決定】** 正式網域：NotifyURL 要能從網際網路連到、只能用 80／443 埠（NDNF-1.2.6 第 32 頁）。正式站現在是 GitHub Pages（純靜態），**跑不了 `/api`**；收款的網站要放在 Vercel（或其他能跑後端的地方）。
- [ ] **【RY 決定】** 部署到 Production、把 `NEWEBPAY_ENV` 改成 `production`（**改了才會真的扣款**）。

**測試（在 Preview 用測試金鑰）**
- [ ] **【實測】** 照第 10 節跑完一次一次付清：付款 → Vercel Logs 看到 `[newebpay][mpg-notify]` → 結果頁顯示成功。
- [ ] **【實測】** 定期定額跑一次（測試卡號未確認，見第 5 節）。
- [ ] **【實測】** 故意讓付款失敗一次（例如在付款頁按取消／等交易逾時），確認結果頁顯示失敗。
- [ ] **【實測】** 藍新後台查得到那筆測試交易，金額、訂單編號和 log 一致。

## 7. 還沒確認的地方（誠實列出）

- 根目錄 `api/` 的 Vercel Function 能不能和 Astro 靜態網站一起部署：依 Vercel 文件應該可以，但**沒有實際部署驗證**。
- `vercel.json` 有 `trailingSlash: true`，所以回呼網址都帶結尾斜線（`/api/newebpay/notify/`），避免藍新 POST 被 308 轉址；**沒實測**。
- `src/data/plans.json` 是用 `import ... with { type: 'json' }` 讀的，為保險在 `vercel.json` 加了 `includeFiles`；**沒實測**。
- 手冊寫 Notify 失敗會重送、連續 3 次失敗會寄信通知，但**沒寫重送間隔**。
- 手冊參數表寫 MPG `Version` 為 2.3，但範例程式用 2.0；程式用 2.3。
- ~~每月扣款日如果設 29–31 號遇到小月怎麼處理，手冊沒寫清楚~~ → **更正**：手冊 NDNP-1.0.8 §4.3.1（第 23 頁）有寫「若當月沒該日期則由該月的最後一天做為扣款日」。程式仍把扣款日限制在 1–28 號，是為了讓每個月扣款日相同（設計選擇，見第 6 節的 RY 決定事項）。
- Vercel Preview 若開著 Deployment Protection（Vercel 登入保護），藍新的 Notify 會被擋在外面（拿不到 HTTP 200）；要怎麼開放**沒實測**，見第 10 節步驟 3。
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

## 10. 拿到藍新「測試」金鑰後，在 Preview 跑一次測試付款（一步一步）

> 只用**測試環境**（`ccore.newebpay.com`），不會真的扣款。全程不需要改程式。
> 下面標「手冊」的都出自藍新〈線上交易－幕前支付技術串接手冊〉NDNF-1.2.6；「未確認」= 手冊沒寫、要實際操作才知道。

**步驟 1：在藍新測試後台拿金鑰**
1. 登入藍新**測試**平台的會員中心（測試平台的註冊／登入網址：手冊沒寫，**未確認**；測試帳號和正式帳號是分開的）。
2. 到【會員中心】→【商店管理】→【商店資料設定】，打開商店的「詳細資料」（手冊第 39–40 頁）。
3. 抄下三個值：**商店代號**（MerchantID，`MS` 開頭）、**HashKey**（32 字元）、**HashIV**（16 字元）——手冊稱為「商店之 API 串接金鑰」（第 19 頁）。
4. 確認這家測試商店有開「信用卡一次付清」。程式送出時會帶 `CREDIT=1`；手冊第 39 頁注意事項說「API 參數優先於後台設定」，但商店本身沒開通這個支付方式能不能用，**未確認**。
5. 同一個詳細資料頁可以設「API 應用 URL」；**不用填**，程式每筆交易都會帶 NotifyURL／ReturnURL，手冊說兩邊都有設時以 API 參數為主（第 39 頁）。

> ⚠️ 金鑰只能貼在 Vercel 的環境變數畫面。不要貼到聊天、Email、程式碼、GitHub。

**步驟 2：把金鑰填進 Vercel（只給 Preview）**
1. Vercel → 這個專案 → **Settings → Environment Variables**。
2. 新增 `NEWEBPAY_MERCHANT_ID`、`NEWEBPAY_HASH_KEY`、`NEWEBPAY_HASH_IV`，Environment **只勾 Preview**。
3. 新增 `NEWEBPAY_ENV` = `test`（只勾 Preview）。
4. 新增 `PUBLIC_PAYMENT_ENABLED` = `1`（只勾 Preview），價格頁按鈕才按得下去。
5. 環境變數改完**要重新部署**才生效：到 Deployments，找 `feat/newebpay` 分支最新那筆 → Redeploy（或推一個新 commit）。

**步驟 3：確認藍新連得到 Preview（Notify 需要）**
1. 用瀏覽器打開 `https://<preview 網址>/api/newebpay/status/`，應該看到：
   `configured: true`、`mode: "test"`、`missing: []`、`invalid: []`。
   - `missing` 有東西 = 那個變數沒設；`invalid` 有東西 = 長度不對（多貼了空白或貼錯值）。畫面**只顯示變數名稱，不顯示值**。
   - `warnings` 有「NEWEBPAY_ENV 只能是 test 或 production」= 打錯字，程式會當成 test。
2. 用**無痕視窗**再開一次同一個網址。如果被要求登入 Vercel，表示 Preview 有 Deployment Protection，藍新的 Notify 也會被擋（藍新只認 HTTP 200，Retry 三次失敗就算 Notify 失敗——手冊第 96 頁）。
   - 處理方式（**【RY 決定】**）：暫時關掉這個專案 Preview 的 Deployment Protection，測完再開回來；或改用其他開放的測試網址。實際該怎麼設**未實測**。
3. NotifyURL 只接受 80／443 埠（手冊第 32 頁）；Vercel 的 `https://` 網址是 443，沒問題。

**步驟 4：付一筆測試款**
1. 打開 `https://<preview 網址>/zh-tw/pricing/`，選一次付清方案，勾同意條款，按付款。
2. 會被帶到 `ccore.newebpay.com` 的付款頁（測試環境網址，手冊第 29 頁）。看網址列確認是 **ccore**（測試），不是 core（正式）。
3. 信用卡輸入測試卡號 `4000-2211-1111-1111`；有效月年、背面末三碼隨便填（手冊附錄 1，第 99 頁）。
4. 付款頁停太久會失敗：程式設 `TradeLimit=600`（10 分鐘，手冊第 31 頁）；建單到送出若超過 120 秒，`TimeStamp` 也可能被拒（手冊第 30、96 頁）——重新按一次付款即可。

**步驟 5：確認結果**
1. 付完會被帶回網站結果頁，應該顯示成功。**但結果頁只是給人看的**——手冊說交易結果要以 Notify 為準，不能只看 ReturnURL（第 32 頁）。
2. Vercel → 這個 Preview 部署 → **Logs**，搜尋 `[newebpay]`：
   - 看到 `[newebpay][mpg-notify]` 而且是成功 = Notify 有收到、驗章通過、金額相符。
   - 看到 `bad_tradesha` = 金鑰不對（Vercel 填的和藍新後台不一致）。
   - 看到「金額不符」= 要停下來檢查，不要開通。
   - 什麼都沒看到 = Notify 沒進來，回到步驟 3-2；另外看藍新有沒有寄「Notify 觸發失敗通知信」（手冊第 96 頁）。
3. 到藍新測試後台的交易查詢，確認那筆訂單（`EZ_TP_` 開頭）金額正確。
4. ⚠️ 現在訂單存在記憶體（`store.js`）。如果建單和 Notify 跑在不同機器，Notify 會改用 `plans.json` 的金額核對，仍然安全，但「訂單狀態」可能查不到——這是已知限制，換 Supabase 後就會正常。

**步驟 6：測完收尾**
- 測試金鑰可以留在 Preview；**不要**勾 Production。
- 如果暫時關了 Deployment Protection，記得開回來。
- 結果（成功／失敗、log 截圖時把訂單編號以外的資料遮掉）回報給 L，對照第 6 節清單打勾。

## 11. 安全設計（2026-10-31 補強）

| 風險 | 做法 | 程式位置 | 測試 |
|---|---|---|---|
| 有人偽造付款成功通知 | MPG：先用 TradeSha 驗章（`timingSafeEqual` 固定時間比對，先檢查是 64 位 hex），才解密 | `crypto.js` `verifyTradeSha` | `newebpay-hardening.test.mjs` TradeSha 兩則 |
| 定期定額沒有 TradeSha | 只認「用我們金鑰解得開＋Result 裡 MerchantID 是我們的」；缺 MerchantID 一律拒絕 | `period.js` `decodePeriod` | 定期定額 Notify 兩則 |
| 用別家商店的通知 | MPG 外層與 Result 的 MerchantID 都要等於我們的（手冊 4.2.2 共同回傳參數） | `mpg.js` `decodeMpgResponse` | MerchantID 測試 |
| 金額被動手腳 | 金額只接受純數字，和「我們存的訂單金額」比，沒有就用 `plans.json`／訂單編號裡的贊助金額；定期定額成功通知沒帶金額也不開通 | `mpg.js` `isSameAmount` | 金額比對測試 |
| 藍新重送通知 | 冪等 key 用我們的訂單編號，同一張單只開通一次；已付款的單之後收到失敗通知不會被改回去 | `mpg.js`、`store.js` | 重複通知、已付款不降級 |
| 怪輸入讓程式 500 | JSON 不是物件、欄位不是字串一律當壞資料回 400；本體超過 64 KB 回 413；Email 限 50 字（手冊第 32 頁、NDNP 第 25 頁） | `router.js` `readForm` | 輸入檢查測試 |
| 設定錯誤 | 金鑰缺或長度不對都回 503「金流尚未設定」（不會 500），`/status/` 只列變數名稱 | `config.js` | 環境變數三則 |
| 金鑰外洩 | 錯誤訊息、回應、log 都不含 HashKey／HashIV；500 只回 `server_error` | 全部 | 不外洩金鑰測試 |
| 設定檔寫錯 | `plans.json` 的定期定額設定（週期、扣款日、期數 1–99、金額）在建單前檢查（NDNP-1.0.8 第 23–24 頁、錯誤碼 PER10013、PER10022–24） | `period.js` `checkPeriodSettings` | Period 參數三則 |
