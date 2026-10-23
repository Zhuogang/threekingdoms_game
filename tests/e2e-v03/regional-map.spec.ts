import { expect, test, type Page } from '@playwright/test';
import { CITY_GEOGRAPHY } from '../../src/v03/geography';

async function start(page: Page, locale: 'en' | 'zh') {
  await page.goto(`/?lang=${locale}&debug=1`);
  await page
    .getByRole('button', { name: locale === 'zh' ? '新战役' : 'New campaign', exact: true })
    .click();
  await expect(page.locator('.v03-city-symbol')).toHaveCount(24);
  await page.evaluate(() => document.fonts.ready);
}

for (const locale of ['en', 'zh'] as const) {
  test(`regional map keeps its extent, aspect and margins across screen sizes (${locale})`, async ({
    page,
  }) => {
    await start(page, locale);
    for (const [width, height] of [
      [1920, 1200],
      [1366, 768],
      [1920, 780],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: width!, height: height! });
      await expect
        .poll(async () => {
          const frame = await page.locator('.v03-map-frame').boundingBox();
          return Math.abs(frame!.width / frame!.height - 1.6);
        })
        .toBeLessThan(0.001);
      await expect
        .poll(async () => {
          const view = await page.locator('.v03-map-frame > svg').first().getAttribute('viewBox');
          return Math.abs(Number(view!.split(' ')[2]) - 1600);
        })
        .toBeLessThan(0.1);
      const layout = await page.evaluate(() => {
        const frame = document.querySelector('.v03-map-frame')!.getBoundingClientRect();
        const stage = document.querySelector('.v03-campaign-map-stage')!.getBoundingClientRect();
        const labels = [...document.querySelectorAll('.v03-city-label')].map((node) =>
          node.getBoundingClientRect(),
        );
        let overlaps = 0;
        for (let i = 0; i < labels.length; i++)
          for (let j = i + 1; j < labels.length; j++) {
            const a = labels[i]!,
              b = labels[j]!;
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
              overlaps++;
          }
        return {
          margin: Math.min(
            frame.left - stage.left,
            stage.right - frame.right,
            frame.top - stage.top,
            stage.bottom - frame.bottom,
          ),
          clippedLabels: labels.filter(
            (label) =>
              label.left < frame.left ||
              label.right > frame.right ||
              label.top < frame.top ||
              label.bottom > frame.bottom,
          ).length,
          overlaps,
          overflow:
            document.documentElement.scrollWidth > innerWidth ||
            document.documentElement.scrollHeight > innerHeight,
        };
      });
      expect(layout.margin).toBeGreaterThanOrEqual(11.5);
      expect(layout).toMatchObject({ clippedLabels: 0, overlaps: 0, overflow: false });
    }
  });

  test(`all city anchors remain clickable and the camera survives city windows (${locale})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await start(page, locale);
    const map = page.locator('.v03-map-frame > svg').first();
    const before = await map.getAttribute('viewBox');
    for (const city of CITY_GEOGRAPHY) {
      const symbol = page.locator(`.v03-city-symbol[data-city-id="${city.id}"]`);
      const expectedName = await symbol.getAttribute('aria-label');
      const anchor = await symbol.evaluate((element) => {
        const matrix = (element as SVGGraphicsElement).getScreenCTM()!;
        return { x: matrix.e, y: matrix.f };
      });
      await page.mouse.click(anchor.x, anchor.y);
      await expect(page.getByRole('dialog')).toHaveAccessibleName(expectedName!);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await map.getAttribute('viewBox')).toBe(before);
      await symbol.locator('.v03-city-label').click();
      await expect(page.getByRole('dialog')).toHaveAccessibleName(expectedName!);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page
      .getByRole('button', { name: locale === 'zh' ? '放大地图' : 'Zoom in map', exact: true })
      .click();
    await expect(map).not.toHaveAttribute('viewBox', before!);
    const zoomed = await map.getAttribute('viewBox');
    await map.focus();
    await page.keyboard.press('ArrowRight');
    await expect(map).not.toHaveAttribute('viewBox', zoomed!);
    await page
      .getByRole('button', { name: locale === 'zh' ? '切换小地图' : 'Toggle minimap', exact: true })
      .click();
    const mini = page.locator('.v03-campaign-minimap');
    await expect(mini).toBeVisible();
    await mini.focus();
    const panned = await map.getAttribute('viewBox');
    await page.keyboard.press('ArrowLeft');
    await expect(map).not.toHaveAttribute('viewBox', panned!);
    await map.focus();
    await page.keyboard.press('Home');
    await expect(map).toHaveAttribute('viewBox', before!);
  });
}
