// 多語言（i18n）小工具
// 所有畫面上的文字都放在 zh-tw.json 這種「字典檔」裡，程式只寫 key（例如 t('home.title')）。
// 之後要加英文：複製一份 en.json 翻譯，然後在 dictionaries 加一行就好。
import zhTW from './zh-tw.json';

const dictionaries = { 'zh-tw': zhTW };
let current = 'zh-tw';

/** 設定目前語言（例如 'zh-tw'） */
export function setLocale(locale) {
  if (dictionaries[locale]) current = locale;
}
export function getLocale() {
  return current;
}

/**
 * 取得翻譯文字。{name} 這種佔位符會被 vars 的值取代。
 * 例：t('home.progress', { done: 3, total: 10 }) → 「已打包 3/10」
 */
export function t(key, vars = {}) {
  const text = dictionaries[current][key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`).toString());
}

/** 資料檔裡的多語言欄位，例如 { "zh-tw": "護照" } → 「護照」 */
export function pick(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[current] ?? obj['zh-tw'] ?? '';
}
