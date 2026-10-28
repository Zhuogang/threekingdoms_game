import { expect, test, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { encodeV03Save } from '../../src/v03/platform/storage';
import { applyV03BattleAction } from '../../src/v03/engine';
import { reviewBattleState } from './playability-fixtures';
import type { V03GameState } from '../../src/v03/types';

const key = 'hegemony-v0.3:autosave';
async function load(page: Page, state: V03GameState, locale: 'en' | 'zh') {
  await page.goto('/?lang=' + locale);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: encodeV03Save(state),
  });
  await page.reload();
  await expect(page.locator('.v03-campaign-main, .v03-battle-shell').first()).toBeVisible();
  if (await page.locator('.v03-battle-shell').count())
    await page.locator('.v03-rail').getByRole('button').first().click();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
}
async function profile(page: Page, name: string, locale: 'en' | 'zh') {
  await page
    .getByRole('button', { name: locale === 'zh' ? '人物名册' : 'Officer directory', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: locale === 'zh' ? '查找姓名或复姓' : 'Search names or surnames' })
    .fill(name);
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.v03-officer-profile')).toBeVisible();
}
for (const locale of ['zh', 'en'] as const) {
  test(`reviewed affiliation explanation fits at 320px without changing the campaign ${locale}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await load(page, createV03Game('cao', 19), locale);
    const before = await page.evaluate((key) => localStorage.getItem(key), key);
    await profile(page, locale === 'zh' ? '公孙瓒' : 'Gongsun Zan', locale);
    await expect(page.locator('.v03-officer-profile')).toContainText(
      locale === 'zh' ? '原势力未独立建模' : 'Original house is not modeled separately',
    );
    expect(
      await page
        .locator('.v03-window-body')
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(before);
    await page.screenshot({ path: testInfo.outputPath(`opening-${locale}-320.png`) });
  });
  test(`profile follows actual battle wounds across save reload ${locale}`, async ({
    page,
  }, testInfo) => {
    let state = reviewBattleState();
    const battle = state.battles.find((entry) => entry.active)!;
    const unit = battle.battleData.units.find((entry) => entry.side === 'attacker')!;
    const enemy = battle.battleData.units.find((entry) => entry.side === 'defender')!;
    battle.battleData.map.terrain.fill('plain');
    Object.assign(unit, { x: 10, y: 10 });
    Object.assign(enemy, { x: 11, y: 10 });
    const action = applyV03BattleAction(state, battle.id, {
      type: 'attack',
      unitId: unit.id,
      targetId: enemy.id,
    });
    expect(action.ok, action.error).toBe(true);
    state = action.state;
    const current = state.battles
      .find((entry) => entry.id === battle.id)!
      .battleData.units.find((entry) => entry.id === unit.id)!;
    expect(current.wounded).toBeGreaterThan(0);
    const id = battle.attackerFormationOfficerIds[unit.id]![0]!;
    const officer = state.officers.find((entry) => entry.id === id)!;
    for (let reload = 0; reload < 2; reload++) {
      await load(page, state, locale);
      const before = await page.evaluate((key) => localStorage.getItem(key), key);
      await profile(page, locale === 'zh' ? officer.chinese : officer.name, locale);
      const stats = page.locator('.v03-officer-profile .v03-stat-grid').last();
      const healthy = stats.locator('div').filter({
        has: page
          .getByRole('term')
          .filter({ hasText: locale === 'zh' ? /^健康兵$/ : /^Healthy soldiers$/ }),
      });
      const wounded = stats.locator('div').filter({
        has: page.getByRole('term').filter({ hasText: locale === 'zh' ? /^伤兵$/ : /^Wounded$/ }),
      });
      await expect(healthy.getByRole('definition')).toHaveText(current.troops.toLocaleString());
      await expect(wounded.getByRole('definition')).toHaveText(current.wounded.toLocaleString());
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(before);
      await page.screenshot({
        path: testInfo.outputPath(`battle-profile-${locale}-${reload}.png`),
      });
    }
  });
}
