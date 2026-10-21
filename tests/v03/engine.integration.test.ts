import { describe, expect, it } from 'vitest';
import { v03BattleForState } from '../../src/v03/engine';
import { executeV03Command } from '../../src/v03/commands';
import { createV03Game } from '../../src/v03/initial-state';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../src/v03/platform/storage';
import type { V03GameState } from '../../src/v03/types';
import type { V03TacticalBattleState } from '../../src/v03/battle';

const playerFaction = 'cao';
const sourceCity = 'puyang';
const targetCity = 'xiapi';
const campaignStrength = 700;

function issueCampaign(intent: 'conquer' | 'raid' | 'sack' = 'conquer'): V03GameState {
  const state = createV03Game(playerFaction, 481516);
  const result = executeV03Command(state, {
    type: 'issueCampaignDirective',
    sourceCityId: sourceCity,
    targetCityId: targetCity,
    intent,
    requestedTroops: campaignStrength,
    requestedByDay: null,
  });
  expect(result.ok, result.error).toBe(true);
  expect(result.state.directives).toHaveLength(1);
  expect(result.state.directives[0]?.intent).toBe(intent);
  expect(result.state.directives[0]?.status).toBe('dispatched');
  return result.state;
}

function acknowledgePendingEvents(initial: V03GameState): V03GameState {
  let state = initial;
  for (const event of state.events.filter((entry) => !entry.acknowledged)) {
    state = executeV03Command(state, { type: 'acknowledgeEvent', eventId: event.id }).state;
  }
  return state;
}

function advanceUntilBattle(initial: V03GameState, maxDays = 120): V03GameState {
  let state = initial;
  for (let day = 0; day <= maxDays; day++) {
    if (state.battles.some((battle) => battle.active)) return state;
    state = acknowledgePendingEvents(state);
    const result = executeV03Command(state, { type: 'advance', days: 1 });
    expect(result.ok, result.error).toBe(true);
    state = result.state;
  }
  throw new Error(`Campaign did not reach a battle within ${maxDays} days.`);
}

function advanceUntil(
  initial: V03GameState,
  predicate: (state: V03GameState) => boolean,
  maxDays: number,
): V03GameState {
  let state = initial;
  for (let day = 0; day <= maxDays; day++) {
    if (predicate(state)) return state;
    state = acknowledgePendingEvents(state);
    const result = executeV03Command(state, { type: 'advance', days: 1 });
    expect(result.ok, result.error).toBe(true);
    state = result.state;
  }
  throw new Error(`Expected state was not reached within ${maxDays} days.`);
}

function activeBattle(state: V03GameState) {
  const battle = state.battles.find((entry) => entry.active);
  expect(battle, 'expected an active field battle').toBeDefined();
  return battle!;
}

function tactical(battle: V03GameState['battles'][number]): V03TacticalBattleState {
  return battle.battleData as V03TacticalBattleState;
}

function forceBattleOutcome(state: V03GameState, winner: 'attacker' | 'defender'): V03GameState {
  const next = structuredClone(state);
  const battle = next.battles.find((entry) => entry.active)!;
  const data = battle.battleData as V03TacticalBattleState;
  data.outcome = { winner, reason: 'elimination' };
  next.events.forEach((event) => {
    event.acknowledged = true;
  });
  const result = executeV03Command(next, { type: 'advance', days: 1 });
  expect(result.ok, result.error).toBe(true);
  return result.state;
}

function reachableCampaignBattle(intent: 'conquer' | 'raid' | 'sack' = 'conquer'): V03GameState {
  return advanceUntilBattle(issueCampaign(intent));
}

describe('v0.3 strategic engine integration', () => {
  it('dispatches a campaign, advances its route, and opens a battle at the destination', () => {
    const state = reachableCampaignBattle();
    const battle = activeBattle(state);
    const journey = state.journeys.find((entry) => entry.id === battle.attackerJourneyId)!;
    expect(journey.kind).toBe('campaign');
    expect(journey.destinationCityId).toBe(targetCity);
    expect(journey.status).toBe('delivered');
    expect(state.directives[0]?.status).toBe('delivered');
    expect(battle.intent).toBe('conquer');
    expect(battle.absoluteDay).toBe(journey.expectedArrivalDay);
    expect(state.phase).toBe('battle');
  });

  it('applies a battle action, saves/restores it, and advances exactly one battle day', () => {
    let state = reachableCampaignBattle();
    const battle = activeBattle(state);
    const data = tactical(battle);
    const unit = data.units.find((entry) => entry.side === data.playerSide)!;
    const acted = executeV03Command(state, {
      type: 'battleAction',
      battleId: battle.id,
      action: { type: 'wait', unitId: unit.id },
    });
    expect(acted.ok, acted.error).toBe(true);
    const actedData = v03BattleForState(acted.state, battle.id)!;
    expect(actedData.units.find((entry) => entry.id === unit.id)?.acted).toBe(true);
    const restored = decodeV03Save(encodeV03Save(acted.state));
    expect(restored).toEqual(acted.state);

    const beforeDay = restored.battles.find((entry) => entry.id === battle.id)!
      .battleData as V03TacticalBattleState;
    const ready = acknowledgePendingEvents(restored);
    const advanced = executeV03Command(ready, { type: 'advance', days: 1 });
    expect(advanced.ok, advanced.error).toBe(true);
    const after = v03BattleForState(advanced.state, battle.id)!;
    expect(after.day).toBe(beforeDay.day + 1);
    expect(advanced.state.absoluteDay).toBe(restored.absoluteDay + 1);
  });

  it('resolves a field-control tie at the day limit and preserves the draw in a save', () => {
    let state = reachableCampaignBattle();
    const battle = activeBattle(state);
    const data = tactical(battle);
    const attacker = data.units.find((unit) => unit.side === 'attacker')!;
    const defender = data.units.find((unit) => unit.side === 'defender')!;
    data.map.terrain = Array.from({ length: data.map.width * data.map.height }, () => 'plain');
    data.day = data.dayLimit;
    data.timeoutPolicy = 'field-control';
    data.units = [
      { ...attacker, x: 5, y: 10, acted: true, moved: true },
      { ...defender, x: data.map.width - 1 - 5, y: 10, acted: true, moved: true },
    ];
    state = acknowledgePendingEvents(state);
    const advanced = executeV03Command(state, { type: 'advance', days: 1 });
    expect(advanced.ok, advanced.error).toBe(true);
    const resolved = advanced.state.battles.find((entry) => entry.id === battle.id)!;
    const result = resolved.battleData as V03TacticalBattleState;
    expect(result.outcome).toEqual({ winner: null, reason: 'dayLimit' });
    expect(resolved.resolved).toBe(true);
    expect(resolved.outcome).toBe('draw');
    expect(validateV03State(advanced.state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(advanced.state))).toEqual(advanced.state);
  });

  it('keeps the save invariant after an attacker captures the player capital', () => {
    let state = reachableCampaignBattle();
    const originalBattle = activeBattle(state);
    const originalData = tactical(originalBattle);
    const attackerUnit = originalData.units.find((unit) => unit.side === 'attacker')!;
    const invader = state.officers.find((officer) => officer.id === 'dongzhuo')!;
    invader.troops = attackerUnit.troops;
    invader.location = { kind: 'battle', battleId: originalBattle.id };
    const originalCommander = state.officers.find((officer) => officer.id === 'xiahouyuan')!;
    originalCommander.location = { kind: 'city', cityId: sourceCity };

    const journey = state.journeys.find((entry) => entry.id === originalBattle.attackerJourneyId)!;
    journey.ownerFactionId = 'dong';
    journey.sourceCityId = 'changan';
    journey.destinationCityId = state.playerCapitalCityId;
    journey.intent = 'conquer';
    journey.manifest = {
      ...journey.manifest,
      officerIds: [invader.id],
      troopCount: attackerUnit.troops,
    };

    const battle = state.battles.find((entry) => entry.id === originalBattle.id)!;
    battle.attackerFactionId = 'dong';
    battle.defenderFactionId = playerFaction;
    battle.intent = 'conquer';
    battle.attackerFormationOfficerIds = { [attackerUnit.id]: [invader.id] };
    battle.defenderFormationOfficerIds = {};
    const data = battle.battleData as V03TacticalBattleState;
    data.playerSide = 'defender';
    data.outcome = { winner: 'attacker', reason: 'elimination' };
    state.events.forEach((event) => {
      event.acknowledged = true;
    });

    const result = executeV03Command(state, { type: 'advance', days: 1 });
    expect(result.ok, result.error).toBe(true);
    expect(
      result.state.cities.find((city) => city.id === state.playerCapitalCityId)?.factionId,
    ).toBe('dong');
    const player = result.state.factions.find((faction) => faction.id === playerFaction)!;
    expect(result.state.playerCapitalCityId).toBe(player.capitalCityId);
    expect(validateV03State(result.state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });

  it('does not deliver requisition cargo to a city captured before arrival', () => {
    let state = createV03Game(playerFaction, 44);
    const request = executeV03Command(state, {
      type: 'requestRequisition',
      sourceCityId: 'chenliu',
      targetCityId: 'xuchang',
      requested: { gold: 200, food: 0, troops: 0 },
      requestedByDay: null,
    });
    expect(request.ok, request.error).toBe(true);
    state = request.state;
    const journey = state.journeys[0]!;
    const target = state.cities.find((city) => city.id === 'xuchang')!;
    const goldBeforeArrival = target.gold;
    target.factionId = 'dong';
    state = advanceUntil(
      state,
      (current) =>
        current.journeys.find((entry) => entry.id === journey.id)?.status === 'cancelled',
      journey.expectedArrivalDay + 30,
    );
    const redirected = state.journeys.find(
      (entry) => entry.kind === 'return' && entry.executionId.startsWith(journey.executionId),
    );
    expect(state.cities.find((city) => city.id === 'xuchang')?.factionId).toBe('dong');
    expect(state.cities.find((city) => city.id === 'xuchang')?.gold).toBe(goldBeforeArrival);
    expect(state.requisitions[0]?.status).toBe('failed');
    expect(redirected?.manifest.cargo.gold).toBe(200);
    expect(state.cities.find((city) => city.id === redirected?.destinationCityId)?.factionId).toBe(
      playerFaction,
    );
  });

  it('does not start a campaign battle if its destination becomes friendly before arrival', () => {
    let state = issueCampaign();
    const journey = state.journeys.find((entry) => entry.kind === 'campaign')!;
    state.cities.find((city) => city.id === targetCity)!.factionId = playerFaction;
    state = advanceUntil(
      state,
      (current) =>
        current.journeys.find((entry) => entry.id === journey.id)?.status === 'delivered',
      journey.expectedArrivalDay + 5,
    );
    expect(state.battles).toHaveLength(0);
    expect(state.cities.find((city) => city.id === targetCity)?.factionId).toBe(playerFaction);
    expect(state.journeys.find((entry) => entry.id === journey.id)?.status).toBe('delivered');
  });

  it('does not restore a returning force into a city captured before return arrival', () => {
    let state = reachableCampaignBattle();
    const battle = activeBattle(state);
    const lost = forceBattleOutcome(state, 'defender');
    const returning = lost.journeys.find((journey) => journey.kind === 'return');
    expect(returning, 'a surviving attacking army should begin a return journey').toBeDefined();
    const home = lost.cities.find((city) => city.id === sourceCity)!;
    const garrisonBefore = home.garrisonTroops;
    home.factionId = 'dong';
    const returnJourney = lost.journeys.find((journey) => journey.id === returning!.id)!;
    returnJourney.segmentProgressKm = returnJourney.routeSnapshot.map(
      (segment) => segment.lengthKm,
    );
    returnJourney.segmentWaitDays = returnJourney.routeSnapshot.map(() => 0);
    returnJourney.expectedArrivalDay = lost.absoluteDay + 1;
    const redirected = advanceUntil(
      lost,
      (current) =>
        current.journeys.some(
          (entry) =>
            entry.kind === 'return' &&
            entry.id !== returnJourney.id &&
            entry.executionId.startsWith(returnJourney.executionId),
        ) &&
        current.journeys.find((entry) => entry.id === returnJourney.id)?.status === 'cancelled',
      3,
    );
    const refugeJourney = redirected.journeys.find(
      (entry) =>
        entry.kind === 'return' &&
        entry.id !== returnJourney.id &&
        entry.executionId.startsWith(returnJourney.executionId),
    )!;
    expect(redirected.cities.find((city) => city.id === sourceCity)?.factionId).toBe('dong');
    expect(redirected.cities.find((city) => city.id === sourceCity)?.garrisonTroops).toBe(
      garrisonBefore,
    );
    expect(
      redirected.cities.find((city) => city.id === refugeJourney.destinationCityId)?.factionId,
    ).toBe(playerFaction);
    expect(refugeJourney.manifest.troopCount).toBeGreaterThan(0);
    expect(redirected.battles.find((entry) => entry.id === battle.id)?.resolved).toBe(true);
  });

  it('refreshes a waiting requisition when month settlement makes the full request feasible', () => {
    let state = createV03Game(playerFaction, 909);
    state.absoluteDay = 29;
    state.monthIndex = 0;
    state.cities.find((city) => city.id === 'chenliu')!.gold = 0;
    const request = executeV03Command(state, {
      type: 'requestRequisition',
      sourceCityId: 'chenliu',
      targetCityId: 'xuchang',
      requested: { gold: 100, food: 0, troops: 0 },
      requestedByDay: null,
    });
    expect(request.ok, request.error).toBe(true);
    const waiting = executeV03Command(request.state, {
      type: 'answerRequisition',
      requisitionId: request.orderId!,
      answer: 'wait',
    });
    expect(waiting.ok, waiting.error).toBe(true);
    expect(waiting.state.requisitions[0]?.status).toBe('waiting');
    const settled = executeV03Command(waiting.state, { type: 'advance', days: 1 });
    expect(settled.ok, settled.error).toBe(true);
    expect(settled.state.absoluteDay).toBe(30);
    expect(settled.state.cities.find((city) => city.id === 'chenliu')!.gold).toBeGreaterThanOrEqual(
      100,
    );
    expect(settled.state.requisitions[0]?.status).toBe('proposed');
  });

  it('keeps raid and sack intent semantics distinct after attacker victory', () => {
    let raid = reachableCampaignBattle('raid');
    const raidBattle = activeBattle(raid);
    const raidTargetBefore = raid.cities.find((city) => city.id === targetCity)!.factionId;
    raid = forceBattleOutcome(raid, 'attacker');
    expect(raid.cities.find((city) => city.id === targetCity)?.factionId).toBe(raidTargetBefore);
    expect(raid.battles.find((entry) => entry.id === raidBattle.id)?.intent).toBe('raid');
    expect(
      raid.journeys.some(
        (journey) => journey.kind === 'return' && journey.ownerFactionId === playerFaction,
      ),
    ).toBe(true);

    let sack = reachableCampaignBattle('sack');
    const sackBattle = activeBattle(sack);
    sack = forceBattleOutcome(sack, 'attacker');
    expect(sack.cities.find((city) => city.id === targetCity)?.factionId).toBe(playerFaction);
    expect(sack.battles.find((entry) => entry.id === sackBattle.id)?.intent).toBe('sack');
  });
});
