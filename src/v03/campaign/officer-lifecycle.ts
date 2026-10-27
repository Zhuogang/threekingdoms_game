import { OFFICER_CATALOG_BY_ID } from '../content/officer-catalog';
import {
  createOfficerRosterSetup,
  OFFICER_ROSTER_VERSION,
  scheduledOfficerDebuts,
  type OfficerOpening,
  type OfficerRosterScenarioId,
} from '../content/officer-roster-setups';
import { officerAgeAtYear, officerBaseStatsAtYear } from '../content/officer-timeline';
import type { V03GameState, V03Officer } from '../types';

const PLANS = new Map(
  (['divided-realm-190', 'guandu-200'] as const).map((id) => [
    id,
    {
      opening: createOfficerRosterSetup(id),
      schedule: scheduledOfficerDebuts(id),
    },
  ]),
);

export function officerRosterPlan(scenarioId: string) {
  return PLANS.get(scenarioId as OfficerRosterScenarioId);
}

export function createOpeningOfficer(opening: OfficerOpening): V03Officer {
  const definition = OFFICER_CATALOG_BY_ID.get(opening.id);
  if (!definition || opening.status === 'pending')
    throw new Error('Cannot initialize an unavailable officer.');
  return {
    id: opening.id,
    name: definition.name,
    chinese: definition.chinese,
    factionId: opening.factionId,
    location: { kind: 'city', cityId: opening.cityId },
    force: opening.force,
    intellect: opening.intellect,
    loyalty: opening.loyalty,
    age: opening.age,
    troops: opening.troops,
    wounded: 0,
    reorganizationDays: 0,
    troopType: opening.troopType,
    troopExperience: 0,
    equipment: null,
    experience: 0,
    level: 0,
    governorOfCityId: null,
    alive: opening.status !== 'deceased',
  };
}

/** Expected identities include every death record; missing records are corruption, not new arrivals. */
export function expectedOfficerRosterIds(
  scenarioId: string,
  throughYear: number,
): Set<string> | null {
  const plan = officerRosterPlan(scenarioId);
  if (!plan) return null;
  return new Set([
    ...plan.opening.officers
      .filter((officer) => officer.status !== 'pending')
      .map((officer) => officer.id),
    ...plan.schedule.filter((entry) => entry.year <= throughYear).map((entry) => entry.id),
  ]);
}

/** Pure year-boundary plan. Never consults historical deaths after the campaign opening. */
export function planOfficerDebuts(
  state: Pick<
    V03GameState,
    | 'scenarioId'
    | 'startYear'
    | 'officerRosterVersion'
    | 'lastOfficerDebutYear'
    | 'monthIndex'
    | 'officers'
    | 'cities'
  >,
) {
  const plan = officerRosterPlan(state.scenarioId);
  const year = state.startYear + Math.floor(state.monthIndex / 12);
  if (
    !plan ||
    state.officerRosterVersion !== OFFICER_ROSTER_VERSION ||
    state.startYear !== plan.opening.year ||
    state.lastOfficerDebutYear < state.startYear ||
    state.lastOfficerDebutYear > year
  )
    throw new Error('Invalid officer roster chronology.');
  if (year === state.lastOfficerDebutYear)
    return {
      officers: [] as V03Officer[],
      notices: [] as { year: number; officerIds: string[] }[],
      throughYear: year,
    };
  const existing = new Set(state.officers.map((officer) => officer.id));
  const cityIds = new Set(state.cities.map((city) => city.id));
  const officers: V03Officer[] = [];
  const notices: { year: number; officerIds: string[] }[] = [];
  for (
    let appearanceYear = state.lastOfficerDebutYear + 1;
    appearanceYear <= year;
    appearanceYear++
  ) {
    const arrived: string[] = [];
    for (const entry of plan.schedule
      .filter((candidate) => candidate.year === appearanceYear)
      .sort((a, b) => a.id.localeCompare(b.id))) {
      if (existing.has(entry.id)) continue;
      if (!cityIds.has(entry.cityId))
        throw new Error('Missing officer appearance city: ' + entry.cityId);
      const definition = OFFICER_CATALOG_BY_ID.get(entry.id)!;
      const base = officerBaseStatsAtYear(
        { force: definition.adultForce, intellect: definition.adultIntellect },
        definition.timeline.birthYear,
        year,
      );
      officers.push({
        id: definition.id,
        name: definition.name,
        chinese: definition.chinese,
        factionId: null,
        location: { kind: 'city', cityId: entry.cityId },
        ...base,
        age: officerAgeAtYear(definition.timeline.birthYear, year),
        loyalty: 88,
        troopType: definition.troopType,
        troops: 0,
        wounded: 0,
        reorganizationDays: 0,
        troopExperience: 0,
        equipment: null,
        experience: 0,
        level: 0,
        governorOfCityId: null,
        alive: true,
      });
      existing.add(entry.id);
      arrived.push(entry.id);
    }
    if (arrived.length) notices.push({ year: appearanceYear, officerIds: arrived });
  }
  return { officers, notices, throughYear: year };
}

/** Validates presence, immutable identity and the growth/debut checkpoint together. */
export function validateOfficerRosterState(state: V03GameState): boolean {
  const plan = officerRosterPlan(state.scenarioId);
  if (
    !plan ||
    state.startYear !== plan.opening.year ||
    state.officerRosterVersion !== OFFICER_ROSTER_VERSION
  )
    return false;
  const year = state.startYear + Math.floor(state.monthIndex / 12);
  const waitingAtYearBoundary =
    state.absoluteDay % 360 === 0 &&
    state.absoluteDay > 0 &&
    state.dayResolution?.phase === 'month-settlement';
  if (
    state.lastOfficerDebutYear !== year &&
    !(waitingAtYearBoundary && state.lastOfficerDebutYear === year - 1)
  )
    return false;
  if (state.lastOfficerDebutYear < state.startYear) return false;
  const expected = expectedOfficerRosterIds(state.scenarioId, state.lastOfficerDebutYear)!;
  if (
    state.officers.length !== expected.size ||
    new Set(state.officers.map((officer) => officer.id)).size !== expected.size
  )
    return false;
  for (const officer of state.officers) {
    const definition = OFFICER_CATALOG_BY_ID.get(officer.id);
    if (
      !definition ||
      !expected.has(officer.id) ||
      officer.name !== definition.name ||
      officer.chinese !== definition.chinese ||
      officer.troopType !== definition.troopType ||
      (!officer.alive && officer.troops + officer.wounded !== 0)
    )
      return false;
    const opening = plan.opening.officers.find((entry) => entry.id === officer.id)!;
    const currentAge = officerAgeAtYear(definition.timeline.birthYear, state.lastOfficerDebutYear);
    if (opening.status === 'deceased') {
      if (officer.alive || officer.age !== opening.age) return false;
    } else if (officer.alive) {
      if (officer.age !== currentAge) return false;
    } else {
      const earliestAge = officerAgeAtYear(
        definition.timeline.birthYear,
        Math.max(state.startYear, definition.timeline.debutYear),
      );
      if (
        currentAge === null
          ? officer.age !== null
          : officer.age === null || officer.age < (earliestAge ?? 16) || officer.age > currentAge
      )
        return false;
    }
  }
  return true;
}
