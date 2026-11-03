import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { SIEGE_SAVE_KEY } from '../../src/siege/save';

const screens = '.artifacts/siege/screens';
async function shot(page: Page, name: string) {
  await mkdir(screens, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${screens}/${name}.png`, animations: 'disabled' });
}
async function start(page: Page, seed: number, screenshots = false) {
  await page.goto(`/?lang=zh&siegeSeed=${seed}`);
  const card = page.getByTestId('chencang-campaign');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText('建兴六年冬');
  await expect(card.getByRole('button', { name: '继续攻城' })).toHaveCount(0);
  if (screenshots) await shot(page, 'card');
  await card.getByRole('button', { name: '开始', exact: true }).click();
  for (let step = 0; step < 6; step++) {
    await expect(page.getByTestId(step < 3 ? 'opening-1' : 'opening-2')).toBeVisible();
    if (screenshots && step === 0) await shot(page, 'opening-1');
    if (screenshots && step === 3) await shot(page, 'opening-2');
    await expect(page.getByTestId('opening-dialogue')).not.toBeEmpty();
    await page.getByTestId('opening-next').click();
  }
  await expect(page.locator('[data-phase="deploy"]')).toBeVisible();
  await page.getByRole('button', { name: '开始攻城', exact: true }).click();
  const banner = page.getByTestId('banner-act1');
  await expect(banner).toContainText('第一幕 云梯冲车');
  if (screenshots) await shot(page, 'banner-act1');
  await banner.getByRole('button', { name: '进入战场' }).click();
  await expect(page.getByTestId('siege-map')).toBeVisible();
}
async function script(page: Page, days?: number) {
  const before = await page.evaluate(() => window.__siegeDev!.snapshot().state.day);
  const result = await page.evaluate(
    (days) => window.__siegeDev!.playScript('competent', days),
    days,
  );
  if (result) await expect(page.locator('[data-phase="ending"]')).toBeVisible();
  else await expect(page.getByTestId('siege-day')).not.toHaveText(`第 ${before} 日`);
  return result;
}
async function checkEnding(page: Page, outcome: 'victory' | 'historical') {
  const ending = page.getByTestId(`ending-${outcome}`);
  await expect(ending).toBeVisible();
  const picture = ending.getByTestId('ending-picture');
  await expect(picture).toHaveAttribute(
    'src',
    new RegExp(`s7-0${outcome === 'victory' ? 5 : 6}-ending-`),
  );
  await expect(picture).toHaveJSProperty('complete', true);
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(ending.getByTestId('ending-narration').locator('p')).toHaveCount(2);
  await expect(ending.getByTestId('ending-narration')).not.toBeEmpty();
}

test('full opening, remembered wall and frontage hints, act banners, victory and bilingual summary', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page, 2, true);
  await expect(page.getByTestId('hint-wall')).toBeVisible();
  await shot(page, 'hint-wall');
  await page.getByTestId('hint-wall').getByRole('button', { name: '明白了' }).click();
  await page.getByTestId('select-wei-haozhao').click();
  await expect(page.getByTestId('attack-forecast')).toBeVisible();
  await expect(page.getByTestId('hint-frontage')).toBeVisible();
  await shot(page, 'hint-frontage');
  await page.getByTestId('hint-frontage').getByRole('button', { name: '明白了' }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    SIEGE_SAVE_KEY,
  );
  expect(saved.presentation.dismissedHints).toEqual(expect.arrayContaining(['wall', 'frontage']));
  await page.getByRole('button', { name: '返回开始画面', exact: true }).click();
  await page.getByTestId('chencang-campaign').getByRole('button', { name: '继续攻城' }).click();
  await expect(page.locator('[data-phase="battle"]')).toBeVisible();
  await expect(page.getByTestId('hint-wall')).toHaveCount(0);
  await expect(page.getByTestId('banner-act1')).toHaveCount(0);
  await page.getByTestId('select-wei-haozhao').click();
  await expect(page.getByTestId('attack-forecast')).toBeVisible();
  await expect(page.getByTestId('hint-frontage')).toHaveCount(0);
  for (let i = 0; i < 6; i++) {
    await script(page, 1);
    if (await page.getByTestId('banner-act2').count()) break;
  }
  const banner = page.getByTestId('banner-act2');
  await expect(banner).toContainText('第二幕 井阑重墙');
  await expect(banner).toContainText('诸葛亮');
  await shot(page, 'banner-act2');
  await banner.getByRole('button', { name: '进入战场' }).click();
  expect(await script(page)).toBe('victory');
  await checkEnding(page, 'victory');
  await shot(page, 'ending-victory');
  await page.getByRole('button', { name: '查看总结' }).click();
  const summary = page.getByTestId('siege-summary');
  await expect(summary).toContainText('作战日数：16');
  for (const text of ['双方损失', '各类器械', '城门耐久', '城堑格', '史实'])
    await expect(summary).toContainText(text);
  await shot(page, 'summary');
  await page.getByRole('button', { name: '回看结局' }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByTestId('ending-narration')).toContainText('Shu banners rise');
  await shot(page, 'en-ending');
  await page.getByRole('button', { name: 'View summary', exact: true }).click();
  await expect(summary).toContainText('In history');
  await expect(summary).toContainText('Days fought: 16');
  expect(errors).toEqual([]);
});

test('a full historical playthrough runs out of grain and shows the retreat and summary', async ({
  page,
}) => {
  await start(page, 1);
  expect(await script(page)).toBe('historical');
  const snapshot = await page.evaluate(() => window.__siegeDev!.snapshot());
  expect(snapshot.state.day).toBe(20);
  expect(snapshot.state.grain).toBe(0);
  await checkEnding(page, 'historical');
  await expect(page.getByTestId('ending-narration')).toContainText('王双');
  await shot(page, 'ending-historical');
  await page.getByRole('button', { name: '查看总结' }).click();
  await expect(page.getByTestId('siege-summary')).toContainText('作战日数：20');
  await expect(page.getByTestId('siege-summary')).toContainText('张郃援军将近');
});

test('voluntary withdrawal uses the historical picture and lower rating', async ({ page }) => {
  await start(page, 2);
  await page.getByRole('button', { name: '撤军', exact: true }).click();
  await checkEnding(page, 'historical');
  await expect(page.getByTestId('ending-rating')).toContainText('较低评价');
  await expect(page.getByTestId('ending-narration')).toContainText('提前撤军');
  await page.getByRole('button', { name: '查看总结' }).click();
  await expect(page.getByTestId('siege-summary')).toContainText('作战日数：1');
});

test('opening progress survives save and continue, and the opening can be skipped', async ({
  page,
}) => {
  await page.goto('/?lang=en&siegeSeed=2#chencang');
  for (let i = 0; i < 3; i++) await page.getByTestId('opening-next').click();
  await expect(page.getByTestId('opening-2')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Return to start', exact: true }).click();
  await page
    .getByTestId('chencang-campaign')
    .getByRole('button', { name: 'Continue siege' })
    .click();
  await expect(page.getByTestId('opening-2')).toBeVisible();
  await expect(page.getByTestId('opening-dialogue')).toContainText('returned to ask once more');
  await page.getByRole('button', { name: 'Skip opening', exact: true }).click();
  await expect(page.locator('[data-phase="deploy"]')).toBeVisible();
});
