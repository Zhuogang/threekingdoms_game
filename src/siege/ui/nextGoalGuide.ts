import { COURTYARD, GATES, sameCell } from '../content/chencang';
import { activeUnit, distance } from '../rules/combat';
import { validateSiegeAction } from '../rules/actions';
import { insideCity, walkingDistances } from '../rules/movement';
import type { SiegePosition, SiegeState } from '../rules/types';
import { siegeText, type SiegeLocale } from '../i18n';

export type NextGoalGuide =
  | { kind: 'gate' | 'courtyard'; target: SiegePosition; steps: number }
  | { kind: 'openNow' }
  | { kind: 'guarded'; defenderId: string };

/** Distances follow the movement graph through allies, and only free cells are targets. */
export function nextGoalGuide(state: SiegeState, unitId: string): NextGoalGuide | null {
  const unit = state.units.find((u) => u.id === unitId);
  if (
    !unit ||
    !activeUnit(unit) ||
    unit.side !== 'shu' ||
    unit.troopType !== 'infantry' ||
    (unit.level !== 'wall' && !insideCity(unit))
  )
    return null;
  const gates = Object.values(GATES);
  for (const gate of gates)
    if (!validateSiegeAction(state, { type: 'openGate', unitId, gateId: gate.id }))
      return { kind: 'openNow' };
  const cells = walkingDistances(state, unitId);
  if (gates.some((gate) => state.gates[gate.id].broken)) {
    const target = cells.find((p) => p.level === 'ground' && COURTYARD.some((c) => sameCell(c, p)));
    return target ? { kind: 'courtyard', target, steps: target.cost } : null;
  }
  const destinations = gates.flatMap((gate) =>
    cells
      .filter((p) =>
        p.level === 'wall'
          ? gate.cells.some((c) => sameCell(c, p))
          : insideCity(p) && gate.cells.some((c) => distance(c, p) === 1),
      )
      .map((target) => ({ gate, target })),
  );
  destinations.sort((a, b) => a.target.cost - b.target.cost);
  // Occupied towers are not destinations, but the free cell immediately inside is.
  const destination = destinations[0];
  if (!destination) return null;
  const defender = state.units.find(
    (u) =>
      u.side === 'wei' &&
      u.troops > 0 &&
      u.level === 'wall' &&
      destination.gate.cells.some((c) => sameCell(c, u)),
  );
  if (defender) return { kind: 'guarded', defenderId: defender.id };
  return { kind: 'gate', target: destination.target, steps: destination.target.cost };
}

export function nextGoalGuideText(
  guide: NextGoalGuide,
  locale: SiegeLocale,
  nameOf: (id: string) => string,
): string {
  if (guide.kind === 'openNow') return siegeText(locale, 'nextOpenNow');
  if (guide.kind === 'guarded')
    return siegeText(locale, 'nextGateGuarded', { name: nameOf(guide.defenderId) });
  return siegeText(locale, guide.kind === 'gate' ? 'nextGate' : 'nextCourtyard', {
    n: guide.steps,
  });
}
