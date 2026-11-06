import { expect, test } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { HINT_KINDS, type SiegeSave } from '../../src/siege/save';
import { COUNTER_KINDS } from '../../src/siege/ui/counters';
import { startWalkthrough } from '../../src/siege/ui/walkthrough';
import { loadFixture, selectActor, shot } from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });

function reviewFixture(): SiegeSave {
  const state = createSiegeState(228);
  state.day = 2;
  state.weather = 'clear';
  state.engines[0]!.raisedAt = { x: 6, y: 7 };
  Object.assign(state.units[1]!, { x: 6, y: 10 });
  Object.assign(state.units[12]!, { x: 6, y: 7 });
  state.footholds['6,7'] = 1;
  state.preparations.braziers['5,7'] = { litDay: 1 };
  state.preparations.millstones['8,7'] = { day: 1, hoisted: true };
  state.preparations.boulders['6,7'] = { day: 1 };
  state.log = [
    { day: 1, code: 'brazierPrepared', params: { cell: '5,7' } },
    { day: 1, code: 'millstonePrepared', params: { cell: '8,7' } },
    { day: 1, code: 'bouldersPrepared', params: { cell: '6,7' } },
  ];
  return {
    state,
    playerSide: 'shu',
    phase: 'battle',
    facings: {},
    presentation: {
      openingStep: 6,
      bannersSeen: [1],
      dismissedHints: [...HINT_KINDS],
      dismissedCounters: [...COUNTER_KINDS],
      reportReadDay: state.day,
    },
  };
}

// Each review artifact has its own short path. Behaviour assertions live in the
// playthrough/clarity specs, so a failure there cannot suppress these screenshots.
test('review screenshot: report', async ({ page }) => {
  const game = reviewFixture();
  game.presentation!.reportReadDay = 1;
  await loadFixture(page, game);
  await expect(page.getByTestId('morning-report')).toBeVisible();
  await shot(page, 'report');
});

test('review screenshot: counter-card', async ({ page }) => {
  const game = reviewFixture();
  game.presentation!.dismissedCounters = [];
  await loadFixture(page, game);
  await expect(page.getByTestId('counter-card')).toBeVisible();
  await shot(page, 'counter-card');
});

test('review screenshot: assault-forecast', async ({ page }) => {
  const game = reviewFixture();
  await loadFixture(page, game);
  await selectActor(page, 'shu-weiyan');
  const defender = game.state.units.find((u) => u.side === 'wei' && u.x === 6 && u.y === 7)!;
  await selectActor(page, defender.id);
  await page.getByTestId('assault-toggle').check();
  await shot(page, 'assault-forecast');
});

test('review screenshot: defense-panel', async ({ page }) => {
  await loadFixture(page, reviewFixture());
  await page.getByRole('tab', { name: 'Defence', exact: true }).click();
  await expect(page.getByTestId('defense-panel')).toBeVisible();
  await shot(page, 'defense-panel');
});

test('review screenshot: score', async ({ page }) => {
  const game = reviewFixture();
  Object.assign(game.state, { day: T.days, act: 2, grain: 0, outcome: 'historical' });
  game.presentation!.bannersSeen = [1, 2];
  await loadFixture(page, game);
  await expect(page.getByTestId('score-panel')).toBeVisible();
  await shot(page, 'score');
});

for (const locale of ['en', 'zh'] as const) {
  test(`review screenshot: actions-${locale}`, async ({ page }) => {
    const game = reviewFixture();
    game.presentation!.walkthrough = { ...startWalkthrough(game.state), step: 4 };
    await loadFixture(page, game, locale);
    await selectActor(page, 'shu-weiyan');
    await expect(page.getByTestId('action-panel')).toBeVisible();
    await shot(page, `actions-${locale}`);
  });
}
