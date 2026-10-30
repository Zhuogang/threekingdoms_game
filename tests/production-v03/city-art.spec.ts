import { expect, test } from '@playwright/test';

test('city paintings and the active campaign background load under the production subpath', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?lang=zh');
  await page.getByRole('button', { name: '新战役', exact: true }).click();
  const background = page.locator('.v03-map-frame svg image').first();
  expect(new URL((await background.getAttribute('href'))!, page.url()).pathname).toBe(
    '/hegemony/assets/v03/maps/campaign-china-full-ink-01.webp',
  );
  await page.getByRole('button', { name: '陈留', exact: true }).click();
  const image = page.locator('.v03-city-illustration img');
  await expect(image).toHaveJSProperty('naturalWidth', 512);
  expect(new URL((await image.getAttribute('src'))!, page.url()).pathname).toBe(
    '/hegemony/assets/v03/cities/city-plains-ink-02.webp',
  );
  await page.setViewportSize({ width: 900, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect
    .poll(() =>
      page.locator('.v03-city-hero').evaluate((node) => {
        const art = node.querySelector('.v03-city-illustration')!.getBoundingClientRect();
        const summary = node.querySelector('.v03-city-summary')!.getBoundingClientRect();
        return summary.top >= art.bottom;
      }),
    )
    .toBe(true);
  const body = await page
    .locator('.v03-window-body')
    .evaluate((node) => ({ width: node.clientWidth, content: node.scrollWidth }));
  expect(body.content).toBeLessThanOrEqual(body.width);
  const lastAction = page.locator('.v03-city-op').last();
  await lastAction.scrollIntoViewIfNeeded();
  await expect(lastAction).toBeInViewport();
  await expect(page.locator('.v03-window-footer button').first()).toBeInViewport();
  expect(errors).toEqual([]);
});
