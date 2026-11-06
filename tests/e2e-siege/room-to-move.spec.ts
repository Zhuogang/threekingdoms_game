import { expect, test, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { siegeText, type SiegeLocale } from '../../src/siege/i18n';
import type { SiegeState } from '../../src/siege/rules/types';
import {
  clickCell,
  closeReport,
  endDay,
  expectNoPanelScroll,
  loadFixture,
  selectActor,
  snapshot,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });
async function battle(page: Page, state: SiegeState, locale: SiegeLocale) {
  await loadFixture(
    page,
    {
      state,
      playerSide: 'shu',
      phase: 'battle',
      facings: {},
      presentation: {
        openingStep: 6,
        bannersSeen: [1, 2],
        reportReadDay: state.day,
        dismissedHints: ['wall', 'trench', 'ladder', 'frontage', 'innerWall'],
        walkthrough: { status: 'skipped', step: 1, startDay: 1, logStart: 0 },
      },
    },
    locale,
  );
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
  await page.waitForLoadState('networkidle');
}
async function move(page: Page, id: string, cell: string) {
  await selectActor(page, id);
  await page.getByTestId('command-move').click();
  await clickCell(page, 'reachable', cell);
  await selectActor(page, id); // Inspect even if the queue advanced after a move with no action.
  await expectNoPanelScroll(page, 'action-panel');
}
function fixture() {
  const state = createSiegeState(228);
  const unit = state.units.find((u) => u.id === 'shu-weiyan')!;
  Object.assign(unit, { x: 6, y: 7, level: 'wall' });
  state.units = [unit];
  state.engines = [];
  return { state, unit };
}
for (const locale of ['zh', 'en'] as const) {
  test(`${locale}: descend from the west ladder, open from inside, and walk through the gate`, async ({
    page,
  }) => {
    const { state, unit } = fixture();
    state.engines = [{ ...createSiegeState(228).engines[0]!, raisedAt: { x: 6, y: 7 } }];
    const outside = {
      ...unit,
      id: 'shu-wangping',
      officer: createSiegeState(228).units.find((u) => u.id === 'shu-wangping')!.officer,
      x: 8,
      y: 8,
      level: 'ground' as const,
    };
    state.units.push(outside, {
      ...createSiegeState(228).units.find((u) => u.id === 'wei-haozhao')!,
      x: 12,
      y: 2,
      level: 'wall',
      moved: true,
      acted: true,
    });
    await battle(page, state, locale);
    await selectActor(page, unit.id);
    await expect(page.getByTestId('action-context')).toHaveText(
      siegeText(locale, 'nextGate', { n: 2 }),
    );
    await expect(page.getByTestId('climb-base-label')).toHaveText(siegeText(locale, 'openGate'));
    await expect(page.locator('[data-overlay="tutorial"][data-cell="8,7,wall"]')).toBeVisible();
    await move(page, unit.id, '7,6,ground');
    expect((await snapshot(page)).state.units[0]).toMatchObject({ x: 7, y: 6, level: 'ground' });
    await expect(page.getByTestId('action-context')).toHaveText(
      siegeText(locale, 'nextTomorrowMoved', { plan: siegeText(locale, 'nextGate', { n: 1 }) }),
    );
    await expect(page.getByTestId('climb-base-label')).toHaveCount(0);
    await endDay(page);
    await closeReport(page);
    await move(page, unit.id, '8,6,ground');
    await expect(page.getByTestId('action-context')).toHaveText(siegeText(locale, 'nextOpenNow'));
    const open = page.getByTestId('command-openGate');
    await expect(open).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByTestId('action-panel').getByRole('button').first()).toHaveAttribute(
      'data-testid',
      'command-move',
    );
    await open.click();
    await selectActor(page, unit.id);
    expect((await snapshot(page)).state.gates.south).toMatchObject({
      opened: true,
      broken: true,
      durability: 0,
    });
    await expect(page.getByTestId('action-context')).toContainText(
      locale === 'zh' ? '城门已开' : 'The gate is open.',
    );
    await expectNoPanelScroll(page, 'action-panel');
    await move(page, outside.id, '9,6,ground');
    expect((await snapshot(page)).state.units.find((u) => u.id === outside.id)).toMatchObject({
      x: 9,
      y: 6,
      level: 'ground',
    });
  });

  test(`${locale}: wall infantry attacks the defender directly below inside`, async ({ page }) => {
    const { state, unit } = fixture();
    unit.x = 7;
    const enemy = {
      ...createSiegeState(228).units.find((u) => u.id === 'wei-wangsheng')!,
      x: 7,
      y: 6,
      level: 'ground' as const,
    };
    state.units.push(enemy);
    await battle(page, state, locale);
    await selectActor(page, unit.id);
    await page.getByTestId('command-attack').click();
    await expectNoPanelScroll(page, 'attack-forecast');
    await page.getByTestId('attack-confirm').click();
    expect((await snapshot(page)).state.units.find((u) => u.id === enemy.id)!.troops).toBeLessThan(
      enemy.troops,
    );
    await selectActor(page, unit.id);
    await expectNoPanelScroll(page, 'action-panel');
  });

  test(`${locale}: middle infantry passes an ally on the walkway, then Move clicks swap`, async ({
    page,
  }) => {
    const { state, unit } = fixture();
    const left = { ...unit, id: 'shu-wangping', x: 5 };
    const right = { ...unit, id: 'shu-liaohua', x: 7 };
    const swapper = { ...unit, id: 'shu-jiangwei', x: 8 };
    state.units.push(left, right, swapper);
    await battle(page, state, locale);
    await move(page, unit.id, '9,7,wall');
    expect((await snapshot(page)).state.units[0]).toMatchObject({ x: 9, y: 7, moved: true });
    // Two fresh allies can swap even though ordinary movement cannot stop on either.
    await selectActor(page, swapper.id);
    await page.getByTestId('command-move').click();
    await expect(page.locator('[data-overlay="swap"][data-cell="7,7,wall"]')).toHaveAttribute(
      'stroke',
      '#518bc4',
    );
    await clickCell(page, 'swap', '7,7,wall');
    const after = (await snapshot(page)).state;
    expect(after.units.find((u) => u.id === swapper.id)).toMatchObject({ x: 7, moved: true });
    expect(after.units.find((u) => u.id === right.id)).toMatchObject({ x: 8, moved: true });
    await expectNoPanelScroll(page, 'action-panel');
  });

  test(`${locale}: a follower climbs as the ally makes way, and attacks on arrival`, async ({
    page,
  }) => {
    const { state, unit } = fixture();
    unit.x = 7;
    const follower = { ...unit, id: 'shu-wangping', x: 7, y: 10, level: 'ground' as const };
    const enemy = {
      ...createSiegeState(228).units.find((u) => u.id === 'wei-wangsheng')!,
      x: 7,
      y: 6,
      level: 'ground' as const,
    };
    state.units.push(follower, enemy);
    state.engines = [{ ...createSiegeState(228).engines[0]!, x: 7, raisedAt: { x: 7, y: 7 } }];
    state.footholds['7,7'] = 3;
    await battle(page, state, locale);
    await selectActor(page, follower.id);
    await expect(page.getByTestId('action-context')).toHaveText(
      siegeText(locale, 'climbMakeWay', {
        name: locale === 'zh' ? unit.officer.chinese : unit.officer.name,
      }),
    );
    await page.getByTestId('command-climb').click();
    await expect(page.getByTestId('climb-forecast')).toHaveCount(0);
    let after = (await snapshot(page)).state;
    expect(after.units[0]).toMatchObject({ x: 8, y: 7, moved: true, acted: false });
    expect(after.units[1]).toMatchObject({
      x: 7,
      y: 7,
      level: 'wall',
      moved: true,
      acted: false,
    });
    expect(after.log.filter((e) => e.code === 'allyMadeWay')).toHaveLength(1);
    await expectNoPanelScroll(page, 'action-panel');
    await page.getByTestId('command-attack').click();
    await expectNoPanelScroll(page, 'attack-forecast');
    await page.getByTestId('attack-confirm').click();
    after = (await snapshot(page)).state;
    expect(after.units[2]!.troops).toBeLessThan(enemy.troops);
    await selectActor(page, follower.id);
    await expectNoPanelScroll(page, 'action-panel');
  });
}
