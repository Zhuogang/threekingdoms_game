import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createRenderScene, RENDER_SCENES } from '../../src/siege/dev/renderScenes';

for (const scene of RENDER_SCENES) {
  test(`v0.2 render ${scene}: screenshot and selection at three zoom levels`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?siege-map&scene=${scene}`);
    await expect(page.getByTestId('render-scene')).toHaveAttribute('data-scene', scene);
    const map = page.getByTestId('siege-map');
    await expect(map).toHaveAttribute('data-ready', 'true');
    await page.waitForLoadState('networkidle');
    await map.locator('image').evaluateAll(async (images) => {
      const urls = [
        ...new Set(
          images.map((el) => el.getAttribute('href')).filter((url): url is string => Boolean(url)),
        ),
      ];
      await Promise.all(
        urls.map(
          (url) =>
            new Promise<void>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve();
              image.onerror = () => reject(new Error(`Missing image: ${url}`));
              image.src = url;
            }),
        ),
      );
    });
    expect(Number(await map.getAttribute('data-sprite-count'))).toBeLessThanOrEqual(300);
    await mkdir('.artifacts/siege/screens', { recursive: true });
    // Freeze SMIL at a deterministic point as well as disabling CSS animation.
    await map.evaluate((el) => {
      const svg = el as SVGSVGElement;
      svg.pauseAnimations();
      svg.setCurrentTime(0.05);
    });
    await page.screenshot({
      path: `.artifacts/siege/screens/render-${scene}.png`,
      animations: 'disabled',
    });
    const state = createRenderScene(scene).state;
    for (const [index, zoom] of [0.75, 1, 1.5].entries()) {
      await page.getByTestId(`zoom-${zoom}`).click();
      await expect(map).toHaveAttribute('data-zoom', zoom.toFixed(2));
      // Alternate units, so a missed click cannot pass on an earlier selection.
      const id = state.units[index % 2 ? 6 : 5]!.id;
      const figure = map.locator(`[data-unit="${id}"] [data-sprite="figure"]`).first();
      await expect(figure).toBeVisible();
      const box = await figure.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await expect(page.getByTestId('preview-selection')).toHaveText(id);
    }
    expect(errors).toEqual([]);
  });
}

test('v0.2 replay is skippable and forecast hover blinks the footholds', async ({ page }) => {
  await page.goto('/?siege-map&scene=footholds');
  await page.getByTestId('preview-forecast').hover();
  await expect(page.locator('[data-foothold="19,16"] animate')).toHaveCount(3);
  await expect(page.getByTestId('displaced-morale')).toHaveText('-10');
  await page.goto('/?siege-map&scene=sortie');
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(page.getByTestId('night-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Skip replay', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Skip replay', exact: true })).toBeDisabled();
});

test('v0.2 sortie exposes success and both failure replays', async ({ page }) => {
  await page.goto('/?siege-map&scene=sortie');
  for (const name of ['Replay', 'Guarded replay', 'Night assault replay']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByTestId('sortie-party')).toBeVisible();
    await page.getByRole('button', { name: 'Skip replay', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Skip replay', exact: true })).toBeDisabled();
  }
});
