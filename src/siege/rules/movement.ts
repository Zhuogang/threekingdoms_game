import { ENGINE_RULES, SIEGE_TUNING as T } from './tuning';
import { movementBudget } from '../../v03/battle/rules';
import {
  CITY_BOUNDS,
  GATES,
  MAP_WIDTH,
  MAP_HEIGHT,
  RAMPS,
  cellKey,
  layoutSymbol,
  sameCell,
} from '../content/chencang';
import { cellTerrain, gateAt, isMapCell, isWallFoot } from './map';
import type {
  Cell,
  ReachableCell,
  SiegeLevel,
  SiegePosition,
  SiegeSide,
  SiegeState,
  SiegeUnit,
} from './types';

const positionKey = (p: SiegePosition): string => `${cellKey(p)},${p.level}`;
const positionIndex = (p: SiegePosition): number =>
  (p.level === 'wall' ? MAP_WIDTH * MAP_HEIGHT : 0) + p.y * MAP_WIDTH + p.x;
const ground = ({ x, y }: Cell): SiegePosition => ({ x, y, level: 'ground' });
const wall = ({ x, y }: Cell): SiegePosition => ({ x, y, level: 'wall' });
const cardinal = ({ x, y, level }: SiegePosition): SiegePosition[] => [
  { x, y: y - 1, level },
  { x: x + 1, y, level },
  { x, y: y + 1, level },
  { x: x - 1, y, level },
];

export function isWalkway(state: SiegeState, { x, y }: Cell): boolean {
  const terrain = cellTerrain(state, x, y);
  return isMapCell(x, y) && (terrain === 'wall' || terrain === 'gate');
}

export function groundPassable(state: SiegeState, side: SiegeSide, { x, y }: Cell): boolean {
  if (!isMapCell(x, y)) return false;
  const terrain = cellTerrain(state, x, y);
  if (terrain === 'water' || terrain === 'trench' || terrain === 'building' || terrain === 'wall')
    return false;
  if (terrain === 'gate') {
    const id = gateAt(x, y);
    return side === 'wei' || (id !== undefined && state.gates[id].broken);
  }
  return true;
}

export function unitNeighbors(
  state: SiegeState,
  unit: SiegeUnit,
  from: SiegePosition,
): SiegePosition[] {
  if (from.level === 'wall') {
    return [
      ...cardinal(from).filter((next) => isWalkway(state, next)),
      ...cardinal(from)
        .filter((next) => insideCity(next) && groundPassable(state, unit.side, next))
        .map(ground),
      ...RAMPS.filter(
        (ramp) =>
          sameCell(ramp.wall, from) && cellTerrain(state, ramp.ground.x, ramp.ground.y) === 'ramp',
      ).map((ramp) => ground(ramp.ground)),
    ];
  }

  const next = cardinal(from).filter((to) => groundPassable(state, unit.side, to));
  for (const ramp of RAMPS)
    if (sameCell(ramp.ground, from) && cellTerrain(state, from.x, from.y) === 'ramp')
      next.push(wall(ramp.wall));
  if (unit.side === 'shu') {
    if (isWallFoot(state, from.x, from.y) && state.mounds[cellKey(from)] === T.moundComplete)
      next.push(wall({ x: from.x, y: from.y - 1 }));
  }
  return next;
}

interface SearchNode {
  position: SiegePosition;
  cost: number;
  previous?: string;
}

/** Budget-limited Dijkstra search, with a stable cell-index tie break. */
function search(
  start: SiegePosition,
  budget: number,
  neighbors: (from: SiegePosition) => SiegePosition[],
  cost: (to: SiegePosition) => number,
  blocked: (to: SiegePosition) => boolean,
): Map<string, SearchNode> {
  const startKey = positionKey(start);
  const nodes = new Map<string, SearchNode>([[startKey, { position: start, cost: 0 }]]);
  const open = new Set([startKey]);
  while (open.size) {
    const key = [...open].sort((a, b) => {
      const first = nodes.get(a)!;
      const second = nodes.get(b)!;
      return (
        first.cost - second.cost || positionIndex(first.position) - positionIndex(second.position)
      );
    })[0]!;
    open.delete(key);
    const current = nodes.get(key)!;
    for (const next of neighbors(current.position)) {
      if (blocked(next)) continue;
      const candidate = current.cost + cost(next);
      const nextKey = positionKey(next);
      if (candidate > budget || candidate >= (nodes.get(nextKey)?.cost ?? Infinity)) continue;
      nodes.set(nextKey, { position: next, cost: candidate, previous: key });
      open.add(nextKey);
    }
  }
  return nodes;
}

function unitSearch(state: SiegeState, unitId: string, budget?: number): Map<string, SearchNode> {
  const unit = state.units.find((entry) => entry.id === unitId);
  if (
    !unit ||
    unit.troops <= 0 ||
    unit.routed ||
    (budget === undefined && (unit.moved || unit.acted)) ||
    !isMapCell(unit.x, unit.y)
  )
    return new Map();
  if (unit.level === 'wall' ? !isWalkway(state, unit) : !groundPassable(state, unit.side, unit))
    return new Map();
  const occupied = new Set(
    state.units
      .filter((other) => other.id !== unitId && other.troops > 0 && other.side !== unit.side)
      .map(cellKey),
  );
  for (const engine of state.engines) {
    // A usable ladder admits troops before or after raising, in either action order.
    // Wrecks occupy nothing. Other usable engines block their ground cell.
    if (!engine.wrecked && engine.durability > 0 && engine.kind !== 'ladder')
      occupied.add(cellKey(engine));
  }
  return search(
    { x: unit.x, y: unit.y, level: unit.level },
    budget ?? movementBudget(unit.troopType),
    (from) => unitNeighbors(state, unit, from),
    (to) => {
      const terrain = cellTerrain(state, to.x, to.y);
      return to.level === 'ground' && (terrain === 'hill' || terrain === 'wood') ? 2 : 1;
    },
    (to) => occupied.has(cellKey(to)),
  );
}

function destinations(nodes: Map<string, SearchNode>): ReachableCell[] {
  return [...nodes.values()]
    .filter((node) => node.cost > 0)
    .map(({ position, cost }) => ({ ...position, cost }))
    .sort((a, b) => a.cost - b.cost || positionIndex(a) - positionIndex(b));
}

/** Excludes the origin; costs include terrain and ascent steps. Does not mutate state. */
export function reachableCells(state: SiegeState, unitId: string): ReachableCell[] {
  return destinations(unitSearch(state, unitId)).filter((p) => canStop(state, unitId, p));
}

/** Includes both endpoints. Returns null if the destination cannot be reached this move. */
export function pathTo(
  state: SiegeState,
  unitId: string,
  x: number,
  y: number,
  level: SiegeLevel,
): SiegePosition[] | null {
  if (!canStop(state, unitId, { x, y, level })) return null;
  const nodes = unitSearch(state, unitId);
  let node = nodes.get(positionKey({ x, y, level }));
  if (!node) return null;
  const path: SiegePosition[] = [];
  while (node) {
    path.push({ ...node.position });
    node = node.previous === undefined ? undefined : nodes.get(node.previous);
  }
  return path.reverse();
}

export function engineReachable(state: SiegeState, engineId: string): ReachableCell[] {
  const engine = state.engines.find((entry) => entry.id === engineId);
  if (
    !engine ||
    engine.wrecked ||
    engine.durability <= 0 ||
    engine.moved ||
    engine.acted ||
    engine.raisedAt ||
    !isMapCell(engine.x, engine.y)
  )
    return [];
  const passable = ({ x, y }: Cell): boolean => {
    if (!isMapCell(x, y)) return false;
    if (engine.kind !== 'ram') return cellTerrain(state, x, y) === 'plain';
    const symbol = layoutSymbol(x, y);
    const gate = gateAt(x, y);
    return (
      (cellTerrain(state, x, y) === 'plain' && symbol !== '-') ||
      (gate !== undefined && state.gates[gate].broken)
    );
  };
  const occupied = new Set([
    ...state.units.filter((unit) => unit.troops > 0).map(cellKey),
    ...state.engines
      .filter((other) => other.id !== engineId && !other.wrecked && other.durability > 0)
      .map(cellKey),
  ]);
  return destinations(
    search(
      ground(engine),
      ENGINE_RULES[engine.kind].move,
      (from) => cardinal(from).filter(passable),
      () => 1,
      (to) => occupied.has(cellKey(to)),
    ),
  );
}

/** Strict interior: boundary cells belong to the wall, not the city floor. */
export function insideCity({ x, y }: Cell): boolean {
  return (
    x > CITY_BOUNDS.west && x < CITY_BOUNDS.east && y > CITY_BOUNDS.north && y < CITY_BOUNDS.south
  );
}

function canStop(state: SiegeState, unitId: string, p: SiegePosition): boolean {
  return !state.units.some((u) => u.id !== unitId && u.troops > 0 && sameCell(u, p));
}

/** Unlimited walking distances for guidance, including after today's move/action. */
export function walkingDistances(state: SiegeState, unitId: string): ReachableCell[] {
  return [...unitSearch(state, unitId, Infinity).values()]
    .filter(({ position }) => canStop(state, unitId, position))
    .map(({ position, cost }) => ({ ...position, cost }))
    .sort((a, b) => a.cost - b.cost || positionIndex(a) - positionIndex(b));
}

/** Occupied allied cells are separate from ordinary move destinations. */
export function swapTargets(state: SiegeState, unitId: string): SiegeUnit[] {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return [];
  const nodes = unitSearch(state, unitId);
  return state.units.filter(
    (other) =>
      other.id !== unitId &&
      other.side === unit.side &&
      other.troops > 0 &&
      !other.moved &&
      !other.acted &&
      nodes.has(positionKey(other)),
  );
}

/** Make way stays on the walkway; spent actions do not prevent giving way. */
export function makeWayDestination(state: SiegeState, ally: SiegeUnit): SiegePosition | null {
  if (ally.moved || ally.level !== 'wall' || ally.troops <= 0) return null;
  const occupied = state.units.filter((u) => u.id !== ally.id && u.troops > 0);
  const nodes = search(
    wall(ally),
    movementBudget(ally.troopType),
    (from) => cardinal(from).filter((p) => isWalkway(state, p)),
    () => 1,
    (p) => occupied.some((u) => u.side !== ally.side && sameCell(u, p)),
  );
  const gates = Object.values(GATES).flatMap((gate) => gate.cells);
  const gateDistance = (p: Cell) =>
    Math.min(...gates.map((g) => Math.abs(g.x - p.x) + Math.abs(g.y - p.y)));
  const to = destinations(nodes)
    .filter((p) => canStop(state, ally.id, p))
    .sort(
      (a, b) =>
        a.cost - b.cost || gateDistance(a) - gateDistance(b) || positionIndex(a) - positionIndex(b),
    )[0];
  return to ? { x: to.x, y: to.y, level: to.level } : null;
}
