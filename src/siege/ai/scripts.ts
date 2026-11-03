import {
  CITY_BOUNDS,
  COURTYARD,
  GATES,
  WORKSHOPS,
  cellKey,
  SHU_ROSTER,
  SOUTH_TRENCH,
  sameCell,
  layoutSymbol,
} from '../content/chencang';
import { applySiegeAction } from '../rules/actions';
import { activeUnit, distance, predictSiegeAttack, usableEngine } from '../rules/combat';
import { WAVERING_MORALE, tacticalSeed } from '../rules/constants';
import { endDay } from '../rules/day';
import { cellTerrain, gateAt, isMapCell, isWallFoot } from '../rules/map';
import { engineReachable, pathTo, reachableCells } from '../rules/movement';
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
/** Independent seed hashes keep script variety separate from the weather RNG. */
export function competentPlan(seed: number) {
  const hash = (name: string) => {
    let value = tacticalSeed(name, seed);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
  };
  const choice = (name: string, count: number) => hash(`shu-${name}`) % count;
  const count = 2 + choice('lanes', 3);
  const flank = (xs: number[]) => xs.sort((a, b) => hash(`lane-${a}`) - hash(`lane-${b}`));
  const west = flank([17, 18, 19, 20, 21, 22]);
  const east = [28, ...flank([25, 26, 27, 29, 30, 31, 32])];
  return {
    columns: [...west.slice(0, Math.ceil(count / 2)), ...east.slice(0, Math.floor(count / 2))],
    cartFirst: choice('queue', 2) === 0,
    ramDay: 5 + choice('ram', 5),
    rotation: 0.4 + choice('rotation', 4) * 0.1,
  };
}

function queueKind(state: SiegeState, workshopId: string): EngineKind | null {
  // Each flank gets both tools without crossing the other workshop's traffic.
  // The east cart probes the short route around its workshop before the main assault.
  const cartFirst = workshopId === 'workshop-2' || competentPlan(state.seed).cartFirst;
  const opening: EngineKind[] = cartFirst ? ['earthCart', 'ladder'] : ['ladder', 'earthCart'];
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
  // Deploy the four opening tools before the next construction wave crowds their exits.
  const openingTools = state.log.filter(
    (entry) =>
      entry.code === 'engineCompleted' &&
      ['earthCart', 'ladder'].includes(String(entry.params.kind)),
  );
  if (
    openingTools.length < 4 ||
    openingTools
      .slice(0, 4)
      .some(
        (entry) =>
          !state.log.some(
            (arrival) =>
              arrival.code === 'shuEngineArrived' &&
              arrival.params.engineId === entry.params.engineId,
          ),
      )
  )
    return null;
  if (builtOrQueued('ram') < 1) return 'ram';
  const count = (kind: EngineKind) =>
    state.engines.filter((e) => e.kind === kind && usableEngine(e)).length +
    state.workshops.filter((w) => w.queue === kind).length;
  if (state.act === 2 && count('tower') < 1) return 'tower';
  if (
    count('earthCart') < 2 &&
    competentPlan(state.seed).columns.some((x) => state.trenchFill[`${x},17`] !== 3)
  )
    return 'earthCart';
  if (count('ladder') < 2) return 'ladder';
  if (!state.gates.south.broken && count('ram') < 1) return 'ram';
  return state.act === 2 ? 'tower' : 'earthCart';
}

function engineGoal(state: SiegeState, engine: SiegeEngine): SiegePosition[] {
  const west =
    engine.id.startsWith('workshop-1') || (!engine.id.startsWith('workshop-2') && engine.x < 24);
  if (engine.kind === 'earthCart') {
    const lanes = competentPlan(state.seed).columns;
    const columns = west ? lanes : [28, ...lanes.filter((x) => x !== 28).reverse()];
    return columns.flatMap((x) =>
      [18, 17]
        .filter(
          (y) =>
            state.trenchFill[`${x},${y}`] !== 3 && (y === 18 || state.trenchFill[`${x},18`] === 3),
        )
        .map((y) => ground({ x, y: y + 1 })),
    );
  }
  if (engine.kind === 'ladder') {
    // Keep ladder bases off the cart lanes so wrecks cannot seal both approaches.
    const columns = (west ? [15, 16, 17, 18, 19, 20, 21, 22] : [25, 26, 27, 28, 29, 30, 31]).filter(
      (x) => layoutSymbol(x, 16) === 'W' && !competentPlan(state.seed).columns.includes(x),
    );
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
      .map(({ x }) => ground({ x, y: 19 }));
  }
  if (engine.kind === 'ram') return GATES.south.approaches.map(ground);
  return [ground({ x: west ? 22 : 25, y: 19 })];
}

const isMainBody = (unit: SiegeUnit): boolean => unit.id === 'shu-zhugeliang';
const commandSafe = (state: SiegeState, cell: Cell): boolean =>
  cell.y >= CITY_BOUNDS.south + 5 &&
  state.units.every((u) => u.side !== 'wei' || u.troops <= 0 || distance(cell, u) >= 5);

interface EngineChoice {
  target: SiegePosition;
  blocked: number;
  previous?: Cell;
  movedDay?: number;
}

/** Choices live in the replay log, not a process-global cache or the game's RNG. */
function engineChoice(state: SiegeState, engine: SiegeEngine): EngineChoice | undefined {
  const entry = [...state.log]
    .reverse()
    .find((e) => e.code === 'shuEngineChoice' && e.params.engineId === engine.id);
  if (!entry) return undefined;
  const p = entry.params;
  return {
    target: ground({ x: Number(p.x), y: Number(p.y) }),
    blocked: Number(p.blocked),
    ...(typeof p.previousX === 'number' && typeof p.previousY === 'number'
      ? { previous: { x: p.previousX, y: p.previousY }, movedDay: Number(p.movedDay) }
      : {}),
  };
}

/** Plan the whole route; friendly formations yield instead of inducing a detour every day. */
function engineRoute(state: SiegeState, engine: SiegeEngine, choice: EngineChoice): Cell[] | null {
  const blocked = new Set([
    ...state.engines.filter((e) => e.id !== engine.id).map(cellKey),
    ...state.units
      .filter((u) => u.troops > 0 && u.level === 'ground' && (u.side !== 'shu' || !activeUnit(u)))
      .map(cellKey),
  ]);
  if (choice.previous && choice.movedDay === state.day - 1) blocked.add(cellKey(choice.previous));
  const queue: Cell[][] = [[{ x: engine.x, y: engine.y }]];
  const seen = new Set([cellKey(engine)]);
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i]!;
    const from = path.at(-1)!;
    if (sameCell(from, choice.target)) return path;
    for (const to of [
      { x: from.x + (choice.target.x >= from.x ? 1 : -1), y: from.y },
      { x: from.x, y: from.y - 1 },
      { x: from.x + (choice.target.x >= from.x ? -1 : 1), y: from.y },
      { x: from.x, y: from.y + 1 },
    ]) {
      const key = cellKey(to);
      if (!isMapCell(to.x, to.y) || blocked.has(key) || seen.has(key)) continue;
      const terrain = cellTerrain(state, to.x, to.y);
      const gate = gateAt(to.x, to.y);
      if (
        engine.kind === 'ram'
          ? !(
              (terrain === 'plain' && layoutSymbol(to.x, to.y) !== '-') ||
              (gate !== undefined && state.gates[gate].broken)
            )
          : terrain !== 'plain'
      )
        continue;
      seen.add(key);
      queue.push([...path, to]);
    }
  }
  return null;
}

function recordChoice(state: SiegeState, engine: SiegeEngine, choice: EngineChoice): void {
  state.log.push({
    day: state.day,
    code: 'shuEngineChoice',
    params: {
      engineId: engine.id,
      x: choice.target.x,
      y: choice.target.y,
      blocked: choice.blocked,
      ...(choice.previous
        ? {
            previousX: choice.previous.x,
            previousY: choice.previous.y,
            movedDay: choice.movedDay!,
          }
        : {}),
    },
  });
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
    // Leave the east cart's short approach clear. Spare troops form up outside engine lanes.
    const columns = competentPlan(state.seed).columns;
    const work = columns
      .filter((x) => x !== 28)
      .map((x) => ground({ x, y: state.trenchFill[`${x},18`] === 3 ? 18 : 19 }))
      .filter(
        (p) =>
          !state.units.some(
            (u) => u.id !== unit.id && u.troops > 0 && u.level === 'ground' && sameCell(u, p),
          ),
      );
    if (unit.troopType === 'infantry' && work.length) return work;
    return [17, 18, 19, 20, 21, 22, 25, 26, 27, 29, 30, 31, 32]
      .filter((x) => !columns.includes(x))
      .flatMap((x) => [20, 21].map((y) => ground({ x, y })));
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
  let next = structuredClone(state);
  const act = (action: SiegeAction | null) => {
    if (!action) return;
    const result = applySiegeAction(next, action);
    if (result.ok) next = result.state;
  };
  const reserved = new Set<string>();
  const reserveRoutes = () => {
    reserved.clear();
    for (const engine of next.engines.filter(usableEngine)) {
      const choice = engineChoice(next, engine);
      if (!choice || engine.raisedAt) continue;
      for (const cell of engineRoute(next, engine, choice)?.slice(
        1,
        engine.kind === 'tower' ? 2 : 3,
      ) ?? [])
        reserved.add(cellKey(cell));
    }
  };
  const yieldRoute = (path: Cell[]) => {
    for (const initial of next.units.filter(
      (u) =>
        u.side === 'shu' &&
        activeUnit(u) &&
        u.level === 'ground' &&
        path.some((p) => sameCell(p, u)),
    )) {
      const unit = next.units.find((u) => u.id === initial.id)!;
      const goals = reachableCells(next, unit.id)
        .filter(
          (p) =>
            p.level === 'ground' &&
            !reserved.has(cellKey(p)) &&
            (!isMainBody(unit) || commandSafe(next, p)),
        )
        .sort((a, b) => distance(a, unit) - distance(b, unit) || b.y - a.y || a.x - b.x);
      const to = goals[0];
      if (to) act({ type: 'move', unitId: unit.id, ...ground(to) });
    }
  };
  const dispatchEngine = (id: string): EngineChoice | undefined => {
    const engine = next.engines.find((e) => e.id === id)!;
    if (!usableEngine(engine) || engine.raisedAt) return engineChoice(next, engine);
    let choice = engineChoice(next, engine);
    const goals = engineGoal(next, engine);
    // Finish the current job before choosing another one; pressure alone never changes it.
    if (
      !choice ||
      (sameCell(engine, choice.target) && !goals.some((p) => sameCell(p, choice!.target)))
    ) {
      let target = goals.find((target) => engineRoute(next, engine, { target, blocked: 0 }));
      if (!target) {
        // If every work site is cut off by wrecks, still vacate the workshop's exit.
        const parking: SiegePosition[] = [];
        const budget = engine.kind === 'tower' ? 1 : 2;
        for (let y = engine.y - budget; y <= engine.y + budget; y++)
          for (let x = engine.x - budget; x <= engine.x + budget; x++) {
            const cell = ground({ x, y });
            if (
              distance(engine, cell) === 0 ||
              distance(engine, cell) > budget ||
              WORKSHOPS.some((w) => sameCell(w.spawn, cell))
            )
              continue;
            const path = engineRoute(next, engine, { target: cell, blocked: 0 });
            if (path && path.length <= budget + 1) parking.push(cell);
          }
        target = parking.sort(
          (a, b) => a.y - b.y || distance(engine, a) - distance(engine, b) || a.x - b.x,
        )[0];
      }
      if (!target) return choice;
      choice = { ...choice, target, blocked: 0 };
      recordChoice(next, engine, choice);
    }
    if (engine.moved || engine.acted || sameCell(engine, choice.target)) return choice;
    if (choice.blocked >= 2) {
      const alternative = goals.find((target) => engineRoute(next, engine, { ...choice!, target }));
      if (alternative) choice = { ...choice, target: alternative, blocked: 0 };
    }
    const path = engineRoute(next, engine, choice);
    if (path) {
      reserveRoutes();
      for (const cell of path.slice(1, engine.kind === 'tower' ? 2 : 3))
        reserved.add(cellKey(cell));
      yieldRoute(path.slice(1, engine.kind === 'tower' ? 2 : 3));
      const available = engineReachable(next, engine.id);
      const to = path
        .slice(1, engine.kind === 'tower' ? 2 : 3)
        .reverse()
        .find((p) => available.some((cell) => sameCell(cell, p)));
      if (to) {
        const from = { x: engine.x, y: engine.y };
        act({ type: 'moveEngine', engineId: engine.id, ...to });
        choice = { ...choice, blocked: 0, previous: from, movedDay: next.day };
      } else choice = { ...choice, blocked: choice.blocked + 1 };
    } else choice = { ...choice, blocked: choice.blocked + 1 };
    recordChoice(next, engine, choice);
    const current = next.engines.find((e) => e.id === id)!;
    if (sameCell(current, choice.target))
      next.log.push({
        day: next.day,
        code: 'shuEngineArrived',
        params: { engineId: id, x: current.x, y: current.y },
      });
    return choice;
  };
  const retreatMain = () => {
    const main = next.units.find(isMainBody);
    if (!main || !activeUnit(main) || commandSafe(next, main)) return;
    const goals = reachableCells(next, main.id)
      .filter((p) => p.level === 'ground' && commandSafe(next, p) && !reserved.has(cellKey(p)))
      .sort((a, b) => b.y - a.y || distance(main, a) - distance(main, b));
    const to = goals.find((p) =>
      pathTo(next, main.id, p.x, p.y, p.level)?.every((step) => step.level === 'ground'),
    );
    if (to) act({ type: 'move', unitId: main.id, ...ground(to) });
  };
  retreatMain();
  if (strategy === 'competent') {
    for (const workshop of state.workshops) {
      // Count queued tools as well as live engines against the six-engine limit.
      const committed =
        next.engines.filter(usableEngine).length +
        next.workshops.filter((w) => w.queue !== null).length;
      if (committed >= 6) break;
      const kind = queueKind(next, workshop.id);
      if (workshop.queue === null && kind)
        act({ type: 'queueEngine', workshopId: workshop.id, kind });
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
          (freshness(u) < competentPlan(next.seed).rotation || u.morale < WAVERING_MORALE),
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
      const choice = dispatchEngine(engine.id);
      const goals = choice ? [choice.target] : [];
      const current = next.engines.find((e) => e.id === engine.id);
      if (!current || !usableEngine(current) || current.acted) continue;
      if (current.kind === 'earthCart') {
        const cell = SOUTH_TRENCH.find(
          (c) =>
            competentPlan(next.seed).columns.includes(c.x) &&
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
      } else if (current.kind === 'ram' && next.day >= competentPlan(next.seed).ramDay) {
        act({ type: 'ram', engineId: current.id, gateId: 'south' });
      } else if (current.kind === 'tower') {
        const target = next.units
          .filter((u) => u.side === 'wei' && u.troops > 0)
          .find((u) => predictSiegeAttack(next, current, u)?.inRange);
        if (target) act({ type: 'attack', engineId: current.id, targetId: target.id });
      }
    }
  }
  reserveRoutes();
  const units = next.units
    .filter((u) => !isMainBody(u) && u.side === 'shu' && activeUnit(u))
    .sort(
      (a, b) =>
        (a.troopType === 'infantry' ? 0 : 1) - (b.troopType === 'infantry' ? 0 : 1) ||
        freshness(b) - freshness(a),
    );
  for (const initial of units) {
    let unit = next.units.find((u) => u.id === initial.id)!;
    if (!activeUnit(unit) || unit.acted) continue;
    // An unoccupied climb or a path inside takes precedence over firing from below.
    act(
      routeSiegeActor(
        next,
        unit,
        unitGoals(next, unit, strategy).filter(
          (p) => p.level !== 'ground' || !reserved.has(cellKey(p)),
        ),
      )?.action ?? null,
    );
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
          competentPlan(next.seed).columns.includes(c.x) &&
          distance(unit, c) === 1 &&
          next.trenchFill[`${c.x},${c.y}`] !== 3 &&
          (c.y === 18 || next.trenchFill[`${c.x},18`] === 3),
      );
      if (fill) act({ type: 'fillTrench', unitId: unit.id, ...fill });
    }
  }
  const before = new Set(next.engines.map((e) => e.id));
  next = endDay(next, defenderTurn);
  if (strategy === 'competent' && !next.outcome) {
    // Completion is at day end. Dispatch on the newly opened Shu day, spending that day's move.
    for (const engine of next.engines.filter((e) => !before.has(e.id))) dispatchEngine(engine.id);
  }
  return next;
}
