import { expect, test } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { encodeV03Save } from '../../src/v03/platform/storage';

test('new portraits and the lazy directory load from the production subpath', async ({ page }) => {
  const failed: string[] = [];
  const external: string[] = [];
  page.on('requestfailed', (request) => failed.push(request.url()));
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url());
  });
  await page.goto('./?lang=zh');
  await page.evaluate(
    (payload) => localStorage.setItem('hegemony-v0.3:autosave', payload),
    encodeV03Save(createV03Game('cao', 19, 'guandu-200')),
  );
  await page.reload();
  await page.getByRole('button', { name: '人物名册', exact: true }).click();
  await expect(page.locator('.v03-directory-card')).toHaveCount(12);
  await page.getByRole('textbox', { name: '查找姓名或复姓' }).fill('诸葛亮');
  await expect
    .poll(() =>
      page
        .locator('.v03-directory-card img')
        .evaluate((image) => new URL((image as HTMLImageElement).src).pathname),
    )
    .toBe('/hegemony/assets/v03/portraits/zhugeliang-small.webp');
  await page.getByRole('button', { name: '诸葛亮', exact: true }).click();
  const portrait = page.locator('.v03-profile-hero img');
  await expect
    .poll(() => portrait.evaluate((image) => new URL((image as HTMLImageElement).src).pathname))
    .toBe('/hegemony/assets/v03/portraits/zhugeliang.webp');
  await expect(portrait).toHaveJSProperty('naturalWidth', 256);
  await expect(page.locator('.v03-officer-profile')).toHaveAttribute('data-status', 'free');
  await page.reload();
  await page.getByRole('button', { name: '人物名册', exact: true }).click();
  await expect(page.locator('.v03-officer-directory')).toHaveAttribute('data-total', '98');
  expect(failed).toEqual([]);
  expect(external).toEqual([]);
});
