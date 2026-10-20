import { DEFAULT_SUPPLY_DAYS, supplyFood } from './supply';
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
  }): void;
  battleEnded?(event: {
    reason: 'camp' | 'elimination' | 'timeout' | 'retreat';
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
  plunder?(event: { cityId: string; form: 'own' | 'raid' | 'sack'; factionId: string }): void;
  capture?(event: { officerId: string; byFactionId: string }): void;
  aiStatecraft?(event: {
    factionId: string;
    kind: 'persuade' | 'subvert' | 'raid' | 'plunder' | 'transport' | 'joint' | 'alliance';
  }): void;
  coalition?(event: { leaderId: string }): void;
}
