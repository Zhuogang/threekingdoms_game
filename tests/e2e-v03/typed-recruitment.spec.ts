import { expect, test } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { recruitmentQuote } from '../../src/v03/campaign/recruitment';
import { cityWorkUsedThisPeriod } from '../../src/v03/governance/city-actions';
import { asSave } from './playability-fixtures';
import {
  chooseWorkExecutor,
  confirmWork,
  showCityManagement,
  closeCityWindow,
} from './ui-navigation';
import type { V03GameState } from '../../src/v03/types';

for (const locale of ['zh', 'en'] as const) {
  test(`recruits explicitly typed reserves with visible prices and persistent experience ${locale}`, async ({
    page,
  }, testInfo) => {
    let state = createV03Game('cao', 1);
    const capital = state.cities.find((c) => c.id === state.playerCapitalCityId)!;
    capital.gold = 10000;
    Object.values(capital.reservePools).forEach((pool) => (pool.troopExperience = 1200));
    const caocao = state.officers.find((o) => o.id === 'caocao')!;
    // Recruiting occupies its officer for five days, so a second officer takes the
    // archers; Cao Cao is free again for the cavalry after the ten-day advance.
    const second = state.officers.find(
      (o) =>
        o.id !== 'caocao' &&
        o.factionId === 'cao' &&
        o.location.kind === 'city' &&
        o.location.cityId === capital.id,
    )!;
    const recruiters = { infantry: caocao, archer: second, cavalry: caocao };
    const key = 'hegemony-v0.3:autosave';
    await page.goto(`/?lang=${locale}`);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
      key,
      raw: asSave(state),
    });
    await page.reload();
    for (const type of ['infantry', 'archer', 'cavalry'] as const) {
      if (type === 'cavalry') {
        // Two recruitments exhaust the real ten-day budget. Reload preserves
        // that usage; the third recruitment must wait for its actual refresh.
        expect(state.cities.find((city) => city.id === capital.id)!.workPointsUsed).toBe(2);
        await closeCityWindow(page);
        await page.getByRole('button', { name: /Advance 10 days|推进十日/, exact: true }).click();
        await expect
          .poll(() =>
            page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.absoluteDay, key),
          )
          .toBe(10);
        state = await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)!).state as V03GameState,
          key,
        );
        expect(
          cityWorkUsedThisPeriod(
            state,
            state.cities.find((city) => city.id === capital.id)!,
          ),
        ).toBe(0);
      }
      const before = state.cities.find((c) => c.id === capital.id)!;
      const officer = recruiters[type];
      const quote = recruitmentQuote(before, officer.force, type);
      await showCityManagement(page);
      await page.getByRole('button', { name: /Recruit soldiers|征募士兵/, exact: true }).click();
      await chooseWorkExecutor(page, locale === 'zh' ? officer.chinese : officer.name);
      await page
        .getByLabel(locale === 'zh' ? '招募兵种' : 'Recruit troop type', { exact: true })
        .selectOption(type);
      await expect(page.locator('.v03-work-detail')).toContainText(quote.gold.toLocaleString());
      await expect(page.locator('.v03-work-detail')).toContainText(quote.troops.toLocaleString());
      if (type === 'cavalry')
        await page.screenshot({ path: testInfo.outputPath('recruit-cavalry.png') });
      await confirmWork(page);
      await expect(page.locator('.v03-city-section-affairs')).toBeVisible();
      state = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).state as V03GameState,
        key,
      );
      const after = state.cities.find((c) => c.id === capital.id)!;
      expect(after.gold).toBe(before.gold - quote.gold);
      expect(after.reservePools[type].troops).toBe(before.reservePools[type].troops + quote.troops);
      expect(after.reservePools[type].troopExperience).toBeCloseTo(
        (before.reservePools[type].troops * 1200) / after.reservePools[type].troops,
        9,
      );
      for (const other of ['infantry', 'archer', 'cavalry'] as const)
        if (other !== type) expect(after.reservePools[other]).toEqual(before.reservePools[other]);
      await page.reload();
    }
  });
}
