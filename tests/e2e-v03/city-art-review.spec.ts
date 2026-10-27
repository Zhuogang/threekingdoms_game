import { expect, test, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { asSave } from './playability-fixtures';

async function start(page: Page, locale: 'en' | 'zh', richCity = false) {
  await page.goto(`/?lang=${locale}`);
  if (richCity) {
    const state = createV03Game('cao', 742);
    Object.assign(
      state.cities.find((city) => city.id === 'chenliu')!,
      {
        food: 9_999_999,
        gold: 8_888_888,
      },
    );
    await page.evaluate(
      (save) => localStorage.setItem('hegemony-v0.3:autosave', save),
      asSave(state),
    );
    await page.reload();
  } else
    await page
      .getByRole('button', { name: locale === 'en' ? 'New campaign' : '新战役', exact: true })
      .click();
}

async function checkContained(page: Page) {
  const measurements = await page.locator('.v03-campaign-window').evaluate((dialog) => {
    const body = dialog.querySelector('.v03-window-body')!;
    return {
      bodyWidth: body.clientWidth,
      contentWidth: body.scrollWidth,
      statistics: [...dialog.querySelectorAll('.v03-stat-grid dd')].map((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const content = range.getBoundingClientRect(),
          cell = node.getBoundingClientRect();
        return {
          text: node.textContent,
          left: content.left,
          right: content.right,
          cellLeft: cell.left,
          cellRight: cell.right,
        };
      }),
    };
  });
  expect(measurements.contentWidth).toBeLessThanOrEqual(measurements.bodyWidth);
  for (const cell of measurements.statistics) {
    expect(cell.left, cell.text!).toBeGreaterThanOrEqual(cell.cellLeft - 1);
    expect(cell.right, cell.text!).toBeLessThanOrEqual(cell.cellRight + 1);
  }
  const lastAction = page.locator('.v03-city-action').last();
  await lastAction.scrollIntoViewIfNeeded();
  await expect(lastAction).toBeInViewport();
  await expect(page.locator('.v03-window-footer button').first()).toBeInViewport();
}

test('city layout responds to its actual width at 200 percent zoom above the viewport breakpoint', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await start(page, 'en');
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await page.getByRole('button', { name: 'Ruler’s capital', exact: true }).click();
  await expect(page.locator('.v03-city-illustration img')).toHaveJSProperty('naturalWidth', 512);
  await checkContained(page);
  const hero = await page.locator('.v03-city-hero').evaluate((node) => ({
    art: node.querySelector('.v03-city-illustration')!.getBoundingClientRect().toJSON(),
    summary: node.querySelector('.v03-city-summary')!.getBoundingClientRect().toJSON(),
  }));
  expect(hero.summary.y).toBeGreaterThanOrEqual(hero.art.bottom);
  await page.screenshot({ path: testInfo.outputPath('zoom-200-en.png') });
});

for (const locale of ['en', 'zh'] as const)
  test(`320px city view contains large stocks and all actions ${locale}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await start(page, locale, true);
    await page
      .getByRole('button', { name: locale === 'en' ? 'Ruler’s capital' : '君主本城', exact: true })
      .click();
    await expect(page.locator('.v03-city-illustration img')).toHaveJSProperty('naturalWidth', 512);
    await expect(page.locator('.v03-stat-grid')).toContainText('9,999,999');
    await checkContained(page);
    await page.screenshot({ path: testInfo.outputPath(`small-stocks-${locale}.png`) });
  });

test('slow and corrupt city images keep the same frame and actions; reopening retries', async ({
  page,
}, testInfo) => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pattern = '**/assets/v03/cities/city-plains-ink-02.webp';
  await page.route(pattern, async (route) => {
    await blocked;
    await route.fulfill({ contentType: 'image/webp', body: 'invalid image' });
  });
  await page.setViewportSize({ width: 320, height: 640 });
  try {
    await start(page, 'en');
    await page.getByRole('button', { name: 'Chenliu', exact: true }).click();
    const frame = page.locator('.v03-city-illustration');
    await expect(frame.locator('img')).toHaveJSProperty('naturalWidth', 0);
    const before = (await frame.boundingBox())!;
    release();
    await expect(frame.locator('.v03-city-art-fallback')).toHaveText('陈');
    const after = (await frame.boundingBox())!;
    expect(after.height).toBeCloseTo(before.height, 1);
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.height / after.width).toBeCloseTo(0.75, 2);
    await checkContained(page);
    await page.screenshot({ path: testInfo.outputPath('failed-image-320-en.png') });
    await page.unroute(pattern);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Chenliu', exact: true }).click();
    await expect(frame.locator('img')).toHaveJSProperty('naturalWidth', 512);
    await expect(frame.locator('.v03-city-art-fallback')).toHaveCount(0);
  } finally {
    release();
  }
});
