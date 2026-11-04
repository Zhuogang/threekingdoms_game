import { expect, test } from '@playwright/test';
import { SIEGE_SAVE_KEY } from '../../src/siege/save';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { predictSiegeAttack, predictSiegeClimb } from '../../src/siege/rules/combat';
import { createSiegeState } from '../../src/siege/rules/state';
import {
  begin,
  clickCell,
  closeReport,
  dismissCounters,
  endDay,
  loadFixture,
  shot,
  snapshot,
  start,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });
test('Shu start through day three: footholds, suppression, morning, cover, both forecasts, night assault and exact save', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await page.getByTestId('select-shu-weiyan').click();
  await clickCell(page, 'deploy', '18,21,ground');
  await page.getByTestId('select-shu-captain-3').click();
  await clickCell(page, 'deploy', '17,21,ground');
  await begin(page);
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '1');
  await shot(page, 'walk-1');
  let game = await snapshot(page);
  const ladders = game.state.engines.filter((e) => e.kind === 'ladder');
  await page.getByTestId(`select-${ladders[0]!.id}`).click();
  await page.getByTestId('command-raiseLadder').click();
  await page.getByTestId(`select-${ladders[1]!.id}`).click();
  await page.getByTestId('command-raiseLadder').click();
  await page.getByTestId('select-shu-weiyan').click();
  await page.getByTestId('command-move').click();
  await clickCell(page, 'reachable', '18,19,ground');
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '4');
  await shot(page, 'walk-4');
  await page.getByTestId('command-climb').click();
  await page.getByTestId('climb-confirm').click();
  expect((await snapshot(page)).state.footholds['18,16']).toBe(T.climbFoothold);
  await page.getByTestId('select-shu-captain-3').click();
  await page.getByTestId('command-move').click();
  await clickCell(page, 'reachable', '17,19,ground');
  const defender = (await snapshot(page)).state.units.find(
    (u) => u.side === 'wei' && u.x === 17 && u.y === 16,
  )!;
  await page.getByTestId('command-suppress').click();
  await expect(page.getByTestId('action-targets')).toContainText('cannot fire arrows');
  await page.getByTestId(`target-suppress-${defender.id}`).click();
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '7');
  await endDay(page);
  await expect(page.getByTestId('siege-day')).toHaveText('Day 2');
  const report = page.getByTestId('morning-report');
  await expect(report).toBeVisible();
  expect(await report.getByTestId('report-item').count()).toBeGreaterThanOrEqual(3);
  await shot(page, 'report');
  await closeReport(page);
  await expect(page.getByTestId('counter-card')).toBeVisible();
  await shot(page, 'counter-card');
  await dismissCounters(page);
  await page.getByTestId('report-open').click();
  await expect(report.getByTestId('report-item').first()).toContainText(/Wei/);
  await closeReport(page);
  await page.getByRole('tab', { name: 'Defence', exact: true }).click();
  await expect(page.getByTestId('defense-panel')).toContainText('Climbing pressure');
  await shot(page, 'defense-panel');
  await page.getByRole('tab', { name: 'Units & actions', exact: true }).click();
  await page.getByTestId('select-shu-weiyan').click();
  game = await snapshot(page);
  const top = game.state.units.find(
    (u) => u.side === 'wei' && u.troops > 0 && u.level === 'wall' && u.x === 18 && u.y === 16,
  );
  if (top) {
    await page.getByTestId(`select-${top.id}`).click();
    const normal = predictSiegeAttack(game.state, 'shu-weiyan', top.id)!,
      forced = predictSiegeAttack(game.state, 'shu-weiyan', top.id, { assault: true })!;
    await expect(page.getByTestId('forecast-normal')).toContainText(`frontage ${normal.frontage}`);
    await expect(page.getByTestId('forecast-assault')).toContainText(
      `Own casualties ${forced.counterattack.casualties}`,
    );
  } else {
    await page.getByTestId('command-climb').click();
    const normal = predictSiegeClimb(game.state, 'shu-weiyan')!,
      forced = predictSiegeClimb(game.state, 'shu-weiyan', { assault: true })!;
    await expect(page.getByTestId('forecast-normal')).toContainText(
      `Own casualties ${normal.casualties}`,
    );
    await expect(page.getByTestId('forecast-assault')).toContainText(
      `Own casualties ${forced.casualties}`,
    );
  }
  await page.getByTestId('assault-toggle').check();
  await expect(page.getByTestId('assault-toggle')).toBeChecked();
  await shot(page, 'assault-forecast');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByTestId('command-coverEngine').click();
  await page.getByTestId(`target-coverEngine-${ladders[0]!.id}`).click();
  expect((await snapshot(page)).state.engines.find((e) => e.id === ladders[0]!.id)!.covered).toBe(
    true,
  );
  await expect(page.getByTestId('walkthrough')).toHaveCount(0);
  await page.getByTestId(`select-${ladders[0]!.id}`).click();
  await expect(page.locator('.siege-sidebar')).toContainText('Covered');
  await page
    .locator('.siege-sidebar details')
    .filter({ has: page.locator('summary', { hasText: /^Order$/ }) })
    .locator('summary')
    .click();
  await expect(page.locator('.siege-sidebar')).toContainText('result is revealed in the morning');
  await page.getByTestId('order-nightAssault').click();
  expect((await snapshot(page)).state.nightOrders.shu?.kind).toBe('nightAssault');
  await endDay(page);
  await expect(page.getByTestId('siege-day')).toHaveText('Day 3');
  await expect(page.getByTestId('morning-report')).toContainText(/night assault|torches/);
  await closeReport(page);
  await dismissCounters(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const before = await snapshot(page);
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    SIEGE_SAVE_KEY,
  );
  expect(stored).toEqual(before);
  await page.goto('/?lang=en#chencang/load');
  await expect(page.getByTestId('siege-day')).toHaveText('Day 3');
  expect(await snapshot(page)).toEqual(before);
  await expect(page.getByTestId('morning-report')).toHaveCount(0);
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByTestId('score-panel')).toContainText('Grain withdrawal');
  await shot(page, 'score');
  expect(errors).toEqual([]);
});

test('occupied-wall assault forecast and foothold blink use the same rule predictions', async ({
  page,
}) => {
  const state = createSiegeState(228);
  const ladder = state.engines[0]!;
  ladder.raisedAt = { x: 18, y: 16 };
  Object.assign(state.units[1]!, { x: 18, y: 19 });
  Object.assign(state.units[12]!, { x: 18, y: 16 });
  state.footholds['18,16'] = 1;
  await loadFixture(page, {
    state,
    playerSide: 'shu',
    phase: 'battle',
    facings: {},
    presentation: { openingStep: 6, bannersSeen: [1], dismissedHints: [], reportReadDay: 1 },
  });
  await page.getByTestId('select-shu-weiyan').click();
  await page.getByTestId(`select-${state.units[12]!.id}`).click();
  const normal = predictSiegeAttack(state, 'shu-weiyan', state.units[12]!.id)!,
    forced = predictSiegeAttack(state, 'shu-weiyan', state.units[12]!.id, { assault: true })!;
  for (const [testid, f] of [
    ['forecast-normal', normal],
    ['forecast-assault', forced],
  ] as const) {
    await expect(page.getByTestId(testid)).toContainText(`frontage ${f.frontage}`);
    await expect(page.getByTestId(testid)).toContainText(`Enemy casualties ${f.casualties}`);
    await expect(page.getByTestId(testid)).toContainText(
      `Own casualties ${f.counterattack.casualties}`,
    );
    await expect(page.getByTestId(testid)).toContainText(
      `Foothold +${f.footholdGain} → ${f.footholdAfter}/${T.footholdComplete}`,
    );
  }
  await expect(page.getByTestId('attack-forecast')).toContainText(
    `uphill attack ×${T.climbingAttackMultiplier}`,
  );
  await page.getByTestId('assault-toggle').check();
  await page.getByTestId('attack-forecast').hover();
  await expect(page.locator('[data-foothold="18,16"] animate')).toHaveCount(T.footholdComplete);
  await shot(page, 'assault-forecast');
});
