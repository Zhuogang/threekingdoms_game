import { expect, test, type WebSocketRoute, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { closeReport, dismissCounters, loadFixture, selectActor, snapshot } from './helpers';

async function battle(page: Page, locale: 'en' | 'zh' = 'en') {
  const state = createSiegeState(1);
  await loadFixture(
    page,
    {
      state,
      playerSide: 'shu',
      phase: 'battle',
      facings: {},
      presentation: {
        openingStep: 6,
        bannersSeen: [1, 2],
        reportReadDay: 1,
        dismissedHints: ['wall', 'trench', 'ladder', 'frontage', 'innerWall'],
        walkthrough: { status: 'skipped', step: 1, startDay: 1, logStart: 0 },
      },
    },
    locale,
  );
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
}

async function expectHealthyImages(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('img')].every((img) => img.complete),
  );
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .filter((img) => img.complete && !img.naturalWidth)
        .map((img) => img.src),
    ),
  ).toEqual([]);
}

test('decoded runtime art survives offline through day 8 without failed image requests', async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  await battle(page);
  await page.waitForFunction(
    () => {
      const [loaded, total, failed] = document
        .querySelector('.siege-app')!
        .getAttribute('data-art-preload')!
        .split('/')
        .map(Number);
      return total! > 0 && loaded === total && failed === 0;
    },
    undefined,
    { timeout: 120000 },
  );
  const preload = await page.locator('.siege-app').getAttribute('data-art-preload');
  // The dev-only script runner is a lazy JS import, outside the art cache.
  // Load its code while online so offline validation can still advance days.
  await page.evaluate(async () => {
    const path = '/src/siege/ui/devPlaythrough.ts';
    await import(path);
  });
  const failedImages: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'image') failedImages.push(request.url());
  });
  await context.setOffline(true);
  // Let the singleton finish in an actual game, then cover seven day transitions.
  for (let day = 1; day <= 8; day++) {
    if (day > 1) {
      await page.evaluate(() => window.__siegeDev!.playScript('careful', 1));
      await closeReport(page);
      await dismissCounters(page);
    }
    const state = (await snapshot(page)).state;
    expect(state.day).toBe(day);
    for (const actor of [
      ...state.units.filter((u) => u.side === 'shu' && u.troops > 0),
      ...state.engines,
    ]) {
      await selectActor(page, actor.id);
      await expectHealthyImages(page);
    }
    await page.getByTestId('report-open').click();
    await expect(page.getByTestId('morning-report')).toBeVisible();
    await expectHealthyImages(page);
    await closeReport(page);
    for (const name of ['Defence', 'Workshop', 'Battle log', 'Units & actions']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expectHealthyImages(page);
    }
    await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
    await page.waitForLoadState('networkidle');
    expect(failedImages, `failed image requests after preload ${preload}, day ${day}`).toEqual([]);
  }
  console.info(
    `Preload ${preload}; day 8 reached; ${failedImages.length} failed image requests; 0 broken img elements`,
  );
});

for (const locale of ['en', 'zh'] as const)
  test(`${locale}: dev-server-lost is absent normally and visible on Vite disconnect`, async ({
    page,
  }) => {
    let hotSocket: WebSocketRoute | undefined;
    await page.routeWebSocket('**/*', (socket) => {
      socket.connectToServer();
      hotSocket = socket;
    });
    await battle(page, locale);
    await expect(page.getByTestId('dev-server-lost')).toHaveCount(0);
    expect(hotSocket).toBeDefined();
    // Exercise Vite's real custom-event dispatch and this module's HMR subscription.
    // The inert ping URL prevents Vite's restart poll reloading this live server.
    hotSocket!.send(
      JSON.stringify({
        type: 'custom',
        event: 'vite:ws:disconnect',
        data: { webSocket: { url: 'ws://127.0.0.1:65534/' } },
      }),
    );
    const strip = page.getByTestId('dev-server-lost');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText(
      locale === 'zh' ? '开发服务器已断开' : 'Development server disconnected',
    );
    await expect(strip).toHaveCSS('pointer-events', 'none');
    // Camera controls are above the map; the strip lies within the map itself.
    const map = (await page.getByTestId('siege-map').boundingBox())!,
      box = (await strip.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(map.y);
    expect(box.x).toBeGreaterThanOrEqual(map.x);
    expect(box.x + box.width).toBeLessThanOrEqual(map.x + map.width);
    expect(box.height).toBeLessThan(50);
  });
