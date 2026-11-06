import { activeUnit, distance, unitBroke } from './combat';
import { logEvent } from './events';
import { SIEGE_TUNING as T } from './tuning';
import type { SiegeAction, SiegeState, SiegeUnit } from './types';

/** Apply once after the action, using the broken formation's original location.
 * Counter provenance excludes the later assaultCosts morale shock. */
export function awardRoutMorale(
  before: SiegeState,
  after: SiegeState,
  action: SiegeAction,
  counterBroke: boolean,
): void {
  const actorId =
    'unitId' in action ? action.unitId : 'engineId' in action ? action.engineId : null;
  const actor = before.units.find((u) => u.id === actorId);
  const side = actor?.side ?? (before.engines.some((e) => e.id === actorId) ? 'shu' : null);
  if (!side) return;
  const broken = before.units.filter((u) =>
    unitBroke(
      u,
      after.units.find((v) => v.id === u.id),
    ),
  );
  const award = (routed: SiegeUnit, sourceId: string | null, winningSide: 'shu' | 'wei') => {
    for (const unit of after.units) {
      if (unit.side !== winningSide || !activeUnit(unit)) continue;
      const role = unit.id === sourceId ? 'source' : 'nearby';
      if (role === 'nearby' && distance(unit, routed) > T.routMoraleRadius) continue;
      const moraleBefore = unit.morale;
      unit.morale = Math.min(
        T.moraleMax,
        unit.morale + (role === 'source' ? T.routMoraleSource : T.routMoraleNearby),
      );
      if (unit.morale > moraleBefore)
        logEvent(after, 'routMorale', {
          unitId: unit.id,
          routedId: routed.id,
          before: moraleBefore,
          after: unit.morale,
          role,
        });
    }
  };
  for (const routed of broken.filter((u) => u.side !== side))
    award(routed, actor?.id ?? null, side);
  if (
    counterBroke &&
    actor &&
    broken.some((u) => u.id === actor.id) &&
    action.type === 'attack' &&
    'targetId' in action
  ) {
    const target = after.units.find((u) => u.id === action.targetId);
    if (target && activeUnit(target)) award(actor, target.id, target.side);
  }
}
