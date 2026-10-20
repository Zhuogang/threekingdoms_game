import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect, test } from '@playwright/test';
import { decodeSave, encodeSave } from '../../src/platform/saves';
import { createGame, dispatch, validateState } from '../../src/game/campaign';
import {
  dismissBattleSummary,
  expectPortraitsLoaded,
  importLegacy,
  importState,
  mapMetrics,
  savedCampaign,
  selectDisplay,
  startCampaign,
  switchLanguage,
} from './improvement-helpers';

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  for (const language of ['en', 'zh'] as const) {
    for (const preset of ['compact', 'comfortable', 'large'] as const) {
      test(`readability matrix ${viewport.width} ${language} ${preset}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setViewportSize(viewport);
        await startCampaign(page);
        const original = await importLegacy(page, 'planning');
        if (await page.locator('.toast button').isVisible())
          await page.locator('.toast button').click();
        await selectDisplay(page, preset);
        await switchLanguage(page, language);
        expect(await savedCampaign(page)).toEqual(original);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect
          .poll(async () => (await mapMetrics(page)).cityFont)
          .toBeGreaterThanOrEqual({ compact: 14, comfortable: 16, large: 18 }[preset]);
        const campaign = await mapMetrics(page);
        await expectPortraitsLoaded(page);
        await page.screenshot({
          path: `.artifacts/improvements/campaign-${viewport.width}-${language}-${preset}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        await importLegacy(page, 'dense-battle');
        if (await page.locator('.toast button').isVisible())
          await page.locator('.toast button').click();
        await expect(
          page.getByRole('button', { name: /^(Next ready commander|下一位可行动武将)$/ }),
        ).toBeVisible();
        await page.getByRole('button', { name: /^(Readable tiles|清晰格子)$/ }).click();
        const target = { compact: 48, comfortable: 64, large: 80 }[preset];
        await expect
          .poll(async () => (await mapMetrics(page)).tile)
          .toBeGreaterThanOrEqual(target - 0.1);
        const readable = await mapMetrics(page);
        if (
          readable.tile * 10 <= readable.height - 108 + 0.1 &&
          readable.tile * 12 <= readable.width - 56 + 0.1
        ) {
          expect(readable.left).toBeGreaterThanOrEqual(12);
          expect(readable.top).toBeGreaterThanOrEqual(12);
          expect(readable.right).toBeLessThanOrEqual(readable.width - 12);
          expect(readable.bottom).toBeLessThanOrEqual(readable.height - 12);
        }
        expect(readable.countFont).toBeGreaterThanOrEqual(
          { compact: 12, comfortable: 14, large: 16 }[preset] - 0.1,
        );
        expect(readable.crestFont).toBeGreaterThanOrEqual(
          { compact: 12, comfortable: 14, large: 16 }[preset],
        );
        expect(readable.statusFont).toBeGreaterThanOrEqual(
          { compact: 12, comfortable: 14, large: 16 }[preset],
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expectPortraitsLoaded(page);
        await page.screenshot({
          path: `.artifacts/improvements/battle-${viewport.width}-${language}-${preset}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        await page.getByRole('button', { name: /^(Fit battlefield|适应战场)$/ }).click();
        await expect
          .poll(async () => {
            const fit = await mapMetrics(page);
            return (
              fit.left >= 12 &&
              fit.top >= 12 &&
              fit.right <= fit.width - 12 &&
              fit.bottom <= fit.height - 12
            );
          })
          .toBe(true);
        if (preset === 'comfortable') {
          await expect
            .poll(async () => (await mapMetrics(page)).tile)
            .toBeGreaterThanOrEqual(viewport.width === 1366 ? 48 : 64);
          const fit = await mapMetrics(page);
          expect(fit.left).toBeGreaterThanOrEqual(12);
          expect(fit.top).toBeGreaterThanOrEqual(12);
          expect(fit.right).toBeLessThanOrEqual(fit.width - 12);
          expect(fit.bottom).toBeLessThanOrEqual(fit.height - 12);
        }
        await mkdir('.artifacts/improvements/metrics', { recursive: true });
        await writeFile(
          `.artifacts/improvements/metrics/${viewport.width}-${language}-${preset}.json`,
          JSON.stringify(
            { viewport, language, preset, campaign, readable, fit: await mapMetrics(page) },
            null,
            2,
          ),
        );
        expect(errors).toEqual([]);
      });
    }
  }
}

test('display, language, identity, legend, and commander cycling preserve campaign state', async ({
  page,
}) => {
  await startCampaign(page);
  const original = await importLegacy(page, 'dense-battle');
  await selectDisplay(page, 'large');
  await switchLanguage(page, 'zh');
  await switchLanguage(page, 'en');
  await page.getByRole('button', { name: 'Troops & banners legend', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Troop and banner meanings' })).toBeVisible();
  for (const troop of ['Infantry', 'Cavalry', 'Archers', 'Marines', 'Vanguard', 'Guard']) {
    await expect(page.getByRole('region', { name: 'Troop and banner meanings' })).toContainText(
      troop,
    );
  }
  const eligible = original.battle!.units.filter(
    (unit) =>
      unit.side === original.battle!.playerSide &&
      unit.troops > 0 &&
      !unit.acted &&
      unit.status !== 'confused',
  );
  const seen = new Set<string>();
  for (let i = 0; i < eligible.length; i++) {
    await page.getByRole('button', { name: 'Next ready commander', exact: true }).click();
    const id = await page.locator('.unit-card .portrait').getAttribute('data-officer-id');
    expect(eligible.some((unit) => unit.officerId === id)).toBe(true);
    expect(seen.has(id!)).toBe(false);
    seen.add(id!);
  }
  expect(seen.size).toBe(eligible.length);
  await expectPortraitsLoaded(page);
  expect(await savedCampaign(page)).toEqual(original);
  await page.reload();
  expect(await savedCampaign(page)).toEqual(original);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Display size' })).toHaveValue('large');
  await expect(page.getByRole('combobox', { name: 'Rival aggression' })).toBeDisabled();
});

test('legacy multi-battle campaign retains aggression, monthly report, export, slots and reloads', async ({
  page,
}) => {
  await startCampaign(page);
  const original = await importLegacy(page, 'multi-battle-planning');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rival aggression' }).selectOption('aggressive');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const configured = await savedCampaign(page);
  expect(configured.rivalAggression).toBe('aggressive');
  expect(configured.rng).toBe(original.rng);
  expect(configured.cities).toEqual(original.cities);
  expect(configured.officers).toEqual(original.officers);
  await page.getByRole('button', { name: 'Advance month' }).click();
  await expect(page.getByRole('button', { name: 'End battle day' })).toBeVisible();
  const firstBattle = await savedCampaign(page);
  const uninterruptedStart = dispatch(configured, { type: 'endMonth' });
  expect(uninterruptedStart.ok).toBe(true);
  expect(firstBattle).toEqual(uninterruptedStart.state);
  expect(firstBattle.resolution!.queue).toHaveLength(2);
  await page.reload();
  expect(await savedCampaign(page)).toEqual(firstBattle);
  // Exercise a real manual command before completing both battles.
  const commander = await page.locator('.unit-card h3').innerText();
  await page.getByRole('button', { name: 'Rally', exact: true }).click();
  await page.getByRole('button', { name: `rally ${commander}`, exact: true }).click();
  const played = await savedCampaign(page);
  const commanderUnit = firstBattle.battle!.units.find((unit) => unit.name === commander)!;
  const uninterruptedPlayed = dispatch(uninterruptedStart.state, {
    type: 'battleSkill',
    unitId: commanderUnit.id,
    skill: 'rally',
    targetId: commanderUnit.id,
  });
  expect(uninterruptedPlayed.ok).toBe(true);
  expect(played).toEqual(uninterruptedPlayed.state);
  expect(played.battle!.units.some((unit) => unit.acted)).toBe(true);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Auto-resolve', exact: true }).click();
  await dismissBattleSummary(page);
  await expect.poll(async () => (await savedCampaign(page)).resolution?.index).toBe(1);
  const secondBattle = await savedCampaign(page);
  const uninterruptedSecond = dispatch(uninterruptedPlayed.state, { type: 'battleAuto' });
  expect(uninterruptedSecond.ok).toBe(true);
  expect(secondBattle).toEqual(uninterruptedSecond.state);
  expect(
    secondBattle.reports.pending!.events.filter((event) => event.kind === 'battle'),
  ).toHaveLength(1);
  await page.reload();
  expect(await savedCampaign(page)).toEqual(secondBattle);
  await page.getByRole('button', { name: 'Auto-resolve', exact: true }).click();
  await dismissBattleSummary(page);
  await expect(page.getByRole('button', { name: 'Advance month' })).toBeVisible();
  const completed = await savedCampaign(page);
  const uninterruptedCompleted = dispatch(uninterruptedSecond.state, { type: 'battleAuto' });
  expect(uninterruptedCompleted.ok).toBe(true);
  expect(completed).toEqual(uninterruptedCompleted.state);
  expect(completed.turn).toBe(original.turn + 1);
  expect(completed.reports.pending).toBeNull();
  expect(completed.reports.latest!.partial).toBe(false);
  expect(completed.reports.latest!.turn).toBe(original.turn);
  expect(completed.reports.latest!.events.filter((event) => event.kind === 'battle')).toHaveLength(
    2,
  );
  const report = page.getByRole('region', { name: 'Monthly report', exact: true });
  await expect(report).toContainText('January 190');
  await report.getByRole('button', { name: 'View report', exact: true }).click();
  await expect(report.locator('.report-events li')).toHaveCount(2);
  await report.locator('.report-events button').first().click();
  expect(await savedCampaign(page)).toEqual(completed);
  await switchLanguage(page, 'zh');
  await expect(page.getByRole('region', { name: '月度军报', exact: true })).toContainText(
    '190年一月',
  );
  expect(await savedCampaign(page)).toEqual(completed);
  await switchLanguage(page, 'en');
  await page.getByRole('button', { name: 'Save and load', exact: true }).click();
  await page
    .locator('.save-slot')
    .filter({ hasText: 'Campaign slot 1' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export campaign', exact: true }).click();
  const download = await downloadPromise;
  const text = await readFile((await download.path())!, 'utf8');
  expect(decodeSave(text)).toEqual(completed);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await importLegacy(page, 'planning');
  await page.getByRole('button', { name: 'Save and load', exact: true }).click();
  await page
    .locator('.save-slot')
    .filter({ hasText: 'Campaign slot 1' })
    .getByRole('button', { name: 'Load', exact: true })
    .click();
  expect(await savedCampaign(page)).toEqual(completed);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles({
    name: 'roundtrip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.locator('.toast')).toContainText('Campaign imported.');
  await page.reload();
  expect(await savedCampaign(page)).toEqual(completed);
});

test('real pointer picking survives pan, zoom, resize, and drag without issuing orders', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await startCampaign(page);
  const fixture = decodeSave(
    await readFile(new URL('../fixtures/legacy-dense-battle.json', import.meta.url), 'utf8'),
  );
  const positions = [
    { x: 0, y: 0 },
    { x: 11, y: 0 },
    { x: 0, y: 9 },
    { x: 11, y: 9 },
    { x: 6, y: 5 },
  ];
  fixture
    .battle!.units.slice(0, positions.length)
    .forEach((unit, index) => Object.assign(unit, positions[index]));
  await page.locator('input[type=file]').setInputFiles({
    name: 'picking.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeSave(fixture)),
  });
  await expect(page.locator('.toast')).toContainText('Campaign imported.');
  const original = await savedCampaign(page);
  await page.getByRole('button', { name: 'Fit battlefield', exact: true }).click();
  async function pickCornersAndCenter() {
    const metrics = await mapMetrics(page);
    const box = await page.locator('.game-map').boundingBox();
    expect(box).not.toBeNull();
    for (const unit of fixture.battle!.units.slice(0, positions.length)) {
      await page.mouse.click(
        box!.x + metrics.left + (unit.x + 0.5) * metrics.tile,
        box!.y + metrics.top + (unit.y + 0.5) * metrics.tile,
      );
      await expect(page.locator('.unit-card .portrait')).toHaveAttribute(
        'data-officer-id',
        unit.officerId,
      );
    }
    expect(await savedCampaign(page)).toEqual(original);
  }
  await pickCornersAndCenter();
  const box = await page.locator('.game-map').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 20, box!.y + box!.height / 2 - 8, { steps: 6 });
  await page.mouse.up();
  expect(await savedCampaign(page)).toEqual(original);
  await pickCornersAndCenter();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await pickCornersAndCenter();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(async () => (await mapMetrics(page)).width).toBeGreaterThan(box!.width);
  await pickCornersAndCenter();
  // A previous next-ready focus must not override the newly selected commander.
  await selectDisplay(page, 'large');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Next ready commander', exact: true }).click();
  const bottomCommander = fixture.battle!.units[3]!;
  await page
    .locator('.battle-unit-list button')
    .filter({ has: page.locator(`.portrait[data-officer-id="${bottomCommander.officerId}"]`) })
    .click();
  await page.getByRole('button', { name: 'Center selected unit', exact: true }).click();
  const centered = await mapMetrics(page);
  expect(centered.left + bottomCommander.x * centered.tile).toBeGreaterThanOrEqual(12);
  expect(centered.top + bottomCommander.y * centered.tile).toBeGreaterThanOrEqual(12);
  expect(centered.left + (bottomCommander.x + 1) * centered.tile).toBeLessThanOrEqual(
    centered.width - 12,
  );
  expect(centered.top + (bottomCommander.y + 1) * centered.tile).toBeLessThanOrEqual(
    centered.height - 12,
  );
  expect(await savedCampaign(page)).toEqual(original);
});

test('1280 layout and unavailable or corrupt preference storage keep the game playable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    const nativeGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      return key === 'baye.display' ? 'invalid-size' : nativeGet.call(this, key);
    };
  });
  await startCampaign(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Display size' })).toHaveValue('comfortable');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await importLegacy(page, 'dense-battle');
  await page.getByRole('button', { name: 'Fit battlefield', exact: true }).click();
  await expect.poll(async () => (await mapMetrics(page)).tile).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('button', { name: 'End battle day' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const language of ['en', 'zh'] as const) {
  test(`three-month functional playthrough with a manually commanded battle in ${language}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await startCampaign(page);
    await importLegacy(page, 'multi-battle-planning');
    await switchLanguage(page, language);
    await page
      .getByRole('button', { name: language === 'en' ? 'Advance month' : '推进月份' })
      .click();
    await expect(page.locator('.unit-card h3')).toBeVisible();
    const name = await page.locator('.unit-card h3').innerText();
    const destination = page.getByRole('combobox', {
      name: language === 'en' ? 'Move to tile' : '移动目的地',
      exact: true,
    });
    const option = await destination.locator('option').nth(1).getAttribute('value');
    await destination.selectOption(option!);
    await page
      .getByRole('button', { name: language === 'en' ? 'Move unit' : '移动部队', exact: true })
      .click();
    await page
      .getByRole('button', { name: language === 'en' ? 'Rally' : '鼓舞', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: language === 'en' ? `rally ${name}` : `鼓舞${name}`,
      })
      .click();
    const played = await savedCampaign(page);
    expect(played.battle!.units.some((unit) => unit.moved && unit.acted)).toBe(true);
    await page.reload();
    expect(await savedCampaign(page)).toEqual(played);
    for (let guard = 0; (await savedCampaign(page)).phase === 'battle' && guard < 4; guard++) {
      await page
        .getByRole('button', { name: language === 'en' ? 'Auto-resolve' : '自动结算', exact: true })
        .click();
      await dismissBattleSummary(page);
      await savedCampaign(page);
    }
    await expect(
      page.getByRole('button', {
        name: language === 'en' ? 'Advance month' : '推进月份',
      }),
    ).toBeVisible();
    for (let month = 1; month < 3; month++) {
      await page
        .getByRole('button', {
          name: language === 'en' ? 'Advance month' : '推进月份',
        })
        .click();
      await expect.poll(async () => (await savedCampaign(page)).turn).toBe(month + 1);
    }
    const completed = await savedCampaign(page);
    expect(completed.turn).toBe(3);
    await expect(
      page.getByRole('region', {
        name: language === 'en' ? 'Monthly report' : '月度军报',
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    expect(await savedCampaign(page)).toEqual(completed);
    expect(errors).toEqual([]);
  });
}

test('real 200% Chrome browser zoom keeps language, settings, saving, and battle commands reachable', async ({}, testInfo) => {
  test.setTimeout(90_000);
  // Chrome's own appearance setting changes actual browser zoom. This is neither
  // deviceScaleFactor nor CDP page/pinch scaling. Keep this profile isolated.
  const context = await chromium.launchPersistentContext(testInfo.outputPath('zoom-profile'), {
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1920, height: 1080 },
  });
  try {
    const page = await context.newPage();
    await page.goto('chrome://settings/appearance');
    await page.locator('#zoomLevel').selectOption('2');
    await startCampaign(page, String(testInfo.project.use.baseURL));
    const dimensions = await page.evaluate(() => ({
      innerWidth,
      outerWidth,
      devicePixelRatio,
      scale: visualViewport!.scale,
    }));
    expect(dimensions.outerWidth).toBe(1920);
    expect(dimensions.innerWidth).toBe(960);
    expect(dimensions.devicePixelRatio).toBe(2);
    expect(dimensions.scale).toBe(1);
    await selectDisplay(page, 'large');
    await switchLanguage(page, 'zh');
    await switchLanguage(page, 'en');
    await page.getByRole('button', { name: 'Save and load', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export campaign', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await importLegacy(page, 'dense-battle');
    await page.getByRole('button', { name: 'Next ready commander', exact: true }).click();
    await page.getByRole('button', { name: 'Center selected unit', exact: true }).click();
    await page.getByRole('button', { name: 'End battle day' }).click();
    expect((await savedCampaign(page)).battle!.day).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // Capture the actual browser surface: full-page screenshot clipping can use
    // unzoomed coordinates when browser zoom differs from the emulated viewport.
    await page.evaluate(() => scrollTo(0, 0));
    const screenshotSession = await context.newCDPSession(page);
    const screenshot = await screenshotSession.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await mkdir('.artifacts/improvements', { recursive: true });
    await writeFile(
      '.artifacts/improvements/actual-browser-zoom-200.png',
      Buffer.from(screenshot.data, 'base64'),
    );
    await screenshotSession.detach();
  } finally {
    await context.close();
  }
});

test('unavailable display preference storage does not prevent changing size or saving', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === 'baye.display') throw new DOMException('Blocked preference', 'SecurityError');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'baye.display') throw new DOMException('Blocked preference', 'SecurityError');
      return set.call(this, key, value);
    };
  });
  await startCampaign(page);
  const original = await savedCampaign(page);
  await selectDisplay(page, 'large');
  expect(await savedCampaign(page)).toEqual(original);
  await page.getByRole('button', { name: 'Advance month' }).click();
  await expect.poll(async () => (await savedCampaign(page)).turn).toBe(1);
});

test('new settings, legend, commander, and camera controls work through the keyboard', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startCampaign(page);
  const original = await importLegacy(page, 'dense-battle');
  const focus = async (name: string) => {
    const target = page.getByRole('button', { name, exact: true });
    for (let count = 0; count < 140; count++) {
      if (await target.evaluate((element) => element === document.activeElement)) return target;
      await page.keyboard.press('Tab');
    }
    throw new Error(`Keyboard could not reach ${name}`);
  };
  await focus('Settings');
  const outline = await page
    .getByRole('button', { name: 'Settings', exact: true })
    .evaluate((element) => ({
      width: parseFloat(getComputedStyle(element).outlineWidth),
      style: getComputedStyle(element).outlineStyle,
    }));
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(outline.style).not.toBe('none');
  await page.keyboard.press('Enter');
  const size = page.getByRole('combobox', { name: 'Display size' });
  for (
    let count = 0;
    count < 20 && !(await size.evaluate((element) => element === document.activeElement));
    count++
  )
    await page.keyboard.press('Tab');
  await expect(size).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(size).toHaveValue('large');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  await focus('Troops & banners legend');
  await page.keyboard.press('Space');
  await expect(page.getByRole('region', { name: 'Troop and banner meanings' })).toBeVisible();
  await focus('Next ready commander');
  await page.keyboard.press('Enter');
  await focus('Center selected unit');
  await page.keyboard.press('Enter');
  await expect(page.locator('.game-shell')).toHaveClass(/reduced-motion/);
  expect(await savedCampaign(page)).toEqual(original);
});

test('an initially free officer keeps the same portrait after recruitment, captivity and allegiance changes', async ({
  page,
}) => {
  await startCampaign(page);
  const fixture = createGame('cao', 3);
  expect(fixture.officers.find((officer) => officer.id === 'dianwei')!.factionId).toBeNull();
  await importState(page, fixture);
  await page.getByRole('button', { name: 'City index', exact: true }).click();
  await page
    .locator('.city-index')
    .getByRole('button', { name: /^Chenliu/ })
    .click();
  await page.getByRole('tab', { name: 'Officers', exact: true }).click();
  await page.getByRole('button', { name: /^Search for talent/ }).click();
  const recruited = await savedCampaign(page);
  expect(recruited.officers.find((officer) => officer.id === 'dianwei')!.factionId).toBe('cao');
  await page.getByRole('button', { name: 'Select Dian Wei', exact: true }).click();
  const portrait = page.locator('.officer-summary .portrait[data-officer-id="dianwei"] img');
  await expect(portrait).toHaveAttribute('src', /assets\/portraits\/dianwei\.webp$/);
  await expectPortraitsLoaded(page);
  const source = await portrait.getAttribute('src');
  await switchLanguage(page, 'zh');
  await expect(page.locator('.officer-summary')).toContainText('典韦');
  await expect(portrait).toHaveAttribute('src', source!);
  await switchLanguage(page, 'en');
  const captured = structuredClone(recruited);
  Object.assign(
    captured.officers.find((officer) => officer.id === 'dianwei')!,
    { cityId: 'luoyang', captive: true, troops: 0 },
  );
  expect(validateState(captured)).toBeNull();
  await importState(page, captured);
  const prisoner = await savedCampaign(page);
  expect(prisoner.officers.find((officer) => officer.id === 'dianwei')).toMatchObject({
    id: 'dianwei',
    factionId: 'cao',
    captive: true,
    cityId: 'luoyang',
  });
  const transferred = structuredClone(prisoner);
  Object.assign(
    transferred.officers.find((officer) => officer.id === 'dianwei')!,
    { factionId: 'dong', captive: false, busy: false },
  );
  expect(validateState(transferred)).toBeNull();
  await importState(page, transferred);
  await page.getByRole('button', { name: 'City index', exact: true }).click();
  await page
    .locator('.city-index')
    .getByRole('button', { name: /^Luoyang/ })
    .click();
  await page.getByRole('button', { name: 'Select Dian Wei', exact: true }).click();
  await expect(page.locator('.ownership-badge')).toContainText('Dong Zhuo');
  await expect(page.locator('.officer-summary')).toContainText('Dian Wei');
  await expect(page.locator('.officer-summary .portrait img')).toHaveAttribute('src', source!);
});

test('historical person names determine portraits for Ma Teng and Zu Mao despite misleading stable IDs', async ({
  page,
}) => {
  await startCampaign(page);
  const fixture = createGame('cao', 190);
  for (const id of ['maliang', 'zuzhao'])
    Object.assign(
      fixture.officers.find((officer) => officer.id === id)!,
      { cityId: 'chenliu', factionId: 'cao', captive: false },
    );
  expect(validateState(fixture)).toBeNull();
  await importState(page, fixture);
  await page.getByRole('button', { name: 'City index', exact: true }).click();
  await page
    .locator('.city-index')
    .getByRole('button', { name: /^Chenliu/ })
    .click();
  for (const person of [
    { id: 'maliang', name: 'Ma Teng', chinese: '马腾' },
    { id: 'zuzhao', name: 'Zu Mao', chinese: '祖茂' },
  ]) {
    await page.getByRole('button', { name: `Select ${person.name}`, exact: true }).click();
    await expect(page.locator('.officer-summary')).toContainText(person.name);
    await expect(
      page.locator(`.officer-summary .portrait[data-officer-id="${person.id}"] img`),
    ).toHaveAttribute('src', new RegExp(`assets/portraits/${person.id}\\.webp$`));
    await expectPortraitsLoaded(page);
    await switchLanguage(page, 'zh');
    await expect(page.locator('.officer-summary')).toContainText(person.chinese);
    await switchLanguage(page, 'en');
  }
  await page.getByRole('navigation').getByRole('button', { name: 'Officers', exact: true }).click();
  const row = page.locator('.roster-row').filter({ hasText: 'Ma Teng' });
  await expect(row.locator('.portrait')).toHaveAttribute('data-officer-id', 'maliang');
  await row.click();
  await expect(page.locator('.officer-summary .portrait')).toHaveAttribute(
    'data-officer-id',
    'maliang',
  );
});
