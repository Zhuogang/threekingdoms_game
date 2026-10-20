import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../../src/game/campaign';
import { fullBattle } from './rendering-fixtures';
import {
  importState,
  savedCampaign,
  selectDisplay,
  startCampaign,
  switchLanguage,
} from './improvement-helpers';

const renderedFrames = (page: Page) =>
  page.locator('.game-map').evaluate((map) => Number((map as HTMLElement).dataset.renderCount));

async function changedCanvas(page: Page, action: () => Promise<unknown>) {
  const before = await page.locator('canvas').screenshot();
  const frame = await renderedFrames(page);
  await action();
  await expect.poll(() => renderedFrames(page)).toBeGreaterThan(frame);
  expect((await page.locator('canvas').screenshot()).equals(before)).toBe(false);
}

test('on-demand drawing wakes after idle for camera, state, locale, overlays and battle movement', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startCampaign(page);
  const map = page.locator('.game-map');
  await expect(map).toHaveAttribute('data-render-mode', 'campaign');
  await page.waitForTimeout(100);
  const idleFrame = await renderedFrames(page);
  await page.waitForTimeout(250);
  expect(await renderedFrames(page)).toBe(idleFrame);
  await changedCanvas(page, () =>
    page.getByRole('button', { name: 'Zoom in', exact: true }).click(),
  );
  await changedCanvas(page, () =>
    page.getByRole('button', { name: 'Reset map view', exact: true }).click(),
  );

  await changedCanvas(page, () => importState(page, fullBattle()));
  await expect(map).toHaveAttribute('data-render-mode', 'battle');
  await changedCanvas(page, () => page.getByRole('button', { name: 'Show enemy reach' }).click());
  await expect(map).toHaveAttribute('data-render-threat', 'true');
  await changedCanvas(page, () =>
    page.getByRole('button', { name: 'Next ready commander' }).click(),
  );
  const beforePresentation = await savedCampaign(page);
  await changedCanvas(page, () => selectDisplay(page, 'large'));
  await changedCanvas(page, () => switchLanguage(page, 'zh'));
  await expect(map).toHaveAttribute('data-render-locale', 'zh');
  await switchLanguage(page, 'en');
  await changedCanvas(page, () => page.setViewportSize({ width: 1440, height: 900 }));
  expect(await savedCampaign(page)).toEqual(beforePresentation);

  const destination = page.locator('#battle-destination');
  const target = await destination.locator('option').nth(1).getAttribute('value');
  expect(target).toBeTruthy();
  await destination.selectOption(target!);
  await changedCanvas(page, () =>
    page.getByRole('button', { name: 'Move unit', exact: true }).click(),
  );
  const moved = await savedCampaign(page);
  await expect(map).toHaveAttribute('data-render-revision', String(moved.revision));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const motionFrame = await renderedFrames(page);
  await page.getByRole('checkbox', { name: /Reduce motion/ }).check();
  await expect.poll(() => renderedFrames(page)).toBeGreaterThan(motionFrame);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await savedCampaign(page)).toEqual(moved);
  await page.waitForTimeout(1200);
  const settled = await renderedFrames(page);
  await page.waitForTimeout(250);
  expect(await renderedFrames(page)).toBe(settled);
  await changedCanvas(page, () => importState(page, createGame('cao', 16)));
  await expect(map).toHaveAttribute('data-render-mode', 'campaign');
  expect(errors).toEqual([]);
});

test('four battlefield palettes and veteran badges remain readable with bilingual profile names', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await startCampaign(page);
  const state = createGame('cao', 16);
  const veteran = state.officers.find((officer) => officer.id === 'caocao')!;
  veteran.level = 5;
  veteran.experience = 500;
  await importState(page, state);
  await page.getByRole('button', { name: 'Officers', exact: true }).click();
  await expect(page.locator('.officer-level-pips').first()).toHaveText('★★★');
  for (const [city, english, chinese] of [
    ['xiapi', 'Plains battlefield', '平原战场'],
    ['shouchun', 'River battlefield', '河流战场'],
    ['hanzhong', 'Mountain battlefield', '山地战场'],
    ['chengdu', 'Forest battlefield', '森林战场'],
  ]) {
    await importState(page, fullBattle(city));
    await expect(page.getByTestId('battlefield-profile')).toContainText(english!);
    await page.getByRole('button', { name: 'Fit battlefield', exact: true }).click();
    if (await page.locator('.toast button').isVisible())
      await page.locator('.toast button').click();
    await page.getByRole('button', { name: 'Show enemy reach' }).click();
    await expect(page.locator('.game-map')).toHaveAttribute('data-render-threat', 'true');
    await page.screenshot({ path: testInfo.outputPath(`profile-${city}-en.png`) });
    await switchLanguage(page, 'zh');
    await expect(page.getByTestId('battlefield-profile')).toContainText(chinese!);
    await expect(page.locator('.game-map')).toHaveAttribute('data-render-locale', 'zh');
    await page.screenshot({ path: testInfo.outputPath(`profile-${city}-zh.png`) });
    await switchLanguage(page, 'en');
    await page.getByRole('button', { name: 'Hide enemy reach' }).click();
  }
});
