import { expect, test, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { createRenderScene } from '../../src/siege/dev/renderScenes';
import { isMapCell } from '../../src/siege/rules/map';
import type { SiegePosition, SiegeState } from '../../src/siege/rules/types';
import type { SiegeLocale } from '../../src/siege/i18n';
import {
  cellPoint,
  clickCell,
  clickPlate,
  closeReport,
  expectNoPanelScroll,
  loadFixture,
  panToCell,
  selectActor,
  snapshot,
} from './helpers';
test.use({ viewport: { width: 1280, height: 720 } });
async function battle(page: Page, state: SiegeState, locale: SiegeLocale = 'zh', hints = false) {
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
        dismissedHints: hints ? [] : ['wall', 'trench', 'ladder', 'frontage', 'innerWall'],
        walkthrough: { status: 'skipped', step: 1, startDay: 1, logStart: 0 },
      },
    },
    locale,
  );
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
  await page.waitForLoadState('networkidle');
}
function crowd() {
  const state = createSiegeState(228);
  Object.assign(
    state.units.find((u) => u.id === 'shu-weiyan')!,
    { x: 6, y: 10 },
  );
  Object.assign(
    state.units.find((u) => u.id === 'shu-wangping')!,
    { x: 5, y: 10 },
  );
  state.engines[0]!.raisedAt = { x: 6, y: 7 };
  state.footholds['6,7'] = 2;
  return state;
}
async function logicalClick(page: Page, cell: SiegePosition) {
  await panToCell(page, cell);
  const p = await cellPoint(page, cell);
  await page.mouse.click(p.x, p.y);
}
for (const locale of ['zh', 'en'] as const) {
  for (const fixture of ['default', 'crowd', 'walkway', 'day9'] as const)
    test(`${locale}: own plates select their owners at 100%/75%, empty engine cells select (${fixture})`, async ({
      page,
    }) => {
      test.setTimeout(180000);
      await battle(
        page,
        fixture === 'crowd'
          ? crowd()
          : fixture === 'walkway'
            ? createRenderScene('visible').state
            : createSiegeState(1),
        locale,
      );
      if (fixture === 'day9') {
        await page.evaluate(() => window.__siegeDev!.playScript('careful', 8));
        await closeReport(page);
        for (let i = 0; i < 12 && (await page.getByTestId('counter-dismiss').count()); i++)
          await page.getByTestId('counter-dismiss').click();
        expect((await snapshot(page)).state.day).toBe(9);
      }
      const before = await snapshot(page),
        alive = before.state.units.filter((u) => u.troops > 0 && isMapCell(u.x, u.y));
      if (fixture === 'day9') {
        const ladder = before.state.engines.find((e) => e.id === 'starting-ladder-1')!,
          tower = before.state.engines.find((e) => e.id === 'workshop-1-tower-5-1')!;
        expect(ladder).toMatchObject({ x: 6, y: 10, wrecked: true, durability: 0 });
        expect(tower).toMatchObject({ x: 6, y: 10, wrecked: false });
        // The wreck is intentionally hidden from cell clicks, but inspectable in the roster.
        await selectActor(page, ladder.id);
        await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', ladder.id);
      }
      for (const zoom of [100, 75]) {
        await page.getByRole('button', { name: `${zoom}%`, exact: true }).click();
        for (const unit of alive.filter((u) => u.side === 'shu')) {
          await selectActor(page, alive.find((u) => u.side === 'shu' && u.id !== unit.id)!.id);
          await panToCell(page, unit);
          await clickPlate(page, unit.id);
          await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', unit.id);
        }
        for (const engine of before.state.engines) {
          if (alive.some((u) => u.x === engine.x && u.y === engine.y)) continue;
          // Stacks cycle by paint order; a first click need not select this entry.
          if (before.state.engines.filter((e) => e.x === engine.x && e.y === engine.y).length > 1)
            continue;
          await selectActor(page, engine.id);
          await selectActor(page, alive.find((u) => u.side === 'shu')!.id);
          await logicalClick(page, { ...engine, level: 'ground' });
          await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', engine.id);
        }
      }
      expect((await snapshot(page)).state).toEqual(before.state);
    });
  test(`${locale}: explicit Move reaches a ladder, then cell clicks cycle unit/ladder`, async ({
    page,
  }) => {
    const state = createSiegeState(228),
      unit = state.units.find((u) => u.id === 'shu-captain-2')!;
    Object.assign(unit, { x: 10, y: 10 });
    state.units = state.units.filter((u) => u.id === unit.id || u.side === 'wei');
    // Start beside the eastern base, with both moves legal and no workshop cell.
    Object.assign(unit, { x: 11, y: 10 });
    await battle(page, state, locale);
    await selectActor(page, unit.id);
    await logicalClick(page, { x: 10, y: 10, level: 'ground' });
    await expect(page.getByTestId('siege-map')).toHaveAttribute(
      'data-selected',
      'starting-ladder-2',
    );
    await selectActor(page, unit.id);
    await page.getByTestId('command-move').click();
    await clickCell(page, 'reachable', '10,10,ground');
    expect((await snapshot(page)).state.units.find((u) => u.id === unit.id)).toMatchObject({
      x: 10,
      y: 10,
      moved: true,
    });
    for (const id of ['starting-ladder-2', unit.id]) {
      await logicalClick(page, { x: 10, y: 10, level: 'ground' });
      await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', id);
    }
    await page.getByTestId('command-raiseLadder').click();
    expect((await snapshot(page)).state.engines[1]!.raisedAt).toEqual({ x: 10, y: 7 });
    await expectNoPanelScroll(page, 'action-panel');
  });
  test(`${locale}: an armed attack through a plate targets that unit's own cell`, async ({
    page,
  }) => {
    const state = createSiegeState(228),
      shu = state.units.find((u) => u.id === 'shu-weiyan')!,
      wei = state.units.find((u) => u.id === 'wei-wangsheng')!;
    Object.assign(shu, { x: 6, y: 7, level: 'wall' });
    Object.assign(wei, { x: 7, y: 7, level: 'wall' });
    state.units = [shu, wei];
    state.engines = [];
    await battle(page, state, locale);
    await selectActor(page, shu.id);
    await page.getByTestId('command-attack').click();
    await panToCell(page, wei);
    await clickPlate(page, wei.id);
    await expect(page.getByTestId('attack-forecast')).toBeVisible();
    expect((await snapshot(page)).state).toEqual(state);
    await expectNoPanelScroll(page, 'attack-forecast');
  });
}
for (const fixture of ['formations', 'nightTorches', 'sortie', 'worst'] as const)
  test(`plates remain selectable independently of covered pixels (${fixture})`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.goto(`/?siege-map&scene=${fixture}`);
    await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
    for (const zoom of [1, 0.75])
      for (const unit of createRenderScene(fixture).state.units) {
        await page.getByTestId(`zoom-${zoom}`).click();
        await panToCell(page, unit);
        await clickPlate(page, unit.id);
        await expect(page.getByTestId('preview-selection')).toHaveText(unit.id);
      }
  });
test('hover always outlines the inverse hit rectangle and leaves art/figure nodes stable', async ({
  page,
}) => {
  const state = createSiegeState(228),
    unit = state.units.find((u) => u.id === 'shu-weiyan')!;
  Object.assign(unit, { x: 5, y: 10 });
  state.units = state.units.filter((u) => u.id === unit.id || u.side === 'wei');
  await battle(page, state);
  await selectActor(page, unit.id);
  const before = await page.evaluate(() => ({ ...window.__siegeDev!.renderCounts }));
  for (const cell of [
    { x: 6, y: 10, level: 'ground' },
    { x: 4, y: 10, level: 'ground' },
    { x: 8, y: 7, level: 'wall' },
    { x: 0, y: 0, level: 'ground' },
  ] as const) {
    await panToCell(page, cell);
    const point = await cellPoint(page, cell);
    await page.mouse.move(point.x, point.y);
    const hover = page.locator('[data-overlay="hover"]');
    await expect(hover).toHaveCount(1);
    await expect(hover).toHaveAttribute('data-cell', `${cell.x},${cell.y},${cell.level}`);
    await expect(page.getByTestId('hover-line')).not.toBeEmpty();
  }
  const after = await page.evaluate(() => ({ ...window.__siegeDev!.renderCounts }));
  expect(after.static - before.static).toBe(0);
  expect(after.units - before.units).toBe(0);
});
test('figures outside their cell use the cell under the cursor; nameplates are the explicit exception', async ({
  page,
}) => {
  const state = createSiegeState(228),
    unit = state.units.find((u) => u.id === 'shu-weiyan')!;
  // A wall cell is one row deep, so the figure's head stands over the yard behind it.
  Object.assign(unit, { x: 5, y: 7, level: 'wall' });
  state.units = [unit];
  state.engines = [];
  await battle(page, state);
  const map = page.getByTestId('siege-map');
  await expect(map).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await panToCell(page, unit);
  const point = await map.evaluate((svg) => {
    const el = svg.querySelector<SVGImageElement>('[data-unit="shu-weiyan"] image')!,
      r = el.getBBox(),
      screen = new DOMPoint(r.x + r.width / 2, r.y + 1).matrixTransform(el.getScreenCTM()!),
      mapPoint = screen.matrixTransform((svg as SVGSVGElement).getScreenCTM()!.inverse()),
      owner = window.__siegeGeometry!.positionAt(mapPoint.x, mapPoint.y);
    return { owner, x: screen.x, y: screen.y };
  });
  const bounds = (await map.boundingBox())!;
  expect(point.x).toBeGreaterThan(bounds.x);
  expect(point.x).toBeLessThan(bounds.x + bounds.width);
  expect(point.y).toBeGreaterThan(bounds.y);
  expect(point.y).toBeLessThan(bounds.y + bounds.height);
  expect(point.owner).not.toBeNull();
  expect(point.owner).not.toEqual({ x: unit.x, y: unit.y, level: unit.level });
  await page.mouse.move(point.x, point.y);
  await expect(map.locator('[data-overlay="hover"]')).toHaveAttribute(
    'data-cell',
    `${point.owner!.x},${point.owner!.y},${point.owner!.level}`,
  );
  await clickPlate(page, unit.id);
  await expect(map).toHaveAttribute('data-selected', unit.id);
});
test('hint text passes clicks through to the map and its dismissal button still works', async ({
  page,
}) => {
  await battle(page, crowd(), 'zh', true);
  await selectActor(page, 'shu-weiyan');
  const notice = page.getByTestId('map-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCSS('pointer-events', 'none');
  const button = notice.getByRole('button').first();
  await expect(button).toHaveCSS('pointer-events', 'auto');
  await page.getByTestId('siege-map').evaluate((svg) =>
    svg.addEventListener('pointerup', () => svg.setAttribute('data-click-through', 'yes'), {
      once: true,
    }),
  );
  const box = (await notice.locator('h3').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-click-through', 'yes');
  await button.click();
});

test('a front tower fades around the selected unit and its guide; a separate ladder stays opaque', async ({
  page,
}) => {
  const state = createSiegeState(228),
    unit = state.units.find((u) => u.id === 'shu-weiyan')!;
  Object.assign(unit, { x: 6, y: 9 });
  state.units = [unit];
  state.trenchFill['6,8'] = state.trenchFill['6,9'] = 3;
  state.engines = [
    { ...state.engines[0]!, id: 'covering-tower', kind: 'tower', x: 6, y: 10 },
    { ...state.engines[0]!, id: 'separate-ladder', x: 5, y: 10 },
  ];
  await battle(page, state);
  await selectActor(page, unit.id);
  const tower = page.locator('[data-piece="covering-tower"][data-selection-layer]');
  expect(await tower.count()).toBeGreaterThan(0);
  for (const slice of await tower.all()) await expect(slice).toHaveCSS('opacity', '0.4');
  const ladder = page.locator('[data-piece="separate-ladder"][data-selection-layer]');
  expect(await ladder.count()).toBeGreaterThan(0);
  for (const slice of await ladder.all()) await expect(slice).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-overlay="tutorial"][data-cell="6,8,ground"]')).toBeVisible();
});
