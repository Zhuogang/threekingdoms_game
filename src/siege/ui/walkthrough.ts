import { SOUTH_TRENCH } from '../content/chencang';
import { usableEngine } from '../rules/combat';
import type { SiegePosition, SiegeState } from '../rules/types';
import type { SiegeWalkthrough } from '../save';

export const TRENCH_SOUTH_ROW = Math.max(...SOUTH_TRENCH.map((c) => c.y)) + 1;
export const WALKTHROUGH_CELLS: SiegePosition[] = SOUTH_TRENCH.filter(
  (c) => c.y === TRENCH_SOUTH_ROW - 1,
).map((c) => ({ x: c.x, y: TRENCH_SOUTH_ROW, level: 'ground' }));

export function startWalkthrough(state: SiegeState): SiegeWalkthrough {
  return { status: 'active', step: 1, startDay: state.day, logStart: state.log.length };
}

/** Presentation progress only: observing the tutorial never changes the rules state.
 * Existing queues/engines also count when replaying in a battle already in progress.
 */
export function advanceWalkthrough(
  progress: SiegeWalkthrough | undefined,
  state: SiegeState,
  ui: { tab: string; selected: string | null },
): SiegeWalkthrough | undefined {
  if (!progress || progress.status !== 'active') return progress;
  const next = { ...progress };
  const events = state.log.slice(next.logStart);
  const carts = state.engines.filter((e) => e.kind === 'earthCart' && usableEngine(e));
  const cartWork = state.workshops.find((w) => w.queue === 'earthCart');
  const cartOrigin = (id: string) => state.workshops.find((w) => id.startsWith(`${w.id}-`))?.id;
  const supervised = events.find(
    (e) => e.code === 'order' && e.params.side === 'shu' && e.params.kind === 'supervise',
  );
  for (;;) {
    const cart = carts.find((e) => e.id === next.cartId);
    let complete = false;
    switch (next.step) {
      case 1:
        complete = ui.tab === 'workshop';
        break;
      case 2:
        complete = Boolean(cartWork || carts.length);
        if (complete) next.cartWorkshopId = cartWork?.id ?? cartOrigin(carts[0]!.id);
        break;
      case 3:
        complete =
          state.workshops.some((w) => w.id !== next.cartWorkshopId && w.queue === 'ladder') ||
          state.engines.some(
            (e) =>
              e.kind === 'ladder' && usableEngine(e) && cartOrigin(e.id) !== next.cartWorkshopId,
          );
        break;
      case 4:
        complete = Boolean(supervised);
        break;
      case 5:
        complete = Boolean(
          supervised && events.some((e) => e.code === 'daySupplies' && e.day >= supervised.day),
        );
        break;
      case 6: {
        const selected = carts.find((e) => e.id === ui.selected);
        complete = Boolean(selected);
        if (selected) next.cartId = selected.id;
        break;
      }
      case 7:
        complete = Boolean(
          cart &&
          WALKTHROUGH_CELLS.some((c) => c.x === cart.x && c.y === cart.y) &&
          events.some((e) => e.code === 'moveEngine' && e.params.engineId === cart.id),
        );
        break;
      case 8:
        complete = events.some((e) => e.code === 'fillTrench' && e.params.engineId === next.cartId);
        if (complete) next.status = 'done';
        break;
    }
    if (!complete || next.status === 'done') break;
    next.step++;
  }
  return JSON.stringify(next) === JSON.stringify(progress) ? progress : next;
}
