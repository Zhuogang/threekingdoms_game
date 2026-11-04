import { SOUTH_TRENCH, sameCell } from '../content/chencang';
import { wallRun, usableEngine } from '../rules/combat';
import type { SiegePosition, SiegeState } from '../rules/types';
import type { SiegeWalkthrough } from '../save';

export const WALKTHROUGH_STEPS = 9;
export const TRENCH_SOUTH_ROW = Math.max(...SOUTH_TRENCH.map((c) => c.y)) + 1;
export const WALKTHROUGH_CELLS: SiegePosition[] = SOUTH_TRENCH.filter(
  (c) => c.y === TRENCH_SOUTH_ROW - 1,
).map((c) => ({ x: c.x, y: TRENCH_SOUTH_ROW, level: 'ground' }));
export function startWalkthrough(state: SiegeState): SiegeWalkthrough {
  return { status: 'active', step: 1, startDay: state.day, logStart: state.log.length };
}
/** Real action logs, not clicks, advance action steps. Replaying records fresh actions.
 * Selection steps observe UI state; reading the report is persisted presentation state. */
export function advanceWalkthrough(
  progress: SiegeWalkthrough | undefined,
  state: SiegeState,
  ui: { tab: string; selected: string | null; reportReadDay?: number },
): SiegeWalkthrough | undefined {
  if (!progress || progress.status !== 'active') return progress;
  const next = { ...progress };
  const events = state.log.slice(next.logCursor ?? next.logStart);
  const unit = state.units.find((u) => u.id === ui.selected);
  const ladder = state.engines.find((e) => e.id === next.ladderId);
  let complete = false;
  switch (next.step) {
    case 1: {
      const selected = state.engines.find(
        (e) => e.id === ui.selected && e.kind === 'ladder' && usableEngine(e),
      );
      complete = Boolean(selected);
      if (selected) next.ladderId = selected.id;
      break;
    }
    case 2:
      complete = Boolean(ladder?.raisedAt);
      break;
    case 3: {
      const infantry = state.units.find(
        (u) =>
          u.side === 'shu' &&
          u.troopType === 'infantry' &&
          u.level === 'ground' &&
          ladder &&
          sameCell(u, ladder) &&
          events.some((e) => e.code === 'move' && e.params.unitId === u.id),
      );
      complete = Boolean(infantry);
      if (infantry) next.infantryId = infantry.id;
      break;
    }
    case 4:
      complete = events.some(
        (e) =>
          e.code === 'footholdChanged' &&
          e.params.sourceId === next.infantryId &&
          Number(e.params.after) > Number(e.params.before),
      );
      break;
    case 5:
      complete = Boolean(unit?.side === 'shu' && unit.troopType === 'archer');
      if (complete) next.archerId = unit!.id;
      break;
    case 6:
      complete = events.some(
        (e) =>
          e.code === 'suppressed' &&
          e.params.sourceId === next.archerId &&
          (!ladder?.raisedAt ||
            wallRun(state, ladder.raisedAt).some((c) => e.params.cell === `${c.x},${c.y}`)),
      );
      break;
    case 7:
      complete = events.some((e) => e.code === 'daySupplies' && e.day >= next.startDay);
      break;
    case 8:
      complete = state.day > next.startDay && (ui.reportReadDay ?? 0) >= state.day;
      break;
    case 9:
      complete = events.some(
        (e) =>
          e.code === 'covered' &&
          state.engines.some(
            (engine) => engine.id === e.params.engineId && engine.kind === 'ladder',
          ),
      );
      break;
  }
  if (complete) {
    next.logCursor = state.log.length;
    if (next.step === WALKTHROUGH_STEPS) next.status = 'done';
    else next.step++;
  }
  return JSON.stringify(next) === JSON.stringify(progress) ? progress : next;
}

/** Settle observable presentation steps before storing a resolved replay snapshot. */
export function settleWalkthrough(
  progress: SiegeWalkthrough | undefined,
  state: SiegeState,
  ui: Parameters<typeof advanceWalkthrough>[2],
) {
  for (let i = 0; i < WALKTHROUGH_STEPS; i++) {
    const next = advanceWalkthrough(progress, state, ui);
    if (next === progress) break;
    progress = next;
  }
  return progress;
}
