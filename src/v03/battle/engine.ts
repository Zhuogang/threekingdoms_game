import { battleTerrainAt, validateBattleMap, validateBattleUnits } from './maps';
import {
  applyWaterDamageModifiers,
  battlePositionIndex,
  casualtyCountAfterWater,
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
  type BattleTimeoutPolicy,
  type CreateBattleStateOptions,
  type TacticalBattleUnit,
  type V03TacticalBattleState,
} from './types';

const DEFAULT_BATTLE_DAY_LIMIT = 30;
const DEFAULT_TIMEOUT_POLICY: BattleTimeoutPolicy = 'survivor-count';
const otherSide = (side: BattleSide): BattleSide => (side === 'attacker' ? 'defender' : 'attacker');

function livingUnits(state: V03TacticalBattleState, side?: BattleSide): TacticalBattleUnit[] {
  return state.units.filter((unit) => unit.troops > 0 && (!side || unit.side === side));
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
      attackRange: entry.attackRange ?? (entry.troopType === 'archer' ? 3 : 1),
      x: position.x,
      y: position.y,
      morale: 100,
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

  const units = [
    ...makeUnits(options.attackerUnits, 'attacker', options.map.attackerDeployment),
    ...makeUnits(options.defenderUnits, 'defender', options.map.defenderDeployment),
  ];
  const state: V03TacticalBattleState = {
    schemaVersion: 1,
    id: options.id,
    map: structuredClone(options.map),
    playerSide: options.playerSide ?? 'attacker',
    day: 1,
    dayLimit,
    timeoutPolicy: options.timeoutPolicy ?? DEFAULT_TIMEOUT_POLICY,
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
  if (!unit || unit.moved || unit.acted || state.outcome) return [];
  const ownCamp = state.map.objectives.find((objective) => objective.owner === unit.side);
  return getReachableBattleTiles(
    state.map,
    unit,
    unit,
    movementBudget(unit.troopType),
    otherUnitsAsBlockers(state, unit),
  ).filter((tile) => !ownCamp || tile.x !== ownCamp.position.x || tile.y !== ownCamp.position.y);
}

export function getUnitAttackTargets(
  state: V03TacticalBattleState,
  unitId: string,
): TacticalBattleUnit[] {
  const source = unitById(state, unitId);
  if (!source || source.acted || state.outcome) return [];
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
      (unit) => unit.x === objective.position.x && unit.y === objective.position.y,
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
  const terrain = battleTerrainAt(map, target);
  const terrainDefense = terrain === 'hill' ? 0.8 : terrain === 'forest' ? 0.82 : 1;
  // The existing 20-person normal-hit floor remains part of the base damage;
  // water modifiers are applied after it, then casualties are rounded once.
  return Math.max(
    20,
    source.troops * 0.045 * forceRatio * morale * matchup * guard * terrainDefense,
  );
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
      24,
      Math.max(1, Math.floor((casualties / target.initialTroops) * 100)),
    );
    target.morale = Math.max(0, target.morale - moraleLoss);
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
    isBattleAttackInRange(state.map, target, source, target.attackRange)
  ) {
    attackOneWay(state, target, source);
    checkImmediateOutcome(state);
  }
  return null;
}

function performAction(draft: V03TacticalBattleState, action: BattleAction): string | null {
  const unit = unitById(draft, action.unitId);
  if (!unit) return 'Select a living unit.';
  if (unit.side !== draft.playerSide) return 'You can command only your own units.';
  if (draft.outcome) return 'This battle has ended.';
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
  const options = getReachableBattleTiles(
    state.map,
    unit,
    unit,
    movementBudget(unit.troopType),
    otherUnitsAsBlockers(state, unit),
  ).filter((tile) => {
    const ownCamp = state.map.objectives.find((objective) => objective.owner === unit.side);
    return !ownCamp || tile.x !== ownCamp.position.x || tile.y !== ownCamp.position.y;
  });
  const score = (position: BattlePosition): number => {
    const enemyDistance = enemies.length
      ? Math.min(...enemies.map((enemy) => manhattanDistance(position, enemy)))
      : Number.POSITIVE_INFINITY;
    const campDistance = enemyCamp
      ? manhattanDistance(position, enemyCamp.position)
      : Number.POSITIVE_INFINITY;
    // Close with enemies first, but continue toward the enemy camp if no one is nearby.
    const objectiveDistance = Math.min(enemyDistance, campDistance + 1);
    return objectiveDistance * 100 + (isOnWater(state.map, position) ? 15 : 0);
  };
  const currentScore = score(unit);
  const best = options
    .filter((tile) => score(tile) < currentScore)
    .sort((a, b) => score(a) - score(b) || a.cost - b.cost || a.y - b.y || a.x - b.x)[0];
  return best ? { x: best.x, y: best.y } : null;
}

/** Deterministic, single-side tactical AI; it never advances the global battle day. */
export function runBattleAiTurn(
  state: V03TacticalBattleState,
  side: BattleSide,
): V03TacticalBattleState {
  if (state.outcome) return state;
  const draft = structuredClone(state);
  const order = livingUnits(draft, side).sort((a, b) => a.id.localeCompare(b.id));
  for (const unit of order) {
    if (draft.outcome) break;
    if (unit.acted || unit.troops <= 0) continue;
    const availableTarget = () =>
      livingUnits(draft, otherSide(side))
        .filter((target) => isBattleAttackInRange(draft.map, unit, target, unit.attackRange))
        .sort((a, b) => a.troops - b.troops || a.id.localeCompare(b.id))[0];
    let target = availableTarget();
    if (!target && !unit.moved) {
      const destination = chooseAiDestination(draft, unit);
      if (destination) performMove(draft, unit, destination);
      target = availableTarget();
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

/** Resolve the human side, run the other side's AI, then commit one battle day. */
export function advanceBattleDay(state: V03TacticalBattleState): V03TacticalBattleState {
  if (state.outcome) return state;
  let draft = structuredClone(state);
  for (const unit of livingUnits(draft, draft.playerSide)) {
    if (!unit.acted) {
      unit.moved = true;
      unit.acted = true;
      append(draft, `${unit.name} holds position.`);
    }
  }
  draft = runBattleAiTurn(draft, otherSide(draft.playerSide));
  if (draft.outcome) return draft;
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
  for (const unit of draft.units) {
    unit.moved = false;
    unit.acted = false;
  }
  append(draft, `Battle day ${draft.day} begins.`);
  return draft;
}
