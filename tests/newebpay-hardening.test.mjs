// 藍新金流：補強測試（邊界、竄改、錯誤處理、不外洩金鑰）。執行：npm test
// 規格來源：NDNF-1.2.6（MPG）、NDNP-1.0.8（定期定額），頁碼寫在各測試名稱裡。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aesEncrypt, aesDecrypt, tradeSha, verifyTradeSha } from '../lib/newebpay/crypto.js';
import { decodeMpgResponse, buildMpgForm, handleMpgNotify, isSameAmount } from '../lib/newebpay/mpg.js';
import { buildPeriodForm, checkPeriodSettings, decodePeriod, handlePeriodNotify, monthlyPoint } from '../lib/newebpay/period.js';
import { getPlan, makeOrderNo } from '../lib/newebpay/plans.js';
import { getConfig } from '../lib/newebpay/config.js';
import { memoryStore } from '../lib/newebpay/store.js';
import { handle, MAX_BODY_BYTES } from '../lib/newebpay/router.js';
import { sponsorData, validateSponsorAmount, makeSponsorOrderNo } from '../lib/newebpay/sponsor.js';

const V = JSON.parse(fs.readFileSync(new URL('./fixtures/newebpay-doc-vectors.json', import.meta.url), 'utf8'));
const quiet = { info() {}, warn() {}, error() {} };
const mpgCfg = { merchantId: V.mpg.merchantId, hashKey: V.mpg.hashKey, hashIV: V.mpg.hashIV };
const perCfg = { merchantId: V.period.merchantId, hashKey: V.period.hashKey, hashIV: V.period.hashIV };
const ENV = { NEWEBPAY_MERCHANT_ID: mpgCfg.merchantId, NEWEBPAY_HASH_KEY: mpgCfg.hashKey, NEWEBPAY_HASH_IV: mpgCfg.hashIV };

function fakeMpgNotify(cfg, result, status = 'SUCCESS') {
  const ti = aesEncrypt(JSON.stringify({ Status: status, Message: 'x', Result: result }), cfg.hashKey, cfg.hashIV);
  return { Status: status, MerchantID: cfg.merchantId, Version: '2.3', TradeInfo: ti, TradeSha: tradeSha(ti, cfg.hashKey, cfg.hashIV) };
}
const encPeriod = (obj, cfg = perCfg) => ({ Period: aesEncrypt(JSON.stringify(obj), cfg.hashKey, cfg.hashIV) });
const post = (route, body, env = ENV, { log = quiet, raw } = {}) =>
  handle(new Request(`https://x.test/api/newebpay?route=${route}`, { method: 'POST', body: raw ?? JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { env, log, store: memoryStore });

// 收集 log，確認裡面沒有金鑰
function spyLog() {
  const lines = [];
  const rec = (...a) => lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  return { log: { info: rec, warn: rec, error: rec }, text: () => lines.join('\n') };
}

// ---------- AES ----------
test('AES：手冊範例（NDNF-1.2.6 §4.1.1、NDNP-1.0.8 §4.1）來回加解密都一致，輸出是小寫 hex', () => {
  for (const v of [V.mpg, V.period]) {
    const c = aesEncrypt(v.plain, v.hashKey, v.hashIV);
    assert.equal(c, v.cipher);
    assert.match(c, /^[0-9a-f]+$/);
    assert.equal(c.length % 32, 0); // PKCS7 補到 16 bytes 的倍數
    assert.equal(aesDecrypt(c, v.hashKey, v.hashIV), v.plain);
    assert.equal(aesDecrypt(c.toUpperCase(), v.hashKey, v.hashIV), v.plain); // 大寫 hex 也能解
  }
});

test('AES：PKCS7 邊界——剛好 16 bytes、空字串、中文都能來回', () => {
  for (const s of ['', 'a'.repeat(16), 'a'.repeat(31), '中文測試 EZpakku']) {
    assert.equal(aesDecrypt(aesEncrypt(s, mpgCfg.hashKey, mpgCfg.hashIV), mpgCfg.hashKey, mpgCfg.hashIV), s);
  }
  assert.equal(aesEncrypt('a'.repeat(16), mpgCfg.hashKey, mpgCfg.hashIV).length, 64); // 16 bytes → 多補一整塊
});

test('AES：錯的金鑰、壞掉的 hex、長度不對都會丟錯，錯誤訊息不含金鑰', () => {
  const wrongKey = 'X'.repeat(32);
  for (const fn of [
    () => aesDecrypt(V.mpg.cipher, wrongKey, V.mpg.hashIV),
    () => aesDecrypt('zz', V.mpg.hashKey, V.mpg.hashIV),
    () => aesDecrypt('abcd', V.mpg.hashKey, V.mpg.hashIV),
    () => aesEncrypt('x', 'short', V.mpg.hashIV),
    () => aesEncrypt('x', V.mpg.hashKey, 'short'),
  ]) {
    let msg = '';
    try { fn(); } catch (e) { msg = String(e && e.message); }
    assert.ok(msg, '應該要丟錯');
    assert.ok(!msg.includes(V.mpg.hashKey) && !msg.includes(V.mpg.hashIV) && !msg.includes(wrongKey), `錯誤訊息洩漏金鑰：${msg}`);
  }
});

// ---------- TradeSha ----------
test('TradeSha：手冊範例；大小寫都接受；格式不對、非字串一律回 false（不丟例外）', () => {
  assert.equal(tradeSha(V.mpg.cipher, V.mpg.hashKey, V.mpg.hashIV), V.mpg.tradeSha);
  assert.match(V.mpg.tradeSha, /^[0-9A-F]{64}$/); // 手冊：SHA256 後轉大寫
  assert.ok(verifyTradeSha(V.mpg.cipher, V.mpg.tradeSha, V.mpg.hashKey, V.mpg.hashIV));
  assert.ok(verifyTradeSha(V.mpg.cipher, V.mpg.tradeSha.toLowerCase(), V.mpg.hashKey, V.mpg.hashIV));
  for (const bad of ['', 'X', V.mpg.tradeSha.slice(0, 63), V.mpg.tradeSha + '0', 'G'.repeat(64), ` ${V.mpg.tradeSha}`, null, undefined, 123, [V.mpg.tradeSha], { a: 1 }]) {
    assert.equal(verifyTradeSha(V.mpg.cipher, bad, V.mpg.hashKey, V.mpg.hashIV), false, `應拒絕 ${String(bad)}`);
  }
  assert.equal(verifyTradeSha([V.mpg.cipher], V.mpg.tradeSha, V.mpg.hashKey, V.mpg.hashIV), false);
  assert.throws(() => tradeSha(123, V.mpg.hashKey, V.mpg.hashIV), TypeError);
});

test('TradeSha：TradeInfo 被改一個字元，或用別人的金鑰簽，就驗不過', () => {
  const flipped = (V.mpg.cipher[0] === 'a' ? 'b' : 'a') + V.mpg.cipher.slice(1);
  assert.equal(verifyTradeSha(flipped, V.mpg.tradeSha, V.mpg.hashKey, V.mpg.hashIV), false);
  const other = { merchantId: mpgCfg.merchantId, hashKey: 'K'.repeat(32), hashIV: 'I'.repeat(16) };
  const forged = fakeMpgNotify(other, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: 'EZ_TP_1', Amt: 99 });
  assert.equal(decodeMpgResponse(mpgCfg, forged).error, 'bad_tradesha');
});

// ---------- MPG Notify ----------
test('MPG Notify：簽章錯、欄位缺、欄位型態不對都回 400；HTTP 400 不會開通', async () => {
  memoryStore._reset();
  const plan = getPlan('trip-pack');
  const orderNo = makeOrderNo(plan);
  const ok = fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: 99, TradeNo: 'T1' });
  for (const body of [
    { ...ok, TradeSha: '0'.repeat(64) },
    { ...ok, TradeSha: undefined },
    { ...ok, TradeInfo: undefined },
    { ...ok, TradeInfo: [ok.TradeInfo] },
    { ...ok, TradeSha: { x: 1 } },
    { ...ok, MerchantID: 'MS999999999' },
    {},
    null,
  ]) {
    const r = await handleMpgNotify(mpgCfg, body, memoryStore, quiet);
    assert.equal(r.httpStatus, 400, JSON.stringify(body && Object.keys(body)));
  }
  assert.equal(await memoryStore.getOrder(orderNo), null);
});

test('MPG Notify：Result 裡的 MerchantID 缺少或不是我們的，就拒絕（手冊 4.2.2 共同回傳參數）', () => {
  const noMid = fakeMpgNotify(mpgCfg, { MerchantOrderNo: 'EZ_TP_1', Amt: 99 });
  assert.equal(decodeMpgResponse(mpgCfg, noMid).error, 'merchant_mismatch');
  const other = fakeMpgNotify(mpgCfg, { MerchantID: 'MS000000001', MerchantOrderNo: 'EZ_TP_1', Amt: 99 });
  assert.equal(decodeMpgResponse(mpgCfg, other).error, 'merchant_mismatch');
});

test('MPG Notify：金額比對很嚴格——字串數字可以，空字串、小數、科學記號、多空白都不行', async () => {
  assert.ok(isSameAmount('99', 99));
  assert.ok(isSameAmount(99, 99));
  for (const bad of ['', ' 99', '99 ', '99.0', '9.9e1', '0x63', null, undefined, [99], true, -99, 99.5, '099x']) {
    assert.equal(isSameAmount(bad, 99), false, `應拒絕 ${String(bad)}`);
  }
  memoryStore._reset();
  const plan = getPlan('trip-pack');
  const orderNo = makeOrderNo(plan);
  await memoryStore.saveOrder({ merchantOrderNo: orderNo, amount: 99, status: 'pending' });
  const r = await handleMpgNotify(mpgCfg, fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: '99.0', TradeNo: 'T1' }), memoryStore, quiet);
  assert.equal(r.body.error, 'amount_mismatch');
  assert.equal((await memoryStore.getOrder(orderNo)).status, 'amount_mismatch');
});

test('MPG Notify：重複通知（就算 TradeNo 不同或沒帶）只開通一次', async () => {
  memoryStore._reset();
  const plan = getPlan('trip-pack');
  const orderNo = makeOrderNo(plan);
  await memoryStore.saveOrder({ merchantOrderNo: orderNo, amount: 99, status: 'pending' });
  const mk = (tradeNo) => fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: 99, ...(tradeNo ? { TradeNo: tradeNo } : {}) });
  const results = [];
  for (const b of [mk('T1'), mk('T1'), mk('T2'), mk(null), mk('T1')]) results.push((await handleMpgNotify(mpgCfg, b, memoryStore, quiet)).body.duplicate);
  assert.deepEqual(results, [false, true, true, true, true]);
});

test('MPG Notify：已付款後才來的失敗／金額不符通知，不會把訂單改回未付款', async () => {
  memoryStore._reset();
  const plan = getPlan('trip-pack');
  const orderNo = makeOrderNo(plan);
  await memoryStore.saveOrder({ merchantOrderNo: orderNo, amount: 99, status: 'pending' });
  await handleMpgNotify(mpgCfg, fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: 99, TradeNo: 'T1' }), memoryStore, quiet);
  assert.equal((await memoryStore.getOrder(orderNo)).status, 'paid');
  const fail = await handleMpgNotify(mpgCfg, fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: 99 }, 'MPG03009'), memoryStore, quiet);
  assert.equal(fail.httpStatus, 200);
  assert.equal(fail.body.paid, false);
  await handleMpgNotify(mpgCfg, fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: 1, TradeNo: 'T9' }), memoryStore, quiet);
  assert.equal((await memoryStore.getOrder(orderNo)).status, 'paid');
});

test('MPG Notify：未付款訂單收到失敗通知 → 記成 failed；同一個失敗碼重送只記一次', async () => {
  memoryStore._reset();
  const plan = getPlan('trip-pack');
  const orderNo = makeOrderNo(plan);
  await memoryStore.saveOrder({ merchantOrderNo: orderNo, amount: 99, status: 'pending' });
  const b = fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: 99 }, 'MPG03009');
  const r1 = await handleMpgNotify(mpgCfg, b, memoryStore, quiet);
  const r2 = await handleMpgNotify(mpgCfg, b, memoryStore, quiet);
  assert.equal(r1.httpStatus, 200);
  assert.equal(r2.httpStatus, 200);
  const o = await memoryStore.getOrder(orderNo);
  assert.equal(o.status, 'failed');
  assert.equal(o.failCode, 'MPG03009');
});

test('buildMpgForm：金額不是正整數、訂單編號不合規格就不建立（NDNF-1.2.6 第 31 頁）', () => {
  const base = { orderNo: 'EZ_TP_1', email: '', returnUrl: 'https://x.test/r/', notifyUrl: 'https://x.test/n/', clientBackUrl: 'https://x.test/b/' };
  const plan = getPlan('trip-pack');
  for (const priceTwd of [0, -1, 9.5, NaN, '99']) {
    assert.throws(() => buildMpgForm(mpgCfg, { ...base, plan: { ...plan, priceTwd } }), /金額/);
  }
  for (const orderNo of ['', 'has space', 'a-b', 'x'.repeat(31), '訂單']) {
    assert.throws(() => buildMpgForm(mpgCfg, { ...base, plan, orderNo }), /訂單編號/);
  }
  const f = buildMpgForm(mpgCfg, { ...base, plan, orderNo: 'x'.repeat(30) });
  assert.equal(f.MerchantID, mpgCfg.merchantId);
});

// ---------- 定期定額 Period 參數 ----------
const sub = (period, priceTwd = 49) => ({ id: 't', type: 'subscription', name: '測試', priceTwd, period });

test('定期定額 checkPeriodSettings：合法的 D/W/M/Y 設定都通過（NDNP-1.0.8 第 23–24 頁）', () => {
  for (const p of [
    { type: 'D', point: '2', times: 1 },
    { type: 'D', point: '364', times: 99 },
    { type: 'W', point: '1' },
    { type: 'W', point: '7' },
    { type: 'M' },
    { type: 'M', point: '01' },
    { type: 'M', point: '31' },
    { type: 'Y', point: '0101' },
    { type: 'Y', point: '1231', startType: 3 },
  ]) {
    assert.deepEqual(checkPeriodSettings(sub(p)), [], JSON.stringify(p));
  }
  assert.deepEqual(checkPeriodSettings(getPlan('plus-monthly')), []); // plans.json 現在的設定
});

test('定期定額 checkPeriodSettings：不合法的週期、扣款日、期數、金額都擋下', () => {
  const bad = [
    { type: 'X', point: '1' },
    { type: 'D', point: '1' },
    { type: 'D', point: '365' },
    { type: 'D' },
    { type: 'W', point: '0' },
    { type: 'W', point: '8' },
    { type: 'M', point: '1' }, // 要兩位數 01–31
    { type: 'M', point: '32' },
    { type: 'Y', point: '1301' },
    { type: 'Y', point: '0132' },
    { type: 'M', times: 0 },
    { type: 'M', times: 100 },
    { type: 'M', times: 1.5 },
    { type: 'M', startType: 4 },
  ];
  for (const p of bad) assert.ok(checkPeriodSettings(sub(p)).length > 0, `應拒絕 ${JSON.stringify(p)}`);
  for (const price of [0, -49, 49.5, 1000000]) assert.ok(checkPeriodSettings(sub({ type: 'M' }, price)).length > 0, `應拒絕金額 ${price}`);
  assert.ok(checkPeriodSettings({ type: 'subscription', priceTwd: 49 }).length > 0);
});

test('定期定額 buildPeriodForm：設定錯就丟錯；正確的 W/Y 設定會照填 PeriodPoint／PeriodTimes', () => {
  const opts = { orderNo: 'EZ_PM_1', email: 'a@example.com', now: Date.UTC(2026, 0, 15), returnUrl: 'https://x.test/r/', notifyUrl: 'https://x.test/n/', backUrl: 'https://x.test/b/' };
  assert.throws(() => buildPeriodForm(perCfg, { ...opts, plan: sub({ type: 'W', point: '9' }) }), /訂閱設定有誤/);
  assert.throws(() => buildPeriodForm(perCfg, { ...opts, plan: sub({ type: 'M', times: 120 }) }), /訂閱設定有誤/);
  assert.throws(() => buildPeriodForm(perCfg, { ...opts, plan: sub({ type: 'M' }), email: '' }), /PayerEmail/);
  assert.throws(() => buildPeriodForm(perCfg, { ...opts, plan: sub({ type: 'M' }), orderNo: 'bad no' }), /訂單編號/);
  for (const [period, point, times] of [[{ type: 'W', point: '5', times: 10 }, '5', '10'], [{ type: 'Y', point: '0315', times: 3 }, '0315', '3']]) {
    const f = buildPeriodForm(perCfg, { ...opts, plan: sub(period) });
    const q = new URLSearchParams(aesDecrypt(f.PostData_, perCfg.hashKey, perCfg.hashIV));
    assert.equal(q.get('PeriodType'), period.type);
    assert.equal(q.get('PeriodPoint'), point);
    assert.equal(q.get('PeriodTimes'), times);
    assert.equal(q.get('PeriodAmt'), '49');
    assert.equal(q.get('PayerEmail'), 'a@example.com');
  }
});

test('定期定額 monthlyPoint：台北時間 1–28 號照用，29–31 號改成 28；跨日用台北時區', () => {
  assert.equal(monthlyPoint(Date.UTC(2026, 0, 1, 0)), '01');
  assert.equal(monthlyPoint(Date.UTC(2026, 0, 28, 3)), '28');
  assert.equal(monthlyPoint(Date.UTC(2026, 0, 29, 3)), '28');
  assert.equal(monthlyPoint(Date.UTC(2026, 0, 31, 3)), '28');
  assert.equal(monthlyPoint(Date.UTC(2026, 0, 1, 16)), '02'); // UTC 1/1 16:00 = 台北 1/2 00:00
});

// ---------- 定期定額 Notify ----------
test('定期定額 Notify：Result 沒有 MerchantID 或不是我們的就拒絕（沒有 TradeSha，只能靠這個）', async () => {
  memoryStore._reset();
  let r = await handlePeriodNotify(perCfg, encPeriod({ Status: 'SUCCESS', Result: { MerchantOrderNo: 'EZ_PM_1', PeriodAmt: 49 } }), memoryStore, quiet);
  assert.equal(r.httpStatus, 400);
  r = await handlePeriodNotify(perCfg, encPeriod({ Status: 'SUCCESS', Result: { MerchantID: 'OTHER', MerchantOrderNo: 'EZ_PM_1', PeriodAmt: 49 } }), memoryStore, quiet);
  assert.equal(r.httpStatus, 400);
  for (const body of [{ Period: ['x'] }, { Period: 123 }, {}, null, encPeriod('not-an-object'), encPeriod(null)]) {
    r = await handlePeriodNotify(perCfg, body, memoryStore, quiet);
    assert.equal(r.httpStatus, 400);
  }
  // 別人的金鑰加密的資料解不開
  r = await handlePeriodNotify(perCfg, encPeriod({ Status: 'SUCCESS', Result: { MerchantID: perCfg.merchantId } }, { hashKey: 'K'.repeat(32), hashIV: 'I'.repeat(16) }), memoryStore, quiet);
  assert.equal(r.httpStatus, 400);
});

test('定期定額 Notify：成功卻沒帶金額 → 不開通；每期授權失敗、重送只記一次', async () => {
  memoryStore._reset();
  const plan = getPlan('plus-monthly');
  const orderNo = makeOrderNo(plan);
  await memoryStore.saveOrder({ merchantOrderNo: orderNo, amount: plan.priceTwd, status: 'pending' });
  let r = await handlePeriodNotify(perCfg, encPeriod({ Status: 'SUCCESS', Result: { MerchantID: perCfg.merchantId, MerchantOrderNo: orderNo, PeriodNo: 'P1' } }), memoryStore, quiet);
  assert.equal(r.body.error, 'amount_mismatch');
  r = await handlePeriodNotify(perCfg, encPeriod({ Status: 'SUCCESS', Result: { MerchantID: perCfg.merchantId, MerchantOrderNo: orderNo, PeriodAmt: '49.0', PeriodNo: 'P1' } }), memoryStore, quiet);
  assert.equal(r.body.error, 'amount_mismatch');

  const failEach = encPeriod({ Status: 'TRA10016', Message: '授權失敗', Result: { MerchantID: perCfg.merchantId, MerchantOrderNo: orderNo, OrderNo: `${orderNo}_2`, AlreadyTimes: '2', PeriodNo: 'P1' } });
  const a = await handlePeriodNotify(perCfg, failEach, memoryStore, quiet);
  const b = await handlePeriodNotify(perCfg, failEach, memoryStore, quiet);
  assert.equal(a.httpStatus, 200);
  assert.equal(a.body.paid, false);
  assert.equal(a.body.duplicate, false);
  assert.equal(b.body.duplicate, true);
});

// ---------- 贊助金額 ----------
test('贊助金額：上下限 30–5000 的邊界值、非整數、前後空白、前導 0', () => {
  assert.equal(sponsorData.minTwd, 30);
  assert.equal(sponsorData.maxTwd, 5000);
  assert.deepEqual(validateSponsorAmount(30), { ok: true, amount: 30 });
  assert.deepEqual(validateSponsorAmount('5000'), { ok: true, amount: 5000 });
  assert.equal(validateSponsorAmount(29).error, 'amount_too_small');
  assert.equal(validateSponsorAmount('29').error, 'amount_too_small');
  assert.equal(validateSponsorAmount(5001).error, 'amount_too_large');
  assert.equal(validateSponsorAmount('9999999').error, 'amount_too_large');
  assert.deepEqual(validateSponsorAmount('0050'), { ok: true, amount: 50 }); // 前導 0 會變成數字 50，送出的 Amt 是 50
  for (const bad of [29.99, 30.5, 4999.9, '30.0', '3 0', '30,000', '+30', Number.MAX_SAFE_INTEGER + 2, '12345678', '٣٠']) {
    assert.equal(validateSponsorAmount(bad).ok, false, `應拒絕 ${String(bad)}`);
  }
});

test('API sponsor/create：邊界金額 30/5000 可以，29/5001/小數回 400；訂單金額與 Amt 一致', async () => {
  memoryStore._reset();
  for (const [amount, status] of [[30, 200], [5000, 200], [29, 400], [5001, 400], ['50.5', 400], [50.5, 400], ['abc', 400]]) {
    const res = await post('sponsor/create/', { amount, agree: true });
    assert.equal(res.status, status, `金額 ${amount}`);
    if (status === 200) {
      const d = await res.json();
      const q = new URLSearchParams(aesDecrypt(d.fields.TradeInfo, mpgCfg.hashKey, mpgCfg.hashIV));
      assert.equal(q.get('Amt'), String(amount));
      assert.equal((await memoryStore.getOrder(d.orderNo)).amount, amount);
    }
  }
  // 沒存訂單時，用訂單編號裡的金額核對：編號寫 100、通知說 99 → 不符
  const orderNo = makeSponsorOrderNo(100);
  const r = await handleMpgNotify(mpgCfg, fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: orderNo, Amt: 99 }), memoryStore, quiet);
  assert.equal(r.body.error, 'amount_mismatch');
});

test('PUBLIC_SPONSOR_HIDE=1：sponsor/create 回 404，不建立訂單；其他值（0、空白）照常', async () => {
  memoryStore._reset();
  const res = await post('sponsor/create/', { amount: 100, agree: true }, { ...ENV, PUBLIC_SPONSOR_HIDE: '1' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'sponsor_disabled');
  for (const v of ['0', '', 'true']) {
    assert.equal((await post('sponsor/create/', { amount: 100, agree: true }, { ...ENV, PUBLIC_SPONSOR_HIDE: v })).status, 200, `PUBLIC_SPONSOR_HIDE=${v}`);
  }
  // 關掉贊助不影響一般方案
  assert.equal((await post('create-order/', { planId: 'trip-pack', agree: true }, { ...ENV, PUBLIC_SPONSOR_HIDE: '1' })).status, 200);
});

// ---------- 環境變數 ----------
test('環境變數缺少：每個缺的變數都列出來，API 回 503「金流尚未設定」', async () => {
  for (const drop of ['NEWEBPAY_MERCHANT_ID', 'NEWEBPAY_HASH_KEY', 'NEWEBPAY_HASH_IV']) {
    const env = { ...ENV, [drop]: '' };
    const cfg = getConfig(env);
    assert.equal(cfg.ok, false);
    assert.deepEqual(cfg.missing, [drop]);
    for (const route of ['create-order/', 'period/create/', 'sponsor/create/', 'notify/', 'period/notify/']) {
      const res = await post(route, { planId: 'trip-pack', agree: true, amount: 100 }, env);
      assert.equal(res.status, 503, `${drop} ${route}`);
      assert.deepEqual(await res.json(), { ok: false, error: 'not_configured', message: '金流尚未設定' });
    }
  }
  assert.deepEqual(getConfig({}).missing, ['NEWEBPAY_MERCHANT_ID', 'NEWEBPAY_HASH_KEY', 'NEWEBPAY_HASH_IV']);
  assert.deepEqual(getConfig({ ...ENV, NEWEBPAY_HASH_KEY: '   ' }).missing, ['NEWEBPAY_HASH_KEY']); // 只有空白也算沒設
});

test('環境變數格式錯（金鑰長度不對）：回 503，不是 500；status 只列變數名稱，不顯示值', async () => {
  const shortKey = 'abc123SECRETkey';
  const env = { ...ENV, NEWEBPAY_HASH_KEY: shortKey, NEWEBPAY_HASH_IV: 'x'.repeat(17) };
  const cfg = getConfig(env);
  assert.equal(cfg.ok, false);
  assert.deepEqual(cfg.invalid, ['NEWEBPAY_HASH_KEY', 'NEWEBPAY_HASH_IV']);
  const spy = spyLog();
  const res = await post('create-order/', { planId: 'trip-pack', agree: true }, env, { log: spy.log });
  assert.equal(res.status, 503);
  const st = await handle(new Request('https://x.test/api/newebpay?route=status/'), { env, log: quiet });
  const stText = await st.text();
  assert.ok(stText.includes('NEWEBPAY_HASH_KEY'));
  assert.ok(!stText.includes(shortKey) && !stText.includes(mpgCfg.merchantId));
  assert.ok(!spy.text().includes(shortKey));
  assert.deepEqual(getConfig({ ...ENV, NEWEBPAY_MERCHANT_ID: 'MS 1<script>' }).invalid, ['NEWEBPAY_MERCHANT_ID']);
});

test('NEWEBPAY_ENV 打錯字（例如 prod）：仍然是測試環境，並在 status 提醒', async () => {
  const cfg = getConfig({ ...ENV, NEWEBPAY_ENV: 'prod' });
  assert.equal(cfg.mode, 'test');
  assert.equal(cfg.gateway.mpg, 'https://ccore.newebpay.com/MPG/mpg_gateway');
  assert.equal(cfg.warnings.length, 1);
  assert.deepEqual(getConfig({ ...ENV, NEWEBPAY_ENV: 'production' }).warnings, []);
  const st = await (await handle(new Request('https://x.test/api/newebpay?route=status/'), { env: { ...ENV, NEWEBPAY_ENV: 'prod' }, log: quiet })).json();
  assert.equal(st.mode, 'test');
  assert.equal(st.configured, true);
  assert.equal(st.warnings.length, 1);
});

// ---------- 不外洩、輸入檢查 ----------
test('不外洩金鑰：status、錯誤回應、log 裡都沒有 HashKey／HashIV', async () => {
  memoryStore._reset();
  const spy = spyLog();
  const responses = [];
  responses.push(await (await handle(new Request('https://x.test/api/newebpay?route=status/'), { env: ENV, log: spy.log })).text());
  responses.push(await (await post('notify/', { TradeInfo: 'zz', TradeSha: 'x' }, ENV, { log: spy.log })).text());
  responses.push(await (await post('period/notify/', { Period: 'zz' }, ENV, { log: spy.log })).text());
  responses.push(await (await post('create-order/', { planId: 'nope', agree: true }, ENV, { log: spy.log })).text());
  // 故意讓 store 壞掉 → 500，回應不帶細節
  const broken = { kind: 'broken', async saveOrder() { throw new Error('db down'); }, async getOrder() { return null; }, async markProcessed() { return true; } };
  const res500 = await handle(new Request('https://x.test/api/newebpay?route=create-order/', { method: 'POST', body: JSON.stringify({ planId: 'trip-pack', agree: true }), headers: { 'content-type': 'application/json' } }), { env: ENV, log: spy.log, store: broken });
  assert.equal(res500.status, 500);
  responses.push(await res500.text());
  assert.deepEqual(JSON.parse(responses.at(-1)), { ok: false, error: 'server_error' });
  const all = responses.join('\n') + spy.text();
  assert.ok(!all.includes(mpgCfg.hashKey), 'HashKey 外洩');
  assert.ok(!all.includes(mpgCfg.hashIV), 'HashIV 外洩');
});

test('輸入檢查：JSON 不是物件不會 500；Email 超過 50 字回 400；本體太大回 413', async () => {
  memoryStore._reset();
  for (const raw of ['null', '[1,2]', '123', '"str"', '{bad json']) {
    const res = await post('create-order/', null, ENV, { raw });
    assert.equal(res.status, 400, raw);
    const n = await post('notify/', null, ENV, { raw });
    assert.equal(n.status, 400, `notify ${raw}`);
  }
  const long = `${'a'.repeat(39)}@example.com`; // 51 字
  assert.equal(long.length, 51);
  assert.equal((await post('create-order/', { planId: 'trip-pack', agree: true, email: long })).status, 400);
  assert.equal((await post('create-order/', { planId: 'trip-pack', agree: true, email: long.slice(1) })).status, 200);
  assert.equal((await post('period/create/', { planId: 'plus-monthly', agree: true, email: long })).status, 400);
  assert.equal((await post('sponsor/create/', { amount: 100, agree: true, email: long })).status, 400);
  for (const email of ['a@b', 'a b@c.com', '<x>@a.com', 'a@b.com"']) {
    assert.equal((await post('create-order/', { planId: 'trip-pack', agree: true, email })).status, 400, email);
  }
  const big = 'x'.repeat(MAX_BODY_BYTES + 1);
  const res = await handle(new Request('https://x.test/api/newebpay?route=notify/', { method: 'POST', body: big, headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(big.length) } }), { env: ENV, log: quiet, store: memoryStore });
  assert.equal(res.status, 413);
});

test('Return（使用者導回）：簽章錯就導到失敗結果頁，不顯示成功', async () => {
  const plan = getPlan('trip-pack');
  const ok = fakeMpgNotify(mpgCfg, { MerchantID: mpgCfg.merchantId, MerchantOrderNo: makeOrderNo(plan), Amt: 99 });
  const ret = await handle(new Request('https://x.test/api/newebpay/return/', { method: 'POST', body: new URLSearchParams({ ...ok, TradeSha: '0'.repeat(64) }) }), { env: ENV, log: quiet, store: memoryStore });
  assert.equal(ret.status, 303);
  assert.doesNotMatch(ret.headers.get('location'), /status=success/);
});
