import { expect, type Page } from '@playwright/test';
export async function openMenu(page: Page) {
  const menu = page.locator('.v03-app-menu');
  if ((await menu.count()) && (await menu.getAttribute('open')) === null)
    await menu.locator('summary').click();
}
export async function closeMenu(page: Page) {
  const menu = page.locator('.v03-app-menu');
  if ((await menu.count()) && (await menu.getAttribute('open')) !== null)
    await menu.locator('summary').click();
}
export async function acknowledgeAll(page: Page) {
  if (!(await page.locator('.v03-events').count()))
    await page.getByRole('button', { name: /Inbox|收件箱/ }).click();
  for (
    let count = 0;
    count < 100 && (await page.locator('.v03-events .v03-event').count());
    count++
  )
    await page.locator('.v03-events .v03-event').first().getByRole('button').last().click();
  await page.locator('.v03-events > header').getByRole('button').click();
}
export async function submitBattleDay(page: Page) {
  await page
    .getByRole('button', { name: /^End battle day$|^结束战斗日$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: /^End battle day\?$|^结束战斗日？$/ });
  if (await dialog.count()) await dialog.getByRole('button').last().click();
}
export async function showForces(page: Page) {
  await page.getByRole('tab', { name: /^Forces$|^军队$/ }).click();
}
export async function showSupplies(page: Page) {
  await showForces(page);
  const disclosure = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: /^Request supplies$|^请求资源$/ }) });
  if ((await disclosure.count()) && (await disclosure.getAttribute('open')) === null)
    await disclosure.locator('summary').click();
}
export async function showWithdrawal(page: Page) {
  const details = page.locator('.v03-battle-action-bar details');
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
}
export async function selectTab(page: Page, tab: 'City' | 'Orders') {
  await page
    .getByRole('tab', { name: tab === 'City' ? /^City$|^城市$/ : /^Orders$|^订单$/ })
    .click();
}
export async function expectStableShell(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
}
