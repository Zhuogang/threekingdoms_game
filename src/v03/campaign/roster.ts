import { mergeTroopPools } from './troop-experience';
import { hasTrait } from '../content/traits';
import type { BattleRosterEntry } from '../battle/types';
import type { TroopType, V03GameState, V03Officer } from '../types';

interface FormationGroup {
  type: TroopType;
  officers: V03Officer[];
  troops: number;
  militia?: boolean;
  troopExperience?: number;
}

export function groupOfficers(officers: readonly V03Officer[], limit = 10): FormationGroup[] {
  const groups: FormationGroup[] = [];
  const sorted = officers
    .filter((entry) => entry.troops > 0)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const representatives = [...new Set(sorted.map((officer) => officer.troopType))].map((type) =>
    sorted.find((officer) => officer.troopType === type)!,
  );
  for (const officer of [
    ...representatives,
    ...sorted.filter((officer) => !representatives.includes(officer)),
  ]) {
    if (groups.length < limit)
      groups.push({ type: officer.troopType, officers: [officer], troops: officer.troops });
    else {
      const weakest = groups
        .filter((group) => group.type === officer.troopType)
        .sort((a, b) => a.troops - b.troops)[0];
      if (!weakest) throw new Error('Battle roster overflow has no matching troop type.');
      weakest.officers.push(officer);
      weakest.troops += officer.troops;
    }
  }
  return groups;
}

export function rosterFromGroups(
  groups: readonly FormationGroup[],
  prefix: string,
): {
  roster: BattleRosterEntry[];
  membership: Record<string, string[]>;
} {
  const membership: Record<string, string[]> = {};
  const roster = groups.map((group) => {
    const id = `${prefix}:${group.type}:${group.militia ? 'militia' : group.officers[0]!.id}`;
    membership[id] = group.officers.map((officer) => officer.id);
    const leaders = group.officers.map((officer) => officer.name).join(', ');
    const name =
      group.type === 'infantry'
        ? group.militia
          ? 'Militia'
          : 'Infantry'
        : group.type === 'cavalry'
          ? 'Cavalry'
          : group.type === 'archer'
            ? 'Archers'
            : group.type;
    return {
      id,
      name: leaders ? `${name} · ${leaders}` : name,
      troopType: group.type,
      troops: group.troops,
      troopExperience: group.militia
        ? (group.troopExperience ?? 0)
        : mergeTroopPools(...group.officers).troopExperience,
      force: group.officers.length
        ? Math.round(
            group.officers.reduce((sum, officer) => sum + officer.force * officer.troops, 0) /
              Math.max(1, group.troops),
          )
        : 45,
      intellect: group.officers.length
        ? Math.round(
            group.officers.reduce((sum, officer) => sum + officer.intellect * officer.troops, 0) /
              Math.max(1, group.troops),
          )
        : 40,
      level: group.officers.length
        ? Math.max(...group.officers.map((officer) => officer.level))
        : 0,
      isMilitia: Boolean(group.militia),
      cunning: group.officers.some((officer) => hasTrait(officer.id, 'cunning')),
      attackRange: group.type === 'archer' ? 3 : undefined,
    } satisfies BattleRosterEntry;
  });
  return { roster, membership };
}

/** Shared field roster: ready officers, then the existing healthy militia remainder. */
export function cityBattleRoster(state: Readonly<V03GameState>, cityId: string, prefix: string) {
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city) throw new Error(`Unknown city ${cityId}.`);
  const officers = state.officers.filter(
    (officer) =>
      officer.alive &&
      city.factionId !== null &&
      officer.factionId === city.factionId &&
      officer.location.kind === 'city' &&
      officer.location.cityId === city.id &&
      officer.troops > 0 &&
      officer.reorganizationDays === 0,
  );
  const groups = groupOfficers(
    officers.map((officer) => ({ ...officer, wounded: 0 })),
    city.garrisonTroops > officers.reduce((sum, officer) => sum + officer.troops, 0) ? 9 : 10,
  );
  const militia = Math.max(
    0,
    city.garrisonTroops - groups.reduce((sum, group) => sum + group.troops, 0),
  );
  if (militia > 0)
    groups.push({
      type: 'infantry',
      officers: [],
      troops: militia,
      militia: true,
      troopExperience: city.garrisonExperience,
    });
  return { ...rosterFromGroups(groups, prefix), officers, militia };
}
