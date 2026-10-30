// 贊助（請喝咖啡）：金額由使用者選或自己輸入，但一定由後端檢查（整數、範圍來自 src/data/sponsor.json）。
// 走同一個 MPG 單次付款流程，只是「品項」是贊助，不是方案。
import crypto from 'node:crypto';
import data from '../../src/data/sponsor.json' with { type: 'json' };

export const sponsorData = data;

/**
 * 檢查贊助金額。只接受「整數」（數字或只有數字的字串），範圍 minTwd–maxTwd。
 * 回傳 { ok: true, amount } 或 { ok: false, error }
 */
export function validateSponsorAmount(raw, cfg = data) {
  let n;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && /^\s*\d{1,7}\s*$/.test(raw)) {
    n = Number(raw.trim());
  } else {
    return { ok: false, error: 'amount_not_integer' };
  }
  if (!Number.isSafeInteger(n)) return { ok: false, error: 'amount_not_integer' };
  if (n < cfg.minTwd) return { ok: false, error: 'amount_too_small' };
  if (n > cfg.maxTwd) return { ok: false, error: 'amount_too_large' };
  return { ok: true, amount: n };
}

/** 把贊助包成 MPG 用的「品項」：和 plans.json 的一次付清方案同樣形狀，但 kind = 'sponsor' */
export function sponsorItem(amount) {
  return {
    id: 'sponsor',
    kind: 'sponsor',
    code: data.code,
    type: 'one_time',
    name: data.title,
    priceTwd: amount,
    itemDesc: data.itemDesc,
  };
}

/**
 * 贊助訂單編號：EZ_SP<金額>_<時間36進位><亂數>，最多 30 字。
 * 金額放在編號裡（由後端產生、藍新回傳時有 TradeSha 保護），這樣沒有資料庫也能核對 Notify 的金額。
 */
export function makeSponsorOrderNo(amount, now = Date.now()) {
  const no = `EZ_${data.code}${amount}_${now.toString(36)}${crypto.randomBytes(4).toString('hex')}`;
  if (!/^[A-Za-z0-9_]{1,30}$/.test(no)) throw new Error('訂單編號格式錯誤');
  return no;
}

/** 從訂單編號找回贊助品項；不是贊助或金額不合法就回傳 null */
export function sponsorFromOrderNo(orderNo) {
  const m = new RegExp(`^EZ_${data.code}(\\d{1,7})_[a-z0-9]+$`).exec(String(orderNo || ''));
  if (!m) return null;
  const v = validateSponsorAmount(m[1]);
  return v.ok ? sponsorItem(v.amount) : null;
}

export function isSponsorOrderNo(orderNo) {
  return sponsorFromOrderNo(orderNo) !== null;
}
