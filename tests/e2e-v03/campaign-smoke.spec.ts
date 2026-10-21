import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
import { createBattleMap, type BattleRegion } from '../../src/v03/battle';
import { executeV03Command } from '../../src/v03/commands';
import { createV03Game } from '../../src/v03/initial-state';
import { encodeV03Save } from '../../src/v03/platform/storage';
import type { V03GameState } from '../../src/v03/types';

const AUTOSAVE_KEY = 'hegemony-v0.3:autosave';

async function startCampaign(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
}

async function storedSave(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw) as {
          format: string;
          version: number;
          ruleset: string;
          state: { version: number; absoluteDay: number };
        })
      : null;
  }, AUTOSAVE_KEY);
}

async function importFile(page: Page, name: string, content: string) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(content, 'utf8'),
  });
}

function createBattleSave(regionId: BattleRegion = 'xiapi'): string {
  let state: V03GameState = createV03Game('cao', 481516);
  const dispatched = executeV03Command(state, {
    type: 'issueCampaignDirective',
    sourceCityId: 'puyang',
    targetCityId: 'xiapi',
    intent: 'conquer',
    requestedTroops: 700,
    requestedByDay: null,
  });
  if (!dispatched.ok)
    throw new Error(dispatched.error ?? 'Could not create the browser battle fixture.');
  state = dispatched.state;

  for (let day = 0; day < 120; day++) {
    const battle = state.battles.find((entry) => entry.active && entry.attackerFactionId === 'cao');
    if (battle) {
      const map = createBattleMap({
        regionId,
        approachDirection: 'north',
        seed: 481516,
      });
      battle.battleData.map = map;
      battle.mapId = map.mapId;
      battle.mapVersion = map.templateVersion;
      battle.seed = map.seed;
      for (const side of ['attacker', 'defender'] as const) {
        const deployment = side === 'attacker' ? map.attackerDeployment : map.defenderDeployment;
        battle.battleData.units
          .filter((unit) => unit.side === side)
          .forEach((unit, index) =>
            Object.assign(unit, deployment[index], { moved: false, acted: false }),
          );
      }
      return encodeV03Save(state);
    }
    for (const event of state.events.filter((entry) => !entry.acknowledged)) {
      state = executeV03Command(state, { type: 'acknowledgeEvent', eventId: event.id }).state;
    }
    const advanced = executeV03Command(state, { type: 'advance', days: 1 });
    if (!advanced.ok)
      throw new Error(advanced.error ?? 'Could not advance the browser battle fixture.');
    state = advanced.state;
  }
  throw new Error('The browser battle fixture did not reach its destination.');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__v03_e2e_initialized') !== '1') {
      localStorage.clear();
      sessionStorage.setItem('__v03_e2e_initialized', '1');
    }
  });
});

test('starts a campaign, loads the atlas, advances time, saves and rejects invalid imports', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const atlasResponse = page.waitForResponse((response) =>
    response.url().includes('/assets/v03/maps/campaign-ink-map-01.webp'),
  );
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
  expect((await atlasResponse).status()).toBe(200);
  await expect(page.locator('.v03-map-frame svg image').first()).toHaveAttribute(
    'href',
    /campaign-ink-map-01\.webp$/,
  );
  await page.screenshot({
    path: testInfo.outputPath('campaign.png'),
    fullPage: true,
    animations: 'disabled',
  });

  const date = page.locator('.v03-date strong');
  await expect(date).toContainText('Day 1');
  await page.getByRole('button', { name: 'Advance 1 day', exact: true }).click();
  await expect(date).toContainText('Day 2');
  await page.getByRole('button', { name: 'Advance 10 days', exact: true }).click();
  await expect(date).toContainText('Day 12');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = await storedSave(page);
  expect(saved).toMatchObject({ format: 'hegemony.save', version: 3, ruleset: 'hegemony-3' });
  expect(saved?.state).toMatchObject({ version: 3, absoluteDay: 11 });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Advance 1 day', exact: true })).toBeVisible();
  await expect(date).toContainText('Day 12');

  await importFile(
    page,
    'old-v2.save',
    JSON.stringify({ format: 'hegemony.save', version: 2, ruleset: 'hegemony-2', state: {} }),
  );
  await expect(page.getByRole('status')).toContainText('older version');
  expect(await storedSave(page)).toMatchObject({ version: 3, state: { absoluteDay: 11 } });

  await importFile(page, 'not-a-save.json', '{ definitely not json');
  await expect(page.getByRole('status')).toContainText('not valid JSON');
  expect(await storedSave(page)).toMatchObject({ version: 3, state: { absoluteDay: 11 } });
});

test('renders and resumes a playable 24×20 battle with unit artwork', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
  await importFile(page, 'battle.save', createBattleSave());
  await expect(page.locator('.v03-battle-main')).toBeVisible();
  await expect(page.locator('.v03-battle-board svg')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  const endBattleDay = page
    .locator('.v03-top-actions')
    .getByRole('button', { name: 'End battle day', exact: true });
  await expect(endBattleDay).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('battlefield.png'),
    fullPage: true,
    animations: 'disabled',
  });

  const battleDay = page.locator('.v03-battle-day');
  await expect(battleDay).toContainText('1 / 30');
  await endBattleDay.click();
  await expect(battleDay).toContainText('2 / 30');
  await page.reload();
  await expect(page.locator('.v03-battle-day')).toContainText('Battle day 2 / 30');
  expect(await page.locator('.v03-battle-board svg image').count()).toBeGreaterThan(0);
});

test('renders all four geographic battlefield templates in the playable view', async ({
  page,
}, testInfo) => {
  await startCampaign(page);

  for (const region of ['hanzhong', 'shouchun', 'xiapi', 'chengdu'] as const) {
    await importFile(page, `${region}-battle.save`, createBattleSave(region));
    await expect(page.locator('.v03-battle-main')).toBeVisible();
    await expect(page.locator('.v03-view-heading .v03-kicker')).toContainText(region.toUpperCase());
    await expect(page.locator('.v03-battle-board svg image').first()).toHaveAttribute(
      'href',
      /(?:units|terrain)\//,
    );
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`battlefield-${region}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
});

test('opens the wiki in English and Chinese while keeping the campaign available', async ({
  page,
}) => {
  await startCampaign(page);

  await page.getByRole('button', { name: 'Field guide / Wiki', exact: true }).click();
  const englishWiki = page.getByRole('dialog', { name: 'Field guide / Wiki' });
  await expect(englishWiki).toBeVisible();
  await expect(englishWiki.getByText('Your first campaign')).toBeVisible();
  await englishWiki.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: '中文', exact: true }).click();
  await page.getByRole('button', { name: '游戏指南 / Wiki', exact: true }).click();
  const chineseWiki = page.getByRole('dialog', { name: '游戏指南 / Wiki' });
  await expect(chineseWiki).toBeVisible();
  await chineseWiki.getByRole('button', { name: '兵种', exact: true }).click();
  await expect(chineseWiki.getByText('战场部队')).toBeVisible();
  await expect(chineseWiki.getByText(/步兵稳定守线/)).toBeVisible();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
});

test('keeps the campaign map and key controls available at mobile and desktop widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await startCampaign(page);
  for (const width of [390, 1366, 1920]) {
    if (width !== 390) await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.v03-map-frame')).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: width === 390 ? 'Advance 1 day' : '推进一日',
        exact: true,
      }),
    ).toBeVisible();

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow, `unexpected horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      1,
    );

    if (width === 390) {
      await page.getByRole('button', { name: '中文', exact: true }).click();
    }
  }
});

test('keeps generated unit and transport art transparent around the figure', async ({ page }) => {
  await page.goto('/');
  const samples = await page.evaluate(async () => {
    const paths = [
      '/assets/v03/units/infantry-ink-01.webp',
      '/assets/v03/units/archer-ink-01.webp',
      '/assets/v03/units/cavalry-ink-01.webp',
      '/assets/v03/units/transport-craft-ink-01.webp',
    ];
    return Promise.all(
      paths.map(async (path) => {
        const image = new Image();
        image.src = path;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable.');
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const alphaAt = (x: number, y: number) => data[(y * canvas.width + x) * 4 + 3]!;
        return {
          path,
          width: image.naturalWidth,
          height: image.naturalHeight,
          corners: [
            alphaAt(0, 0),
            alphaAt(canvas.width - 1, 0),
            alphaAt(0, canvas.height - 1),
            alphaAt(canvas.width - 1, canvas.height - 1),
          ],
          centerAlpha: alphaAt(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)),
        };
      }),
    );
  });
  for (const image of samples) {
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
    expect(image.corners, image.path).toEqual([0, 0, 0, 0]);
    expect(image.centerAlpha, image.path).toBeGreaterThan(0);
  }
});
