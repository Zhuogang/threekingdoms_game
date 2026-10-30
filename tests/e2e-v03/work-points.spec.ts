import { test, expect, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { availableTroops, createPersonnelDay } from '../../src/v03/campaign/personnel';
import { asSave } from './playability-fixtures';
import {
  openCity,
  showOfficer,
  showAssignment,
  showCityManagement,
  confirmWork,
  closeCityWindow,
} from './ui-navigation';
import type { V03GameState } from '../../src/v03/types';

const key = 'hegemony-v0.3:autosave';
async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}
async function load(page: Page, locale: string, used: number) {
  const state = createV03Game('cao', 1);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  const officer = state.officers.find((entry) => entry.id === 'caocao')!;
  for (const local of state.officers) {
    if (
      local.id !== officer.id &&
      local.factionId === 'cao' &&
      local.location.kind === 'city' &&
      local.location.cityId === city.id
    ) {
      city.garrisonTroops -= availableTroops(local);
      local.location = { kind: 'city', cityId: 'puyang' };
      state.cities.find((entry) => entry.id === 'puyang')!.garrisonTroops += availableTroops(local);
    }
  }
  Object.assign(city, {
    workMonthIndex: state.monthIndex,
    workPointsUsed: used,
    gold: 5000,
    farming: 100,
    commerce: 100,
  });
  Object.assign(officer, { force: 70, loyalty: 30, equipment: null });
  state.personnelDay = createPersonnelDay(state);
  await page.goto(`/?lang=${locale}`);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: asSave(state),
  });
  await page.reload();
  await expect(page.locator('.v03-shell')).toBeVisible();
  return { state, city, officer };
}
for (const locale of ['zh', 'en']) {
  test(`all four preparations remain usable at zero work points and persist (${locale})`, async ({
    page,
  }) => {
    const { state, city, officer } = await load(page, locale, 3);
    await openCity(page);
    await showOfficer(page, locale === 'zh' ? officer.chinese : officer.name);
    await expect(page.locator('.v03-work-budget')).toContainText('0/6');
    await expect(page.getByRole('button', { name: /训练|Train/, exact: true })).toBeDisabled();
    for (const name of [/赏赐武将|Reward officer/, /配发精良兵器|Issue fine arms/]) {
      await page.getByRole('button', { name }).click();
      await expect(page.locator('.v03-work-detail')).toContainText(
        locale === 'zh' ? '不消耗工作点' : 'Uses no work points',
      );
      await confirmWork(page);
      expect((await saved(page)).cities.find((entry) => entry.id === city.id)!.workPointsUsed).toBe(
        3,
      );
    }
    await showAssignment(page, locale === 'zh' ? officer.chinese : officer.name);
    await page.getByRole('spinbutton').fill(String(officer.troops + 100));
    await confirmWork(page);
    expect((await saved(page)).officers.find((entry) => entry.id === officer.id)!.troops).toBe(
      officer.troops + 100,
    );
    await page.locator('.v03-personnel-panel summary').click();
    await page
      .getByRole('button', { name: /归还全部所部|Return the whole contingent/, exact: true })
      .click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toContainText(locale === 'zh' ? '无需工作点' : 'No work point is needed');
    await dialog.getByRole('button', { name: /确认|Confirm/, exact: true }).click();
    const after = await saved(page);
    expect(after.cities.find((entry) => entry.id === city.id)).toMatchObject({
      workPointsUsed: 3,
      gold: city.gold - 280,
    });
    expect(after.officers.find((entry) => entry.id === officer.id)).toMatchObject({
      troops: 0,
      loyalty: 45,
      force: 75,
      equipment: 'Fine arms',
    });
    expect(after.absoluteDay).toBe(state.absoluteDay);
    await page.reload();
    expect((await saved(page)).cities.find((entry) => entry.id === city.id)!.workPointsUsed).toBe(
      3,
    );
  });

  test(`one stationed officer can spend both city points (${locale})`, async ({ page }) => {
    const { city } = await load(page, locale, 0);
    await openCity(page);
    await showCityManagement(page);
    await expect(page.locator('.v03-work-budget')).toContainText('2/6');
    for (let used = 1; used <= 2; used++) {
      await page.getByRole('button', { name: /发展农田|Improve farmland/ }).click();
      await confirmWork(page);
      expect((await saved(page)).cities.find((entry) => entry.id === city.id)).toMatchObject({
        workPointsUsed: used,
        farming: 100 + used * 20,
        gold: 5000 - used * 80,
      });
      await expect(page.locator('.v03-work-budget')).toContainText(`${2 - used}/6`);
    }
    const exhausted = await saved(page);
    await page.getByRole('button', { name: /发展农田|Improve farmland/ }).click();
    await expect(page.locator('.v03-assigned-officer')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /确认执行|Confirm order/, exact: true }),
    ).toBeDisabled();
    await expect(page.locator('.v03-action-reason')).toContainText(/no work points left|工作点/);
    expect(await saved(page)).toEqual(exhausted);
  });

  test(`ten-day advancement adds two points, banks the unused one and displays the countdown (${locale})`, async ({
    page,
  }) => {
    const { city } = await load(page, locale, 2);
    const showBudget = async (remaining: number, days: number) => {
      await openCity(page);
      await showCityManagement(page);
      const budget = page.locator('.v03-work-budget');
      await expect(budget).toContainText(`${remaining}/6`);
      await expect(budget).toContainText(
        locale === 'zh' ? `${days} 个游戏日后 +2` : `+2 in ${days} game days`,
      );
    };
    await showBudget(0, 10);
    await closeCityWindow(page);
    await page.getByRole('button', { name: /推进十日|Advance 10 days/, exact: true }).click();
    await expect.poll(async () => (await saved(page)).absoluteDay).toBe(10);
    await showBudget(2, 10);
    await page.getByRole('button', { name: /发展农田|Improve farmland/ }).click();
    await confirmWork(page);
    expect((await saved(page)).cities.find((entry) => entry.id === city.id)).toMatchObject({
      workPeriodIndex: 1,
      workPointsUsed: 1,
    });
    await closeCityWindow(page);
    await page.getByRole('button', { name: /推进一日|Advance 1 day/, exact: true }).click();
    await expect.poll(async () => (await saved(page)).absoluteDay).toBe(11);
    await page.reload();
    await showBudget(1, 9);
    await closeCityWindow(page);
    await page.getByRole('button', { name: /推进十日|Advance 10 days/, exact: true }).click();
    await expect.poll(async () => (await saved(page)).absoluteDay).toBe(21);
    // The unused point carries over (PF-RL-01): 1 + 2.
    await showBudget(3, 9);
  });
}
