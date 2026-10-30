import {
  openCity,
  closeCityWindow,
  showCityManagement,
  showAssignment,
  showOfficer,
  showGovernor,
  confirmWork,
  showForces,
  openMenu,
  closeMenu,
  submitBattleDay,
  showSupplies,
  showWithdrawal,
  selectTab,
} from './ui-navigation';
import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { battlefieldBounds } from '../../src/v03/rendering/geometry';
import type { V03GameState } from '../../src/v03/types';
import {
  asSave,
  governorTransferState,
  inboxState,
  mixedBattleState,
  npcOnlyState,
  reviewBattleState,
} from './playability-fixtures';

const SAVE_KEY = 'hegemony-v0.3:autosave';

async function loadState(page: Page, state: V03GameState) {
  await page.goto('/');
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: SAVE_KEY,
    raw: asSave(state),
  });
  await page.reload();
  await expect(page.locator('.v03-shell')).toBeVisible();
}

async function savedState(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, SAVE_KEY);
}

async function locale(page: Page, value: 'en' | 'zh') {
  if (await page.locator('.v03-campaign-window').count()) {
    if ((await page.locator('html').getAttribute('lang')) !== value)
      await page.locator('.v03-window-language').click();
    return;
  }
  await openMenu(page);
  if ((await page.locator('html').getAttribute('lang')) !== value)
    await page.getByRole('button', { name: value === 'zh' ? '中文' : 'EN', exact: true }).click();
  await closeMenu(page);
  await expect(page.locator('html')).toHaveAttribute('lang', value);
}

async function importState(page: Page, state: V03GameState) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'review.save',
    mimeType: 'application/json',
    buffer: Buffer.from(asSave(state)),
  });
}

test('RV01 advances a natural Guandu Sun NPC battle from both language interfaces', async ({
  page,
}) => {
  const state = npcOnlyState();
  expect(state.battles.some((battle) => battle.active)).toBe(true);
  for (const language of ['en', 'zh'] as const) {
    await loadState(page, state);
    await locale(page, language);
    await expect(page.locator('.v03-campaign-main')).toBeVisible();
    await expect(page.locator('.v03-battle-tab')).toHaveCount(0);
    await page
      .getByRole('button', { name: language === 'en' ? 'Advance 1 day' : '推进一日', exact: true })
      .click();
    await expect.poll(async () => (await savedState(page)).absoluteDay).toBe(state.absoluteDay + 1);
    await page.reload();
    await expect(page.locator('.v03-campaign-main')).toBeVisible();
    expect((await savedState(page)).absoluteDay).toBe(state.absoluteDay + 1);
  }
});

for (const twoPlayerBattles of [false, true])
  test(`RV01 submits only required player battles (${twoPlayerBattles ? 'two player' : 'player and NPC'})`, async ({
    page,
  }) => {
    const state = mixedBattleState(twoPlayerBattles);
    await loadState(page, state);
    await expect(page.locator('.v03-battle-tab')).toHaveCount(twoPlayerBattles ? 2 : 1);
    await submitBattleDay(page);
    if (twoPlayerBattles) {
      expect((await savedState(page)).absoluteDay).toBe(state.absoluteDay);
      await page.reload();
      await page.locator('.v03-battle-tab').nth(1).click();
      await submitBattleDay(page);
    }
    await expect.poll(async () => (await savedState(page)).absoluteDay).toBe(state.absoluteDay + 1);
  });

test('RV03 resumes without replacing a save, confirms a new campaign, and reopens finished campaigns', async ({
  page,
}) => {
  const state = reviewBattleState();
  await loadState(page, state);
  const original = await savedState(page);
  await openMenu(page);
  await page.getByRole('button', { name: 'Campaign menu', exact: true }).click();
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace current campaign?', exact: true });
  await expect(
    dialog.getByRole('button', { name: 'Export current campaign', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Resume campaign', exact: true }).click();
  expect(await savedState(page)).toEqual(original);
  await expect(page.locator('.v03-battle-main')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect
    .poll(async () =>
      page.locator('.v03-battlefield-map').evaluate((node) => {
        const svg = node as SVGSVGElement;
        const frame = svg.getBoundingClientRect();
        return Math.abs(
          svg.viewBox.baseVal.width / svg.viewBox.baseVal.height - frame.width / frame.height,
        );
      }),
    )
    .toBeLessThan(0.01);
  await page.setViewportSize({ width: 1440, height: 960 });
  await openMenu(page);
  await page.getByRole('button', { name: 'Campaign menu', exact: true }).click();
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await dialog.getByRole('button', { name: 'Replace and begin', exact: true }).click();
  await expect.poll(async () => (await savedState(page)).absoluteDay).toBe(0);
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
  const finished = createV03Game('cao', 8271);
  finished.phase = 'finished';
  finished.winnerFactionId = 'cao';
  await importState(page, finished);
  // The finished campaign opens on its end screen (PF-UI-09).
  await page.getByRole('button', { name: 'View the map', exact: true }).click();
  await openMenu(page);
  await page.getByRole('button', { name: 'Campaign menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New campaign', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Resume campaign', exact: true })).toBeEnabled();
});

test('RV03 clears successful-import drafts and preserves them on failed import', async ({
  page,
}) => {
  await loadState(page, createV03Game('cao', 173));
  await showAssignment(page);
  const assignment = page.getByRole('spinbutton', { name: /Officer troop count/ }).first();
  const initial = await assignment.inputValue();
  await assignment.fill('37');
  await openCity(page, 'Puyang');
  await showSupplies(page);
  await page
    .locator('.v03-supply-targets')
    .getByRole('button', { name: 'Chenliu', exact: true })
    .click();
  await page.getByLabel('Gold', { exact: true }).fill('500000');
  await page.getByRole('button', { name: 'Review proposal', exact: true }).click();
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  const preview = page.locator('.v03-route-preview[aria-live="polite"]');
  await expect(preview).toHaveCount(1);
  await page.locator('input[type=file]').setInputFiles({
    name: 'invalid.save',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(preview).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText(/not a valid|invalid/i);
  await openCity(page, 'Chenliu');
  await showAssignment(page);
  await expect(assignment).toHaveValue('37');
  await importState(page, createV03Game('cao', 174));
  await showAssignment(page);
  await expect(assignment).toHaveValue(initial);
  await expect(preview).toHaveCount(0);
  await importState(page, createV03Game('sun', 175, 'guandu-200'));
  await expect.poll(async () => (await savedState(page)).scenarioId).toBe('guandu-200');
  await expect(preview).toHaveCount(0);
});

for (const language of ['en', 'zh'] as const)
  test(`RV03 exports during local-save failure and retries storage without losing the campaign (${language})`, async ({
    page,
  }) => {
    await loadState(page, createV03Game('cao', 345));
    await locale(page, language);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Reflect.set(window, '__restoreReviewStorage', () => {
        Storage.prototype.setItem = original;
      });
      Storage.prototype.setItem = function (key, value) {
        if (key === 'hegemony-v0.3:autosave')
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page
      .getByRole('button', { name: language === 'en' ? 'Advance 1 day' : '推进一日', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(language === 'en' ? /sav/i : /存/);
    const download = page.waitForEvent('download');
    await openMenu(page);
    await page
      .getByRole('button', { name: language === 'en' ? 'Export' : '导出', exact: true })
      .click();
    expect((await download).suggestedFilename()).toMatch(/hegemony-v0\.3/);
    await expect(page.getByRole('status')).toContainText(language === 'en' ? /export/i : /导出/);
    await expect(page.getByRole('alert')).toBeVisible();
    await page.evaluate(() => Reflect.get(window, '__restoreReviewStorage')());
    await page.getByRole('alert').getByRole('button').click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    expect((await savedState(page)).absoluteDay).toBe(1);
  });

test('RV07 completes recruit, assign and march through the visible capital controls in EN/ZH', async ({
  page,
}) => {
  for (const language of ['en', 'zh'] as const) {
    const state = createV03Game('cao', 2468);
    const capital = state.cities.find((city) => city.id === state.playerCapitalCityId)!;
    const officer = state.officers.find(
      (entry) =>
        entry.alive &&
        entry.factionId === 'cao' &&
        entry.location.kind === 'city' &&
        entry.location.cityId === capital.id,
    )!;
    await loadState(page, state);
    await locale(page, language);
    await showCityManagement(page);
    await page
      .getByRole('button', {
        name: language === 'en' ? 'Recruit soldiers' : '征募士兵',
        exact: true,
      })
      .click();
    await confirmWork(page);
    const recruited = (await savedState(page)).cities.find((city) => city.id === capital.id)!;
    expect(recruited.reserve).toBeGreaterThan(capital.reserve);
    await showAssignment(page, language === 'en' ? officer.name : officer.chinese);
    await page
      .getByRole('spinbutton', {
        name:
          language === 'en'
            ? `Officer troop count: ${officer.name}`
            : `将领兵力: ${officer.chinese}`,
        exact: true,
      })
      .fill(String(officer.troops + 100));
    await confirmWork(page);
    const assigned = await savedState(page);
    expect(assigned.officers.find((entry) => entry.id === officer.id)?.troops).toBe(
      officer.troops + 100,
    );
    expect(assigned.cities.find((city) => city.id === capital.id)?.reserve).toBe(
      recruited.reserve - 100,
    );
    await showForces(page);
    await page.locator('.v03-army-officer input').first().check();
    await page
      .getByLabel(
        language === 'en' ? 'Destination (house, then ETA)' : '目的地（按势力、行程排序）',
      )
      .selectOption('xiapi');
    await page
      .getByRole('button', { name: language === 'en' ? 'Confirm march' : '确认出征', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await savedState(page)).journeys.filter(
            (entry) => entry.kind === 'campaign' && entry.ownerFactionId === 'cao',
          ).length,
      )
      .toBe(1);
  }
});

test('RV04 exposes every player decision and the full report backlog without rival controls', async ({
  page,
}) => {
  await loadState(page, inboxState());
  await selectTab(page, 'Orders');
  await expect(page.locator('.v03-orders-list .v03-order-card')).toHaveCount(9);
  await expect(page.locator('.v03-orders-list')).not.toContainText('Review rival order');
  await expect(page.locator('.v03-orders-list')).toContainText('Review player order 1');
  await expect(page.locator('.v03-orders-list')).toContainText('Review player order 9');
  await closeCityWindow(page);
  await page.getByRole('button', { name: /Inbox/ }).click();
  await expect(page.locator('.v03-events .v03-event')).toHaveCount(12);
  await expect(page.locator('.v03-events > header')).toContainText('12');
  await page.locator('.v03-events > header').getByRole('button').click();
  await page.getByRole('button', { name: 'Advance 1 day', exact: true }).click();
  expect((await savedState(page)).absoluteDay).toBe(0);
  for (let remaining = 12; remaining > 0; remaining--) {
    await page
      .locator('.v03-events')
      .getByRole('button', { name: 'Acknowledge', exact: true })
      .first()
      .click();
  }
  await expect(page.locator('.v03-events .v03-event')).toHaveCount(0);
  await page.locator('.v03-events > header').getByRole('button').click();
  await page.getByRole('button', { name: 'Advance 1 day', exact: true }).click();
  await expect.poll(async () => (await savedState(page)).absoluteDay).toBe(1);
  await locale(page, 'zh');
  await selectTab(page, 'Orders');
  await expect(page.locator('.v03-orders-list .v03-order-card')).toHaveCount(9);
});

test('RV05 transfers a troop-free incumbent through the actual governor controls', async ({
  page,
}) => {
  const state = governorTransferState();
  await loadState(page, state);
  await openCity(page, 'Xuchang');
  await showGovernor(page);
  const candidate = page.getByLabel('Governor candidate', { exact: true });
  await candidate.selectOption('xiahoudun');
  await page.getByRole('button', { name: 'Appoint governor', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await savedState(page)).cities.find((city) => city.id === 'xuchang')?.pendingAppointment
          ?.governorId,
    )
    .toBe('xiahoudun');
  const current = await savedState(page);
  expect(current.cities.find((city) => city.id === 'puyang')?.governorId).toBe('xiahoudun');
  expect(current.officers.find((officer) => officer.id === 'xiahoudun')?.location.kind).toBe(
    'journey',
  );
  await locale(page, 'zh');
  await page.getByRole('button', { name: /太守任免/ }).click();
  await expect(page.getByLabel('太守人选', { exact: true })).toBeVisible();
});

test('RV06 presents living small forces accurately and removes defeated units from interaction', async ({
  page,
}) => {
  const state = reviewBattleState();
  const data = state.battles[0]!.battleData;
  const living = data.units[0]!;
  const dead = {
    ...living,
    id: 'review-defeated-unit',
    name: 'Defeated review unit',
    troops: 0,
    initialTroops: 500,
    isMilitia: true,
  };
  data.units.push(dead);
  await loadState(page, state);
  await expect(page.locator('.v03-unit-token')).toHaveCount(data.units.length - 1);
  await expect(page.locator('.v03-unit-token[data-unit-id="review-defeated-unit"]')).toHaveCount(0);
  await expect(
    page.locator('.v03-battlefield-minimap [data-unit-id="review-defeated-unit"]'),
  ).toHaveCount(0);
  await expect(page.locator('.v03-unit-row')).toHaveCount(data.units.length - 1);
  await expect(page.locator('.v03-unit-token').filter({ hasText: '700' })).toHaveCount(1);
  await expect(page.locator('.v03-unit-token').filter({ hasText: '500' })).toHaveCount(1);
});

test('RV05 preserves an explicitly pending dismissal after reload', async ({ page }) => {
  const state = governorTransferState();
  await loadState(page, state);
  await openCity(page, 'Puyang');
  await showGovernor(page);
  await page.getByLabel('Governor candidate', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Dismiss governor', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await savedState(page)).cities.find((city) => city.id === 'puyang')?.pendingAppointment
          ?.governorId,
    )
    .toBe(null);
  await page.reload();
  await openCity(page, 'Puyang');
  await showGovernor(page);
  await expect(page.getByLabel('Governor candidate', { exact: true })).toHaveValue('');
  await locale(page, 'zh');
  await expect(page.getByLabel('太守人选', { exact: true })).toHaveValue('');
});

test('RV07 shows reserve/officer results and rejects training when both benefits are capped', async ({
  page,
}) => {
  const state = createV03Game('cao', 868);
  const capital = state.cities.find((city) => city.id === state.playerCapitalCityId)!;
  const officer = state.officers.find(
    (entry) =>
      entry.location.kind === 'city' &&
      entry.location.cityId === capital.id &&
      entry.factionId === 'cao',
  )!;
  officer.force = 100;
  officer.experience = 500;
  officer.level = 5;
  await loadState(page, state);
  await showCityManagement(page);
  await expect(page.getByRole('term').filter({ hasText: /^Reserve soldiers$/ })).toBeVisible();
  await expect(page.getByText('Population', { exact: true })).toBeVisible();
  await showOfficer(page, officer.name);
  await expect(page.getByRole('button', { name: 'Train', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Train', exact: true })).toHaveAttribute(
    'title',
    /training limit/,
  );
  await expect(page.locator('.v03-work-detail')).toHaveCount(0);
  expect(await savedState(page)).toEqual(state);
  await showCityManagement(page);
  await locale(page, 'zh');
  await page.getByRole('button', { name: '征募士兵', exact: true }).click();
  await confirmWork(page);
  await expect
    .poll(
      async () => (await savedState(page)).cities.find((city) => city.id === capital.id)!.reserve,
    )
    .toBeGreaterThan(capital.reserve);
  await expect(page.getByRole('term').filter({ hasText: /^预备兵$/ })).toBeVisible();
  await expect(page.locator('.v03-window-feedback')).not.toContainText(/recruit|reserve|soldiers/);
});

test('RV09 and RV10 expose current conditions and make withdrawal cancelable in both languages', async ({
  page,
}) => {
  for (const language of ['en', 'zh'] as const) {
    await loadState(page, reviewBattleState());
    await locale(page, language);
    const original = await savedState(page);
    const conditions = page.getByRole('region', {
      name: language === 'en' ? 'Battle conditions' : '战场状况',
      exact: true,
    });
    await expect(conditions).toContainText(language === 'en' ? /weather/i : /天气/);
    await expect(conditions).toContainText(language === 'en' ? /suppl|food/i : /粮/);
    if (language === 'zh') {
      // Your formations and the enemy's are listed separately (play-feel PF-UI-07).
      const rosters = page.locator('.v03-unit-list');
      await expect(rosters).toHaveCount(2);
      await expect(rosters.first()).toContainText('夏侯渊');
      for (const roster of await rosters.all())
        await expect(roster).not.toContainText(/Cavalry|Militia|Xiahou Yuan/);
    }
    await showWithdrawal(page);
    await page
      .getByRole('button', {
        name: language === 'en' ? 'Withdraw from battle' : '整军撤退',
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog', {
      name: language === 'en' ? 'Withdraw from battle?' : '整军撤退？',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('F1');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: language === 'en' ? 'Withdraw from battle' : '整军撤退',
        exact: true,
      }),
    ).toBeFocused();
    expect(await savedState(page)).toEqual(original);
    await showWithdrawal(page);
    await page
      .getByRole('button', {
        name: language === 'en' ? 'Withdraw from battle' : '整军撤退',
        exact: true,
      })
      .click();
    await dialog
      .getByRole('button', {
        name: language === 'en' ? 'Confirm withdrawal' : '确认撤离',
        exact: true,
      })
      .click();
    await expect.poll(async () => (await savedState(page)).battles[0]?.resolved).toBe(true);
    expect((await savedState(page)).battles[0]?.outcome).toBe('defender');
  }
});

for (const region of ['bf01-north-plain', 'bf04-wetland-north', 'bf09-gorge', 'bf08-south-hills'])
  test(`RV02 keeps ${region} fitted and stable throughout the responsive/zoom/language matrix`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await loadState(page, reviewBattleState(region));
    const bounds = battlefieldBounds(48, 32);
    for (const language of ['en', 'zh'] as const) {
      await locale(page, language);
      for (const zoom of [1, 2])
        for (const width of [390, 1366, 1920]) {
          await page.setViewportSize({ width: width * zoom, height: 900 });
          await page.evaluate((factor) => {
            document.documentElement.style.zoom = String(factor);
          }, zoom);
          await page
            .getByRole('button', {
              name: language === 'en' ? 'Fit full battlefield' : '显示全图',
              exact: true,
            })
            .click();
          const sample = await page
            .locator('.v03-battlefield-map')
            .evaluate(async (node, expected) => {
              await document.fonts.ready;
              const svg = node as SVGSVGElement;
              const frames: Array<{ width: number; height: number }> = [];
              for (let index = 0; index < 12; index++) {
                await new Promise(requestAnimationFrame);
                const rect = svg.getBoundingClientRect();
                frames.push({ width: rect.width, height: rect.height });
              }
              const matrix = svg.getScreenCTM()!;
              const corners = [
                [expected.left, expected.top],
                [expected.right, expected.top],
                [expected.right, expected.bottom],
                [expected.left, expected.bottom],
              ].map(([x, y]) => {
                const point = new DOMPoint(x, y).matrixTransform(matrix);
                return { x: point.x, y: point.y };
              });
              const frame = svg.getBoundingClientRect();
              return {
                frames: frames.slice(-10),
                corners,
                frame: {
                  left: frame.left,
                  right: frame.right,
                  top: frame.top,
                  bottom: frame.bottom,
                  width: frame.width,
                  height: frame.height,
                },
              };
            }, bounds);
          for (const dimension of ['width', 'height'] as const)
            expect(
              Math.max(...sample.frames.map((frame) => frame[dimension])) -
                Math.min(...sample.frames.map((frame) => frame[dimension])),
            ).toBeLessThanOrEqual(1);
          for (const corner of sample.corners) {
            expect(corner.x).toBeGreaterThanOrEqual(sample.frame.left - 1);
            expect(corner.x).toBeLessThanOrEqual(sample.frame.right + 1);
            expect(corner.y).toBeGreaterThanOrEqual(sample.frame.top - 1);
            expect(corner.y).toBeLessThanOrEqual(sample.frame.bottom + 1);
          }
          const projectedWidth =
            Math.max(...sample.corners.map((point) => point.x)) -
            Math.min(...sample.corners.map((point) => point.x));
          const projectedHeight =
            Math.max(...sample.corners.map((point) => point.y)) -
            Math.min(...sample.corners.map((point) => point.y));
          expect(
            Math.max(projectedWidth / sample.frame.width, projectedHeight / sample.frame.height),
          ).toBeGreaterThan(0.6);
        }
    }
  });

test('RV02 keeps the atlas minimap compact inside its stable main frame', async ({ page }) => {
  await loadState(page, createV03Game('cao', 761));
  await page.getByRole('button', { name: 'Toggle minimap', exact: true }).click();
  for (const width of [390, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const measure = await page.locator('.v03-map-frame').evaluate(async (frame) => {
      await document.fonts.ready;
      for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame);
      const a = frame.getBoundingClientRect();
      const b = frame.querySelector('.v03-campaign-minimap')!.getBoundingClientRect();
      return {
        frame: { left: a.left, right: a.right, top: a.top, bottom: a.bottom, width: a.width },
        mini: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width },
      };
    });
    expect(measure.mini.width).toBeLessThanOrEqual(Math.min(240, measure.frame.width * 0.31) + 1);
    expect(measure.mini.left).toBeGreaterThanOrEqual(measure.frame.left);
    expect(measure.mini.right).toBeLessThanOrEqual(measure.frame.right);
    expect(measure.mini.top).toBeGreaterThanOrEqual(measure.frame.top);
    expect(measure.mini.bottom).toBeLessThanOrEqual(measure.frame.bottom);
  }
});
