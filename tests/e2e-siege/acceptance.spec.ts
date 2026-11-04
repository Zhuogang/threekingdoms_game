import { expect, test, type Page } from '@playwright/test';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { REPORT_PAGE_SIZE } from '../../src/siege/ui/report';
import { shot, snapshot } from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });

async function reportPages(page: Page) {
  const panel = page.getByTestId('morning-report');
  const texts: string[] = [];
  for (let more = true; more;) {
    const items = panel.getByTestId('report-item');
    expect(await items.count()).toBeLessThanOrEqual(REPORT_PAGE_SIZE);
    texts.push(...(await items.locator('strong').allTextContents()));
    // Behavioural layout assertion: every capped page fits with no scrolling.
    const bounds = await panel.evaluate((el) => ({
      scroll: el.scrollHeight,
      height: el.clientHeight,
      top: el.getBoundingClientRect().top,
      bottom: el.getBoundingClientRect().bottom,
    }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.height);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(720);
    more = (await panel.getByTestId('report-more').count()) > 0;
    if (more) await panel.getByTestId('report-more').click();
  }
  expect(new Set(texts).size).toBe(texts.length);
  await panel.getByTestId('report-close').click();
}

async function settleMorning(page: Page) {
  const panel = page.getByTestId('morning-report');
  const banner = page.locator('[data-testid^="banner-act"] button');
  if (await banner.count()) await banner.first().click();
  if (await panel.count()) await reportPages(page);
}

for (const side of ['shu', 'wei'] as const) {
  for (const locale of ['zh', 'en'] as const) {
    test(`${side}/${locale}: twelve-day UI continuation, every report page fits, S8-08 once, exact saves and score`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/?lang=${locale}&siegeSeed=228`);
      await page.getByTestId(`start-${side}`).click();
      await page
        .getByRole('button', { name: locale === 'zh' ? '跳过开场' : 'Skip opening', exact: true })
        .click();
      await page
        .getByRole('button', { name: locale === 'zh' ? '开始攻城' : 'Begin siege', exact: true })
        .click();
      // Wait for the initial Wei replay or the initial act banner, without launching Chromium here.
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="replay-skip"]') ||
          document.querySelector('[data-testid="banner-act1"]'),
      );
      await page
        .getByTestId('replay-skip')
        .evaluateAll((buttons) => (buttons[0] as HTMLButtonElement | undefined)?.click());
      await settleMorning(page);
      const skipWalk = page.getByRole('button', {
        name: locale === 'zh' ? '跳过引导' : 'Skip walkthrough',
        exact: true,
      });
      if (await skipWalk.count()) await skipWalk.click();
      let nights = 0;
      for (let day = 1; day <= T.days; day++) {
        if ((await snapshot(page)).state.outcome) break;
        await settleMorning(page);
        for (let count = 0; count < 30; count++) {
          const card = page.getByTestId('counter-card');
          const hints = page.locator('[data-testid^="hint-"] button');
          if (await card.count()) {
            if (await card.locator('img[src*="s8-08"]').count()) nights++;
            await page.getByTestId('counter-dismiss').click();
          } else if (await hints.count()) await hints.first().click();
          else break;
        }
        // Each day is saved after reading; loading must neither replay it nor lose notice history.
        await page
          .getByRole('button', { name: locale === 'zh' ? '保存' : 'Save', exact: true })
          .click();
        const before = await snapshot(page);
        await page.goto(`/?lang=${locale}#chencang/load`);
        expect(await snapshot(page)).toEqual(before);
        await expect(page.getByTestId('replay-skip')).toHaveCount(0);
        await page.evaluate(() => window.__siegeDev!.playScript('careful', 1));
        await page.waitForFunction((previous) => {
          const state = window.__siegeDev!.snapshot().state;
          return state.outcome || state.day > previous;
        }, before.state.day);
      }
      const game = await snapshot(page);
      expect(game.state.day).toBeLessThanOrEqual(T.days);
      expect(game.state.outcome).toBeTruthy();
      expect(nights).toBe(1);
      await expect(page.getByTestId('score-panel')).toContainText(
        String(Math.round(game.state.stats.score![side].score)),
      );
      expect(errors).toEqual([]);
      await shot(page, `o-${side}-${locale}-ending`);
    });
  }
}

test('both side buttons remain clickable above the host sticky bar at the page bottom', async ({
  page,
}) => {
  await page.goto('/?lang=zh');
  const card = page.getByTestId('chencang-campaign');
  await card.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  for (const side of ['shu', 'wei'] as const) {
    const button = page.getByTestId(`start-${side}`);
    await expect(button).toBeInViewport();
    // Trial click tests real hit targets and overlap, not screenshot pixels.
    await button.click({ trial: true });
  }
  await shot(page, 'wei-card');
});
