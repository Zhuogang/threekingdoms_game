import { expect, test, type Page } from '@playwright/test';
import { createGame, dispatch } from '../../src/game/campaign';
import type { GameCommand, GameState } from '../../src/game/types';
import {
  dismissBattleSummary,
  importState,
  savedCampaign,
  startCampaign,
  switchLanguage,
} from './improvement-helpers';

function apply(state: GameState, command: GameCommand): GameState {
  const result = dispatch(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
async function chooseCity(page: Page, name: string) {
  await page.getByRole('button', { name: 'City index' }).click();
  await page
    .locator('.city-index')
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click();
  await expect(page.locator('.city-heading h2')).toContainText(name);
}

/** A battle at Xiapi with the player's army already next to the defenders. */
function engagedBattle(): GameState {
  let state = createGame('cao', 16);
  state.officers.find((o) => o.id === 'xiahouyuan')!.troops = 2000;
  // A big garrison keeps the defender alive through the first exchange of blows.
  state.cities.find((c) => c.id === 'xiapi')!.reserve = 8000;
  state = apply(state, {
    type: 'march',
    sourceId: 'puyang',
    targetId: 'xiapi',
    officerIds: ['xiahouyuan'],
  });
  state = apply(state, { type: 'endMonth' });
  const battle = state.battle!;
  const mine = battle.units.find((u) => u.side === battle.playerSide)!;
  const foe = battle.units.find((u) => u.side !== battle.playerSide)!;
  mine.x = 5;
  mine.y = 4;
  foe.x = 6;
  foe.y = 4;
  return state;
}

test('plunder previews its exact result, applies it once and warns against repeating', async ({
  page,
}) => {
  await startCampaign(page);
  const state = createGame('cao', 11);
  const chenliu = state.cities.find((c) => c.id === 'chenliu')!;
  chenliu.commerce = 265;
  chenliu.farming = 310;
  chenliu.loyalty = 72;
  await importState(page, state);
  await chooseCity(page, 'Chenliu');
  await page.getByRole('tab', { name: 'Harsh measures' }).click();
  const plunder = page.getByRole('button', { name: /^Plunder the city/ });
  await plunder.hover();
  const preview = page.locator('.action-preview');
  await expect(preview).toContainText('Public loyalty 72 → 36');
  await expect(preview).toContainText('Agriculture 310 → 155');
  await expect(preview).toContainText('Commerce 265 → 132');
  await expect(preview).toContainText('+749');
  await expect(preview).toContainText('+2,120');
  await plunder.click();
  const after = await savedCampaign(page);
  const city = after.cities.find((c) => c.id === 'chenliu')!;
  expect(city).toMatchObject({ loyalty: 36, farming: 155, commerce: 132 });
  expect(city.gold - chenliu.gold).toBe(749);
  expect(city.plunderCooldownUntil).toBe(3);
  await expect(page.getByRole('button', { name: /^Plunder the city/ })).toBeDisabled();
  await switchLanguage(page, 'zh');
  await expect(page.getByRole('tab', { name: '严政' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^掠夺城池/ })).toBeDisabled();
});

test('the march planner offers conquest, sack and raid with real supply choices', async ({
  page,
}) => {
  await startCampaign(page);
  const state = createGame('cao', 16);
  state.officers.find((o) => o.id === 'xiahouyuan')!.troops = 2000;
  await importState(page, state);
  await chooseCity(page, 'Puyang');
  await page.getByRole('button', { name: 'March an army' }).click();
  await page.getByLabel('Destination').selectOption('xiapi');
  const dialog = page.getByRole('dialog');
  await expect(
    dialog
      .locator('.march-intent label')
      .filter({ hasText: 'Take the city intact' })
      .getByRole('radio'),
  ).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /^20 days / })).toBeVisible();
  await dialog.getByRole('radio', { name: /^30 days / }).click();
  await dialog.getByRole('radio', { name: /Raid/ }).check();
  // A raid carries a fixed ten days of rations.
  await expect(dialog.getByRole('radio', { name: /^10 days / })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // Xiapi has not been scouted, so the loot is an estimated range, not an exact figure.
  await expect(page.getByTestId('loot-preview')).toContainText('Estimated loot');
  await dialog.getByRole('button', { name: 'Issue march order' }).click();
  const queued = await savedCampaign(page);
  const troops = queued.officers
    .filter((o) => queued.orders[0]!.officerIds.includes(o.id))
    .reduce((sum, o) => sum + o.troops, 0);
  expect(queued.orders[0]).toMatchObject({
    intent: 'raid',
    targetId: 'xiapi',
    food: 10 * Math.ceil(troops / 25),
  });
});

test('battle forecast, threat overlay, advance to contact and recap work from the sidebar', async ({
  page,
}) => {
  await startCampaign(page);
  const state = engagedBattle();
  await importState(page, state);
  await expect(page.getByTestId('weather-forecast')).toContainText('Tomorrow');
  await expect(page.getByTestId('supply-days')).toContainText('days left');
  const reach = page.getByRole('button', { name: 'Show enemy reach' });
  await reach.click();
  await expect(page.getByRole('button', { name: 'Hide enemy reach' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The target button carries a casualty forecast and a counter estimate.
  const target = page.locator('.attack-targets button').first();
  await expect(target).toContainText('casualties');
  const label = (await target.getAttribute('aria-label')) ?? '';
  expect(label).toMatch(/^Attack /);
  await target.click();
  const played = await savedCampaign(page);
  const attacker = played.battle!.units.find((u) => u.side === played.battle!.playerSide)!;
  expect(attacker.acted).toBe(true);
  expect(played.battle!.log.some((line) => line.includes('counterattacks'))).toBe(true);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Auto-resolve', exact: true }).click();
  await dismissBattleSummary(page);
  expect((await savedCampaign(page)).lastBattle).not.toBeNull();
});

test('advance to contact ends days until the armies are in reach', async ({ page }) => {
  await startCampaign(page);
  let state = createGame('cao', 16);
  state.officers.find((o) => o.id === 'xiahouyuan')!.troops = 2000;
  state = apply(state, {
    type: 'march',
    sourceId: 'puyang',
    targetId: 'xiapi',
    officerIds: ['xiahouyuan'],
  });
  state = apply(state, { type: 'endMonth' });
  await importState(page, state);
  await page.getByRole('button', { name: 'Advance to contact' }).click();
  await expect
    .poll(async () => (await savedCampaign(page)).battle?.day ?? 99, { timeout: 15_000 })
    .toBeGreaterThan(1);
  const moved = await savedCampaign(page);
  if (moved.battle) expect(moved.battle.day).toBeLessThanOrEqual(11);
});

test('a captive can be recruited, released or executed from the holding city', async ({ page }) => {
  await startCampaign(page);
  const state = createGame('cao', 4);
  const liru = state.officers.find((o) => o.id === 'liru')!;
  Object.assign(liru, { captive: true, cityId: 'chenliu', troops: 0 });
  const dianwei = state.officers.find((o) => o.id === 'lijue')!;
  Object.assign(dianwei, { captive: true, cityId: 'chenliu', troops: 0 });
  for (const c of state.cities) c.governorId = c.id === 'chenliu' ? c.governorId : null;
  await importState(page, state);
  await chooseCity(page, 'Chenliu');
  const panel = page.locator('.prisoner-panel');
  await expect(panel).toContainText('Li Ru');
  await expect(panel).toContainText('Li Jue');
  await panel
    .locator('.prisoner')
    .filter({ hasText: 'Li Ru' })
    .getByRole('button', { name: /Release/ })
    .click();
  expect((await savedCampaign(page)).officers.find((o) => o.id === 'liru')!.captive).toBe(false);
  page.once('dialog', (dialog) => dialog.accept());
  await panel
    .locator('.prisoner')
    .filter({ hasText: 'Li Jue' })
    .getByRole('button', { name: /Execute/ })
    .click();
  const done = await savedCampaign(page);
  expect(done.officers.find((o) => o.id === 'lijue')!.fate).toBe('executed');
  await expect(page.locator('.prisoner-panel')).toHaveCount(0);
});

test('scenario, difficulty and aging are chosen on the start screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /The eve of Guandu/ }).click();
  await expect(page.getByRole('button', { name: /Ma Teng/ })).toBeVisible();
  await page.getByRole('button', { name: /Yuan Shao/ }).click();
  await page.getByLabel('Difficulty').selectOption('warlord');
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByLabel('World seed').fill('4242');
  await page.getByLabel('Natural aging').check();
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  const started = await savedCampaign(page);
  expect(started).toMatchObject({
    scenarioId: 'guandu-200',
    playerFactionId: 'yuan',
    difficulty: 'warlord',
    rivalAggression: 'aggressive',
    aging: true,
    year: 200,
  });
  await expect(page.locator('.scenario-title h1')).toContainText('The eve of Guandu');
  await page.reload();
  expect((await savedCampaign(page)).scenarioId).toBe('guandu-200');
  await expect(page.locator('.scenario-title h1')).toContainText('The eve of Guandu');
});

test('rival cities are foggy until scouted, and the adviser speaks up', async ({ page }) => {
  await startCampaign(page);
  const state = createGame('cao', 21);
  state.cities.find((c) => c.id === 'puyang')!.food = 120;
  await importState(page, state);
  await expect(page.locator('.advisor')).toContainText('Puyang');
  await expect(page.locator('.advisor')).toContainText('Issue three city orders');
  await chooseCity(page, 'Luoyang');
  await expect(page.getByTestId('fog-notice')).toBeVisible();
  await expect(page.locator('.city-resources')).toContainText('–');
  await chooseCity(page, 'Chenliu');
  await page.getByRole('button', { name: 'Select Cao Cao', exact: true }).click();
  await page.getByRole('tab', { name: 'Diplomacy' }).click();
  await page.getByLabel('Diplomatic target').selectOption('luoyang');
  await page.getByRole('button', { name: /^Reconnaissance/ }).click();
  await chooseCity(page, 'Luoyang');
  await expect(page.getByTestId('fog-notice')).toHaveCount(0);
  expect((await savedCampaign(page)).scouted.luoyang).toBe(0);
});

test('officer traits are shown with a tooltip and persuasion lists its odds', async ({ page }) => {
  await startCampaign(page);
  await importState(page, createGame('cao', 5));
  await chooseCity(page, 'Chenliu');
  await page.getByRole('button', { name: 'Select Xiahou Dun', exact: true }).click();
  const chip = page.locator('.trait-chip').first();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('title', /.+/);
  await page.getByRole('button', { name: 'Select Cao Cao', exact: true }).click();
  await page.getByRole('tab', { name: 'Diplomacy' }).click();
  await expect(
    page.getByLabel('Diplomatic target').locator('option', { hasText: '%' }).first(),
  ).toBeAttached();
});

test('a battle keeps the map above 30 frames per second', async ({ page }) => {
  await startCampaign(page);
  await importState(page, engagedBattle());
  await expect(page.getByTestId('weather-forecast')).toContainText('Tomorrow');
  await expect(page.locator('canvas').first()).toBeVisible();
  // Let the first paint and the lazy chunks settle, then sample three seconds of frames.
  await page.waitForTimeout(1000);
  const intervals = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        const tick = (now: number) => {
          times.push(now);
          if (now - times[0]! < 3000) requestAnimationFrame(tick);
          else resolve(times.slice(1).map((t, i) => t - times[i]!));
        };
        requestAnimationFrame(tick);
      }),
  );
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)]!;
  const slow = intervals.filter((ms) => ms > 1000 / 30 + 5).length / intervals.length;
  console.info(`battle frame median ${median.toFixed(1)} ms, ${(slow * 100).toFixed(1)}% slow`);
  expect(median).toBeLessThanOrEqual(1000 / 30);
  expect(slow).toBeLessThan(0.1);
});
