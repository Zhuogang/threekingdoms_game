import { expect, test, type Page } from '@playwright/test';
import { createGame, dispatch } from '../../src/game/campaign';
import { encodeSave } from '../../src/platform/saves';
import type { GameState } from '../../src/game/types';

async function switchLanguage(page: Page, language: 'en' | 'zh') {
  const dialog = page.getByRole('dialog');
  const surface = (await dialog.count()) ? dialog : page.locator('.masthead');
  await surface
    .getByRole('button', { name: language === 'zh' ? '中文' : 'English', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', language === 'zh' ? 'zh-CN' : 'en');
}

async function record(page: Page): Promise<string> {
  await expect(page.locator('.save-status')).toContainText(/All progress saved|全部进度已保存/);
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('baye-atlas', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('saves');
          const read = tx.objectStore('saves').get('auto');
          tx.oncomplete = () => {
            db.close();
            resolve(read.result.payload);
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

test('language switches on the first screen and persists without changing progress', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('Hegemony of the Three Kingdoms');
  await expect(page.getByRole('link', { name: 'Hegemony of the Three Kingdoms' })).toBeVisible();
  await switchLanguage(page, 'zh');
  await expect(page).toHaveTitle('三国霸业 — 群雄割据');
  await expect(page.getByRole('link', { name: '三国霸业' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '选择你的势力' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: /曹操/ })).toBeVisible();
  await page.getByRole('button', { name: '举旗起兵' }).click();
  await expect(page.locator('.city-heading h2')).toContainText('陈留');
  await expect(page.locator('.officer-summary')).toContainText('曹操');
  const before = await record(page);
  await switchLanguage(page, 'en');
  await expect(page.locator('.city-heading h2')).toContainText('Chenliu');
  expect(await record(page)).toBe(before);
  await page.getByRole('button', { name: /^Develop farms/ }).click();
  const developed = await record(page);
  await switchLanguage(page, 'zh');
  await expect(page.locator('.toast')).toContainText(/陈留.*曹操.*农业/);
  await page.getByRole('button', { name: '纪事', exact: true }).click();
  await expect(page.locator('.chronicle')).toContainText('曹操');
  await expect(page.locator('.chronicle')).not.toContainText('improves farming');
  expect(await record(page)).toBe(developed);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  const reloaded = await record(page);
  expect(JSON.parse(reloaded).state).toEqual(JSON.parse(developed).state);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /交互地图/);
  await page.screenshot({ path: '.artifacts/baye-chinese.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('language remains usable in all management dialogs without discarding form input', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  const before = await record(page);
  for (const label of [
    'How to play',
    'Settings',
    'Save and load',
    'Muster',
    'Transfer',
    'March an army',
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (label === 'Muster') await page.getByLabel('Assigned troop count').fill('1600');
    await switchLanguage(page, 'zh');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }),
    ).toBeVisible();
    if (label === 'Save and load') {
      await expect(page.getByRole('dialog')).toContainText('曹操');
      await expect(page.getByRole('dialog')).not.toContainText('Cao Cao');
    }
    if (label === 'Muster') await expect(page.getByLabel('分配兵力数量')).toHaveValue('1600');
    await switchLanguage(page, 'en');
    if (label === 'Muster')
      await expect(page.getByLabel('Assigned troop count')).toHaveValue('1600');
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
  expect(await record(page)).toBe(before);
});

test('saved battles and ending screens switch languages in place', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  let battle = createGame('cao', 16);
  battle = dispatch(battle, {
    type: 'march',
    sourceId: 'puyang',
    targetId: 'xiapi',
    officerIds: ['xiahouyuan'],
  }).state;
  battle = dispatch(battle, { type: 'endMonth' }).state;
  await page.locator('input[type=file]').setInputFiles({
    name: 'original-battle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeSave(battle)),
  });
  await expect(page.getByRole('button', { name: 'End battle day' })).toBeVisible();
  const saved = await record(page);
  await switchLanguage(page, 'zh');
  await expect(page.getByRole('button', { name: '结束当日' })).toBeVisible();
  await expect(page.locator('.unit-card h3')).toContainText('夏侯渊');
  await expect(page.locator('.battle-report')).toContainText('下邳');
  await page.getByRole('button', { name: '鼓舞', exact: true }).click();
  await switchLanguage(page, 'en');
  await expect(page.getByRole('button', { name: 'Rally', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await record(page)).toBe(saved);
  await switchLanguage(page, 'zh');
  await page.reload();
  expect(JSON.parse(await record(page)).state).toEqual(battle);
  await expect(page.getByRole('button', { name: '结束当日' })).toBeVisible();
  await page.screenshot({ path: '.artifacts/baye-chinese-battle.png', fullPage: true });
  const victory: GameState = createGame('cao');
  victory.cities.forEach((city) => {
    city.factionId = 'cao';
  });
  victory.officers.forEach((officer) => {
    if (officer.factionId) officer.factionId = 'cao';
  });
  const finished = dispatch(victory, { type: 'endMonth' }).state;
  await page.locator('input[type=file]').setInputFiles({
    name: 'victory.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeSave(finished)),
  });
  await expect(page.getByRole('dialog', { name: '天下归一。' })).toBeVisible();
  await switchLanguage(page, 'en');
  await expect(page.getByRole('dialog', { name: 'A realm united.' })).toBeVisible();
  expect(JSON.parse(await record(page)).state).toEqual(finished);
});

test('unknown imported text stays safe in the Chinese interface', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  const imported = createGame('cao', 190);
  imported.log[0]!.text = 'constructor';
  await page.locator('input[type=file]').setInputFiles({
    name: 'custom-chronicle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeSave(imported)),
  });
  await expect(page.getByText('Campaign imported.', { exact: true })).toBeVisible();
  await switchLanguage(page, 'zh');
  await page.getByRole('button', { name: '纪事', exact: true }).click();
  await expect(page.locator('.chronicle')).toContainText('constructor');
  expect(JSON.parse(await record(page)).state).toEqual(imported);
  expect(errors).toEqual([]);
});
