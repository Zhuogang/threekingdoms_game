import { test, expect, type Page } from '@playwright/test';
import { createGame, dispatch } from '../../src/game/campaign';
import { encodeSave } from '../../src/platform/saves';
import type { GameState } from '../../src/game/types';

async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Raise your banner' })).toBeEnabled();
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  await expect(page.locator('.save-status')).toContainText('All progress saved');
  await expect(page.locator('canvas')).toHaveCount(1);
}

async function savedState(page: Page): Promise<GameState> {
  await expect(page.locator('.save-status')).toContainText('All progress saved');
  return page.evaluate(
    async () =>
      new Promise<GameState>((resolve, reject) => {
        const request = indexedDB.open('baye-atlas', 1);
        request.onsuccess = () => {
          const database = request.result;
          const read = database.transaction('saves').objectStore('saves').get('auto');
          read.onsuccess = () => {
            database.close();
            resolve(JSON.parse(read.result.payload).state);
          };
          read.onerror = () => reject(read.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

async function chooseCity(page: Page, name: string) {
  await page.getByRole('button', { name: 'City index' }).click();
  await page
    .locator('.city-index')
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click();
  await expect(page.locator('.city-heading h2')).toContainText(name);
}

async function importCampaign(page: Page, state: GameState) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'campaign.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeSave(state)),
  });
  await expect(page.getByText('Campaign imported.', { exact: true })).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('All progress saved');
}

test('campaign actions, editable dialogs, manual slots, export and reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const seed = page.getByLabel('World seed');
  await seed.fill('');
  await seed.pressSequentially('190', { delay: 60 });
  await expect(seed).toBeFocused();
  await expect(seed).toHaveValue('190');
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  await chooseCity(page, 'Chenliu');
  await page.getByRole('button', { name: 'Select Cao Cao', exact: true }).click();
  const initial = await savedState(page);
  await page.getByRole('button', { name: /^Develop farms/ }).click();
  await expect(page.locator('.inline-notice')).toContainText('Cao Cao is on assignment');
  const farmed = await savedState(page);
  const before = initial.cities.find((c) => c.id === 'chenliu')!;
  expect(farmed.cities.find((c) => c.id === 'chenliu')!.gold).toBe(before.gold - 100);
  expect(farmed.cities.find((c) => c.id === 'chenliu')!.farming).toBeGreaterThan(before.farming);
  await page.getByRole('button', { name: 'Select Xiahou Dun', exact: true }).click();
  await page.getByRole('button', { name: 'Muster', exact: true }).click();
  const troops = page.getByLabel('Assigned troop count');
  await troops.selectText();
  await troops.pressSequentially('1500', { delay: 50 });
  await expect(troops).toBeFocused();
  await expect(troops).toHaveValue('1500');
  await page.getByRole('button', { name: 'Confirm assignment' }).click();
  const mustered = await savedState(page);
  expect(mustered.officers.find((o) => o.id === 'xiahoudun')!.troops).toBe(1500);

  await page.getByRole('button', { name: 'Save and load' }).click();
  const slot = page.locator('.save-slot').filter({ hasText: 'Campaign slot 1' });
  await slot.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(slot).toContainText('Cao Cao');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export campaign' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('baye-190-01.json');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await savedState(page)).toEqual(mustered);

  await page.getByRole('button', { name: 'Advance month' }).click();
  await expect(page.locator('.date-box')).toContainText('February');
  expect((await savedState(page)).turn).toBe(1);
  await page.getByRole('button', { name: 'Save and load' }).click();
  await page
    .locator('.save-slot')
    .filter({ hasText: 'Campaign slot 1' })
    .getByRole('button', { name: 'Load', exact: true })
    .click();
  expect(await savedState(page)).toEqual(mustered);
  expect(errors).toEqual([]);
});

test('march, manual battle movement and rally, save continuation, conquest', async ({ page }) => {
  await start(page);
  let fixture = createGame('cao', 16);
  fixture = dispatch(fixture, {
    type: 'assignTroops',
    cityId: 'puyang',
    officerId: 'xiahouyuan',
    amount: 1800,
  }).state;
  await importCampaign(page, fixture);
  await chooseCity(page, 'Puyang');
  await page.getByRole('button', { name: 'March an army' }).click();
  await page.getByLabel('Destination').selectOption('xiapi');
  await page.getByRole('button', { name: 'Issue march order' }).click();
  await expect(page.locator('.queued-order')).toContainText('Xiapi');
  await page.getByRole('button', { name: 'Advance month' }).click();
  await expect(page.getByRole('button', { name: 'End battle day' })).toBeVisible();
  let state = await savedState(page);
  expect(state.phase).toBe('battle');
  const selectedName = await page.locator('.unit-card h3').innerText();
  const initialUnit = state.battle!.units.find((u) => u.name === selectedName)!;
  const destination = page.getByLabel('Move to tile');
  const option = await destination.locator('option').nth(1).getAttribute('value');
  expect(option).toBeTruthy();
  await destination.selectOption(option!);
  await page.getByRole('button', { name: 'Move unit', exact: true }).click();
  state = await savedState(page);
  expect(state.battle!.units.find((u) => u.id === initialUnit.id)!.moved).toBe(true);
  await page.getByRole('button', { name: 'Rally', exact: true }).click();
  await page.getByRole('button', { name: `rally ${selectedName}`, exact: true }).click();
  const played = await savedState(page);
  expect(played.battle!.units.find((u) => u.id === initialUnit.id)!.acted).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'End battle day' })).toBeVisible();
  expect(await savedState(page)).toEqual(played);
  await page.screenshot({ path: '.artifacts/game-battle-1280.png', fullPage: true });
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Auto-resolve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Advance month' })).toBeVisible();
  const conquered = await savedState(page);
  expect(conquered.cities.find((c) => c.id === 'xiapi')!.factionId).toBe('cao');
  expect(conquered.stats.battlesWon).toBeGreaterThan(0);
  expect(conquered.resolution).toBeNull();
});

test('invalid imported saves preserve the current campaign', async ({ page }) => {
  await start(page);
  const before = await savedState(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.getByRole('alert')).toContainText('not valid JSON');
  expect(await savedState(page)).toEqual(before);
  const malformed = structuredClone(before);
  malformed.officers[0]!.cityId = 'missing';
  await page.locator('input[type=file]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeSave(malformed)),
  });
  await expect(page.getByRole('alert')).toContainText('inconsistent');
  expect(await savedState(page)).toEqual(before);
});

test('victory and defeat are visible and a fresh campaign can restart', async ({ page }) => {
  await start(page);
  let victory = createGame('cao');
  victory.cities.forEach((c) => {
    c.factionId = 'cao';
  });
  victory.officers.forEach((o) => {
    if (o.factionId) o.factionId = 'cao';
  });
  victory = dispatch(victory, { type: 'endMonth' }).state;
  await importCampaign(page, victory);
  await expect(page.getByRole('dialog', { name: 'A realm united.' })).toBeVisible();
  await page.getByRole('button', { name: 'Begin a new history' }).click();
  await page.getByRole('button', { name: /Liu Bei/ }).click();
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  expect((await savedState(page)).playerFactionId).toBe('liu');
  let defeat = createGame('liu');
  const lastCity = defeat.cities.find((c) => c.id === 'pingyuan')!;
  lastCity.factionId = 'yuan';
  lastCity.governorId = null;
  defeat.officers
    .filter((o) => o.factionId === 'liu')
    .forEach((o) => {
      o.captive = true;
      o.troops = 0;
    });
  defeat = dispatch(defeat, { type: 'endMonth' }).state;
  while (defeat.phase === 'battle') defeat = dispatch(defeat, { type: 'battleAuto' }).state;
  await importCampaign(page, defeat);
  await expect(page.getByRole('dialog', { name: 'Your banner falls.' })).toBeVisible();
});

test('desktop layouts, navigation, map controls and reduced motion remain usable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await expect(page.locator('.game-shell')).toHaveClass(/reduced-motion/);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Reset map view' }).click();
    await chooseCity(page, 'Chengdu');
    await expect(page.getByRole('button', { name: 'Advance month' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.artifacts/game-${viewport.width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'City index' }).click();
  await page.getByLabel('Find a city', { exact: true }).fill('Chenliu');
  await page
    .locator('.city-index')
    .getByRole('button', { name: /Chenliu/ })
    .click();
  await page.getByRole('navigation').getByRole('button', { name: 'Officers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Council of officers' })).toBeVisible();
  await expect(page.getByLabel('Search officers', { exact: true })).toHaveValue('');
  await expect(page.locator('.roster-row').filter({ hasText: 'Cao Cao' })).toBeVisible();
  await page.getByRole('button', { name: 'Chronicle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The chronicle' })).toBeVisible();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog', { name: 'The art of ruling' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'How to play' })).toBeFocused();
  expect(errors).toEqual([]);
});
