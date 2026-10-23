import { expect, type Page } from '@playwright/test';
export async function openMenu(page: Page) {
  await closeCityWindow(page);
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
export async function closeCityWindow(page: Page) {
  const dialog = page.locator('.v03-campaign-window');
  if (await dialog.count())
    await dialog.getByRole('button', { name: /Close city window|关闭窗口/, exact: true }).click();
}
export async function openCity(page: Page, name?: string) {
  await closeCityWindow(page);
  if (name) await page.getByRole('button', { name, exact: true }).click();
  else
    await page
      .locator('.v03-campaign-dock')
      .getByRole('button', { name: /Ruler.s capital|君主本城/, exact: true })
      .click();
}
export async function cityOverview(page: Page) {
  if (!(await page.locator('.v03-campaign-window').count())) await openCity(page);
  for (let depth = 0; depth < 6 && !(await page.locator('.v03-city-overview').count()); depth++) {
    await page.locator('.v03-window-footer').getByRole('button').first().click();
    if (!(await page.locator('.v03-campaign-window').count())) await openCity(page);
  }
}
export async function showCityManagement(page: Page) {
  await cityOverview(page);
  await page.getByRole('button', { name: /City affairs|城务/ }).click();
}
export async function showOfficers(page: Page) {
  await cityOverview(page);
  await page.getByRole('button', { name: /Officers in the city|驻城武将/ }).click();
}
export async function showOfficer(page: Page, name?: string) {
  await showOfficers(page);
  if (name)
    await page.locator('.v03-roster-list').getByRole('button', { name, exact: true }).click();
  else await page.locator('.v03-roster-list').getByRole('button').first().click();
}
export async function showAssignment(page: Page, name?: string) {
  await showOfficer(page, name);
  await page.getByRole('button', { name: /Set troop count|调整兵力/, exact: true }).click();
}
export async function chooseWorkExecutor(page: Page, name?: string) {
  const list = page.locator('.v03-work-assignment .v03-roster-list');
  if (await list.count()) {
    if (name) await list.getByRole('button', { name, exact: true }).click();
    else await list.getByRole('button').first().click();
  }
}
export async function confirmWork(page: Page) {
  await chooseWorkExecutor(page);
  await page.getByRole('button', { name: /Confirm order|确认执行/, exact: true }).click();
}
export async function showGovernor(page: Page) {
  await showCityManagement(page);
  await page.getByRole('button', { name: /Governor appointments|太守任免/ }).click();
}
export async function showForces(page: Page) {
  await cityOverview(page);
  await page.getByRole('button', { name: /March out|出征/ }).click();
}
export async function showSupplies(page: Page) {
  await cityOverview(page);
  await page.getByRole('button', { name: /Request supplies|征调资源/ }).click();
  await page
    .locator('.v03-supply-menu')
    .getByRole('button', { name: /Request supplies|征调资源/ })
    .click();
}
export async function showWithdrawal(page: Page) {
  const details = page.locator('.v03-battle-action-bar details');
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
}
export async function selectTab(page: Page, tab: 'City' | 'Orders') {
  if (tab === 'City') await showCityManagement(page);
  else {
    await closeCityWindow(page);
    await page.getByRole('button', { name: /Marches & orders|军情与命令/, exact: true }).click();
  }
}
export async function expectStableShell(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
}
