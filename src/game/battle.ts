import { battlefieldProfile } from '../content/scenario';
import { hasTrait } from '../content/traits';
import { random } from './random';
import { SUPPLY_DIVISOR } from './supply';
import type { BattleObserver, WaitReason } from './aiPolicy';
import type {
  AttackOrder,
  BattleSide,
  BattleSkill,
  BattleState,
  BattleUnit,
  BattlefieldProfile,
  GameCommand,
  GameState,
  Officer,
  Terrain,
  TroopType,
  Weather,
} from './types';

type Side = BattleSide;
type Tile = { x: number; y: number };

// ---------------------------------------------------------------------------
// Tuning constants. Balance passes should only need to touch this block.
// ---------------------------------------------------------------------------
const MOVEMENT: Record<TroopType, number> = {
  infantry: 3,
  cavalry: 5,
  archer: 3,
  naval: 4,
  elite: 4,
  guard: 2,
};
const RANGE: Record<TroopType, number> = {
  infantry: 1,
  cavalry: 1,
  archer: 3,
  naval: 2,
  elite: 1,
  guard: 1,
};
const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
export const COUNTER_RATE = 0.5;
export const GUARD_COUNTER_RATE = 0.7;
export const COUNTER_MIN = 10;
export const FLANK_BONUS = 0.1;
export const FLANK_CAP = 0.3;
export const MORALE_FLOOR = 5;
export const WAVERING_MORALE = 40;
export const ROUTED_MORALE = 20;
const WAVERING_DAMAGE = 0.85;
const ROUTED_TARGET_DAMAGE = 1.2;
const SHOCK_RADIUS = 2;
const ALLY_SHOCK = 10;
const ENEMY_SHOCK = 5;
const MORALE_RECOVERY = 3;
export const TACTIC_POINT_CAP = 30;
export const TACTIC_POINT_REGEN = 2;
export const TACTIC_COST: Record<BattleSkill, number> = {
  fire: 4,
  confuse: 3,
  rally: 2,
  raidSupply: 4,
  ambush: 3,
  rockfall: 4,
};
export const TACTIC_SKILLS = Object.keys(TACTIC_COST) as BattleSkill[];
/** Cunning officers cast every tactic for one point less (never below one). */
export function tacticCost(unit: Pick<BattleUnit, 'officerId'>, skill: BattleSkill): number {
  return Math.max(1, TACTIC_COST[skill] - (hasTrait(unit.officerId, 'cunning') ? 1 : 0));
}
const FIERCE_COUNTER = 1.1;
const AMBUSH_DAMAGE = 1.4;
const ROCKFALL_MORALE = 10;
const RAID_SUPPLY_MIN = 100;
export const WALL_DEFENSE = 60;
export const WALL_COLUMN = 8;
const WALL_DAMAGE = 0.6;
const GATE_DAMAGE = 0.75;
export const DEFAULT_DAY_LIMIT = 30;
/** Centre-out deployment keeps the camp lanes closed on day one. */
export const DEPLOY_ROWS = [5, 4, 6, 3, 7, 2, 8, 1, 9, 0];
/** Share of a unit's troops a normal hit, a fire tactic and rockfall convert into damage. */
export const NORMAL_DAMAGE_RATE = 0.18;
export const FIRE_DAMAGE_RATE = 0.1584;
export const ROCKFALL_DAMAGE_RATE = 0.1296;
/** A weaker defender's units stay within this many tiles of their camp. */
export const HOLD_NEAR_CAMP_RADIUS = 4;
/**
 * The live values of the balance levers, read by the engine. They start at the constants
 * above, and only balance sweeps (DIAGNOSTIC_TUNING) change them; games never do.
 */
export const battleTuning = {
  normalDamageRate: NORMAL_DAMAGE_RATE,
  fireDamageRate: FIRE_DAMAGE_RATE,
  rockfallDamageRate: ROCKFALL_DAMAGE_RATE,
  counterRate: COUNTER_RATE,
  guardCounterRate: GUARD_COUNTER_RATE,
  flankBonus: FLANK_BONUS,
  flankCap: FLANK_CAP,
  routedMorale: ROUTED_MORALE,
  holdNearCampRadius: HOLD_NEAR_CAMP_RADIUS,
  /** An army whose every living unit is routed breaks at the end of the day. */
  armyBreak: true,
};
export type BattleTuning = typeof battleTuning;
export const DEFAULT_BATTLE_TUNING: Readonly<BattleTuning> = Object.freeze({ ...battleTuning });
/** Tactical AI v2 is the default; v1 is kept for mirrored comparisons. */
export type TacticalAi = 'v1' | 'v2';
export const battleConfig: { tacticalAi: TacticalAi | Record<Side, TacticalAi> } = {
  tacticalAi: 'v2',
};
const aiVersionFor = (side: Side): TacticalAi => {
  const config = battleConfig.tacticalAi;
  return typeof config === 'string' ? config : config[side];
};

// ---------------------------------------------------------------------------
// Observer: diagnostic only, never read by the simulation.
// ---------------------------------------------------------------------------
let observer: BattleObserver | undefined;
export function withBattleObserver<T>(next: BattleObserver | undefined, run: () => T): T {
  const previous = observer;
  observer = next;
  try {
    return run();
  } finally {
    observer = previous;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
export function getBattleUnitRange(unit: Pick<BattleUnit, 'troopType'>): number {
  return RANGE[unit.troopType];
}
export function getBattleUnitMove(unit: Pick<BattleUnit, 'troopType'>): number {
  return MOVEMENT[unit.troopType];
}
const distance = (a: Tile, b: Tile): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const alive = (battle: BattleState, side?: Side): BattleUnit[] =>
  battle.units.filter((unit) => unit.troops > 0 && (!side || unit.side === side));
const other = (side: Side): Side => (side === 'attacker' ? 'defender' : 'attacker');
const cell = (battle: BattleState, tile: Tile): number => tile.y * battle.width + tile.x;
const tileOf = (battle: BattleState, index: number): Tile => ({
  x: index % battle.width,
  y: Math.floor(index / battle.width),
});
const terrainAt = (battle: BattleState, tile: Tile): Terrain =>
  battle.terrain[cell(battle, tile)] ?? 'plain';
const inBounds = (battle: BattleState, tile: Tile): boolean =>
  tile.x >= 0 && tile.x < battle.width && tile.y >= 0 && tile.y < battle.height;
export const isMilitia = (unit: Pick<BattleUnit, 'officerId'>): boolean =>
  unit.officerId.startsWith('militia-');
export const campTile = (battle: BattleState, side: Side): Tile => ({
  x: side === 'attacker' ? 0 : battle.width - 1,
  y: Math.floor(battle.height / 2),
});
const camp = campTile;
export const isWavering = (unit: Pick<BattleUnit, 'morale'>): boolean =>
  unit.morale < WAVERING_MORALE;
export const isRouted = (unit: Pick<BattleUnit, 'morale'>): boolean =>
  unit.morale < battleTuning.routedMorale;
export type MoraleState = 'steady' | 'wavering' | 'routed';
export function moraleState(unit: Pick<BattleUnit, 'morale'>): MoraleState {
  return isRouted(unit) ? 'routed' : isWavering(unit) ? 'wavering' : 'steady';
}
const clampMorale = (value: number): number => Math.max(MORALE_FLOOR, Math.min(100, value));

function log(battle: BattleState, message: string): void {
  battle.log.push(message);
  if (battle.log.length > 32) battle.log.splice(0, battle.log.length - 32);
}
const num = (n: number): string => n.toLocaleString('en-US');

export function totalTroops(battle: BattleState, side: Side): number {
  return alive(battle, side).reduce((total, unit) => total + unit.troops, 0);
}
/** Whole days of provisions a side can still feed its living troops. */
export function supplyDaysLeft(battle: BattleState, side: Side): number {
  const daily = Math.max(1, Math.ceil(totalTroops(battle, side) / SUPPLY_DIVISOR));
  return Math.floor((side === 'attacker' ? battle.attackerFood : battle.defenderFood) / daily);
}
export function startingTacticPoints(units: readonly BattleUnit[], side: Side): number {
  return Math.min(
    TACTIC_POINT_CAP,
    units
      .filter((unit) => unit.side === side && !isMilitia(unit) && unit.troops > 0)
      .reduce((total, unit) => total + Math.floor(unit.intellect / 10), 0),
  );
}

function stepCost(unit: Pick<BattleUnit, 'troopType' | 'side'>, terrain: Terrain): number {
  if (terrain === 'wall') return unit.side === 'defender' ? 1 : Infinity;
  if (terrain === 'gate') return 2;
  if (terrain === 'water') return unit.troopType === 'naval' ? 1 : Infinity;
  if (unit.troopType === 'naval') return 2;
  if (terrain === 'forest' || terrain === 'hill')
    return unit.troopType === 'elite' ? 1 : unit.troopType === 'cavalry' ? 3 : 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Pathfinding with zone of control
// ---------------------------------------------------------------------------
interface Paths {
  /** Cheapest cost to each reachable tile (including the start). */
  costs: Map<number, number>;
  /** Tiles reached by some path that could still keep moving (no ZOC stop yet). */
  open: Set<number>;
  /** The tiles from the start to `index`, inclusive, or [] if unreachable. */
  routeTo(index: number): number[];
}

/** Tiles orthogonally adjacent to a living enemy of `unit`. */
function zocTiles(battle: BattleState, unit: BattleUnit): Set<number> {
  const zone = new Set<number>();
  for (const enemy of alive(battle, other(unit.side)))
    for (const direction of DIRECTIONS) {
      const tile = { x: enemy.x + direction.x, y: enemy.y + direction.y };
      if (inBounds(battle, tile)) zone.add(cell(battle, tile));
    }
  return zone;
}

/**
 * Terrain costs, occupied squares and (optionally) zone of control. Entering a ZOC
 * tile ends a path; cavalry may slip through one ZOC tile per move. The search
 * state is (tile, ZOC tiles entered) so the cavalry exception stays exact.
 */
function paths(battle: BattleState, unit: BattleUnit, budget = Infinity, zoc = false): Paths {
  const start = cell(battle, unit);
  const zone = zoc ? zocTiles(battle, unit) : new Set<number>();
  const limit = unit.troopType === 'cavalry' ? 2 : 1;
  const states = battle.width * battle.height * 3;
  const best = new Array<number>(states).fill(Infinity);
  const previous = new Array<number>(states).fill(-1);
  const blocked = new Set(
    alive(battle)
      .filter((candidate) => candidate.id !== unit.id)
      .map((candidate) => cell(battle, candidate)),
  );
  const buckets: number[][] = [[start * 3]];
  best[start * 3] = 0;
  const maxCost = Number.isFinite(budget) ? budget : states * 3;
  for (let cost = 0; cost <= maxCost; cost++) {
    const bucket = buckets[cost];
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      const state = bucket[i]!;
      if (best[state] !== cost) continue;
      const index = Math.floor(state / 3);
      const flag = state % 3;
      // A path stops where it has entered as many ZOC tiles as the unit may.
      if (flag >= limit) continue;
      const position = tileOf(battle, index);
      for (const direction of DIRECTIONS) {
        const next = { x: position.x + direction.x, y: position.y + direction.y };
        if (!inBounds(battle, next)) continue;
        const nextIndex = cell(battle, next);
        if (blocked.has(nextIndex)) continue;
        const step = stepCost(unit, terrainAt(battle, next));
        if (!Number.isFinite(step)) continue;
        const candidate = cost + step;
        if (candidate > maxCost) continue;
        const nextState = nextIndex * 3 + flag + (zone.has(nextIndex) ? 1 : 0);
        if (candidate >= best[nextState]!) continue;
        best[nextState] = candidate;
        previous[nextState] = state;
        (buckets[candidate] ??= []).push(nextState);
      }
    }
  }
  const costs = new Map<number, number>();
  const bestState = new Map<number, number>();
  const open = new Set<number>();
  for (let state = 0; state < states; state++) {
    const value = best[state]!;
    if (!Number.isFinite(value)) continue;
    const index = Math.floor(state / 3);
    if (state % 3 < limit) open.add(index);
    if (value < (costs.get(index) ?? Infinity)) {
      costs.set(index, value);
      bestState.set(index, state);
    }
  }
  return {
    costs,
    open,
    routeTo(index: number): number[] {
      let state = bestState.get(index);
      if (state === undefined) return [];
      const route: number[] = [];
      while (state !== undefined && state >= 0) {
        route.push(Math.floor(state / 3));
        state = previous[state] ?? -1;
      }
      return route.reverse();
    },
  };
}

/** Travel cost from every tile to the nearest goal tile, for approach planning. */
function distanceField(
  battle: BattleState,
  unit: BattleUnit,
  goals: number[],
): Map<number, number> {
  const field = new Map<number, number>();
  const blocked = new Set(
    alive(battle)
      .filter((candidate) => candidate.id !== unit.id)
      .map((candidate) => cell(battle, candidate)),
  );
  const buckets: number[][] = [];
  for (const goal of goals) {
    field.set(goal, 0);
    (buckets[0] ??= []).push(goal);
  }
  const maxCost = battle.width * battle.height * 3;
  for (let cost = 0; cost <= maxCost; cost++) {
    const bucket = buckets[cost];
    if (!bucket) continue;
    for (const index of bucket) {
      if (field.get(index) !== cost) continue;
      const position = tileOf(battle, index);
      // Stepping from `next` into `index` costs what entering `index` costs.
      const entry = stepCost(unit, terrainAt(battle, position));
      if (!Number.isFinite(entry)) continue;
      for (const direction of DIRECTIONS) {
        const next = { x: position.x + direction.x, y: position.y + direction.y };
        if (!inBounds(battle, next)) continue;
        const nextIndex = cell(battle, next);
        if (blocked.has(nextIndex)) continue;
        const candidate = cost + entry;
        if (candidate >= (field.get(nextIndex) ?? Infinity)) continue;
        field.set(nextIndex, candidate);
        (buckets[candidate] ??= []).push(nextIndex);
      }
    }
  }
  return field;
}

export function getReachableTiles(battle: BattleState, unitId: string): Tile[] {
  const unit = battle.units.find((candidate) => candidate.id === unitId);
  if (
    !unit ||
    unit.troops <= 0 ||
    unit.moved ||
    unit.acted ||
    unit.status === 'confused' ||
    battle.outcome
  )
    return [];
  return [...paths(battle, unit, getBattleUnitMove(unit), true).costs.keys()]
    .filter((index) => index !== cell(battle, unit) && canStopOn(battle, unit, index))
    .map((index) => tileOf(battle, index));
}

/**
 * Where a move may end. A unit can pass through its own camp but never park on it (that
 * would make the camp impossible to capture), and a routed unit cannot seize the enemy camp.
 */
function canStopOn(battle: BattleState, unit: BattleUnit, index: number): boolean {
  if (index === cell(battle, camp(battle, unit.side))) return false;
  return !(isRouted(unit) && index === cell(battle, camp(battle, other(unit.side))));
}

/** Tiles where a move ends because an enemy is adjacent (shown as ZOC stops). */
export function getZocStopTiles(battle: BattleState, unitId: string): Tile[] {
  const unit = battle.units.find((candidate) => candidate.id === unitId);
  if (!unit) return [];
  const zone = zocTiles(battle, unit);
  const { open } = paths(battle, unit, getBattleUnitMove(unit), true);
  // A cavalry unit can ride through its first zone tile, so only mark tiles where it must end.
  return getReachableTiles(battle, unitId).filter((tile) => {
    const index = cell(battle, tile);
    return zone.has(index) && !open.has(index);
  });
}

export function getAttackTargets(battle: BattleState, unitId: string): string[] {
  const unit = battle.units.find((candidate) => candidate.id === unitId);
  if (
    !unit ||
    unit.troops <= 0 ||
    unit.acted ||
    unit.status === 'confused' ||
    isRouted(unit) ||
    battle.outcome
  )
    return [];
  return alive(battle, other(unit.side))
    .filter((target) => distance(unit, target) <= getBattleUnitRange(unit))
    .map((target) => target.id);
}

/**
 * Every tile an enemy of `side` could hit next turn: the union, over living
 * enemy units that can still fight, of the tiles within attack range of any tile
 * they can reach. `moved` and `acted` are ignored because this is a forecast.
 */
export function getThreatTiles(battle: BattleState, side: Side): Tile[] {
  const threatened = new Set<number>();
  for (const enemy of alive(battle, other(side))) addThreat(battle, enemy, threatened);
  return [...threatened].sort((a, b) => a - b).map((index) => tileOf(battle, index));
}
function addThreat(battle: BattleState, enemy: BattleUnit, into: Set<number>): void {
  if (enemy.status === 'confused' || isRouted(enemy)) return;
  const range = getBattleUnitRange(enemy);
  const reach = paths(battle, enemy, getBattleUnitMove(enemy), true).costs;
  for (const index of reach.keys()) {
    if (!canStopOn(battle, enemy, index) && index !== cell(battle, enemy)) continue;
    const from = tileOf(battle, index);
    for (let dy = -range; dy <= range; dy++)
      for (let dx = -range; dx <= range; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > range) continue;
        const tile = { x: from.x + dx, y: from.y + dy };
        if (inBounds(battle, tile)) into.add(cell(battle, tile));
      }
  }
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------
type EndReason = 'camp' | 'elimination' | 'timeout' | 'retreat' | 'rout';
function endBattle(battle: BattleState, winner: Side, reason: EndReason): void {
  battle.outcome = winner;
  observer?.battleEnded?.({
    reason,
    day: battle.day,
    winner,
    attackerTroops: totalTroops(battle, 'attacker'),
    defenderTroops: totalTroops(battle, 'defender'),
  });
}

function checkOutcome(battle: BattleState): void {
  if (battle.outcome) return;
  let reason: EndReason = 'elimination';
  let winner: Side | null = null;
  if (!alive(battle, 'attacker').length) winner = 'defender';
  else if (!alive(battle, 'defender').length) winner = 'attacker';
  else {
    for (const unit of alive(battle)) {
      if (!isRouted(unit) && distance(unit, camp(battle, other(unit.side))) === 0) {
        winner = unit.side;
        reason = 'camp';
        log(battle, `${unit.name} seized the enemy camp.`);
        break;
      }
    }
  }
  if (winner) {
    log(battle, `${winner === 'attacker' ? 'Attacking' : 'Defending'} army wins the battle.`);
    endBattle(battle, winner, reason);
  }
}

// ---------------------------------------------------------------------------
// Battlefield generation
// ---------------------------------------------------------------------------
function makeUnit(officer: Officer, side: Side, index: number, width: number): BattleUnit {
  return {
    id: `${side}-${officer.id}`,
    officerId: officer.id,
    name: officer.name,
    side,
    x: side === 'attacker' ? 1 : width - 2,
    y: DEPLOY_ROWS[index] ?? index,
    troops: officer.troops,
    initialTroops: officer.troops,
    force: officer.force,
    intellect: officer.intellect,
    troopType: officer.troopType,
    level: officer.level,
    moved: false,
    acted: false,
    hurt: false,
    morale: 80,
    status: 'normal',
  };
}

const WEATHERS: readonly Weather[] = ['clear', 'rain', 'wind'];

function generateTerrain(
  profile: BattlefieldProfile,
  rolls: readonly number[],
  width: number,
  height: number,
): Terrain[] {
  const terrain: Terrain[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const roll = rolls[y * width + x]!;
      const flank = x <= 2 || x >= 9;
      let tile: Terrain = 'plain';
      if (profile === 'plains') {
        tile =
          x === 6 && ![2, 5, 8].includes(y)
            ? 'water'
            : flank || [2, 5, 8].includes(y)
              ? 'plain'
              : roll < 22
                ? 'forest'
                : roll < 38
                  ? 'hill'
                  : 'plain';
      } else if (profile === 'river') {
        // A two-wide river crossed only at two fords.
        tile =
          (x === 5 || x === 6) && ![3, 7].includes(y)
            ? 'water'
            : flank || x === 5 || x === 6
              ? 'plain'
              : roll < 14
                ? 'forest'
                : roll < 26
                  ? 'hill'
                  : 'plain';
      } else if (profile === 'mountain') {
        // Hills everywhere except a narrow pass through the middle two rows.
        tile =
          flank || y === 4 || y === 5
            ? 'plain'
            : roll < 52
              ? 'hill'
              : roll < 64
                ? 'forest'
                : 'plain';
      } else {
        tile = flank || y === 5 ? 'plain' : roll < 35 ? 'forest' : roll < 45 ? 'hill' : 'plain';
      }
      terrain.push(tile);
    }
  terrain[5 * width] = 'fort';
  terrain[5 * width + width - 1] = 'fort';
  return terrain;
}

function addWalls(terrain: Terrain[], width: number, height: number): void {
  for (let y = 0; y < height; y++)
    terrain[y * width + WALL_COLUMN] = y === 4 || y === 5 ? 'gate' : 'wall';
}

/** Every land troop type must be able to march between the camps. */
function campsConnected(terrain: readonly Terrain[], width: number, height: number): boolean {
  const start = Math.floor(height / 2) * width;
  const goal = start + width - 1;
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const index = queue.shift()!;
    if (index === goal) return true;
    const x = index % width;
    const y = Math.floor(index / width);
    for (const direction of DIRECTIONS) {
      const nx = x + direction.x;
      const ny = y + direction.y;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const next = ny * width + nx;
      const type = terrain[next];
      if (seen.has(next) || type === 'water' || type === 'wall') continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

export interface BattleOptions {
  dayLimit?: number;
}

/** Battlefield generation consumes the same saved RNG as combat, so reloads reproduce outcomes. */
export function createBattle(
  draft: GameState,
  order: AttackOrder,
  options: BattleOptions = {},
): BattleState {
  const target = draft.cities.find((city) => city.id === order.targetId);
  if (!target) throw new Error('Battle destination does not exist.');
  const width = 12;
  const height = 10;
  const rolls: number[] = [];
  for (let i = 0; i < width * height; i++) rolls.push(random(draft, 100));
  const walled = target.defense >= WALL_DEFENSE;
  const build = (profile: BattlefieldProfile): Terrain[] => {
    const terrain = generateTerrain(profile, rolls, width, height);
    if (walled) addWalls(terrain, width, height);
    return terrain;
  };
  let terrain = build(battlefieldProfile(target.id));
  // Fall back deterministically to the plains template; no extra RNG is drawn.
  if (!campsConnected(terrain, width, height)) terrain = build('plains');
  const attackers = order.officerIds
    .map((id) => draft.officers.find((officer) => officer.id === id))
    .filter(
      (officer): officer is Officer =>
        !!officer &&
        !officer.captive &&
        officer.fate === 'active' &&
        officer.factionId === order.factionId &&
        officer.troops > 0,
    )
    .slice(0, 10)
    .map((officer, index) => makeUnit(officer, 'attacker', index, width));
  const defenders = draft.officers
    .filter(
      (officer) =>
        officer.cityId === target.id &&
        officer.factionId === target.factionId &&
        !officer.captive &&
        officer.fate === 'active' &&
        officer.troops > 0,
    )
    .slice(0, 10)
    .map((officer, index) => makeUnit(officer, 'defender', index, width));
  if (target.reserve > 0 && defenders.length < 10) {
    defenders.push({
      id: `defender-militia-${target.id}`,
      officerId: `militia-${target.id}`,
      name: `${target.name} garrison`,
      side: 'defender',
      x: width - 2,
      y: DEPLOY_ROWS[defenders.length] ?? defenders.length,
      troops: target.reserve,
      initialTroops: target.reserve,
      force: 40 + Math.floor(target.defense / 10),
      intellect: 40,
      troopType: 'guard',
      level: 0,
      moved: false,
      acted: false,
      hurt: false,
      morale: Math.min(95, 60 + Math.floor(target.loyalty / 3)),
      status: 'normal',
    });
  }
  const units = [...attackers, ...defenders];
  const weather = WEATHERS[random(draft, 3)]!;
  const nextWeather = WEATHERS[random(draft, 3)]!;
  const dayLimit = options.dayLimit ?? DEFAULT_DAY_LIMIT;
  const battle: BattleState = {
    id: `battle-${order.id}`,
    order: structuredClone(order),
    attackerId: order.factionId,
    defenderId: target.factionId,
    playerSide: order.factionId === draft.playerFactionId ? 'attacker' : 'defender',
    width,
    height,
    terrain,
    units,
    day: 1,
    dayLimit,
    weather,
    nextWeather,
    attackerFood: Math.max(0, order.food),
    defenderFood: Math.max(0, target.food),
    tacticPoints: {
      attacker: startingTacticPoints(units, 'attacker'),
      defender: startingTacticPoints(units, 'defender'),
    },
    log: [
      `The battle for ${target.name} begins. Capture the enemy camp or defeat every unit.`,
      `Defenders hold the city if the siege lasts ${dayLimit} days.`,
    ],
    outcome: null,
  };
  checkOutcome(battle);
  return battle;
}

// ---------------------------------------------------------------------------
// Damage model (pure: forecasts reuse these and never touch RNG or state)
// ---------------------------------------------------------------------------
function terrainDefense(battle: BattleState, target: BattleUnit): number {
  const terrain = terrainAt(battle, target);
  if (terrain === 'wall') return WALL_DAMAGE;
  if (terrain === 'gate') return GATE_DAMAGE;
  if (terrain === 'fort') return 0.65;
  if (terrain === 'hill') return 0.8;
  if (terrain === 'forest') return 0.82;
  if (terrain === 'water' && target.troopType === 'naval') return 0.82;
  return 1;
}

function matchup(source: Pick<BattleUnit, 'troopType'>, target: Pick<BattleUnit, 'troopType'>) {
  if (source.troopType === 'cavalry' && target.troopType === 'archer') return 1.3;
  if (source.troopType === 'infantry' && target.troopType === 'cavalry') return 1.2;
  if (source.troopType === 'archer' && target.troopType === 'infantry') return 1.15;
  if (source.troopType === 'elite') return 1.15;
  return 1;
}

/** +10% per other friendly unit adjacent to the target, capped at +30%. */
export function flankingMultiplier(
  battle: BattleState,
  source: BattleUnit,
  target: BattleUnit,
): number {
  const flankers = battle.units.filter(
    (candidate) =>
      candidate.troops > 0 &&
      candidate.side === source.side &&
      candidate.id !== source.id &&
      distance(candidate, target) === 1,
  ).length;
  return 1 + Math.min(battleTuning.flankCap, battleTuning.flankBonus * flankers);
}

/** Raw (unfloored) normal-attack damage. `variation` is 0.88–1.12 in play. */
export function normalDamage(
  battle: BattleState,
  source: BattleUnit,
  target: BattleUnit,
  variation: number,
): number {
  const force = (source.force + 55) / (target.force + 65);
  const morale = 0.65 + source.morale / 170;
  const weather = battle.weather === 'rain' && source.troopType === 'archer' ? 0.82 : 1;
  const footing =
    source.troopType === 'cavalry' && ['forest', 'hill'].includes(terrainAt(battle, source))
      ? 0.8
      : 1;
  const guard = target.troopType === 'guard' ? 0.8 : 1;
  const inspiration = source.status === 'inspired' ? 1.2 : 1;
  const waver = isWavering(source) ? WAVERING_DAMAGE : 1;
  const rout = isRouted(target) ? ROUTED_TARGET_DAMAGE : 1;
  return Math.max(
    20,
    source.troops *
      battleTuning.normalDamageRate *
      force *
      morale *
      weather *
      footing *
      guard *
      inspiration *
      waver *
      rout *
      flankingMultiplier(battle, source, target) *
      variation *
      matchup(source, target) *
      terrainDefense(battle, target),
  );
}

/** Raw fire damage. `variation` is 0.90–1.10 in play. */
export function fireDamage(
  battle: BattleState,
  source: BattleUnit,
  target: BattleUnit,
  variation: number,
): number {
  const weather = battle.weather === 'rain' ? 0.4 : battle.weather === 'wind' ? 1.25 : 1;
  const ground = terrainAt(battle, target);
  const forest = ground === 'forest' ? 1.4 : ground === 'water' ? 0.35 : 1;
  const intelligence = Math.max(0.35, (source.intellect + 30) / (target.intellect + 55));
  return Math.max(
    12,
    source.troops * battleTuning.fireDamageRate * intelligence * weather * forest * variation,
  );
}

/** Rockfall ignores terrain defense and has no random component. */
export function rockfallDamage(source: BattleUnit, target: BattleUnit): number {
  return Math.floor(
    source.troops *
      battleTuning.rockfallDamageRate *
      Math.max(0.35, (source.intellect + 30) / (target.intellect + 55)),
  );
}

const casualtyCount = (target: Pick<BattleUnit, 'troops'>, damage: number): number =>
  Math.min(target.troops, Math.max(1, Math.floor(damage)));
const moraleAfterHit = (target: BattleUnit, casualties: number): number =>
  Math.max(
    MORALE_FLOOR,
    target.morale - Math.ceil((casualties / Math.max(1, target.initialTroops)) * 45),
  );
const counterRate = (counterer: Pick<BattleUnit, 'troopType'>): number =>
  counterer.troopType === 'guard' ? battleTuning.guardCounterRate : battleTuning.counterRate;
function counterDamage(
  battle: BattleState,
  counterer: BattleUnit,
  victim: BattleUnit,
  variation: number,
): number {
  const fierce = hasTrait(counterer.officerId, 'fierce') ? FIERCE_COUNTER : 1;
  return Math.max(
    COUNTER_MIN,
    Math.floor(
      normalDamage(battle, counterer, victim, variation) * counterRate(counterer) * fierce,
    ),
  );
}
const canCounter = (target: BattleUnit, source: BattleUnit): boolean =>
  target.troops > 0 &&
  target.status !== 'confused' &&
  !isRouted(target) &&
  distance(target, source) <= getBattleUnitRange(target);

export interface AttackForecast {
  min: number;
  max: number;
  /** True when even the weakest roll destroys the target. */
  lethal: boolean;
  counterMin: number;
  counterMax: number;
}

function attackForecastFor(
  battle: BattleState,
  source: BattleUnit,
  target: BattleUnit,
  multiplier = 1,
  counters = true,
): AttackForecast {
  const low = casualtyCount(target, normalDamage(battle, source, target, 0.88) * multiplier);
  const high = casualtyCount(target, normalDamage(battle, source, target, 1.12) * multiplier);
  const counterAt = (casualties: number, variation: number): number => {
    if (!counters) return 0;
    const after: BattleUnit = {
      ...target,
      troops: target.troops - casualties,
      morale: moraleAfterHit(target, casualties),
    };
    if (!canCounter(after, source)) return 0;
    return casualtyCount(source, counterDamage(battle, after, source, variation));
  };
  return {
    min: low,
    max: high,
    lethal: low >= target.troops,
    // A harder blow leaves a weaker, shakier defender who counters less.
    counterMin: counterAt(high, 0.88),
    counterMax: counterAt(low, 1.12),
  };
}

/** Pure: no RNG, no state change. Returns null for an invalid pairing. */
export function forecastAttack(
  battle: BattleState,
  sourceId: string,
  targetId: string,
): AttackForecast | null {
  const source = battle.units.find((unit) => unit.id === sourceId && unit.troops > 0);
  const target = battle.units.find((unit) => unit.id === targetId && unit.troops > 0);
  if (!source || !target || source.side === target.side) return null;
  return attackForecastFor(battle, source, target);
}

export interface TacticForecast {
  min: number;
  max: number;
  /** Success chance in percent (Confuse), else 100. */
  chance: number;
  moraleGain: number;
  /** Rally on a confused unit ends its confusion, so it can act today. */
  endsConfusion: boolean;
  /** Provisions removed from the enemy (Raid supplies). */
  foodTaken: number;
}

function confuseChance(source: BattleUnit, target: BattleUnit): number {
  return Math.min(90, Math.max(20, 55 + source.intellect - target.intellect));
}
const rallyGain = (source: BattleUnit): number => 15 + Math.floor(source.intellect / 5);
const raidSupplyAmount = (target: BattleUnit): number =>
  Math.max(RAID_SUPPLY_MIN, Math.floor(target.troops * 0.5));

export function forecastSkill(
  battle: BattleState,
  sourceId: string,
  skill: BattleSkill,
  targetId?: string,
): TacticForecast | null {
  const source = battle.units.find((unit) => unit.id === sourceId && unit.troops > 0);
  const target = battle.units.find(
    (unit) => unit.id === (targetId ?? (skill === 'rally' ? sourceId : '')) && unit.troops > 0,
  );
  if (!source || !target) return null;
  return forecastSkillFor(battle, source, skill, target);
}

// ---------------------------------------------------------------------------
// Tactics availability
// ---------------------------------------------------------------------------
export function getTacticRange(unit: Pick<BattleUnit, 'troopType' | 'intellect'>): number {
  return unit.troopType === 'archer' || unit.intellect >= 80 ? 3 : 2;
}
/** Veterans (level 3+) meet intellect requirements ten points lower. */
function intellectNeeded(unit: Pick<BattleUnit, 'level'>, base: number): number {
  return unit.level >= 3 ? base - 10 : base;
}
export interface TacticAvailability {
  skill: BattleSkill;
  allowed: boolean;
  reason: string | null;
  range: number;
  cost: number;
}

/** Unit-level conditions for one tactic; target conditions are checked on use. */
function tacticReason(
  battle: BattleState,
  unit: BattleUnit,
  skill: BattleSkill,
  moved = unit.moved,
): string | null {
  if (isMilitia(unit)) return 'Garrison troops cannot use tactics.';
  if (isRouted(unit)) return 'Routed units can only move or hold.';
  if (isWavering(unit)) return 'Wavering units cannot use tactics.';
  if (skill === 'fire' && unit.intellect < intellectNeeded(unit, 60))
    return `Fire requires intellect ${intellectNeeded(unit, 60)}.`;
  if (skill === 'confuse' && unit.intellect < intellectNeeded(unit, 70))
    return `Confuse requires intellect ${intellectNeeded(unit, 70)}.`;
  if (skill === 'rally' && unit.intellect < intellectNeeded(unit, 50) && unit.force < 85)
    return `Rally requires intellect ${intellectNeeded(unit, 50)} or force 85.`;
  if (
    skill === 'raidSupply' &&
    unit.intellect < intellectNeeded(unit, 60) &&
    unit.troopType !== 'cavalry'
  )
    return `Raid supplies requires intellect ${intellectNeeded(unit, 60)} or cavalry.`;
  if (skill === 'ambush') {
    if (unit.intellect < intellectNeeded(unit, 60))
      return `Ambush requires intellect ${intellectNeeded(unit, 60)}.`;
    if (terrainAt(battle, unit) !== 'forest') return 'Ambush requires standing in a forest.';
    if (moved) return 'Ambush requires a unit that has not moved today.';
  }
  if (skill === 'rockfall') {
    if (unit.intellect < intellectNeeded(unit, 65))
      return `Rockfall requires intellect ${intellectNeeded(unit, 65)}.`;
    if (terrainAt(battle, unit) !== 'hill') return 'Rockfall requires standing on a hill.';
  }
  if (battle.tacticPoints[unit.side] < tacticCost(unit, skill))
    return `Requires ${tacticCost(unit, skill)} tactic points.`;
  return null;
}

function skillRange(unit: BattleUnit, skill: BattleSkill): number {
  return skill === 'ambush' || skill === 'rockfall'
    ? Math.min(2, getTacticRange(unit))
    : getTacticRange(unit);
}

/** Valid targets for a tactic from the unit's current tile (empty if the tactic is unavailable). */
export function getTacticTargets(
  battle: BattleState,
  unitId: string,
  skill: BattleSkill,
): string[] {
  const unit = battle.units.find((candidate) => candidate.id === unitId);
  if (
    !unit ||
    unit.troops <= 0 ||
    unit.acted ||
    unit.status === 'confused' ||
    battle.outcome ||
    tacticReason(battle, unit, skill)
  )
    return [];
  const range = skillRange(unit, skill);
  return battle.units
    .filter(
      (target) =>
        target.troops > 0 &&
        (skill === 'rally' ? target.side === unit.side : target.side !== unit.side) &&
        distance(unit, target) <= range &&
        !(skill === 'rockfall' && terrainAt(battle, target) === 'hill'),
    )
    .map((target) => target.id);
}

export function getAvailableTactics(battle: BattleState, unitId: string): TacticAvailability[] {
  const unit = battle.units.find((candidate) => candidate.id === unitId);
  return TACTIC_SKILLS.map((skill) => {
    const reason = unit ? tacticReason(battle, unit, skill) : 'Select an active unit.';
    return {
      skill,
      allowed: reason === null,
      reason,
      range: unit ? skillRange(unit, skill) : 0,
      cost: unit ? tacticCost(unit, skill) : TACTIC_COST[skill],
    };
  });
}

// ---------------------------------------------------------------------------
// Applying damage
// ---------------------------------------------------------------------------
function encircled(battle: BattleState, unit: BattleUnit): boolean {
  const enemies = alive(battle, other(unit.side));
  return DIRECTIONS.every((direction) => {
    const tile = { x: unit.x + direction.x, y: unit.y + direction.y };
    if (!inBounds(battle, tile)) return true;
    if (!Number.isFinite(stepCost(unit, terrainAt(battle, tile)))) return true;
    return enemies.some((enemy) => enemy.x === tile.x && enemy.y === tile.y);
  });
}

function destroyUnit(battle: BattleState, unit: BattleUnit, melee: boolean): void {
  log(battle, `${unit.name}'s unit was defeated.`);
  if (!isMilitia(unit) && (melee || encircled(battle, unit))) {
    unit.capturedBy = other(unit.side);
    log(battle, `${unit.name} was captured.`);
  }
  for (const witness of alive(battle))
    if (distance(witness, unit) <= SHOCK_RADIUS)
      witness.morale = clampMorale(
        witness.morale + (witness.side === unit.side ? -ALLY_SHOCK : ENEMY_SHOCK),
      );
}

/** `melee` marks a killing blow struck by an adjacent unit, which can capture. */
function damageUnit(
  battle: BattleState,
  target: BattleUnit,
  damage: number,
  melee = false,
): number {
  const casualties = casualtyCount(target, damage);
  target.morale = moraleAfterHit(target, casualties);
  target.troops -= casualties;
  target.hurt = true;
  if (target.troops === 0) destroyUnit(battle, target, melee);
  return casualties;
}

function attack(
  draft: GameState,
  battle: BattleState,
  source: BattleUnit,
  target: BattleUnit,
  kind: 'attack' | 'ambush' = 'attack',
): void {
  const variation = (88 + random(draft, 25)) / 100;
  const multiplier = kind === 'ambush' ? AMBUSH_DAMAGE : 1;
  const adjacent = distance(source, target) === 1;
  const casualties = damageUnit(
    battle,
    target,
    normalDamage(battle, source, target, variation) * multiplier,
    adjacent,
  );
  source.acted = true;
  source.moved = true;
  if (kind === 'attack')
    observer?.battleAction?.({ side: source.side, kind: 'attack', day: battle.day });
  log(
    battle,
    kind === 'ambush'
      ? `${source.name} ambushed ${target.name}: ${num(casualties)} casualties.`
      : `${source.name} attacked ${target.name}: ${num(casualties)} casualties.`,
  );
  // Counters answer only normal attacks, never trigger counters, and cost no action.
  if (kind === 'attack' && canCounter(target, source)) {
    const answer = damageUnit(
      battle,
      source,
      counterDamage(battle, target, source, (88 + random(draft, 25)) / 100),
      distance(source, target) === 1,
    );
    observer?.battleAction?.({ side: target.side, kind: 'counter', day: battle.day });
    log(battle, `${target.name} counterattacks: ${num(answer)} casualties.`);
  }
  checkOutcome(battle);
}

function spendTacticPoints(battle: BattleState, source: BattleUnit, skill: BattleSkill): void {
  // Player commands are validated and the AI only plans affordable tactics, so this
  // is an invariant: tactic points can never go negative.
  if (battle.tacticPoints[source.side] < tacticCost(source, skill))
    throw new Error('Tactic points are exhausted.');
  battle.tacticPoints[source.side] -= tacticCost(source, skill);
}

function castSkill(
  draft: GameState,
  battle: BattleState,
  source: BattleUnit,
  kind: BattleSkill,
  target: BattleUnit,
): void {
  spendTacticPoints(battle, source, kind);
  observer?.battleAction?.({ side: source.side, kind: 'tactic', skill: kind, day: battle.day });
  if (kind === 'ambush') {
    attack(draft, battle, source, target, 'ambush');
    return;
  }
  source.acted = true;
  source.moved = true;
  if (kind === 'rally') {
    target.morale = clampMorale(target.morale + rallyGain(source));
    target.status = 'inspired';
    log(battle, `${source.name} rallied ${target.name}, strengthening morale and the next attack.`);
  } else if (kind === 'confuse') {
    if (random(draft, 100) < confuseChance(source, target)) {
      target.status = 'confused';
      log(battle, `${source.name} confused ${target.name}; their next turn is lost.`);
    } else log(battle, `${target.name} saw through ${source.name}'s confusion tactic.`);
  } else if (kind === 'raidSupply') {
    const key = target.side === 'attacker' ? 'attackerFood' : 'defenderFood';
    const gainKey = source.side === 'attacker' ? 'attackerFood' : 'defenderFood';
    const taken = Math.min(battle[key], raidSupplyAmount(target));
    battle[key] -= taken;
    battle[gainKey] += Math.floor(taken / 2);
    log(battle, `${source.name} raided ${target.name}'s supplies: ${num(taken)} food seized.`);
  } else if (kind === 'rockfall') {
    const casualties = damageUnit(battle, target, rockfallDamage(source, target));
    target.morale = clampMorale(target.morale - ROCKFALL_MORALE);
    log(battle, `${source.name} dropped rocks on ${target.name}: ${num(casualties)} casualties.`);
  } else {
    const casualties = damageUnit(
      battle,
      target,
      fireDamage(battle, source, target, (90 + random(draft, 21)) / 100),
    );
    log(
      battle,
      `${source.name}'s fire tactic struck ${target.name}: ${num(casualties)} casualties${battle.weather === 'rain' ? ' (dampened by rain)' : ''}.`,
    );
  }
  checkOutcome(battle);
}

function move(battle: BattleState, unit: BattleUnit, destination: Tile): void {
  if (destination.x !== unit.x || destination.y !== unit.y)
    observer?.battleAction?.({ side: unit.side, kind: 'move', day: battle.day });
  unit.x = destination.x;
  unit.y = destination.y;
  unit.moved = true;
  checkOutcome(battle);
}

// ---------------------------------------------------------------------------
// Tactical AI
// ---------------------------------------------------------------------------
type AiAction =
  | { kind: 'hold' }
  | { kind: 'attack'; target: BattleUnit }
  | { kind: 'skill'; skill: BattleSkill; target: BattleUnit };
interface AiPlan {
  tile: Tile;
  action: AiAction;
  score: number;
}

function endTurnForUnit(unit: BattleUnit): void {
  unit.acted = true;
  unit.moved = true;
}

function runAction(
  draft: GameState,
  battle: BattleState,
  unit: BattleUnit,
  action: AiAction,
  waitReason?: WaitReason,
) {
  if (action.kind === 'attack') attack(draft, battle, unit, action.target);
  else if (action.kind === 'skill') castSkill(draft, battle, unit, action.skill, action.target);
  else {
    observer?.battleAction?.({ side: unit.side, kind: 'wait', day: battle.day, waitReason });
    endTurnForUnit(unit);
  }
}

function loseConfusedTurn(battle: BattleState, unit: BattleUnit): void {
  unit.status = 'normal';
  endTurnForUnit(unit);
  log(battle, `${unit.name} lost a turn to confusion.`);
}

/** Legacy tactical AI: walk to firing range, strike the weakest unit, spend tactics freely. */
function aiTurnV1(draft: GameState, battle: BattleState, side: Side): void {
  for (const unit of alive(battle, side)) {
    if (battle.outcome) break;
    if (unit.acted) continue;
    if (unit.status === 'confused') {
      loseConfusedTurn(battle, unit);
      continue;
    }
    aiMoveToward(battle, unit);
    if (battle.outcome) break;
    const enemies = alive(battle, other(side));
    const targets = getAttackTargets(battle, unit.id)
      .map((id) => battle.units.find((candidate) => candidate.id === id)!)
      .sort((a, b) => a.troops - b.troops);
    const target = bestMeleeTarget(battle, unit, targets);
    const tactics = new Map(getAvailableTactics(battle, unit.id).map((t) => [t.skill, t]));
    const reachable = (skill: BattleSkill) =>
      enemies
        .filter((enemy) => distance(unit, enemy) <= (tactics.get(skill)?.range ?? 0))
        .sort((a, b) => a.troops - b.troops)[0];
    const fireTarget = tactics.get('fire')?.allowed ? reachable('fire') : undefined;
    const confuseTarget = tactics.get('confuse')?.allowed ? reachable('confuse') : undefined;
    if (
      fireTarget &&
      unit.intellect >= 75 &&
      (unit.intellect > unit.force + 15 || !target) &&
      battle.weather !== 'rain'
    )
      castSkill(draft, battle, unit, 'fire', fireTarget);
    else if (target && !isRouted(unit)) attack(draft, battle, unit, target);
    else if (confuseTarget && unit.intellect >= 85 && confuseTarget.status !== 'confused')
      castSkill(draft, battle, unit, 'confuse', confuseTarget);
    else if (unit.morale < 65 && tactics.get('rally')?.allowed)
      castSkill(draft, battle, unit, 'rally', unit);
    else endTurnForUnit(unit);
  }
}

/** Among reachable targets, prefer lethal hits, then the best damage minus counter. */
function bestMeleeTarget(
  battle: BattleState,
  unit: BattleUnit,
  targets: BattleUnit[],
): BattleUnit | undefined {
  let best: BattleUnit | undefined;
  let bestScore = -Infinity;
  for (const target of targets) {
    const forecast = attackForecastFor(battle, unit, target);
    const score =
      (forecast.min + forecast.max) / 2 -
      (forecast.counterMin + forecast.counterMax) / 2 +
      (forecast.lethal ? 1e6 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
}

/** Find an affordable prefix of a real path to firing range, so rivers never trap AI. */
function aiMoveToward(battle: BattleState, unit: BattleUnit): void {
  if (unit.moved) return;
  const reach = paths(battle, unit, getBattleUnitMove(unit), true);
  const enemyCamp = camp(battle, other(unit.side));
  const campIndex = cell(battle, enemyCamp);
  if (reach.costs.has(campIndex) && canStopOn(battle, unit, campIndex)) {
    move(battle, unit, enemyCamp);
    return;
  }
  if (getAttackTargets(battle, unit.id).length) return;
  const route = paths(battle, unit);
  let bestCell = -1;
  let bestScore = Infinity;
  const enemies = alive(battle, other(unit.side));
  for (const [index, cost] of route.costs) {
    const tile = tileOf(battle, index);
    for (const enemy of enemies) {
      if (distance(tile, enemy) > getBattleUnitRange(unit)) continue;
      const score = cost + enemy.troops / 100000;
      if (score < bestScore) {
        bestScore = score;
        bestCell = index;
      }
    }
  }
  if (bestCell < 0) bestCell = campIndex;
  if (!route.costs.has(bestCell)) {
    unit.moved = true;
    return;
  }
  // Walk back along the unrestricted route until the prefix is truly reachable (ZOC).
  const path = route.routeTo(bestCell);
  for (let i = path.length - 1; i >= 0; i--) {
    const step = path[i]!;
    if (reach.costs.has(step) && canStopOn(battle, unit, step)) {
      move(battle, unit, tileOf(battle, step));
      return;
    }
  }
}

interface AiContext {
  side: Side;
  ownCamp: Tile;
  enemyCamp: Tile;
  /** Tiles each enemy could strike next day, keyed by unit id. */
  enemyReach: Map<string, Set<number>>;
  guardId: string | null;
  holdNearCamp: boolean;
  threatCache: Map<string, number>;
}

function buildContext(battle: BattleState, side: Side): AiContext {
  const ownCamp = camp(battle, side);
  const enemies = alive(battle, other(side));
  const enemyReach = new Map<string, Set<number>>();
  for (const enemy of enemies) {
    const tiles = new Set<number>();
    addThreat(battle, enemy, tiles);
    enemyReach.set(enemy.id, tiles);
  }
  // Camp guard: keep the healthiest guard or infantry unit near home while enemies close in.
  let guardId: string | null = null;
  // A lone unit has nobody to spare for the job, so only larger armies keep a guard.
  if (alive(battle, side).length >= 3 && enemies.some((enemy) => distance(enemy, ownCamp) <= 8)) {
    const candidates = alive(battle, side)
      .filter((unit) => ['guard', 'infantry'].includes(unit.troopType) && !isRouted(unit))
      .sort((a, b) => b.troops - a.troops || a.id.localeCompare(b.id));
    guardId = candidates[0]?.id ?? null;
  }
  // A weaker defender simply holds out until the day limit arrives.
  const holdNearCamp =
    side === 'defender' && totalTroops(battle, 'defender') < totalTroops(battle, 'attacker');
  return {
    side,
    ownCamp,
    enemyCamp: camp(battle, other(side)),
    enemyReach,
    guardId,
    holdNearCamp,
    threatCache: new Map(),
  };
}

/** Sum of mid damage that enemies able to reach `tile` would deal to `unit` there. */
function threatAt(battle: BattleState, context: AiContext, unit: BattleUnit, tile: Tile): number {
  const key = `${unit.id}:${tile.x},${tile.y}`;
  const cached = context.threatCache.get(key);
  if (cached !== undefined) return cached;
  const ghost: BattleUnit = { ...unit, x: tile.x, y: tile.y };
  let total = 0;
  for (const enemy of alive(battle, other(unit.side))) {
    if (!context.enemyReach.get(enemy.id)?.has(cell(battle, tile))) continue;
    total += casualtyCount(ghost, normalDamage(battle, enemy, ghost, 1));
  }
  context.threatCache.set(key, total);
  return total;
}

// Scores are in casualty-equivalents so tactics, attacks and positioning compare directly.
const APPROACH_WEIGHT = 120;
const ATTACK_THREAT_WEIGHT = 0.5;
const POSITION_THREAT_WEIGHT = 0.04;
const COUNTER_WEIGHT = 0.8;
const TACTIC_PRICE = 20;
/** Casualty-equivalent worth of one morale point, and of pushing a unit past a morale threshold. */
const MORALE_POINT_VALUE = 10;
const MORALE_BREAK_BONUS = 60;
const TACTIC_POINT_RESERVE = 2;

/** Score every reachable tile × action pair and pick the best (deterministic). */
function planUnitV2(battle: BattleState, unit: BattleUnit, context: AiContext): AiPlan {
  const enemies = alive(battle, other(unit.side));
  const allies = alive(battle, unit.side);
  const start = cell(battle, unit);
  const reach = unit.moved
    ? new Map([[start, 0]])
    : paths(battle, unit, getBattleUnitMove(unit), true).costs;
  const here: Tile = { x: unit.x, y: unit.y };
  const weak = unit.troops < unit.initialTroops * 0.25;
  const routed = isRouted(unit);
  const tiles = [...reach.entries()]
    .filter(([index]) => index === start || canStopOn(battle, unit, index))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const enemyCamp = context.enemyCamp;

  // Seizing the enemy camp ends the battle.
  if (!routed && !unit.acted && reach.has(cell(battle, enemyCamp)))
    return { tile: enemyCamp, action: { kind: 'hold' }, score: 1e9 };

  const restrict = (tile: Tile): boolean => {
    if (unit.id === context.guardId && distance(tile, context.ownCamp) > 1) return false;
    if (context.holdNearCamp && distance(tile, context.ownCamp) > battleTuning.holdNearCampRadius)
      return false;
    return true;
  };
  let candidates = tiles.filter(([index]) => restrict(tileOf(battle, index)));
  if (!candidates.length) {
    // Already outside the zone: allow only moves that bring the unit back toward it.
    candidates = tiles.filter(
      ([index]) =>
        distance(tileOf(battle, index), context.ownCamp) <= distance(here, context.ownCamp),
    );
    if (!candidates.length) candidates = [[start, 0]];
  }

  // Attackers on a deadline stop worrying about being hit.
  const desperate =
    unit.side === 'attacker' &&
    (battle.day >= battle.dayLimit * 0.6 || supplyDaysLeft(battle, 'attacker') <= 4);
  const positionThreat = desperate ? 0 : POSITION_THREAT_WEIGHT;
  const attackThreat = desperate ? 0 : ATTACK_THREAT_WEIGHT;

  // Approach field: travel cost to any tile from which an enemy can be struck.
  let approach: Map<number, number> | null = null;
  const approachCost = (index: number): number => {
    if (!approach) {
      const goals: number[] = [];
      for (let i = 0; i < battle.width * battle.height; i++) {
        const tile = tileOf(battle, i);
        if (
          Number.isFinite(stepCost(unit, terrainAt(battle, tile))) &&
          enemies.some((enemy) => distance(tile, enemy) <= getBattleUnitRange(unit))
        )
          goals.push(i);
      }
      approach = distanceField(
        battle,
        unit,
        goals.length ? goals : [cell(battle, context.enemyCamp)],
      );
    }
    return approach.get(index) ?? 99;
  };

  let best: AiPlan | null = null;
  let bestDecisive = false;
  // Badly hurt units retreat unless they can make a lethal attack.
  const consider = (plan: AiPlan, lethal: boolean) => {
    const decisive = weak && lethal;
    if (
      !best ||
      (decisive && !bestDecisive) ||
      (decisive === bestDecisive && plan.score > best.score)
    ) {
      best = plan;
      bestDecisive = decisive;
    }
  };

  const range = getBattleUnitRange(unit);
  const canAct = !unit.acted && !routed;
  const starving = supplyDaysLeft(battle, unit.side) <= 0;
  const reserveOk = (skill: BattleSkill) =>
    battle.tacticPoints[unit.side] - tacticCost(unit, skill) >= TACTIC_POINT_RESERVE;
  for (const [index, cost] of candidates) {
    const tile = tileOf(battle, index);
    const ghost: BattleUnit = { ...unit, x: tile.x, y: tile.y };
    const threat = threatAt(battle, context, unit, tile);
    const moving = index !== start || unit.moved;
    // Default: reposition. Retreating units head home; others close on the enemy.
    const reposition =
      weak || routed
        ? -distance(tile, context.ownCamp) * APPROACH_WEIGHT
        : -approachCost(index) * APPROACH_WEIGHT;
    consider(
      { tile, action: { kind: 'hold' }, score: reposition - threat * positionThreat - cost * 0.01 },
      false,
    );
    if (!canAct) continue;
    const available = TACTIC_SKILLS.filter(
      (skill) =>
        skill !== 'rally' && reserveOk(skill) && !tacticReason(battle, ghost, skill, moving),
    );
    for (const enemy of enemies) {
      const d = distance(tile, enemy);
      if (d > 3) continue;
      if (d <= range) {
        const forecast = attackForecastFor(battle, ghost, enemy);
        const mid = (forecast.min + forecast.max) / 2;
        const counter = (forecast.counterMin + forecast.counterMax) / 2;
        consider(
          {
            tile,
            action: { kind: 'attack', target: enemy },
            score:
              mid -
              COUNTER_WEIGHT * counter -
              threat * attackThreat +
              (forecast.lethal ? 2 * enemy.troops : 0),
          },
          forecast.lethal,
        );
      }
      for (const skill of available) {
        if (d > skillRange(unit, skill)) continue;
        if (skill === 'rockfall' && terrainAt(battle, enemy) === 'hill') continue;
        const value = aiTacticValue(battle, ghost, skill, enemy);
        if (value <= 0) continue;
        consider(
          {
            tile,
            action: { kind: 'skill', skill, target: enemy },
            score: value - TACTIC_PRICE * tacticCost(unit, skill) - threat * attackThreat,
          },
          skill !== 'confuse' && skill !== 'raidSupply' && value >= enemy.troops * 2,
        );
      }
    }
    // Rally a shaken or confused ally before it acts. A starving side fights instead:
    // hunger erodes morale every day, so rallying would only stall until the day limit.
    if (!starving && !tacticReason(battle, ghost, 'rally', moving)) {
      for (const ally of allies) {
        if (ally.acted || distance(tile, ally) > skillRange(unit, 'rally')) continue;
        if (ally.morale >= 60 && ally.status !== 'confused') continue;
        const gain = Math.min(100, ally.morale + rallyGain(ghost)) - ally.morale;
        const value = gain * 6 + (ally.status === 'confused' ? 250 : 0) + ally.troops * 0.05;
        consider(
          {
            tile,
            action: { kind: 'skill', skill: 'rally', target: ally },
            score: value - TACTIC_PRICE * tacticCost(unit, 'rally') - threat * attackThreat,
          },
          false,
        );
      }
    }
  }
  return best ?? { tile: here, action: { kind: 'hold' }, score: -Infinity };
}

/** Rough casualty-equivalent value of an offensive tactic, 0 when pointless. */
function aiTacticValue(
  battle: BattleState,
  source: BattleUnit,
  skill: BattleSkill,
  target: BattleUnit,
): number {
  const forecast = forecastSkillFor(battle, source, skill, target);
  if (skill === 'confuse')
    return target.status === 'confused' ? 0 : (forecast.chance / 100) * target.troops * 0.25;
  if (skill === 'raidSupply') {
    const food = target.side === 'attacker' ? battle.attackerFood : battle.defenderFood;
    const days = Math.floor(
      food / Math.max(1, Math.ceil(totalTroops(battle, target.side) / SUPPLY_DIVISOR)),
    );
    return forecast.foodTaken * (days <= 12 ? 0.6 : 0.15);
  }
  const mid = (forecast.min + forecast.max) / 2;
  if (skill !== 'rockfall') return mid;
  // The morale shock is worth casualties, more so when it makes the target waver or rout.
  const after = target.morale - ROCKFALL_MORALE;
  const breaks =
    (target.morale >= WAVERING_MORALE && after < WAVERING_MORALE ? 1 : 0) +
    (target.morale >= battleTuning.routedMorale && after < battleTuning.routedMorale ? 1 : 0);
  return mid + ROCKFALL_MORALE * MORALE_POINT_VALUE + breaks * MORALE_BREAK_BONUS;
}

function forecastSkillFor(
  battle: BattleState,
  source: BattleUnit,
  skill: BattleSkill,
  target: BattleUnit,
): TacticForecast {
  const result: TacticForecast = {
    min: 0,
    max: 0,
    chance: 100,
    moraleGain: 0,
    endsConfusion: false,
    foodTaken: 0,
  };
  if (skill === 'fire') {
    result.min = casualtyCount(target, fireDamage(battle, source, target, 0.9));
    result.max = casualtyCount(target, fireDamage(battle, source, target, 1.1));
  } else if (skill === 'confuse') result.chance = confuseChance(source, target);
  else if (skill === 'ambush') {
    result.min = casualtyCount(target, normalDamage(battle, source, target, 0.88) * AMBUSH_DAMAGE);
    result.max = casualtyCount(target, normalDamage(battle, source, target, 1.12) * AMBUSH_DAMAGE);
  } else if (skill === 'rockfall') {
    result.min = result.max = casualtyCount(target, rockfallDamage(source, target));
    result.moraleGain = -ROCKFALL_MORALE;
  } else if (skill === 'rally') {
    result.moraleGain = Math.min(100, target.morale + rallyGain(source)) - target.morale;
    result.endsConfusion = target.status === 'confused';
  } else {
    const food = target.side === 'attacker' ? battle.attackerFood : battle.defenderFood;
    result.foodTaken = Math.min(food, raidSupplyAmount(target));
  }
  return result;
}

/** Why a tactical-AI unit ended its turn without attacking, for diagnostics only. */
function waitReasonFor(battle: BattleState, unit: BattleUnit, context: AiContext): WaitReason {
  if (isRouted(unit)) return 'routed';
  if (getAttackTargets(battle, unit.id).length) return 'targetInRange';
  if (unit.id === context.guardId || context.holdNearCamp) return 'heldBack';
  return 'noTarget';
}

function aiTurnV2(draft: GameState, battle: BattleState, side: Side): void {
  const context = buildContext(battle, side);
  // Support units act first so a rally lands before its ally attacks.
  const order = alive(battle, side).sort((a, b) => {
    const supportA = tacticReason(battle, a, 'rally') === null ? 0 : 1;
    const supportB = tacticReason(battle, b, 'rally') === null ? 0 : 1;
    return supportA - supportB;
  });
  for (const unit of order) {
    if (battle.outcome) break;
    if (unit.troops <= 0 || unit.acted) continue;
    if (unit.status === 'confused') {
      loseConfusedTurn(battle, unit);
      continue;
    }
    const plan = planUnitV2(battle, unit, context);
    // Staying put does not count as moving (an ambusher must not have moved).
    if (!unit.moved && (plan.tile.x !== unit.x || plan.tile.y !== unit.y))
      move(battle, unit, plan.tile);
    if (battle.outcome) break;
    runAction(
      draft,
      battle,
      unit,
      plan.action,
      observer ? waitReasonFor(battle, unit, context) : undefined,
    );
  }
}

function aiTurn(draft: GameState, battle: BattleState, side: Side): void {
  if (aiVersionFor(side) === 'v1') aiTurnV1(draft, battle, side);
  else aiTurnV2(draft, battle, side);
}

// ---------------------------------------------------------------------------
// Day cycle
// ---------------------------------------------------------------------------
function finishDay(draft: GameState, battle: BattleState): void {
  if (battle.outcome) return;
  const shortage: Record<Side, boolean> = { attacker: false, defender: false };
  for (const side of ['attacker', 'defender'] as const) {
    const soldiers = totalTroops(battle, side);
    const foodKey = side === 'attacker' ? 'attackerFood' : 'defenderFood';
    const consumption = Math.ceil(soldiers / SUPPLY_DIVISOR);
    shortage[side] = battle[foodKey] < consumption;
    battle[foodKey] = Math.max(0, battle[foodKey] - consumption);
    if (shortage[side]) {
      observer?.battleShortage?.({ side });
      log(
        battle,
        `${side === 'attacker' ? 'Attacking' : 'Defending'} troops lack provisions and suffer desertion.`,
      );
      for (const unit of alive(battle, side)) {
        damageUnit(battle, unit, Math.max(15, unit.troops * 0.12));
        unit.morale = clampMorale(unit.morale - 15);
      }
    }
  }
  checkOutcome(battle);
  if (battle.outcome) return;
  // An army whose every surviving unit has routed breaks and abandons the field.
  const broken = (side: Side) => {
    const units = alive(battle, side);
    return units.length > 0 && units.every(isRouted);
  };
  if (battleTuning.armyBreak && (broken('attacker') || broken('defender'))) {
    const loser: Side = broken('attacker') ? 'attacker' : 'defender';
    log(
      battle,
      `${loser === 'attacker' ? 'Attacking' : 'Defending'} army breaks and flees the field.`,
    );
    log(battle, `${other(loser) === 'attacker' ? 'Attacking' : 'Defending'} army wins the battle.`);
    endBattle(battle, other(loser), 'rout');
    return;
  }
  if (battle.day >= battle.dayLimit) {
    log(battle, `The ${battle.dayLimit}-day siege limit was reached. The defenders hold the city.`);
    endBattle(battle, 'defender', 'timeout');
    return;
  }
  battle.day++;
  battle.weather = battle.nextWeather;
  battle.nextWeather = WEATHERS[random(draft, 3)]!;
  for (const side of ['attacker', 'defender'] as const)
    battle.tacticPoints[side] = Math.min(
      TACTIC_POINT_CAP,
      battle.tacticPoints[side] + TACTIC_POINT_REGEN,
    );
  for (const unit of battle.units) {
    // Fed units that weren't hit today steady their nerves.
    if (unit.troops > 0 && !unit.hurt && !shortage[unit.side])
      unit.morale = clampMorale(unit.morale + MORALE_RECOVERY);
    unit.hurt = false;
    unit.moved = false;
    unit.acted = false;
    if (unit.status === 'inspired') unit.status = 'normal';
  }
  log(battle, `Day ${battle.day}: ${battle.weather} skies.`);
}

export function autoResolveBattle(draft: GameState): void {
  const battle = draft.battle;
  if (!battle || battle.outcome) return;
  // The day limit also bounds inaccessible or stalemated battlefields.
  for (let iteration = 0; iteration <= battle.dayLimit && !battle.outcome; iteration++) {
    aiTurn(draft, battle, battle.playerSide);
    aiTurn(draft, battle, other(battle.playerSide));
    finishDay(draft, battle);
  }
  if (!battle.outcome) {
    log(battle, 'The defenders held the city through the siege.');
    endBattle(battle, 'defender', 'timeout');
  }
}

/** Returns a validation error; the campaign layer discards the draft on failure. */
export function processBattleCommand(draft: GameState, command: GameCommand): string | null {
  const battle = draft.battle;
  if (draft.phase !== 'battle' || !battle) return 'There is no active battle.';
  if (battle.outcome) return 'This battle has already ended.';
  if (command.type === 'battleRetreat') {
    log(battle, 'You ordered a retreat. Surviving troops withdraw from the battlefield.');
    endBattle(battle, other(battle.playerSide), 'retreat');
    return null;
  }
  if (command.type === 'battleAuto') {
    autoResolveBattle(draft);
    return null;
  }
  if (command.type === 'battleEndDay') {
    for (const unit of alive(battle, battle.playerSide)) {
      if (unit.status === 'confused') {
        unit.status = 'normal';
        log(battle, `${unit.name} lost a turn to confusion.`);
      }
    }
    aiTurn(draft, battle, other(battle.playerSide));
    finishDay(draft, battle);
    return null;
  }
  if (
    !['battleMove', 'battleAttack', 'battleSkill', 'battleWait'].includes(command.type) ||
    !('unitId' in command)
  )
    return 'This command is not available during a battle.';
  const unit = battle.units.find(
    (candidate) => candidate.id === command.unitId && candidate.troops > 0,
  );
  if (!unit) return 'Select an active unit.';
  if (unit.side !== battle.playerSide) return 'You can command only your own units.';
  if (unit.acted) return 'This unit has already acted today.';
  if (unit.status === 'confused')
    return 'This unit is confused and must recover at the end of the day.';
  if (command.type === 'battleMove') {
    if (unit.moved) return 'This unit has already moved today.';
    if (!Number.isInteger(command.x) || !Number.isInteger(command.y))
      return 'Choose a valid battlefield tile.';
    const ownCamp = camp(battle, unit.side);
    if (
      !getReachableTiles(battle, unit.id).some(
        (tile) => tile.x === command.x && tile.y === command.y,
      )
    )
      return command.x === ownCamp.x && command.y === ownCamp.y
        ? 'A unit cannot stop on its own camp.'
        : 'That tile is blocked or beyond this unit’s movement range.';
    move(battle, unit, command);
    return null;
  }
  if (command.type === 'battleWait') {
    observer?.battleAction?.({
      side: unit.side,
      kind: 'wait',
      day: battle.day,
      waitReason: 'player',
    });
    unit.moved = true;
    unit.acted = true;
    return null;
  }
  if (command.type === 'battleAttack') {
    const target = battle.units.find(
      (candidate) => candidate.id === command.targetId && candidate.troops > 0,
    );
    if (!target || target.side === unit.side) return 'Select an enemy unit.';
    if (isRouted(unit)) return 'Routed units can only move or hold.';
    if (!getAttackTargets(battle, unit.id).includes(target.id))
      return 'The enemy is outside this unit’s attack range.';
    attack(draft, battle, unit, target);
    return null;
  }
  if (command.type === 'battleSkill') {
    if (!TACTIC_SKILLS.includes(command.skill)) return 'Unknown battle tactic.';
    const target = battle.units.find(
      (candidate) =>
        candidate.id === (command.targetId ?? (command.skill === 'rally' ? unit.id : '')) &&
        candidate.troops > 0,
    );
    if (!target) return 'Choose a target for this tactic.';
    if (command.skill === 'rally' ? target.side !== unit.side : target.side === unit.side)
      return command.skill === 'rally'
        ? 'Rally requires a friendly target.'
        : 'This tactic requires an enemy target.';
    const reason = tacticReason(battle, unit, command.skill);
    if (reason) return reason;
    if (distance(unit, target) > skillRange(unit, command.skill))
      return `This tactic has a range of ${skillRange(unit, command.skill)} tiles.`;
    if (command.skill === 'rockfall' && terrainAt(battle, target) === 'hill')
      return 'Rockfall cannot strike a unit standing on a hill.';
    castSkill(draft, battle, unit, command.skill, target);
    return null;
  }
  return 'Unknown battle command.';
}
