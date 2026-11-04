import { expect, test, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { begin, loadFixture, shot, snapshot, start } from './helpers';

async function completed(page: Page) {
  await expect(page.locator('[data-phase="ending"]')).toBeVisible();
  const state = (await snapshot(page)).state;
  expect(state.outcome).toBeTruthy();
  expect(state.day).toBeLessThanOrEqual(T.days);
  expect(state.stats.score).not.toBeNull();
  await expect(page.getByTestId('score-panel')).toContainText(
    `Score ${Math.round(state.stats.score!.shu.score)}`,
  );
  await expect(page.getByTestId('extended-summary')).toContainText('Assaults');
  await page.getByRole('button', { name: 'View summary', exact: true }).click();
  await expect(page.getByTestId('siege-summary')).toContainText(`Days fought: ${state.day}`);
  await expect(page.getByTestId('siege-summary')).toContainText('Night clashes');
  await expect(page.getByTestId('siege-summary')).toContainText('Mounds built');
}
test('full rules playthrough retains act banners and scores the completed campaign', async ({
  page,
}) => {
  await start(page);
  await begin(page);
  await page.getByRole('button', { name: 'Skip walkthrough', exact: true }).click();
  await page.evaluate(
    async (days) => window.__siegeDev!.playScript('careful', days),
    T.act2Day - 1,
  );
  await expect(page.getByTestId('banner-act2')).toBeVisible();
  await page.getByTestId('banner-act2').getByRole('button').click();
  // The dev helper only accelerates player actions; the real rule/AI resolvers still run.
  await page.evaluate(async (days) => window.__siegeDev!.playScript('careful', days), T.days);
  await completed(page);
  await shot(page, 'summary');
});
test('unattacked troops reach the historical ending with score and bilingual summary', async ({
  page,
}) => {
  const state = createSiegeState(1);
  state.day = T.days;
  state.act = 2;
  state.grain = 0;
  state.outcome = 'historical';
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
  await expect(page.getByTestId('ending-historical')).toBeVisible();
  await shot(page, 'score');
  await page.getByRole('button', { name: 'View summary', exact: true }).click();
  await expect(page.getByTestId('siege-summary')).toContainText('In history');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await expect(page.getByTestId('siege-summary')).toContainText('强攻次数');
});
test('opening save resumes the same dialogue and withdrawal carries the lower tier', async ({
  page,
}) => {
  await page.goto('/?lang=en#chencang');
  for (let i = 0; i < 3; i++) await page.getByTestId('opening-next').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const before = await snapshot(page);
  await page.goto('/?lang=en#chencang/load');
  await expect(page.getByTestId('opening-2')).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'Skip opening', exact: true }).click();
  await begin(page);
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByTestId('score-panel')).toContainText('Grain withdrawal');
  await expect(page.getByTestId('ending-narration')).toContainText('early withdrawal');
});
