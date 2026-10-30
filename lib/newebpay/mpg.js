// MPG（幕前支付）：建立付款資料、處理 NotifyURL / ReturnURL 回傳
// 規格：線上交易─幕前支付技術串接手冊 NDNF-1.2.6（2026-10-01 更新）
import { aesEncrypt, aesDecrypt, buildQuery, parseQuery, tradeSha, verifyTradeSha } from './crypto.js';
import { MPG_VERSION } from './config.js';
import { planFromOrderNo, safeItemDesc } from './plans.js';
import { sponsorFromOrderNo } from './sponsor.js';

/**
 * 建立要送到藍新 MPG 的表單欄位（前端用 HTML Form Post 送出；手冊 §6 禁止後端 POST / iframe）。
 * 回傳 { MerchantID, TradeInfo, TradeSha, Version }
 */
export function buildMpgForm(cfg, { plan, orderNo, email, now = Date.now(), returnUrl, notifyUrl, clientBackUrl }) {
  if (plan.type !== 'one_time') throw new Error('這個方案不是一次付清方案');
  const tradeInfo = {
    MerchantID: cfg.merchantId,
    RespondType: 'JSON',
    TimeStamp: Math.floor(now / 1000), // 藍新容許誤差 ±120 秒
    Version: MPG_VERSION,
    LangType: 'zh-tw',
    MerchantOrderNo: orderNo,
    Amt: plan.priceTwd, // 整數、新台幣
    ItemDesc: safeItemDesc(plan.itemDesc),
    TradeLimit: 600, // 付款頁有效秒數（60–900）
    ReturnURL: returnUrl,
    NotifyURL: notifyUrl,
    ClientBackURL: clientBackUrl,
    Email: email || undefined,
    EmailModify: 1,
    CREDIT: 1, // 只開信用卡一次付清
  };
  const encrypted = aesEncrypt(buildQuery(tradeInfo), cfg.hashKey, cfg.hashIV);
  return {
    MerchantID: cfg.merchantId,
    TradeInfo: encrypted,
    TradeSha: tradeSha(encrypted, cfg.hashKey, cfg.hashIV),
    Version: MPG_VERSION,
  };
}

/**
 * 驗證並解密 MPG 回傳（Notify 和 Return 格式一樣）。
 * RespondType=JSON 時解密後是 {Status, Message, Result:{...}}；RespondType=String 時是 query string（平的）。
 * 兩種都整理成 { Status, Message, Result }。
 */
export function decodeMpgResponse(cfg, body) {
  const { MerchantID, TradeInfo, TradeSha } = body || {};
  if (!TradeInfo || !TradeSha) return { ok: false, error: 'missing_fields' };
  if (MerchantID && MerchantID !== cfg.merchantId) return { ok: false, error: 'merchant_mismatch' };
  if (!verifyTradeSha(TradeInfo, TradeSha, cfg.hashKey, cfg.hashIV)) return { ok: false, error: 'bad_tradesha' };
  let text;
  try {
    text = aesDecrypt(TradeInfo, cfg.hashKey, cfg.hashIV);
  } catch {
    return { ok: false, error: 'decrypt_failed' };
  }
  let data;
  if (text.trim().startsWith('{')) {
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: 'bad_json' };
    }
    if (typeof data.Result === 'string') {
      try { data.Result = JSON.parse(data.Result); } catch { /* 保持原樣 */ }
    }
  } else {
    const flat = parseQuery(text);
    data = { Status: flat.Status, Message: flat.Message, Result: flat };
  }
  const result = data.Result || {};
  if (result.MerchantID && result.MerchantID !== cfg.merchantId) return { ok: false, error: 'merchant_mismatch' };
  return { ok: true, status: data.Status, message: data.Message, result };
}

/** 給 log 用：只留必要欄位，不記卡號、授權碼等資料 */
function safeLog(result) {
  const { MerchantOrderNo, TradeNo, Amt, PaymentType, RespondCode, PayTime } = result || {};
  return { MerchantOrderNo, TradeNo, Amt, PaymentType, RespondCode, PayTime };
}

/**
 * 處理 NotifyURL（藍新幕後通知）。
 * 藍新只認 HTTP 200 才算通知成功，否則會重送（最多 3 次，手冊 §6 常見問題）。
 * 所以：簽章錯 → 400；簽章對（不管訂單結果）→ 200，避免一直重送。
 */
export async function handleMpgNotify(cfg, body, store, log = console) {
  const decoded = decodeMpgResponse(cfg, body);
  if (!decoded.ok) {
    log.warn('[newebpay][mpg-notify] 拒絕', decoded.error);
    return { httpStatus: 400, body: { ok: false, error: decoded.error } };
  }
  const r = decoded.result;
  const orderNo = r.MerchantOrderNo;
  // 方案（plans.json）或贊助（sponsor.json）都走這裡
  const plan = planFromOrderNo(orderNo) || sponsorFromOrderNo(orderNo);
  if (!plan || plan.type !== 'one_time') {
    log.error('[newebpay][mpg-notify] 找不到訂單對應的方案', safeLog(r));
    return { httpStatus: 200, body: { ok: false, error: 'unknown_order' } };
  }
  const order = await store.getOrder(orderNo);
  const expectedAmt = order?.amount ?? plan.priceTwd;
  if (Number(r.Amt) !== Number(expectedAmt)) {
    log.error('[newebpay][mpg-notify] ⚠️ 金額不符，不開通', { ...safeLog(r), expectedAmt });
    await store.markProcessed(`mpg:mismatch:${orderNo}:${r.TradeNo || ''}`, { merchantOrderNo: orderNo, status: 'amount_mismatch' });
    return { httpStatus: 200, body: { ok: false, error: 'amount_mismatch' } };
  }
  if (decoded.status !== 'SUCCESS') {
    const first = await store.markProcessed(`mpg:fail:${orderNo}:${decoded.status}`, { merchantOrderNo: orderNo, status: 'failed', failCode: decoded.status });
    log.warn('[newebpay][mpg-notify] 付款失敗', { ...safeLog(r), status: decoded.status, duplicate: !first });
    return { httpStatus: 200, body: { ok: true, paid: false, duplicate: !first } };
  }
  const first = await store.markProcessed(`mpg:paid:${r.TradeNo || orderNo}`, {
    merchantOrderNo: orderNo,
    status: 'paid',
    tradeNo: r.TradeNo,
    paidAt: r.PayTime,
  });
  if (!first) {
    log.info('[newebpay][mpg-notify] 重複通知，略過', safeLog(r));
    return { httpStatus: 200, body: { ok: true, paid: true, duplicate: true, kind: plan.kind === 'sponsor' ? 'sponsor' : 'plan' } };
  }
  const kind = plan.kind === 'sponsor' ? 'sponsor' : 'plan';
  log.info('[newebpay][mpg-notify] 付款成功', { ...safeLog(r), kind });
  // 贊助：沒有任何東西要開通（無對價），只記錄收到。
  // 方案：TODO 在這裡幫使用者開通方案（需要會員系統）
  return { httpStatus: 200, body: { ok: true, paid: true, duplicate: false, kind } };
}
