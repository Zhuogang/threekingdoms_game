import type { RivalCampaignBlock } from './campaign-legality';
import type { BattleSide, BattleTactic } from '../battle/types';
import type { GovernorWorkReasonCode } from '../governance/autonomy';
import type { V03FactionObjective } from '../types';

export type CampaignDecisionReason =
  | RivalCampaignBlock
  | 'stale-plan'
  | 'invalid-party'
  | 'source-busy'
  | 'friendly-target'
  | 'target-busy'
  | 'inactive-faction'
  | 'no-route'
  | 'no-party'
  | 'invalid-route'
  | 'invalid-supply'
  | 'unaffordable'
  | 'force-ratio-and-travel'
  | 'viable-campaign'
  | 'insufficient-force'
  | 'home-food-shortage'
  | 'home-defense-exposed'
  | 'no-eligible-campaign'
  | 'dispatch-revalidation';

/** Developer observations only: never serialized or used to make a decision. */
export type AiDecisionEvent =
  | {
      kind: 'objective';
      day: number;
      factionId: string;
      mode: V03FactionObjective['mode'];
      sourceCityId: string | null;
      targetCityId: string | null;
      status: 'selected' | 'retained' | 'cancelled' | 'support-committed' | 'campaign-committed';
      reason: V03FactionObjective['reason'];
      forceDeficit: number;
      foodDeficit: number;
      reviewDay: number;
      orderId?: string;
    }
  | {
      kind: 'campaign';
      day: number;
      factionId: string;
      sourceCityId?: string;
      targetCityId?: string;
      status: 'rejected' | 'eligible' | 'selected' | 'committed' | 'execution-rejected' | 'wait';
      reason: CampaignDecisionReason;
      troops?: number;
      defenderTroops?: number;
      officerIds?: readonly string[];
      score?: number;
      forceRatio?: number;
      expectedLosses?: number;
      homeProjectedFood?: number;
      homeRisk?: number;
      forceDeficit?: number;
      foodDeficit?: number;
      food?: number;
      availableFood?: number;
      travelDays?: number;
      journeyId?: string;
    }
  | {
      kind: 'governor';
      day: number;
      factionId: string;
      cityId: string;
      status: 'committed' | 'blocked' | 'execution-rejected';
      reason: GovernorWorkReasonCode | 'stale-plan';
      action: string | null;
      workPoints: number;
    }
  | {
      kind: 'tactical';
      day: number;
      battleId: string;
      side: BattleSide;
      unitId?: string;
      targetId?: string;
      status: 'candidate' | 'selected' | 'committed' | 'execution-rejected';
      reason:
        | 'current-policy'
        | 'action-value'
        | 'move-and-action'
        | 'opening-force-retreat'
        | 'confused-activation';
      score?: number;
      outgoing?: number;
      retaliation?: number;
      finishValue?: number;
      supportValue?: number;
      supplyValue?: number;
      pointCost?: number;
      moveCost?: number;
      exposure?: number;
      retreatAllowed?: boolean;
      retreatRiskPercent?: number;
      progressValue?: number;
      blockingPenalty?: number;
      action: BattleTactic | 'attack' | 'move' | 'hold' | 'retreat' | 'skip';
      x?: number;
      y?: number;
    };

export interface AiDecisionTrace {
  limit: number;
  observed: number;
  dropped: number;
  counts: Record<string, number>;
  workByFaction: Record<string, { actions: number; workPoints: number }>;
  events: AiDecisionEvent[];
}

let activeTrace: AiDecisionTrace | undefined;

export function createAiDecisionTrace(limit = 200): AiDecisionTrace {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 10_000)
    throw new Error('Decision trace limit must be an integer from 0 to 10,000.');
  return { limit, observed: 0, dropped: 0, counts: {}, workByFaction: {}, events: [] };
}

/** Scope an observer to synchronous simulation calls, including nested commands. */
export function withAiDecisionTrace<T>(trace: AiDecisionTrace, operation: () => T): T {
  const previous = activeTrace;
  activeTrace = trace;
  try {
    return operation();
  } finally {
    activeTrace = previous;
  }
}

export function recordAiDecision(event: AiDecisionEvent): void {
  const trace = activeTrace;
  if (!trace) return;
  trace.observed++;
  // Keys are finite domain reason/action codes, never unit, order or journey IDs.
  const key = `${event.kind}:${event.status}:${event.reason}`;
  trace.counts[key] = (trace.counts[key] ?? 0) + 1;
  if (event.kind === 'governor' && event.status === 'committed') {
    const work = (trace.workByFaction[event.factionId] ??= { actions: 0, workPoints: 0 });
    work.actions++;
    work.workPoints += event.workPoints;
  }
  if (trace.events.length < trace.limit) trace.events.push({ ...event });
  else trace.dropped++;
}
