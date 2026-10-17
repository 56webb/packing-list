// ===== 功能開關 =====
// 導購按鈕（「還沒有？去買」）先做好位置，但不顯示。
// 等申請到聯盟行銷帳號（Klook、KKday、蝦皮…），在 BUY_LINKS 填網址，再把 SHOW_BUY_BUTTONS 改成 true。
// ⚠️ 旅平險不能放佣金連結（在台灣可能違反保險招攬規定），這裡不要加保險的連結。
export const SHOW_BUY_BUTTONS = false;

/** buyKey（寫在 items.json）→ 連結。例如 esim: 'https://...你的聯盟連結...' */
export const BUY_LINKS = {
  // esim: '',
  // adapter: '',
};
