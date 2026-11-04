import { SOUTH_TRENCH, sameCell } from '../content/chencang';
import { activeUnit, wallRun, usableEngine } from '../rules/combat';
import { reachableCells } from '../rules/movement';
import type { SiegePosition, SiegeState, SiegeSide } from '../rules/types';
import type { SiegeWalkthrough } from '../save';

export const WALKTHROUGH_STEPS = 9;
export const walkthroughSteps = (side: SiegeSide) => (side === 'wei' ? 6 : WALKTHROUGH_STEPS);
export const TRENCH_SOUTH_ROW = Math.max(...SOUTH_TRENCH.map((c) => c.y)) + 1;
export const WALKTHROUGH_CELLS: SiegePosition[] = SOUTH_TRENCH.filter(
  (c) => c.y === TRENCH_SOUTH_ROW - 1,
).map((c) => ({ x: c.x, y: TRENCH_SOUTH_ROW, level: 'ground' }));
export function startWalkthrough(state: SiegeState): SiegeWalkthrough {
  return { status: 'active', step: 1, startDay: state.day, logStart: state.log.length };
}
/** Step three waits for tomorrow when no remaining infantry move can reach its ladder. */
export function walkthroughNeedsEndDay(
  progress: SiegeWalkthrough | undefined,
  state: SiegeState,
  playerSide: SiegeSide,
): boolean {
  if (playerSide !== 'shu' || progress?.status !== 'active' || progress.step !== 3) return false;
  const ladder = state.engines.find(
    (e) => e.id === progress.ladderId && e.kind === 'ladder' && usableEngine(e),
  );
  if (!ladder) return false;
  return !state.units.some(
    (u) =>
      u.side === 'shu' &&
      u.troopType === 'infantry' &&
      u.level === 'ground' &&
      activeUnit(u) &&
      !u.moved &&
      reachableCells(state, u.id).some((c) => c.level === 'ground' && sameCell(c, ladder)),
  );
}
export function walkthroughTargets(
  progress: SiegeWalkthrough | undefined,
  state: SiegeState,
  playerSide: SiegeSide,
): SiegePosition[] {
  if (progress?.status !== 'active') return [];
  if (playerSide === 'wei') {
    if (progress.step <= 2)
      return state.units
        .filter((u) => u.officer.id === 'haozhao')
        .map((u) => ({ x: u.x, y: u.y, level: u.level }));
    if (progress.step <= 4)
      return state.units
        .filter((u) => u.side === 'wei' && u.troopType === 'archer' && u.troops > 0)
        .map((u) => ({ x: u.x, y: u.y, level: u.level }));
    return state.engines
      .filter((e) => e.kind === 'ladder' && usableEngine(e))
      .map((e) => ({ x: e.x, y: e.y, level: 'ground' }));
  }
  const ladders = state.engines.filter(
    (e) =>
      e.kind === 'ladder' && usableEngine(e) && (!progress.ladderId || e.id === progress.ladderId),
  );
  const bases = ladders.map((e) => ({ x: e.x, y: e.y, level: 'ground' as const }));
  const tops = ladders.flatMap((e) =>
    e.raisedAt ? [{ ...e.raisedAt, level: 'wall' as const }] : [],
  );
  switch (progress.step) {
    case 1:
      return state.engines
        .filter((e) => e.kind === 'ladder' && usableEngine(e))
        .map((e) => ({ x: e.x, y: e.y, level: 'ground' }));
    case 2:
    case 3:
    case 9:
      return bases;
    case 4:
      return tops;
    case 5:
      return state.units
        .filter((u) => u.side === playerSide && u.troopType === 'archer' && u.troops > 0)
        .map((u) => ({ x: u.x, y: u.y, level: u.level }));
    case 6:
      return tops.flatMap((top) =>
        state.units
          .filter(
            (u) =>
              u.side !== playerSide &&
              u.level === 'wall' &&
              wallRun(state, top).some((c) => sameCell(u, c)),
          )
          .map((u) => ({ x: u.x, y: u.y, level: u.level })),
      );
    case 7:
      return bases;
    case 8:
      return tops;
    default:
      return [];
  }
}
/** Action steps observe real logs; selection and arrival steps observe current state.
 * Reading the report is persisted presentation state. */
export function advanceWalkthrough(
  progress: SiegeWalkthrough | undefined,
  state: SiegeState,
  ui: { tab: string; selected: string | null; reportReadDay?: number; playerSide?: SiegeSide },
): SiegeWalkthrough | undefined {
  if (!progress || progress.status !== 'active') return progress;
  const next = { ...progress };
  const events = state.log.slice(next.logCursor ?? next.logStart);
  const unit = state.units.find((u) => u.id === ui.selected);
  const ladder = state.engines.find((e) => e.id === next.ladderId);
  let complete = false;
  if (ui.playerSide === 'wei') {
    switch (next.step) {
      case 1:
        complete = unit?.officer.id === 'haozhao';
        break;
      case 2:
        complete = events.some(
          (e) => e.code === 'millstonePrepared' && e.params.unitId === 'wei-haozhao',
        );
        break;
      case 3:
        complete = unit?.side === 'wei' && unit.troopType === 'archer';
        if (complete) next.archerId = unit!.id;
        break;
      case 4:
        complete = events.some(
          (e) => e.code === 'brazierPrepared' && e.params.unitId === next.archerId,
        );
        break;
      case 5:
        complete = state.day > next.startDay;
        break;
      case 6:
        complete =
          state.day > next.startDay &&
          (ui.reportReadDay ?? 0) >= state.day &&
          events.some(
            (e) =>
              e.code === 'fireArrowHit' &&
              state.engines.some(
                (engine) => engine.id === e.params.engineId && engine.kind === 'ladder',
              ),
          );
        break;
    }
  } else
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
            sameCell(u, ladder),
        );
        complete = Boolean(infantry);
        if (infantry) next.infantryId = infantry.id;
        break;
      }
      case 4:
        complete = events.some(
          (e) =>
            (e.code === 'footholdChanged' &&
              e.params.sourceId === next.infantryId &&
              Number(e.params.after) > Number(e.params.before)) ||
            (e.code === 'wallGained' && e.params.unitId === next.infantryId),
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
    if (next.step === walkthroughSteps(ui.playerSide ?? 'shu')) next.status = 'done';
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
