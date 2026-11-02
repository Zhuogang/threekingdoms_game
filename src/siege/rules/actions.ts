import { ROUTED_MORALE } from './constants';
import {
  CAMP_CELLS,
  GATES,
  INNER_WALL_SEGMENTS,
  SOUTH_TRENCH,
  WORKSHOPS,
  cellKey,
  sameCell,
} from '../content/chencang';
import {
  activeUnit,
  climbingFrontage,
  damageEngine,
  damageGate,
  distance,
  inflictCasualties,
  predictSiegeAttack,
  usableEngine,
  wallRun,
} from './combat';
import { ENGINE_RULES, endDay } from './day';
import { cellTerrain, isMapCell } from './map';
import { engineReachable, pathTo } from './movement';
import { siegeOutcome } from './outcome';
import type {
  GateId,
  SiegeAction,
  SiegeActionResult,
  SiegeEngine,
  SiegeState,
  SiegeUnit,
  TrenchProgress,
} from './types';
export type { SiegeAction, SiegeActionResult } from './types';

const availableUnit = (state: SiegeState, id: string): SiegeUnit | undefined =>
  state.units.find(
    (unit) => unit.id === id && activeUnit(unit) && !unit.acted && isMapCell(unit.x, unit.y),
  );
const availableEngine = (state: SiegeState, id: string): SiegeEngine | undefined =>
  state.engines.find((engine) => engine.id === id && usableEngine(engine) && !engine.acted);
const validGate = (id: string): id is GateId => Object.hasOwn(GATES, id);

function applyOrder(
  state: SiegeState,
  action: Extract<SiegeAction, { type: 'order' }>,
): string | null {
  const { side, kind, target } = action;
  const commander = state.units.find(
    (unit) => unit.officer.id === (side === 'shu' ? 'zhugeliang' : 'haozhao') && activeUnit(unit),
  );
  if (!commander) return 'The commander cannot issue orders.';
  if (state.ordersUsed[side][state.day]) return 'This side has already issued its daily order.';
  const unit =
    typeof target === 'string'
      ? state.units.find(
          (candidate) => candidate.id === target && candidate.side === side && candidate.troops > 0,
        )
      : undefined;
  if (kind === 'rally') {
    if (!unit) return 'Choose a living friendly unit.';
    unit.morale = Math.min(100, unit.morale + 15);
    unit.routed = unit.morale < ROUTED_MORALE;
  } else if (kind === 'supervise') {
    const workshop = state.workshops.find((candidate) => candidate.id === target);
    if (!workshop || workshop.queue === null || workshop.daysRemaining <= 0)
      return 'Choose a workshop that is building an engine.';
    workshop.daysRemaining = Math.max(0, workshop.daysRemaining - 1);
  } else if (kind === 'rotate') {
    if (!unit || !activeUnit(unit) || unit.wounded <= 0 || unit.rotateRecoveryDay !== undefined)
      return 'Choose an active Shu unit with wounded.';
    const free = CAMP_CELLS.find(
      (cell) =>
        !state.units.some(
          (other) =>
            other.id !== unit.id &&
            other.troops > 0 &&
            other.level === 'ground' &&
            sameCell(other, cell),
        ) && !state.engines.some((engine) => sameCell(engine, cell)),
    );
    if (!free) return 'There is no free camp cell.';
    Object.assign(unit, free, {
      level: 'ground',
      moved: true,
      acted: true,
      climbing: false,
      rotateRecoveryDay: state.day + 1,
    });
  } else if (kind === 'nightRepair') {
    if (!validGate(target) || state.gates[target].broken) return 'Choose an unbroken gate.';
    const gate = state.gates[target];
    gate.durability = Math.min(gate.max, gate.durability + 100);
    gate.damaged = gate.durability < gate.max / 2;
  } else {
    const start = typeof target === 'string' ? unit : target;
    if (!start || (unit && unit.level !== 'wall')) return 'Choose a wall run.';
    const cells = wallRun(state, start);
    if (!cells.length) return 'Choose a wall run between towers or gates.';
    state.holdFast = { day: state.day, cells };
  }
  state.ordersUsed[side][state.day] = true;
  return null;
}

function performAction(
  state: SiegeState,
  action: Exclude<SiegeAction, { type: 'endDay' | 'withdraw' }>,
): string | null {
  if (action.type === 'order') return applyOrder(state, action);
  if (action.type === 'queueEngine') {
    const workshop = state.workshops.find((candidate) => candidate.id === action.workshopId);
    if (!workshop || !WORKSHOPS.some((entry) => entry.id === workshop.id))
      return 'Unknown workshop.';
    if (workshop.queue !== null) return 'This workshop is already building an engine.';
    if (action.kind === 'tower' && state.act < 2) return 'Siege towers unlock in act 2.';
    if (state.engines.filter(usableEngine).length >= 6)
      return 'There are already six usable engines on the map.';
    workshop.queue = action.kind;
    workshop.daysRemaining = ENGINE_RULES[action.kind].days;
    return null;
  }
  if (action.type === 'move') {
    const unit = availableUnit(state, action.unitId);
    if (!unit || unit.moved) return 'This unit cannot move today.';
    const path = pathTo(state, unit.id, action.x, action.y, action.level);
    if (!path || path.length < 2) return 'That destination is blocked or beyond movement range.';
    Object.assign(unit, { x: action.x, y: action.y, level: action.level, moved: true });
    return null;
  }
  if (action.type === 'moveEngine') {
    const engine = availableEngine(state, action.engineId);
    if (
      !engine ||
      engine.moved ||
      !engineReachable(state, engine.id).some((cell) => sameCell(cell, action))
    )
      return 'This engine cannot reach that cell today.';
    Object.assign(engine, { x: action.x, y: action.y, moved: true });
    return null;
  }
  if (action.type === 'raiseLadder') {
    const engine = availableEngine(state, action.engineId);
    if (
      !engine ||
      engine.kind !== 'ladder' ||
      engine.raisedAt ||
      engine.y !== 19 ||
      !SOUTH_TRENCH.some((cell) => cell.x === engine.x && cell.y === 18) ||
      cellTerrain(state, engine.x, 16) !== 'wall'
    )
      return 'Place an unraised ladder south of the south trench.';
    const progress = state.trenchFill[`${engine.x},18`];
    if (progress !== 0 && progress !== 3) return 'The outer trench cell must be empty or full.';
    engine.raisedAt = { x: engine.x, y: 16 };
    engine.acted = true;
    return null;
  }
  if (action.type === 'ram') {
    const engine = availableEngine(state, action.engineId);
    if (
      !engine ||
      engine.kind !== 'ram' ||
      !GATES[action.gateId].approaches.some((cell) => sameCell(cell, engine)) ||
      state.gates[action.gateId].broken
    )
      return 'Place a usable ram on an unbroken gate approach.';
    Object.assign(state, damageGate(state, action.gateId, 160));
    engine.acted = true;
    return null;
  }
  if (action.type === 'fillTrench') {
    const unit = 'unitId' in action ? availableUnit(state, action.unitId) : undefined;
    const engine = 'engineId' in action ? availableEngine(state, action.engineId) : undefined;
    if (
      unit
        ? unit.side !== 'shu' ||
          unit.troopType !== 'infantry' ||
          unit.level !== 'ground' ||
          state.engines.some((entry) => sameCell(entry, unit))
        : !engine || engine.kind !== 'earthCart'
    )
      return 'Use Shu infantry without an engine or an earth cart.';
    const actor = unit ?? engine!;
    const key = cellKey(action);
    if (
      !SOUTH_TRENCH.some((cell) => sameCell(cell, action)) ||
      distance(actor, action) !== 1 ||
      state.trenchFill[key] === 3
    )
      return 'Choose an adjacent, unfilled south trench cell.';
    if (action.y === 17 && state.trenchFill[`${action.x},18`] !== 3)
      return 'Fill the outer trench cell first.';
    state.trenchFill[key] = Math.min(
      3,
      (state.trenchFill[key] ?? 0) + (engine ? 1 : 0.5),
    ) as TrenchProgress;
    if (unit) unit.acted = true;
    if (engine) {
      engine.acted = true;
      engine.uses = (engine.uses ?? 3) - 1;
      if (engine.uses <= 0) state.engines = state.engines.filter((entry) => entry.id !== engine.id);
    }
    return null;
  }
  if (action.type === 'attack') {
    const source =
      'unitId' in action
        ? availableUnit(state, action.unitId)
        : availableEngine(state, action.engineId);
    if (!source) return 'This attacker cannot act today.';
    const gateId =
      'gateId' in action ? action.gateId : validGate(action.targetId) ? action.targetId : undefined;
    if (gateId !== undefined) {
      const forecast = predictSiegeAttack(state, source.id, gateId);
      if (!forecast?.inRange || forecast.gateDamage === undefined)
        return 'Choose an unbroken gate in attack range.';
      Object.assign(state, damageGate(state, gateId, forecast.gateDamage));
    } else {
      if (!('targetId' in action)) return 'Choose an enemy target.';
      const forecast = predictSiegeAttack(state, source.id, action.targetId);
      if (!forecast?.inRange) return 'Choose an enemy within attack range.';
      const target = state.units.find((unit) => unit.id === action.targetId)!;
      if ('side' in source && climbingFrontage(state, source, target) !== null) {
        source.attackedFromBelowDay = state.day;
        source.climbing = true;
      }
      Object.assign(target, inflictCasualties(state, target, forecast.casualties));
      if (forecast.counterattack.possible && 'side' in source)
        Object.assign(source, inflictCasualties(state, source, forecast.counterattack.casualties));
      state.log.push({
        day: state.day,
        code: 'combat',
        params: {
          sourceId: source.id,
          targetId: target.id,
          casualties: forecast.casualties,
          counterCasualties: forecast.counterattack.casualties,
          frontage: forecast.frontage,
        },
      });
    }
    source.acted = true;
    return null;
  }
  const unit = availableUnit(state, action.unitId);
  if (!unit || unit.side !== 'wei') return 'Choose a Wei unit that can act.';
  if (action.type === 'fireArrows' || action.type === 'dropMillstone') {
    const engine = state.engines.find(
      (candidate) => candidate.id === action.engineId && usableEngine(candidate),
    );
    if (!engine) return 'Choose a usable engine.';
    if (action.type === 'fireArrows') {
      if (unit.troopType !== 'archer' || distance(unit, engine) > (unit.level === 'wall' ? 3 : 2))
        return 'Choose an engine within archer range.';
      const weather = state.weather === 'wind' ? 1.25 : state.weather === 'snow' ? 0.6 : 1;
      Object.assign(state, damageEngine(state, engine, unit.troops * 0.4 * weather));
      const damaged = state.engines.find((entry) => entry.id === engine.id)!;
      if (usableEngine(damaged)) damaged.burning = true;
    } else {
      if (
        engine.kind !== 'ram' ||
        unit.level !== 'wall' ||
        !Object.values(GATES).some(
          (gate) =>
            gate.approaches.some((cell) => sameCell(cell, engine)) &&
            (gate.cells.some((cell) => sameCell(cell, unit)) ||
              (unit.x === engine.x && unit.y === engine.y - 1)),
        ) ||
        (unit.lastMillstoneDay !== undefined && state.day - unit.lastMillstoneDay < 2)
      )
        return 'The ram is not below this unit, or its millstone is on cooldown.';
      Object.assign(state, damageEngine(state, engine, 200));
      unit.lastMillstoneDay = state.day;
    }
  } else if (action.type === 'dropBoulders') {
    const target = state.units.find(
      (candidate) =>
        candidate.id === action.targetId && candidate.side === 'shu' && activeUnit(candidate),
    );
    if (
      !target ||
      unit.troopType !== 'infantry' ||
      unit.level !== 'wall' ||
      climbingFrontage(state, target, unit) === null
    )
      return 'Choose a Shu unit directly below on a ladder or wall foot.';
    const climbing = target.climbing || target.attackedFromBelowDay === state.day;
    const casualties = Math.min(
      target.troops,
      Math.floor(unit.troops * 0.25 * (climbing ? 1.5 : 1)),
    );
    Object.assign(target, inflictCasualties(state, target, casualties));
  } else if (action.type === 'buildWall') {
    const segment = INNER_WALL_SEGMENTS.find((entry) =>
      entry.cells.some((cell) => sameCell(cell, unit)),
    );
    if (
      state.act < 2 ||
      unit.level !== 'ground' ||
      !segment ||
      state.innerWall[segment.index] === 4
    )
      return 'Stand on an unfinished inner-wall segment in act 2.';
    const progress = (state.innerWall[segment.index] ?? 0) + 1;
    state.innerWall[segment.index] = progress as 1 | 2 | 3 | 4;
    if (progress === 4) {
      for (const builder of state.units.filter(
        (entry) =>
          entry.troops > 0 &&
          entry.level === 'ground' &&
          segment.cells.some((cell) => sameCell(cell, entry)),
      )) {
        builder.level = 'wall';
      }
    }
  }
  unit.acted = true;
  return null;
}

/** Validates on an isolated JSON draft. A rejected action never changes the caller's state. */
export function applySiegeAction(state: SiegeState, action: SiegeAction): SiegeActionResult {
  if (state.outcome) return { ok: false, reason: 'The siege has ended.' };
  if (action.type === 'endDay') {
    const next = endDay(state);
    return { ok: true, state: next, events: next.log.slice(state.log.length) };
  }
  const next = structuredClone(state);
  if (action.type === 'withdraw') {
    next.outcome = 'historical';
    next.withdrawn = true;
  } else {
    const reason = performAction(next, action);
    if (reason) return { ok: false, reason };
    next.outcome = siegeOutcome(next);
  }
  next.log.push({
    day: next.day,
    code: action.type,
    params: {
      ...('unitId' in action ? { unitId: action.unitId } : {}),
      ...('engineId' in action ? { engineId: action.engineId } : {}),
      ...(action.type === 'order' ? { side: action.side, kind: action.kind } : {}),
    },
  });
  return { ok: true, state: next, events: next.log.slice(state.log.length) };
}
