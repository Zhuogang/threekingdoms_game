import { ECONOMY as ECONOMY_TABLE, LEADERSHIP as LEADERSHIP_TABLE } from '../balance';
import type { V03GameState, V03Officer } from '../types';
import { retainPersonnel } from './personnel';

// Module-local bindings: reading an imported table through the module namespace costs a getter call per access in hot loops.
const ECONOMY = ECONOMY_TABLE;
const LEADERSHIP = LEADERSHIP_TABLE;

/** Troops an officer really controls: leadership × 100. */
export function managedCapacity(officer: Pick<V03Officer, 'leadership'>): number {
  return officer.leadership * LEADERSHIP.capacityPerPoint;
}

/** Men above the officer's managed capacity. */
export function excessTroops(officer: Pick<V03Officer, 'leadership' | 'troops'>): number {
  return Math.max(0, officer.troops - managedCapacity(officer));
}

/** Unmanaged share (0 to 1) of an officer's troops. */
export function excessShare(officer: Pick<V03Officer, 'leadership' | 'troops'>): number {
  return excessTroops(officer) / Math.max(1, officer.troops);
}

/**
 * Month-boundary desertion of unmanaged men. In a city the deserters rejoin the population
 * (up to the resource cap); on a journey they are lost. Returns one record per affected officer.
 */
export function settleDesertion(
  state: V03GameState,
): { officerId: string; factionId: string | null; count: number }[] {
  const results: { officerId: string; factionId: string | null; count: number }[] = [];
  for (const officer of state.officers) {
    if (!officer.alive) continue;
    const excess = excessTroops(officer);
    if (excess <= 0) continue;
    if (officer.location.kind === 'city') {
      const cityId = officer.location.cityId;
      const city = state.cities.find((entry) => entry.id === cityId);
      const count = Math.floor(excess * LEADERSHIP.desertCity);
      if (!city || count <= 0) continue;
      retainPersonnel(officer, officer.troops - count, officer.wounded);
      if (officer.reorganizationDays === 0)
        city.garrisonTroops = Math.max(0, city.garrisonTroops - count);
      city.population = Math.min(ECONOMY.resourceCap, city.population + count);
      results.push({ officerId: officer.id, factionId: officer.factionId, count });
    } else if (officer.location.kind === 'journey') {
      const journeyId = officer.location.journeyId;
      const journey = state.journeys.find((entry) => entry.id === journeyId);
      const count = Math.floor(excess * LEADERSHIP.desertMarch);
      if (count <= 0) continue;
      retainPersonnel(officer, officer.troops - count, officer.wounded);
      if (journey) {
        const troopCount = Math.max(0, journey.manifest.troopCount - count);
        const composition = { ...journey.manifest.composition };
        if (composition.cavalryTroops !== undefined)
          composition.cavalryTroops = Math.min(composition.cavalryTroops, troopCount);
        if (composition.woundedTroops !== undefined)
          composition.woundedTroops = Math.min(composition.woundedTroops, troopCount);
        journey.manifest = { ...journey.manifest, troopCount, composition };
      }
      results.push({ officerId: officer.id, factionId: officer.factionId, count });
    }
  }
  return results;
}
