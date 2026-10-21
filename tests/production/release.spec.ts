import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createGame, dispatch } from '../../src/game/campaign';
import type { GameState } from '../../src/game/types';
import { decodeSave, encodeSave } from '../../src/platform/saves';

async function savedState(page: Page): Promise<GameState> {
  await expect(page.locator('.save-status')).toContainText(/All progress saved|全部进度已保存/);
  return page.evaluate(
    () =>
      new Promise<GameState>((resolve, reject) => {
        const request = indexedDB.open('baye-atlas', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction('saves');
          const record = tx.objectStore('saves').get('auto');
          tx.oncomplete = () => {
            database.close();
            resolve(JSON.parse(record.result.payload).state);
          };
          tx.onabort = tx.onerror = () => {
            database.close();
            reject(tx.error);
          };
        };
      }),
  );
}

test('built release works beneath a subdirectory in both languages with persistent saves', async ({
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
  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Hegemony of the Three Kingdoms');
  await page.getByRole('dialog').getByRole('button', { name: '中文', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '选择你的势力' })).toBeVisible();
  await page.getByRole('button', { name: '举旗起兵' }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-atlas-background', 'ink');
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-terrain-art', 'ink');
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-unit-art', 'ink');
  const original = await savedState(page);
  await page.locator('.masthead').getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: /^Develop farms/ }).click();
  await expect(page.locator('.inline-notice')).toContainText('on assignment');
  const developed = await savedState(page);
  expect(developed.revision).toBeGreaterThan(original.revision);
  await page.locator('.masthead').getByRole('button', { name: '中文', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('曹操');
  await page.screenshot({
    path: testInfo.outputPath('campaign-zh.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.reload();
  expect(await savedState(page)).toEqual(developed);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.getByRole('button', { name: '存档与读档', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('曹操');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出战役', exact: true }).click();
  const download = await downloaded;
  expect(decodeSave(await readFile((await download.path())!, 'utf8'))).toEqual(developed);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  expect(external).toEqual([]);
});

test('built release reloads and completes a partially played battle', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  await savedState(page);
  let fixture = createGame('cao', 16);
  fixture = dispatch(fixture, {
    type: 'march',
    sourceId: 'puyang',
    targetId: 'xiapi',
    officerIds: ['xiahouyuan'],
  }).state;
  fixture = dispatch(fixture, { type: 'endMonth' }).state;
  expect(fixture.phase).toBe('battle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'battle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeSave(fixture)),
  });
  await expect(page.getByRole('button', { name: 'End battle day' })).toBeVisible();
  await page.getByRole('button', { name: 'Rally', exact: true }).click();
  await page.getByRole('button', { name: 'rally Xiahou Yuan', exact: true }).click();
  const played = await savedState(page);
  expect(
    played.battle!.units.some((unit) => unit.side === played.battle!.playerSide && unit.acted),
  ).toBe(true);
  await page.reload();
  expect(await savedState(page)).toEqual(played);
  await page.screenshot({
    path: testInfo.outputPath('battle-en.png'),
    fullPage: true,
    animations: 'disabled',
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Auto-resolve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Advance month' })).toBeVisible();
  const expected = dispatch(played, { type: 'battleAuto' });
  expect(expected.ok).toBe(true);
  expect(await savedState(page)).toEqual(expected.state);
});

test('built bilingual Wiki works beneath a subdirectory without changing the campaign', async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') external.push(url.href);
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Raise your banner', exact: true }).click();
  const before = await savedState(page);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  const wiki = page.locator('dialog.wiki-dialog');
  await expect(wiki).toBeVisible();
  await wiki
    .getByRole('navigation')
    .getByRole('button', { name: 'Troop types', exact: true })
    .click();
  await expect(wiki.locator('tr[data-troop]')).toHaveCount(6);
  await expect
    .poll(() =>
      wiki
        .locator('.troop-figure img')
        .evaluateAll(
          (images) =>
            images.length === 5 &&
            images.every((img) => (img as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await wiki.getByRole('button', { name: '中文', exact: true }).click();
  await wiki.getByRole('searchbox').fill('精良兵器');
  await wiki
    .getByRole('navigation')
    .getByRole('button', { name: '装备与武器', exact: true })
    .click();
  await expect(wiki.getByRole('article')).toContainText('武力增加 5');
  await page.keyboard.press('Escape');
  expect(await savedState(page)).toEqual(before);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('WebGL unavailability falls back without losing campaign controls or saving', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
      return Reflect.apply(native, this, [kind, ...args]);
    } as typeof native;
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  // Pixi can fall back to WebGPU or Canvas when WebGL is unavailable.
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.map-error')).toHaveCount(0);
  const original = await savedState(page);
  await page.getByRole('button', { name: /^Develop farms/ }).click();
  await expect(page.locator('.inline-notice')).toContainText('on assignment');
  expect((await savedState(page)).revision).toBeGreaterThan(original.revision);
});
