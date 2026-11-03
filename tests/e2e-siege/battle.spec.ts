import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_SAVE_KEY } from '../../src/siege/save';
import type { SiegeSave } from '../../src/siege/save';
const screens = '.artifacts/siege/screens';
async function shot(page: Page, name: string) {
  await mkdir(screens, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screens}/${name}.png`, animations: 'disabled' });
}
async function units(page: Page) {
  return page
    .locator('[data-testid="siege-map"] [data-unit]')
    .evaluateAll((elements) =>
      [
        ...new Set(
          elements.map(
            (el) =>
              `${el.getAttribute('data-unit')}:${el.getAttribute('data-x')},${el.getAttribute('data-y')}:${el.getAttribute('data-troops')}`,
          ),
        ),
      ].sort(),
    );
}
async function savedGame(page: Page, game: SiegeSave) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: SIEGE_SAVE_KEY,
    value: JSON.stringify(game),
  });
  await page.goto('/?lang=en#chencang/load');
  await expect(page.locator('[data-phase="battle"]')).toBeVisible();
}

test('Chencang: deploy, move, forecast, build, resolve AI, save and load, switch language', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lang=zh');
  const card = page.getByTestId('chencang-campaign');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText('陈仓之战');
  await shot(page, 'start');
  await card.getByRole('button', { name: '开始', exact: true }).click();
  await page.getByRole('button', { name: '跳过开场', exact: true }).click();
  await expect(page.locator('[data-phase="deploy"]')).toBeVisible();
  await expect(page.getByTestId('siege-map')).toBeVisible();
  await page.getByTestId('select-shu-captain-3').click();
  await page
    .locator('[data-overlay="deploy"][data-cell="23,21,ground"]')
    .click({ position: { x: 30, y: 10 } });
  await expect(page.locator('[data-unit="shu-captain-3"]').first()).toHaveAttribute('data-x', '23');
  await expect(page.locator('[data-unit="shu-captain-3"]').first()).toHaveAttribute('data-y', '21');
  await shot(page, 'deploy');
  await page.getByRole('button', { name: '开始攻城', exact: true }).click();
  await expect(page.locator('[data-phase="battle"]')).toBeVisible();
  await page.getByRole('button', { name: '进入战场', exact: true }).click();
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page.getByRole('button', { name: '南门', exact: true }).click();
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-zoom', '1.00');
  await shot(page, 'battle-100');
  await page.getByRole('button', { name: '50%', exact: true }).click();
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-zoom', '0.50');
  await shot(page, 'battle-50');
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page.getByRole('button', { name: '移动', exact: true }).click();
  await page.locator('[data-overlay="reachable"][data-cell="23,18,ground"]').click();
  await expect(page.locator('[data-unit="shu-captain-3"]').first()).toHaveAttribute('data-y', '18');
  await page.getByTestId('select-wei-haozhao').click();
  const forecast = page.getByTestId('attack-forecast');
  await expect(forecast).toContainText('女墙掩护 ×0.3');
  await expect(forecast).toContainText('正面 600');
  await forecast.scrollIntoViewIfNeeded();
  await shot(page, 'forecast');
  await forecast.getByRole('button', { name: '确认攻击' }).click();
  await page.getByRole('tab', { name: '工棚', exact: true }).click();
  await page.getByTestId('build-workshop-1-earthCart').click();
  await expect(page.getByTestId('queue-workshop-1')).toContainText('土车');
  await shot(page, 'workshop');
  await page.getByRole('tab', { name: '城防', exact: true }).click();
  await expect(page.getByRole('heading', { name: '城门耐久' })).toBeVisible();
  await expect(page.locator('progress')).toHaveCount(4);
  await shot(page, 'defence');
  await page.getByRole('button', { name: '结束本日 [E]', exact: true }).click();
  await expect(page.getByTestId('siege-day')).toHaveText('第 2 日', { timeout: 20_000 });
  await shot(page, 'day2');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const before = await units(page);
  const stored = await page.evaluate((key) => localStorage.getItem(key), SIEGE_SAVE_KEY);
  expect(JSON.parse(stored!).state.day).toBe(2);
  expect(
    JSON.parse(stored!).state.engines.some((e: { kind: string }) => e.kind === 'earthCart'),
  ).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: '读取', exact: true }).click();
  await expect(page.getByTestId('siege-day')).toHaveText('第 2 日');
  expect(await units(page)).toEqual(before);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByTestId('siege-day')).toHaveText('Day 2');
  await expect(page.getByRole('tab', { name: 'Workshop', exact: true })).toBeVisible();
  await shot(page, 'en');
  expect(errors).toEqual([]);
});

test('keyboard, corrupted save, six-engine cap, playback skip and withdrawal ending', async ({
  page,
}) => {
  const state = createSiegeState(228);
  state.engines = Array.from({ length: 6 }, (_, i) => ({
    id: `cart-${i}`,
    kind: 'earthCart' as const,
    x: 12 + i,
    y: 20,
    durability: 50,
    max: 50,
    burning: false,
    wrecked: false,
    uses: 3,
  }));
  await savedGame(page, { state, phase: 'battle', facings: {} });
  await page.getByRole('tab', { name: 'Workshop', exact: true }).click();
  const cart = page.getByTestId('build-workshop-1-earthCart');
  await expect(cart).toBeDisabled();
  await expect(cart).toHaveAttribute('title', 'There are already six usable engines on the map.');
  await page.getByRole('tab', { name: 'Units & actions', exact: true }).click();
  await page.getByTestId('select-shu-weiyan').click();
  await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Stand by [W]', exact: true })).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('select-shu-jiangwei')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Skip playback', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('siege-day')).toHaveText('Day 2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.evaluate((key) => localStorage.setItem(key, '{}'), SIEGE_SAVE_KEY);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Siege save is invalid');
  await expect(page.getByTestId('siege-day')).toHaveText('Day 2');
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.locator('[data-phase="ending"]')).toContainText('Withdrawal from Chencang');
  await expect(page.getByTestId('ending-rating')).toContainText('Lower rating');
});

test('day twenty reaches the grain ending and keeps the independent slot', async ({ page }) => {
  const state = createSiegeState(31);
  state.day = 20;
  state.act = 2;
  state.grain = 1;
  await savedGame(page, { state, phase: 'battle', facings: {} });
  await page.getByRole('button', { name: 'End day [E]', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-phase="ending"]')).toContainText('Withdrawal from Chencang');
});
