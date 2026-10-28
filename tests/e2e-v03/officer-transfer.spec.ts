import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createV03Game } from '../../src/v03/initial-state';
import { executeV03Command } from '../../src/v03/commands';
import { createPersonnelDay, availableTroops } from '../../src/v03/campaign/personnel';
import type { V03GameState } from '../../src/v03/types';
import { asSave } from './playability-fixtures';
import { openCity, showCityManagement, closeCityWindow } from './ui-navigation';

const key = 'hegemony-v0.3:autosave';
const ids = ['xiahoudun', 'yuejin'];
async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}
function fixture(food = 100_000) {
  const state = createV03Game('cao', 42);
  const source = state.cities.find((city) => city.id === 'chenliu')!;
  source.food = food;
  source.workPointsUsed = 2;
  for (const [index, id] of ids.entries()) {
    const officer = state.officers.find((entry) => entry.id === id)!;
    source.garrisonTroops -= availableTroops(officer);
    Object.assign(officer, {
      troops: 200 + index * 100,
      wounded: 20 + index * 10,
      troopExperience: 340,
    });
    source.garrisonTroops += availableTroops(officer);
  }
  state.personnelDay = createPersonnelDay(state);
  state.alliances = state.factions.flatMap((a, index) =>
    state.factions.slice(index + 1).map((b) => ({ a: a.id, b: b.id, expiresMonthIndex: 6 })),
  );
  return state;
}
async function load(page: Page, state: V03GameState, locale: string) {
  await page.goto(`/?lang=${locale}`);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: asSave(state),
  });
  await page.reload();
  await expect(page.locator('.v03-shell')).toBeVisible();
}
async function openTransfer(page: Page, city?: string) {
  await openCity(page, city);
  await showCityManagement(page);
  await page.getByRole('button', { name: /武将调动|Transfer officers/, exact: true }).click();
  return page.locator('.v03-officer-transfer');
}
for (const locale of ['zh', 'en']) {
  test(`multi-select previews provisions and transfers only checked contingents without appointments (${locale})`, async ({
    page,
  }) => {
    if (locale === 'zh') await page.setViewportSize({ width: 390, height: 844 });
    const state = fixture();
    await load(page, state, locale);
    const group = await openTransfer(page);
    const confirm = group.getByRole('button', { name: /确认调动|Confirm transfer/, exact: true });
    await expect(confirm).toBeDisabled();
    const destination = group.getByRole('combobox');
    await expect(destination.locator('option[value="chenliu"]')).toHaveCount(0);
    await expect(destination.locator('option[value="ye"]')).toHaveCount(0);
    await destination.selectOption('puyang');
    await expect(
      group.getByRole('checkbox', { name: locale === 'zh' ? '曹操' : 'Cao Cao', exact: true }),
    ).toBeDisabled();
    const all = group.getByRole('checkbox', {
      name: /全选可用武将|Select all eligible officers/,
      exact: true,
    });
    await all.check();
    await expect(group.locator('.v03-group-roster input:checked')).toHaveCount(3);
    await all.uncheck();
    for (const id of ids) {
      const officer = state.officers.find((entry) => entry.id === id)!;
      await group
        .getByRole('checkbox', {
          name: locale === 'zh' ? officer.chinese : officer.name,
          exact: true,
        })
        .check();
    }
    const stats = group.locator('.v03-stat-grid dd');
    await expect(stats.nth(0)).toHaveText('2');
    await expect(stats.nth(1)).toHaveText('500');
    await expect(stats.nth(2)).toHaveText('50');
    await expect(stats.nth(5)).toHaveText('0');
    expect(await saved(page)).toEqual(state);
    await mkdir('.artifacts/officer-transfer', { recursive: true });
    await page.screenshot({ path: `.artifacts/officer-transfer/selection-${locale}.png` });
    await confirm.click();
    await expect(group).toHaveCount(0);
    const after = await saved(page);
    const journey = after.journeys.find((entry) => entry.kind === 'transfer')!;
    expect(journey.manifest).toMatchObject({ officerIds: ids, troopCount: 550 });
    expect(after.cities.find((city) => city.id === 'chenliu')).toMatchObject({
      workPointsUsed: 2,
      food: 100_000 - journey.manifest.carriedFood,
    });
    for (const officer of state.officers)
      expect(after.officers.find((entry) => entry.id === officer.id)).toEqual(
        ids.includes(officer.id)
          ? { ...officer, location: { kind: 'journey', journeyId: journey.id } }
          : officer,
      );
    expect(after.cities.find((city) => city.id === 'puyang')).toEqual(
      state.cities.find((city) => city.id === 'puyang'),
    );
    await closeCityWindow(page);
    await page.getByRole('button', { name: /军情与命令|Marches & orders/, exact: true }).click();
    await expect(page.locator('.v03-transfer-journey')).toContainText(
      locale === 'zh' ? '夏侯惇' : 'Xiahou Dun',
    );
    await page.reload();
    expect((await saved(page)).journeys.find((entry) => entry.id === journey.id)?.manifest).toEqual(
      journey.manifest,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  });

  test(`insufficient food blocks the entire group and cancelling leaves the save unchanged (${locale})`, async ({
    page,
  }) => {
    const state = fixture(0);
    await load(page, state, locale);
    const group = await openTransfer(page);
    await group.getByRole('combobox').selectOption('puyang');
    await group
      .getByRole('checkbox', { name: /全选可用武将|Select all eligible officers/, exact: true })
      .check();
    await expect(
      group.getByRole('button', { name: /确认调动|Confirm transfer/, exact: true }),
    ).toBeDisabled();
    await expect(group.locator('.v03-action-reason')).toContainText(
      locale === 'zh' ? '粮食' : 'food',
    );
    await page.keyboard.press('Escape');
    expect(await saved(page)).toEqual(state);
  });

  test(`a saved transfer arrives through the calendar and appears as ordinary stationed officers (${locale})`, async ({
    page,
  }) => {
    const result = executeV03Command(fixture(), {
      type: 'transferOfficers',
      sourceCityId: 'chenliu',
      targetCityId: 'puyang',
      officerIds: ids,
    });
    expect(result.ok, result.error).toBe(true);
    const state = result.state;
    const journey = state.journeys.at(-1)!;
    journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
      ...segment,
      lengthKm: 1,
      fixedDelayDays: 0,
    }));
    journey.segmentProgressKm = journey.routeSnapshot.map(() => 0);
    journey.segmentWaitDays = journey.routeSnapshot.map(() => 0);
    journey.expectedArrivalDay = state.absoluteDay + 1;
    await load(page, state, locale);
    await page.getByRole('button', { name: /推进一日|Advance 1 day/, exact: true }).click();
    await expect
      .poll(
        async () => (await saved(page)).journeys.find((entry) => entry.id === journey.id)?.status,
      )
      .toBe('delivered');
    const after = await saved(page);
    for (const id of ids)
      expect(after.officers.find((entry) => entry.id === id)).toMatchObject({
        location: { kind: 'city', cityId: 'puyang' },
        governorOfCityId: null,
        troopExperience: 340,
      });
    expect(after.cities.find((city) => city.id === 'puyang')).toMatchObject({
      governorId: 'xiahouyuan',
      pendingAppointment: null,
    });
    await page.reload();
    const group = await openTransfer(page, locale === 'zh' ? '濮阳' : 'Puyang');
    await expect(
      group.getByRole('checkbox', {
        name: locale === 'zh' ? '夏侯渊' : 'Xiahou Yuan',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      group.getByRole('checkbox', { name: locale === 'zh' ? '夏侯惇' : 'Xiahou Dun', exact: true }),
    ).toBeEnabled();
  });
}
