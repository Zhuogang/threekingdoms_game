import { expect, test, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { encodeV03Save } from '../../src/v03/platform/storage';
import { createPersonnelDay } from '../../src/v03/campaign/personnel';
import { executeV03Command } from '../../src/v03/commands';
import { applyV03CityAction } from '../../src/v03/governance/city-actions';
import type { V03GameState } from '../../src/v03/types';
import { openCity, showOfficers } from './ui-navigation';

const key = 'hegemony-v0.3:autosave';
async function load(page: Page, state: V03GameState, locale: 'zh' | 'en') {
  await page.goto('/?lang=' + locale);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: encodeV03Save(state),
  });
  await page.reload();
  await expect(page.locator('.v03-campaign-main, .v03-battle-shell').first()).toBeVisible();
}
async function raw(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), key);
}
async function directory(page: Page, locale: 'zh' | 'en') {
  await page
    .getByRole('button', { name: locale === 'zh' ? '人物名册' : 'Officer directory', exact: true })
    .click();
  await expect(page.locator('.v03-officer-directory')).toBeVisible();
}
async function search(page: Page, locale: 'zh' | 'en', query: string) {
  await page
    .getByRole('textbox', { name: locale === 'zh' ? '查找姓名或复姓' : 'Search names or surnames' })
    .fill(query);
}
async function fits(page: Page) {
  const geometry = await page.locator('dialog[open]').evaluate((dialog) => ({
    x: dialog.getBoundingClientRect().x,
    right: dialog.getBoundingClientRect().right,
    width: document.documentElement.clientWidth,
    body: dialog.querySelector('.v03-window-body')!.clientWidth,
    scroll: dialog.querySelector('.v03-window-body')!.scrollWidth,
  }));
  expect(geometry.x).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.body + 1);
}

for (const locale of ['zh', 'en'] as const) {
  for (const width of [320, 390, 1366]) {
    test(`98-person directory and reference-only profiles ${locale}-${width}`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: width < 500 ? 844 : 960 });
      const state = createV03Game('cao', 19, 'guandu-200');
      await load(page, state, locale);
      const before = await raw(page);
      const requested = new Set<string>();
      page.on('request', (request) => {
        if (request.url().includes('/portraits/')) requested.add(request.url());
      });
      await directory(page, locale);
      await expect(page.locator('.v03-officer-directory')).toHaveAttribute('data-total', '98');
      await expect(page.locator('.v03-directory-card')).toHaveCount(12);
      expect([...requested].every((url) => url.endsWith('-small.webp'))).toBe(true);
      expect(requested.size).toBeLessThanOrEqual(12);
      await fits(page);
      await page
        .getByRole('button', { name: locale === 'zh' ? '下一页' : 'Next', exact: true })
        .click();
      await expect(page.locator('.v03-directory-pagination')).toContainText('2 / 9');
      await page.locator('.v03-directory-card').last().click();
      await expect
        .poll(() =>
          page
            .locator('.v03-officer-directory .v03-window-body')
            .evaluate((node) => node.scrollTop),
        )
        .toBe(0);
      await page.keyboard.press('Escape');
      await search(page, locale, '诸葛');
      await expect(page.locator('.v03-directory-card')).toHaveCount(3);
      await page
        .getByRole('button', { name: locale === 'zh' ? '诸葛恪' : 'Zhuge Ke', exact: true })
        .click();
      await expect(page.locator('.v03-officer-profile')).toHaveAttribute('data-status', 'pending');
      await expect(page.locator('.v03-profile-hero img')).toHaveAttribute(
        'src',
        /v03\/portraits\/zhugeke.webp$/,
      );
      await expect(page.locator('.v03-profile-visit')).toHaveCount(0);
      await expect(page.locator('.v03-officer-profile')).toContainText(
        locale === 'zh' ? '成年基准' : 'Adult baseline',
      );
      await fits(page);
      const hero = await page.locator('.v03-profile-hero').evaluate((node) => ({
        portrait: node.querySelector('.v03-officer-portrait')!.getBoundingClientRect().toJSON(),
        text: node.querySelector('div')!.getBoundingClientRect().toJSON(),
      }));
      if (width < 500) expect(hero.text.y - hero.portrait.bottom).toBeGreaterThanOrEqual(16);
      else expect(hero.text.x - hero.portrait.right).toBeGreaterThanOrEqual(16);
      await page.screenshot({ path: testInfo.outputPath('future-profile.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-directory-card')).toHaveCount(3);
      await search(page, locale, '李儒');
      await page
        .getByRole('button', { name: locale === 'zh' ? '李儒' : 'Li Ru', exact: true })
        .click();
      await expect(page.locator('.v03-officer-profile')).toHaveAttribute('data-status', 'deceased');
      await expect(page.locator('.v03-profile-visit')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await search(page, locale, '费祎');
      await page
        .getByRole('button', { name: locale === 'zh' ? '费祎' : 'Fei Yi', exact: true })
        .click();
      await expect(page.locator('.v03-officer-profile')).toContainText('费祎');
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.fonts.check('16px "Noto Serif SC"', '祎叡恪')),
      ).toBe(true);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-officer-directory')).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: locale === 'zh' ? '人物名册' : 'Officer directory',
          exact: true,
        }),
      ).toBeFocused();
      expect(await raw(page)).toBe(before);
      expect(errors).toEqual([]);
    });
  }

  test(`compound surnames survive blocked portraits and narrow zoom ${locale}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 900, height: 960 });
    await page.route('**/*', (route) =>
      route.request().url().includes('/portraits/') ? route.abort() : route.continue(),
    );
    await load(page, createV03Game('cao', 19, 'guandu-200'), locale);
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await directory(page, locale);
    await search(page, locale, '司马');
    await page
      .getByRole('button', { name: locale === 'zh' ? '司马懿' : 'Sima Yi', exact: true })
      .click();
    await expect(page.locator('.v03-profile-hero img')).toHaveCount(0);
    await expect(page.locator('.v03-profile-hero .v03-portrait-fallback')).toHaveText(
      locale === 'zh' ? '司马' : 'Sima',
    );
    await fits(page);
    await page.screenshot({
      path: testInfo.outputPath('missing-portrait-zoom.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await search(page, locale, '公孙');
    await page
      .getByRole('button', { name: locale === 'zh' ? '公孙瓒' : 'Gongsun Zan', exact: true })
      .click();
    await expect(page.locator('.v03-profile-hero img')).toHaveCount(0);
    await expect(page.locator('.v03-profile-hero .v03-portrait-fallback')).toHaveText(
      locale === 'zh' ? '公孙' : 'Gongsun',
    );
    await expect(
      page.getByRole('button', {
        name: locale === 'zh' ? '返回名册' : 'Back to directory',
        exact: true,
      }),
    ).toBeVisible();
  });

  test(`captivity and city permissions remain accurate ${locale}`, async ({ page }) => {
    const state = createV03Game('cao', 19, 'guandu-200');
    const captive = state.officers.find((entry) => entry.id === 'xuyou')!;
    Object.assign(captive, {
      location: { kind: 'captured', cityId: 'chenliu' },
      troops: 0,
      wounded: 0,
    });
    state.personnelDay = createPersonnelDay(state);
    await load(page, state, locale);
    const before = await raw(page);
    await directory(page, locale);
    await page
      .getByLabel(locale === 'zh' ? '人物状态' : 'Officer status', { exact: true })
      .selectOption('captured');
    await expect(page.locator('.v03-directory-card')).toHaveCount(1);
    await page
      .getByRole('button', { name: locale === 'zh' ? '许攸' : 'Xu You', exact: true })
      .click();
    await expect(page.locator('.v03-officer-profile')).toHaveAttribute('data-status', 'captured');
    await expect(page.locator('.v03-officer-profile')).toContainText(
      locale === 'zh' ? '俘虏持有方' : 'Captor',
    );
    expect(await raw(page)).toBe(before);
    await page
      .getByRole('button', {
        name: locale === 'zh' ? '查看所在城池' : 'View current city',
        exact: true,
      })
      .click();
    await expect(page.locator('.v03-officer-directory')).toHaveCount(0);
    await expect(page.locator('.v03-city-overview')).toBeVisible();
    await openCity(page, locale === 'zh' ? '濮阳' : 'Puyang');
    await showOfficers(page);
    await page.locator('.v03-roster-list').getByRole('button').first().click();
    await expect(page.locator('.officer-work-menu')).toHaveCount(0);
  });
}

test('serving and local free officers are grouped and a free profile exposes no army commands', async ({
  page,
}) => {
  await load(page, createV03Game('cao', 19), 'zh');
  await openCity(page, '濮阳');
  await showOfficers(page);
  await expect(page.locator('.v03-city-roster-group').first()).toContainText('驻城在职');
  await expect(page.locator('.v03-city-roster-group').last()).toContainText('本城在野');
  await page.getByRole('button', { name: '陈宫', exact: true }).click();
  await expect(page.locator('.v03-officer-profile')).toHaveAttribute('data-status', 'free');
  await expect(page.locator('.officer-work-menu')).toHaveCount(0);
});

function newCommanderBattle() {
  let state = createV03Game('cao', 19);
  const defended = state.cities.find((city) => city.id === 'xiapi')!;
  defended.garrisonTroops = 500;
  defended.population -= 500;
  for (let i = 0; i < 2; i++) {
    const recruited = applyV03CityAction(state, {
      cityId: state.playerCapitalCityId,
      action: 'recruit',
      troopType: 'cavalry',
    });
    if (!recruited.ok) throw new Error(recruited.error);
    state = recruited.state;
  }
  const assigned = applyV03CityAction(state, {
    cityId: state.playerCapitalCityId,
    action: 'assign-troops',
    officerId: 'caohong',
    amount: 700,
  });
  if (!assigned.ok) throw new Error(assigned.error);
  state = assigned.state;
  const marched = executeV03Command(state, {
    type: 'marchArmy',
    sourceCityId: state.playerCapitalCityId,
    targetCityId: 'xiapi',
    officerIds: ['caohong'],
    intent: 'conquer',
  });
  if (!marched.ok) throw new Error(marched.error);
  state = marched.state;
  const journey = state.journeys.find((entry) => entry.kind === 'campaign')!;
  journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
    ...segment,
    lengthKm: 1,
    fixedDelayDays: 0,
  }));
  journey.segmentProgressKm = journey.routeSnapshot.map(() => 0);
  journey.segmentWaitDays = journey.routeSnapshot.map(() => 0);
  journey.expectedArrivalDay = state.absoluteDay + 1;
  for (let day = 0; day < 20; day++) {
    if (state.battles.some((battle) => battle.active)) return state;
    for (const event of state.events.filter((entry) => !entry.acknowledged))
      state = executeV03Command(state, { type: 'acknowledgeEvent', eventId: event.id }).state;
    const result = executeV03Command(state, { type: 'advance', days: 1 });
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  throw new Error(
    'New commander fixture did not reach battle: ' +
      JSON.stringify({
        day: state.absoluteDay,
        events: state.events.map((event) => [event.code, event.title]),
        journeys: state.journeys.map((journey) => ({
          status: journey.status,
          elapsed: journey.elapsedDays,
          segments: journey.routeSnapshot.length,
          progress: journey.segmentProgressKm,
          food: journey.manifest.carriedFood,
        })),
      }),
  );
}
test('new commander portraits resolve on the battlefield and sidebar and fall back together', async ({
  page,
}, testInfo) => {
  await page.route('**/assets/v03/portraits/caohong-small.webp', (route) => route.abort());
  const state = newCommanderBattle();
  await load(page, state, 'zh');
  // The session may initially show the campaign map; open the actual active battle.
  if (!(await page.locator('.v03-battle-shell').count()))
    await page
      .getByRole('button', { name: /打开战斗|Open battle|之战|Battle at/ })
      .first()
      .click();
  await expect(page.locator('.v03-unit-list [data-portrait-id="caohong"] img')).toHaveCount(0);
  await expect(
    page.locator('.v03-unit-list [data-portrait-id="caohong"] .v03-portrait-fallback'),
  ).toHaveText('曹');
  await expect(page.locator('[data-leader-portrait="caohong"] text')).toContainText('曹');
  await expect(page.locator('[data-leader-portrait="caohong"] image')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('new-commander-fallback.png'),
    fullPage: true,
  });
});
