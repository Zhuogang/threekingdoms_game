import { hasNavalTraining } from '../content/naval-commanders';
import { OFFICER_IDENTITIES } from '../content/officerIdentity';
import type { Officer } from '../content/types';

/** Use one commander for both the portrait and vessel, including mixed formations. */
export function formationLeaderVisual(
  officers: readonly Pick<Officer, 'id' | 'level' | 'force'>[],
  officerIds: readonly string[],
) {
  const leader = officers
    .filter((officer) => officerIds.includes(officer.id))
    .sort((a, b) => b.level - a.level || b.force - a.force || a.id.localeCompare(b.id))[0];
  return {
    portraitKey: leader ? OFFICER_IDENTITIES[leader.id]?.portraitKey : undefined,
    navalTraining: hasNavalTraining(leader?.id),
  };
}
