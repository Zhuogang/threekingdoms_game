import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import type { GameState } from '../../src/game/types';
import { encodeSave } from '../../src/platform/saves';

export async function startCampaign(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByRole('button', { name: 'Raise your banner', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Raise your banner', exact: true }).click();
  await savedCampaign(page);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.game-map')).toHaveAttribute('data-mode', 'campaign');
}

export async function savedCampaign(page: Page): Promise<GameState> {
  await expect(page.locator('.save-status')).toContainText(/All progress saved|全部进度已保存/);
  return page.evaluate(
    () =>
      new Promise<GameState>((resolve, reject) => {
        const request = indexedDB.open('baye-atlas', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('saves');
          const record = transaction.objectStore('saves').get('auto');
          transaction.oncomplete = () => {
            database.close();
            if (!record.result) reject(new Error('Autosave was not committed'));
            else resolve(JSON.parse(record.result.payload).state);
          };
          transaction.onabort = transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

export async function importLegacy(page: Page, fixture: string) {
  const buffer = await readFile(new URL(`../fixtures/legacy-${fixture}.json`, import.meta.url));
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: `legacy-${fixture}.json`, mimeType: 'application/json', buffer });
  await expect(page.locator('.toast')).toContainText(/Campaign imported\.|战役已导入。/);
  const state = await savedCampaign(page);
  await expect(page.locator('.game-map')).toHaveAttribute(
    'data-mode',
    state.phase === 'battle' ? 'battle' : 'campaign',
  );
  return state;
}

export async function importState(page: Page, state: GameState) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeSave(state)),
  });
  await expect(page.locator('.toast')).toContainText(/Campaign imported\.|战役已导入。/);
  const saved = await savedCampaign(page);
  await expect(page.locator('.game-map')).toHaveAttribute(
    'data-mode',
    saved.phase === 'battle' ? 'battle' : 'campaign',
  );
  return saved;
}

export async function selectDisplay(page: Page, preset: 'compact' | 'comfortable' | 'large') {
  await page.getByRole('button', { name: /^(Settings|设置)$/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('combobox')
    .filter({ has: page.locator('option[value="comfortable"]') })
    .selectOption(preset);
  await page.getByRole('button', { name: /^(Close dialog|关闭对话框)$/ }).click();
}

export async function switchLanguage(page: Page, language: 'en' | 'zh') {
  await page
    .locator('.masthead')
    .getByRole('button', { name: language === 'en' ? 'English' : '中文', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', language === 'en' ? 'en' : 'zh-CN');
}

export async function expectPortraitsLoaded(page: Page) {
  const images = page.locator('.portrait img');
  await expect(images.first()).toBeVisible();
  await expect
    .poll(() =>
      images.evaluateAll((elements) =>
        elements
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > 0 &&
              rect.top < innerHeight &&
              rect.right > 0 &&
              rect.left < innerWidth
            );
          })
          .every(
            (element) =>
              element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
          ),
      ),
    )
    .toBe(true);
}

export async function mapMetrics(page: Page) {
  const map = page.locator('.game-map');
  return map.evaluate((element) => {
    const host = element as HTMLElement;
    const data = host.dataset.cameraScale
      ? host.dataset
      : (host.querySelector('.map-canvas') as HTMLElement).dataset;
    return {
      mode: host.dataset.mode,
      tile: Number(data.tileSize),
      left: Number(data.boardLeft),
      top: Number(data.boardTop),
      right: Number(data.boardRight),
      bottom: Number(data.boardBottom),
      countFont: Number(data.countFontSize),
      surnameFont: Number(data.surnameFontSize),
      crestFont: Number(data.crestFontSize),
      statusFont: Number(data.statusFontSize),
      cityFont: Number(data.cityFontSize),
      scale: Number(data.cameraScale),
      width: host.clientWidth,
      height: host.clientHeight,
    };
  });
}

/** A finished battle opens a recap; close it before issuing further orders. */
export async function dismissBattleSummary(page: Page) {
  const summary = page.getByTestId('battle-summary');
  await expect(summary).toBeVisible();
  await summary.getByRole('button', { name: /^(Continue|继续)$/ }).click();
  await expect(summary).toHaveCount(0);
}
