import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../../src/game/campaign';
import { battleGeography } from '../../src/rendering/battleGeography';
import { cameraFit, cameraOrigin, CAMPAIGN_INSETS } from '../../src/rendering/cameraGeometry';
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

for (const missingUnits of [false, true]) {
  test(`ink troop figures retain commands and state with ${missingUnits ? 'missing' : 'loaded'} artwork`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (missingUnits) await page.route('**/assets/units/*.webp', (route) => route.abort());
    await page.setViewportSize({ width: 1920, height: 1080 });
    await startCampaign(page);
    await expect(page.locator('.map-canvas')).toHaveAttribute(
      'data-unit-art',
      missingUnits ? 'fallback' : 'ink',
    );
    const fixture = fullBattle();
    expect(new Set(fixture.battle!.units.map((unit) => unit.troopType)).size).toBe(6);
    const enemies = fixture.battle!.units.filter(
      (unit) => unit.side !== fixture.battle!.playerSide,
    );
    enemies[0]!.status = 'confused';
    enemies[1]!.status = 'inspired';
    enemies[2]!.morale = 15;
    enemies[3]!.morale = 40;
    enemies[4]!.moved = true;
    enemies[5]!.moved = true;
    enemies[5]!.acted = true;
    await importState(page, fixture);
    await page.getByRole('button', { name: 'Fit battlefield', exact: true }).click();
    if (await page.locator('.toast button').isVisible())
      await page.locator('.toast button').click();
    await page.screenshot({
      path: `.artifacts/unit-art/battle-${missingUnits ? 'fallback' : 'ink'}-en.png`,
    });
    await page.getByRole('button', { name: 'Troops & banners legend' }).click();
    if (missingUnits) await expect(page.locator('.troop-figure img')).toHaveCount(0);
    else {
      await expect(page.locator('.troop-figure img')).toHaveCount(5);
      await expect
        .poll(() =>
          page
            .locator('.troop-figure img')
            .evaluateAll((images) =>
              images.every((img) => (img as HTMLImageElement).naturalWidth > 0),
            ),
        )
        .toBe(true);
    }
    await page.screenshot({
      path: `.artifacts/unit-art/legend-${missingUnits ? 'fallback' : 'ink'}.png`,
    });
    await page.getByRole('button', { name: 'Troops & banners legend' }).click();
    await switchLanguage(page, 'zh');
    await page.screenshot({
      path: `.artifacts/unit-art/battle-${missingUnits ? 'fallback' : 'ink'}-zh.png`,
    });
    expect(await savedCampaign(page)).toEqual(fixture);
    await switchLanguage(page, 'en');
    const destination = page.locator('#battle-destination');
    await destination.selectOption(
      (await destination.locator('option').nth(1).getAttribute('value'))!,
    );
    await changedCanvas(page, () =>
      page.getByRole('button', { name: 'Move unit', exact: true }).click(),
    );
    expect((await savedCampaign(page)).revision).toBeGreaterThan(fixture.revision);
    expect(errors).toEqual([]);
  });
}

for (const missingPainting of [false, true]) {
  test(`campaign cities remain selectable with ${missingPainting ? 'missing artwork' : 'ink artwork'}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (missingPainting)
      await page.route('**/assets/maps/han-realm-ink.webp', (route) => route.abort());
    await startCampaign(page);
    await expect(page.locator('.map-canvas')).toHaveAttribute(
      'data-atlas-background',
      missingPainting ? 'procedural' : 'ink',
    );
    const original = await savedCampaign(page);
    // Hit every enlarged gatehouse, including settlements close to the map edges.
    for (const city of original.cities) {
      await page.getByRole('button', { name: 'Reset map view', exact: true }).click();
      const canvas = await page.locator('canvas').boundingBox();
      expect(canvas).not.toBeNull();
      const bounds = { left: 0, top: 0, width: 1000, height: 720 };
      const scale = cameraFit(canvas!.width, canvas!.height, bounds, CAMPAIGN_INSETS);
      const origin = cameraOrigin(canvas!.width, canvas!.height, bounds, CAMPAIGN_INSETS, scale, {
        x: 0,
        y: 0,
      });
      await page.mouse.click(
        canvas!.x + origin.x + city.x * scale,
        canvas!.y + origin.y + city.y * scale,
      );
      await expect(page.locator('.city-heading h2')).toContainText(city.name);
    }
    expect(await savedCampaign(page)).toEqual(original);
    await page.getByRole('button', { name: 'Reset map view', exact: true }).click();
    if (!missingPainting) {
      await page.screenshot({ path: '.artifacts/atlas/campaign-en.png' });
      await switchLanguage(page, 'zh');
      await expect(page.locator('.map-canvas')).toHaveAttribute('data-atlas-background', 'ink');
      await page.screenshot({ path: '.artifacts/atlas/campaign-zh.png' });
      expect(await savedCampaign(page)).toEqual(original);
    }
    expect(errors).toEqual([]);
  });
}

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
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-terrain-art', 'ink');
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
    const fixture = fullBattle(city);
    await importState(page, fixture);
    await expect(page.getByTestId('battlefield-profile')).toContainText(english!);
    await expect(page.getByTestId('battlefield-geography')).toHaveText(battleGeography(city!).en);
    await page.getByRole('button', { name: 'Fit battlefield', exact: true }).click();
    if (await page.locator('.toast button').isVisible())
      await page.locator('.toast button').click();
    await page.getByRole('button', { name: 'Show enemy reach' }).click();
    await expect(page.locator('.game-map')).toHaveAttribute('data-render-threat', 'true');
    await page.screenshot({ path: testInfo.outputPath(`profile-${city}-en.png`) });
    await switchLanguage(page, 'zh');
    await expect(page.getByTestId('battlefield-profile')).toContainText(chinese!);
    await expect(page.getByTestId('battlefield-geography')).toHaveText(battleGeography(city!).zh);
    await expect(page.locator('.game-map')).toHaveAttribute('data-render-locale', 'zh');
    await page.screenshot({ path: testInfo.outputPath(`profile-${city}-zh.png`) });
    await switchLanguage(page, 'en');
    await page.getByRole('button', { name: 'Hide enemy reach' }).click();
    expect(await savedCampaign(page)).toEqual(fixture);
    await page.screenshot({ path: `.artifacts/battle-art/${city}-en.png` });
  }
});

for (const missingArt of [false, true]) {
  test(`walled battlefield remains playable with ${missingArt ? 'fallback' : 'painted'} terrain`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (missingArt) await page.route('**/assets/terrain/*.webp', (route) => route.abort());
    await startCampaign(page);
    await expect(page.locator('.map-canvas')).toHaveAttribute(
      'data-terrain-art',
      missingArt ? 'fallback' : 'ink',
    );
    const fixture = fullBattle('luoyang', 100);
    expect(fixture.battle!.terrain).toContain('wall');
    expect(fixture.battle!.terrain).toContain('gate');
    await importState(page, fixture);
    await page.getByRole('button', { name: 'Fit battlefield', exact: true }).click();
    await page.screenshot({
      path: `.artifacts/battle-art/walls-${missingArt ? 'fallback' : 'ink'}.png`,
    });
    await switchLanguage(page, 'zh');
    expect(await savedCampaign(page)).toEqual(fixture);
    await switchLanguage(page, 'en');
    const destination = page.locator('#battle-destination');
    await destination.selectOption(
      (await destination.locator('option').nth(1).getAttribute('value')) ?? '',
    );
    await changedCanvas(page, () =>
      page.getByRole('button', { name: 'Move unit', exact: true }).click(),
    );
    expect((await savedCampaign(page)).revision).toBeGreaterThan(fixture.revision);
    expect(errors).toEqual([]);
  });
}
