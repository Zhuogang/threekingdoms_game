/**
 * Pure, deterministic campaign-month systems retained from the original campaign.
 *
 * The module deliberately uses narrow structural inputs so the engine can adapt
 * the campaign state without making the legacy campaign implementation a runtime
 * dependency. Presentation text is left to the caller; event keys and numeric
 * payloads are stable and localization-ready.
 */

import { availableTroops } from './personnel';
import { OFFICER_MATURITY_GAIN } from '../content/officer-timeline';
import {
  mergeTroopPools,
  setReservePool,
  TROOP_TYPES,
  type ReservePools,
} from './troop-experience';

export const V03_ALLIANCE_DURATION_MONTHS = 6;
export const V03_HEGEMON_CITIES = 16;
export const V03_HEGEMON_HOLD_MONTHS = 12;
export const V03_HEGEMON_CAPITAL_CITY_ID = 'luoyang';
export const V03_RESOURCE_CAP = 9_999_999;

export interface V03TimedAlliance {
  a: string;
  b: string;
  /** Exclusive end month. The alliance is active while monthIndex < this value. */
  expiresMonthIndex: number;
}

export type AllianceFailure = 'same-faction' | 'already-allied' | 'unknown-faction';

export function isV03AllianceActive(
  alliances: readonly V03TimedAlliance[],
  a: string,
  b: string,
  monthIndex: number,
): boolean {
  if (a === b) return false;
  return alliances.some(
    (alliance) =>
      alliance.expiresMonthIndex > monthIndex &&
      ((alliance.a === a && alliance.b === b) || (alliance.a === b && alliance.b === a)),
  );
}

/** The rule-layer attack guard. A non-null result blocks an attack between these factions. */
export function getV03AttackAllianceBlock(
  alliances: readonly V03TimedAlliance[],
  attackerFactionId: string,
  defenderFactionId: string | null,
  monthIndex: number,
): V03TimedAlliance | null {
  if (!defenderFactionId || attackerFactionId === defenderFactionId) return null;
  return (
    alliances.find(
      (alliance) =>
        alliance.expiresMonthIndex > monthIndex &&
        ((alliance.a === attackerFactionId && alliance.b === defenderFactionId) ||
          (alliance.b === attackerFactionId && alliance.a === defenderFactionId)),
    ) ?? null
  );
}

/** Create a six-month faction-level treaty, rejecting self-treaties and active duplicates. */
export function createV03Alliance(
  alliances: readonly V03TimedAlliance[],
  a: string,
  b: string,
  monthIndex: number,
  factionIds?: readonly string[],
):
  | { ok: true; alliance: V03TimedAlliance; alliances: V03TimedAlliance[] }
  | {
      ok: false;
      reason: AllianceFailure;
    } {
  if (a === b) return { ok: false, reason: 'same-faction' };
  if (factionIds && (!factionIds.includes(a) || !factionIds.includes(b)))
    return { ok: false, reason: 'unknown-faction' };
  if (isV03AllianceActive(alliances, a, b, monthIndex))
    return { ok: false, reason: 'already-allied' };

  const alliance = { a, b, expiresMonthIndex: monthIndex + V03_ALLIANCE_DURATION_MONTHS };
  const next = alliances.filter(
    (candidate) =>
      !((candidate.a === a && candidate.b === b) || (candidate.a === b && candidate.b === a)),
  );
  next.push(alliance);
  return { ok: true, alliance, alliances: next };
}

export function expireV03Alliances(
  alliances: readonly V03TimedAlliance[],
  monthIndex: number,
): { active: V03TimedAlliance[]; expired: V03TimedAlliance[] } {
  const active: V03TimedAlliance[] = [];
  const expired: V03TimedAlliance[] = [];
  for (const alliance of alliances) {
    (alliance.expiresMonthIndex > monthIndex ? active : expired).push({ ...alliance });
  }
  return { active, expired };
}

export interface V03HegemonInput {
  cityOwners: readonly { id: string; factionId: string | null }[];
  previousFactionId: string | null;
  previousMonths: number;
  playerFactionId: string;
  alreadyFinished?: boolean;
}

export interface V03HegemonResult {
  factionId: string | null;
  months: number;
  monthsLeft: number;
  winnerFactionId: string | null;
  declared: boolean;
  rivalWarning: 'claim-started' | 'three-months-left' | null;
}

/** Advance legacy Luoyang + sixteen cities + twelve consecutive month boundaries. */
export function advanceV03Hegemon(input: V03HegemonInput): V03HegemonResult {
  const capitalOwner =
    input.cityOwners.find((city) => city.id === V03_HEGEMON_CAPITAL_CITY_ID)?.factionId ?? null;
  const heldCities = capitalOwner
    ? input.cityOwners.filter((city) => city.factionId === capitalOwner).length
    : 0;
  const claimant = capitalOwner && heldCities >= V03_HEGEMON_CITIES ? capitalOwner : null;
  const months = claimant
    ? claimant === input.previousFactionId
      ? Math.min(V03_HEGEMON_HOLD_MONTHS, input.previousMonths + 1)
      : 1
    : 0;
  const declared = !!claimant && months >= V03_HEGEMON_HOLD_MONTHS && !input.alreadyFinished;

  return {
    factionId: claimant,
    months,
    monthsLeft: Math.max(0, V03_HEGEMON_HOLD_MONTHS - months),
    winnerFactionId: declared ? claimant : null,
    declared,
    rivalWarning:
      claimant && claimant !== input.playerFactionId && months === 1
        ? 'claim-started'
        : claimant && claimant !== input.playerFactionId && months === 9
          ? 'three-months-left'
          : null,
  };
}

export interface V03MonthlyEventCity {
  id: string;
  factionId: string | null;
  population: number;
  farming: number;
  commerce: number;
  loyalty: number;
  gold: number;
  food: number;
  reserve: number;
  reservePools: ReservePools;
  /** Officer troop total stationed in this city; reserve is stored separately. */
  garrisonTroops: number;
  neighbors: string[];
}

export type V03MonthlyEventOfficerLocation =
  | { kind: 'city'; cityId: string }
  | { kind: 'journey' }
  | { kind: 'battle' }
  | { kind: 'captured' };

export interface V03MonthlyEventOfficer {
  id: string;
  factionId: string | null;
  location: V03MonthlyEventOfficerLocation;
  force: number;
  intellect: number;
  loyalty: number;
  age: number | null;
  equipment?: 'Fine arms' | null;
  troops: number;
  wounded: number;
  reorganizationDays: number;
  alive: boolean;
}

export type V03MonthlyEventKey =
  | 'anti-dong-coalition'
  | 'dong-burns-luoyang'
  | 'plague'
  | 'bumper-harvest'
  | 'locusts'
  | 'bandits'
  | 'wandering-officer'
  | 'come-of-age'
  | 'festival'
  | 'drought'
  | 'scholar'
  | 'alliance-expired';

export interface V03MonthlySystemEvent {
  id: string;
  key: V03MonthlyEventKey;
  monthIndex: number;
  entityIds: string[];
  values: Record<string, number | string>;
}

export interface V03CoalitionInvitation {
  id: string;
  eventId: 'anti-dong-coalition';
  targetFactionId: string;
  memberFactionIds: string[];
  /** Exclusive end month; legacy invitations last three months. */
  expiresMonthIndex: number;
}

export interface V03MonthlyEventsInput {
  /** Index of the month that has just begun at this month boundary. */
  monthIndex: number;
  startYear: number;
  /** Defaults to the previous year for standalone rule callers. */
  lastOfficerGrowthYear?: number;
  playerFactionId: string;
  rng: number;
  firedEventIds: readonly string[];
  alliances: readonly V03TimedAlliance[];
  cities: readonly V03MonthlyEventCity[];
  officers: readonly V03MonthlyEventOfficer[];
  /** City IDs attacked in either of the last two monthly reports. */
  attackedWithinLastTwoMonths?: readonly string[];
  resourceCap?: number;
}

export interface V03MonthlyEventsResult {
  rng: number;
  firedEventIds: string[];
  alliances: V03TimedAlliance[];
  cities: V03MonthlyEventCity[];
  officers: V03MonthlyEventOfficer[];
  events: V03MonthlySystemEvent[];
  invitations: V03CoalitionInvitation[];
}

/** Accept a live invitation by forming six-month treaties with its surviving members. */
export function acceptV03CoalitionInvitation(
  invitation: V03CoalitionInvitation,
  alliances: readonly V03TimedAlliance[],
  playerFactionId: string,
  monthIndex: number,
  activeFactionIds?: readonly string[],
): V03TimedAlliance[] {
  if (invitation.expiresMonthIndex <= monthIndex || invitation.targetFactionId === playerFactionId)
    return alliances.map((alliance) => ({ ...alliance }));
  const next = alliances.map((alliance) => ({ ...alliance }));
  for (const memberId of invitation.memberFactionIds) {
    if (
      memberId === playerFactionId ||
      (activeFactionIds && !activeFactionIds.includes(memberId)) ||
      isV03AllianceActive(next, playerFactionId, memberId, monthIndex)
    )
      continue;
    addAlliance(next, playerFactionId, memberId, monthIndex);
  }
  return next;
}

const boundedInt = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(value)));

function draw(state: { rng: number }, max: number): number {
  let value = state.rng || 190;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng % max;
}

const pairMatches = (alliance: V03TimedAlliance, a: string, b: string) =>
  (alliance.a === a && alliance.b === b) || (alliance.a === b && alliance.b === a);

function makeEvent(
  monthIndex: number,
  key: V03MonthlyEventKey,
  entityIds: string[] = [],
  values: Record<string, number | string> = {},
): V03MonthlySystemEvent {
  return {
    id: `month-${monthIndex}:${key}${entityIds.length ? `:${entityIds.join(':')}` : ''}`,
    key,
    monthIndex,
    entityIds,
    values,
  };
}

function addAlliance(
  alliances: V03TimedAlliance[],
  a: string,
  b: string,
  monthIndex: number,
): void {
  const existing = alliances.find((alliance) => pairMatches(alliance, a, b));
  if (existing) existing.expiresMonthIndex = monthIndex + V03_ALLIANCE_DURATION_MONTHS;
  else alliances.push({ a, b, expiresMonthIndex: monthIndex + V03_ALLIANCE_DURATION_MONTHS });
}

function chooseStable<T extends { id: string }>(
  items: readonly T[],
  state: { rng: number },
): T | undefined {
  const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id));
  return ordered.length ? ordered[draw(state, ordered.length)] : undefined;
}

function applyEvacuation(
  cities: V03MonthlyEventCity[],
  officers: V03MonthlyEventOfficer[],
  monthIndex: number,
  resourceCap: number,
): V03MonthlySystemEvent | null {
  const city = cities.find((entry) => entry.id === 'luoyang');
  const refuge = cities.find((entry) => entry.id === 'changan');
  if (!city || !refuge || city.factionId !== 'dong' || refuge.factionId !== 'dong') return null;

  const evacuated = officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === 'dong' &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const leader = [...evacuated].sort(
    (a, b) => b.intellect + b.force - (a.intellect + a.force) || a.id.localeCompare(b.id),
  )[0] ?? { intellect: 60, force: 60 };
  const lootGold = Math.floor(
    2 * (leader.intellect + leader.force) + Math.floor(city.commerce * 1.5),
  );
  const lootFood = 5 * (leader.intellect + leader.force) + Math.floor(city.farming * 4);
  const evacuatedTroops = evacuated.reduce(
    (sum, officer) => sum + officer.troops + officer.wounded,
    0,
  );
  const readyTroops = evacuated.reduce((sum, officer) => sum + availableTroops(officer), 0);
  const transferredReserve = city.reserve;

  city.loyalty = Math.floor(city.loyalty / 2);
  city.farming = Math.floor(city.farming / 2);
  city.commerce = Math.floor(city.commerce / 2);
  city.population = Math.min(city.population, Math.max(500, Math.floor(city.population * 0.92)));
  for (const type of TROOP_TYPES) {
    const merged = mergeTroopPools(refuge.reservePools[type], city.reservePools[type]);
    merged.troops = Math.min(
      merged.troops,
      resourceCap - (refuge.reserve - refuge.reservePools[type].troops),
    );
    if (!merged.troops) merged.troopExperience = 0;
    setReservePool(refuge, type, merged);
    setReservePool(city, type, { troops: 0, troopExperience: 0 });
  }
  city.garrisonTroops = Math.max(0, city.garrisonTroops - readyTroops);
  refuge.garrisonTroops = Math.min(resourceCap, refuge.garrisonTroops + readyTroops);
  refuge.gold = Math.min(resourceCap, refuge.gold + lootGold);
  refuge.food = Math.min(resourceCap, refuge.food + lootFood);
  for (const officer of evacuated) officer.location = { kind: 'city', cityId: refuge.id };

  return makeEvent(
    monthIndex,
    'dong-burns-luoyang',
    [city.id, refuge.id, ...evacuated.map((o) => o.id)],
    {
      evacuatedOfficerCount: evacuated.length,
      evacuatedTroops,
      transferredReserve,
      lootGold,
      lootFood,
    },
  );
}

/**
 * Resolve retained monthly events in legacy catalog order. This includes the
 * historical coalition and evacuation events and the systemic event table; no
 * siege state is created. All draws use the campaign's saved xorshift stream.
 */
export function resolveV03MonthlyEvents(input: V03MonthlyEventsInput): V03MonthlyEventsResult {
  const monthIndex = input.monthIndex;
  const year = input.startYear + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const cap = input.resourceCap ?? V03_RESOURCE_CAP;
  const state = { rng: input.rng };
  const cities = input.cities.map((city) => ({ ...city, neighbors: [...city.neighbors] }));
  const officers = input.officers.map((officer) => ({
    ...officer,
    location: { ...officer.location },
  }));
  const allianceBoundary = expireV03Alliances(input.alliances, monthIndex);
  const alliances = allianceBoundary.active;
  const firedEventIds = [...input.firedEventIds];
  const events: V03MonthlySystemEvent[] = [];
  const invitations: V03CoalitionInvitation[] = [];
  for (const alliance of allianceBoundary.expired)
    events.push(makeEvent(monthIndex, 'alliance-expired', [alliance.a, alliance.b]));
  const fireOnce = (key: V03MonthlyEventKey) => {
    if (!firedEventIds.includes(key)) firedEventIds.push(key);
  };
  const owned = (city: V03MonthlyEventCity) => city.factionId !== null;
  const chooseCity = (predicate: (city: V03MonthlyEventCity) => boolean) =>
    chooseStable(cities.filter(predicate), state);

  // Historical anti-Dong coalition. The target and player are excluded from
  // the coalition members exactly as in the legacy implementation.
  const activeFactionIds = [
    ...new Set(cities.map((city) => city.factionId).filter((id): id is string => !!id)),
  ].sort((a, b) => a.localeCompare(b));
  const dongHoldsLuoyang = cities.some(
    (city) => city.id === 'luoyang' && city.factionId === 'dong',
  );
  if (
    !firedEventIds.includes('anti-dong-coalition') &&
    year <= 191 &&
    dongHoldsLuoyang &&
    activeFactionIds.filter((id) => id !== 'dong').length >= 3
  ) {
    const members = activeFactionIds.filter((id) => id !== 'dong' && id !== input.playerFactionId);
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++)
        addAlliance(alliances, members[i]!, members[j]!, monthIndex);
    events.push(makeEvent(monthIndex, 'anti-dong-coalition', ['dong', ...members]));
    if (input.playerFactionId !== 'dong' && members.length) {
      invitations.push({
        id: `invitation:anti-dong-coalition:${monthIndex}`,
        eventId: 'anti-dong-coalition',
        targetFactionId: 'dong',
        memberFactionIds: members,
        expiresMonthIndex: monthIndex + 3,
      });
    }
    fireOnce('anti-dong-coalition');
  }

  // Legacy burn-city event adapted to an evacuation: no siege is created. The
  // original threat condition is preserved using recent attacks or adjacent
  // non-allied force strength, then stationed officers and reserve withdraw.
  const luoyang = cities.find((city) => city.id === 'luoyang');
  const changan = cities.find((city) => city.id === 'changan');
  if (
    !firedEventIds.includes('dong-burns-luoyang') &&
    luoyang?.factionId === 'dong' &&
    changan?.factionId === 'dong'
  ) {
    const attacked = input.attackedWithinLastTwoMonths?.includes('luoyang') ?? false;
    const ownStrength = (luoyang.reserve ?? 0) + (luoyang.garrisonTroops ?? 0);
    const strongestNeighbor = Math.max(
      0,
      ...luoyang.neighbors
        .map((id) => cities.find((city) => city.id === id))
        .filter(
          (city): city is V03MonthlyEventCity =>
            !!city &&
            city.factionId !== null &&
            city.factionId !== 'dong' &&
            !isV03AllianceActive(alliances, 'dong', city.factionId, monthIndex),
        )
        .map((city) => city.reserve + city.garrisonTroops),
    );
    if (attacked || strongestNeighbor > 1.8 * ownStrength) {
      const evacuation = applyEvacuation(cities, officers, monthIndex, cap);
      if (evacuation) {
        events.push(evacuation);
        fireOnce('dong-burns-luoyang');
      }
    }
  }

  const systemic = (
    chance: number | null,
    eligible: boolean,
    effect: () => V03MonthlySystemEvent | V03MonthlySystemEvent[] | null,
  ) => {
    if (!eligible) return;
    if (chance !== null && draw(state, 100) >= chance) return;
    const result = effect();
    if (result) events.push(...(Array.isArray(result) ? result : [result]));
  };

  systemic(3, true, () => {
    const city = chooseCity(owned);
    if (!city) return null;
    const dead = Math.floor(city.population * 0.08);
    city.population = boundedInt(city.population - dead, 500, cap);
    city.loyalty = boundedInt(city.loyalty - 3, 0, 100);
    return makeEvent(monthIndex, 'plague', [city.id], { deaths: dead, loyaltyLoss: 3 });
  });
  systemic(12, month === 9 || month === 10, () => {
    const city = chooseCity(owned);
    if (!city) return null;
    const gain = Math.floor(city.farming * 5);
    city.food = Math.min(cap, city.food + gain);
    return makeEvent(monthIndex, 'bumper-harvest', [city.id], { foodGain: gain });
  });
  systemic(6, [6, 7, 8].includes(month), () => {
    const city = chooseCity(owned);
    if (!city) return null;
    const loss = Math.floor(city.food * 0.25);
    city.food -= loss;
    return makeEvent(monthIndex, 'locusts', [city.id], { foodLoss: loss });
  });
  systemic(4, true, () => {
    const city = chooseCity(owned);
    if (!city) return null;
    const stolen = Math.floor(city.gold * 0.12);
    const reserveBefore = city.reserve;
    city.gold -= stolen;
    for (const type of TROOP_TYPES) {
      const pool = city.reservePools[type];
      const troops = Math.floor(pool.troops * 0.94);
      setReservePool(city, type, { troops, troopExperience: troops ? pool.troopExperience : 0 });
    }
    city.loyalty = boundedInt(city.loyalty - 2, 0, 100);
    return makeEvent(monthIndex, 'bandits', [city.id], {
      goldLost: stolen,
      reserveLost: reserveBefore - city.reserve,
      loyaltyLoss: 2,
    });
  });
  systemic(5, true, () => {
    const freeOfficer = chooseStable(
      officers.filter(
        (officer) =>
          officer.alive && officer.factionId === null && officer.location.kind === 'city',
      ),
      state,
    );
    if (!freeOfficer || freeOfficer.location.kind !== 'city') return null;
    const fromCityId = freeOfficer.location.cityId;
    const destination = chooseCity((city) => city.id !== fromCityId);
    if (!destination) return null;
    freeOfficer.location = { kind: 'city', cityId: destination.id };
    return makeEvent(monthIndex, 'wandering-officer', [freeOfficer.id, destination.id]);
  });
  systemic(null, month === 1 && year > (input.lastOfficerGrowthYear ?? year - 1), () => {
    for (const officer of officers) {
      if (officer.alive && officer.age !== null) officer.age++;
    }
    const matured = officers
      .filter((officer) => officer.alive && officer.age === 18)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const officer of matured) {
      // Add to current values; training/levels and persistent equipment are never replaced.
      const previousForce = officer.force;
      const previousIntellect = officer.intellect;
      officer.force = Math.max(
        officer.force,
        Math.min(
          officer.equipment === 'Fine arms' ? 105 : 100,
          officer.force + OFFICER_MATURITY_GAIN.force,
        ),
      );
      officer.intellect = Math.max(
        officer.intellect,
        Math.min(100, officer.intellect + OFFICER_MATURITY_GAIN.intellect),
      );
      events.push(
        makeEvent(monthIndex, 'come-of-age', [officer.id], {
          forceGain: officer.force - previousForce,
          intellectGain: officer.intellect - previousIntellect,
        }),
      );
    }
    return null;
  });
  systemic(8, month === 1 || month === 2, () => {
    const city = chooseCity((entry) => owned(entry) && entry.gold >= 150);
    if (!city) return null;
    city.gold -= 150;
    city.loyalty = boundedInt(city.loyalty + 6, 0, 100);
    return makeEvent(monthIndex, 'festival', [city.id], { goldCost: 150, loyaltyGain: 6 });
  });
  systemic(4, [6, 7, 8].includes(month), () => {
    // v0.3 farming is normally 0–100, so retain the legacy -15 effect on any
    // developed field instead of the old >100 guard that could never trigger.
    const city = chooseCity((entry) => owned(entry) && entry.farming > 0);
    if (!city) return null;
    const loss = Math.min(15, city.farming);
    city.farming -= loss;
    return makeEvent(monthIndex, 'drought', [city.id], { farmingLoss: loss });
  });
  systemic(3, true, () => {
    const officer = chooseStable(
      officers.filter((entry) => entry.alive && entry.factionId !== null && entry.intellect < 100),
      state,
    );
    if (!officer) return null;
    officer.intellect += 1;
    return makeEvent(monthIndex, 'scholar', [officer.id], { intellectGain: 1 });
  });

  return {
    rng: state.rng >>> 0,
    firedEventIds,
    alliances,
    cities,
    officers,
    events,
    invitations,
  };
}
