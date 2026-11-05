import { expect, test, type Page } from '@playwright/test';
import { engineKey } from '../../src/siege/ui/story';
import { createSiegeState } from '../../src/siege/rules/state';
import { createRenderScene } from '../../src/siege/dev/renderScenes';
import { isMapCell } from '../../src/siege/rules/map';
import { reachableCells } from '../../src/siege/rules/movement';
import { siegeText, type SiegeLocale } from '../../src/siege/i18n';
import type { SiegePosition, SiegeState } from '../../src/siege/rules/types';
import {
  clickCell,
  closeReport,
  expectNoPanelScroll,
  loadFixture,
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
async function centreUnit(page: Page, id: string) {
  const box = (await page.getByTestId(`map-unit-${id}`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
/** Pan with the real minimap so every living unit, including distant defenders, is tested. */
async function panTo(page: Page, x: number, y: number) {
  const box = (await page.locator('.siege-minimap').boundingBox())!;
  await page.mouse.click(box.x + (x / 3072) * box.width, box.y + (y / 1536) * box.height);
}
async function cellPoint(page: Page, cell: SiegePosition) {
  return page.getByTestId('siege-map').evaluate((svg, c) => {
    const height = c.level === 'wall' ? 3 : 0;
    const point = new DOMPoint((c.x + 0.5) * 64, (c.y + 0.5) * 48 - height * 24).matrixTransform(
      (svg as SVGSVGElement).getScreenCTM()!,
    );
    return { x: point.x, y: point.y };
  }, cell);
}
async function clickLogicalCell(page: Page, cell: SiegePosition) {
  const p = await cellPoint(page, cell);
  await page.mouse.click(p.x, p.y);
}
async function expectSelected(page: Page, state: SiegeState, id: string, locale: SiegeLocale) {
  const unit = state.units.find((u) => u.id === id);
  const engine = state.engines.find((e) => e.id === id);
  const name = unit
    ? locale === 'zh'
      ? unit.officer.chinese
      : unit.officer.name
    : siegeText(locale, engineKey(engine!.kind));
  await expect(page.getByTestId('selected-actor').locator('h3')).toHaveText(name);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', id);
}
function crowd() {
  const state = createSiegeState(228);
  Object.assign(
    state.units.find((u) => u.id === 'shu-weiyan')!,
    { x: 18, y: 19 },
  );
  Object.assign(
    state.units.find((u) => u.id === 'shu-wangping')!,
    { x: 18, y: 20 },
  );
  Object.assign(
    state.units.find((u) => u.id === 'shu-liaohua')!,
    { x: 17, y: 20 },
  );
  Object.assign(
    state.units.find((u) => u.id === 'shu-jiangwei')!,
    { x: 19, y: 19 },
  );
  state.engines[0]!.raisedAt = { x: 18, y: 16 };
  state.footholds['18,16'] = 2;
  return state;
}
function walkway() {
  const state = createSiegeState(228);
  const slots = [
    { x: 18, y: 16 },
    { x: 19, y: 16 },
    { x: 21, y: 16 },
    { x: 24, y: 16 },
  ];
  state.units
    .filter((u) => u.side === 'shu')
    .slice(0, slots.length)
    .forEach((u, i) => Object.assign(u, slots[i], { level: 'wall' }));
  return state;
}
for (const locale of ['zh', 'en'] as const) {
  for (const fixture of ['default', 'crowd', 'walkway', 'day9'] as const) {
    test(`${locale}: every unit rect centre and empty engine logical cell selects at 100% and 75% (${fixture})`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await battle(
        page,
        fixture === 'crowd' ? crowd() : fixture === 'walkway' ? walkway() : createSiegeState(228),
        locale,
      );
      if (fixture === 'day9') {
        await page.evaluate(() => window.__siegeDev!.playScript('careful', 8));
        await closeReport(page);
        // Flush any queued counter cards through their buttons.
        for (let i = 0; i < 12 && (await page.getByTestId('counter-dismiss').count()); i++)
          await page.getByTestId('counter-dismiss').click();
        expect((await snapshot(page)).state.day).toBe(9);
        await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
      }
      const game = await snapshot(page),
        state = game.state;
      const alive = state.units.filter((u) => u.troops > 0 && isMapCell(u.x, u.y));
      const own = alive.filter((u) => u.side === 'shu');
      const before = await snapshot(page);
      let unitClicks = 0,
        engineClicks = 0;
      for (const zoom of [100, 75]) {
        await page.getByRole('button', { name: `${zoom}%`, exact: true }).click();
        for (const unit of alive) {
          // Reset selection/mode using a different actor in the roster.
          const actor = own.find((u) => u.id !== unit.id)!;
          await selectActor(page, actor.id);
          await panTo(
            page,
            (unit.x + 0.5) * 64,
            (unit.y + 0.5) * 48 - (unit.level === 'wall' ? 72 : 0),
          );
          const p = await centreUnit(page, unit.id);
          const map = (await page.getByTestId('siege-map').boundingBox())!;
          expect(p.x).toBeGreaterThan(map.x);
          expect(p.x).toBeLessThan(map.x + map.width);
          expect(p.y).toBeGreaterThan(map.y);
          expect(p.y).toBeLessThan(map.y + map.height);
          await page.mouse.click(p.x, p.y);
          if (unit.side === 'shu') {
            await expectSelected(page, state, unit.id, locale);
            await expectNoPanelScroll(page, 'action-panel');
          } else {
            await expect(page.getByTestId('attack-forecast').locator('h4')).toHaveText(
              locale === 'zh' ? unit.officer.chinese : unit.officer.name,
            );
            await expectNoPanelScroll(page, 'attack-forecast');
          }
          unitClicks++;
        }
        for (const e of state.engines) {
          if (alive.some((u) => u.level === 'ground' && u.x === e.x && u.y === e.y)) continue;
          // The table moves on green; use an actor for whom this cell is not green.
          const actor = own.find(
            (u) =>
              !reachableCells(state, u.id).some(
                (c) => c.x === e.x && c.y === e.y && c.level === 'ground',
              ),
          )!;
          expect(actor).toBeTruthy();
          await selectActor(page, actor.id);
          await panTo(page, (e.x + 0.5) * 64, (e.y + 0.5) * 48);
          await clickLogicalCell(page, { x: e.x, y: e.y, level: 'ground' });
          await expectSelected(page, state, e.id, locale);
          await expectNoPanelScroll(page, 'action-panel');
          engineClicks++;
        }
      }
      expect(await snapshot(page)).toEqual(before);
      await test.info().attach('click-counts', {
        body: JSON.stringify({ fixture, unitClicks, engineClicks }),
        contentType: 'application/json',
      });
    });
  }
  test(`${locale}: unraised east ladder selection, explicit Move, unit/ladder cycle and unit Raise ladder`, async ({
    page,
  }) => {
    const state = createSiegeState(228);
    const id = 'shu-captain-2';
    Object.assign(
      state.units.find((u) => u.id === id)!,
      { x: 29, y: 21 },
    );
    await battle(page, state, locale);
    await selectActor(page, id);
    await panTo(page, 29.5 * 64, 20 * 48);
    const before = await snapshot(page);
    await clickCell(page, 'reachable', '29,19,ground');
    await expectSelected(page, state, 'starting-ladder-2', locale);
    expect(await snapshot(page)).toEqual(before);
    await selectActor(page, id);
    await page.getByTestId('command-move').click();
    await clickCell(page, 'reachable', '29,19,ground');
    const moved = await snapshot(page);
    expect(moved.state.units.find((u) => u.id === id)).toMatchObject({ x: 29, y: 19, moved: true });
    await selectActor(page, 'shu-weiyan');
    for (const selected of [id, 'starting-ladder-2', id]) {
      await clickLogicalCell(page, { x: 29, y: 19, level: 'ground' });
      await expectSelected(page, state, selected, locale);
    }
    await expect(page.getByTestId('action-context')).toHaveText(
      siegeText(locale, 'climbRaiseAtBase'),
    );
    await expect(page.getByTestId('command-raiseLadder')).toHaveAttribute('aria-disabled', 'false');
    await expectNoPanelScroll(page, 'action-panel');
    await page.getByTestId('command-raiseLadder').click();
    expect(
      (await snapshot(page)).state.engines.find((e) => e.id === 'starting-ladder-2')!.raisedAt,
    ).toEqual({ x: 29, y: 16 });
    await expect(page.getByTestId('command-climb')).toHaveAttribute('aria-disabled', 'false');
    await expectNoPanelScroll(page, 'action-panel');
  });
  test(`${locale}: open-breach follower is at the base and its gold frame selects it; units paint after carts`, async ({
    page,
  }) => {
    const state = crowd();
    state.footholds['18,16'] = 3;
    // An ally at the top can make way when the follower reaches the base.
    Object.assign(
      state.units.find((u) => u.id === 'shu-wuyi')!,
      { x: 18, y: 16, level: 'wall' },
    );
    await battle(page, state, locale);
    await selectActor(page, 'shu-jiangwei');
    await clickCell(page, 'tutorial', '18,19,ground');
    await expectSelected(page, state, 'shu-weiyan', locale);
    await clickLogicalCell(page, { x: 18, y: 19, level: 'ground' });
    // A selected base unit cycles to the ladder; the next click returns to the follower.
    await expectSelected(page, state, 'starting-ladder-1', locale);
    await clickLogicalCell(page, { x: 18, y: 19, level: 'ground' });
    await expectSelected(page, state, 'shu-weiyan', locale);
    await expect(page.locator('[data-unit="shu-weiyan"] [data-pose*="climb"]')).toHaveCount(0);
    for (const id of ['shu-weiyan', 'shu-wangping']) {
      const after = await page.evaluate((unitId) => {
        const unit = document.querySelector(`[data-unit="${unitId}"]`)!;
        const carts = [
          ...document.querySelectorAll('[data-piece="starting-ladder-1"][data-selection-layer]'),
        ];
        return (
          carts.length > 0 &&
          carts.every((cart) =>
            Boolean(cart.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING),
          )
        );
      }, id);
      expect(after).toBe(true);
    }
    await expectNoPanelScroll(page, 'action-panel');
  });
}

for (const fixture of ['formations', 'nightTorches', 'sortie', 'worst'] as const) {
  test(`every figure centre selects from no selection at 100% and 75% (${fixture})`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto(`/?siege-map&scene=${fixture}`);
    const map = page.getByTestId('siege-map');
    await expect(map).toHaveAttribute('data-ready', 'true');
    await page.waitForLoadState('networkidle');
    const state = createRenderScene(fixture).state;
    let figureClicks = 0;
    for (const zoom of [1, 0.75]) {
      for (const unit of state.units.filter((u) => u.troops > 0 && isMapCell(u.x, u.y))) {
        const figures = map.locator(`[data-unit="${unit.id}"] image[data-sprite]`);
        const count = await figures.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          // Preview zoom controls clear selection, so every figure must select afresh.
          await page.getByTestId(`zoom-${zoom}`).click();
          await expect(page.getByTestId('preview-selection')).toHaveText('none');
          await panTo(
            page,
            (unit.x + 0.5) * 64,
            (unit.y + 0.5) * 48 - (unit.level === 'wall' ? 72 : 0),
          );
          const box = (await figures.nth(i).boundingBox())!;
          const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          const bounds = (await map.boundingBox())!;
          expect(point.x).toBeGreaterThan(bounds.x);
          expect(point.x).toBeLessThan(bounds.x + bounds.width);
          expect(point.y).toBeGreaterThan(bounds.y);
          expect(point.y).toBeLessThan(bounds.y + bounds.height);
          await page.mouse.move(point.x, point.y);
          await expect(map.locator('[data-overlay="hover"]')).toHaveAttribute('stroke', '#e7b84e');
          await page.mouse.click(point.x, point.y);
          await expect(page.getByTestId('preview-selection')).toHaveText(unit.id);
          figureClicks++;
        }
      }
    }
    await test.info().attach('figure-click-counts', {
      body: JSON.stringify({ fixture, figureClicks }),
      contentType: 'application/json',
    });
  });
}

test('hover predicts selection, movement and targeting without rendering static/unit layers; own-footprint ladders stay opaque', async ({
  page,
}) => {
  const state = createSiegeState(228);
  Object.assign(
    state.units.find((u) => u.id === 'shu-weiyan')!,
    { x: 18, y: 20 },
  );
  await battle(page, state);
  await selectActor(page, 'shu-weiyan');
  const before = await page.evaluate(() => ({ ...window.__siegeDev!.renderCounts }));
  for (const [cell, color] of [
    [{ x: 18, y: 19, level: 'ground' }, '#e7b84e'],
    [{ x: 17, y: 20, level: 'ground' }, '#609d80'],
    [{ x: 23, y: 16, level: 'wall' }, '#b74e3c'],
  ] as const) {
    await panTo(page, (cell.x + 0.5) * 64, (cell.y + 0.5) * 48 - (cell.level === 'wall' ? 72 : 0));
    const p = await cellPoint(page, cell);
    await page.mouse.move(p.x, p.y);
    await expect(page.locator('[data-overlay="hover"]')).toHaveAttribute('stroke', color);
    await expect(page.getByTestId('siege-map')).toHaveCSS('cursor', 'pointer');
  }
  const after = await page.evaluate(() => ({ ...window.__siegeDev!.renderCounts }));
  expect(after.static - before.static).toBe(0);
  expect(after.units - before.units).toBe(0);
  await expect(
    page.locator('[data-piece="starting-ladder-1"][data-selection-layer]').first(),
  ).toHaveCSS('opacity', '1');
  await selectActor(page, 'starting-ladder-1');
  await expect(
    page.locator('[data-piece="starting-ladder-1"][data-selection-layer]').first(),
  ).toHaveCSS('opacity', '1');
  await selectActor(page, 'shu-jiangwei');
  const jiangwei = state.units.find((u) => u.id === 'shu-jiangwei')!;
  await panTo(page, (jiangwei.x + 0.5) * 64, (jiangwei.y + 0.5) * 48);
  const point = await centreUnit(page, 'shu-jiangwei');
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('[data-overlay="hover"]')).toHaveCount(0);
  await expect(page.getByTestId('siege-map')).not.toHaveCSS('cursor', 'pointer');
});

test('a tower covering a selected ladder base fades, while the ladder and its gold frame stay opaque', async ({
  page,
}) => {
  const state = crowd();
  state.footholds['18,16'] = 3;
  Object.assign(
    state.units.find((u) => u.id === 'shu-wuyi')!,
    { x: 18, y: 16, level: 'wall' },
  );
  state.engines.push({
    ...state.engines[0]!,
    id: 'covering-tower',
    kind: 'tower',
    x: 18,
    y: 21,
    raisedAt: undefined,
  });
  await battle(page, state);
  // Jiang Wei's base frame is within the ladder's footprint, outside the tower's.
  await selectActor(page, 'shu-jiangwei');
  await expect(page.locator('[data-overlay="tutorial"][data-cell="18,19,ground"]')).toBeVisible();
  for (const selected of ['shu-jiangwei', 'shu-weiyan', 'starting-ladder-1']) {
    await selectActor(page, selected);
    for (const [id, opacity] of [
      ['covering-tower', '0.4'],
      ['starting-ladder-1', '1'],
    ]) {
      const slices = page.locator(`[data-piece="${id}"][data-selection-layer]`);
      expect(await slices.count()).toBeGreaterThan(0);
      for (const slice of await slices.all()) await expect(slice).toHaveCSS('opacity', opacity!);
    }
  }
});

test('a real click through hint-card text reaches the map; its dismissal button remains usable', async ({
  page,
}) => {
  // A battle fixture skips the walkthrough, which deliberately defers hint cards.
  await battle(page, crowd(), 'zh', true);
  await selectActor(page, 'shu-weiyan');
  const notice = page.getByTestId('map-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCSS('pointer-events', 'none');
  expect((await notice.boundingBox())!.width).toBeLessThanOrEqual(300);
  const button = notice.getByRole('button').first();
  await expect(button).toHaveCSS('pointer-events', 'auto');
  // Observe the real bubbling event, without replacing the game's handler.
  await page.getByTestId('siege-map').evaluate((svg) => {
    svg.addEventListener('pointerup', () => svg.setAttribute('data-click-through', 'yes'), {
      once: true,
    });
  });
  const box = (await notice.locator('h3').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-click-through', 'yes');
  await button.click();
  await expectNoPanelScroll(page, 'action-panel');
});
