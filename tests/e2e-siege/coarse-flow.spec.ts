import { expect, test, type Page } from '@playwright/test';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { createSiegeState } from '../../src/siege/rules/state';
import { actorTargets, siegeCommands, standBy } from '../../src/siege/ui/commands';
import { nextActor } from '../../src/siege/ui/actorTodo';
import { HINT_KINDS } from '../../src/siege/save';
import { COUNTER_KINDS } from '../../src/siege/ui/counters';
import type { SiegeSide, SiegeState } from '../../src/siege/rules/types';
import {
  cellPoint,
  begin,
  clickPlate,
  expectNoPanelScroll,
  loadFixture,
  panToCell,
  selectActor,
  snapshot,
  start,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });
async function battle(page: Page, state: SiegeState, side: SiegeSide = 'shu') {
  await loadFixture(
    page,
    {
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
    },
    'zh',
  );
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
}
async function iconClick(page: Page, id: string, kind = 'attack') {
  const icon = page.locator(`[data-target-id="${id}"][data-target-command="${kind}"]`);
  const mapPoint = await icon.evaluate((el) => {
    const svg = (el as SVGGraphicsElement).ownerSVGElement!;
    const screen = new DOMPoint(10, 10).matrixTransform((el as SVGGElement).getScreenCTM()!);
    return screen.matrixTransform(svg.getScreenCTM()!.inverse()).toJSON();
  });
  const mini = (await page.locator('.siege-minimap').boundingBox())!;
  await page.mouse.click(
    mini.x + (mapPoint.x / 3072) * mini.width,
    mini.y + (mapPoint.y / 1536) * mini.height,
  );
  const point = await icon.evaluate((el) => {
    const p = new DOMPoint(10, 10).matrixTransform((el as SVGGElement).getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(point.x, point.y);
}
for (const side of ['shu', 'wei'] as const) {
  test(`${side}: finishing selects the next executable actor and reveals it; Tab and Next include move-only actors`, async ({
    page,
  }) => {
    const state = createSiegeState(228);
    const own = state.units
      .filter((u) => u.side === side)
      .slice(side === 'shu' ? 1 : 0, side === 'shu' ? 3 : 2);
    Object.assign(own[0]!, { x: 5, y: side === 'shu' ? 10 : 7 });
    Object.assign(own[1]!, { x: 11, y: side === 'shu' ? 10 : 7 });
    state.units = state.units.filter((u) => u.side !== side || own.includes(u));
    state.engines = [];
    await battle(page, state, side);
    await selectActor(page, own[0]!.id);
    await page.getByRole('button', { name: '100%', exact: true }).click();
    await panToCell(page, own[0]!);
    const before = await page.getByTestId('siege-map').getAttribute('viewBox');
    const expected = nextActor(standBy(state, own[0]!.id, side), own[0]!.id, side)!;
    await page.getByTestId('command-standby').click();
    await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', expected.id);
    await expect(page.getByTestId('siege-map')).not.toHaveAttribute('viewBox', before!);
    const comfortablyInside = await page.getByTestId('siege-map').evaluate(
      (svg, p) => {
        const [x, y, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [
          number,
          number,
          number,
          number,
        ];
        const at = window.__siegeGeometry!.anchor(p);
        return (
          at[0] > x + w * 0.12 &&
          at[0] < x + w * 0.88 &&
          at[1] > y + h * 0.12 &&
          at[1] < y + h * 0.88
        );
      },
      { ...expected, level: 'level' in expected ? expected.level : 'ground' },
    );
    expect(comfortablyInside).toBe(true);
    await expectNoPanelScroll(page, 'action-panel');
  });
}

test('a nearby next actor keeps the camera; a move that leaves an action keeps selection; arming and cancellation never auto-select', async ({
  page,
}) => {
  const state = createSiegeState(228),
    first = state.units[1]!,
    second = state.units[3]!;
  Object.assign(first, { x: 5, y: 10 });
  Object.assign(second, { x: 7, y: 10 });
  state.units = state.units.filter((u) => u.side === 'wei' || [first, second].includes(u));
  state.engines = [state.engines[0]!];
  await battle(page, state);
  await selectActor(page, first.id);
  await panToCell(page, { x: 6, y: 10, level: 'ground' });
  const before = await snapshot(page);
  // Playwright's locator click waits for aria-disabled to clear. A real mouse
  // click still reaches the explanatory handler, as in climb-guide.spec.ts.
  const grey = (await page.getByTestId('command-climb').boundingBox())!;
  await page.mouse.click(grey.x + grey.width / 2, grey.y + grey.height / 2);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', first.id);
  expect((await snapshot(page)).state).toEqual(before.state);
  await page.getByTestId('command-move').click();
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', first.id);
  const p = await cellPoint(page, { x: 6, y: 10, level: 'ground' });
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', first.id);
  // The camera follows a move by design, so what's under test starts after it settles.
  await page.waitForTimeout(500);
  const camera = await page.getByTestId('siege-map').getAttribute('viewBox');
  await page.getByTestId('command-standby').click();
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', second.id);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('viewBox', camera!);
});

for (const method of ['icon', 'plate'] as const)
  test(`${method}: one click opens a forecast without arming Attack; one confirms`, async ({
    page,
  }) => {
    const state = createSiegeState(228),
      shu = state.units[1]!,
      wei = state.units[12]!;
    Object.assign(shu, { x: 6, y: 10 });
    Object.assign(wei, { x: 6, y: 7 });
    state.units = [shu, wei];
    state.engines = [{ ...state.engines[0]!, raisedAt: { x: 6, y: 7 } }];
    await battle(page, state);
    await selectActor(page, shu.id);
    const targets = actorTargets(state, shu.id, 'shu');
    await expect(page.locator('[data-target-icon]')).toHaveCount(targets.length);
    await expect(page.getByTestId('command-attack')).toHaveAttribute('aria-disabled', 'false');
    if (method === 'icon') await iconClick(page, wei.id);
    else await clickPlate(page, wei.id);
    await expect(page.getByTestId('attack-forecast')).toBeVisible();
    expect((await snapshot(page)).state).toEqual(state);
    await expectNoPanelScroll(page, 'attack-forecast');
    await page
      .getByTestId('attack-forecast')
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', shu.id);
    await iconClick(page, wei.id);
    await page.getByTestId('attack-confirm').click();
    const after = (await snapshot(page)).state;
    expect(after.units.find((u) => u.id === shu.id)!.acted).toBe(true);
    expect(after.log.length).toBeGreaterThan(state.log.length);
  });

test('ram icon forecasts the real gate damage before confirmation', async ({ page }) => {
  const state = createSiegeState(228),
    ram = state.engines.find((e) => e.kind === 'ram')!;
  Object.assign(ram, { x: 8, y: 8 });
  state.engines = [ram];
  await battle(page, state);
  await selectActor(page, ram.id);
  await iconClick(page, 'south', 'ram');
  await expect(page.getByTestId('attack-forecast')).toContainText(`800 → ${800 - T.ramDamage}`);
  expect((await snapshot(page)).state.gates.south.durability).toBe(800);
  await page.getByTestId('attack-confirm').click();
  expect((await snapshot(page)).state.gates.south.durability).toBe(800 - T.ramDamage);
});

test('fixed command slots survive changed availability and fit 1280×720', async ({ page }) => {
  const state = createSiegeState(228),
    unit = state.units[1]!;
  Object.assign(unit, { x: 5, y: 10 });
  await battle(page, state);
  await selectActor(page, unit.id);
  const slots = () =>
    page
      .getByTestId('action-panel')
      .locator('[data-command-slot]')
      .evaluateAll((els) =>
        els.map((el) => ({
          slot: el.getAttribute('data-command-slot'),
          command: el.querySelector('button')!.getAttribute('data-testid'),
        })),
      );
  const before = await slots();
  await expectNoPanelScroll(page, 'action-panel');
  await page.getByTestId('command-standby').click();
  await selectActor(page, unit.id);
  expect(await slots()).toEqual(before);
  await expectNoPanelScroll(page, 'action-panel');
  expect(before.map((s) => s.command)).toEqual(
    siegeCommands(state, unit.id).map((c) => `command-${c.kind}`),
  );
});

for (const locale of ['zh', 'en'] as const)
  test(`${locale}: the ten-command infantry card leaves room with walkthrough and grey explanation`, async ({
    page,
  }) => {
    await start(page, locale);
    await begin(page, locale);
    await selectActor(page, 'shu-weiyan');
    await expect(page.getByTestId('walkthrough')).toBeVisible();
    await page.getByTestId('command-climb').hover();
    await expect(page.getByTestId('action-reason')).not.toBeEmpty();
    await expect(page.locator('[data-command-slot]')).toHaveCount(10);
    await expectNoPanelScroll(page, 'action-panel');
    const spare = await page
      .getByTestId('sidebar-content')
      .evaluate(
        (el) =>
          el.clientHeight -
          (el.lastElementChild!.getBoundingClientRect().bottom - el.getBoundingClientRect().top),
      );
    expect(spare).toBeGreaterThanOrEqual(24);
  });

test('no actions calmly emphasizes End day, reports moves, and Tab/Next still reach move-only actors', async ({
  page,
}) => {
  const state = createSiegeState(228),
    first = state.units[1]!,
    second = state.units[3]!;
  Object.assign(first, { x: 4, y: 11 });
  Object.assign(second, { x: 12, y: 11 });
  state.units = state.units.filter((u) => u.side === 'wei' || [first, second].includes(u));
  state.engines = [];
  await battle(page, state);
  await selectActor(page, first.id);
  await expect(page.getByTestId('next-actor')).toHaveText('下一队 (0)');
  await expect(page.getByTestId('army-done')).toContainText('仍有 2 队可移动');
  await expect(page.getByTestId('end-day')).toHaveAttribute('data-actions-done', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', second.id);
  await page.getByTestId('next-actor').click();
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', first.id);
  expect((await snapshot(page)).state.day).toBe(1);
});

for (const y of [8, 9])
  test(`walk onto bridge wreck (8,${y}); the unit stays in front and the wreck cannot take selection`, async ({
    page,
  }) => {
    const state = createSiegeState(228),
      unit = state.units[1]!;
    Object.assign(unit, { x: 8, y: 10 });
    state.units = state.units.filter((u) => u.id === unit.id || u.side === 'wei');
    state.engines = [
      { ...state.engines.find((e) => e.kind === 'ram')!, x: 8, y, wrecked: true, durability: 0 },
    ];
    await battle(page, state);
    await selectActor(page, unit.id);
    await page.getByTestId('command-move').click();
    await panToCell(page, { x: 8, y, level: 'ground' });
    const p = await cellPoint(page, { x: 8, y, level: 'ground' });
    await page.mouse.click(p.x, p.y);
    expect((await snapshot(page)).state.units.find((u) => u.id === unit.id)).toMatchObject({
      x: 8,
      y,
    });
    await clickPlate(page, unit.id);
    await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', unit.id);
    const again = await cellPoint(page, { x: 8, y, level: 'ground' });
    await page.mouse.click(again.x, again.y);
    await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', unit.id);
    expect(
      await page.getByTestId('siege-map').evaluate((svg, id) => {
        const unit = svg.querySelector(`[data-unit="${id}"]`)!;
        return [...svg.querySelectorAll('[data-piece="starting-ram-3"]')].every((wreck) =>
          Boolean(wreck.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING),
        );
      }, unit.id),
    ).toBe(true);
  });

test('hover line clears on leave and minimap remains visible at every zoom', async ({ page }) => {
  const state = createSiegeState(228);
  await battle(page, state);
  for (const zoom of [50, 75, 100, 150]) {
    await page.getByRole('button', { name: `${zoom}%`, exact: true }).click();
    const p = { x: 6, y: 7, level: 'wall' as const };
    await panToCell(page, p);
    const point = await cellPoint(page, p);
    await page.mouse.move(point.x, point.y);
    await expect(page.getByTestId('hover-line')).toContainText('高度 3');
    const mini = (await page.locator('.siege-minimap').boundingBox())!;
    const line = (await page.getByTestId('hover-line').boundingBox())!;
    expect(mini.y + mini.height).toBeLessThanOrEqual(line.y);
    expect(mini.width).toBeGreaterThan(0);
    await page.mouse.move(1, 1);
    await expect(page.getByTestId('hover-line')).toBeEmpty();
  }
});
