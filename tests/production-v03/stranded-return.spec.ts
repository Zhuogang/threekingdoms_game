import { expect, test, type Page } from '@playwright/test';
import { decodeV03Save, encodeV03Save } from '../../src/v03/platform/storage';
import { strandedReturnFixture } from '../v03/helpers/stranded-return-fixture';

const key = 'hegemony-v0.3:autosave';
async function saved(page: Page) {
  return decodeV03Save(await page.evaluate((key) => localStorage.getItem(key)!, key));
}

for (const locale of ['en', 'zh'] as const) {
  for (const player of ['cao', 'yuan']) {
    test(`${locale}: stranded return report and saved captivity (${player} player)`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const { state, officer } = strandedReturnFixture(player);
      const initial = encodeV03Save(state);
      const title = locale === 'en' ? 'Stranded return party surrendered' : '归途无援，队伍投降';
      const advance = locale === 'en' ? 'Advance 1 day' : '推进一日';
      const inbox = locale === 'en' ? /^Inbox/ : /^收件箱/;
      await page.goto(`./?lang=${locale}`);
      const restore = async () => {
        await page.evaluate(({ key, initial }) => localStorage.setItem(key, initial), {
          key,
          initial,
        });
        await page.reload();
        await expect(page.getByRole('button', { name: advance, exact: true })).toBeVisible();
      };
      await restore();
      await page.getByRole('button', { name: advance, exact: true }).click();
      await expect.poll(async () => (await saved(page)).absoluteDay).toBe(state.absoluteDay + 1);
      const settled = await saved(page);
      expect(settled.phase).toBe(player === 'cao' ? 'finished' : 'planning');
      expect(settled.officers.find((entry) => entry.id === officer.id)).toMatchObject({
        troops: officer.troops,
        wounded: officer.wounded,
        troopExperience: officer.troopExperience,
        location: { kind: 'captured', cityId: 'xuchang' },
      });
      await page.getByRole('button', { name: inbox }).click();
      const report = page.locator('.v03-event').filter({ hasText: title });
      await expect(report).toBeVisible();
      await expect(report).toContainText(
        locale === 'en'
          ? 'no cities, active campaigns or battles'
          : '已无城池、在途出征或未结束的战斗',
      );
      await expect(report).toContainText(
        locale === 'en' ? 'healthy and wounded troops' : '健卒、伤兵',
      );
      await page.reload();
      expect(await saved(page)).toEqual(settled);
      await page.getByRole('button', { name: inbox }).click();
      await expect(report).toBeVisible();
      await report
        .getByRole('button', { name: locale === 'en' ? 'Acknowledge' : '确认', exact: true })
        .click();
      await expect(report).toHaveCount(0);
      await page.reload();
      expect(
        (await saved(page)).events.find((event) => event.code === 'journey.strandedSurrender')
          ?.acknowledged,
      ).toBe(true);
      await restore();
      await page.getByRole('button', { name: advance, exact: true }).click();
      await expect.poll(async () => (await saved(page)).absoluteDay).toBe(settled.absoluteDay);
      expect(await saved(page)).toEqual(settled);
      expect(errors).toEqual([]);
    });
  }
}
