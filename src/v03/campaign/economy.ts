import {
  advanceJourneyOneDay,
  calendarDateAt,
  DAYS_PER_MONTH,
  PILOT_LOGISTICS_RATES,
  type Journey,
} from '../calendar';
import { committedCityStock } from '../governance/city-actions';
import { isCityCommitted } from '../governance/commitments';
import { availableTroops, cityPersonnelSummary, cityRationCredits } from './personnel';
import type { V03City, V03GameState } from '../types';

const RESOURCE_CAP = 9_999_999;

/** The pending cursor identifies an unpaid boundary even after the date increments. */
export function nextEconomicBoundary(state: Readonly<V03GameState>) {
  const pending = state.dayResolution?.phase === 'month-settlement';
  const absoluteDay = pending
    ? state.absoluteDay
    : (Math.floor(state.absoluteDay / DAYS_PER_MONTH) + 1) * DAYS_PER_MONTH;
  const closing = calendarDateAt(state.startYear, absoluteDay - 1);
  return {
    absoluteDay,
    year: closing.year,
    harvestMonth: closing.month,
    remainingServiceDays:
      absoluteDay -
      state.absoluteDay -
      (state.dayResolution?.phase === 'date' && state.dayResolution.cityServiceAccounted ? 1 : 0),
  };
}

export function cityProduction(city: V03City, month: number) {
  return {
    food: city.factionId
      ? Math.floor(city.farming * (month === 9 ? 4 : 2.2) + city.population / 80)
      : 0,
    gold: city.factionId
      ? Math.floor(
          Math.floor(city.population / 150 + city.commerce * 0.55) * (0.8 + city.loyalty / 500),
        )
      : 0,
  };
}

/** The same credits and cohorts used by the actual daily service ledger. */
export function cityServiceHeadcounts(
  state: Readonly<V03GameState>,
  cityId: string,
  paidToday = true,
) {
  const summary = cityPersonnelSummary(state, cityId);
  const credits = paidToday
    ? cityRationCredits(state, cityId)
    : { ownPeople: 0, ownCavalry: 0, captivePeople: 0, captiveCavalry: 0 };
  const captiveCavalry = state.officers
    .filter(
      (o) =>
        o.alive &&
        o.location.kind === 'captured' &&
        o.location.cityId === cityId &&
        o.troopType === 'cavalry',
    )
    .reduce((sum, o) => sum + o.troops + o.wounded, 0);
  return {
    own: Math.max(0, summary.troops + summary.wounded - credits.ownPeople),
    cavalry: Math.max(
      0,
      summary.foodHeadcount -
        summary.troops -
        summary.wounded -
        summary.prisoners -
        credits.ownCavalry -
        captiveCavalry,
    ),
    prisoners: Math.max(0, summary.prisoners - credits.captivePeople),
    prisonerCavalry: Math.max(0, captiveCavalry - credits.captiveCavalry),
  };
}

type Service = ReturnType<typeof cityServiceHeadcounts>;
function serviceCost(service: Service, owned: boolean) {
  return {
    food: Math.ceil(
      (service.own + service.cavalry + service.prisoners + service.prisonerCavalry) *
        PILOT_LOGISTICS_RATES.cityFoodPerTroopDay,
    ),
    gold: owned ? Math.ceil((service.own * 0.025) / DAYS_PER_MONTH) : 0,
  };
}

/** Preserve legacy absent-ledger settlement semantics as well as recorded service. */
export function cityAccruedUpkeep(state: Readonly<V03GameState>, city: V03City) {
  const serving = state.officers.filter(
    (o) =>
      o.alive &&
      o.factionId === city.factionId &&
      o.location.kind === 'city' &&
      o.location.cityId === city.id,
  );
  return serviceCost(
    {
      own:
        city.troopServiceDaysThisMonth ??
        Math.max(
          city.garrisonTroops,
          serving.reduce((sum, o) => sum + availableTroops(o), 0),
        ) * DAYS_PER_MONTH,
      cavalry:
        city.cavalryServiceDaysThisMonth ??
        serving.filter((o) => o.troopType === 'cavalry').reduce((sum, o) => sum + o.troops, 0) *
          DAYS_PER_MONTH,
      prisoners: city.prisonerServiceDaysThisMonth ?? 0,
      prisonerCavalry: city.prisonerCavalryDaysThisMonth ?? 0,
    },
    city.factionId !== null,
  );
}

/** Pure next-bill projection of this state (including an already-applied hypothetical action).
 * Existing journeys use actual route ticks, rations and delivery constraints. Future combat,
 * purchases and departures are not assumed. Stock remains unavailable until delivery.
 */
export function forecastCityEconomy(state: Readonly<V03GameState>, cityId: string) {
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city) throw new Error('Unknown city ' + cityId + '.');
  const boundary = nextEconomicBoundary(state);
  const days = boundary.remainingServiceDays;
  const normal = cityServiceHeadcounts(state, cityId, false);
  const today = cityServiceHeadcounts(
    state,
    cityId,
    state.personnelDay.absoluteDay === state.absoluteDay &&
      !state.dayResolution?.cityServiceAccounted,
  );
  const elapsed = state.absoluteDay % DAYS_PER_MONTH;
  const accrued: Service = {
    own: city.troopServiceDaysThisMonth ?? today.own * elapsed,
    cavalry: city.cavalryServiceDaysThisMonth ?? today.cavalry * elapsed,
    prisoners: city.prisonerServiceDaysThisMonth ?? 0,
    prisonerCavalry: city.prisonerCavalryDaysThisMonth ?? 0,
  };
  const service = { ...accrued };
  for (const key of Object.keys(service) as Array<keyof Service>)
    service[key] += days > 0 ? today[key] + normal[key] * (days - 1) : 0;
  const arrivals: Array<{
    journeyId: string;
    day: number;
    expectedArrivalDay: number;
    food: number;
    gold: number;
    own: number;
    cavalry: number;
    prisoners: number;
    prisonerCavalry: number;
  }> = [];
  if (!isCityCommitted(state, cityId))
    for (const initial of state.journeys) {
      if (
        initial.destinationCityId !== cityId ||
        initial.ownerFactionId !== city.factionId ||
        initial.returnRequested ||
        initial.deliveredCargo.personnel === 1 ||
        !['outbound', 'returning', 'waiting', 'delivered'].includes(initial.status)
      )
        continue;
      let journey: Journey = initial;
      const progressed =
        state.dayResolution?.phase === 'date' || state.dayResolution?.phase === 'month-settlement';
      let arrivalDay = state.absoluteDay + (state.dayResolution?.phase === 'date' ? 1 : 0);
      // A friendly waiting party is unloaded at the next arrival pass. Moving parties
      // are forecast with the real route, including fractional march rations (at most 30 ticks).
      if (journey.status === 'waiting') {
        if (!progressed) {
          journey = advanceJourneyOneDay(journey).journey;
          arrivalDay++;
        }
      } else
        while (journey.status !== 'delivered' && arrivalDay < boundary.absoluteDay) {
          if (arrivalDay >= journey.departedAbsoluteDay)
            journey = advanceJourneyOneDay(journey).journey;
          arrivalDay++;
        }
      if (!['waiting', 'delivered'].includes(journey.status) || arrivalDay > boundary.absoluteDay)
        continue;
      const captives = state.officers.filter(
        (o) => o.alive && o.location.kind === 'captured' && o.location.journeyId === initial.id,
      );
      const prisoners = captives.reduce((sum, o) => sum + o.troops + o.wounded, 0);
      const prisonerCavalry = captives
        .filter((o) => o.troopType === 'cavalry')
        .reduce((sum, o) => sum + o.troops + o.wounded, 0);
      arrivals.push({
        journeyId: journey.id,
        day: arrivalDay,
        expectedArrivalDay: journey.expectedArrivalDay,
        food: Math.max(
          0,
          (journey.manifest.cargo.food ?? 0) +
            journey.manifest.carriedFood -
            (journey.deliveredCargo.food ?? 0),
        ),
        gold: Math.max(0, (journey.manifest.cargo.gold ?? 0) - (journey.deliveredCargo.gold ?? 0)),
        own: Math.max(0, journey.manifest.troopCount - prisoners),
        cavalry: Math.max(0, (journey.manifest.composition.cavalryTroops ?? 0) - prisonerCavalry),
        prisoners,
        prisonerCavalry,
      });
    }
  let food = city.food,
    gold = city.gold;
  const delivered = [] as typeof arrivals;
  for (const arrival of arrivals.sort(
    (a, b) =>
      a.day - b.day ||
      a.expectedArrivalDay - b.expectedArrivalDay ||
      a.journeyId.localeCompare(b.journeyId),
  )) {
    if (food + arrival.food > RESOURCE_CAP || gold + arrival.gold > RESOURCE_CAP) continue;
    food += arrival.food;
    gold += arrival.gold;
    delivered.push(arrival);
    const serviceDays = boundary.absoluteDay - arrival.day;
    for (const key of Object.keys(service) as Array<keyof Service>)
      service[key] += arrival[key] * serviceDays;
  }
  const production = cityProduction(city, boundary.harvestMonth);
  const upkeep =
    state.dayResolution?.phase === 'month-settlement'
      ? cityAccruedUpkeep(state, city)
      : serviceCost(service, city.factionId !== null);
  const reserved = committedCityStock(state, cityId);
  const projectedFood = Math.min(RESOURCE_CAP, food + production.food) - upkeep.food;
  const projectedGold = Math.min(RESOURCE_CAP, gold + production.gold) - upkeep.gold;
  return {
    boundary,
    stock: { food: city.food, gold: city.gold },
    reserved,
    available: {
      food: Math.max(0, city.food - reserved.food),
      gold: Math.max(0, city.gold - reserved.gold),
    },
    accruedUpkeep:
      state.dayResolution?.phase === 'month-settlement'
        ? upkeep
        : serviceCost(accrued, city.factionId !== null),
    upkeep,
    production,
    arrivals: delivered,
    projectedFood,
    projectedGold,
    projectedAvailable: {
      food: projectedFood - reserved.food,
      gold: projectedGold - reserved.gold,
    },
  };
}
