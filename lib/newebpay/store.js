// 訂單儲存介面
// ⚠️ 現在只是「記憶體」版本：Vercel Function 每次可能跑在不同機器上、重新啟動就清空，
//    只適合測試。正式收錢前一定要換成資料庫（建議 Supabase），見 docs/newebpay.md。
//
// 介面（換成 Supabase 時保持一樣的函式名稱即可）：
//   saveOrder(order)                 建立訂單（status: 'pending'）
//   getOrder(merchantOrderNo)        查訂單，找不到回傳 null
//   markProcessed(key, update)       第一次處理回傳 true；同一個 key 已處理過回傳 false（冪等）
//
// TODO(Supabase)：
//   - orders 資料表：merchant_order_no（unique）、plan_id、amount、email、status、trade_no、
//     period_no、raw_result(jsonb)、created_at、paid_at
//   - payment_events 資料表：event_key（unique，用來防重複處理）、merchant_order_no、payload(jsonb)、created_at
//   - markProcessed 用 insert ... on conflict do nothing 判斷是否第一次
//   - 只能在後端用 service role key（放環境變數），不要放到前端
const orders = new Map();
const processed = new Set();

export const memoryStore = {
  kind: 'memory',
  async saveOrder(order) {
    orders.set(order.merchantOrderNo, { ...order });
  },
  async getOrder(merchantOrderNo) {
    return orders.get(merchantOrderNo) || null;
  },
  async markProcessed(key, update = {}) {
    if (processed.has(key)) return false;
    processed.add(key);
    if (update.merchantOrderNo) {
      const prev = orders.get(update.merchantOrderNo) || {};
      orders.set(update.merchantOrderNo, { ...prev, ...update });
    }
    return true;
  },
  _reset() {
    orders.clear();
    processed.clear();
  },
};

export function getStore() {
  // TODO(Supabase)：設定好 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 後改回傳 supabaseStore
  return memoryStore;
}
