import { expect, test, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { loadFixture, selectActor } from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });
const paint = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
const counts = (page: Page) => page.evaluate(() => ({ ...window.__siegeDev!.renderCounts }));
async function battle(page: Page, state = createSiegeState(228)) {
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
        dismissedHints: ['wall', 'trench', 'ladder', 'frontage', 'innerWall'],
        dismissedCounters: [],
        reportReadDay: state.day,
        walkthrough: { status: 'skipped', step: 1, startDay: 1, logStart: 0 },
      },
    },
    'zh',
  );
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
  await page.waitForLoadState('networkidle');
  await paint(page);
}

test('selection changes only overlays; repeated hover in the same cell renders nothing', async ({
  page,
}) => {
  await battle(page);
  const before = await counts(page);
  for (const id of ['shu-jiangwei', 'shu-wangping', 'shu-wuyi', 'shu-liaohua'])
    await selectActor(page, id);
  await paint(page);
  const after = await counts(page);
  expect(after.static - before.static).toBe(0);
  expect(after.units - before.units).toBe(0);
  expect(after.overlays).toBeGreaterThan(before.overlays);
  const map = page.getByTestId('siege-map');
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await paint(page);
  const hovered = await counts(page);
  await map.evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    for (let i = 0; i < 10; i++)
      svg.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        }),
      );
  });
  await paint(page);
  expect(await counts(page)).toEqual(hovered);
});

test('dragging changes viewBox without rendering React layers, then commits the minimap on release', async ({
  page,
}) => {
  await battle(page);
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await paint(page);
  const map = page.getByTestId('siege-map');
  const box = (await map.boundingBox())!;
  const original = await map.getAttribute('viewBox');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await paint(page);
  const before = await counts(page);
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 8 });
  await paint(page);
  expect(await map.getAttribute('viewBox')).not.toBe(original);
  expect(await counts(page)).toEqual(before);
  const dragged = (await map.getAttribute('viewBox'))!.split(' ').map(Number);
  await page.mouse.up();
  await paint(page);
  const minimap = page.locator('.siege-minimap rect');
  expect(Number(await minimap.getAttribute('x'))).toBe(dragged[0]);
  expect(Number(await minimap.getAttribute('y'))).toBe(dragged[1]);
  const after = await counts(page);
  expect(after.static).toBe(before.static);
  expect(after.units).toBe(before.units);
});

test('the thinking state paints before work and night replay retains all static art', async ({
  page,
}) => {
  const state = createSiegeState(228);
  state.day = 3;
  state.weather = 'clear';
  for (const unit of state.units) {
    unit.acted = true;
    if (unit.side === 'shu') unit.y = 25;
  }
  state.ordersUsed.wei[state.day] = true;
  state.engines = [{ ...state.engines[0]!, id: 'replay-ladder', kind: 'ladder', x: 6, y: 11 }];
  state.nightOrders.shu = { kind: 'nightAssault' };
  await battle(page, state);
  const before = await counts(page);
  await page.evaluate(() => {
    const observations = {
      thinkingPaints: 0,
      nightPaints: 0,
      staticCounts: [] as number[],
      text: '',
    };
    (window as Window & { __qPaints?: typeof observations }).__qPaints = observations;
    const sample = () => {
      const thinking = document.querySelector('[data-testid="siege-resolving"]');
      if (thinking) {
        observations.thinkingPaints++;
        observations.text = thinking.textContent ?? '';
      }
      if (document.querySelector('[data-testid="night-overlay"]')) {
        observations.nightPaints++;
        observations.staticCounts.push(window.__siegeDev!.renderCounts.static);
      }
      if (!document.querySelector('[data-testid="morning-report"]')) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('morning-report')).toBeVisible();
  const observations = await page.evaluate(
    () =>
      (
        window as Window & {
          __qPaints?: {
            thinkingPaints: number;
            nightPaints: number;
            staticCounts: number[];
            text: string;
          };
        }
      ).__qPaints!,
  );
  expect(observations.thinkingPaints).toBeGreaterThan(0);
  expect(observations.text).toBe('魏军行动中……');
  expect(observations.nightPaints).toBeGreaterThan(0);
  expect(observations.staticCounts.every((count) => count === before.static)).toBe(true);
  expect((await counts(page)).static).toBe(before.static);
});
