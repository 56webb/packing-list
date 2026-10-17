// ===== 儲存轉接器（Storage Adapter）=====
// 為什麼要多這一層？
// 現在資料只存在瀏覽器（localStorage）。之後加 Supabase 登入時，只要再寫一個
// 「supabaseAdapter」，提供一樣的 load / save 兩個函式，store.js 完全不用改。
//
// 介面約定：
//   load()  → 回傳整份資料 { version, trips, bags, items }，沒有資料就回傳 null
//   save(state, changes) → 把資料存起來
//       changes 是這次改了哪些資料列，例如
//       [{ table: 'items', op: 'upsert', record: {...} }, { table: 'bags', op: 'delete', id: '...' }]
//       localStorage 用不到它（直接整份存），但 Supabase 可以只更新那幾列（不會整份覆蓋）。

const STORAGE_KEY = 'packing-list:v1';

export function createLocalStorageAdapter(key = STORAGE_KEY) {
  let memoryFallback = null; // 無痕模式等情況 localStorage 可能不能用，就先放記憶體
  return {
    name: 'local',
    load() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.warn('讀取 localStorage 失敗，改用記憶體', err);
        return memoryFallback;
      }
    },
    save(state /* , changes */) {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch (err) {
        console.warn('寫入 localStorage 失敗，改用記憶體', err);
        memoryFallback = state;
      }
    },
  };
}

// 之後的 Supabase 版本大概長這樣（先寫成註解，方便你照著做）：
//
// export function createSupabaseAdapter(supabase, userId) {
//   return {
//     name: 'supabase',
//     async load() { /* 從 trips、bags、items 三張表讀出 user_id = userId 的資料 */ },
//     async save(state, changes) {
//       for (const c of changes) {
//         if (c.op === 'upsert') await supabase.from(c.table).upsert({ ...c.record, user_id: userId });
//         if (c.op === 'delete') await supabase.from(c.table).delete().eq('id', c.id);
//       }
//     },
//   };
// }
