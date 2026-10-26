import { isCityCommitted, CITY_COMMITTED_REASON } from './commitments';
import { mergeTroopPools, setReservePool, TROOP_TYPES } from '../campaign/troop-experience';
import { recruitmentQuote } from '../campaign/recruitment';
import {
  availableReserveTroops,
  reinforceFromCity,
  splitPersonnel,
  transferRationRecord,
} from '../campaign/personnel';
import type { TroopType } from '../content/types';
import type { V03City, V03CityAction, V03GameState, V03Officer } from '../types';

export interface V03CityActionInput {
  cityId: string;
  action: V03CityAction;
  officerId?: string;
  amount?: number;
  troopType?: TroopType;
}

export interface V03CityActionResult {
  ok: boolean;
  state: V03GameState;
  message?: string;
  error?: string;
}

export interface V03CityActionAvailability {
  ok: boolean;
  reason: string | null;
}

export const CITY_MONTHLY_WORK_GOLD_COST = 80;
export const CITY_MANUAL_WORK_MAX_POINTS = 3;
export const GOVERNOR_REWARD_GOLD_COST = 100;
export const GOVERNOR_EQUIPMENT_GOLD_COST = 180;
export const GOVERNOR_RELIEF_GOLD_COST = 80;
export const GOVERNOR_RELIEF_FOOD_COST = 600;
const RESOURCE_CAP = 9_999_999;

function localOfficers(state: Readonly<V03GameState>, city: V03City): V03Officer[] {
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
  troopType: TroopType = 'infantry',
): V03City | null {
  const city: V03City = { ...source };
  if (
    ['restore-loyalty', 'develop-farming', 'develop-commerce', 'buy-food'].includes(action) &&
    city.gold < CITY_MONTHLY_WORK_GOLD_COST
  )
    return null;
  if (action === 'develop-farming' && city.farming >= 500) return null;
  if (action === 'develop-commerce' && city.commerce >= 500) return null;
  if (action === 'restore-loyalty' && city.loyalty >= 100) return null;
  if (action === 'buy-food' && city.food + 800 > RESOURCE_CAP) return null;
  if (action === 'sell-food' && (city.food < 800 || city.gold + 80 > RESOURCE_CAP)) return null;
  if (action === 'recruit') {
    const { troops: gain, gold } = recruitmentQuote(city, manager.force, troopType);
    if (gain <= 0 || city.reserve + gain > RESOURCE_CAP || city.gold < gold) return null;
    city.gold -= gold;
    city.population -= gain;
    setReservePool(
      city,
      troopType,
      mergeTroopPools(city.reservePools[troopType], { troops: gain, troopExperience: 0 }),
    );
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
  state: Readonly<V03GameState>,
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

function committedCityStock(state: Readonly<V03GameState>, cityId: string) {
  const reserved = { gold: 0, food: 0, troops: 0 };
  const outstanding = (order: { sourceCityId: string; journeyId: string | null; status: string }) =>
    order.sourceCityId === cityId &&
    order.journeyId === null &&
    ['accepted', 'reserved', 'dispatched'].includes(order.status);
  for (const order of state.requisitions) {
    if (!outstanding(order)) continue;
    reserved.gold += order.proposed.gold;
    reserved.food += order.proposed.food;
    reserved.troops += order.proposed.troops;
  }
  for (const order of state.directives) {
    if (outstanding(order)) reserved.troops += order.proposedTroops;
  }
  return reserved;
}

/** Read-only availability query; execution uses the same validation before changing state. */
export function getV03CityActionAvailability(
  state: Readonly<V03GameState>,
  input: V03CityActionInput,
): V03CityActionAvailability {
  return inspectCityAction(state, input, false);
}

function inspectCityAction(
  state: Readonly<V03GameState>,
  input: V03CityActionInput,
  governorExecution: boolean,
): V03CityActionAvailability {
  const city = state.cities.find((entry) => entry.id === input.cityId);
  const fail = (reason: string): V03CityActionAvailability => ({ ok: false, reason });
  const authorized = governorExecution
    ? Boolean(
        city &&
        city.id !== state.playerCapitalCityId &&
        city.factionId !== null &&
        city.governanceMode !== 'ruler',
      )
    : Boolean(
        city &&
        city.id === state.playerCapitalCityId &&
        city.factionId === state.playerFactionId &&
        city.governanceMode === 'ruler',
      );
  if (!city || !authorized)
    return fail(
      governorExecution
        ? 'Monthly governor work requires an owned city under autonomous governance.'
        : 'Only your directly governed capital accepts city work orders.',
    );
  if (isCityCommitted(state, input.cityId)) return fail(CITY_COMMITTED_REASON);
  if (state.phase === 'finished') return fail('This campaign has ended.');
  const actor = officerForAction(state, city, input.officerId);
  if (!actor)
    return fail('A living officer must be stationed in the capital to organize this work.');
  const quota = cityWorkQuota(state, city);
  if (cityWorkUsedThisMonth(state, city) >= quota)
    return fail(`The capital has used its ${quota} monthly work point${quota === 1 ? '' : 's'}.`);

  let goldCost = 0;
  let foodCost = 0;
  let garrisonDecrease = 0;
  switch (input.action) {
    case 'restore-loyalty':
      if (city.loyalty >= 100 || city.gold < 80)
        return fail('The city cannot afford or benefit from loyalty recovery.');
      goldCost = 80;
      break;
    case 'develop-farming':
    case 'develop-commerce':
      if (city[input.action === 'develop-farming' ? 'farming' : 'commerce'] >= 500)
        return fail('This improvement is already at its current limit.');
      if (city.gold < 80) return fail('The capital needs 80 unreserved gold for this work.');
      goldCost = 80;
      break;
    case 'search':
    case 'security':
    case 'feast':
      break;
    case 'recruit': {
      const kind = input.troopType ?? 'infantry';
      if (!TROOP_TYPES.includes(kind))
        return fail('Choose infantry, archers or cavalry to recruit.');
      const { troops: gain, gold } = recruitmentQuote(city, actor.force, kind);
      if (city.gold < gold) return fail('The city cannot afford this recruitment.');
      if (gain <= 0)
        return fail('The city has no recruitable population beyond its protected 1,000 residents.');
      if (city.reserve + gain > RESOURCE_CAP) return fail('The city reserve is at capacity.');
      goldCost = gold;
      break;
    }
    case 'assign-troops': {
      if (!input.officerId) return fail('Choose a living officer stationed in the capital.');
      if (actor.reorganizationDays > 0) return fail('These troops are still reorganizing.');
      if (
        !Number.isSafeInteger(input.amount) ||
        input.amount! < 0 ||
        input.amount! + actor.wounded > 10_000
      )
        return fail('An officer can command 0–10,000 soldiers.');
      const change = input.amount! - actor.troops;
      if (change > availableReserveTroops(state, city.id, actor.troopType))
        return fail('There are not enough soldiers of this troop type in the city reserve.');
      if (city.garrisonTroops + change < 0)
        return fail('The city garrison does not contain those soldiers.');
      garrisonDecrease = Math.max(0, -change);
      break;
    }
    case 'train':
      if (!input.officerId || actor.troops <= 0)
        return fail('Choose a living officer with troops stationed in the capital to train.');
      if (
        actor.experience >= 10_000 ||
        actor.force >= (actor.equipment === 'Fine arms' ? 105 : 100)
      )
        return fail('This officer has reached the current training limit.');
      break;
    case 'reward':
      if (city.gold < GOVERNOR_REWARD_GOLD_COST)
        return fail(`The city needs ${GOVERNOR_REWARD_GOLD_COST} gold to reward an officer.`);
      if (actor.loyalty >= 100) return fail('This officer is already completely loyal.');
      goldCost = GOVERNOR_REWARD_GOLD_COST;
      break;
    case 'equip':
      if (city.gold < GOVERNOR_EQUIPMENT_GOLD_COST)
        return fail(`The city needs ${GOVERNOR_EQUIPMENT_GOLD_COST} gold to issue fine arms.`);
      if (actor.equipment === 'Fine arms') return fail('This officer already has fine arms.');
      if (actor.force >= 105) return fail('This officer has reached the fine-arms force limit.');
      goldCost = GOVERNOR_EQUIPMENT_GOLD_COST;
      break;
    case 'relieve':
      if (city.gold < GOVERNOR_RELIEF_GOLD_COST)
        return fail(`The city needs ${GOVERNOR_RELIEF_GOLD_COST} gold to relieve the people.`);
      if (city.food < GOVERNOR_RELIEF_FOOD_COST)
        return fail(`The city needs ${GOVERNOR_RELIEF_FOOD_COST} food to relieve the people.`);
      if (city.population >= RESOURCE_CAP)
        return fail('The city population is already at capacity.');
      goldCost = GOVERNOR_RELIEF_GOLD_COST;
      foodCost = GOVERNOR_RELIEF_FOOD_COST;
      break;
    case 'buy-food':
      if (city.gold < 80) return fail('The capital needs 80 gold to buy food.');
      if (city.food + 800 > RESOURCE_CAP)
        return fail('The granary has no room for another 800 food.');
      goldCost = 80;
      break;
    case 'sell-food':
      if (city.food < 800)
        return fail('The capital needs 800 food before it can sell this amount.');
      if (city.gold + 80 > RESOURCE_CAP)
        return fail('The treasury has no room for the sale proceeds.');
      foodCost = 800;
      break;
    default:
      return fail('This city work action is not implemented.');
  }
  const reserved = committedCityStock(state, city.id);
  if (goldCost > 0 && city.gold - goldCost < reserved.gold)
    return fail('This action would spend gold reserved for an approved order.');
  if (foodCost > 0 && city.food - foodCost < reserved.food)
    return fail('This action would spend food reserved for an approved order.');
  if (garrisonDecrease > 0 && city.garrisonTroops - garrisonDecrease < reserved.troops)
    return fail('These soldiers are reserved for an approved order.');
  return { ok: true, reason: null };
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
  const availability = inspectCityAction(state, input, governorExecution);
  if (!availability.ok) return { ok: false, state, error: availability.reason! };
  const sourceCity = state.cities.find((city) => city.id === input.cityId)!;
  const manager = officerForAction(state, sourceCity, input.officerId)!;

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
      if (city[field] >= 500) return fail('This improvement is already at its current limit.');
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
      const kind = input.troopType ?? 'infantry';
      if (!TROOP_TYPES.includes(kind))
        return fail('Choose infantry, archers or cavalry to recruit.');
      const { troops: gain, gold } = recruitmentQuote(city, actor.force, kind);
      if (city.gold < gold) return fail('The city cannot afford this recruitment.');
      if (gain <= 0)
        return fail('The city has no recruitable population beyond its protected 1,000 residents.');
      if (city.reserve + gain > RESOURCE_CAP) return fail('The city reserve is at capacity.');
      const updated = applySharedCityWorkEffect(
        city,
        input.action,
        actor,
        input.troopType ?? 'infantry',
      );
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
      if (!Number.isSafeInteger(amount) || amount! < 0 || amount! + officer.wounded > 10_000)
        return fail('An officer can command 0–10,000 soldiers.');
      const change = amount! - officer.troops;
      if (change > availableReserveTroops(next, city.id, officer.troopType))
        return fail('There are not enough soldiers of this troop type in the city reserve.');
      if (city.garrisonTroops + change < 0)
        return fail('The city garrison does not contain those soldiers.');
      const reserve = city.reservePools[officer.troopType];
      if (change >= 0) {
        reinforceFromCity(next, officer.id, change);
      } else {
        const { remaining, taken } = splitPersonnel(officer, -change);
        transferRationRecord(
          next,
          `officer:${officer.id}`,
          `reserve:${city.id}:${officer.troopType}`,
          -change,
          0,
        );
        Object.assign(officer, remaining);
        const combined = mergeTroopPools(reserve, taken);
        setReservePool(city, officer.troopType, combined);
      }
      if (change < 0) city.garrisonTroops += change;
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
      const updated = applySharedCityWorkEffect(
        city,
        input.action,
        actor,
        input.troopType ?? 'infantry',
      );
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
      const updated = applySharedCityWorkEffect(
        city,
        input.action,
        actor,
        input.troopType ?? 'infantry',
      );
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
