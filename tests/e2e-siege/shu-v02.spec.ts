import { expect, test } from '@playwright/test';
import { siegeSaveKey } from '../../src/siege/save';
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
  selectActor,
  expectNoPanelScroll,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });
test('Shu start through day three: footholds, suppression, morning, cover, both forecasts, night assault and exact save', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const initial = createSiegeState(228);
  Object.assign(
    initial.units.find((u) => u.x === 6 && u.y === 7)!,
    { x: 5 },
  );
  await loadFixture(page, {
    state: initial,
    playerSide: 'shu',
    phase: 'deploy',
    facings: {},
    presentation: { openingStep: 6, bannersSeen: [], dismissedHints: [] },
  });
  await selectActor(page, 'shu-weiyan');
  await clickCell(page, 'deploy', '4,10,ground');
  await selectActor(page, 'shu-captain-3');
  await clickCell(page, 'deploy', '5,10,ground');
  await begin(page);
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '1');
  await expect(page.locator('[data-overlay="tutorial"]')).toHaveCount(2);
  await expectNoPanelScroll(page, 'action-panel');
  await shot(page, 'walk-1');
  let game = await snapshot(page);
  const ladders = game.state.engines.filter((e) => e.kind === 'ladder');
  await selectActor(page, ladders[0]!.id);
  await page.getByTestId('command-raiseLadder').click();
  await selectActor(page, ladders[1]!.id);
  await page.getByTestId('command-raiseLadder').click();
  await selectActor(page, 'shu-weiyan');
  await page.getByTestId('command-move').click();
  await clickCell(page, 'reachable', '6,10,ground');
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '4');
  await expect(page.locator('[data-overlay="tutorial"][data-cell="6,7,wall"]')).toHaveCount(1);
  await expectNoPanelScroll(page, 'action-panel');
  await shot(page, 'walk-4');
  await page.getByTestId('command-climb').click();
  await expectNoPanelScroll(page, 'climb-forecast');
  await page.getByTestId('climb-confirm').click();
  expect((await snapshot(page)).state.footholds['6,7']).toBe(T.climbFoothold);
  await selectActor(page, 'shu-captain-3');
  await page.getByTestId('command-move').click();
  await clickCell(page, 'reachable', '5,10,ground');
  const defender = (await snapshot(page)).state.units.find(
    (u) => u.side === 'wei' && u.x === 5 && u.y === 7,
  )!;
  await page.getByTestId('command-suppress').click();
  await expect(page.getByTestId('action-targets')).toContainText('cannot fire arrows');
  await expectNoPanelScroll(page, 'action-targets');
  await page.getByTestId(`target-suppress-${defender.id}`).click();
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '7');
  await endDay(page);
  await expect(page.getByTestId('siege-day')).toHaveText('Day 2');
  const report = page.getByTestId('morning-report');
  await expect(report).toBeVisible();
  expect(await report.getByTestId('report-item').count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId('counter-card')).toHaveCount(0);
  await expect(report).not.toContainText(/\d+,\d+/);
  await report.getByTestId('report-focus').first().click();
  await expect(report).toBeVisible();
  await expect(page.locator('[data-overlay="tutorial"]')).toHaveCount(1);
  await closeReport(page);
  await expect(page.getByTestId('counter-card')).toBeVisible();
  await expect(page.locator('.siege-map-notice .siege-hint')).toHaveCount(1);
  await dismissCounters(page);
  await page.getByTestId('report-open').click();
  await expect(report.getByTestId('report-item').first()).toContainText(/Wei/);
  await closeReport(page);
  await page.getByRole('tab', { name: 'Defence', exact: true }).click();
  await expect(page.getByTestId('defense-panel')).toContainText('Climbing pressure');
  await page.getByRole('tab', { name: 'Units & actions', exact: true }).click();
  await selectActor(page, 'shu-weiyan');
  game = await snapshot(page);
  const top = game.state.units.find(
    (u) => u.side === 'wei' && u.troops > 0 && u.level === 'wall' && u.x === 6 && u.y === 7,
  );
  if (top) {
    await page.getByTestId('command-attack').click();
    await selectActor(page, top.id);
    const normal = predictSiegeAttack(game.state, 'shu-weiyan', top.id)!,
      forced = predictSiegeAttack(game.state, 'shu-weiyan', top.id, { assault: true })!;
    await expect(page.getByTestId('forecast-normal-ownCasualties')).toHaveText(
      String(normal.counterattack.casualties),
    );
    await expect(page.getByTestId('forecast-assault-ownCasualties')).toHaveText(
      String(forced.counterattack.casualties),
    );
  } else {
    await page.getByTestId('command-climb').click();
    const normal = predictSiegeClimb(game.state, 'shu-weiyan')!,
      forced = predictSiegeClimb(game.state, 'shu-weiyan', { assault: true })!;
    await expect(page.getByTestId('forecast-normal-ownCasualties')).toHaveText(
      String(normal.casualties),
    );
    await expect(page.getByTestId('forecast-assault-ownCasualties')).toHaveText(
      String(forced.casualties),
    );
  }
  await page.getByTestId('assault-toggle').check();
  await expect(page.getByTestId('assault-toggle')).toBeChecked();
  await expect(page.getByTestId('forecast-assault-ownCasualties')).toHaveAttribute(
    'data-chosen',
    'true',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByTestId('command-coverEngine').click();
  await page.getByTestId(`target-coverEngine-${ladders[0]!.id}`).click();
  expect((await snapshot(page)).state.engines.find((e) => e.id === ladders[0]!.id)!.covered).toBe(
    true,
  );
  await expect(page.getByTestId('walkthrough')).toHaveCount(0);
  await selectActor(page, ladders[0]!.id);
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
    siegeSaveKey('shu'),
  );
  expect(stored).toEqual(before);
  await page.goto('/?lang=en#chencang/load');
  await expect(page.getByTestId('siege-day')).toHaveText('Day 3');
  expect(await snapshot(page)).toEqual(before);
  await expect(page.getByTestId('morning-report')).toHaveCount(0);
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByTestId('score-panel')).toContainText('Grain withdrawal');
  const parts = await page.getByTestId('score-panel').locator('dd').allTextContents();
  expect(parts.every((part) => /^\d+$/.test(part))).toBe(true);
  expect(errors).toEqual([]);
});

test('occupied-wall assault forecast and foothold blink use the same rule predictions', async ({
  page,
}) => {
  const state = createSiegeState(228);
  const ladder = state.engines[0]!;
  ladder.raisedAt = { x: 6, y: 7 };
  Object.assign(state.units[1]!, { x: 6, y: 10 });
  Object.assign(state.units[12]!, { x: 6, y: 7 });
  state.footholds['6,7'] = 1;
  await loadFixture(page, {
    state,
    playerSide: 'shu',
    phase: 'battle',
    facings: {},
    presentation: {
      openingStep: 6,
      bannersSeen: [1],
      dismissedHints: ['wall', 'trench', 'ladder', 'frontage', 'innerWall'],
      reportReadDay: 1,
    },
  });
  await selectActor(page, 'shu-weiyan');
  const defenderId = state.units[12]!.id;
  await expect(page.locator(`[data-covered-unit="${defenderId}"]`)).toHaveCount(1);
  for (const zoom of [0.5, 0.75, 1, 1.5]) {
    await page.getByRole('button', { name: 'South gate', exact: true }).click();
    await page.getByRole('button', { name: `${zoom * 100}%`, exact: true }).click();
    // The viewport helper caps zoom relative to full-map fit: at 1280x720, 150% lands on 134%.
    const reached = Number(await page.getByTestId('siege-map').getAttribute('data-zoom'));
    expect(reached).toBeGreaterThan(zoom * 0.85);
    expect(reached).toBeLessThanOrEqual(zoom + 0.01);
    await selectActor(page, 'shu-weiyan');
    await page.getByTestId('command-attack').click();
    await selectActor(page, defenderId);
    await expect(page.getByTestId('attack-forecast').locator('h4')).toHaveText(
      state.units[12]!.officer.name,
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await selectActor(page, 'shu-weiyan');
  await page.getByTestId('command-attack').click();
  await selectActor(page, defenderId);
  const normal = predictSiegeAttack(state, 'shu-weiyan', state.units[12]!.id)!,
    forced = predictSiegeAttack(state, 'shu-weiyan', state.units[12]!.id, { assault: true })!;
  for (const [testid, f] of [
    ['forecast-normal', normal],
    ['forecast-assault', forced],
  ] as const) {
    await expect(page.getByTestId(`${testid}-enemyCasualties`)).toHaveText(String(f.casualties));
    await expect(page.getByTestId(`${testid}-ownCasualties`)).toHaveText(
      String(f.counterattack.casualties),
    );
    await expect(page.getByTestId(`${testid}-footholdBeforeAfter`)).toContainText(
      `1 → ${f.footholdAfter}/${T.footholdComplete}`,
    );
  }
  await expectNoPanelScroll(page, 'attack-forecast');
  await expect(page.getByTestId('forecast-details')).not.toHaveAttribute('open', '');
  await page.getByTestId('forecast-details').locator('summary').click();
  await expect(page.getByTestId('forecast-details')).toContainText(
    `uphill attack ×${T.climbingAttackMultiplier}`,
  );
  await page.getByTestId('forecast-details').locator('summary').click();
  await page.getByTestId('assault-toggle').check();
  await page.getByTestId('attack-forecast').hover();
  await expect(page.locator('[data-foothold="6,7"] animate')).toHaveCount(T.footholdComplete);
});
