import { traitsOf, type Trait } from '../content/traits';
import type { V03GameState } from '../types';

/** Neutral campaign policy; trait effects below are applied on top of it. */
export const NEUTRAL_ADMISSION_RATIO = 0.8;
export const NEUTRAL_HOME_RISK_LIMIT = 0.9;

/**
 * A house's campaign policy, derived from its current ruler's content traits.
 * Nothing is saved: succession changes a house's character with its ruler.
 */
export interface RulerTemperament {
  traits: readonly Trait[];
  /** Least estimated force ratio for a conquest departure. */
  admissionRatio: number;
  /** Highest tolerated home-risk ratio while the army is away. */
  homeRiskLimit: number;
  /** Weight of expected losses in target scores. */
  lossWeight: number;
  /** The ruler never leads a campaign in person. */
  rulerStaysHome: boolean;
  /** Least force ratio for a raid below the conquest ratio; null means no raids. */
  raidRatio: number | null;
  /** Prefers rich targets (greedy). */
  valuesWealth: boolean;
  /** Prefers targets without a friendly neighbour (cunning). */
  valuesIsolation: boolean;
}

export function temperamentFromTraits(traits: readonly Trait[]): RulerTemperament {
  const fierce = traits.includes('fierce');
  const benevolent = traits.includes('benevolent');
  const greedy = traits.includes('greedy');
  return {
    traits,
    admissionRatio: fierce ? 0.7 : benevolent ? 0.95 : NEUTRAL_ADMISSION_RATIO,
    homeRiskLimit: fierce ? 1.1 : NEUTRAL_HOME_RISK_LIMIT,
    lossWeight: traits.includes('cunning') ? 2 : 1,
    rulerStaysHome: benevolent,
    raidRatio: fierce || greedy ? 0.5 : null,
    valuesWealth: greedy,
    valuesIsolation: traits.includes('cunning'),
  };
}

export function rulerTemperament(
  state: Readonly<Pick<V03GameState, 'factions'>>,
  factionId: string | null,
): RulerTemperament {
  const faction = state.factions.find((entry) => entry.id === factionId);
  return temperamentFromTraits(faction ? traitsOf(faction.leaderOfficerId) : []);
}
