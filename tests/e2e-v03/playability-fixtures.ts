import { createCanvasBattleMap } from '../../src/v03/battle';
import { executeV03Command } from '../../src/v03/commands';
import { createV03Game } from '../../src/v03/initial-state';
import { encodeV03Save } from '../../src/v03/platform/storage';
import type { V03GameState } from '../../src/v03/types';

export function acknowledgeReports(state: V03GameState): V03GameState {
  let next = state;
  for (const event of next.events.filter((entry) => !entry.acknowledged)) {
    next = executeV03Command(next, { type: 'acknowledgeEvent', eventId: event.id }).state;
  }
  return next;
}

/**
 * A real campaign battle (Puyang → Xiapi). With `battlefieldId`, the battle is
 * moved onto that canvas; otherwise it keeps the one the campaign selected.
 */
export function reviewBattleState(battlefieldId?: string): V03GameState {
  const dispatched = executeV03Command(createV03Game('cao', 481516), {
    type: 'issueCampaignDirective',
    sourceCityId: 'puyang',
    targetCityId: 'xiapi',
    intent: 'conquer',
    requestedTroops: 700,
    requestedByDay: null,
  });
  if (!dispatched.ok) throw new Error(dispatched.error);
  let state = dispatched.state;
  const journey = state.journeys.find((entry) => entry.kind === 'campaign')!;
  // Retain the actual command-created party and route, shortening travel only.
  journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
    ...segment,
    lengthKm: Math.min(segment.lengthKm, 1),
    fixedDelayDays: 0,
  }));
  journey.segmentProgressKm = journey.routeSnapshot.map(() => 0);
  journey.segmentWaitDays = journey.routeSnapshot.map(() => 0);
  journey.expectedArrivalDay = state.absoluteDay + 1;
  for (let day = 0; day < 8; day++) {
    const battle = state.battles.find((entry) => entry.active);
    if (battle) {
      if (!battlefieldId) return acknowledgeReports(state);
      const map = createCanvasBattleMap(battlefieldId, {
        approachDirection: 'north',
        seed: 481516,
      });
      Object.assign(battle, { mapId: map.mapId, mapVersion: map.templateVersion, seed: map.seed });
      battle.battleData.map = map;
      for (const side of ['attacker', 'defender'] as const) {
        const positions = side === 'attacker' ? map.attackerDeployment : map.defenderDeployment;
        battle.battleData.units
          .filter((unit) => unit.side === side)
          .forEach((unit, index) =>
            Object.assign(unit, positions[index], { moved: false, acted: false }),
          );
      }
      return acknowledgeReports(state);
    }
    const advanced = executeV03Command(acknowledgeReports(state), { type: 'advance', days: 1 });
    if (!advanced.ok) throw new Error(advanced.error);
    state = advanced.state;
  }
  throw new Error('The review fixture did not reach a battle.');
}

export function npcOnlyState(): V03GameState {
  let state = createV03Game('sun', 610301, 'divided-realm-190');
  for (let step = 0; step < 80; step++) {
    state = acknowledgeReports(state);
    if (
      state.battles.some((battle) => battle.active) &&
      !state.battles.some(
        (battle) =>
          battle.active &&
          [battle.attackerFactionId, battle.defenderFactionId].includes(state.playerFactionId),
      )
    )
      return state;
    const advanced = executeV03Command(state, { type: 'advance', days: 1 });
    if (!advanced.ok) throw new Error(advanced.error);
    state = advanced.state;
  }
  throw new Error('The natural Sun fixture did not reach an NPC-only battle.');
}

export function mixedBattleState(twoPlayerBattles = false): V03GameState {
  const state = reviewBattleState();
  const original = state.battles[0]!;
  const extra = structuredClone(original);
  extra.id = 'review-other-battle';
  extra.mapId = `${extra.mapId}-other`;
  extra.battleData.id = extra.id;
  extra.battleData.map.mapId = extra.mapId;
  extra.attackerFactionId = 'dong';
  extra.defenderFactionId = twoPlayerBattles ? 'cao' : null;
  extra.battleData.playerSide = twoPlayerBattles ? 'defender' : 'attacker';
  extra.attackerFormationOfficerIds = {};
  extra.defenderFormationOfficerIds = {};
  extra.battleData.units = extra.battleData.units.map((unit, index) => ({
    ...unit,
    id: `review-militia-${index}`,
    name: 'Militia',
    isMilitia: true,
  }));
  const journey = structuredClone(
    state.journeys.find((entry) => entry.id === original.attackerJourneyId)!,
  );
  journey.id = 'review-other-journey';
  journey.executionId = 'review-other-directive';
  journey.ownerFactionId = 'dong';
  journey.sourceCityId = 'wancheng';
  journey.destinationCityId = twoPlayerBattles ? 'chenliu' : 'xiangyang';
  journey.routeCityIds = [journey.sourceCityId, journey.destinationCityId];
  journey.manifest.officerIds = [];
  extra.attackerJourneyId = journey.id;
  extra.defenderJourneyId = null;
  state.journeys.push(journey);
  state.directives.push({
    ...state.directives[0]!,
    id: journey.executionId,
    factionId: 'dong',
    sourceCityId: journey.sourceCityId,
    targetCityId: journey.destinationCityId,
    journeyId: journey.id,
  });
  state.battles.push(extra);
  state.dayResolution = null;
  return state;
}

export function inboxState(): V03GameState {
  const state = createV03Game('cao', 4096);
  for (let index = 0; index < 9; index++) {
    state.requisitions.push({
      id: `review-player-order-${index}`,
      factionId: 'cao',
      sourceCityId: 'puyang',
      targetCityId: 'chenliu',
      requested: { gold: 50 + index, food: 0, troops: 0 },
      proposed: { gold: 50 + index, food: 0, troops: 0 },
      createdDay: 0,
      requestedByDay: null,
      earliestDepartureDay: 0,
      estimatedArrivalDay: 10,
      status: 'proposed',
      journeyId: null,
      governanceRevision: state.governanceRevision,
      message: `Review player order ${index + 1}`,
    });
    state.directives.push({
      id: `review-rival-order-${index}`,
      factionId: 'dong',
      sourceCityId: 'wancheng',
      targetCityId: 'xiangyang',
      intent: 'conquer',
      requestedTroops: 700,
      proposedTroops: 700,
      requestedByDay: null,
      earliestDepartureDay: 0,
      estimatedArrivalDay: 10,
      status: 'proposed',
      journeyId: null,
      governanceRevision: state.governanceRevision,
      message: `Review rival order ${index + 1}`,
    });
  }
  for (let index = 0; index < 12; index++)
    state.events.push({
      id: `review-report-${index}`,
      absoluteDay: 0,
      kind: 'campaignEvent',
      title: `Review report ${index + 1}`,
      detail: 'A pending review report.',
      entityId: null,
      acknowledged: false,
    });
  return state;
}

export function governorTransferState(): V03GameState {
  const state = createV03Game('cao', 711);
  const source = state.cities.find((city) => city.id === 'puyang')!;
  const target = state.cities.find((city) => city.id === 'xuchang')!;
  const governor = state.officers.find((officer) => officer.id === 'xiahoudun')!;
  for (const city of state.cities) if (city.governorId === governor.id) city.governorId = null;
  const oldSourceGovernor = state.officers.find((officer) => officer.id === source.governorId);
  if (oldSourceGovernor) oldSourceGovernor.governorOfCityId = null;
  source.reserve += governor.troops;
  governor.troops = 0;
  governor.location = { kind: 'city', cityId: source.id };
  governor.governorOfCityId = source.id;
  source.governorId = governor.id;
  source.governanceMode = 'governor';
  const previous = state.officers.find((officer) => officer.id === target.governorId);
  if (previous) previous.governorOfCityId = null;
  target.governorId = null;
  target.governanceMode = 'steward';
  return state;
}

export function asSave(state: V03GameState): string {
  return encodeV03Save(state);
}
