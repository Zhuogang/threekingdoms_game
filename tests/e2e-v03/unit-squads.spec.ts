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

for (const [troops, navalCommander] of [
  [499, false],
  [500, false],
  [499, true],
  [500, true],
] as const) {
  test(`${troops} troops with naval commander ${navalCommander} retain portraits, change vessels and restore land art`, async ({
    page,
  }, testInfo) => {
    const state = reviewBattleState('bf04-wetland-south');
    const battle = state.battles.find((entry) => entry.active)!;
    const data = battle.battleData;
    const unit = data.units.find((entry) => entry.side === data.playerSide && !entry.isMilitia)!;
    if (navalCommander) {
      // A recruited Zhou Yu commands an otherwise ordinary Cao formation.
      const officer = state.officers.find((entry) => entry.id === 'zhouyu')!;
      Object.assign(officer, {
        factionId: state.playerFactionId,
        level: 5,
        location: { kind: 'battle', battleId: battle.id },
      });
      const membership =
        unit.side === 'attacker'
          ? battle.attackerFormationOfficerIds
          : battle.defenderFormationOfficerIds;
      membership[unit.id]!.push(officer.id);
    }
    const waterIndex = data.map.terrain.findIndex(
      (terrain, index) =>
        terrain === 'water' &&
        index % data.map.width > 3 &&
        data.map.terrain[index - 1] === 'plain',
    );
    expect(waterIndex).toBeGreaterThan(0);
    const shore = {
      x: (waterIndex % data.map.width) - 1,
      y: Math.floor(waterIndex / data.map.width),
    };
    Object.assign(unit, shore, { troops, initialTroops: troops, moved: false, acted: false });
    if (navalCommander) unit.troopExperience = unit.initialTroopExperience = 1000;
    // Other units remain in their distant deployment areas.
    await loadState(page, state);
    const token = page.locator(`.v03-battlefield-map [data-unit-id="${unit.id}"]`);
    const eliteType = {
      infantry: 'heavy-infantry',
      cavalry: 'elite-cavalry',
      archer: 'strong-archer',
    }[unit.troopType];
    const landPath = `/assets/v03/units/${navalCommander ? eliteType : unit.troopType}-${troops >= 500 ? 'large' : 'small'}-ink-04.webp`;
    const boatPath = `/assets/v03/units/${navalCommander ? 'warship' : 'boat-transport'}-ink-03.webp`;
    await expect(token).toHaveAttribute('data-unit-art', landPath);
    await expect(token.locator(`image[href="${landPath}"]`)).toHaveAttribute(
      'visibility',
      'visible',
    );
    await expect(token.locator('[data-leader-portrait] image')).toBeVisible();
    if (navalCommander)
      await expect(token.locator('[data-leader-portrait]')).toHaveAttribute(
        'data-leader-portrait',
        'zhouyu',
      );
    await expect(page.locator('.v03-unit-leader').first()).toBeVisible();
    await expect(page.locator('.v03-unit-leader img').first()).toHaveJSProperty(
      'naturalWidth',
      128,
    );
    await token.click();

    const map = page.locator('.v03-battlefield-map').first();
    await map.focus();
    await map.press('ArrowRight');
    await map.press('Enter');
    await expect(token).toHaveAttribute('data-unit-art', boatPath);
    await expect(token.locator(`image[href="${boatPath}"]`)).toHaveAttribute(
      'visibility',
      'visible',
    );
    await expect(token.locator('[data-leader-portrait] image')).toBeVisible();
    await expect(page.locator(`.v03-unit-row.selected img[src="${boatPath}"]`)).toBeVisible();
    if (navalCommander) {
      await expect(page.locator('.v03-unit-row.selected .v03-unit-leader img')).toHaveAttribute(
        'src',
        '/assets/portraits/zhouyu-small.webp',
      );
      await expect(token).toHaveAttribute('aria-label', /水军（楼船）/);
    }
    await page.screenshot({ path: testInfo.outputPath('squad-and-portrait-water.png') });
    // The move is provisional until the formation acts; waiting commits it to the save.
    await map.press('w');
    await page.reload();
    await expect(token).toHaveAttribute('data-unit-art', boatPath);

    await submitBattleDay(page);
    // A map click during the enemy-turn replay only skips it; skip first, then select.
    const skip = page
      .locator('.v03-battle-playback')
      .getByRole('button', { name: /^(Skip|跳过)$/ });
    if (await skip.count()) await skip.click();
    await token.click();
    await map.focus();
    await map.press('ArrowLeft');
    await map.press('Enter');
    await expect(token).toHaveAttribute('data-unit-art', landPath);
    await page.screenshot({ path: testInfo.outputPath('squad-and-portrait-land.png') });

    await map.press('w');
    await page.reload();
    await expect(token).toHaveAttribute('data-unit-art', landPath);
    await expect(token.locator('[data-leader-portrait] image')).toBeVisible();
    await page.getByRole('button', { name: /Fit full battlefield|显示全图/, exact: true }).click();
    await expect(token).toHaveAttribute('data-detail', 'compact');
    await expect(token.locator(`image[href="${landPath}"]`)).toHaveAttribute(
      'visibility',
      'visible',
    );
  });
}

test('casualties below 500 switch the existing formation and sidebar to small art', async ({
  page,
}, testInfo) => {
  const state = reviewBattleState();
  const battle = state.battles.find((entry) => entry.active)!.battleData;
  const unit = battle.units.find((entry) => entry.side === battle.playerSide)!;
  const enemy = battle.units.find((entry) => entry.side !== battle.playerSide)!;
  Object.assign(unit, { x: 10, y: 10, troops: 500, initialTroops: 500 });
  Object.assign(enemy, { x: 11, y: 10, troops: 500, initialTroops: 500 });
  battle.map.terrain[10 * battle.map.width + 10] = 'plain';
  battle.map.terrain[10 * battle.map.width + 11] = 'plain';
  await loadState(page, state);
  const token = page.locator(`.v03-battlefield-map [data-unit-id="${unit.id}"]`);
  const target = page.locator(`.v03-battlefield-map [data-unit-id="${enemy.id}"]`);
  const largePath = `/assets/v03/units/${unit.troopType}-large-ink-04.webp`;
  const smallPath = `/assets/v03/units/${unit.troopType}-small-ink-04.webp`;
  await expect(token.locator(`image[href="${largePath}"]`)).toHaveAttribute(
    'visibility',
    'visible',
  );
  await expect(page.locator(`.v03-unit-row img[src="${largePath}"]`).first()).toBeVisible();
  await expect(token.locator('[data-leader-portrait] image')).toBeVisible();
  await token.click();
  // Attacks are chosen first (A), then aimed at a target in the red range.
  await page.keyboard.press('a');
  await target.click();
  await expect(token).toHaveAttribute('data-unit-art', smallPath);
  await expect(token.locator(`image[href="${smallPath}"]`)).toHaveAttribute(
    'visibility',
    'visible',
  );
  // Nothing stays selected after an order; select the formation again to read its row.
  await token.click();
  await expect(page.locator(`.v03-unit-row.selected img[src="${smallPath}"]`)).toBeVisible();
  await expect(token.locator('[data-leader-portrait] image')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('after-casualties.png') });
  await page.reload();
  await expect(token).toHaveAttribute('data-unit-art', smallPath);
});

test('one- and three-person sprites keep their foreground person at identical size and position', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const measurements = await page.evaluate(async () => {
    const read = async (path: string) => {
      const image = new Image();
      image.src = path;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      };
    };
    const measurements = [];
    for (const family of [
      'infantry',
      'heavy-infantry',
      'cavalry',
      'elite-cavalry',
      'archer',
      'strong-archer',
    ]) {
      const single = await read(`/assets/v03/units/${family}-small-ink-04.webp`);
      const group = await read(`/assets/v03/units/${family}-large-ink-04.webp`);
      let unchanged = 0,
        changed = 0,
        additional = 0;
      for (let index = 0; index < single.pixels.length; index += 4) {
        if (single.pixels[index + 3] === 255) {
          if (
            single.pixels[index] === group.pixels[index] &&
            single.pixels[index + 1] === group.pixels[index + 1] &&
            single.pixels[index + 2] === group.pixels[index + 2]
          )
            unchanged++;
          else changed++;
        }
        if (single.pixels[index + 3] === 0 && group.pixels[index + 3]! > 200) additional++;
      }
      measurements.push({
        family,
        sameFrame: single.width === group.width && single.height === group.height,
        unchanged,
        changed,
        additional,
      });
    }
    return measurements;
  });
  await testInfo.attach('person-pixel-measurements', {
    body: JSON.stringify(measurements, null, 2),
    contentType: 'application/json',
  });
  for (const result of measurements) {
    expect(result.sameFrame, result.family).toBe(true);
    // Ink includes translucent strokes; require a nonempty opaque sample, then match all of it.
    expect(result.unchanged, result.family).toBeGreaterThan(0);
    expect(result.changed, result.family).toBe(0);
    expect(result.additional, result.family).toBeGreaterThan(1000);
  }
});

test('missing squad images leave readable clickable type markers', async ({ page }) => {
  await page.route('**/assets/v03/units/*.webp', (route) => route.abort());
  await loadState(page, reviewBattleState());
  const token = page.locator('.v03-unit-token').first();
  await expect(token.locator('image[visibility="hidden"]')).toHaveCount(1);
  await expect(token.locator('text').first()).toHaveText(/[步骑弓舟]/);
  await token.click();
  await expect(page.locator('.v03-unit-row.selected')).toBeVisible();
});
