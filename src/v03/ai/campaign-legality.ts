import { getV03AttackAllianceBlock } from '../campaign/monthly-systems';
import { isCityCommitted, isOfficerReservedForOrder } from '../governance/commitments';
import type { V03GameState, V03Officer } from '../types';

export type RivalCampaignBlock =
  | 'inactive-faction'
  | 'source-unowned'
  | 'source-busy'
  | 'target-missing'
  | 'friendly-target'
  | 'allied-target'
  | 'target-busy';
const ACTIVE_ORDERS = new Set([
  'requested',
  'proposed',
  'waiting',
  'accepted',
  'reserved',
  'dispatched',
]);
const ACTIVE_JOURNEYS = new Set(['outbound', 'returning', 'waiting']);

export function busyCampaignTargets(state: Readonly<V03GameState>): Set<string> {
  const targets = new Set(
    state.directives
      .filter((order) => ACTIVE_ORDERS.has(order.status))
      .map((order) => order.targetCityId),
  );
  for (const journey of state.journeys)
    if (journey.kind === 'campaign' && ACTIVE_JOURNEYS.has(journey.status))
      targets.add(journey.destinationCityId);
  for (const battle of state.battles) {
    if (!battle.active || battle.resolved) continue;
    for (const id of [battle.attackerJourneyId, battle.defenderJourneyId]) {
      const journey = state.journeys.find((entry) => entry.id === id);
      if (journey) targets.add(journey.destinationCityId);
    }
  }
  return targets;
}

export function rivalCampaignSourceBlock(
  state: Readonly<V03GameState>,
  factionId: string,
  cityId: string,
): RivalCampaignBlock | null {
  const faction = state.factions.find((entry) => entry.id === factionId);
  if (!faction || faction.eliminated || faction.isPlayer || factionId === state.playerFactionId)
    return 'inactive-faction';
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city || city.factionId !== factionId) return 'source-unowned';
  if (
    isCityCommitted(state, cityId) ||
    state.directives.some(
      (order) => order.sourceCityId === cityId && ACTIVE_ORDERS.has(order.status),
    ) ||
    state.journeys.some(
      (journey) =>
        journey.kind === 'campaign' &&
        journey.sourceCityId === cityId &&
        ACTIVE_JOURNEYS.has(journey.status),
    )
  )
    return 'source-busy';
  return null;
}

export function rivalCampaignTargetBlock(
  state: Readonly<V03GameState>,
  factionId: string,
  cityId: string,
  busy = busyCampaignTargets(state),
): RivalCampaignBlock | null {
  const target = state.cities.find((entry) => entry.id === cityId);
  if (!target) return 'target-missing';
  if (target.factionId === factionId) return 'friendly-target';
  if (target.factionId !== null) {
    const faction = state.factions.find((entry) => entry.id === target.factionId);
    if (!faction || faction.eliminated) return 'inactive-faction';
    if (getV03AttackAllianceBlock(state.alliances, factionId, target.factionId, state.monthIndex))
      return 'allied-target';
  }
  if (busy.has(cityId) || isCityCommitted(state, cityId)) return 'target-busy';
  return null;
}

export function isRivalCampaignOfficerAvailable(
  state: Readonly<V03GameState>,
  officer: V03Officer | undefined,
  factionId: string,
  cityId: string,
): officer is V03Officer {
  return Boolean(
    officer &&
    officer.alive &&
    officer.factionId === factionId &&
    officer.troops > 0 &&
    officer.reorganizationDays === 0 &&
    officer.location.kind === 'city' &&
    officer.location.cityId === cityId &&
    !isOfficerReservedForOrder(state, officer.id),
  );
}
