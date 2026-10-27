import { expect, test, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { createPersonnelDay } from '../../src/v03/campaign/personnel';
import { createReservePools } from '../../src/v03/campaign/troop-experience';
import { encodeV03Save } from '../../src/v03/platform/storage';
import type { V03GameState } from '../../src/v03/types';

const KEY = 'hegemony-v0.3:autosave';
async function load(page: Page, payload: string, locale: 'en' | 'zh') {
  await page.goto(`/?lang=${locale}`);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: KEY, raw: payload });
  await page.reload();
}
async function stored(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, KEY);
}

for (const locale of ['zh', 'en'] as const) {
  for (const scenario of ['divided-realm-190', 'guandu-200']) {
    test(`loads the complete R2 opening and continues play ${scenario}-${locale}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const state = createV03Game('cao', 19, scenario);
      await load(page, encodeV03Save(state), locale);
      await expect(page.locator('.v03-campaign-main')).toBeVisible();
      await page
        .getByRole('button', { name: locale === 'zh' ? '推进一日' : 'Advance 1 day', exact: true })
        .click();
      await expect.poll(async () => (await stored(page)).absoluteDay).toBe(1);
      const saved = await stored(page);
      expect(saved.officerRosterVersion).toBe(1);
      expect(saved.officers).toHaveLength(scenario === 'divided-realm-190' ? 69 : 81);
      expect(saved.officers.some((officer) => officer.id === 'jiangwei')).toBe(false);
      expect(errors).toEqual([]);
    });
  }

  test(`annual appearance survives reload and displays a localized notice-${locale}`, async ({
    page,
  }) => {
    const state = createV03Game('yan', 19);
    state.absoluteDay = 359;
    state.monthIndex = 11;
    for (const officer of state.officers)
      Object.assign(officer, { troops: 0, wounded: 0, reorganizationDays: 0, troopExperience: 0 });
    for (const city of state.cities)
      Object.assign(city, {
        garrisonTroops: 0,
        reserve: 0,
        reservePools: createReservePools(0),
        gold: 0,
        food: 100_000,
        loyalty: 100,
      });
    state.personnelDay = createPersonnelDay(state);
    await load(page, encodeV03Save(state), locale);
    await expect(page.locator('.v03-campaign-main')).toBeVisible();
    await page
      .getByRole('button', { name: locale === 'zh' ? '推进一日' : 'Advance 1 day', exact: true })
      .click();
    await expect.poll(async () => (await stored(page)).lastOfficerDebutYear).toBe(191);
    await page.getByRole('button', { name: /Inbox|收件箱/ }).click();
    await expect(page.locator('.v03-events')).toContainText(
      locale === 'zh' ? '人才登场' : 'New local officers',
    );
    await expect(page.locator('.v03-events')).toContainText(locale === 'zh' ? '张鲁' : 'Zhang Lu');
    await page.screenshot({ path: `test-results/officer-r2-year-${locale}.png`, fullPage: true });
    await page.reload();
    await page
      .getByRole('button', { name: locale === 'zh' ? '推进一日' : 'Advance 1 day', exact: true })
      .click();
    await expect.poll(async () => (await stored(page)).absoluteDay).toBe(361);
    const saved = await stored(page);
    expect(saved.officers.filter((officer) => officer.id === 'zhanglu')).toHaveLength(1);
    expect(saved.officers.find((officer) => officer.id === 'zhanglu')!.age).toBe(29);
    expect(saved.events.filter((event) => event.code === 'officer.debut')).toHaveLength(1);
  });

  test(`rejects an old roster save with a readable recovery message and preserves its data-${locale}`, async ({
    page,
  }) => {
    const envelope = JSON.parse(encodeV03Save(createV03Game('cao', 19)));
    delete envelope.state.officerRosterVersion;
    const payload = JSON.stringify(envelope);
    await load(page, payload, locale);
    await expect(
      page.getByText(locale === 'zh' ? /该存档使用旧人物名册/ : /older officer roster/),
    ).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(payload);
  });
}
