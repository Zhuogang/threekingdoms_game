import { expect, test, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { setReservePool } from '../../src/v03/campaign/troop-experience';
import type { V03GameState } from '../../src/v03/types';
import { asSave, reviewBattleState } from './playability-fixtures';
import { confirmWork, expectStableShell, showAssignment, showOfficer } from './ui-navigation';

async function load(page: Page, state: V03GameState, locale = 'zh') {
  await page.goto(`/?lang=${locale}`);
  await page.evaluate((raw) => localStorage.setItem('hegemony-v0.3:autosave', raw), asSave(state));
  await page.reload();
}

for (const locale of ['zh', 'en'] as const) {
  test(`previews dilution and persists the actual troop downgrade ${locale}`, async ({
    page,
  }, info) => {
    const state = createV03Game('cao', 1);
    const city = state.cities.find((c) => c.id === state.playerCapitalCityId)!;
    const officer = state.officers.find((o) => o.id === 'caocao')!;
    city.garrisonTroops += 800 - officer.troops;
    Object.assign(officer, { troops: 800, troopExperience: 1200 });
    setReservePool(city, 'cavalry', { troops: 400, troopExperience: 0 });
    await load(page, state, locale);
    await showAssignment(page, locale === 'zh' ? officer.chinese : officer.name);
    const preview = page.locator('.v03-reinforcement-preview');
    const input = page.locator('.v03-work-detail input[type="number"]');
    for (const [troops, level] of [
      [900, 11],
      [1000, 10],
      [1200, 9],
    ]) {
      await input.fill(String(troops));
      await expect(preview).toContainText(`Lv.13 → Lv.${level}`);
    }
    await expect(preview).toContainText(locale === 'zh' ? '精锐 → 普通' : 'Elite → Regular');
    await expect(preview.locator('img[src$="elite-cavalry-large-ink-02.webp"]')).toBeVisible();
    await expect(preview.locator('img[src$="/cavalry-large-ink-02.webp"]')).toBeVisible();
    await page.screenshot({ path: info.outputPath('reinforcement-preview.png') });
    await expectStableShell(page);
    await confirmWork(page);
    await expect(page.locator('.v03-officer-detail .v03-troop-progress')).toContainText('Lv.9');
    await page.reload();
    await showOfficer(page, locale === 'zh' ? officer.chinese : officer.name);
    await expect(page.locator('.v03-officer-detail .v03-troop-progress')).toContainText(
      '800 / 1,900',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expectStableShell(page);
    await page.screenshot({ path: info.outputPath('officer-mobile.png') });
  });

  test(`reports real battle promotion and preserves growth after reload ${locale}`, async ({
    page,
  }, info) => {
    const state = reviewBattleState();
    const battle = state.battles.find((b) => b.active)!;
    const unit = battle.battleData.units.find((u) => u.side === 'attacker')!;
    const enemy = battle.battleData.units.find((u) => u.side === 'defender')!;
    battle.battleData.map.terrain.fill('plain');
    Object.assign(unit, { x: 10, y: 10, troopExperience: 990, initialTroopExperience: 990 });
    Object.assign(enemy, {
      x: 11,
      y: 10,
      troops: 1,
      troopExperience: 1100,
      initialTroopExperience: 1100,
    });
    for (const id of battle.attackerFormationOfficerIds[unit.id]!)
      state.officers.find((o) => o.id === id)!.troopExperience = 990;
    await load(page, state, locale);
    const token = page.locator(`.v03-battlefield-map [data-unit-id="${unit.id}"]`);
    await token.click();
    await expect(page.locator('.v03-unit-detail .v03-troop-progress')).toContainText('Lv.10');
    await page.locator(`.v03-battlefield-map [data-unit-id="${enemy.id}"]`).click();
    const modal = page.locator('.v03-outcome-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Lv.10 → Lv.11');
    await expect(modal).toContainText(locale === 'zh' ? '晋升精锐' : 'Promoted to elite');
    await expect(modal).toContainText(
      locale === 'zh' ? '全灭，部队经验清零' : 'Annihilated; soldier XP reset',
    );
    const report = await modal.locator('.v03-troop-growth').allTextContents();
    await page.screenshot({ path: info.outputPath('growth-report.png') });
    await page.reload();
    await expect(modal).toBeVisible();
    expect(await modal.locator('.v03-troop-growth').allTextContents()).toEqual(report);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectStableShell(page);
    await page.screenshot({ path: info.outputPath('growth-mobile.png') });
  });
}

for (const [type, elite] of [
  ['infantry', 'heavy-infantry'],
  ['cavalry', 'elite-cavalry'],
  ['archer', 'strong-archer'],
] as const) {
  test(`${type} renders the elite threshold, size threshold and downgrade with portraits`, async ({
    page,
  }, info) => {
    const state = reviewBattleState();
    const battle = state.battles.find((b) => b.active)!;
    const unit = battle.battleData.units.find((u) => u.side === 'attacker')!;
    unit.troopType = type;
    battle.battleData.map.terrain.fill('plain');
    for (const [troops, xp, kind, size] of [
      [500, 1000, elite, 'large'],
      [499, 1000, elite, 'small'],
      [499, 999, type, 'small'],
    ] as const) {
      Object.assign(unit, {
        troops,
        initialTroops: troops,
        troopExperience: xp,
        initialTroopExperience: xp,
      });
      await load(page, state);
      const token = page.locator(`.v03-battlefield-map [data-unit-id="${unit.id}"]`);
      const path = `/assets/v03/units/${kind}-${size}-ink-02.webp`;
      await expect(token).toHaveAttribute('data-unit-art', path);
      await expect(token.locator(`image[href="${path}"]`)).toHaveAttribute('visibility', 'visible');
      await expect(token.locator('[data-leader-portrait] image')).toBeVisible();
      await token.click();
      await expect(page.locator(`.v03-unit-row.selected img[src="${path}"]`)).toBeVisible();
      const displayName =
        xp >= 1000
          ? { infantry: '重步兵', cavalry: '精锐骑兵', archer: '强弓兵' }[type]
          : { infantry: '步兵', cavalry: '骑兵', archer: '弓兵' }[type];
      await expect(
        page.locator('.v03-unit-row.selected > span:nth-child(2) > strong'),
      ).toContainText(displayName);
      await expect(page.locator('.v03-unit-detail .v03-troop-progress')).toContainText(
        `Lv.${xp >= 1000 ? 11 : 10}`,
      );
      if (xp === 1000 && troops === 500)
        await page.screenshot({ path: info.outputPath('elite-battlefield.png') });
    }
  });
}
