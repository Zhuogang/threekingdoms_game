import { expect, test, type Page } from '@playwright/test';
import { asSave, reviewBattleState } from './playability-fixtures';
import { submitBattleDay } from './ui-navigation';
import type { V03GameState } from '../../src/v03/types';

async function loadState(page: Page, state: V03GameState) {
  await page.goto('/?lang=zh');
  await page.evaluate((raw) => localStorage.setItem('hegemony-v0.3:autosave', raw), asSave(state));
  await page.reload();
  await expect(page.locator('.v03-battle-main')).toBeVisible();
}

test('small squads retain portraits, change to boats on water and restore on land', async ({
  page,
}, testInfo) => {
  const state = reviewBattleState('bf04-wetland-south');
  const battle = state.battles.find((entry) => entry.active)!;
  const data = battle.battleData;
  const unit = data.units.find((entry) => entry.side === data.playerSide && !entry.isMilitia)!;
  const waterIndex = data.map.terrain.findIndex(
    (terrain, index) =>
      terrain === 'water' && index % data.map.width > 3 && data.map.terrain[index - 1] === 'plain',
  );
  expect(waterIndex).toBeGreaterThan(0);
  const shore = {
    x: (waterIndex % data.map.width) - 1,
    y: Math.floor(waterIndex / data.map.width),
  };
  Object.assign(unit, shore, { troops: 700, initialTroops: 700, moved: false, acted: false });
  // Other units remain in their distant deployment areas.
  await loadState(page, state);
  const token = page.locator(`.v03-battlefield-map [data-unit-id="${unit.id}"]`);
  const smallPath = `/assets/v03/units/${unit.troopType}-small-ink-02.webp`;
  const boatPath = '/assets/v03/units/boat-transport-ink-02.webp';
  await expect(token).toHaveAttribute('data-unit-art', smallPath);
  await expect(token.locator(`image[href="${smallPath}"]`)).toHaveAttribute(
    'visibility',
    'visible',
  );
  await expect(token.locator('[data-leader-portrait] image')).toBeVisible();
  await expect(page.locator('.v03-unit-leader').first()).toBeVisible();
  await expect(page.locator('.v03-unit-leader').first()).toHaveJSProperty('naturalWidth', 128);
  await token.click();

  const map = page.locator('.v03-battlefield-map').first();
  await map.focus();
  await map.press('ArrowRight');
  await map.press('Enter');
  await expect(token).toHaveAttribute('data-unit-art', boatPath);
  await expect(token.locator(`image[href="${boatPath}"]`)).toHaveAttribute('visibility', 'visible');
  await expect(token.locator('[data-leader-portrait] image')).toBeVisible();
  await expect(page.locator(`.v03-unit-row.selected img[src="${boatPath}"]`)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('squad-and-portrait-water.png') });

  await submitBattleDay(page);
  await token.click();
  await map.focus();
  await map.press('ArrowLeft');
  await map.press('Enter');
  await expect(token).toHaveAttribute('data-unit-art', smallPath);
  await page.screenshot({ path: testInfo.outputPath('squad-and-portrait-land.png') });

  await page.reload();
  await expect(token).toHaveAttribute('data-unit-art', smallPath);
  await expect(token.locator('[data-leader-portrait] image')).toBeVisible();
  await page.getByRole('button', { name: /Fit full battlefield|显示全图/, exact: true }).click();
  await expect(token).toHaveAttribute('data-detail', 'compact');
  await expect(token.locator(`image[href="${smallPath}"]`)).toHaveAttribute(
    'visibility',
    'visible',
  );
});

test('missing squad images leave readable clickable type markers', async ({ page }) => {
  await page.route('**/assets/v03/units/*-ink-02.webp', (route) => route.abort());
  await loadState(page, reviewBattleState());
  const token = page.locator('.v03-unit-token').first();
  await expect(token.locator('image[visibility="hidden"]')).toHaveCount(1);
  await expect(token.locator('text').first()).toHaveText(/[步骑弓舟]/);
  await token.click();
  await expect(page.locator('.v03-unit-row.selected')).toBeVisible();
});
