import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../../src/v03/commands';
import { createV03Game } from '../../../src/v03/initial-state';
import { completeV03BattleDay } from '../../../src/v03/engine';
import { applyTroopLoss } from '../../../src/v03/campaign/troop-experience';
import { decodeV03Save, encodeV03Save } from '../../../src/v03/platform/storage';
import type { V03GameState, V03Journey } from '../../../src/v03/types';

function shortJourney(journey: V03Journey) {
  journey.routeSnapshot = journey.routeSnapshot.map((s) => ({
    ...s,
    lengthKm: 1,
    fixedDelayDays: 0,
  }));
  journey.segmentProgressKm = journey.routeSnapshot.map(() => 0);
  journey.segmentWaitDays = journey.routeSnapshot.map(() => 0);
}

function advanceUntil(state: V03GameState, done: (s: V03GameState) => boolean) {
  for (let day = 0; day < 10; day++) {
    if (done(state)) return state;
    state.events.forEach((e) => (e.acknowledged = true));
    const result = executeV03Command(state, { type: 'advance', days: 1 });
    expect(result.ok, result.error).toBe(true);
    state = result.state;
  }
  throw new Error('Expected short journey to finish.');
}

function campaign() {
  const state = createV03Game('cao', 481516);
  for (const officer of state.officers) if (officer.troops > 0) officer.troopExperience = 1200;
  const target = state.cities.find((c) => c.id === 'xiapi')!;
  target.garrisonTroops = 600;
  target.garrisonExperience = 750;
  const dispatched = executeV03Command(state, {
    type: 'issueCampaignDirective',
    sourceCityId: 'puyang',
    targetCityId: 'xiapi',
    intent: 'conquer',
    requestedTroops: 700,
    requestedByDay: null,
  });
  expect(dispatched.ok, dispatched.error).toBe(true);
  shortJourney(dispatched.state.journeys[0]!);
  return advanceUntil(dispatched.state, (s) => s.battles.some((b) => b.active));
}

describe('campaign veteran flow', () => {
  it('preserves troop type and fractional experience through a friendly requisition and reload', () => {
    let state = createV03Game('cao', 481516);
    for (const officer of state.officers)
      if (officer.troops > 0) officer.troopExperience = 1066.6666666666667;
    const request = executeV03Command(state, {
      type: 'requestRequisition',
      sourceCityId: 'puyang',
      targetCityId: 'chenliu',
      requested: { gold: 0, food: 0, troops: 700 },
      requestedByDay: null,
    });
    expect(request.ok, request.error).toBe(true);
    const answer = executeV03Command(request.state, {
      type: 'answerRequisition',
      requisitionId: request.state.requisitions[0]!.id,
      answer: 'accept',
    });
    expect(answer.ok, answer.error).toBe(true);
    state = answer.state;
    const journey = state.journeys[0]!;
    const officers = state.officers
      .filter((o) => journey.manifest.officerIds.includes(o.id))
      .map((o) => ({
        id: o.id,
        troops: o.troops,
        troopType: o.troopType,
        troopExperience: o.troopExperience,
      }));
    expect(officers.length).toBeGreaterThan(0);
    shortJourney(journey);
    state = decodeV03Save(encodeV03Save(state))!;
    state = advanceUntil(state, (s) => s.journeys[0]!.deliveredCargo.personnel === 1);
    for (const expected of officers)
      expect(state.officers.find((o) => o.id === expected.id)).toMatchObject({
        ...expected,
        location: { kind: 'city', cityId: 'chenliu' },
      });
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('carries experience into battle and back home without turning survivors into recruits', () => {
    let state = campaign();
    const battle = state.battles.find((b) => b.active)!;
    const attacker = battle.battleData.units.find((u) => u.side === 'attacker')!;
    const militia = battle.battleData.units.find((u) => u.isMilitia)!;
    expect(attacker.troopExperience).toBe(1200);
    expect(militia.troopExperience).toBe(750);
    applyTroopLoss(attacker, 350);
    applyTroopLoss(militia, 300);
    battle.battleData.outcome = { winner: 'defender', reason: 'retreat' };
    state.events.forEach((e) => (e.acknowledged = true));
    const settled = completeV03BattleDay(state, battle.id);
    expect(settled.ok, settled.error).toBe(true);
    state = settled.state;
    const ids = battle.attackerFormationOfficerIds[attacker.id]!;
    expect(
      state.officers.filter((o) => ids.includes(o.id)).reduce((sum, o) => sum + o.troops, 0),
    ).toBe(350);
    expect(
      state.officers.filter((o) => ids.includes(o.id)).every((o) => o.troopExperience === 1200),
    ).toBe(true);
    expect(state.cities.find((c) => c.id === 'xiapi')).toMatchObject({
      garrisonTroops: 300,
      garrisonExperience: 750,
    });
    const returning = state.journeys.find((j) => j.kind === 'return')!;
    shortJourney(returning);
    state = advanceUntil(state, (s) =>
      s.officers.filter((o) => ids.includes(o.id)).every((o) => o.location.kind === 'city'),
    );
    for (const id of ids)
      expect(state.officers.find((o) => o.id === id)).toMatchObject({
        troopExperience: 1200,
        location: { kind: 'city', cityId: 'puyang' },
      });
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('clears experience for annihilated campaign troops as well as the battlefield token', () => {
    const state = campaign();
    const battle = state.battles.find((b) => b.active)!;
    const attackers = battle.battleData.units.filter((u) => u.side === 'attacker');
    attackers.forEach((u) => applyTroopLoss(u, 0));
    battle.battleData.outcome = { winner: 'defender', reason: 'elimination' };
    state.events.forEach((e) => (e.acknowledged = true));
    const settled = completeV03BattleDay(state, battle.id);
    expect(settled.ok, settled.error).toBe(true);
    for (const id of Object.values(battle.attackerFormationOfficerIds).flat())
      expect(settled.state.officers.find((o) => o.id === id)).toMatchObject({
        troops: 0,
        troopExperience: 0,
      });
    expect(decodeV03Save(encodeV03Save(settled.state))).toEqual(settled.state);
  });
});
