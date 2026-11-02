import { MAP_HEIGHT, MAP_WIDTH, WORKSHOPS, layoutSymbol, sameCell } from '../content/chencang';
import { damageEngine, usableEngine } from './combat';
import { advanceRandomState } from './constants';
import { cellTerrain, isMapCell } from './map';
import { siegeOutcome } from './outcome';
import { weatherFromRoll } from './state';
import type { Cell, EngineKind, SiegeDefenderTurn, SiegeEngine, SiegeState } from './types';

export const ENGINE_RULES: Readonly<
  Record<EngineKind, { days: number; durability: number; move: number }>
> = {
  ladder: { days: 2, durability: 120, move: 2 },
  ram: { days: 3, durability: 300, move: 2 },
  earthCart: { days: 1, durability: 80, move: 2 },
  tower: { days: 4, durability: 250, move: 1 },
};

function spawnCell(state: SiegeState, exit: Cell, kind: EngineKind): Cell | undefined {
  // Manhattan distance, then row/column order, including a blocked exit.
  const cells = Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, index) => ({
    x: index % MAP_WIDTH,
    y: Math.floor(index / MAP_WIDTH),
  }));
  return cells
    .filter(
      (cell) =>
        isMapCell(cell.x, cell.y) &&
        cellTerrain(state, cell.x, cell.y) === 'plain' &&
        (kind !== 'ram' || layoutSymbol(cell.x, cell.y) !== '-') &&
        !state.units.some(
          (unit) => unit.troops > 0 && unit.level === 'ground' && sameCell(unit, cell),
        ) &&
        !state.engines.some((engine) => sameCell(engine, cell)),
    )
    .sort(
      (a, b) =>
        Math.abs(a.x - exit.x) +
          Math.abs(a.y - exit.y) -
          (Math.abs(b.x - exit.x) + Math.abs(b.y - exit.y)) ||
        a.y - b.y ||
        a.x - b.x,
    )[0];
}

function progressWorkshops(state: SiegeState): void {
  for (const workshop of state.workshops) {
    if (workshop.queue === null) continue;
    workshop.daysRemaining = Math.max(0, workshop.daysRemaining - 1);
    if (workshop.daysRemaining > 0 || state.engines.filter(usableEngine).length >= 6) continue;
    const geometry = WORKSHOPS.find((candidate) => candidate.id === workshop.id);
    if (!geometry) continue;
    const spawn = spawnCell(state, geometry.spawn, workshop.queue);
    if (!spawn) continue;
    const kind = workshop.queue;
    let serial = 1;
    while (
      state.engines.some((engine) => engine.id === `${workshop.id}-${kind}-${state.day}-${serial}`)
    )
      serial++;
    const engine: SiegeEngine = {
      id: `${workshop.id}-${kind}-${state.day}-${serial}`,
      kind,
      ...spawn,
      durability: ENGINE_RULES[kind].durability,
      max: ENGINE_RULES[kind].durability,
      burning: false,
      wrecked: false,
      moved: false,
      acted: false,
      ...(kind === 'earthCart' ? { uses: 3 } : {}),
    };
    state.engines.push(engine);
    workshop.queue = null;
    workshop.daysRemaining = 0;
    state.log.push({
      day: state.day,
      code: 'engineCompleted',
      params: { engineId: engine.id, workshopId: workshop.id, kind },
    });
  }
}

/** Pure daily resolution. The callback receives an isolated draft, after all Shu actions. */
export function endDay(state: SiegeState, defenderTurn: SiegeDefenderTurn = () => {}): SiegeState {
  let next = structuredClone(state);
  if (next.outcome) return next;
  const troopsBeforeDefender = new Map(next.units.map((unit) => [unit.id, unit.troops]));
  const defended = defenderTurn(next);
  if (defended) next = structuredClone(defended);
  next.log.push({ day: next.day, code: 'defenderTurnComplete', params: {} });
  for (const engine of next.engines) {
    if (!engine.burning || !usableEngine(engine)) continue;
    Object.assign(next, damageEngine(next, engine, 20));
    next.log.push({
      day: next.day,
      code: 'engineBurning',
      params: { engineId: engine.id, damage: 20 },
    });
  }
  progressWorkshops(next);
  next.grain = Math.max(0, next.grain - 1);
  next.zhangheDistance = Math.max(0, next.zhangheDistance - 1);
  next.log.push({
    day: next.day,
    code: 'daySupplies',
    params: { grain: next.grain, zhangheDistance: next.zhangheDistance },
  });
  for (const unit of next.units) {
    if (
      unit.troops > 0 &&
      !(unit.lostTroopsToday ?? 0) &&
      unit.troops >= (troopsBeforeDefender.get(unit.id) ?? unit.troops) &&
      unit.morale < 80
    ) {
      unit.morale = Math.min(80, unit.morale + 5);
    }
    if (
      unit.troops > 0 &&
      unit.rotateRecoveryDay !== undefined &&
      unit.rotateRecoveryDay <= next.day + 1
    ) {
      const recovered = Math.floor(unit.wounded / 2);
      unit.troops += recovered;
      unit.wounded -= recovered;
      delete unit.rotateRecoveryDay;
      next.log.push({
        day: next.day,
        code: 'rotateRecovery',
        params: { unitId: unit.id, recovered },
      });
    }
    unit.moved = false;
    unit.acted = false;
    delete unit.lostTroopsToday;
    delete unit.climbing;
  }
  for (const engine of next.engines) {
    engine.moved = false;
    engine.acted = false;
  }
  delete next.holdFast;
  // Keep the terminal state's day on the day whose end produced the outcome.
  next.outcome = siegeOutcome(next, true);
  if (next.outcome) return next;
  next.day++;
  if (next.act === 1 && (next.day >= 6 || (next.act2Day !== undefined && next.day >= next.act2Day)))
    next.act = 2;
  if (next.weatherByDay[next.day] === undefined) {
    next.rngState = advanceRandomState(next.rngState);
    next.weatherByDay[next.day] = weatherFromRoll(next.rngState / 0x100000000);
  }
  next.weather = next.weatherByDay[next.day]!;
  next.ordersUsed.shu[next.day] = false;
  next.ordersUsed.wei[next.day] = false;
  next.log.push({
    day: next.day,
    code: 'dayStarted',
    params: { weather: next.weather, act: next.act },
  });
  return next;
}
