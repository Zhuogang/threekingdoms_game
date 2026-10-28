import {
  openCity,
  closeCityWindow,
  showCityManagement,
  showOfficers,
  confirmWork,
  showForces,
  selectTab,
} from './ui-navigation';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { PLAYTEST_FIXTURES } from '../../src/v03/dev/fixtures';
async function menu(page: Page) {
  await closeCityWindow(page);
  const details = page.locator('.v03-app-menu');
  if (await details.count())
    await details.evaluate((node) => {
      (node as HTMLDetailsElement).open = true;
    });
}
async function language(page: Page, locale: 'en' | 'zh') {
  if (await page.locator('.v03-campaign-window').count()) {
    if ((await page.locator('html').getAttribute('lang')) !== locale)
      await page.locator('.v03-window-language').click();
    return;
  }
  if ((await page.locator('html').getAttribute('lang')) !== locale) {
    await menu(page);
    await page.getByRole('button', { name: locale === 'zh' ? '中文' : 'EN', exact: true }).click();
    if (await page.locator('.v03-app-menu').count())
      await page.locator('.v03-app-menu').evaluate((node) => {
        (node as HTMLDetailsElement).open = false;
      });
  }
}
async function fixture(page: Page, name: string) {
  await page.goto('/?debug=1');
  if (await page.locator('.v03-shell').count()) {
    await menu(page);
    await page.getByRole('button', { name: /Campaign menu|战役菜单/, exact: true }).click();
  }
  await page.getByText('Playtest fixtures', { exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.v03-shell')).toBeVisible();
}

test('all named fixtures load through the development Campaign menu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const name of PLAYTEST_FIXTURES) {
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await fixture(page, name);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean((window as unknown as Record<string, unknown>).__V03_PLAYTEST__),
        ),
      )
      .toBe(true);
  }
  expect(errors).toEqual([]);
});
test('rival combat permits real city work and diplomacy in EN/ZH', async ({ page }) => {
  for (const locale of ['en', 'zh'] as const) {
    await fixture(page, 'rival-battle');
    await language(page, locale);
    await showCityManagement(page);
    const farm = page.getByRole('button', {
      name: locale === 'zh' ? '发展农田 · 80 金' : 'Improve farmland · 80 gold',
      exact: true,
    });
    await expect(farm).toBeEnabled();
    await farm.click();
    await confirmWork(page);
    await closeCityWindow(page);
    await page
      .getByRole('button', { name: locale === 'zh' ? '外交' : 'Diplomacy', exact: true })
      .click();
    await expect(page.locator('.v03-diplomacy')).toBeVisible();
  }
});
test('capital army dispatch uses selected officers directly and keeps its order', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await showForces(page);
  await page.locator('.v03-army-officer input').first().check();
  await page.getByLabel('Destination (house, then ETA)').selectOption('luoyang');
  await page.getByRole('button', { name: 'Confirm march', exact: true }).click();
  await selectTab(page, 'Orders');
  await expect(page.locator('.v03-order-card')).toContainText('Marching');
});
for (const width of [390, 1366, 1920])
  for (const locale of ['en', 'zh'] as const)
    test(`baseline screens ${width} ${locale}`, async ({ page }) => {
      await mkdir('.artifacts/city-flow-regression', { recursive: true });
      await page.setViewportSize({
        width,
        height: width === 390 ? 844 : width === 1366 ? 768 : 1080,
      });
      await page.goto('/?debug=1');
      await language(page, locale);
      await page.screenshot({
        path: `.artifacts/city-flow-regression/start-${width}-${locale}.png`,
      });
      await page
        .getByRole('button', { name: locale === 'zh' ? '新战役' : 'New campaign', exact: true })
        .click();
      const overflow = () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth > innerWidth ||
            document.documentElement.scrollHeight > innerHeight,
        );
      expect(await overflow()).toBe(false);
      for (const [tab, name] of [
        ['City', locale === 'zh' ? '城市' : 'City'],
        ['Forces', locale === 'zh' ? '军队' : 'Forces'],
        ['Orders', locale === 'zh' ? '订单' : 'Orders'],
        ['Diplomacy', locale === 'zh' ? '外交' : 'Diplomacy'],
      ] as const) {
        await closeCityWindow(page);
        if (tab === 'City') await openCity(page);
        else if (tab === 'Forces') await showForces(page);
        else if (tab === 'Orders') await selectTab(page, 'Orders');
        else await page.getByRole('button', { name, exact: true }).click();
        await page.screenshot({
          path: `.artifacts/city-flow-regression/${tab.toLowerCase()}-${width}-${locale}.png`,
        });
        expect(await overflow()).toBe(false);
      }
      await fixture(page, 'battle');
      await language(page, locale);
      await page.screenshot({
        path: `.artifacts/city-flow-regression/battle-${width}-${locale}.png`,
      });
      expect(await overflow()).toBe(false);
      await page.locator('.v03-battle-action-bar summary').click();
      await page
        .getByRole('button', {
          name: locale === 'zh' ? '整军撤退' : 'Withdraw from battle',
          exact: true,
        })
        .click();
      await page.getByRole('dialog').getByRole('button').last().click();
      await expect(page.locator('.v03-outcome-modal')).toBeVisible();
      await page.screenshot({
        path: `.artifacts/city-flow-regression/aftermath-${width}-${locale}.png`,
      });
      await page
        .getByRole('button', {
          name: locale === 'zh' ? '返回战役' : 'Return to campaign',
          exact: true,
        })
        .click();
      const text = await page.locator('.v03-shell').innerText();
      expect(text).not.toMatch(/divided-realm|battle-\d+|\bXIAPI\b|\bH ANZHONG\b/);
      await menu(page);
      await page
        .getByRole('button', { name: locale === 'zh' ? '战役菜单' : 'Campaign menu', exact: true })
        .click();
      await page.getByText('Playtest fixtures', { exact: true }).click();
      await page.getByRole('button', { name: 'many-reports', exact: true }).click();
      await page.getByRole('button', { name: /Inbox|收件箱/ }).click();
      await expect(page.locator('.v03-events .v03-event')).toHaveCount(24);
    });

for (const locale of ['en', 'zh'] as const)
  test(`prisoner decisions through the city panel ${locale}`, async ({ page }) => {
    for (const action of ['release', 'recruit', 'exchange', 'execute'] as const) {
      await fixture(page, 'ruler-captured');
      await language(page, locale);
      await page
        .getByRole('button', { name: locale === 'zh' ? '陈留' : 'Chenliu', exact: true })
        .click();
      await showOfficers(page);
      await page.getByRole('button', { name: /Prisoners|俘虏/ }).click();
      await page.locator('.v03-roster-list').getByRole('button').first().click();
      const panel = page.locator('.v03-panel').filter({
        has: page.getByRole('heading', {
          name: locale === 'zh' ? '俘虏' : 'Prisoners',
          exact: true,
        }),
      });
      await expect(panel).toBeVisible();
      if (action === 'exchange') {
        const select = panel.getByRole('combobox');
        const option = await select.locator('option').nth(1).getAttribute('value');
        await select.selectOption(option!);
      }
      const labels = {
        release: { en: 'Release', zh: '释放' },
        recruit: { en: 'Recruit prisoner', zh: '招降' },
        exchange: { en: 'Exchange', zh: '交换' },
        execute: { en: 'Execute', zh: '处决' },
      };
      await panel.getByRole('button', { name: labels[action][locale], exact: true }).click();
      if (action === 'execute') {
        await page.keyboard.press('Escape');
        await expect(panel).toBeVisible();
        await panel.getByRole('button', { name: labels[action][locale], exact: true }).click();
        await page
          .getByRole('dialog', {
            name: locale === 'zh' ? '处决俘虏？' : 'Execute prisoner?',
            exact: true,
          })
          .getByRole('button')
          .last()
          .click();
      } else {
        const dialog = page.getByRole('dialog').last();
        await dialog
          .getByRole('button', { name: locale === 'zh' ? '取消' : 'Cancel', exact: true })
          .click();
        await expect(panel).toBeVisible();
        await panel.getByRole('button', { name: labels[action][locale], exact: true }).click();
        await page
          .getByRole('dialog')
          .last()
          .getByRole('button', { name: locale === 'zh' ? '确认' : 'Confirm', exact: true })
          .click();
      }
      await expect(page.locator('.v03-roster')).toBeVisible();
      await expect(page.locator('.v03-window-feedback')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              JSON.parse(localStorage.getItem('hegemony-v0.3:autosave')!)
                .state.events.filter(
                  (event: { code: string; params: { action: string } }) =>
                    event.code === 'prisoner.decision',
                )
                .at(-1)?.params.action,
          ),
        )
        .toBe(action);
      await page.reload();
      await expect(page.locator('.v03-shell')).toBeVisible();
    }
  });
