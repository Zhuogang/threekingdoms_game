import { expect, test } from '@playwright/test';
import { OFFICER_IDENTITIES } from '../../src/content/officerIdentity';
import { SCENARIOS } from '../../src/content/scenario';
import { createGame, dispatch } from '../../src/game/campaign';
import {
  dismissBattleSummary,
  expectPortraitsLoaded,
  importLegacy,
  importState,
  mapMetrics,
  savedCampaign,
  selectDisplay,
  startCampaign,
  switchLanguage,
} from '../e2e/improvement-helpers';

test('all named and garrison portrait renditions decode beneath the production subpath', async ({
  page,
}, testInfo) => {
  const expectedOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const errors: string[] = [],
    failed: string[] = [],
    external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failed.push(request.url()));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== expectedOrigin) external.push(url.href);
  });
  await page.goto('./');
  await expectPortraitsLoaded(page);
  await expect(page.locator('.faction-card .portrait')).toHaveCount(6);
  const identities = Object.values(OFFICER_IDENTITIES);
  const namedIds = [
    ...new Set(SCENARIOS.flatMap((scenario) => scenario.officers.map((officer) => officer.id))),
  ].sort();
  expect(Object.keys(OFFICER_IDENTITIES).sort()).toEqual(namedIds);
  expect(identities).toHaveLength(53);
  const keys = [...identities.map((identity) => identity.portraitKey), 'garrison'];
  const assets = await page.evaluate(async (portraitKeys) => {
    const result = [];
    for (const key of portraitKeys) {
      for (const suffix of ['-small', '']) {
        const url = new URL(`assets/portraits/${key}${suffix}.webp`, location.href).href;
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`Portrait failed: ${url}`));
          image.src = url;
        });
        result.push({
          key,
          small: !!suffix,
          width: image.naturalWidth,
          height: image.naturalHeight,
          url,
        });
      }
    }
    return result;
  }, keys);
  expect(assets).toHaveLength((namedIds.length + 1) * 2);
  expect(assets).toHaveLength(108);
  for (const asset of assets) {
    expect(asset.url).toContain('/hegemony/assets/portraits/');
    expect(asset.width).toBeGreaterThanOrEqual(asset.small ? 128 : 256);
    expect(asset.height).toBeGreaterThanOrEqual(asset.small ? 128 : 256);
  }
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  expect(external).toEqual([]);
});

test('built campaign retains display and aggression and continues a legacy queued battle report', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startCampaign(page, './');
  await selectDisplay(page, 'large');
  await importLegacy(page, 'multi-battle-planning');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rival aggression' }).selectOption('cautious');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Advance month' }).click();
  await expect(page.getByRole('button', { name: 'End battle day' })).toBeVisible();
  const pending = await savedCampaign(page);
  expect(pending.phase).toBe('battle');
  expect(pending.rivalAggression).toBe('cautious');
  await page.reload();
  expect(await savedCampaign(page)).toEqual(pending);
  await expectPortraitsLoaded(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Auto-resolve', exact: true }).click();
  await expect.poll(async () => (await savedCampaign(page)).resolution?.index).toBe(1);
  await dismissBattleSummary(page);
  const middle = await savedCampaign(page);
  await switchLanguage(page, 'zh');
  await page.reload();
  expect(await savedCampaign(page)).toEqual(middle);
  await page.getByRole('button', { name: '自动结算', exact: true }).click();
  await dismissBattleSummary(page);
  await expect(page.getByRole('button', { name: '推进月份' })).toBeVisible();
  const completed = await savedCampaign(page);
  expect(completed.reports.latest!.events.filter((event) => event.kind === 'battle')).toHaveLength(
    2,
  );
  await expect(page.getByRole('region', { name: '月度军报', exact: true })).toBeVisible();
  await page.reload();
  expect(await savedCampaign(page)).toEqual(completed);
  await switchLanguage(page, 'en');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Display size' })).toHaveValue('large');
  await expect(page.getByRole('combobox', { name: 'Rival aggression' })).toHaveValue('cautious');
  expect(errors).toEqual([]);
});

test('a missing named portrait falls back locally while identity and commands remain usable', async ({
  page,
}) => {
  await page.route('**/assets/portraits/caocao.webp', (route) => route.abort());
  await startCampaign(page, './');
  const portrait = page.locator('.officer-summary .portrait[data-officer-id="caocao"]');
  await expect(portrait).toBeVisible();
  await expect(portrait.locator('img')).toHaveAttribute(
    'src',
    /assets\/portraits\/garrison\.webp$/,
  );
  await expect
    .poll(() =>
      portrait
        .locator('img')
        .evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await expect(page.locator('.officer-summary')).toContainText('Cao Cao');
  await page.getByRole('button', { name: /^Develop farms/ }).click();
  expect((await savedCampaign(page)).revision).toBeGreaterThan(0);
});

test('Ma Chao keeps his portrait and identity across Guandu roster, battle, reload and fallback', async ({
  page,
}) => {
  await startCampaign(page, './');
  const guandu = createGame('ma', 4, 'balanced', { scenarioId: 'guandu-200', truceMonths: 0 });
  await importState(page, guandu);
  await page.getByRole('navigation').getByRole('button', { name: 'Officers', exact: true }).click();
  const roster = page.locator('.roster-row').filter({ hasText: 'Ma Chao' });
  await expect(roster.locator('img')).toHaveAttribute(
    'src',
    /assets\/portraits\/machao-small\.webp$/,
  );
  await roster.click();
  await expect(page.locator('.officer-summary')).toContainText('Ma Chao');
  await expect(page.locator('.officer-summary .portrait img')).toHaveAttribute(
    'src',
    /assets\/portraits\/machao\.webp$/,
  );
  await expectPortraitsLoaded(page);
  await switchLanguage(page, 'zh');
  await expect(page.locator('.officer-summary')).toContainText('马超');
  await switchLanguage(page, 'en');

  const march = dispatch(guandu, {
    type: 'march',
    sourceId: 'changan',
    targetId: 'luoyang',
    officerIds: ['machao'],
  });
  expect(march.ok).toBe(true);
  const begun = dispatch(march.state, { type: 'endMonth' });
  expect(begun.ok).toBe(true);
  expect(begun.state.phase).toBe('battle');
  await importState(page, begun.state);
  const commander = begun.state.battle!.units.find((unit) => unit.officerId === 'machao')!;
  await page.getByRole('button', { name: 'Fit battlefield', exact: true }).click();
  const metrics = await mapMetrics(page);
  const box = (await page.locator('.game-map').boundingBox())!;
  await page.mouse.click(
    box.x + metrics.left + (commander.x + 0.5) * metrics.tile,
    box.y + metrics.top + (commander.y + 0.5) * metrics.tile,
  );
  await expect(page.locator('.unit-card .portrait')).toHaveAttribute('data-officer-id', 'machao');
  await expect(page.locator('.unit-card .portrait img')).toHaveAttribute(
    'src',
    /assets\/portraits\/machao\.webp$/,
  );
  await expectPortraitsLoaded(page);
  expect(await savedCampaign(page)).toEqual(begun.state);

  await page.route('**/assets/portraits/machao.webp', (route) => route.abort());
  await page.reload();
  await expect(page.locator('.unit-card')).toContainText('Ma Chao');
  const fallback = page.locator('.unit-card .portrait[data-officer-id="machao"] img');
  await expect(fallback).toHaveAttribute('src', /assets\/portraits\/garrison\.webp$/);
  await expectPortraitsLoaded(page);
  expect(await savedCampaign(page)).toEqual(begun.state);
});
