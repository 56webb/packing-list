// 藍新金流單元測試：用官方手冊的範例數值確認加解密正確。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aesEncrypt, aesDecrypt, tradeSha, verifyTradeSha, buildQuery, parseQuery } from '../lib/newebpay/crypto.js';
import { decodeMpgResponse, buildMpgForm, handleMpgNotify } from '../lib/newebpay/mpg.js';
import { buildPeriodForm, decodePeriod, handlePeriodNotify } from '../lib/newebpay/period.js';
import { getPlan, makeOrderNo, planFromOrderNo } from '../lib/newebpay/plans.js';
import { getConfig } from '../lib/newebpay/config.js';
import { memoryStore } from '../lib/newebpay/store.js';
import { handle } from '../lib/newebpay/router.js';

const V = JSON.parse(fs.readFileSync(new URL('./fixtures/newebpay-doc-vectors.json', import.meta.url), 'utf8'));
const quiet = { info() {}, warn() {}, error() {} };
const mpgCfg = { merchantId: V.mpg.merchantId, hashKey: V.mpg.hashKey, hashIV: V.mpg.hashIV };
const perCfg = { merchantId: V.period.merchantId, hashKey: V.period.hashKey, hashIV: V.period.hashIV };

test('MPG：AES 加密結果和手冊範例一樣（NDNF-1.2.6 §4.1.1）', () => {
  assert.equal(aesEncrypt(V.mpg.plain, V.mpg.hashKey, V.mpg.hashIV), V.mpg.cipher);
  assert.equal(aesDecrypt(V.mpg.cipher, V.mpg.hashKey, V.mpg.hashIV), V.mpg.plain);
});

test('MPG：TradeSha 和手冊範例一樣（NDNF-1.2.6 §4.1.2）', () => {
  assert.equal(tradeSha(V.mpg.cipher, V.mpg.hashKey, V.mpg.hashIV), V.mpg.tradeSha);
  assert.ok(verifyTradeSha(V.mpg.cipher, V.mpg.tradeSha.toLowerCase(), V.mpg.hashKey, V.mpg.hashIV));
  assert.ok(!verifyTradeSha(V.mpg.cipher, '0'.repeat(64), V.mpg.hashKey, V.mpg.hashIV));
});

test('MPG：手冊的 Notify 範例可以驗章並解密（NDNF-1.2.6 §4.1.3–4.1.4）', () => {
  assert.equal(tradeSha(V.mpg.notifyTradeInfo, V.mpg.hashKey, V.mpg.hashIV), V.mpg.notifyTradeSha);
  assert.equal(aesDecrypt(V.mpg.notifyTradeInfo, V.mpg.hashKey, V.mpg.hashIV), V.mpg.notifyPlain);
  const d = decodeMpgResponse(mpgCfg, { Status: 'SUCCESS', MerchantID: V.mpg.merchantId, Version: '2.0', TradeInfo: V.mpg.notifyTradeInfo, TradeSha: V.mpg.notifyTradeSha });
  assert.equal(d.ok, true);
  assert.equal(d.status, 'SUCCESS');
  assert.equal(d.message, '授權成功');
  assert.equal(d.result.Amt, '30');
  assert.equal(d.result.MerchantOrderNo, 'Vanespl_ec_1695795668');
  assert.equal(d.result.PayTime, '2023-09-27 14:21:59');
});

test('MPG：TradeSha 被竄改就拒絕', () => {
  const d = decodeMpgResponse(mpgCfg, { MerchantID: V.mpg.merchantId, TradeInfo: V.mpg.notifyTradeInfo, TradeSha: V.mpg.tradeSha });
  assert.deepEqual(d, { ok: false, error: 'bad_tradesha' });
  const d2 = decodeMpgResponse(mpgCfg, { MerchantID: 'OTHER', TradeInfo: V.mpg.notifyTradeInfo, TradeSha: V.mpg.notifyTradeSha });
  assert.equal(d2.error, 'merchant_mismatch');
});

test('定期定額：PostData_ 加密結果和手冊範例一樣（NDNP-1.0.8 §4.1）', () => {
  assert.equal(aesEncrypt(V.period.plain, V.period.hashKey, V.period.hashIV), V.period.cipher);
});

test('定期定額：手冊的回傳 Period 可以解密成 JSON（NDNP-1.0.8 §4.2）', () => {
  const d = decodePeriod(perCfg, { Period: V.period.responsePeriod });
  assert.equal(d.ok, true);
  assert.equal(d.status, 'SUCCESS');
  assert.equal(d.result.MerchantOrderNo, 'myorder1700033460');
  assert.equal(d.result.PeriodNo, 'P231115153213aMDNWZ');
  assert.equal(String(d.result.PeriodAmt), '10');
  assert.equal(d.result.RespondCode, '00');
  assert.equal(decodePeriod(perCfg, { Period: 'abcd' }).ok, false);
});

test('buildQuery 和手冊範例的 query string 格式相同（空白變 +、@ 變 %40）', () => {
  const q = buildQuery({ ProdDesc: 'Test commssion', PayerEmail: 'test@neweb.com.tw', Skip: undefined });
  assert.equal(q, 'ProdDesc=Test+commssion&PayerEmail=test%40neweb.com.tw');
  assert.deepEqual(parseQuery(q), { ProdDesc: 'Test commssion', PayerEmail: 'test@neweb.com.tw' });
});

test('訂單編號：英數底線、最多 30 字、可以找回方案', () => {
  const plan = getPlan('trip-pack');
  for (let i = 0; i < 50; i++) {
    const no = makeOrderNo(plan);
    assert.match(no, /^[A-Za-z0-9_]{1,30}$/);
    assert.equal(planFromOrderNo(no).id, 'trip-pack');
  }
  assert.equal(planFromOrderNo('Vanespl_ec_1'), null);
});

test('buildMpgForm：金額來自 plans.json，Version 2.3，可以解回來', () => {
  const plan = getPlan('trip-pack');
  const orderNo = makeOrderNo(plan);
  const f = buildMpgForm(mpgCfg, { plan, orderNo, email: 'a@example.com', now: 1700000000000, returnUrl: 'https://x.test/r/', notifyUrl: 'https://x.test/n/', clientBackUrl: 'https://x.test/b/' });
  assert.equal(f.Version, '2.3');
  assert.equal(f.TradeSha, tradeSha(f.TradeInfo, mpgCfg.hashKey, mpgCfg.hashIV));
  const p = parseQuery(aesDecrypt(f.TradeInfo, mpgCfg.hashKey, mpgCfg.hashIV));
  assert.equal(p.Amt, String(plan.priceTwd));
  assert.equal(p.MerchantOrderNo, orderNo);
  assert.equal(p.TimeStamp, '1700000000');
  assert.equal(p.CREDIT, '1');
  assert.ok(p.ItemDesc.length <= 50);
});

// 模擬藍新送來的 Notify（RespondType=JSON）
function fakeMpgNotify(cfg, result, status = 'SUCCESS') {
  const ti = aesEncrypt(JSON.stringify({ Status: status, Message: 'x', Result: result }), cfg.hashKey, cfg.hashIV);
  return { Status: status, MerchantID: cfg.merchantId, Version: '2.3', TradeInfo: ti, TradeSha: tradeSha(ti, cfg.hashKey, cfg.hashIV) };
}

test('MPG Notify：成功、重複通知不重複開通、金額不符不開通、簽章錯回 400', async () => {
  memoryStore._reset();
  const plan = getPlan('trip-pack');
  const orderNo = makeOrderNo(plan);
  await memoryStore.saveOrder({ merchantOrderNo: orderNo, amount: plan.priceTwd, status: 'pending' });
  const ok = fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: plan.priceTwd, TradeNo: 'T1' });
  let r = await handleMpgNotify(mpgCfg, ok, memoryStore, quiet);
  assert.equal(r.httpStatus, 200);
  assert.deepEqual(r.body, { ok: true, paid: true, duplicate: false });
  assert.equal((await memoryStore.getOrder(orderNo)).status, 'paid');
  r = await handleMpgNotify(mpgCfg, ok, memoryStore, quiet);
  assert.equal(r.body.duplicate, true);

  const bad = fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: makeOrderNo(plan), Amt: 1, TradeNo: 'T2' });
  r = await handleMpgNotify(mpgCfg, bad, memoryStore, quiet);
  assert.equal(r.httpStatus, 200);
  assert.equal(r.body.error, 'amount_mismatch');

  r = await handleMpgNotify(mpgCfg, { ...ok, TradeSha: 'X' }, memoryStore, quiet);
  assert.equal(r.httpStatus, 400);

  const fail = fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: plan.priceTwd }, 'MPG03009');
  r = await handleMpgNotify(mpgCfg, fail, memoryStore, quiet);
  assert.equal(r.body.paid, false);
});

test('定期定額：建立表單可解回、Notify 建立完成與每期授權都能處理且冪等', async () => {
  memoryStore._reset();
  const plan = getPlan('plus-monthly');
  const orderNo = makeOrderNo(plan);
  const f = buildPeriodForm(perCfg, { plan, orderNo, email: 'a@example.com', now: Date.UTC(2026, 9, 30, 20), returnUrl: 'https://x.test/r/', notifyUrl: 'https://x.test/n/', backUrl: 'https://x.test/b/' });
  assert.equal(f.MerchantID_, perCfg.merchantId);
  const p = parseQuery(aesDecrypt(f.PostData_, perCfg.hashKey, perCfg.hashIV));
  assert.equal(p.Version, '1.5');
  assert.equal(p.PeriodAmt, String(plan.priceTwd));
  assert.equal(p.PeriodType, 'M');
  assert.equal(p.PeriodPoint, '28'); // 台北 10/31 → 改成 28 號
  assert.match(p.ProdDesc, /^[\p{Script=Han}A-Za-z0-9 _]+$/u);

  const enc = (obj) => ({ Period: aesEncrypt(JSON.stringify(obj), perCfg.hashKey, perCfg.hashIV) });
  const create = enc({ Status: 'SUCCESS', Message: 'ok', Result: { MerchantID: perCfg.merchantId, MerchantOrderNo: orderNo, PeriodAmt: plan.priceTwd, PeriodNo: 'P1', AuthTimes: 12 } });
  let r = await handlePeriodNotify(perCfg, create, memoryStore, quiet);
  assert.deepEqual(r.body, { ok: true, kind: 'create', paid: true, duplicate: false });
  r = await handlePeriodNotify(perCfg, create, memoryStore, quiet);
  assert.equal(r.body.duplicate, true);

  const each = enc({ Status: 'SUCCESS', Message: 'ok', Result: { MerchantID: perCfg.merchantId, MerchantOrderNo: orderNo, OrderNo: `${orderNo}_2`, AuthAmt: plan.priceTwd, AlreadyTimes: '2', TotalTimes: '12', PeriodNo: 'P1' } });
  r = await handlePeriodNotify(perCfg, each, memoryStore, quiet);
  assert.equal(r.body.kind, 'each');
  assert.equal(r.body.duplicate, false);

  const wrong = enc({ Status: 'SUCCESS', Result: { MerchantID: perCfg.merchantId, MerchantOrderNo: orderNo, OrderNo: `${orderNo}_3`, AuthAmt: 1 } });
  r = await handlePeriodNotify(perCfg, wrong, memoryStore, quiet);
  assert.equal(r.body.error, 'amount_mismatch');

  r = await handlePeriodNotify(perCfg, { Period: 'zz' }, memoryStore, quiet);
  assert.equal(r.httpStatus, 400);
});

test('設定：預設是測試環境，沒有金鑰時 API 回 503', async () => {
  const cfg = getConfig({});
  assert.equal(cfg.mode, 'test');
  assert.equal(cfg.gateway.mpg, 'https://ccore.newebpay.com/MPG/mpg_gateway');
  assert.equal(getConfig({ NEWEBPAY_ENV: 'production' }).gateway.mpg, 'https://core.newebpay.com/MPG/mpg_gateway');
  const res = await handle(new Request('https://x.test/api/newebpay/create-order/', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), { env: {}, log: quiet });
  assert.equal(res.status, 503);
  const st = await handle(new Request('https://x.test/api/newebpay?route=status/'), { env: {}, log: quiet });
  assert.equal((await st.json()).configured, false);
});

test('API：要勾同意才建立訂單；成功時回傳測試環境網址與欄位', async () => {
  const env = { NEWEBPAY_MERCHANT_ID: mpgCfg.merchantId, NEWEBPAY_HASH_KEY: mpgCfg.hashKey, NEWEBPAY_HASH_IV: mpgCfg.hashIV };
  const post = (route, body) => handle(new Request(`https://x.test/api/newebpay?route=${route}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { env, log: quiet, store: memoryStore });
  assert.equal((await post('create-order/', { planId: 'trip-pack' })).status, 400);
  assert.equal((await post('create-order/', { planId: 'plus-monthly', agree: true })).status, 400);
  const res = await post('create-order/', { planId: 'trip-pack', agree: true, email: 'a@example.com' });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.action, 'https://ccore.newebpay.com/MPG/mpg_gateway');
  assert.deepEqual(Object.keys(data.fields).sort(), ['MerchantID', 'TradeInfo', 'TradeSha', 'Version']);
  const p = parseQuery(aesDecrypt(data.fields.TradeInfo, mpgCfg.hashKey, mpgCfg.hashIV));
  assert.equal(p.NotifyURL, 'https://x.test/api/newebpay/notify/');
  assert.equal(p.ReturnURL, 'https://x.test/api/newebpay/return/');

  assert.equal((await post('period/create/', { planId: 'plus-monthly', agree: true })).status, 400); // 缺 Email
  const pr = await post('period/create/', { planId: 'plus-monthly', agree: true, email: 'a@example.com' });
  const pd = await pr.json();
  assert.equal(pd.action, 'https://ccore.newebpay.com/MPG/period');
  assert.deepEqual(Object.keys(pd.fields).sort(), ['MerchantID_', 'PostData_']);

  // ReturnURL：Form Post（urlencoded）→ 303 轉到結果頁
  const ok = fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: data.orderNo, Amt: 99 });
  const ret = await handle(new Request('https://x.test/api/newebpay/return/', { method: 'POST', body: new URLSearchParams(ok) }), { env, log: quiet, store: memoryStore });
  assert.equal(ret.status, 303);
  assert.match(ret.headers.get('location'), /^\/zh-tw\/payment\/result\/\?type=mpg&status=success&order=EZ_TP_/);

  // Notify 用 multipart/form-data 送也要能解析
  const fd = new FormData();
  for (const [k, v] of Object.entries(ok)) fd.append(k, v);
  const nres = await handle(new Request('https://x.test/api/newebpay/notify/', { method: 'POST', body: fd }), { env, log: quiet, store: memoryStore });
  assert.equal(nres.status, 200);
});
