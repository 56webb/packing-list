// ===== 插頭圖示（plug icons）=====
// 用程式畫 32×32 的 SVG：插頭的「正面」（插腳朝向你），外形和插腳形狀都照實際插頭畫，扁腳／圓腳／接地腳分得出來。
// - 顏色用 currentColor：跟著文字顏色走，深色模式、警告色都不用另外改。
// - 用 createElementNS 建立 SVG，不用 innerHTML（和 dom.js 的安全原則一樣）。
// - 形狀是「辨識用的示意圖」，不是精確尺寸。參考：IEC World Plugs https://www.iec.ch/world-plugs
const NS = 'http://www.w3.org/2000/svg';

// 畫法：32×32，看的是「插頭正面」（插腳朝向你）。
//   外形 body：插頭本體的輪廓（淡色填滿＋外框）
//     'rect' 方形（A/B/G/I/H）  'round' 圓形（E/F）  'euro' 細長八角（C）
//     'hex' 六角形（J/N）  'long' 長條（L）  'tri' 偏圓三角（D/M）  'oval'（K/O）
//   插腳 pins（實心）：
//     ['flat', cx, cy, 寬, 高, 旋轉角度]  扁腳／方腳（中心點座標）
//     ['round', cx, cy, 半徑]              圓腳
//     ['hole', cx, cy, 半徑]               空心圓＝插頭上的「接地孔」（E 型，接地針在牆上插座）
//     ['clip', cx, cy, 寬, 高]             接地夾片（F 型，在外框上下）
//     ['half', cx, cy, 半徑]               下半圓接地腳（K 型）
const SHAPES = {
  A: { body: 'rect', pins: [['flat', 11, 16, 2.6, 11], ['flat', 21, 16, 2.6, 11]] },                       // 兩支平行扁腳（美國、日本）
  B: { body: 'rect', pins: [['flat', 11, 12.5, 2.6, 9], ['flat', 21, 12.5, 2.6, 9], ['round', 16, 23.5, 2.4]] }, // A＋下方圓形接地腳
  C: { body: 'euro', pins: [['round', 10.5, 16, 2.3], ['round', 21.5, 16, 2.3]] },                          // 兩支圓腳（歐洲）
  D: { body: 'tri', pins: [['round', 16, 9.5, 3.2], ['round', 9.5, 21, 2.2], ['round', 22.5, 21, 2.2]] },  // 三支圓腳成三角，上方接地腳最粗
  E: { body: 'round', pins: [['round', 10, 17, 2.3], ['round', 22, 17, 2.3], ['hole', 16, 9, 2.3]] },       // 兩支圓腳＋上方接地孔（法國）
  F: { body: 'round', pins: [['round', 10, 16, 2.3], ['round', 22, 16, 2.3], ['clip', 16, 3.6, 6, 2.2], ['clip', 16, 28.4, 6, 2.2]] }, // 兩支圓腳＋上下接地夾片（德國）
  G: { body: 'rect', pins: [['flat', 16, 9.5, 3.2, 8], ['flat', 9.5, 21.5, 7, 3.2], ['flat', 22.5, 21.5, 7, 3.2]] },  // 三支方腳：上直下橫（英國）
  H: { body: 'rect', pins: [['flat', 10.5, 11, 2.4, 8, -35], ['flat', 21.5, 11, 2.4, 8, 35], ['flat', 16, 22, 2.4, 8]] }, // 以色列（舊式）：三支扁腳成 Y 字，上面兩支往外張開（和 I 型相反）
  I: { body: 'rect', pins: [['flat', 11, 12, 2.6, 9, 30], ['flat', 21, 12, 2.6, 9, -30], ['flat', 16, 23, 2.6, 7]] },     // 兩支斜扁腳（上窄下寬的倒 V）＋下方直的接地腳（澳洲、中國）
  J: { body: 'hex', pins: [['round', 8.5, 13.5, 2.1], ['round', 23.5, 13.5, 2.1], ['round', 16, 19, 2.1]] }, // 瑞士：三圓腳，中間接地腳偏下
  K: { body: 'oval', pins: [['round', 10, 13, 2.3], ['round', 22, 13, 2.3], ['half', 16, 20, 3.2]] },       // 丹麥：兩圓腳＋下方半圓接地腳
  L: { body: 'long', pins: [['round', 8, 16, 2], ['round', 16, 16, 2], ['round', 24, 16, 2]] },             // 義大利：三圓腳排一直線
  M: { body: 'tri', pins: [['round', 16, 9.5, 3.8], ['round', 9, 21.5, 2.8], ['round', 23, 21.5, 2.8]] },  // 南非：像 D，但腳更粗
  N: { body: 'hex', pins: [['round', 10, 12.5, 2.1], ['round', 22, 12.5, 2.1], ['round', 16, 20.5, 2.1]] }, // 巴西：三圓腳，接地腳在下方中間
  O: { body: 'oval', pins: [['round', 10.5, 12.5, 2.3], ['round', 21.5, 12.5, 2.3], ['round', 16, 21.5, 2.3]] }, // 泰國：兩圓腳＋下方圓接地腳
};
// TODO：清單以外的插頭型號（或資料打錯）會用「通用插頭」圖示，看到的話請補上形狀。
const GENERIC = { body: 'rect', pins: [['round', 11, 16, 2.3], ['round', 21, 16, 2.3]], unknown: true };

const BODY = {
  rect: { tag: 'rect', x: 3, y: 3, width: 26, height: 26, rx: 6 },
  round: { tag: 'circle', cx: 16, cy: 16, r: 13 },
  euro: { tag: 'path', d: 'M7 9.5 L25 9.5 L29.5 14 L29.5 18 L25 22.5 L7 22.5 L2.5 18 L2.5 14 Z' },
  hex: { tag: 'path', d: 'M9 5 L23 5 L29.5 12 L29.5 17 L16 27.5 L2.5 17 L2.5 12 Z' },
  long: { tag: 'rect', x: 2, y: 10, width: 28, height: 12, rx: 6 },
  tri: { tag: 'path', d: 'M16 3 C22 3 29.5 18 29.5 23 C29.5 27 26 29 16 29 C6 29 2.5 27 2.5 23 C2.5 18 10 3 16 3 Z' },
  oval: { tag: 'ellipse', cx: 16, cy: 16, rx: 13.5, ry: 12 },
};

function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function pin([kind, cx, cy, a, b, rot]) {
  if (kind === 'flat') {
    const attrs = { x: cx - a / 2, y: cy - b / 2, width: a, height: b, rx: 0.6, fill: 'currentColor' };
    if (rot) attrs.transform = `rotate(${rot} ${cx} ${cy})`;
    return el('rect', attrs);
  }
  if (kind === 'round') return el('circle', { cx, cy, r: a, fill: 'currentColor' });
  if (kind === 'hole') return el('circle', { cx, cy, r: a, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 });
  if (kind === 'clip') return el('rect', { x: cx - a / 2, y: cy - b / 2, width: a, height: b, rx: 0.8, fill: 'currentColor' });
  if (kind === 'half') return el('path', { d: `M${cx - a} ${cy} A${a} ${a} 0 0 0 ${cx + a} ${cy} Z`, fill: 'currentColor' });
  return null;
}

/**
 * 一個插頭圖示（SVG 元素）。
 *   plugIcon('A') → <svg role="img" aria-label="A 型插頭">…</svg>
 */
export function plugIcon(type) {
  const letter = String(type ?? '').trim().toUpperCase();
  const shape = SHAPES[letter] ?? GENERIC;
  const label = `${letter || '?'} 型插頭`;
  const svg = el('svg', {
    class: 'plug-icon', viewBox: '0 0 32 32', width: 32, height: 32,
    role: 'img', 'aria-label': label, focusable: 'false',
  });
  const title = el('title', {});
  title.textContent = label;
  svg.append(title);
  // 插頭本體：淡色填滿＋外框，插腳用實心深色，對比清楚
  const { tag, ...attrs } = BODY[shape.body];
  svg.append(el(tag, { ...attrs, fill: 'currentColor', 'fill-opacity': 0.12, stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
  for (const p of shape.pins) { const n = pin(p); if (n) svg.append(n); }
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
