import { expect, test } from '@playwright/test';
import { createRenderScene } from '../../src/siege/dev/renderScenes';
import { shot } from './helpers';

test('south ramp painting with a unit on each flight', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?siege-map&scene=ramps');
  const map = page.getByTestId('siege-map');
  await expect(map).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('zoom-1').click();
  await expect(map).toHaveAttribute('data-zoom', '1.00');
  await page.waitForLoadState('networkidle');
  await map.locator('image').evaluateAll(async (images) => {
    await Promise.all(
      [...new Set(images.map((el) => el.getAttribute('href')).filter(Boolean))].map(async (url) => {
        const image = new Image();
        image.src = url!;
        await image.decode();
      }),
    );
  });
  const painting = await map
    .locator('[data-object="ramp-south-w"] > image')
    .first()
    .getAttribute('href');
  expect(painting).toMatch(/^blob:/);
  for (const id of [
    'ramp-south-w',
    'ramp-south-e',
    'wall-south-w',
    'wall-south-e',
    'wall-south-w-parapet',
    'wall-south-e-parapet',
  ]) {
    const slices = map.locator(`[data-object="${id}"] > image`);
    expect(await slices.count()).toBeGreaterThan(0);
    for (const slice of await slices.all()) await expect(slice).toHaveAttribute('href', painting!);
  }
  const state = createRenderScene('ramps').state;
  const units = [21, 26].map((x) => state.units.find((unit) => unit.x === x && unit.y === 15)!);
  for (const unit of units) {
    await expect(map.locator(`[data-unit="${unit.id}"] image[data-sprite]`)).toHaveCount(1);
    await expect(page.getByTestId(`map-unit-${unit.id}`)).toBeVisible();
  }
  await map.evaluate((el) => {
    const svg = el as SVGSVGElement;
    svg.pauseAnimations();
    svg.setCurrentTime(0.05);
  });
  await shot(page, 'ramps');
  for (const unit of units) {
    const box = (await page.getByTestId(`map-unit-${unit.id}`).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('preview-selection')).toHaveText(unit.id);
  }
  expect(errors).toEqual([]);
  console.info('south ramps: 2 units at (21,15)/(26,15), 2 selections, 0 page errors');
});
