import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  type BattleMap,
  type BattlePosition,
  type BattleTerrain,
  type BattleTroopType,
  type BattleUnitPosition,
  type WaterCombatModifiers,
} from './types';
import { battleTerrainAt } from './maps';

export const WATER_ATTACK_MULTIPLIER = 0.75;
export const WATER_INCOMING_DAMAGE_MULTIPLIER = 1.25;

const MOVE_BUDGET: Readonly<Record<BattleTroopType, number>> = {
  infantry: 3,
  cavalry: 5,
  archer: 3,
  naval: 4,
  elite: 4,
  guard: 2,
};

export function battlePositionIndex(x: number, y: number): number {
  return y * BATTLE_WIDTH + x;
}

export function isBattlePosition(position: BattlePosition): boolean {
  return (
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    position.x >= 0 &&
    position.x < BATTLE_WIDTH &&
    position.y >= 0 &&
    position.y < BATTLE_HEIGHT
  );
}

export function manhattanDistance(a: BattlePosition, b: BattlePosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function movementBudget(troopType: BattleTroopType): number {
  return MOVE_BUDGET[troopType];
}

/** Existing land costs are retained; a water-edge step costs at least two for every troop. */
export function terrainMovementCost(troopType: BattleTroopType, terrain: BattleTerrain): number {
  if (terrain === 'cliff') return Number.POSITIVE_INFINITY;
  if (terrain === 'forest' || terrain === 'hill') {
    if (troopType === 'elite') return 1;
    if (troopType === 'cavalry') return 3;
    return 2;
  }
  return 1;
}

export function battleStepCost(
  map: BattleMap,
  unit: Pick<BattleUnitPosition, 'troopType'>,
  from: BattlePosition,
  to: BattlePosition,
): number {
  if (!isBattlePosition(from) || !isBattlePosition(to) || manhattanDistance(from, to) !== 1)
    return Number.POSITIVE_INFINITY;
  const fromTerrain = battleTerrainAt(map, from);
  const toTerrain = battleTerrainAt(map, to);
  if (!fromTerrain || !toTerrain || toTerrain === 'cliff') return Number.POSITIVE_INFINITY;
  const ordinaryCost = terrainMovementCost(unit.troopType, toTerrain);
  if (fromTerrain === 'water' || toTerrain === 'water') return Math.max(2, ordinaryCost);
  return ordinaryCost;
}

export interface PathBlocker extends BattlePosition {
  id?: string;
}

const DIRECTIONS: readonly BattlePosition[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Dijkstra path with deterministic N/E/S/W tie breaking and optional occupied cells. */
export function findBattlePath(
  map: BattleMap,
  unit: Pick<BattleUnitPosition, 'troopType'>,
  start: BattlePosition,
  destination: BattlePosition,
  blockers: readonly PathBlocker[] = [],
): BattlePosition[] | null {
  if (!isBattlePosition(start) || !isBattlePosition(destination)) return null;
  if (battleTerrainAt(map, start) === 'cliff' || battleTerrainAt(map, destination) === 'cliff')
    return null;
  const blockerIndexes = new Set(
    blockers.map((blocker) => battlePositionIndex(blocker.x, blocker.y)),
  );
  const startIndex = battlePositionIndex(start.x, start.y);
  const destinationIndex = battlePositionIndex(destination.x, destination.y);
  blockerIndexes.delete(startIndex);
  if (blockerIndexes.has(destinationIndex)) return null;

  const costs = new Map<number, number>([[startIndex, 0]]);
  const previous = new Map<number, number>();
  const open = new Set<number>([startIndex]);
  const closed = new Set<number>();

  while (open.size) {
    let currentIndex: number | undefined;
    let currentCost = Number.POSITIVE_INFINITY;
    // A small fixed 480-cell graph keeps the simple deterministic selector cheap.
    for (const index of open) {
      const cost = costs.get(index)!;
      if (
        cost < currentCost ||
        (cost === currentCost && (currentIndex === undefined || index < currentIndex))
      ) {
        currentIndex = index;
        currentCost = cost;
      }
    }
    if (currentIndex === undefined) break;
    open.delete(currentIndex);
    if (currentIndex === destinationIndex) break;
    closed.add(currentIndex);
    const current = {
      x: currentIndex % BATTLE_WIDTH,
      y: Math.floor(currentIndex / BATTLE_WIDTH),
    };
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (!isBattlePosition(next)) continue;
      const nextIndex = battlePositionIndex(next.x, next.y);
      if (closed.has(nextIndex) || blockerIndexes.has(nextIndex)) continue;
      const step = battleStepCost(map, unit, current, next);
      if (!Number.isFinite(step)) continue;
      const candidate = currentCost + step;
      if (candidate >= (costs.get(nextIndex) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(nextIndex, candidate);
      previous.set(nextIndex, currentIndex);
      open.add(nextIndex);
    }
  }
  if (!costs.has(destinationIndex)) return null;

  const path: BattlePosition[] = [];
  let cursor = destinationIndex;
  while (cursor !== startIndex) {
    path.push({ x: cursor % BATTLE_WIDTH, y: Math.floor(cursor / BATTLE_WIDTH) });
    const parent = previous.get(cursor);
    if (parent === undefined) return null;
    cursor = parent;
  }
  path.push({ x: start.x, y: start.y });
  path.reverse();
  return path;
}

export interface ReachableBattleTile extends BattlePosition {
  cost: number;
}

export function getReachableBattleTiles(
  map: BattleMap,
  unit: Pick<BattleUnitPosition, 'troopType'>,
  start: BattlePosition,
  budget = movementBudget(unit.troopType),
  blockers: readonly PathBlocker[] = [],
): ReachableBattleTile[] {
  if (!isBattlePosition(start) || battleTerrainAt(map, start) === 'cliff' || budget < 0) return [];
  const blocked = new Set(blockers.map((blocker) => battlePositionIndex(blocker.x, blocker.y)));
  const startIndex = battlePositionIndex(start.x, start.y);
  blocked.delete(startIndex);
  const costs = new Map<number, number>([[startIndex, 0]]);
  const open = new Set<number>([startIndex]);
  const closed = new Set<number>();

  while (open.size) {
    let currentIndex: number | undefined;
    let currentCost = Number.POSITIVE_INFINITY;
    for (const index of open) {
      const cost = costs.get(index)!;
      if (
        cost < currentCost ||
        (cost === currentCost && (currentIndex === undefined || index < currentIndex))
      ) {
        currentIndex = index;
        currentCost = cost;
      }
    }
    if (currentIndex === undefined) break;
    open.delete(currentIndex);
    closed.add(currentIndex);
    const current = {
      x: currentIndex % BATTLE_WIDTH,
      y: Math.floor(currentIndex / BATTLE_WIDTH),
    };
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (!isBattlePosition(next)) continue;
      const nextIndex = battlePositionIndex(next.x, next.y);
      if (closed.has(nextIndex) || blocked.has(nextIndex)) continue;
      const step = battleStepCost(map, unit, current, next);
      if (!Number.isFinite(step)) continue;
      const candidate = currentCost + step;
      if (candidate > budget || candidate >= (costs.get(nextIndex) ?? Number.POSITIVE_INFINITY))
        continue;
      costs.set(nextIndex, candidate);
      open.add(nextIndex);
    }
  }

  return [...costs.entries()]
    .filter(([index, cost]) => index !== startIndex && cost <= budget)
    .map(([index, cost]) => ({
      x: index % BATTLE_WIDTH,
      y: Math.floor(index / BATTLE_WIDTH),
      cost,
    }))
    .sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
}

export function isBattleAttackInRange(
  map: BattleMap,
  source: BattleUnitPosition,
  target: BattleUnitPosition,
  range: number,
): boolean {
  if (
    source.side === target.side ||
    range < 0 ||
    !isBattlePosition(source) ||
    !isBattlePosition(target) ||
    battleTerrainAt(map, source) === null ||
    battleTerrainAt(map, target) === null
  )
    return false;
  // Water has no special line-of-sight or shore-crossing block in v0.3.
  return manhattanDistance(source, target) <= range;
}

export function isOnWater(map: BattleMap, unit: BattlePosition): boolean {
  return battleTerrainAt(map, unit) === 'water';
}

export function waterCombatModifiers(
  map: BattleMap,
  source: BattlePosition,
  target: BattlePosition,
): WaterCombatModifiers {
  const sourceOnWater = isOnWater(map, source);
  const targetOnWater = isOnWater(map, target);
  const attackMultiplier = sourceOnWater ? WATER_ATTACK_MULTIPLIER : 1;
  const incomingDamageMultiplier = targetOnWater ? WATER_INCOMING_DAMAGE_MULTIPLIER : 1;
  return {
    sourceOnWater,
    targetOnWater,
    attackMultiplier,
    incomingDamageMultiplier,
    combinedMultiplier: attackMultiplier * incomingDamageMultiplier,
  };
}

/** Apply water only after the land/weather/matchup damage formula has been evaluated. */
export function applyWaterDamageModifiers(
  baseDamage: number,
  modifiers: Pick<WaterCombatModifiers, 'attackMultiplier' | 'incomingDamageMultiplier'>,
): number {
  if (!Number.isFinite(baseDamage) || baseDamage <= 0) return 0;
  return baseDamage * modifiers.attackMultiplier * modifiers.incomingDamageMultiplier;
}

/** Floor once after all multipliers, keep positive damage at 1, and cap to remaining troops. */
export function casualtyCountAfterWater(remainingTroops: number, adjustedDamage: number): number {
  if (
    !Number.isFinite(remainingTroops) ||
    remainingTroops <= 0 ||
    !Number.isFinite(adjustedDamage) ||
    adjustedDamage <= 0
  )
    return 0;
  return Math.min(Math.floor(remainingTroops), Math.max(1, Math.floor(adjustedDamage)));
}
