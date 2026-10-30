// ===== 包包圖示：emoji → RO 風格插圖（對照表，純資料、不碰畫面）=====
// 資料裡的包包圖示還是存 emoji（localStorage 的格式不變，舊清單照常能用），
// 只有「顯示在畫面上」時，才把對得到的 emoji 換成插圖。對不到的（💼🛍️📦🧺）就照舊顯示 emoji。
// 拆成獨立檔案是為了能用 `npm test` 直接測（這個檔案不 import 圖片）。

/** 插圖代號 → 繁中替代文字（alt） */
export const BAG_ART_ALT = {
  backpack: '背包',
  'crossbody-bag': '側背包',
  'suitcase-large': '大行李箱',
  'suitcase-medium': '中型行李箱',
  'suitcase-small': '小行李箱',
  wallet: '錢包',
};

/**
 * 依 emoji（和包包種類）找插圖代號；對不到回傳 null。
 * 🧳 會看包包種類：托運（checked）→ 大行李箱、登機（carryon）→ 小行李箱、其他 → 中型行李箱。
 * @param {string} icon  包包的 emoji，例如 '🎒'
 * @param {string} [kind] 'personal' | 'carryon' | 'checked'
 */
export function bagArtKey(icon, kind) {
  switch (icon) {
    case '🎒': return 'backpack';
    case '👜': return 'crossbody-bag';
    case '👝': return 'wallet'; // 👝 是「小手拿包／小袋」，最接近的是錢包插圖
    case '🧳':
      if (kind === 'checked') return 'suitcase-large';
      if (kind === 'carryon') return 'suitcase-small';
      return 'suitcase-medium';
    default: return null;
  }
}
