import { isCityCommitted, isOfficerReservedForOrder, CITY_COMMITTED_REASON } from './commitments';
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
  officerIds?: string[];
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
export const CITY_MANUAL_WORK_MAX_POINTS = 2;
export const CITY_WORK_PERIOD_DAYS = 10;
export const GOVERNOR_REWARD_GOLD_COST = 100;
export const GOVERNOR_EQUIPMENT_GOLD_COST = 180;
export const GOVERNOR_RELIEF_GOLD_COST = 80;
export const GOVERNOR_RELIEF_FOOD_COST = 600;
const RESOURCE_CAP = 9_999_999;

export type OfficerGroupAction = 'feast' | 'reward' | 'equip';
export function isOfficerGroupAction(action: V03CityAction): action is OfficerGroupAction {
  return action === 'feast' || action === 'reward' || action === 'equip';
}

export function officerGroupActionReason(
  officer: V03Officer,
  action: OfficerGroupAction,
): string | null {
  if (action === 'reward' && officer.loyalty >= 100)
    return 'This officer is already completely loyal.';
  if (action === 'equip' && officer.equipment === 'Fine arms')
    return 'This officer already has fine arms.';
  if (action === 'equip' && officer.force >= 105)
    return 'This officer has reached the fine-arms force limit.';
  return null;
}

function localOfficers(state: Readonly<V03GameState>, city: V03City): V03Officer[] {
  if (city.factionId === null) return [];
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

export function cityWorkQuota(_state: Readonly<V03GameState>, city: V03City): number {
  return city.factionId === null ? 0 : CITY_MANUAL_WORK_MAX_POINTS;
}

export function cityActionWorkCost(action: V03CityAction): 0 | 1 {
  return action === 'assign-troops' || action === 'reward' || action === 'equip' ? 0 : 1;
}

export function cityWorkPeriodIndex(state: Pick<V03GameState, 'absoluteDay'>): number {
  return Math.floor(state.absoluteDay / CITY_WORK_PERIOD_DAYS);
}

export function cityWorkRefreshDays(state: Pick<V03GameState, 'absoluteDay'>): number {
  return CITY_WORK_PERIOD_DAYS - (state.absoluteDay % CITY_WORK_PERIOD_DAYS);
}

export function cityWorkUsedThisPeriod(state: Readonly<V03GameState>, city: V03City): number {
  if (city.workMonthIndex !== state.monthIndex) return 0;
  // Older saves retain their spent budget until the next real period boundary.
  if (city.workPeriodIndex !== undefined && city.workPeriodIndex !== cityWorkPeriodIndex(state))
    return 0;
  return city.workPointsUsed ?? 0;
}

/** Attach legacy budgets to their current period before advancing the world. */
export function initializeCityWorkPeriods(state: V03GameState): void {
  for (const city of state.cities) {
    if (city.workPeriodIndex !== undefined || city.workMonthIndex === undefined) continue;
    city.workPeriodIndex =
      city.workMonthIndex === state.monthIndex
        ? cityWorkPeriodIndex(state)
        : city.workMonthIndex * 3;
  }
}

export function automaticTalentWorkUsed(
  state: Readonly<V03GameState>,
  city: V03City,
  kind: 'search' | 'assign',
): number {
  if (city.workMonthIndex !== state.monthIndex) return 0;
  return (kind === 'search' ? city.autoSearchesThisMonth : city.autoAssignmentsThisMonth) ?? 0;
}

export function localSearchCandidates(state: Readonly<V03GameState>, cityId: string): V03Officer[] {
  return state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === null &&
        officer.location.kind === 'city' &&
        officer.location.cityId === cityId,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function applySharedCityWorkEffect(
  source: Readonly<V03City>,
  action:
    | 'restore-loyalty'
    | 'develop-farming'
    | 'develop-commerce'
    | 'security'
    | 'relieve'
    | 'recruit'
    | 'buy-food'
    | 'sell-food',
  manager: Pick<V03Officer, 'force' | 'intellect'> = { force: 0, intellect: 0 },
  troopType: TroopType = 'infantry',
): V03City | null {
  const city: V03City = { ...source };
  if (
    ['restore-loyalty', 'develop-farming', 'develop-commerce', 'buy-food', 'relieve'].includes(
      action,
    ) &&
    city.gold < CITY_MONTHLY_WORK_GOLD_COST
  )
    return null;
  if (action === 'develop-farming' && city.farming >= 500) return null;
  if (action === 'develop-commerce' && city.commerce >= 500) return null;
  if (action === 'restore-loyalty' && city.loyalty >= 100) return null;
  if (action === 'buy-food' && city.food + 800 > RESOURCE_CAP) return null;
  if (action === 'sell-food' && (city.food < 800 || city.gold + 80 > RESOURCE_CAP)) return null;
  if (
    action === 'relieve' &&
    (city.food < GOVERNOR_RELIEF_FOOD_COST || city.population >= RESOURCE_CAP)
  )
    return null;
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
  } else if (action === 'relieve') {
    city.gold -= GOVERNOR_RELIEF_GOLD_COST;
    city.food -= GOVERNOR_RELIEF_FOOD_COST;
    city.loyalty = Math.min(100, city.loyalty + 15);
    city.population = Math.min(RESOURCE_CAP, city.population + 300);
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
    if (action === 'develop-farming') city.farming = Math.min(500, city.farming + 20);
    else if (action === 'develop-commerce') city.commerce = Math.min(500, city.commerce + 10);
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

export function hasTrainingBenefit(
  officer: Pick<V03Officer, 'experience' | 'level' | 'force' | 'equipment'>,
): boolean {
  return (
    (officer.experience < 500 && officer.level < 5) ||
    officer.force < (officer.equipment === 'Fine arms' ? 105 : 100)
  );
}

function useWorkPoint(state: V03GameState, city: V03City, cost: 0 | 1): void {
  const previous = cityWorkUsedThisPeriod(state, city);
  if (city.workMonthIndex !== state.monthIndex) {
    city.workMonthIndex = state.monthIndex;
    city.workPointsUsed = 0;
    city.autoSearchesThisMonth = 0;
    city.autoAssignmentsThisMonth = 0;
  }
  city.workPeriodIndex = cityWorkPeriodIndex(state);
  city.workPointsUsed = previous + cost;
}

export function committedCityStock(state: Readonly<V03GameState>, cityId: string) {
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
  return inspectCityAction(state, input, 'player');
}

type CityWorkAuthority = 'player' | 'governor' | { npcFactionId: string };

function inspectOfficerGroupAction(
  state: Readonly<V03GameState>,
  input: V03CityActionInput,
  authority: CityWorkAuthority,
): V03CityActionAvailability {
  const fail = (reason: string) => ({ ok: false, reason });
  if (!isOfficerGroupAction(input.action))
    return fail('This action does not support multiple officers.');
  const ids = input.officerIds;
  if (!Array.isArray(ids) || !ids.length)
    return fail('Choose at least one officer for this action.');
  for (const id of ids)
    if (typeof id !== 'string' || !id)
      return fail('Choose a living officer stationed in the capital.');
  if (new Set(ids).size !== ids.length) return fail('Choose each officer only once.');
  const city = state.cities.find((entry) => entry.id === input.cityId);
  const cost =
    ids.length *
    (input.action === 'reward'
      ? GOVERNOR_REWARD_GOLD_COST
      : input.action === 'equip'
        ? GOVERNOR_EQUIPMENT_GOLD_COST
        : 0);
  if (city && city.gold < cost)
    return fail(`The city needs ${cost} unreserved gold for the selected officers.`);
  for (const officerId of ids) {
    const available = inspectCityAction(
      state,
      { ...input, officerIds: undefined, officerId },
      authority,
    );
    if (!available.ok) return available;
  }
  if (input.action === 'feast') {
    if (ids.every((id) => state.officers.find((officer) => officer.id === id)!.loyalty >= 100))
      return fail('All selected officers are already completely loyal.');
  } else {
    if (city!.gold - cost < committedCityStock(state, city!.id).gold)
      return fail('This action would spend gold reserved for an approved order.');
  }
  return { ok: true, reason: null };
}

/** Internal planner query, with the same capital ownership guard as execution. */
export function getAutomaticCityActionAvailability(
  state: Readonly<V03GameState>,
  input: V03CityActionInput,
  npcFactionId?: string,
): V03CityActionAvailability {
  return inspectCityAction(state, input, npcFactionId ? { npcFactionId } : 'governor');
}

function inspectCityAction(
  state: Readonly<V03GameState>,
  input: V03CityActionInput,
  authority: CityWorkAuthority,
): V03CityActionAvailability {
  if (input.officerIds !== undefined) return inspectOfficerGroupAction(state, input, authority);
  const city = state.cities.find((entry) => entry.id === input.cityId);
  const fail = (reason: string): V03CityActionAvailability => ({ ok: false, reason });
  const governorExecution = authority !== 'player';
  const npcFaction =
    typeof authority === 'object'
      ? state.factions.find((faction) => faction.id === authority.npcFactionId)
      : undefined;
  const authorized =
    typeof authority === 'object'
      ? Boolean(
          city &&
          npcFaction &&
          !npcFaction.eliminated &&
          npcFaction.id !== state.playerFactionId &&
          !npcFaction.isPlayer &&
          city.factionId === npcFaction.id &&
          city.id === npcFaction.capitalCityId &&
          city.governanceMode === 'ruler',
        )
      : governorExecution
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
  if (cityActionWorkCost(input.action) && cityWorkUsedThisPeriod(state, city) >= quota)
    return fail(`The capital has used its ${quota} work points for this ten-day period.`);

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
      if (!localSearchCandidates(state, city.id).length)
        return fail('No local free officer is available to search for.');
      if (governorExecution && automaticTalentWorkUsed(state, city, 'search') >= 1)
        return fail('This city has already attempted its automatic talent search this month.');
      break;
    case 'security':
      if (city.loyalty >= 100) return fail('City loyalty is already full.');
      break;
    case 'feast':
      if (localOfficers(state, city).every((officer) => officer.loyalty >= 100))
        return fail('All stationed officers are already completely loyal.');
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
      if (isOfficerReservedForOrder(state, actor.id))
        return fail('This officer is reserved for an approved order.');
      if (actor.reorganizationDays > 0) return fail('These troops are still reorganizing.');
      if (
        !Number.isSafeInteger(input.amount) ||
        input.amount! < 0 ||
        input.amount! + actor.wounded > 10_000
      )
        return fail('An officer can command 0–10,000 soldiers.');
      const change = input.amount! - actor.troops;
      if (change === 0) return fail('Choose a different troop count.');
      if (
        governorExecution &&
        actor.troops + actor.wounded === 0 &&
        change > 0 &&
        automaticTalentWorkUsed(state, city, 'assign') >= 1
      )
        return fail('This city has already assigned its first automatic army this month.');
      if (change > availableReserveTroops(state, city.id, actor.troopType))
        return fail('There are not enough soldiers of this troop type in the city reserve.');
      if (
        governorExecution &&
        change > 0 &&
        change >
          availableReserveTroops(state, city.id, actor.troopType) -
            committedCityStock(state, city.id).troops
      )
        return fail('These soldiers are reserved for an approved order.');
      if (city.garrisonTroops + change < 0)
        return fail('The city garrison does not contain those soldiers.');
      garrisonDecrease = Math.max(0, -change);
      break;
    }
    case 'train':
      if (!input.officerId || actor.troops <= 0)
        return fail('Choose a living officer with troops stationed in the capital to train.');
      if (!hasTrainingBenefit(actor))
        return fail('This officer has reached the current training limit.');
      break;
    case 'reward':
      if (city.gold < GOVERNOR_REWARD_GOLD_COST)
        return fail(`The city needs ${GOVERNOR_REWARD_GOLD_COST} gold to reward an officer.`);
      if (officerGroupActionReason(actor, 'reward'))
        return fail(officerGroupActionReason(actor, 'reward')!);
      goldCost = GOVERNOR_REWARD_GOLD_COST;
      break;
    case 'equip':
      if (city.gold < GOVERNOR_EQUIPMENT_GOLD_COST)
        return fail(`The city needs ${GOVERNOR_EQUIPMENT_GOLD_COST} gold to issue fine arms.`);
      if (officerGroupActionReason(actor, 'equip'))
        return fail(officerGroupActionReason(actor, 'equip')!);
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

/** Execute one direct ruler-city action through the shared monthly city budget. */
export function applyV03CityAction(
  state: V03GameState,
  input: V03CityActionInput,
): V03CityActionResult {
  return applyCityAction(state, input, 'player');
}

/** Trusted monthly-autonomy entry point; it shares the same action effects and quota checks. */
export function applyGovernorCityAction(
  state: V03GameState,
  input: V03CityActionInput,
): V03CityActionResult {
  return applyCityAction(state, input, 'governor');
}

/** Trusted monthly NPC-capital entry; never accepts a player command bypass flag. */
export function applyNpcCapitalCityAction(
  state: V03GameState,
  factionId: string,
  input: V03CityActionInput,
): V03CityActionResult {
  return applyCityAction(state, input, { npcFactionId: factionId });
}

function applyCityAction(
  state: V03GameState,
  input: V03CityActionInput,
  authority: CityWorkAuthority,
): V03CityActionResult {
  const availability = inspectCityAction(state, input, authority);
  if (!availability.ok) return { ok: false, state, error: availability.reason! };
  const sourceCity = state.cities.find((city) => city.id === input.cityId)!;
  const manager = officerForAction(state, sourceCity, input.officerIds?.[0] ?? input.officerId)!;

  const next = structuredClone(state);
  const city = next.cities.find((entry) => entry.id === input.cityId)!;
  const actor = next.officers.find((entry) => entry.id === manager.id)!;
  const recipients = input.officerIds?.map((id) =>
    next.officers.find((officer) => officer.id === id)!,
  );
  const firstAssignment =
    input.action === 'assign-troops' &&
    actor.troops + actor.wounded === 0 &&
    (input.amount ?? 0) > 0;
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
      const gain = updated[field] - city[field];
      Object.assign(city, updated);
      message = `${field === 'farming' ? 'Farming' : 'Commerce'} improved by ${gain} for 80 gold.`;
      break;
    }
    case 'search': {
      const candidate = localSearchCandidates(next, city.id);
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
      if (!hasTrainingBenefit(officer))
        return fail('This officer has reached the current training limit.');
      const before = {
        experience: officer.experience,
        force: officer.force,
        intellect: officer.intellect,
      };
      // Old saves may contain more than 500 XP; stop adding without reducing it.
      if (officer.experience < 500 && officer.level < 5)
        officer.experience = Math.min(500, officer.experience + 25);
      if (officer.force < forceLimit) officer.force++;
      const targetLevel = levelForExperience(officer.experience);
      while (officer.level < targetLevel) {
        officer.level++;
        if (officer.troopType === 'archer')
          officer.intellect = Math.min(100, officer.intellect + 2);
        else if (officer.force < forceLimit)
          officer.force = Math.min(forceLimit, officer.force + 2);
      }
      message = `${officer.name} completed training: +${officer.experience - before.experience} experience, +${officer.force - before.force} force and +${officer.intellect - before.intellect} intellect.`;
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
      const officers = recipients ?? localOfficers(next, city);
      for (const officer of officers) officer.loyalty = Math.min(100, officer.loyalty + 8);
      message = recipients
        ? `${officers.length} selected officers attended the feast and gained up to 8 loyalty each.`
        : `${actor.name} hosted a feast; local officers gained up to 8 loyalty.`;
      break;
    }
    case 'reward': {
      const officers = recipients ?? [actor];
      city.gold -= GOVERNOR_REWARD_GOLD_COST * officers.length;
      for (const officer of officers) officer.loyalty = Math.min(100, officer.loyalty + 15);
      message = recipients
        ? `${officers.length} selected officers received rewards and gained up to 15 loyalty each.`
        : `${actor.name} received a reward and gained up to 15 loyalty.`;
      break;
    }
    case 'relieve': {
      const updated = applySharedCityWorkEffect(city, input.action);
      if (!updated) return fail('The city cannot afford or benefit from relief.');
      Object.assign(city, updated);
      message = `${actor.name} distributed grain: up to 15 city loyalty and 300 population.`;
      break;
    }
    case 'equip': {
      const officers = recipients ?? [actor];
      city.gold -= GOVERNOR_EQUIPMENT_GOLD_COST * officers.length;
      for (const officer of officers) {
        officer.equipment = 'Fine arms';
        officer.force = Math.min(105, officer.force + 5);
      }
      message = recipients
        ? `${officers.length} selected officers received fine arms and gained up to 5 force each.`
        : `${actor.name} received fine arms and gained up to 5 force.`;
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

  useWorkPoint(next, city, cityActionWorkCost(input.action));
  if (authority !== 'player' && input.action === 'search')
    city.autoSearchesThisMonth = (city.autoSearchesThisMonth ?? 0) + 1;
  if (authority !== 'player' && firstAssignment)
    city.autoAssignmentsThisMonth = (city.autoAssignmentsThisMonth ?? 0) + 1;
  next.revision++;
  next.log.push(`${city.name} city work: ${input.action} (${message})`);
  return { ok: true, state: next, message };
}
