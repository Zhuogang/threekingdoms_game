import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import { encodeV03Save, V03_AUTOSAVE_KEY } from '../../src/v03/platform/storage';

for (const locale of ['en', 'zh'] as const) {
  test(`keeps and exports a rejected pre-personnel save before replacement (${locale})`, async ({
    page,
  }) => {
    const envelope = JSON.parse(encodeV03Save(createV03Game('cao', 19)));
    delete envelope.state.personnelSchema;
    delete envelope.state.personnelDay;
    delete envelope.state.troopSources;
    for (const officer of envelope.state.officers) {
      delete officer.wounded;
      delete officer.reorganizationDays;
    }
    const original = JSON.stringify(envelope, null, 2);
    await page.goto(`/?lang=${locale}`);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
      key: V03_AUTOSAVE_KEY,
      raw: original,
    });
    await page.reload();
    await expect(page.getByRole('status')).toContainText(
      locale === 'en' ? 'predates the wounded personnel schema' : '早于伤兵数据结构',
    );
    await page
      .getByRole('button', { name: locale === 'en' ? 'New campaign' : '新战役', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const downloadEvent = page.waitForEvent('download');
    await dialog
      .getByRole('button', {
        name: locale === 'en' ? 'Export original save' : '导出原始存档',
        exact: true,
      })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('hegemony-v0.3-original.save');
    expect(await readFile((await download.path())!, 'utf8')).toBe(original);
    await dialog
      .getByRole('button', { name: locale === 'en' ? 'Cancel' : '取消', exact: true })
      .click();
    expect(await page.evaluate((key) => localStorage.getItem(key), V03_AUTOSAVE_KEY)).toBe(
      original,
    );
    await page.reload();
    await expect(page.getByRole('status')).toContainText(locale === 'en' ? 'predates' : '早于');
  });
}
