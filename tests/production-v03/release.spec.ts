import { expect, test } from '@playwright/test';

const AUTOSAVE_KEY = 'hegemony-v0.3:autosave';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__v03_production_test_initialized') !== '1') {
      localStorage.clear();
      sessionStorage.setItem('__v03_production_test_initialized', '1');
    }
  });
});

test('production release serves v0.3 under a subpath and restores its campaign save', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1')
      externalRequests.push(url.href);
  });

  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Hegemony of the Three Kingdoms · v0.3');

  const atlasResponse = page.waitForResponse((candidate) =>
    candidate.url().includes('/hegemony/assets/v03/maps/campaign-ink-map-01.webp'),
  );
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
  expect((await atlasResponse).status()).toBe(200);
  const atlasHref = await page.locator('.v03-map-frame svg image').first().getAttribute('href');
  expect(new URL(atlasHref!, page.url()).pathname).toBe(
    '/hegemony/assets/v03/maps/campaign-ink-map-01.webp',
  );

  await page.getByRole('button', { name: 'Advance 1 day', exact: true }).click();
  await expect(page.locator('.v03-date strong')).toContainText('Day 2');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), AUTOSAVE_KEY))
    .not.toBeNull();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), AUTOSAVE_KEY);
  expect(stored).toMatchObject({ format: 'hegemony.save', version: 3, ruleset: 'hegemony-3' });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Advance 1 day', exact: true })).toBeVisible();
  await expect(page.locator('.v03-date strong')).toContainText('Day 2');
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});
