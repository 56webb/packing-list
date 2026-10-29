// 信用卡定期定額：建立委託、處理回傳
// 規格：信用卡定期定額串接技術手冊 NDNP-1.0.8（2026-08-24 更新）
// 注意：定期定額「沒有 TradeSha」，只有 AES 加密的 PostData_ / Period。能用自己的金鑰解開、內容是合法 JSON、
//       商店代號相符，才當作是藍新送來的。
import { aesEncrypt, aesDecrypt, buildQuery } from './crypto.js';
import { PERIOD_VERSION } from './config.js';
import { planFromOrderNo, safeProdDesc } from './plans.js';

/** 台北時間的「今天幾號」，月扣款日用；29–31 號一律改成 28 號，避免小月沒有這一天（藍新手冊未說明小月怎麼處理）。 */
export function monthlyPoint(now = Date.now()) {
  const day = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', day: 'numeric' }).format(new Date(now)));
  return String(Math.min(day, 28)).padStart(2, '0');
}

/** 建立委託表單欄位：{ MerchantID_, PostData_ }（NDNP-1.0.8 §4.1） */
export function buildPeriodForm(cfg, { plan, orderNo, email, now = Date.now(), returnUrl, notifyUrl, backUrl }) {
  if (plan.type !== 'subscription' || !plan.period) throw new Error('這個方案不是訂閱方案');
  if (!email) throw new Error('定期定額必須提供付款人 Email（PayerEmail 必填）');
  const p = plan.period;
  if (p.type !== 'M' && !p.point) throw new Error('非月繳方案要在 plans.json 設定 period.point');
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
  let data;
  try {
    data = JSON.parse(aesDecrypt(hex, cfg.hashKey, cfg.hashIV));
  } catch {
    return { ok: false, error: 'decrypt_failed' };
  }
  let result = data.Result || {};
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { result = {}; }
  }
  if (result.MerchantID && result.MerchantID !== cfg.merchantId) return { ok: false, error: 'merchant_mismatch' };
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
  if (amt !== undefined && Number(amt) !== Number(expectedAmt)) {
    log.error('[newebpay][period-notify] ⚠️ 金額不符，不開通', { ...safeLog(r), expectedAmt });
    await store.markProcessed(`period:mismatch:${r.OrderNo || r.PeriodNo || orderNo}`, { merchantOrderNo: orderNo, status: 'amount_mismatch' });
    return { httpStatus: 200, body: { ok: false, error: 'amount_mismatch' } };
  }
  const success = decoded.status === 'SUCCESS';
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
