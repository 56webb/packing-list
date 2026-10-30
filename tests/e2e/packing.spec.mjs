// ===== 核心流程：建立行程 → 產生清單 → 勾選 → 包包 → 封箱 → 進度 → 重新整理資料還在 =====
import { test, expect, createTrip, savedState, bagSection, itemRow, dateFromToday } from './fixtures.mjs';

// 出發日設在 30 天後：天氣區塊會用「過去平均」，不會打天氣 API（天氣另外在 trip-info.spec 測）
const LATER = dateFromToday(30);

test.describe('核心流程', () => {
  test('建立行程後產生清單：預設兩個包包、物品、總進度 0', async ({ page }) => {
    await createTrip(page, { country: 'JP', startDate: LATER, days: 5, name: '東京測試' });
    await expect(page.getByRole('heading', { level: 1, name: '東京測試' })).toBeVisible();
    await expect(page.locator('.trip-info')).toContainText('日本・5 天');

    const personal = bagSection(page, '隨身包包');
    const checked = bagSection(page, '托運行李箱');
    await expect(personal).toBeVisible();
    await expect(checked).toBeVisible();
    await expect(itemRow(personal, '護照')).toBeVisible();
    await expect(itemRow(checked, '上衣')).toBeVisible();

    const state = await savedState(page);
    const total = state.items.length;
    expect(total).toBeGreaterThan(10);
    await expect(page.locator('.trip-progress-text')).toHaveText(`總進度 0/${total}`);

    // 回首頁看得到這趟旅行
    await page.getByRole('button', { name: '← 我的旅行' }).click();
    await expect(page.locator('.trip-card', { hasText: '東京測試' })).toContainText(`已打包 0/${total}`);
  });

  test('勾選物品：總進度、包包進度、進度條一起更新', async ({ page }) => {
    await createTrip(page, { country: 'JP', startDate: LATER });
    const total = (await savedState(page)).items.length;
    const personal = bagSection(page, '隨身包包');
    const personalTotal = await personal.locator('li.item').count();

    await itemRow(personal, '護照').getByRole('checkbox').check();
    await expect(page.locator('.trip-progress-text')).toHaveText(`總進度 1/${total}`);
    await expect(personal.locator('.bag-count')).toHaveText(`1/${personalTotal}`);
    await expect(itemRow(personal, '護照')).toHaveClass(/checked/);
    const pct = String(Math.round((1 / total) * 100));
    await expect(page.locator('.trip-progress [role=progressbar]')).toHaveAttribute('aria-valuenow', pct);

    // 再按一次取消勾選
    await itemRow(personal, '護照').getByRole('checkbox').uncheck();
    await expect(page.locator('.trip-progress-text')).toHaveText(`總進度 0/${total}`);

    // 「只看沒打勾的」：勾過的會藏起來
    await itemRow(personal, '護照').getByRole('checkbox').check();
    await page.getByText('只看沒打勾的').click();
    await expect(itemRow(personal, '護照')).toHaveCount(0);
    await expect(itemRow(personal, '信用卡')).toBeVisible();
  });

  test('新增物品到指定包包，再移到另一個包包', async ({ page }) => {
    await createTrip(page, { country: 'JP', startDate: LATER });
    const personal = bagSection(page, '隨身包包');
    const checked = bagSection(page, '托運行李箱');

    // 在「托運行李箱」裡按「＋ 新增項目」
    await checked.getByRole('button', { name: '＋ 新增項目' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '新增項目' })).toBeVisible();
    await expect(dialog.locator('select[name=bag]')).toHaveValue(await bagId(page, '托運行李箱'));
    await dialog.locator('input[name=name]').fill('電湯匙');
    await dialog.locator('input[name=qty]').fill('2');
    await dialog.getByRole('button', { name: '儲存' }).click();
    await expect(dialog).toBeHidden();
    await expect(itemRow(checked, '電湯匙')).toContainText('×2');

    // 移到「隨身包包」
    await itemRow(checked, '電湯匙').getByRole('button', { name: '編輯 電湯匙' }).click();
    await dialog.locator('select[name=bag]').selectOption(await bagId(page, '隨身包包'));
    await dialog.getByRole('button', { name: '儲存' }).click();
    await expect(itemRow(checked, '電湯匙')).toHaveCount(0);
    await expect(itemRow(personal, '電湯匙')).toBeVisible();

    // 用底部的「＋ 項目」新增（預設放第一個包包）
    await page.getByRole('button', { name: '＋ 項目', exact: true }).click();
    await dialog.locator('input[name=name]').fill('暈車藥');
    await dialog.getByRole('button', { name: '儲存' }).click();
    await expect(itemRow(personal, '暈車藥')).toBeVisible();

    // 名稱空白不能存（必填）
    await page.getByRole('button', { name: '＋ 項目', exact: true }).click();
    await dialog.getByRole('button', { name: '儲存' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
  });

  test('新增包包，物品可以放進新包包；刪除包包後物品移到「未指定」', async ({ page }) => {
    await createTrip(page, { country: 'JP', startDate: LATER });
    await page.getByRole('button', { name: '＋ 包包' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name=name]').fill('伴手禮袋');
    await dialog.locator('select[name=kind]').selectOption('checked');
    await dialog.getByRole('button', { name: '儲存' }).click();
    const gift = bagSection(page, '伴手禮袋');
    await expect(gift).toBeVisible();
    await expect(gift.locator('.badge.kind-checked')).toHaveText('托運');
    await expect(gift).toContainText('這個包包還沒有東西');

    // 把「好走的鞋」移進去
    await itemRow(page, '好走的鞋').getByRole('button', { name: '編輯 好走的鞋' }).click();
    await dialog.locator('select[name=bag]').selectOption(await bagId(page, '伴手禮袋'));
    await dialog.getByRole('button', { name: '儲存' }).click();
    await expect(itemRow(gift, '好走的鞋')).toBeVisible();
    await expect(gift.locator('.bag-count')).toHaveText('0/1');

    // 刪掉包包 → 物品到「未指定」
    await gift.getByRole('button', { name: '編輯包包：伴手禮袋' }).click();
    await dialog.getByRole('button', { name: '刪除包包' }).click();
    await expect(dialog.getByRole('heading')).toContainText('刪除「伴手禮袋」');
    await dialog.getByRole('button', { name: '刪除' }).click();
    await expect(gift).toHaveCount(0);
    await expect(itemRow(bagSection(page, '未指定'), '好走的鞋')).toBeVisible();
  });

  test('封箱：還有沒打勾會先確認；封箱後收起、不能再勾；可以解除封箱', async ({ page }) => {
    await createTrip(page, { country: 'JP', startDate: LATER });
    const personal = bagSection(page, '隨身包包');
    const count = await personal.locator('li.item').count();
    const dialog = page.getByRole('dialog');

    // 先取消一次
    await personal.getByRole('button', { name: '🔒 封箱' }).click();
    await expect(dialog.getByRole('heading')).toHaveText(`「隨身包包」還有 ${count} 項沒打勾，確定要封箱嗎？`);
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(personal.locator('.badge.sealed')).toHaveCount(0);

    // 真的封箱
    await personal.getByRole('button', { name: '🔒 封箱' }).click();
    await dialog.getByRole('button', { name: '封箱' }).click();
    await expect(personal.locator('.badge.sealed')).toContainText('已封箱');
    await expect(page.locator('#toast')).toContainText('「隨身包包」已封箱 🔒');
    await expect(personal.locator('li.item')).toHaveCount(0); // 收起來了
    await expect(personal.locator('.bag-toggle')).toHaveAttribute('aria-expanded', 'false');

    // 打開來看：物品的勾選框不能按、沒有「新增項目」
    await personal.locator('.bag-toggle').click();
    await expect(personal.locator('li.item')).toHaveCount(count);
    await expect(personal.getByRole('checkbox').first()).toBeDisabled();
    await expect(personal.getByRole('button', { name: '＋ 新增項目' })).toHaveCount(0);

    // 解除封箱
    await personal.getByRole('button', { name: '解除封箱' }).click();
    await expect(personal.locator('.badge.sealed')).toHaveCount(0);
    await expect(personal.getByRole('checkbox').first()).toBeEnabled();
  });

  test('全部勾完的包包封箱時不用確認，進度 100% 顯示完成', async ({ page }) => {
    await createTrip(page, { country: 'JP', startDate: LATER });
    // 新增一個只有一樣東西的包包
    const dialog = page.getByRole('dialog');
    await page.getByRole('button', { name: '＋ 包包' }).click();
    await dialog.locator('input[name=name]').fill('小包');
    await dialog.getByRole('button', { name: '儲存' }).click();
    const small = bagSection(page, '小包');
    await small.getByRole('button', { name: '＋ 新增項目' }).click();
    await dialog.locator('input[name=name]').fill('零錢包');
    await dialog.getByRole('button', { name: '儲存' }).click();
    await itemRow(small, '零錢包').getByRole('checkbox').check();
    await expect(small).toHaveClass(/is-done/);
    await expect(small.locator('.progress-fill')).toHaveClass(/complete/);

    await small.getByRole('button', { name: '🔒 封箱' }).click();
    await expect(dialog).toBeHidden(); // 沒有確認框
    await expect(small.locator('.badge.sealed')).toBeVisible();
  });

  test('重新整理後資料還在（localStorage）：勾選、新物品、新包包、封箱', async ({ page }) => {
    const id = await createTrip(page, { country: 'JP', startDate: LATER, name: '重新整理測試' });
    const dialog = page.getByRole('dialog');
    await itemRow(page, '護照').getByRole('checkbox').check();
    await bagSection(page, '托運行李箱').getByRole('button', { name: '＋ 新增項目' }).click();
    await dialog.locator('input[name=name]').fill('折疊衣架');
    await dialog.getByRole('button', { name: '儲存' }).click();
    await page.getByRole('button', { name: '＋ 包包' }).click();
    await dialog.locator('input[name=name]').fill('相機包');
    await dialog.getByRole('button', { name: '儲存' }).click();
    await bagSection(page, '托運行李箱').getByRole('button', { name: '🔒 封箱' }).click();
    await dialog.getByRole('button', { name: '封箱' }).click();
    await expect(bagSection(page, '托運行李箱').locator('.badge.sealed')).toBeVisible();
    const before = await page.locator('.trip-progress-text').textContent();

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`#/trip/${id}$`));
    await expect(page.getByRole('heading', { level: 1, name: '重新整理測試' })).toBeVisible();
    await expect(page.locator('.trip-progress-text')).toHaveText(before);
    await expect(itemRow(page, '護照').getByRole('checkbox')).toBeChecked();
    await expect(bagSection(page, '相機包')).toBeVisible();
    const checked = bagSection(page, '托運行李箱');
    await expect(checked.locator('.badge.sealed')).toBeVisible();
    await checked.locator('.bag-toggle').click();
    await expect(itemRow(checked, '折疊衣架')).toBeVisible();

    // 關掉分頁、開新分頁（同一個瀏覽器）也還在
    const page2 = await page.context().newPage();
    await page2.goto('/zh-tw/');
    await expect(page2.locator('.trip-card', { hasText: '重新整理測試' })).toBeVisible();
    await page2.close();
  });

  test('刪除物品可以復原', async ({ page }) => {
    await createTrip(page, { country: 'JP', startDate: LATER });
    const dialog = page.getByRole('dialog');
    await itemRow(page, '梳子').getByRole('button', { name: '編輯 梳子' }).click();
    await dialog.getByRole('button', { name: '刪除' }).click();
    await expect(itemRow(page, '梳子')).toHaveCount(0);
    await page.locator('#toast').getByRole('button', { name: '復原' }).click();
    await expect(itemRow(page, '梳子')).toBeVisible();
  });

  test('不能托運的東西放進托運行李箱會出現紅色警告', async ({ page }) => {
    await createTrip(page, { country: 'JP', startDate: LATER });
    const dialog = page.getByRole('dialog');
    await expect(page.locator('.warn-banner')).toHaveCount(0);
    await itemRow(page, '行動電源').getByRole('button', { name: '編輯 行動電源' }).click();
    await dialog.locator('select[name=bag]').selectOption(await bagId(page, '托運行李箱'));
    await dialog.getByRole('button', { name: '儲存' }).click();
    await expect(page.getByRole('alert')).toContainText('行動電源');
    await expect(itemRow(bagSection(page, '托運行李箱'), '行動電源')).toContainText('不能放托運！');
  });
});

/** 從存檔找出包包 id（<select> 的 value） */
async function bagId(page, name) {
  const state = await savedState(page);
  const bag = state.bags.find((b) => b.name === name);
  if (!bag) throw new Error(`找不到包包 ${name}`);
  return bag.id;
}
