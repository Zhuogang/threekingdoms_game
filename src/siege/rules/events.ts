import { SIEGE_TUNING as T } from './tuning';
import { SHU_ROSTER, WEI_ROSTER } from '../content/chencang';
import type { SiegeLogEntry, SiegeState } from './types';

export function logEvent(state: SiegeState, code: string, params: SiegeLogEntry['params']): void {
  state.log.push({ day: state.day, code, params });
}

/** Wounded count as lost until returned to the fighting ranks. Never parse the event log. */
export function updatePersonnelStats(state: SiegeState): void {
  for (const side of ['shu', 'wei'] as const) {
    const roster = side === 'shu' ? SHU_ROSTER : WEI_ROSTER;
    state.stats[side === 'shu' ? 'shuLost' : 'weiLost'] = Math.max(
      0,
      roster.reduce((sum, unit) => sum + unit.troops, 0) -
        state.units
          .filter((unit) => unit.side === side)
          .reduce((sum, unit) => sum + unit.troops, 0),
    );
  }
}

export function cancelOccupiedPreparations(state: SiegeState): void {
  for (const unit of state.units) {
    if (unit.side !== 'shu' || unit.level !== 'wall' || unit.troops <= 0) continue;
    const cell = `${unit.x},${unit.y}`;
    for (const [kind, table] of Object.entries(state.preparations)) {
      if (!table[cell]) continue;
      delete table[cell];
      logEvent(state, 'preparationCancelled', {
        unitId: unit.id,
        cell,
        kind,
        reason: 'shuOccupied',
      });
    }
  }
}

export function updateMainBodyThreat(state: SiegeState): void {
  const main = state.units.find((unit) => unit.officer.id === 'zhugeliang');
  if (
    main &&
    state.units.some(
      (unit) =>
        unit.side === 'wei' &&
        unit.troops > 0 &&
        unit.x >= 0 &&
        Math.abs(unit.x - main.x) + Math.abs(unit.y - main.y) <= T.mainBodyThreatRange,
    )
  )
    state.mainBodyThreatened = true;
}
