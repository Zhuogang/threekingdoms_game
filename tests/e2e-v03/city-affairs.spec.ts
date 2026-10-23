import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createV03Game } from '../../src/v03/initial-state';
import { applyV03CityAction } from '../../src/v03/governance/city-actions';
import type { V03GameState, V03CityAction } from '../../src/v03/types';
import { asSave } from './playability-fixtures';
import {
  openCity,
  showCityManagement,
  showAssignment,
  showOfficer,
  confirmWork,
  chooseWorkExecutor,
} from './ui-navigation';

const saveKey = 'hegemony-v0.3:autosave';
async function current(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, saveKey);
}
function readyState() {
  const state = createV03Game('cao', 764);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  Object.assign(city, { gold: 5000, food: 9000, loyalty: 50, reserve: 2000 });
  for (const officer of state.officers.filter((entry) => entry.factionId === 'cao'))
    Object.assign(officer, { loyalty: 50, force: 50, experience: 0, level: 0, equipment: null });
  return state;
}
async function load(page: Page, lang = 'en') {
  const state = readyState();
  await page.goto(`/?lang=${lang}`);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: saveKey,
    raw: asSave(state),
  });
  await page.reload();
  await expect(page.locator('.v03-shell')).toBeVisible();
  return state;
}
for (const width of [390, 1366, 1920])
  for (const lang of ['en', 'zh']) {
    test(`nested city affairs and officer orders ${width} ${lang}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({
        width,
        height: width === 390 ? 844 : width === 1366 ? 768 : 1080,
      });
      const before = await load(page, lang);
      const city = before.cities.find((entry) => entry.id === before.playerCapitalCityId)!;
      const officer = before.officers.find(
        (entry) =>
          entry.alive &&
          entry.factionId === 'cao' &&
          entry.location.kind === 'city' &&
          entry.location.cityId === city.id,
      )!;
      const map = page.locator('.v03-map-frame svg').first();
      const camera = await map.getAttribute('viewBox');
      const folder = '.artifacts/city-affairs';
      await mkdir(folder, { recursive: true });
      await openCity(page);
      await showCityManagement(page);
      await expect(page.locator('.v03-work-menu button')).toHaveCount(9);
      await expect(page.locator('.v03-campaign-window input')).toHaveCount(0);
      await expect(page.locator('.v03-officer-detail')).toHaveCount(0);
      await page.screenshot({ path: `${folder}/affairs-${width}-${lang}.png` });
      const farm = page.getByRole('button', { name: /Improve farmland|发展农田/ });
      await farm.click();
      await chooseWorkExecutor(page);
      await expect(page.locator('#campaign-window-title')).toBeFocused();
      await expect(page.locator('.v03-work-detail')).toContainText('5,000 → 4,920');
      expect(await current(page)).toEqual(before);
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-work-assignment')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-city-affairs')).toBeVisible();
      expect(await current(page)).toEqual(before);
      await farm.click();
      await confirmWork(page);
      await expect(page.locator('.v03-city-affairs')).toBeVisible();
      await expect(page.locator('.v03-window-feedback')).toBeVisible();
      const farmed = await current(page);
      expect(farmed.cities.find((entry) => entry.id === city.id)).toMatchObject({
        gold: 4920,
        farming: city.farming + 1,
        workPointsUsed: 1,
      });
      await showAssignment(page, lang === 'en' ? officer.name : officer.chinese);
      const input = page.getByRole('spinbutton');
      await input.fill('10001');
      const confirm = page.getByRole('button', { name: /Confirm order|确认执行/, exact: true });
      await expect(confirm).toBeDisabled();
      await expect(page.locator('.v03-action-reason')).toBeVisible();
      expect(await current(page)).toEqual(farmed);
      await input.fill(String(officer.troops + 100));
      await expect(confirm).toBeEnabled();
      await page.screenshot({ path: `${folder}/assignment-${width}-${lang}.png` });
      await confirm.click();
      await expect(page.locator('.v03-officer-detail')).toBeVisible();
      await expect(page.locator('.v03-campaign-window')).toHaveAccessibleName(
        lang === 'en' ? officer.name : officer.chinese,
      );
      await expect(page.locator('.v03-work-detail')).toHaveCount(0);
      const assigned = await current(page);
      expect(assigned.officers.find((entry) => entry.id === officer.id)?.troops).toBe(
        officer.troops + 100,
      );
      expect(assigned.cities.find((entry) => entry.id === city.id)).toMatchObject({
        reserve: 1900,
        workPointsUsed: 2,
      });
      expect(assigned.absoluteDay).toBe(before.absoluteDay);
      await page.screenshot({ path: `${folder}/officer-${width}-${lang}.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-roster')).toBeVisible();
      await expect(page.locator('.v03-officer-detail')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-city-overview')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-campaign-window')).toHaveCount(0);
      expect(await map.getAttribute('viewBox')).toBe(camera);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight > innerHeight ||
            document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      expect(errors).toEqual([]);
    });
  }

test('each city task returns to affairs and retains the existing rule result', async ({ page }) => {
  test.setTimeout(90000);
  const actions: [V03CityAction, RegExp][] = [
    ['develop-commerce', /Improve commerce/],
    ['search', /Search for officers/],
    ['recruit', /Recruit soldiers/],
    ['security', /Restore public order/],
    ['feast', /Host a feast/],
    ['buy-food', /Buy 800 food/],
    ['sell-food', /Sell 800 food/],
    ['relieve', /Relieve people/],
  ];
  for (const [action, name] of actions) {
    const before = await load(page);
    await showCityManagement(page);
    await page.getByRole('button', { name }).click();
    expect(await current(page)).toEqual(before);
    await confirmWork(page);
    await expect(page.locator('.v03-city-affairs')).toBeVisible();
    expect(await current(page)).toEqual(
      applyV03CityAction(before, { cityId: before.playerCapitalCityId, action }).state,
    );
  }
});

test('officer training returns to the selected officer; exhausted work stays blocked with a reason', async ({
  page,
}) => {
  const before = await load(page);
  const officer = before.officers.find(
    (entry) =>
      entry.factionId === 'cao' &&
      entry.location.kind === 'city' &&
      entry.location.cityId === before.playerCapitalCityId,
  )!;
  await showOfficer(page, officer.name);
  for (let count = 1; count <= 3; count++) {
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await confirmWork(page);
    await expect(page.locator('.v03-officer-detail')).toBeVisible();
    expect(
      (await current(page)).officers.find((entry) => entry.id === officer.id)?.experience,
    ).toBe(count * 25);
  }
  const exhausted = await current(page);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm order', exact: true })).toBeDisabled();
  await expect(page.locator('.v03-action-reason')).toContainText('monthly work points');
  await page.keyboard.press('Escape');
  await expect(page.locator('.v03-officer-detail')).toBeVisible();
  expect(await current(page)).toEqual(exhausted);
});
