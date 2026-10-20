import { z } from 'zod';
import type { GameState } from '../game/types';
import { validateState } from '../game/campaign';
import { migrateV1toV2 } from '../game/migrate';
const integer = z.number().int().safe();
const nonnegative = integer.nonnegative();
const id = z.string().min(1).max(100);
const troop = z.enum(['infantry', 'cavalry', 'archer', 'naval', 'elite', 'guard']);
const side = z.enum(['attacker', 'defender']);

// ---------------------------------------------------------------------------
// Version 1 (original release). Kept verbatim so old saves still validate
// before being migrated deterministically to version 2.
// ---------------------------------------------------------------------------
const orderV1 = z.object({
  id,
  factionId: id,
  sourceId: id,
  targetId: id,
  officerIds: z.array(id).max(10),
  food: nonnegative,
});
const cityV1 = z.object({
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
const officerV1 = z.object({
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
const unitV1 = z.object({
  id,
  officerId: id,
  name: z.string().max(100),
  side,
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
const battleV1 = z.object({
  id,
  order: orderV1,
  attackerId: id,
  defenderId: id.nullable(),
  playerSide: side,
  width: integer.min(1).max(30),
  height: integer.min(1).max(30),
  terrain: z.array(z.enum(['plain', 'forest', 'hill', 'water', 'fort'])).max(900),
  units: z.array(unitV1).max(21),
  day: nonnegative,
  weather: z.enum(['clear', 'rain', 'wind']),
  attackerFood: nonnegative,
  defenderFood: nonnegative,
  log: z.array(z.string().max(1000)).max(500),
  outcome: side.nullable(),
});
const eventBase = { key: z.string().min(1).max(220), sequence: nonnegative };
const battleEvent = z.object({
  ...eventBase,
  kind: z.literal('battle'),
  orderId: id,
  sourceId: id,
  targetId: id,
  attackerId: id,
  defenderId: id.nullable(),
  outcome: z.enum(['captured', 'held']),
  days: nonnegative,
  involvesPlayer: z.boolean(),
  bordersPlayer: z.boolean(),
});
const allianceEvent = z.object({
  ...eventBase,
  kind: z.literal('allianceExpired'),
  a: id,
  b: id,
  involvesPlayer: z.boolean(),
});
const recruitmentEvent = z.object({
  ...eventBase,
  kind: z.literal('borderRecruitment'),
  cityId: id,
  factionId: id,
  troops: nonnegative,
});
const reportV1 = z.object({
  turn: nonnegative,
  year: integer.min(190).max(9999),
  month: integer.min(1).max(12),
  partial: z.boolean(),
  events: z
    .array(z.discriminatedUnion('kind', [battleEvent, allianceEvent, recruitmentEvent]))
    .max(128),
  omitted: nonnegative,
  seenKeys: z.array(z.string().min(1).max(220)).max(256),
});
const logEntry = z.object({
  id: nonnegative,
  turn: nonnegative,
  text: z.string().max(2000),
  kind: z.enum(['economy', 'military', 'diplomacy', 'event', 'good', 'bad']),
});
const stateV1 = z.object({
  version: z.literal(1),
  ruleset: z.literal('baye-atlas-1'),
  revision: nonnegative,
  playerFactionId: id,
  rivalAggression: z.enum(['cautious', 'balanced', 'aggressive']).default('balanced'),
  reports: z
    .object({ pending: reportV1.nullable(), latest: reportV1.nullable() })
    .default({ pending: null, latest: null }),
  year: integer.min(190).max(9999),
  month: integer.min(1).max(12),
  turn: nonnegative,
  rng: integer.min(0).max(4294967295),
  nextId: nonnegative,
  cities: z.array(cityV1).min(1).max(100),
  officers: z.array(officerV1).min(1).max(1000),
  alliances: z.array(z.object({ a: id, b: id, untilTurn: nonnegative })).max(100),
  phase: z.enum(['planning', 'battle', 'finished']),
  battle: battleV1.nullable(),
  orders: z.array(orderV1).max(100),
  resolution: z
    .object({
      queue: z.array(orderV1).max(100),
      index: nonnegative,
      stage: z.enum(['orders', 'upkeep']),
    })
    .nullable(),
  log: z.array(logEntry).max(150),
  winner: id.nullable(),
  stats: z.object({
    battlesWon: nonnegative,
    commandsIssued: nonnegative,
    citiesCaptured: nonnegative,
  }),
});

// ---------------------------------------------------------------------------
// Version 2 (gameplay improvement release).
// ---------------------------------------------------------------------------
const orderV2 = orderV1.extend({ intent: z.enum(['conquer', 'raid', 'sack']) });
const cityV2 = cityV1.extend({ plunderCooldownUntil: nonnegative });
const officerV2 = officerV1.extend({
  level: integer.min(0).max(5),
  fate: z.enum(['active', 'executed', 'deceased']),
});
const unitV2 = unitV1.extend({
  level: integer.min(0).max(5),
  hurt: z.boolean(),
  capturedBy: side.optional(),
});
const weather = z.enum(['clear', 'rain', 'wind']);
const battleV2 = battleV1.extend({
  order: orderV2,
  terrain: z.array(z.enum(['plain', 'forest', 'hill', 'water', 'fort', 'wall', 'gate'])).max(900),
  units: z.array(unitV2).max(21),
  dayLimit: integer.min(1).max(60),
  nextWeather: weather,
  tacticPoints: z.object({ attacker: nonnegative, defender: nonnegative }),
});
const raidEvent = z.object({
  ...eventBase,
  kind: z.literal('raid'),
  orderId: id,
  cityId: id,
  attackerId: id,
  gold: nonnegative,
  food: nonnegative,
  fought: z.boolean(),
  involvesPlayer: z.boolean(),
  bordersPlayer: z.boolean(),
});
const revoltEvent = z.object({
  ...eventBase,
  kind: z.literal('revolt'),
  cityId: id,
  independent: z.boolean(),
});
const departureEvent = z.object({
  ...eventBase,
  kind: z.literal('departure'),
  officerId: id,
  fromFactionId: id,
  toFactionId: id.nullable(),
});
const atRiskEvent = z.object({
  ...eventBase,
  kind: z.literal('atRisk'),
  officerIds: z.array(id).max(60),
});
const deathEvent = z.object({
  ...eventBase,
  kind: z.literal('death'),
  officerId: id,
  factionId: id,
});
const coalitionEvent = z.object({
  ...eventBase,
  kind: z.literal('coalition'),
  leaderId: id,
  involvesPlayer: z.boolean(),
});
const reportV2 = reportV1.extend({
  events: z
    .array(
      z.discriminatedUnion('kind', [
        battleEvent,
        allianceEvent,
        recruitmentEvent,
        raidEvent,
        revoltEvent,
        departureEvent,
        atRiskEvent,
        coalitionEvent,
        deathEvent,
      ]),
    )
    .max(128),
});
const lastBattle = z.object({
  orderId: id,
  targetId: id,
  attackerId: id,
  defenderId: id.nullable(),
  outcome: z.enum(['captured', 'held', 'raided']),
  days: nonnegative,
  intent: z.enum(['conquer', 'raid', 'sack']),
  casualties: z.object({ attacker: nonnegative, defender: nonnegative }),
  captured: z.array(id).max(20),
  loot: z.object({ gold: nonnegative, food: nonnegative }).nullable(),
});
const stateV2 = stateV1.extend({
  version: z.literal(2),
  ruleset: z.literal('baye-atlas-2'),
  reports: z.object({ pending: reportV2.nullable(), latest: reportV2.nullable() }),
  rivalAggression: z.enum(['cautious', 'balanced', 'aggressive']),
  cities: z.array(cityV2).min(1).max(100),
  officers: z.array(officerV2).min(1).max(1000),
  battle: battleV2.nullable(),
  orders: z.array(orderV2).max(100),
  resolution: z
    .object({
      queue: z.array(orderV2).max(100),
      index: nonnegative,
      stage: z.enum(['orders', 'upkeep']),
    })
    .nullable(),
  truceUntilTurn: nonnegative,
  lastBattle: lastBattle.nullable(),
  reputation: z.record(id, z.object({ brokeAllianceTurn: nonnegative })),
  scenarioId: z.enum(['divided-realm-190', 'guandu-200']),
  difficulty: z.enum(['story', 'standard', 'warlord']),
  aiPersonalities: z.boolean(),
  aging: z.boolean(),
  hegemon: z.object({ factionId: id.nullable(), months: nonnegative }),
  scouted: z.record(id, nonnegative),
  firedEvents: z.array(z.string().min(1).max(60)).max(40),
  invitations: z
    .array(
      z.object({
        id,
        eventId: z.string().min(1).max(60),
        members: z.array(id).max(10),
        untilTurn: nonnegative,
      }),
    )
    .max(10),
});
const envelopeBase = {
  format: z.literal('baye.save'),
  scenario: z.literal('divided-realm-190'),
  savedAt: z.string().max(50),
};
const envelopeV1 = z.object({ ...envelopeBase, formatVersion: z.literal(1), state: stateV1 });
const envelopeV2 = z.object({
  ...envelopeBase,
  scenario: z.enum(['divided-realm-190', 'guandu-200']),
  formatVersion: z.literal(2),
  state: stateV2,
});
export function encodeSave(state: GameState): string {
  return JSON.stringify({
    format: 'baye.save',
    formatVersion: 2,
    scenario: state.scenarioId,
    savedAt: new Date().toISOString(),
    state,
  });
}
/** Accepts v1 and v2 saves; a v1 save is migrated deterministically (no RNG). */
export function decodeSave(text: string): GameState {
  if (text.length > 5_000_000)
    throw new Error('This save is too large. Campaign saves must be smaller than 5 MB.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Choose a campaign save file.');
  }
  const damaged =
    'This save is damaged or uses an unsupported game version. Your current campaign is unchanged.';
  const version = (raw as { formatVersion?: unknown } | null)?.formatVersion;
  let state: GameState;
  if (version === 1) {
    const result = envelopeV1.safeParse(raw);
    if (!result.success) throw new Error(damaged);
    const migrated = stateV2.safeParse(migrateV1toV2(result.data.state));
    if (!migrated.success) throw new Error(damaged);
    state = migrated.data as GameState;
  } else {
    const result = envelopeV2.safeParse(raw);
    if (!result.success) throw new Error(damaged);
    state = result.data.state as GameState;
    if (result.data.scenario !== state.scenarioId) throw new Error(damaged);
  }
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
