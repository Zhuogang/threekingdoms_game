import { expect, test } from '@playwright/test';
import { SCENARIOS } from '../../src/v03/content/scenario';
import { createV03Game } from '../../src/v03/initial-state';
import { decodeV03Save, validateV03State } from '../../src/v03/platform/storage';
import type { V03GameState } from '../../src/v03/types';

const KEY = 'hegemony-v0.3:autosave';
for (const scenario of SCENARIOS)
  for (const [index, faction] of scenario.factions.entries())
    test(`production roster starts, exports and resumes ${scenario.id}/${faction.id}`, async ({
      page,
    }, testInfo) => {
      const chinese = index % 2 === 0;
      const errors: string[] = [],
        failed: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('requestfailed', (request) => failed.push(request.url()));
      await page.goto(`./?lang=${chinese ? 'zh' : 'en'}`);
      await page.getByRole('combobox').selectOption(scenario.id);
      const opening = createV03Game(faction.id, 19, scenario.id);
      const rulerId = opening.factions.find((entry) => entry.id === faction.id)!.leaderOfficerId;
      const ruler = opening.officers.find((entry) => entry.id === rulerId)!;
      const card = page
        .locator('.v03-ruler-card')
        .filter({ has: page.getByText(chinese ? ruler.chinese : faction.name, { exact: true }) });
      if (faction.id === 'yan' && chinese) {
        await expect(card).toContainText('益州');
        await expect(card).not.toContainText('幽州');
      }
      await card.click();
      await page
        .getByRole('button', { name: chinese ? '新战役' : 'New campaign', exact: true })
        .click();
      await expect(page.locator('.v03-campaign-main')).toBeVisible();
      const read = () =>
        page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state as V03GameState, KEY);
      await expect.poll(async () => (await read()).playerFactionId).toBe(faction.id);
      const created = await read();
      expect(validateV03State(created)).toBe(true);
      expect(created.scenarioId).toBe(scenario.id);
      expect(created.officers.map((entry) => entry.id).sort()).toEqual(
        opening.officers.map((entry) => entry.id).sort(),
      );
      await page
        .getByRole('button', { name: chinese ? '推进一日' : 'Advance 1 day', exact: true })
        .click();
      await expect.poll(async () => (await read()).absoluteDay).toBe(1);
      await page.locator('.v03-app-menu > summary').click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: chinese ? '导出' : 'Export', exact: true }).click();
      const save = await download;
      const stream = await save.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      const payload = Buffer.concat(chunks).toString('utf8');
      expect(decodeV03Save(payload)).toEqual(await read());
      await page.reload();
      await expect(page.locator('.v03-campaign-main')).toBeVisible();
      expect(await read()).toEqual(decodeV03Save(payload));
      await page.screenshot({ path: testInfo.outputPath('roster-campaign.png') });
      expect(errors).toEqual([]);
      expect(failed).toEqual([]);
    });
