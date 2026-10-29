// 藍新金流設定：金鑰只從環境變數讀，絕對不要寫進程式碼。
// 網址來源：NDNF-1.2.6 §4.2.1（MPG 測試 ccore / 正式 core）、NDNP-1.0.8 §4.1（定期定額 /MPG/period）
export const GATEWAYS = {
  test: {
    mpg: 'https://ccore.newebpay.com/MPG/mpg_gateway',
    period: 'https://ccore.newebpay.com/MPG/period',
  },
  production: {
    mpg: 'https://core.newebpay.com/MPG/mpg_gateway',
    period: 'https://core.newebpay.com/MPG/period',
  },
};

// MPG 版本：NDNF-1.2.6 參數表寫 2.3（第 29–30 頁）；手冊範例程式寫 2.0。這裡跟參數表。
export const MPG_VERSION = '2.3';
// 定期定額建立委託版本：NDNP-1.0.8 §4.1 參數表 1.5
export const PERIOD_VERSION = '1.5';

/**
 * 讀環境變數。缺少金鑰時 ok=false，API 會回 503「金流尚未設定」。
 * NEWEBPAY_ENV 預設 test；只有明確寫 production 才會連正式環境。
 */
export function getConfig(env = process.env) {
  const merchantId = (env.NEWEBPAY_MERCHANT_ID || '').trim();
  const hashKey = (env.NEWEBPAY_HASH_KEY || '').trim();
  const hashIV = (env.NEWEBPAY_HASH_IV || '').trim();
  const mode = (env.NEWEBPAY_ENV || 'test').trim() === 'production' ? 'production' : 'test';
  const missing = [];
  if (!merchantId) missing.push('NEWEBPAY_MERCHANT_ID');
  if (!hashKey) missing.push('NEWEBPAY_HASH_KEY');
  if (!hashIV) missing.push('NEWEBPAY_HASH_IV');
  return {
    ok: missing.length === 0,
    missing,
    merchantId,
    hashKey,
    hashIV,
    mode,
    gateway: GATEWAYS[mode],
    // 給 NotifyURL / ReturnURL 用的網站網址（https、80/443 port）。沒設就用請求的網址。
    publicUrl: (env.NEWEBPAY_PUBLIC_URL || '').trim().replace(/\/+$/, ''),
    resultPath: (env.NEWEBPAY_RESULT_PATH || '/zh-tw/payment/result/').trim(),
  };
}
