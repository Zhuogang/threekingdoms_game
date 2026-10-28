import { expect, test } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { recruitmentQuote } from '../../src/v03/campaign/recruitment';
import { asSave } from './playability-fixtures';
import { chooseWorkExecutor, confirmWork, showCityManagement } from './ui-navigation';
import type { V03GameState } from '../../src/v03/types';

for (const locale of ['zh', 'en'] as const) {
  test(`recruits explicitly typed reserves with visible prices and persistent experience ${locale}`, async ({
    page,
  }, testInfo) => {
    let state = createV03Game('cao', 1);
    const capital = state.cities.find((c) => c.id === state.playerCapitalCityId)!;
    capital.gold = 10000;
    Object.values(capital.reservePools).forEach((pool) => (pool.troopExperience = 1200));
    const officer = state.officers.find((o) => o.id === 'caocao')!;
    const key = 'hegemony-v0.3:autosave';
    await page.goto(`/?lang=${locale}`);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
      key,
      raw: asSave(state),
    });
    await page.reload();
    for (const type of ['infantry', 'archer', 'cavalry'] as const) {
      const before = state.cities.find((c) => c.id === capital.id)!;
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
      await expect(page.locator('.v03-city-affairs')).toBeVisible();
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
