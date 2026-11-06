import { activeUnit, usableEngine } from '../rules/combat';
import { isMapCell } from '../rules/map';
import { engineReachable, reachableCells } from '../rules/movement';
import type { SiegeSide, SiegeState } from '../rules/types';
import { hasActorAction } from './commands';

export type ActorTodo = 'act' | 'move' | 'none';
const todoCache = new WeakMap<SiegeState, Map<string, ActorTodo>>();

/** Faction orders, standby and informational panel copy are not actor actions. */
export function actorTodo(state: SiegeState, id: string, side: SiegeSide): ActorTodo {
  let cache = todoCache.get(state);
  if (!cache) todoCache.set(state, (cache = new Map()));
  const key = JSON.stringify([id, side]);
  if (!cache.has(key)) cache.set(key, computeTodo(state, id, side));
  return cache.get(key)!;
}
function computeTodo(state: SiegeState, id: string, side: SiegeSide): ActorTodo {
  const unit = state.units.find((u) => u.id === id);
  const engine = state.engines.find((e) => e.id === id);
  const actor = unit ?? engine;
  if (
    state.outcome ||
    !actor ||
    actor.acted ||
    !isMapCell(actor.x, actor.y) ||
    (unit
      ? unit.side !== side || !activeUnit(unit)
      : side !== 'shu' || !engine || !usableEngine(engine))
  )
    return 'none';
  if (hasActorAction(state, id, side)) return 'act';
  return (unit ? reachableCells(state, id) : engineReachable(state, id)).length ? 'move' : 'none';
}

function actorRoster(state: SiegeState, side: SiegeSide) {
  return [...state.units.filter((u) => u.side === side), ...(side === 'shu' ? state.engines : [])];
}

export function actorQueue(state: SiegeState, side: SiegeSide) {
  const actors = actorRoster(state, side);
  return (['act', 'move'] as const).flatMap((todo) =>
    actors.filter((actor) => actorTodo(state, actor.id, side) === todo),
  );
}

/** Stable roster order within action/move groups, cycling through both groups. */
export function nextActor(state: SiegeState, currentId: string | null, side: SiegeSide) {
  const roster = actorRoster(state, side);
  const current = roster.findIndex((actor) => actor.id === currentId);
  // Spent/dead actors retain a slot in the action group. This lets a completed
  // B continue to C after A was skipped, even though B is no longer queued.
  const group = current >= 0 && actorTodo(state, currentId!, side) === 'move' ? 'move' : 'act';
  const slots = (['act', 'move'] as const).flatMap((todo) =>
    roster.map((actor, index) => ({ actor, index, todo })),
  );
  const start = current < 0 ? -1 : current + (group === 'move' ? roster.length : 0);
  for (let offset = 1; offset <= slots.length; offset++) {
    const slot = slots[(start + offset) % slots.length]!;
    if (actorTodo(state, slot.actor.id, side) === slot.todo) return slot.actor;
  }
  return null;
}
