import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createRenderScene, RENDER_SCENES } from '../../src/siege/dev/renderScenes';
import { clickPlate, panToCell } from './helpers';
for (const scene of RENDER_SCENES)
  test(`V2 ${scene}: review screenshots, plates and registration at three zooms`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?siege-map&scene=${scene}`);
    const map = page.getByTestId('siege-map');
    await expect(map).toHaveAttribute('data-ready', 'true');
    await page.waitForLoadState('networkidle');
    await map.locator('image').evaluateAll(async (images) => {
      await Promise.all(
        [
          ...new Set(
            images.map((el) => el.getAttribute('href')).filter((v): v is string => Boolean(v)),
          ),
        ].map(async (url) => {
          const im = new Image();
          im.src = url;
          await im.decode();
        }),
      );
    });
    expect(Number(await map.getAttribute('data-sprite-count'))).toBeLessThanOrEqual(512);
    await expect(map).toHaveAttribute('data-sprites-omitted', '0');
    await mkdir('.artifacts/siege/screens', { recursive: true });
    const fixture = createRenderScene(scene);
    if (scene === 'board') {
      await expect(map.locator('[data-review-cell]')).toHaveCount(fixture.state.units.length);
      await page.screenshot({
        path: '.artifacts/siege/screens/render-board-full.png',
        animations: 'disabled',
      });
    }
    for (const [index, zoom] of [0.75, 1, 1.5].entries()) {
      await page.getByTestId(`zoom-${zoom}`).click();
      await expect(map).toHaveAttribute('data-zoom', zoom.toFixed(2));
      const unit = fixture.state.units[index % 2 ? 6 : 5]!;
      await panToCell(page, unit);
      await clickPlate(page, unit.id);
      await expect(page.getByTestId('preview-selection')).toHaveText(unit.id);
      if (scene === 'footholds')
        for (const [x, progress] of [
          [5, 0],
          [6, 1],
          [10, 2],
          [11, 3],
        ]) {
          const pips = map.locator(`[data-foothold="${x},7"]`);
          await expect(pips.locator('[data-lit="true"]')).toHaveCount(progress!);
          await expect(pips.locator('[data-pip-core][fill="none"]')).toHaveCount(3 - progress!);
        }
      if (scene === 'preparations')
        for (const x of [8, 10]) {
          const crane = map.locator(`[data-piece="crane-${x},7"]`),
            stone = map.locator(`[data-piece="millstone-${x},7"]`);
          await expect(crane).toHaveAttribute('pointer-events', 'none');
          await expect(stone.locator('line')).toHaveCount(1);
          expect(
            await stone
              .locator('line')
              .evaluate((el) => Number(el.getAttribute('y2')) - Number(el.getAttribute('y1'))),
          ).toBeCloseTo(12, 2);
        }
      await map.evaluate((el) => {
        const svg = el as SVGSVGElement;
        svg.pauseAnimations();
        svg.setCurrentTime(0.05);
      });
      await page.screenshot({
        path: `.artifacts/siege/screens/render-${scene}-${zoom * 100}.png`,
        animations: 'disabled',
      });
    }
    expect(errors).toEqual([]);
  });
test('storming/repulse follow ladders; gate figures stay behind the roof and yellow pixels above it', async ({
  page,
}) => {
  await page.goto('/?siege-map&scene=assault');
  const map = page.getByTestId('siege-map');
  for (const [i, x] of [6, 10].entries()) {
    const id = createRenderScene('assault').state.units[i + 1]!.id;
    expect(
      await map.evaluate(
        (svg, { id, x }) => {
          const storm = svg.querySelector(`[data-piece="storm-${id}"]`)!;
          return [...svg.querySelectorAll(`[data-piece="ladder-${x}"]`)].every((el) =>
            Boolean(el.compareDocumentPosition(storm) & Node.DOCUMENT_POSITION_FOLLOWING),
          );
        },
        { id, x },
      ),
    ).toBe(true);
  }
  await page.goto('/?siege-map&scene=preparations');
  const unit = map.locator('[data-gate-top="gate-south"]');
  await expect(unit).toHaveCount(1);
  expect(
    await unit.evaluate((el) =>
      [...document.querySelectorAll('[data-object="gate-south"]')].some((roof) =>
        Boolean(el.compareDocumentPosition(roof) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
    ),
  ).toBe(true);
  const id = (await unit.getAttribute('data-unit'))!;
  await expect(map.locator(`[data-covered-unit="${id}"]`)).toHaveCount(1);
  await clickPlate(page, id);
  await expect(page.getByTestId('preview-selection')).toHaveText(id);
});
test('forecast pips blink, morale floats, and night replay is skippable', async ({ page }) => {
  await page.goto('/?siege-map&scene=footholds');
  await page.getByTestId('preview-forecast').hover();
  await expect(page.locator('[data-foothold="6,7"] animate')).toHaveCount(3);
  await expect(page.getByTestId('displaced-morale')).toHaveText('-10');
  await page.goto('/?siege-map&scene=sortie');
  for (const name of ['Replay', 'Guarded replay', 'Night assault replay']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByTestId('sortie-party')).toBeVisible();
    await page.getByRole('button', { name: 'Skip replay', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Skip replay', exact: true })).toBeDisabled();
  }
});
