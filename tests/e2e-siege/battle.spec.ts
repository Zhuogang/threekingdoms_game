import { expect, test } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { siegeSaveKey } from '../../src/siege/save';
import { begin, closeReport, endDay, loadFixture, snapshot, start } from './helpers';

test('v0.2 workshop, defense, report, replay skip, bilingual save and load', async ({ page }) => {
  await start(page, 'zh');
  await begin(page, 'zh');
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.getByRole('tab', { name: '工棚', exact: true }).click();
  await page.getByTestId('build-workshop-1-earthCart').click();
  await expect(page.getByTestId('queue-workshop-1')).toContainText('土车');
  await page.getByRole('tab', { name: '城防', exact: true }).click();
  await expect(page.getByTestId('defense-panel')).toContainText('攀城压力');
  await endDay(page);
  await expect(page.getByTestId('siege-day')).toHaveText('第 2 日');
  await closeReport(page);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const before = await snapshot(page);
  await page.goto('/?lang=zh#chencang/load');
  await expect(page.locator('[data-phase="battle"]')).toBeVisible();
  await expect(page.getByTestId('siege-day')).toHaveText('第 2 日');
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByTestId('siege-day')).toHaveText('Day 2');
  await page.getByTestId('report-open').click();
  await expect(page.getByTestId('morning-report')).toContainText('Morning report');
  await closeReport(page);
});
test('actual engine cap, all-standby key, corrupted save and withdrawal', async ({ page }) => {
  const state = createSiegeState(228);
  state.engines = Array.from({ length: T.engineCap }, (_, i) => ({
    ...state.engines[0]!,
    id: `cart-${i}`,
    kind: 'earthCart' as const,
    x: 12 + i,
    y: 20,
    uses: T.cartLoads,
  }));
  await loadFixture(page, {
    state,
    playerSide: 'shu',
    phase: 'battle',
    facings: {},
    presentation: { openingStep: 6, bannersSeen: [1], dismissedHints: [], reportReadDay: 1 },
  });
  await page.getByRole('tab', { name: 'Workshop', exact: true }).click();
  await expect(page.getByTestId('build-workshop-1-earthCart')).toBeDisabled();
  await expect(page.getByTestId('build-workshop-1-earthCart')).toHaveAttribute(
    'title',
    `There are already ${T.engineCap} usable engines on the map.`,
  );
  await page.keyboard.press('q');
  expect(
    (await snapshot(page)).state.units
      .filter((u) => u.side === 'shu')
      .every((u) => u.acted && u.moved),
  ).toBe(true);
  await endDay(page);
  await closeReport(page);
  await page.evaluate((key) => localStorage.setItem(key, '{}'), siegeSaveKey('shu'));
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Siege save is invalid');
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByTestId('score-panel')).toContainText('Grain withdrawal');
});
test('the final tuned day reaches the grain ending', async ({ page }) => {
  const state = createSiegeState(31);
  state.day = T.days;
  state.act = 2;
  state.grain = 1;
  await loadFixture(page, {
    state,
    playerSide: 'shu',
    phase: 'battle',
    facings: {},
    presentation: {
      openingStep: 6,
      bannersSeen: [1, 2],
      dismissedHints: [],
      reportReadDay: T.days,
    },
  });
  await endDay(page);
  await expect(page.getByTestId('ending-historical')).toBeVisible();
  expect((await snapshot(page)).state.grain).toBe(0);
  await expect(page.getByTestId('score-panel')).toContainText('Orderly withdrawal');
});
