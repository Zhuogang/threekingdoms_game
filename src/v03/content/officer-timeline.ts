/** Historical dates describe scenario openings, never a campaign death schedule. */
export type HistoricalDateKind =
  'recorded' | 'inferred' | 'disputed' | 'game-reference' | 'unknown';

export interface OfficerTimeline {
  birthYear: number | null;
  deathYear: number | null;
  birthKind: HistoricalDateKind;
  deathKind: HistoricalDateKind;
  /** Chosen playable year; deliberately separate from birth + 15 and first employment. */
  debutYear: number;
  debutApproximate: boolean;
  debutKind: 'recorded' | 'design' | 'game-reference';
  debutCityId: string;
  sources: readonly string[];
  basis: string;
}

export type OpeningLifeStatus = 'available' | 'pending' | 'deceased';

export const OFFICER_MINIMUM_AGE = 16;
export const OFFICER_ADULT_AGE = 18;
export const OFFICER_MATURITY_GAIN = { force: 3, intellect: 2 } as const;

/** Virtual age. Unborn people have no displayed age, rather than a negative age. */
export function officerAgeAtYear(birthYear: number | null, year: number): number | null {
  return birthYear === null || year < birthYear ? null : year - birthYear + 1;
}

/** January 1: a death recorded only to the current year has not already happened. */
export function officerOpeningLifeStatus(
  timeline: OfficerTimeline,
  year: number,
): OpeningLifeStatus {
  if (timeline.deathYear !== null && timeline.deathYear < year) return 'deceased';
  const age = officerAgeAtYear(timeline.birthYear, year);
  if (
    year < timeline.debutYear ||
    (timeline.birthYear !== null && (age === null || age < OFFICER_MINIMUM_AGE))
  )
    return 'pending';
  return 'available';
}

/** No historical-death check here: fate after campaign creation belongs to gameplay. */
export function officerBaseStatsAtYear(
  adult: { force: number; intellect: number },
  birthYear: number | null,
  year: number,
): { force: number; intellect: number } {
  const age = officerAgeAtYear(birthYear, year);
  const immature = age !== null && age < OFFICER_ADULT_AGE;
  return {
    force: adult.force - (immature ? OFFICER_MATURITY_GAIN.force : 0),
    intellect: adult.intellect - (immature ? OFFICER_MATURITY_GAIN.intellect : 0),
  };
}
