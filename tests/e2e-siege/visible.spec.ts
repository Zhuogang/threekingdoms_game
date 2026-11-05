import { expect, test } from '@playwright/test';
import { createRenderScene } from '../../src/siege/dev/renderScenes';
import { shot } from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });

for (const zoom of [1, 0.75]) {
  test(`living units are visible and selectable at ${zoom * 100}% without selection`, async ({
    page,
  }) => {
    await page.goto('/?siege-map&scene=visible');
    const map = page.getByTestId('siege-map');
    const reset = async () => {
      await page.getByTestId(`zoom-${zoom}`).click();
      await expect(map).toHaveAttribute('data-selected', '');
      await expect(map).toHaveAttribute('data-zoom', zoom.toFixed(2));
    };
    await expect(map).toHaveAttribute('data-ready', 'true');
    await page.waitForLoadState('networkidle');
    await reset();
    const alive = createRenderScene('visible').state.units.filter((u) => u.troops > 0);
    const visible = await map.evaluate(
      (svg, ids) => {
        const mapBox = svg.getBoundingClientRect();
        const overlaps = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const slices = [...svg.querySelectorAll<SVGGElement>('[data-object][clip-path]')].filter(
          (g) => /wall|parapet|gate|corner/.test(g.dataset.object!),
        );
        return ids.flatMap((id) => {
          const hit = svg.querySelector<SVGRectElement>(`[data-testid="map-unit-${id}"]`)!;
          if (!overlaps(hit.getBoundingClientRect(), mapBox)) return [];
          const unit = svg.querySelector<SVGGElement>(`[data-unit="${id}"]`)!;
          const figures = [...unit.querySelectorAll<SVGImageElement>('image[data-sprite]')];
          const effectiveOpacity = (el: Element) => {
            let opacity = 1;
            for (let node: Element | null = el; node && node !== svg; node = node.parentElement)
              opacity *= Number(getComputedStyle(node).opacity);
            return opacity;
          };
          const blocking = slices.filter((slice) => {
            const clipId = slice.getAttribute('clip-path')!.slice(5, -1);
            const clip = document.getElementById(clipId)!.querySelector('rect')!;
            const point = (x: number, y: number) =>
              new DOMPoint(x, y).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
            const a = point(clip.x.baseVal.value, clip.y.baseVal.value);
            const b = point(
              clip.x.baseVal.value + clip.width.baseVal.value,
              clip.y.baseVal.value + clip.height.baseVal.value,
            );
            const box = new DOMRect(a.x, a.y, b.x - a.x, b.y - a.y);
            return figures.some((figure) => overlaps(figure.getBoundingClientRect(), box));
          });
          const ladderSlices = [
            ...svg.querySelectorAll('[data-piece="starting-ladder-1"][clip-path]'),
          ];
          return [
            {
              id,
              figures: figures.length,
              opacity: Math.min(...figures.map(effectiveOpacity)),
              mask: unit.parentElement?.getAttribute('mask'),
              disc: unit.querySelectorAll('ellipse').length,
              bars: unit.querySelectorAll('rect').length,
              overlaps: blocking.length,
              coveredBy: blocking
                .filter(
                  (slice) =>
                    !(slice.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING),
                )
                .map((slice) => slice.getAttribute('data-object')),
              clearsLadder:
                id !== 'shu-jiangwei' ||
                ladderSlices.every((slice) =>
                  Boolean(slice.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING),
                ),
            },
          ];
        });
      },
      alive.map((u) => u.id),
    );
    // Every position from look-probe must be in this framing, including Wei.
    for (const id of [
      'shu-weiyan',
      'shu-wangping',
      'shu-liaohua',
      'shu-jiangwei',
      'shu-wuyi',
      'shu-captain-1',
      'wei-wangsheng',
    ])
      expect(visible.map((u) => u.id)).toContain(id);
    for (const unit of visible) {
      expect(unit.figures, unit.id).toBeGreaterThan(0);
      expect(unit.opacity, unit.id).toBeGreaterThanOrEqual(0.8);
      expect(unit.mask, unit.id).toBeNull();
      expect(unit.disc, unit.id).toBe(1);
      expect(unit.bars, unit.id).toBe(2);
      expect(unit.coveredBy, unit.id).toEqual([]);
      expect(unit.clearsLadder, unit.id).toBe(true);
    }
    expect(Number(await map.getAttribute('data-sprite-count'))).toBeLessThanOrEqual(512);
    await shot(page, `visible-${zoom * 100}`);
    // Reset selection before each click, so enemy clicks select rather than target.
    for (const { id } of visible) {
      await reset();
      // Partly visible formations can have their centre outside the viewport.
      // Pan through the real minimap before clicking that exact centre.
      const centre = await page.getByTestId(`map-unit-${id}`).evaluate((el) => {
        const rect = el as SVGRectElement;
        return {
          x: rect.x.baseVal.value + rect.width.baseVal.value / 2,
          y: rect.y.baseVal.value + rect.height.baseVal.value / 2,
        };
      });
      const mini = (await page.locator('.siege-minimap').boundingBox())!;
      await page.mouse.click(
        mini.x + (centre.x / 3072) * mini.width,
        mini.y + (centre.y / 1536) * mini.height,
      );
      const box = (await page.getByTestId(`map-unit-${id}`).boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByTestId('preview-selection')).toHaveText(id);
      await expect(map).toHaveAttribute('data-selected', id);
    }
    console.info(JSON.stringify({ zoom, visible, clicks: visible.length }));
  });
}
