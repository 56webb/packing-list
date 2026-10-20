// ===== 插頭圖示（plug icons）=====
// 用程式畫 24×24 的 SVG：外框是插頭的正面，裡面是插腳（pin）。
// - 顏色用 currentColor：跟著文字顏色走，深色模式、警告色都不用另外改。
// - 用 createElementNS 建立 SVG，不用 innerHTML（和 dom.js 的安全原則一樣）。
// - 形狀是「辨識用的示意圖」，不是精確尺寸。參考：IEC World Plugs https://www.iec.ch/world-plugs
const NS = 'http://www.w3.org/2000/svg';

// 每種插頭的插腳：
//   ['rect', x, y, 寬, 高, 旋轉角度(選填)]   扁腳／方腳
//   ['circle', cx, cy, 半徑]                 圓腳
//   ['halfdown', cx, cy, 半徑]               下半圓（K 型的接地腳）
const SHAPES = {
  A: [['rect', 7.5, 7, 2, 10], ['rect', 14.5, 7, 2, 10]],                                  // 兩支平行扁腳
  B: [['rect', 7.5, 5, 2, 8], ['rect', 14.5, 5, 2, 8], ['circle', 12, 17, 1.9]],           // A＋下方圓形接地腳
  C: [['circle', 8, 12, 1.9], ['circle', 16, 12, 1.9]],                                     // 兩支圓腳
  D: [['circle', 8, 15, 1.6], ['circle', 16, 15, 1.6], ['circle', 12, 8, 2.3]],             // 三支圓腳成三角形，上方接地腳較粗
  E: [['circle', 8, 13, 1.9], ['circle', 16, 13, 1.9], ['rect', 11, 4.5, 2, 4]],            // 兩支圓腳＋上方接地（插座上的接地針）
  F: [['circle', 8, 12, 1.9], ['circle', 16, 12, 1.9], ['rect', 10, 3.2, 4, 1.8], ['rect', 10, 19, 4, 1.8]], // 兩支圓腳＋上下接地夾片
  G: [['rect', 11, 5, 2, 5.5], ['rect', 5.5, 14.5, 5, 2.2], ['rect', 13.5, 14.5, 5, 2.2]], // 三支方腳（倒三角形）
  H: [['rect', 7.5, 6, 2, 7, 30], ['rect', 14.5, 6, 2, 7, -30], ['rect', 11, 13, 2, 6]],    // 以色列：V 字形三支扁腳
  I: [['rect', 7.5, 6, 2, 7, 30], ['rect', 14.5, 6, 2, 7, -30], ['rect', 11, 14, 2, 5.5]],  // 兩支斜扁腳（倒 V）＋下方直的接地腳
  J: [['circle', 7, 10, 1.7], ['circle', 17, 10, 1.7], ['circle', 12, 14, 1.7]],            // 瑞士：三圓腳，中間接地腳偏下
  K: [['circle', 8, 9.5, 1.8], ['circle', 16, 9.5, 1.8], ['halfdown', 12, 15, 2.4]],        // 丹麥：兩圓腳＋下方半圓接地腳
  L: [['circle', 6, 12, 1.7], ['circle', 12, 12, 1.7], ['circle', 18, 12, 1.7]],            // 義大利：三圓腳排一直線
  M: [['circle', 7.5, 15.5, 2], ['circle', 16.5, 15.5, 2], ['circle', 12, 7.5, 2.8]],       // 南非：像 D 但腳更粗
  N: [['circle', 8, 9, 1.7], ['circle', 16, 9, 1.7], ['circle', 12, 15.5, 1.7]],            // 巴西：三圓腳，接地腳在下方中間
  O: [['circle', 8, 9.5, 1.9], ['circle', 16, 9.5, 1.9], ['circle', 12, 16.5, 1.9]],        // 泰國：兩圓腳＋下方圓接地腳
};
// TODO：清單以外的插頭型號（或資料打錯）會用「通用插頭」圖示，看到的話請補上形狀。
const GENERIC = [['rect', 8, 7, 2, 6], ['rect', 14, 7, 2, 6], ['rect', 9, 13, 6, 4]];

function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 一個插頭圖示（SVG 元素）。
 *   plugIcon('A') → <svg role="img" aria-label="A 型插頭">…</svg>
 */
export function plugIcon(type) {
  const letter = String(type ?? '').trim().toUpperCase();
  const shapes = SHAPES[letter] ?? GENERIC;
  const svg = el('svg', {
    class: 'plug-icon', viewBox: '0 0 24 24', width: 24, height: 24,
    role: 'img', 'aria-label': `${letter || '?'} 型插頭`, focusable: 'false',
  });
  svg.append(el('title', {}));
  svg.firstChild.textContent = `${letter || '?'} 型插頭`;
  // 外框：插頭正面
  svg.append(el('rect', { x: 2, y: 2, width: 20, height: 20, rx: 5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
  for (const [kind, a, b, c, d, rot] of shapes) {
    if (kind === 'rect') {
      const attrs = { x: a, y: b, width: c, height: d, rx: 0.5, fill: 'currentColor' };
      if (rot) attrs.transform = `rotate(${rot} ${a + c / 2} ${b + d / 2})`;
      svg.append(el('rect', attrs));
    } else if (kind === 'circle') {
      svg.append(el('circle', { cx: a, cy: b, r: c, fill: 'currentColor' }));
    } else if (kind === 'halfdown') {
      svg.append(el('path', { d: `M${a - c} ${b} A${c} ${c} 0 0 0 ${a + c} ${b} Z`, fill: 'currentColor' }));
    }
  }
  return svg;
}

/**
 * 一排插頭圖示，每個圖示下面有字母。
 *   plugIcons(['G','D','M']) → <span class="plug-icons">…</span>
 * 字母設 aria-hidden，因為圖示本身已經有「X 型插頭」的說明，旁邊也會保留文字。
 */
export function plugIcons(plugs = []) {
  const row = document.createElement('span');
  row.className = 'plug-icons';
  for (const p of plugs) {
    const item = document.createElement('span');
    item.className = 'plug-item';
    const letter = document.createElement('span');
    letter.className = 'plug-letter';
    letter.setAttribute('aria-hidden', 'true');
    letter.textContent = String(p).toUpperCase();
    item.append(plugIcon(p), letter);
    row.append(item);
  }
  return row;
}
