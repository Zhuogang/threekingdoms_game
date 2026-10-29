import { test, expect, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { advanceV03 } from '../../src/v03/engine';
import { availableTroops } from '../../src/v03/campaign/personnel';
import { gridToWorld } from '../../src/v03/rendering/geometry';
import { pendingCityGovernance } from '../../src/v03/governance/conquest';
import type { V03GameState } from '../../src/v03/types';
import { asSave, reviewBattleState } from './playability-fixtures';
import { openCity, showGovernor, showOfficer } from './ui-navigation';

const key = 'hegemony-v0.3:autosave';
async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
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
function battleFixture(enemyTroops = 500, distant = false) {
  const state = reviewBattleState();
  const battle = state.battles.find((entry) => entry.active)!;
  const unit = battle.battleData.units.find((entry) => entry.side === 'attacker')!;
  const enemy = battle.battleData.units.find((entry) => entry.side === 'defender')!;
  battle.battleData.map.terrain.fill('plain');
  Object.assign(unit, { x: 10, y: 10, intellect: 100, moved: false, acted: false });
  Object.assign(enemy, { x: distant ? 25 : 12, y: 10, troops: enemyTroops });
  return { state, battle, unit, enemy };
}
async function move(page: Page, unitId: string) {
  await page.locator(`.v03-battlefield-map [data-unit-id="${unitId}"]`).click();
  const map = page.locator('.v03-battlefield-map');
  const camera = await map.getAttribute('viewBox');
  const point = await map.evaluate(
    (node, cell) => {
      const p = new DOMPoint(cell.x, cell.y).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      return { x: p.x, y: p.y };
    },
    gridToWorld({ x: 11, y: 10 }),
  );
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('region', { name: /部队行动选择|Unit actions/ })).toBeVisible();
  expect(await map.getAttribute('viewBox')).toBe(camera);
}
function captureFixture(rulerPresent = false, multiple = false) {
  const state = reviewBattleState();
  const battle = state.battles.find((entry) => entry.active)!;
  battle.battleData.outcome = { winner: 'attacker', reason: 'dayLimit' };
  battle.playerDayComplete = true;
  const captured = advanceV03(state, 1).state;
  const event = pendingCityGovernance(captured)[0]!;
  if (rulerPresent) {
    const ruler = captured.officers.find((entry) => entry.id === 'caocao')!;
    const old = captured.cities.find((entry) => entry.id === captured.playerCapitalCityId)!;
    const city = captured.cities.find((entry) => entry.id === event.battleOutcome!.cityId)!;
    old.garrisonTroops -= availableTroops(ruler);
    ruler.location = { kind: 'city', cityId: city.id };
    city.garrisonTroops += availableTroops(ruler);
    old.workPointsUsed = 3;
    city.workMonthIndex = captured.monthIndex;
    city.workPointsUsed = 2;
  }
  if (multiple) {
    captured.events.forEach((entry) => (entry.acknowledged = true));
    captured.events.push({
      ...structuredClone(event),
      id: `${event.id}:second`,
      params: { ...event.params, cityId: 'xuchang', governancePending: true },
      battleOutcome: { ...structuredClone(event.battleOutcome!), cityId: 'xuchang' },
      acknowledged: true,
    });
  }
  return captured;
}
const dialogForGovernance = (page: Page) =>
  page.getByRole('dialog', { name: /如何治理|How will you govern/ });

for (const locale of ['zh', 'en']) {
  test(`movement opens actions, attack captures the city, and a local governor retains the contingent (${locale})`, async ({
    page,
  }, info) => {
    const { state, battle, unit } = battleFixture(1);
    await load(page, state, locale);
    await move(page, unit.id);
    const menu = page.getByRole('region', { name: /部队行动选择|Unit actions/ });
    // With exactly one enemy in range, Attack strikes it without a second map click.
    await menu.getByRole('button', { name: /攻击|Attack/, exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.v03-outcome-modal')).toBeVisible();
    await page.locator('.v03-outcome-modal').getByRole('button').last().click();
    const dialog = dialogForGovernance(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /自任太守|Govern personally/ })).toBeDisabled();
    await dialog.getByRole('button', { name: /任命太守|Appoint a governor/, exact: true }).click();
    const officerId = battle.attackerFormationOfficerIds[unit.id]![0]!;
    await dialog.getByRole('combobox').selectOption(officerId);
    const before = await saved(page);
    await page.screenshot({ path: info.outputPath(`governance-${locale}.png`) });
    await dialog.getByRole('button', { name: /确认治理方式|Confirm governance/ }).click();
    await expect(dialog).toHaveCount(0);
    const after = await saved(page);
    const officer = after.officers.find((entry) => entry.id === officerId)!;
    const beforeOfficer = before.officers.find((entry) => entry.id === officerId)!;
    expect(officer).toEqual({ ...beforeOfficer, governorOfCityId: 'xiapi' });
    expect(pendingCityGovernance(after)).toHaveLength(0);
    await page.reload();
    await expect(dialog).toHaveCount(0);
    await openCity(page, locale === 'zh' ? '下邳' : 'Xiapi');
    await showOfficer(page, locale === 'zh' ? officer.chinese : officer.name);
    await page.locator('.v03-personnel-panel summary').click();
    await expect(
      page.getByRole('button', { name: /遣散指定人员|Disband selected personnel/ }),
    ).toBeVisible();
  });

  test(`personal rule switches the capital without refreshing work or losing personnel (${locale})`, async ({
    page,
  }) => {
    const state = captureFixture(true);
    const oldCapital = state.playerCapitalCityId;
    await load(page, state, locale);
    await page.locator('.v03-outcome-modal').getByRole('button').last().click();
    const dialog = dialogForGovernance(page);
    await dialog.getByRole('button', { name: /自任太守|Govern personally/ }).click();
    await dialog.getByRole('button', { name: /确认治理方式|Confirm governance/ }).click();
    await expect(dialog).toHaveCount(0);
    const after = await saved(page);
    expect(after.playerCapitalCityId).toBe('xiapi');
    expect(after.cities.find((entry) => entry.id === 'xiapi')).toMatchObject({
      governanceMode: 'ruler',
      workPointsUsed: 2,
    });
    expect(after.cities.find((entry) => entry.id === oldCapital)).toMatchObject({
      governanceMode: 'steward',
      workPointsUsed: 3,
    });
    expect(after.officers).toEqual(state.officers);
    await page.reload();
    expect((await saved(page)).playerCapitalCityId).toBe('xiapi');
  });

  test(`multiple captured cities are queued, deferrable, resumable from Inbox, and survive reload (${locale})`, async ({
    page,
  }) => {
    await load(page, captureFixture(false, true), locale);
    const dialog = dialogForGovernance(page);
    await expect(dialog).toContainText(locale === 'zh' ? '下邳' : 'Xiapi');
    await dialog.getByRole('button', { name: /稍后处理|Decide later/ }).click();
    await expect(dialog).toContainText(locale === 'zh' ? '许昌' : 'Xuchang');
    await dialog.getByRole('button', { name: /稍后处理|Decide later/ }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: /收件箱|Inbox/ }).click();
    await expect(page.locator('.v03-governance-pending')).toHaveCount(2);
    await page
      .locator('.v03-governance-pending')
      .filter({ hasText: locale === 'zh' ? '下邳' : 'Xiapi' })
      .getByRole('button')
      .click();
    await expect(dialog).toBeVisible();
    await page.reload();
    await expect(dialog).toBeVisible();
    expect(pendingCityGovernance(await saved(page))).toHaveLength(2);
  });

  test(`governor transfer accepts an armed officer and previews the travelling contingent (${locale})`, async ({
    page,
  }) => {
    const state = createV03Game('cao', 1);
    await load(page, state, locale);
    await openCity(page, locale === 'zh' ? '濮阳' : 'Puyang');
    await showGovernor(page);
    await page.locator('#v03-governor-select').selectOption('caocao');
    await expect(
      page.getByRole('button', { name: /君主亲治|Govern personally/, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        locale === 'zh' ? /君主到达并于月界就任后/ : /After the ruler arrives and takes office/,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        locale === 'zh' ? /所部随行（含伤兵）/ : /Contingent travels with the officer/,
      ),
    ).toContainText('700');
    await page
      .locator('.v03-row')
      .filter({ has: page.locator('#v03-governor-select') })
      .getByRole('button')
      .click();
    const after = await saved(page);
    expect(after.journeys).toHaveLength(1);
    expect(after.playerCapitalCityId).toBe(state.playerCapitalCityId);
    expect(after.journeys[0]!.manifest).toMatchObject({ officerIds: ['caocao'], troopCount: 700 });
    expect(after.officers.find((entry) => entry.id === 'caocao')!.troops).toBe(700);
    await page.reload();
    expect((await saved(page)).journeys[0]!.manifest.troopCount).toBe(700);
    expect((await saved(page)).playerCapitalCityId).toBe(state.playerCapitalCityId);
    await openCity(page, locale === 'zh' ? '濮阳' : 'Puyang');
    await showGovernor(page);
    await expect(
      page.getByText(locale === 'zh' ? /君主亲治待生效/ : /Personal rule pending/),
    ).toBeVisible();
  });

  test(`loading an effective Liu Bei governor office repairs the ruler capital (${locale})`, async ({
    page,
  }) => {
    const state = createV03Game('liu', 1);
    const city = state.cities.find((entry) => entry.id === 'beiping')!;
    const old = state.cities.find((entry) => entry.id === 'pingyuan')!;
    const ruler = state.officers.find((entry) => entry.id === 'liubei')!;
    city.factionId = 'liu';
    city.governorId = ruler.id;
    city.governanceMode = 'governor';
    city.workMonthIndex = state.monthIndex;
    city.workPointsUsed = 2;
    old.workPointsUsed = 3;
    old.garrisonTroops -= availableTroops(ruler);
    city.garrisonTroops += availableTroops(ruler);
    ruler.location = { kind: 'city', cityId: city.id };
    ruler.governorOfCityId = city.id;
    await load(page, state, locale);
    await expect.poll(async () => (await saved(page)).playerCapitalCityId).toBe('beiping');
    const after = await saved(page);
    expect(after.factions.find((entry) => entry.id === 'liu')!.capitalCityId).toBe('beiping');
    expect(after.cities.find((entry) => entry.id === 'beiping')).toMatchObject({
      governanceMode: 'ruler',
      governorId: null,
      workPointsUsed: 2,
    });
    expect(after.cities.find((entry) => entry.id === 'pingyuan')).toMatchObject({
      governanceMode: 'steward',
      workPointsUsed: 3,
    });
    await openCity(page);
    await expect(page.locator('.v03-campaign-window')).toContainText(
      locale === 'zh' ? '北平' : 'Beiping',
    );
    await page.reload();
    expect((await saved(page)).playerCapitalCityId).toBe('beiping');
  });

  test(`closing and reopening the movement menu preserves the move; wait spends only the remaining action (${locale})`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { state, battle, unit } = battleFixture(500, true);
    await load(page, state, locale);
    await move(page, unit.id);
    const menu = page.getByRole('region', { name: /部队行动选择|Unit actions/ });
    await expect(menu.getByRole('button', { name: /攻击|Attack/, exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`movement-menu-mobile-${locale}.png`) });
    await menu.getByRole('button', { name: /关闭|Close/, exact: true }).click();
    await expect(menu).toHaveCount(0);
    expect(
      (await saved(page)).battles
        .find((entry) => entry.id === battle.id)!
        .battleData.units.find((entry) => entry.id === unit.id),
    ).toMatchObject({ moved: true, acted: false, x: 11, y: 10 });
    await page.locator(`.v03-battlefield-map [data-unit-id="${unit.id}"]`).click();
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: /待命|Wait/, exact: true }).click();
    await expect(menu).toHaveCount(0);
    expect(
      (await saved(page)).battles
        .find((entry) => entry.id === battle.id)!
        .battleData.units.find((entry) => entry.id === unit.id),
    ).toMatchObject({ moved: true, acted: true });
  });

  test(`movement tactics use the existing selection, target and point-cost rules (${locale})`, async ({
    page,
  }) => {
    const { state, battle, unit, enemy } = battleFixture();
    await load(page, state, locale);
    await move(page, unit.id);
    const menu = page.getByRole('region', { name: /部队行动选择|Unit actions/ });
    const before = await saved(page);
    await menu.getByRole('button', { name: /计略|计策|Tactics/, exact: true }).click();
    await menu.getByRole('button', { name: /火攻|火计|Fire/ }).click();
    await expect(menu).toHaveCount(0);
    expect(await saved(page)).toEqual(before);
    await page.locator(`.v03-battlefield-map [data-unit-id="${enemy.id}"]`).click();
    const after = await saved(page);
    const tactics = after.battles.find((entry) => entry.id === battle.id)!.battleData;
    expect(tactics.units.find((entry) => entry.id === unit.id)!.acted).toBe(true);
    expect(tactics.tacticPoints.attacker).toBeLessThan(battle.battleData.tacticPoints.attacker);
  });
}
