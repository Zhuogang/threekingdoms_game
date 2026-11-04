import { mkdir } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { SIEGE_SAVE_KEY, type SiegeSave } from '../../src/siege/save';

export const snapshot = (page: Page) => page.evaluate(() => window.__siegeDev!.snapshot());
export async function shot(page: Page, name: string) {
  await mkdir('.artifacts/siege/screens', { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.artifacts/siege/screens/${name}.png`, animations: 'disabled' });
}
/** Click the cell's SVG geometry, avoiding artwork bounds, strokes and reordered unit layers. */
export async function clickCell(page: Page, overlay: string, cell: string) {
  const position = await page
    .locator(`[data-overlay="${overlay}"][data-cell="${cell}"]`)
    .evaluate((element) => {
      const rect = element as SVGRectElement;
      const point = new DOMPoint(
        rect.x.baseVal.value + rect.width.baseVal.value / 2,
        rect.y.baseVal.value + rect.height.baseVal.value / 2,
      ).matrixTransform(rect.getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
  await page.mouse.click(position.x, position.y);
}
export async function closeReport(page: Page) {
  await expect(page.getByTestId('morning-report')).toBeVisible();
  await page.getByTestId('report-close').click();
}
export async function dismissCounters(page: Page) {
  for (let i = 0; i < 8 && (await page.getByTestId('counter-card').count()); i++)
    await page.getByTestId('counter-dismiss').click();
}
export async function start(page: Page, locale: 'en' | 'zh' = 'en', seed = 228) {
  await page.goto(`/?lang=${locale}&siegeSeed=${seed}`);
  await page
    .getByTestId('chencang-campaign')
    .getByRole('button', { name: locale === 'en' ? 'Start' : '开始', exact: true })
    .click();
  await page
    .getByRole('button', { name: locale === 'en' ? 'Skip opening' : '跳过开场', exact: true })
    .click();
  await expect(page.locator('[data-phase="deploy"]')).toBeVisible();
}
export async function begin(page: Page, locale: 'en' | 'zh' = 'en') {
  await page
    .getByRole('button', { name: locale === 'en' ? 'Begin siege' : '开始攻城', exact: true })
    .click();
  await page.getByTestId('banner-act1').getByRole('button').click();
  await closeReport(page);
}
export async function endDay(page: Page) {
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('replay-skip')).toBeVisible();
  await page.getByTestId('replay-skip').click();
}
export async function loadFixture(page: Page, game: SiegeSave, locale: 'en' | 'zh' = 'en') {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: SIEGE_SAVE_KEY, value: JSON.stringify(game) },
  );
  await page.goto(`/?lang=${locale}#chencang/load`);
  await expect(
    page.locator(`[data-phase="${game.state.outcome ? 'ending' : game.phase}"]`),
  ).toBeVisible();
}
