import { DEFAULT_SUPPLY_DAYS, supplyFood } from './supply';
import type { AttackOrder, BattleSkill } from './types';

export const RIVAL_AGGRESSIONS = ['cautious', 'balanced', 'aggressive'] as const;
export type RivalAggression = (typeof RIVAL_AGGRESSIONS)[number];
export const ATTACK_MULTIPLIERS: Record<RivalAggression, number> = {
  cautious: 2,
  balanced: 1.35,
  aggressive: 0.9,
};

export function isRivalAggression(value: unknown): value is RivalAggression {
  return RIVAL_AGGRESSIONS.includes(value as RivalAggression);
}

/** Frozen inputs allow comparing willingness without rerunning a changing campaign. */
export interface AiAttackCandidate {
  turn: number;
  factionId: string;
  sourceId: string;
  targetId: string;
  attackingPower: number;
  defendingTroops: number;
  defense: number;
  attackingTroops: number;
  sourceTroops: number;
  reserve: number;
  food: number;
  /** True when the target belongs to the leader a coalition has formed against. */
  coalitionTarget?: boolean;
}

/** How a faction's personality bends the shared aggression slider (never grants resources). */
export interface FactionPolicy {
  /** Added to the aggression multiplier: negative is bolder, positive is more defensive. */
  aggressionOffset: number;
  /** Multiplies the whole attack threshold; Yuan Shao only attacks at a clear advantage. */
  thresholdScale: number;
  /** Multiplies raiding power: above 1 raids on thinner margins. */
  raidBias: number;
  plunderAllowed: boolean;
  /** Added to the chance that this faction accepts an alliance. */
  diplomacyBias: number;
  /** Multiplies the troop target the faction musters its officers to. */
  musterBonus: number;
  targetPreference: 'weakest' | 'water' | 'lowSupport';
}
export const DEFAULT_POLICY: FactionPolicy = {
  aggressionOffset: 0,
  thresholdScale: 1,
  raidBias: 1,
  plunderAllowed: true,
  diplomacyBias: 0,
  musterBonus: 1,
  targetPreference: 'weakest',
};
export const FACTION_POLICY: Record<string, FactionPolicy> = {
  dong: { ...DEFAULT_POLICY, aggressionOffset: -0.2, raidBias: 1.5 },
  liu: { ...DEFAULT_POLICY, plunderAllowed: false, diplomacyBias: 15 },
  sun: { ...DEFAULT_POLICY, targetPreference: 'water' },
  yuan: { ...DEFAULT_POLICY, musterBonus: 1.2, thresholdScale: 1.2 },
  yan: { ...DEFAULT_POLICY, aggressionOffset: 0.3 },
  cao: { ...DEFAULT_POLICY, targetPreference: 'lowSupport' },
};
export const policyOf = (factionId: string): FactionPolicy =>
  FACTION_POLICY[factionId] ?? DEFAULT_POLICY;
/** Coalition members press the runaway leader harder. */
const COALITION_SCALE = 0.8;

export function attackThreshold(
  candidate: AiAttackCandidate,
  aggression: RivalAggression,
  policy: FactionPolicy = DEFAULT_POLICY,
): number {
  const multiplier = ATTACK_MULTIPLIERS[aggression] + policy.aggressionOffset;
  const scale = (candidate.coalitionTarget ? COALITION_SCALE : 1) * policy.thresholdScale;
  return (candidate.defendingTroops * multiplier + candidate.defense * 7 + 300) * scale;
}

export function attackWilling(
  candidate: AiAttackCandidate,
  aggression: RivalAggression,
  policy: FactionPolicy = DEFAULT_POLICY,
): boolean {
  return candidate.attackingPower > attackThreshold(candidate, aggression, policy);
}

export function attackSafeguards(candidate: AiAttackCandidate) {
  // Conquest marches always carry the default supply (D8: same costs as the player).
  const marchFood = supplyFood(candidate.attackingTroops, DEFAULT_SUPPLY_DAYS);
  const upkeep = Math.ceil(candidate.sourceTroops * 0.12);
  return {
    reserves: candidate.reserve >= 500,
    food: candidate.food - marchFood >= upkeep,
    marchFood,
    upkeep,
  };
}

/** Battle-level diagnostics; the simulation never reads their results. */
export interface BattleObserver {
  battleAction?(event: {
    side: 'attacker' | 'defender';
    kind: 'attack' | 'counter' | 'tactic' | 'move' | 'wait';
    /** Which tactic was cast, for kind: 'tactic'. */
    skill?: BattleSkill;
  }): void;
  battleEnded?(event: {
    reason: 'camp' | 'elimination' | 'timeout' | 'retreat' | 'rout';
    day: number;
    winner: 'attacker' | 'defender';
    attackerTroops: number;
    defenderTroops: number;
  }): void;
  battleShortage?(event: { side: 'attacker' | 'defender' }): void;
}

/** Optional observers are diagnostic only; the simulation never reads their results. */
export interface CampaignObserver extends BattleObserver {
  aiFactionMonth?(factionId: string): void;
  aiCandidate?(candidate: AiAttackCandidate): void;
  aiDecision?(candidate: AiAttackCandidate): void;
  aiMarch?(order: AttackOrder): void;
  aiUpkeep?(event: { cityId: string; factionId: string; shortage: boolean }): void;
  battleResult?(event: {
    attackerId: string;
    defenderId: string | null;
    captured: boolean;
    intent?: AttackOrder['intent'];
    days?: number;
    attackerStart?: number;
    defenderStart?: number;
    attackerEnd?: number;
    defenderEnd?: number;
  }): void;
  /** A march chosen by the player (or the bot), for supply-day statistics. */
  march?(event: { factionId: string; supplyDays: number; intent: AttackOrder['intent'] }): void;
  /** Plunder, raid or sack applied to a city. */
  plunder?(event: {
    cityId: string;
    form: 'own' | 'raid' | 'sack';
    factionId: string;
    /** For raids: whether the target had soldiers to fight. */
    fought?: boolean;
  }): void;
  capture?(event: { officerId: string; byFactionId: string }): void;
  aiStatecraft?(event: {
    factionId: string;
    kind: 'persuade' | 'subvert' | 'raid' | 'plunder' | 'transport' | 'joint' | 'alliance';
  }): void;
  coalition?(event: { leaderId: string }): void;
}
