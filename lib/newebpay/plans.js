// 方案資料（唯一來源：src/data/plans.json）。後端一律用這裡的價格，不相信前端傳來的金額。
import crypto from 'node:crypto';
import data from '../../src/data/plans.json' with { type: 'json' };

export const plansData = data;

export function getPlan(planId) {
  return data.plans.find((p) => p.id === planId) || null;
}

export function getPlanByCode(code) {
  return data.plans.find((p) => p.code === code) || null;
}

/**
 * 產生商店訂單編號：EZ_<方案代碼>_<時間36進位><亂數>
 * 藍新規定：英文、數字、底線，最長 30 字，同一商店不可重複（NDNF-1.2.6 MerchantOrderNo；NDNP-1.0.8 MerOrderNo）。
 * 把方案代碼放進編號，這樣就算還沒有資料庫，收到 Notify 時也能用方案價格核對金額。
 */
export function makeOrderNo(plan, now = Date.now()) {
  const no = `EZ_${plan.code}_${now.toString(36)}${crypto.randomBytes(4).toString('hex')}`;
  if (!/^[A-Za-z0-9_]{1,30}$/.test(no)) throw new Error('訂單編號格式錯誤');
  return no;
}

/** 從訂單編號找回方案；格式不符回傳 null */
export function planFromOrderNo(orderNo) {
  const m = /^EZ_([A-Z0-9]+)_[a-z0-9]+$/.exec(String(orderNo || ''));
  return m ? getPlanByCode(m[1]) : null;
}

/** ItemDesc 限 50 字、不可換行或引號（NDNF-1.2.6 參數表） */
export function safeItemDesc(text) {
  return String(text).replace(/[\r\n"'<>]/g, ' ').slice(0, 50);
}

/** 定期定額 ProdDesc 限 100 字，只能中英文、數字、空白、底線（NDNP-1.0.8 參數表） */
export function safeProdDesc(text) {
  return String(text).replace(/[^\p{Script=Han}A-Za-z0-9 _]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}
