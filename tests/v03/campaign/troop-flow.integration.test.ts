import { preparePuyangArmy } from '../helpers/army-fixture';
import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../../src/v03/commands';
import { createV03Game } from '../../../src/v03/initial-state';
import { applyV03BattleAction, completeV03BattleDay } from '../../../src/v03/engine';
import { battleExperienceGain } from '../../../src/v03/battle/experience';
import { applyTroopLoss } from '../../../src/v03/campaign/troop-experience';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
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

function campaign(
  setup?: (state: V03GameState) => void,
  requestedTroops = 700,
  officerIds?: string[] | (() => string[]),
) {
  const state = createV03Game('cao', 481516);
  preparePuyangArmy(state);
  for (const officer of state.officers) if (officer.troops > 0) officer.troopExperience = 1200;
  const target = state.cities.find((c) => c.id === 'xiapi')!;
  target.garrisonTroops = 600;
  target.garrisonExperience = 750;
  setup?.(state);
  const selectedOfficerIds = typeof officerIds === 'function' ? officerIds() : officerIds;
  const dispatched = executeV03Command(
    state,
    selectedOfficerIds
      ? {
          type: 'marchArmy',
          sourceCityId: 'puyang',
          targetCityId: 'xiapi',
          intent: 'conquer',
          officerIds: selectedOfficerIds,
        }
      : {
          type: 'issueCampaignDirective',
          sourceCityId: 'puyang',
          targetCityId: 'xiapi',
          intent: 'conquer',
          requestedTroops,
          requestedByDay: null,
        },
  );
  expect(dispatched.ok, dispatched.error).toBe(true);
  expect(
    dispatched.state.journeys.length,
    JSON.stringify(dispatched.state.directives),
  ).toBeGreaterThan(0);
  shortJourney(dispatched.state.journeys[0]!);
  return advanceUntil(dispatched.state, (s) => s.battles.some((b) => b.active));
}

describe('campaign veteran flow', () => {
  it('preserves troop type and fractional experience through a friendly requisition and reload', () => {
    let state = createV03Game('cao', 481516);
    preparePuyangArmy(state);
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
    attackers.forEach((u) => {
      u.combatCasualtiesDealt = 300;
      u.combatCasualtiesReceived = u.troops;
      applyTroopLoss(u, 0);
    });
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

  it('settles real attack and counterattack experience once after retreat, including militia', () => {
    let state = campaign();
    const battle = state.battles.find((b) => b.active)!;
    battle.battleData.map.terrain.fill('plain');
    const attacker = battle.battleData.units.find((u) => u.side === 'attacker')!;
    const defender = battle.battleData.units.find((u) => u.side === 'defender')!;
    Object.assign(attacker, { x: 10, y: 10 });
    Object.assign(defender, { x: 11, y: 10 });
    const officerIds = battle.attackerFormationOfficerIds[attacker.id]!;
    const personal = state.officers
      .filter((o) => officerIds.includes(o.id))
      .map((o) => ({ id: o.id, experience: o.experience, level: o.level }));
    state.events.forEach((e) => (e.acknowledged = true));
    const attack = applyV03BattleAction(state, battle.id, {
      type: 'attack',
      unitId: attacker.id,
      targetId: defender.id,
    });
    expect(attack.ok, attack.error).toBe(true);
    const data = attack.state.battles.find((b) => b.id === battle.id)!.battleData;
    const engagedAttacker = data.units.find((u) => u.id === attacker.id)!;
    const engagedDefender = data.units.find((u) => u.id === defender.id)!;
    expect(data.outcome).toBeNull();
    expect(engagedAttacker.combatCasualtiesDealt).toBeGreaterThan(0);
    expect(engagedDefender.combatCasualtiesDealt).toBeGreaterThan(0);
    expect(engagedAttacker.troopExperience).toBe(1200);
    const outcome = { winner: 'defender' as const, reason: 'retreat' as const };
    const attackerGain = battleExperienceGain(engagedAttacker, outcome);
    const defenderGain = battleExperienceGain(engagedDefender, outcome);
    state = decodeV03Save(encodeV03Save(attack.state))!;
    expect(state).toEqual(attack.state);
    const missing = structuredClone(state);
    delete (missing.battles[0]!.battleData.units[0] as unknown as Record<string, unknown>)
      .combatCasualtiesDealt;
    expect(validateV03State(missing)).toBe(false);
    const retreat = applyV03BattleAction(state, battle.id, {
      type: 'retreat',
      unitId: attacker.id,
    });
    expect(retreat.ok, retreat.error).toBe(true);
    state = decodeV03Save(encodeV03Save(retreat.state))!;
    expect(state).toEqual(retreat.state);
    for (const original of personal) {
      expect(state.officers.find((o) => o.id === original.id)).toMatchObject({
        ...original,
        troopExperience: 1200 + attackerGain,
      });
    }
    expect(state.cities.find((c) => c.id === 'xiapi')!.garrisonExperience).toBe(750 + defenderGain);
    const report = state.events.find(
      (e) => e.entityId === battle.id && e.battleOutcome,
    )!.battleOutcome!;
    expect(report.attacker.troopGrowth[0]).toMatchObject({
      officerId: officerIds[0],
      beforeExperience: 1200,
      afterExperience: 1200 + attackerGain,
      participated: true,
    });
    expect(report.defender.troopGrowth[0]).toMatchObject({
      officerId: null,
      beforeExperience: 750,
      afterExperience: 750 + defenderGain,
    });
    const repeated = applyV03BattleAction(state, battle.id, {
      type: 'retreat',
      unitId: attacker.id,
    });
    expect(repeated.ok).toBe(false);
    expect(repeated.state).toEqual(state);
    const returning = state.journeys.find((j) => j.kind === 'return')!;
    shortJourney(returning);
    state = advanceUntil(state, (s) =>
      s.officers.filter((o) => officerIds.includes(o.id)).every((o) => o.location.kind === 'city'),
    );
    for (const id of officerIds)
      expect(state.officers.find((o) => o.id === id)!.troopExperience).toBe(1200 + attackerGain);
  });

  it('does not turn actual battle starvation into participation experience', () => {
    let state = campaign();
    const battle = state.battles.find((b) => b.active)!;
    const attacker = battle.battleData.units.find((u) => u.side === 'attacker')!;
    battle.attackerFood = 0;
    battle.defenderFood = 0;
    battle.battleData.supplies = { attacker: 0, defender: 0 };
    battle.battleData.units.forEach((u) => {
      u.acted = true;
      u.moved = true;
    });
    state.events.forEach((e) => (e.acknowledged = true));
    const day = completeV03BattleDay(state, battle.id);
    expect(day.ok, day.error).toBe(true);
    state = day.state;
    const hungryBattle = state.battles.find((b) => b.id === battle.id)!;
    expect(hungryBattle.foodShortfallDays).toBeGreaterThan(0);
    const hungryAttacker = hungryBattle.battleData.units.find((u) => u.id === attacker.id)!;
    expect(hungryAttacker.troops).toBeLessThan(attacker.troops);
    for (const unit of hungryBattle.battleData.units) {
      expect(unit.combatCasualtiesDealt).toBe(0);
      expect(unit.combatCasualtiesReceived).toBe(0);
    }
    state.events.forEach((e) => (e.acknowledged = true));
    const retreat = applyV03BattleAction(state, battle.id, {
      type: 'retreat',
      unitId: attacker.id,
    });
    expect(retreat.ok, retreat.error).toBe(true);
    for (const id of battle.attackerFormationOfficerIds[attacker.id]!)
      expect(retreat.state.officers.find((o) => o.id === id)!.troopExperience).toBe(1200);
    expect(retreat.state.cities.find((c) => c.id === 'xiapi')!.garrisonExperience).toBe(750);
  });

  it('settles the same experience rules when a campaign battle is auto-commanded', () => {
    let state = campaign();
    const battle = state.battles.find((b) => b.active)!;
    battle.battleData.map.terrain.fill('plain');
    Object.assign(battle.battleData.units[0]!, { x: 10, y: 10 });
    Object.assign(battle.battleData.units[1]!, { x: 11, y: 10 });
    const enabled = executeV03Command(state, {
      type: 'setBattleAutoCommand',
      battleId: battle.id,
      enabled: true,
    });
    expect(enabled.ok, enabled.error).toBe(true);
    state = advanceUntil(enabled.state, (s) => s.battles.find((b) => b.id === battle.id)!.resolved);
    const resolved = state.battles.find((b) => b.id === battle.id)!;
    const survivor = resolved.battleData.units.find((u) => u.troops > 0)!;
    const gain = battleExperienceGain(survivor, resolved.battleData.outcome!);
    expect(gain).toBeGreaterThan(0);
    expect(survivor.troopExperience).toBe((survivor.isMilitia ? 750 : 1200) + gain);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('keeps distinct original experience and per-contingent caps when a temporary merged unit wins', () => {
    const fixtureVeterans = new Set<string>();
    const state = campaign(
      (s) => {
        for (const officer of s.officers.filter(
          (o) => o.location.kind === 'city' && o.location.cityId === 'puyang',
        )) {
          officer.troops = 0;
          officer.troopExperience = 0;
        }
        const veterans = s.officers
          .filter(
            (officer) =>
              officer.alive && officer.factionId === null && officer.troopType === 'infantry',
          )
          .slice(0, 12);
        expect(veterans).toHaveLength(12);
        veterans.forEach((officer, i) => {
          fixtureVeterans.add(officer.id);
          Object.assign(officer, {
            factionId: 'cao',
            location: { kind: 'city', cityId: 'puyang' },
            troops: 1000,
            troopExperience: i === 0 || i % 2 ? 1899 : 300,
            governorOfCityId: null,
          });
        });

        const source = s.cities.find((city) => city.id === 'puyang')!;
        source.garrisonTroops = 16_000;
        source.food = 1_000_000;
      },
      12000,
      () => Array.from(fixtureVeterans),
    );
    const battle = state.battles.find((b) => b.active)!;
    const membership = battle.attackerFormationOfficerIds;
    const combined = battle.battleData.units.find((u) => (membership[u.id]?.length ?? 0) > 1)!;
    expect(combined).toBeDefined();
    const ids = membership[combined.id]!;
    const originals = state.officers.filter((o) => ids.includes(o.id)).map((o) => ({ ...o }));
    const mean =
      originals.reduce((sum, o) => sum + o.troops * o.troopExperience, 0) / combined.troops;
    expect(combined.troopExperience).toBe(mean);
    const militia = battle.battleData.units.find((u) => u.isMilitia)!;
    battle.battleData.map.terrain.fill('plain');
    Object.assign(combined, { x: 15, y: 15 });
    Object.assign(militia, { x: 16, y: 15 });
    militia.troops = 1;
    state.events.forEach((e) => (e.acknowledged = true));
    const finished = applyV03BattleAction(state, battle.id, {
      type: 'attack',
      unitId: combined.id,
      targetId: militia.id,
    });
    expect(finished.ok, finished.error).toBe(true);
    const resolved = finished.state.battles.find((b) => b.id === battle.id)!;
    expect(resolved.resolved).toBe(true);
    const afterUnit = resolved.battleData.units.find((u) => u.id === combined.id)!;
    const gain = 60 + 80 / combined.initialTroops;
    for (const original of originals)
      expect(finished.state.officers.find((o) => o.id === original.id)).toMatchObject({
        troops: original.troops,
        troopExperience: Math.min(1900, original.troopExperience + gain),
      });
    const report = finished.state.events.find((e) => e.battleOutcome)?.battleOutcome!;
    for (const original of originals)
      expect(
        report.attacker.troopGrowth.find((entry) => entry.officerId === original.id),
      ).toMatchObject({
        beforeExperience: original.troopExperience,
        afterExperience: Math.min(1900, original.troopExperience + gain),
        participated: true,
      });
    const originalIds = new Set(ids);
    for (const officer of finished.state.officers.filter(
      (o) => fixtureVeterans.has(o.id) && !originalIds.has(o.id),
    ))
      expect(officer.troopExperience).toBe(
        state.officers.find((o) => o.id === officer.id)!.troopExperience,
      );
    expect(afterUnit.troopExperience).toBe(
      originals.reduce((sum, o) => sum + o.troops * Math.min(1900, o.troopExperience + gain), 0) /
        combined.troops,
    );
    expect(decodeV03Save(encodeV03Save(finished.state))).toEqual(finished.state);
  });
});
