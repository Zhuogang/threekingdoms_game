import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { V03GameState } from '../../src/v03/types';

async function state(page: Page): Promise<V03GameState> {
  return page.evaluate(
    () =>
      (window as unknown as { __V03_PLAYTEST__: { state: V03GameState } }).__V03_PLAYTEST__.state,
  );
}
async function city(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}
for (const width of [390, 1366, 1920])
  for (const lang of ['en', 'zh']) {
    test(`map to city to march and back ${width} ${lang}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({
        width,
        height: width === 390 ? 844 : width === 1366 ? 768 : 1080,
      });
      await page.goto(`/?debug=1&lang=${lang}`);
      await page
        .getByRole('button', { name: lang === 'zh' ? '新战役' : 'New campaign', exact: true })
        .click();
      const folder = '.artifacts/city-flow';
      await mkdir(folder, { recursive: true });
      await expect(page.locator('.v03-side-panel')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const map = page.locator('.v03-map-frame svg').first();
      const viewbox = await map.getAttribute('viewBox');
      await page.screenshot({ path: `${folder}/map-${width}-${lang}.png` });
      await city(page, lang === 'zh' ? '陈留' : 'Chenliu');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.v03-army-builder')).toHaveCount(0);
      await expect(dialog.locator('.v03-city-overview')).toBeVisible();
      await page.screenshot({ path: `${folder}/city-${width}-${lang}.png` });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      expect(await map.getAttribute('viewBox')).toBe(viewbox);
      await city(page, lang === 'zh' ? '陈留' : 'Chenliu');
      await dialog.getByRole('button', { name: lang === 'zh' ? /出征/ : /March out/ }).click();
      const send = dialog.getByRole('button', {
        name: lang === 'zh' ? '确认出征' : 'Confirm march',
        exact: true,
      });
      await expect(send).toBeDisabled();
      await dialog.locator('.v03-army-officer input').first().check();
      await dialog
        .getByLabel(lang === 'zh' ? '目的地（按势力、行程排序）' : 'Destination (house, then ETA)')
        .selectOption('luoyang');
      await expect(send).toBeEnabled();
      await page.screenshot({ path: `${folder}/march-${width}-${lang}.png` });
      const before = await state(page);
      await send.click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('.v03-march-notice')).toBeVisible();
      await expect(page.locator('.v03-army-marker.marching')).toBeVisible();
      const after = await state(page);
      const journey = after.journeys.find(
        (entry) => !before.journeys.some((old) => old.id === entry.id),
      )!;
      expect(journey).toMatchObject({
        kind: 'campaign',
        status: 'outbound',
        sourceCityId: 'chenliu',
        destinationCityId: 'luoyang',
      });
      expect(journey.manifest.officerIds).toHaveLength(1);
      const sourceBefore = before.cities.find((entry) => entry.id === 'chenliu')!;
      const sourceAfter = after.cities.find((entry) => entry.id === 'chenliu')!;
      expect(sourceBefore.garrisonTroops - sourceAfter.garrisonTroops).toBe(
        journey.manifest.troopCount,
      );
      expect(sourceBefore.food - sourceAfter.food).toBe(journey.manifest.carriedFood);
      expect(after.absoluteDay).toBe(before.absoluteDay);
      expect(await map.getAttribute('viewBox')).toBe(viewbox);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth > innerWidth ||
            document.documentElement.scrollHeight > innerHeight,
        ),
      ).toBe(false);
      await page.screenshot({ path: `${folder}/departed-${width}-${lang}.png` });
      await page
        .getByRole('button', {
          name: lang === 'zh' ? '军情与命令' : 'Marches & orders',
          exact: true,
        })
        .click();
      await expect(page.locator('.v03-order-card')).toContainText(
        lang === 'zh' ? '行军' : 'Marching',
      );
      await page.keyboard.press('Escape');
      await page
        .getByRole('button', { name: lang === 'zh' ? '推进一日' : 'Advance 1 day', exact: true })
        .click();
      expect((await state(page)).absoluteDay).toBe(before.absoluteDay + 1);
      expect(errors).toEqual([]);
    });
  }

test('cancel and failed march keep the city workflow and do not spend resources', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await city(page, 'Chenliu');
  await page.getByRole('button', { name: /March out/ }).click();
  const before = await state(page);
  await page.locator('.v03-army-officer input').first().check();
  await page.getByLabel('Destination (house, then ETA)').selectOption('luoyang');
  await page.getByRole('spinbutton').fill('1');
  await page.getByRole('button', { name: 'Confirm march', exact: true }).click();
  await expect(page.locator('.v03-window-feedback')).toBeVisible();
  expect(await state(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('.v03-city-overview')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('enemy city opens an attack plan from the nearest friendly city', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await city(page, 'Luoyang');
  await page.getByRole('button', { name: /March here/ }).click();
  await expect(page.locator('.v03-army-builder')).toBeVisible();
  await expect(page.getByLabel('Destination (house, then ETA)')).toHaveValue('luoyang');
  await expect(page.getByLabel('Source city')).not.toHaveValue('luoyang');
});

test('city window and return controls fit at 200 percent zoom; F1 opens accessible help', async ({
  page,
}) => {
  await page.setViewportSize({ width: 780, height: 900 });
  await page.goto('/?debug=1');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await page.getByRole('button', { name: 'Ruler’s capital', exact: true }).click();
  const rect = await page.locator('.v03-campaign-window').boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(781);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(901);
  await page.keyboard.press('F1');
  await expect(page.locator('.v03-campaign-window')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Field guide / Wiki' })).toBeVisible();
});

test('changing source resets officer selection and returns to the selected city', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await city(page, 'Chenliu');
  await page.getByRole('button', { name: /March out/ }).click();
  await page.locator('.v03-army-officer input').first().check();
  await page.getByLabel('Source city').selectOption('puyang');
  await expect(page.locator('.v03-window-header')).toContainText('Puyang');
  await expect(page.locator('.v03-army-officer input:checked')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to city', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Puyang');
});
