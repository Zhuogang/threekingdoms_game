import { GATES, sameCell } from '../content/chencang';
import { damageEngine, distance, usableEngine } from './combat';
import { logEvent } from './events';
import { SIEGE_TUNING as T } from './tuning';
import type { SiegeEngine, SiegeState, SiegeUnit } from './types';

export function millstonePosition(unit: SiegeUnit): boolean {
  return (
    unit.level === 'wall' &&
    Object.values(GATES).some(
      (gate) =>
        gate.cells.some((cell) => sameCell(cell, unit)) ||
        gate.approaches.some((cell) => cell.x === unit.x && cell.y - 1 === unit.y),
    )
  );
}

export function fireArrowsReason(
  state: SiegeState,
  unit: SiegeUnit,
  engine: SiegeEngine,
): string | null {
  if (unit.suppressedDay === state.day) return 'A suppressed unit cannot fire arrows.';
  if (unit.level !== 'wall' || unit.troopType !== 'archer')
    return 'Fire arrows require a wall archer.';
  if (distance(unit, engine) > T.wallArcherRange) return 'Choose an engine within archer range.';
  const nearby = Object.entries(state.preparations.braziers).filter(([key]) => {
    const [x, y] = key.split(',').map(Number);
    return distance(unit, { x: x!, y: y! }) <= 1;
  });
  if (!nearby.length) return 'A lit brazier is required within one cell.';
  if (!nearby.some(([, brazier]) => brazier.litDay < state.day))
    return 'The brazier must be prepared on an earlier day.';
  return null;
}

/** Shared by ordinary fire arrows and the free shots when torches catch a night assault. */
export function fireAtEngine(state: SiegeState, unit: SiegeUnit, engine: SiegeEngine): void {
  const weather =
    state.weather === 'wind'
      ? T.windFireMultiplier
      : state.weather === 'snow'
        ? T.snowFireMultiplier
        : 1;
  const damage =
    unit.troops * T.fireArrowCoefficient * weather * (engine.covered ? T.coveredFireMultiplier : 1);
  const before = engine.durability;
  Object.assign(state, damageEngine(state, engine, damage));
  const after = state.engines.find((entry) => entry.id === engine.id)!;
  if (usableEngine(after) && !after.covered) after.burning = true;
  logEvent(state, 'fireArrowHit', {
    unitId: unit.id,
    engineId: engine.id,
    before,
    after: after.durability,
    damage,
    covered: !!engine.covered,
    burning: after.burning,
  });
}
