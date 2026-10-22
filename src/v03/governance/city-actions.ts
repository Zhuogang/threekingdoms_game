import type { V03City, V03CityAction, V03GameState, V03Officer } from '../types';

export interface V03CityActionInput {
  cityId: string;
  action: V03CityAction;
  officerId?: string;
  amount?: number;
}

export interface V03CityActionResult {
  ok: boolean;
  state: V03GameState;
  message?: string;
  error?: string;
}

export const CITY_MONTHLY_WORK_GOLD_COST = 80;
export const CITY_MANUAL_WORK_MAX_POINTS = 3;
export const GOVERNOR_REWARD_GOLD_COST = 100;
export const GOVERNOR_EQUIPMENT_GOLD_COST = 180;
export const GOVERNOR_RELIEF_GOLD_COST = 80;
export const GOVERNOR_RELIEF_FOOD_COST = 600;
const RESOURCE_CAP = 9_999_999;

function localOfficers(state: V03GameState, city: V03City): V03Officer[] {
  return state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    )
    .sort((a, b) => b.intellect - a.intellect || a.id.localeCompare(b.id));
}

export function cityWorkQuota(state: Readonly<V03GameState>, city: V03City): number {
  const staffed = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.factionId === city.factionId &&
      officer.location.kind === 'city' &&
      officer.location.cityId === city.id,
  ).length;
  return Math.min(CITY_MANUAL_WORK_MAX_POINTS, staffed);
}

export function cityWorkUsedThisMonth(state: Readonly<V03GameState>, city: V03City): number {
  return city.workMonthIndex === state.monthIndex ? (city.workPointsUsed ?? 0) : 0;
}

export function applySharedCityWorkEffect(
  source: Readonly<V03City>,
  action:
    | 'restore-loyalty'
    | 'develop-farming'
    | 'develop-commerce'
    | 'security'
    | 'recruit'
    | 'buy-food'
    | 'sell-food',
  manager: Pick<V03Officer, 'force' | 'intellect'> = { force: 0, intellect: 0 },
): V03City | null {
  const city: V03City = { ...source };
  if (
    ['restore-loyalty', 'develop-farming', 'develop-commerce', 'buy-food'].includes(action) &&
    city.gold < CITY_MONTHLY_WORK_GOLD_COST
  )
    return null;
  if (action === 'develop-farming' && city.farming >= 100) return null;
  if (action === 'develop-commerce' && city.commerce >= 100) return null;
  if (action === 'restore-loyalty' && city.loyalty >= 100) return null;
  if (action === 'buy-food' && city.food + 800 > RESOURCE_CAP) return null;
  if (action === 'sell-food' && (city.food < 800 || city.gold + 80 > RESOURCE_CAP)) return null;
  if (action === 'recruit') {
    const gain = Math.max(0, Math.min(city.population - 1000, 300 + manager.force * 5));
    if (gain <= 0 || city.reserve + gain > RESOURCE_CAP) return null;
    city.population -= gain;
    city.reserve += gain;
    city.loyalty = Math.max(0, city.loyalty - 2);
  } else if (action === 'security')
    city.loyalty = Math.min(100, city.loyalty + 8 + Math.floor(manager.intellect / 20));
  else if (action === 'buy-food') {
    city.gold -= CITY_MONTHLY_WORK_GOLD_COST;
    city.food += 800;
  } else if (action === 'sell-food') {
    city.food -= 800;
    city.gold += 80;
  } else {
    city.gold -= CITY_MONTHLY_WORK_GOLD_COST;
    if (action === 'develop-farming') city.farming++;
    else if (action === 'develop-commerce') city.commerce++;
    else city.loyalty = Math.min(100, city.loyalty + 2);
  }
  return city;
}

function officerForAction(
  state: V03GameState,
  city: V03City,
  officerId?: string,
): V03Officer | undefined {
  const officers = localOfficers(state, city);
  return officerId ? officers.find((officer) => officer.id === officerId) : officers[0];
}

function nextRandom(state: V03GameState, max: number): number {
  let value = state.rng || 190;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng % max;
}

function levelForExperience(experience: number): number {
  return Math.min(5, Math.floor(Math.max(0, experience) / 100));
}

function useWorkPoint(state: V03GameState, city: V03City): void {
  const previous = cityWorkUsedThisMonth(state, city);
  if (city.workMonthIndex !== state.monthIndex) {
    city.workMonthIndex = state.monthIndex;
    city.workPointsUsed = 0;
  }
  city.workPointsUsed = previous + 1;
}

/** Execute one direct ruler-city action through a shared monthly staffing budget. */
export function applyV03CityAction(
  state: V03GameState,
  input: V03CityActionInput,
): V03CityActionResult {
  return applyCityAction(state, input, false);
}

/** Trusted monthly-autonomy entry point; it shares the same action effects and quota checks. */
export function applyGovernorCityAction(
  state: V03GameState,
  input: V03CityActionInput,
): V03CityActionResult {
  return applyCityAction(state, input, true);
}

function applyCityAction(
  state: V03GameState,
  input: V03CityActionInput,
  governorExecution: boolean,
): V03CityActionResult {
  const sourceCity = state.cities.find((city) => city.id === input.cityId);
  const authorized = governorExecution
    ? Boolean(
        sourceCity &&
        sourceCity.id !== state.playerCapitalCityId &&
        sourceCity.factionId !== null &&
        sourceCity.governanceMode !== 'ruler',
      )
    : Boolean(
        sourceCity &&
        sourceCity.id === state.playerCapitalCityId &&
        sourceCity.factionId === state.playerFactionId &&
        sourceCity.governanceMode === 'ruler',
      );
  if (!sourceCity || !authorized)
    return {
      ok: false,
      state,
      error: governorExecution
        ? 'Monthly governor work requires an owned city under autonomous governance.'
        : 'Only your directly governed capital accepts city work orders.',
    };
  const governorMonthSettlement =
    governorExecution && state.dayResolution?.phase === 'month-settlement';
  if (state.phase !== 'planning' && !governorMonthSettlement)
    return { ok: false, state, error: 'City work is available during campaign planning.' };
  const manager = officerForAction(state, sourceCity, input.officerId);
  if (!manager)
    return {
      ok: false,
      state,
      error: 'A living officer must be stationed in the capital to organize this work.',
    };
  const used = cityWorkUsedThisMonth(state, sourceCity);
  const quota = cityWorkQuota(state, sourceCity);
  if (used >= quota)
    return {
      ok: false,
      state,
      error: `The capital has used its ${quota} monthly work point${quota === 1 ? '' : 's'}.`,
    };

  const next = structuredClone(state);
  const city = next.cities.find((entry) => entry.id === input.cityId)!;
  const actor = next.officers.find((entry) => entry.id === manager.id)!;
  const fail = (error: string): V03CityActionResult => ({ ok: false, state, error });
  let message: string;

  switch (input.action) {
    case 'restore-loyalty': {
      const updated = applySharedCityWorkEffect(city, input.action);
      if (!updated) return fail('The city cannot afford or benefit from loyalty recovery.');
      Object.assign(city, updated);
      message = `${actor.name} improved city loyalty by 2 for 80 gold.`;
      break;
    }
    case 'develop-farming':
    case 'develop-commerce': {
      const field = input.action === 'develop-farming' ? 'farming' : 'commerce';
      if (city[field] >= 100) return fail('This improvement is already at its current limit.');
      const updated = applySharedCityWorkEffect(city, input.action);
      if (!updated) return fail('The capital needs 80 unreserved gold for this work.');
      Object.assign(city, updated);
      message = `${field === 'farming' ? 'Farming' : 'Commerce'} improved by 1 for 80 gold.`;
      break;
    }
    case 'search': {
      const candidate = next.officers
        .filter(
          (officer) =>
            officer.alive &&
            officer.factionId === null &&
            officer.location.kind === 'city' &&
            officer.location.cityId === city.id,
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      const foundOfficer = candidate.length
        ? candidate[nextRandom(next, candidate.length)]
        : undefined;
      if (foundOfficer && nextRandom(next, 100) < 40 + Math.floor(actor.intellect / 2)) {
        const officer = foundOfficer;
        officer.factionId = city.factionId;
        officer.loyalty = 65 + nextRandom(next, 16);
        message = `${actor.name} found ${officer.name}, who joined your faction.`;
      } else message = `${actor.name} searched the countryside, but no officer joined this month.`;
      break;
    }
    case 'recruit': {
      const gain = Math.max(0, Math.min(city.population - 1000, 300 + actor.force * 5));
      if (gain <= 0)
        return fail('The city has no recruitable population beyond its protected 1,000 residents.');
      if (city.reserve + gain > RESOURCE_CAP) return fail('The city reserve is at capacity.');
      const updated = applySharedCityWorkEffect(city, input.action, actor);
      if (!updated)
        return fail('The capital cannot complete recruitment with its current reserves.');
      Object.assign(city, updated);
      message = `${actor.name} recruited ${gain} soldiers into the reserve.`;
      break;
    }
    case 'assign-troops': {
      const officer = input.officerId
        ? next.officers.find((entry) => entry.id === input.officerId)
        : undefined;
      if (
        !officer ||
        !officer.alive ||
        officer.factionId !== city.factionId ||
        officer.location.kind !== 'city' ||
        officer.location.cityId !== city.id
      )
        return fail('Choose a living officer stationed in the capital.');
      const amount = input.amount;
      if (!Number.isSafeInteger(amount) || amount! < 0 || amount! > 10_000)
        return fail('An officer can command 0–10,000 soldiers.');
      const change = amount! - officer.troops;
      if (change > city.reserve) return fail('There are not enough soldiers in the city reserve.');
      if (city.garrisonTroops + change < 0)
        return fail('The city garrison does not contain those soldiers.');
      city.reserve -= change;
      city.garrisonTroops += change;
      officer.troops = amount!;
      message = `${officer.name} now commands ${amount!.toLocaleString()} soldiers.`;
      break;
    }
    case 'train': {
      const officer = input.officerId
        ? next.officers.find((entry) => entry.id === input.officerId)
        : undefined;
      if (
        !officer ||
        !officer.alive ||
        officer.factionId !== city.factionId ||
        officer.location.kind !== 'city' ||
        officer.location.cityId !== city.id ||
        officer.troops <= 0
      )
        return fail('Choose a living officer with troops stationed in the capital to train.');
      const forceLimit = officer.equipment === 'Fine arms' ? 105 : 100;
      if (officer.experience >= 10_000 || officer.force >= forceLimit)
        return fail('This officer has reached the current training limit.');
      officer.experience = Math.min(10_000, officer.experience + 25);
      officer.force = Math.min(forceLimit, officer.force + 1);
      const targetLevel = levelForExperience(officer.experience);
      while (officer.level < targetLevel) {
        officer.level++;
        if (officer.troopType === 'archer')
          officer.intellect = Math.min(100, officer.intellect + 2);
        else officer.force = Math.min(forceLimit, officer.force + 2);
      }
      message = `${officer.name} completed training: +25 experience and +1 force.`;
      break;
    }
    case 'security': {
      const updated = applySharedCityWorkEffect(city, input.action, actor);
      if (!updated) return fail('The capital cannot complete this security action.');
      Object.assign(city, updated);
      message = `${actor.name} restored public order; city loyalty is now ${city.loyalty}%.`;
      break;
    }
    case 'feast': {
      const officers = localOfficers(next, city);
      for (const officer of officers) officer.loyalty = Math.min(100, officer.loyalty + 8);
      message = `${actor.name} hosted a feast; local officers gained up to 8 loyalty.`;
      break;
    }
    case 'reward': {
      if (city.gold < GOVERNOR_REWARD_GOLD_COST)
        return fail(`The city needs ${GOVERNOR_REWARD_GOLD_COST} gold to reward an officer.`);
      if (actor.loyalty >= 100) return fail('This officer is already completely loyal.');
      city.gold -= GOVERNOR_REWARD_GOLD_COST;
      actor.loyalty = Math.min(100, actor.loyalty + 15);
      message = `${actor.name} received a reward and gained up to 15 loyalty.`;
      break;
    }
    case 'relieve': {
      if (city.gold < GOVERNOR_RELIEF_GOLD_COST)
        return fail(`The city needs ${GOVERNOR_RELIEF_GOLD_COST} gold to relieve the people.`);
      if (city.food < GOVERNOR_RELIEF_FOOD_COST)
        return fail(`The city needs ${GOVERNOR_RELIEF_FOOD_COST} food to relieve the people.`);
      if (city.population >= RESOURCE_CAP)
        return fail('The city population is already at capacity.');
      city.gold -= GOVERNOR_RELIEF_GOLD_COST;
      city.food -= GOVERNOR_RELIEF_FOOD_COST;
      city.loyalty = Math.min(100, city.loyalty + 15);
      city.population = Math.min(RESOURCE_CAP, city.population + 300);
      message = `${actor.name} distributed grain: up to 15 city loyalty and 300 population.`;
      break;
    }
    case 'equip': {
      if (city.gold < GOVERNOR_EQUIPMENT_GOLD_COST)
        return fail(`The city needs ${GOVERNOR_EQUIPMENT_GOLD_COST} gold to issue fine arms.`);
      if (actor.equipment === 'Fine arms') return fail('This officer already has fine arms.');
      if (actor.force >= 105) return fail('This officer has reached the fine-arms force limit.');
      city.gold -= GOVERNOR_EQUIPMENT_GOLD_COST;
      actor.equipment = 'Fine arms';
      actor.force = Math.min(105, actor.force + 5);
      message = `${actor.name} received fine arms and gained up to 5 force.`;
      break;
    }
    case 'buy-food': {
      if (city.gold < 80) return fail('The capital needs 80 gold to buy food.');
      if (city.food + 800 > RESOURCE_CAP)
        return fail('The granary has no room for another 800 food.');
      const updated = applySharedCityWorkEffect(city, input.action, actor);
      if (!updated) return fail('The capital cannot complete this market purchase.');
      Object.assign(city, updated);
      message = 'Merchants delivered 800 food for 80 gold.';
      break;
    }
    case 'sell-food': {
      if (city.food < 800)
        return fail('The capital needs 800 food before it can sell this amount.');
      if (city.gold + 80 > RESOURCE_CAP)
        return fail('The treasury has no room for the sale proceeds.');
      city.food -= 800;
      city.gold += 80;
      message = 'Merchants bought 800 food for 80 gold.';
      break;
    }
    default:
      return fail('This city work action is not implemented.');
  }

  useWorkPoint(next, city);
  next.revision++;
  next.log.push(`${city.name} city work: ${input.action} (${message})`);
  return { ok: true, state: next, message };
}
