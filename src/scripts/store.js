// ===== 資料中心（Store）=====
// 所有「讀資料、改資料」都集中在這裡，畫面（app.js）只負責顯示。
// 好處：改完資料後，只要通知一次「資料變了」，畫面就會重畫，不會漏掉。
//
// 資料結構（跟之後 Supabase 的三張資料表一樣，是「扁平」的）：
//   trips: [{ id, name, countryCode, startDate, days, types[], luggage, climate, createdAt, updatedAt }]
//   bags:  [{ id, tripId, name, icon, kind, sealed, hasTracker, order, updatedAt }]
//   items: [{ id, tripId, bagId|null, name, category, qty, checked, tags[], note, templateId, buyKey, order, updatedAt }]
// 物品用 bagId（包包的 UUID）指向包包，不用名稱 → 改名不會壞掉。bagId = null 就是「未指定」。

const VERSION = 1;
const BAG_KINDS = ['personal', 'carryon', 'checked'];
export const BAG_ICONS = ['🎒', '🧳', '👜', '💼', '🛍️', '📦', '👝', '🧺'];

/** 產生 UUID（瀏覽器內建） */
export const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---------- 資料檢查（匯入檔案、讀取舊資料時用，防止壞資料或惡意資料） ----------
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v, min, max, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const isId = (v) => typeof v === 'string' && ID_RE.test(v);

function cleanTrip(t) {
  if (!t || !isId(t.id)) return null;
  return {
    id: t.id,
    name: str(t.name, 80),
    countryCode: /^[A-Z]{2}$/.test(t.countryCode) ? t.countryCode : '',
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(t.startDate) ? t.startDate : '',
    days: int(t.days, 1, 90, 5),
    types: Array.isArray(t.types) ? t.types.filter((x) => typeof x === 'string').slice(0, 10) : [],
    luggage: t.luggage === 'carryon7' ? 'carryon7' : 'checked',
    climate: ['auto', 'hot', 'warm', 'cool', 'cold'].includes(t.climate) ? t.climate : 'auto',
    createdAt: str(t.createdAt, 40) || now(),
    updatedAt: str(t.updatedAt, 40) || now(),
  };
}
function cleanBag(b, tripIds) {
  if (!b || !isId(b.id) || !tripIds.has(b.tripId)) return null;
  return {
    id: b.id,
    tripId: b.tripId,
    name: str(b.name, 60) || '包包',
    icon: BAG_ICONS.includes(b.icon) ? b.icon : '🎒',
    kind: BAG_KINDS.includes(b.kind) ? b.kind : 'carryon',
    sealed: b.sealed === true,
    hasTracker: b.hasTracker === true,
    order: int(b.order, 0, 9999, 0),
    updatedAt: str(b.updatedAt, 40) || now(),
  };
}
function cleanItem(i, tripIds, bagIds) {
  if (!i || !isId(i.id) || !tripIds.has(i.tripId)) return null;
  return {
    id: i.id,
    tripId: i.tripId,
    bagId: bagIds.has(i.bagId) ? i.bagId : null,
    name: str(i.name, 100) || '（未命名）',
    category: str(i.category, 30) || 'custom',
    qty: int(i.qty, 1, 999, 1),
    checked: i.checked === true,
    tags: Array.isArray(i.tags) ? i.tags.filter((x) => typeof x === 'string' && ID_RE.test(x)).slice(0, 10) : [],
    note: str(i.note, 300),
    templateId: isId(i.templateId) ? i.templateId : null,
    buyKey: isId(i.buyKey) ? i.buyKey : null,
    order: int(i.order, 0, 99999, 0),
    updatedAt: str(i.updatedAt, 40) || now(),
  };
}
/** 把任何來源的資料整理成乾淨、格式正確的 state */
export function sanitizeState(raw) {
  const empty = { version: VERSION, trips: [], bags: [], items: [] };
  if (!raw || typeof raw !== 'object') return empty;
  const trips = (Array.isArray(raw.trips) ? raw.trips : []).map(cleanTrip).filter(Boolean);
  const tripIds = new Set(trips.map((t) => t.id));
  const bags = (Array.isArray(raw.bags) ? raw.bags : []).map((b) => cleanBag(b, tripIds)).filter(Boolean);
  const bagIds = new Set(bags.map((b) => b.id));
  const items = (Array.isArray(raw.items) ? raw.items : []).map((i) => cleanItem(i, tripIds, bagIds)).filter(Boolean);
  return { version: VERSION, trips, bags, items };
}

// ---------- Store 本體 ----------
export function createStore(adapter) {
  let state = sanitizeState(adapter.load());
  const listeners = new Set();

  /** 存檔＋通知畫面重畫。changes 給之後的雲端同步用。 */
  function commit(changes) {
    adapter.save(state, changes);
    listeners.forEach((fn) => fn(changes));
  }
  const up = (table, record) => ({ table, op: 'upsert', record });
  const del = (table, id) => ({ table, op: 'delete', id });

  return {
    /** 資料改變時呼叫 fn（畫面用來重畫） */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // ----- 讀取 -----
    trips: () => [...state.trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    trip: (id) => state.trips.find((t) => t.id === id) ?? null,
    bagsOf: (tripId) => state.bags.filter((b) => b.tripId === tripId).sort((a, b) => a.order - b.order),
    itemsOf: (tripId) => state.items.filter((i) => i.tripId === tripId).sort((a, b) => a.order - b.order),
    bag: (id) => state.bags.find((b) => b.id === id) ?? null,
    item: (id) => state.items.find((i) => i.id === id) ?? null,

    // ----- 旅行 -----
    /** 一次建立旅行＋包包＋物品（產生器的結果） */
    createTrip(trip, bags, items) {
      const tr = cleanTrip({ ...trip, createdAt: now(), updatedAt: now() });
      state.trips.push(tr);
      const tripIds = new Set([tr.id]);
      const newBags = bags.map((b) => cleanBag(b, tripIds)).filter(Boolean);
      state.bags.push(...newBags);
      const bagIds = new Set(newBags.map((b) => b.id));
      const newItems = items.map((i) => cleanItem(i, tripIds, bagIds)).filter(Boolean);
      state.items.push(...newItems);
      commit([up('trips', tr), ...newBags.map((b) => up('bags', b)), ...newItems.map((i) => up('items', i))]);
      return tr;
    },
    updateTrip(id, patch) {
      const t = state.trips.find((x) => x.id === id);
      if (!t) return;
      Object.assign(t, cleanTrip({ ...t, ...patch, id, updatedAt: now() }));
      commit([up('trips', t)]);
    },
    deleteTrip(id) {
      const bagIds = state.bags.filter((b) => b.tripId === id).map((b) => b.id);
      const itemIds = state.items.filter((i) => i.tripId === id).map((i) => i.id);
      state.trips = state.trips.filter((t) => t.id !== id);
      state.bags = state.bags.filter((b) => b.tripId !== id);
      state.items = state.items.filter((i) => i.tripId !== id);
      commit([del('trips', id), ...bagIds.map((b) => del('bags', b)), ...itemIds.map((i) => del('items', i))]);
    },

    // ----- 包包 -----
    addBag(tripId, { name, kind, icon }) {
      const order = Math.max(-1, ...state.bags.filter((b) => b.tripId === tripId).map((b) => b.order)) + 1;
      const b = cleanBag({ id: uuid(), tripId, name, kind, icon, order }, new Set([tripId]));
      state.bags.push(b);
      commit([up('bags', b)]);
      return b;
    },
    updateBag(id, patch) {
      const b = state.bags.find((x) => x.id === id);
      if (!b) return;
      Object.assign(b, cleanBag({ ...b, ...patch, id, tripId: b.tripId, updatedAt: now() }, new Set([b.tripId])));
      commit([up('bags', b)]);
    },
    /** 刪包包：裡面的物品不刪，改成「未指定」（bagId = null） */
    deleteBag(id) {
      const moved = [];
      state.items.forEach((i) => {
        if (i.bagId === id) {
          i.bagId = null;
          i.updatedAt = now();
          moved.push(up('items', i));
        }
      });
      state.bags = state.bags.filter((b) => b.id !== id);
      commit([...moved, del('bags', id)]);
    },

    // ----- 物品 -----
    addItem(tripId, data) {
      const order = Math.max(-1, ...state.items.filter((i) => i.tripId === tripId).map((i) => i.order)) + 1;
      const bagIds = new Set(state.bags.filter((b) => b.tripId === tripId).map((b) => b.id));
      const it = cleanItem({ id: uuid(), tripId, order, ...data }, new Set([tripId]), bagIds);
      state.items.push(it);
      commit([up('items', it)]);
      return it;
    },
    updateItem(id, patch) {
      const it = state.items.find((x) => x.id === id);
      if (!it) return;
      const bagIds = new Set(state.bags.filter((b) => b.tripId === it.tripId).map((b) => b.id));
      Object.assign(it, cleanItem({ ...it, ...patch, id, tripId: it.tripId, updatedAt: now() }, new Set([it.tripId]), bagIds));
      commit([up('items', it)]);
    },
    toggleItem(id) {
      const it = state.items.find((x) => x.id === id);
      if (it) this.updateItem(id, { checked: !it.checked });
    },
    /** 刪除物品，回傳被刪的資料（給「復原」用） */
    deleteItem(id) {
      const it = state.items.find((x) => x.id === id);
      if (!it) return null;
      state.items = state.items.filter((x) => x.id !== id);
      commit([del('items', id)]);
      return { ...it };
    },
    /** 復原剛刪掉的物品 */
    restoreItem(snapshot) {
      if (!snapshot || !this.trip(snapshot.tripId)) return;
      const bagIds = new Set(state.bags.filter((b) => b.tripId === snapshot.tripId).map((b) => b.id));
      const it = cleanItem(snapshot, new Set([snapshot.tripId]), bagIds);
      state.items.push(it);
      commit([up('items', it)]);
    },

    // ----- 備份 -----
    exportJSON() {
      return JSON.stringify({ app: 'packing-list', exportedAt: now(), ...state }, null, 2);
    },
    /** 匯入備份：同一個 id 的資料會被覆蓋，其他的保留。回傳匯入了幾趟旅行。 */
    importJSON(text) {
      const incoming = sanitizeState(JSON.parse(text));
      if (incoming.trips.length === 0) throw new Error('no trips');
      const ids = new Set(incoming.trips.map((t) => t.id));
      state.trips = state.trips.filter((t) => !ids.has(t.id)).concat(incoming.trips);
      state.bags = state.bags.filter((b) => !ids.has(b.tripId)).concat(incoming.bags);
      state.items = state.items.filter((i) => !ids.has(i.tripId)).concat(incoming.items);
      commit([
        ...incoming.trips.map((t) => up('trips', t)),
        ...incoming.bags.map((b) => up('bags', b)),
        ...incoming.items.map((i) => up('items', i)),
      ]);
      return incoming.trips.length;
    },
  };
}
