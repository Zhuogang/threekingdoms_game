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
  WATER_ATTACK_MULTIPLIER,
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

const DEFAULT_BATTLE_DAY_LIMIT = 30;
const DEFAULT_TIMEOUT_POLICY: BattleTimeoutPolicy = 'survivor-count';
const AI_CAMP_ALERT_DISTANCE = 6;
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
      initialTroops: entry.troops,
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
    log: [`Battle ${options.id} begins on a ${options.map.regionId} field.`],
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
  const ownCamp = state.map.objectives.find((objective) => objective.owner === unit.side);
  const enemyZone = getEnemyZoneOfControl(state, otherSide(unit.side));
  if (enemyZone.some((position) => position.x === unit.x && position.y === unit.y)) return [];
  return getReachableBattleTiles(
    state.map,
    unit,
    unit,
    movementBudget(unit.troopType),
    otherUnitsAsBlockers(state, unit),
    enemyZone,
  ).filter((tile) => !ownCamp || tile.x !== ownCamp.position.x || tile.y !== ownCamp.position.y);
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
      controlled.set(battlePositionIndex(position.x, position.y), position);
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

function append(state: V03TacticalBattleState, message: string): void {
  state.log.push(message);
  if (state.log.length > 250) state.log.splice(0, state.log.length - 250);
}

function checkImmediateOutcome(state: V03TacticalBattleState): BattleOutcome | null {
  if (state.outcome) return state.outcome;
  const attackerAlive = livingUnits(state, 'attacker').length > 0;
  const defenderAlive = livingUnits(state, 'defender').length > 0;
  if (!attackerAlive || !defenderAlive) {
    const winner = attackerAlive ? 'attacker' : defenderAlive ? 'defender' : null;
    state.outcome = { winner, reason: 'elimination' };
    append(state, winner ? `${winner} wins by elimination.` : 'Both armies are eliminated.');
    return state.outcome;
  }
  for (const objective of state.map.objectives) {
    const occupier = livingUnits(state).find(
      (unit) =>
        !isRouted(unit) && unit.x === objective.position.x && unit.y === objective.position.y,
    );
    if (occupier && occupier.side !== objective.owner) {
      state.outcome = { winner: occupier.side, reason: 'camp' };
      append(state, `${occupier.side} captures the opposing field camp.`);
      return state.outcome;
    }
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
          : source.troopType === 'elite'
            ? 1.15
            : 1;
  const guard = target.troopType === 'guard' ? 0.8 : 1;
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
      0.045 *
      forceRatio *
      morale *
      matchup *
      guard *
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
  const damage = applyWaterDamageModifiers(baseDamage(source, target, map), modifiers);
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
  const inRange = isBattleAttackInRange(state.map, source, target, source.attackRange);
  const initial = waterCombatModifiers(state.map, source, target);
  const estimatedCasualties = inRange ? estimateDamage(source, target, state.map).casualties : null;
  const survivingTarget = estimatedCasualties === null ? null : target.troops - estimatedCasualties;
  const counterattackPossible = Boolean(
    inRange &&
    survivingTarget !== null &&
    survivingTarget > 0 &&
    target.status !== 'confused' &&
    !isRouted(target) &&
    source.troops > 0 &&
    isBattleAttackInRange(state.map, target, source, target.attackRange),
  );
  const targetMoraleLoss = estimatedCasualties
    ? Math.min(45, Math.max(1, Math.ceil((estimatedCasualties / target.initialTroops) * 45)))
    : 0;
  const counterSource = counterattackPossible
    ? {
        ...target,
        troops: survivingTarget!,
        morale: Math.max(MIN_MORALE, target.morale - targetMoraleLoss),
      }
    : target;
  const counter = waterCombatModifiers(state.map, counterSource, source);
  const counterCasualties = counterattackPossible
    ? estimateDamage(counterSource, source, state.map).casualties
    : null;
  return {
    sourceId,
    targetId,
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
            ? `${unit.name} is confused and will lose the rest of today.`
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
        // Confusion only removes the target's upcoming action. Applying it after
        // the target has acted would expire it at the day boundary without effect.
        !(tactic === 'confuse' && target.acted) &&
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
    (tactic === 'confuse' && target.acted) ||
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

function attackOneWay(
  state: V03TacticalBattleState,
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
): number {
  const modifiers = waterCombatModifiers(state.map, source, target);
  const damage = applyWaterDamageModifiers(baseDamage(source, target, state.map), modifiers);
  const casualties = casualtyCountAfterWater(target.troops, damage);
  target.troops -= casualties;
  if (casualties > 0) {
    const moraleLoss = Math.min(
      45,
      Math.max(1, Math.ceil((casualties / target.initialTroops) * 45)),
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
  append(state, `${source.name} attacks ${target.name}: ${casualties} casualties${waterNote}.`);
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
  if (source.status === 'confused') return `${source.name} is confused and cannot act today.`;
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
  target.troops = Math.max(0, target.troops - casualties);
  if (casualties > 0)
    target.morale = Math.max(
      MIN_MORALE,
      target.morale -
        Math.min(45, Math.max(1, Math.ceil((casualties / target.initialTroops) * 45))),
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
  source.acted = true;
  source.moved = true;
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
    message = `${source.name} rallies ${target.name}: morale +${target.morale - priorMorale}; next attack +20%${priorStatus === 'confused' ? '; confusion cleared' : ''}`;
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
  append(state, `${message}.`);
  checkImmediateOutcome(state);
  return null;
}

function performAction(draft: V03TacticalBattleState, action: BattleAction): string | null {
  const unit = unitById(draft, action.unitId);
  if (!unit) return 'Select a living unit.';
  if (unit.side !== draft.playerSide) return 'You can command only your own units.';
  if (draft.outcome) return 'This battle has ended.';
  if (action.type === 'retreat') {
    const winner = otherSide(unit.side);
    draft.outcome = { winner, reason: 'retreat' };
    append(draft, `${unit.side} forces retreat from the field; ${winner} holds the battlefield.`);
    return null;
  }
  if (unit.status === 'confused') return `${unit.name} is confused and cannot act today.`;
  if (action.type === 'tactic') {
    const target = unitById(draft, action.targetId);
    return target ? performTactic(draft, unit, action.tactic, target) : 'Choose a living target.';
  }
  if (action.type === 'move') return performMove(draft, unit, { x: action.x, y: action.y });
  if (action.type === 'wait') {
    if (unit.acted) return `${unit.name} has already acted today.`;
    unit.moved = true;
    unit.acted = true;
    append(draft, `${unit.name} holds position.`);
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

function chooseAiDestination(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
): BattlePosition | null {
  const enemies = livingUnits(state, otherSide(unit.side));
  const enemyCamp = state.map.objectives.find((objective) => objective.owner !== unit.side);
  const ownCamp = state.map.objectives.find((objective) => objective.owner === unit.side);
  const occupied = new Set(
    livingUnits(state).map((candidate) => battlePositionIndex(candidate.x, candidate.y)),
  );
  const attackPositions = state.map.terrain.flatMap((terrain, index) => {
    if (terrain === 'cliff' || occupied.has(index)) return [];
    const position = { x: index % state.map.width, y: Math.floor(index / state.map.width) };
    return enemies.some((enemy) => manhattanDistance(position, enemy) <= unit.attackRange)
      ? [position]
      : [];
  });
  const campThreatened = Boolean(
    ownCamp &&
    enemies.some((enemy) => manhattanDistance(enemy, ownCamp.position) <= AI_CAMP_ALERT_DISTANCE),
  );
  const defensivePositions =
    campThreatened && ownCamp
      ? state.map.terrain.flatMap((terrain, index) => {
          if (terrain === 'cliff' || occupied.has(index)) return [];
          const position = { x: index % state.map.width, y: Math.floor(index / state.map.width) };
          return manhattanDistance(position, ownCamp.position) <= 2 ? [position] : [];
        })
      : [];
  const nearbyAttacks =
    campThreatened && ownCamp
      ? attackPositions.filter((position) => manhattanDistance(position, ownCamp.position) <= 2)
      : attackPositions;
  // A nearby threat shifts the AI from a distant camp rush to locally defending its own field camp.
  const goals = campThreatened
    ? [...defensivePositions, ...nearbyAttacks]
    : [...attackPositions, ...(enemyCamp ? [{ ...enemyCamp.position, offset: 1 }] : [])];
  const routeDistance = getBattleRouteDistanceField(
    state.map,
    unit,
    goals,
    otherUnitsAsBlockers(state, unit),
  );
  const options = getUnitReachableTiles(state, unit.id).filter((tile) => {
    const ownCamp = state.map.objectives.find((objective) => objective.owner === unit.side);
    return !ownCamp || tile.x !== ownCamp.position.x || tile.y !== ownCamp.position.y;
  });
  const score = (position: BattlePosition): number => {
    // The route field respects movement cost, terrain barriers, occupied cells and camp offset.
    const routeCost = routeDistance[battlePositionIndex(position.x, position.y)]!;
    const candidate = { ...unit, ...position };
    const threatened = enemies
      .filter((enemy) => isBattleAttackInRange(state.map, enemy, candidate, enemy.attackRange))
      .reduce((total, enemy) => total + estimateDamage(enemy, candidate, state.map).casualties, 0);
    const waterExposure = isOnWater(state.map, candidate)
      ? baseDamage(candidate, enemies[0] ?? candidate, state.map) * (1 - WATER_ATTACK_MULTIPLIER)
      : 0;
    return routeCost * 100 + threatened * 2 + waterExposure;
  };
  const currentScore = score(unit);
  const best = options
    .filter((tile) => score(tile) < currentScore)
    .sort((a, b) => score(a) - score(b) || a.cost - b.cost || a.y - b.y || a.x - b.x)[0];
  return best ? { x: best.x, y: best.y } : null;
}

function chooseAiTactic(
  state: V03TacticalBattleState,
  unit: TacticalBattleUnit,
): { tactic: BattleTactic; target: TacticalBattleUnit; score: number } | null {
  const regularTarget = getUnitAttackTargets(state, unit.id)[0];
  const regularForecast = regularTarget
    ? predictBattleAttack(state, unit.id, regularTarget.id)
    : null;
  const regularScore = regularForecast
    ? (regularForecast.estimatedCasualties ?? 0) -
      (regularForecast.counterattack.estimatedCasualties ?? 0) * 0.65
    : 0;
  let best: { tactic: BattleTactic; target: TacticalBattleUnit; score: number } | null = null;
  for (const entry of getAvailableBattleTactics(state, unit.id)) {
    if (!entry.allowed) continue;
    for (const target of getBattleTacticTargets(state, unit.id, entry.tactic)) {
      const forecast = predictBattleTactic(state, unit.id, entry.tactic, target.id);
      if (!forecast?.inRange) continue;
      let value = 0;
      if (entry.tactic === 'rally') {
        if (target.acted) continue;
        if (target.status === 'confused' || target.morale < 60)
          value = forecast.moraleChange * 1.5 + (forecast.endsConfusion ? 180 : 0);
      } else if (entry.tactic === 'confuse') {
        if (target.acted || target.status === 'confused') continue;
        value = (forecast.chance / 100) * Math.max(40, target.troops * 0.045);
      } else if (entry.tactic === 'raidSupply') {
        if (forecast.suppliesTransferred <= 0) continue;
        const remaining = state.supplies[target.side];
        const dailyUse = Math.max(1, Math.ceil(totalTroops(state, target.side) / 1000));
        const supplyDays = remaining / dailyUse;
        value = forecast.suppliesTransferred * (supplyDays <= 12 ? 0.1 : 0.025);
      } else {
        value = (forecast.minCasualties + forecast.maxCasualties) / 2;
        // Offensive tactics do not trigger the ordinary attack's counterattack.
        if (regularForecast?.counterattack.possible) value += 15;
      }
      const score = value - entry.cost * 12;
      if (
        score > regularScore &&
        (!best || score > best.score || (score === best.score && target.id < best.target.id))
      )
        best = { tactic: entry.tactic, target, score };
    }
  }
  return best;
}

/** Deterministic, single-side tactical AI; it never advances the global battle day. */
export function runBattleAiTurn(
  state: V03TacticalBattleState,
  side: BattleSide,
): V03TacticalBattleState {
  if (state.outcome) return state;
  const draft = structuredClone(state);
  const order = livingUnits(draft, side).sort((a, b) => {
    const canSupportA = getAvailableBattleTactics(draft, a.id).some(
      (entry) => entry.tactic === 'rally' && entry.allowed,
    );
    const canSupportB = getAvailableBattleTactics(draft, b.id).some(
      (entry) => entry.tactic === 'rally' && entry.allowed,
    );
    return Number(canSupportB) - Number(canSupportA) || a.id.localeCompare(b.id);
  });
  for (const unit of order) {
    if (draft.outcome) break;
    if (unit.acted || unit.troops <= 0) continue;
    if (unit.status === 'confused') {
      unit.status = 'normal';
      unit.moved = true;
      unit.acted = true;
      append(draft, `${unit.name} loses its turn to confusion.`);
      continue;
    }
    const availableTarget = () =>
      livingUnits(draft, otherSide(side))
        .filter(
          (target) =>
            !isRouted(unit) && isBattleAttackInRange(draft.map, unit, target, unit.attackRange),
        )
        .map((target) => ({
          target,
          forecast: predictBattleAttack(draft, unit.id, target.id)!,
        }))
        .sort(
          (a, b) =>
            (b.forecast.estimatedCasualties ?? 0) - (a.forecast.estimatedCasualties ?? 0) ||
            a.target.troops - b.target.troops ||
            a.target.id.localeCompare(b.target.id),
        )[0]?.target;
    let target = availableTarget();
    let tactic = chooseAiTactic(draft, unit);
    if (tactic) {
      performTactic(draft, unit, tactic.tactic, tactic.target);
      continue;
    }
    if (!target && !unit.moved) {
      const destination = chooseAiDestination(draft, unit);
      if (destination) performMove(draft, unit, destination);
      target = availableTarget();
      tactic = chooseAiTactic(draft, unit);
      if (tactic) {
        performTactic(draft, unit, tactic.tactic, tactic.target);
        continue;
      }
    }
    if (draft.outcome) break;
    if (target) {
      unit.acted = false;
      // Use the shared resolution path while allowing an AI-controlled side.
      performAttackForSide(draft, unit, target);
    } else {
      unit.moved = true;
      unit.acted = true;
      append(draft, `${unit.name} holds position.`);
    }
  }
  return draft;
}

function performAttackForSide(
  state: V03TacticalBattleState,
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
): void {
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
      if (state.map.terrain[battlePositionIndex(x, y)] === 'cliff') continue;
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

function resolveRout(state: V03TacticalBattleState): boolean {
  const broken = (side: BattleSide) => {
    const units = livingUnits(state, side);
    return units.length > 0 && units.every(isRouted);
  };
  if (!broken('attacker') && !broken('defender')) return false;
  const loser: BattleSide = broken('attacker') ? 'attacker' : 'defender';
  const winner = otherSide(loser);
  state.outcome = { winner, reason: 'rout' };
  append(state, `${loser} army breaks and retreats; ${winner} holds the battlefield.`);
  return true;
}

/** Resolve the human side, run the other side's AI, then commit one battle day. */
export function advanceBattleDay(state: V03TacticalBattleState): V03TacticalBattleState {
  if (state.outcome) return state;
  let draft = structuredClone(state);
  for (const unit of livingUnits(draft, draft.playerSide)) {
    if (!unit.acted) {
      unit.moved = true;
      unit.acted = true;
      if (unit.status === 'confused') {
        unit.status = 'normal';
        append(draft, `${unit.name} loses its turn to confusion.`);
      } else append(draft, `${unit.name} holds position.`);
    }
  }
  draft = runBattleAiTurn(draft, otherSide(draft.playerSide));
  if (draft.outcome) return draft;
  if (resolveRout(draft)) return draft;
  if (draft.day >= draft.dayLimit) {
    draft.outcome = getBattleTimeoutOutcome(draft);
    append(
      draft,
      draft.outcome.winner
        ? `${draft.outcome.winner} controls the field when the ${draft.dayLimit}-day limit is reached.`
        : `The battle ends in a draw at the ${draft.dayLimit}-day limit.`,
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
    if (unit.status === 'confused' || unit.status === 'inspired') unit.status = 'normal';
  }
  append(draft, `Battle day ${draft.day} begins.`);
  return draft;
}
