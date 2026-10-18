import { z } from 'zod';
import type { GameState } from '../game/types';
import { validateState } from '../game/campaign';
const integer = z.number().int().safe();
const nonnegative = integer.nonnegative();
const id = z.string().min(1).max(100);
const troop = z.enum(['infantry', 'cavalry', 'archer', 'naval', 'elite', 'guard']);
const order = z.object({
  id,
  factionId: id,
  sourceId: id,
  targetId: id,
  officerIds: z.array(id).max(10),
  food: nonnegative,
});
const city = z.object({
  id,
  name: z.string().max(100),
  chinese: z.string().max(30),
  region: z.string().max(100),
  x: z.number().finite(),
  y: z.number().finite(),
  neighbors: z.array(id).max(30),
  factionId: id.nullable(),
  population: nonnegative,
  farming: nonnegative,
  commerce: nonnegative,
  defense: nonnegative,
  loyalty: nonnegative,
  gold: nonnegative,
  food: nonnegative,
  reserve: nonnegative,
  governorId: id.nullable(),
});
const officer = z.object({
  id,
  name: z.string().max(100),
  chinese: z.string().max(30),
  factionId: id.nullable(),
  cityId: id,
  force: nonnegative,
  intellect: nonnegative,
  loyalty: nonnegative,
  stamina: nonnegative,
  age: nonnegative,
  troops: nonnegative,
  troopType: troop,
  busy: z.boolean(),
  captive: z.boolean(),
  experience: nonnegative,
  equipment: z.string().max(100).nullable(),
});
const unit = z.object({
  id,
  officerId: id,
  name: z.string().max(100),
  side: z.enum(['attacker', 'defender']),
  x: nonnegative,
  y: nonnegative,
  troops: nonnegative,
  initialTroops: nonnegative,
  force: nonnegative,
  intellect: nonnegative,
  troopType: troop,
  moved: z.boolean(),
  acted: z.boolean(),
  morale: nonnegative,
  status: z.enum(['normal', 'confused', 'inspired']),
});
const battle = z.object({
  id,
  order,
  attackerId: id,
  defenderId: id.nullable(),
  playerSide: z.enum(['attacker', 'defender']),
  width: integer.min(1).max(30),
  height: integer.min(1).max(30),
  terrain: z.array(z.enum(['plain', 'forest', 'hill', 'water', 'fort'])).max(900),
  units: z.array(unit).max(21),
  day: nonnegative,
  weather: z.enum(['clear', 'rain', 'wind']),
  attackerFood: nonnegative,
  defenderFood: nonnegative,
  log: z.array(z.string().max(1000)).max(500),
  outcome: z.enum(['attacker', 'defender']).nullable(),
});
const stateSchema = z.object({
  version: z.literal(1),
  ruleset: z.literal('baye-atlas-1'),
  revision: nonnegative,
  playerFactionId: id,
  year: integer.min(190).max(9999),
  month: integer.min(1).max(12),
  turn: nonnegative,
  rng: integer.min(0).max(4294967295),
  nextId: nonnegative,
  cities: z.array(city).min(1).max(100),
  officers: z.array(officer).min(1).max(1000),
  alliances: z.array(z.object({ a: id, b: id, untilTurn: nonnegative })).max(100),
  phase: z.enum(['planning', 'battle', 'finished']),
  battle: battle.nullable(),
  orders: z.array(order).max(100),
  resolution: z
    .object({
      queue: z.array(order).max(100),
      index: nonnegative,
      stage: z.enum(['orders', 'upkeep']),
    })
    .nullable(),
  log: z
    .array(
      z.object({
        id: nonnegative,
        turn: nonnegative,
        text: z.string().max(2000),
        kind: z.enum(['economy', 'military', 'diplomacy', 'event', 'good', 'bad']),
      }),
    )
    .max(150),
  winner: id.nullable(),
  stats: z.object({
    battlesWon: nonnegative,
    commandsIssued: nonnegative,
    citiesCaptured: nonnegative,
  }),
});
const envelope = z.object({
  format: z.literal('baye.save'),
  formatVersion: z.literal(1),
  scenario: z.literal('divided-realm-190'),
  savedAt: z.string().max(50),
  state: stateSchema,
});
export function encodeSave(state: GameState): string {
  return JSON.stringify({
    format: 'baye.save',
    formatVersion: 1,
    scenario: 'divided-realm-190',
    savedAt: new Date().toISOString(),
    state,
  });
}
export function decodeSave(text: string): GameState {
  if (text.length > 5_000_000)
    throw new Error('This save is too large. Campaign saves must be smaller than 5 MB.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Choose a campaign save file.');
  }
  const result = envelope.safeParse(raw);
  if (!result.success)
    throw new Error(
      'This save is damaged or uses an unsupported game version. Your current campaign is unchanged.',
    );
  const state = result.data.state as GameState;
  const error = validateState(state);
  if (error) throw new Error(`This save contains inconsistent game data: ${error}`);
  return state;
}
export interface SaveRecord {
  id: string;
  name: string;
  savedAt: string;
  payload: string;
  // Optional so records written by the original version remain readable.
  summary?: { factionId: string; year: number; month: number; phase: GameState['phase'] };
}
let connection: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (connection) return Promise.resolve(connection);
  if (opening) return opening;
  if (!globalThis.indexedDB)
    return Promise.reject(
      new Error('Browser storage is unavailable. Export a save file to keep your progress.'),
    );
  const request = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open('baye-atlas', 1);
    } catch {
      reject(
        new Error('Could not open browser storage. Export a save file to keep your progress.'),
      );
      return;
    }
    const fail = (message: string) => {
      settled = true;
      reject(new Error(message));
    };
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('saves'))
        req.result.createObjectStore('saves', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const opened = req.result;
      // A blocked request can still succeed later. Do not retain a connection
      // from a request whose caller has already been told it failed.
      if (settled) {
        opened.close();
        return;
      }
      settled = true;
      connection = opened;
      const invalidate = () => {
        if (connection === opened) connection = null;
      };
      opened.onversionchange = () => {
        invalidate();
        opened.close();
      };
      opened.onclose = invalidate;
      resolve(opened);
    };
    req.onerror = () =>
      fail('Could not open browser storage. Export a save file to keep your progress.');
    req.onblocked = () => fail('Another game tab is blocking storage. Close it and try again.');
  });
  opening = request;
  const resetOpening = () => {
    if (opening === request) opening = null;
  };
  // Handle both outcomes without caching rejected promises or creating an
  // unhandled rejection from a detached .finally() promise.
  void request.then(resetOpening, resetOpening);
  return request;
}

async function transaction(mode: IDBTransactionMode): Promise<IDBTransaction> {
  let database = await db();
  for (let attempt = 0; ; attempt++) {
    try {
      // Request a durable commit where supported. The saved indicator is only
      // shown after completion, never merely after the put request succeeds.
      return mode === 'readwrite'
        ? database.transaction('saves', mode, { durability: 'strict' })
        : database.transaction('saves', mode);
    } catch (error) {
      // A browser may close storage after a background suspension. Reopen it
      // once; never retry an already-started transaction or hide quota errors.
      if (attempt === 0 && error instanceof DOMException && error.name === 'InvalidStateError') {
        if (connection === database) connection = null;
        database.close();
        database = await db();
        continue;
      }
      throw error;
    }
  }
}

let writeQueue: Promise<void> = Promise.resolve();
export function saveSlot(id: string, name: string, state: GameState): Promise<void> {
  // Serialize at invocation, before asynchronous storage work. Later state
  // changes cannot alter a manual slot or an earlier queued autosave.
  const record: SaveRecord = {
    id,
    name,
    savedAt: new Date().toISOString(),
    payload: encodeSave(state),
    summary: {
      factionId: state.playerFactionId,
      year: state.year,
      month: state.month,
      phase: state.phase,
    },
  };
  const run = async () => {
    const tx = await transaction('readwrite').catch((error: unknown) => {
      if (error instanceof DOMException)
        throw new Error(
          'Save failed. Your browser may have run out of space. Export a save file instead.',
        );
      throw error;
    });
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error(
            'Save failed. Your browser may have run out of space. Export a save file instead.',
          ),
        );
      tx.onabort = () =>
        reject(new Error('The save transaction was interrupted. Please try again.'));
      try {
        tx.objectStore('saves').put(record);
      } catch {
        try {
          tx.abort();
        } catch {
          // Already aborted or completed by the browser.
        }
        reject(new Error('The save transaction was interrupted. Please try again.'));
      }
    });
  };
  writeQueue = writeQueue.catch(() => {}).then(run);
  return writeQueue;
}
export async function listSlots(): Promise<SaveRecord[]> {
  // A save dialog opened immediately after an action must see every write
  // requested before this read, including writes still waiting in the queue.
  await writeQueue.catch(() => {});
  const tx = await transaction('readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore('saves').getAll();
    tx.oncomplete = () =>
      resolve((req.result as SaveRecord[]).sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
    tx.onerror = tx.onabort = () => reject(new Error('Could not read saved campaigns.'));
  });
}
export function downloadSave(state: GameState): void {
  const url = URL.createObjectURL(new Blob([encodeSave(state)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `baye-${state.year}-${String(state.month).padStart(2, '0')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
