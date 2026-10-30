import { expect, test, type Page } from '@playwright/test';
import { asSave, mixedBattleState, reviewBattleState } from './playability-fixtures';

const SAVE_KEY = 'hegemony-v0.3:autosave';
async function loadBattle(page: Page, lang = 'en', multiple = false) {
  await page.goto(`/?lang=${lang}`);
  await page.evaluate(({ raw, key }) => localStorage.setItem(key, raw), {
    raw: asSave(multiple ? mixedBattleState(true) : reviewBattleState('bf01-north-plain')),
    key: SAVE_KEY,
  });
  await page.reload();
  await expect(page.locator('.v03-battle-board')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
}
async function panel(page: Page, name: string, checked: boolean) {
  const menu = page.locator('.v03-battle-display-menu');
  if (!(await menu.evaluate((node) => (node as HTMLDetailsElement).open)))
    await menu.locator('summary').click();
  await menu.getByRole('checkbox', { name, exact: true }).setChecked(checked);
  await menu.locator('summary').click();
}
async function boardSize(page: Page) {
  return page.locator('.v03-battle-board').evaluate((node) => {
    const { width, height } = node.getBoundingClientRect();
    return { width, height, area: width * height };
  });
}

test('Chinese battlefield fills a wide window and each panel can be toggled without changing the game', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loadBattle(page, 'zh');
  const before = await stored(page);
  expect((await boardSize(page)).width).toBeGreaterThan(1400);
  await expect(page.getByRole('button', { name: '聚焦双方营地' })).toHaveCount(0);
  await panel(page, '小地图', false);
  await expect(page.locator('.v03-battlefield-minimap')).toHaveCount(0);
  await panel(page, '操作提示', true);
  await expect(page.locator('.v03-battle-help')).toBeVisible();
  await page.screenshot({ path: info.outputPath('normal-zh.png') });
  const normal = await boardSize(page);
  await page.getByRole('button', { name: '放大战场', exact: true }).click();
  await expect.poll(async () => (await boardSize(page)).area).toBeGreaterThan(normal.area * 1.2);
  await expect(
    page.locator('.v03-side-panel, .v03-rail, .v03-topbar, .v03-battle-help'),
  ).toHaveCount(0);
  await expect(page.locator('.v03-battle-action-bar')).toBeVisible();
  await panel(page, '指令栏', true);
  await expect(page.locator('.v03-side-panel')).toBeVisible();
  await panel(page, '指令栏', false);
  await panel(page, '全局顶栏', true);
  await expect(page.locator('.v03-topbar')).toBeVisible();
  await panel(page, '全局顶栏', false);
  await panel(page, '战场列表', true);
  await expect(page.locator('.v03-rail')).toBeVisible();
  await panel(page, '战场列表', false);
  await panel(page, '小地图', true);
  await expect(page.locator('.v03-battlefield-minimap')).toBeVisible();
  await page.screenshot({ path: info.outputPath('expanded-zh.png') });
  await page.getByRole('button', { name: '退出放大', exact: true }).click();
  await expect(
    page.locator('.v03-battle-help, .v03-side-panel, .v03-rail, .v03-topbar'),
  ).toHaveCount(4);
  await expect(page.locator('.v03-battlefield-minimap')).toHaveCount(0);
  expect(await stored(page)).toBe(before);
});

test('native fullscreen includes withdrawal dialogs and restores the previous layout when exited', async ({
  page,
}) => {
  await loadBattle(page);
  const before = await stored(page);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('v03-shell')))
    .toBe(true);
  await page.locator('.v03-battle-action-bar summary').click();
  await page.getByRole('button', { name: 'Withdraw from battle', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Withdraw from battle?', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => Boolean(document.fullscreenElement?.contains(node)))).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.locator('.v03-side-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand battlefield', exact: true })).toBeVisible();
  // Browser-level exit (including native Escape) must restore panels through fullscreenchange.
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator('.v03-battle-expanded')).toHaveCount(0);
  await expect(page.locator('.v03-side-panel')).toBeVisible();
  expect(await stored(page)).toBe(before);
});

test('fullscreen denial keeps window expansion usable, keyboard focus and battle switching work', async ({
  page,
}) => {
  await loadBattle(page, 'en', true);
  const before = await stored(page);
  await page.evaluate(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error('Embedded fullscreen denied'));
  });
  const expand = page.getByRole('button', { name: 'Expand battlefield', exact: true });
  await expand.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.v03-battle-expanded')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore layout', exact: true })).toBeVisible();
  await panel(page, 'Battle list', true);
  await page.locator('.v03-battle-tab').nth(1).click();
  await expect(page.locator('.v03-battle-expanded')).toBeVisible();
  await expect(page.locator('.v03-side-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Restore layout', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.v03-battle-expanded')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand battlefield', exact: true }).click();
  await panel(page, 'Battle list', true);
  await page.locator('.v03-rail > button').first().click();
  await expect(page.locator('.v03-campaign-main')).toBeVisible();
  await expect(page.locator('.v03-battle-expanded')).toHaveCount(0);
  expect(await stored(page)).toBe(before);
});

test('Escape closes display and action menus before restoring an expanded layout', async ({
  page,
}) => {
  await loadBattle(page);
  const before = await stored(page);
  await page.getByRole('button', { name: 'Expand battlefield', exact: true }).click();
  const menu = page.locator('.v03-battle-display-menu');
  await menu.locator('summary').click();
  await menu.getByRole('checkbox', { name: 'Battle help', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open');
  await expect(menu.locator('summary')).toBeFocused();
  await expect(page.locator('.v03-battle-expanded')).toBeVisible();
  const actions = page.locator('.v03-battle-action-bar details');
  await actions.locator('summary').click();
  await page.keyboard.press('Escape');
  await expect(actions).not.toHaveAttribute('open');
  await expect(page.locator('.v03-battle-expanded')).toBeVisible();
  await panel(page, 'Top bar', true);
  const appMenu = page.locator('.v03-app-menu');
  await appMenu.locator('summary').click();
  await page.keyboard.press('Escape');
  await expect(appMenu).not.toHaveAttribute('open');
  await expect(page.locator('.v03-battle-expanded')).toBeVisible();
  expect(await stored(page)).toBe(before);
});

test('Escape cancels a tactic from sidebar focus and after hiding commands without leaving expansion', async ({
  page,
}) => {
  await loadBattle(page);
  const before = await stored(page);
  await page.getByRole('button', { name: 'Expand battlefield', exact: true }).click();
  await panel(page, 'Command panel', true);
  // Nothing is selected for the player; choose the formation whose tactic is cancelled.
  await page.locator('.v03-unit-row:not(.enemy)').first().click();
  const tactic = page.locator('.v03-tactic-list button:not(:disabled)').first();
  await tactic.click();
  await expect(page.locator('.v03-tactic-preview')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.v03-tactic-preview')).toHaveCount(0);
  await expect(page.locator('.v03-battle-expanded')).toBeVisible();
  await tactic.click();
  await panel(page, 'Command panel', false);
  await page.keyboard.press('Escape');
  await expect(page.locator('.v03-battle-expanded')).toBeVisible();
  await panel(page, 'Command panel', true);
  await expect(page.locator('.v03-tactic-preview')).toHaveCount(0);
  expect(await stored(page)).toBe(before);
});

for (const exit of ['restore', 'campaign', 'menu', 'toggle']) {
  test(`a delayed fullscreen grant cannot undo ${exit}`, async ({ page }) => {
    await loadBattle(page);
    await page.evaluate(() => {
      let current: Element | null = null;
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => current,
      });
      document.exitFullscreen = async () => {
        current = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
      Element.prototype.requestFullscreen = function () {
        return new Promise<void>((resolve) => {
          Object.assign(window, {
            grantDelayedFullscreen: () => {
              current = this;
              document.dispatchEvent(new Event('fullscreenchange'));
              resolve();
            },
          });
        });
      };
    });
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    if (exit === 'restore')
      await page.getByRole('button', { name: 'Restore layout', exact: true }).click();
    else if (exit === 'toggle')
      await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    else if (exit === 'menu') {
      await panel(page, 'Top bar', true);
      await page.locator('.v03-app-menu summary').click();
      await page.getByRole('button', { name: 'Campaign menu', exact: true }).click();
      await expect(page.locator('.v03-shell')).toHaveCount(0);
    } else {
      await panel(page, 'Battle list', true);
      await page.locator('.v03-rail > button').first().click();
      await expect(page.locator('.v03-campaign-main')).toBeVisible();
    }
    await page.evaluate(() =>
      (window as unknown as { grantDelayedFullscreen: () => void }).grantDelayedFullscreen(),
    );
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(page.locator('.v03-battle-expanded')).toHaveCount(0);
    if (exit === 'menu')
      await expect(page.getByRole('button', { name: 'New campaign', exact: true })).toBeVisible();
    else await expect(page.locator('.v03-topbar')).toBeVisible();
  });
}

test('native fullscreen and optional panels remain inside a window at 200% zoom', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadBattle(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  for (const visible of [false, true]) {
    await panel(page, 'Command panel', visible);
    await panel(page, 'Battle list', visible);
    const rect = await page.locator('.v03-shell').boundingBox();
    expect(rect!.width).toBeLessThanOrEqual(1441);
    expect(rect!.height).toBeLessThanOrEqual(901);
    const mini = (await page.locator('.v03-battlefield-minimap').boundingBox())!;
    expect(mini.width).toBeLessThanOrEqual((await boardSize(page)).width * 0.31);
    await expect(
      page.getByRole('button', { name: 'Exit fullscreen', exact: true }),
    ).toBeInViewport();
    const action = page
      .locator('.v03-battle-action-bar')
      .getByRole('button', { name: 'End battle day', exact: true });
    await expect(action).toBeInViewport();
  }
  await page.screenshot({ path: info.outputPath('fullscreen-200.png') });
});

for (const lang of ['en', 'zh']) {
  test(`expanded mobile battlefield keeps map and essential actions within the window (${lang})`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadBattle(page, lang);
    await page
      .getByRole('button', { name: lang === 'zh' ? '放大战场' : 'Expand battlefield', exact: true })
      .click();
    expect((await boardSize(page)).height).toBeGreaterThan(560);
    expect((await boardSize(page)).width).toBeGreaterThan(350);
    for (const control of [
      page.getByRole('button', {
        name: lang === 'zh' ? '结束战斗日' : 'End battle day',
        exact: true,
      }),
      page.getByRole('button', {
        name: lang === 'zh' ? '退出放大' : 'Restore layout',
        exact: true,
      }),
    ]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(391);
      expect(box.y + box.height).toBeLessThanOrEqual(845);
    }
    await page.screenshot({ path: info.outputPath(`expanded-mobile-${lang}.png`) });
    // No ready unit can strike on this walking day, so the day ends without a prompt and
    // the expanded layout stays in place. The withdrawal dialog below covers Escape.
    await page
      .getByRole('button', { name: lang === 'zh' ? '结束战斗日' : 'End battle day', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.v03-battle-expanded')).toBeVisible();
    await page.locator('.v03-battle-action-bar summary').click();
    await page
      .getByRole('button', {
        name: lang === 'zh' ? '整军撤退' : 'Withdraw from battle',
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.v03-battle-expanded')).toBeVisible();
    await panel(page, lang === 'zh' ? '指令栏' : 'Command panel', true);
    await expect(page.locator('.v03-side-panel')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
}
