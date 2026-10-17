// ===== 主程式：畫面 =====
// 流程：網址的 # 決定要顯示哪一頁
//   #/            → 我的旅行（首頁）
//   #/new         → 新增旅行表單
//   #/trip/<id>   → 某一趟旅行的清單
// 資料一改變（store.subscribe），就重畫目前這一頁。
import { t, pick } from '../i18n/index.js';
import { h, toast, openDialog, confirmDialog, field } from './dom.js';
import { createStore, BAG_ICONS } from './store.js';
import { createLocalStorageAdapter } from './storage.js';
import { COUNTRIES, CATEGORIES, TAGS, generateTrip, getCountry, tripClimate } from './generator.js';
import { SHOW_BUY_BUTTONS, BUY_LINKS } from './config.js';

const store = createStore(createLocalStorageAdapter());
const app = document.getElementById('app');
const backBtn = document.getElementById('back-btn');

// 只存在記憶體的畫面狀態（不需要存檔）
const ui = {
  onlyUnchecked: false,
  openSealed: new Set(), // 已封箱但使用者手動打開來看的包包
};

// ---------- 路由 ----------
function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, id] = hash.split('/');
  if (page === 'new') return { page: 'new' };
  if (page === 'trip' && store.trip(id)) return { page: 'trip', id };
  return { page: 'home' };
}
export const go = (path) => { location.hash = path; };

function render() {
  // 記住目前聚焦的元素，重畫後放回去（鍵盤使用者才不會迷路）
  const focusKey = document.activeElement?.dataset?.key;
  const route = currentRoute();
  backBtn.hidden = route.page === 'home';
  if (route.page === 'new') app.replaceChildren(renderTripForm());
  else if (route.page === 'trip') app.replaceChildren(renderTrip(route.id));
  else app.replaceChildren(renderHome());
  if (focusKey) app.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

// ---------- 小工具 ----------
const progressOf = (items) => ({ done: items.filter((i) => i.checked).length, total: items.length });
function progressBar({ done, total }, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': label },
    h('div', { class: `progress-fill ${pct === 100 ? 'complete' : ''}`, style: `width:${pct}%` }));
}
const climateLabel = (c) => t(`climate.${c}`);
const categoryName = (id) => t(`cat.${id}`);
const categoryIcon = (id) => CATEGORIES.find((c) => c.id === id)?.icon ?? '•';

/** 某個物品放在托運包包、但它不能托運 → true */
function isForbiddenHere(item, bag) {
  return bag?.kind === 'checked' && item.tags.some((tag) => TAGS[tag]?.forbidChecked);
}

// ======================================================================
// 首頁：我的旅行
// ======================================================================
function renderHome() {
  const trips = store.trips();
  const list = trips.length
    ? h('ul', { class: 'trip-list' }, trips.map((trip) => {
        const items = store.itemsOf(trip.id);
        const p = progressOf(items);
        const country = getCountry(trip.countryCode);
        return h('li', {},
          h('a', { class: 'trip-card', href: `#/trip/${trip.id}`, dataset: { key: `trip-${trip.id}` } },
            h('span', { class: 'trip-card-name' }, trip.name),
            h('span', { class: 'trip-card-meta' }, `${country?.name ?? t('form.countryOther')}・${trip.days} 天`),
            progressBar(p, trip.name),
            h('span', { class: 'trip-card-meta' }, t('home.progress', p))));
      }))
    : h('p', { class: 'empty' }, t('home.empty'));

  return h('div', { class: 'page home' },
    h('p', { class: 'tagline' }, t('app.tagline')),
    h('a', { class: 'btn primary big', href: '#/new', dataset: { key: 'new-trip' } }, t('home.newTrip')),
    h('h1', { class: 'section-title' }, t('home.title')),
    list,
    h('div', { class: 'backup-row' },
      h('button', { type: 'button', class: 'btn', onclick: exportBackup }, t('trip.export')),
      h('button', { type: 'button', class: 'btn', onclick: importBackup }, t('trip.import'))),
    h('p', { class: 'note' }, t('home.localNote')),
  );
}

// ======================================================================
// 新增旅行表單
// ======================================================================
function renderTripForm() {
  const today = new Date();
  today.setDate(today.getDate() + 14);
  const defaultDate = today.toISOString().slice(0, 10);

  const nameInput = h('input', { type: 'text', name: 'name', maxlength: '80', placeholder: t('form.namePlaceholder'), autocomplete: 'off' });
  const countrySelect = h('select', { name: 'country', required: true },
    COUNTRIES.map((c) => h('option', { value: c.code }, c.name)),
    h('option', { value: '' }, t('form.countryOther')));
  countrySelect.value = 'JP';
  const dateInput = h('input', { type: 'date', name: 'startDate', value: defaultDate });
  const daysInput = h('input', { type: 'number', name: 'days', min: 1, max: 90, value: '5', inputmode: 'numeric', required: true });
  const typeBoxes = ['city', 'beach', 'ski', 'business', 'kids'].map((type) =>
    h('label', { class: 'chip' },
      h('input', { type: 'checkbox', name: 'types', value: type, checked: type === 'city' }),
      h('span', {}, t(`type.${type}`))));
  const luggageRadios = ['carryon7', 'checked'].map((lg) =>
    h('label', { class: 'chip' },
      h('input', { type: 'radio', name: 'luggage', value: lg, checked: lg === 'checked' }),
      h('span', {}, t(`luggage.${lg}`))));
  const climateSelect = h('select', { name: 'climate' },
    h('option', { value: 'auto' }, t('form.climateAuto')),
    ['hot', 'warm', 'cool', 'cold'].map((c) => h('option', { value: c }, climateLabel(c))));
  const climateHint = h('p', { class: 'hint', 'aria-live': 'polite' });

  // 即時顯示「東京 11 月平均約 12.5°C」
  function updateHint() {
    const country = getCountry(countrySelect.value);
    const info = tripClimate({ countryCode: countrySelect.value, startDate: dateInput.value, days: Number(daysInput.value) || 1, climate: 'auto' });
    if (climateSelect.value !== 'auto') climateHint.textContent = '';
    else if (!country || info.avgTemps.length === 0) climateHint.textContent = t('form.climateUnknown');
    else {
      const avg = info.avgTemps.reduce((a, b) => a + b, 0) / info.avgTemps.length;
      climateHint.textContent = `${t('form.climateHint', { city: country.city, months: info.months.join('、'), temp: avg.toFixed(1) })}（${info.climates.map(climateLabel).join('／')}）`;
    }
  }
  [countrySelect, dateInput, daysInput, climateSelect].forEach((el) => el.addEventListener('input', updateHint));
  updateHint();

  const form = h('form', { class: 'trip-form', onsubmit: (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const { trip, bags, items } = generateTrip({
      name: data.get('name'),
      countryCode: data.get('country'),
      startDate: data.get('startDate'),
      days: Number(data.get('days')),
      types: data.getAll('types'),
      luggage: data.get('luggage'),
      climate: data.get('climate'),
    });
    store.createTrip(trip, bags, items);
    go(`/trip/${trip.id}`);
  } },
    h('h1', {}, t('form.title')),
    field(t('form.country'), countrySelect),
    h('div', { class: 'field-row' }, field(t('form.startDate'), dateInput), field(t('form.days'), daysInput)),
    h('fieldset', { class: 'field' }, h('legend', { class: 'field-label' }, t('form.types')), h('div', { class: 'chips' }, typeBoxes)),
    h('fieldset', { class: 'field' }, h('legend', { class: 'field-label' }, t('form.luggage')), h('div', { class: 'chips' }, luggageRadios)),
    field(t('form.climate'), climateSelect),
    climateHint,
    field(t('form.name'), nameInput),
    h('div', { class: 'form-actions' },
      h('a', { class: 'btn', href: '#/' }, t('form.cancel')),
      h('button', { type: 'submit', class: 'btn primary', dataset: { key: 'generate' } }, t('form.submit'))),
  );
  return h('div', { class: 'page' }, form);
}

// ======================================================================
// 旅行清單頁（主要畫面）
// ======================================================================
function renderTrip(tripId) {
  const trip = store.trip(tripId);
  const bags = store.bagsOf(tripId);
  const items = store.itemsOf(tripId);
  const country = getCountry(trip.countryCode);
  const climate = tripClimate(trip);
  const p = progressOf(items);

  // 檢查：有沒有「不能托運」的東西被放進托運包包
  const bagById = new Map(bags.map((b) => [b.id, b]));
  const forbidden = items.filter((i) => isForbiddenHere(i, bagById.get(i.bagId)));

  const infoParts = [country?.name ?? t('form.countryOther'), `${trip.days} 天`];
  if (climate.climates.length) infoParts.push(climate.climates.map((c) => t(`climate.${c}`).replace(/（.*）/, '')).join('／'));
  if (country && trip.countryCode !== 'TW') infoParts.push(`${country.plugs.join('/')} 型插頭 ${country.voltage}`);

  // 頂部（縮小，讓清單在第一個畫面就看得到）
  const header = h('div', { class: 'trip-head' },
    h('div', { class: 'trip-title-row' },
      h('h1', { class: 'trip-title' }, trip.name),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('trip.menu'), onclick: () => openTripMenu(trip), dataset: { key: 'trip-menu' } }, '⋯')),
    h('p', { class: 'trip-info' }, infoParts.join('・')),
    h('div', { class: 'trip-progress' },
      progressBar(p, t('trip.progress', p)),
      h('span', { class: 'trip-progress-text' }, t('trip.progress', p))),
  );

  const warn = forbidden.length
    ? h('p', { class: 'warn-banner', role: 'alert' }, '⚠️ ', t('trip.warnChecked', { count: forbidden.length, names: forbidden.map((i) => i.name).join('、') }))
    : null;

  const toolbar = h('div', { class: 'toolbar' },
    h('label', { class: 'chip small' },
      h('input', { type: 'checkbox', checked: ui.onlyUnchecked, dataset: { key: 'only-unchecked' }, onchange: (e) => { ui.onlyUnchecked = e.target.checked; render(); } }),
      h('span', {}, t('trip.unchecked'))),
    h('button', { type: 'button', class: 'btn', onclick: () => addBagDialog(trip.id), dataset: { key: 'add-bag' } }, t('bag.add')));

  const sections = bags.map((bag) => renderBag(trip, bag, items.filter((i) => i.bagId === bag.id), bags));
  const unassigned = items.filter((i) => i.bagId === null);
  if (unassigned.length) sections.push(renderBag(trip, null, unassigned, bags));

  const bottomBar = h('div', { class: 'bottom-bar no-print' },
    h('button', { type: 'button', class: 'btn primary big', onclick: () => itemDialog(trip, null, bags[0]?.id ?? null), dataset: { key: 'add-item' } }, t('item.add')));

  return h('div', { class: 'page trip' }, header, warn, toolbar, h('div', { class: 'bags' }, sections), bottomBar);
}

/** 一個包包的區塊（bag = null 代表「未指定」） */
function renderBag(trip, bag, bagItems, allBags) {
  const p = progressOf(bagItems);
  const sealed = bag?.sealed ?? false;
  const collapsed = sealed && !ui.openSealed.has(bag.id);
  const visibleItems = ui.onlyUnchecked ? bagItems.filter((i) => !i.checked) : bagItems;
  const name = bag ? bag.name : t('bag.unassigned');
  const key = bag ? bag.id : 'unassigned';

  const headLeft = h('button', {
    type: 'button',
    class: 'bag-toggle',
    'aria-expanded': String(!collapsed),
    dataset: { key: `toggle-${key}` },
    onclick: () => {
      if (!sealed) return;
      ui.openSealed.has(bag.id) ? ui.openSealed.delete(bag.id) : ui.openSealed.add(bag.id);
      render();
    },
  },
    h('span', { class: 'bag-icon', 'aria-hidden': 'true' }, bag ? bag.icon : '📍'),
    h('span', { class: 'bag-name' }, name),
    bag ? h('span', { class: `badge kind-${bag.kind}` }, t(`bagKind.${bag.kind}`)) : null,
    bag?.hasTracker ? h('span', { class: 'badge', title: t('bag.tracker') }, '📡') : null,
    sealed ? h('span', { class: 'badge sealed' }, '🔒 ', t('bag.sealed')) : null);

  const actions = bag
    ? h('div', { class: 'bag-actions' },
        h('button', { type: 'button', class: `btn small ${sealed ? '' : 'seal'}`, dataset: { key: `seal-${bag.id}` }, onclick: () => toggleSeal(bag, bagItems) }, sealed ? t('bag.unseal') : `🔒 ${t('bag.seal')}`),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${t('bag.editTitle')}：${bag.name}`, dataset: { key: `edit-bag-${bag.id}` }, onclick: () => editBagDialog(bag, bagItems.length) }, '⋯'))
    : null;

  const head = h('div', { class: 'bag-head' },
    h('div', { class: 'bag-head-row' }, headLeft, actions),
    h('div', { class: 'bag-progress' }, progressBar(p, `${name} ${p.done}/${p.total}`), h('span', { class: 'bag-count' }, t('bag.progress', p))));

  const body = collapsed
    ? null
    : h('div', { class: 'bag-body' },
        visibleItems.length
          ? h('ul', { class: 'items' }, visibleItems.map((item) => renderItem(trip, item, bag, sealed, allBags)))
          : h('p', { class: 'empty small' }, bagItems.length ? '✓' : t('bag.empty')),
        !sealed && bag
          ? h('button', { type: 'button', class: 'add-here', dataset: { key: `add-to-${bag.id}` }, onclick: () => itemDialog(trip, null, bag.id) }, `＋ ${t('item.addTitle')}`)
          : null);

  return h('section', { class: `bag ${sealed ? 'is-sealed' : ''} ${p.total && p.done === p.total ? 'is-done' : ''} ${bag ? '' : 'is-unassigned'}`, 'aria-label': name }, head, body);
}

/** 一個物品（一行） */
function renderItem(trip, item, bag, sealed, allBags) {
  const forbidden = isForbiddenHere(item, bag);
  const tags = item.tags.filter((tag) => TAGS[tag]).map((tag) =>
    h('button', { type: 'button', class: `tag ${forbidden && TAGS[tag].forbidChecked ? 'danger' : ''}`, onclick: () => showTagInfo(tag) },
      h('span', { class: 'tag-pill' }, `${TAGS[tag].icon} ${forbidden && TAGS[tag].forbidChecked ? t('item.forbidChecked') : pick(TAGS[tag].label)}`)));

  // 導購按鈕：先預留，SHOW_BUY_BUTTONS = false 時不顯示
  const buyUrl = item.buyKey ? BUY_LINKS[item.buyKey] : null;
  const buy = SHOW_BUY_BUTTONS && buyUrl && !item.checked
    ? h('a', { class: 'buy-slot', href: buyUrl, target: '_blank', rel: 'sponsored noopener' }, t('buy.button'))
    : null;

  return h('li', { class: `item ${item.checked ? 'checked' : ''}` },
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: item.checked, disabled: sealed, dataset: { key: `check-${item.id}` }, onchange: () => store.toggleItem(item.id) }),
      h('span', { class: 'item-text' },
        h('span', { class: 'item-name' }, item.name),
        item.qty > 1 ? h('span', { class: 'qty' }, ` ×${item.qty}`) : null,
        item.note ? h('span', { class: 'item-note' }, item.note) : null)),
    tags.length || buy ? h('div', { class: 'item-tags' }, tags, buy) : null,
    h('button', { type: 'button', class: 'icon-btn more', 'aria-label': t('item.more', { name: item.name }), dataset: { key: `more-${item.id}` }, onclick: () => itemDialog(trip, item, item.bagId, allBags) }, '⋯'));
}

// ======================================================================
// 動作與對話框
// ======================================================================
async function toggleSeal(bag, bagItems) {
  if (bag.sealed) {
    store.updateBag(bag.id, { sealed: false });
    return;
  }
  const left = bagItems.filter((i) => !i.checked).length;
  if (left > 0 && !(await confirmDialog(t('bag.sealConfirm', { name: bag.name, count: left }), { okLabel: t('bag.seal') }))) return;
  ui.openSealed.delete(bag.id);
  store.updateBag(bag.id, { sealed: true });
  toast(t('bag.sealedToast', { name: bag.name }));
}

function bagFormFields(bag) {
  const name = h('input', { type: 'text', name: 'name', required: true, maxlength: '60', value: bag?.name ?? '', autocomplete: 'off', dataset: { key: 'bag-name' } });
  const kind = h('select', { name: 'kind' }, ['personal', 'carryon', 'checked'].map((k) => h('option', { value: k }, t(`bagKind.${k}`))));
  kind.value = bag?.kind ?? 'carryon';
  const icons = h('div', { class: 'chips' }, BAG_ICONS.map((icon) =>
    h('label', { class: 'chip icon-chip' }, h('input', { type: 'radio', name: 'icon', value: icon, checked: (bag?.icon ?? '🎒') === icon }), h('span', {}, icon))));
  const tracker = h('label', { class: 'chip' }, h('input', { type: 'checkbox', name: 'tracker', checked: bag?.hasTracker ?? false }), h('span', {}, t('bag.tracker')));
  const body = h('div', {}, field(t('bag.name'), name), field(t('bag.kind'), kind),
    h('fieldset', { class: 'field' }, h('legend', { class: 'field-label' }, t('bag.icon')), icons), tracker);
  const read = () => {
    const form = body.closest('form');
    const data = new FormData(form);
    return { name: String(data.get('name') ?? '').trim(), kind: data.get('kind'), icon: data.get('icon'), hasTracker: data.get('tracker') === 'on' };
  };
  return { body, read };
}

async function addBagDialog(tripId) {
  const { body, read } = bagFormFields(null);
  const result = await openDialog({ title: t('bag.addTitle'), body, buttons: [{ label: t('dialog.cancel'), value: 'cancel' }, { label: t('dialog.save'), value: 'save', kind: 'primary' }] });
  if (result !== 'save') return;
  const data = read();
  if (data.name) store.addBag(tripId, data);
}

async function editBagDialog(bag, count) {
  const { body, read } = bagFormFields(bag);
  const result = await openDialog({ title: t('bag.editTitle'), body, buttons: [
    { label: t('bag.delete'), value: 'delete', kind: 'danger' },
    { label: t('dialog.cancel'), value: 'cancel' },
    { label: t('dialog.save'), value: 'save', kind: 'primary' },
  ] });
  if (result === 'save') {
    const data = read();
    if (data.name) store.updateBag(bag.id, data);
  } else if (result === 'delete') {
    if (await confirmDialog(t('bag.deleteConfirm', { name: bag.name, count }), { okLabel: t('item.delete'), danger: true })) store.deleteBag(bag.id);
  }
}

/** 新增（item = null）或編輯物品 */
async function itemDialog(trip, item, defaultBagId, bags = store.bagsOf(trip.id)) {
  const name = h('input', { type: 'text', name: 'name', required: true, maxlength: '100', value: item?.name ?? '', autocomplete: 'off', dataset: { key: 'item-name' } });
  const qty = h('input', { type: 'number', name: 'qty', min: 1, max: 999, value: String(item?.qty ?? 1), inputmode: 'numeric' });
  const bagSelect = h('select', { name: 'bag' },
    bags.map((b) => h('option', { value: b.id }, `${b.icon} ${b.name}`)),
    h('option', { value: '' }, `📍 ${t('bag.unassigned')}`));
  bagSelect.value = defaultBagId ?? '';
  const cat = h('select', { name: 'category' }, CATEGORIES.map((c) => h('option', { value: c.id }, `${c.icon} ${categoryName(c.id)}`)));
  cat.value = item?.category ?? 'custom';
  const note = h('input', { type: 'text', name: 'note', maxlength: '300', value: item?.note ?? '', autocomplete: 'off' });

  const tagInfo = item?.tags?.length
    ? h('div', { class: 'tag-info' }, item.tags.filter((tag) => TAGS[tag]).map((tag) => tagDetail(tag)))
    : null;

  const body = h('div', {}, field(t('item.name'), name),
    h('div', { class: 'field-row' }, field(t('item.qty'), qty), field(t('item.bag'), bagSelect)),
    field(t('item.category'), cat), field(t('item.note'), note), tagInfo);
  const buttons = [{ label: t('dialog.cancel'), value: 'cancel' }, { label: t('dialog.save'), value: 'save', kind: 'primary' }];
  if (item) buttons.unshift({ label: t('item.delete'), value: 'delete', kind: 'danger' });

  const result = await openDialog({ title: item ? t('item.editTitle') : t('item.addTitle'), body, buttons });
  if (result === 'save') {
    const data = {
      name: name.value.trim(),
      qty: Number(qty.value) || 1,
      bagId: bagSelect.value || null,
      category: cat.value,
      note: note.value.trim(),
    };
    if (!data.name) return;
    if (item) store.updateItem(item.id, data);
    else store.addItem(trip.id, { ...data, checked: false, tags: [] });
  } else if (result === 'delete' && item) {
    const snapshot = store.deleteItem(item.id);
    toast(t('item.deleted', { name: item.name }), { label: t('item.undo'), run: () => store.restoreItem(snapshot) });
  }
}

/** 規定標籤的說明＋官方來源連結 */
function tagDetail(tag) {
  const info = TAGS[tag];
  return h('div', { class: 'tag-detail' },
    h('h3', {}, `${info.icon} ${pick(info.title)}`),
    h('p', {}, pick(info.detail)),
    h('p', { class: 'sources-title' }, t('tag.sources')),
    h('ul', { class: 'sources' }, info.sources.map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, pick(s.name))))),
    h('p', { class: 'hint' }, t('tag.disclaimer')));
}
function showTagInfo(tag) {
  openDialog({ title: pick(TAGS[tag].title), body: tagDetail(tag), buttons: [{ label: t('dialog.close'), value: 'close', kind: 'primary' }] });
}

async function openTripMenu(trip) {
  const result = await openDialog({ title: trip.name, body: null, buttons: [
    { label: `📤 ${t('trip.share')}`, value: 'share' },
    { label: `🖨️ ${t('trip.print')}`, value: 'print' },
    { label: `✏️ ${t('trip.rename')}`, value: 'rename' },
    { label: `💾 ${t('trip.export')}`, value: 'export' },
    { label: `🗑️ ${t('trip.delete')}`, value: 'delete', kind: 'danger' },
    { label: t('dialog.close'), value: 'close' },
  ] });
  if (result === 'share') shareTrip(trip);
  else if (result === 'print') { ui.openSealed = new Set(store.bagsOf(trip.id).map((b) => b.id)); render(); setTimeout(() => window.print(), 50); }
  else if (result === 'export') exportBackup();
  else if (result === 'rename') renameTrip(trip);
  else if (result === 'delete') {
    if (await confirmDialog(t('trip.deleteConfirm', { name: trip.name }), { okLabel: t('item.delete'), danger: true })) {
      store.deleteTrip(trip.id);
      go('/');
    }
  }
}

async function renameTrip(trip) {
  const input = h('input', { type: 'text', name: 'name', required: true, maxlength: '80', value: trip.name, autocomplete: 'off' });
  const r = await openDialog({ title: t('trip.rename'), body: field(t('form.name'), input), buttons: [{ label: t('dialog.cancel'), value: 'cancel' }, { label: t('dialog.save'), value: 'save', kind: 'primary' }] });
  if (r === 'save' && input.value.trim()) store.updateTrip(trip.id, { name: input.value.trim() });
}

/** 把清單變成純文字（分享到 LINE、備忘錄用） */
export function tripToText(tripId) {
  const trip = store.trip(tripId);
  const items = store.itemsOf(tripId);
  const lines = [`🧳 ${trip.name}（${trip.days} 天）`];
  const groups = [...store.bagsOf(tripId).map((b) => ({ id: b.id, title: `${b.icon} ${b.name}${b.sealed ? ' 🔒' : ''}` })), { id: null, title: `📍 ${t('bag.unassigned')}` }];
  for (const g of groups) {
    const list = items.filter((i) => i.bagId === g.id);
    if (!list.length) continue;
    lines.push('', `【${g.title}】`);
    list.forEach((i) => lines.push(`${i.checked ? '☑' : '☐'} ${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`));
  }
  return lines.join('\n');
}
async function shareTrip(trip) {
  const text = tripToText(trip.id);
  try {
    if (navigator.share) await navigator.share({ title: trip.name, text });
    else { await navigator.clipboard.writeText(text); toast(t('trip.copied')); }
  } catch (err) {
    if (err?.name !== 'AbortError') toast(t('trip.shareFail'));
  }
}

function exportBackup() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `packing-list-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importBackup() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const count = store.importJSON(await file.text());
      toast(t('import.done', { count }));
    } catch {
      toast(t('import.fail'));
    }
  });
  document.body.append(input);
  input.click();
}

// ---------- 啟動 ----------
backBtn.addEventListener('click', () => go('/'));
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
store.subscribe(() => render());
render();

// 給自動測試用（在瀏覽器 console 也可以玩）：window.__packing.store
window.__packing = { store, tripToText };
