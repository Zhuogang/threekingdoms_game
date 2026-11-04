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
    await expect(map).toHaveAttribute('data-sprite-cap', '512');
    expect(Number(await map.getAttribute('data-sprite-count'))).toBeLessThanOrEqual(512);
    await expect(map).toHaveAttribute('data-sprites-omitted', '0');
    await expect(map.locator('[data-overlay="climb"]')).toHaveCount(0);
    if (scene === 'worst') {
      await expect(map).toHaveAttribute('data-sprite-count', '448');
      await expect(map.locator('[data-sprite="figure"]')).toHaveCount(80);
    }
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
      if (scene === 'footholds') {
        for (const [x, progress] of [
          [16, 0],
          [19, 1],
          [28, 2],
          [31, 3],
        ]) {
          const pips = map.locator(`[data-foothold="${x},16"]`);
          await expect(pips.locator('[data-lit="true"]')).toHaveCount(progress!);
          await expect(pips.locator('[data-pip-core][fill="none"]')).toHaveCount(3 - progress!);
          const core = pips.locator('[data-pip-core]').first();
          const box = await core.boundingBox();
          // Chromium's box for an SVG circle includes its stroke.
          expect(box!.width).toBeGreaterThanOrEqual(5.4 * 2 * zoom);
          expect(box!.width).toBeLessThan((5.4 * 2 + 2) * zoom);
          const ladderCentre = await map.evaluate(
            (svg, cellX) =>
              new DOMPoint((cellX + 0.5) * 64, 0).matrixTransform(
                (svg as SVGSVGElement).getScreenCTM()!,
              ).x,
            x!,
          );
          expect(box!.x).toBeGreaterThan(ladderCentre);
        }
      }
      if (scene === 'preparations') {
        for (const x of [24, 26]) {
          const unit = state.units.find((u) => u.side === 'wei' && u.x === x && u.y === 16)!;
          const crane = map.locator(`[data-piece="crane-${x},16"]`);
          const stone = map.locator(`[data-piece="millstone-${x},16"]`);
          const rope = stone.locator('line');
          for (const rig of [crane, stone]) {
            await expect(rig).toBeVisible();
            await expect(rig).toHaveAttribute('pointer-events', 'none');
            // Selection reorders the layers, so paint order means something only before any click.
            const selection = await page.getByTestId('preview-selection').textContent();
            if (state.units.some((candidate) => candidate.id === selection)) continue;
            expect(
              await rig.evaluate((el, id) => {
                const covers = [
                  document.querySelector(`[data-unit="${id}"]`)!,
                  ...document.querySelectorAll(
                    '[data-object="gate-south"], [data-object="wall-south-e-parapet"]',
                  ),
                ];
                return covers.every((cover) =>
                  Boolean(cover.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
                );
              }, unit.id),
            ).toBe(true);
          }
          await expect(rope).toHaveCount(1);
          const ropeBox = await rope.boundingBox();
          // Chromium's box for an SVG line includes its stroke.
          expect(ropeBox!.height).toBeGreaterThanOrEqual(12 * zoom);
          expect(ropeBox!.height).toBeLessThan(14 * zoom);
          const figure = map.locator(`[data-unit="${unit.id}"] [data-sprite="figure"]`).last();
          const box = await figure.boundingBox();
          const stoneTop = await rope.evaluate((el) => {
            const line = el as SVGLineElement;
            return new DOMPoint(line.x2.baseVal.value, line.y2.baseVal.value).matrixTransform(
              line.getScreenCTM()!,
            ).y;
          });
          expect(stoneTop).toBeGreaterThan(box!.y + box!.height);
          await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
          await expect(page.getByTestId('preview-selection')).toHaveText(unit.id);
          // Selection must leave the whole warning opaque.
          expect(await crane.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
          expect(await stone.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
        }
        console.info(
          `millstone rigs: 2; ropes: 2; rope length: ${12 * zoom}px at ${zoom * 100}%; gate/plain-wall selections: 2`,
        );
      }
      await page.screenshot({
        path: `.artifacts/siege/screens/render-${scene}-${zoom * 100}.png`,
        animations: 'disabled',
      });
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

test('v0.2 storming and repulse cover their ladders and gate-top figures cover the tower', async ({
  page,
}) => {
  await page.goto('/?siege-map&scene=assault');
  const map = page.getByTestId('siege-map');
  for (const [index, x] of [18, 29].entries()) {
    const id = createRenderScene('assault').state.units[index + 1]!.id;
    expect(
      await map.evaluate(
        (svg, { id, x }) => {
          const storm = svg.querySelector(`[data-piece="storm-${id}"]`)!;
          return [...svg.querySelectorAll(`[data-piece="ladder-${x}"]`)].every((ladder) =>
            Boolean(ladder.compareDocumentPosition(storm) & Node.DOCUMENT_POSITION_FOLLOWING),
          );
        },
        { id, x },
      ),
    ).toBe(true);
  }
  await page.goto('/?siege-map&scene=preparations');
  const gateUnit = map.locator('[data-gate-top="gate-south"]').first();
  await expect(gateUnit).toBeVisible();
  expect(
    await gateUnit.evaluate((unit) =>
      [...document.querySelectorAll('[data-object="gate-south"]')].every((tower) =>
        Boolean(tower.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
    ),
  ).toBe(true);
  const box = await gateUnit.locator('[data-sprite="figure"]').last().boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByTestId('preview-selection')).toHaveText(
    (await gateUnit.getAttribute('data-unit'))!,
  );
});

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
