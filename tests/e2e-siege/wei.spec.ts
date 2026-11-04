import { expect, test, type Page } from '@playwright/test';
import { siegeSaveKey } from '../../src/siege/save';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import {
  closeReport,
  clickCell,
  endDay,
  shot,
  snapshot,
  selectActor,
  expectNoPanelScroll,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });

async function chooseWei(page: Page) {
  // Seed 1 has no day-two snow; snow correctly extinguishes day-one braziers at seed 228.
  await page.goto('/?lang=en&siegeSeed=1');
  await page.getByTestId('start-wei').click();
  await expect(page).toHaveURL(/#chencang\/wei$/);
  await page.getByRole('button', { name: 'Skip opening', exact: true }).click();
  await expect(page.locator('[data-phase="deploy"]')).toBeVisible();
}
async function beginWei(page: Page) {
  await selectActor(page, 'wei-captain-1');
  await clickCell(page, 'deploy', '18,16,wall');
  expect((await snapshot(page)).state.units.find((u) => u.id === 'wei-captain-1')).toMatchObject({
    x: 18,
    y: 16,
    level: 'wall',
  });
  await page.getByRole('button', { name: 'Begin siege', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="replay-skip"]') ||
      document.querySelector('[data-testid="banner-act1"]'),
  );
  await page
    .getByTestId('replay-skip')
    .evaluateAll((buttons) => (buttons[0] as HTMLButtonElement | undefined)?.click());
  await page.getByTestId('banner-act1').getByRole('button').click();
  await closeReport(page);
}
async function prepare(page: Page) {
  await selectActor(page, 'wei-haozhao');
  await page.getByTestId('command-hoistMillstone').click();
  await selectActor(page, 'wei-captain-1');
  await page.getByTestId('command-lightBrazier').click();
}
async function dayTwo(page: Page) {
  await chooseWei(page);
  await beginWei(page);
  await prepare(page);
  await endDay(page);
  await expect(page.getByTestId('siege-day')).toHaveText('Day 2');
  await expect(page.getByTestId('morning-report')).toBeVisible();
}

test('Wei deployment, preparation, Shu replay, day-two countermeasures, exact save isolation and ending', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await chooseWei(page);
  await beginWei(page);
  await selectActor(page, 'wei-haozhao');
  await expectNoPanelScroll(page, 'action-panel');
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '2');
  await prepare(page);
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '5');
  const first = await snapshot(page);
  expect(first.state.preparations.millstones['23,16']).toEqual({ day: 1, hoisted: true });
  expect(first.state.preparations.braziers['18,16']).toEqual({ litDay: 1 });
  await page.getByRole('tab', { name: 'Preparations', exact: true }).click();
  await expect(page.getByTestId('wei-defense-tab')).toContainText('tomorrow');
  await page.getByRole('tab', { name: 'Units & actions', exact: true }).click();
  await endDay(page);
  await expect(page.getByTestId('morning-report')).toBeVisible();
  expect((await snapshot(page)).presentation?.attackerTurnDay).toBe(2);
  await expect(page.getByTestId('morning-report')).toContainText(/Shu|ram/);
  await closeReport(page);
  await selectActor(page, 'wei-captain-1');
  await page.getByTestId('command-fireArrows').click();
  const beforeFire = await snapshot(page);
  const ladder = beforeFire.state.engines.find((e) => e.kind === 'ladder' && e.x === 18)!;
  await page.getByTestId(`target-fireArrows-${ladder.id}`).click();
  const fired = await snapshot(page);
  expect(fired.state.engines.find((e) => e.id === ladder.id)!.durability).toBeLessThan(
    ladder.durability,
  );
  expect(
    fired.state.log.some((e) => e.code === 'fireArrowHit' && e.params.engineId === ladder.id),
  ).toBe(true);
  await expect(page.getByTestId('walkthrough')).toHaveCount(0);
  // Finish first-time cards before returning to the unit card.
  for (let i = 0; i < 12; i++) {
    const counter = page.getByTestId('counter-dismiss');
    const hint = page.locator('[data-testid^="hint-"] button');
    if (await counter.count()) await counter.click();
    else if (await hint.count()) await hint.first().click();
    else break;
  }
  await selectActor(page, 'wei-haozhao');
  await page.getByTestId('command-dropMillstone').click();
  const beforeDrop = await snapshot(page);
  const ram = beforeDrop.state.engines.find((e) => e.kind === 'ram')!;
  await page.getByTestId(`target-dropMillstone-${ram.id}`).click();
  expect((await snapshot(page)).state.engines.find((e) => e.id === ram.id)!.durability).toBe(
    Math.max(0, ram.durability - (ram.covered ? T.coveredMillstoneDamage : T.millstoneDamage)),
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = await snapshot(page);
  const weiBytes = await page.evaluate((key) => localStorage.getItem(key), siegeSaveKey('wei'));
  expect(JSON.parse(weiBytes!)).toEqual(saved);
  await page.goto('/?lang=en#chencang/load');
  await expect(page.locator('.siege-app')).toHaveAttribute('data-player-side', 'wei');
  expect(await snapshot(page)).toEqual(saved);
  await expect(page.getByTestId('replay-skip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to start', exact: true }).click();
  await expect(page.getByTestId('continue-siege')).toContainText('Wei');
  await page.getByTestId('start-shu').click();
  await expect(page).toHaveURL(/#chencang\/shu$/);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), siegeSaveKey('wei'))).toBe(
    weiBytes,
  );
  await page.goto('/?lang=en#chencang/wei');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByTestId('siege-day')).toHaveText('Day 2');
  expect(await snapshot(page)).toEqual(saved);
  await page.evaluate((days) => window.__siegeDev!.playScript('careful', days), T.days);
  await expect(page.getByTestId('score-panel')).toBeVisible();
  const ended = await snapshot(page);
  expect(ended.state.outcome).toBeTruthy();
  await expect(page.getByTestId('score-panel')).toContainText(
    String(Math.round(ended.state.stats.score!.wei.score)),
  );
  await expect(page.getByTestId('score-part-gate')).toBeVisible();
  expect(errors).toEqual([]);
});

// Keep each required screenshot independent of later assertions in the full flow.
test('Wei side choice screenshot', async ({ page }) => {
  await page.goto('/?lang=zh');
  await expect(page.getByTestId('start-wei')).toHaveText('魏军 · 郝昭');
  await expect(page.getByTestId('start-shu')).toHaveText('汉军 · 诸葛亮');
  const card = page.getByTestId('chencang-campaign');
  await card.scrollIntoViewIfNeeded();
  await shot(page, 'wei-card');
});
test('Wei deployment screenshot', async ({ page }) => {
  await chooseWei(page);
  await selectActor(page, 'wei-haozhao');
  await expect(page.locator('[data-overlay="deploy"][data-cell="23,16,wall"]')).toHaveCount(1);
  await shot(page, 'wei-deploy');
});
test('Wei day-two screenshot', async ({ page }) => {
  await dayTwo(page);
  await shot(page, 'wei-day2');
});
test('Wei preparations screenshot and row focus', async ({ page }) => {
  await chooseWei(page);
  await beginWei(page);
  await prepare(page);
  await page.getByRole('tab', { name: 'Preparations', exact: true }).click();
  const tab = page.getByTestId('wei-defense-tab');
  await expect(tab).not.toContainText('North wall');
  const storesRuns = await tab
    .locator('[data-testid^="defense-run-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid')));
  await page.getByRole('tab', { name: 'Defence', exact: true }).click();
  const defenseRuns = await page
    .getByTestId('defense-panel')
    .locator('[data-testid^="defense-run-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid')));
  expect(storesRuns).toEqual(defenseRuns);
  await page.getByRole('tab', { name: 'Preparations', exact: true }).click();
  await expect(tab.getByTestId('preparation-row')).toHaveCount(2);
  await tab
    .locator('[data-testid^="defense-run-"]')
    .filter({ has: page.getByTestId('preparation-row') })
    .first()
    .click();
  await shot(page, 'wei-defense-tab');
});
test('Wei ending screenshot', async ({ page }) => {
  await chooseWei(page);
  await beginWei(page);
  await page.evaluate((days) => window.__siegeDev!.playScript('careful', days), T.days);
  await expect(page.getByTestId('score-panel')).toBeVisible();
  await shot(page, 'wei-ending');
});
test('Wei how-to screenshot and replay guide', async ({ page }) => {
  await chooseWei(page);
  await beginWei(page);
  await page.getByRole('button', { name: 'How to play [H]', exact: true }).click();
  await expect(page.getByTestId('howto')).toContainText('How to hold Chencang');
  await shot(page, 'wei-howto');
  await page.getByRole('button', { name: 'Replay walkthrough', exact: true }).click();
  await selectActor(page, 'wei-haozhao');
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '2');
});

test('saving while the Shu replay is pending stores its resolved day marker', async ({ page }) => {
  await chooseWei(page);
  await page.getByRole('button', { name: 'Begin siege', exact: true }).click();
  await expect(page.getByTestId('replay-skip')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = await snapshot(page);
  expect(saved.presentation?.attackerTurnDay).toBe(saved.state.day);
  await page.goto('/?lang=en#chencang/load');
  await expect(page.locator('.siege-app')).toHaveAttribute('data-player-side', 'wei');
  expect(await snapshot(page)).toEqual(saved);
  await expect(page.getByTestId('replay-skip')).toHaveCount(0);
});
