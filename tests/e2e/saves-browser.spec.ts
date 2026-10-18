import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createGame, dispatch } from '../../src/game/campaign';
import { getReachableTiles } from '../../src/game/battle';
import type { GameCommand, GameState } from '../../src/game/types';
import { decodeSave, encodeSave, type SaveRecord } from '../../src/platform/saves';

function apply(state: GameState, command: GameCommand): GameState {
  const result = dispatch(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  await expect(page.locator('.save-status')).toContainText('All progress saved');
}

async function readRecord(page: Page, id = 'auto'): Promise<SaveRecord | undefined> {
  return page.evaluate(async (slotId) => {
    return new Promise<SaveRecord | undefined>((resolve, reject) => {
      const request = indexedDB.open('baye-atlas', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction('saves', 'readonly');
        const read = tx.objectStore('saves').get(slotId);
        tx.oncomplete = () => {
          database.close();
          resolve(read.result as SaveRecord | undefined);
        };
        tx.onerror = tx.onabort = () => {
          database.close();
          reject(tx.error);
        };
      };
    });
  }, id);
}

async function savedState(page: Page): Promise<GameState> {
  await expect(page.locator('.save-status')).toContainText('All progress saved');
  const record = await readRecord(page);
  expect(record).toBeDefined();
  return decodeSave(record!.payload);
}

async function importCampaign(page: Page, state: GameState) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'campaign.json',
    mimeType: 'application/json',
    buffer: Buffer.from(encodeSave(state)),
  });
  await expect(page.getByText('Campaign imported.', { exact: true })).toBeVisible();
  expect(await savedState(page)).toEqual(state);
}

test('queued bursts save the newest campaign; immediate reads and manual slots are isolated', async ({
  page,
}) => {
  await start(page);
  const original = createGame('cao', 701);
  const developed = apply(original, {
    type: 'action',
    action: 'farm',
    cityId: 'chenliu',
    officerId: 'caocao',
  });
  const newest = createGame('liu', 702);
  const records = await page.evaluate(
    async ({ original, developed, newest }) => {
      const path = '/src/platform/saves.ts';
      const storage = await import(path);
      const requests = [
        storage.saveSlot('slot-1', 'Manual snapshot', original),
        storage.saveSlot('auto', 'First', original),
        storage.saveSlot('auto', 'Second', developed),
        storage.saveSlot('auto', 'Newest', newest),
      ];
      // Mutating a caller-owned object after enqueueing must not mutate a save.
      original.cities[0]!.gold = 1;
      const immediate = await storage.listSlots();
      await Promise.all(requests);
      return immediate as SaveRecord[];
    },
    { original, developed, newest },
  );
  expect(decodeSave(records.find((r) => r.id === 'auto')!.payload)).toEqual(newest);
  expect(decodeSave(records.find((r) => r.id === 'slot-1')!.payload)).toEqual(original);
  await page.reload();
  expect(await savedState(page)).toEqual(newest);
  expect(decodeSave((await readRecord(page, 'slot-1'))!.payload)).toEqual(original);
});

test('the saved indicator waits for the newest accepted command to commit', async ({ page }) => {
  await start(page);
  const before = await savedState(page);
  await page.evaluate(async () => {
    const path = '/src/platform/autosave.ts';
    const { autosave } = await import(path);
    const statuses: string[] = [];
    const unsubscribe = autosave.subscribe(() => statuses.push(autosave.getSnapshot().status));
    let hold = true;
    let first = true;
    const nativeTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const tx = nativeTransaction.apply(this, args);
      if (first && args[1] === 'readwrite') {
        first = false;
        // Keep a real IndexedDB transaction active until the test releases it.
        const keepOpen = () => {
          const request = tx.objectStore('saves').get('auto');
          request.onsuccess = () => {
            if (hold) keepOpen();
          };
        };
        keepOpen();
      }
      return tx;
    };
    Object.assign(window, {
      saveStatusHistory: statuses,
      releaseSave: () => {
        hold = false;
        IDBDatabase.prototype.transaction = nativeTransaction;
      },
      stopSaveStatusHistory: unsubscribe,
    });
  });
  await page.getByRole('button', { name: 'Select Cao Cao', exact: true }).click();
  await page.getByRole('button', { name: /^Develop farms/ }).click();
  await expect(page.locator('.save-status')).toContainText('Saving…');
  await page.getByRole('button', { name: 'Select Xiahou Dun', exact: true }).click();
  await page.getByRole('button', { name: /^Encourage trade/ }).click();
  await expect(page.locator('.save-status')).toContainText('Saving…');
  await page.evaluate(() => (window as unknown as { releaseSave: () => void }).releaseSave());
  let expected = apply(before, {
    type: 'action',
    action: 'farm',
    cityId: 'chenliu',
    officerId: 'caocao',
  });
  expected = apply(expected, {
    type: 'action',
    action: 'commerce',
    cityId: 'chenliu',
    officerId: 'xiahoudun',
  });
  expect(await savedState(page)).toEqual(expected);
  const history = await page.evaluate(() => {
    const hooks = window as unknown as {
      saveStatusHistory: string[];
      stopSaveStatusHistory: () => void;
    };
    hooks.stopSaveStatusHistory();
    return hooks.saveStatusHistory;
  });
  expect(history).toEqual(['saving', 'saving', 'saved']);
  await page.reload();
  expect(await savedState(page)).toEqual(expected);
});

test('opening saves during a write cannot restore an outdated autosave', async ({ page }) => {
  await start(page);
  const before = await savedState(page);
  // Populate the dialog's cached records before accepting a new command.
  await page.getByRole('button', { name: 'Save and load', exact: true }).click();
  await expect(page.locator('.save-slots')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'Load', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.evaluate(() => {
    const nativeTransaction = IDBDatabase.prototype.transaction;
    let hold = true;
    let first = true;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const tx = nativeTransaction.apply(this, args);
      if (first && args[1] === 'readwrite') {
        first = false;
        const keepOpen = () => {
          const request = tx.objectStore('saves').get('auto');
          request.onsuccess = () => {
            if (hold) keepOpen();
          };
        };
        keepOpen();
      }
      return tx;
    };
    Object.assign(window, {
      releasePendingSave: () => {
        hold = false;
        IDBDatabase.prototype.transaction = nativeTransaction;
      },
    });
  });
  await page.getByRole('button', { name: /^Develop farms/ }).click();
  await expect(page.locator('.save-status')).toContainText('Saving…');
  await page.getByRole('button', { name: 'Save and load', exact: true }).click();
  await expect(page.locator('.save-slots')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: 'Load', exact: true })).toHaveCount(0);
  for (const save of await page.getByRole('button', { name: 'Save', exact: true }).all()) {
    await expect(save).toBeDisabled();
  }
  await page.evaluate(() =>
    (window as unknown as { releasePendingSave: () => void }).releasePendingSave(),
  );
  await expect(page.locator('.save-slots')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  const expected = apply(before, {
    type: 'action',
    action: 'farm',
    cityId: 'chenliu',
    officerId: 'caocao',
  });
  expect(await savedState(page)).toEqual(expected);
  await page.reload();
  expect(await savedState(page)).toEqual(expected);
});

test('original version 1 slots restore a partly played battle and resume identically', async ({
  page,
}) => {
  await start(page);
  let battle = createGame('cao', 16);
  battle = apply(battle, {
    type: 'assignTroops',
    cityId: 'puyang',
    officerId: 'xiahouyuan',
    amount: 1800,
  });
  battle = apply(battle, {
    type: 'march',
    sourceId: 'puyang',
    targetId: 'xiapi',
    officerIds: ['xiahouyuan'],
  });
  battle = apply(battle, { type: 'endMonth' });
  const unit = battle.battle!.units.find((u) => u.side === battle.battle!.playerSide)!;
  const tile = getReachableTiles(battle.battle!, unit.id)[0]!;
  battle = apply(battle, { type: 'battleMove', unitId: unit.id, ...tile });
  battle = apply(battle, { type: 'battleWait', unitId: unit.id });
  const continued = apply(battle, { type: 'battleAuto' });
  // Write the exact four-field record shape from Baye 1.0, without summary.
  const oldRecord: SaveRecord = {
    id: 'slot-2',
    name: 'Cao Cao · January 190',
    savedAt: '2026-01-01T00:00:00.000Z',
    payload: encodeSave(battle),
  };
  await page.evaluate(async (record) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('baye-atlas', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(record);
        tx.oncomplete = () => {
          database.close();
          resolve();
        };
        tx.onerror = tx.onabort = () => {
          database.close();
          reject(tx.error);
        };
      };
    });
  }, oldRecord);
  await page.getByRole('button', { name: 'Save and load' }).click();
  await page
    .locator('.save-slot')
    .filter({ hasText: 'Campaign slot 2' })
    .getByRole('button', { name: 'Load', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'End battle day' })).toBeVisible();
  expect(await savedState(page)).toEqual(battle);
  await page.reload();
  await expect(page.getByRole('button', { name: 'End battle day' })).toBeVisible();
  expect(await savedState(page)).toEqual(battle);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Auto-resolve', exact: true }).click();
  expect(await savedState(page)).toEqual(continued);
  expect((await readRecord(page, 'slot-2'))!.payload).toBe(oldRecord.payload);
});

test('downloaded export contains the complete snapshot and imports after a different campaign', async ({
  page,
}) => {
  await start(page);
  let original = createGame('sun', 912);
  original = apply(original, { type: 'endMonth' });
  while (original.phase === 'battle') original = apply(original, { type: 'battleAuto' });
  await importCampaign(page, original);
  await page.getByRole('button', { name: 'Save and load' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export campaign' }).click();
  const download = await downloadEvent;
  const bytes = await readFile((await download.path())!);
  expect(decodeSave(bytes.toString('utf8'))).toEqual(original);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await importCampaign(page, createGame('yuan', 44));
  await page.locator('input[type=file]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: bytes,
  });
  expect(await savedState(page)).toEqual(original);
  await page.reload();
  expect(await savedState(page)).toEqual(original);
});

test('a failed browser write is visible, preserves the last save, and retry commits the latest progress', async ({
  page,
}) => {
  await start(page);
  const before = await savedState(page);
  await page.evaluate(() => {
    const nativeTransaction = IDBDatabase.prototype.transaction;
    Object.assign(window, {
      restoreSaveTransactions: () => {
        IDBDatabase.prototype.transaction = nativeTransaction;
      },
    });
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      if (args[1] === 'readwrite')
        throw new DOMException('Simulated full storage', 'QuotaExceededError');
      return nativeTransaction.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Select Cao Cao', exact: true }).click();
  await page.getByRole('button', { name: /^Develop farms/ }).click();
  await expect(page.locator('.save-status')).toContainText('Save unavailable');
  await expect(page.getByRole('alert')).toContainText('Save failed');
  expect(decodeSave((await readRecord(page))!.payload)).toEqual(before);
  // Pending/failed progress asks the browser to warn before leaving the page.
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  await page.evaluate(() =>
    (window as unknown as { restoreSaveTransactions: () => void }).restoreSaveTransactions(),
  );
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  const expected = apply(before, {
    type: 'action',
    action: 'farm',
    cityId: 'chenliu',
    officerId: 'caocao',
  });
  expect(await savedState(page)).toEqual(expected);
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  await page.reload();
  expect(await savedState(page)).toEqual(expected);
});

test('an unavailable database can recover without reloading the page', async ({ page }) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    Object.assign(window, {
      restoreDatabaseOpen: () => {
        IDBFactory.prototype.open = open;
      },
    });
    IDBFactory.prototype.open = function () {
      throw new DOMException('Simulated blocked storage', 'SecurityError');
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Raise your banner' }).click();
  await expect(page.locator('.save-status')).toContainText('Save unavailable');
  await expect(page.getByRole('alert')).toContainText('Could not open browser storage');
  await page.evaluate(() =>
    (window as unknown as { restoreDatabaseOpen: () => void }).restoreDatabaseOpen(),
  );
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  const stored = await savedState(page);
  expect(stored).toEqual(createGame('cao', 190));
});

test('closed connections reopen and an aborted transaction does not poison later saves', async ({
  page,
}) => {
  await start(page);
  const next = createGame('dong', 981);
  const result = await page.evaluate(async (next) => {
    const path = '/src/platform/saves.ts';
    const storage = await import(path);
    const nativeTransaction = IDBDatabase.prototype.transaction;
    let disconnect = true;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      if (disconnect && args[1] === 'readwrite') {
        disconnect = false;
        this.close();
      }
      return nativeTransaction.apply(this, args);
    };
    try {
      await storage.saveSlot('slot-3', 'Reopened storage', next);
      const before = (await storage.listSlots()).find(
        (record: SaveRecord) => record.id === 'slot-3',
      );
      let abort = true;
      IDBDatabase.prototype.transaction = function (
        ...args: Parameters<IDBDatabase['transaction']>
      ) {
        const tx = nativeTransaction.apply(this, args);
        if (abort && args[1] === 'readwrite') {
          abort = false;
          // Abort after the put request is enqueued but before commit.
          queueMicrotask(() => tx.abort());
        }
        return tx;
      };
      let error = '';
      try {
        await storage.saveSlot('slot-3', 'Must not commit', next);
      } catch (failure) {
        error = (failure as Error).message;
      }
      IDBDatabase.prototype.transaction = nativeTransaction;
      const afterFailure = (await storage.listSlots()).find(
        (record: SaveRecord) => record.id === 'slot-3',
      );
      await storage.saveSlot('slot-3', 'Recovered', next);
      const recovered = (await storage.listSlots()).find(
        (record: SaveRecord) => record.id === 'slot-3',
      );
      return { before, afterFailure, recovered, error };
    } finally {
      IDBDatabase.prototype.transaction = nativeTransaction;
    }
  }, next);
  expect(result.error).toMatch(/interrupted/);
  expect(result.afterFailure).toEqual(result.before);
  expect(result.recovered.name).toBe('Recovered');
  expect(decodeSave(result.recovered.payload)).toEqual(next);
});

test('import waits for startup restoration before replacing the saved campaign', async ({
  page,
}) => {
  await start(page);
  const original = await savedState(page);
  await page.addInitScript(() => {
    // Delay only the first reload, so the final reload tests ordinary startup.
    if (sessionStorage.getItem('baye-test-delayed-startup')) return;
    sessionStorage.setItem('baye-test-delayed-startup', 'done');
    const nativeTransaction = IDBDatabase.prototype.transaction;
    let hold = true;
    const hooks = {
      readsHeld: 0,
      release: () => {
        hold = false;
        IDBDatabase.prototype.transaction = nativeTransaction;
      },
    };
    Object.assign(window, { startupStorageTest: hooks });
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const tx = nativeTransaction.apply(this, args);
      if (hold && args[1] === 'readonly' && tx.objectStoreNames.contains('saves')) {
        hooks.readsHeld++;
        // Hold every startup read, including React StrictMode's second mount.
        const keepOpen = () => {
          const request = tx.objectStore('saves').get('auto');
          request.onsuccess = () => {
            if (hold) keepOpen();
          };
        };
        keepOpen();
      }
      return tx;
    };
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              startupStorageTest: { readsHeld: number };
            }
          ).startupStorageTest.readsHeld,
      ),
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole('dialog', { name: 'Choose your banner' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Raise your banner' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Import a saved campaign' })).toBeDisabled();
  await expect(page.locator('input[type=file]')).toBeDisabled();
  await page.evaluate(() =>
    (
      window as unknown as {
        startupStorageTest: { release: () => void };
      }
    ).startupStorageTest.release(),
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await savedState(page)).toEqual(original);
  await expect(page.locator('input[type=file]')).toBeEnabled();
  const imported = createGame('liu', 20261017);
  await importCampaign(page, imported);
  await page.reload();
  expect(await savedState(page)).toEqual(imported);
});
