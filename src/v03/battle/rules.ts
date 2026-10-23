import {
  type BattleMap,
  type BattlePosition,
  type BattleTerrain,
  type BattleTroopType,
  type BattleUnitPosition,
  type BattleWeather,
  type WaterCombatModifiers,
} from './types';
import { battleTerrainAt } from './maps';

export const WATER_ATTACK_MULTIPLIER = 0.75;
export const WATER_INCOMING_DAMAGE_MULTIPLIER = 1.25;

/** Existing weather modifier used by fire forecasts and resolution. */
export function fireWeatherMultiplier(weather: BattleWeather): number {
  return weather === 'rain' ? 0.4 : weather === 'wind' ? 1.25 : 1;
}

const MOVE_BUDGET: Readonly<Record<BattleTroopType, number>> = {
  infantry: 3,
  cavalry: 5,
  archer: 3,
  naval: 4,
  elite: 4,
  guard: 2,
};

/** The board size a position helper needs; every battle map carries its own. */
export type BattleGrid = Pick<BattleMap, 'width' | 'height'>;

export function battlePositionIndex(map: BattleGrid, x: number, y: number): number {
  return y * map.width + x;
}

export function isBattlePosition(map: BattleGrid, position: BattlePosition): boolean {
  return (
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    position.x >= 0 &&
    position.x < map.width &&
    position.y >= 0 &&
    position.y < map.height
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
  if (
    !isBattlePosition(map, from) ||
    !isBattlePosition(map, to) ||
    manhattanDistance(from, to) !== 1
  )
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
  stopAfter: readonly BattlePosition[] = [],
): BattlePosition[] | null {
  if (!isBattlePosition(map, start) || !isBattlePosition(map, destination)) return null;
  if (battleTerrainAt(map, start) === 'cliff' || battleTerrainAt(map, destination) === 'cliff')
    return null;
  const blockerIndexes = new Set(
    blockers.map((blocker) => battlePositionIndex(map, blocker.x, blocker.y)),
  );
  const stopAfterIndexes = new Set(
    stopAfter
      .filter((position) => isBattlePosition(map, position))
      .map((position) => battlePositionIndex(map, position.x, position.y)),
  );
  const startIndex = battlePositionIndex(map, start.x, start.y);
  const destinationIndex = battlePositionIndex(map, destination.x, destination.y);
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
    // A unit may enter an enemy control zone, but it cannot move through one.
    if (currentIndex !== startIndex && stopAfterIndexes.has(currentIndex)) continue;
    closed.add(currentIndex);
    const current = {
      x: currentIndex % map.width,
      y: Math.floor(currentIndex / map.width),
    };
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (!isBattlePosition(map, next)) continue;
      const nextIndex = battlePositionIndex(map, next.x, next.y);
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
    path.push({ x: cursor % map.width, y: Math.floor(cursor / map.width) });
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

/**
 * Binary heap over parallel cost/index arrays (no per-entry objects), ordered by
 * cost, then by cell index.
 */
class IndexCostHeap {
  private readonly costs: number[] = [];
  private readonly indexes: number[] = [];
  get size(): number {
    return this.costs.length;
  }
  /** Whether (cost, index) orders before the entry in `slot`. */
  private before(cost: number, index: number, slot: number): boolean {
    const slotCost = this.costs[slot]!;
    return cost < slotCost || (cost === slotCost && index < this.indexes[slot]!);
  }
  push(index: number, cost: number): void {
    let slot = this.costs.length;
    this.costs.push(cost);
    this.indexes.push(index);
    while (slot > 0) {
      const parent = (slot - 1) >> 1;
      if (!this.before(cost, index, parent)) break;
      this.costs[slot] = this.costs[parent]!;
      this.indexes[slot] = this.indexes[parent]!;
      slot = parent;
    }
    this.costs[slot] = cost;
    this.indexes[slot] = index;
  }
  /** Removes the minimum; read it first with topIndex/topCost. */
  pop(): void {
    const lastCost = this.costs.pop()!;
    const lastIndex = this.indexes.pop()!;
    const length = this.costs.length;
    if (!length) return;
    let slot = 0;
    while (true) {
      const left = slot * 2 + 1;
      if (left >= length) break;
      const right = left + 1;
      const child =
        right < length && this.before(this.costs[right]!, this.indexes[right]!, left)
          ? right
          : left;
      // Stop once the moved-down last entry orders before the smaller child.
      if (this.before(lastCost, lastIndex, child)) break;
      this.costs[slot] = this.costs[child]!;
      this.indexes[slot] = this.indexes[child]!;
      slot = child;
    }
    this.costs[slot] = lastCost;
    this.indexes[slot] = lastIndex;
  }
  topIndex(): number {
    return this.indexes[0]!;
  }
  topCost(): number {
    return this.costs[0]!;
  }
}

/**
 * Weighted distance from every cell to the nearest goal, respecting terrain and occupied cells.
 * The reverse edge uses the corresponding forward move cost, so asymmetric uphill costs remain
 * correct. `goalOffsets` can assign e.g. a one-point preference cost to a camp goal.
 * With `settle`, the search stops once those cells are final: their values are exact, and
 * other cells may be left unfinished.
 */
export function getBattleRouteDistanceField(
  map: BattleMap,
  unit: Pick<BattleUnitPosition, 'troopType'>,
  goals: readonly (BattlePosition & { offset?: number })[],
  blockers: readonly PathBlocker[] = [],
  settle?: readonly BattlePosition[],
): number[] {
  const pending = settle
    ? new Set(
        settle
          .filter((position) => isBattlePosition(map, position))
          .map((position) => battlePositionIndex(map, position.x, position.y)),
      )
    : null;
  const distances = Array.from({ length: map.width * map.height }, () => Number.POSITIVE_INFINITY);
  const goalIndexes = new Set<number>();
  const queue = new IndexCostHeap();
  for (const goal of goals) {
    if (!isBattlePosition(map, goal) || battleTerrainAt(map, goal) === 'cliff') continue;
    const index = battlePositionIndex(map, goal.x, goal.y);
    const offset = Number.isFinite(goal.offset) ? Math.max(0, goal.offset ?? 0) : 0;
    distances[index] = Math.min(distances[index]!, offset);
    goalIndexes.add(index);
    queue.push(index, offset);
  }
  const blocked = new Set(
    blockers.map((blocker) => battlePositionIndex(map, blocker.x, blocker.y)),
  );
  for (const goalIndex of goalIndexes) blocked.delete(goalIndex);

  // This runs once per AI unit over the whole board, so the inner loop inlines
  // battleStepCost with index arithmetic. The costs are the same: entering a
  // cell costs its terrain cost, raised to 2 when either side of the step is water.
  const { width, height, terrain } = map;
  const entryCost = terrain.map((tile) => terrainMovementCost(unit.troopType, tile));
  while (queue.size) {
    const currentIndex = queue.topIndex();
    const currentCost = queue.topCost();
    queue.pop();
    if (currentCost !== distances[currentIndex]) continue;
    if (pending?.delete(currentIndex) && pending.size === 0) break;
    const enter = entryCost[currentIndex]!;
    if (!Number.isFinite(enter)) continue;
    const x = currentIndex % width;
    const y = (currentIndex - x) / width;
    const intoWater = terrain[currentIndex] === 'water';
    // Same N/E/S/W order as DIRECTIONS.
    for (let direction = 0; direction < 4; direction++) {
      const px = direction === 1 ? x + 1 : direction === 3 ? x - 1 : x;
      const py = direction === 0 ? y - 1 : direction === 2 ? y + 1 : y;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const predecessorIndex = py * width + px;
      if (blocked.has(predecessorIndex)) continue;
      const forwardCost =
        intoWater || terrain[predecessorIndex] === 'water' ? Math.max(2, enter) : enter;
      const candidate = currentCost + forwardCost;
      if (candidate >= distances[predecessorIndex]!) continue;
      distances[predecessorIndex] = candidate;
      queue.push(predecessorIndex, candidate);
    }
  }
  return distances;
}

export function getReachableBattleTiles(
  map: BattleMap,
  unit: Pick<BattleUnitPosition, 'troopType'>,
  start: BattlePosition,
  budget = movementBudget(unit.troopType),
  blockers: readonly PathBlocker[] = [],
  stopAfter: readonly BattlePosition[] = [],
): ReachableBattleTile[] {
  if (!isBattlePosition(map, start) || battleTerrainAt(map, start) === 'cliff' || budget < 0)
    return [];
  const blocked = new Set(
    blockers.map((blocker) => battlePositionIndex(map, blocker.x, blocker.y)),
  );
  const stopAfterIndexes = new Set(
    stopAfter
      .filter((position) => isBattlePosition(map, position))
      .map((position) => battlePositionIndex(map, position.x, position.y)),
  );
  const startIndex = battlePositionIndex(map, start.x, start.y);
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
    // A unit may enter an enemy control zone, but it cannot continue through it.
    if (currentIndex !== startIndex && stopAfterIndexes.has(currentIndex)) continue;
    const current = {
      x: currentIndex % map.width,
      y: Math.floor(currentIndex / map.width),
    };
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (!isBattlePosition(map, next)) continue;
      const nextIndex = battlePositionIndex(map, next.x, next.y);
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
      x: index % map.width,
      y: Math.floor(index / map.width),
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
    !isBattlePosition(map, source) ||
    !isBattlePosition(map, target) ||
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
