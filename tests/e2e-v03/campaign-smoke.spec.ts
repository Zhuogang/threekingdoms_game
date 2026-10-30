import {
  showCityManagement,
  showOfficer,
  confirmWork,
  openMenu,
  closeMenu,
  acknowledgeAll,
  submitBattleDay,
  showWithdrawal,
} from './ui-navigation';
import { Buffer } from 'node:buffer';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createCanvasBattleMap,
  getUnitReachableTiles,
  type BattleTactic,
} from '../../src/v03/battle';
import { battlefieldBounds, V03_BATTLEFIELD_PADDING } from '../../src/v03/rendering/geometry';
import { executeV03Command } from '../../src/v03/commands';
import { createV03Game } from '../../src/v03/initial-state';
import { decodeV03Save, encodeV03Save } from '../../src/v03/platform/storage';
import type { V03GameState } from '../../src/v03/types';
import { preparePuyangArmy } from '../v03/helpers/army-fixture';

const AUTOSAVE_KEY = 'hegemony-v0.3:autosave';

async function startCampaign(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
}

async function setLocale(page: Page, locale: 'en' | 'zh') {
  if (await page.locator('.v03-campaign-window').count()) {
    if ((await page.locator('html').getAttribute('lang')) !== locale)
      await page.locator('.v03-window-language').click();
    return;
  }
  await openMenu(page);
  const current = await page.locator('html').getAttribute('lang');
  if (current !== locale)
    await page.getByRole('button', { name: current === 'en' ? '中文' : 'EN', exact: true }).click();
  await closeMenu(page);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

async function expectControlReachable(page: Page, control: Locator, label: string) {
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error(`${label} is not laid out.`);
  expect(bounds.width, `${label} has no visible width`).toBeGreaterThan(0);
  expect(bounds.height, `${label} has no visible height`).toBeGreaterThan(0);
  expect(bounds.x, `${label} is clipped on the left`).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width, `${label} is clipped on the right`).toBeLessThanOrEqual(
    viewport.width + 1,
  );
  expect(bounds.y, `${label} is clipped above the viewport`).toBeGreaterThanOrEqual(-1);
  expect(bounds.y + bounds.height, `${label} is clipped below the viewport`).toBeLessThanOrEqual(
    viewport.height + 1,
  );
}

async function storedSave(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw) as {
          format: string;
          version: number;
          ruleset: string;
          state: { version: number; absoluteDay: number };
        })
      : null;
  }, AUTOSAVE_KEY);
}

async function importFile(page: Page, name: string, content: string) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(content, 'utf8'),
  });
}

function createBattleSave(battlefieldId = 'bf01-north-plain'): string {
  let state: V03GameState = createV03Game('cao', 481516);
  preparePuyangArmy(state);
  const defended = state.cities.find((city) => city.id === 'xiapi')!;
  defended.garrisonTroops = 500;
  defended.population -= 500;
  const dispatched = executeV03Command(state, {
    type: 'issueCampaignDirective',
    sourceCityId: 'puyang',
    targetCityId: 'xiapi',
    intent: 'conquer',
    requestedTroops: 700,
    requestedByDay: null,
  });
  if (!dispatched.ok)
    throw new Error(dispatched.error ?? 'Could not create the browser battle fixture.');
  state = dispatched.state;

  // The browser fixture is for testing battle interaction, not long-distance
  // travel. Keep its actual route and units, but shorten this saved journey so
  // geography changes do not make every visual test simulate months of travel.
  const fixtureJourney = state.journeys.find(
    (journey) => journey.kind === 'campaign' && journey.ownerFactionId === 'cao',
  );
  if (!fixtureJourney) throw new Error('The browser battle fixture has no campaign journey.');
  fixtureJourney.routeSnapshot = fixtureJourney.routeSnapshot.map((segment) => ({
    ...segment,
    lengthKm: Math.min(segment.lengthKm, 1),
    fixedDelayDays: 0,
  }));
  fixtureJourney.segmentProgressKm = fixtureJourney.routeSnapshot.map(() => 0);
  fixtureJourney.segmentWaitDays = fixtureJourney.routeSnapshot.map(() => 0);
  fixtureJourney.expectedArrivalDay = state.absoluteDay + 1;

  for (let day = 0; day < 8; day++) {
    const battle = state.battles.find((entry) => entry.active && entry.attackerFactionId === 'cao');
    if (battle) {
      const map = createCanvasBattleMap(battlefieldId, {
        approachDirection: 'north',
        seed: 481516,
      });
      battle.battleData.map = map;
      battle.mapId = map.mapId;
      battle.mapVersion = map.templateVersion;
      battle.seed = map.seed;
      for (const side of ['attacker', 'defender'] as const) {
        const deployment = side === 'attacker' ? map.attackerDeployment : map.defenderDeployment;
        battle.battleData.units
          .filter((unit) => unit.side === side)
          .forEach((unit, index) =>
            Object.assign(unit, deployment[index], { moved: false, acted: false }),
          );
      }
      return encodeV03Save(state);
    }
    for (const event of state.events.filter((entry) => !entry.acknowledged)) {
      state = executeV03Command(state, { type: 'acknowledgeEvent', eventId: event.id }).state;
    }
    const advanced = executeV03Command(state, { type: 'advance', days: 1 });
    if (!advanced.ok)
      throw new Error(advanced.error ?? 'Could not advance the browser battle fixture.');
    state = advanced.state;
  }
  throw new Error('The browser battle fixture did not reach its destination.');
}

function createTacticBattleSave(tactic: BattleTactic): string {
  const state = decodeV03Save(createBattleSave());
  const battle = state.battles.find((entry) => entry.active);
  if (!battle) throw new Error('The tactic fixture has no active battle.');
  const data = battle.battleData;
  const source = data.units.find((unit) => unit.side === data.playerSide && unit.troops > 0);
  const target = data.units.find((unit) => unit.side !== data.playerSide && unit.troops > 0);
  if (!source || !target) throw new Error('The tactic fixture has no opposing units.');

  for (const side of ['attacker', 'defender'] as const) {
    const units = data.units.filter((unit) => unit.side === side);
    const deployment =
      side === 'attacker' ? data.map.attackerDeployment : data.map.defenderDeployment;
    units.forEach((unit, index) => Object.assign(unit, deployment[index]));
  }

  Object.assign(source, {
    x: 10,
    y: 10,
    troops: 1500,
    initialTroops: 1500,
    force: 100,
    intellect: 100,
    level: 5,
    isMilitia: false,
    morale: 80,
    status: 'normal' as const,
    moved: false,
    acted: false,
  });
  Object.assign(target, {
    x: 11,
    y: 10,
    troops: 1500,
    initialTroops: 1500,
    morale: 80,
    status: 'normal' as const,
    moved: false,
    acted: false,
  });
  data.map.terrain = Array.from({ length: data.map.width * data.map.height }, () => 'plain');
  if (tactic === 'ambush') data.map.terrain[10 * data.map.width + 10] = 'forest';
  if (tactic === 'rockfall') data.map.terrain[10 * data.map.width + 10] = 'hill';
  data.map.terrain[10 * data.map.width + 11] = 'water';
  data.tacticPoints[data.playerSide] = 30;
  data.supplies[target.side] = 10_000;
  if (target.side === 'attacker') battle.attackerFood = 10_000;
  else battle.defenderFood = 10_000;
  return encodeV03Save(state);
}

function createCapitalActionsSave(): string {
  const state = createV03Game('cao', 8675309);
  const capital = state.cities.find((city) => city.id === state.playerCapitalCityId);
  const officer = state.officers.find(
    (entry) =>
      entry.alive &&
      entry.factionId === state.playerFactionId &&
      entry.location.kind === 'city' &&
      entry.location.cityId === state.playerCapitalCityId,
  );
  if (!capital || !officer) throw new Error('The capital-action fixture needs a local officer.');
  capital.gold = 1000;
  capital.food = 2000;
  capital.loyalty = 50;
  capital.population = 100_000;
  capital.workMonthIndex = state.monthIndex;
  capital.workPointsUsed = 0;
  officer.loyalty = 50;
  officer.force = 90;
  officer.equipment = null;
  return encodeV03Save(state);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__v03_e2e_initialized') !== '1') {
      localStorage.clear();
      sessionStorage.setItem('__v03_e2e_initialized', '1');
    }
  });
});

test('starts a campaign, loads the atlas, advances time, saves and rejects invalid imports', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const atlasResponse = page.waitForResponse((response) =>
    response.url().includes('/assets/v03/maps/campaign-china-full-ink-01.webp'),
  );
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
  expect((await atlasResponse).status()).toBe(200);
  await expect(page.locator('.v03-map-frame svg image').first()).toHaveAttribute(
    'href',
    /campaign-china-full-ink-01\.webp$/,
  );
  await page.screenshot({
    path: testInfo.outputPath('campaign.png'),
    fullPage: true,
    animations: 'disabled',
  });

  const date = page.locator('.v03-date strong');
  await expect(date).toContainText('Day 1');
  await page.getByRole('button', { name: 'Advance 1 day', exact: true }).click();
  await expect(date).toContainText('Day 2');
  await page.getByRole('button', { name: 'Advance 10 days', exact: true }).click();
  await expect(date).toContainText('Day 12');

  await openMenu(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = await storedSave(page);
  expect(saved).toMatchObject({ format: 'hegemony.save', version: 3, ruleset: 'hegemony-3' });
  expect(saved?.state).toMatchObject({ version: 3, absoluteDay: 11 });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Advance 1 day', exact: true })).toBeVisible();
  await expect(date).toContainText('Day 12');

  await importFile(
    page,
    'old-v2.save',
    JSON.stringify({ format: 'hegemony.save', version: 2, ruleset: 'hegemony-2', state: {} }),
  );
  await expect(page.getByRole('status')).toContainText('older version');
  expect(await storedSave(page)).toMatchObject({ version: 3, state: { absoluteDay: 11 } });

  await importFile(page, 'not-a-save.json', '{ definitely not json');
  await expect(page.getByRole('status')).toContainText('not valid JSON');
  expect(await storedSave(page)).toMatchObject({ version: 3, state: { absoluteDay: 11 } });
});

test('charges work only for relief while preserving reward and equipment costs', async ({
  page,
}) => {
  await startCampaign(page);
  await importFile(page, 'capital-actions.save', createCapitalActionsSave());
  await showOfficer(page);

  const reward = page.getByRole('button', { name: /Reward officer · 100 gold/ }).first();
  const equipment = page.getByRole('button', { name: /Issue fine arms · 180 gold/ }).first();
  const relief = page.getByRole('button', { name: /Relieve people · 80 gold/ });
  await expect(reward).toBeEnabled();
  await expect(equipment).toBeEnabled();
  await reward.click();
  await confirmWork(page);
  await equipment.click();
  await confirmWork(page);
  await showCityManagement(page);
  await expect(relief).toBeEnabled();
  await relief.click();
  await confirmWork(page);

  await expect
    .poll(async () => {
      const saved = await page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }, AUTOSAVE_KEY);
      const state = saved?.state;
      const city = state?.cities?.find(
        (entry: { id: string }) => entry.id === state.playerCapitalCityId,
      );
      return city?.workPointsUsed;
    })
    .toBe(1);

  const saved = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, AUTOSAVE_KEY);
  const city = saved.state.cities.find(
    (entry: { id: string }) => entry.id === saved.state.playerCapitalCityId,
  );
  const officer = saved.state.officers.find(
    (entry: {
      id: string;
      alive: boolean;
      factionId: string | null;
      location: { kind: string; cityId?: string };
    }) =>
      entry.alive &&
      entry.factionId === saved.state.playerFactionId &&
      entry.location.kind === 'city' &&
      entry.location.cityId === saved.state.playerCapitalCityId,
  );
  // Relief settles 1,500 people (PF-RL-02).
  expect(city).toMatchObject({ gold: 640, food: 1400, loyalty: 65, population: 101_500 });
  expect(officer).toMatchObject({ loyalty: 65, force: 95, equipment: 'Fine arms' });
});

test('renders and resumes a playable 48×32 battle with unit artwork', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
  await importFile(page, 'battle.save', createBattleSave());
  await expect(page.locator('.v03-battle-main')).toBeVisible();
  await expect(page.locator('.v03-battle-board > .v03-battlefield-map')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await acknowledgeAll(page);
  const endBattleDay = page
    .locator('.v03-top-actions')
    .getByRole('button', { name: 'End battle day', exact: true });
  await expect(endBattleDay).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('battlefield.png'),
    fullPage: true,
    animations: 'disabled',
  });

  const battleDay = page.locator('.v03-battle-day');
  await expect(battleDay).toContainText('1 / 30');
  await submitBattleDay(page);
  await expect(battleDay).toContainText('2 / 30');
  await page.reload();
  await expect(page.locator('.v03-battle-day')).toContainText('Battle day 2 / 30');
  expect(
    await page.locator('.v03-battle-board > .v03-battlefield-map image').count(),
  ).toBeGreaterThan(0);
});

const tacticLabels: Record<BattleTactic, string> = {
  fire: 'Fire attack',
  rally: 'Rally',
  confuse: 'Confuse',
  raidSupply: 'Raid supplies',
  ambush: 'Ambush',
  rockfall: 'Rockfall',
};
const tacticLogs: Record<BattleTactic, RegExp> = {
  fire: /uses Fire/i,
  rally: /uses Rally/i,
  confuse: /uses Confuse/i,
  raidSupply: /uses Raid supply/i,
  ambush: /uses Ambush/i,
  rockfall: /uses Rockfall/i,
};

for (const tactic of Object.keys(tacticLabels) as BattleTactic[]) {
  test(`exposes and executes ${tacticLabels[tactic]} through the battlefield controls`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New campaign', exact: true }).click();
    await expect(page.locator('.v03-campaign-main')).toBeVisible();
    await importFile(page, `${tactic}-battle.save`, createTacticBattleSave(tactic));
    await expect(page.locator('.v03-battle-main')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await acknowledgeAll(page);

    const sourceRow = page.locator('.v03-unit-row:not(.enemy)').first();
    await sourceRow.click();
    const tacticButton = page.getByRole('button', {
      name: new RegExp(tacticLabels[tactic]),
    });
    await expect(tacticButton).toBeEnabled();
    await tacticButton.click();
    if (tactic === 'rally') await sourceRow.click();
    else await page.locator('.v03-unit-row.enemy').first().click();
    await expect(page.locator('.v03-log-box p').last()).toContainText(tacticLogs[tactic]);
  });
}

test('battle camera, minimap, keyboard orders, feedback, and Chinese labels stay connected', async ({
  page,
}) => {
  await startCampaign(page);
  const save = createBattleSave();
  const decoded = decodeV03Save(save);
  const battle = decoded.battles.find((entry) => entry.active);
  if (!battle) throw new Error('The browser battle fixture has no active battle.');
  const friendly = battle.battleData.units.find(
    (unit) => unit.side === battle.battleData.playerSide && unit.troops > 0,
  );
  if (!friendly) throw new Error('The browser battle fixture has no living player unit.');
  const destination = getUnitReachableTiles(battle.battleData, friendly.id)[0];
  if (!destination) throw new Error('The browser battle fixture has no reachable movement cell.');

  await importFile(page, 'camera-battle.save', save);
  await expect(page.locator('.v03-battle-main')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await acknowledgeAll(page);
  // Nothing is selected for the player; pick the formation the keyboard orders will move.
  await expect(page.locator('.v03-unit-row.selected')).toHaveCount(0);
  await page.locator('.v03-unit-row:not(.enemy)').first().click();

  const map = page.locator('.v03-battlefield-map');
  const minimap = page.locator('.v03-battlefield-minimap');
  const viewportPolygon = minimap.locator('polygon');
  await expect(map).toHaveAttribute('viewBox', /\d/);
  await expect(viewportPolygon).toBeVisible();
  await page.getByRole('button', { name: 'Fit full battlefield', exact: true }).click();
  const fitted = await map.getAttribute('viewBox');
  const initialPolygon = await viewportPolygon.getAttribute('points');

  await page.getByRole('button', { name: 'Zoom in battlefield', exact: true }).click();
  const zoomed = await map.getAttribute('viewBox');
  expect(zoomed).not.toBe(fitted);
  const zoomedPolygon = await viewportPolygon.getAttribute('points');
  expect(zoomedPolygon).not.toBe(initialPolygon);

  await page.getByRole('button', { name: 'Focus selected unit', exact: true }).click();
  const focused = await map.getAttribute('viewBox');
  expect(focused).not.toBe(zoomed);
  await expect(page.getByRole('button', { name: /field camps/i })).toHaveCount(0);
  // Zoom before checking minimap and keyboard navigation.
  for (let step = 0; step < 3; step++)
    await page.getByRole('button', { name: 'Zoom in battlefield', exact: true }).click();
  const beforeNavigation = await map.getAttribute('viewBox');

  // The battlefield shell clips its contents and the viewport observer updates
  // while the page scrolls. Scroll the SVG directly, then use its live client
  // rect instead of Playwright's stability heuristic (which can retry forever
  // while React updates the viewport polygon).
  const positionedMiniBox = await minimap.evaluate(async (element) => {
    element.scrollIntoView({ block: 'center', inline: 'center' });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (!positionedMiniBox.width || !positionedMiniBox.height)
    throw new Error('The battlefield minimap is not laid out.');
  if (!positionedMiniBox) throw new Error('The battlefield minimap is not laid out.');
  await page.mouse.click(
    positionedMiniBox.x + positionedMiniBox.width * 0.84,
    positionedMiniBox.y + positionedMiniBox.height * 0.78,
  );
  const minimapNavigated = await map.getAttribute('viewBox');
  expect(minimapNavigated).not.toBe(beforeNavigation);

  await minimap.focus();
  await page.keyboard.press('Shift+ArrowLeft');
  const minimapKeyboardPan = await map.getAttribute('viewBox');
  expect(minimapKeyboardPan).not.toBe(minimapNavigated);

  await map.focus();
  await page.keyboard.press('Shift+ArrowLeft');
  const keyboardPanned = await map.getAttribute('viewBox');
  expect(keyboardPanned).not.toBe(minimapKeyboardPan);
  await page.keyboard.press('Home');
  const refit = await map.getAttribute('viewBox');
  const fittedValues = refit!.split(/\s+/).map(Number);
  const left = fittedValues[0]!;
  const top = fittedValues[1]!;
  const width = fittedValues[2]!;
  const height = fittedValues[3]!;
  const boardBounds = battlefieldBounds(48, 32, V03_BATTLEFIELD_PADDING);
  expect(left).toBeLessThanOrEqual(boardBounds.left);
  expect(top).toBeLessThanOrEqual(boardBounds.top);
  expect(left + width).toBeGreaterThanOrEqual(boardBounds.right);
  expect(top + height).toBeGreaterThanOrEqual(boardBounds.bottom);

  const originalCell = await map.getAttribute('aria-label');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'That cell is blocked' })).toBeVisible();
  expect(await map.getAttribute('aria-label')).toBe(originalCell);

  const dx = destination.x - friendly.x;
  const dy = destination.y - friendly.y;
  for (let index = 0; index < Math.abs(dx); index++)
    await page.keyboard.press(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  for (let index = 0; index < Math.abs(dy); index++)
    await page.keyboard.press(dy > 0 ? 'ArrowDown' : 'ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('.v03-unit-row.selected')).toContainText('Moved · action available');

  await openMenu(page);
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(page.locator('.v03-battlefield-minimap')).toHaveAttribute(
    'aria-label',
    /战场小地图/,
  );
  await expect(page.getByRole('group', { name: '战场镜头' })).toBeVisible();
  await expect(page.locator('.v03-unit-row.selected')).toContainText('已移动 · 可继续行动');
  await page.getByRole('button', { name: '显示全图', exact: true }).click();
  const chineseFit = (await map.getAttribute('viewBox'))!.split(/\s+/).map(Number);
  expect(chineseFit[0]).toBeLessThanOrEqual(boardBounds.left);
  expect(chineseFit[1]).toBeLessThanOrEqual(boardBounds.top);
  expect(chineseFit[0]! + chineseFit[2]!).toBeGreaterThanOrEqual(boardBounds.right);
  expect(chineseFit[1]! + chineseFit[3]!).toBeGreaterThanOrEqual(boardBounds.bottom);
});

test('renders painted canvas battlefields in the playable view', async ({ page }, testInfo) => {
  await startCampaign(page);

  for (const [region, name] of [
    ['bf01-north-plain', 'Northern Plain'],
    ['bf03-yellow-river-ford', 'Yellow River Ford'],
    ['bf05-yangtze-crossing', 'Great River Crossing'],
    ['bf09-gorge', 'Gorge Plank Road'],
  ] as const) {
    await importFile(page, `${region}-battle.save`, createBattleSave(region));
    await expect(page.locator('.v03-battle-main')).toBeVisible();
    await expect(page.locator('.v03-view-heading .v03-kicker')).toContainText(name);
    await expect(
      page.locator('.v03-battle-board > .v03-battlefield-map image').first(),
    ).toHaveAttribute('href', new RegExp(`battlefields/${region}\\.webp`));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await acknowledgeAll(page);
    await page.screenshot({
      path: testInfo.outputPath(`battlefield-${region}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
});

test('opens the wiki in English and Chinese while keeping the campaign available', async ({
  page,
}) => {
  await startCampaign(page);

  await openMenu(page);
  await page
    .locator('.v03-top-actions')
    .getByRole('button', { name: 'Field guide / Wiki', exact: true })
    .click();
  const englishWiki = page.getByRole('dialog', { name: 'Field guide / Wiki' });
  await expect(englishWiki).toBeVisible();
  await expect(englishWiki.getByText('Your first campaign')).toBeVisible();
  await englishWiki.getByRole('button', { name: 'Battle controls', exact: true }).click();
  await expect(englishWiki.getByText(/Six tactics are available/)).toBeVisible();
  await englishWiki.getByRole('button', { name: 'Governors', exact: true }).click();
  await expect(
    englishWiki.getByText(/Every owned city gains two work points every ten game days/),
  ).toContainText('Assignment, contingent returns, rewards and equipment use no work points.');
  await englishWiki.getByRole('button', { name: 'Rival houses', exact: true }).click();
  await expect(englishWiki.getByText('Character comes from the ruler')).toBeVisible();
  await englishWiki.getByRole('button', { name: 'Governors', exact: true }).click();
  await expect(englishWiki.getByText(/Recruit → assign → march/)).toBeVisible();
  await englishWiki.getByRole('button', { name: 'Close' }).click();

  await openMenu(page);
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await openMenu(page);
  await page
    .locator('.v03-top-actions')
    .getByRole('button', { name: '游戏指南 / Wiki', exact: true })
    .click();
  const chineseWiki = page.getByRole('dialog', { name: '游戏指南 / Wiki' });
  await expect(chineseWiki).toBeVisible();
  await chineseWiki.getByRole('button', { name: '兵种', exact: true }).click();
  await expect(chineseWiki.getByText('战场部队')).toBeVisible();
  await expect(chineseWiki.getByText(/步兵稳定守线/)).toBeVisible();
  await chineseWiki.getByRole('button', { name: '太守', exact: true }).click();
  await expect(chineseWiki.getByText(/每城每旬（10 个游戏日）增加 2 点/)).toContainText(
    '配兵、归还所部、赏赐和装备不耗工作点',
  );
  await expect(chineseWiki.getByText(/征募 → 分配 → 出征/)).toBeVisible();
  await chineseWiki.getByRole('button', { name: '战斗操作', exact: true }).click();
  await expect(chineseWiki.getByText(/六种计策/)).toBeVisible();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
});

test('keeps campaign and battlefield controls reachable at 390, 1366, and 1920px in English and Chinese', async ({
  page,
}) => {
  const widths = [390, 1366, 1920] as const;
  await page.setViewportSize({ width: 390, height: 900 });
  await startCampaign(page);

  for (const locale of ['en', 'zh'] as const) {
    await setLocale(page, locale);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('.v03-campaign-main')).toBeVisible();
      await expect(page.locator('.v03-map-frame')).toBeVisible();
      const advance = page
        .getByRole('button', {
          name: locale === 'en' ? 'Advance 1 day' : '推进一日',
          exact: true,
        })
        .first();
      await openMenu(page);
      const wiki = page.locator('.v03-top-actions').getByRole('button', {
        name: locale === 'en' ? 'Field guide / Wiki' : '游戏指南 / Wiki',
        exact: true,
      });
      await openMenu(page);
      const save = page.getByRole('button', {
        name: locale === 'en' ? 'Save' : '保存',
        exact: true,
      });
      await expectControlReachable(page, advance, `${locale} campaign advance at ${width}px`);
      await expectControlReachable(page, wiki, `${locale} campaign wiki at ${width}px`);
      await expectControlReachable(page, save, `${locale} campaign save at ${width}px`);
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        horizontalOverflow,
        `${locale} campaign horizontal overflow at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
  }

  await setLocale(page, 'en');
  await importFile(page, 'viewport-battle.save', createBattleSave());
  await expect(page.locator('.v03-battle-main')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await acknowledgeAll(page);
  for (const locale of ['en', 'zh'] as const) {
    await setLocale(page, locale);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('.v03-battle-main')).toBeVisible();
      await expect(page.locator('.v03-battle-board > .v03-battlefield-map')).toBeVisible();
      const fit = page.getByRole('button', {
        name: locale === 'en' ? 'Fit full battlefield' : '显示全图',
        exact: true,
      });
      const advanceBattle = page
        .getByRole('button', {
          name: locale === 'en' ? 'End battle day' : '结束战斗日',
          exact: true,
        })
        .first();
      await showWithdrawal(page);
      await showWithdrawal(page);
      const retreat = page
        .getByRole('button', {
          name: locale === 'en' ? 'Withdraw from battle' : '整军撤退',
          exact: true,
        })
        .first();
      await expectControlReachable(page, fit, `${locale} battlefield camera at ${width}px`);
      await expectControlReachable(
        page,
        advanceBattle,
        `${locale} end-battle-day control at ${width}px`,
      );
      await expectControlReachable(page, retreat, `${locale} retreat control at ${width}px`);
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        horizontalOverflow,
        `${locale} battlefield horizontal overflow at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('keeps campaign and battlefield controls reachable with 200% browser zoom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 780, height: 900 });
  await startCampaign(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });

  for (const locale of ['en', 'zh'] as const) {
    await setLocale(page, locale);
    const advance = page
      .getByRole('button', {
        name: locale === 'en' ? 'Advance 1 day' : '推进一日',
        exact: true,
      })
      .first();
    await openMenu(page);
    const wiki = page.locator('.v03-top-actions').getByRole('button', {
      name: locale === 'en' ? 'Field guide / Wiki' : '游戏指南 / Wiki',
      exact: true,
    });
    await expectControlReachable(page, advance, `${locale} campaign advance at 200% zoom`);
    await expectControlReachable(page, wiki, `${locale} campaign wiki at 200% zoom`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      `${locale} campaign overflow at 200% zoom`,
    ).toBeLessThanOrEqual(1);
  }

  await setLocale(page, 'en');
  await importFile(page, 'zoom-battle.save', createBattleSave());
  await expect(page.locator('.v03-battle-main')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await acknowledgeAll(page);
  for (const locale of ['en', 'zh'] as const) {
    await setLocale(page, locale);
    const fit = page.getByRole('button', {
      name: locale === 'en' ? 'Fit full battlefield' : '显示全图',
      exact: true,
    });
    const advanceBattle = page
      .getByRole('button', {
        name: locale === 'en' ? 'End battle day' : '结束战斗日',
        exact: true,
      })
      .first();
    await showWithdrawal(page);
    const retreat = page
      .getByRole('button', {
        name: locale === 'en' ? 'Withdraw from battle' : '整军撤退',
        exact: true,
      })
      .first();
    await expectControlReachable(page, fit, `${locale} battlefield camera at 200% zoom`);
    await expectControlReachable(page, advanceBattle, `${locale} battle advance at 200% zoom`);
    await expectControlReachable(page, retreat, `${locale} retreat at 200% zoom`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      `${locale} battlefield overflow at 200% zoom`,
    ).toBeLessThanOrEqual(1);
  }
});

test('keeps generated unit and transport art transparent around the figure', async ({ page }) => {
  await page.goto('/');
  const samples = await page.evaluate(async () => {
    const paths = [
      '/assets/v03/units/infantry-small-ink-04.webp',
      '/assets/v03/units/archer-small-ink-04.webp',
      '/assets/v03/units/cavalry-small-ink-04.webp',
      '/assets/v03/units/boat-transport-ink-03.webp',
      '/assets/v03/units/warship-ink-03.webp',
      '/assets/v03/units/infantry-large-ink-04.webp',
      '/assets/v03/units/cavalry-large-ink-04.webp',
      '/assets/v03/units/archer-large-ink-04.webp',
    ];
    return Promise.all(
      paths.map(async (path) => {
        const image = new Image();
        image.src = path;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable.');
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const alphaAt = (x: number, y: number) => data[(y * canvas.width + x) * 4 + 3]!;
        return {
          path,
          width: image.naturalWidth,
          height: image.naturalHeight,
          corners: [
            alphaAt(0, 0),
            alphaAt(canvas.width - 1, 0),
            alphaAt(0, canvas.height - 1),
            alphaAt(canvas.width - 1, canvas.height - 1),
          ],
          // A formation may have a transparent gap exactly at its center.
          visiblePixels: data.reduce(
            (count, value, index) => count + (index % 4 === 3 && value > 128 ? 1 : 0),
            0,
          ),
        };
      }),
    );
  });
  for (const image of samples) {
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
    expect(image.corners, image.path).toEqual([0, 0, 0, 0]);
    expect(image.visiblePixels, image.path).toBeGreaterThan(image.width * image.height * 0.03);
  }
});
