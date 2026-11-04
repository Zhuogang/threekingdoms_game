import { SIEGE_TUNING as T, ENGINE_RULES } from './tuning';
import {
  cancelOccupiedPreparations,
  logEvent,
  updatePersonnelStats,
  updateScores,
  updateMainBodyThreat,
} from './events';
import { fireArrowsReason, fireAtEngine, millstonePosition } from './preparations';
import { MIN_MORALE, ROUTED_MORALE } from './constants';
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
  climbingPosition,
  changeFoothold,
  gainWall,
  wallFoothold,
  settleUnitRout,
  damageEngine,
  damageGate,
  distance,
  inflictCasualties,
  predictSiegeAttack,
  predictSiegeClimb,
  suppressionCasualties,
  usableEngine,
  wallRun,
} from './combat';
import { endDay } from './day';
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

/** The same post-ascent morale cost applies to defended and empty-cell assaults. */
function assaultCosts(
  state: SiegeState,
  source: SiegeUnit,
  mounted: boolean,
  cell: string,
  targetId: string,
  frontage: number | null,
  casualties: number,
): void {
  const before = source.morale;
  source.assaultedDay = state.day;
  source.morale = Math.max(MIN_MORALE, source.morale - T.assaultMoraleLoss);
  Object.assign(source, settleUnitRout(state, source));
  state.stats.assaults++;
  logEvent(state, 'assault', {
    unitId: source.id,
    targetId,
    cell,
    before,
    after: source.morale,
    mounted,
    frontage,
    counterCasualties: casualties,
  });
  if (!mounted)
    for (const neighbour of state.units.filter(
      (entry) =>
        entry.id !== source.id &&
        entry.side === 'shu' &&
        activeUnit(entry) &&
        distance(entry, source) <= T.assaultNeighbourRange,
    )) {
      const moraleBefore = neighbour.morale;
      neighbour.morale = Math.max(MIN_MORALE, neighbour.morale - T.assaultNeighbourLoss);
      Object.assign(neighbour, settleUnitRout(state, neighbour));
      logEvent(state, 'assaultMorale', {
        unitId: neighbour.id,
        sourceId: source.id,
        before: moraleBefore,
        after: neighbour.morale,
      });
    }
}

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
    unit.morale = Math.min(T.moraleMax, unit.morale + T.rallyMorale);
    unit.routed = unit.morale < ROUTED_MORALE;
  } else if (kind === 'supervise') {
    const workshop = state.workshops.find((candidate) => candidate.id === target);
    if (!workshop || workshop.queue === null || workshop.daysRemaining <= 0)
      return 'Choose a workshop that is building an engine.';
    workshop.daysRemaining = Math.max(0, workshop.daysRemaining - T.superviseDays);
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
    if (typeof target !== 'string' || !validGate(target) || state.gates[target].broken)
      return 'Choose an unbroken gate.';
    state.nightOrders.wei = { kind, target };
  } else if (kind === 'nightAssault') {
    state.nightOrders.shu = { kind };
  } else if (kind === 'torches') {
    state.nightOrders.wei = { kind };
  } else if (kind === 'sortie') {
    const engine = state.engines.find((entry) => entry.id === target && usableEngine(entry));
    if (!engine || !GATES.south.approaches.some((cell) => distance(cell, engine) <= T.sortieRange))
      return 'Choose a usable engine within sortie range of the south gate approach.';
    const raider = state.units
      .filter(
        (entry) =>
          entry.side === 'wei' &&
          activeUnit(entry) &&
          entry.level === 'wall' &&
          GATES.south.cells.some((cell) => sameCell(cell, entry)) &&
          entry.suppressedDay !== state.day,
      )
      .sort((a, b) => b.troops - a.troops || a.id.localeCompare(b.id))[0];
    if (!raider) return 'A sortie needs an active, unsuppressed unit on the south gate top.';
    state.nightOrders.wei = { kind, target: engine.id, unitId: raider.id };
  } else {
    const start = typeof target === 'string' ? unit : target;
    if (!start || (unit && unit.level !== 'wall')) return 'Choose a wall run.';
    const cells = wallRun(state, start);
    if (!cells.length) return 'Choose a wall run between towers or gates.';
    state.holdFast = { day: state.day + 1, cells };
    logEvent(state, 'holdFastOrdered', {
      effectiveDay: state.day + 1,
      start: cellKey(cells[0]!),
      end: cellKey(cells.at(-1)!),
    });
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
    if (state.engines.filter(usableEngine).length >= T.engineCap)
      return 'The engine limit has been reached.';
    workshop.queue = action.kind;
    workshop.daysRemaining = ENGINE_RULES[action.kind].days;
    return null;
  }
  if (action.type === 'move') {
    const unit = availableUnit(state, action.unitId);
    if (!unit || unit.moved) return 'This unit cannot move today.';
    const path = pathTo(state, unit.id, action.x, action.y, action.level);
    if (!path || path.length < 2) return 'That destination is blocked or beyond movement range.';
    const from = cellKey(unit);
    const wasGround = unit.level === 'ground';
    Object.assign(unit, { x: action.x, y: action.y, level: action.level, moved: true });
    if (unit.side === 'shu' && wasGround && unit.level === 'wall') {
      state.stats.firstWallDay ??= state.day;
      logEvent(state, 'wallGained', { unitId: unit.id, from, cell: cellKey(unit), reason: 'move' });
    }
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
    if (progress !== 0 && progress !== T.trenchCapacity)
      return 'The outer trench cell must be empty or full.';
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
    Object.assign(state, damageGate(state, action.gateId, T.ramDamage));
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
      state.trenchFill[key] === T.trenchCapacity
    )
      return 'Choose an adjacent, unfilled south trench cell.';
    if (action.y === 17 && state.trenchFill[`${action.x},18`] !== T.trenchCapacity)
      return 'Fill the outer trench cell first.';
    // Plan §4.6: infantry fills at half efficiency (0.5); carts carry three 1.5-point loads.
    const fill = unit ? T.infantryFill : T.cartFill;
    state.trenchFill[key] = Math.min(
      T.trenchCapacity,
      (state.trenchFill[key] ?? 0) + fill,
    ) as TrenchProgress;
    if (unit) unit.acted = true;
    if (engine) {
      engine.acted = true;
      engine.uses = (engine.uses ?? T.cartLoads) - 1;
      if (engine.uses <= 0) state.engines = state.engines.filter((entry) => entry.id !== engine.id);
    }
    return null;
  }
  if (action.type === 'coverEngine') {
    const unit = availableUnit(state, action.unitId);
    const engine = state.engines.find(
      (entry) => entry.id === action.engineId && usableEngine(entry),
    );
    if (
      !unit ||
      unit.side !== 'shu' ||
      unit.troopType !== 'infantry' ||
      unit.level !== 'ground' ||
      !engine ||
      engine.covered ||
      !['ladder', 'ram'].includes(engine.kind) ||
      distance(unit, engine) > 1
    )
      return 'Use adjacent ground Shu infantry to cover an uncovered ladder or ram.';
    engine.covered = true;
    engine.burning = false;
    unit.acted = true;
    logEvent(state, 'covered', {
      unitId: unit.id,
      engineId: engine.id,
      before: false,
      after: true,
    });
    return null;
  }
  if (action.type === 'pileEarth') {
    const unit = 'unitId' in action ? availableUnit(state, action.unitId) : undefined;
    const engine = 'engineId' in action ? availableEngine(state, action.engineId) : undefined;
    if (
      unit
        ? unit.side !== 'shu' || unit.troopType !== 'infantry' || unit.level !== 'ground'
        : !engine || engine.kind !== 'earthCart' || (engine.uses ?? T.cartLoads) <= 0
    )
      return 'Use Shu ground infantry or a loaded earth cart.';
    const actor = unit ?? engine!;
    const key = cellKey(action);
    if (
      action.y !== 17 ||
      !SOUTH_TRENCH.some((cell) => sameCell(cell, action)) ||
      state.trenchFill[key] !== T.trenchCapacity ||
      state.trenchFill[`${action.x},18`] !== T.trenchCapacity ||
      distance(actor, action) !== 1 ||
      cellTerrain(state, actor.x, actor.y) !== 'plain' ||
      (state.mounds[key] ?? 0) >= T.moundComplete
    )
      return 'Choose an adjacent inner trench cell with both rows filled and an unfinished mound.';
    const before = state.mounds[key] ?? 0;
    const after = Math.min(T.moundComplete, before + (unit ? T.infantryEarth : T.cartEarth));
    state.mounds[key] = after as SiegeState['mounds'][string];
    actor.acted = true;
    logEvent(state, 'earthPiled', { sourceId: actor.id, cell: key, before, after });
    if (after === T.moundComplete) {
      state.stats.moundsBuilt++;
      logEvent(state, 'moundFinished', { sourceId: actor.id, cell: key, before, after });
    }
    if (engine) {
      engine.uses = (engine.uses ?? T.cartLoads) - 1;
      if (engine.uses === 0)
        state.engines = state.engines.filter((entry) => entry.id !== engine.id);
    }
    return null;
  }
  if (action.type === 'climb') {
    const unit = availableUnit(state, action.unitId);
    const forecast = unit && predictSiegeClimb(state, unit, { assault: action.assault });
    if (!unit || !forecast) return 'Climb from a ladder base or wall foot to an empty wall cell.';
    unit.acted = true;
    unit.climbing = true;
    if (forecast.casualties > 0)
      Object.assign(unit, inflictCasualties(state, unit, forecast.casualties));
    const mounted =
      activeUnit(unit) && gainWall(state, unit, forecast.top, forecast.footholdGain, 'climb');
    if (action.assault)
      assaultCosts(
        state,
        unit,
        mounted,
        cellKey(forecast.top),
        cellKey(forecast.top),
        forecast.frontage,
        forecast.casualties,
      );
    return null;
  }
  if (action.type === 'suppress') {
    const unit = 'unitId' in action ? availableUnit(state, action.unitId) : undefined;
    const engine = 'engineId' in action ? availableEngine(state, action.engineId) : undefined;
    const target = state.units.find(
      (entry) =>
        entry.id === action.targetId &&
        entry.side === 'wei' &&
        entry.level === 'wall' &&
        activeUnit(entry),
    );
    if (
      !target ||
      (unit
        ? unit.side !== 'shu' || unit.troopType !== 'archer' || unit.level !== 'ground'
        : !engine || engine.kind !== 'tower')
    )
      return 'Suppress a wall defender with ground Shu archers or a tower.';
    const source = unit ?? engine!;
    if (distance(source, target) > (engine ? T.towerRange : T.suppressRange))
      return 'Choose a wall defender in suppression range.';
    const before = target.troops;
    const targetCell = cellKey(target);
    const casualties = suppressionCasualties(state, source, target);
    Object.assign(target, inflictCasualties(state, target, casualties), {
      suppressedDay: state.day,
    });
    source.acted = true;
    logEvent(state, 'suppressed', {
      sourceId: source.id,
      targetId: target.id,
      cell: targetCell,
      to: cellKey(target),
      before,
      after: target.troops,
      casualties,
      suppressedDay: state.day,
    });
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
      const forecast = predictSiegeAttack(state, source.id, gateId, {
        assault: 'assault' in action && action.assault,
      });
      if (!forecast?.inRange || forecast.gateDamage === undefined)
        return 'Choose an unbroken gate in attack range.';
      Object.assign(state, damageGate(state, gateId, forecast.gateDamage));
    } else {
      if (!('targetId' in action)) return 'Choose an enemy target.';
      const forecast = predictSiegeAttack(state, source.id, action.targetId, {
        assault: 'assault' in action && action.assault,
      });
      if (!forecast?.inRange) return 'Choose an enemy within attack range.';
      const target = state.units.find((unit) => unit.id === action.targetId)!;
      const wallCell = { x: target.x, y: target.y };
      const targetBefore = target.troops;
      const sourceBefore = 'troops' in source ? source.troops : 0;
      const assault = 'assault' in action && action.assault === true;
      if ('side' in source && climbingFrontage(state, source, target) !== null) {
        source.attackedFromBelowDay = state.day;
        source.climbing = true;
      }
      Object.assign(target, inflictCasualties(state, target, forecast.casualties));
      if (forecast.counterattack.possible && 'side' in source)
        Object.assign(source, inflictCasualties(state, source, forecast.counterattack.casualties));
      const mounted =
        'side' in source &&
        activeUnit(source) &&
        gainWall(state, source, wallCell, forecast.footholdGain);
      if (assault && 'side' in source)
        assaultCosts(
          state,
          source,
          mounted,
          cellKey(wallCell),
          target.id,
          forecast.frontage,
          forecast.counterattack.casualties,
        );
      state.log.push({
        day: state.day,
        code: 'combat',
        params: {
          sourceId: source.id,
          targetId: target.id,
          casualties: forecast.casualties,
          counterCasualties: forecast.counterattack.casualties,
          cell: cellKey(wallCell),
          targetBefore,
          targetAfter: target.troops,
          sourceBefore,
          sourceAfter: 'troops' in source ? source.troops : 0,
          frontage: forecast.frontage,
        },
      });
    }
    source.acted = true;
    const stored =
      state.units.find((unit) => unit.id === source.id) ??
      state.engines.find((engine) => engine.id === source.id);
    if (stored) stored.acted = true;
    return null;
  }
  const unit = availableUnit(state, action.unitId);
  if (!unit || unit.side !== 'wei') return 'Choose a Wei unit that can act.';
  if (action.type !== 'buildWall' && unit.suppressedDay === state.day)
    return 'A suppressed unit cannot prepare or strike with siege countermeasures.';
  const key = cellKey(unit);
  if (
    action.type === 'lightBrazier' ||
    action.type === 'hoistMillstone' ||
    action.type === 'stackBoulders'
  ) {
    if (unit.level !== 'wall') return 'Preparations require a wall cell.';
    if (action.type === 'lightBrazier') {
      if (unit.troopType !== 'archer') return 'Only a wall archer can light a brazier.';
      if (state.preparations.braziers[key]) return 'This cell already has a brazier.';
      state.preparations.braziers[key] = { litDay: state.day };
    } else if (action.type === 'hoistMillstone') {
      if (!millstonePosition(unit))
        return 'Hoist a millstone on a gate top or directly above an approach.';
      if (state.preparations.millstones[key]?.hoisted)
        return 'This cell already has a hoisted millstone.';
      state.preparations.millstones[key] = { hoisted: true, day: state.day };
    } else {
      if (unit.troopType !== 'infantry') return 'Only wall infantry can stack boulders.';
      if (state.preparations.boulders[key]) return 'This cell already has stacked boulders.';
      state.preparations.boulders[key] = { day: state.day };
    }
    logEvent(
      state,
      action.type === 'lightBrazier'
        ? 'brazierPrepared'
        : action.type === 'hoistMillstone'
          ? 'millstonePrepared'
          : 'bouldersPrepared',
      { unitId: unit.id, cell: key, preparedDay: state.day, before: false, after: true },
    );
  } else if (action.type === 'fireArrows' || action.type === 'dropMillstone') {
    const engine = state.engines.find(
      (candidate) => candidate.id === action.engineId && usableEngine(candidate),
    );
    if (!engine) return 'Choose a usable engine.';
    if (action.type === 'fireArrows') {
      const reason = fireArrowsReason(state, unit, engine);
      if (reason) return reason;
      fireAtEngine(state, unit, engine);
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
        !state.preparations.millstones[key]?.hoisted
      )
        return 'The ram must be below this unit and a millstone must be hoisted.';
      if (state.preparations.millstones[key]!.day >= state.day)
        return 'The millstone must be prepared on an earlier day.';
      const before = engine.durability;
      const damage = engine.covered ? T.coveredMillstoneDamage : T.millstoneDamage;
      Object.assign(state, damageEngine(state, engine, damage));
      state.preparations.millstones[key]!.hoisted = false;
      logEvent(state, 'millstoneHit', {
        unitId: unit.id,
        engineId: engine.id,
        cell: key,
        before,
        after: state.engines.find((entry) => entry.id === engine.id)!.durability,
        damage,
      });
    }
  } else if (action.type === 'dropBoulders') {
    const target = state.units.find(
      (candidate) =>
        candidate.id === action.targetId && candidate.side === 'shu' && activeUnit(candidate),
    );
    if (!target || unit.level !== 'wall' || climbingFrontage(state, target, unit) === null)
      return 'Choose a Shu unit directly below on a ladder or wall foot.';
    const prepared = state.preparations.boulders[key];
    if (!prepared) return 'Stack boulders before dropping them.';
    if (prepared.day >= state.day) return 'The boulders must be prepared on an earlier day.';
    const climbing = target.climbing || target.attackedFromBelowDay === state.day;
    const position = climbingPosition(state, target, unit);
    const casualties = Math.min(
      target.troops,
      Math.floor(
        unit.troops *
          T.boulderCoefficient *
          (climbing ? T.climbingBoulderMultiplier : 1) *
          (target.assaultedDay === state.day ? T.assaultBoulderMultiplier : 1) *
          (position === 'mound' ? T.moundBoulderMultiplier : 1),
      ),
    );
    const before = target.troops;
    Object.assign(target, inflictCasualties(state, target, casualties));
    changeFoothold(
      state,
      unit,
      wallFoothold(state, unit) - T.boulderFootholdLoss,
      'boulders',
      unit.id,
    );
    delete state.preparations.boulders[key];
    logEvent(state, 'bouldersHit', {
      unitId: unit.id,
      targetId: target.id,
      cell: key,
      before,
      after: target.troops,
      casualties,
    });
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
  updateMainBodyThreat(next);
  if (action.type === 'withdraw') {
    next.outcome = 'historical';
    next.withdrawn = true;
  } else {
    const reason = performAction(next, action);
    if (reason) return { ok: false, reason };
    if (
      ['attack', 'ram', 'suppress', 'fireArrows', 'dropMillstone', 'dropBoulders'].includes(
        action.type,
      )
    )
      next.stats.lastActiveDay = next.day;
    cancelOccupiedPreparations(next);
    next.outcome = siegeOutcome(next);
  }
  updatePersonnelStats(next);
  updateMainBodyThreat(next);
  updateScores(next);
  next.log.push({
    day: next.day,
    code: action.type,
    params: {
      ...('unitId' in action ? { unitId: action.unitId } : {}),
      ...('engineId' in action ? { engineId: action.engineId } : {}),
      ...(action.type === 'order'
        ? {
            side: action.side,
            ...(action.kind === 'nightAssault' ||
            action.kind === 'torches' ||
            action.kind === 'sortie' ||
            action.kind === 'nightRepair'
              ? {}
              : { kind: action.kind }),
          }
        : {}),
    },
  });
  return { ok: true, state: next, events: next.log.slice(state.log.length) };
}
