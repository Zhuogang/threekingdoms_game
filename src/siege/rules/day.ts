import { MIN_MORALE } from './constants';
import { ENGINE_RULES, SIEGE_TUNING as T } from './tuning';
import {
  cancelOccupiedPreparations,
  logEvent,
  updatePersonnelStats,
  updateScores,
  updateMainBodyThreat,
} from './events';
import { fireArrowsReason, fireAtEngine } from './preparations';
export { ENGINE_RULES } from './tuning';
import {
  GATES,
  SOUTH_TRENCH,
  MAP_HEIGHT,
  MAP_WIDTH,
  WORKSHOPS,
  cellKey,
  layoutSymbol,
  sameCell,
} from '../content/chencang';
import {
  activeUnit,
  changeFoothold,
  climbingPosition,
  damageEngine,
  distance,
  inflictCasualties,
  settleUnitRout,
  usableEngine,
} from './combat';
import { advanceRandomState } from './constants';
import { cellTerrain, isMapCell } from './map';
import { siegeOutcome } from './outcome';
import { weatherFromRoll } from './state';
import type { Cell, EngineKind, SiegeEngine, SiegeState } from './types';

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
    if (workshop.daysRemaining > 0 || state.engines.filter(usableEngine).length >= T.engineCap)
      continue;
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
      covered: false,
      wrecked: false,
      moved: false,
      acted: false,
      ...(kind === 'earthCart' ? { uses: T.cartLoads } : {}),
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

function nearTrench(cell: Cell, range: number): boolean {
  return SOUTH_TRENCH.some((trench) => distance(cell, trench) <= range);
}

function nightMorale(state: SiegeState, loss: number, range: number, reason: string): void {
  for (const unit of state.units.filter(
    (unit) => unit.side === 'shu' && activeUnit(unit) && nearTrench(unit, range),
  )) {
    const before = unit.morale;
    unit.morale = Math.max(MIN_MORALE, unit.morale - loss);
    Object.assign(unit, settleUnitRout(state, unit));
    logEvent(state, 'nightMorale', { unitId: unit.id, before, after: unit.morale, reason });
  }
}

function nightAdvance(state: SiegeState): void {
  for (const engine of state.engines.filter(
    (entry) => usableEngine(entry) && entry.y >= T.nightEngineMinY && entry.y <= T.nightEngineMaxY,
  )) {
    const before = cellKey(engine);
    if (!engine.raisedAt)
      for (let step = 0; step < T.nightAdvance && engine.y > T.nightEngineMinY; step++) {
        const to = { x: engine.x, y: engine.y - 1 };
        if (
          cellTerrain(state, to.x, to.y) !== 'plain' ||
          state.units.some(
            (unit) => unit.troops > 0 && unit.level === 'ground' && sameCell(unit, to),
          ) ||
          state.engines.some((other) => other.id !== engine.id && sameCell(other, to))
        )
          break;
        engine.y--;
      }
    const progress = state.trenchFill[`${engine.x},18`];
    const raised =
      engine.kind === 'ladder' &&
      !engine.raisedAt &&
      engine.y === T.nightEngineMinY &&
      (progress === 0 || progress === T.trenchCapacity) &&
      cellTerrain(state, engine.x, 16) === 'wall';
    if (raised) engine.raisedAt = { x: engine.x, y: 16 };
    logEvent(state, 'nightAssaultAdvanced', {
      engineId: engine.id,
      before,
      after: cellKey(engine),
      raised,
    });
  }
  nightMorale(state, T.nightAssaultMoraleLoss, T.nightAssaultMoraleRange, 'nightAssault');
}

/** Returns whether Wei forgoes morale recovery after an unopposed torches order. */
function resolveNightOrders(state: SiegeState): boolean {
  const assault = state.nightOrders.shu?.kind === 'nightAssault';
  const wei = state.nightOrders.wei;
  if (assault)
    logEvent(state, 'nightAssault', { result: wei?.kind === 'torches' ? 'stopped' : 'advanced' });
  if (assault && (wei?.kind === 'torches' || wei?.kind === 'sortie')) {
    state.stats.nightClashes++;
    logEvent(state, 'nightClash', {
      shu: 'nightAssault',
      wei: wei.kind,
      result: wei.kind === 'torches' ? 'assaultStopped' : 'sortieFailed',
    });
  }
  if (wei?.kind === 'torches') {
    logEvent(state, 'torches', {
      assault,
      result: assault ? 'caughtAssault' : 'noAssault',
      moraleRecovery: !assault ? 0 : T.moraleRecovery,
    });
    if (assault) {
      for (const unit of state.units.filter(
        (unit) =>
          unit.side === 'wei' &&
          activeUnit(unit) &&
          unit.level === 'wall' &&
          unit.troopType === 'archer',
      )) {
        const target = state.engines
          .filter(
            (engine) => usableEngine(engine) && fireArrowsReason(state, unit, engine) === null,
          )
          .sort((a, b) => distance(unit, a) - distance(unit, b) || a.id.localeCompare(b.id))[0];
        if (target) fireAtEngine(state, unit, target);
      }
      nightMorale(state, T.torchesMoraleLoss, T.torchesMoraleRange, 'torches');
    }
  } else if (assault) nightAdvance(state);
  if (wei?.kind === 'sortie') {
    const engine = state.engines.find((entry) => entry.id === wei.target && usableEngine(entry));
    const raider = state.units.find(
      (unit) =>
        unit.id === wei.unitId &&
        activeUnit(unit) &&
        unit.suppressedDay !== state.day &&
        unit.level === 'wall' &&
        GATES.south.cells.some((cell) => sameCell(cell, unit)),
    );
    const guard =
      engine &&
      state.units.find(
        (unit) => unit.side === 'shu' && activeUnit(unit) && distance(unit, engine) <= T.guardRange,
      );
    if (
      assault ||
      !engine ||
      !raider ||
      !GATES.south.approaches.some((cell) => distance(cell, engine) <= T.sortieRange)
    ) {
      logEvent(state, 'sortieRepelled', {
        engineId: wei.target,
        unitId: wei.unitId,
        reason: assault ? 'nightAssault' : 'unavailable',
        casualties: 0,
      });
    } else if (guard) {
      const defender = state.units
        .filter(
          (unit) =>
            unit.side === 'wei' &&
            unit.troops > 0 &&
            unit.level === 'wall' &&
            GATES.south.cells.some((cell) => sameCell(cell, unit)),
        )
        .sort((a, b) => b.troops - a.troops || a.id.localeCompare(b.id))[0]!;
      const before = defender.troops;
      Object.assign(
        defender,
        inflictCasualties(state, defender, Math.floor(before * T.sortieRepelledLoss)),
      );
      logEvent(state, 'sortieRepelled', {
        engineId: engine.id,
        unitId: defender.id,
        guardId: guard.id,
        reason: 'guard',
        before,
        after: defender.troops,
        casualties: before - defender.troops,
      });
    } else {
      const before = engine.durability;
      const damage = engine.covered ? T.coveredSortieDamage : T.sortieDamage;
      Object.assign(state, damageEngine(state, engine, damage));
      const after = state.engines.find((entry) => entry.id === engine.id)!;
      if (usableEngine(after) && !after.covered) after.burning = true;
      logEvent(state, 'sortieHit', {
        unitId: raider.id,
        engineId: engine.id,
        before,
        after: after.durability,
        damage,
        burning: after.burning,
      });
    }
  }
  if (wei?.kind === 'nightRepair') {
    const gate = state.gates[wei.target];
    const before = gate.durability;
    if (!gate.broken) {
      gate.durability = Math.min(gate.max, gate.durability + T.nightRepair);
      gate.damaged = gate.durability < gate.max / 2;
    }
    logEvent(state, 'nightRepair', { gateId: wei.target, before, after: gate.durability });
  }
  state.nightOrders = {};
  return wei?.kind === 'torches' && !assault;
}

/** Pure night resolution only. The caller drives the two armies' phases first. */
export function endDay(state: SiegeState): SiegeState {
  const next = structuredClone(state);
  if (next.outcome) return next;
  updateMainBodyThreat(next);
  cancelOccupiedPreparations(next);
  // Retain a newly issued mark through this night; expire it after its effective day.
  if (next.holdFast && next.holdFast.day <= next.day) {
    logEvent(next, 'holdFastEnded', { effectiveDay: next.holdFast.day });
    delete next.holdFast;
  }
  const skipWeiRecovery = resolveNightOrders(next);
  for (const engine of [...next.engines]) {
    if (!engine.burning || engine.covered || !usableEngine(engine)) continue;
    const before = engine.durability;
    Object.assign(next, damageEngine(next, engine, T.burningDamage));
    logEvent(next, 'engineBurning', {
      engineId: engine.id,
      damage: T.burningDamage,
      before,
      after: next.engines.find((entry) => entry.id === engine.id)!.durability,
    });
  }
  progressWorkshops(next);
  for (const key of Object.keys(next.footholds)) {
    const [x, y] = key.split(',').map(Number);
    const wall = { x: x!, y: y!, level: 'wall' as const };
    if (!next.units.some((unit) => activeUnit(unit) && climbingPosition(next, unit, wall) !== null))
      changeFoothold(
        next,
        wall,
        0,
        next.engines.some(
          (engine) => engine.raisedAt && sameCell(engine.raisedAt, wall) && !usableEngine(engine),
        )
          ? 'nightLadderDestroyed'
          : 'nightPositionEmpty',
        'night',
      );
  }
  for (const unit of next.units) delete unit.suppressedDay;
  // Establish rout outcomes before morale recovery can mask an annihilation.
  const beforeRecoveryOutcome = siegeOutcome(next, true);
  for (const unit of next.units) {
    if (
      unit.troops > 0 &&
      !(unit.lostTroopsToday ?? 0) &&
      !(skipWeiRecovery && unit.side === 'wei') &&
      unit.morale < T.moraleRecoveryCap
    )
      unit.morale = Math.min(T.moraleRecoveryCap, unit.morale + T.moraleRecovery);
    if (
      unit.troops > 0 &&
      unit.rotateRecoveryDay !== undefined &&
      unit.rotateRecoveryDay <= next.day + 1
    ) {
      const before = unit.troops;
      const recovered = Math.floor(unit.wounded / 2);
      unit.troops += recovered;
      unit.wounded -= recovered;
      delete unit.rotateRecoveryDay;
      logEvent(next, 'rotateRecovery', { unitId: unit.id, recovered, before, after: unit.troops });
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
  next.grain = Math.max(0, next.grain - 1);
  next.zhangheDistance = Math.max(0, next.zhangheDistance - 1);
  logEvent(next, 'daySupplies', { grain: next.grain, zhangheDistance: next.zhangheDistance });
  updateMainBodyThreat(next);
  if (next.units.some((unit) => unit.side === 'shu' && unit.troops > 0 && unit.level === 'wall'))
    next.stats.wallEverHeldAtNight = true;
  updatePersonnelStats(next);
  if (next.stats.lastActiveDay !== next.day) next.stats.idleDays++;
  next.outcome = beforeRecoveryOutcome ?? siegeOutcome(next, true);
  if (next.outcome) {
    updateScores(next);
    return next;
  }
  next.day++;
  if (
    next.act === 1 &&
    (next.day >= T.act2Day || (next.act2Day !== undefined && next.day >= next.act2Day))
  )
    next.act = 2;
  if (next.weatherByDay[next.day] === undefined) {
    next.rngState = advanceRandomState(next.rngState);
    next.weatherByDay[next.day] = weatherFromRoll(next.rngState / 0x100000000);
  }
  next.weather = next.weatherByDay[next.day]!;
  if (next.weather === 'snow')
    for (const [cell, brazier] of Object.entries(next.preparations.braziers)) {
      delete next.preparations.braziers[cell];
      logEvent(next, 'brazierDoused', {
        cell,
        litDay: brazier.litDay,
        reason: 'snow',
        before: true,
        after: false,
      });
    }
  next.ordersUsed.shu[next.day] = false;
  next.ordersUsed.wei[next.day] = false;
  logEvent(next, 'dayStarted', { weather: next.weather, act: next.act });
  return next;
}
