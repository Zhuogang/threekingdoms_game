import { expect, test, type Page } from '@playwright/test';
import { applySiegeAction } from '../../src/siege/rules/actions';
import { createSiegeState } from '../../src/siege/rules/state';
import type { SiegePosition, SiegeSide, SiegeState } from '../../src/siege/rules/types';
import { HINT_KINDS } from '../../src/siege/save';
import { actorTodo, nextActor } from '../../src/siege/ui/actorTodo';
import { COUNTER_KINDS } from '../../src/siege/ui/counters';
import {
  cellPoint,
  clickPlate,
  closeReport,
  loadFixture,
  panToCell,
  selectActor,
  snapshot,
  waitForCamera,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });

async function battle(page: Page, state: SiegeState, side: SiegeSide = 'shu') {
  await loadFixture(page, {
    state,
    phase: 'battle',
    playerSide: side,
    facings: {},
    presentation: {
      openingStep: 6,
      bannersSeen: [1, 2],
      reportReadDay: state.day,
      attackerTurnDay: state.day,
      dismissedHints: [...HINT_KINDS],
      dismissedCounters: [...COUNTER_KINDS],
      walkthrough: { status: 'skipped', step: 1, startDay: 1, logStart: 0 },
    },
  });
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
}
function pair(side: SiegeSide = 'shu', nearby = false) {
  const state = createSiegeState(228);
  const own = state.units.filter((u) => u.side === side);
  const actor = own[side === 'shu' ? 1 : 0]!,
    other = own[side === 'shu' ? 2 : 1]!;
  Object.assign(actor, { x: 5, y: side === 'shu' ? 10 : 7 });
  Object.assign(other, { x: nearby ? 6 : 11, y: actor.y });
  state.units = [actor, other, ...state.units.filter((u) => u.side !== side)];
  state.engines = [];
  return { state, actor, other };
}
async function frameActor(page: Page, actor: SiegePosition & { id: string }) {
  await selectActor(page, actor.id);
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await panToCell(page, actor);
  await waitForCamera(page);
}
async function camera(page: Page) {
  return (await page.getByTestId('siege-map').getAttribute('viewBox'))!;
}
async function offscreen(page: Page, target: SiegePosition) {
  return page.getByTestId('siege-map').evaluate((svg, target) => {
    const [x, y, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const at = window.__siegeGeometry!.anchor(target);
    return at[0] < x || at[0] > x + w || at[1] < y || at[1] > y + h;
  }, target);
}
/** Check the formation and its nameplate, the same bounds reveal uses, with 12% margins. */
async function comfortablyInside(page: Page, id: string) {
  return page.getByTestId('siege-map').evaluate(async (svg, id) => {
    const modulePath = '/src/siege/render/stateArt.ts';
    const { unitVisual } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof import('../../src/siege/render/stateArt');
    const game = window.__siegeDev!.snapshot();
    const unit = game.state.units.find((u) => u.id === id);
    const engine = game.state.engines.find((e) => e.id === id);
    let bounds: readonly number[];
    if (unit) {
      const visual = unitVisual(game.state, unit, game.facings[id]);
      const plate = svg.querySelector<SVGGElement>(`[data-nameplate="${id}"]`)!;
      const matrix = (svg as SVGSVGElement)
        .getScreenCTM()!
        .inverse()
        .multiply(plate.getScreenCTM()!);
      const at = new DOMPoint(0, 0).matrixTransform(matrix);
      bounds = [
        Math.min(visual.rect[0], at.x),
        Math.min(visual.rect[1], at.y),
        Math.max(visual.rect[2], at.x + 92),
        Math.max(visual.rect[3], at.y + 26),
      ];
    } else {
      const at = window.__siegeGeometry!.anchor({ ...engine!, level: 'ground' });
      bounds = [at[0] - 48, at[1] - 80, at[0] + 48, at[1] + 20];
    }
    const [x, y, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    return (
      bounds[0]! >= x + w * 0.12 &&
      bounds[2]! <= x + w * 0.88 &&
      bounds[1]! >= y + h * 0.12 &&
      bounds[3]! <= y + h * 0.88
    );
  }, id);
}
async function unchanged(page: Page, before: string, selected?: string) {
  const map = page.getByTestId('siege-map');
  expect(await camera(page)).toBe(before);
  if (selected !== undefined) await expect(map).toHaveAttribute('data-selected', selected);
  await page.waitForTimeout(500);
  expect(await camera(page)).toBe(before);
  if (selected !== undefined) await expect(map).toHaveAttribute('data-selected', selected);
}
async function revealed(page: Page, id: string, before: string) {
  await waitForCamera(page);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', id);
  expect(await camera(page)).not.toBe(before);
  expect(await comfortablyInside(page, id)).toBe(true);
  const after = await camera(page);
  await unchanged(page, after, id);
  expect(await comfortablyInside(page, id)).toBe(true);
}
function attackState(lethal = false) {
  const { state, actor, other } = pair();
  const target = state.units.find((u) => u.side === 'wei')!;
  Object.assign(actor, { moved: true, troops: lethal ? 100 : 5000, morale: lethal ? 20 : 60 });
  Object.assign(target, {
    x: 6,
    y: 10,
    level: 'ground',
    troops: lethal ? 5000 : 3000,
    morale: lethal ? 100 : 20,
  });
  state.units = [actor, other, target];
  const action = { type: 'attack' as const, unitId: actor.id, targetId: target.id };
  const result = applySiegeAction(state, action);
  if (!result.ok) throw new Error(result.reason);
  expect(result.state.outcome).toBeNull();
  return { state, actor, other, target, result };
}

test('an attack keeps its attacker and camera after the strike clears; explicit Next reveals the off-screen actor', async ({
  page,
}) => {
  const { state, actor, other, target, result } = attackState();
  expect(nextActor(result.state, actor.id, 'shu')!.id).toBe(other.id);
  expect(result.state.units.find((u) => u.id === actor.id)!.troops).toBeGreaterThan(0);
  await battle(page, state);
  await frameActor(page, actor);
  await clickPlate(page, target.id);
  await waitForCamera(page);
  // Every other friendly actor is off-screen; automatic advance would have to pan.
  expect(await offscreen(page, other)).toBe(true);
  const before = await camera(page);
  await page.getByTestId('attack-confirm').click();
  await expect(page.getByTestId('strike-result').first()).toBeVisible();
  await expect(page.getByTestId('strike-result')).toHaveCount(0);
  await unchanged(page, before, actor.id);
  await page.getByTestId('next-actor').click();
  await revealed(page, other.id, before);
});

test('a non-strike action with actorTodo none keeps selection and camera', async ({ page }) => {
  const { state, actor, other } = pair();
  const ladder = { ...createSiegeState(228).engines[0]!, x: 6, y: 10 };
  state.engines = [ladder];
  state.units = state.units.filter((u) => u.id !== actor.id);
  const result = applySiegeAction(state, { type: 'raiseLadder', engineId: ladder.id });
  if (!result.ok) throw new Error(result.reason);
  expect(actorTodo(result.state, ladder.id, 'shu')).toBe('none');
  await battle(page, state);
  await frameActor(page, { ...ladder, level: 'ground' });
  expect(await offscreen(page, other)).toBe(true);
  const before = await camera(page);
  await page.getByTestId('command-raiseLadder').click();
  expect(actorTodo((await snapshot(page)).state, ladder.id, 'shu')).toBe('none');
  await expect(page.getByTestId('strike-result')).toHaveCount(0);
  await unchanged(page, before, ladder.id);
});

for (const side of ['shu', 'wei'] as const)
  test(`${side}: Stand by marks the actor and keeps selection and camera`, async ({ page }) => {
    const { state, actor, other } = pair(side);
    await battle(page, state, side);
    await frameActor(page, actor);
    expect(await offscreen(page, other)).toBe(true);
    const before = await camera(page);
    await page.getByTestId('command-standby').click();
    expect((await snapshot(page)).state.units.find((u) => u.id === actor.id)).toMatchObject({
      acted: true,
      moved: true,
    });
    await unchanged(page, before, actor.id);
  });

test('a move keeps selection and camera', async ({ page }) => {
  const { state, actor, other } = pair();
  await battle(page, state);
  await frameActor(page, actor);
  expect(await offscreen(page, other)).toBe(true);
  const before = await camera(page);
  await page.getByTestId('command-move').click();
  const point = await cellPoint(page, { x: 6, y: 10, level: 'ground' });
  await page.mouse.click(point.x, point.y);
  expect((await snapshot(page)).state.units.find((u) => u.id === actor.id)).toMatchObject({
    x: 6,
    y: 10,
    moved: true,
  });
  await unchanged(page, before, actor.id);
});

test('a full day through replay and closing the morning report keeps an unusual camera and the same map node', async ({
  page,
}) => {
  const state = createSiegeState(228);
  await battle(page, state);
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await panToCell(page, { x: 1, y: 1, level: 'ground' });
  await waitForCamera(page);
  expect(await offscreen(page, state.units[1]!)).toBe(true);
  const before = await camera(page);
  const original = await page.getByTestId('siege-map').elementHandle();
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('replay-skip')).toBeVisible();
  // Let the entire replay finish naturally; do not skip the frames or focus report items.
  await expect(page.getByTestId('morning-report')).toBeVisible({ timeout: 60000 });
  expect((await snapshot(page)).state.day).toBe(2);
  expect(await camera(page)).toBe(before);
  await closeReport(page);
  await unchanged(page, before);
  expect(
    await original!.evaluate((svg) => svg === document.querySelector('[data-testid="siege-map"]')),
  ).toBe(true);
  await original!.dispose();
});

for (const method of ['Next', 'Tab', 'roster'] as const)
  for (const nearby of [false, true])
    test(`${method}: an ${nearby ? 'already comfortably visible' : 'off-screen'} target ${nearby ? 'keeps' : 'moves'} the camera`, async ({
      page,
    }) => {
      const { state, actor, other } = pair('shu', nearby);
      expect(nextActor(state, actor.id, 'shu')!.id).toBe(other.id);
      await battle(page, state);
      await frameActor(page, actor);
      if (nearby) expect(await comfortablyInside(page, other.id)).toBe(true);
      else expect(await offscreen(page, other)).toBe(true);
      const before = await camera(page);
      if (method === 'Next') await page.getByTestId('next-actor').click();
      else if (method === 'Tab') await page.keyboard.press('Tab');
      else await selectActor(page, other.id);
      if (nearby) {
        await waitForCamera(page);
        await unchanged(page, before, other.id);
        expect(await comfortablyInside(page, other.id)).toBe(true);
      } else await revealed(page, other.id, before);
    });

for (const nearby of [false, true])
  test(`engine roster: an ${nearby ? 'already comfortably visible' : 'off-screen'} target ${nearby ? 'keeps' : 'moves'} the camera`, async ({
    page,
  }) => {
    const { state, actor } = pair();
    const ladder = { ...createSiegeState(228).engines[0]!, x: nearby ? 6 : 11, y: 10 };
    state.engines = [ladder];
    state.units = state.units.filter((u) => u.id === actor.id || u.side === 'wei');
    await battle(page, state);
    await frameActor(page, actor);
    if (nearby) expect(await comfortablyInside(page, ladder.id)).toBe(true);
    else expect(await offscreen(page, { ...ladder, level: 'ground' })).toBe(true);
    const before = await camera(page);
    await selectActor(page, ladder.id);
    if (nearby) {
      await unchanged(page, before, ladder.id);
      expect(await comfortablyInside(page, ladder.id)).toBe(true);
    } else await revealed(page, ladder.id, before);
  });

test('a counterattack kills the attacker with other actors alive: empty selection, rendered panel, no page errors or camera move', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { state, actor, other, target, result } = attackState(true);
  expect(result.state.units.find((u) => u.id === actor.id)!.troops).toBe(0);
  expect(actorTodo(result.state, other.id, 'shu')).not.toBe('none');
  await battle(page, state);
  await frameActor(page, actor);
  await clickPlate(page, target.id);
  await waitForCamera(page);
  expect(await offscreen(page, other)).toBe(true);
  const before = await camera(page);
  await page.getByTestId('attack-confirm').click();
  await expect(page.getByTestId('strike-result').first()).toBeVisible();
  await expect(page.getByTestId('strike-result')).toHaveCount(0);
  await unchanged(page, before, '');
  await expect(page.getByTestId('selected-actor')).toHaveCount(0);
  await expect(
    page.getByTestId('sidebar-content').getByText('Select a unit or engine', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('unit-list')).toBeVisible();
  expect((await snapshot(page)).state.units.find((u) => u.id === actor.id)!.troops).toBe(0);
  expect(errors).toEqual([]);
});
