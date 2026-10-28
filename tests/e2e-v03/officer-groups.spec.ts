import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createV03Game } from '../../src/v03/initial-state';
import { asSave } from './playability-fixtures';
import { openCity, showCityManagement, showOfficer, confirmWork } from './ui-navigation';
import type { V03GameState, V03Officer } from '../../src/v03/types';

const key = 'hegemony-v0.3:autosave';
async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}
function fixture(gold = 5000) {
  const state = createV03Game('cao', 1);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  city.gold = gold;
  const officers = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.factionId === 'cao' &&
      officer.location.kind === 'city' &&
      officer.location.cityId === city.id,
  );
  officers.forEach((officer) =>
    Object.assign(officer, { loyalty: 50, force: 60, equipment: null }),
  );
  return { state, city, officers };
}
async function load(page: Page, state: V03GameState, locale: string) {
  await page.goto(`/?lang=${locale}`);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: asSave(state),
  });
  await page.reload();
  await expect(page.locator('.v03-shell')).toBeVisible();
  await openCity(page);
}
for (const locale of ['zh', 'en']) {
  const name = (officer: V03Officer) => (locale === 'zh' ? officer.chinese : officer.name);
  const allName = locale === 'zh' ? '全选可用武将' : 'Select all eligible officers';

  test(`a feast selects its guests, offers select-all, and spends one point for the entire group (${locale})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { state, city, officers } = fixture();
    await load(page, state, locale);
    await showCityManagement(page);
    await page.getByRole('button', { name: /举行宴饮|Host a feast/, exact: true }).click();
    const group = page.locator('.v03-officer-group-work');
    const all = group.getByRole('checkbox', { name: allName, exact: true });
    await expect(all).toBeChecked();
    await expect(group.locator('.v03-group-roster input:checked')).toHaveCount(officers.length);
    await all.uncheck();
    await expect(
      group.getByRole('button', { name: /确认执行|Confirm order/, exact: true }),
    ).toBeDisabled();
    await group.getByRole('checkbox', { name: name(officers[0]!), exact: true }).check();
    await group.getByRole('checkbox', { name: name(officers[1]!), exact: true }).check();
    await expect(group.locator('.v03-stat-grid > div').nth(0).locator('dd')).toHaveText('2');
    await expect(group.locator('.v03-stat-grid > div').nth(2).locator('dd')).toHaveText('1');
    expect(await saved(page)).toEqual(state);
    await mkdir('.artifacts/officer-groups', { recursive: true });
    await page.screenshot({ path: `.artifacts/officer-groups/feast-${locale}.png` });
    await confirmWork(page);
    const after = await saved(page);
    expect(after.cities.find((entry) => entry.id === city.id)).toMatchObject({
      gold: 5000,
      workPointsUsed: 1,
    });
    for (let i = 0; i < officers.length; i++)
      expect(after.officers.find((entry) => entry.id === officers[i]!.id)!.loyalty).toBe(
        i < 2 ? 58 : 50,
      );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  });

  test(`reward selection previews the total and only pays the checked officers (${locale})`, async ({
    page,
  }) => {
    const { state, city, officers } = fixture();
    await load(page, state, locale);
    await showOfficer(page, name(officers[0]!));
    await page.getByRole('button', { name: /赏赐武将|Reward officer/ }).click();
    const group = page.locator('.v03-officer-group-work');
    const all = group.getByRole('checkbox', { name: allName, exact: true });
    expect(await all.evaluate((node) => (node as HTMLInputElement).indeterminate)).toBe(true);
    await all.check();
    await expect(group.locator('.v03-stat-grid > div').nth(1).locator('dd')).toHaveText(
      String(officers.length * 100),
    );
    await all.uncheck();
    await group.getByRole('checkbox', { name: name(officers[0]!), exact: true }).check();
    await group.getByRole('checkbox', { name: name(officers[1]!), exact: true }).check();
    await expect(group.locator('.v03-stat-grid > div').nth(1).locator('dd')).toHaveText('200');
    expect(await saved(page)).toEqual(state);
    await mkdir('.artifacts/officer-groups', { recursive: true });
    await page.screenshot({ path: `.artifacts/officer-groups/reward-${locale}.png` });
    await confirmWork(page);
    const after = await saved(page);
    expect(after.cities.find((entry) => entry.id === city.id)).toMatchObject({
      gold: 4800,
      workPointsUsed: 0,
    });
    for (let i = 0; i < officers.length; i++)
      expect(after.officers.find((entry) => entry.id === officers[i]!.id)!.loyalty).toBe(
        i < 2 ? 65 : 50,
      );
    await page.reload();
    expect((await saved(page)).cities.find((entry) => entry.id === city.id)!.gold).toBe(4800);
  });

  test(`fine arms select-all excludes equipped and capped officers and previews real gains (${locale})`, async ({
    page,
  }) => {
    const { state, city, officers } = fixture();
    officers[2]!.equipment = 'Fine arms';
    officers[3]!.force = 105;
    officers[1]!.force = 104;
    await load(page, state, locale);
    await showOfficer(page, name(officers[0]!));
    await page.getByRole('button', { name: /配发精良兵器|Issue fine arms/ }).click();
    const group = page.locator('.v03-officer-group-work');
    await expect(
      group.getByRole('checkbox', { name: name(officers[2]!), exact: true }),
    ).toBeDisabled();
    await expect(
      group.getByRole('checkbox', { name: name(officers[3]!), exact: true }),
    ).toBeDisabled();
    await group.getByRole('checkbox', { name: allName, exact: true }).check();
    await expect(group.locator('.v03-stat-grid > div').nth(1).locator('dd')).toHaveText(
      String((officers.length - 2) * 180),
    );
    await expect(
      group
        .locator('.v03-group-officer')
        .filter({ has: page.getByRole('checkbox', { name: name(officers[1]!), exact: true }) }),
    ).toContainText(/104.*105/);
    await confirmWork(page);
    const after = await saved(page);
    expect(after.cities.find((entry) => entry.id === city.id)).toMatchObject({
      gold: 5000 - (officers.length - 2) * 180,
      workPointsUsed: 0,
    });
    for (let i = 0; i < officers.length; i++) {
      const officer = after.officers.find((entry) => entry.id === officers[i]!.id)!;
      if (i === 2 || i === 3) expect(officer).toEqual(officers[i]);
      else
        expect(officer).toMatchObject({
          force: Math.min(105, officers[i]!.force + 5),
          equipment: 'Fine arms',
        });
    }
  });

  test(`an unaffordable group cannot partially execute and cancelling preserves state (${locale})`, async ({
    page,
  }) => {
    const { state, officers } = fixture(150);
    await load(page, state, locale);
    await showOfficer(page, name(officers[0]!));
    await page.getByRole('button', { name: /赏赐武将|Reward officer/ }).click();
    const group = page.locator('.v03-officer-group-work');
    await group.getByRole('checkbox', { name: name(officers[1]!), exact: true }).check();
    await expect(
      group.getByRole('button', { name: /确认执行|Confirm order/, exact: true }),
    ).toBeDisabled();
    await expect(group.locator('.v03-action-reason')).toContainText('200');
    expect(await saved(page)).toEqual(state);
    await page.keyboard.press('Escape');
    await expect(page.locator('.v03-officer-detail')).toBeVisible();
    expect(await saved(page)).toEqual(state);
  });
}
