// 信用卡定期定額：建立委託、處理回傳
// 規格：信用卡定期定額串接技術手冊 NDNP-1.0.8（2026-08-24 更新）
// 注意：定期定額「沒有 TradeSha」，只有 AES 加密的 PostData_ / Period。能用自己的金鑰解開、內容是合法 JSON、
//       商店代號相符，才當作是藍新送來的。
import { aesEncrypt, aesDecrypt, buildQuery } from './crypto.js';
import { PERIOD_VERSION } from './config.js';
import { planFromOrderNo, safeProdDesc } from './plans.js';
import { isSameAmount } from './mpg.js';

/**
 * 台北時間的「今天幾號」，月扣款日用；29–31 號一律改成 28 號。
 * 手冊 NDNP-1.0.8 §4.3.1（第 23 頁）寫「若當月沒該日期則由該月的最後一天做為扣款日」，
 * 所以設 31 號也可以；這裡選擇改成 28 號，是為了讓每個月的扣款日都一樣（設計選擇，RY 可以改）。
 */
export function monthlyPoint(now = Date.now()) {
  const day = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', day: 'numeric' }).format(new Date(now)));
  return String(Math.min(day, 28)).padStart(2, '0');
}

/**
 * 檢查 plans.json 的 period 設定是否符合手冊 NDNP-1.0.8 §4.3.1（第 23–24 頁）：
 *  - PeriodType：D / W / M / Y
 *  - PeriodPoint：D = 2–999（錯誤碼表 PER10013 寫 2–364，取比較嚴的 2–364）、W = 1–7、M = 01–31、Y = MMDD
 *  - PeriodStartType：1 / 2 / 3
 *  - PeriodTimes：1–99（錯誤碼 PER10022–PER10024：必須是數字、不能為零、不能多於 99）
 *  - PeriodAmt：大於 0 的整數，Int(6)
 * 回傳錯誤訊息陣列（空陣列 = 沒問題）。
 */
export function checkPeriodSettings(plan) {
  const errors = [];
  const p = plan && plan.period;
  if (!p) return ['缺少 period 設定'];
  if (!['D', 'W', 'M', 'Y'].includes(p.type)) errors.push('period.type 只能是 D、W、M、Y');
  if (p.point !== undefined) {
    const pt = String(p.point);
    const n = Number(pt);
    const ok =
      (p.type === 'D' && /^\d{1,3}$/.test(pt) && n >= 2 && n <= 364) ||
      (p.type === 'W' && /^[1-7]$/.test(pt)) ||
      (p.type === 'M' && /^(0[1-9]|[12]\d|3[01])$/.test(pt)) ||
      (p.type === 'Y' && /^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(pt));
    if (!ok) errors.push(`period.point「${pt}」不符合 ${p.type} 的格式`);
  } else if (p.type !== 'M') {
    errors.push('非月繳方案要在 plans.json 設定 period.point');
  }
  if (p.startType !== undefined && ![1, 2, 3].includes(p.startType)) errors.push('period.startType 只能是 1、2、3');
  const times = p.times ?? 12;
  if (!Number.isInteger(times) || times < 1 || times > 99) errors.push('period.times 要是 1–99 的整數');
  if (!Number.isSafeInteger(plan.priceTwd) || plan.priceTwd <= 0 || plan.priceTwd > 999999) errors.push('priceTwd 要是 1–999999 的整數');
  return errors;
}

/** 建立委託表單欄位：{ MerchantID_, PostData_ }（NDNP-1.0.8 §4.1） */
export function buildPeriodForm(cfg, { plan, orderNo, email, now = Date.now(), returnUrl, notifyUrl, backUrl }) {
  if (plan.type !== 'subscription' || !plan.period) throw new Error('這個方案不是訂閱方案');
  if (!email) throw new Error('定期定額必須提供付款人 Email（PayerEmail 必填）');
  const errors = checkPeriodSettings(plan);
  if (errors.length) throw new Error(`plans.json 的訂閱設定有誤：${errors.join('；')}`);
  if (!/^[A-Za-z0-9_]{1,30}$/.test(String(orderNo))) throw new Error('訂單編號格式錯誤');
  const p = plan.period;
  const postData = {
    RespondType: 'JSON',
    TimeStamp: Math.floor(now / 1000),
    Version: PERIOD_VERSION,
    LangType: 'zh-Tw',
    MerOrderNo: orderNo,
    ProdDesc: safeProdDesc(plan.itemDesc),
    PeriodAmt: plan.priceTwd,
    PeriodType: p.type, // D / W / M / Y
    PeriodPoint: p.point || monthlyPoint(now),
    PeriodStartType: p.startType ?? 2, // 2 = 立即授權委託金額
    PeriodTimes: String(p.times ?? 12),
    ReturnURL: returnUrl,
    PayerEmail: email,
    EmailModify: 1,
    PaymentInfo: 'N',
    OrderInfo: 'N',
    NotifyURL: notifyUrl,
    BackURL: backUrl,
  };
  return {
    MerchantID_: cfg.merchantId,
    PostData_: aesEncrypt(buildQuery(postData), cfg.hashKey, cfg.hashIV),
  };
}

/** 解開定期定額回傳的 Period 欄位，回傳 { ok, status, message, result } */
export function decodePeriod(cfg, body) {
  const hex = body && body.Period;
  if (!hex) return { ok: false, error: 'missing_fields' };
  if (typeof hex !== 'string') return { ok: false, error: 'bad_fields' };
  let data;
  try {
    data = JSON.parse(aesDecrypt(hex, cfg.hashKey, cfg.hashIV));
  } catch {
    return { ok: false, error: 'decrypt_failed' };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'bad_json' };
  let result = data.Result || {};
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { result = {}; }
  }
  if (!result || typeof result !== 'object') result = {};
  // 定期定額沒有 TradeSha，所以「解得開＋商店代號是我們的」是唯一的來源檢查。
  // 手冊 §4.3.2、§4.3.3 的 Result 都有 MerchantID，因此要求一定要有。
  if (result.MerchantID !== cfg.merchantId) return { ok: false, error: 'merchant_mismatch' };
  return { ok: true, status: data.Status, message: data.Message, result };
}

function safeLog(r) {
  const { MerchantOrderNo, OrderNo, PeriodNo, TradeNo, PeriodAmt, AuthAmt, AlreadyTimes, TotalTimes, RespondCode } = r || {};
  return { MerchantOrderNo, OrderNo, PeriodNo, TradeNo, PeriodAmt, AuthAmt, AlreadyTimes, TotalTimes, RespondCode };
}

/**
 * 處理定期定額 NotifyURL。會收到兩種：
 *  1. 建立委託完成（§4.3.2）：Result 有 PeriodNo、AuthTimes、PeriodAmt
 *  2. 每期授權完成（§4.3.3 NPA-N050）：Result 有 OrderNo（訂單編號_期數）、AuthAmt、AlreadyTimes
 * Content-Type 可能是 urlencoded 或 multipart（手冊 §6 常見問題），由 api 端統一解析。
 */
export async function handlePeriodNotify(cfg, body, store, log = console) {
  const decoded = decodePeriod(cfg, body);
  if (!decoded.ok) {
    log.warn('[newebpay][period-notify] 拒絕', decoded.error);
    return { httpStatus: 400, body: { ok: false, error: decoded.error } };
  }
  const r = decoded.result;
  const orderNo = r.MerchantOrderNo;
  const plan = planFromOrderNo(orderNo);
  if (!plan || plan.type !== 'subscription') {
    log.error('[newebpay][period-notify] 找不到訂單對應的方案', safeLog(r));
    return { httpStatus: 200, body: { ok: false, error: 'unknown_order' } };
  }
  const isEachPeriod = Boolean(r.OrderNo);
  const amt = isEachPeriod ? r.AuthAmt : r.PeriodAmt;
  const order = await store.getOrder(orderNo);
  const expectedAmt = order?.amount ?? plan.priceTwd;
  const success = decoded.status === 'SUCCESS';
  // 成功的通知一定要帶金額而且相符；失敗的通知可能沒有金額，有帶才比對
  if ((success || amt !== undefined) && !isSameAmount(amt, expectedAmt)) {
    log.error('[newebpay][period-notify] ⚠️ 金額不符，不開通', { ...safeLog(r), expectedAmt });
    await store.markProcessed(`period:mismatch:${r.OrderNo || r.PeriodNo || orderNo}`, { merchantOrderNo: orderNo, status: 'amount_mismatch' });
    return { httpStatus: 200, body: { ok: false, error: 'amount_mismatch' } };
  }
  const key = isEachPeriod
    ? `period:each:${r.OrderNo}:${success ? 'ok' : decoded.status}`
    : `period:create:${r.PeriodNo || orderNo}:${success ? 'ok' : decoded.status}`;
  const first = await store.markProcessed(key, {
    merchantOrderNo: orderNo,
    status: success ? 'active' : 'failed',
    periodNo: r.PeriodNo,
    lastTradeNo: r.TradeNo,
    alreadyTimes: r.AlreadyTimes,
  });
  log.info('[newebpay][period-notify]', { kind: isEachPeriod ? 'each' : 'create', status: decoded.status, duplicate: !first, ...safeLog(r) });
  // TODO：成功 → 延長會員到期日；失敗 → 通知使用者更新卡片（需要會員系統）
  return { httpStatus: 200, body: { ok: true, kind: isEachPeriod ? 'each' : 'create', paid: success, duplicate: !first } };
}
