// ===== 畫面小工具 =====
// 安全原則：所有使用者輸入的文字，一律用 textContent 放進畫面，
// 「絕對不要」把使用者的資料用 innerHTML 拼字串，這樣就不會有 XSS（被塞惡意程式）的問題。
import { t } from '../i18n/index.js';

/**
 * 建立 HTML 元素的小函式。
 *   h('button', { class: 'btn', onclick: fn }, '文字')
 * - 字串小孩一律當「純文字」（textContent），不會被當成 HTML。
 * - on 開頭的屬性會變成事件（onclick → click）。
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') el.setAttribute('style', value);
    else if (key in el && typeof value !== 'string') el[key] = value; // 例如 checked、disabled、value
    else el.setAttribute(key, value === true ? '' : value);
  }
  appendChildren(el, children);
  return el;
}
function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// ---------- 提示訊息（toast），取代 alert ----------
let toastTimer;
export function toast(message, action) {
  const box = document.getElementById('toast');
  box.replaceChildren(h('span', {}, message));
  if (action) {
    box.append(
      h('button', { type: 'button', class: 'toast-action', onclick: () => { action.run(); box.hidden = true; } }, action.label),
    );
  }
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), action ? 6000 : 2500);
}

// ---------- 自訂對話框，取代 alert / confirm / prompt ----------
// 用瀏覽器內建的 <dialog>，手機上也好看、可以用鍵盤 Esc 關閉。
/**
 * 打開對話框。
 *   body：要放的內容（元素）
 *   buttons：[{ label, value, kind: 'primary'|'danger'|'' }]
 * 回傳 Promise，使用者按哪個按鈕就得到它的 value（按 Esc 或背景就是 null）。
 * 如果 body 裡有 <form>，按「主要按鈕」會先檢查表單必填欄位。
 */
export function openDialog({ title, body, buttons }) {
  const dlg = document.getElementById('dialog');
  return new Promise((resolve) => {
    const form = h('form', { method: 'dialog', class: 'dialog-form' });
    form.append(h('h2', { class: 'dialog-title', id: 'dialog-title' }, title));
    if (body) form.append(h('div', { class: 'dialog-body' }, body));
    const row = h('div', { class: 'dialog-buttons' });
    for (const b of buttons) {
      row.append(
        h('button', {
          type: 'submit',
          value: b.value,
          class: `btn ${b.kind ?? ''}`,
          formnovalidate: b.kind !== 'primary',
        }, b.label),
      );
    }
    form.append(row);
    dlg.replaceChildren(form);
    dlg.setAttribute('aria-labelledby', 'dialog-title');
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue || null);
    };
    dlg.returnValue = '';
    dlg.addEventListener('close', onClose);
    // 點背景關閉
    dlg.onclick = (e) => { if (e.target === dlg) dlg.close(''); };
    dlg.showModal();
    // 自動聚焦第一個輸入框（手機上不強制跳鍵盤：只有桌機才聚焦）
    const firstInput = form.querySelector('input:not([type=checkbox]), select, textarea');
    if (firstInput && window.matchMedia('(pointer: fine)').matches) firstInput.focus();
  });
}

/** 是/否確認框。回傳 true / false */
export async function confirmDialog(message, { okLabel = t('dialog.ok'), danger = false } = {}) {
  const result = await openDialog({
    title: message,
    buttons: [
      { label: t('dialog.cancel'), value: 'cancel' },
      { label: okLabel, value: 'ok', kind: danger ? 'danger' : 'primary' },
    ],
  });
  return result === 'ok';
}

/** 表單欄位：標籤＋輸入框 */
export function field(label, input) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
}
