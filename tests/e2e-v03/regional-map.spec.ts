import { expect, test, type Page, type Locator } from '@playwright/test';
import { CITY_GEOGRAPHY } from '../../src/v03/geography';
import { CAMPAIGN_WORLD_BOUNDS } from '../../src/v03/geography/campaign-map';
import { fitCampaignViewport } from '../../src/v03/rendering/campaign-viewport';

async function expectFullCanvas(map: Locator) {
  const frame = (await map.boundingBox())!;
  const full = fitCampaignViewport(CAMPAIGN_WORLD_BOUNDS, frame.width / frame.height);
  await expect
    .poll(async () => {
      const actual = (await map.getAttribute('viewBox'))!.split(' ').map(Number);
      return Math.max(
        ...[full.left, full.top, full.width, full.height].map((value, index) =>
          Math.abs(value - actual[index]!),
        ),
      );
    })
    .toBeLessThan(0.1);
}

async function start(page: Page, locale: 'en' | 'zh') {
  await page.goto(`/?lang=${locale}&debug=1`);
  await page
    .getByRole('button', { name: locale === 'zh' ? '新战役' : 'New campaign', exact: true })
    .click();
  await expect(page.locator('.v03-city-symbol')).toHaveCount(24);
  await page.evaluate(() => document.fonts.ready);
}

for (const locale of ['en', 'zh'] as const) {
  test(`campaign canvas fills the available stage without stretching the map (${locale})`, async ({
    page,
  }) => {
    await start(page, locale);
    for (const [width, height] of [
      [1920, 1200],
      [1920, 922],
      [1366, 768],
      [1920, 780],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: width!, height: height! });
      await expect
        .poll(async () => {
          return page.evaluate(() => {
            const frame = document.querySelector('.v03-map-frame')!.getBoundingClientRect();
            const stage = document.querySelector('.v03-campaign-map-stage')!;
            const rect = stage.getBoundingClientRect();
            const style = getComputedStyle(stage);
            return Math.max(
              Math.abs(
                frame.width -
                  rect.width +
                  parseFloat(style.paddingLeft) +
                  parseFloat(style.paddingRight),
              ),
              Math.abs(
                frame.height -
                  rect.height +
                  parseFloat(style.paddingTop) +
                  parseFloat(style.paddingBottom),
              ),
            );
          });
        })
        .toBeLessThan(1);
      const map = page.locator('.v03-map-frame > svg').first();
      await map.focus();
      await page.keyboard.press('Home');
      await expectFullCanvas(map);
      await expect
        .poll(async () => {
          const frame = (await map.boundingBox())!;
          const view = (await map.getAttribute('viewBox'))!.split(' ').map(Number);
          return Math.abs(view[2]! / view[3]! - frame.width / frame.height);
        })
        .toBeLessThan(0.001);
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
    await expectFullCanvas(map);
  });
}

test('loads frontal city art and pans across the China-wide ink canvas', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  const failedAssets: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/assets/v03/') && response.status() >= 400)
      failedAssets.push(response.url());
  });
  await start(page, 'zh');
  const map = page.locator('.v03-map-frame > svg').first();
  await expect(map.locator(':scope > image')).toHaveAttribute(
    'href',
    /campaign-china-full-ink-01\.webp$/,
  );
  await expect(map.locator('.v03-city-artwork image')).toHaveCount(24);
  const art = await map
    .locator('.v03-city-artwork')
    .evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => node.getAttribute('data-city-art')))].sort(),
    );
  expect(art).toEqual([
    'basin',
    'frontier',
    'imperial',
    'jiangnan',
    'loess',
    'mountain',
    'plains',
    'river',
  ]);
  await page.waitForLoadState('networkidle');
  expect(failedAssets).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('campaign-ink-region.png') });

  const anchors = await map
    .locator('.v03-city-symbol')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')));
  const initial = await map.getAttribute('viewBox');
  const frame = (await map.boundingBox())!;
  await page.mouse.move(frame.x + frame.width * 0.1, frame.y + frame.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * 0.5, frame.y + frame.height * 0.65, { steps: 12 });
  await page.mouse.up();
  await expect(map).not.toHaveAttribute('viewBox', initial!);
  expect(Number((await map.getAttribute('viewBox'))!.split(' ')[0])).toBeLessThan(0);
  const panned = await map.getAttribute('viewBox');
  await page.mouse.wheel(0, -400);
  await expect(map).not.toHaveAttribute('viewBox', panned!);
  expect(
    await map
      .locator('.v03-city-symbol')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform'))),
  ).toEqual(anchors);
  await map.focus();
  await page.keyboard.press('Home');
  await expectFullCanvas(map);
  await page.screenshot({ path: testInfo.outputPath('campaign-ink-full-canvas.png') });
});
