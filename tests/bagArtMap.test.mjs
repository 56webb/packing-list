// 測試：包包 emoji → RO 插圖的對照（執行：npm test）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bagArtKey, BAG_ART_ALT } from '../src/scripts/bagArtMap.js';
import { BAG_ICONS } from '../src/scripts/store.js';
import { existsSync } from 'node:fs';

test('背包、側背包、錢包對得到插圖', () => {
  assert.equal(bagArtKey('🎒', 'personal'), 'backpack');
  assert.equal(bagArtKey('👜'), 'crossbody-bag');
  assert.equal(bagArtKey('👝'), 'wallet');
});

test('行李箱依種類換大小', () => {
  assert.equal(bagArtKey('🧳', 'checked'), 'suitcase-large');
  assert.equal(bagArtKey('🧳', 'carryon'), 'suitcase-small');
  assert.equal(bagArtKey('🧳', 'personal'), 'suitcase-medium');
  assert.equal(bagArtKey('🧳'), 'suitcase-medium');
});

test('對不到的 emoji 回傳 null（畫面照舊顯示 emoji）', () => {
  for (const e of ['💼', '🛍️', '📦', '🧺', '📍', '', undefined]) assert.equal(bagArtKey(e), null);
});

test('每個插圖都有繁中 alt，而且圖檔存在', () => {
  for (const icon of BAG_ICONS) {
    for (const kind of ['personal', 'carryon', 'checked']) {
      const key = bagArtKey(icon, kind);
      if (!key) continue;
      assert.ok(BAG_ART_ALT[key], `${key} 缺 alt`);
      assert.ok(existsSync(new URL(`../src/assets/ro-bags/${key}-128.webp`, import.meta.url)), `${key} 缺圖檔`);
    }
  }
});
