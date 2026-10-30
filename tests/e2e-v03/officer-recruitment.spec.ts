import { expect, test, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { createPersonnelDay } from '../../src/v03/campaign/personnel';
import { createReservePools } from '../../src/v03/campaign/troop-experience';
import { encodeV03Save } from '../../src/v03/platform/storage';
import type { V03GameState } from '../../src/v03/types';
import { openCity, showCityManagement } from './ui-navigation';

const key = 'hegemony-v0.3:autosave';
async function load(page: Page, state: V03GameState, locale: string) {
  await page.goto('/?lang=' + locale);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: encodeV03Save(state),
  });
  await page.reload();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
}
async function stored(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}

for (const locale of ['zh', 'en'] as const) {
  test(
    'disables an empty local search and explains why without spending work-' + locale,
    async ({ page }, testInfo) => {
      const state = createV03Game('cao', 3);
      for (const officer of state.officers)
        if (
          officer.factionId === null &&
          officer.location.kind === 'city' &&
          officer.location.cityId === state.playerCapitalCityId
        )
          officer.location = { kind: 'city', cityId: 'xiangyang' };
      await page.setViewportSize({ width: locale === 'zh' ? 390 : 1440, height: 960 });
      await load(page, state, locale);
      await showCityManagement(page);
      const search = page.getByRole('button', {
        name: locale === 'zh' ? '搜索在野武将' : 'Search for officers',
        exact: true,
      });
      await expect(search).toBeDisabled();
      await expect(search).toHaveAttribute(
        'title',
        locale === 'zh'
          ? '本城暂无可搜索招募的在野人物。'
          : 'No local free officer is available to search for.',
      );
      const after = await stored(page);
      expect(after.rng).toBe(state.rng);
      expect(
        after.cities.find((city) => city.id === state.playerCapitalCityId)!.workPointsUsed,
      ).toBe(0);
      await page.screenshot({ path: testInfo.outputPath('empty-search.png'), fullPage: true });
    },
  );

  for (const kind of ['capital', 'local'] as const) {
    test(
      'organizes an NPC ' +
        kind +
        ' army through monthly play, preserving typed reserves and authority-' +
        locale,
      async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const state = createV03Game('cao', 3);
        const cityId = kind === 'capital' ? 'jianye' : 'shouchun';
        const city = state.cities.find((city) => city.id === cityId)!;
        const target = state.officers.find((officer) => officer.id === 'sunce')!;
        const oldCityId = target.location.kind === 'city' ? target.location.cityId : cityId;
        const oldHome = state.cities.find((place) => place.id === oldCityId)!;
        oldHome.garrisonTroops -= target.troops;
        Object.assign(target, {
          location: { kind: 'city', cityId },
          troops: 0,
          wounded: 0,
          troopExperience: 0,
          reorganizationDays: 0,
        });
        for (const person of state.officers)
          if (
            person.id !== target.id &&
            person.factionId === city.factionId &&
            person.location.kind === 'city' &&
            person.location.cityId === cityId &&
            person.troops === 0
          ) {
            person.troops = 100;
            city.garrisonTroops += 100;
          }
        Object.assign(city, {
          reserve: 500,
          reservePools: createReservePools(0, 0, 500),
          food: 100_000,
          gold: 5000,
          loyalty: 100,
        });
        state.absoluteDay = 29;
        state.personnelDay = createPersonnelDay(state);
        await load(page, state, locale);
        await page
          .getByRole('button', {
            name: locale === 'zh' ? '推进一日' : 'Advance 1 day',
            exact: true,
          })
          .click();
        await expect.poll(async () => (await stored(page)).absoluteDay).toBe(30);
        const after = await stored(page);
        const organized = after.officers.find((officer) => officer.id === target.id)!;
        expect(organized).toMatchObject({ troops: 500, factionId: 'sun', troopType: 'cavalry' });
        const place = after.cities.find((city) => city.id === cityId)!;
        expect(place.reservePools.cavalry.troops).toBe(0);
        expect(place.autoAssignmentsThisMonth).toBe(1);
        // Banked work (PF-RL-01): a period spends its own two points plus what it carried in.
        expect(place.workPointsUsed).toBeLessThanOrEqual(2 + (place.workPointsBanked ?? 0));
        await page.reload();
        const restored = await stored(page);
        expect(restored.cities.find((city) => city.id === cityId)!.autoAssignmentsThisMonth).toBe(
          1,
        );
        await openCity(
          page,
          locale === 'zh'
            ? kind === 'capital'
              ? '建业'
              : '寿春'
            : kind === 'capital'
              ? 'Jianye'
              : 'Shouchun',
        );
        await expect(page.getByRole('button', { name: /City affairs|城务/ })).toHaveCount(0);
        await expect(page.locator('.v03-work-menu')).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath('npc-first-army.png'), fullPage: true });
        expect(errors).toEqual([]);
      },
    );
  }
}
