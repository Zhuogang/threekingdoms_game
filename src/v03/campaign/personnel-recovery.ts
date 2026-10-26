import type { V03GameState, V03Officer, V03TroopSource } from '../types';
import { allocatePersonnel } from './battle-aftermath';
import {
  PERSONNEL_RULES,
  custodyHolder,
  reinforcementCapacity,
  rejoinTroopSource,
} from './personnel';

/** One day, one city/type rounding, original ownership and no battle healing. */
export function recoverPersonnelDay(state: V03GameState): void {
  const day = state.personnelDay;
  if (day.completed || day.absoluteDay !== state.absoluteDay) return;
  const cities = new Map(state.cities.map((city) => [city.id, city]));
  const officers = new Map(state.officers.map((officer) => [officer.id, officer]));
  const sources = new Map(state.troopSources.map((source) => [source.id, source]));
  const groups = new Map<
    string,
    Array<{ pool: V03Officer | V03TroopSource; wounded: number; officer: V03Officer | null }>
  >();
  for (const entry of day.entries) {
    const city = cities.get(entry.cityId);
    if (!entry.foodAvailable || !city || city.food <= 0 || city.factionId !== entry.holderFactionId)
      continue;
    const officer = entry.recordId.startsWith('officer:')
      ? officers.get(entry.recordId.slice(8))
      : null;
    const source = entry.recordId.startsWith('source:')
      ? sources.get(entry.recordId.slice(7))
      : null;
    const pool = officer ?? source;
    if (!pool || pool.factionId !== entry.factionId || pool.troopType !== entry.troopType) continue;
    if (officer) {
      if (
        !officer.alive ||
        !(
          (officer.location.kind === 'city' &&
            officer.location.cityId === city.id &&
            officer.factionId === city.factionId) ||
          (officer.location.kind === 'captured' &&
            officer.location.cityId === city.id &&
            custodyHolder(state, officer) === city.factionId)
        )
      )
        continue;
    } else if (source?.cityId !== city.id || source.factionId !== city.factionId) continue;
    if (
      (!officer || officer.location.kind === 'city') &&
      entry.reorganizationDays > 0 &&
      pool.reorganizationDays === entry.reorganizationDays
    ) {
      pool.reorganizationDays--;
      if (pool.reorganizationDays === 0 && officer?.location.kind === 'city')
        city.garrisonTroops += pool.troops;
    }
    const wounded = Math.min(pool.wounded, entry.wounded);
    if (wounded === 0) continue;
    const key = `${city.id}:${entry.troopType}`;
    const group = groups.get(key) ?? [];
    group.push({ pool, wounded, officer: officer ?? null });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const total = group.reduce((sum, item) => sum + item.wounded, 0);
    const amounts = allocatePersonnel(
      Math.ceil((total * PERSONNEL_RULES.recoveryPercent) / 100),
      group.map((item) => item.wounded),
    );
    group.forEach((item, index) => {
      const healed = amounts[index]!;
      item.pool.wounded -= healed;
      item.pool.troops += healed;
      if (item.officer?.location.kind === 'city' && item.pool.reorganizationDays === 0) {
        const cityId = item.officer.location.cityId;
        state.cities.find((city) => city.id === cityId)!.garrisonTroops += healed;
      }
    });
  }
  day.completed = true;
  for (const source of [...state.troopSources].sort((a, b) => a.id.localeCompare(b.id))) {
    if (
      !source.autoReturn ||
      !source.sourceOfficerId ||
      source.reorganizationDays > 0 ||
      source.troops === 0
    )
      continue;
    const officer = state.officers.find((entry) => entry.id === source.sourceOfficerId);
    if (!officer || reinforcementCapacity(officer) === 0) continue;
    try {
      rejoinTroopSource(
        state,
        source.id,
        officer.id,
        Math.min(source.troops, reinforcementCapacity(officer)),
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'Personnel cannot join this officer at this time.'
      )
        throw error;
    }
  }
}
