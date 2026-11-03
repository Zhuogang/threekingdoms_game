import {
  CITY_BOUNDS,
  COURTYARD,
  GATES,
  INNER_WALL_SEGMENTS,
  MAP_HEIGHT,
  MAP_WIDTH,
  RAMPS,
  SOUTH_TRENCH,
  WEI_ROSTER,
  cellKey,
  layoutSymbol,
  sameCell,
} from '../content/chencang';
import { applySiegeAction } from '../rules/actions';
import {
  activeUnit,
  climbingFrontage,
  distance,
  predictSiegeAttack,
  siegeAttackInRange,
  usableEngine,
  wallRun,
} from '../rules/combat';
import { WAVERING_MORALE } from '../rules/constants';
import { cellTerrain, gateAt, isMapCell, isWallFoot } from '../rules/map';
import { engineReachable, reachableCells } from '../rules/movement';
import type {
  Cell,
  GateId,
  SiegeAction,
  SiegeEngine,
  SiegePosition,
  SiegeState,
  SiegeUnit,
} from '../rules/types';

const area = MAP_WIDTH * MAP_HEIGHT;
const indexOf = (p: SiegePosition): number =>
  (p.level === 'wall' ? area : 0) + p.y * MAP_WIDTH + p.x;
const positionOf = (index: number): SiegePosition => ({
  x: index % MAP_WIDTH,
  y: Math.floor((index % area) / MAP_WIDTH),
  level: index >= area ? 'wall' : 'ground',
});
const ground = (cell: Cell): SiegePosition => ({ ...cell, level: 'ground' });
const wall = (cell: Cell): SiegePosition => ({ ...cell, level: 'wall' });
const adjacent = ({ x, y }: Cell): Cell[] => [
  { x, y: y - 1 },
  { x: x + 1, y },
  { x, y: y + 1 },
  { x: x - 1, y },
];
const rampCells = new Map(RAMPS.flatMap((r) => r.cells.map((c) => [cellKey(c), r] as const)));

/** Shared strategic routing for both AIs. The rules still validate every actual move.
 * Search beyond today's budget so detours to ramps, bridges and workshop exits make progress.
 */
export function routeSiegeActor(
  state: SiegeState,
  actor: SiegeUnit | SiegeEngine,
  goals: SiegePosition[],
): { action: SiegeAction; distance: number } | null {
  if (actor.moved || actor.acted || !isMapCell(actor.x, actor.y) || !goals.length) return null;
  const unit = 'side' in actor ? actor : undefined;
  const start = unit ? indexOf(unit) : indexOf(ground(actor));
  const targets = new Set(goals.filter((p) => isMapCell(p.x, p.y)).map(indexOf));
  if (targets.has(start)) return null;
  const reachable = unit ? reachableCells(state, actor.id) : engineReachable(state, actor.id);
  if (!reachable.length) return null;
  const terrain = Array.from({ length: area }, (_, i) =>
    cellTerrain(state, i % MAP_WIDTH, Math.floor(i / MAP_WIDTH)),
  );
  const walkable = (p: Cell): boolean =>
    isMapCell(p.x, p.y) && ['wall', 'gate'].includes(terrain[p.y * MAP_WIDTH + p.x]!);
  const ladders = state.engines.filter(
    (e) => e.kind === 'ladder' && usableEngine(e) && e.raisedAt && walkable(e.raisedAt),
  );
  const blocked = new Set(
    state.units.filter((u) => u.id !== actor.id && u.troops > 0).map(indexOf),
  );
  for (const engine of state.engines) {
    if (engine.id !== actor.id && (!unit || !ladders.includes(engine)))
      blocked.add(indexOf(ground(engine)));
  }
  const groundPassable = (p: Cell): boolean => {
    if (!isMapCell(p.x, p.y)) return false;
    const t = terrain[p.y * MAP_WIDTH + p.x];
    if (!unit) {
      const gate = gateAt(p.x, p.y);
      return 'kind' in actor && actor.kind === 'ram'
        ? (t === 'plain' && layoutSymbol(p.x, p.y) !== '-') ||
            (gate !== undefined && state.gates[gate].broken)
        : t === 'plain';
    }
    if (['water', 'trench', 'building', 'wall'].includes(t!)) return false;
    const gate = gateAt(p.x, p.y);
    return t !== 'gate' || unit.side === 'wei' || (gate !== undefined && state.gates[gate].broken);
  };
  const neighbors = (from: SiegePosition): SiegePosition[] => {
    if (!unit) return adjacent(from).filter(groundPassable).map(ground);
    if (from.level === 'wall') {
      return [
        ...adjacent(from).filter(walkable).map(wall),
        ...RAMPS.filter((r) => sameCell(r.wall, from)).map((r) => ground(r.cells.at(-1)!)),
      ];
    }
    const ramp = rampCells.get(cellKey(from));
    if (ramp) {
      const i = ramp.cells.findIndex((c) => sameCell(c, from));
      const next: SiegePosition[] = [];
      if (i > 0) next.push(ground(ramp.cells[i - 1]!));
      if (i < ramp.cells.length - 1) next.push(ground(ramp.cells[i + 1]!));
      if (i === 0 && groundPassable(ramp.ground)) next.push(ground(ramp.ground));
      if (i === ramp.cells.length - 1) next.push(wall(ramp.wall));
      return next;
    }
    const next = adjacent(from)
      .filter((p) => {
        const r = rampCells.get(cellKey(p));
        return groundPassable(p) && (!r || (sameCell(from, r.ground) && sameCell(p, r.cells[0]!)));
      })
      .map(ground);
    if (unit.side === 'shu') {
      if (isWallFoot(state, from.x, from.y)) next.push(wall({ x: from.x, y: from.y - 1 }));
      for (const ladder of ladders) if (sameCell(ladder, from)) next.push(wall(ladder.raisedAt!));
    }
    return next;
  };
  // Integer movement costs allow a bucketed Dijkstra without sorting the frontier.
  const costs = new Float64Array(area * 2).fill(Infinity);
  const previous = new Int32Array(area * 2).fill(-1);
  const buckets: number[][] = [[start]];
  costs[start] = 0;
  for (let cost = 0; cost < buckets.length; cost++) {
    for (const current of buckets[cost] ?? []) {
      if (costs[current] !== cost) continue;
      if (targets.has(current)) {
        const available = new Map(reachable.map((p) => [indexOf(p), p]));
        let step = current;
        while (step !== start && !available.has(step)) step = previous[step]!;
        const to = available.get(step);
        if (!to) return null;
        return {
          action: unit
            ? { type: 'move', unitId: unit.id, x: to.x, y: to.y, level: to.level }
            : { type: 'moveEngine', engineId: actor.id, x: to.x, y: to.y },
          distance: cost,
        };
      }
      for (const next of neighbors(positionOf(current))) {
        const index = indexOf(next);
        if (blocked.has(index)) continue;
        const t = terrain[index % area];
        const candidate = cost + (unit && (t === 'hill' || t === 'wood') ? 2 : 1);
        if (candidate >= costs[index]!) continue;
        costs[index] = candidate;
        previous[index] = current;
        (buckets[candidate] ??= []).push(index);
      }
    }
  }
  return null;
}

interface Candidate {
  action: SiegeAction;
  score: number;
}
interface Threat extends Cell {
  pressure: number;
}

function wallThreats(state: SiegeState): Threat[] {
  const threats = new Map<string, Threat>();
  const add = (cell: Cell, pressure: number) => {
    const key = cellKey(cell);
    threats.set(key, { ...cell, pressure: (threats.get(key)?.pressure ?? 0) + pressure });
  };
  for (const engine of state.engines) {
    if (!usableEngine(engine)) continue;
    if (engine.raisedAt) add(engine.raisedAt, 3);
    else if (engine.kind === 'ladder' && engine.y <= 21 && engine.y >= 19)
      add({ x: Math.max(15, Math.min(32, engine.x)), y: 16 }, 3);
  }
  for (const foot of SOUTH_TRENCH)
    if (isWallFoot(state, foot.x, foot.y)) add({ x: foot.x, y: foot.y - 1 }, 2);
    else if (foot.y === 17 && state.trenchFill[`${foot.x},18`] === 3) add({ x: foot.x, y: 16 }, 1);
  for (const unit of state.units)
    if (unit.side === 'shu' && activeUnit(unit) && unit.level === 'wall') add(unit, 6);
  return [...threats.values()];
}

const inside = (unit: SiegeUnit): boolean =>
  unit.level === 'wall' ||
  (unit.x > CITY_BOUNDS.west &&
    unit.x < CITY_BOUNDS.east &&
    unit.y > CITY_BOUNDS.north &&
    unit.y < CITY_BOUNDS.south);
const intruders = (state: SiegeState): SiegeUnit[] =>
  state.units.filter((u) => u.side === 'shu' && activeUnit(u) && inside(u));
const inCourtyard = (unit: SiegeUnit): boolean =>
  unit.level === 'ground' && COURTYARD.some((c) => sameCell(c, unit));

const hurt = (u: SiegeUnit): boolean =>
  u.morale < WAVERING_MORALE ||
  u.troops < (WEI_ROSTER.find((entry) => entry.id === u.id)?.troops ?? u.troops + u.wounded) / 2;

function dailyOrder(state: SiegeState, threats: Threat[]): SiegeAction | null {
  if (state.ordersUsed.wei[state.day]) return null;
  const damaged = (Object.keys(GATES) as GateId[])
    .filter((id) => !state.gates[id].broken && state.gates[id].durability < state.gates[id].max / 2)
    .sort(
      (a, b) =>
        state.gates[a].durability / state.gates[a].max -
        state.gates[b].durability / state.gates[b].max,
    )[0];
  if (damaged) return { type: 'order', side: 'wei', kind: 'nightRepair', target: damaged };
  const pressed = threats
    .map((t) => ({
      cell: t,
      pressure: wallRun(state, t).reduce(
        (sum, c) => sum + (threats.find((other) => sameCell(c, other))?.pressure ?? 0),
        0,
      ),
    }))
    .sort((a, b) => b.pressure - a.pressure)[0];
  if (pressed?.pressure)
    return { type: 'order', side: 'wei', kind: 'holdFast', target: pressed.cell };
  const lowest = state.units
    .filter((u) => u.side === 'wei' && u.troops > 0)
    .sort((a, b) => a.morale - b.morale)[0];
  return lowest ? { type: 'order', side: 'wei', kind: 'rally', target: lowest.id } : null;
}

function immediateActions(state: SiegeState, unit: SiegeUnit): Candidate[] {
  const candidates: Candidate[] = [];
  for (const engine of state.engines.filter(usableEngine)) {
    if (
      engine.kind === 'ram' &&
      unit.level === 'wall' &&
      (unit.lastMillstoneDay === undefined || state.day - unit.lastMillstoneDay >= 2) &&
      Object.values(GATES).some(
        (g) =>
          g.approaches.some((c) => sameCell(c, engine)) &&
          (g.cells.some((c) => sameCell(c, unit)) ||
            (unit.x === engine.x && unit.y === engine.y - 1)),
      )
    )
      candidates.push({
        action: { type: 'dropMillstone', unitId: unit.id, engineId: engine.id },
        score: 10000,
      });
    if (unit.troopType === 'archer' && distance(unit, engine) <= (unit.level === 'wall' ? 3 : 2)) {
      const priority = engine.raisedAt
        ? 4
        : engine.kind === 'tower'
          ? 3
          : engine.kind === 'earthCart'
            ? 2
            : 1;
      candidates.push({
        action: { type: 'fireArrows', unitId: unit.id, engineId: engine.id },
        score: 8500 + priority * 100,
      });
    }
  }
  for (const target of state.units.filter((u) => u.side === 'shu' && u.troops > 0)) {
    if (
      unit.troopType === 'infantry' &&
      unit.level === 'wall' &&
      climbingFrontage(state, target, unit) !== null
    ) {
      candidates.push({
        action: { type: 'dropBoulders', unitId: unit.id, targetId: target.id },
        score: 7800,
      });
    }
    const forecast = predictSiegeAttack(state, unit, target);
    if (forecast?.inRange)
      candidates.push({
        action: { type: 'attack', unitId: unit.id, targetId: target.id },
        score: (inside(target) ? 9950 : 6500) + forecast.casualties / 100,
      });
  }
  return candidates;
}

function movementCandidate(
  state: SiegeState,
  unit: SiegeUnit,
  threats: Threat[],
  fallback: boolean,
  breach: SiegeUnit[],
): Candidate | null {
  const pressed = (p: Cell) => threats.some((t) => distance(t, p) <= 1);
  let goals: SiegePosition[] = [];
  let score = 0;
  if (fallback) {
    if (inCourtyard(unit)) return null;
    goals = COURTYARD.map(ground);
    score = 9800;
  } else if (breach.length) {
    // Route to a legal attack position, including a ramp descent for a ground intruder.
    for (const target of breach) {
      const range = unit.troopType === 'archer' ? 3 : 1;
      for (let y = target.y - range; y <= target.y + range; y++) {
        for (let x = target.x - range; x <= target.x + range; x++) {
          if (!isMapCell(x, y)) continue;
          const terrain = cellTerrain(state, x, y);
          for (const level of ['wall', 'ground'] as const) {
            if (
              level === 'wall'
                ? !['wall', 'gate'].includes(terrain)
                : ['water', 'trench', 'building', 'wall'].includes(terrain)
            )
              continue;
            const position = { x, y, level };
            if (siegeAttackInRange(state, { ...unit, ...position }, target)) goals.push(position);
          }
        }
      }
    }
    score = 9600;
  } else if (hurt(unit) && unit.level === 'wall' && pressed(unit)) {
    goals = RAMPS.map((r) => ground(r.ground));
    score = 9200;
  } else if (!hurt(unit) && threats.length) {
    const occupied = (c: Cell) =>
      state.units.some((u) => u.troops > 0 && u.level === 'wall' && sameCell(u, c));
    // Cover the climbing cell itself before adding support beside a Shu foothold.
    const held = unit.level === 'wall' ? threats.find((t) => sameCell(t, unit)) : undefined;
    goals = threats.filter((t) => !occupied(t) && (!held || t.pressure > held.pressure)).map(wall);
    if (!goals.length)
      goals = threats
        .filter((t) =>
          state.units.some(
            (u) => u.side === 'shu' && activeUnit(u) && u.level === 'wall' && sameCell(u, t),
          ),
        )
        .flatMap(adjacent)
        .filter((c) => ['wall', 'gate'].includes(cellTerrain(state, c.x, c.y)) && !occupied(c))
        .map(wall);
    score = 9000;
  }
  // Wall archers follow work columns instead of waiting at their opening posts.
  // Keep archers covering a climb; free archers can reach a firing position before acting.
  if (
    !fallback &&
    !breach.length &&
    unit.troopType === 'archer' &&
    !threats.some((t) => unit.level === 'wall' && sameCell(t, unit))
  ) {
    const targets = [
      ...state.engines
        .filter((e) => usableEngine(e) && e.y >= 18 && e.y <= 19)
        .map((e) => ({ ...e, priority: e.raisedAt ? 4 : e.kind === 'earthCart' ? 3 : 2 })),
      ...state.units
        .filter(
          (u) =>
            u.side === 'shu' &&
            activeUnit(u) &&
            u.troopType === 'infantry' &&
            u.level === 'ground' &&
            u.y >= 18 &&
            u.y <= 19,
        )
        .map((u) => ({ ...u, priority: 1 })),
    ].sort((a, b) => b.priority - a.priority || distance(unit, a) - distance(unit, b));
    for (const target of targets) {
      const positions = [-1, 0, 1]
        .map((dx) => wall({ x: target.x + dx, y: 16 }))
        .filter(
          (p) =>
            ['wall', 'gate'].includes(cellTerrain(state, p.x, p.y)) && distance(p, target) <= 3,
        );
      if (positions.some((p) => unit.level === 'wall' && sameCell(p, unit)) && !goals.length)
        return null;
      const route = routeSiegeActor(state, unit, positions);
      if (
        route &&
        (!goals.length ||
          (target.priority > 1 &&
            route.action.type === 'move' &&
            positions.some(
              (p) =>
                route.action.type === 'move' &&
                p.level === route.action.level &&
                sameCell(p, route.action),
            )))
      )
        return { action: route.action, score: 9100 + target.priority * 10 - route.distance };
    }
  }
  if (!goals.length && !fallback && !breach.length && state.act === 2 && !pressed(unit)) {
    const segments = INNER_WALL_SEGMENTS.filter((s) => state.innerWall[s.index] !== 4)
      .map((s) => ({
        ...s,
        gaps: threats
          .filter((t) => s.cells.some((c) => Math.abs(c.x - t.x) <= 1))
          .reduce((sum, t) => sum + t.pressure, 0),
      }))
      .sort((a, b) => b.gaps - a.gaps || a.index - b.index);
    for (const segment of segments) {
      if (unit.level === 'ground' && segment.cells.some((c) => sameCell(c, unit)))
        return { action: { type: 'buildWall', unitId: unit.id }, score: 5000 + segment.gaps };
      const route = routeSiegeActor(state, unit, segment.cells.map(ground));
      if (route) return { action: route.action, score: 5000 + segment.gaps - route.distance };
    }
  }
  if (goals.length) {
    const route = routeSiegeActor(state, unit, goals);
    if (route) return { action: route.action, score: score - route.distance };
  }
  // Only archers have a legal ground action against an engine in the current rules.
  if (!fallback && !threats.length && unit.troopType === 'archer') {
    const isolated = state.engines.filter(
      (e) =>
        usableEngine(e) &&
        (e.kind === 'ram' || e.kind === 'earthCart') &&
        (e.x === 23 || e.x === 24) &&
        e.y >= 17 &&
        e.y <= 19 &&
        !state.units.some((u) => u.side === 'shu' && u.troops > 0 && distance(u, e) <= 2),
    );
    const route = routeSiegeActor(
      state,
      unit,
      isolated.flatMap((e) => adjacent(e).map(ground)),
    );
    if (route) return { action: route.action, score: 1000 - route.distance };
  }
  // A previous sortie returns to the rampart when its narrow opportunity closes.
  if (!fallback && unit.level === 'ground' && unit.y > CITY_BOUNDS.south && !goals.length) {
    const route = routeSiegeActor(state, unit, GATES.south.cells.map(wall));
    if (route) return { action: route.action, score: 900 - route.distance };
  }
  return null;
}

/** Plans against an isolated evolving state, reserving destinations and spent actions. */
export function planDefenderTurn(state: SiegeState): SiegeAction[] {
  let draft = state;
  const actions: SiegeAction[] = [];
  const accept = (action: SiegeAction): boolean => {
    const result = applySiegeAction(draft, action);
    if (!result.ok) return false;
    draft = result.state;
    actions.push(action);
    return true;
  };
  if (state.outcome) return actions;
  const order = dailyOrder(draft, wallThreats(draft));
  if (order) accept(order);
  const defenders = draft.units.filter((u) => u.side === 'wei' && activeUnit(u));
  const breached =
    intruders(draft).length > 0 ||
    Object.values(draft.gates).some((g) => g.broken) ||
    defenders.some(inCourtyard) ||
    draft.log.some((entry) => entry.code === 'defenderBreach');
  const garrison = new Set(
    breached
      ? defenders
          .map((unit) => ({
            unit,
            distance: inCourtyard(unit)
              ? -1
              : (routeSiegeActor(
                  draft,
                  { ...unit, moved: false, acted: false },
                  COURTYARD.map(ground),
                )?.distance ?? Infinity),
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 2)
          .map(({ unit }) => unit.id)
      : [],
  );
  const rejected = new Set<string>();
  // Each unit can move once and act once. Re-score after each accepted action.
  const limit = state.units.filter((u) => u.side === 'wei').length * 2;
  for (let step = 0; step < limit && !draft.outcome; step++) {
    const threats = wallThreats(draft);
    const breach = intruders(draft);
    const candidates = draft.units
      .filter((u) => u.side === 'wei' && activeUnit(u) && !u.acted)
      .flatMap((unit) => {
        const immediate = immediateActions(draft, unit);
        const movement = movementCandidate(draft, unit, threats, garrison.has(unit.id), breach);
        return movement ? [...immediate, movement] : immediate;
      })
      .filter((c) => !rejected.has(JSON.stringify(c.action)))
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) break;
    if (!accept(best.action)) {
      rejected.add(JSON.stringify(best.action));
      step--;
    }
  }
  return actions;
}

/** Suitable as endDay's defenderTurn callback. Rejected actions are harmlessly skipped. */
export function runDefenderTurn(state: SiegeState): SiegeState {
  let next = state;
  if (
    !state.outcome &&
    intruders(state).length &&
    !state.log.some((entry) => entry.code === 'defenderBreach')
  ) {
    next = structuredClone(state);
    next.log.push({ day: state.day, code: 'defenderBreach', params: {} });
  }
  for (const action of planDefenderTurn(next)) {
    const result = applySiegeAction(next, action);
    if (result.ok) next = result.state;
  }
  return next;
}
