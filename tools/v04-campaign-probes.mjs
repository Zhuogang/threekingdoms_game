import {
  executeNextAdjacentCampaignOrder,
  listAdjacentCampaignCandidates,
} from './v03-campaign-bot.mjs';

export const CAMPAIGN_PROBE_POLICIES = [
  'adjacent-legacy',
  'passive-defense',
  'economy-first',
  'border-attack',
];

/** Evaluation drivers only. Every effect goes through an ordinary player command.
 * Fixed thresholds describe small reproducible scripts, not human-quality play.
 */
export function prepareProbeCapital(initial, api) {
  let state = initial;
  const actions = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const city = state.cities.find((city) => city.id === state.playerCapitalCityId);
    if (!city || city.factionId !== state.playerFactionId) break;
    const locals = state.officers
      .filter(
        (officer) =>
          officer.alive &&
          officer.factionId === state.playerFactionId &&
          officer.location.kind === 'city' &&
          officer.location.cityId === city.id,
      )
      .sort((a, b) => b.intellect - a.intellect || a.id.localeCompare(b.id));
    // A capital task occupies its executor for some days; like a player, use whoever is free.
    const free = locals.filter(
      (officer) => !officer.cityWork || officer.cityWork.untilDay <= state.absoluteDay,
    );
    const manager = free[0] ?? locals[0];
    if (!manager) break;
    const choices = [];
    if (city.food < 3000) choices.push({ action: 'buy-food' });
    if (city.loyalty < 70) choices.push({ action: 'security' });
    for (const officer of locals) {
      const spare = api.availableReserveTroops(state, city.id, officer.troopType);
      const amount = Math.min(2500 - officer.wounded, officer.troops + spare);
      if (amount > officer.troops)
        choices.push({ action: 'assign-troops', officerId: officer.id, amount });
    }
    if (city.food >= 5000 && city.garrisonTroops < 5000 && city.reserve < 1500) {
      const recruiter = (free.length ? free : locals)
        .slice()
        .sort((a, b) => b.force - a.force || a.id.localeCompare(b.id))[0];
      choices.push({ action: 'recruit', officerId: recruiter.id, troopType: recruiter.troopType });
    }
    if (city.farming < 200) choices.push({ action: 'develop-farming' });
    if (city.commerce < 200) choices.push({ action: 'develop-commerce' });
    const choice = choices
      .map((choice) => ({ type: 'cityAction', cityId: city.id, officerId: manager.id, ...choice }))
      .find((command) => api.getV03CityActionAvailability(state, command).ok);
    if (!choice) break;
    const result = api.executeV03Command(state, choice);
    if (!result.ok) throw new Error(`Validated probe work failed: ${result.error}`);
    state = result.state;
    actions.push(choice);
  }
  return { state, actions };
}

export function executeCampaignProbe(initial, policy, api) {
  if (!CAMPAIGN_PROBE_POLICIES.includes(policy)) throw new Error(`Unknown probe policy ${policy}`);
  if (policy === 'adjacent-legacy')
    return {
      ...executeNextAdjacentCampaignOrder(initial, api.ROUTE_DEFINITIONS, api.executeV03Command),
      actions: [],
    };
  const prepared = prepareProbeCapital(initial, api);
  const state = prepared.state;
  const own = state.directives.filter((order) => order.factionId === state.playerFactionId);
  if (
    policy === 'passive-defense' ||
    (policy === 'border-attack' && (state.absoluteDay < 30 || own.length > 0)) ||
    (policy === 'economy-first' &&
      (state.absoluteDay < 90 ||
        own.some((order) => order.createdDay >= Math.floor(state.absoluteDay / 30) * 30)))
  )
    return { ...prepared, dispatched: false };
  const routes = new Set(
    listAdjacentCampaignCandidates(state, api.ROUTE_DEFINITIONS)
      .filter((candidate) => {
        const preview = api.previewCampaignDirective(
          state,
          { ...candidate, intent: 'conquer', requestedByDay: null },
          api.services,
        );
        if (!preview.ready) return false;
        if (policy === 'border-attack') return true;
        const city = state.cities.find((city) => city.id === candidate.sourceCityId);
        return (
          preview.executableTroops >= candidate.defenderTroops * 1.25 &&
          city.food - preview.executableFood >= 3000 &&
          !state.journeys.some(
            (journey) =>
              journey.kind === 'campaign' &&
              journey.ownerFactionId !== state.playerFactionId &&
              journey.destinationCityId === city.id &&
              ['outbound', 'waiting'].includes(journey.status),
          )
        );
      })
      .map((candidate) => candidate.routeId),
  );
  return {
    ...executeNextAdjacentCampaignOrder(
      state,
      api.ROUTE_DEFINITIONS.filter((route) => routes.has(route.id)),
      api.executeV03Command,
    ),
    actions: prepared.actions,
  };
}
