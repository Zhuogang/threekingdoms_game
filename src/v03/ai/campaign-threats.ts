import { advanceJourneyOneDay, type Journey } from '../calendar';
import { getV03AttackAllianceBlock } from '../campaign/monthly-systems';
import type { V03GameState } from '../types';

/** Existing hostile armies only. Current healthy strength is a conservative
 * arrival bound: future fighting, desertion and recruitment are not assumed.
 */
export function incomingCampaignThreats(
  state: Readonly<V03GameState>,
  cityId: string,
  horizonDays = 90,
) {
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city?.factionId) return [];
  const horizon = Math.max(0, Math.min(90, Math.floor(horizonDays)));
  const threats: Array<{
    journeyId: string;
    factionId: string;
    arrivalDay: number;
    daysUntilArrival: number;
    troops: number;
    officerIds: string[];
  }> = [];
  for (const initial of state.journeys) {
    if (
      initial.kind !== 'campaign' ||
      initial.returnRequested ||
      !['outbound', 'waiting'].includes(initial.status) ||
      initial.destinationCityId !== cityId ||
      initial.ownerFactionId === city.factionId ||
      getV03AttackAllianceBlock(
        state.alliances,
        initial.ownerFactionId,
        city.factionId,
        state.monthIndex,
      )
    )
      continue;
    const officers = state.officers.filter(
      (officer) =>
        officer.alive &&
        officer.factionId === initial.ownerFactionId &&
        initial.manifest.officerIds.includes(officer.id) &&
        officer.location.kind === 'journey' &&
        officer.location.journeyId === initial.id &&
        officer.troops > 0,
    );
    const troops = officers.reduce((sum, officer) => sum + officer.troops, 0);
    if (troops <= 0) continue;
    let journey: Journey = initial;
    let arrivalDay = state.absoluteDay;
    if (initial.status !== 'waiting') {
      while (journey.status !== 'delivered' && arrivalDay < state.absoluteDay + horizon) {
        if (arrivalDay >= journey.departedAbsoluteDay)
          journey = advanceJourneyOneDay(journey).journey;
        arrivalDay++;
      }
      if (journey.status !== 'delivered') continue;
    }
    threats.push({
      journeyId: initial.id,
      factionId: initial.ownerFactionId,
      arrivalDay,
      daysUntilArrival: arrivalDay - state.absoluteDay,
      troops,
      officerIds: officers.map((officer) => officer.id),
    });
  }
  return threats.sort(
    (a, b) => a.arrivalDay - b.arrivalDay || a.journeyId.localeCompare(b.journeyId),
  );
}
