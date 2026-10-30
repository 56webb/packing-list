// 藍新金流（NewebPay）加解密工具
// 來源：線上交易─幕前支付技術串接手冊 NDNF-1.2.6 §4.1.1 AES256、§4.1.2 SHA256（第 19–24 頁）
//      信用卡定期定額串接技術手冊 NDNP-1.0.8 §4.1、§4.2（第 15–21 頁）
// - AES-256-CBC、PKCS7 padding，HashKey（32 字元）當 key、HashIV（16 字元）當 iv，輸出小寫 hex。
// - TradeSha = SHA256("HashKey=" + key + "&" + TradeInfo(hex) + "&HashIV=" + iv) 轉大寫。（定期定額沒有 TradeSha）
import crypto from 'node:crypto';

function checkKeys(hashKey, hashIV) {
  if (typeof hashKey !== 'string' || Buffer.byteLength(hashKey) !== 32) {
    throw new Error('NEWEBPAY_HASH_KEY 必須是 32 個字元');
  }
  if (typeof hashIV !== 'string' || Buffer.byteLength(hashIV) !== 16) {
    throw new Error('NEWEBPAY_HASH_IV 必須是 16 個字元');
  }
}

/** 把物件轉成 query string（等同手冊範例 PHP 的 http_build_query：空白變 +）。值為 undefined / null 的欄位不送。 */
export function buildQuery(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    usp.append(k, String(v));
  }
  return usp.toString();
}

/** query string 轉回物件 */
export function parseQuery(str) {
  return Object.fromEntries(new URLSearchParams(str));
}

/** AES-256-CBC 加密，回傳小寫 hex */
export function aesEncrypt(plainText, hashKey, hashIV) {
  checkKeys(hashKey, hashIV);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(hashKey, 'utf8'), Buffer.from(hashIV, 'utf8'));
  return cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex');
}

/** AES-256-CBC 解密（hex → 文字）。解不開會丟錯誤。 */
export function aesDecrypt(hex, hashKey, hashIV) {
  checkKeys(hashKey, hashIV);
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 32 !== 0) {
    throw new Error('加密資料格式不正確');
  }
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(hashKey, 'utf8'), Buffer.from(hashIV, 'utf8'));
  return decipher.update(hex, 'hex', 'utf8') + decipher.final('utf8');
}

/** 產生 TradeSha（大寫 hex） */
export function tradeSha(tradeInfoHex, hashKey, hashIV) {
  if (typeof tradeInfoHex !== 'string') throw new TypeError('TradeInfo 必須是字串');
  return crypto
    .createHash('sha256')
    .update(`HashKey=${hashKey}&${tradeInfoHex}&HashIV=${hashIV}`)
    .digest('hex')
    .toUpperCase();
}

/** 檢查 TradeSha 是否正確（固定時間比較，避免時序攻擊） */
export function verifyTradeSha(tradeInfoHex, receivedSha, hashKey, hashIV) {
  // 先檢查格式：必須是 64 個 hex 字元（SHA256），也擋掉非字串（例如 JSON 送來的陣列）
  if (typeof tradeInfoHex !== 'string' || typeof receivedSha !== 'string' || !/^[0-9a-fA-F]{64}$/.test(receivedSha)) return false;
  const expected = Buffer.from(tradeSha(tradeInfoHex, hashKey, hashIV));
  const got = Buffer.from(receivedSha.toUpperCase());
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}
