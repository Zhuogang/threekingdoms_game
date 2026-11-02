import {
  CITY_BOUNDS,
  COURTYARD,
  GATES,
  SHU_ROSTER,
  SOUTH_TRENCH,
  sameCell,
} from '../content/chencang';
import { applySiegeAction } from '../rules/actions';
import { activeUnit, distance, predictSiegeAttack, usableEngine } from '../rules/combat';
import { WAVERING_MORALE } from '../rules/constants';
import { endDay } from '../rules/day';
import { cellTerrain, isWallFoot } from '../rules/map';
import type {
  Cell,
  EngineKind,
  SiegeAction,
  SiegeDefenderTurn,
  SiegeEngine,
  SiegePosition,
  SiegeState,
  SiegeUnit,
} from '../rules/types';
import { routeSiegeActor, runDefenderTurn } from './defender';

export type ShuStrategy = 'competent' | 'brute';

const ground = (cell: Cell): SiegePosition => ({ ...cell, level: 'ground' });
const openingTroops = (unit: SiegeUnit): number =>
  SHU_ROSTER.find((entry) => entry.id === unit.id)?.troops ?? unit.troops + unit.wounded;
const freshness = (unit: SiegeUnit): number => unit.troops / openingTroops(unit);
// Two independent cart lanes; ladders stand beside them so a raised ladder cannot block carts.
const cartColumns = [20, 28] as const;

function queueKind(state: SiegeState, workshopId: string): EngineKind {
  // Each flank gets both tools without crossing the other workshop's traffic.
  const opening: EngineKind[] =
    workshopId === 'workshop-1' ? ['earthCart', 'ladder'] : ['ladder', 'earthCart'];
  const builtOrQueued = (kind: EngineKind) =>
    state.log.filter((entry) => entry.code === 'engineCompleted' && entry.params.kind === kind)
      .length + state.workshops.filter((w) => w.queue === kind).length;
  for (const kind of opening) {
    const builtHere = state.log.some(
      (entry) =>
        entry.code === 'engineCompleted' &&
        entry.params.kind === kind &&
        entry.params.workshopId === workshopId,
    );
    if (!builtHere && !state.workshops.some((w) => w.id === workshopId && w.queue === kind))
      return kind;
  }
  if (builtOrQueued('ram') < 1) return 'ram';
  const count = (kind: EngineKind) =>
    state.engines.filter((e) => e.kind === kind && usableEngine(e)).length +
    state.workshops.filter((w) => w.queue === kind).length;
  if (state.act === 2 && count('tower') < 1) return 'tower';
  if (count('earthCart') < 2 && cartColumns.some((x) => state.trenchFill[`${x},17`] !== 3))
    return 'earthCart';
  if (count('ladder') < 2) return 'ladder';
  if (!state.gates.south.broken && count('ram') < 1) return 'ram';
  return state.act === 2 ? 'tower' : 'earthCart';
}

function engineGoal(state: SiegeState, engine: SiegeEngine): SiegePosition[] {
  const west =
    engine.id.startsWith('workshop-1') || (!engine.id.startsWith('workshop-2') && engine.x < 24);
  if (engine.kind === 'earthCart') {
    const columns = west ? [...cartColumns] : [...cartColumns].reverse();
    for (const x of columns) {
      for (const y of [18, 17]) {
        if (state.trenchFill[`${x},${y}`] !== 3) return [ground({ x, y: y + 1 })];
      }
    }
    return [];
  }
  if (engine.kind === 'ladder') {
    const columns = west ? [21, 19, 22, 18] : [27, 29, 26, 30];
    return columns
      .filter(
        (x) =>
          !state.engines.some((e) => e.id !== engine.id && e.raisedAt?.x === x && usableEngine(e)),
      )
      .map((x, order) => ({
        x,
        pressure: state.units
          .filter((u) => u.side === 'wei' && activeUnit(u) && u.level === 'wall')
          .reduce((sum, u) => sum + Math.max(0, 4 - distance(u, { x, y: 16 })), 0),
        order,
      }))
      .sort((a, b) => a.pressure - b.pressure || a.order - b.order)
      .slice(0, 1)
      .map(({ x }) => ground({ x, y: 19 }));
  }
  if (engine.kind === 'ram') return GATES.south.approaches.map(ground);
  return [ground({ x: west ? 22 : 25, y: 19 })];
}

function assaultPoints(state: SiegeState): SiegePosition[] {
  const points: SiegePosition[] = [];
  for (const e of state.engines) {
    if (usableEngine(e) && e.raisedAt) {
      points.push({ ...e.raisedAt, level: 'wall' });
      points.push(ground(e));
    }
  }
  for (const cell of SOUTH_TRENCH) {
    if (isWallFoot(state, cell.x, cell.y)) {
      points.push({ x: cell.x, y: cell.y - 1, level: 'wall' });
      points.push(ground(cell));
    }
  }
  return points;
}

function firingPositions(state: SiegeState, target: Cell, range: number): SiegePosition[] {
  const goals: SiegePosition[] = [];
  for (let y = target.y - range; y <= target.y + range; y++) {
    for (let x = target.x - range; x <= target.x + range; x++) {
      if (distance(target, { x, y }) > range || y < CITY_BOUNDS.south) continue;
      if (['plain', 'gate', 'ramp'].includes(cellTerrain(state, x, y)))
        goals.push(ground({ x, y }));
    }
  }
  return goals;
}

function unitGoals(state: SiegeState, unit: SiegeUnit, strategy: ShuStrategy): SiegePosition[] {
  if (state.gates.south.broken || unit.level === 'wall' || unit.y < CITY_BOUNDS.south)
    return COURTYARD.map(ground);
  if (strategy === 'competent') {
    const points = assaultPoints(state);
    if (unit.troopType === 'infantry' && points.length) {
      // Prefer an empty parapet to waiting below an occupied climbing point.
      const freeWall = points.filter(
        (p) =>
          p.level === 'wall' &&
          !state.units.some((u) => u.troops > 0 && u.level === 'wall' && sameCell(u, p)),
      );
      if (freeWall.length) return freeWall;
      return points.filter((p) => p.level === 'ground');
    }
    if (unit.troopType === 'archer' && points.length) {
      const wallPoints = points.filter((p) => p.level === 'wall');
      return wallPoints
        .flatMap((p) => firingPositions(state, p, 2))
        .filter((p) => p.x !== 23 && p.x !== 24);
    }
    // Leave the bridge and the cart/ladder lanes clear while engines approach.
    const columns = unit.x < 24 ? [17, 18, 22] : [25, 26, 30, 31];
    return columns.flatMap((x) => [20, 21].map((y) => ground({ x, y })));
  }
  return GATES.south.cells.flatMap((cell) =>
    firingPositions(state, cell, unit.troopType === 'archer' ? 2 : 1),
  );
}

function attackAction(
  state: SiegeState,
  unit: SiegeUnit,
  strategy: ShuStrategy,
): SiegeAction | null {
  const points = assaultPoints(state);
  const candidates = state.units
    .filter((u) => u.side === 'wei' && u.troops > 0)
    .map((target) => ({ target, forecast: predictSiegeAttack(state, unit, target) }))
    .filter((entry) => entry.forecast?.inRange)
    .sort((a, b) => {
      const score = (entry: typeof a) =>
        entry.forecast!.casualties +
        (points.some((p) => p.level === 'wall' && sameCell(p, entry.target)) ? 200 : 0);
      return score(b) - score(a);
    });
  const target = candidates[0]?.target;
  if (target) return { type: 'attack', unitId: unit.id, targetId: target.id };
  if (
    (strategy === 'brute' || unit.troopType === 'archer') &&
    predictSiegeAttack(state, unit, 'south')?.inRange
  )
    return { type: 'attack', unitId: unit.id, gateId: 'south' };
  return null;
}

/** One scripted Shu day. The optional callback lets the simulator time the same Wei AI.
 * All choices are deterministic; wall-clock measurements never enter the game state.
 */
export function runShuScript(
  state: SiegeState,
  strategy: ShuStrategy,
  defenderTurn: SiegeDefenderTurn = runDefenderTurn,
): SiegeState {
  if (state.outcome) return state;
  let next = state;
  const act = (action: SiegeAction | null) => {
    if (!action) return;
    const result = applySiegeAction(next, action);
    if (result.ok) next = result.state;
  };
  if (strategy === 'competent') {
    for (const workshop of state.workshops) {
      // Keep both workshops busy without overcommitting the six-engine limit.
      const committed =
        next.engines.filter(usableEngine).length +
        next.workshops.filter((w) => w.queue !== null).length;
      if (committed >= 6) break;
      const kind = queueKind(next, workshop.id);
      if (workshop.queue === null) act({ type: 'queueEngine', workshopId: workshop.id, kind });
    }
  }
  if (!next.ordersUsed.shu[next.day]) {
    const wounded = next.units
      .filter(
        (u) =>
          u.side === 'shu' &&
          activeUnit(u) &&
          u.wounded > 0 &&
          u.rotateRecoveryDay === undefined &&
          (freshness(u) < 0.5 || u.morale < WAVERING_MORALE),
      )
      .sort((a, b) => b.wounded - a.wounded)[0];
    const queued = next.workshops
      .filter((w) => w.queue !== null && w.daysRemaining > 0)
      .sort((a, b) => b.daysRemaining - a.daysRemaining)[0];
    const lowest = next.units
      .filter((u) => u.side === 'shu' && u.troops > 0)
      .sort((a, b) => a.morale - b.morale)[0];
    if (strategy === 'competent' && wounded)
      act({ type: 'order', side: 'shu', kind: 'rotate', target: wounded.id });
    else if (strategy === 'competent' && queued)
      act({ type: 'order', side: 'shu', kind: 'supervise', target: queued.id });
    else if (lowest) act({ type: 'order', side: 'shu', kind: 'rally', target: lowest.id });
  }
  if (strategy === 'competent') {
    const engines = next.engines
      .filter(usableEngine)
      .sort((a, b) => (a.kind === 'earthCart' ? 0 : 1) - (b.kind === 'earthCart' ? 0 : 1));
    for (const engine of engines) {
      const goals = engineGoal(next, engine);
      act(routeSiegeActor(next, engine, goals)?.action ?? null);
      const current = next.engines.find((e) => e.id === engine.id);
      if (!current || !usableEngine(current) || current.acted) continue;
      if (current.kind === 'earthCart') {
        const cell = SOUTH_TRENCH.find(
          (c) =>
            cartColumns.includes(c.x as (typeof cartColumns)[number]) &&
            distance(c, current) === 1 &&
            next.trenchFill[`${c.x},${c.y}`] !== 3 &&
            (c.y === 18 || next.trenchFill[`${c.x},18`] === 3),
        );
        if (cell) act({ type: 'fillTrench', engineId: current.id, ...cell });
      } else if (
        current.kind === 'ladder' &&
        !current.raisedAt &&
        goals.some((g) => sameCell(g, current))
      ) {
        act({ type: 'raiseLadder', engineId: current.id });
      } else if (current.kind === 'ram') {
        act({ type: 'ram', engineId: current.id, gateId: 'south' });
      } else if (current.kind === 'tower') {
        const target = next.units
          .filter((u) => u.side === 'wei' && u.troops > 0)
          .find((u) => predictSiegeAttack(next, current, u)?.inRange);
        if (target) act({ type: 'attack', engineId: current.id, targetId: target.id });
      }
    }
  }
  const units = next.units
    .filter((u) => u.side === 'shu' && activeUnit(u))
    .sort(
      (a, b) =>
        (a.troopType === 'infantry' ? 0 : 1) - (b.troopType === 'infantry' ? 0 : 1) ||
        freshness(b) - freshness(a),
    );
  for (const initial of units) {
    let unit = next.units.find((u) => u.id === initial.id)!;
    if (!activeUnit(unit) || unit.acted) continue;
    // An unoccupied climb or a path inside takes precedence over firing from below.
    act(routeSiegeActor(next, unit, unitGoals(next, unit, strategy))?.action ?? null);
    unit = next.units.find((u) => u.id === initial.id)!;
    act(attackAction(next, unit, strategy));
    if (
      strategy === 'competent' &&
      !next.units.find((u) => u.id === unit.id)!.acted &&
      unit.troopType === 'infantry' &&
      unit.level === 'ground'
    ) {
      const fill = SOUTH_TRENCH.find(
        (c) =>
          cartColumns.includes(c.x as (typeof cartColumns)[number]) &&
          distance(unit, c) === 1 &&
          next.trenchFill[`${c.x},${c.y}`] !== 3 &&
          (c.y === 18 || next.trenchFill[`${c.x},18`] === 3),
      );
      if (fill) act({ type: 'fillTrench', unitId: unit.id, ...fill });
    }
  }
  return endDay(next, defenderTurn);
}
