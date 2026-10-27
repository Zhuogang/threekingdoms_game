import { preparePuyangArmy } from './helpers/army-fixture';
import { describe, expect, it, vi } from 'vitest';
// Isolate commanded campaigns; rival dispatch has a dedicated integration suite.
vi.mock('../../src/v03/strategic-ai', async (original) => ({
  ...(await original<typeof import('../../src/v03/strategic-ai')>()),
  planStrategicRivalCampaigns: () => [],
}));
import {
  advanceV03,
  applyV03BattleAction,
  completeV03BattleDay,
  v03BattleForState,
} from '../../src/v03/engine';
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
  preparePuyangArmy(state);
  // A tactical-battle fixture needs real defenders now that empty cities do not spawn militia.
  const target = state.cities.find((city) => city.id === targetCity)!;
  if (target.garrisonTroops === 0) {
    target.garrisonTroops = 500;
    target.population -= 500;
  }
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
  throw new Error(
    `Campaign did not reach a battle within ${maxDays} days: ${JSON.stringify({
      day: state.absoluteDay,
      phase: state.phase,
      journeys: state.journeys.map(({ id, status, elapsedDays, expectedArrivalDay }) => ({
        id,
        status,
        elapsedDays,
        expectedArrivalDay,
      })),
    })}`,
  );
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
  const result = completeV03BattleDay(next, battle.id);
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

  it('continues a journey that is one day behind its estimated arrival', () => {
    let state = createV03Game(playerFaction, 9091);
    const request = executeV03Command(state, {
      type: 'requestRequisition',
      sourceCityId: 'chenliu',
      targetCityId: 'xuchang',
      requested: { gold: 100, food: 0, troops: 0 },
      requestedByDay: null,
    });
    expect(request.ok, request.error).toBe(true);
    const accepted = executeV03Command(request.state, {
      type: 'answerRequisition',
      requisitionId: request.state.requisitions[0]!.id,
      answer: 'accept',
    });
    expect(accepted.ok, accepted.error).toBe(true);
    state = accepted.state;
    const journey = state.journeys[0]!;
    state.absoluteDay = 1;
    journey.departedAbsoluteDay = 0;
    journey.expectedArrivalDay = 1;
    journey.elapsedDays = 1;
    journey.routeSnapshot = [
      {
        terrain: 'plain',
        lengthKm: 20,
        baseSpeedKmPerDay: 10,
        speedMultiplier: 1,
        fixedDelayDays: 0,
      },
    ];
    journey.segmentProgressKm = [10];
    journey.segmentWaitDays = [0];
    state.events.forEach((event) => (event.acknowledged = true));

    const advanced = executeV03Command(state, { type: 'advance', days: 1 });
    expect(advanced.ok, advanced.error).toBe(true);
    expect(advanced.state.absoluteDay).toBe(2);
    expect(advanced.state.journeys[0]?.status).toBe('delivered');
    expect(advanced.state.events.some((event) => event.kind === 'journeyArrival')).toBe(true);
  });

  it('recalls a dispatched campaign before battle and returns the remaining force and provisions', () => {
    const issued = issueCampaign();
    for (const officer of issued.officers)
      if (officer.factionId !== playerFaction) officer.troops = 0;
    for (const city of issued.cities) if (city.factionId !== playerFaction) city.garrisonTroops = 0;
    const outbound = issued.journeys.find((entry) => entry.kind === 'campaign')!;
    const requested = executeV03Command(issued, {
      type: 'recallJourney',
      journeyId: outbound.id,
    });
    expect(requested.ok, requested.error).toBe(true);
    expect(
      requested.state.journeys.find((entry) => entry.id === outbound.id)?.returnRequested,
    ).toBe(true);
    const turned = advanceUntil(
      requested.state,
      (current) =>
        current.journeys.some(
          (entry) => entry.kind === 'return' && entry.executionId.includes(':recall'),
        ),
      outbound.expectedArrivalDay + 2,
    );
    const returnJourney = turned.journeys.find(
      (entry) => entry.kind === 'return' && entry.executionId.includes(':recall'),
    )!;
    expect(turned.battles).toHaveLength(0);
    expect(turned.journeys.find((entry) => entry.id === outbound.id)?.status).toBe('cancelled');
    expect(returnJourney.elapsedDays).toBe(0);
    expect(validateV03State(turned)).toBe(true);

    const returned = advanceUntil(
      turned,
      (current) =>
        current.journeys.find((entry) => entry.id === returnJourney.id)?.status === 'delivered',
      returnJourney.expectedArrivalDay - turned.absoluteDay + 2,
    );
    expect(
      returned.cities.find((city) => city.id === sourceCity)?.garrisonTroops,
    ).toBeGreaterThanOrEqual(campaignStrength);
    expect(validateV03State(returned)).toBe(true);
  });

  it('lets a dispatched requisition waiting at a full warehouse return without losing cargo', () => {
    let state = createV03Game(playerFaction, 8128);
    const source = state.cities.find((city) => city.id === 'chenliu')!;
    const target = state.cities.find((city) => city.id === 'xuchang')!;
    source.gold = 500;
    target.gold = 9_999_950;
    const requested = executeV03Command(state, {
      type: 'requestRequisition',
      sourceCityId: source.id,
      targetCityId: target.id,
      requested: { gold: 100, food: 0, troops: 0 },
      requestedByDay: null,
    });
    expect(requested.ok, requested.error).toBe(true);
    state = requested.state;
    const order = state.requisitions[0]!;
    const accepted = executeV03Command(state, {
      type: 'answerRequisition',
      requisitionId: order.id,
      answer: 'accept',
    });
    expect(accepted.ok, accepted.error).toBe(true);
    const outbound = accepted.state.journeys[0]!;
    const waiting = advanceUntil(
      accepted.state,
      (current) => current.journeys.find((entry) => entry.id === outbound.id)?.status === 'waiting',
      outbound.expectedArrivalDay + 3,
    );
    const recalled = executeV03Command(waiting, { type: 'recallJourney', journeyId: outbound.id });
    expect(recalled.ok, recalled.error).toBe(true);
    const returning = recalled.state.journeys.find((entry) => entry.kind === 'return')!;
    expect(returning.elapsedDays).toBe(0);
    expect(recalled.state.requisitions[0]?.status).toBe('cancelled');
    const delivered = advanceUntil(
      recalled.state,
      (current) =>
        current.journeys.find((entry) => entry.id === returning.id)?.status === 'delivered',
      returning.expectedArrivalDay - recalled.state.absoluteDay + 3,
    );
    expect(delivered.cities.find((city) => city.id === 'chenliu')?.gold).toBeGreaterThan(400);
    expect(validateV03State(delivered)).toBe(true);
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
    const advanced = executeV03Command(ready, {
      type: 'completeBattleDay',
      battleId: battle.id,
    });
    expect(advanced.ok, advanced.error).toBe(true);
    const after = v03BattleForState(advanced.state, battle.id)!;
    expect(after.day).toBe(beforeDay.day + 1);
    expect(advanced.state.absoluteDay).toBe(restored.absoluteDay + 1);
  });

  it('round-trips officer tactics and keeps tactic-raided supplies in campaign aftermath state', () => {
    const state = reachableCampaignBattle();
    const battle = activeBattle(state);
    const data = tactical(battle);
    expect(data.supplies).toEqual({ attacker: battle.attackerFood, defender: battle.defenderFood });
    expect(data.units.some((unit) => unit.intellect !== 40 || unit.level > 0 || unit.cunning)).toBe(
      true,
    );
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);

    const source = data.units.find((unit) => unit.side === data.playerSide)!;
    const target = data.units.find((unit) => unit.side !== data.playerSide)!;
    source.x = 10;
    source.y = 10;
    source.troopType = 'cavalry';
    source.intellect = 100;
    source.level = 3;
    source.cunning = false;
    source.moved = false;
    source.acted = false;
    target.x = 11;
    target.y = 10;
    data.tacticPoints[data.playerSide] = 30;
    data.supplies[target.side] = 1_000;
    if (target.side === 'attacker') battle.attackerFood = 1_000;
    else battle.defenderFood = 1_000;
    const result = applyV03BattleAction(state, battle.id, {
      type: 'tactic',
      unitId: source.id,
      tactic: 'raidSupply',
      targetId: target.id,
    });
    expect(result.ok, result.error).toBe(true);
    const updated = result.state.battles.find((entry) => entry.id === battle.id)!;
    expect(updated.battleData.supplies[target.side]).toBeLessThan(1_000);
    expect(target.side === 'attacker' ? updated.attackerFood : updated.defenderFood).toBe(
      updated.battleData.supplies[target.side],
    );
    expect(validateV03State(result.state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });

  it('waits for each active player battle to submit before advancing the shared day', () => {
    let state = acknowledgePendingEvents(reachableCampaignBattle());
    const first = activeBattle(state);
    const second = structuredClone(first);
    second.id = 'battle-second';
    second.mapId = 'map-second';
    second.battleData.id = second.id;
    second.battleData.map.mapId = second.mapId;
    second.attackerFactionId = 'sun';
    second.defenderFactionId = playerFaction;
    second.battleData.playerSide = 'defender';
    state.battles.push(second);
    const day = state.absoluteDay;
    const battleDay = first.battleData.day;

    const firstSubmitted = completeV03BattleDay(state, first.id);
    expect(firstSubmitted.ok).toBe(true);
    expect(firstSubmitted.advancedWorldDay).toBe(false);
    expect(firstSubmitted.state.absoluteDay).toBe(day);
    expect(
      firstSubmitted.state.battles.find((battle) => battle.id === first.id)?.playerDayComplete,
    ).toBe(true);
    const rejectedAction = applyV03BattleAction(firstSubmitted.state, first.id, {
      type: 'wait',
      unitId: first.battleData.units.find((unit) => unit.side === first.battleData.playerSide)!.id,
    });
    expect(rejectedAction.ok).toBe(false);

    const secondSubmitted = completeV03BattleDay(firstSubmitted.state, second.id);
    expect(secondSubmitted.ok).toBe(true);
    expect(secondSubmitted.advancedWorldDay).toBe(true);
    expect(secondSubmitted.state.absoluteDay).toBe(day + 1);
    expect(
      secondSubmitted.state.battles.find((battle) => battle.id === first.id)?.battleData.day,
    ).toBe(battleDay + 1);
    expect(
      secondSubmitted.state.battles.every((battle) => !battle.active || !battle.playerDayComplete),
    ).toBe(true);
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
    const advanced = executeV03Command(state, {
      type: 'completeBattleDay',
      battleId: battle.id,
    });
    expect(advanced.ok, advanced.error).toBe(true);
    const resolved = advanced.state.battles.find((entry) => entry.id === battle.id)!;
    const result = resolved.battleData as V03TacticalBattleState;
    expect(result.outcome).toEqual({ winner: null, reason: 'dayLimit' });
    expect(resolved.resolved).toBe(true);
    expect(resolved.outcome).toBe('draw');
    expect(validateV03State(advanced.state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(advanced.state))).toEqual(advanced.state);
  });

  it.each([
    { label: 'attacker majority', margin: 1, winner: 'attacker' },
    { label: 'defender tie-break', margin: 0, winner: 'defender' },
  ] as const)(
    'applies the default 30-day survivor-count result to the strategic city after a $label',
    ({ margin, winner }) => {
      let state = reachableCampaignBattle();
      const battle = activeBattle(state);
      const data = tactical(battle);
      const targetOwner = state.cities.find((city) => city.id === targetCity)!.factionId;
      const attacker = data.units.find((unit) => unit.side === 'attacker')!;
      const defender = data.units.find((unit) => unit.side === 'defender')!;

      expect(data.dayLimit).toBe(30);
      expect(data.timeoutPolicy).toBe('survivor-count');
      data.day = 30;
      data.map.terrain = Array.from({ length: data.map.width * data.map.height }, () => 'plain');
      const sharedSurvivors = Math.min(attacker.initialTroops, defender.initialTroops);
      const attackerTroops = sharedSurvivors;
      const defenderTroops = sharedSurvivors - (margin > 0 ? 1 : 0);
      data.supplies = { attacker: 100000, defender: 100000 };
      battle.attackerFood = data.supplies.attacker;
      battle.defenderFood = data.supplies.defender;
      for (const unit of data.units) {
        const sideIndex = data.units
          .filter((candidate) => candidate.side === unit.side)
          .indexOf(unit);
        unit.troops =
          unit.id === attacker.id ? attackerTroops : unit.id === defender.id ? defenderTroops : 0;
        unit.morale = 80;
        unit.status = 'normal';
        unit.x = unit.side === 'attacker' ? 4 + sideIndex : 19 - sideIndex;
        unit.y = 5 + sideIndex;
        unit.moved = true;
        unit.acted = true;
      }
      state = acknowledgePendingEvents(state);

      const resolved = completeV03BattleDay(state, battle.id);

      expect(resolved.ok, resolved.error).toBe(true);
      const strategicBattle = resolved.state.battles.find((entry) => entry.id === battle.id)!;
      const result = tactical(strategicBattle);
      expect(result.outcome).toEqual({ winner, reason: 'dayLimit' });
      expect(strategicBattle.resolved).toBe(true);
      expect(strategicBattle.outcome).toBe(winner);
      expect(resolved.state.cities.find((city) => city.id === targetCity)?.factionId).toBe(
        winner === 'attacker' ? playerFaction : targetOwner,
      );
      expect(validateV03State(resolved.state)).toBe(true);
    },
  );

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
    journey.routeCityIds = ['changan', state.playerCapitalCityId];
    journey.intent = 'conquer';
    journey.manifest = {
      ...journey.manifest,
      officerIds: [invader.id],
      troopCount: attackerUnit.troops,
    };
    const directive = state.directives.find((entry) => entry.journeyId === journey.id)!;
    directive.factionId = 'dong';
    directive.sourceCityId = 'changan';
    directive.targetCityId = state.playerCapitalCityId;
    directive.intent = 'conquer';

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

    const result = executeV03Command(state, {
      type: 'completeBattleDay',
      battleId: originalBattle.id,
    });
    expect(result.ok, result.error).toBe(true);
    expect(
      result.state.cities.find((city) => city.id === state.playerCapitalCityId)?.factionId,
    ).toBe('dong');
    const player = result.state.factions.find((faction) => faction.id === playerFaction)!;
    expect(result.state.playerCapitalCityId).toBe(player.capitalCityId);
    expect(validateV03State(result.state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });

  it('preserves unstaffed militia and charges its share of monthly upkeep', () => {
    const state = createV03Game(playerFaction, 85);
    const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    const staffedTroops = state.officers
      .filter(
        (officer) =>
          officer.alive &&
          officer.factionId === city.factionId &&
          officer.location.kind === 'city' &&
          officer.location.cityId === city.id,
      )
      .reduce((sum, officer) => sum + officer.troops, 0);
    const cavalry = state.officers
      .filter(
        (o) =>
          o.alive &&
          o.factionId === city.factionId &&
          o.location.kind === 'city' &&
          o.location.cityId === city.id &&
          o.troopType === 'cavalry',
      )
      .reduce((sum, o) => sum + o.troops, 0);
    city.cavalryServiceDaysThisMonth = cavalry * 29;
    const militia = 100;
    city.reserve = 0;
    for (const pool of Object.values(city.reservePools))
      Object.assign(pool, { troops: 0, troopExperience: 0 });
    city.garrisonTroops = staffedTroops + militia;
    city.troopServiceDaysThisMonth = (staffedTroops + militia) * 29;
    city.food = 1_000_000;
    state.absoluteDay = 29;
    state.monthIndex = 0;
    state.events.forEach((event) => (event.acknowledged = true));

    const result = advanceV03(state, 1);
    const settledCity = result.state.cities.find((entry) => entry.id === city.id)!;
    const foodUpkeep = Math.ceil((staffedTroops + militia + cavalry) * 0.12);
    const harvest = Math.floor(city.farming * 2.2 + city.population / 80);

    expect(result.state.absoluteDay).toBe(30);
    expect(settledCity.garrisonTroops).toBe(staffedTroops + militia);
    expect(settledCity.food).toBe(1_000_000 + harvest - foodUpkeep);
    expect(validateV03State(result.state)).toBe(true);
  });

  it('starts accruing city service days only after a dispatched party reaches its destination', () => {
    let state = issueCampaign();
    const source = state.cities.find((city) => city.id === 'puyang')!;
    const target = state.cities.find((city) => city.id === 'xiapi')!;
    for (const city of state.cities) {
      city.garrisonTroops = 0;
      city.troopServiceDaysThisMonth = 0;
      city.reserve = 0;
      for (const pool of Object.values(city.reservePools))
        Object.assign(pool, { troops: 0, troopExperience: 0 });
    }
    for (const officer of state.officers) officer.troops = 0;
    const journey = state.journeys[0]!;
    for (const officerId of journey.manifest.officerIds) {
      state.officers.find((officer) => officer.id === officerId)!.troops = campaignStrength;
    }
    source.troopServiceDaysThisMonth = 27 * campaignStrength;
    state.absoluteDay = 27;
    state.monthIndex = 0;
    target.factionId = playerFaction;
    journey.segmentProgressKm = journey.routeSnapshot.map((segment) => segment.lengthKm);
    journey.segmentWaitDays = journey.routeSnapshot.map(() => 0);
    journey.expectedArrivalDay = 28;
    state.events.forEach((event) => (event.acknowledged = true));

    const arrived = advanceV03(state, 1);
    expect(arrived.daysAdvanced).toBe(1);
    expect(arrived.state.absoluteDay).toBe(28);
    expect(arrived.state.journeys.find((entry) => entry.id === journey.id)?.status).toBe(
      'delivered',
    );
    expect(
      arrived.state.cities.find((city) => city.id === source.id)?.troopServiceDaysThisMonth,
    ).toBe(27 * campaignStrength);
    expect(
      arrived.state.cities.find((city) => city.id === target.id)?.troopServiceDaysThisMonth,
    ).toBe(0);

    arrived.state.events.forEach((event) => (event.acknowledged = true));
    const stationedDay = advanceV03(arrived.state, 1);
    expect(stationedDay.state.absoluteDay).toBe(29);
    expect(
      stationedDay.state.cities.find((city) => city.id === target.id)?.troopServiceDaysThisMonth,
    ).toBe(campaignStrength);
    expect(validateV03State(decodeV03Save(encodeV03Save(stationedDay.state)))).toBe(true);
  });

  it('runs autonomous work during battle and allows direct work in an uncommitted capital', () => {
    let state = acknowledgePendingEvents(reachableCampaignBattle());
    expect(state.battles.some((entry) => entry.active)).toBe(true);
    const governorCity = state.cities.find(
      (city) =>
        city.factionId === playerFaction &&
        city.id !== state.playerCapitalCityId &&
        !state.journeys.some(
          (journey) =>
            journey.ownerFactionId !== playerFaction &&
            journey.destinationCityId === city.id &&
            (journey.status === 'outbound' || journey.status === 'waiting'),
        ) &&
        !state.battles.some((entry) => {
          if (!entry.active) return false;
          return (
            state.journeys.find((journey) => journey.id === entry.attackerJourneyId)
              ?.destinationCityId === city.id
          );
        }),
    );
    const manager = state.officers.find(
      (officer) =>
        officer.alive && officer.factionId === playerFaction && officer.location.kind === 'city',
    );
    expect(governorCity).toBeDefined();
    expect(manager).toBeDefined();
    const city = governorCity!;
    const governor = manager!;

    if (governor.governorOfCityId) {
      const previousCity = state.cities.find((entry) => entry.id === governor.governorOfCityId);
      if (previousCity?.governorId === governor.id) {
        previousCity.governorId = null;
        previousCity.governanceMode = 'steward';
      }
    }
    for (const officer of state.officers) {
      if (
        officer.id !== governor.id &&
        officer.alive &&
        officer.factionId === playerFaction &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id
      ) {
        if (officer.governorOfCityId === city.id) officer.governorOfCityId = null;
        officer.location = { kind: 'city', cityId: state.playerCapitalCityId };
        officer.troops = 0;
      }
    }
    governor.location = { kind: 'city', cityId: city.id };
    governor.governorOfCityId = city.id;
    governor.troops = 0;
    city.governorId = governor.id;
    city.governanceMode = 'governor';
    city.garrisonTroops = 0;
    city.reserve = 0;
    city.reservePools = {
      infantry: { troops: 0, troopExperience: 0 },
      archer: { troops: 0, troopExperience: 0 },
      cavalry: { troops: 0, troopExperience: 0 },
    };
    city.population = 1_000;
    city.farming = 0;
    city.commerce = 100;
    city.gold = 1_000;
    city.food = 0;

    state.absoluteDay = 29;
    state.monthIndex = 0;
    state.dayResolution = null;
    state.phase = 'battle';
    for (const active of state.battles.filter((entry) => entry.active))
      active.playerDayComplete = true;

    const directWork = executeV03Command(state, {
      type: 'cityAction',
      cityId: state.playerCapitalCityId,
      action: 'develop-farming',
    });
    expect(directWork.ok).toBe(true);
    expect(directWork.state).not.toBe(state);

    const advanced = advanceV03(state, 1);
    expect(advanced.daysAdvanced).toBe(1);
    expect(advanced.state.battles.some((entry) => entry.active)).toBe(true);
    const settledCity = advanced.state.cities.find((entry) => entry.id === city.id)!;
    expect(settledCity.farming).toBe(1);
    expect(settledCity.workMonthIndex).toBe(1);
    expect(settledCity.workPointsUsed).toBe(1);
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

  it('keeps a full-warehouse requisition intact and unloads it exactly once when capacity opens', () => {
    let state = createV03Game(playerFaction, 4242);
    const target = state.cities.find((city) => city.id === 'xuchang')!;
    target.gold = 9_999_999;
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
    journey.segmentProgressKm = journey.routeSnapshot.map((segment) => segment.lengthKm);
    journey.segmentWaitDays = journey.routeSnapshot.map(() => 0);
    state.absoluteDay = 1;
    state.monthIndex = 0;
    journey.departedAbsoluteDay = 1;
    journey.expectedArrivalDay = 2;
    state.events.forEach((event) => (event.acknowledged = true));

    const blocked = executeV03Command(state, { type: 'advance', days: 1 });
    expect(blocked.ok, blocked.error).toBe(true);
    expect(blocked.state.journeys[0]?.status).toBe('waiting');
    expect(blocked.state.journeys[0]?.manifest.cargo.gold).toBe(200);
    expect(blocked.state.journeys[0]?.deliveredCargo).toEqual({});
    expect(blocked.state.requisitions[0]?.status).toBe('waiting');
    expect(decodeV03Save(encodeV03Save(blocked.state))).toEqual(blocked.state);

    const waiting = structuredClone(blocked.state);
    waiting.cities.find((city) => city.id === 'xuchang')!.gold = 100;
    waiting.events.forEach((event) => (event.acknowledged = true));
    const delivered = executeV03Command(waiting, { type: 'advance', days: 1 });
    expect(delivered.ok, delivered.error).toBe(true);
    expect(delivered.state.cities.find((city) => city.id === 'xuchang')?.gold).toBe(300);
    expect(delivered.state.journeys[0]?.deliveredCargo.gold).toBe(200);
    expect(delivered.state.journeys[0]?.status).toBe('delivered');
    expect(delivered.state.requisitions[0]?.status).toBe('delivered');
  });

  it.each(['conquer', 'raid', 'sack'] as const)(
    'does not enlist or capture neutral local officers during %s',
    (intent) => {
      let state = issueCampaign(intent);
      const residents = state.officers
        .filter(
          (officer) =>
            officer.alive &&
            officer.factionId === null &&
            officer.location.kind === 'city' &&
            officer.location.cityId === targetCity,
        )
        .map((officer) => officer.id);
      expect(residents.length).toBeGreaterThan(0);
      state = advanceUntilBattle(state);
      const battle = activeBattle(state);
      expect(Object.values(battle.defenderFormationOfficerIds).flat()).toEqual([]);
      for (const id of residents)
        expect(state.officers.find((officer) => officer.id === id)!.location).toEqual({
          kind: 'city',
          cityId: targetCity,
        });
      state = forceBattleOutcome(state, 'attacker');
      for (const id of residents)
        expect(state.officers.find((officer) => officer.id === id)).toMatchObject({
          alive: true,
          factionId: null,
          location: { kind: 'city', cityId: targetCity },
        });
      expect(validateV03State(state)).toBe(true);
    },
  );

  it('uses distinct roster ids for a staffed infantry formation and unstaffed militia', () => {
    let state = issueCampaign();
    const target = state.cities.find((city) => city.id === targetCity)!;
    target.garrisonTroops = 1_100;
    // A staffed force belongs to an actual defending faction, not neutral residents.
    target.factionId = 'yuan';
    const defender = state.officers.find((officer) => officer.id === 'guotu')!;
    defender.factionId = 'yuan';
    defender.location = { kind: 'city', cityId: target.id };
    defender.troops = 1_000;
    state = advanceUntilBattle(state);
    const battle = activeBattle(state);
    const defenderUnits = battle.battleData.units.filter((unit) => unit.side === 'defender');
    expect(defenderUnits.map((unit) => unit.id)).toHaveLength(
      new Set(defenderUnits.map((unit) => unit.id)).size,
    );
    expect(defenderUnits.filter((unit) => unit.troopType === 'infantry')).toHaveLength(2);
    expect(defenderUnits.reduce((sum, unit) => sum + unit.troops, 0)).toBe(1_100);
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('rejects commands for a battle that does not include the player faction', () => {
    const state = reachableCampaignBattle();
    const battle = activeBattle(state);
    const nonparticipant = structuredClone(state);
    nonparticipant.playerFactionId = 'sun';
    nonparticipant.battles.find((entry) => entry.id === battle.id)!.battleData.playerSide =
      'defender';
    const unit = nonparticipant.battles
      .find((entry) => entry.id === battle.id)!
      .battleData.units.find((entry) => entry.side === 'defender')!;
    const result = applyV03BattleAction(nonparticipant, battle.id, {
      type: 'wait',
      unitId: unit.id,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('player-controlled');
    expect(result.state).toBe(nonparticipant);
  });

  it('keeps raid plunder in return cargo until it reaches friendly territory', () => {
    let state = reachableCampaignBattle('raid');
    const battle = activeBattle(state);
    const home = state.cities.find((city) => city.id === sourceCity)!;
    home.gold = 1_000;
    home.food = 500;
    const resolved = forceBattleOutcome(state, 'attacker');
    const resolvedHome = resolved.cities.find((city) => city.id === sourceCity)!;
    const returnJourney = resolved.journeys.find(
      (journey) => journey.kind === 'return' && journey.ownerFactionId === playerFaction,
    )!;
    const resolvedBattle = resolved.battles.find((entry) => entry.id === battle.id)!;
    expect(resolvedHome.gold).toBe(1_000);
    expect(resolvedHome.food).toBe(500);
    expect(returnJourney.manifest.cargo.gold).toBe(resolvedBattle.loot?.gold);
    expect(returnJourney.manifest.cargo.food).toBe(resolvedBattle.loot?.food);

    const readyToArrive = structuredClone(resolved);
    readyToArrive.absoluteDay = 30;
    readyToArrive.monthIndex = 1;
    const returnState = readyToArrive.journeys.find((journey) => journey.id === returnJourney.id)!;
    returnState.departedAbsoluteDay = 30;
    returnState.expectedArrivalDay = 31;
    returnState.segmentProgressKm = returnState.routeSnapshot.map((segment) => segment.lengthKm);
    returnState.segmentWaitDays = returnState.routeSnapshot.map(() => 0);
    readyToArrive.events.forEach((event) => (event.acknowledged = true));
    const arrived = executeV03Command(readyToArrive, { type: 'advance', days: 1 });
    expect(arrived.ok, arrived.error).toBe(true);
    expect(arrived.state.cities.find((city) => city.id === sourceCity)?.gold).toBe(
      1_000 + (resolvedBattle.loot?.gold ?? 0),
    );
    const deliveredReturn = arrived.state.journeys.find(
      (journey) => journey.id === returnJourney.id,
    )!;
    expect(deliveredReturn.consumedFood).toBeGreaterThan(0);
    expect(arrived.state.cities.find((city) => city.id === sourceCity)?.food).toBe(
      500 + (deliveredReturn.manifest.cargo.food ?? 0) + deliveredReturn.manifest.carriedFood,
    );
    expect(arrived.state.journeys.find((journey) => journey.id === returnJourney.id)?.status).toBe(
      'delivered',
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
    expect(returning?.elapsedDays).toBe(0);
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

  it('pauses a multi-day advance on a monthly shortage report', () => {
    const state = createV03Game(playerFaction, 8181);
    const capital = state.cities.find((city) => city.id === state.playerCapitalCityId)!;
    capital.food = 0;
    capital.troopServiceDaysThisMonth = 100_000_000;
    state.absoluteDay = 29;
    state.monthIndex = 0;
    state.events.forEach((event) => (event.acknowledged = true));
    const result = executeV03Command(state, { type: 'advance', days: 10 });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.absoluteDay).toBe(30);
    expect(result.orderId).toBeDefined();
    expect(
      result.state.events.some(
        (event) => event.kind === 'monthBoundary' && event.absoluteDay === 30,
      ),
    ).toBe(true);
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
