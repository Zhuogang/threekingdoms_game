import { COURTYARD, sameCell } from '../content/chencang';
import { activeUnit } from './combat';
import type { SiegeState } from './types';

/** Defeat can be immediate; victory and grain exhaustion are resolved after the defender's turn. */
export function siegeOutcome(state: SiegeState, atDayEnd = false): SiegeState['outcome'] {
  if (state.outcome) return state.outcome;
  const shu = state.units.filter((unit) => unit.side === 'shu');
  const main = shu.find((unit) => unit.officer.id === 'zhugeliang');
  if (!shu.some(activeUnit) || (main !== undefined && !activeUnit(main))) return 'defeat';
  if (!atDayEnd) return null;
  if (
    !state.units.some((unit) => unit.side === 'wei' && activeUnit(unit)) ||
    shu.some(
      (unit) =>
        activeUnit(unit) &&
        unit.level === 'ground' &&
        COURTYARD.some((cell) => sameCell(cell, unit)),
    )
  )
    return 'victory';
  return state.grain <= 0 ? 'historical' : null;
}
