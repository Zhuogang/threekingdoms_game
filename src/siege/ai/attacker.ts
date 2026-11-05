import {
  WEST_WALL_COL,
  EAST_WALL_COL,
  SOUTH_WALL_ROW,
  TRENCH_INNER_ROW,
  TRENCH_OUTER_ROW,
  APPROACH_ROW,
  ROAD_COL,
} from '../content/coarseGrid';
import {
  CITY_BOUNDS,
  COURTYARD,
  GATES,
  SHU_ROSTER,
  SOUTH_TRENCH,
  cellKey,
  sameCell,
  layoutSymbol,
} from '../content/chencang';
import { validateSiegeAction, applySiegeAction } from '../rules/actions';
import {
  activeUnit,
  climbingPosition,
  distance,
  predictSiegeAttack,
  predictSiegeClimb,
  usableEngine,
  wallFoothold,
} from '../rules/combat';
import { tacticalSeed, WAVERING_MORALE } from '../rules/constants';
import { cellTerrain } from '../rules/map';
import { engineReachable, reachableCells } from '../rules/movement';
import { SIEGE_TUNING as T } from '../rules/tuning';
import type {
  Cell,
  EngineKind,
  SiegeAction,
  SiegeEngine,
  SiegePosition,
  SiegeState,
  SiegeUnit,
} from '../rules/types';
import { routeSiegeActor } from './defender';

export type AttackerMethod = 'careful' | 'anyPrice' | 'brute';
const ground = ({ x, y }: Cell): SiegePosition => ({ x, y, level: 'ground' });
const adjacent = ({ x, y }: Cell): Cell[] => [
  { x, y: y - 1 },
  { x: x + 1, y },
  { x, y: y + 1 },
  { x: x - 1, y },
];
const mainBody = (u: SiegeUnit) => u.officer.id === 'zhugeliang';
const freshness = (u: SiegeUnit) =>
  u.troops / (SHU_ROSTER.find((r) => r.id === u.id)?.troops ?? u.troops + u.wounded);

/** A paired, even split for every consecutive pair of unsigned seeds. Brute is simulation-only. */
export function attackerMethodForSeed(seed: number): 'careful' | 'anyPrice' {
  return (seed >>> 0) % 2 === 0 ? 'careful' : 'anyPrice';
}

/** Independent hashes select a plan without consuming the weather RNG. */
export function attackerPlan(seed: number, method: AttackerMethod = 'careful') {
  const hash = (name: string) => {
    let value = tacticalSeed(`shu-${name}`, seed);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
  };
  const choice = (name: string, count: number) => hash(name) % count;
  const count = 2 + choice('lanes', 3);
  const west = [5, 6, 7].sort((a, b) => hash(`lane-${a}`) - hash(`lane-${b}`));
  const east = [9, 10, 11].sort((a, b) => hash(`lane-${a}`) - hash(`lane-${b}`));
  const columns = [...west.slice(0, Math.ceil(count / 2)), ...east.slice(0, Math.floor(count / 2))];
  return {
    columns,
    moundColumn: columns[0]!,
    cartFirst: choice('queue', 2) === 0,
    ramDay: method === 'brute' ? 5 + choice('ram', 5) : 2 + choice('ram', 4),
    rotation: 0.4 + choice('rotation', 4) * 0.1,
    assaultDay: 5 + choice('assault', 4),
  };
}

function climbSites(state: SiegeState): Array<{ base: SiegePosition; top: SiegePosition }> {
  return [
    ...state.engines
      .filter((e) => usableEngine(e) && e.raisedAt)
      .map((e) => ({ base: ground(e), top: { ...e.raisedAt!, level: 'wall' as const } })),
    ...SOUTH_TRENCH.filter(
      (c) =>
        c.y === TRENCH_INNER_ROW &&
        state.trenchFill[cellKey(c)] === T.trenchCapacity &&
        state.trenchFill[`${c.x},${TRENCH_OUTER_ROW}`] === T.trenchCapacity,
    ).map((c) => ({ base: ground(c), top: { x: c.x, y: SOUTH_WALL_ROW, level: 'wall' as const } })),
  ];
}

function brazierNear(state: SiegeState, cell: Cell, range: number): boolean {
  return Object.keys(state.preparations.braziers).some((key) => {
    const [x, y] = key.split(',').map(Number);
    return distance(cell, { x: x!, y: y! }) <= range;
  });
}

function supportColumns(state: SiegeState): number[] {
  return state.engines
    .filter((e) => usableEngine(e) && e.kind === 'ladder' && e.y === APPROACH_ROW)
    .map((e) => (e.x < ROAD_COL ? e.x + 1 : e.x - 1))
    .filter((x) => SOUTH_TRENCH.some((cell) => cell.x === x && cell.y === TRENCH_OUTER_ROW));
}

function engineGoals(state: SiegeState, engine: SiegeEngine): SiegePosition[] {
  const plan = attackerPlan(state.seed);
  if (engine.kind === 'ram')
    return state.gates.south.broken
      ? []
      : GATES.south.approaches.filter((c) => c.y > SOUTH_WALL_ROW).map(ground);
  if (engine.kind === 'earthCart') {
    const west =
      engine.id.startsWith('workshop-1') ||
      (!engine.id.startsWith('workshop-2') && engine.x < ROAD_COL);
    const columns = plan.columns.filter((x) => x < ROAD_COL === west);
    if (!columns.length) columns.push(plan.moundColumn);
    const supports = supportColumns(state).filter((x) => x < ROAD_COL === west);
    if (state.trenchFill[`${plan.moundColumn},${TRENCH_INNER_ROW}`] !== T.trenchCapacity)
      for (const x of supports)
        if (state.trenchFill[`${x},${TRENCH_OUTER_ROW}`] !== T.trenchCapacity)
          return [ground({ x, y: APPROACH_ROW })];
    for (const x of columns) {
      if (state.trenchFill[`${x},${TRENCH_OUTER_ROW}`] !== T.trenchCapacity)
        return [ground({ x, y: APPROACH_ROW })];
      if (state.trenchFill[`${x},${TRENCH_INNER_ROW}`] !== T.trenchCapacity)
        return [ground({ x, y: TRENCH_OUTER_ROW })];
      if ((state.mounds[`${x},${TRENCH_INNER_ROW}`] ?? 0) < T.moundComplete)
        return adjacent({ x, y: TRENCH_INNER_ROW })
          .filter((c) => cellTerrain(state, c.x, c.y) === 'plain')
          .map(ground);
    }
    return [];
  }
  if (engine.kind === 'ladder') {
    if (
      engine.y === APPROACH_ROW &&
      layoutSymbol(engine.x, SOUTH_WALL_ROW) === 'W' &&
      !brazierNear(state, { x: engine.x, y: SOUTH_WALL_ROW }, 2)
    )
      return [ground(engine)];
    const west = engine.x < ROAD_COL;
    return Array.from(
      { length: EAST_WALL_COL - WEST_WALL_COL - 1 },
      (_, i) => i + WEST_WALL_COL + 1,
    )
      .filter(
        (x) =>
          layoutSymbol(x, SOUTH_WALL_ROW) === 'W' &&
          x < ROAD_COL === west &&
          !plan.columns.includes(x) &&
          !brazierNear(state, { x, y: SOUTH_WALL_ROW }, 2),
      )
      .map((x) => ground({ x, y: APPROACH_ROW }));
  }
  const threats = state.units.filter(
    (u) => u.side === 'wei' && activeUnit(u) && u.level === 'wall',
  );
  return threats.map((u) => ground({ x: u.x, y: APPROACH_ROW }));
}

/** Plans on evolving rule results only. Reservations and assignments exist for this turn only. */
export function* attackerTurnSteps(
  state: SiegeState,
  method: AttackerMethod,
): Generator<
  { action: SiegeAction; state: SiegeState },
  { actions: SiegeAction[]; state: SiegeState }
> {
  if (state.outcome) return { actions: [], state };
  let draft = state;
  const actions: SiegeAction[] = [];
  const plan = attackerPlan(state.seed, method);
  const lastNight = state.log.filter((e) => e.day === state.day - 1);
  const torches = lastNight.some((e) => e.code === 'torches');
  const sortie = lastNight.some((e) => ['sortieHit', 'sortieRepelled'].includes(e.code));
  const act = function* (action: SiegeAction) {
    const result = applySiegeAction(draft, action);
    if (!result.ok)
      throw new Error(`Illegal attacker plan ${JSON.stringify(action)}: ${result.reason}`);
    draft = result.state;
    actions.push(action);
    yield { action, state: draft };
  };
  const unitNow = (id: string) => draft.units.find((u) => u.id === id)!;
  const dailyAssault = (u: SiegeUnit) =>
    method === 'anyPrice' &&
    draft.day >= 2 &&
    climbSites(draft).some((site) => climbingPosition(draft, u, site.top) !== null);
  const availableInfantry = () =>
    draft.units.filter(
      (u) =>
        u.side === 'shu' &&
        !mainBody(u) &&
        activeUnit(u) &&
        !u.acted &&
        u.level === 'ground' &&
        u.troopType === 'infantry',
    );
  const move = function* (actor: SiegeUnit | SiegeEngine, goals: SiegePosition[]) {
    if (goals.some((p) => sameCell(p, actor) && (!('level' in actor) || p.level === actor.level)))
      return;
    let route = routeSiegeActor(draft, actor, goals);
    if (!route && 'kind' in actor && !actor.moved && !actor.acted) {
      // Work crews yield to a cart carrying more earth; all movement still goes through the rules.
      const crew = draft.units.find(
        (u) =>
          u.side === 'shu' &&
          !mainBody(u) &&
          activeUnit(u) &&
          !u.moved &&
          !u.acted &&
          u.level === 'ground' &&
          distance(u, actor) <= T.engines[actor.kind].move &&
          goals.some((p) => sameCell(p, u)),
      );
      if (crew) {
        let exits = reachableCells(draft, crew.id).filter(
          (p) => p.level === 'ground' && !goals.some((g) => g.x === p.x && p.y <= APPROACH_ROW),
        );
        if (!exits.length) {
          // A cart directly behind a worker must first open the worker's only exit from the trench.
          const parking = engineReachable(draft, actor.id)
            .filter((p) => !goals.some((g) => g.x === p.x))
            .sort((a, b) => a.cost - b.cost || a.y - b.y)[0];
          if (parking)
            yield* act({ type: 'moveEngine', engineId: actor.id, x: parking.x, y: parking.y });
          exits = reachableCells(draft, crew.id).filter(
            (p) => p.level === 'ground' && !goals.some((g) => g.x === p.x && p.y <= APPROACH_ROW),
          );
        }
        const exit = exits.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x)[0];
        if (exit) yield* act({ type: 'move', unitId: crew.id, ...ground(exit) });
        const current = draft.engines.find((e) => e.id === actor.id)!;
        route = routeSiegeActor(draft, current, goals);
      }
    }
    if (route) {
      if (
        'kind' in actor &&
        method !== 'brute' &&
        sortie &&
        route.action.type === 'moveEngine' &&
        GATES.south.approaches.some((c) => distance(c, route.action as Cell) <= T.sortieRange)
      ) {
        const destination = route.action;
        const escorted = availableInfantry().some(
          (u) =>
            distance(u, destination) <= 1 ||
            reachableCells(draft, u.id).some(
              (p) => p.level === 'ground' && distance(p, destination) <= 1,
            ),
        );
        if (!escorted) return;
      }
      yield* act(route.action);
    }
  };
  // Opening from inside takes priority over every work/combat assignment.
  for (const unit of draft.units) {
    const action = { type: 'openGate' as const, unitId: unit.id, gateId: 'south' as const };
    if (!validateSiegeAction(draft, action)) yield* act(action);
  }
  const safeCommand = (p: Cell) =>
    p.y >= CITY_BOUNDS.south + 5 &&
    draft.units.every((u) => u.side !== 'wei' || u.troops <= 0 || distance(p, u) >= 5);
  const main = draft.units.find(mainBody);
  if (main && activeUnit(main) && !safeCommand(main)) {
    const to = reachableCells(draft, main.id)
      .filter((p) => p.level === 'ground' && safeCommand(p))
      .sort((a, b) => b.y - a.y || a.cost - b.cost)[0];
    if (to) yield* act({ type: 'move', unitId: main.id, ...ground(to) });
  }

  if (method !== 'brute') {
    for (const workshop of state.workshops) {
      if (
        workshop.queue ||
        draft.engines.filter(usableEngine).length + draft.workshops.filter((w) => w.queue).length >=
          T.engineCap
      )
        continue;
      const count = (kind: EngineKind) =>
        draft.engines.filter((e) => usableEngine(e) && e.kind === kind).length +
        draft.workshops.filter((w) => w.queue === kind).length;
      const needsMound =
        (draft.mounds[`${plan.moundColumn},${TRENCH_INNER_ROW}`] ?? 0) < T.moundComplete;
      let kind: EngineKind | undefined;
      if (!draft.gates.south.broken && count('ram') < 1) kind = 'ram';
      else if (draft.day === 1)
        kind = (workshop.id === 'workshop-1') === plan.cartFirst ? 'earthCart' : 'ladder';
      else if (needsMound && count('earthCart') < 2) kind = 'earthCart';
      else if (count('ladder') < (method === 'anyPrice' ? plan.columns.length : 2)) kind = 'ladder';
      else if (draft.act === 2 && count('tower') < 2) kind = 'tower';
      if (kind) yield* act({ type: 'queueEngine', workshopId: workshop.id, kind });
    }
  }

  // Engines move before the infantry closes the lanes. Raised opening ladders stay put.
  for (const initial of [...draft.engines]
    .filter(usableEngine)
    .sort((a, b) => (a.kind === 'earthCart' ? 0 : 1) - (b.kind === 'earthCart' ? 0 : 1))) {
    let engine = draft.engines.find((e) => e.id === initial.id)!;
    if (engine.acted) continue;
    if (!engine.raisedAt) yield* move(engine, engineGoals(draft, engine));
    engine = draft.engines.find((e) => e.id === initial.id)!;
    if (
      engine.kind === 'ladder' &&
      !engine.raisedAt &&
      engine.y === APPROACH_ROW &&
      layoutSymbol(engine.x, SOUTH_WALL_ROW) === 'W' &&
      [0, T.trenchCapacity].includes(draft.trenchFill[`${engine.x},${TRENCH_OUTER_ROW}`]!)
    )
      yield* act({ type: 'raiseLadder', engineId: engine.id });
    if (engine.kind === 'earthCart') {
      const x = plan.moundColumn;
      const pile = { x, y: TRENCH_INNER_ROW };
      if (
        draft.trenchFill[`${x},${TRENCH_INNER_ROW}`] === T.trenchCapacity &&
        draft.trenchFill[`${x},${TRENCH_OUTER_ROW}`] === T.trenchCapacity &&
        (draft.mounds[`${x},${TRENCH_INNER_ROW}`] ?? 0) < T.moundComplete &&
        distance(engine, pile) === 1
      )
        yield* act({ type: 'pileEarth', engineId: engine.id, ...pile });
      else {
        const fill = SOUTH_TRENCH.filter(
          (c) =>
            (plan.columns.includes(c.x) ||
              (c.y === TRENCH_OUTER_ROW && supportColumns(draft).includes(c.x))) &&
            distance(engine, c) === 1 &&
            draft.trenchFill[cellKey(c)] !== T.trenchCapacity &&
            (c.y === TRENCH_OUTER_ROW ||
              draft.trenchFill[`${c.x},${TRENCH_OUTER_ROW}`] === T.trenchCapacity),
        ).sort((a, b) => (a.x === x ? 0 : 1) - (b.x === x ? 0 : 1))[0];
        if (fill) yield* act({ type: 'fillTrench', engineId: engine.id, ...fill });
      }
    }
  }

  const reserved = new Set<string>();
  const climbingCrew = new Set<string>();
  const buildingCrew = new Set(
    availableInfantry()
      .filter(
        (u) =>
          u.id.startsWith('shu-captain') &&
          distance(u, { x: plan.moundColumn, y: TRENCH_INNER_ROW }) === 1 &&
          draft.trenchFill[`${plan.moundColumn},${TRENCH_INNER_ROW}`] === T.trenchCapacity &&
          (draft.mounds[`${plan.moundColumn},${TRENCH_INNER_ROW}`] ?? 0) < T.moundComplete,
      )
      .slice(0, 2)
      .map((u) => u.id),
  );
  const crewReach = new Map<string, ReturnType<typeof reachableCells>>();
  for (const site of climbSites(draft)) {
    const climber = availableInfantry()
      .filter(
        (u) =>
          !climbingCrew.has(u.id) &&
          !buildingCrew.has(u.id) &&
          (sameCell(u, site.base) ||
            (
              crewReach.get(u.id) ??
              (() => {
                const cells = reachableCells(draft, u.id);
                crewReach.set(u.id, cells);
                return cells;
              })()
            ).some((p) => p.level === 'ground' && sameCell(p, site.base))),
      )
      .sort(
        (a, b) =>
          Number(!sameCell(a, site.base)) - Number(!sameCell(b, site.base)) ||
          freshness(b) - freshness(a) ||
          distance(a, site.base) - distance(b, site.base),
      )[0];
    if (climber) climbingCrew.add(climber.id);
  }
  const cover = function* (id: string) {
    const engine = draft.engines.find((e) => e.id === id)!;
    if (engine.covered || !usableEngine(engine)) return;
    const eligible = availableInfantry().filter(
      (u) =>
        !reserved.has(u.id) &&
        !buildingCrew.has(u.id) &&
        !dailyAssault(u) &&
        !draft.engines.some((e) => e.raisedAt && sameCell(e, u)) &&
        (distance(u, engine) <= 1 ||
          reachableCells(draft, u.id).some(
            (p) => p.level === 'ground' && distance(p, engine) <= 1,
          )),
    );
    const supporting = eligible.filter((u) => !climbingCrew.has(u.id));
    const troops = (supporting.length ? supporting : eligible).sort(
      (a, b) =>
        Number(climbSites(draft).some((s) => distance(a, s.base) <= 3)) -
          Number(climbSites(draft).some((s) => distance(b, s.base) <= 3)) ||
        distance(a, engine) - distance(b, engine),
    );
    for (const initial of troops) {
      yield* move(initial, adjacent(engine).map(ground));
      const u = unitNow(initial.id);
      if (distance(u, engine) <= 1) {
        yield* act({ type: 'coverEngine', unitId: u.id, engineId: engine.id });
        return;
      }
      // Only the closest formation is assigned; other infantry remains available to climb.
      reserved.add(u.id);
      return;
    }
  };
  if (method !== 'brute') {
    for (const engine of draft.engines.filter(usableEngine)) {
      if (engine.raisedAt && brazierNear(draft, engine.raisedAt, 2)) yield* cover(engine.id);
      if (
        engine.kind === 'ram' &&
        Object.values(draft.preparations.millstones).some((p) => p.hoisted)
      )
        yield* cover(engine.id);
    }
  }

  // Two builders, plus loaded carts above, develop the seeded mound lane.
  if (method !== 'brute' && !draft.gates.south.broken) {
    const x = plan.moundColumn;
    const pile = { x, y: TRENCH_INNER_ROW };
    const fill =
      draft.trenchFill[`${x},${TRENCH_OUTER_ROW}`] !== T.trenchCapacity
        ? { x, y: TRENCH_OUTER_ROW }
        : draft.trenchFill[`${x},${TRENCH_INNER_ROW}`] !== T.trenchCapacity
          ? pile
          : null;
    const task = fill ?? ((draft.mounds[cellKey(pile)] ?? 0) < T.moundComplete ? pile : null);
    if (task) {
      const builders = availableInfantry()
        .filter((u) => !reserved.has(u.id) && !climbingCrew.has(u.id) && !dailyAssault(u))
        .sort(
          (a, b) =>
            (a.id.startsWith('shu-captain') ? 0 : 1) - (b.id.startsWith('shu-captain') ? 0 : 1) ||
            distance(a, task) - distance(b, task),
        )
        .slice(0, 2);
      for (const initial of builders) {
        const goals = adjacent(task)
          .filter((p) => cellTerrain(draft, p.x, p.y) === 'plain')
          .map(ground);
        yield* move(unitNow(initial.id), goals);
        const u = unitNow(initial.id);
        reserved.add(u.id);
        if (distance(u, task) === 1 && !draft.engines.some((e) => sameCell(e, u))) {
          if (fill && draft.trenchFill[cellKey(fill)] !== T.trenchCapacity)
            yield* act({ type: 'fillTrench', unitId: u.id, ...fill });
          else if (!fill && (draft.mounds[cellKey(pile)] ?? 0) < T.moundComplete)
            yield* act({ type: 'pileEarth', unitId: u.id, ...pile });
        }
      }
    }
  }

  // Read only resolved last-night events; the opponent's pending order is hidden information.
  if (method !== 'brute') {
    for (const engine of draft.engines.filter(
      (e) =>
        usableEngine(e) &&
        (sortie || (e.kind === 'ram' && !draft.gates.south.broken)) &&
        GATES.south.approaches.some((c) => distance(c, e) <= T.sortieRange),
    )) {
      const guard = draft.units.some(
        (u) =>
          u.side === 'shu' &&
          activeUnit(u) &&
          u.troopType === 'infantry' &&
          u.level === 'ground' &&
          distance(u, engine) <= 1,
      );
      if (guard) {
        const u = availableInfantry().find((u) => distance(u, engine) <= 1);
        if (u && !dailyAssault(u)) reserved.add(u.id);
        continue;
      }
      const u = availableInfantry()
        .filter((u) => !reserved.has(u.id) && !dailyAssault(u))
        .sort((a, b) => distance(a, engine) - distance(b, engine))[0];
      if (u) {
        yield* move(u, adjacent(engine).map(ground));
        reserved.add(u.id);
      }
    }
  }

  // Suppress exposed preparations before either the ram or climbers attack.
  const targets = draft.units
    .filter((u) => u.side === 'wei' && activeUnit(u) && u.level === 'wall')
    .sort((a, b) => {
      const danger = (u: SiegeUnit) =>
        (draft.preparations.millstones[cellKey(u)]?.hoisted ? 30 : 0) +
        (brazierNear(draft, u, 1) && u.troopType === 'archer' ? 20 : 0) +
        (draft.preparations.boulders[cellKey(u)] ? 10 : 0);
      return danger(b) - danger(a);
    });
  if (method !== 'brute') {
    const assignedTargets = new Set<string>();
    const shooters = [
      ...draft.units.filter(
        (u) =>
          u.side === 'shu' &&
          activeUnit(u) &&
          !u.acted &&
          u.troopType === 'archer' &&
          u.level === 'ground' &&
          !(
            method === 'anyPrice' &&
            draft.day >= 2 &&
            climbSites(draft).some((site) => climbingPosition(draft, u, site.top) !== null)
          ),
      ),
      ...draft.engines.filter((e) => usableEngine(e) && !e.acted && e.kind === 'tower'),
    ];
    shooters.sort((a, b) => b.x - a.x);
    for (const shooter of shooters) {
      const ranked = [...targets].sort((a, b) => {
        const priority = (u: SiegeUnit) =>
          (u.troopType === 'archer' &&
          brazierNear(draft, u, 1) &&
          draft.engines.some((e) => usableEngine(e) && e.raisedAt && distance(e, u) <= 3)
            ? 12
            : 0) +
          (draft.preparations.millstones[cellKey(u)]?.hoisted &&
          draft.engines.some((e) => e.kind === 'ram' && !e.covered && usableEngine(e))
            ? 8
            : 0) -
          distance(shooter, u);
        return priority(b) - priority(a);
      });
      const target =
        ranked.find((t) => {
          const u = unitNow(t.id);
          return (
            activeUnit(u) &&
            !assignedTargets.has(u.id) &&
            u.suppressedDay !== draft.day &&
            (draft.preparations.millstones[cellKey(u)]?.hoisted ||
              (u.troopType === 'archer' && brazierNear(draft, u, 1)) ||
              draft.preparations.boulders[cellKey(u)] ||
              torches)
          );
        }) ??
        ranked.find((t) => unitNow(t.id).suppressedDay !== draft.day && !assignedTargets.has(t.id));
      if (!target) continue;
      if ('side' in shooter && !shooter.moved) {
        const goals: SiegePosition[] = [];
        for (let y = TRENCH_INNER_ROW; y <= target.y + T.suppressRange; y++)
          for (let x = target.x - T.suppressRange; x <= target.x + T.suppressRange; x++)
            if (
              distance({ x, y }, target) <= T.suppressRange &&
              cellTerrain(draft, x, y) === 'plain' &&
              !climbSites(draft).some(
                (s) =>
                  sameCell(s.base, { x, y }) &&
                  !(
                    distance(shooter, target) <= T.suppressRange + 1 &&
                    !availableInfantry().some(
                      (u) => climbingCrew.has(u.id) && distance(u, s.base) <= 3,
                    )
                  ),
              )
            )
              goals.push(ground({ x, y }));
        yield* move(unitNow(shooter.id), goals);
      }
      const current =
        'side' in shooter ? unitNow(shooter.id) : draft.engines.find((e) => e.id === shooter.id)!;
      if (distance(current, target) <= ('side' in current ? T.suppressRange : T.towerRange))
        assignedTargets.add(target.id);
      const inRange = ranked.find(
        (t) =>
          activeUnit(unitNow(t.id)) &&
          unitNow(t.id).suppressedDay !== draft.day &&
          distance(current, t) <= ('side' in current ? T.suppressRange : T.towerRange),
      );
      if (inRange)
        yield* act(
          'side' in current
            ? { type: 'suppress', unitId: current.id, targetId: inRange.id }
            : { type: 'suppress', engineId: current.id, targetId: inRange.id },
        );
    }
  }

  for (const engine of draft.engines.filter(
    (e) => usableEngine(e) && !e.acted && e.kind === 'ram',
  )) {
    const dangerous = draft.units.some(
      (u) =>
        u.side === 'wei' &&
        activeUnit(u) &&
        u.suppressedDay !== draft.day &&
        draft.preparations.millstones[cellKey(u)]?.hoisted &&
        draft.preparations.millstones[cellKey(u)]!.day < draft.day &&
        GATES.south.cells.some((c) => sameCell(c, u)),
    );
    if (
      !draft.gates.south.broken &&
      GATES.south.approaches.some((c) => sameCell(c, engine)) &&
      draft.day >= plan.ramDay &&
      (!dangerous || method !== 'careful')
    )
      yield* act({ type: 'ram', engineId: engine.id, gateId: 'south' });
  }

  const allowAssault = method === 'brute' || (method === 'anyPrice' && draft.day >= 2);
  // Evacuate an exhausted climber before assigning fresh troops to the freed base.
  if (method === 'anyPrice' && !draft.ordersUsed.shu[draft.day]) {
    const exhausted = availableInfantry()
      .filter(
        (u) =>
          u.wounded > 0 &&
          u.y > CITY_BOUNDS.south &&
          u.rotateRecoveryDay === undefined &&
          freshness(u) < plan.rotation,
      )
      .sort((a, b) => b.wounded - a.wounded)[0];
    if (exhausted) yield* act({ type: 'order', side: 'shu', kind: 'rotate', target: exhausted.id });
    else {
      const shaken = availableInfantry()
        .filter((u) => dailyAssault(u) && u.morale < WAVERING_MORALE)
        .sort((a, b) => a.morale - b.morale)[0];
      if (shaken) yield* act({ type: 'order', side: 'shu', kind: 'rally', target: shaken.id });
    }
  }
  const troops = draft.units
    .filter(
      (u) => u.side === 'shu' && activeUnit(u) && !mainBody(u) && !u.acted && !reserved.has(u.id),
    )
    .sort(
      (a, b) =>
        (a.troopType === 'infantry' ? 0 : 1) - (b.troopType === 'infantry' ? 0 : 1) ||
        freshness(b) - freshness(a),
    );
  for (const initial of troops) {
    let u = unitNow(initial.id);
    const openGate = { type: 'openGate' as const, unitId: u.id, gateId: 'south' as const };
    if (!validateSiegeAction(draft, openGate)) {
      yield* act(openGate);
      continue;
    }
    const reinforcingClimb =
      method === 'anyPrice' &&
      climbingCrew.has(u.id) &&
      u.level === 'ground' &&
      u.y > SOUTH_WALL_ROW;
    if (
      !dailyAssault(u) &&
      !reinforcingClimb &&
      (u.level === 'wall' || u.y < SOUTH_WALL_ROW || draft.gates.south.broken)
    ) {
      yield* move(u, COURTYARD.map(ground));
      u = unitNow(u.id);
      if (!u.moved && !u.acted) {
        // A defender can seal a one-cell corridor. Advance to fight the blocker.
        const enemies = draft.units.filter((enemy) => enemy.side === 'wei' && activeUnit(enemy));
        const goals = enemies.flatMap((enemy) =>
          adjacent(enemy).map((cell) => ({ ...cell, level: enemy.level })),
        );
        yield* move(u, goals);
      }
    } else if (u.troopType === 'infantry') {
      const allSites = climbSites(draft);
      const sites = allSites;
      const mound = sites.filter((s) => draft.mounds[cellKey(s.base)] === T.moundComplete);
      const preferred = mound.length ? mound : sites;
      const empty = preferred.filter(
        (s) =>
          !draft.units.some(
            (enemy) =>
              enemy.side === 'wei' &&
              enemy.troops > 0 &&
              enemy.level === 'wall' &&
              sameCell(enemy, s.top),
          ),
      );
      // Keep working a held base, otherwise fill the closest available climbing position.
      const held = sites.find((s) => u.level === 'ground' && sameCell(u, s.base));
      if (!held)
        yield* move(
          u,
          preferred.map((s) =>
            draft.mounds[cellKey(s.base)] === T.moundComplete && empty.includes(s) ? s.top : s.base,
          ),
        );
    }
    u = unitNow(u.id);
    if (!validateSiegeAction(draft, openGate)) {
      yield* act(openGate);
      continue;
    }
    if (u.acted) continue;
    const emptyTop = predictSiegeClimb(draft, u);
    if (emptyTop) {
      yield* act({
        type: 'climb',
        unitId: u.id,
        ...(allowAssault && wallFoothold(draft, emptyTop.top) < T.footholdComplete
          ? { assault: true }
          : {}),
      });
      continue;
    }
    const enemies = draft.units
      .filter((e) => e.side === 'wei' && e.troops > 0)
      .map((target) => {
        const assault = allowAssault && climbingPosition(draft, u, target) !== null;
        return { target, assault, forecast: predictSiegeAttack(draft, u, target, { assault }) };
      })
      .filter((e) => e.forecast?.inRange)
      .sort(
        (a, b) =>
          Number(climbingPosition(draft, u, b.target) !== null) -
            Number(climbingPosition(draft, u, a.target) !== null) ||
          Number(b.forecast!.wouldMount) - Number(a.forecast!.wouldMount) ||
          b.forecast!.casualties - a.forecast!.casualties,
      );
    if (enemies[0])
      yield* act({
        type: 'attack',
        unitId: u.id,
        targetId: enemies[0].target.id,
        ...(enemies[0].assault ? { assault: true } : {}),
      });
    else if (method === 'brute' && predictSiegeAttack(draft, u, 'south')?.inRange)
      yield* act({ type: 'attack', unitId: u.id, gateId: 'south' });
  }

  if (!draft.ordersUsed.shu[draft.day] && draft.units.some((u) => mainBody(u) && activeUnit(u))) {
    const wounded = draft.units
      .filter(
        (u) =>
          u.side === 'shu' &&
          !mainBody(u) &&
          activeUnit(u) &&
          u.level === 'ground' &&
          u.y > CITY_BOUNDS.south &&
          u.wounded > 0 &&
          u.rotateRecoveryDay === undefined &&
          (freshness(u) < plan.rotation || u.morale < WAVERING_MORALE),
      )
      .sort((a, b) => b.wounded - a.wounded)[0];
    const queued = draft.workshops
      .filter((w) => w.queue && w.daysRemaining > 0)
      .sort((a, b) => b.daysRemaining - a.daysRemaining)[0];
    const lowest = draft.units
      .filter((u) => u.side === 'shu' && u.troops > 0)
      .sort((a, b) => a.morale - b.morale)[0];
    const precarious = draft.units
      .filter(
        (u) =>
          u.side === 'shu' && activeUnit(u) && u.level === 'wall' && u.morale < WAVERING_MORALE,
      )
      .sort((a, b) => a.morale - b.morale)[0];
    if (method !== 'brute' && precarious)
      yield* act({ type: 'order', side: 'shu', kind: 'rally', target: precarious.id });
    else if (
      draft.engines.filter((e) => usableEngine(e) && e.y === APPROACH_ROW).length >= 2 &&
      draft.engines.some(
        (e) =>
          usableEngine(e) &&
          e.y === APPROACH_ROW &&
          !e.raisedAt &&
          (e.y > APPROACH_ROW || e.kind === 'ladder'),
      ) &&
      !torches
    )
      yield* act({ type: 'order', side: 'shu', kind: 'nightAssault' });
    else if (method !== 'brute' && wounded)
      yield* act({ type: 'order', side: 'shu', kind: 'rotate', target: wounded.id });
    else if (method !== 'brute' && queued)
      yield* act({ type: 'order', side: 'shu', kind: 'supervise', target: queued.id });
    else if (lowest) yield* act({ type: 'order', side: 'shu', kind: 'rally', target: lowest.id });
  }
  return { actions, state: draft };
}

// Synchronous callers and the yielding UI exhaust the same action sequence.
function attackerTurn(state: SiegeState, method: AttackerMethod) {
  const steps = attackerTurnSteps(state, method);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function planAttackerTurn(state: SiegeState, method: AttackerMethod): SiegeAction[] {
  return attackerTurn(state, method).actions;
}

/** Runs only Shu's phase. The caller follows it with Wei's phase, then endDay. */
export function runAttackerTurn(state: SiegeState, method: AttackerMethod): SiegeState {
  return attackerTurn(state, method).state;
}
