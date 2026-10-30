import { test, expect, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import type { V03GameState } from '../../src/v03/types';
import { asSave } from './playability-fixtures';
import { showCityManagement, chooseWorkExecutor, showOfficer } from './ui-navigation';

const key = 'hegemony-v0.3:autosave';
async function load(page: Page, state: V03GameState, locale: string) {
  await page.goto(`/?lang=${locale}`);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: asSave(state),
  });
  await page.reload();
  await expect(page.locator('.v03-shell')).toBeVisible();
}
async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}

for (const locale of ['zh', 'en']) {
  test(`economy previews capped farming and normal commerce gains before charging once (${locale})`, async ({
    page,
  }) => {
    const state = createV03Game('cao', 1);
    const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    Object.assign(city, { farming: 495, commerce: 480, gold: 1000 });
    await load(page, state, locale);
    await showCityManagement(page);
    await page.getByRole('button', { name: /发展农田|Improve farmland/ }).click();
    await chooseWorkExecutor(page);
    await expect(page.locator('.v03-work-detail')).toContainText('495 → 500');
    expect(await saved(page)).toEqual(state);
    await page.getByRole('button', { name: /确认执行|Confirm order/, exact: true }).click();
    await expect(page.locator('.v03-window-feedback')).toContainText(
      locale === 'zh' ? '提高了 5' : 'improved by 5',
    );
    expect((await saved(page)).cities.find((entry) => entry.id === city.id)).toMatchObject({
      farming: 500,
      gold: 920,
      workPointsUsed: 1,
    });
    await page.getByRole('button', { name: /发展商业|Improve commerce/ }).click();
    await chooseWorkExecutor(page);
    await expect(page.locator('.v03-work-detail')).toContainText('480 → 490');
    await page.getByRole('button', { name: /确认执行|Confirm order/, exact: true }).click();
    await expect(page.locator('.v03-window-feedback')).toContainText(
      locale === 'zh' ? '提高了 10' : 'improved by 10',
    );
    expect((await saved(page)).cities.find((entry) => entry.id === city.id)).toMatchObject({
      commerce: 490,
      gold: 840,
      workPointsUsed: 2,
    });
    const beforeCapped = await saved(page);
    await page.getByRole('button', { name: /发展农田|Improve farmland/ }).click();
    await chooseWorkExecutor(page);
    await expect(
      page.getByRole('button', { name: /确认执行|Confirm order/, exact: true }),
    ).toBeDisabled();
    expect(await saved(page)).toEqual(beforeCapped);
  });

  for (const legacy of [false, true]) {
    test(`economy training previews actual XP/force changes and preserves saves (legacy: ${legacy}, ${locale})`, async ({
      page,
    }) => {
      const state = createV03Game('cao', 1);
      const officer = state.officers.find((entry) => entry.id === 'caocao')!;
      Object.assign(
        officer,
        legacy
          ? { force: 99, experience: 10_000, level: 5 }
          : { force: 100, experience: 475, level: 4 },
      );
      await load(page, state, locale);
      await showOfficer(page, locale === 'zh' ? officer.chinese : officer.name);
      if (legacy) {
        // Training adds no flat force any more (PF-RL-03): capped XP means nothing to train.
        await expect(page.getByRole('button', { name: /训练|Train/, exact: true })).toBeDisabled();
        expect(await saved(page)).toEqual(state);
        return;
      }
      await page.getByRole('button', { name: /训练|Train/, exact: true }).click();
      const preview = page.locator('.v03-work-detail');
      await expect(preview).toContainText('475 → 500');
      await expect(preview).toContainText('100 → 100');
      expect(await saved(page)).toEqual(state);
      await page.getByRole('button', { name: /确认执行|Confirm order/, exact: true }).click();
      await expect(page.locator('.v03-window-feedback')).toContainText(
        locale === 'zh' ? '经验 +25，武力 +0' : '+25 experience, +0 force',
      );
      await expect(page.getByRole('button', { name: /训练|Train/, exact: true })).toBeDisabled();
      const expected = { force: 100, experience: 500, level: 5 };
      expect((await saved(page)).officers.find((entry) => entry.id === officer.id)).toMatchObject(
        expected,
      );
      await page.reload();
      expect((await saved(page)).officers.find((entry) => entry.id === officer.id)).toMatchObject(
        expected,
      );
    });
  }
}
