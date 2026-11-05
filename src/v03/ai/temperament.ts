import { traitsOf, type Trait } from '../content/traits';
import type { V03GameState } from '../types';
import { CAMPAIGN_AI } from '../balance';

/** Neutral campaign policy; trait effects below are applied on top of it. */
export const NEUTRAL_ADMISSION_RATIO = CAMPAIGN_AI.temperament.neutralAdmissionRatio;
export const NEUTRAL_HOME_RISK_LIMIT = CAMPAIGN_AI.temperament.neutralHomeRiskLimit;

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
    admissionRatio: fierce
      ? CAMPAIGN_AI.temperament.fierceAdmissionRatio
      : benevolent
        ? CAMPAIGN_AI.temperament.benevolentAdmissionRatio
        : NEUTRAL_ADMISSION_RATIO,
    homeRiskLimit: fierce ? CAMPAIGN_AI.temperament.fierceHomeRiskLimit : NEUTRAL_HOME_RISK_LIMIT,
    lossWeight: traits.includes('cunning')
      ? CAMPAIGN_AI.temperament.cunningLossWeight
      : CAMPAIGN_AI.temperament.defaultLossWeight,
    rulerStaysHome: benevolent,
    raidRatio: fierce || greedy ? CAMPAIGN_AI.temperament.raidRatio : null,
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
