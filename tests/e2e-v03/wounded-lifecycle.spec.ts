import { expect, test, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { createPersonnelDay } from '../../src/v03/campaign/personnel';
import { applyCombatDamage } from '../../src/v03/battle/experience';
import { encodeV03Save, V03_AUTOSAVE_KEY } from '../../src/v03/platform/storage';
import { en } from '../../src/v03/i18n/en';
import { zh } from '../../src/v03/i18n/zh';
import { reviewBattleState } from './playability-fixtures';
import { closeCityWindow, showOfficer, showOfficers, showWithdrawal } from './ui-navigation';
import type { V03GameState } from '../../src/v03/types';

async function load(page: Page, state: V03GameState, locale: string) {
  await page.goto(`/?lang=${locale}`);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: V03_AUTOSAVE_KEY,
    value: encodeV03Save(state),
  });
  await page.reload();
}
async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, V03_AUTOSAVE_KEY);
}

for (const locale of ['zh', 'en'] as const) {
  const t = locale === 'zh' ? zh : en;
  test(`recruits a captive elite army only after confirmation and keeps its reorganization lock (${locale})`, async ({
    page,
  }) => {
    const state = createV03Game('cao', 1);
    const prisoner = state.officers.find((entry) => entry.id === 'yanliang')!;
    const home = state.cities.find(
      (city) => prisoner.location.kind === 'city' && city.id === prisoner.location.cityId,
    )!;
    home.garrisonTroops -= prisoner.troops;
    Object.assign(prisoner, {
      troops: 1000,
      wounded: 2000,
      troopExperience: 1200,
      loyalty: 10,
      location: { kind: 'captured', cityId: state.playerCapitalCityId },
    });
    state.personnelDay = createPersonnelDay(state);
    await load(page, state, locale);
    await showOfficers(page);
    await page.getByRole('button', { name: /Prisoners|俘虏/ }).click();
    await page
      .locator('.v03-roster-list')
      .getByRole('button', { name: locale === 'zh' ? '颜良' : 'Yan Liang', exact: true })
      .click();
    const button = page.getByRole('button', {
      name: locale === 'zh' ? '招降' : 'Recruit prisoner',
      exact: true,
    });
    await button.click();
    await expect(page.getByRole('dialog').last()).toContainText('2000');
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: t.cancel, exact: true })
      .click();
    expect((await saved(page)).rng).toBe(1);
    await button.click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: locale === 'zh' ? '确认' : 'Confirm', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await saved(page)).officers.find((entry) => entry.id === prisoner.id)?.factionId,
      )
      .toBe('cao');
    const recruited = (await saved(page)).officers.find((entry) => entry.id === prisoner.id)!;
    expect(recruited).toMatchObject({
      troops: 1000,
      wounded: 2000,
      troopExperience: 1200,
      reorganizationDays: 10,
    });
    await page.reload();
    await showOfficer(page, locale === 'zh' ? '颜良' : 'Yan Liang');
    await expect(page.locator('.v03-officer-detail')).toContainText(
      locale === 'zh' ? '整编' : 'Reorganizing',
    );
    expect(
      (await saved(page)).officers.find((entry) => entry.id === prisoner.id)?.reorganizationDays,
    ).toBe(10);
  });

  test(`recovers elite wounded at 390px, cancels disbanding, then returns the contingent without losing rear XP (${locale})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = createV03Game('cao', 91);
    const officer = state.officers.find((entry) => entry.id === 'caocao')!;
    const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    city.garrisonTroops -= officer.troops;
    Object.assign(officer, { troops: 0, wounded: 3000, troopExperience: 1200 });
    state.personnelDay = createPersonnelDay(state);
    await load(page, state, locale);
    await showOfficer(page, locale === 'zh' ? '曹操' : 'Cao Cao');
    await expect(page.locator('.v03-officer-detail')).toContainText('3,000');
    await closeCityWindow(page);
    await page.getByRole('button', { name: t.advanceDay, exact: true }).click();
    await expect
      .poll(
        async () => (await saved(page)).officers.find((entry) => entry.id === 'caocao')?.wounded,
      )
      .toBe(2700);
    await showOfficer(page, locale === 'zh' ? '曹操' : 'Cao Cao');
    const panel = page.locator('.v03-personnel-panel');
    await panel.locator('summary').click();
    await panel.screenshot({ path: testInfo.outputPath(`wounded-city-390-${locale}.png`) });
    await panel
      .getByLabel(locale === 'zh' ? '遣散伤兵' : 'Wounded soldiers to disband', { exact: true })
      .fill('100');
    await panel
      .getByRole('button', {
        name: locale === 'zh' ? '遣散指定人员' : 'Disband selected personnel',
        exact: true,
      })
      .click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: t.cancel, exact: true })
      .click();
    expect((await saved(page)).officers.find((entry) => entry.id === 'caocao')?.wounded).toBe(2700);
    await panel
      .getByRole('button', {
        name: locale === 'zh' ? '遣散指定人员' : 'Disband selected personnel',
        exact: true,
      })
      .click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: locale === 'zh' ? '确认' : 'Confirm', exact: true })
      .click();
    await expect
      .poll(
        async () => (await saved(page)).officers.find((entry) => entry.id === 'caocao')?.wounded,
      )
      .toBe(2600);
    await panel
      .getByRole('button', {
        name: locale === 'zh' ? '归还全部所部' : 'Return the whole contingent',
        exact: true,
      })
      .click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: locale === 'zh' ? '确认' : 'Confirm', exact: true })
      .click();
    await expect
      .poll(
        async () => (await saved(page)).officers.find((entry) => entry.id === 'caocao')?.wounded,
      )
      .toBe(0);
    const result = await saved(page);
    expect(result.troopSources.find((entry) => entry.sourceOfficerId === 'caocao')).toMatchObject({
      wounded: 2600,
      troopExperience: 1200,
      autoReturn: false,
    });
    await page.reload();
    expect((await saved(page)).troopSources).toEqual(result.troopSources);
  });

  test(`previews whole-army risk without rolling, then retreats with wounded and keeps the report on reload (${locale})`, async ({
    page,
  }, testInfo) => {
    const state = reviewBattleState();
    const battle = state.battles.find((entry) => entry.active)!;
    const unit = battle.battleData.units.find(
      (entry) => entry.side === battle.battleData.playerSide,
    )!;
    const damage = Math.floor(unit.troops / 2);
    applyCombatDamage(unit, damage);
    unit.combatCasualtiesReceived += damage;
    const wounded = unit.wounded;
    battle.battleData.engaged = true;
    state.rng = 1;
    await load(page, state, locale);
    await showWithdrawal(page);
    await page.getByRole('button', { name: t.retreat, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t['ui.withdraw.from.battle.61'], exact: true });
    await expect(dialog).toContainText('5%');
    await expect(dialog).toContainText(
      locale === 'zh' ? '随军可战 / 伤兵' : 'Field healthy / wounded',
    );
    const cancelBox = await dialog
      .getByRole('button', { name: t.cancel, exact: true })
      .boundingBox();
    expect(cancelBox?.height).toBeLessThan(60);
    await dialog.screenshot({ path: testInfo.outputPath(`retreat-risk-${locale}.png`) });
    await dialog.getByRole('button', { name: t.cancel, exact: true }).click();
    expect((await saved(page)).rng).toBe(1);
    await showWithdrawal(page);
    await page.getByRole('button', { name: t.retreat, exact: true }).click();
    await page
      .getByRole('dialog', { name: t['ui.withdraw.from.battle.61'], exact: true })
      .getByRole('button', { name: t['ui.confirm.withdrawal.63'], exact: true })
      .click();
    await expect
      .poll(
        async () => (await saved(page)).battles.find((entry) => entry.id === battle.id)?.resolved,
      )
      .toBe(true);
    const result = await saved(page);
    expect(
      result.journeys.find((entry) => entry.id === `${battle.attackerJourneyId}:return`)?.manifest
        .composition.woundedTroops,
    ).toBe(wounded);
    await expect(page.locator('.v03-outcome-modal')).toContainText(
      locale === 'zh' ? '伤兵' : 'Wounded',
    );
    await page.reload();
    const restored = await saved(page);
    expect(restored.rng).toBe(result.rng);
    expect(restored.events.find((event) => event.battleOutcome)?.battleOutcome).toEqual(
      result.events.find((event) => event.battleOutcome)?.battleOutcome,
    );
  });
}
