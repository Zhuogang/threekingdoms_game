import { test, expect, type Page } from '@playwright/test';
import type { V03GameState } from '../../src/v03/types';
import { asSave, mixedBattleState } from './playability-fixtures';
import { submitBattleDay } from './ui-navigation';

const saveKey = 'hegemony-v0.3:autosave';
async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, saveKey);
}

for (const locale of ['zh', 'en'])
  for (const submittedSecond of [false, true]) {
    test(`finishing the first battle preserves the ${submittedSecond ? 'submitted' : 'unsubmitted'} second battle and date progression (${locale})`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const state = mixedBattleState(true);
      const first = state.battles[0]!;
      const second = state.battles[1]!;
      const attacker = first.battleData.units.find((unit) => unit.side === 'attacker')!;
      const defender = first.battleData.units.find((unit) => unit.side === 'defender')!;
      first.battleData.map.terrain.fill('plain');
      Object.assign(attacker, { x: 10, y: 10 });
      Object.assign(defender, { x: 11, y: 10, troops: 1 });
      await page.goto(`/?lang=${locale}`);
      await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
        key: saveKey,
        raw: asSave(state),
      });
      await page.reload();
      await expect(page.locator('.v03-battle-tab')).toHaveCount(2);
      if (submittedSecond) {
        await page.locator('.v03-battle-tab').nth(1).click();
        await submitBattleDay(page);
        expect((await saved(page)).absoluteDay).toBe(state.absoluteDay);
        await page.locator('.v03-battle-tab').first().click();
      }
      await page.locator(`.v03-battlefield-map [data-unit-id="${attacker.id}"]`).click();
      await page.locator(`.v03-battlefield-map [data-unit-id="${defender.id}"]`).click();
      await expect(page.locator('.v03-outcome-modal')).toBeVisible();
      expect(errors).toEqual([]);
      const after = await saved(page);
      expect(after.battles.find((battle) => battle.id === first.id)?.resolved).toBe(true);
      expect(after.battles.find((battle) => battle.id === second.id)?.active).toBe(true);
      await page.locator('.v03-outcome-modal').getByRole('button').last().click();
      const governance = page.getByRole('dialog', { name: /如何治理|How will you govern/ });
      await expect(governance).toBeVisible();
      await governance.getByRole('button', { name: /稍后处理|Decide later/ }).click();
      await expect(page.locator('.v03-battle-main')).toBeVisible();
      await expect(page.locator('.v03-battle-tab')).toHaveCount(1);
      if (submittedSecond) {
        if (locale === 'en') {
          await page
            .locator('.v03-battle-sidebar')
            .getByRole('button', { name: 'Campaign', exact: true })
            .click();
        } else {
          await page.reload();
          await expect(governance).toBeVisible();
          await governance.getByRole('button', { name: /稍后处理|Decide later/ }).click();
        }
        const resume = page
          .getByRole('button', { name: /推进一日|Advance 1 day/, exact: true })
          .first();
        await expect(resume).toBeEnabled();
        await resume.click();
      } else {
        await submitBattleDay(page);
      }
      await expect.poll(async () => (await saved(page)).absoluteDay).toBe(state.absoluteDay + 1);
      await page.reload();
      await expect(page.locator('.v03-battle-main')).toBeVisible();
      expect((await saved(page)).battles.find((battle) => battle.id === second.id)?.active).toBe(
        true,
      );
      expect(errors).toEqual([]);
    });
  }
