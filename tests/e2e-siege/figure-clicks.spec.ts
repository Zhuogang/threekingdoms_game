import { expect, test, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import type { ScreenRect } from '../../src/siege/render/scene';
import { isMapCell } from '../../src/siege/rules/map';
import { usableEngine } from '../../src/siege/rules/combat';
import { actorTargets } from '../../src/siege/ui/commands';
import { engineBodyPoint } from './engine-body';
import type { SiegePosition, SiegeState } from '../../src/siege/rules/types';
import {
  cellPoint,
  clickPlate,
  closeReport,
  dismissCounters,
  loadFixture,
  panToCell,
  selectActor,
  snapshot,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });

async function battle(page: Page, state: SiegeState, emptySelection = false) {
  // With no Wei actors, loading the Wei seat gives a genuinely empty selection.
  // attackerTurnDay suppresses the automatic morning turn; the state is identical.
  await loadFixture(page, {
    state,
    playerSide: emptySelection ? 'wei' : 'shu',
    phase: 'battle',
    facings: {},
    presentation: {
      openingStep: 6,
      bannersSeen: [1, 2],
      reportReadDay: state.day,
      attackerTurnDay: state.day,
      dismissedHints: ['wall', 'trench', 'ladder', 'frontage', 'innerWall'],
      walkthrough: { status: 'skipped', step: 1, startDay: 1, logStart: 0 },
    },
  });
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
}
function fixture() {
  const state = createSiegeState(228);
  const ids = ['shu-weiyan', 'shu-wangping', 'shu-jiangwei', 'shu-wuyi', 'shu-liaohua'];
  state.units = ids.map((id) => state.units.find((u) => u.id === id)!);
  for (const [i, unit] of state.units.entries())
    Object.assign(
      unit,
      [
        { x: 6, y: 10 },
        { x: 10, y: 10 },
        { x: 12, y: 10, assaultedDay: state.day },
        { x: 4, y: 8 },
        { x: 14, y: 12 },
      ][i],
    );
  state.engines = [
    { ...state.engines[0]!, raisedAt: { x: 6, y: 7 } },
    { ...state.engines[1]!, raisedAt: { x: 10, y: 7 } },
    { ...state.engines[0]!, id: 'storm-ladder', x: 12, raisedAt: { x: 12, y: 7 } },
  ];
  state.footholds['6,7'] = 1;
  state.footholds['10,7'] = 2;
  state.mounds['4,8'] = 6;
  state.trenchFill['4,8'] = state.trenchFill['4,9'] = 3;
  return state;
}
/** Read the actual painted boxes, including the cropped storm sprite, from the game. */
async function figureVisual(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const path = '/src/siege/render/stateArt.ts';
    const { unitVisual } = (await import(path)) as typeof import('../../src/siege/render/stateArt');
    const game = window.__siegeDev!.snapshot(),
      unit = game.state.units.find((u) => u.id === id)!;
    const visual = unitVisual(game.state, unit, game.facings[id]);
    return { boxes: visual.figureRects, displaced: visual.displaced };
  }, id);
}
async function engineRect(page: Page, id: string): Promise<ScreenRect> {
  return page.evaluate(async (id) => {
    const path = '/src/siege/render/stateArt.ts';
    const { engineSprite } = (await import(
      path
    )) as typeof import('../../src/siege/render/stateArt');
    const game = window.__siegeDev!.snapshot();
    return engineSprite(
      game.state.engines.find((e) => e.id === id)!,
      game.facings[id],
    ).rect;
  }, id);
}
async function panToBox(page: Page, rect: ScreenRect) {
  const mini = (await page.locator('.siege-minimap').boundingBox())!;
  await page.mouse.click(
    mini.x + ((rect[0] + rect[2]) / 2 / 3072) * mini.width,
    mini.y + ((rect[1] + rect[3]) / 2 / 1536) * mini.height,
  );
}
async function clientBox(page: Page, rect: ScreenRect) {
  return page.getByTestId('siege-map').evaluate((svg, r) => {
    const matrix = (svg as SVGSVGElement).getScreenCTM()!,
      a = new DOMPoint(r[0], r[1]).matrixTransform(matrix),
      b = new DOMPoint(r[2], r[3]).matrixTransform(matrix);
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  }, rect);
}
async function centreOnScreen(page: Page, rect: ScreenRect) {
  await panToBox(page, rect);
  const r = await clientBox(page, rect),
    map = (await page.getByTestId('siege-map').boundingBox())!;
  const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  expect(point.x).toBeGreaterThan(map.x);
  expect(point.x).toBeLessThan(map.x + map.width);
  expect(point.y).toBeGreaterThan(map.y);
  expect(point.y).toBeLessThan(map.y + map.height);
  return point;
}
async function mouseCell(page: Page, cell: SiegePosition) {
  await panToCell(page, cell);
  const p = await cellPoint(page, cell);
  await page.mouse.click(p.x, p.y);
}

for (const emptySelection of [true, false])
  test(`each displaced figure selects its owner with ${emptySelection ? 'nothing' : 'another own actor'} selected`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const state = fixture();
    await battle(page, state, emptySelection);
    let checked = 0;
    for (const unit of state.units.slice(0, 4)) {
      const { boxes } = await figureVisual(page, unit.id);
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        if (emptySelection) {
          await page.reload();
          await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', '');
        } else await selectActor(page, 'shu-liaohua');
        const point = await centreOnScreen(page, box);
        await page.mouse.move(point.x, point.y);
        await expect(page.getByTestId('siege-map')).toHaveCSS('cursor', 'pointer');
        await expect(page.locator('[data-overlay="hover"]')).toHaveAttribute(
          'data-cell',
          `${unit.x},${unit.y},${unit.level}`,
        );
        await expect(page.getByTestId('hover-line')).toContainText(unit.officer.name);
        await page.mouse.click(point.x, point.y);
        await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', unit.id);
        await expect(page.locator('.siege-forecast')).toHaveCount(0);
        checked++;
      }
    }
    console.info(
      `Displaced fixture (${emptySelection ? 'empty' : 'own'} selection): ${checked} real figure clicks`,
    );
  });

test('a progress-2 upper climber selects itself; the enemy figure and plate forecast; armed attack hits the wall enemy', async ({
  page,
}) => {
  const state = fixture(),
    enemy = createSiegeState(228).units.find((u) => u.id === 'wei-wangsheng')!;
  Object.assign(enemy, { x: 10, y: 7 });
  state.units.push(enemy);
  await battle(page, state);
  const upper = (await figureVisual(page, 'shu-wangping')).boxes[1]!;
  await selectActor(page, 'shu-liaohua');
  let p = await centreOnScreen(page, upper);
  const under = await page.evaluate((p) => {
    const svg = document.querySelector<SVGSVGElement>('[data-testid="siege-map"]')!;
    const q = new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM()!.inverse());
    return window.__siegeGeometry!.positionAt(q.x, q.y);
  }, p);
  expect(under).toEqual({ x: 10, y: 7, level: 'wall' });
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', 'shu-wangping');
  await expect(page.locator('.siege-forecast')).toHaveCount(0);
  // Choose enemy figure pixels on its walkway, using the game's real boxes.
  const { boxes } = await figureVisual(page, enemy.id);
  const enemyPoint = await page.evaluate((boxes) => {
    const plane = window.__siegeGeometry!.hitRect({ x: 10, y: 7, level: 'wall' })!;
    for (const r of boxes)
      for (let dy = 0.1; dy < 1; dy += 0.1) {
        const x = (r[0] + r[2]) / 2,
          y = r[1] + (r[3] - r[1]) * dy;
        if (y >= plane[1] && y < plane[1] + 48) return [x, y] as [number, number];
      }
    throw new Error('Enemy has no figure pixels on its walkway');
  }, boxes);
  p = await centreOnScreen(page, [
    enemyPoint[0] - 1,
    enemyPoint[1] - 1,
    enemyPoint[0] + 1,
    enemyPoint[1] + 1,
  ]);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('attack-forecast')).toBeVisible();
  await expect(page.getByTestId('attack-forecast')).toContainText(enemy.officer.name);
  await selectActor(page, 'shu-wangping');
  await clickPlate(page, enemy.id);
  await expect(page.getByTestId('attack-forecast')).toBeVisible();
  await selectActor(page, 'shu-wangping');
  await page.getByTestId('command-attack').click();
  p = await centreOnScreen(page, upper);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('attack-forecast')).toBeVisible();
  await expect(page.getByTestId('attack-forecast')).toContainText(enemy.officer.name);
});

test('Move reaches the wall through a climbing figure; a finished mound mounts through the same cell', async ({
  page,
}) => {
  const state = fixture(),
    mover = state.units.find((u) => u.id === 'shu-liaohua')!;
  Object.assign(mover, { x: 9, y: 7, level: 'wall' });
  await battle(page, state);
  await selectActor(page, mover.id);
  await page.getByTestId('command-move').click();
  await expect(page.locator('[data-overlay="reachable"][data-cell="10,7,wall"]')).toHaveCount(1);
  const upper = (await figureVisual(page, 'shu-wangping')).boxes[1]!,
    p = await centreOnScreen(page, upper);
  await page.mouse.click(p.x, p.y);
  expect((await snapshot(page)).state.units.find((u) => u.id === mover.id)).toMatchObject({
    x: 10,
    y: 7,
    level: 'wall',
  });
  await selectActor(page, 'shu-wuyi');
  await page.getByTestId('command-move').click();
  await mouseCell(page, { x: 4, y: 7, level: 'wall' });
  expect((await snapshot(page)).state.units.find((u) => u.id === 'shu-wuyi')).toMatchObject({
    x: 4,
    y: 7,
    level: 'wall',
  });
  await expect(page.locator('.siege-forecast')).toHaveCount(0);
});

test('the gold guide frame on a reachable ladder base still moves, then the open breach mounts', async ({
  page,
}) => {
  const state = fixture(),
    unit = state.units[0]!;
  state.units = [unit];
  Object.assign(unit, { x: 5, y: 10 });
  state.engines = [state.engines[0]!];
  state.footholds['6,7'] = 3;
  await battle(page, state);
  await selectActor(page, unit.id);
  await expect(page.locator('[data-overlay="tutorial"][data-cell="6,10,ground"]')).toHaveCount(1);
  await expect(page.locator('[data-overlay="reachable"][data-cell="6,10,ground"]')).toHaveCount(1);
  // Do not arm Move: the reachable gold frame must survive ladder-body picking.
  await mouseCell(page, { x: 6, y: 10, level: 'ground' });
  expect((await snapshot(page)).state.units[0]).toMatchObject({ x: 6, y: 10, level: 'ground' });
  await selectActor(page, unit.id);
  await page.getByTestId('command-climb').click();
  expect((await snapshot(page)).state.units[0]).toMatchObject({ x: 6, y: 7, level: 'wall' });
  await expect(page.locator('.siege-forecast')).toHaveCount(0);
});

test('the empty raised ladder over the moat selects the engine', async ({ page }) => {
  const state = fixture();
  state.units = state.units.filter((u) => u.id === 'shu-liaohua');
  await battle(page, state);
  const p = await centreOnScreen(page, await engineRect(page, state.engines[1]!.id));
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('siege-map')).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('siege-map')).toHaveAttribute(
    'data-selected',
    state.engines[1]!.id,
  );
});

test('roster selection reveals an off-screen unit plate and an off-screen engine', async ({
  page,
}) => {
  const state = fixture(),
    unit = state.units[0]!,
    engine = state.engines[0]!;
  await battle(page, state);
  for (const actor of [unit, engine]) {
    await panToCell(page, { x: 16, y: 0, level: 'ground' });
    const map = (await page.getByTestId('siege-map').boundingBox())!;
    if ('level' in actor) {
      const before = (await page.locator(`[data-nameplate="${actor.id}"]`).boundingBox())!;
      expect(
        before.y + before.height < map.y ||
          before.x + before.width < map.x ||
          before.x > map.x + map.width ||
          before.y > map.y + map.height,
      ).toBe(true);
    }
    await selectActor(page, actor.id);
    const box =
      'level' in actor
        ? (await page.locator(`[data-nameplate="${actor.id}"]`).boundingBox())!
        : await clientBox(page, await engineRect(page, actor.id));
    expect(box.x).toBeGreaterThanOrEqual(map.x);
    expect(box.x + box.width).toBeLessThanOrEqual(map.x + map.width);
    expect(box.y).toBeGreaterThanOrEqual(map.y);
    expect(box.y + box.height).toBeLessThanOrEqual(map.y + map.height);
  }
});

for (const days of [2, 4, 6, 8])
  test(`careful after ${days} days: every ordinary and displaced figure selects, except an underlying occupant's figure box`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240000);
    await battle(page, createSiegeState(days === 8 ? 1 : 228));
    await page.evaluate((days) => window.__siegeDev!.playScript('careful', days), days);
    await closeReport(page);
    await dismissCounters(page);
    const state = (await snapshot(page)).state;
    expect(state.day).toBe(days + 1);
    const exceptions: string[] = [];
    let displaced = 0,
      ordinary = 0;
    for (const unit of state.units.filter(
      (u) => u.side === 'shu' && u.troops > 0 && isMapCell(u.x, u.y),
    )) {
      const visual = await figureVisual(page, unit.id);
      expect(visual.boxes.length).toBeGreaterThan(0);
      for (const [i, box] of visual.boxes.entries()) {
        // Raised/wrecked ladder: no reachable moves or unit action icons.
        await selectActor(page, state.engines[0]!.id);
        await expect(page.locator('[data-overlay="reachable"]')).toHaveCount(0);
        const p = await centreOnScreen(page, box);
        const occupant = await page.evaluate(
          async (p) => {
            const artPath = '/src/siege/render/stateArt.ts',
              geometryPath = '/src/siege/render/boardGeometry.ts';
            const { unitVisual } = (await import(
              artPath
            )) as typeof import('../../src/siege/render/stateArt');
            const { contains, positionAt } = (await import(
              geometryPath
            )) as typeof import('../../src/siege/render/boardGeometry');
            const game = window.__siegeDev!.snapshot(),
              cell = positionAt(game.state, p.x, p.y);
            return game.state.units.find(
              (u) =>
                u.troops > 0 &&
                cell &&
                u.x === cell.x &&
                u.y === cell.y &&
                u.level === cell.level &&
                unitVisual(game.state, u, game.facings[u.id]).figureRects.some((r) =>
                  contains(r, p.x, p.y),
                ),
            );
          },
          { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 },
        );
        await page.mouse.click(p.x, p.y);
        const expected = occupant ?? unit;
        const label = `${unit.id} figure ${i} centre (${((box[0] + box[2]) / 2).toFixed(1)},${((box[1] + box[3]) / 2).toFixed(1)})`;
        // Enemy occupant boxes use the existing target path. A selected ladder
        // keeps its selection and cannot open a forecast; hover identifies the occupant.
        if (expected.side === 'wei') {
          await expect(page.getByTestId('siege-map'), label).toHaveAttribute(
            'data-selected',
            state.engines[0]!.id,
          );
          await expect(page.getByTestId('hover-line'), label).toContainText(expected.officer.name);
          await expect(page.locator('[data-overlay="hover"]'), label).toHaveAttribute(
            'data-cell',
            `${expected.x},${expected.y},${expected.level}`,
          );
        } else
          await expect(page.getByTestId('siege-map'), label).toHaveAttribute(
            'data-selected',
            expected.id,
          );
        if (expected.id !== unit.id)
          exceptions.push(`${label}: underlying occupant box ${expected.id}`);
        if (visual.displaced) displaced++;
        else ordinary++;
      }
    }
    let engineClicks = 0;
    for (const engine of state.engines.filter((e) => usableEngine(e) && isMapCell(e.x, e.y))) {
      await selectActor(page, state.engines[0]!.id);
      await expect(page.locator('[data-overlay="reachable"]')).toHaveCount(0);
      const p = await engineBodyPoint(page, engine.id);
      await page.mouse.move(p.x, p.y);
      await expect(page.locator('[data-overlay="hover"]')).toHaveAttribute(
        'data-cell',
        `${engine.x},${engine.y},ground`,
      );
      await page.mouse.click(p.x, p.y);
      await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', engine.id);
      await expect(page.locator('.siege-forecast')).toHaveCount(0);
      engineClicks++;
    }
    const report = {
      days,
      displaced,
      ordinary,
      engineClicks,
      misses: 0,
      occupantBoxExceptions: exceptions,
    };
    console.info(JSON.stringify(report));
    await testInfo.attach(`figure-sweep-${days}`, {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });

test('a legal gate target wins through the ram body with own infantry selected', async ({
  page,
}) => {
  const state = createSiegeState(228),
    unit = state.units.find((u) => u.id === 'shu-weiyan')!;
  Object.assign(unit, { x: 8, y: 8, level: 'ground', moved: true });
  state.units = [unit];
  state.engines = [{ ...state.engines[0]!, id: 'gate-ram', kind: 'ram', x: 8, y: 8 }];
  expect(unit.troopType).toBe('infantry');
  expect(actorTargets(state, unit.id, 'shu').some((t) => t.id === 'south')).toBe(true);
  await battle(page, state);
  await selectActor(page, unit.id);
  const rect = await engineRect(page, 'gate-ram');
  const point = await page.getByTestId('siege-map').evaluate(async (svg, rect) => {
    const artPath = '/src/siege/render/stateArt.ts',
      geometryPath = '/src/siege/render/boardGeometry.ts';
    const { unitVisual } = (await import(
      artPath
    )) as typeof import('../../src/siege/render/stateArt');
    const { contains } = (await import(
      geometryPath
    )) as typeof import('../../src/siege/render/boardGeometry');
    const game = window.__siegeDev!.snapshot(),
      figures = game.state.units.flatMap((u) => unitVisual(game.state, u).figureRects),
      inverse = (svg as SVGSVGElement).getScreenCTM()!.inverse();
    const obstacles = [
      ...svg.querySelectorAll<SVGGraphicsElement>('[data-nameplate] rect, [data-target-id]'),
    ].map((el) => {
      const r = el.getBBox(),
        m = inverse.multiply(el.getScreenCTM()!),
        a = new DOMPoint(r.x, r.y).matrixTransform(m),
        b = new DOMPoint(r.x + r.width, r.y + r.height).matrixTransform(m);
      return [a.x, a.y, b.x, b.y] as ScreenRect;
    });
    for (let y = rect[1] + 1; y < rect[3]; y += 2)
      for (let x = rect[0] + 1; x < rect[2]; x += 2) {
        const cell = window.__siegeGeometry!.positionAt(x, y);
        if (
          cell?.x === 8 &&
          cell.y === 7 &&
          cell.level === 'ground' &&
          ![...figures, ...obstacles].some((r) => contains(r, x, y))
        )
          return [x, y] as const;
      }
    throw new Error(
      'No gate-cell point through the ram body clear of figures, plates and target icons',
    );
  }, rect);
  const p = await centreOnScreen(page, [point[0] - 1, point[1] - 1, point[0] + 1, point[1] + 1]);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator('[data-overlay="hover"]')).toHaveAttribute('data-cell', '8,7,ground');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', unit.id);
  await expect(page.getByTestId('attack-forecast')).toBeVisible();
  await expect(page.getByTestId('attack-confirm')).toHaveCount(1);
  expect((await snapshot(page)).state).toEqual(state);
});
