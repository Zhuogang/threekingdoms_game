import { test, expect, type Page } from '@playwright/test';
import { createV03Game } from '../../src/v03/initial-state';
import type { V03GameState } from '../../src/v03/types';
import { asSave } from './playability-fixtures';
import { openCity, showAssignment, showOfficer } from './ui-navigation';

const key = 'hegemony-v0.3:autosave';
async function load(page: Page, state: V03GameState, locale: string) {
  await page.goto(`/?lang=${locale}`);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: asSave(state),
  });
  await page.reload();
  await expect(page.locator('.v03-shell')).toBeVisible();
}
async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}

for (const locale of ['zh', 'en']) {
  test(`troop assignment stays reachable but rejects an unchanged count (${locale})`, async ({
    page,
  }) => {
    const state = createV03Game('cao', 1);
    await load(page, state, locale);
    await showAssignment(page, locale === 'zh' ? '曹操' : 'Cao Cao');
    const confirm = page.getByRole('button', { name: /Confirm order|确认执行/, exact: true });
    await expect(confirm).toBeDisabled();
    await expect(page.locator('.v03-action-reason')).toContainText(
      locale === 'zh' ? '兵力没有变化' : 'different',
    );
    expect(await saved(page)).toEqual(state);
    await page.locator('.v03-work-detail input').fill('600');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect
      .poll(async () => (await saved(page)).officers.find((entry) => entry.id === 'caocao')?.troops)
      .toBe(600);
  });

  test(`autonomous officers can return troops after the work budget is spent (${locale})`, async ({
    page,
  }) => {
    const state = createV03Game('cao', 1);
    state.cities.find((entry) => entry.id === 'xuchang')!.workPointsUsed = 3;
    await load(page, state, locale);
    await openCity(page, locale === 'zh' ? '许昌' : 'Xuchang');
    await showOfficer(page, locale === 'zh' ? '曹仁' : 'Cao Ren');
    await page.locator('.v03-personnel-panel summary').click();
    await page
      .getByRole('button', { name: /归还全部所部|Return the whole contingent/, exact: true })
      .click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toContainText(locale === 'zh' ? '无需工作点' : 'No work point is needed');
    await dialog.getByRole('button', { name: /确认|Confirm/, exact: true }).click();
    await expect
      .poll(async () => (await saved(page)).officers.find((entry) => entry.id === 'caoren')?.troops)
      .toBe(0);
    expect((await saved(page)).cities.find((entry) => entry.id === 'xuchang')?.workPointsUsed).toBe(
      3,
    );
  });

  test(`failed alliance offers cannot be retried in the same month (${locale})`, async ({
    page,
  }) => {
    const state = createV03Game('cao', 121);
    await load(page, state, locale);
    await page.getByRole('button', { name: /外交|Diplomacy/, exact: true }).click();
    const target = state.factions.find((entry) => entry.id === 'liu')!;
    await page
      .locator('.v03-diplomacy-menu')
      .getByRole('button', { name: locale === 'zh' ? target.chinese : target.name, exact: true })
      .click();
    await page.locator('.v03-faction-detail .v03-step-choice').click();
    await page.locator('.v03-diplomacy-confirm').getByRole('button').click();
    await expect(page.locator('.v03-faction-detail .v03-step-choice')).toBeDisabled();
    const next = await saved(page);
    expect(next.alliances).toHaveLength(0);
    expect(next.lastAllianceProposalMonthByTarget?.liu).toBe(0);
    await page.reload();
    expect((await saved(page)).lastAllianceProposalMonthByTarget?.liu).toBe(0);
  });
}
