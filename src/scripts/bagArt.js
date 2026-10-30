// ===== 包包插圖（RO 風格）：產生 <img> 元素 =====
// 圖檔在 src/assets/ro-bags/（128×128 webp，來源：/workspace/ezpakku-assets/ro-bags/ 縮小轉檔）。
// 用 import 載入，build 時 Vite 會自動加上網址前綴（base）和版本指紋，不用自己處理 /packing-list/。
import { h } from './dom.js';
import { bagArtKey, BAG_ART_ALT } from './bagArtMap.js';
import backpack from '../assets/ro-bags/backpack-128.webp?url';
import crossbody from '../assets/ro-bags/crossbody-bag-128.webp?url';
import suitcaseLarge from '../assets/ro-bags/suitcase-large-128.webp?url';
import suitcaseMedium from '../assets/ro-bags/suitcase-medium-128.webp?url';
import suitcaseSmall from '../assets/ro-bags/suitcase-small-128.webp?url';
import wallet from '../assets/ro-bags/wallet-128.webp?url';

const SRC = {
  backpack,
  'crossbody-bag': crossbody,
  'suitcase-large': suitcaseLarge,
  'suitcase-medium': suitcaseMedium,
  'suitcase-small': suitcaseSmall,
  wallet,
};

/**
 * 包包圖示：對得到插圖就回傳 <img>，對不到就回傳原本的 emoji 文字。
 * @param {string} icon emoji
 * @param {string} [kind] 包包種類（決定行李箱大小）
 * @param {number} [size] 顯示大小（px）
 */
export function bagIcon(icon, kind, size = 28) {
  const key = bagArtKey(icon, kind);
  if (!key) return icon;
  return h('img', {
    class: 'bag-art',
    src: SRC[key],
    width: String(size),
    height: String(size),
    alt: BAG_ART_ALT[key],
    loading: 'lazy',
    decoding: 'async',
    draggable: 'false',
  });
}
