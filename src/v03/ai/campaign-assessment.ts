import { cityBattleRoster, groupOfficers, rosterFromGroups } from '../campaign/roster';
import type { OrderPartyPlan } from '../governance/orders';
import type { V03GameState } from '../types';
import { campaignDepartureSnapshot } from './campaign-home';
import { forecastCityEconomy } from '../campaign/economy';
import { incomingCampaignThreats } from './campaign-threats';
import { estimateCampaignMatchup } from './campaign-strength';
import type { CampaignDecisionReason } from './decision-trace';

/** AI prudence, deliberately separate from the human command's legal minimum. */
export function assessCampaignDeparture(
  state: Readonly<V03GameState>,
  sourceCityId: string,
  targetCityId: string,
  party: OrderPartyPlan,
  food: number,
  travelDays: number,
) {
  const officers = state.officers.filter((officer) => party.officerIds.includes(officer.id));
  const attackers = rosterFromGroups(
    groupOfficers(officers.map((officer) => ({ ...officer, wounded: 0 }))),
    'forecast-attack',
  ).roster;
  const defenders = cityBattleRoster(state, targetCityId, 'forecast-defend').roster;
  const matchup = estimateCampaignMatchup(attackers, defenders, [sourceCityId, targetCityId]);
  const home = campaignDepartureSnapshot(state, sourceCityId, party.officerIds, food);
  const economy = forecastCityEconomy(home, sourceCityId);
  const threats = incomingCampaignThreats(state, sourceCityId, Math.min(90, travelDays * 2 + 30));
  let homeRisk = 0;
  if (threats.length) {
    const ids = new Set(threats.flatMap((threat) => threat.officerIds));
    const hostile = rosterFromGroups(
      groupOfficers(
        state.officers
          .filter((officer) => ids.has(officer.id))
          .map((officer) => ({ ...officer, wounded: 0 })),
      ),
      'forecast-invasion',
    ).roster;
    const remaining = cityBattleRoster(home, sourceCityId, 'forecast-home').roster;
    const incoming = state.journeys.find((journey) => journey.id === threats[0]!.journeyId)!;
    homeRisk = estimateCampaignMatchup(
      hostile,
      remaining,
      incoming.routeCityIds ?? [incoming.sourceCityId, sourceCityId],
    ).ratio;
  }
  const reason: CampaignDecisionReason | null =
    matchup.ratio < 0.8
      ? 'insufficient-force'
      : economy.projectedAvailable.food < 0
        ? 'home-food-shortage'
        : homeRisk > 0.9
          ? 'home-defense-exposed'
          : null;
  return {
    reason,
    matchup,
    economy,
    homeRisk,
    threats,
    forceDeficit:
      matchup.ratio < 0.8
        ? Math.ceil((party.troopCount * 0.8) / Math.max(0.01, matchup.ratio)) - party.troopCount
        : 0,
    foodDeficit: Math.max(0, -economy.projectedAvailable.food),
  };
}
