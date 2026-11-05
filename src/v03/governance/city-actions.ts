import { isCityCommitted, isOfficerReservedForOrder, CITY_COMMITTED_REASON } from './commitments';
import { mergeTroopPools, setReservePool, TROOP_TYPES } from '../campaign/troop-experience';
import { recruitmentQuote } from '../campaign/recruitment';
import {
  availableReserveTroops,
  reinforceFromCity,
  splitPersonnel,
  transferRationRecord,
} from '../campaign/personnel';
import { CITY_RECORDS } from '../content/cities';
import type { TroopType } from '../content/types';
import {
  CITY_WORK as CITY_WORK_TABLE,
  ECONOMY as ECONOMY_TABLE,
  LEADERSHIP as LEADERSHIP_TABLE,
  PERSONNEL as PERSONNEL_TABLE,
} from '../balance';
import type { V03City, V03CityAction, V03GameState, V03Officer } from '../types';

// Module-local bindings: reading an imported table through the module namespace costs a getter call per access in hot loops.
const CITY_WORK = CITY_WORK_TABLE;
const ECONOMY = ECONOMY_TABLE;
const LEADERSHIP = LEADERSHIP_TABLE;
const PERSONNEL = PERSONNEL_TABLE;

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

export const CITY_MONTHLY_WORK_GOLD_COST = CITY_WORK.workGold;
export const CITY_MANUAL_WORK_MAX_POINTS = CITY_WORK.manualPointsPerPeriod;
export const CITY_WORK_PERIOD_DAYS = CITY_WORK.periodDays;
/** Unused work points carry over up to one month's worth (three periods). */
export const CITY_WORK_BANK_MAX_POINTS = CITY_WORK.bankMaxPoints;
export const GOVERNOR_REWARD_GOLD_COST = CITY_WORK.rewardGold;
export const GOVERNOR_EQUIPMENT_GOLD_COST = CITY_WORK.equipmentGold;
export const GOVERNOR_RELIEF_GOLD_COST = CITY_WORK.relief.gold;
export const GOVERNOR_RELIEF_FOOD_COST = CITY_WORK.relief.food;
export const CITY_FOOD_TRADE_GOLD = CITY_WORK.trade.gold;
export const RESTORE_LOYALTY_RETIRED =
  'Restore loyalty has been retired: security is free and restores more.';
const RESOURCE_CAP = ECONOMY.resourceCap;

/** Civil work scales with the executor's politics: 0.7 at 0, 1.0 at 60, 1.2 at 100. */
export function politicsFactor(officer: Pick<V03Officer, 'politics'>): number {
  // Rounded so that exact halves (for example 8.5) are not lost to floating-point error.
  return (
    Math.round((CITY_WORK.politics.base + officer.politics * CITY_WORK.politics.slope) * 1e9) / 1e9
  );
}
/** Population settled by one relief action. */
export function reliefPopulation(officer: Pick<V03Officer, 'politics'>): number {
  return Math.round(CITY_WORK.relief.population * politicsFactor(officer));
}
/** Food moved by one market trade at ten food per gold. */
export function cityFoodTradeFood(officer: Pick<V03Officer, 'politics'>): number {
  return Math.round(CITY_WORK.trade.food * politicsFactor(officer));
}
/** Farming or commerce gained by one development action, before the cap. */
export function developmentGain(
  action: 'develop-farming' | 'develop-commerce',
  officer: Pick<V03Officer, 'politics'>,
): number {
  const base =
    action === 'develop-farming' ? CITY_WORK.develop.farmingGain : CITY_WORK.develop.commerceGain;
  return Math.round(base * politicsFactor(officer));
}
/** City loyalty gained by one security action. */
export function securityLoyaltyGain(officer: Pick<V03Officer, 'politics'>): number {
  return (
    CITY_WORK.security.loyaltyBase +
    Math.floor(officer.politics / CITY_WORK.security.politicsDivisor)
  );
}
/** Development ceilings of a city (L-01): its tier record, not a flat number. */
export function cityDevelopmentCaps(cityId: string): { farming: number; commerce: number } {
  const record = CITY_RECORDS[cityId];
  const fallback = CITY_WORK.develop.fallbackCap;
  return { farming: record?.farmingCap ?? fallback, commerce: record?.commerceCap ?? fallback };
}

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
  if (action === 'equip' && officer.force >= CITY_WORK.equip.forceCap)
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

/**
 * Days a capital task occupies the officer who carries it out. The effect still lands at
 * once; the officer cannot take another capital task until the days pass. Feasts and the
 * free preparations have no executor to occupy.
 */
const CITY_WORK_BUSY_DAYS: Partial<Record<V03CityAction, number>> = {
  'develop-farming': CITY_WORK.busyDays.developFarming,
  'develop-commerce': CITY_WORK.busyDays.developCommerce,
  train: CITY_WORK.busyDays.train,
  recruit: CITY_WORK.busyDays.recruit,
  security: CITY_WORK.busyDays.security,
  relieve: CITY_WORK.busyDays.relieve,
  search: CITY_WORK.busyDays.search,
  'buy-food': CITY_WORK.busyDays.buyFood,
  'sell-food': CITY_WORK.busyDays.sellFood,
};

export function cityWorkBusyDays(action: V03CityAction): number {
  return CITY_WORK_BUSY_DAYS[action] ?? 0;
}

/** Days left on the officer's current capital task; 0 when they can take a new one. */
export function officerBusyDays(
  state: Pick<V03GameState, 'absoluteDay'>,
  officer: Pick<V03Officer, 'cityWork'>,
): number {
  return Math.max(0, (officer.cityWork?.untilDay ?? 0) - state.absoluteDay);
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

/**
 * Points the city can spend now (PF-RL-01). Each ten-day period adds the quota; points
 * left unused carry over, up to one month's worth. The record holds the points carried
 * into its period and the points spent in it, so nothing is saved per day.
 */
export function cityWorkAvailable(state: Readonly<V03GameState>, city: V03City): number {
  const quota = cityWorkQuota(state, city);
  if (!quota) return 0;
  if (city.workPeriodIndex === undefined)
    return Math.max(0, quota - cityWorkUsedThisPeriod(state, city));
  const remaining = Math.max(
    0,
    Math.min(CITY_WORK_BANK_MAX_POINTS, (city.workPointsBanked ?? 0) + quota) -
      (city.workPointsUsed ?? 0),
  );
  const periods = cityWorkPeriodIndex(state) - city.workPeriodIndex;
  return periods > 0 ? Math.min(CITY_WORK_BANK_MAX_POINTS, remaining + quota * periods) : remaining;
}

/** Attach legacy budgets to their current period before advancing the world. */
export function initializeCityWorkPeriods(state: V03GameState): void {
  for (const city of state.cities) {
    if (city.workPeriodIndex !== undefined || city.workMonthIndex === undefined) continue;
    city.workPeriodIndex =
      city.workMonthIndex === state.monthIndex
        ? cityWorkPeriodIndex(state)
        : city.workMonthIndex * CITY_WORK.periodsPerMonth;
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
  manager: Pick<V03Officer, 'force' | 'intellect' | 'politics'> = {
    force: 0,
    intellect: 0,
    politics: 0,
  },
  troopType: TroopType = 'infantry',
): V03City | null {
  const city: V03City = { ...source };
  if (
    ['restore-loyalty', 'develop-farming', 'develop-commerce', 'relieve'].includes(action) &&
    city.gold < CITY_MONTHLY_WORK_GOLD_COST
  )
    return null;
  const caps = cityDevelopmentCaps(city.id);
  const tradeFood = cityFoodTradeFood(manager);
  if (action === 'develop-farming' && city.farming >= caps.farming) return null;
  if (action === 'develop-commerce' && city.commerce >= caps.commerce) return null;
  if (action === 'restore-loyalty' && city.loyalty >= 100) return null;
  if (
    action === 'buy-food' &&
    (city.gold < CITY_FOOD_TRADE_GOLD || city.food + tradeFood > RESOURCE_CAP)
  )
    return null;
  if (
    action === 'sell-food' &&
    (city.food < tradeFood || city.gold + CITY_FOOD_TRADE_GOLD > RESOURCE_CAP)
  )
    return null;
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
    city.loyalty = Math.max(0, city.loyalty - CITY_WORK.recruitLoyaltyLoss);
  } else if (action === 'relieve') {
    city.gold -= GOVERNOR_RELIEF_GOLD_COST;
    city.food -= GOVERNOR_RELIEF_FOOD_COST;
    city.loyalty = Math.min(100, city.loyalty + CITY_WORK.relief.loyaltyGain);
    city.population = Math.min(RESOURCE_CAP, city.population + reliefPopulation(manager));
  } else if (action === 'security')
    city.loyalty = Math.min(100, city.loyalty + securityLoyaltyGain(manager));
  else if (action === 'buy-food') {
    city.gold -= CITY_FOOD_TRADE_GOLD;
    city.food += tradeFood;
  } else if (action === 'sell-food') {
    city.food -= tradeFood;
    city.gold += CITY_FOOD_TRADE_GOLD;
  } else {
    city.gold -= CITY_MONTHLY_WORK_GOLD_COST;
    if (action === 'develop-farming')
      city.farming = Math.min(caps.farming, city.farming + developmentGain(action, manager));
    else if (action === 'develop-commerce')
      city.commerce = Math.min(caps.commerce, city.commerce + developmentGain(action, manager));
    else city.loyalty = Math.min(100, city.loyalty + CITY_WORK.develop.legacyLoyaltyGain);
  }
  return city;
}

/** Stat that ranks executors for an action: force recruits, leadership trains, politics governs. */
export function executorStat(
  action: V03CityAction,
): 'force' | 'leadership' | 'intellect' | 'politics' {
  if (action === 'recruit') return 'force';
  if (action === 'train') return 'leadership';
  if (action === 'search') return 'intellect';
  return 'politics';
}

function officerForAction(
  state: Readonly<V03GameState>,
  city: V03City,
  officerId: string | undefined,
  action: V03CityAction,
  trackBusy: boolean,
): V03Officer | undefined {
  const stat = executorStat(action);
  const officers = localOfficers(state, city).sort(
    (a, b) => b[stat] - a[stat] || a.id.localeCompare(b.id),
  );
  if (officerId) return officers.find((officer) => officer.id === officerId);
  // Unnamed, the task goes to the ablest officer not still occupied with another one.
  const free =
    trackBusy && cityWorkBusyDays(action)
      ? officers.find((officer) => !officerBusyDays(state, officer))
      : undefined;
  return free ?? officers[0];
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
  return Math.min(
    CITY_WORK.training.maxLevel,
    Math.floor(Math.max(0, experience) / CITY_WORK.training.experiencePerLevel),
  );
}

/** Training only adds XP now (PF-RL-03), so it helps until level 5 or 500 XP. */
export function hasTrainingBenefit(officer: Pick<V03Officer, 'experience' | 'level'>): boolean {
  return (
    officer.experience < CITY_WORK.training.experienceCap &&
    officer.level < CITY_WORK.training.maxLevel
  );
}

/**
 * Add officer XP (up to 500, level 5) and apply each level reached: +2 force within the
 * force limit, and archers also +2 intellect, since their normal attacks use force too.
 * Shared by training and battle.
 */
export function gainOfficerExperience(
  officer: Pick<
    V03Officer,
    'experience' | 'level' | 'force' | 'intellect' | 'leadership' | 'equipment' | 'troopType'
  >,
  amount: number,
): void {
  // Old saves may contain more than 500 XP; stop adding without reducing it.
  if (
    amount <= 0 ||
    officer.experience >= CITY_WORK.training.experienceCap ||
    officer.level >= CITY_WORK.training.maxLevel
  )
    return;
  officer.experience = Math.min(CITY_WORK.training.experienceCap, officer.experience + amount);
  const forceLimit =
    officer.equipment === 'Fine arms' ? CITY_WORK.equip.forceCap : CITY_WORK.baseForceCap;
  const targetLevel = levelForExperience(officer.experience);
  while (officer.level < targetLevel) {
    officer.level++;
    officer.leadership = Math.min(LEADERSHIP.max, officer.leadership + 1);
    if (officer.troopType === 'archer')
      officer.intellect = Math.min(
        100,
        officer.intellect + CITY_WORK.training.archerIntellectPerLevel,
      );
    if (officer.force < forceLimit)
      officer.force = Math.min(forceLimit, officer.force + CITY_WORK.training.forcePerLevel);
  }
}

function useWorkPoint(state: V03GameState, city: V03City, cost: 0 | 1): void {
  const available = cityWorkAvailable(state, city);
  const period = cityWorkPeriodIndex(state);
  if (city.workMonthIndex !== state.monthIndex) {
    city.workMonthIndex = state.monthIndex;
    city.autoSearchesThisMonth = 0;
    city.autoAssignmentsThisMonth = 0;
  }
  if (city.workPeriodIndex !== period) {
    // Start this period's record: everything above its own refresh was carried over.
    city.workPointsBanked = Math.max(0, available - cityWorkQuota(state, city));
    city.workPointsUsed = 0;
    city.workPeriodIndex = period;
  }
  city.workPointsUsed = (city.workPointsUsed ?? 0) + cost;
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
  const actor = officerForAction(
    state,
    city,
    input.officerId,
    input.action,
    authority === 'player',
  );
  if (!actor)
    return fail('A living officer must be stationed in the capital to organize this work.');
  if (cityActionWorkCost(input.action) && cityWorkAvailable(state, city) <= 0)
    return fail(
      `The capital has no work points left; ${cityWorkQuota(state, city)} more arrive in ${cityWorkRefreshDays(state)} days.`,
    );
  // Only the player's capital tracks who is occupied; autonomous planners are unchanged.
  if (authority === 'player' && cityWorkBusyDays(input.action) && officerBusyDays(state, actor) > 0)
    return fail(
      `${actor.name} is still busy with city work for ${officerBusyDays(state, actor)} more days.`,
    );

  let goldCost = 0;
  let foodCost = 0;
  let garrisonDecrease = 0;
  switch (input.action) {
    case 'restore-loyalty':
      // Dominated by free security; kept as a type only for old reports (PF-RL-02).
      return fail(RESTORE_LOYALTY_RETIRED);
    case 'develop-farming':
    case 'develop-commerce':
      {
        const field = input.action === 'develop-farming' ? 'farming' : 'commerce';
        const cap = cityDevelopmentCaps(city.id)[field];
        if (city[field] >= cap)
          return fail(`This improvement is already at this city's limit of ${cap}.`);
      }
      if (city.gold < CITY_MONTHLY_WORK_GOLD_COST)
        return fail(
          `The capital needs ${CITY_MONTHLY_WORK_GOLD_COST} unreserved gold for this work.`,
        );
      goldCost = CITY_MONTHLY_WORK_GOLD_COST;
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
        input.amount! + actor.wounded > PERSONNEL.capacity
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
      if (city.gold < CITY_FOOD_TRADE_GOLD)
        return fail(`The capital needs ${CITY_FOOD_TRADE_GOLD} gold to buy food.`);
      if (city.food + cityFoodTradeFood(actor) > RESOURCE_CAP)
        return fail(`The granary has no room for another ${cityFoodTradeFood(actor)} food.`);
      goldCost = CITY_FOOD_TRADE_GOLD;
      break;
    case 'sell-food':
      if (city.food < cityFoodTradeFood(actor))
        return fail(
          `The capital needs ${cityFoodTradeFood(actor)} food before it can sell this amount.`,
        );
      if (city.gold + CITY_FOOD_TRADE_GOLD > RESOURCE_CAP)
        return fail('The treasury has no room for the sale proceeds.');
      foodCost = cityFoodTradeFood(actor);
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
  const manager = officerForAction(
    state,
    sourceCity,
    input.officerIds?.[0] ?? input.officerId,
    input.action,
    authority === 'player',
  )!;

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
    case 'restore-loyalty':
      return fail(RESTORE_LOYALTY_RETIRED);
    case 'develop-farming':
    case 'develop-commerce': {
      const field = input.action === 'develop-farming' ? 'farming' : 'commerce';
      const cap = cityDevelopmentCaps(city.id)[field];
      if (city[field] >= cap)
        return fail(`This improvement is already at this city's limit of ${cap}.`);
      const updated = applySharedCityWorkEffect(city, input.action, actor);
      if (!updated)
        return fail(
          `The capital needs ${CITY_MONTHLY_WORK_GOLD_COST} unreserved gold for this work.`,
        );
      const gain = updated[field] - city[field];
      Object.assign(city, updated);
      message = `${field === 'farming' ? 'Farming' : 'Commerce'} improved by ${gain} for ${CITY_MONTHLY_WORK_GOLD_COST} gold.`;
      break;
    }
    case 'search': {
      const candidate = localSearchCandidates(next, city.id);
      const foundOfficer = candidate.length
        ? candidate[nextRandom(next, candidate.length)]
        : undefined;
      if (
        foundOfficer &&
        nextRandom(next, 100) <
          CITY_WORK.search.baseChance +
            Math.floor(actor.intellect / CITY_WORK.search.intellectDivisor)
      ) {
        const officer = foundOfficer;
        officer.factionId = city.factionId;
        officer.loyalty =
          CITY_WORK.search.joinLoyaltyBase + nextRandom(next, CITY_WORK.search.joinLoyaltySpan);
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
      if (
        !Number.isSafeInteger(amount) ||
        amount! < 0 ||
        amount! + officer.wounded > PERSONNEL.capacity
      )
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
      if (!hasTrainingBenefit(officer))
        return fail('This officer has reached the current training limit.');
      const before = {
        experience: officer.experience,
        force: officer.force,
        intellect: officer.intellect,
      };
      gainOfficerExperience(officer, CITY_WORK.training.experienceGain);
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
      for (const officer of officers)
        officer.loyalty = Math.min(100, officer.loyalty + CITY_WORK.feastLoyaltyGain);
      message = recipients
        ? `${officers.length} selected officers attended the feast and gained up to 8 loyalty each.`
        : `${actor.name} hosted a feast; local officers gained up to 8 loyalty.`;
      break;
    }
    case 'reward': {
      const officers = recipients ?? [actor];
      city.gold -= GOVERNOR_REWARD_GOLD_COST * officers.length;
      for (const officer of officers)
        officer.loyalty = Math.min(100, officer.loyalty + CITY_WORK.rewardLoyaltyGain);
      message = recipients
        ? `${officers.length} selected officers received rewards and gained up to 15 loyalty each.`
        : `${actor.name} received a reward and gained up to 15 loyalty.`;
      break;
    }
    case 'relieve': {
      const updated = applySharedCityWorkEffect(city, input.action, actor);
      if (!updated) return fail('The city cannot afford or benefit from relief.');
      Object.assign(city, updated);
      message = `${actor.name} distributed grain: up to 15 city loyalty and ${reliefPopulation(actor)} population.`;
      break;
    }
    case 'equip': {
      const officers = recipients ?? [actor];
      city.gold -= GOVERNOR_EQUIPMENT_GOLD_COST * officers.length;
      for (const officer of officers) {
        officer.equipment = 'Fine arms';
        officer.force = Math.min(
          CITY_WORK.equip.forceCap,
          officer.force + CITY_WORK.equip.forceGain,
        );
      }
      message = recipients
        ? `${officers.length} selected officers received fine arms and gained up to 5 force each.`
        : `${actor.name} received fine arms and gained up to 5 force.`;
      break;
    }
    case 'buy-food':
    case 'sell-food': {
      const updated = applySharedCityWorkEffect(
        city,
        input.action,
        actor,
        input.troopType ?? 'infantry',
      );
      if (!updated) return fail('The capital cannot complete this market trade.');
      Object.assign(city, updated);
      message = `Merchants ${input.action === 'buy-food' ? 'delivered' : 'bought'} ${cityFoodTradeFood(actor)} food for ${CITY_FOOD_TRADE_GOLD} gold.`;
      break;
    }
    default:
      return fail('This city work action is not implemented.');
  }

  useWorkPoint(next, city, cityActionWorkCost(input.action));
  if (authority === 'player' && cityWorkBusyDays(input.action))
    actor.cityWork = {
      action: input.action,
      untilDay: next.absoluteDay + cityWorkBusyDays(input.action),
    };
  if (authority !== 'player' && input.action === 'search')
    city.autoSearchesThisMonth = (city.autoSearchesThisMonth ?? 0) + 1;
  if (authority !== 'player' && firstAssignment)
    city.autoAssignmentsThisMonth = (city.autoAssignmentsThisMonth ?? 0) + 1;
  next.revision++;
  next.log.push(`${city.name} city work: ${input.action} (${message})`);
  return { ok: true, state: next, message };
}
