import { describe, expect, it } from 'vitest';
import { getBattleTimeoutOutcome } from '../../src/v03/battle';
import { estimateCampaignSupply } from '../../src/v03/calendar';
import { executeV03Command } from '../../src/v03/commands';
import { acknowledgeV03Event, advanceV03 } from '../../src/v03/engine';
import { createV03Game } from '../../src/v03/initial-state';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../src/v03/platform/storage';
import type { V03TacticalBattleState } from '../../src/v03/battle';
import type { V03Officer } from '../../src/v03/types';

function prepareRivalMonth() {
  const state = createV03Game('cao', 731);
  state.absoluteDay = 29;
  state.monthIndex = 0;
  state.events.forEach((event) => (event.acknowledged = true));

  const yuan = state.factions.find((faction) => faction.id === 'yuan')!;
  for (const faction of state.factions) {
    if (faction.id !== state.playerFactionId && faction.id !== yuan.id) faction.eliminated = true;
  }

  const source = state.cities.find((city) => city.id === 'ye')!;
  const target = state.cities.find((city) => city.id === 'jinyang')!;
  for (const city of state.cities) {
    if (city.id === source.id || city.id === target.id) continue;
    city.factionId = null;
    city.governorId = null;
    city.governanceMode = 'steward';
    city.pendingAppointment = null;
  }
  for (const officer of state.officers) officer.governorOfCityId = null;
  source.factionId = yuan.id;
  source.food = 1_000_000;
  target.factionId = state.playerFactionId;
  target.governanceMode = 'ruler';
  target.governorId = null;
  target.pendingAppointment = null;
  state.playerCapitalCityId = target.id;
  state.factions.find((faction) => faction.id === state.playerFactionId)!.capitalCityId = target.id;
  yuan.capitalCityId = source.id;

  const leader = state.officers.find((officer) => officer.id === yuan.leaderOfficerId)!;
  const roster: V03Officer[] = [leader];
  for (const officer of state.officers) {
    if (roster.length >= 6) break;
    if (officer.factionId === yuan.id && officer.id !== leader.id) roster.push(officer);
  }
  while (roster.length < 6) {
    const index = roster.length;
    const officer: V03Officer = {
      id: `rival-test-officer-${index}`,
      name: `Rival Officer ${index}`,
      chinese: `测试将领${index}`,
      factionId: yuan.id,
      location: { kind: 'city', cityId: source.id },
      force: 70 + index,
      intellect: 60,
      loyalty: 80,
      age: 35,
      troops: 1000,
      troopType: (['infantry', 'cavalry', 'archer', 'infantry', 'cavalry', 'archer'] as const)[
        index
      ]!,
      experience: 0,
      level: 0,
      governorOfCityId: null,
      alive: true,
    };
    state.officers.push(officer);
    roster.push(officer);
  }
  const troopTypes = ['infantry', 'cavalry', 'archer', 'infantry', 'cavalry', 'archer'] as const;
  roster.forEach((officer, index) => {
    officer.alive = true;
    officer.factionId = yuan.id;
    officer.location = { kind: 'city', cityId: source.id };
    officer.troops = 1000;
    officer.troopType = troopTypes[index]!;
    officer.governorOfCityId = null;
  });
  for (const officer of state.officers) {
    if (
      officer.factionId === yuan.id &&
      officer.location.kind === 'city' &&
      officer.location.cityId === source.id &&
      !roster.includes(officer)
    ) {
      officer.troops = 0;
    }
  }
  source.garrisonTroops = roster.reduce((sum, officer) => sum + officer.troops, 0);
  // The fixture jumps directly to the last day of the month. Seed the daily
  // ledger for the 29 days that would have elapsed in a live campaign.
  source.troopServiceDaysThisMonth = source.garrisonTroops * 29;
  return state;
}

function advanceOneDayAcknowledgingEvents(state: ReturnType<typeof createV03Game>) {
  let next = state;
  for (const event of next.events.filter((entry) => !entry.acknowledged)) {
    next = acknowledgeV03Event(next, event.id);
  }
  return advanceV03(next, 1).state;
}

describe('v0.3 engine rival campaign integration', () => {
  it('dispatches a deterministic independent-city conquest at month settlement with exact accounting and a valid save', () => {
    const initial = prepareRivalMonth();
    const initialSource = initial.cities.find((city) => city.id === 'ye')!;
    const expectedPostSettlementFood =
      initialSource.food +
      Math.floor(initialSource.farming * 2.2 + initialSource.population / 80) -
      Math.ceil(6000 * 0.12);

    const first = advanceV03(initial, 1);
    const second = advanceV03(initial, 1);
    const state = first.state;

    expect(state).toEqual(second.state);
    expect(state.absoluteDay).toBe(30);
    expect(state.directives).toHaveLength(1);
    const directive = state.directives[0]!;
    expect(directive).toMatchObject({
      factionId: 'yuan',
      sourceCityId: 'ye',
      intent: 'conquer',
      status: 'dispatched',
      requestedTroops: 5000,
      proposedTroops: 5000,
      earliestDepartureDay: 30,
    });
    expect(state.cities.find((city) => city.id === directive.targetCityId)?.factionId).toBeNull();
    const journey = state.journeys.find((entry) => entry.id === directive.journeyId);
    expect(journey, JSON.stringify({ directive, journeys: state.journeys })).toBeDefined();
    if (!journey) throw new Error('Rival directive did not retain its created journey.');
    expect(journey.kind).toBe('campaign');
    expect(journey.ownerFactionId).toBe('yuan');
    expect(journey.manifest.troopCount).toBe(5000);
    expect(journey.manifest.officerIds).toHaveLength(5);
    expect(new Set(journey.manifest.officerIds).size).toBe(5);
    expect(journey.manifest.carriedFood).toBe(
      estimateCampaignSupply({
        troopCount: 5000,
        outboundDays: journey.expectedArrivalDay - journey.departedAbsoluteDay,
        battleDays: 30,
        returnDays: journey.expectedArrivalDay - journey.departedAbsoluteDay,
      }).totalFood,
    );

    const source = state.cities.find((city) => city.id === 'ye')!;
    expect(source.garrisonTroops).toBe(1000);
    expect(source.food).toBe(expectedPostSettlementFood - journey.manifest.carriedFood);
    for (const officerId of journey.manifest.officerIds) {
      expect(state.officers.find((officer) => officer.id === officerId)?.location).toEqual({
        kind: 'journey',
        journeyId: journey.id,
      });
    }
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('dispatches only one monthly rival front even when multiple sources are eligible', () => {
    const initial = prepareRivalMonth();
    const source = initial.cities.find((city) => city.id === 'ye')!;
    const secondSource = initial.cities.find((city) => city.id === 'pingyuan')!;
    const yuan = initial.factions.find((faction) => faction.id === 'yuan')!;
    const roster = initial.officers.filter(
      (officer) =>
        officer.factionId === yuan.id &&
        officer.location.kind === 'city' &&
        officer.location.cityId === source.id &&
        officer.troops > 0,
    );
    expect(roster).toHaveLength(6);

    secondSource.factionId = yuan.id;
    secondSource.food = 1_000_000;
    secondSource.garrisonTroops = 3_000;
    secondSource.troopServiceDaysThisMonth = 3_000 * 29;
    for (const [index, officer] of roster.entries()) {
      if (index < 3) {
        officer.location = { kind: 'city', cityId: secondSource.id };
        source.garrisonTroops -= officer.troops;
        source.troopServiceDaysThisMonth =
          (source.troopServiceDaysThisMonth ?? 0) - officer.troops * 29;
      }
    }

    const result = advanceV03(initial, 1).state;
    expect(result.directives).toHaveLength(1);
    expect(new Set(result.directives.map((entry) => entry.sourceCityId)).size).toBe(1);
    const dispatchedJourneys = result.directives
      .map((entry) => result.journeys.find((journey) => journey.id === entry.journeyId))
      .filter((journey) => journey !== undefined);
    expect(dispatchedJourneys).toHaveLength(1);
    const officerIds = dispatchedJourneys.flatMap((journey) => journey.manifest.officerIds);
    expect(new Set(officerIds).size).toBe(officerIds.length);
    expect(validateV03State(result)).toBe(true);
  });

  it('resolves a rival campaign against an independent city and captures it from its militia', () => {
    let state = prepareRivalMonth();
    state = advanceOneDayAcknowledgingEvents(state);
    const directive = state.directives.find((entry) => entry.status === 'dispatched')!;
    const independentCityId = directive.targetCityId;
    expect(state.cities.find((city) => city.id === independentCityId)?.factionId).toBeNull();

    for (
      let day = 0;
      day < 80 && state.cities.find((city) => city.id === independentCityId)?.factionId !== 'yuan';
      day++
    ) {
      state = advanceOneDayAcknowledgingEvents(state);
    }

    const battle = state.battles.find((entry) => entry.attackerJourneyId === directive.journeyId);
    expect(battle?.defenderFactionId).toBeNull();
    expect(battle?.resolved).toBe(true);
    const militia = battle?.battleData.units.find(
      (unit) => unit.side === 'defender' && unit.isMilitia,
    );
    expect(militia?.initialTroops).toBe(500);
    expect(state.cities.find((city) => city.id === independentCityId)?.factionId).toBe('yuan');
    expect(validateV03State(state)).toBe(true);
  });

  it('opens new field battles with survivor-count timeout and awards equal survivors to the defender', () => {
    let state = createV03Game('cao', 481516);
    const issue = executeV03Command(state, {
      type: 'issueCampaignDirective',
      sourceCityId: 'puyang',
      targetCityId: 'xiapi',
      intent: 'conquer',
      requestedTroops: 700,
      requestedByDay: null,
    });
    expect(issue.ok, issue.error).toBe(true);
    state = issue.state;

    for (let day = 0; day < 80 && !state.battles.some((battle) => battle.active); day++) {
      state = advanceOneDayAcknowledgingEvents(state);
    }
    const battle = state.battles.find((entry) => entry.active)!;
    const data = battle.battleData as V03TacticalBattleState;
    expect(data.timeoutPolicy).toBe('survivor-count');
    const attacker = data.units.find((unit) => unit.side === 'attacker')!;
    const defender = data.units.find((unit) => unit.side === 'defender')!;
    const tiedSurvivors: V03TacticalBattleState = {
      ...data,
      units: [
        { ...attacker, troops: 100 },
        { ...defender, troops: 100 },
      ],
    };
    expect(getBattleTimeoutOutcome(tiedSurvivors)).toEqual({
      winner: 'defender',
      reason: 'dayLimit',
    });
  });
});
