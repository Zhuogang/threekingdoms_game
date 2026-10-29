import { forecastBattleRations, type BattleRationRemainders } from './supply';
import { recordAiDecision, type AiDecisionEvent } from '../ai/decision-trace';
import { applyCombatDamage } from './experience';
import { PERSONNEL_RULES } from '../campaign/personnel';
import {
  battleTerrainAt,
  fireTerrainMultiplier,
  terrainDefenseMultiplier,
  validateBattleMap,
  validateBattleUnits,
} from './maps';
import {
  applyWaterDamageModifiers,
  battlePositionIndex,
  casualtyCountAfterWater,
  fireWeatherMultiplier,
  getBattleRouteDistanceField,
  getReachableBattleTiles,
  isBattleAttackInRange,
  isOnWater,
  manhattanDistance,
  movementBudget,
  waterCombatModifiers,
  type PathBlocker,
} from './rules';
import {
  MAX_UNITS_PER_SIDE,
  type BattleAction,
  type BattleActionResult,
  type BattleOutcome,
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

const DEFAULT_BATTLE_DAY_LIMIT = 30;
const DEFAULT_TIMEOUT_POLICY: BattleTimeoutPolicy = 'survivor-count';
export const BATTLE_TACTIC_POINT_CAP = 30;
export const BATTLE_TACTIC_POINT_REGEN = 2;
export const BATTLE_TACTIC_COST: Readonly<Record<BattleTactic, number>> = {
  fire: 4,
  confuse: 3,
  rally: 2,
  raidSupply: 4,
  ambush: 3,
  rockfall: 4,
};
const WAVERING_MORALE = 40;
const ROUTED_MORALE = 20;
const MIN_MORALE = 5;
const AMBUSH_DAMAGE_MULTIPLIER = 1.4;
const ROCKFALL_MORALE_LOSS = 10;
const RAID_SUPPLY_MINIMUM = 100;
const INSPIRED_DAMAGE_MULTIPLIER = 1.2;
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

function livingUnits(state: V03TacticalBattleState, side?: BattleSide): TacticalBattleUnit[] {
  return state.units.filter((unit) => unit.troops > 0 && (!side || unit.side === side));
}

const isWavering = (unit: Pick<TacticalBattleUnit, 'morale'>): boolean =>
  unit.morale < WAVERING_MORALE;
const isRouted = (unit: Pick<TacticalBattleUnit, 'morale'>): boolean => unit.morale < ROUTED_MORALE;
/** Whether a unit's morale is below the rout threshold (display and rules share it). */
export const isBattleUnitRouted = isRouted;

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

function makeUnits(
  roster: readonly BattleRosterEntry[],
  side: BattleSide,
  deployment: readonly BattlePosition[],
): TacticalBattleUnit[] {
  return roster.map((entry, index) => {
    const position = deployment[index]!;
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
      intellect: entry.intellect ?? 40,
      level: entry.level ?? 0,
      isMilitia: entry.isMilitia ?? entry.id.includes('militia'),
      cunning: entry.cunning ?? false,
      attackRange: entry.attackRange ?? (entry.troopType === 'archer' ? 3 : 1),
      x: position.x,
      y: position.y,
      morale: 80,
      status: 'normal',
      moved: false,
      acted: false,
    };
  });
}

function rosterError(roster: readonly BattleRosterEntry[], side: BattleSide): string | null {
  if (roster.length > MAX_UNITS_PER_SIDE)
    return `${side} cannot deploy more than ${MAX_UNITS_PER_SIDE} units.`;
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
        unit.troopExperience > 1900)
    )
      return `${unit.name} has invalid soldier experience.`;
    if (!Number.isFinite(unit.force) || unit.force < 0 || unit.force > 120)
      return `${unit.name} has an invalid force value.`;
    if (
      unit.intellect !== undefined &&
      (!Number.isFinite(unit.intellect) || unit.intellect < 0 || unit.intellect > 120)
    )
      return `${unit.name} has an invalid intellect value.`;
    if (
      unit.level !== undefined &&
      (!Number.isInteger(unit.level) || unit.level < 0 || unit.level > 5)
    )
      return `${unit.name} has an invalid level.`;
    if (
      unit.attackRange !== undefined &&
      (!Number.isInteger(unit.attackRange) || unit.attackRange < 1)
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
  if (options.attackerUnits.length > options.map.attackerDeployment.length)
    throw new Error('Attacker deployment does not have enough cells for its roster.');
  if (options.defenderUnits.length > options.map.defenderDeployment.length)
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

  const units = [
    ...makeUnits(options.attackerUnits, 'attacker', options.map.attackerDeployment),
    ...makeUnits(options.defenderUnits, 'defender', options.map.defenderDeployment),
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
          .filter((unit) => unit.side === 'attacker' && !unit.isMilitia)
          .reduce((total, unit) => total + Math.floor(unit.intellect / 10), 0),
      ),
      defender: Math.min(
        BATTLE_TACTIC_POINT_CAP,
        units
          .filter((unit) => unit.side === 'defender' && !unit.isMilitia)
          .reduce((total, unit) => total + Math.floor(unit.intellect / 10), 0),
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
  const deploymentErrors = validateBattleUnits(state.map, state.units);
  if (deploymentErrors.length)
    throw new Error(`Invalid unit deployment: ${deploymentErrors.join(' ')}`);
  checkImmediateOutcome(state);
  return state;
}

export function getUnitReachableTiles(
  state: V03TacticalBattleState,
  unitId: string,
): ReturnType<typeof getReachableBattleTiles> {
  const unit = unitById(state, unitId);
  if (!unit || unit.status === 'confused' || unit.moved || unit.acted || state.outcome) return [];
  const enemyZone = getEnemyZoneOfControl(state, otherSide(unit.side));
  if (enemyZone.some((position) => position.x === unit.x && position.y === unit.y)) return [];
  return getReachableBattleTiles(
    state.map,
    unit,
    unit,
    movementBudget(unit.troopType),
    otherUnitsAsBlockers(state, unit),
    enemyZone,
  );
}

/** Orthogonal enemy control, including across a water edge, as specified for v0.3. */
export function getEnemyZoneOfControl(
  state: V03TacticalBattleState,
  enemySide: BattleSide,
): BattlePosition[] {
  const controlled = new Map<number, BattlePosition>();
  for (const enemy of livingUnits(state, enemySide)) {
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
  if (!source || source.acted || source.status === 'confused' || isRouted(source) || state.outcome)
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
  if (state.log.length > 250) {
    const removed = state.log.length - 250;
    state.log.splice(0, removed);
    state.logEntries = state.logEntries
      .filter((entry) => entry.index >= removed)
      .map((entry) => ({ ...entry, index: entry.index - removed }));
  }
}
const append = appendBattleLog;

function checkImmediateOutcome(state: V03TacticalBattleState): BattleOutcome | null {
  if (state.outcome) return state.outcome;
  const attackerAlive = livingUnits(state, 'attacker').length > 0;
  const defenderAlive = livingUnits(state, 'defender').length > 0;
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

function baseDamage(
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
  map: V03TacticalBattleState['map'],
): number {
  const forceRatio = (source.force + 55) / (target.force + 65);
  const morale = 0.65 + source.morale / 170;
  const matchup =
    source.troopType === 'cavalry' && target.troopType === 'archer'
      ? 1.3
      : source.troopType === 'infantry' && target.troopType === 'cavalry'
        ? 1.2
        : source.troopType === 'archer' && target.troopType === 'infantry'
          ? 1.15
          : 1;
  const wavering = isWavering(source) ? 0.85 : 1;
  const routedTarget = isRouted(target) ? 1.2 : 1;
  const inspiration = source.status === 'inspired' ? INSPIRED_DAMAGE_MULTIPLIER : 1;
  const terrain = battleTerrainAt(map, target);
  const terrainDefense = terrainDefenseMultiplier(terrain);
  // The existing 20-person normal-hit floor remains part of the base damage;
  // water modifiers are applied after it, then casualties are rounded once.
  return Math.max(
    20,
    source.troops *
      0.3 *
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
  const intellect = Math.max(0.35, (source.intellect + 30) / (target.intellect + 55));
  return Math.max(12, source.troops * 0.1584 * intellect * weather * forest * variation);
}

function rockfallBaseDamage(source: TacticalBattleUnit, target: TacticalBattleUnit): number {
  return Math.floor(
    source.troops * 0.1296 * Math.max(0.35, (source.intellect + 30) / (target.intellect + 55)),
  );
}

function estimateDamage(
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
  map: V03TacticalBattleState['map'],
): { casualties: number; modifiers: ReturnType<typeof waterCombatModifiers> } {
  const modifiers = waterCombatModifiers(map, source, target);
  const damage = applyWaterDamageModifiers(
    baseDamage(source, target, map) *
      troopDamageMultiplier(source.troopExperience, target.troopExperience),
    modifiers,
  );
  return { casualties: casualtyCountAfterWater(target.troops, damage), modifiers };
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
  return forecastAttack(state.map, source, target);
}

function forecastAttack(
  map: V03TacticalBattleState['map'],
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
): BattleAttackForecast {
  const inRange = isBattleAttackInRange(map, source, target, source.attackRange);
  const initial = waterCombatModifiers(map, source, target);
  const estimatedCasualties = inRange ? estimateDamage(source, target, map).casualties : null;
  const survivingTarget = estimatedCasualties === null ? null : target.troops - estimatedCasualties;
  const targetMoraleLoss = estimatedCasualties
    ? Math.min(45, Math.max(1, Math.ceil((estimatedCasualties / Math.max(1, target.troops)) * 55)))
    : 0;
  const counterattackPossible = Boolean(
    inRange &&
    survivingTarget !== null &&
    survivingTarget > 0 &&
    target.status !== 'confused' &&
    target.morale - targetMoraleLoss >= ROUTED_MORALE &&
    source.troops > 0 &&
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
    ? estimateDamage(counterSource, source, map).casualties
    : null;
  return {
    sourceId: source.id,
    targetId: target.id,
    inRange,
    sourceOnWater: initial.sourceOnWater,
    targetOnWater: initial.targetOnWater,
    attackMultiplier: initial.attackMultiplier,
    incomingDamageMultiplier: initial.incomingDamageMultiplier,
    estimatedCasualties,
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
  const generalRange = unit.troopType === 'archer' || unit.intellect >= 80 ? 3 : 2;
  return tactic === 'ambush' || tactic === 'rockfall' ? Math.min(2, generalRange) : generalRange;
}

function tacticReason(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  tactic: BattleTactic,
  moved = unit.moved,
): string | null {
  const cost = tacticCost(unit, tactic);
  if (unit.isMilitia) return 'Militia cannot use tactics.';
  if (isRouted(unit)) return 'Routed units cannot use tactics.';
  if (isWavering(unit)) return 'Wavering units cannot use tactics.';
  const needed = (base: number) => (unit.level >= 3 ? base - 10 : base);
  if (tactic === 'fire' && unit.intellect < needed(60))
    return `Fire requires intellect ${needed(60)}.`;
  if (tactic === 'confuse' && unit.intellect < needed(70))
    return `Confuse requires intellect ${needed(70)}.`;
  if (tactic === 'rally' && unit.intellect < needed(50) && unit.force < 85)
    return `Rally requires intellect ${needed(50)} or force 85.`;
  if (tactic === 'raidSupply' && unit.intellect < needed(60) && unit.troopType !== 'cavalry')
    return `Raid supplies requires intellect ${needed(60)} or cavalry.`;
  if (tactic === 'ambush') {
    if (unit.intellect < needed(60)) return `Ambush requires intellect ${needed(60)}.`;
    if (battleTerrainAt(state.map, unit) !== 'forest')
      return 'Ambush requires standing in a forest.';
    if (moved) return 'Ambush requires a unit that has not moved today.';
  }
  if (tactic === 'rockfall') {
    if (unit.intellect < needed(65)) return `Rockfall requires intellect ${needed(65)}.`;
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
    casualtyCountAfterWater(target.troops, applyWaterDamageModifiers(rawDamage, modifiers));
  let minCasualties = 0;
  let maxCasualties = 0;
  let chance = 100;
  let moraleChange = 0;
  let endsConfusion = false;
  let suppliesTransferred = 0;
  if (tactic === 'fire') {
    minCasualties = casualties(fireBaseDamage(state, source, target, 0.9));
    maxCasualties = casualties(fireBaseDamage(state, source, target, 1.1));
  } else if (tactic === 'ambush') {
    minCasualties = casualties(
      baseDamage(source, target, state.map) * 0.88 * AMBUSH_DAMAGE_MULTIPLIER,
    );
    maxCasualties = casualties(
      baseDamage(source, target, state.map) * 1.12 * AMBUSH_DAMAGE_MULTIPLIER,
    );
  } else if (tactic === 'rockfall') {
    minCasualties = maxCasualties = casualties(rockfallBaseDamage(source, target));
    moraleChange = -ROCKFALL_MORALE_LOSS;
  } else if (tactic === 'confuse') {
    chance = Math.min(90, Math.max(20, 55 + source.intellect - target.intellect));
  } else if (tactic === 'rally') {
    const rallyGain = 15 + Math.floor(source.intellect / 5);
    moraleChange = Math.min(100, target.morale + rallyGain) - target.morale;
    endsConfusion = target.status === 'confused';
  } else {
    suppliesTransferred = Math.min(
      state.supplies[target.side],
      Math.max(RAID_SUPPLY_MINIMUM, Math.floor(target.troops * 0.5)),
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
): number {
  const { casualties, modifiers } = estimateDamage(source, target, state.map);
  state.engaged = true;
  recordCombatCasualties(source, target, casualties);
  applyCombatDamage(target, casualties);
  consumeInspiredHit(source, casualties);
  if (casualties > 0) {
    const moraleLoss = Math.min(
      45,
      Math.max(1, Math.ceil((casualties / Math.max(1, target.troops + casualties)) * 55)),
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
    `${source.name} attacks ${target.name}: ${casualties} casualties${waterNote}.`,
    'log.attack',
    {
      sourceId: source.id,
      targetId: target.id,
      casualties,
      water: modifiers.sourceOnWater || modifiers.targetOnWater,
      attackMultiplier: modifiers.attackMultiplier,
      incomingMultiplier: modifiers.incomingDamageMultiplier,
    },
  );
  return casualties;
}

function performMove(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
  destination: BattlePosition,
): string | null {
  if (unit.acted) return `${unit.name} has already acted today.`;
  if (unit.moved) return `${unit.name} has already moved today.`;
  const reachable = getUnitReachableTiles(state, unit.id);
  if (!reachable.some((tile) => tile.x === destination.x && tile.y === destination.y))
    return 'That cell is blocked, impassable, or beyond movement range.';
  const startWater = isOnWater(state.map, unit);
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
  if (source.side === target.side || target.troops <= 0) return 'Choose a living enemy unit.';
  if (!isBattleAttackInRange(state.map, source, target, source.attackRange))
    return `${target.name} is outside the normal attack range.`;
  source.acted = true;
  attackOneWay(state, source, target);
  checkImmediateOutcome(state);
  if (
    !state.outcome &&
    target.troops > 0 &&
    source.troops > 0 &&
    target.status !== 'confused' &&
    !isRouted(target) &&
    isBattleAttackInRange(state.map, target, source, target.attackRange)
  ) {
    attackOneWay(state, target, source);
    checkImmediateOutcome(state);
  }
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
    applyWaterDamageModifiers(rawDamage, modifiers),
  );
  recordCombatCasualties(source, target, casualties);
  applyCombatDamage(target, casualties);
  if (casualties > 0)
    target.morale = Math.max(
      MIN_MORALE,
      target.morale -
        Math.min(
          45,
          Math.max(1, Math.ceil((casualties / Math.max(1, target.troops + casualties)) * 55)),
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
  const troopsBefore = target.troops,
    moraleBefore = target.morale,
    suppliesBefore = state.supplies[target.side];
  let message: string;
  if (tactic === 'fire') {
    const variation = (90 + nextRandomInt(state, 21)) / 100;
    const casualties = applyTacticDamage(
      state,
      source,
      target,
      fireBaseDamage(state, source, target, variation),
    );
    message = `${source.name}'s fire tactic strikes ${target.name}: ${casualties} casualties`;
  } else if (tactic === 'ambush') {
    const variation = (88 + nextRandomInt(state, 25)) / 100;
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
    const chance = Math.min(90, Math.max(20, 55 + source.intellect - target.intellect));
    const succeeded = nextRandomInt(state, 100) < chance;
    if (succeeded) target.status = 'confused';
    message = succeeded
      ? `${source.name} confuses ${target.name}; the unit will lose its next turn (${chance}% chance)`
      : `${target.name} resists ${source.name}'s confusion tactic (${chance}% chance)`;
  } else if (tactic === 'rally') {
    const gain = 15 + Math.floor(source.intellect / 5);
    const priorStatus = target.status;
    const priorMorale = target.morale;
    target.morale = Math.min(100, target.morale + gain);
    target.status = 'inspired';
    message = `${source.name} rallies ${target.name}: morale +${target.morale - priorMorale}; next normal attack, counterattack or Ambush hit +20%${priorStatus === 'confused' ? '; confusion cleared' : ''}`;
  } else {
    const taken = forecast.suppliesTransferred;
    state.supplies[target.side] -= taken;
    state.supplies[source.side] += Math.floor(taken / 2);
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
  return null;
}

function performAction(draft: V03TacticalBattleState, action: BattleAction): string | null {
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
  if (unit.status === 'confused') return `${unit.name} is confused and will lose its next action.`;
  if (action.type === 'tactic') {
    const target = unitById(draft, action.targetId);
    return target ? performTactic(draft, unit, action.tactic, target) : 'Choose a living target.';
  }
  if (action.type === 'move') return performMove(draft, unit, { x: action.x, y: action.y });
  if (action.type === 'wait') {
    if (unit.acted) return `${unit.name} has already acted today.`;
    unit.moved = true;
    unit.acted = true;
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
const TACTICAL_VALUE = {
  retaliation: 1.1,
  formation: 80,
  wounded: 0.15,
  rout: 50,
  pointRecoveryDay: 24,
} as const;

function finishingValue(target: TacticalBattleUnit, casualties: number, moraleChange = 0): number {
  if (casualties >= target.troops)
    return TACTICAL_VALUE.formation + Math.min(200, target.wounded * TACTICAL_VALUE.wounded);
  const loss =
    casualties > 0 ? Math.min(45, Math.max(1, Math.ceil((casualties / target.troops) * 55))) : 0;
  return !isRouted(target) && target.morale - loss + moraleChange < ROUTED_MORALE
    ? TACTICAL_VALUE.rout
    : 0;
}

function potentialDamage(state: V03TacticalBattleState, unit: TacticalBattleUnit): number {
  if (isRouted(unit) || unit.status === 'confused') return 0;
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
  return present || future * 0.35;
}

function tacticOpportunityCost(points: number, cost: number): number {
  const remaining = points - cost;
  const regenerationDays = cost / BATTLE_TACTIC_POINT_REGEN;
  const scarcity = remaining < BATTLE_TACTIC_POINT_REGEN ? 1.5 : 1;
  return TACTICAL_VALUE.pointRecoveryDay * regenerationDays * scarcity;
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
  const enemies = livingUnits(state, otherSide(unit.side));
  const finishing = (target: TacticalBattleUnit, casualties: number, moraleChange = 0) => {
    const value = finishingValue(target, casualties, moraleChange);
    const endsBattle = casualties >= target.troops && enemies.length === 1;
    return (
      value +
      (endsBattle
        ? 500 +
          livingUnits(state, unit.side).reduce(
            (sum, entry) => sum + entry.troops * 0.5 + entry.wounded,
            0,
          )
        : 0)
    );
  };
  const preserve = TACTICAL_VALUE.retaliation + (unit.troopExperience / 1900) * 0.2;
  for (const target of getUnitAttackTargets(state, unitId)) {
    const forecast = predictBattleAttack(state, unitId, target.id)!;
    const action = candidate('attack', target.id);
    action.outgoing = forecast.estimatedCasualties ?? 0;
    action.retaliation = forecast.counterattack.estimatedCasualties ?? 0;
    action.finishValue = finishing(target, action.outgoing);
    if (action.retaliation >= unit.troops)
      action.finishValue -= TACTICAL_VALUE.formation + unit.wounded * 0.6;
    action.score = action.outgoing - action.retaliation * preserve + action.finishValue;
    choices.push(action);
  }
  for (const entry of getAvailableBattleTactics(state, unitId)) {
    if (!entry.allowed) continue;
    for (const target of getBattleTacticTargets(state, unitId, entry.tactic)) {
      const forecast = predictBattleTactic(state, unitId, entry.tactic, target.id);
      if (!forecast?.inRange) continue;
      const action = candidate(entry.tactic, target.id);
      action.pointCost = tacticOpportunityCost(state.tacticPoints[unit.side], entry.cost);
      if (entry.tactic === 'rally') {
        const restored = {
          ...target,
          morale: Math.min(100, target.morale + forecast.moraleChange),
          status: 'inspired' as const,
        };
        const opportunity =
          target.acted || target.id === unit.id ? (state.day < state.dayLimit ? 0.45 : 0) : 1;
        action.supportValue =
          opportunity * Math.max(0, capability(restored) - capability(target)) +
          (forecast.moraleChange / 100) * (target.troops + target.wounded * 0.3) * 0.3;
        if (isRouted(target) && !isRouted(restored)) action.supportValue += target.troops * 0.08;
      } else if (entry.tactic === 'confuse') {
        if (
          !capabilities &&
          target.status !== 'confused' &&
          (!target.acted || state.day < state.dayLimit)
        )
          action.supportValue = (forecast.chance / 100) * potentialDamage(state, target);
      } else if (entry.tactic === 'raidSupply') {
        const horizon = Math.min(10, state.dayLimit - state.day + 1);
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
              hungerDays(own.supplyDays + Math.floor(food / 2) / own.dailyFood)
            : 0;
        const personnel = (side: BattleSide) =>
          state.units
            .filter((entry) => entry.side === side)
            .reduce((sum, entry) => sum + entry.troops + entry.wounded * 0.6, 0);
        action.supplyValue =
          (denied * personnel(target.side) + relieved * personnel(unit.side)) * 0.012;
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
    enemy.status === 'confused' ||
    (enemy.acted && state.day >= state.dayLimit)
  )
    return field;
  // Occupancy and ZOC outside the movement radius cannot affect this field.
  // Damage, points and remote moves also leave it intact; reuse it by geometry
  // across formation commits, including the views that vacate one formation.
  const radius = movementBudget(enemy.troopType) + 1;
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
  return position ? estimateDamage({ ...enemy, ...position }, target, state.map).casualties : 0;
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
    if (exits <= 1) penalty += 80;
    else if (exits === 2) penalty += 15;
  }
  return penalty;
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
  // A full move toward contact is worth at most roughly one normal hit. Scaling
  // by capability lets viable infantry cross an archer's firing zone without
  // treating a handful of route cells as more valuable than an army's survival.
  const approachHit = Math.max(
    0,
    ...turn.enemies.map((enemy) => estimateDamage(unit, enemy, state.map).casualties),
  );
  const approachValue =
    remainingDays === 1
      ? 0
      : Math.max(40, (approachHit * 0.9) / movementBudget(unit.troopType)) *
        (!behind && remainingDays <= 3 ? 0.5 : 1);
  const currentRoute = route?.[battlePositionIndex(state.map, unit.x, unit.y)] ?? 0;
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
      (enemy) => manhattanDistance(enemy, unit) <= movementBudget(enemy.troopType) + 1,
    );
    if (!affected.length) return (movingThreat = turn);
    const view = { ...state, units: state.units.filter((entry) => entry.id !== unit.id) };
    movingThreat = { ...turn, attackFields: new Map(turn.attackFields) };
    for (const enemy of affected)
      movingThreat.attackFields.set(enemy.id, enemyAttackField(view, enemy, turn.fields));
    return movingThreat;
  };
  const exchanges = new Map<
    string,
    {
      totalDamage: number;
      totalReturn: number;
      hits: Map<string, { damage: number; returned: number }>;
    }
  >();
  const risk = (candidate: TacticalBattleUnit, action?: TacticalActionCandidate) => {
    const retaliation = action?.retaliation ?? 0;
    const own = {
      ...candidate,
      troops: Math.max(0, candidate.troops - retaliation),
      morale: Math.max(
        MIN_MORALE,
        candidate.morale -
          (retaliation > 0
            ? Math.min(45, Math.max(1, Math.ceil((retaliation / candidate.troops) * 55)))
            : 0),
      ),
    };
    if (action?.action === 'attack' || action?.action === 'ambush')
      if (own.status === 'inspired') own.status = 'normal';
    if (action?.action === 'rally' && action.targetId === unit.id) {
      own.morale = Math.min(100, own.morale + 15 + Math.floor(unit.intellect / 5));
      own.status = 'inspired';
    }
    const key = `${candidate.x}:${candidate.y}:${own.troops}:${own.morale}:${own.status}`;
    const replies = replyContext(candidate);
    const exchange = (enemy: TacticalBattleUnit, hit: number) => {
      const firing = replies.attackFields
        .get(enemy.id)
        ?.get(battlePositionIndex(state.map, candidate.x, candidate.y));
      if (!firing || hit >= enemy.troops) return { damage: 0, returned: 0 };
      const next = {
        ...enemy,
        ...firing,
        troops: enemy.troops - hit,
        morale: Math.max(
          MIN_MORALE,
          enemy.morale -
            (hit > 0 ? Math.min(45, Math.max(1, Math.ceil((hit / enemy.troops) * 55))) : 0),
        ),
      };
      if (isRouted(next)) return { damage: 0, returned: 0 };
      const forecast = forecastAttack(state.map, next, own);
      return {
        damage: forecast.estimatedCasualties ?? 0,
        returned: forecast.counterattack.estimatedCasualties ?? 0,
      };
    };
    let base = exchanges.get(key);
    if (!base) {
      base = { totalDamage: 0, totalReturn: 0, hits: new Map() };
      for (const enemy of turn.enemies) {
        const hit = exchange(enemy, 0);
        base.hits.set(enemy.id, hit);
        base.totalDamage += hit.damage;
        base.totalReturn += hit.returned;
      }
      exchanges.set(key, base);
    }
    let damage = base.totalDamage,
      returned = base.totalReturn;
    const target = turn.enemies.find((enemy) => enemy.id === action?.targetId);
    if (target && action) {
      const before = base.hits.get(target.id)!;
      const after = action.outgoing > 0 ? exchange(target, action.outgoing) : before;
      const denial =
        action.action === 'confuse'
          ? (predictBattleTactic(state, unit.id, 'confuse', target.id)?.chance ?? 0) / 100
          : 0;
      damage += after.damage * (1 - denial) - before.damage;
      returned += after.returned * (1 - denial) - before.returned;
    }
    // Reuse unchanged next exchanges across actions; only the struck or confused
    // target needs a revised reply. Return hits prevent equal forces freezing.
    return (
      Math.max(0, Math.min(own.troops, damage) - returned) +
      (own.troops > 0 && damage >= own.troops ? 80 + candidate.wounded * 0.6 : 0)
    );
  };
  const positions = [
    { x: unit.x, y: unit.y, cost: 0 },
    ...getUnitReachableTiles(state, unit.id),
  ].map((position) => {
    const moved = position.cost > 0;
    const candidate = { ...unit, x: position.x, y: position.y, moved: unit.moved || moved };
    const distance = route?.[battlePositionIndex(state.map, position.x, position.y)] ?? 0;
    const progress =
      Number.isFinite(currentRoute) && Number.isFinite(distance)
        ? (currentRoute - distance) * approachValue
        : 0;
    const progressValue = routed ? (currentRescue - rescueDistance(position)) * 35 : progress;
    // The destination shortlist only needs a cheap incoming-damage bound.
    // Full damage/counterattack exchanges are evaluated at the six retained cells.
    const threat = replyContext(candidate);
    const incoming = turn.enemies.reduce(
      (sum, enemy) => sum + nextEnemyDamage(state, enemy, candidate, threat),
      0,
    );
    const exposure =
      Math.min(unit.troops, incoming) + (incoming >= unit.troops ? 80 + unit.wounded * 0.6 : 0);
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
      cheap: shot + progressValue - exposure * 0.65 - blocking,
    };
  });
  const [current, ...moves] = positions;
  moves.sort((a, b) => b.cheap - a.cheap || a.cost - b.cost || a.y - b.y || a.x - b.x);
  const selected = [current!];
  const keep = (position: typeof current) => {
    if (position && !selected.includes(position) && selected.length < 6) selected.push(position);
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
        const support = Math.max(0, denied - ownRisk) * chance * 0.65;
        action.score += support - action.supportValue;
        action.supportValue = support;
      }
      const exposure = risk(position.candidate, action);
      const urgency =
        behind && remainingDays <= 3 ? (action.outgoing + action.finishValue) * 0.15 : 0;
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
          exposure * (routed ? 1 : 0.65) -
          position.blocking -
          position.cost * 0.1,
      });
    }
  }
  return choices.sort(
    (a, b) =>
      b.score - a.score ||
      a.pointCost - b.pointCost ||
      a.moveCost - b.moveCost ||
      (a.targetId ?? '').localeCompare(b.targetId ?? '') ||
      a.action.localeCompare(b.action) ||
      a.y - b.y ||
      a.x - b.x,
  );
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

/** Deterministic, single-side tactical AI; it never advances the global battle day. */
export function runBattleAiTurn(
  state: V03TacticalBattleState,
  side: BattleSide,
  rationRemainders: BattleRationRemainders = {},
  /** Delegated player formations act, but only the player may withdraw the army. */
  options: { allowWithdrawal?: boolean } = {},
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
  if (checkImmediateOutcome(draft) || resolveRout(draft)) return draft;
  const current = livingUnits(draft, side).reduce((sum, unit) => sum + unit.troops, 0);
  const opening = draft.units
    .filter((unit) => unit.side === side)
    .reduce((sum, unit) => sum + unit.initialTroops, 0);
  const enemy = livingUnits(draft, otherSide(side)).reduce((sum, unit) => sum + unit.troops, 0);
  const withdrawalThreshold =
    options.allowWithdrawal !== false &&
    current * 100 <= opening * PERSONNEL_RULES.aiRetreatOpeningPercent &&
    current * 100 <= enemy * PERSONNEL_RULES.aiRetreatEnemyPercent;
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
            return damage + (damage >= target.troops ? 80 + target.wounded * 0.6 : 0);
          }),
        ),
      0,
    );
    const allowed = draft.retreatAllowed[side];
    const captureRisk = !allowed ? 100 : draft.engaged ? PERSONNEL_RULES.orderlyCapturePercent : 0;
    const withdrawalCost = own.reduce(
      (sum, unit) =>
        sum + (unit.troops + unit.wounded * 0.6) * (unit.isMilitia ? 1 : captureRisk / 100),
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
  // Reconsider all unspent formations after each committed move/action. A cheap
  // finisher with no useful alternative can act before an otherwise stronger unit.
  for (let activation = 0; activation < MAX_UNITS_PER_SIDE && !draft.outcome; activation++) {
    const remaining = livingUnits(draft, side).filter((unit) => !unit.acted);
    const available = remaining.filter((unit) => unit.status !== 'confused');
    if (!available.length) {
      for (const unit of remaining) if (consumeConfusedActivation(draft, unit)) trace('skip', unit);
      break;
    }
    const context = tacticalTurnContext(draft, side, routes, fields);
    const options = available
      .map((unit) => {
        const choices = evaluateBattleTurn(draft, unit.id, rationRemainders, context);
        const choice = choices[0]!;
        const alternative = choices.find((entry) => entry.targetId !== choice.targetId);
        const regret = alternative ? Math.max(0, choice.score - alternative.score) : 0;
        return { unit, choices, choice, priority: choice.score + Math.min(200, regret) * 0.5 };
      })
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          a.choice.moveCost - b.choice.moveCost ||
          a.unit.id.localeCompare(b.unit.id),
      );
    const { unit, choices, choice } = options[0]!;
    traceTacticalChoices(draft, unit, choices);
    if (choice.moveCost > 0) {
      const error = performMove(draft, unit, choice);
      trace('move', unit, undefined, error);
      if (error) {
        unit.acted = true;
        continue;
      }
    }
    if (draft.outcome) break;
    const target = choice.targetId ? unitById(draft, choice.targetId) : undefined;
    if (choice.action === 'attack' && target) {
      const error = performAttack(draft, unit, target);
      trace('attack', unit, target, error);
    } else if (choice.action !== 'hold' && choice.action !== 'attack' && target) {
      const error = performTactic(draft, unit, choice.action, target);
      trace(choice.action, unit, target, error);
    } else {
      unit.moved = true;
      unit.acted = true;
      append(draft, `${unit.name} holds position.`, 'log.wait', { unitId: unit.id });
      trace('hold', unit);
    }
  }
  return draft;
}

function totalTroops(state: V03TacticalBattleState, side: BattleSide): number {
  return livingUnits(state, side).reduce((sum, unit) => sum + unit.troops, 0);
}

function fieldControlScore(state: V03TacticalBattleState, side: BattleSide): number {
  const own = livingUnits(state, side);
  const enemy = livingUnits(state, otherSide(side));
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
  return checkImmediateOutcome(draft) ?? (resolveRout(draft) ? draft.outcome : null);
}

function resolveRout(state: V03TacticalBattleState): boolean {
  const broken = (side: BattleSide) => {
    const units = livingUnits(state, side);
    return units.length > 0 && units.every(isRouted);
  };
  if (!broken('attacker') && !broken('defender')) return false;
  const loser: BattleSide = broken('attacker') ? 'attacker' : 'defender';
  const winner = otherSide(loser);
  state.outcome = { winner, reason: 'rout' };
  append(state, `${loser} army breaks and retreats; ${winner} holds the battlefield.`, 'log.rout', {
    side: loser,
    winner,
  });
  return true;
}

/** Resolve the human side, run the other side's AI, then commit one battle day. */
export function advanceBattleDay(
  state: V03TacticalBattleState,
  rationRemainders: BattleRationRemainders = {},
): V03TacticalBattleState {
  if (state.outcome) return state;
  let draft = structuredClone(state);
  for (const unit of livingUnits(draft, draft.playerSide)) {
    if (!unit.acted && !consumeConfusedActivation(draft, unit)) {
      unit.moved = true;
      unit.acted = true;
      append(draft, `${unit.name} holds position.`, 'log.wait', { unitId: unit.id });
    }
  }
  draft = runBattleAiTurn(draft, otherSide(draft.playerSide), rationRemainders);
  if (draft.outcome) return draft;
  if (resolveRout(draft)) return draft;
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
  draft.day++;
  draft.weather = draft.nextWeather;
  draft.nextWeather = WEATHER_OPTIONS[nextRandomInt(draft, WEATHER_OPTIONS.length)]!;
  for (const side of ['attacker', 'defender'] as const)
    draft.tacticPoints[side] = Math.min(
      BATTLE_TACTIC_POINT_CAP,
      draft.tacticPoints[side] + BATTLE_TACTIC_POINT_REGEN,
    );
  for (const unit of draft.units) {
    unit.moved = false;
    unit.acted = false;
    // Effects survive rollover until their promised activation or hit is consumed.
  }
  append(draft, `Battle day ${draft.day} begins.`, 'log.day', { day: draft.day });
  return draft;
}
