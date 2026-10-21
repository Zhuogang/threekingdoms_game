import { expect, test, type Page } from '@playwright/test';
import { WIKI_SECTIONS } from '../../src/content/wiki';
import { translateText } from '../../src/i18n/core';
import { fullBattle } from './rendering-fixtures';
import { importState, savedCampaign, startCampaign } from './improvement-helpers';

const wiki = (page: Page) => page.locator('dialog.wiki-dialog');
async function open(page: Page) {
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(wiki(page)).toBeVisible();
}
async function chapter(page: Page, title: string) {
  await wiki(page)
    .getByRole('navigation')
    .getByRole('button', { name: title, exact: true })
    .click();
  await expect(wiki(page).getByRole('article').getByRole('heading', { level: 3 })).toHaveText(
    title,
  );
}

test('Wiki covers every chapter in both languages and keeps campaign saves intact', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startCampaign(page);
  const before = await savedCampaign(page);
  await open(page);
  await expect(wiki(page).getByRole('searchbox')).toBeFocused();
  for (const locale of ['en', 'zh'] as const) {
    await wiki(page)
      .getByRole('button', { name: locale === 'en' ? 'English' : '中文', exact: true })
      .click();
    for (const entry of WIKI_SECTIONS) await chapter(page, translateText(entry.title, locale));
    await chapter(page, translateText('Troop types', locale));
    await expect(wiki(page).locator('tr[data-troop]')).toHaveCount(6);
    await expect(wiki(page).locator('tr[data-troop="cavalry"] td').nth(0)).toHaveText('5');
    await expect(wiki(page).locator('tr[data-troop="archer"] td').nth(1)).toHaveText('3');
    await chapter(page, translateText('Tactics and tactic points', locale));
    await expect(wiki(page).locator('tr[data-tactic]')).toHaveCount(6);
    await expect(wiki(page).locator('tr[data-tactic="fire"] td').first()).toHaveText('4');
  }
  await page.keyboard.press('Escape');
  expect(await savedCampaign(page)).toEqual(before);
  await expect(page.getByRole('button', { name: '玩法指南', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('Wiki searches English and Chinese text across language switches and handles no results', async ({
  page,
}) => {
  await startCampaign(page);
  await open(page);
  const search = wiki(page).getByRole('searchbox');
  await search.fill('精良兵器');
  await expect(
    wiki(page)
      .getByRole('navigation')
      .getByRole('button', { name: 'Equipment and weapons', exact: true }),
  ).toBeVisible();
  await chapter(page, 'Equipment and weapons');
  await wiki(page).getByRole('button', { name: '中文', exact: true }).click();
  await expect(search).toHaveValue('精良兵器');
  await expect(wiki(page).getByRole('article')).toContainText('武力增加 5');
  await search.fill('ＦＩＮＥ　ＡＲＭＳ');
  await expect(
    wiki(page).getByRole('navigation').getByRole('button', { name: '装备与武器', exact: true }),
  ).toBeVisible();
  await search.fill('unfindable-987654');
  await expect(wiki(page).getByRole('heading', { name: '没有找到相关章节' })).toBeVisible();
  await wiki(page).getByRole('article').getByRole('button', { name: '清空搜索' }).click();
  await expect(wiki(page).getByRole('navigation').getByRole('button')).toHaveCount(12);
});

test('Wiki can overlay startup and unfinished order dialogs with keyboard focus restored', async ({
  page,
}) => {
  await page.goto('/');
  const startup = page.getByRole('dialog', { name: 'Choose your banner' });
  await expect(startup).toBeVisible();
  await startup.getByRole('button', { name: 'Wiki', exact: true }).click();
  await expect(wiki(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(startup).toBeVisible();
  await expect(startup.getByRole('button', { name: 'Wiki', exact: true })).toBeFocused();
  await startup.getByRole('button', { name: 'Raise your banner', exact: true }).click();
  const before = await savedCampaign(page);
  await page.getByRole('button', { name: 'Muster', exact: true }).click();
  const order = page.locator('.modal-backdrop .dialog');
  await order.getByLabel('Assigned troop count').fill('1600');
  await order.getByRole('button', { name: 'Wiki', exact: true }).click();
  await expect(wiki(page)).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect(await wiki(page).evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(order).toBeVisible();
  await expect(order.getByLabel('Assigned troop count')).toHaveValue('1600');
  await expect(order.getByRole('button', { name: 'Wiki', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await savedCampaign(page)).toEqual(before);
});

test('F1 Wiki remains read-only during a battle and preserves the selected commander', async ({
  page,
}) => {
  await startCampaign(page);
  const fixture = fullBattle('hanzhong');
  await importState(page, fixture);
  const name = await page.locator('.selected-identity h3').innerText();
  await page.keyboard.press('F1');
  await expect(wiki(page)).toBeVisible();
  await chapter(page, 'Battle controls');
  await expect(wiki(page).getByRole('article')).toContainText('You may move once');
  await chapter(page, 'Tactics and tactic points');
  await wiki(page).getByRole('button', { name: 'Close Wiki', exact: true }).click();
  await expect(wiki(page)).not.toBeVisible();
  await expect(page.locator('.selected-identity h3')).toHaveText(name);
  expect(await savedCampaign(page)).toEqual(fixture);
});

test('Wiki fits laptop and narrow screens in both languages', async ({ page }) => {
  await startCampaign(page);
  await open(page);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 768 });
    for (const locale of ['en', 'zh'] as const) {
      await wiki(page)
        .getByRole('button', { name: locale === 'en' ? 'English' : '中文', exact: true })
        .click();
      await chapter(page, translateText('Troop types', locale));
      const bounds = await wiki(page).boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.height).toBeLessThanOrEqual(768);
      await expect(
        wiki(page).getByRole('button', { name: translateText('Close Wiki', locale), exact: true }),
      ).toBeInViewport();
      expect(await wiki(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: `.artifacts/wiki/troops-${width}-${locale}.png` });
      await chapter(page, translateText('Equipment and weapons', locale));
      await expect(wiki(page).getByRole('article')).toContainText(
        locale === 'en' ? '180 gold' : '180 金',
      );
    }
  }
});
