import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { ENGINE_RULES } from '../../src/siege/rules/day';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_SAVE_KEY, type SiegeSave } from '../../src/siege/save';
import { startWalkthrough, TRENCH_SOUTH_ROW } from '../../src/siege/ui/walkthrough';

async function shot(page: Page, name: string) {
  await mkdir('.artifacts/siege/screens', { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `.artifacts/siege/screens/${name}.png`, animations: 'disabled' });
}
async function snapshot(page: Page) {
  return page.evaluate(() => window.__siegeDev!.snapshot());
}

test('bilingual guide, deploy explanation, walkthrough day one, workshop supervise and persisted skip', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lang=zh');
  await page
    .getByTestId('chencang-campaign')
    .getByRole('button', { name: '开始', exact: true })
    .click();
  await page.getByRole('button', { name: '跳过开场', exact: true }).click();
  await expect(page.locator('[data-phase="deploy"]')).toBeVisible();
  await page.getByRole('tab', { name: '工棚', exact: true }).click();
  await expect(page.getByRole('note')).toContainText('开始攻城');
  await expect(page.getByTestId('build-workshop-1-earthCart')).toBeDisabled();
  await page.getByRole('tab', { name: '部队与行动', exact: true }).click();
  const before = await snapshot(page);
  await page.getByRole('button', { name: '玩法 [H]', exact: true }).click();
  await expect(page.getByTestId('howto')).toContainText(`土车：${ENGINE_RULES.earthCart.days} 日`);
  await expect(page.getByTestId('howto')).toContainText('第二幕');
  await shot(page, 'howto');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('howto')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.keyboard.press('h');
  await expect(page.getByTestId('howto')).toContainText('How to play');
  await shot(page, 'howto-en');
  await page.getByRole('button', { name: 'Close guide', exact: true }).click();
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await page.getByRole('button', { name: '开始攻城', exact: true }).click();
  await page.getByRole('button', { name: '进入战场', exact: true }).click();
  const walk = page.getByTestId('walkthrough');
  await expect(walk).toHaveAttribute('data-step', '1');
  await shot(page, 'walk-1');
  await page.getByRole('tab', { name: '工棚', exact: true }).click();
  await expect(walk).toHaveAttribute('data-step', '2');
  await page.getByTestId('build-workshop-1-earthCart').click();
  await expect(walk).toHaveAttribute('data-step', '3');
  await page.getByTestId('build-workshop-2-ladder').click();
  await expect(walk).toHaveAttribute('data-step', '4');
  await expect(page.locator('[data-testid^="hint-"]')).toHaveCount(0);
  await shot(page, 'walk-4');
  const days = (await snapshot(page)).state.workshops[1]!.daysRemaining;
  await page.getByTestId('supervise-workshop-2').click();
  await expect(walk).toHaveAttribute('data-step', '5');
  await expect
    .poll(async () => (await snapshot(page)).state.workshops[1]!.daysRemaining)
    .toBe(days - 1);
  await expect(page.getByTestId('queue-workshop-2')).toContainText(`尚需 ${days - 1} 日`);
  await expect(page.getByTestId('supervise-workshop-1')).toBeDisabled();
  await expect(page.getByTestId('supervise-workshop-1')).toHaveAttribute(
    'title',
    '本方今日已经下达过军令。',
  );
  await shot(page, 'workshop-supervise');
  await page.getByRole('button', { name: '结束本日 [E]', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('siege-day')).toHaveText('第 2 日', { timeout: 20_000 });
  await expect(walk).toHaveAttribute('data-step', '6');
  await page.getByRole('tab', { name: '部队与行动', exact: true }).click();
  await shot(page, 'walk-6');
  const cart = (await snapshot(page)).state.engines.find((e) => e.kind === 'earthCart')!;
  await page.getByTestId(`select-${cart.id}`).click();
  await expect(walk).toHaveAttribute('data-step', '7');
  await expect(page.locator('[data-overlay="tutorial"]').first()).toHaveAttribute(
    'data-cell',
    new RegExp(`,${TRENCH_SOUTH_ROW},ground$`),
  );
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await expect(walk).toHaveCount(0);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    SIEGE_SAVE_KEY,
  );
  expect(stored.presentation.walkthrough.status).toBe('skipped');
  await page.reload();
  await page.getByRole('button', { name: '读取', exact: true }).click();
  await expect(page.getByTestId('siege-day')).toHaveText('第 2 日');
  await expect(walk).toHaveCount(0);
  await page.keyboard.press('h');
  await page.getByRole('button', { name: '重看引导', exact: true }).click();
  await expect(walk).toHaveAttribute('data-step', '1');
  await expect(page.locator('[data-testid^="hint-"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('walkthrough cart movement and filling complete and persist', async ({ page }) => {
  const state = createSiegeState(228);
  const x = 20,
    y = TRENCH_SOUTH_ROW;
  state.engines = [
    {
      id: 'tutorial-cart',
      kind: 'earthCart',
      x,
      y: y + 1,
      durability: ENGINE_RULES.earthCart.durability,
      max: ENGINE_RULES.earthCart.durability,
      burning: false,
      wrecked: false,
      uses: 3,
    },
  ];
  const game: SiegeSave = {
    state,
    phase: 'battle',
    facings: {},
    presentation: {
      openingStep: 6,
      bannersSeen: [1],
      dismissedHints: [],
      walkthrough: { ...startWalkthrough(state), step: 7, cartId: 'tutorial-cart' },
    },
  };
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    {
      key: SIEGE_SAVE_KEY,
      value: JSON.stringify(game),
    },
  );
  await page.goto('/?lang=en#chencang/load');
  await page.getByTestId('select-tutorial-cart').click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.locator(`[data-overlay="reachable"][data-cell="${x},${y},ground"]`).click();
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '8');
  await page.getByRole('button', { name: 'Fill trench', exact: true }).click();
  await page.locator(`[data-overlay="reachable"][data-cell="${x},${y - 1},ground"]`).click();
  await expect(page.getByTestId('walkthrough')).toHaveCount(0);
  expect((await snapshot(page)).presentation!.walkthrough!.status).toBe('done');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('siege-day')).toHaveText('Day 1');
  await expect(page.getByTestId('walkthrough')).toHaveCount(0);
  expect((await snapshot(page)).presentation!.walkthrough!.status).toBe('done');
});
