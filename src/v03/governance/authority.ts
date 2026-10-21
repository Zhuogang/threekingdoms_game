import type { V03City, V03GameState, V03JourneyCargo, V03Officer } from '../types';

export interface V03Capabilities {
  view: boolean;
  administerDirectly: boolean;
  appointGovernor: boolean;
  requisitionResources: boolean;
  issueCampaignDirective: boolean;
  diplomacy: boolean;
  reason: string | null;
}

export interface RequisitionEstimate {
  requested: V03JourneyCargo;
  executable: V03JourneyCargo;
  deficit: V03JourneyCargo;
  earliestDepartureDay: number | null;
  earliestArrivalDay: number | null;
  ready: boolean;
  requiresPlayerChoice: boolean;
  reasons: string[];
}

const zeroCargo = (): V03JourneyCargo => ({ gold: 0, food: 0, troops: 0 });

export function getCityCapabilities(
  state: Pick<V03GameState, 'playerFactionId' | 'playerCapitalCityId' | 'cities'>,
  cityId: string,
): V03Capabilities {
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city || city.factionId !== state.playerFactionId) {
    return {
      view: Boolean(city),
      administerDirectly: false,
      appointGovernor: false,
      requisitionResources: false,
      issueCampaignDirective: false,
      diplomacy: false,
      reason: 'This city is not under your faction’s authority.',
    };
  }
  const direct = city.id === state.playerCapitalCityId && city.governanceMode === 'ruler';
  return {
    view: true,
    administerDirectly: direct,
    appointGovernor: true,
    requisitionResources: true,
    issueCampaignDirective: true,
    diplomacy: direct,
    reason: direct
      ? null
      : 'A governor or local steward handles this city’s internal administration.',
  };
}

export function canDirectlyAdminister(
  state: Pick<V03GameState, 'playerFactionId' | 'playerCapitalCityId' | 'cities'>,
  cityId: string,
): boolean {
  return getCityCapabilities(state, cityId).administerDirectly;
}

function outstandingAtSource(state: V03GameState, cityId: string) {
  const reserved = zeroCargo();
  // Dispatched cargo is already debited from its source. Only accepted orders without
  // a journey still reserve city stock here.
  for (const order of state.requisitions) {
    if (
      order.sourceCityId === cityId &&
      order.journeyId === null &&
      ['accepted', 'reserved', 'dispatched'].includes(order.status)
    ) {
      reserved.gold += order.proposed.gold;
      reserved.food += order.proposed.food;
      reserved.troops += order.proposed.troops;
    }
  }
  for (const order of state.directives) {
    if (
      order.sourceCityId === cityId &&
      order.journeyId === null &&
      ['accepted', 'reserved', 'dispatched'].includes(order.status)
    )
      reserved.troops += order.proposedTroops;
  }
  return reserved;
}

function productionPerDay(city: V03City, resource: 'gold' | 'food') {
  // Used only to give a planning date. Real monthly settlement remains the source of stock.
  const monthly =
    resource === 'food'
      ? Math.max(1, Math.floor(city.farming / 4))
      : Math.max(1, Math.floor(city.commerce / 5));
  return monthly / 30;
}

export function estimateRequisition(
  state: V03GameState,
  sourceCityId: string,
  targetCityId: string,
  requested: V03JourneyCargo,
  routeDays: number | null,
): RequisitionEstimate {
  const source = state.cities.find((city) => city.id === sourceCityId);
  const target = state.cities.find((city) => city.id === targetCityId);
  const invalidReasons: string[] = [];
  if (!source || !target) invalidReasons.push('A source or destination city no longer exists.');
  if (source?.factionId !== state.playerFactionId)
    invalidReasons.push('Only cities held by your faction can issue this order.');
  if (target?.factionId !== state.playerFactionId)
    invalidReasons.push('The destination must be held by your faction.');
  if (sourceCityId === targetCityId) invalidReasons.push('Choose a different destination city.');
  if (routeDays === null || !Number.isSafeInteger(routeDays) || routeDays < 1)
    invalidReasons.push('There is no currently usable route to the destination.');

  const safeRequested = {
    gold: Math.max(0, Math.floor(requested.gold)),
    food: Math.max(0, Math.floor(requested.food)),
    troops: Math.max(0, Math.floor(requested.troops)),
  };
  if (!source || invalidReasons.length > 0) {
    return {
      requested: safeRequested,
      executable: zeroCargo(),
      deficit: { ...safeRequested },
      earliestDepartureDay: null,
      earliestArrivalDay: null,
      ready: false,
      requiresPlayerChoice: true,
      reasons: invalidReasons,
    };
  }

  const reserved = outstandingAtSource(state, sourceCityId);
  const available = {
    gold: Math.max(0, source.gold - reserved.gold),
    food: Math.max(0, source.food - reserved.food),
    troops: Math.max(
      0,
      source.garrisonTroops -
        reserved.troops -
        Math.min(1000, Math.ceil(source.garrisonTroops * 0.35)),
    ),
  };
  const executable = {
    gold: Math.min(safeRequested.gold, available.gold),
    food: Math.min(safeRequested.food, available.food),
    troops: Math.min(safeRequested.troops, available.troops),
  };
  const deficit = {
    gold: safeRequested.gold - executable.gold,
    food: safeRequested.food - executable.food,
    troops: safeRequested.troops - executable.troops,
  };
  const reasons: string[] = [];
  if (deficit.gold > 0) reasons.push(`Gold shortfall: ${deficit.gold}.`);
  if (deficit.food > 0) reasons.push(`Food shortfall: ${deficit.food}.`);
  if (deficit.troops > 0)
    reasons.push(`Troop shortfall: ${deficit.troops}; the city retains its minimum garrison.`);

  const cityReadyDay =
    state.absoluteDay +
    Math.max(
      deficit.gold === 0 ? 0 : Math.ceil(deficit.gold / productionPerDay(source, 'gold')),
      deficit.food === 0 ? 0 : Math.ceil(deficit.food / productionPerDay(source, 'food')),
      deficit.troops === 0 ? 0 : 30,
    );
  const earliestDepartureDay =
    deficit.gold + deficit.food + deficit.troops === 0 ? state.absoluteDay : cityReadyDay;
  const full = deficit.gold + deficit.food + deficit.troops === 0;
  return {
    requested: safeRequested,
    executable,
    deficit,
    earliestDepartureDay,
    earliestArrivalDay: earliestDepartureDay + (routeDays ?? 0),
    ready: full,
    requiresPlayerChoice: !full,
    reasons,
  };
}

export function canAppointGovernor(
  state: Pick<V03GameState, 'playerFactionId' | 'playerCapitalCityId' | 'cities' | 'officers'>,
  cityId: string,
  officerId: string | null,
): { ok: boolean; reason: string | null; city?: V03City; officer?: V03Officer } {
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city || city.factionId !== state.playerFactionId)
    return { ok: false, reason: 'You can appoint a governor only to one of your own cities.' };
  if (city.id === state.playerCapitalCityId)
    return { ok: false, reason: 'The ruler’s capital remains directly governed.' };
  if (officerId === null) return { ok: true, reason: null, city };
  const officer = state.officers.find((entry) => entry.id === officerId);
  if (!officer || !officer.alive || officer.factionId !== state.playerFactionId)
    return { ok: false, reason: 'Choose a living officer who serves your faction.' };
  const location = officer.location;
  if (location.kind !== 'city')
    return {
      ok: false,
      reason: 'The officer must be available in a friendly city before taking office.',
    };
  const currentCity = state.cities.find((entry) => entry.id === location.cityId);
  if (!currentCity || currentCity.factionId !== state.playerFactionId)
    return {
      ok: false,
      reason: 'The officer must be available in a friendly city before taking office.',
    };
  if (officer.troops > 0)
    return { ok: false, reason: 'An officer commanding troops cannot take office until relieved.' };
  return { ok: true, reason: null, city, officer };
}
