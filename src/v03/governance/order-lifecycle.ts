import type { V03CampaignDirective, V03GameState, V03Requisition } from '../types';
export function orderLifecycle(state: V03GameState, order: V03CampaignDirective | V03Requisition) {
  const battle = state.battles.find((battle) => battle.attackerJourneyId === order.journeyId);
  if (battle?.active) return { stage: 'in-battle' as const, battleId: battle.id, eta: null };
  const returning = state.journeys.find((journey) => journey.id === `${order.journeyId}:return`);
  if (returning && ['outbound', 'returning', 'waiting'].includes(returning.status))
    return {
      stage: 'returning' as const,
      battleId: battle?.id ?? null,
      eta: returning.expectedArrivalDay,
    };
  const journey = state.journeys.find((journey) => journey.id === order.journeyId);
  if (!battle && journey && ['outbound', 'returning', 'waiting'].includes(journey.status))
    return { stage: 'marching' as const, battleId: null, eta: journey.expectedArrivalDay };
  if (battle?.resolved || ['delivered', 'cancelled', 'failed', 'rejected'].includes(order.status))
    return { stage: 'done' as const, battleId: battle?.id ?? null, eta: null };
  return { stage: 'preparing' as const, battleId: null, eta: order.estimatedArrivalDay };
}
