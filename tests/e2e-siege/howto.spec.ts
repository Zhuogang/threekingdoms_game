import { expect, test } from '@playwright/test';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { begin, snapshot, start } from './helpers';

test('bilingual guide reads tuning, explains counters, courtyard clearance and keyboard, and preserves state', async ({
  page,
}) => {
  await start(page, 'zh');
  const before = await snapshot(page);
  await page.keyboard.press('h');
  await expect(page.getByTestId('howto')).toContainText(`火箭 ×${T.coveredFireMultiplier}`);
  await expect(page.getByTestId('howto')).toContainText('日终前庭必须没有可行动的魏军');
  await expect(page.getByTestId('howto')).toContainText('Q 全军待命');
  await page.keyboard.press('Escape');
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.keyboard.press('h');
  await expect(page.getByTestId('howto')).toContainText('Moves and counters');
  await expect(page.getByTestId('howto')).toContainText(`at ${T.footholdComplete}, mount`);
  await page.getByRole('button', { name: 'Close guide', exact: true }).click();
});
test('walkthrough skips persist across reload and replay resets to ladder selection', async ({
  page,
}) => {
  await start(page);
  await begin(page);
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '1');
  await page.getByRole('button', { name: 'Skip walkthrough', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const before = await snapshot(page);
  await page.goto('/?lang=en#chencang/load');
  await expect(page.getByTestId('walkthrough')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  await page.keyboard.press('h');
  await page.getByRole('button', { name: 'Replay walkthrough', exact: true }).click();
  await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '1');
});
