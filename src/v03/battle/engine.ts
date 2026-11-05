import { forecastBattleRations, type BattleRationRemainders } from './supply';
import { recordAiDecision, type AiDecisionEvent } from '../ai/decision-trace';
import { applyCombatDamage } from './experience';
import { PERSONNEL_RULES } from '../campaign/personnel';
import {
  ARMY_MORALE as ARMY_MORALE_TABLE,
  BATTLE as BATTLE_TABLE,
  BATTLE_AI as BATTLE_AI_TABLE,
  MORALE as MORALE_TABLE,
  LEADERSHIP as LEADERSHIP_TABLE,
  PERSONNEL as PERSONNEL_TABLE,
  ORDERS as ORDERS_TABLE,
  TACTICS as TACTICS_TABLE,
} from '../balance';
import {
  battleTerrainAt,
  fireTerrainMultiplier,
  terrainDefenseMultiplier,
  validateBattleMap,
  validateBattleUnits,
} from './maps';
import {
  applyWaterDamageModifiers,
  attackAspect,
  battlePositionIndex,
  casualtyCountAfterWater,
  facingOfVector,
  fireWeatherMultiplier,
  getBattleRouteDistanceField,
  getReachableBattleTiles,
  isBattleAttackInRange,
  isOnWater,
  manhattanDistance,
  movementBudget,
  pathFromParents,
  waterCombatModifiers,
  type PathBlocker,
} from './rules';
import {
  MAX_UNITS_PER_SIDE,
  type BattleAction,
  type BattleActionResult,
  type BattleAspect,
  type BattleFacing,
  type BattleOrder,
  type BattleOrderKind,
  type BattleOutcome,
  type BattleOutcomeCause,
  type BattlePosition,
  type BattleRosterEntry,
  type BattleSide,
  type BattleTactic,
  type BattleTacticAvailability,
  type BattleTacticForecast,
  type BattleTimeoutPolicy,
  type BattleWeather,
  type CreateBattleStateOptions,
  type TacticalBattleUnit,
  type V03TacticalBattleState,
} from './types';
import { battlefieldName } from './battlefields/selection';
import { recordCombatCasualties, troopDamageMultiplier } from './experience';
import { UNITS as UNITS_TABLE } from '../content/units';

// Module-local binding: reading an imported table through the module namespace costs a getter call per access in hot loops.
const UNITS = UNITS_TABLE;

// Module-local bindings: reading an imported table through the module namespace costs a getter call per access in hot loops.
const BATTLE = BATTLE_TABLE;
const BATTLE_AI = BATTLE_AI_TABLE;
const ORDERS = ORDERS_TABLE;
const MORALE = MORALE_TABLE;
const LEADERSHIP = LEADERSHIP_TABLE;
const PERSONNEL = PERSONNEL_TABLE;
const TACTICS = TACTICS_TABLE;
const FACING = BATTLE.facing;
const BAGGAGE = ARMY_MORALE_TABLE.baggage;
const ARMY = ARMY_MORALE_TABLE.armyMorale;
const PURSUIT = ARMY_MORALE_TABLE.pursuit;

const DEFAULT_BATTLE_DAY_LIMIT = BATTLE.dayLimit.conquest;
const DEFAULT_TIMEOUT_POLICY: BattleTimeoutPolicy = 'survivor-count';
export const BATTLE_TACTIC_POINT_CAP = TACTICS.points.cap;
export const BATTLE_TACTIC_POINT_REGEN = TACTICS.points.regen;
export const BATTLE_TACTIC_COST: Readonly<Record<BattleTactic, number>> = TACTICS.cost;
const WAVERING_MORALE = MORALE.wavering;
const ROUTED_MORALE = MORALE.routed;
const MIN_MORALE = MORALE.floor;
/** A fed formation that lost no troops during a day regains this much morale at rollover, up to the opening morale (PF-RL-11). */
export const BATTLE_MORALE_RECOVERY = MORALE.recovery;
export const BATTLE_MORALE_RECOVERY_CAP = MORALE.recoveryCap;
const AMBUSH_DAMAGE_MULTIPLIER = TACTICS.ambush.multiplier;
// PF-RL-12: Fire and Rockfall lost to an ordinary hit almost everywhere.
// Fire now beats one in Wind or forest; Rockfall keeps its morale blow on top.
const FIRE_DAMAGE_COEFFICIENT = TACTICS.fire.coefficient;
const ROCKFALL_DAMAGE_COEFFICIENT = TACTICS.rockfall.coefficient;
const ROCKFALL_MORALE_LOSS = TACTICS.rockfall.moraleLoss;
const RAID_SUPPLY_MINIMUM = TACTICS.raidSupply.minimum;
const INSPIRED_DAMAGE_MULTIPLIER = BATTLE.damage.inspired;
const TACTIC_ORDER: readonly BattleTactic[] = [
  'fire',
  'rally',
  'confuse',
  'raidSupply',
  'ambush',
  'rockfall',
];
const WEATHER_OPTIONS: readonly BattleWeather[] = ['clear', 'rain', 'wind'];
const otherSide = (side: BattleSide): BattleSide => (side === 'attacker' ? 'defender' : 'attacker');

/** The side's commander: the living, non-militia unit with the most leadership (force if none), then force, then id. */
export function battleCommander(
  state: V03TacticalBattleState,
  side: BattleSide,
): TacticalBattleUnit | null {
  let best: TacticalBattleUnit | null = null;
  const lead = (unit: TacticalBattleUnit) => unit.leadership ?? unit.force;
  for (const unit of state.units) {
    if (unit.side !== side || unit.troops <= 0 || unit.isMilitia || isBaggage(unit)) continue;
    if (
      !best ||
      lead(unit) > lead(best) ||
      (lead(unit) === lead(best) &&
        (unit.force > best.force || (unit.force === best.force && unit.id < best.id)))
    )
      best = unit;
  }
  return best;
}

/** The roster entry of an attacker's baggage train: 5% of its line troops (at least 100), weak and unarmed (B-04). */
export function baggageRosterEntry(id: string, lineTroops: number): BattleRosterEntry {
  return {
    id,
    name: 'Baggage',
    troopType: 'infantry',
    role: 'baggage',
    troops: Math.max(BAGGAGE.min, Math.round(BAGGAGE.share * lineTroops)),
    force: BAGGAGE.stat,
    intellect: BAGGAGE.stat,
    leadership: BAGGAGE.stat,
    attackRange: 0,
  };
}

function livingUnits(state: V03TacticalBattleState, side?: BattleSide): TacticalBattleUnit[] {
  return state.units.filter((unit) => unit.troops > 0 && (!side || unit.side === side));
}

const isBaggage = (unit: Pick<TacticalBattleUnit, 'role'>): boolean => unit.role === 'baggage';

/** Living line formations: everything but a baggage train. */
function livingLine(state: V03TacticalBattleState, side?: BattleSide): TacticalBattleUnit[] {
  return state.units.filter(
    (unit) => unit.troops > 0 && !isBaggage(unit) && (!side || unit.side === side),
  );
}

/** Movement points a formation has today: the arm's budget, or a baggage train's own. */
export function unitMovementBudget(unit: Pick<TacticalBattleUnit, 'troopType' | 'role'>): number {
  return isBaggage(unit) ? BAGGAGE.move : movementBudget(unit.troopType);
}

const isWavering = (unit: Pick<TacticalBattleUnit, 'morale'>): boolean =>
  unit.morale < WAVERING_MORALE;
const isRouted = (unit: Pick<TacticalBattleUnit, 'morale'>): boolean => unit.morale < ROUTED_MORALE;
/** Whether a unit's morale is below the rout threshold (display and rules share it). */
export const isBattleUnitRouted = isRouted;
/** Whether a unit's morale is below the wavering threshold (it includes routed units). */
export const isBattleUnitWavering = isWavering;

function tacticalSeed(id: string, seed: number): number {
  let hash = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function advanceRandomState(value: number): number {
  return (Math.imul(value >>> 0, 1664525) + 1013904223) >>> 0;
}

function nextRandomInt(state: V03TacticalBattleState, exclusiveMax: number): number {
  state.rngState = advanceRandomState(state.rngState);
  return state.rngState % exclusiveMax;
}

function unitById(state: V03TacticalBattleState, id: string): TacticalBattleUnit | undefined {
  return state.units.find((unit) => unit.id === id && unit.troops > 0);
}

function otherUnitsAsBlockers(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
): PathBlocker[] {
  return livingUnits(state)
    .filter((candidate) => candidate.id !== unit.id)
    .map((candidate) => ({ id: candidate.id, x: candidate.x, y: candidate.y }));
}

/** Opening morale: flat for rosters without leadership; militia start low; otherwise leadership raises it and unmanaged men lower it. */
function openingMorale(entry: Pick<BattleRosterEntry, 'leadership' | 'excessShare'>): number {
  if (entry.leadership === undefined) return MORALE.opening;
  if (entry.leadership === 0) return LEADERSHIP.militiaMorale;
  return Math.round(
    LEADERSHIP.openingMoraleBase +
      entry.leadership * LEADERSHIP.openingMoralePerLeadership -
      LEADERSHIP.unmanagedMorale * (entry.excessShare ?? 0),
  );
}

/** Force term of the ordinary-hit ratio: leadership-weighted for officers, plain force for militia and bare rosters. */
function hitQuality(unit: Pick<TacticalBattleUnit, 'force' | 'leadership'>): number {
  return unit.leadership === undefined || unit.leadership === 0
    ? unit.force
    : LEADERSHIP.hitLeadershipWeight * unit.leadership +
        (1 - LEADERSHIP.hitLeadershipWeight) * unit.force;
}

/** Incoming-casualty multiplier for the unmanaged share of a formation. */
function unmanagedLosses(target: Pick<TacticalBattleUnit, 'excessShare'>): number {
  return 1 + LEADERSHIP.unmanagedIncoming * (target.excessShare ?? 0);
}

function makeUnits(
  roster: readonly BattleRosterEntry[],
  side: BattleSide,
  deployment: readonly BattlePosition[],
  facing?: BattleFacing,
): TacticalBattleUnit[] {
  return roster.map((entry, index) => {
    const position = deployment[index]!;
    const baggage = entry.role === 'baggage';
    return {
      id: entry.id,
      name: entry.name,
      side,
      troopType: entry.troopType,
      troops: entry.troops,
      wounded: 0,
      casualtyRemainder: 0,
      initialTroops: entry.troops,
      troopExperience: entry.troopExperience ?? 0,
      initialTroopExperience: entry.troopExperience ?? 0,
      combatCasualtiesDealt: 0,
      combatCasualtiesReceived: 0,
      force: entry.force,
      intellect: entry.intellect ?? BATTLE.roster.defaultIntellect,
      level: entry.level ?? 0,
      isMilitia: entry.isMilitia ?? entry.id.includes('militia'),
      cunning: entry.cunning ?? false,
      ...(entry.fierce ? { fierce: true } : {}),
      ...(entry.leadership !== undefined ? { leadership: entry.leadership } : {}),
      ...(entry.excessShare !== undefined ? { excessShare: entry.excessShare } : {}),
      attackRange: baggage ? 0 : (entry.attackRange ?? UNITS[entry.troopType].attackRange),
      ...(baggage ? { role: 'baggage' as const } : {}),
      x: position.x,
      y: position.y,
      morale: openingMorale(entry),
      status: 'normal',
      moved: false,
      acted: false,
      ...(facing ? { facing, charging: false, braced: false } : {}),
    };
  });
}

/**
 * Where a baggage train stands: the free deployment cell farthest from the enemy's deployment
 * (the rear column of the band), nearest the band's middle row. When the band is full the nearest
 * free passable cell takes it; never throws.
 */
function baggageCell(
  map: V03TacticalBattleState['map'],
  deployment: readonly BattlePosition[],
  enemyDeployment: readonly BattlePosition[],
  taken: ReadonlySet<number>,
): BattlePosition {
  const free = (cell: BattlePosition) => {
    const terrain = battleTerrainAt(map, cell);
    return (
      terrain !== undefined &&
      terrain !== 'cliff' &&
      terrain !== 'water' &&
      !taken.has(battlePositionIndex(map, cell.x, cell.y))
    );
  };
  const middle = deployment.length
    ? deployment.reduce((sum, cell) => sum + cell.y, 0) / deployment.length
    : map.height / 2;
  const rear = (cell: BattlePosition) =>
    enemyDeployment.length
      ? Math.min(...enemyDeployment.map((e) => manhattanDistance(cell, e)))
      : 0;
  const best = deployment
    .filter(free)
    .sort(
      (a, b) =>
        rear(b) - rear(a) ||
        Math.abs(a.y - middle) - Math.abs(b.y - middle) ||
        a.y - b.y ||
        a.x - b.x,
    )[0];
  if (best) return best;
  const anchor = deployment[0] ?? { x: 0, y: 0 };
  let nearest: BattlePosition | undefined;
  let bestDistance = Infinity;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const cell = { x, y };
      if (!free(cell)) continue;
      const distance = manhattanDistance(cell, anchor);
      if (distance < bestDistance) {
        nearest = cell;
        bestDistance = distance;
      }
    }
  return nearest ?? anchor;
}

function rosterError(roster: readonly BattleRosterEntry[], side: BattleSide): string | null {
  if (roster.filter((unit) => unit.role !== 'baggage').length > MAX_UNITS_PER_SIDE)
    return `${side} cannot deploy more than ${MAX_UNITS_PER_SIDE} units.`;
  if (roster.filter((unit) => unit.role === 'baggage').length > 1)
    return `${side} can bring only one baggage train.`;
  if (new Set(roster.map((unit) => unit.id)).size !== roster.length)
    return `${side} roster contains duplicate unit IDs.`;
  for (const unit of roster) {
    if (!unit.id.trim()) return `${side} units need stable IDs.`;
    if (!Number.isInteger(unit.troops) || unit.troops < 1)
      return `${unit.name} needs at least one soldier.`;
    if (
      unit.troopExperience !== undefined &&
      (!Number.isFinite(unit.troopExperience) ||
        unit.troopExperience < 0 ||
        unit.troopExperience > BATTLE.roster.experienceLimit)
    )
      return `${unit.name} has invalid soldier experience.`;
    if (!Number.isFinite(unit.force) || unit.force < 0 || unit.force > BATTLE.roster.forceLimit)
      return `${unit.name} has an invalid force value.`;
    if (
      unit.intellect !== undefined &&
      (!Number.isFinite(unit.intellect) ||
        unit.intellect < 0 ||
        unit.intellect > BATTLE.roster.intellectLimit)
    )
      return `${unit.name} has an invalid intellect value.`;
    if (
      unit.level !== undefined &&
      (!Number.isInteger(unit.level) || unit.level < 0 || unit.level > BATTLE.roster.levelLimit)
    )
      return `${unit.name} has an invalid level.`;
    if (
      unit.attackRange !== undefined &&
      (!Number.isInteger(unit.attackRange) || unit.attackRange < (unit.role === 'baggage' ? 0 : 1))
    )
      return `${unit.name} has an invalid attack range.`;
  }
  return null;
}

export function createTacticalBattle(options: CreateBattleStateOptions): V03TacticalBattleState {
  const mapErrors = validateBattleMap(options.map);
  if (mapErrors.length) throw new Error(`Invalid battle map: ${mapErrors.join(' ')}`);
  const attackerRosterError = rosterError(options.attackerUnits, 'attacker');
  if (attackerRosterError) throw new Error(attackerRosterError);
  const defenderRosterError = rosterError(options.defenderUnits, 'defender');
  if (defenderRosterError) throw new Error(defenderRosterError);
  if (
    new Set([...options.attackerUnits, ...options.defenderUnits].map((unit) => unit.id)).size !==
    options.attackerUnits.length + options.defenderUnits.length
  )
    throw new Error('Battle unit IDs must be unique across both sides.');
  const lineCount = (roster: readonly BattleRosterEntry[]) =>
    roster.filter((entry) => entry.role !== 'baggage').length;
  if (lineCount(options.attackerUnits) > options.map.attackerDeployment.length)
    throw new Error('Attacker deployment does not have enough cells for its roster.');
  if (lineCount(options.defenderUnits) > options.map.defenderDeployment.length)
    throw new Error('Defender deployment does not have enough cells for its roster.');
  const dayLimit = options.dayLimit ?? DEFAULT_BATTLE_DAY_LIMIT;
  if (!Number.isInteger(dayLimit) || dayLimit < 1)
    throw new Error('Battle day limit must be a positive integer.');
  for (const side of ['attacker', 'defender'] as const)
    if (
      options.supplies?.[side] !== undefined &&
      (!Number.isFinite(options.supplies[side]) || options.supplies[side]! < 0)
    )
      throw new Error(`${side} supplies must be a non-negative finite value.`);

  const field = (
    roster: readonly BattleRosterEntry[],
    side: BattleSide,
    deployment: readonly BattlePosition[],
    enemyDeployment: readonly BattlePosition[],
    facing?: BattleFacing,
  ): TacticalBattleUnit[] => {
    const line = makeUnits(
      roster.filter((entry) => entry.role !== 'baggage'),
      side,
      deployment,
      facing,
    );
    const taken = new Set(
      [...line].map((unit) => battlePositionIndex(options.map, unit.x, unit.y)),
    );
    const trains = roster
      .filter((entry) => entry.role === 'baggage')
      .map((entry) => {
        const cell = baggageCell(options.map, deployment, enemyDeployment, taken);
        taken.add(battlePositionIndex(options.map, cell.x, cell.y));
        return makeUnits([entry], side, [cell], facing)[0]!;
      });
    return [...line, ...trains];
  };
  const units = [
    ...field(
      options.attackerUnits,
      'attacker',
      options.map.attackerDeployment,
      options.map.defenderDeployment,
      options.facing ? 'e' : undefined,
    ),
    ...field(
      options.defenderUnits,
      'defender',
      options.map.defenderDeployment,
      options.map.attackerDeployment,
      options.facing ? 'w' : undefined,
    ),
  ];
  let rngState = tacticalSeed(options.id, options.seed ?? options.map.seed);
  const rollWeather = (): BattleWeather => {
    rngState = advanceRandomState(rngState);
    return WEATHER_OPTIONS[rngState % WEATHER_OPTIONS.length]!;
  };
  const weather = rollWeather();
  const nextWeather = rollWeather();
  const state: V03TacticalBattleState = {
    schemaVersion: 1,
    engaged: false,
    retreatAllowed: { attacker: false, defender: false },
    id: options.id,
    map: structuredClone(options.map),
    playerSide: options.playerSide ?? 'attacker',
    day: 1,
    dayLimit,
    timeoutPolicy: options.timeoutPolicy ?? DEFAULT_TIMEOUT_POLICY,
    tacticPoints: {
      attacker: Math.min(
        BATTLE_TACTIC_POINT_CAP,
        units
          .filter((unit) => unit.side === 'attacker' && !unit.isMilitia && !isBaggage(unit))
          .reduce(
            (total, unit) =>
              total + Math.floor(unit.intellect / TACTICS.points.openingIntellectDivisor),
            0,
          ),
      ),
      defender: Math.min(
        BATTLE_TACTIC_POINT_CAP,
        units
          .filter((unit) => unit.side === 'defender' && !unit.isMilitia && !isBaggage(unit))
          .reduce(
            (total, unit) =>
              total + Math.floor(unit.intellect / TACTICS.points.openingIntellectDivisor),
            0,
          ),
      ),
    },
    supplies: {
      attacker: Math.max(0, Math.floor(options.supplies?.attacker ?? 0)),
      defender: Math.max(0, Math.floor(options.supplies?.defender ?? 0)),
    },
    rngState,
    weather,
    nextWeather,
    units,
    log: [
      options.map.battlefieldId
        ? `Battle ${options.id} begins at the ${battlefieldName(options.map.battlefieldId, 'en') ?? options.map.battlefieldId}.`
        : `Battle ${options.id} begins on a ${options.map.regionId} field.`,
    ],
    logEntries: [{ day: 1, index: 0, code: 'log.begin', params: {} }],
    outcome: null,
  };
  if (options.armyMorale) {
    const opening = (side: BattleSide) => {
      const commander = battleCommander(state, side);
      return Math.max(
        0,
        Math.min(
          100,
          Math.round(
            ARMY.base +
              (commander ? (commander.leadership ?? commander.force) : 0) * ARMY.commanderFactor,
          ),
        ),
      );
    };
    state.armyMorale = { attacker: opening('attacker'), defender: opening('defender') };
    state.shaken = { attacker: false, defender: false };
    state.pending = null;
  }
  // A baggage train stands where the band has room and is not a deployed line formation.
  const deploymentErrors = validateBattleUnits(
    state.map,
    state.units.filter((unit) => !isBaggage(unit)),
  );
  if (deploymentErrors.length)
    throw new Error(`Invalid unit deployment: ${deploymentErrors.join(' ')}`);
  checkImmediateOutcome(state);
  return state;
}

export function getUnitReachableTiles(
  state: V03TacticalBattleState,
  unitId: string,
  parents?: Map<number, number>,
): ReturnType<typeof getReachableBattleTiles> {
  const unit = unitById(state, unitId);
  if (!unit || unit.status === 'confused' || unit.moved || unit.acted || state.outcome) return [];
  const enemyZone = getEnemyZoneOfControl(state, otherSide(unit.side));
  if (enemyZone.some((position) => position.x === unit.x && position.y === unit.y)) {
    // A formation in contact is pinned, except that a routed one may take a single
    // disengaging step to any free neighbouring cell (PF-RL-13).
    if (!isRouted(unit)) return [];
    return getReachableBattleTiles(
      state.map,
      unit,
      unit,
      unitMovementBudget(unit),
      otherUnitsAsBlockers(state, unit),
      enemyZone,
      parents,
    ).filter((tile) => manhattanDistance(tile, unit) === 1);
  }
  return getReachableBattleTiles(
    state.map,
    unit,
    unit,
    unitMovementBudget(unit),
    otherUnitsAsBlockers(state, unit),
    enemyZone,
    parents,
  );
}

/** Orthogonal enemy control, including across a water edge, as specified for v0.3. */
export function getEnemyZoneOfControl(
  state: V03TacticalBattleState,
  enemySide: BattleSide,
): BattlePosition[] {
  const controlled = new Map<number, BattlePosition>();
  // A baggage train has no attack and controls no cells.
  for (const enemy of livingLine(state, enemySide)) {
    for (const position of [
      { x: enemy.x, y: enemy.y - 1 },
      { x: enemy.x + 1, y: enemy.y },
      { x: enemy.x, y: enemy.y + 1 },
      { x: enemy.x - 1, y: enemy.y },
    ]) {
      if (
        position.x < 0 ||
        position.x >= state.map.width ||
        position.y < 0 ||
        position.y >= state.map.height ||
        battleTerrainAt(state.map, position) === 'cliff'
      )
        continue;
      controlled.set(battlePositionIndex(state.map, position.x, position.y), position);
    }
  }
  return [...controlled.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function getUnitAttackTargets(
  state: V03TacticalBattleState,
  unitId: string,
): TacticalBattleUnit[] {
  const source = unitById(state, unitId);
  if (
    !source ||
    source.acted ||
    source.status === 'confused' ||
    isRouted(source) ||
    isBaggage(source) ||
    state.outcome
  )
    return [];
  return livingUnits(state, otherSide(source.side))
    .filter((target) => isBattleAttackInRange(state.map, source, target, source.attackRange))
    .sort((a, b) => a.troops - b.troops || a.id.localeCompare(b.id));
}

export function appendBattleLog(
  state: V03TacticalBattleState,
  message: string,
  code: string,
  params: Record<string, string | number | boolean | null> = {},
): void {
  state.logEntries ??= [];
  state.logEntries.push({ day: state.day, index: state.log.length, code, params });
  state.log.push(message);
  if (state.log.length > BATTLE.logCap) {
    const removed = state.log.length - BATTLE.logCap;
    state.log.splice(0, removed);
    state.logEntries = state.logEntries
      .filter((entry) => entry.index >= removed)
      .map((entry) => ({ ...entry, index: entry.index - removed }));
  }
}
const append = appendBattleLog;

function checkImmediateOutcome(state: V03TacticalBattleState): BattleOutcome | null {
  if (state.outcome) return state.outcome;
  const attackerAlive = livingLine(state, 'attacker').length > 0;
  const defenderAlive = livingLine(state, 'defender').length > 0;
  if (!attackerAlive || !defenderAlive) {
    const winner = attackerAlive ? 'attacker' : defenderAlive ? 'defender' : null;
    state.outcome = { winner, reason: 'elimination' };
    append(
      state,
      winner ? `${winner} wins by elimination.` : 'Both armies are eliminated.',
      'log.elimination',
      { winner },
    );
    return state.outcome;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Baggage train (B-04), army morale and pursuit (B-05). Everything here is inert
// in a battle created without a baggage entry or the `armyMorale` option.
// ---------------------------------------------------------------------------

/** Changes a side's army morale, logs a change of at least the log threshold, and applies the shaken step once. */
function adjustArmyMorale(
  state: V03TacticalBattleState,
  side: BattleSide,
  delta: number,
  cause: string,
): void {
  const armyMorale = state.armyMorale;
  if (!armyMorale || delta === 0) return;
  armyMorale[side] = Math.max(0, Math.min(100, armyMorale[side] + delta));
  if (Math.abs(delta) >= ARMY.logThreshold)
    append(
      state,
      `${side} army morale ${delta > 0 ? '+' : '−'}${Math.abs(delta)} (${cause}).`,
      'log.armyMorale',
      { side, delta, cause },
    );
  const shaken = state.shaken;
  if (shaken && !shaken[side] && armyMorale[side] <= ARMY.shakenAt) {
    shaken[side] = true;
    for (const unit of livingUnits(state, side))
      unit.morale = Math.max(MIN_MORALE, unit.morale + ARMY.shakenUnitMorale);
    append(state, `${side} army is shaken; every formation loses morale.`, 'log.armyShaken', {
      side,
    });
  }
}

/**
 * Counts each line formation's rout and destruction once against army morale. Run after
 * anything that can rout or destroy a formation; a formation routed and later destroyed
 * costs its owner the destroyed total (-12) in all, not both.
 */
function syncArmyMorale(state: V03TacticalBattleState): void {
  if (!state.armyMorale) return;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const unit of state.units) {
      if (isBaggage(unit)) continue;
      const enemy = otherSide(unit.side);
      if (unit.troops <= 0) {
        if (unit.counted === 'destroyed') continue;
        const wasRouted = unit.counted === 'routed';
        unit.counted = 'destroyed';
        changed = true;
        adjustArmyMorale(
          state,
          unit.side,
          ARMY.unitDestroyed - (wasRouted ? ARMY.unitRouted : 0),
          'destroyed',
        );
        adjustArmyMorale(
          state,
          enemy,
          ARMY.enemyDestroyed - (wasRouted ? ARMY.enemyRouted : 0),
          'enemyDestroyed',
        );
      } else if (isRouted(unit)) {
        if (unit.counted === 'routed') continue;
        unit.counted = 'routed';
        changed = true;
        adjustArmyMorale(state, unit.side, ARMY.unitRouted, 'routed');
        if (battleCommander(state, unit.side)?.id === unit.id)
          adjustArmyMorale(state, unit.side, ARMY.commanderRouted, 'commander');
        adjustArmyMorale(state, enemy, ARMY.enemyRouted, 'enemyRouted');
      } else if (unit.counted === 'routed') delete unit.counted;
    }
    if (!changed) break;
  }
}

/** A baggage train is unscreened when no living, non-routed friendly line formation stands next to it. */
export function baggageUnscreened(
  state: V03TacticalBattleState,
  baggage: Pick<TacticalBattleUnit, 'side' | 'x' | 'y'>,
): boolean {
  return !state.units.some(
    (unit) =>
      unit.side === baggage.side &&
      unit.troops > 0 &&
      !isBaggage(unit) &&
      !isRouted(unit) &&
      manhattanDistance(unit, baggage) === 1,
  );
}

/** The owner loses its field food, army morale and 10 morale in every formation, once. */
function baggageFell(
  state: V03TacticalBattleState,
  baggage: TacticalBattleUnit,
  source: TacticalBattleUnit,
  captured: boolean,
): void {
  const owner = baggage.side;
  const food = state.supplies[owner];
  state.supplies[owner] = 0;
  for (const unit of livingUnits(state, owner))
    unit.morale = Math.max(MIN_MORALE, unit.morale + BAGGAGE.unitMorale);
  append(
    state,
    `${source.name} ${captured ? 'captures' : 'destroys'} the ${owner} baggage train; ${food} food is lost.`,
    captured ? 'log.baggageCaptured' : 'log.baggageLost',
    { unitId: baggage.id, side: owner, sourceId: source.id, food },
  );
  adjustArmyMorale(state, owner, BAGGAGE.armyMorale, 'baggage');
}

/** Casualty-equivalent worth to the enemy AI of a baggage train falling: the food denied and the army-morale swing. */
function baggageFallValue(state: V03TacticalBattleState, baggage: TacticalBattleUnit): number {
  const horizon = Math.min(BATTLE_AI.raidSupply.horizonDays, state.dayLimit - state.day + 1);
  const rations = forecastBattleRations(state, baggage.side);
  const deniedDays = rations.dailyFood > 0 ? Math.min(horizon, rations.supplyDays) : 0;
  const personnel = livingLine(state, baggage.side).reduce(
    (sum, entry) => sum + entry.troops + entry.wounded * BATTLE_AI.value.woundedWeight,
    0,
  );
  return (
    deniedDays * personnel * BATTLE_AI.raidSupply.personDayValue +
    (state.armyMorale ? -BAGGAGE.armyMorale * BAGGAGE.captureMoraleWeight : 0)
  );
}

/** What ends an army: every living line formation routed, army morale at the floor, or too many formations lost. */
function breakCause(state: V03TacticalBattleState, side: BattleSide): BattleOutcomeCause | null {
  const line = state.units.filter((unit) => unit.side === side && !isBaggage(unit));
  const living = line.filter((unit) => unit.troops > 0);
  if (living.length > 0 && living.every(isRouted)) return 'allRouted';
  const armyMorale = state.armyMorale;
  if (!armyMorale) return null;
  if (armyMorale[side] <= ARMY.breakAt)
    return state.units.some((unit) => unit.side === side && isBaggage(unit) && unit.troops <= 0)
      ? 'baggage'
      : 'armyMorale';
  const lost = line.filter((unit) => unit.troops <= 0 || isRouted(unit)).length;
  return line.length > 0 && lost >= ARMY.breakRoutedShare * line.length ? 'formations' : null;
}

/** The formations the player may name in a pending pursuit: its eligible cavalry when it won, its possible rear guard when it lost. */
export function pursuitCandidates(state: V03TacticalBattleState): TacticalBattleUnit[] {
  const pending = state.pending;
  if (!pending) return [];
  return pending.winner === state.playerSide
    ? eligiblePursuers(state, pending.winner)
    : livingLine(state, pending.loser).filter((unit) => unit.morale >= PURSUIT.minMorale);
}

/** Cavalry of the winner that may pursue: living, with enough morale. */
function eligiblePursuers(state: V03TacticalBattleState, winner: BattleSide): TacticalBattleUnit[] {
  return livingLine(state, winner).filter(
    (unit) => unit.troopType === 'cavalry' && unit.morale >= PURSUIT.minMorale,
  );
}

/** AI winner: a fierce or cunning commander pursues with every eligible cavalry formation, any other with at most one. */
function aiPursuers(state: V03TacticalBattleState, winner: BattleSide): string[] {
  const eligible = eligiblePursuers(state, winner).sort(
    (a, b) => b.troops - a.troops || a.id.localeCompare(b.id),
  );
  const commander = battleCommander(state, winner);
  const aggressive = Boolean(commander && (commander.fierce || commander.cunning));
  return (aggressive ? eligible : eligible.slice(0, 1)).map((unit) => unit.id);
}

/** AI loser: its highest-morale line formation with enough morale covers the rout, if any. */
function aiRearGuard(state: V03TacticalBattleState, loser: BattleSide): string | null {
  return (
    livingLine(state, loser)
      .filter((unit) => unit.morale >= PURSUIT.minMorale)
      .sort((a, b) => b.morale - a.morale || b.troops - a.troops || a.id.localeCompare(b.id))[0]
      ?.id ?? null
  );
}

/**
 * Fills the halves of a pending pursuit nobody has decided: `ai` the halves the AI owns, `auto`
 * every half by AI temperament (AI-vs-AI battles), `default` the AI's halves and then the player's
 * with "every eligible cavalry pursues" and "no rear guard".
 */
function fillPursuit(state: V03TacticalBattleState, mode: 'ai' | 'auto' | 'default'): void {
  const pending = state.pending;
  if (!pending) return;
  const ai = (side: BattleSide) => mode === 'auto' || side !== state.playerSide;
  if (pending.pursuers === undefined && ai(pending.winner))
    pending.pursuers = aiPursuers(state, pending.winner);
  if (pending.rearGuard === undefined && ai(pending.loser))
    pending.rearGuard = aiRearGuard(state, pending.loser);
  if (mode === 'default') {
    pending.pursuers ??= eligiblePursuers(state, pending.winner).map((unit) => unit.id);
    pending.rearGuard ??= null;
  }
}

/** Resolves a pending pursuit whose halves are both decided: free hits on the rear guard, then the outcome. */
function resolvePursuit(state: V03TacticalBattleState): void {
  const pending = state.pending;
  if (!pending || pending.pursuers === undefined || pending.rearGuard === undefined) return;
  const eligible = new Set(eligiblePursuers(state, pending.winner).map((unit) => unit.id));
  const pursuers = [...new Set(pending.pursuers)].filter((id) => eligible.has(id));
  const guard = pending.rearGuard
    ? livingLine(state, pending.loser).find(
        (unit) => unit.id === pending.rearGuard && unit.morale >= PURSUIT.minMorale,
      )
    : undefined;
  if (guard)
    for (const id of pursuers) {
      const pursuer = unitById(state, id);
      if (!pursuer || guard.troops <= 0) break;
      attackOneWay(state, pursuer, guard);
    }
  state.pending = null;
  state.outcome = {
    winner: pending.winner,
    reason: 'rout',
    ...(pending.cause ? { cause: pending.cause } : {}),
    pursuit: { pursuers, rearGuard: guard?.id ?? null },
  };
  append(
    state,
    `${pending.winner} pursues the broken ${pending.loser} army with ${pursuers.length} cavalry formation(s)${guard ? `; ${guard.name} covers the retreat` : ''}.`,
    'log.pursuit',
    {
      winner: pending.winner,
      loser: pending.loser,
      pursuers: pursuers.length,
      rearGuard: guard?.id ?? null,
    },
  );
}

/** Both halves by AI temperament, then the outcome: for AI-vs-AI battles, the pacing tool and forecasts. */
function autoSettlePursuit(state: V03TacticalBattleState): void {
  fillPursuit(state, 'auto');
  resolvePursuit(state);
}

function performPursuit(
  state: V03TacticalBattleState,
  action: Extract<BattleAction, { type: 'pursuit' }>,
): string | null {
  const pending = state.pending;
  if (!pending) return 'There is no pursuit to decide.';
  if (state.outcome) return 'This battle has ended.';
  if (pending.winner === state.playerSide) {
    const eligible = new Set(eligiblePursuers(state, pending.winner).map((unit) => unit.id));
    const ids = action.pursuers ?? [];
    if (ids.some((id) => !eligible.has(id)))
      return 'Only your cavalry formations with enough morale can pursue.';
    pending.pursuers = [...new Set(ids)];
  } else {
    const id = action.rearGuard ?? null;
    if (
      id !== null &&
      !livingLine(state, pending.loser).some(
        (unit) => unit.id === id && unit.morale >= PURSUIT.minMorale,
      )
    )
      return 'Only a formation with enough morale can cover the retreat.';
    pending.rearGuard = id;
  }
  fillPursuit(state, 'auto');
  resolvePursuit(state);
  return null;
}

/** The end of an activation in a battle with army morale: count routs and destructions, then test for a break. */
function settleActivation(state: V03TacticalBattleState): void {
  if (!state.armyMorale || state.outcome) return;
  syncArmyMorale(state);
  if (!state.pending) resolveRout(state);
}

function baseDamage(
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
  map: V03TacticalBattleState['map'],
): number {
  const forceRatio =
    (hitQuality(source) + BATTLE.damage.forceOffsetSource) /
    (hitQuality(target) + BATTLE.damage.forceOffsetTarget);
  const morale = BATTLE.damage.moraleBase + source.morale / BATTLE.damage.moraleDivisor;
  const matchup = UNITS[source.troopType].matchup[target.troopType];
  const wavering = isWavering(source) ? BATTLE.damage.wavering : 1;
  const routedTarget = isRouted(target) ? BATTLE.damage.routedTarget : 1;
  const inspiration = source.status === 'inspired' ? INSPIRED_DAMAGE_MULTIPLIER : 1;
  const terrain = battleTerrainAt(map, target);
  const terrainDefense = terrainDefenseMultiplier(terrain);
  // The existing 20-person normal-hit floor remains part of the base damage;
  // water modifiers are applied after it, then casualties are rounded once.
  return Math.max(
    BATTLE.damage.floor,
    source.troops *
      BATTLE.damage.coefficient *
      forceRatio *
      morale *
      matchup *
      terrainDefense *
      wavering *
      routedTarget *
      inspiration,
  );
}

function fireBaseDamage(
  state: V03TacticalBattleState,
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
  variation: number,
): number {
  const weather = fireWeatherMultiplier(state.weather);
  const ground = battleTerrainAt(state.map, target);
  // Water's legacy fire immunity is removed: water uses the shared attack/defense modifiers.
  const forest = fireTerrainMultiplier(ground);
  const intellect = Math.max(
    TACTICS.fire.ratioFloor,
    (source.intellect + TACTICS.fire.intellectOffsetSource) /
      (target.intellect + TACTICS.fire.intellectOffsetTarget),
  );
  return Math.max(
    TACTICS.fire.floor,
    source.troops * FIRE_DAMAGE_COEFFICIENT * intellect * weather * forest * variation,
  );
}

function rockfallBaseDamage(source: TacticalBattleUnit, target: TacticalBattleUnit): number {
  return Math.floor(
    source.troops *
      ROCKFALL_DAMAGE_COEFFICIENT *
      Math.max(
        TACTICS.fire.ratioFloor,
        (source.intellect + TACTICS.fire.intellectOffsetSource) /
          (target.intellect + TACTICS.fire.intellectOffsetTarget),
      ),
  );
}

/** What facing, charge, brace and archer melee do to one ordinary hit (B-02, B-03). */
export interface HitProfile {
  /** Product of the aspect, charge and melee multipliers. */
  multiplier: number;
  aspect: BattleAspect;
  /** The charge bonus applied. */
  charge: boolean;
  /** The target's brace cancelled a charge (and will counterattack harder). */
  braced: boolean;
  /** The archer-melee penalty applied. */
  melee: boolean;
  /** Multiplier on the target's counterattack; 0 means none. */
  counter: number;
}

/** A hit between formations without facing: every rule is skipped. */
const NEUTRAL_HIT: HitProfile = Object.freeze({
  multiplier: 1,
  aspect: 'front',
  charge: false,
  braced: false,
  melee: false,
  counter: 1,
});

/** The shared profile of a hit with an aspect and nothing else: most hits, so none is allocated. */
const PLAIN_HIT: Readonly<Record<BattleAspect, HitProfile>> = Object.freeze({
  front: Object.freeze({
    multiplier: 1,
    aspect: 'front',
    charge: false,
    braced: false,
    melee: false,
    counter: 1,
  }),
  flank: Object.freeze({
    multiplier: FACING.flank,
    aspect: 'flank',
    charge: false,
    braced: false,
    melee: false,
    counter: FACING.counterFlank,
  }),
  rear: Object.freeze({
    multiplier: FACING.rear,
    aspect: 'rear',
    charge: false,
    braced: false,
    melee: false,
    counter: FACING.counterRear,
  }),
});

/** The ordinary hit of `source` on `target` as it stands (the attacker is taken to face its target). */
function hitProfile(source: TacticalBattleUnit, target: TacticalBattleUnit): HitProfile {
  if (source.facing === undefined || target.facing === undefined) return NEUTRAL_HIT;
  const aspect = attackAspect(source, target as BattlePosition & { facing: BattleFacing });
  let multiplier = aspect === 'front' ? 1 : aspect === 'flank' ? FACING.flank : FACING.rear;
  let counter =
    aspect === 'front' ? 1 : aspect === 'flank' ? FACING.counterFlank : FACING.counterRear;
  let charge = false;
  let braced = false;
  const chargeBonus = source.charging ? UNITS[source.troopType].charge : null;
  if (chargeBonus) {
    const brace = UNITS[target.troopType].brace;
    if (target.braced && brace && aspect === 'front' && !isWavering(target)) {
      braced = true;
      counter = brace;
    } else {
      charge = true;
      multiplier *= chargeBonus;
    }
  }
  const incoming = UNITS[target.troopType].meleeIncoming;
  const melee = incoming > 1 && manhattanDistance(source, target) === 1;
  if (melee) multiplier *= incoming;
  if (!charge && !braced && !melee) return PLAIN_HIT[aspect];
  return { multiplier, aspect, charge, braced, melee, counter };
}

/** The counterattack of `source` (the struck formation) against `target` (the attacker) after `original`. */
function counterProfile(
  original: HitProfile,
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
): HitProfile {
  if (original === NEUTRAL_HIT) return NEUTRAL_HIT;
  const incoming = UNITS[target.troopType].meleeIncoming;
  const melee = incoming > 1 && manhattanDistance(source, target) === 1;
  return {
    multiplier: original.counter * (melee ? incoming : 1),
    aspect: 'front',
    charge: false,
    braced: original.braced,
    melee,
    counter: 1,
  };
}

function estimateDamage(
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
  map: V03TacticalBattleState['map'],
  profile: HitProfile = hitProfile(source, target),
): {
  casualties: number;
  modifiers: ReturnType<typeof waterCombatModifiers>;
  profile: HitProfile;
} {
  const modifiers = waterCombatModifiers(map, source, target);
  const damage =
    applyWaterDamageModifiers(
      baseDamage(source, target, map) *
        troopDamageMultiplier(source.troopExperience, target.troopExperience) *
        profile.multiplier,
      modifiers,
    ) * unmanagedLosses(target);
  return { casualties: casualtyCountAfterWater(target.troops, damage), modifiers, profile };
}

export interface BattleAttackForecast {
  sourceId: string;
  targetId: string;
  inRange: boolean;
  sourceOnWater: boolean;
  targetOnWater: boolean;
  attackMultiplier: number;
  incomingDamageMultiplier: number;
  estimatedCasualties: number | null;
  /** Where the hit lands relative to the target's facing (B-02); always `front` without facing. */
  aspect: BattleAspect;
  /** The cavalry charge bonus applies (B-03). */
  charge: boolean;
  /** The target's brace cancels a charge and counterattacks harder (B-03). */
  braced: boolean;
  /** The target is archers hit in melee (B-03). */
  melee: boolean;
  /** The attack captures an unscreened baggage train outright (B-04). */
  captures: boolean;
  /** Target morale after the hit, and what the hit does to it (for the on-map forecast). */
  targetMoraleAfter: number | null;
  targetResult: 'destroyed' | 'routs' | null;
  /** The attacker's morale after the forecast counterattack (unchanged without one). */
  sourceMoraleAfter: number;
  counterattack: {
    possible: boolean;
    estimatedCasualties: number | null;
    sourceOnWater: boolean;
    targetOnWater: boolean;
    attackMultiplier: number;
    incomingDamageMultiplier: number;
  };
}

/** Pure, deterministic forecast used by tactical UI and AI; it never mutates battle state. */
export function predictBattleAttack(
  state: V03TacticalBattleState,
  sourceId: string,
  targetId: string,
): BattleAttackForecast | null {
  const source = unitById(state, sourceId);
  const target = unitById(state, targetId);
  if (!source || !target || source.side === target.side) return null;
  const forecast = forecastAttack(state.map, source, target);
  if (
    forecast.inRange &&
    isBaggage(target) &&
    !isBaggage(source) &&
    baggageUnscreened(state, target)
  )
    // An unscreened train is taken whole and does not answer.
    return {
      ...forecast,
      captures: true,
      estimatedCasualties: target.troops,
      targetMoraleAfter: MIN_MORALE,
      targetResult: 'destroyed',
      counterattack: { ...forecast.counterattack, possible: false, estimatedCasualties: null },
    };
  return forecast;
}

function forecastAttack(
  map: V03TacticalBattleState['map'],
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
): BattleAttackForecast {
  const inRange = isBattleAttackInRange(map, source, target, source.attackRange);
  const initial = waterCombatModifiers(map, source, target);
  const profile = hitProfile(source, target);
  const estimatedCasualties = inRange
    ? estimateDamage(source, target, map, profile).casualties
    : null;
  const survivingTarget = estimatedCasualties === null ? null : target.troops - estimatedCasualties;
  const targetMoraleLoss = estimatedCasualties
    ? Math.min(
        BATTLE.moraleLoss.cap,
        Math.max(
          1,
          Math.ceil(
            (estimatedCasualties / Math.max(1, target.troops)) *
              BATTLE.moraleLoss.perCasualtyFraction,
          ),
        ),
      )
    : 0;
  const counterattackPossible = Boolean(
    inRange &&
    survivingTarget !== null &&
    survivingTarget > 0 &&
    target.status !== 'confused' &&
    target.morale - targetMoraleLoss >= ROUTED_MORALE &&
    profile.counter > 0 &&
    source.troops > 0 &&
    !isBaggage(target) &&
    isBattleAttackInRange(map, target, source, target.attackRange),
  );
  const counterSource = counterattackPossible
    ? {
        ...target,
        troops: survivingTarget!,
        morale: Math.max(MIN_MORALE, target.morale - targetMoraleLoss),
      }
    : target;
  const counter = waterCombatModifiers(map, counterSource, source);
  const counterCasualties = counterattackPossible
    ? estimateDamage(counterSource, source, map, counterProfile(profile, counterSource, source))
        .casualties
    : null;
  const targetMoraleAfter =
    estimatedCasualties === null ? null : Math.max(MIN_MORALE, target.morale - targetMoraleLoss);
  const sourceMoraleLoss = counterCasualties
    ? Math.min(
        BATTLE.moraleLoss.cap,
        Math.max(
          1,
          Math.ceil(
            (counterCasualties / Math.max(1, source.troops)) *
              BATTLE.moraleLoss.perCasualtyFraction,
          ),
        ),
      )
    : 0;
  return {
    sourceId: source.id,
    targetId: target.id,
    inRange,
    sourceOnWater: initial.sourceOnWater,
    targetOnWater: initial.targetOnWater,
    attackMultiplier: initial.attackMultiplier,
    incomingDamageMultiplier: initial.incomingDamageMultiplier,
    estimatedCasualties,
    aspect: profile.aspect,
    charge: profile.charge,
    braced: profile.braced,
    melee: profile.melee,
    captures: false,
    targetMoraleAfter,
    targetResult:
      estimatedCasualties === null
        ? null
        : estimatedCasualties >= target.troops
          ? 'destroyed'
          : !isRouted(target) && targetMoraleAfter! < ROUTED_MORALE
            ? 'routs'
            : null,
    sourceMoraleAfter: Math.max(MIN_MORALE, source.morale - sourceMoraleLoss),
    counterattack: {
      possible: counterattackPossible,
      estimatedCasualties: counterCasualties,
      sourceOnWater: counter.sourceOnWater,
      targetOnWater: counter.targetOnWater,
      attackMultiplier: counter.attackMultiplier,
      incomingDamageMultiplier: counter.incomingDamageMultiplier,
    },
  };
}

function tacticCost(unit: TacticalBattleUnit, tactic: BattleTactic): number {
  return Math.max(1, BATTLE_TACTIC_COST[tactic] - (unit.cunning ? 1 : 0));
}

function tacticRange(unit: TacticalBattleUnit, tactic: BattleTactic): number {
  const generalRange =
    unit.troopType === 'archer' || unit.intellect >= TACTICS.range.longIntellect
      ? TACTICS.range.long
      : TACTICS.range.base;
  return tactic === 'ambush' || tactic === 'rockfall'
    ? Math.min(TACTICS.range.groundTacticMax, generalRange)
    : generalRange;
}

function tacticReason(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  tactic: BattleTactic,
  moved = unit.moved,
): string | null {
  const cost = tacticCost(unit, tactic);
  if (isBaggage(unit)) return 'A baggage train has no tactics.';
  if (unit.isMilitia) return 'Militia cannot use tactics.';
  if (isRouted(unit)) return 'Routed units cannot use tactics.';
  if (isWavering(unit)) return 'Wavering units cannot use tactics.';
  const needed = (base: number) =>
    unit.level >= TACTICS.requirement.veteranLevel
      ? base - TACTICS.requirement.veteranReduction
      : base;
  const need = TACTICS.requirement;
  if (tactic === 'fire' && unit.intellect < needed(need.fire))
    return `Fire requires intellect ${needed(need.fire)}.`;
  if (tactic === 'confuse' && unit.intellect < needed(need.confuse))
    return `Confuse requires intellect ${needed(need.confuse)}.`;
  if (tactic === 'rally' && unit.intellect < needed(need.rally) && unit.force < need.rallyForce)
    return `Rally requires intellect ${needed(need.rally)} or force ${need.rallyForce}.`;
  if (
    tactic === 'raidSupply' &&
    unit.intellect < needed(need.raidSupply) &&
    unit.troopType !== 'cavalry'
  )
    return `Raid supplies requires intellect ${needed(need.raidSupply)} or cavalry.`;
  if (tactic === 'ambush') {
    if (unit.intellect < needed(need.ambush))
      return `Ambush requires intellect ${needed(need.ambush)}.`;
    if (battleTerrainAt(state.map, unit) !== 'forest')
      return 'Ambush requires standing in a forest.';
    if (moved) return 'Ambush requires a unit that has not moved today.';
  }
  if (tactic === 'rockfall') {
    if (unit.intellect < needed(need.rockfall))
      return `Rockfall requires intellect ${needed(need.rockfall)}.`;
    if (battleTerrainAt(state.map, unit) !== 'hill') return 'Rockfall requires standing on a hill.';
  }
  if (state.tacticPoints[unit.side] < cost) return `Requires ${cost} tactic points.`;
  return null;
}

/** Tactics available to this unit before a target is selected. */
export function getAvailableBattleTactics(
  state: V03TacticalBattleState,
  unitId: string,
): BattleTacticAvailability[] {
  const unit = unitById(state, unitId);
  return TACTIC_ORDER.map((tactic) => {
    const reason = !unit
      ? 'Select a living unit.'
      : state.outcome
        ? 'This battle has ended.'
        : unit.acted
          ? `${unit.name} has already acted today.`
          : unit.status === 'confused'
            ? `${unit.name} is confused and will lose its next action.`
            : tacticReason(state, unit, tactic);
    return {
      tactic,
      allowed: reason === null,
      reason,
      range: unit ? tacticRange(unit, tactic) : 0,
      cost: unit ? tacticCost(unit, tactic) : BATTLE_TACTIC_COST[tactic],
    };
  });
}

/** Legal targets use the same restrictions as tactic execution and prediction. */
export function getBattleTacticTargets(
  state: V03TacticalBattleState,
  unitId: string,
  tactic: BattleTactic,
): TacticalBattleUnit[] {
  const unit = unitById(state, unitId);
  if (
    !unit ||
    state.outcome ||
    unit.acted ||
    unit.status === 'confused' ||
    tacticReason(state, unit, tactic)
  )
    return [];
  const range = tacticRange(unit, tactic);
  return livingUnits(state)
    .filter(
      (target) =>
        (tactic === 'rally' ? target.side === unit.side : target.side !== unit.side) &&
        manhattanDistance(unit, target) <= range &&
        !isBaggage(target) &&
        !(tactic === 'rockfall' && battleTerrainAt(state.map, target) === 'hill'),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Pure tactic preview. It does not consume RNG, points, supplies, or unit actions. */
export function predictBattleTactic(
  state: V03TacticalBattleState,
  sourceId: string,
  tactic: BattleTactic,
  targetId: string,
): BattleTacticForecast | null {
  const source = unitById(state, sourceId);
  const target = unitById(state, targetId);
  if (
    !source ||
    !target ||
    state.outcome ||
    tacticReason(state, source, tactic) ||
    source.acted ||
    source.status === 'confused' ||
    (tactic === 'rally' ? target.side !== source.side : target.side === source.side) ||
    (tactic === 'rockfall' && battleTerrainAt(state.map, target) === 'hill')
  )
    return null;
  const inRange = manhattanDistance(source, target) <= tacticRange(source, tactic);
  const modifiers = waterCombatModifiers(state.map, source, target);
  const casualties = (rawDamage: number) =>
    casualtyCountAfterWater(
      target.troops,
      applyWaterDamageModifiers(rawDamage, modifiers) * unmanagedLosses(target),
    );
  let minCasualties = 0;
  let maxCasualties = 0;
  let chance = 100;
  let moraleChange = 0;
  let endsConfusion = false;
  let suppliesTransferred = 0;
  if (tactic === 'fire') {
    minCasualties = casualties(fireBaseDamage(state, source, target, TACTICS.fire.variationMin));
    maxCasualties = casualties(fireBaseDamage(state, source, target, TACTICS.fire.variationMax));
  } else if (tactic === 'ambush') {
    minCasualties = casualties(
      baseDamage(source, target, state.map) *
        TACTICS.ambush.variationMin *
        AMBUSH_DAMAGE_MULTIPLIER,
    );
    maxCasualties = casualties(
      baseDamage(source, target, state.map) *
        TACTICS.ambush.variationMax *
        AMBUSH_DAMAGE_MULTIPLIER,
    );
  } else if (tactic === 'rockfall') {
    minCasualties = maxCasualties = casualties(rockfallBaseDamage(source, target));
    moraleChange = -ROCKFALL_MORALE_LOSS;
  } else if (tactic === 'confuse') {
    chance = Math.min(
      TACTICS.confuse.max,
      Math.max(TACTICS.confuse.min, TACTICS.confuse.base + source.intellect - target.intellect),
    );
  } else if (tactic === 'rally') {
    const rallyGain =
      TACTICS.rally.base + Math.floor(source.intellect / TACTICS.rally.intellectDivisor);
    moraleChange = Math.min(100, target.morale + rallyGain) - target.morale;
    endsConfusion = target.status === 'confused';
  } else {
    suppliesTransferred = Math.min(
      state.supplies[target.side],
      Math.max(RAID_SUPPLY_MINIMUM, Math.floor(target.troops * TACTICS.raidSupply.troopFraction)),
    );
  }
  return {
    sourceId,
    targetId,
    tactic,
    inRange,
    minCasualties,
    maxCasualties,
    chance,
    moraleChange,
    endsConfusion,
    suppliesTransferred,
    sourceOnWater: modifiers.sourceOnWater,
    targetOnWater: modifiers.targetOnWater,
    attackMultiplier: modifiers.attackMultiplier,
    incomingDamageMultiplier: modifiers.incomingDamageMultiplier,
  };
}

/** Only damage paths using baseDamage qualify; Fire and Rockfall do not. */
function consumeInspiredHit(source: TacticalBattleUnit, casualties: number): void {
  if (casualties > 0 && source.status === 'inspired') source.status = 'normal';
}

/** One scheduled move/action opportunity, including a routed unit's hold. */
function consumeConfusedActivation(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
): boolean {
  if (unit.status !== 'confused' || unit.acted || unit.troops <= 0) return false;
  unit.status = 'normal';
  unit.moved = true;
  unit.acted = true;
  append(state, `${unit.name} loses its turn to confusion.`, 'log.confused', { unitId: unit.id });
  return true;
}

function attackOneWay(
  state: V03TacticalBattleState,
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
  counterOf?: HitProfile,
): HitProfile {
  const counter = counterOf !== undefined;
  const { casualties, modifiers, profile } = estimateDamage(
    source,
    target,
    state.map,
    counterOf ? counterProfile(counterOf, source, target) : undefined,
  );
  state.engaged = true;
  recordCombatCasualties(source, target, casualties);
  applyCombatDamage(target, casualties);
  consumeInspiredHit(source, casualties);
  if (casualties > 0) {
    const moraleLoss = Math.min(
      BATTLE.moraleLoss.cap,
      Math.max(
        1,
        Math.ceil(
          (casualties / Math.max(1, target.troops + casualties)) *
            BATTLE.moraleLoss.perCasualtyFraction,
        ),
      ),
    );
    target.morale = Math.max(MIN_MORALE, target.morale - moraleLoss);
  }
  target.troops = Math.max(0, target.troops);
  target.moved = target.moved || target.troops === 0;
  target.acted = target.acted || target.troops === 0;
  const waterNote =
    modifiers.sourceOnWater || modifiers.targetOnWater
      ? ` (water ${modifiers.attackMultiplier.toFixed(2)}× attack × ${modifiers.incomingDamageMultiplier.toFixed(2)}× damage received)`
      : '';
  append(
    state,
    `${source.name} ${counter ? 'counterattacks' : 'attacks'} ${target.name}: ${casualties} casualties${waterNote}.`,
    'log.attack',
    {
      sourceId: source.id,
      targetId: target.id,
      casualties,
      water: modifiers.sourceOnWater || modifiers.targetOnWater,
      attackMultiplier: modifiers.attackMultiplier,
      incomingMultiplier: modifiers.incomingDamageMultiplier,
      ...(counter ? { counter: true } : {}),
      ...(profile.aspect !== 'front' ? { aspect: profile.aspect } : {}),
      ...(profile.charge ? { charge: true } : {}),
      ...(profile.braced ? { braced: true } : {}),
      ...(profile.melee ? { melee: true } : {}),
    },
  );
  return profile;
}

/** Turns a formation (one that has a facing) toward a cell; a diagonal tie keeps its facing. */
function faceToward(unit: TacticalBattleUnit, to: BattlePosition): void {
  if (unit.facing !== undefined)
    unit.facing = facingOfVector(to.x - unit.x, to.y - unit.y, unit.facing);
}

/** Ending an activation by holding, unmoved, braces a formation that can brace (B-03). */
function holdPosition(unit: TacticalBattleUnit): void {
  if (!unit.moved && unit.facing !== undefined && UNITS[unit.troopType].brace) unit.braced = true;
  unit.moved = true;
  unit.acted = true;
}

/**
 * Whether the straight line from `from` to `to` is a charge run: at least `minRun` cells along
 * one axis, none along the other, every cell plain (and, with `occupied`, free of other units).
 */
function chargeRunReady(
  map: V03TacticalBattleState['map'],
  occupied: ReadonlyMap<number, TacticalBattleUnit> | undefined,
  from: BattlePosition,
  to: BattlePosition,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if ((dx !== 0 && dy !== 0) || Math.abs(dx) + Math.abs(dy) < BATTLE.charge.minRun) return false;
  const length = Math.abs(dx) + Math.abs(dy);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  for (let i = 0; i <= length; i++) {
    const x = from.x + stepX * i;
    const y = from.y + stepY * i;
    const index = battlePositionIndex(map, x, y);
    if (map.terrain[index] !== 'plain') return false;
    if (i > 0 && occupied?.has(index)) return false;
  }
  return true;
}

/** The cells a formation would cross to reach (x, y) today, start included, or null when it cannot (B-02). */
export function reachablePath(
  state: V03TacticalBattleState,
  unitId: string,
  x: number,
  y: number,
): BattlePosition[] | null {
  const unit = unitById(state, unitId);
  if (!unit) return null;
  const parents = new Map<number, number>();
  const reachable = getUnitReachableTiles(state, unitId, parents);
  if (!reachable.some((tile) => tile.x === x && tile.y === y)) return null;
  return pathFromParents(state.map, parents, unit, { x, y });
}

function performMove(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  destination: BattlePosition,
): string | null {
  if (unit.acted) return `${unit.name} has already acted today.`;
  if (unit.moved) return `${unit.name} has already moved today.`;
  const parents = unit.facing !== undefined ? new Map<number, number>() : undefined;
  const reachable = getUnitReachableTiles(state, unit.id, parents);
  if (!reachable.some((tile) => tile.x === destination.x && tile.y === destination.y))
    return 'That cell is blocked, impassable, or beyond movement range.';
  const startWater = isOnWater(state.map, unit);
  if (parents) {
    const from = { x: unit.x, y: unit.y };
    const path = pathFromParents(state.map, parents, from, destination);
    const last = path && path.length >= 2 ? path[path.length - 2]! : from;
    unit.facing = facingOfVector(destination.x - last.x, destination.y - last.y, unit.facing!);
    // A move ends any brace; a straight run over plain ground, begun outside contact
    // (a formation in contact cannot move at all), makes a cavalry formation charge.
    unit.braced = false;
    unit.charging = false;
    if (
      UNITS[unit.troopType].charge &&
      path &&
      path.length - 1 === manhattanDistance(from, destination) &&
      chargeRunReady(state.map, undefined, from, destination)
    )
      unit.charging = true;
  }
  unit.x = destination.x;
  unit.y = destination.y;
  unit.moved = true;
  const endWater = isOnWater(state.map, unit);
  append(
    state,
    `${unit.name} moves to (${unit.x}, ${unit.y})${
      !startWater && endWater ? '; now on water, attack −25%, damage received +25%' : ''
    }.`,
    'log.move',
    { unitId: unit.id, x: unit.x, y: unit.y, water: !startWater && endWater },
  );
  checkImmediateOutcome(state);
  return null;
}

function performAttack(
  state: V03TacticalBattleState,
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
): string | null {
  if (source.acted) return `${source.name} has already acted today.`;
  if (source.status === 'confused')
    return `${source.name} is confused and will lose its next action.`;
  if (isRouted(source)) return 'Routed units can only move or hold.';
  if (isBaggage(source)) return 'A baggage train cannot attack.';
  if (source.side === target.side || target.troops <= 0) return 'Choose a living enemy unit.';
  if (!isBattleAttackInRange(state.map, source, target, source.attackRange))
    return `${target.name} is outside the normal attack range.`;
  source.acted = true;
  faceToward(source, target);
  if (isBaggage(target) && baggageUnscreened(state, target)) {
    // No friendly formation stands beside the train: the attack takes it whole.
    state.engaged = true;
    target.troops = 0;
    target.moved = true;
    target.acted = true;
    if (source.facing !== undefined) {
      source.charging = false;
      source.braced = false;
    }
    baggageFell(state, target, source, true);
    checkImmediateOutcome(state);
    settleActivation(state);
    return null;
  }
  const profile = attackOneWay(state, source, target);
  if (source.facing !== undefined) {
    source.charging = false;
    source.braced = false;
  }
  if (isBaggage(target) && target.troops <= 0) baggageFell(state, target, source, false);
  checkImmediateOutcome(state);
  if (
    !state.outcome &&
    !isBaggage(target) &&
    target.troops > 0 &&
    source.troops > 0 &&
    target.status !== 'confused' &&
    !isRouted(target) &&
    profile.counter > 0 &&
    isBattleAttackInRange(state.map, target, source, target.attackRange)
  ) {
    attackOneWay(state, target, source, profile);
    checkImmediateOutcome(state);
  }
  settleActivation(state);
  return null;
}

function applyTacticDamage(
  state: V03TacticalBattleState,
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
  rawDamage: number,
): number {
  const modifiers = waterCombatModifiers(state.map, source, target);
  const casualties = casualtyCountAfterWater(
    target.troops,
    applyWaterDamageModifiers(rawDamage, modifiers) * unmanagedLosses(target),
  );
  recordCombatCasualties(source, target, casualties);
  applyCombatDamage(target, casualties);
  if (casualties > 0)
    target.morale = Math.max(
      MIN_MORALE,
      target.morale -
        Math.min(
          BATTLE.moraleLoss.cap,
          Math.max(
            1,
            Math.ceil(
              (casualties / Math.max(1, target.troops + casualties)) *
                BATTLE.moraleLoss.perCasualtyFraction,
            ),
          ),
        ),
    );
  if (target.troops === 0) {
    target.moved = true;
    target.acted = true;
  }
  return casualties;
}

function performTactic(
  state: V03TacticalBattleState,
  source: TacticalBattleUnit,
  tactic: BattleTactic,
  target: TacticalBattleUnit,
): string | null {
  const reason = tacticReason(state, source, tactic);
  if (reason) return reason;
  if (source.acted) return `${source.name} has already acted today.`;
  const forecast = predictBattleTactic(state, source.id, tactic, target.id);
  if (!forecast) return 'Choose a valid target for this tactic.';
  if (!forecast.inRange) return `${target.name} is outside this tactic's range.`;
  if (
    !getBattleTacticTargets(state, source.id, tactic).some(
      (candidate) => candidate.id === target.id,
    )
  )
    return 'Choose a valid target for this tactic.';

  state.tacticPoints[source.side] -= tacticCost(source, tactic);
  if (tactic !== 'rally') state.engaged = true;
  source.acted = true;
  source.moved = true;
  if (target.side !== source.side) faceToward(source, target);
  if (source.facing !== undefined) {
    source.charging = false;
    source.braced = false;
  }
  const troopsBefore = target.troops,
    moraleBefore = target.morale,
    suppliesBefore = state.supplies[target.side];
  let message: string;
  if (tactic === 'fire') {
    const variation = (TACTICS.fire.rollBase + nextRandomInt(state, TACTICS.fire.rollSpan)) / 100;
    const casualties = applyTacticDamage(
      state,
      source,
      target,
      fireBaseDamage(state, source, target, variation),
    );
    message = `${source.name}'s fire tactic strikes ${target.name}: ${casualties} casualties`;
  } else if (tactic === 'ambush') {
    const variation =
      (TACTICS.ambush.rollBase + nextRandomInt(state, TACTICS.ambush.rollSpan)) / 100;
    const casualties = applyTacticDamage(
      state,
      source,
      target,
      baseDamage(source, target, state.map) * variation * AMBUSH_DAMAGE_MULTIPLIER,
    );
    consumeInspiredHit(source, casualties);
    message = `${source.name} ambushes ${target.name}: ${casualties} casualties`;
  } else if (tactic === 'rockfall') {
    const casualties = applyTacticDamage(state, source, target, rockfallBaseDamage(source, target));
    target.morale = Math.max(MIN_MORALE, target.morale - ROCKFALL_MORALE_LOSS);
    message = `${source.name} drops rocks on ${target.name}: ${casualties} casualties; morale −${ROCKFALL_MORALE_LOSS}`;
  } else if (tactic === 'confuse') {
    const chance = Math.min(
      TACTICS.confuse.max,
      Math.max(TACTICS.confuse.min, TACTICS.confuse.base + source.intellect - target.intellect),
    );
    const succeeded = nextRandomInt(state, 100) < chance;
    if (succeeded) target.status = 'confused';
    message = succeeded
      ? `${source.name} confuses ${target.name}; the unit will lose its next turn (${chance}% chance)`
      : `${target.name} resists ${source.name}'s confusion tactic (${chance}% chance)`;
  } else if (tactic === 'rally') {
    const gain = TACTICS.rally.base + Math.floor(source.intellect / TACTICS.rally.intellectDivisor);
    const priorStatus = target.status;
    const priorMorale = target.morale;
    target.morale = Math.min(100, target.morale + gain);
    target.status = 'inspired';
    message = `${source.name} rallies ${target.name}: morale +${target.morale - priorMorale}; next normal attack, counterattack or Ambush hit +20%${priorStatus === 'confused' ? '; confusion cleared' : ''}`;
  } else {
    const taken = forecast.suppliesTransferred;
    state.supplies[target.side] -= taken;
    state.supplies[source.side] += Math.floor(taken / TACTICS.raidSupply.keptDivisor);
    message = `${source.name} raids ${target.name}'s supplies: ${taken} food seized`;
  }
  if (
    (tactic === 'fire' || tactic === 'ambush' || tactic === 'rockfall') &&
    (forecast.sourceOnWater || forecast.targetOnWater)
  )
    message += ` (water ${forecast.attackMultiplier.toFixed(2)}× attack × ${forecast.incomingDamageMultiplier.toFixed(2)}× damage received)`;
  append(state, `${message}.`, 'log.tactic', {
    sourceId: source.id,
    targetId: target.id,
    tactic,
    casualties: troopsBefore - target.troops,
    morale: target.morale - moraleBefore,
    food: suppliesBefore - state.supplies[target.side],
    success: tactic !== 'confuse' || target.status === 'confused',
    chance: forecast.chance,
  });
  checkImmediateOutcome(state);
  settleActivation(state);
  return null;
}

/**
 * The order of a kind with its target chosen automatically (the minimal order UI): the nearest
 * living enemy to advance on or charge (a charge prefers one reachable down a straight lane),
 * the nearest friendly formation to screen. Null when the kind needs a target that does not exist.
 */
export function defaultBattleOrder(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  kind: BattleOrderKind,
): BattleOrder | null {
  const nearest = (candidates: readonly TacticalBattleUnit[]) =>
    candidates
      .slice()
      .sort(
        (a, b) =>
          manhattanDistance(unit, a) - manhattanDistance(unit, b) || a.id.localeCompare(b.id),
      )[0];
  const enemies = livingUnits(state, otherSide(unit.side));
  switch (kind) {
    case 'advance': {
      const target = nearest(enemies);
      return target ? { kind, target: { unitId: target.id } } : null;
    }
    case 'charge': {
      const target =
        nearest(enemies.filter((enemy) => chargeLane(state, unit, enemy) > 0)) ?? nearest(enemies);
      return target ? { kind, target: { unitId: target.id } } : null;
    }
    case 'screen': {
      const friend = nearest(livingUnits(state, unit.side).filter((ally) => ally.id !== unit.id));
      return friend ? { kind, friendId: friend.id } : null;
    }
    case 'skirmish':
      return { kind };
    default:
      return { kind };
  }
}

/** Why a standing order cannot be given to this unit, or null when it is legal (B-01). */
export function battleOrderError(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  order: BattleOrder,
): string | null {
  const enemy = (id: unknown) => {
    const target = typeof id === 'string' ? unitById(state, id) : undefined;
    return target && target.side !== unit.side ? target : undefined;
  };
  switch (order?.kind) {
    case 'free':
    case 'hold':
    case 'withdraw':
      return null;
    case 'advance': {
      const target = order.target as { unitId?: string; x?: number; y?: number } | undefined;
      if (target && 'unitId' in target)
        return enemy(target.unitId) ? null : 'Choose a living enemy formation.';
      if (
        !target ||
        !Number.isInteger(target.x) ||
        !Number.isInteger(target.y) ||
        target.x! < 0 ||
        target.y! < 0 ||
        target.x! >= state.map.width ||
        target.y! >= state.map.height ||
        battleTerrainAt(state.map, { x: target.x!, y: target.y! }) === 'cliff'
      )
        return 'Choose a cell on the map.';
      return null;
    }
    case 'charge':
      if (unit.troopType !== 'cavalry') return 'Only cavalry can charge.';
      return enemy(order.target?.unitId) ? null : 'Choose a living enemy formation.';
    case 'skirmish':
      if (unit.troopType !== 'archer') return 'Only archers can skirmish.';
      return order.target && !enemy(order.target.unitId)
        ? 'Choose a living enemy formation.'
        : null;
    case 'screen': {
      const friend =
        typeof order.friendId === 'string' ? unitById(state, order.friendId) : undefined;
      return friend && friend.side === unit.side && friend.id !== unit.id
        ? null
        : 'Choose a living friendly formation.';
    }
    case 'pursue':
      return unit.troopType === 'cavalry' ? null : 'Only cavalry can pursue.';
    default:
      return 'Unknown order.';
  }
}

function performSetOrder(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  order: BattleOrder,
): string | null {
  const error = battleOrderError(state, unit, order);
  if (error) return error;
  if (order.kind === 'free') delete unit.order;
  else unit.order = structuredClone(order);
  const target: Record<string, string | number | null> =
    order.kind === 'advance'
      ? 'unitId' in order.target
        ? { targetId: order.target.unitId }
        : { x: order.target.x, y: order.target.y }
      : order.kind === 'charge' || order.kind === 'skirmish'
        ? { targetId: order.target?.unitId ?? null }
        : order.kind === 'screen'
          ? { targetId: order.friendId }
          : {};
  append(state, `${unit.name} is ordered to ${order.kind}.`, 'log.order', {
    unitId: unit.id,
    order: order.kind,
    ...target,
  });
  return null;
}

function performAction(draft: V03TacticalBattleState, action: BattleAction): string | null {
  if (action.type === 'pursuit') return performPursuit(draft, action);
  if (draft.pending) return 'The enemy army has broken: decide the pursuit first.';
  if (action.type === 'retreat') {
    const side = action.side ?? (action.unitId ? unitById(draft, action.unitId)?.side : undefined);
    if (!side) return 'Select a living unit.';
    if (side !== draft.playerSide) return 'You can command only your own units.';
    if (draft.outcome) return 'This battle has ended.';
    if (checkImmediateOutcome(draft) || resolveRout(draft)) return null;
    const winner = otherSide(side);
    draft.outcome = { winner, reason: 'retreat' };
    append(
      draft,
      `${side} forces retreat from the field; ${winner} holds the battlefield.`,
      'log.retreat',
      { side, winner },
    );
    return null;
  }
  const unit = unitById(draft, action.unitId);
  if (!unit) return 'Select a living unit.';
  if (unit.side !== draft.playerSide) return 'You can command only your own units.';
  if (draft.outcome) return 'This battle has ended.';
  if (action.type === 'setOrder') return performSetOrder(draft, unit, action.order);
  if (unit.status === 'confused') return `${unit.name} is confused and will lose its next action.`;
  if (action.type === 'tactic') {
    const target = unitById(draft, action.targetId);
    return target ? performTactic(draft, unit, action.tactic, target) : 'Choose a living target.';
  }
  if (action.type === 'move') return performMove(draft, unit, { x: action.x, y: action.y });
  if (action.type === 'wait') {
    if (unit.acted) return `${unit.name} has already acted today.`;
    holdPosition(unit);
    append(draft, `${unit.name} holds position.`, 'log.wait', { unitId: unit.id });
    return null;
  }
  const target = unitById(draft, action.targetId);
  if (!target) return 'Choose a living target.';
  return performAttack(draft, unit, target);
}

export function applyBattleAction(
  state: V03TacticalBattleState,
  action: BattleAction,
): BattleActionResult {
  if (state.outcome) return { ok: false, state, error: 'This battle has ended.' };
  const draft = structuredClone(state);
  const error = performAction(draft, action);
  if (error) return { ok: false, state, error };
  return { ok: true, state: draft };
}

export interface TacticalActionCandidate {
  action: 'attack' | BattleTactic | 'hold';
  unitId: string;
  targetId?: string;
  score: number;
  outgoing: number;
  retaliation: number;
  finishValue: number;
  supportValue: number;
  supplyValue: number;
  pointCost: number;
}

// Casualty-equivalent policy values, not win probabilities. Mechanical forecasts
// supply the outcomes; these bounded preferences value preservation and scarce points.
const TACTICAL_VALUE = BATTLE_AI.value;

function finishingValue(target: TacticalBattleUnit, casualties: number, moraleChange = 0): number {
  if (casualties >= target.troops)
    return (
      TACTICAL_VALUE.formation +
      Math.min(TACTICAL_VALUE.woundedFinishCap, target.wounded * TACTICAL_VALUE.wounded)
    );
  const loss =
    casualties > 0
      ? Math.min(
          BATTLE.moraleLoss.cap,
          Math.max(
            1,
            Math.ceil((casualties / target.troops) * BATTLE.moraleLoss.perCasualtyFraction),
          ),
        )
      : 0;
  return !isRouted(target) && target.morale - loss + moraleChange < ROUTED_MORALE
    ? TACTICAL_VALUE.rout
    : 0;
}

function potentialDamage(state: V03TacticalBattleState, unit: TacticalBattleUnit): number {
  if (isRouted(unit) || unit.status === 'confused' || isBaggage(unit)) return 0;
  let present = 0,
    future = 0;
  for (const enemy of livingUnits(state, otherSide(unit.side))) {
    const casualties = estimateDamage(unit, enemy, state.map).casualties;
    const damage = casualties + finishingValue(enemy, casualties);
    if (isBattleAttackInRange(state.map, unit, enemy, unit.attackRange))
      present = Math.max(present, damage);
    future = Math.max(future, damage);
  }
  // When no shot exists yet, discount a possible later exchange instead of
  // presenting an unreachable attack as a currently legal action.
  return present || future * TACTICAL_VALUE.noShotDiscount;
}

function tacticOpportunityCost(points: number, cost: number): number {
  const remaining = points - cost;
  const regenerationDays = cost / BATTLE_TACTIC_POINT_REGEN;
  const scarcity = remaining < BATTLE_TACTIC_POINT_REGEN ? TACTICAL_VALUE.pointScarcity : 1;
  return TACTICAL_VALUE.pointRecoveryDay * regenerationDays * scarcity;
}

/**
 * A formation leader's temperament under AI command, from -1 (cautious) to 1
 * (aggressive): force against intellect, leaning aggressive when fierce (PF-BA-01).
 * A Lü Bu charges; a Zhuge Liang holds ground. Deterministic, so a battle still replays.
 */
export function battleTemperament(
  unit: Pick<TacticalBattleUnit, 'force' | 'intellect' | 'fierce'>,
): number {
  return Math.max(
    -1,
    Math.min(
      1,
      (unit.force - unit.intellect) / BATTLE_AI.temperament.forceIntellectDivisor +
        (unit.fierce ? BATTLE_AI.temperament.fierceBonus : 0),
    ),
  );
}

/** Appetite for spending tactic points, from -1 to 1: intellect, plus the cunning trait. */
function tacticAppetite(unit: Pick<TacticalBattleUnit, 'intellect' | 'cunning'>): number {
  return Math.max(
    -1,
    Math.min(
      1,
      (unit.intellect - BATTLE_AI.temperament.appetiteIntellectBase) /
        BATTLE_AI.temperament.appetiteIntellectDivisor +
        (unit.cunning ? BATTLE_AI.temperament.cunningBonus : 0),
    ),
  );
}

/** Weight of next-exchange exposure: 0.65 for a balanced leader, 0.42–0.88 by temperament. */
function exposureWeight(unit: TacticalBattleUnit): number {
  return isRouted(unit)
    ? 1
    : BATTLE_AI.temperament.exposureBase *
        (1 - BATTLE_AI.temperament.exposureSwing * battleTemperament(unit));
}

/** Pure legal alternatives in the unit's current position. Stable ties prefer
 * lower spending, then target/action identity. This never consumes RNG or actions.
 */
export function evaluateBattleActions(
  state: V03TacticalBattleState,
  unitId: string,
  rationRemainders: BattleRationRemainders = {},
): TacticalActionCandidate[] {
  return battleActionCandidates(state, unitId, rationRemainders);
}

function battleActionCandidates(
  state: V03TacticalBattleState,
  unitId: string,
  rationRemainders: BattleRationRemainders,
  capabilities?: Map<string, number>,
): TacticalActionCandidate[] {
  const unit = unitById(state, unitId);
  if (!unit || unit.acted || unit.status === 'confused' || state.outcome) return [];
  const capability = (target: TacticalBattleUnit) => {
    if (!capabilities) return potentialDamage(state, target);
    const key = `${target.id}:${target.x}:${target.y}:${target.troops}:${target.morale}:${target.status}`;
    let value = capabilities.get(key);
    if (value === undefined) {
      value = potentialDamage(state, target);
      capabilities.set(key, value);
    }
    return value;
  };
  const candidate = (
    action: TacticalActionCandidate['action'],
    targetId?: string,
  ): TacticalActionCandidate => ({
    action,
    unitId,
    targetId,
    score: 0,
    outgoing: 0,
    retaliation: 0,
    finishValue: 0,
    supportValue: 0,
    supplyValue: 0,
    pointCost: 0,
  });
  const choices = [candidate('hold')];
  const finishing = (target: TacticalBattleUnit, casualties: number, moraleChange = 0) => {
    const value = finishingValue(target, casualties, moraleChange);
    const endsBattle =
      casualties >= target.troops &&
      !isBaggage(target) &&
      livingLine(state, otherSide(unit.side)).length === 1;
    return (
      value +
      (endsBattle
        ? TACTICAL_VALUE.battleEndBonus +
          livingUnits(state, unit.side).reduce(
            (sum, entry) =>
              sum + entry.troops * TACTICAL_VALUE.battleEndTroopWeight + entry.wounded,
            0,
          )
        : 0)
    );
  };
  const preserve =
    TACTICAL_VALUE.retaliation +
    (unit.troopExperience / PERSONNEL.troopExperience.max) * BATTLE_AI.preserve.experience;
  for (const target of getUnitAttackTargets(state, unitId)) {
    const forecast = predictBattleAttack(state, unitId, target.id)!;
    const action = candidate('attack', target.id);
    action.outgoing = forecast.estimatedCasualties ?? 0;
    action.retaliation = forecast.counterattack.estimatedCasualties ?? 0;
    action.finishValue = finishing(target, action.outgoing);
    if (isBaggage(target) && (forecast.captures || action.outgoing >= target.troops))
      action.finishValue += baggageFallValue(state, target);
    if (action.retaliation >= unit.troops)
      action.finishValue -= TACTICAL_VALUE.formation + unit.wounded * TACTICAL_VALUE.woundedWeight;
    action.score = action.outgoing - action.retaliation * preserve + action.finishValue;
    choices.push(action);
  }
  for (const entry of getAvailableBattleTactics(state, unitId)) {
    if (!entry.allowed) continue;
    for (const target of getBattleTacticTargets(state, unitId, entry.tactic)) {
      const forecast = predictBattleTactic(state, unitId, entry.tactic, target.id);
      if (!forecast?.inRange) continue;
      const action = candidate(entry.tactic, target.id);
      action.pointCost =
        tacticOpportunityCost(state.tacticPoints[unit.side], entry.cost) *
        (1 - BATTLE_AI.temperament.appetiteCostSwing * tacticAppetite(unit));
      if (entry.tactic === 'rally') {
        const restored = {
          ...target,
          morale: Math.min(100, target.morale + forecast.moraleChange),
          status: 'inspired' as const,
        };
        const opportunity =
          target.acted || target.id === unit.id
            ? state.day < state.dayLimit
              ? BATTLE_AI.rally.spentTargetOpportunity
              : 0
            : 1;
        // Rested formations recover to 80 on their own, so only morale restored below
        // that protects against wavering and rout; extra damage is in the capability term.
        const restoredMorale =
          Math.min(BATTLE_MORALE_RECOVERY_CAP, restored.morale) -
          Math.min(BATTLE_MORALE_RECOVERY_CAP, target.morale);
        action.supportValue =
          opportunity * Math.max(0, capability(restored) - capability(target)) +
          (restoredMorale / 100) *
            (target.troops + target.wounded * BATTLE_AI.rally.woundedWeight) *
            BATTLE_AI.rally.moraleScale;
        if (isRouted(target) && !isRouted(restored))
          action.supportValue += target.troops * BATTLE_AI.rally.routRecovery;
      } else if (entry.tactic === 'confuse') {
        if (
          !capabilities &&
          target.status !== 'confused' &&
          (!target.acted || state.day < state.dayLimit)
        )
          action.supportValue = (forecast.chance / 100) * potentialDamage(state, target);
      } else if (entry.tactic === 'raidSupply') {
        const horizon = Math.min(BATTLE_AI.raidSupply.horizonDays, state.dayLimit - state.day + 1);
        const enemy = forecastBattleRations(state, target.side, rationRemainders[target.side]);
        const own = forecastBattleRations(state, unit.side, rationRemainders[unit.side]);
        const food = forecast.suppliesTransferred;
        const hungerDays = (coverage: number) => Math.max(0, horizon - coverage);
        const denied =
          enemy.dailyFood > 0
            ? hungerDays(Math.max(0, enemy.supplyDays - food / enemy.dailyFood)) -
              hungerDays(enemy.supplyDays)
            : 0;
        const relieved =
          own.dailyFood > 0
            ? hungerDays(own.supplyDays) -
              hungerDays(
                own.supplyDays + Math.floor(food / TACTICS.raidSupply.keptDivisor) / own.dailyFood,
              )
            : 0;
        const personnel = (side: BattleSide) =>
          state.units
            .filter((entry) => entry.side === side)
            .reduce(
              (sum, entry) => sum + entry.troops + entry.wounded * TACTICAL_VALUE.woundedWeight,
              0,
            );
        action.supplyValue =
          (denied * personnel(target.side) + relieved * personnel(unit.side)) *
          BATTLE_AI.raidSupply.personDayValue;
      } else {
        action.outgoing = (forecast.minCasualties + forecast.maxCasualties) / 2;
        action.finishValue = finishing(target, action.outgoing, forecast.moraleChange);
      }
      action.score =
        action.outgoing +
        action.finishValue +
        action.supportValue +
        action.supplyValue -
        action.pointCost;
      choices.push(action);
    }
  }
  return choices.sort(
    (a, b) =>
      b.score - a.score ||
      a.pointCost - b.pointCost ||
      (a.targetId ?? '').localeCompare(b.targetId ?? '') ||
      a.action.localeCompare(b.action),
  );
}

export interface TacticalTurnCandidate extends TacticalActionCandidate {
  x: number;
  y: number;
  moveCost: number;
  exposure: number;
  progressValue: number;
  blockingPenalty: number;
}
interface TacticalTurnContext {
  enemies: TacticalBattleUnit[];
  attackFields: Map<string, Map<number, BattlePosition>>;
  routes: Map<string, number[]>;
  capabilities: Map<string, number>;
  fields: Map<string, Map<number, BattlePosition>>;
  timeoutWinner: BattleSide | null;
  occupied: Map<number, TacticalBattleUnit>;
  /** Standing orders constrain the evaluation unless this is false (default true). */
  ordersActive?: boolean;
}

/** Reachable attacks on the enemy's next activation, with actual movement, ZOC,
 * occupied cells and terrain. Rebuilt after every committed formation action.
 * It is a one-ply estimate from current occupancy, not a multi-unit future simulation.
 */
function tacticalTurnContext(
  state: V03TacticalBattleState,
  side: BattleSide,
  routes = new Map<string, number[]>(),
  fields = new Map<string, Map<number, BattlePosition>>(),
): TacticalTurnContext {
  const enemies = livingUnits(state, otherSide(side));
  const attackFields = new Map<string, Map<number, BattlePosition>>();
  for (const enemy of enemies) attackFields.set(enemy.id, enemyAttackField(state, enemy, fields));
  return {
    enemies,
    attackFields,
    routes,
    fields,
    capabilities: new Map(),
    timeoutWinner: getBattleTimeoutOutcome(state).winner,
    occupied: new Map(
      livingUnits(state).map((unit) => [battlePositionIndex(state.map, unit.x, unit.y), unit]),
    ),
  };
}

function enemyAttackField(
  state: V03TacticalBattleState,
  enemy: TacticalBattleUnit,
  cache: Map<string, Map<number, BattlePosition>>,
): Map<number, BattlePosition> {
  const field = new Map<number, BattlePosition>();
  if (
    isRouted(enemy) ||
    isBaggage(enemy) ||
    enemy.status === 'confused' ||
    (enemy.acted && state.day >= state.dayLimit)
  )
    return field;
  // Occupancy and ZOC outside the movement radius cannot affect this field.
  // Damage, points and remote moves also leave it intact; reuse it by geometry
  // across formation commits, including the views that vacate one formation.
  const radius = unitMovementBudget(enemy) + 1;
  const key =
    `${enemy.id}:${enemy.x}:${enemy.y}:${enemy.troopType}:${enemy.attackRange}|` +
    state.units
      .filter((unit) => unit.troops > 0 && manhattanDistance(unit, enemy) <= radius)
      .map((unit) => `${unit.id}:${unit.x}:${unit.y}:${unit.side}`)
      .join('|');
  const known = cache.get(key);
  if (known) return known;
  const refreshed = { ...enemy, moved: false, acted: false };
  const view = {
    ...state,
    units: state.units.map((entry) => (entry.id === enemy.id ? refreshed : entry)),
  };
  const positions = [enemy, ...getUnitReachableTiles(view, enemy.id)];
  for (const position of positions) {
    for (let dy = -enemy.attackRange; dy <= enemy.attackRange; dy++) {
      const span = enemy.attackRange - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = position.x + dx,
          y = position.y + dy;
        if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) continue;
        const index = battlePositionIndex(state.map, x, y);
        if (state.map.terrain[index] === 'cliff') continue;
        const previous = field.get(index);
        if (
          !previous ||
          (isOnWater(state.map, previous) && !isOnWater(state.map, position)) ||
          (isOnWater(state.map, previous) === isOnWater(state.map, position) &&
            manhattanDistance(position, { x, y }) > manhattanDistance(previous, { x, y }))
        )
          field.set(index, position);
      }
    }
  }
  cache.set(key, field);
  return field;
}

function tacticalRoute(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  context: TacticalTurnContext,
): number[] {
  const signature = context.enemies.map((entry) => `${entry.id}:${entry.x}:${entry.y}`).join('|');
  const key = `${unit.troopType}:${unit.attackRange}:${signature}`;
  const known = context.routes.get(key);
  if (known) return known;
  const occupied = new Set(
    context.enemies.map((entry) => battlePositionIndex(state.map, entry.x, entry.y)),
  );
  const goals: BattlePosition[] = [];
  const seen = new Set<number>();
  for (const enemy of context.enemies)
    for (let dy = -unit.attackRange; dy <= unit.attackRange; dy++) {
      const span = unit.attackRange - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const x = enemy.x + dx,
          y = enemy.y + dy;
        if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) continue;
        const index = battlePositionIndex(state.map, x, y);
        if (seen.has(index) || occupied.has(index) || state.map.terrain[index] === 'cliff')
          continue;
        seen.add(index);
        goals.push({ x, y });
      }
    }
  // Friendly formations may move later; use terrain/enemy occupancy for the long
  // route, and enforce all occupied cells on the actual immediate move below.
  const route = getBattleRouteDistanceField(state.map, unit, goals, context.enemies);
  context.routes.set(key, route);
  return route;
}

function nextEnemyDamage(
  state: V03TacticalBattleState,
  enemy: TacticalBattleUnit,
  target: TacticalBattleUnit,
  context: TacticalTurnContext,
): number {
  const position = context.attackFields
    .get(enemy.id)
    ?.get(battlePositionIndex(state.map, target.x, target.y));
  return position
    ? estimateDamage(enemyAtFiringCell(state, enemy, position, context), target, state.map)
        .casualties
    : 0;
}

/** The enemy as it would stand at a firing cell, carrying the charge its run there would give. */
function enemyAtFiringCell(
  state: V03TacticalBattleState,
  enemy: TacticalBattleUnit,
  position: BattlePosition,
  context: Pick<TacticalTurnContext, 'occupied'>,
): TacticalBattleUnit {
  if (
    enemy.facing === undefined ||
    UNITS[enemy.troopType].charge === null ||
    !chargeRunReady(state.map, context.occupied, enemy, position)
  )
    return { ...enemy, ...position };
  return { ...enemy, ...position, charging: true };
}

/**
 * Damage and return hits from the two strongest likely attackers (PF-BA-04).
 * Summing every enemy able to reach a cell overstated edge-of-reach risk and
 * stalled approaches; in practice two formations rarely all strike one target.
 */
function strongestTwo(
  replies: readonly { damage: number; returned: number }[],
): [damage: number, returned: number] {
  let first = { damage: 0, returned: 0 },
    second = first;
  for (const reply of replies)
    if (reply.damage > first.damage) {
      second = first;
      first = reply;
    } else if (reply.damage > second.damage) second = reply;
  return [first.damage + second.damage, first.returned + second.returned];
}

const CARDINAL_STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

function blockingPenalty(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  position: BattlePosition,
  context: TacticalTurnContext,
): number {
  let penalty = 0;
  for (const [dx, dy] of CARDINAL_STEPS) {
    const x = position.x + dx,
      y = position.y + dy;
    if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) continue;
    const ally = context.occupied.get(battlePositionIndex(state.map, x, y));
    if (!ally || ally.id === unit.id || ally.side !== unit.side || ally.acted) continue;
    let exits = 0;
    for (const [ax, ay] of CARDINAL_STEPS) {
      const tx = ally.x + ax,
        ty = ally.y + ay;
      if (tx < 0 || ty < 0 || tx >= state.map.width || ty >= state.map.height) continue;
      const index = battlePositionIndex(state.map, tx, ty);
      if (state.map.terrain[index] === 'cliff') continue;
      const occupant = context.occupied.get(index);
      if (!occupant || occupant.id === unit.id) exits++;
    }
    if (exits <= 1) penalty += BATTLE_AI.blocking.boxedIn;
    else if (exits === 2) penalty += BATTLE_AI.blocking.narrowExit;
  }
  return penalty;
}

// ---------------------------------------------------------------------------
// Standing orders (B-01). An order never changes a damage rule: it filters the
// destination cells and actions the evaluator may choose and re-weights progress
// and exposure. A free (or absent) order leaves the evaluation untouched.
// ---------------------------------------------------------------------------

const FREE_ORDER: BattleOrder = { kind: 'free' };

/** What an order does to the evaluation of one formation's day. */
export interface OrderConstraint {
  /** Multiplies the progress term of the turn score. */
  progressWeight: number;
  /** Multiplies the exposure term of the turn score. */
  exposureWeight: number;
  /** Route distance toward the order's goal; replaces the nearest-enemy route for progress. */
  distance?: number[];
  /** Charge: the formation attacks this target whatever the score. */
  forcedTarget?: string;
  /** The destination cells (the current cell included) the order permits. Empty means stay. */
  selectCells<T extends BattlePosition>(cells: readonly T[]): T[];
  /** Whether the order permits this action from this cell. Holding is always permitted. */
  actionAllowed(action: TacticalActionCandidate, x: number, y: number): boolean;
  /** Narrows the sorted candidate list once all positions have been scored. */
  filterChoices?<T extends TacticalActionCandidate>(choices: T[]): T[];
}

export type OrderProblem = 'targetDead' | 'friendDead' | 'noRoute';
export interface ImpossibleOrder {
  unitId: string;
  order: BattleOrderKind;
  reason: OrderProblem;
}

function orderRouteField(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  goal: { unitId: string } | BattlePosition,
  enemies: readonly TacticalBattleUnit[],
  routes: Map<string, number[]>,
): number[] {
  const key = `order:${unit.troopType}:${unit.attackRange}:${
    'unitId' in goal ? goal.unitId : `${goal.x},${goal.y}`
  }:${enemies.map((entry) => `${entry.id}:${entry.x}:${entry.y}`).join('|')}`;
  const known = routes.get(key);
  if (known) return known;
  const goals: BattlePosition[] = [];
  if ('unitId' in goal) {
    const target = enemies.find((entry) => entry.id === goal.unitId);
    if (target) {
      const occupied = new Set(
        enemies.map((entry) => battlePositionIndex(state.map, entry.x, entry.y)),
      );
      for (let dy = -unit.attackRange; dy <= unit.attackRange; dy++) {
        const span = unit.attackRange - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const x = target.x + dx,
            y = target.y + dy;
          if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) continue;
          const index = battlePositionIndex(state.map, x, y);
          if (occupied.has(index) || state.map.terrain[index] === 'cliff') continue;
          goals.push({ x, y });
        }
      }
    }
  } else goals.push(goal);
  const field = getBattleRouteDistanceField(state.map, unit, goals, enemies);
  routes.set(key, field);
  return field;
}

/** The nearest routed enemy a pursuing formation chases (ties by id), if any. */
function nearestRoutedEnemy(
  unit: TacticalBattleUnit,
  enemies: readonly TacticalBattleUnit[],
): TacticalBattleUnit | undefined {
  let best: TacticalBattleUnit | undefined;
  let bestDistance = Infinity;
  for (const enemy of enemies) {
    if (!isRouted(enemy)) continue;
    const distance = manhattanDistance(unit, enemy);
    if (distance < bestDistance || (distance === bestDistance && enemy.id < best!.id)) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

/** Why the unit's standing order cannot be carried out now, or null. */
function orderProblem(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  routes: Map<string, number[]> = new Map(),
): OrderProblem | null {
  const order = unit.order;
  if (!order) return null;
  if (order.kind === 'screen') {
    const friend = unitById(state, order.friendId);
    return friend && friend.side === unit.side && friend.id !== unit.id ? null : 'friendDead';
  }
  if (order.kind !== 'advance' && order.kind !== 'charge') return null;
  const enemies = livingUnits(state, otherSide(unit.side));
  const goal = order.target;
  if ('unitId' in goal && !enemies.some((entry) => entry.id === goal.unitId)) return 'targetDead';
  const field = orderRouteField(state, unit, goal, enemies, routes);
  return Number.isFinite(field[battlePositionIndex(state.map, unit.x, unit.y)]!) ? null : 'noRoute';
}

/** Orders of the side's living formations that can no longer be carried out (target dead, no route, friend dead). */
export function impossibleOrders(
  state: V03TacticalBattleState,
  side: BattleSide,
): ImpossibleOrder[] {
  const routes = new Map<string, number[]>();
  const found: ImpossibleOrder[] = [];
  for (const unit of livingUnits(state, side)) {
    const reason = orderProblem(state, unit, routes);
    if (reason && unit.order) found.push({ unitId: unit.id, order: unit.order.kind, reason });
  }
  return found;
}

const nearestEnemyOf = (cell: BattlePosition, enemies: readonly TacticalBattleUnit[]) => {
  let best = Infinity;
  for (const enemy of enemies) best = Math.min(best, manhattanDistance(cell, enemy));
  return best;
};

/**
 * The constraint a formation's standing order puts on its evaluation, or null for
 * a free formation, a routed one, or an order that cannot be carried out (it then
 * acts free until the order lapses).
 */
export function orderConstraintFor(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  context?: Pick<TacticalTurnContext, 'routes'>,
): OrderConstraint | null {
  const order = unit.order;
  if (!order || order.kind === 'free' || isRouted(unit)) return null;
  const enemies = livingUnits(state, otherSide(unit.side));
  if (!enemies.length) return null;
  const routes = context?.routes ?? new Map<string, number[]>();
  if (orderProblem(state, unit, routes)) return null;
  const base = {
    progressWeight: ORDERS.progressWeight[order.kind],
    exposureWeight: ORDERS.exposureWeight[order.kind],
  };
  const here = <T extends BattlePosition>(cells: readonly T[]): T[] =>
    cells.filter((cell) => cell.x === unit.x && cell.y === unit.y);
  const preserve =
    TACTICAL_VALUE.retaliation +
    (unit.troopExperience / PERSONNEL.troopExperience.max) * BATTLE_AI.preserve.experience;
  const isHold = (action: TacticalActionCandidate) => action.action === 'hold';
  const targetOf = (action: TacticalActionCandidate) =>
    action.targetId ? unitById(state, action.targetId) : undefined;
  // Moves strictly closer (by route) to a goal than the current cell, or stays.
  const closer = (field: number[]) => {
    const at = (cell: BattlePosition) => field[battlePositionIndex(state.map, cell.x, cell.y)]!;
    const now = at(unit);
    return <T extends BattlePosition>(cells: readonly T[]) =>
      cells.filter((cell) => (cell.x === unit.x && cell.y === unit.y) || at(cell) < now);
  };
  switch (order.kind) {
    case 'advance':
    case 'pursue': {
      const goal =
        order.kind === 'advance'
          ? order.target
          : (() => {
              const chased = nearestRoutedEnemy(unit, enemies);
              return chased ? { unitId: chased.id } : null;
            })();
      // Pursuit with nothing to chase behaves as free.
      if (!goal) return null;
      const field = orderRouteField(state, unit, goal, enemies, routes);
      const goalUnit = 'unitId' in goal ? goal.unitId : null;
      const select = closer(field);
      return {
        ...base,
        distance: field,
        selectCells: select,
        actionAllowed: (action, x, y) => {
          if (order.kind === 'pursue' || action.action !== 'attack') return true;
          const adjacent =
            goalUnit !== null &&
            action.targetId === goalUnit &&
            manhattanDistance({ x, y }, unitById(state, goalUnit) ?? { x: -9, y: -9 }) === 1;
          return adjacent || action.outgoing - action.retaliation * preserve >= 0;
        },
        filterChoices:
          order.kind === 'pursue'
            ? (choices) => {
                const routedHits = choices.filter(
                  (choice) =>
                    choice.action === 'attack' && isRouted(targetOf(choice) ?? { morale: 100 }),
                );
                return routedHits.length ? routedHits : choices;
              }
            : undefined,
      };
    }
    case 'hold':
      return {
        ...base,
        selectCells: here,
        actionAllowed: () => true,
      };
    case 'skirmish': {
      const pool = order.target
        ? enemies.filter((entry) => entry.id === order.target?.unitId)
        : enemies;
      const watched = pool.length ? pool : enemies;
      const pinned = enemies.some((enemy) => manhattanDistance(enemy, unit) === 1);
      const { minDistance, maxDistance } = ORDERS.skirmish;
      return {
        ...base,
        selectCells: <T extends BattlePosition>(cells: readonly T[]): T[] => {
          if (pinned) return here(cells);
          const dist = (cell: BattlePosition) => nearestEnemyOf(cell, watched);
          const band = cells.filter(
            (cell) => dist(cell) >= minDistance && dist(cell) <= maxDistance,
          );
          if (band.length) {
            const far = band.filter((cell) => dist(cell) === maxDistance);
            return unit.attackRange >= maxDistance && far.length ? far : band;
          }
          const now = dist(unit);
          // Out of the band: close in without entering contact, or back away from it.
          const fix =
            now > maxDistance
              ? cells.filter((cell) => dist(cell) >= minDistance && dist(cell) < now)
              : cells.filter((cell) => dist(cell) > now);
          if (!fix.length) return here(cells);
          const best = now > maxDistance ? Math.min(...fix.map(dist)) : Math.max(...fix.map(dist));
          return fix.filter((cell) => dist(cell) === best);
        },
        actionAllowed: (action, x, y) => {
          if (isHold(action) || pinned) return true;
          const target = targetOf(action);
          return !target || manhattanDistance({ x, y }, target) >= minDistance;
        },
      };
    }
    case 'charge': {
      const field = orderRouteField(state, unit, order.target, enemies, routes);
      return {
        ...base,
        distance: field,
        forcedTarget: order.target.unitId,
        selectCells: <T extends BattlePosition>(cells: readonly T[]): T[] => {
          const at = (cell: BattlePosition) =>
            field[battlePositionIndex(state.map, cell.x, cell.y)]!;
          const best = Math.min(...cells.map(at));
          return cells.filter((cell) => at(cell) === best);
        },
        actionAllowed: (action) => isHold(action) || action.targetId === order.target.unitId,
        filterChoices: (choices) => {
          const strikes = choices.filter(
            (choice) => choice.action === 'attack' && choice.targetId === order.target.unitId,
          );
          return strikes.length ? strikes : choices;
        },
      };
    }
    case 'screen': {
      const friend = unitById(state, order.friendId)!;
      return {
        ...base,
        selectCells: <T extends BattlePosition>(cells: readonly T[]): T[] => {
          const gap = (cell: BattlePosition) => manhattanDistance(cell, friend);
          const best = Math.min(...cells.map(gap));
          return cells.filter((cell) => gap(cell) === Math.max(1, best));
        },
        actionAllowed: (action) => {
          if (isHold(action)) return true;
          const target = targetOf(action);
          return (
            action.action === 'attack' &&
            !!target &&
            manhattanDistance(target, friend) <= Math.max(1, unit.attackRange)
          );
        },
      };
    }
    case 'withdraw': {
      const away = (cell: BattlePosition) =>
        enemies.reduce((sum, enemy) => sum + manhattanDistance(cell, enemy), 0);
      const now = away(unit);
      const zone = new Set(
        getEnemyZoneOfControl(state, otherSide(unit.side)).map((cell) =>
          battlePositionIndex(state.map, cell.x, cell.y),
        ),
      );
      return {
        ...base,
        selectCells: (cells) =>
          cells.filter(
            (cell) => away(cell) > now && !zone.has(battlePositionIndex(state.map, cell.x, cell.y)),
          ),
        actionAllowed: isHold,
      };
    }
  }
}

/** Frees the orders that cannot be carried out any more, logging each lapse. */
function lapseOrders(
  state: V03TacticalBattleState,
  units: readonly TacticalBattleUnit[],
  routes: Map<string, number[]>,
): void {
  for (const unit of units) {
    if (!unit.order || unit.order.kind === 'free') continue;
    const reason = orderProblem(state, unit, routes);
    if (!reason) continue;
    append(
      state,
      `${unit.name} can no longer carry out its ${unit.order.kind} order.`,
      'log.orderLapsed',
      {
        unitId: unit.id,
        order: unit.order.kind,
        reason,
      },
    );
    delete unit.order;
  }
}

/** A straight lane of plain, empty cells from a cavalry formation to an enemy, and its length. */
function chargeLane(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  target: TacticalBattleUnit,
): number {
  const dx = Math.sign(target.x - unit.x),
    dy = Math.sign(target.y - unit.y);
  if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return 0;
  const length = manhattanDistance(unit, target) - 1;
  for (let step = 1; step <= length; step++) {
    const cell = { x: unit.x + dx * step, y: unit.y + dy * step };
    if (
      battleTerrainAt(state.map, cell) !== 'plain' ||
      state.units.some((entry) => entry.troops > 0 && entry.x === cell.x && entry.y === cell.y)
    )
      return 0;
  }
  return length;
}

function assignOrdersInPlace(state: V03TacticalBattleState, side: BattleSide): void {
  const withdraw = battleWithdrawalDue(state, side);
  const enemies = livingUnits(state, otherSide(side));
  const own = livingUnits(state, side);
  const { chargeMinLane, skirmishInfantryRange } = ORDERS.ai;
  const idle = (unit: TacticalBattleUnit) => isRouted(unit) || unit.status === 'confused';
  // Baggage (B-04): the owner keeps its nearest line formation screening the train while an enemy
  // line formation is close; the enemy sends its nearest cavalry after an unscreened train in reach.
  const train = own.find(isBaggage);
  const near = (cell: BattlePosition) => (a: TacticalBattleUnit, b: TacticalBattleUnit) =>
    manhattanDistance(a, cell) - manhattanDistance(b, cell) || a.id.localeCompare(b.id);
  let screenerId: string | undefined;
  if (
    train &&
    !withdraw &&
    enemies.some(
      (enemy) => !isBaggage(enemy) && manhattanDistance(enemy, train) <= BAGGAGE.screenEnemyRange,
    )
  ) {
    const line = own.filter((unit) => !isBaggage(unit) && !idle(unit));
    screenerId = (
      line.find((unit) => unit.order?.kind === 'screen' && unit.order.friendId === train.id) ??
      line.sort(near(train))[0]
    )?.id;
  }
  const enemyTrain = enemies.find(isBaggage);
  const sortie =
    enemyTrain && !withdraw && baggageUnscreened(state, enemyTrain)
      ? own
          .filter((unit) => unit.troopType === 'cavalry' && !isBaggage(unit) && !idle(unit))
          .sort(near(enemyTrain))[0]
      : undefined;
  const sortieId =
    sortie && manhattanDistance(sortie, enemyTrain!) <= BAGGAGE.sortieRange ? sortie.id : undefined;
  for (const unit of own) {
    let order: BattleOrder = FREE_ORDER;
    if (isBaggage(unit)) order = withdraw ? { kind: 'withdraw' } : FREE_ORDER;
    else if (withdraw) order = { kind: 'withdraw' };
    else if (unit.acted || isRouted(unit) || unit.status === 'confused') order = FREE_ORDER;
    else if (unit.id === screenerId) order = { kind: 'screen', friendId: train!.id };
    else if (unit.id === sortieId) order = { kind: 'advance', target: { unitId: enemyTrain!.id } };
    else if (unit.troopType === 'cavalry' && unit.fierce) {
      let best: TacticalBattleUnit | undefined;
      let bestLane = Infinity;
      for (const enemy of enemies) {
        if (enemy.troopType !== 'archer' && !isWavering(enemy)) continue;
        const lane = chargeLane(state, unit, enemy);
        if (
          lane >= chargeMinLane &&
          lane <= unitMovementBudget(unit) &&
          (lane < bestLane || (lane === bestLane && enemy.id < best!.id))
        ) {
          best = enemy;
          bestLane = lane;
        }
      }
      if (best) order = { kind: 'charge', target: { unitId: best.id } };
    } else if (
      unit.troopType === 'archer' &&
      own.some(
        (ally) =>
          ally.troopType === 'infantry' && manhattanDistance(ally, unit) <= skirmishInfantryRange,
      )
    )
      order = { kind: 'skirmish' };
    if (order.kind === 'free') {
      if (unit.order) delete unit.order;
    } else unit.order = order;
  }
}

/**
 * The enemy AI's order layer: withdraw when the side's withdrawal is due; charge for a
 * fierce cavalry formation with a straight lane of plain cells to an archer or wavering
 * formation; skirmish for archers backed by infantry within two cells; otherwise free.
 * Orders are recomputed from the rules each turn, so they last while their rule holds.
 */
export function aiAssignOrders(
  state: V03TacticalBattleState,
  side: BattleSide,
): V03TacticalBattleState {
  const draft = structuredClone(state);
  assignOrdersInPlace(draft, side);
  return draft;
}

/** At most six legal destination cells including the current cell. Full action
 * comparisons run only there; cheap damage/route/risk terms shortlist the moves.
 */
export function evaluateBattleTurn(
  state: V03TacticalBattleState,
  unitId: string,
  rationRemainders: BattleRationRemainders = {},
  context?: TacticalTurnContext,
): TacticalTurnCandidate[] {
  const unit = unitById(state, unitId);
  if (!unit || unit.acted || unit.status === 'confused' || state.outcome) return [];
  const turn = context ?? tacticalTurnContext(state, unit.side);
  const routed = isRouted(unit);
  const route = routed ? null : tacticalRoute(state, unit, turn);
  const remainingDays = state.dayLimit - state.day + 1;
  const behind = turn.timeoutWinner !== unit.side;
  // A side behind on the timeout count starts pressing in the last ~30% of the
  // limit (PF-BA-02; it was the last 3 days), so river standoffs and raids resolve.
  const urgent =
    behind &&
    remainingDays <=
      Math.max(
        BATTLE_AI.urgency.minDays,
        Math.ceil(state.dayLimit * BATTLE_AI.urgency.limitFraction),
      );
  const temperament = battleTemperament(unit);
  const order = turn.ordersActive === false ? null : orderConstraintFor(state, unit, turn);
  const exposureFactor = exposureWeight(unit) * (order ? order.exposureWeight : 1);
  // A full move toward contact is worth at most roughly one normal hit. Scaling
  // by capability lets viable infantry cross an archer's firing zone without
  // treating a handful of route cells as more valuable than an army's survival.
  // Aggressive leaders value closing in more, cautious ones less (PF-BA-01).
  const approachHit = Math.max(
    0,
    ...turn.enemies.map((enemy) => estimateDamage(unit, enemy, state.map).casualties),
  );
  const approachValue =
    remainingDays === 1
      ? 0
      : Math.max(
          BATTLE_AI.approach.floor,
          (approachHit * BATTLE_AI.approach.hitFraction) / unitMovementBudget(unit),
        ) *
        (1 + BATTLE_AI.approach.temperamentSwing * temperament) *
        (!behind && remainingDays <= BATTLE_AI.approach.finalDays
          ? BATTLE_AI.approach.finalDaysFactor
          : 1);
  const progressField = order?.distance ?? route;
  const progressWeight = order ? order.progressWeight : 1;
  const currentRoute = progressField?.[battlePositionIndex(state.map, unit.x, unit.y)] ?? 0;
  const rescuers = routed
    ? livingUnits(state, unit.side).filter(
        (entry) =>
          entry.id !== unit.id &&
          getAvailableBattleTactics(state, entry.id).some(
            (tactic) => tactic.tactic === 'rally' && tactic.allowed,
          ),
      )
    : [];
  const rescueDistance = (position: BattlePosition) =>
    rescuers.length
      ? Math.min(
          ...rescuers.map((entry) =>
            Math.max(0, manhattanDistance(entry, position) - tacticRange(entry, 'rally')),
          ),
        )
      : 0;
  const currentRescue = rescueDistance(unit);
  let movingThreat: TacticalTurnContext | undefined;
  const replyContext = (position: BattlePosition) => {
    if (position.x === unit.x && position.y === unit.y) return turn;
    // Vacating this formation also removes its old occupied cell and old ZOC.
    // Omit it when building the shared movement threat bound: its destination
    // can restrict enemy movement further, but cannot create an unseen attack.
    if (movingThreat) return movingThreat;
    const affected = turn.enemies.filter(
      (enemy) => manhattanDistance(enemy, unit) <= unitMovementBudget(enemy) + 1,
    );
    if (!affected.length) return (movingThreat = turn);
    const view = { ...state, units: state.units.filter((entry) => entry.id !== unit.id) };
    movingThreat = { ...turn, attackFields: new Map(turn.attackFields) };
    for (const enemy of affected)
      movingThreat.attackFields.set(enemy.id, enemyAttackField(view, enemy, turn.fields));
    return movingThreat;
  };
  const exchanges = new Map<string, Map<string, { damage: number; returned: number }>>();
  const risk = (candidate: TacticalBattleUnit, action?: TacticalActionCandidate) => {
    const retaliation = action?.retaliation ?? 0;
    const own = {
      ...candidate,
      troops: Math.max(0, candidate.troops - retaliation),
      morale: Math.max(
        MIN_MORALE,
        candidate.morale -
          (retaliation > 0
            ? Math.min(
                BATTLE.moraleLoss.cap,
                Math.max(
                  1,
                  Math.ceil(
                    (retaliation / candidate.troops) * BATTLE.moraleLoss.perCasualtyFraction,
                  ),
                ),
              )
            : 0),
      ),
    };
    if (own.facing !== undefined && action) {
      // The formation turns toward the enemy it strikes; holding unmoved braces it.
      const struck = action.targetId ? unitById(state, action.targetId) : undefined;
      if (action.action === 'hold') {
        if (!own.moved && UNITS[own.troopType].brace) own.braced = true;
      } else {
        own.braced = false;
        if (struck && struck.side !== own.side) faceToward(own, struck);
      }
    }
    if (action?.action === 'attack' || action?.action === 'ambush')
      if (own.status === 'inspired') own.status = 'normal';
    if (action?.action === 'rally' && action.targetId === unit.id) {
      own.morale = Math.min(
        100,
        own.morale +
          TACTICS.rally.base +
          Math.floor(unit.intellect / TACTICS.rally.intellectDivisor),
      );
      own.status = 'inspired';
    }
    const key = `${candidate.x}:${candidate.y}:${own.troops}:${own.morale}:${own.status}:${own.facing ?? ''}:${own.braced ? 1 : 0}`;
    const replies = replyContext(candidate);
    const exchange = (enemy: TacticalBattleUnit, hit: number) => {
      const firing = replies.attackFields
        .get(enemy.id)
        ?.get(battlePositionIndex(state.map, candidate.x, candidate.y));
      if (!firing || hit >= enemy.troops) return { damage: 0, returned: 0 };
      const next = {
        ...enemyAtFiringCell(state, enemy, firing, turn),
        troops: enemy.troops - hit,
        morale: Math.max(
          MIN_MORALE,
          enemy.morale -
            (hit > 0
              ? Math.min(
                  BATTLE.moraleLoss.cap,
                  Math.max(
                    1,
                    Math.ceil((hit / enemy.troops) * BATTLE.moraleLoss.perCasualtyFraction),
                  ),
                )
              : 0),
        ),
      };
      if (isRouted(next)) return { damage: 0, returned: 0 };
      const forecast = forecastAttack(state.map, next, own);
      return {
        damage: forecast.estimatedCasualties ?? 0,
        returned: forecast.counterattack.estimatedCasualties ?? 0,
      };
    };
    let hits = exchanges.get(key);
    if (!hits) {
      hits = new Map();
      for (const enemy of turn.enemies) hits.set(enemy.id, exchange(enemy, 0));
      exchanges.set(key, hits);
    }
    const target = turn.enemies.find((enemy) => enemy.id === action?.targetId);
    let revised: { damage: number; returned: number } | undefined;
    if (target && action) {
      const before = hits.get(target.id)!;
      const after = action.outgoing > 0 ? exchange(target, action.outgoing) : before;
      const denial =
        action.action === 'confuse'
          ? (predictBattleTactic(state, unit.id, 'confuse', target.id)?.chance ?? 0) / 100
          : 0;
      revised = { damage: after.damage * (1 - denial), returned: after.returned * (1 - denial) };
    }
    // Reuse unchanged next exchanges across actions; only the struck or confused
    // target needs a revised reply. Return hits prevent equal forces freezing.
    const [damage, returned] = strongestTwo(
      [...hits].map(([id, hit]) => (id === target?.id && revised ? revised : hit)),
    );
    return (
      Math.max(0, Math.min(own.troops, damage) - returned) +
      (own.troops > 0 && damage >= own.troops
        ? TACTICAL_VALUE.formationLossExposure + candidate.wounded * TACTICAL_VALUE.woundedWeight
        : 0)
    );
  };
  // With facing, each destination carries the direction of its last step and a possible charge.
  const parents = unit.facing !== undefined ? new Map<number, number>() : undefined;
  const positions = [
    { x: unit.x, y: unit.y, cost: 0 },
    ...getUnitReachableTiles(state, unit.id, parents),
  ].map((position) => {
    const moved = position.cost > 0;
    const candidate: TacticalBattleUnit = {
      ...unit,
      x: position.x,
      y: position.y,
      moved: unit.moved || moved,
    };
    if (parents && moved) {
      const parent = parents.get(battlePositionIndex(state.map, position.x, position.y));
      if (parent !== undefined)
        candidate.facing = facingOfVector(
          position.x - (parent % state.map.width),
          position.y - Math.floor(parent / state.map.width),
          unit.facing!,
        );
      candidate.braced = false;
      candidate.charging =
        UNITS[unit.troopType].charge !== null &&
        chargeRunReady(state.map, turn.occupied, unit, position);
    }
    const distance = progressField?.[battlePositionIndex(state.map, position.x, position.y)] ?? 0;
    const progress =
      Number.isFinite(currentRoute) && Number.isFinite(distance)
        ? (currentRoute - distance) * approachValue * progressWeight
        : 0;
    const progressValue = routed
      ? (currentRescue - rescueDistance(position)) * BATTLE_AI.rescueStep
      : progress;
    // The destination shortlist only needs a cheap incoming-damage bound.
    // Full damage/counterattack exchanges are evaluated at the six retained cells.
    const threat = replyContext(candidate);
    const [incoming] = strongestTwo(
      turn.enemies.map((enemy) => ({
        damage: nextEnemyDamage(state, enemy, candidate, threat),
        returned: 0,
      })),
    );
    const exposure =
      Math.min(unit.troops, incoming) +
      (incoming >= unit.troops
        ? TACTICAL_VALUE.formationLossExposure + unit.wounded * TACTICAL_VALUE.woundedWeight
        : 0);
    const blocking = blockingPenalty(state, unit, position, turn);
    let shot = 0;
    if (!routed)
      for (const enemy of turn.enemies)
        if (isBattleAttackInRange(state.map, candidate, enemy, candidate.attackRange)) {
          const casualties = estimateDamage(candidate, enemy, state.map).casualties;
          shot = Math.max(shot, casualties + finishingValue(enemy, casualties));
        }
    return {
      ...position,
      candidate,
      progressValue,
      exposure,
      blocking,
      shot,
      cheap: shot + progressValue - exposure * exposureFactor - blocking,
    };
  });
  const [current, ...allMoves] = positions;
  // An order permits some of the destinations; with none permitted the formation stays.
  const permitted = order ? order.selectCells(positions) : null;
  const moves = permitted ? allMoves.filter((move) => permitted.includes(move)) : allMoves;
  moves.sort((a, b) => b.cheap - a.cheap || a.cost - b.cost || a.y - b.y || a.x - b.x);
  const selected = !permitted || permitted.includes(current!) || !moves.length ? [current!] : [];
  const keep = (position: typeof current) => {
    if (position && !selected.includes(position) && selected.length < BATTLE_AI.shortlist)
      selected.push(position);
  };
  keep(moves[0]);
  keep(moves.slice().sort((a, b) => b.shot - a.shot || b.cheap - a.cheap)[0]);
  keep(moves.slice().sort((a, b) => a.exposure - b.exposure || b.cheap - a.cheap)[0]);
  keep(moves.slice().sort((a, b) => b.progressValue - a.progressValue || b.cheap - a.cheap)[0]);
  for (const position of moves) keep(position);
  const choices: TacticalTurnCandidate[] = [];
  const deniedOthers = new Map<string, number>();
  for (const position of selected) {
    const view =
      position.cost === 0
        ? state
        : {
            ...state,
            units: state.units.map((entry) => (entry.id === unit.id ? position.candidate : entry)),
          };
    for (const original of battleActionCandidates(
      view,
      unit.id,
      rationRemainders,
      turn.capabilities,
    )) {
      if (order && !order.actionAllowed(original, position.x, position.y)) continue;
      const action = { ...original };
      if (
        action.action === 'confuse' &&
        unitById(view, action.targetId!)!.status !== 'confused' &&
        (!unitById(view, action.targetId!)!.acted || state.day < state.dayLimit)
      ) {
        const target = unitById(state, action.targetId!)!;
        const chance = predictBattleTactic(view, unit.id, 'confuse', target.id)!.chance / 100;
        const replies = replyContext(position);
        const key = `${target.id}:${replies === turn ? 'current' : 'moving'}`;
        let denied = deniedOthers.get(key);
        if (denied === undefined) {
          denied = 0;
          for (const ally of livingUnits(view, unit.side)) {
            if (ally.id === unit.id) continue;
            const damage = nextEnemyDamage(view, target, ally, replies);
            denied = Math.max(denied, damage + (damage > 0 ? finishingValue(ally, damage) : 0));
          }
          deniedOthers.set(key, denied);
        }
        // This formation's protection is already counted in its exchange risk.
        // Credit only additional protection of another ally, once per enemy reply.
        const ownDamage = nextEnemyDamage(view, target, position.candidate, replies);
        const ownRisk = ownDamage + (ownDamage > 0 ? finishingValue(unit, ownDamage) : 0);
        const support = Math.max(0, denied - ownRisk) * chance * BATTLE_AI.confuse.allyProtection;
        action.score += support - action.supportValue;
        action.supportValue = support;
      }
      const exposure = risk(position.candidate, action);
      const urgency = urgent ? (action.outgoing + action.finishValue) * BATTLE_AI.urgency.bonus : 0;
      choices.push({
        ...action,
        x: position.x,
        y: position.y,
        moveCost: position.cost,
        exposure,
        progressValue: position.progressValue,
        blockingPenalty: position.blocking,
        score:
          action.score +
          urgency +
          position.progressValue -
          exposure * exposureFactor -
          position.blocking -
          position.cost * BATTLE_AI.moveCost,
      });
    }
  }
  choices.sort(
    (a, b) =>
      b.score - a.score ||
      a.pointCost - b.pointCost ||
      a.moveCost - b.moveCost ||
      (a.targetId ?? '').localeCompare(b.targetId ?? '') ||
      a.action.localeCompare(b.action) ||
      a.y - b.y ||
      a.x - b.x,
  );
  return order?.filterChoices ? order.filterChoices(choices) : choices;
}

function traceTacticalChoices(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  choices: readonly TacticalTurnCandidate[],
) {
  for (const [index, choice] of choices.entries())
    recordAiDecision({
      kind: 'tactical',
      day: state.day,
      battleId: state.id,
      side: unit.side,
      ...choice,
      status: index === 0 ? 'selected' : 'candidate',
      reason: 'move-and-action',
      x: choice.x,
      y: choice.y,
    });
}

/** The AI's opening-force withdrawal rule: a side well below its opening and the enemy's strength. */
function withdrawalThresholdReached(state: V03TacticalBattleState, side: BattleSide): boolean {
  const current = totalTroops(state, side);
  const opening = state.units
    .filter((unit) => unit.side === side && !isBaggage(unit))
    .reduce((sum, unit) => sum + unit.initialTroops, 0);
  return (
    current * 100 <= opening * PERSONNEL_RULES.aiRetreatOpeningPercent &&
    current * 100 <= totalTroops(state, otherSide(side)) * PERSONNEL_RULES.aiRetreatEnemyPercent
  );
}

/**
 * Whether AI command would withdraw this side now. Auto-command asks the player
 * instead of withdrawing their army (PF-BA-06).
 */
export function battleWithdrawalDue(state: V03TacticalBattleState, side: BattleSide): boolean {
  return !state.outcome && state.retreatAllowed[side] && withdrawalThresholdReached(state, side);
}

export type BattlePosture = 'attack' | 'advance' | 'hold' | 'fallback';

function nearestEnemyDistance(state: V03TacticalBattleState, unit: TacticalBattleUnit): number {
  return Math.min(
    ...livingUnits(state, otherSide(unit.side)).map((enemy) => manhattanDistance(unit, enemy)),
  );
}

/**
 * Log the army's posture when it changes, so the player can read the enemy's intent
 * (PF-BA-05). Only behaviour the player can see is described: strikes and moves.
 */
function announcePosture(state: V03TacticalBattleState, side: BattleSide, posture: BattlePosture) {
  const entries = state.logEntries ?? [];
  for (let index = entries.length - 1; index >= 0; index--)
    if (entries[index]!.code === 'log.posture' && entries[index]!.params.side === side) {
      if (entries[index]!.params.posture === posture) return;
      break;
    }
  const text = {
    attack: 'presses the attack',
    advance: 'advances',
    hold: 'holds its ground',
    fallback: 'falls back',
  }[posture];
  append(state, `${side} army ${text}.`, 'log.posture', { side, posture });
}

/** Deterministic, single-side tactical AI; it never advances the global battle day. */
export function runBattleAiTurn(
  state: V03TacticalBattleState,
  side: BattleSide,
  rationRemainders: BattleRationRemainders = {},
  options: {
    /** Delegated player formations act, but only the player may withdraw the army. */
    allowWithdrawal?: boolean;
    /** Log a change of posture for the player to read (the enemy's turn only). */
    announcePosture?: boolean;
    /** Execute standing orders (B-01); formations with no order are evaluated free. */
    useOrders?: boolean;
    /** With `useOrders`, the AI order layer sets this side's orders first (default true). */
    assignOrders?: boolean;
    /** Decide both halves of a pursuit by AI temperament instead of waiting for the player (B-05). */
    autoPursuit?: boolean;
  } = {},
): V03TacticalBattleState {
  if (state.outcome) return state;
  const draft = structuredClone(state);
  const trace = (
    action: Extract<AiDecisionEvent, { kind: 'tactical' }>['action'],
    unit?: TacticalBattleUnit,
    target?: TacticalBattleUnit,
    error?: string | null,
  ) =>
    recordAiDecision({
      kind: 'tactical',
      day: draft.day,
      battleId: draft.id,
      side,
      unitId: unit?.id,
      targetId: target?.id,
      action,
      status: error ? 'execution-rejected' : 'committed',
      reason:
        action === 'retreat'
          ? 'opening-force-retreat'
          : action === 'skip'
            ? 'confused-activation'
            : 'action-value',
      x: unit?.x,
      y: unit?.y,
    });
  if (draft.pending && options.autoPursuit) autoSettlePursuit(draft);
  if (checkImmediateOutcome(draft) || resolveRout(draft)) {
    if (draft.pending && options.autoPursuit) autoSettlePursuit(draft);
    return draft;
  }
  const withdrawalThreshold =
    options.allowWithdrawal !== false && withdrawalThresholdReached(draft, side);
  if (withdrawalThreshold) {
    const context = tacticalTurnContext(draft, side);
    const own = livingUnits(draft, side);
    // Each enemy gets one prospective hit, assigned to its most valuable target.
    // This is a bounded diagnostic comparison, not a new retreat threshold.
    const exposure = context.enemies.reduce(
      (sum, attacker) =>
        sum +
        Math.max(
          0,
          ...own.map((target) => {
            const damage = nextEnemyDamage(draft, attacker, target, context);
            return (
              damage +
              (damage >= target.troops
                ? TACTICAL_VALUE.formationLossExposure +
                  target.wounded * TACTICAL_VALUE.woundedWeight
                : 0)
            );
          }),
        ),
      0,
    );
    const allowed = draft.retreatAllowed[side];
    const captureRisk = !allowed ? 100 : draft.engaged ? PERSONNEL_RULES.orderlyCapturePercent : 0;
    const withdrawalCost = own.reduce(
      (sum, unit) =>
        sum +
        (unit.troops + unit.wounded * TACTICAL_VALUE.woundedWeight) *
          (unit.isMilitia ? 1 : captureRisk / 100),
      0,
    );
    for (const action of ['hold', 'retreat'] as const)
      recordAiDecision({
        kind: 'tactical',
        day: draft.day,
        battleId: draft.id,
        side,
        action,
        status: action === 'retreat' && allowed ? 'selected' : 'candidate',
        reason: 'opening-force-retreat',
        score: -(action === 'hold' ? exposure : withdrawalCost),
        exposure,
        retreatAllowed: allowed,
        retreatRiskPercent: captureRisk,
      });
  }
  if (draft.retreatAllowed[side] && withdrawalThreshold) {
    draft.outcome = { winner: otherSide(side), reason: 'retreat' };
    append(
      draft,
      `${side} forces retreat from the field; ${otherSide(side)} holds the battlefield.`,
      'log.retreat',
      { side, winner: otherSide(side) },
    );
    trace('retreat');
    return draft;
  }
  const routes = new Map<string, number[]>();
  const fields = new Map<string, Map<number, BattlePosition>>();
  const posture = { strikes: 0, toward: 0, away: 0 };
  const useOrders = options.useOrders === true;
  if (useOrders && options.assignOrders !== false) assignOrdersInPlace(draft, side);
  // Reconsider all unspent formations after each committed move/action. A cheap
  // finisher with no useful alternative can act before an otherwise stronger unit.
  for (
    let activation = 0;
    activation <= MAX_UNITS_PER_SIDE && !draft.outcome && !draft.pending;
    activation++
  ) {
    // A baggage train acts only on a withdraw order; otherwise it stays where it stands.
    const remaining = livingUnits(draft, side).filter(
      (unit) => !unit.acted && (!isBaggage(unit) || (useOrders && unit.order?.kind === 'withdraw')),
    );
    const available = remaining.filter((unit) => unit.status !== 'confused');
    if (!available.length) {
      for (const unit of remaining) if (consumeConfusedActivation(draft, unit)) trace('skip', unit);
      break;
    }
    const context = tacticalTurnContext(draft, side, routes, fields);
    context.ordersActive = useOrders;
    if (useOrders) lapseOrders(draft, remaining, routes);
    const options = available
      .map((unit) => {
        const choices = evaluateBattleTurn(draft, unit.id, rationRemainders, context);
        const choice = choices[0]!;
        const alternative = choices.find((entry) => entry.targetId !== choice.targetId);
        const regret = alternative ? Math.max(0, choice.score - alternative.score) : 0;
        return {
          unit,
          choices,
          choice,
          priority: choice.score + Math.min(BATTLE_AI.regret.cap, regret) * BATTLE_AI.regret.weight,
        };
      })
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          a.choice.moveCost - b.choice.moveCost ||
          a.unit.id.localeCompare(b.unit.id),
      );
    const { unit, choices, choice } = options[0]!;
    traceTacticalChoices(draft, unit, choices);
    if (useOrders && unit.order && unit.order.kind !== 'free' && !isRouted(unit))
      append(draft, `${unit.name} carries out its ${unit.order.kind} order.`, 'log.orderExecuted', {
        unitId: unit.id,
        order: unit.order.kind,
      });
    if (choice.moveCost > 0) {
      const before = nearestEnemyDistance(draft, unit);
      const error = performMove(draft, unit, choice);
      trace('move', unit, undefined, error);
      if (error) {
        unit.acted = true;
        continue;
      }
      const after = nearestEnemyDistance(draft, unit);
      if (after < before) posture.toward++;
      else if (after > before) posture.away++;
    }
    if (draft.outcome) break;
    const target = choice.targetId ? unitById(draft, choice.targetId) : undefined;
    if (choice.action === 'attack' && target) {
      const error = performAttack(draft, unit, target);
      trace('attack', unit, target, error);
      if (!error) posture.strikes++;
    } else if (choice.action !== 'hold' && choice.action !== 'attack' && target) {
      const error = performTactic(draft, unit, choice.action, target);
      trace(choice.action, unit, target, error);
      if (!error && target.side !== side && choice.action !== 'raidSupply') posture.strikes++;
    } else {
      holdPosition(unit);
      append(draft, `${unit.name} holds position.`, 'log.wait', { unitId: unit.id });
      trace('hold', unit);
    }
  }
  if (draft.pending && options.autoPursuit) autoSettlePursuit(draft);
  if (options.announcePosture && !draft.outcome && !draft.pending)
    announcePosture(
      draft,
      side,
      posture.strikes
        ? 'attack'
        : posture.toward > posture.away
          ? 'advance'
          : posture.away > posture.toward
            ? 'fallback'
            : 'hold',
    );
  return draft;
}

function totalTroops(state: V03TacticalBattleState, side: BattleSide): number {
  return livingLine(state, side).reduce((sum, unit) => sum + unit.troops, 0);
}

function fieldControlScore(state: V03TacticalBattleState, side: BattleSide): number {
  const own = livingLine(state, side);
  const enemy = livingLine(state, otherSide(side));
  if (!own.length) return 0;
  if (!enemy.length) return state.map.terrain.length;
  let score = 0;
  for (let y = 0; y < state.map.height; y++)
    for (let x = 0; x < state.map.width; x++) {
      if (state.map.terrain[battlePositionIndex(state.map, x, y)] === 'cliff') continue;
      const ownDistance = Math.min(...own.map((unit) => manhattanDistance(unit, { x, y })));
      const enemyDistance = Math.min(...enemy.map((unit) => manhattanDistance(unit, { x, y })));
      if (ownDistance < enemyDistance) score++;
      else if (ownDistance === enemyDistance) score += 0.5;
    }
  return score;
}

/** Compute a timeout result by an explicit policy; survivor-count is provisional. */
export function getBattleTimeoutOutcome(
  state: V03TacticalBattleState,
  policy: BattleTimeoutPolicy = state.timeoutPolicy,
): BattleOutcome {
  if (policy === 'draw') return { winner: null, reason: 'dayLimit' };
  if (policy === 'defender-holds') return { winner: 'defender', reason: 'dayLimit' };
  if (policy === 'field-control') {
    const attackerScore = fieldControlScore(state, 'attacker');
    const defenderScore = fieldControlScore(state, 'defender');
    return {
      winner:
        attackerScore === defenderScore
          ? null
          : attackerScore > defenderScore
            ? 'attacker'
            : 'defender',
      reason: 'dayLimit',
    };
  }
  const attackerTroops = totalTroops(state, 'attacker');
  const defenderTroops = totalTroops(state, 'defender');
  return {
    winner: attackerTroops > defenderTroops ? 'attacker' : 'defender',
    reason: 'dayLimit',
  };
}

export function getForcedBattleOutcome(state: V03TacticalBattleState): BattleOutcome | null {
  const draft = structuredClone(state);
  syncArmyMorale(draft);
  const immediate = checkImmediateOutcome(draft);
  if (immediate) return immediate;
  if (!resolveRout(draft)) return null;
  autoSettlePursuit(draft);
  return draft.outcome;
}

/**
 * A side breaks when every living line formation is routed, and, with army morale, when its army
 * morale is at the floor or 60% of its line formations are routed or destroyed. The winner's
 * cavalry may then pursue: the outcome waits in `pending` for the pursuit decision (B-05).
 * Returns whether the battle ended or now waits for the pursuit.
 */
function resolveRout(state: V03TacticalBattleState): boolean {
  if (state.pending) return true;
  let loser: BattleSide | undefined;
  let cause: BattleOutcomeCause | null = null;
  for (const side of ['attacker', 'defender'] as const) {
    cause = breakCause(state, side);
    if (cause) {
      loser = side;
      break;
    }
  }
  if (!loser || !cause) return false;
  const winner = otherSide(loser);
  const tracked = state.armyMorale !== undefined;
  append(state, `${loser} army breaks and retreats; ${winner} holds the battlefield.`, 'log.rout', {
    side: loser,
    winner,
    ...(tracked ? { cause } : {}),
  });
  if (tracked && eligiblePursuers(state, winner).length > 0) {
    state.pending = { kind: 'pursuit', winner, loser, cause };
    fillPursuit(state, 'ai');
    resolvePursuit(state);
  } else state.outcome = { winner, reason: 'rout', ...(tracked ? { cause } : {}) };
  return true;
}

/** Resolve the human side, run the other side's AI, then commit one battle day. */
export function advanceBattleDay(
  state: V03TacticalBattleState,
  rationRemainders: BattleRationRemainders = {},
  options: { useOrders?: boolean; autoPursuit?: boolean } = {},
): V03TacticalBattleState {
  if (state.outcome) return state;
  let draft = structuredClone(state);
  if (draft.pending) {
    // Committing the day answers the pursuit with the default half: all eligible pursue, no rear guard.
    fillPursuit(draft, options.autoPursuit ? 'auto' : 'default');
    resolvePursuit(draft);
    return draft;
  }
  for (const unit of livingUnits(draft, draft.playerSide)) {
    if (isBaggage(unit)) continue;
    if (!unit.acted && !consumeConfusedActivation(draft, unit)) {
      holdPosition(unit);
      append(draft, `${unit.name} holds position.`, 'log.wait', { unitId: unit.id });
    }
  }
  draft = runBattleAiTurn(draft, otherSide(draft.playerSide), rationRemainders, {
    announcePosture: true,
    useOrders: options.useOrders,
    autoPursuit: options.autoPursuit,
  });
  if (draft.outcome) return draft;
  if (resolveRout(draft)) {
    if (draft.pending && options.autoPursuit) autoSettlePursuit(draft);
    return draft;
  }
  if (draft.day >= draft.dayLimit) {
    draft.outcome = getBattleTimeoutOutcome(draft);
    append(
      draft,
      draft.outcome.winner
        ? `${draft.outcome.winner} controls the field when the ${draft.dayLimit}-day limit is reached.`
        : `The battle ends in a draw at the ${draft.dayLimit}-day limit.`,
      'log.timeout',
      { winner: draft.outcome.winner, limit: draft.dayLimit },
    );
    return draft;
  }
  const struck = unitsStruckOnDay(draft, draft.day);
  // The campaign charges this ration right after rollover; a hungry side does not recover.
  const fed: Record<BattleSide, boolean> = {
    attacker: !forecastBattleRations(draft, 'attacker', rationRemainders.attacker).shortage,
    defender: !forecastBattleRations(draft, 'defender', rationRemainders.defender).shortage,
  };
  draft.day++;
  draft.weather = draft.nextWeather;
  draft.nextWeather = WEATHER_OPTIONS[nextRandomInt(draft, WEATHER_OPTIONS.length)]!;
  for (const side of ['attacker', 'defender'] as const)
    draft.tacticPoints[side] = Math.min(
      BATTLE_TACTIC_POINT_CAP,
      draft.tacticPoints[side] + BATTLE_TACTIC_POINT_REGEN,
    );
  const recovered: Record<BattleSide, number> = { attacker: 0, defender: 0 };
  for (const unit of draft.units) {
    unit.moved = false;
    unit.acted = false;
    // A charge lasts the day; a brace holds until the formation next moves or acts.
    if (unit.charging) unit.charging = false;
    // Effects survive rollover until their promised activation or hit is consumed.
    if (
      unit.troops > 0 &&
      fed[unit.side] &&
      !struck.has(unit.id) &&
      unit.morale < BATTLE_MORALE_RECOVERY_CAP
    ) {
      unit.morale = Math.min(BATTLE_MORALE_RECOVERY_CAP, unit.morale + BATTLE_MORALE_RECOVERY);
      recovered[unit.side]++;
    }
  }
  append(draft, `Battle day ${draft.day} begins.`, 'log.day', { day: draft.day });
  if (draft.armyMorale && draft.day > ARMY.lateAfterDay)
    adjustArmyMorale(draft, 'attacker', ARMY.attackerLateDay, 'lateDay');
  for (const side of ['attacker', 'defender'] as const)
    if (recovered[side])
      append(
        draft,
        `${side}: ${recovered[side]} fed formation(s) that lost no troops yesterday regain morale (+${BATTLE_MORALE_RECOVERY}, up to ${BATTLE_MORALE_RECOVERY_CAP}).`,
        'log.recover',
        {
          side,
          count: recovered[side],
          amount: BATTLE_MORALE_RECOVERY,
          cap: BATTLE_MORALE_RECOVERY_CAP,
        },
      );
  if (draft.armyMorale) {
    syncArmyMorale(draft);
    if (resolveRout(draft) && draft.pending && options.autoPursuit) autoSettlePursuit(draft);
  }
  return draft;
}

/** Formations that lost troops (or morale to Rockfall) to an attack or tactic on this day. */
function unitsStruckOnDay(state: V03TacticalBattleState, day: number): Set<string> {
  const struck = new Set<string>();
  for (const entry of state.logEntries ?? [])
    if (
      entry.day === day &&
      (entry.code === 'log.attack' || entry.code === 'log.tactic') &&
      (Number(entry.params.casualties) > 0 || Number(entry.params.morale) < 0)
    )
      struck.add(String(entry.params.targetId));
  return struck;
}
