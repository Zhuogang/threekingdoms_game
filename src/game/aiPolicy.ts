import type { AttackOrder } from './types';

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
}

export function attackThreshold(candidate: AiAttackCandidate, aggression: RivalAggression): number {
  return candidate.defendingTroops * ATTACK_MULTIPLIERS[aggression] + candidate.defense * 7 + 300;
}

export function attackWilling(candidate: AiAttackCandidate, aggression: RivalAggression): boolean {
  return candidate.attackingPower > attackThreshold(candidate, aggression);
}

export function attackSafeguards(candidate: AiAttackCandidate) {
  const marchFood = Math.ceil(candidate.attackingTroops * 0.65) + 200;
  const upkeep = Math.ceil(candidate.sourceTroops * 0.12);
  return {
    reserves: candidate.reserve >= 500,
    food: candidate.food - marchFood >= upkeep,
    marchFood,
    upkeep,
  };
}

/** Optional observers are diagnostic only; the simulation never reads their results. */
export interface CampaignObserver {
  aiFactionMonth?(factionId: string): void;
  aiCandidate?(candidate: AiAttackCandidate): void;
  aiDecision?(candidate: AiAttackCandidate): void;
  aiMarch?(order: AttackOrder): void;
  aiUpkeep?(event: { cityId: string; factionId: string; shortage: boolean }): void;
  battleResult?(event: { attackerId: string; defenderId: string | null; captured: boolean }): void;
}
