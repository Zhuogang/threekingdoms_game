import type {
  TroopType,
  V03GameState,
  V03Officer,
  V03PersonnelDay,
  V03TroopSource,
} from '../types';
import {
  MAX_TROOP_EXPERIENCE,
  splitTroopPool,
  setReservePool,
  TROOP_TYPES,
} from './troop-experience';
import { isCityCommitted } from '../governance/commitments';

export const PERSONNEL_RULES = Object.freeze({
  capacity: 10_000,
  woundedPercent: 60,
  orderlyCapturePercent: 5,
  forcedCapturePercent: 25,
  recoveryPercent: 10,
  reorganizationDays: 10,
  aiRetreatOpeningPercent: 30,
  aiRetreatEnemyPercent: 50,
});

export interface PersonnelPool {
  troops: number;
  wounded: number;
  troopExperience: number;
  reorganizationDays: number;
}

function count(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Personnel counts must be nonnegative safe integers.');
}

export function personnelCount(pool: Pick<PersonnelPool, 'troops' | 'wounded'>): number {
  count(pool.troops);
  count(pool.wounded);
  const total = pool.troops + pool.wounded;
  count(total);
  return total;
}

function check(pool: PersonnelPool): void {
  const total = personnelCount(pool);
  count(pool.reorganizationDays);
  if (pool.reorganizationDays > PERSONNEL_RULES.reorganizationDays)
    throw new RangeError('Invalid reorganization duration.');
  if (
    !Number.isFinite(pool.troopExperience) ||
    pool.troopExperience < 0 ||
    pool.troopExperience > MAX_TROOP_EXPERIENCE ||
    (total === 0 && (pool.troopExperience !== 0 || pool.reorganizationDays !== 0))
  )
    throw new RangeError('Invalid personnel experience or empty reorganization record.');
}

export function availableTroops(
  pool: Pick<PersonnelPool, 'troops' | 'reorganizationDays'>,
): number {
  return pool.reorganizationDays === 0 ? pool.troops : 0;
}

export function reinforcementCapacity(pool: Pick<PersonnelPool, 'troops' | 'wounded'>): number {
  return Math.max(0, PERSONNEL_RULES.capacity - personnelCount(pool));
}

/** Uniform experience, but healthy and wounded are always split explicitly. */
export function splitPersonnel(pool: PersonnelPool, troops: number, wounded = 0) {
  check(pool);
  count(troops);
  count(wounded);
  if (troops > pool.troops || wounded > pool.wounded)
    throw new RangeError('Cannot split more personnel than the record contains.');
  const part = (healthy: number, injured: number): PersonnelPool => ({
    troops: healthy,
    wounded: injured,
    troopExperience: healthy + injured > 0 ? pool.troopExperience : 0,
    reorganizationDays: healthy + injured > 0 ? pool.reorganizationDays : 0,
  });
  return {
    remaining: part(pool.troops - troops, pool.wounded - wounded),
    taken: part(troops, wounded),
  };
}

/** Real merges only; unavailable cohorts must not unlock or freeze another cohort. */
export function mergePersonnel(...pools: readonly PersonnelPool[]): PersonnelPool {
  pools.forEach(check);
  const occupied = pools.filter((pool) => personnelCount(pool) > 0);
  const reorganizationDays = occupied[0]?.reorganizationDays ?? 0;
  if (occupied.some((pool) => pool.reorganizationDays !== reorganizationDays))
    throw new RangeError('Personnel with different reorganization restrictions cannot merge.');
  const troops = occupied.reduce((sum, pool) => sum + pool.troops, 0);
  const wounded = occupied.reduce((sum, pool) => sum + pool.wounded, 0);
  const total = personnelCount({ troops, wounded });
  return {
    troops,
    wounded,
    troopExperience:
      total === 0
        ? 0
        : Math.min(
            MAX_TROOP_EXPERIENCE,
            occupied.reduce((sum, pool) => sum + personnelCount(pool) * pool.troopExperience, 0) /
              total,
          ),
    reorganizationDays,
  };
}

/** Permanent noncombat losses; never turn hunger/desertion into new wounded. */
export function retainPersonnel(pool: PersonnelPool, troops: number, wounded: number): void {
  const { taken } = splitPersonnel(pool, troops, wounded);
  Object.assign(pool, taken);
}

export function foodHeadcount(pool: Pick<PersonnelPool, 'troops' | 'wounded'>, type: TroopType) {
  return personnelCount(pool) * (type === 'cavalry' ? 2 : 1);
}

export function availableReserveSources(
  state: Pick<V03GameState, 'troopSources' | 'cities'>,
  cityId: string,
  type: TroopType,
  sourceOfficerId?: string,
): V03TroopSource[] {
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city) return [];
  return state.troopSources
    .filter(
      (source) =>
        source.cityId === cityId &&
        source.factionId === city.factionId &&
        source.troopType === type &&
        availableTroops(source) > 0,
    )
    .sort(
      (a, b) =>
        Number(b.sourceOfficerId === sourceOfficerId) -
          Number(a.sourceOfficerId === sourceOfficerId) || a.id.localeCompare(b.id),
    );
}

export function availableReserveTroops(
  state: Pick<V03GameState, 'troopSources' | 'cities'>,
  cityId: string,
  type: TroopType,
): number {
  const city = state.cities.find((entry) => entry.id === cityId);
  return (
    (city?.reservePools[type].troops ?? 0) +
    availableReserveSources(state, cityId, type).reduce((sum, source) => sum + source.troops, 0)
  );
}

export function custodyHolder(
  state: Pick<V03GameState, 'cities' | 'journeys'>,
  officer: Pick<V03Officer, 'location' | 'alive'>,
): string | null {
  const location = officer.location;
  if (!officer.alive || location.kind !== 'captured') return null;
  return location.journeyId
    ? (state.journeys.find((journey) => journey.id === location.journeyId)?.ownerFactionId ?? null)
    : (state.cities.find((city) => city.id === location.cityId)?.factionId ?? null);
}

/** Move daybreak eligibility with the people, rather than creating a new day's credit. */
export function transferDayRecord(
  state: V03GameState,
  fromId: string,
  toId: string,
  troops: number,
  wounded: number,
): void {
  const day = state.personnelDay;
  const from = day.entries.find((entry) => entry.recordId === fromId);
  if (from && !day.completed) {
    const healthy = Math.min(troops, from.troops);
    const injured = Math.min(wounded, from.wounded);
    const to = day.entries.find((entry) => entry.recordId === toId);
    if (
      to &&
      (to.cityId !== from.cityId ||
        to.factionId !== from.factionId ||
        to.troopType !== from.troopType ||
        to.reorganizationDays !== from.reorganizationDays)
    )
      throw new Error('Cannot merge incompatible daybreak personnel eligibility.');
    if (to) {
      to.troops += healthy;
      to.wounded += injured;
      to.foodAvailable &&= from.foodAvailable;
    } else day.entries.push({ ...from, recordId: toId, troops: healthy, wounded: injured });
    from.troops -= healthy;
    from.wounded -= injured;
    if (from.troops + from.wounded === 0)
      day.entries = day.entries.filter((entry) => entry.recordId !== fromId);
  }
  transferRationRecord(state, fromId, toId, troops, wounded);
}

/** Paid food follows actual transfers, including healthy-only ordinary reserves. */
export function transferRationRecord(
  state: V03GameState,
  fromId: string,
  toId: string,
  troops: number,
  wounded: number,
): void {
  count(troops);
  count(wounded);
  if (fromId === toId) return;
  const day = state.personnelDay;
  const paid = day.rations.find((entry) => entry.recordId === fromId);
  if (paid) {
    const healthy = Math.min(troops, paid.troops);
    const injured = Math.min(wounded, paid.wounded);
    const to = day.rations.find((entry) => entry.recordId === toId);
    if (to) {
      to.troops += healthy;
      to.wounded += injured;
    } else day.rations.push({ recordId: toId, troops: healthy, wounded: injured });
    paid.troops -= healthy;
    paid.wounded -= injured;
    if (paid.troops + paid.wounded === 0)
      day.rations = day.rations.filter((entry) => entry.recordId !== fromId);
  }
}

/** Actual reinforcement uses ready original veterans before the ordinary reserve. */
export function reinforceFromCity(state: V03GameState, officerId: string, troops: number): void {
  const officer = state.officers.find((entry) => entry.id === officerId);
  count(troops);
  if (
    !officer?.alive ||
    officer.location.kind !== 'city' ||
    officer.reorganizationDays > 0 ||
    troops > reinforcementCapacity(officer)
  )
    throw new Error('Personnel cannot join this officer at this time.');
  const cityId = officer.location.cityId;
  const city = state.cities.find((entry) => entry.id === cityId);
  if (
    !city ||
    city.factionId !== officer.factionId ||
    troops > availableReserveTroops(state, cityId, officer.troopType)
  )
    throw new Error('There are not enough soldiers of this troop type in the city reserve.');
  let remaining = troops;
  for (const source of availableReserveSources(state, cityId, officer.troopType, officer.id)) {
    const take = Math.min(remaining, source.troops);
    if (take === 0) break;
    const split = splitPersonnel(source, take);
    const combined = mergePersonnel(officer, split.taken);
    transferDayRecord(state, `source:${source.id}`, `officer:${officer.id}`, take, 0);
    Object.assign(officer, combined);
    Object.assign(source, split.remaining);
    remaining -= take;
    if (personnelCount(source) === 0) {
      state.troopSources = state.troopSources.filter((entry) => entry.id !== source.id);
      state.personnelDay.entries = state.personnelDay.entries.filter(
        (entry) => entry.recordId !== `source:${source.id}`,
      );
      state.personnelDay.rations = state.personnelDay.rations.filter(
        (entry) => entry.recordId !== `source:${source.id}`,
      );
    }
  }
  const split = splitTroopPool(city.reservePools[officer.troopType], remaining);
  transferRationRecord(
    state,
    `reserve:${cityId}:${officer.troopType}`,
    `officer:${officer.id}`,
    remaining,
    0,
  );
  Object.assign(
    officer,
    mergePersonnel(officer, { ...split.taken, wounded: 0, reorganizationDays: 0 }),
  );
  setReservePool(city, officer.troopType, split.remaining);
  city.garrisonTroops += troops;
}

/** Internal transfer: callers execute this on the command's cloned state. */
export function detachWoundedToCity(state: V03GameState, officerId: string): V03TroopSource | null {
  const officer = state.officers.find((entry) => entry.id === officerId);
  if (!officer?.alive || officer.location.kind !== 'city')
    throw new Error('Wounded can only be left in their own city.');
  const city = state.cities.find(
    (entry) => officer.location.kind === 'city' && entry.id === officer.location.cityId,
  );
  if (!city || city.factionId !== officer.factionId)
    throw new Error('Wounded can only be left in their own city.');
  const { remaining, taken } = splitPersonnel(officer, 0, officer.wounded);
  if (taken.wounded === 0) return null;
  const id = `troop-source-${state.nextId}`;
  if (state.troopSources.some((entry) => entry.id === id))
    throw new Error('Personnel record ID is already in use.');
  const source: V03TroopSource = {
    ...taken,
    id,
    cityId: city.id,
    factionId: officer.factionId,
    sourceOfficerId: officer.id,
    autoReturn: true,
    troopType: officer.troopType,
  };
  transferDayRecord(state, `officer:${officer.id}`, `source:${id}`, 0, taken.wounded);
  Object.assign(officer, remaining);
  state.troopSources.push(source);
  state.nextId++;
  return source;
}

/** Actual same-city merge, not a display aggregation. No work/authority is granted here. */
export function rejoinTroopSource(
  state: V03GameState,
  sourceId: string,
  officerId: string,
  troops: number,
): void {
  const source = state.troopSources.find((entry) => entry.id === sourceId);
  const officer = state.officers.find((entry) => entry.id === officerId);
  count(troops);
  if (
    !source ||
    !officer?.alive ||
    officer.location.kind !== 'city' ||
    officer.location.cityId !== source.cityId ||
    officer.factionId !== source.factionId ||
    officer.troopType !== source.troopType ||
    source.reorganizationDays > 0 ||
    officer.reorganizationDays > 0 ||
    troops > reinforcementCapacity(officer) ||
    isCityCommitted(state, source.cityId) ||
    [...state.requisitions, ...state.directives].some(
      (order) =>
        order.sourceCityId === source.cityId &&
        order.journeyId === null &&
        ['accepted', 'reserved', 'dispatched'].includes(order.status),
    )
  )
    throw new Error('Personnel cannot join this officer at this time.');
  const city = state.cities.find((entry) => entry.id === source.cityId);
  if (!city || city.factionId !== source.factionId)
    throw new Error('Personnel cannot join this officer at this time.');
  const { remaining, taken } = splitPersonnel(source, troops);
  const combined = mergePersonnel(officer, taken);
  transferDayRecord(state, `source:${source.id}`, `officer:${officer.id}`, troops, 0);
  Object.assign(officer, combined);
  Object.assign(source, remaining);
  city.garrisonTroops += troops;
  if (personnelCount(source) === 0) {
    state.troopSources = state.troopSources.filter((entry) => entry.id !== source.id);
    state.personnelDay.entries = state.personnelDay.entries.filter(
      (entry) => entry.recordId !== `source:${source.id}`,
    );
    state.personnelDay.rations = state.personnelDay.rations.filter(
      (entry) => entry.recordId !== `source:${source.id}`,
    );
  }
}

/** City summaries are derived, never independently writable pools. */
export function cityPersonnelSummary(state: V03GameState, cityId: string) {
  const city = state.cities.find((entry) => entry.id === cityId);
  const summary = { troops: 0, wounded: 0, available: 0, prisoners: 0, foodHeadcount: 0 };
  if (!city) return summary;
  const stationed = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.factionId === city.factionId &&
      officer.location.kind === 'city' &&
      officer.location.cityId === cityId,
  );
  // garrisonTroops already includes officer-led healthy troops.
  const militia = Math.max(
    0,
    city.garrisonTroops - stationed.reduce((sum, o) => sum + availableTroops(o), 0),
  );
  summary.troops = militia;
  summary.available = militia;
  summary.foodHeadcount = militia;
  const add = (pool: PersonnelPool, type: TroopType) => {
    summary.troops += pool.troops;
    summary.wounded += pool.wounded;
    summary.available += availableTroops(pool);
    summary.foodHeadcount += foodHeadcount(pool, type);
  };
  for (const officer of stationed) add(officer, officer.troopType);
  for (const [type, pool] of Object.entries(city.reservePools)) {
    summary.troops += pool.troops;
    summary.foodHeadcount += pool.troops * (type === 'cavalry' ? 2 : 1);
  }
  for (const source of state.troopSources.filter((entry) => entry.cityId === cityId)) {
    summary.troops += source.troops;
    summary.wounded += source.wounded;
    summary.foodHeadcount += foodHeadcount(source, source.troopType);
  }
  for (const officer of state.officers) {
    if (
      officer.alive &&
      officer.location.kind === 'captured' &&
      officer.location.cityId === cityId &&
      !officer.location.journeyId
    ) {
      summary.prisoners += personnelCount(officer);
      summary.foodHeadcount += foodHeadcount(officer, officer.troopType);
    }
  }
  return summary;
}

/** Count paid people once across every physical city record, with prisoners separate. */
export function cityRationCredits(state: V03GameState, cityId: string) {
  const result = { ownPeople: 0, ownCavalry: 0, captivePeople: 0, captiveCavalry: 0 };
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city) return result;
  const paid = new Map(state.personnelDay.rations.map((entry) => [entry.recordId, entry]));
  const add = (
    recordId: string,
    pool: Pick<PersonnelPool, 'troops' | 'wounded'>,
    type: TroopType,
    captive = false,
  ) => {
    const record = paid.get(recordId);
    if (!record) return;
    const people = Math.min(record.troops, pool.troops) + Math.min(record.wounded, pool.wounded);
    if (captive) {
      result.captivePeople += people;
      if (type === 'cavalry') result.captiveCavalry += people;
    } else {
      result.ownPeople += people;
      if (type === 'cavalry') result.ownCavalry += people;
    }
  };
  for (const officer of state.officers) {
    if (!officer.alive) continue;
    if (
      officer.location.kind === 'city' &&
      officer.location.cityId === cityId &&
      officer.factionId === city.factionId
    )
      add(`officer:${officer.id}`, officer, officer.troopType);
    if (officer.location.kind === 'captured' && officer.location.cityId === cityId)
      add(`officer:${officer.id}`, officer, officer.troopType, true);
  }
  for (const source of state.troopSources.filter(
    (entry) => entry.cityId === cityId && entry.factionId === city.factionId,
  ))
    add(`source:${source.id}`, source, source.troopType);
  for (const type of TROOP_TYPES)
    add(`reserve:${cityId}:${type}`, { ...city.reservePools[type], wounded: 0 }, type);
  const stationed = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.factionId === city.factionId &&
      officer.location.kind === 'city' &&
      officer.location.cityId === cityId,
  );
  const militia = Math.max(
    0,
    city.garrisonTroops - stationed.reduce((sum, officer) => sum + availableTroops(officer), 0),
  );
  add(`militia:${cityId}`, { troops: militia, wounded: 0 }, 'infantry');
  return result;
}

/** Capture once before commands/arrivals can change this day's residency. */
export function createPersonnelDay(state: V03GameState): V03PersonnelDay {
  const entries: V03PersonnelDay['entries'] = [];
  for (const officer of state.officers) {
    if (!officer.alive) continue;
    const location = officer.location;
    const cityId =
      location.kind === 'city' || location.kind === 'captured' ? location.cityId : null;
    if (!cityId || (location.kind === 'captured' && location.journeyId)) continue;
    const city = state.cities.find((entry) => entry.id === cityId);
    if (!city || (location.kind === 'city' && officer.factionId !== city.factionId)) continue;
    entries.push({
      recordId: `officer:${officer.id}`,
      cityId,
      factionId: officer.factionId,
      holderFactionId: city.factionId,
      troopType: officer.troopType,
      troops: officer.troops,
      wounded: officer.wounded,
      reorganizationDays: officer.reorganizationDays,
      foodAvailable: city.food > 0,
    });
  }
  for (const source of state.troopSources) {
    const city = state.cities.find((entry) => entry.id === source.cityId);
    if (!city || city.factionId !== source.factionId) continue;
    entries.push({
      recordId: `source:${source.id}`,
      cityId: source.cityId,
      factionId: source.factionId,
      holderFactionId: city.factionId,
      troopType: source.troopType,
      troops: source.troops,
      wounded: source.wounded,
      reorganizationDays: source.reorganizationDays,
      foodAvailable: city.food > 0,
    });
  }
  entries.sort((a, b) => a.recordId.localeCompare(b.recordId));
  return { absoluteDay: state.absoluteDay, completed: false, entries, rations: [] };
}

/** Captives are owned by their custody record, but share the escort's food summary. */
export function refreshJourneyPersonnel(state: V03GameState): void {
  for (const journey of state.journeys) {
    if (!['outbound', 'returning', 'waiting'].includes(journey.status)) continue;
    const captives = state.officers.filter(
      (officer) =>
        officer.alive &&
        officer.location.kind === 'captured' &&
        officer.location.journeyId === journey.id,
    );
    const free = journey.manifest.officerIds.flatMap((id) => {
      const officer = state.officers.find((entry) => entry.id === id);
      return officer?.alive ? [officer] : [];
    });
    if (captives.length === 0 && !journey.manifest.composition.woundedTroops) continue;
    const own = free.length
      ? free.reduce((sum, officer) => sum + personnelCount(officer), 0)
      : Math.max(0, journey.manifest.cargo.troops ?? 0);
    const people = [...free, ...captives];
    journey.manifest = {
      ...journey.manifest,
      troopCount: own + captives.reduce((sum, officer) => sum + personnelCount(officer), 0),
      composition: {
        ...journey.manifest.composition,
        cavalryTroops: people
          .filter((officer) => officer.troopType === 'cavalry')
          .reduce((sum, officer) => sum + personnelCount(officer), 0),
        woundedTroops: people.reduce((sum, officer) => sum + officer.wounded, 0),
      },
    };
  }
}

/** A faction collapse or scripted city transfer cannot leave a foreign ghost reserve. */
export function disbandOrphanedSources(state: V03GameState): void {
  const removed = new Set<string>();
  for (const source of state.troopSources) {
    const city = state.cities.find((entry) => entry.id === source.cityId);
    if (!city || city.factionId === source.factionId) continue;
    const count = personnelCount(source),
      added = Math.min(count, 9_999_999 - city.population);
    city.population += added;
    state.log.push(
      `${city.name}: ${count} rear personnel disbanded after ownership changed; population outflow ${count - added}.`,
    );
    removed.add(`source:${source.id}`);
  }
  state.troopSources = state.troopSources.filter((source) => !removed.has(`source:${source.id}`));
  state.personnelDay.entries = state.personnelDay.entries.filter(
    (entry) => !removed.has(entry.recordId),
  );
  state.personnelDay.rations = state.personnelDay.rations.filter(
    (entry) => !removed.has(entry.recordId),
  );
}
