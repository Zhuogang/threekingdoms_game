import { forecastCityEconomy } from '../campaign/economy';
import type { V03GameState } from '../types';

/** Accounting-only view of an immediate healthy departure. Wounded remain in
 * their city record here, equivalent to the real detached troop source, without
 * allocating temporary IDs, orders or reservations during a preview.
 */
export function campaignDepartureSnapshot(
  state: Readonly<V03GameState>,
  cityId: string,
  officerIds: readonly string[],
  food: number,
): V03GameState {
  const selected = new Set(officerIds);
  const troops = state.officers
    .filter((officer) => selected.has(officer.id))
    .reduce((sum, officer) => sum + officer.troops, 0);
  return {
    ...state,
    cities: state.cities.map((city) =>
      city.id === cityId
        ? { ...city, food: city.food - food, garrisonTroops: city.garrisonTroops - troops }
        : city,
    ),
    officers: state.officers.map((officer) =>
      selected.has(officer.id) ? { ...officer, troops: 0 } : officer,
    ),
  };
}

export function forecastCampaignHome(
  state: Readonly<V03GameState>,
  cityId: string,
  officerIds: readonly string[],
  food: number,
) {
  return forecastCityEconomy(campaignDepartureSnapshot(state, cityId, officerIds, food), cityId);
}
