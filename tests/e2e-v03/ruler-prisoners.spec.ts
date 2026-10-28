import { test, expect, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { availableTroops, createPersonnelDay } from '../../src/v03/campaign/personnel';
import { decidePrisoner, resolveSuccessions } from '../../src/v03/campaign/prisoners';
import { asSave } from './playability-fixtures';
import { openCity, showOfficers, closeCityWindow } from './ui-navigation';
import type { V03GameState } from '../../src/v03/types';

const key = 'hegemony-v0.3:autosave';
async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}
function fixture() {
  const state = createV03Game('liu', 1);
  const ruler = state.officers.find((officer) => officer.id === 'yuanshao')!;
  const old = state.cities.find(
    (city) => ruler.location.kind === 'city' && city.id === ruler.location.cityId,
  )!;
  old.garrisonTroops -= availableTroops(ruler);
  ruler.location = { kind: 'captured', cityId: state.playerCapitalCityId };
  ruler.loyalty = 10;
  ruler.wounded = 40;
  ruler.troopExperience = 1200;
  state.personnelDay = createPersonnelDay(state);
  state.rng = 1;
  resolveSuccessions(state);
  const faction = state.factions.find((entry) => entry.id === 'yuan')!;
  const successor = state.officers.find((entry) => entry.id === faction.leaderOfficerId)!;
  return { state, ruler, successor };
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
async function showPrisoner(page: Page, locale: string) {
  await openCity(page);
  await showOfficers(page);
  await page.getByRole('button', { name: /俘虏|Prisoners/ }).click();
  await page
    .locator('.v03-roster-list')
    .getByRole('button', { name: locale === 'zh' ? '袁绍' : 'Yuan Shao', exact: true })
    .click();
}
for (const locale of ['zh', 'en']) {
  test(`recruiting a captured ruler previews and applies the original house's loyalty loss (${locale})`, async ({
    page,
  }) => {
    const { state, ruler, successor } = fixture();
    await load(page, state, locale);
    await showPrisoner(page, locale);
    await page.getByRole('button', { name: /招降|Recruit prisoner/, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /招降|Recruit prisoner/, exact: true });
    await expect(dialog).toContainText(locale === 'zh' ? '各下降 10 点' : 'by 10');
    await dialog.getByRole('button', { name: /确认|Confirm/, exact: true }).click();
    await expect
      .poll(
        async () =>
          (await saved(page)).officers.find((officer) => officer.id === ruler.id)!.factionId,
      )
      .toBe('liu');
    const after = await saved(page);
    expect(after.officers.find((officer) => officer.id === ruler.id)).toMatchObject({
      loyalty: 60,
      reorganizationDays: 10,
    });
    for (const officer of state.officers.filter(
      (entry) => entry.alive && entry.factionId === 'yuan' && entry.id !== ruler.id,
    ))
      expect(after.officers.find((entry) => entry.id === officer.id)!.loyalty).toBe(
        Math.max(0, officer.loyalty - 10),
      );
    for (const city of state.cities.filter((entry) => entry.factionId === 'yuan'))
      expect(after.cities.find((entry) => entry.id === city.id)!.loyalty).toBe(
        Math.max(0, city.loyalty - 10),
      );
    expect(after.factions.find((entry) => entry.id === 'yuan')).toMatchObject({
      leaderOfficerId: successor.id,
      name: successor.name,
      chinese: successor.chinese,
    });
    await expect(page.locator('.v03-window-feedback')).toContainText('10');
    await page.reload();
    expect((await saved(page)).officers.find((entry) => entry.id === successor.id)!.loyalty).toBe(
      Math.max(0, successor.loyalty - 10),
    );
  });

  test(`executing Yuan Shao preserves morale and keeps his living successor's house (${locale})`, async ({
    page,
  }) => {
    const { state, ruler, successor } = fixture();
    await load(page, state, locale);
    await showPrisoner(page, locale);
    await page.getByRole('button', { name: /处决|Execute/, exact: true }).click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toContainText(locale === 'zh' ? '不会降低' : 'does not lower');
    await dialog.getByRole('button', { name: /处决|Execute/, exact: true }).click();
    await expect
      .poll(async () => (await saved(page)).officers.find((entry) => entry.id === ruler.id)!.alive)
      .toBe(false);
    const after = await saved(page);
    expect(after.officers.map((entry) => entry.loyalty)).toEqual(
      state.officers.map((entry) => entry.loyalty),
    );
    expect(after.cities.map((entry) => entry.loyalty)).toEqual(
      state.cities.map((entry) => entry.loyalty),
    );
    expect(after.factions.find((entry) => entry.id === 'yuan')).toMatchObject({
      eliminated: false,
      leaderOfficerId: successor.id,
      name: successor.name,
      chinese: successor.chinese,
    });
  });

  test(`an old executed-Yuan-Shao save displays the current ruler in diplomacy (${locale})`, async ({
    page,
  }) => {
    const { state, ruler, successor } = fixture();
    const executed = decidePrisoner(state, 'liu', ruler.id, 'execute').state;
    const house = executed.factions.find((entry) => entry.id === 'yuan')!;
    house.name = 'Yuan Shao';
    house.chinese = '袁绍';
    await load(page, executed, locale);
    await closeCityWindow(page);
    await page.getByRole('button', { name: /外交|Diplomacy/, exact: true }).click();
    const menu = page.locator('.v03-diplomacy-menu');
    await expect(
      menu.getByRole('button', {
        name: locale === 'zh' ? successor.chinese : successor.name,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      menu.getByRole('button', { name: locale === 'zh' ? '袁绍' : 'Yuan Shao', exact: true }),
    ).toHaveCount(0);
    expect((await saved(page)).factions.find((entry) => entry.id === 'yuan')!.eliminated).toBe(
      false,
    );
  });
}
