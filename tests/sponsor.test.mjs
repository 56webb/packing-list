// 贊助（請喝咖啡）測試：金額檢查、品項與 ItemDesc、Notify 金額核對、API、用詞。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { aesEncrypt, aesDecrypt, tradeSha, parseQuery } from '../lib/newebpay/crypto.js';
import { buildMpgForm, handleMpgNotify } from '../lib/newebpay/mpg.js';
import { plansData, planFromOrderNo } from '../lib/newebpay/plans.js';
import { sponsorData, validateSponsorAmount, sponsorItem, makeSponsorOrderNo, sponsorFromOrderNo } from '../lib/newebpay/sponsor.js';
import { memoryStore } from '../lib/newebpay/store.js';
import { handle } from '../lib/newebpay/router.js';

const V = JSON.parse(fs.readFileSync(new URL('./fixtures/newebpay-doc-vectors.json', import.meta.url), 'utf8'));
const quiet = { info() {}, warn() {}, error() {} };
const cfg = { merchantId: V.mpg.merchantId, hashKey: V.mpg.hashKey, hashIV: V.mpg.hashIV };
const env = { NEWEBPAY_MERCHANT_ID: cfg.merchantId, NEWEBPAY_HASH_KEY: cfg.hashKey, NEWEBPAY_HASH_IV: cfg.hashIV };
const root = new URL('../', import.meta.url).pathname;

function fakeNotify(result, status = 'SUCCESS') {
  const ti = aesEncrypt(JSON.stringify({ Status: status, Message: 'x', Result: result }), cfg.hashKey, cfg.hashIV);
  return { Status: status, MerchantID: cfg.merchantId, Version: '2.3', TradeInfo: ti, TradeSha: tradeSha(ti, cfg.hashKey, cfg.hashIV) };
}
const post = (route, body, e = env) =>
  handle(new Request(`https://x.test/api/newebpay?route=${route}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { env: e, log: quiet, store: memoryStore });

test('sponsor.json：標示範例金額、預設金額都在上下限內、代碼不和方案重複', () => {
  assert.equal(sponsorData.draft, true);
  assert.match(sponsorData.sampleNote, /範例金額/);
  assert.match(sponsorData._說明, /範例金額，未定/);
  assert.deepEqual(sponsorData.presetsTwd, [50, 100, 150]);
  for (const n of [...sponsorData.presetsTwd, sponsorData.defaultTwd]) {
    assert.ok(Number.isInteger(n) && n >= sponsorData.minTwd && n <= sponsorData.maxTwd, `${n} 不在範圍內`);
  }
  assert.ok(!plansData.plans.some((p) => p.code === sponsorData.code));
});

test('贊助金額檢查：只收整數、範圍 min–max', () => {
  const { minTwd: min, maxTwd: max } = sponsorData;
  assert.deepEqual(validateSponsorAmount(100), { ok: true, amount: 100 });
  assert.deepEqual(validateSponsorAmount('150'), { ok: true, amount: 150 });
  assert.deepEqual(validateSponsorAmount(` ${min} `), { ok: true, amount: min });
  assert.deepEqual(validateSponsorAmount(max), { ok: true, amount: max });
  assert.equal(validateSponsorAmount(min - 1).error, 'amount_too_small');
  assert.equal(validateSponsorAmount(max + 1).error, 'amount_too_large');
  assert.equal(validateSponsorAmount(0).error, 'amount_too_small');
  assert.equal(validateSponsorAmount(-50).error, 'amount_too_small');
  for (const bad of [50.5, '50.5', '1e2', '0x40', '-50', 'abc', '', null, undefined, NaN, Infinity, [100], { a: 1 }, true, '100元', '１００']) {
    assert.equal(validateSponsorAmount(bad).ok, false, `應拒絕 ${String(bad)}`);
  }
});

test('贊助品項：ItemDesc 是「EZpakku 贊助（請喝咖啡）」、金額放進 MPG、訂單編號可找回金額', () => {
  const item = sponsorItem(150);
  assert.equal(item.kind, 'sponsor');
  assert.equal(item.type, 'one_time');
  assert.equal(item.itemDesc, 'EZpakku 贊助（請喝咖啡）');
  const orderNo = makeSponsorOrderNo(sponsorData.maxTwd);
  assert.match(orderNo, /^EZ_SP5000_[a-z0-9]+$/);
  assert.ok(orderNo.length <= 30);
  assert.equal(sponsorFromOrderNo(orderNo).priceTwd, sponsorData.maxTwd);
  assert.equal(planFromOrderNo(orderNo), null); // 不會被當成方案
  assert.equal(sponsorFromOrderNo('EZ_SP1_abc123'), null); // 低於下限
  assert.equal(sponsorFromOrderNo('EZ_SP999999_abc123'), null); // 高於上限
  assert.equal(sponsorFromOrderNo('EZ_TP_abc123'), null);

  const f = buildMpgForm(cfg, { plan: item, orderNo: makeSponsorOrderNo(150), returnUrl: 'r', notifyUrl: 'n', clientBackUrl: 'b' });
  const p = parseQuery(aesDecrypt(f.TradeInfo, cfg.hashKey, cfg.hashIV));
  assert.equal(p.Amt, '150');
  assert.equal(p.ItemDesc, 'EZpakku 贊助（請喝咖啡）');
  assert.equal(p.CREDIT, '1');
});

test('贊助 Notify：金額要和訂單一致；沒有存訂單時用編號裡的金額核對', async () => {
  memoryStore._reset();
  const orderNo = makeSponsorOrderNo(100);
  await memoryStore.saveOrder({ merchantOrderNo: orderNo, kind: 'sponsor', amount: 100, status: 'pending' });
  let r = await handleMpgNotify(cfg, fakeNotify({ MerchantID: cfg.merchantId, MerchantOrderNo: orderNo, Amt: 100, TradeNo: 'S1' }), memoryStore, quiet);
  assert.deepEqual(r.body, { ok: true, paid: true, duplicate: false, kind: 'sponsor' });
  r = await handleMpgNotify(cfg, fakeNotify({ MerchantID: cfg.merchantId, MerchantOrderNo: orderNo, Amt: 100, TradeNo: 'S1' }), memoryStore, quiet);
  assert.equal(r.body.duplicate, true);

  memoryStore._reset(); // 模擬伺服器重啟、訂單不見了
  const o2 = makeSponsorOrderNo(150);
  r = await handleMpgNotify(cfg, fakeNotify({ MerchantID: cfg.merchantId, MerchantOrderNo: o2, Amt: 30, TradeNo: 'S2' }), memoryStore, quiet);
  assert.equal(r.body.error, 'amount_mismatch');
  r = await handleMpgNotify(cfg, fakeNotify({ MerchantID: cfg.merchantId, MerchantOrderNo: o2, Amt: 150, TradeNo: 'S3' }), memoryStore, quiet);
  assert.equal(r.body.paid, true);
});

test('API sponsor/create：檢查金額與勾選；成功回 MPG 欄位；Return 轉到感謝頁；可用 PUBLIC_SPONSOR_HIDE 關掉', async () => {
  memoryStore._reset();
  assert.equal((await post('sponsor/create/', { amount: 100 })).status, 400); // 沒勾
  for (const amount of [10, 99999, '50.5', 'abc', undefined]) {
    const res = await post('sponsor/create/', { amount, agree: true });
    assert.equal(res.status, 400, `應拒絕 ${amount}`);
  }
  const res = await post('sponsor/create/', { amount: '150', agree: true, planId: 'trip-pack', priceTwd: 1 }); // 前端亂塞的欄位要被忽略
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.amount, 150);
  assert.match(data.orderNo, /^EZ_SP150_/);
  const p = parseQuery(aesDecrypt(data.fields.TradeInfo, cfg.hashKey, cfg.hashIV));
  assert.equal(p.Amt, '150');
  assert.equal(p.ItemDesc, 'EZpakku 贊助（請喝咖啡）');
  assert.equal(p.ClientBackURL, 'https://x.test/zh-tw/sponsor/');

  const ok = fakeNotify({ MerchantID: cfg.merchantId, MerchantOrderNo: data.orderNo, Amt: 150 });
  const ret = await handle(new Request('https://x.test/api/newebpay/return/', { method: 'POST', body: new URLSearchParams(ok) }), { env, log: quiet, store: memoryStore });
  assert.equal(ret.status, 303);
  assert.match(ret.headers.get('location'), /^\/zh-tw\/sponsor\/thanks\/\?type=sponsor&status=success&order=EZ_SP150_/);
  const fail = fakeNotify({ MerchantID: cfg.merchantId, MerchantOrderNo: data.orderNo, Amt: 150 }, 'MPG03009');
  const ret2 = await handle(new Request('https://x.test/api/newebpay/return/', { method: 'POST', body: new URLSearchParams(fail) }), { env, log: quiet, store: memoryStore });
  assert.match(ret2.headers.get('location'), /status=fail/);

  assert.equal((await post('sponsor/create/', { amount: 100, agree: true }, { ...env, PUBLIC_SPONSOR_HIDE: '1' })).status, 404);
});

// 用詞規則：網站和程式只能用「贊助」「請喝咖啡」（RY 是個人，不是公益團體）
const FORBIDDEN = /捐款|捐贈|公益/;
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(astro|md|mdx|json|js|mjs|ts|html|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('用詞：src/、lib/、api/、public/ 都沒有「捐款／捐贈／公益」', () => {
  const files = ['src', 'lib', 'api', 'public'].filter((d) => fs.existsSync(path.join(root, d))).flatMap((d) => walk(path.join(root, d)));
  assert.ok(files.length > 10);
  const hits = files.filter((f) => FORBIDDEN.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f));
  assert.deepEqual(hits, []);
});

test('用詞：贊助相關檔案有寫「自願」「不會收到任何商品或服務」', () => {
  assert.match(sponsorData.voluntaryNote, /自願/);
  assert.match(sponsorData.voluntaryNote, /不會收到任何商品或服務/);
  for (const f of ['src/components/SponsorBlock.astro', 'src/pages/zh-tw/sponsor/index.astro', 'src/pages/zh-tw/refund/index.astro', 'src/pages/zh-tw/terms/index.astro']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(s, /贊助/, f);
    assert.match(s, /自願|不會因為贊助|不是購買/, f);
  }
});
