import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { applyV03BattleAction } from '../../../src/v03/engine';
import { completeV03BattleDay } from '../../../src/v03/engine';
import { runBattleAiTurn } from '../../../src/v03/battle';
import { applyCombatDamage } from '../../../src/v03/battle/experience';
import { allocatePersonnel, previewRetreat } from '../../../src/v03/campaign/battle-aftermath';
import { createPersonnelDay, cityPersonnelSummary } from '../../../src/v03/campaign/personnel';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';

function battleFixture(setup?: (state: ReturnType<typeof createV03Game>) => void) {
  let state = createV03Game('cao', 19);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  city.food = 1_000_000;
  for (const [id, troops] of [
    ['caocao', 5000],
    ['xiahoudun', 2000],
  ] as const) {
    const officer = state.officers.find((entry) => entry.id === id)!;
    city.garrisonTroops += troops - officer.troops;
    Object.assign(officer, { troops, troopExperience: 1200 });
  }
  setup?.(state);
  state.personnelDay = createPersonnelDay(state);
  const dispatch = executeV03Command(state, {
    type: 'marchArmy',
    sourceCityId: city.id,
    targetCityId: 'ye',
    officerIds: ['caocao', 'xiahoudun'],
    intent: 'conquer',
  });
  expect(dispatch.ok, dispatch.error).toBe(true);
  state = dispatch.state;
  const journey = state.journeys.at(-1)!;
  journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
    ...segment,
    lengthKm: 1,
    fixedDelayDays: 0,
  }));
  journey.segmentProgressKm.fill(0);
  journey.segmentWaitDays.fill(0);
  state = executeV03Command(state, { type: 'advance', days: 1 }).state;
  const battle = state.battles.find((entry) => entry.active)!;
  expect(battle).toBeDefined();
  const veteran = battle.battleData.units.find((unit) =>
    battle.attackerFormationOfficerIds[unit.id]?.includes('caocao'),
  )!;
  const ally = battle.battleData.units.find((unit) =>
    battle.attackerFormationOfficerIds[unit.id]?.includes('xiahoudun'),
  )!;
  battle.battleData.map.terrain.fill('plain');
  return { state, battle, veteran, ally };
}

describe('wounded combat and campaign aftermath', () => {
  it('redirects a returning army if its friendly refuge falls while it is waiting outside', () => {
    const { state, battle } = battleFixture();
    let next = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'attacker' }).state;
    const returnId = `${battle.attackerJourneyId}:return`;
    const refuge = next.cities.find(
      (city) => city.id === next.journeys.find((entry) => entry.id === returnId)!.destinationCityId,
    )!;
    refuge.garrisonTroops += 5000;
    refuge.population -= 5000;
    const enemy = next.factions.find((faction) => faction.id === 'dong')!;
    next.playerFactionId = enemy.id;
    next.playerCapitalCityId = enemy.capitalCityId;
    next.factions.forEach((faction) => (faction.isPlayer = faction.id === enemy.id));
    const launched = executeV03Command(next, {
      type: 'marchArmy',
      sourceCityId: enemy.capitalCityId,
      targetCityId: refuge.id,
      officerIds: [enemy.leaderOfficerId],
      intent: 'conquer',
    });
    expect(launched.ok, launched.error).toBe(true);
    next = launched.state;
    next.playerFactionId = 'cao';
    next.playerCapitalCityId = refuge.id;
    next.factions.forEach((faction) => (faction.isPlayer = faction.id === 'cao'));
    for (const journey of next.journeys.filter((entry) =>
      ['outbound', 'returning'].includes(entry.status),
    )) {
      journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
        ...segment,
        lengthKm: 1,
        fixedDelayDays: 0,
      }));
      journey.segmentProgressKm.fill(0);
      journey.segmentWaitDays.fill(0);
    }
    next.events.forEach((event) => (event.acknowledged = true));
    next = executeV03Command(next, { type: 'advance', days: 1 }).state;
    const siege = next.battles.find((entry) => entry.active)!;
    expect(siege).toBeDefined();
    next.events.forEach((event) => (event.acknowledged = true));
    const progressed = completeV03BattleDay(next, siege.id);
    expect(progressed.ok, progressed.error).toBe(true);
    next = progressed.state;
    expect(next.journeys.find((entry) => entry.id === returnId)?.status).toBe('waiting');
    const fallen = applyV03BattleAction(next, siege.id, { type: 'retreat', side: 'defender' });
    expect(fallen.ok, fallen.error).toBe(true);
    next = fallen.state;
    const rng = next.rng;
    next.events.forEach((event) => (event.acknowledged = true));
    next = executeV03Command(next, { type: 'advance', days: 1 }).state;
    expect(next.journeys.find((entry) => entry.id === returnId)?.status).toBe('cancelled');
    const redirected = next.journeys.find((entry) => entry.id.startsWith(`${returnId}:redirect:`))!;
    expect(redirected).toBeDefined();
    expect(next.cities.find((city) => city.id === redirected.destinationCityId)?.factionId).toBe(
      'cao',
    );
    expect(next.officers.find((entry) => entry.id === 'caocao')?.location).toEqual({
      kind: 'journey',
      journeyId: redirected.id,
    });
    expect(next.rng).toBe(rng);
    expect(decodeV03Save(encodeV03Save(next))).toEqual(next);
  });

  it.each(['elimination', 'rout'] as const)(
    'settles starvation %s on the same day, including sub-unit rations',
    (reason) => {
      const { state, battle } = battleFixture();
      for (const unit of battle.battleData.units.filter((entry) => entry.side === 'attacker'))
        Object.assign(unit, {
          troops: reason === 'elimination' ? 1 : 100,
          wounded: reason === 'elimination' ? 0 : 100,
          morale: reason === 'elimination' ? 80 : 22,
        });
      battle.attackerFood = 0;
      battle.battleData.supplies.attacker = 0;
      state.events.forEach((event) => (event.acknowledged = true));
      const completed = completeV03BattleDay(state, battle.id);
      expect(completed.ok, completed.error).toBe(true);
      const ended = completed.state.battles.find((entry) => entry.id === battle.id)!;
      expect(ended.resolved).toBe(true);
      expect(ended.battleData.outcome).toEqual({ winner: 'defender', reason });
      expect(ended.foodShortfallDays).toBe(1);
      expect(
        ended.battleData.units
          .filter((unit) => unit.side === 'attacker')
          .every((unit) => unit.wounded === (reason === 'elimination' ? 0 : 99)),
      ).toBe(true);
      expect(validateV03State(completed.state)).toBe(true);
    },
  );

  it('reserves accumulated captive food debt when splitting the defending city food store', () => {
    const { state, battle } = battleFixture((initial) => {
      const city = initial.cities.find((entry) => entry.id === 'ye')!;
      city.food = 2000;
      city.prisonerServiceDaysThisMonth = 100_000;
      city.prisonerCavalryDaysThisMonth = 100_000;
    });
    const city = state.cities.find((entry) => entry.id === 'ye')!;
    const field = battle.battleData.units
      .filter((unit) => unit.side === 'defender')
      .reduce((sum, unit) => sum + unit.troops * (unit.troopType === 'cavalry' ? 2 : 1), 0);
    const rear = cityPersonnelSummary(state, city.id).foodHeadcount;
    const frontDemand = Math.ceil(field * 0.04 * 30);
    const rearDemand = Math.ceil(
      (rear * 30 + city.troopServiceDaysThisMonth! + city.cavalryServiceDaysThisMonth! + 200_000) *
        0.004,
    );
    const total = city.food + battle.defenderFood;
    expect(battle.defenderFood).toBe(
      Math.floor((total * frontDemand) / (frontDemand + rearDemand)),
    );
  });

  it('clears the former holder captive food debt when the city changes hands', () => {
    const { state, battle } = battleFixture();
    const city = state.cities.find((entry) => entry.id === 'ye')!;
    city.prisonerServiceDaysThisMonth = 100_000;
    city.prisonerCavalryDaysThisMonth = 50_000;
    state.playerFactionId = 'yuan';
    state.playerCapitalCityId = city.id;
    state.factions.forEach((faction) => (faction.isPlayer = faction.id === 'yuan'));
    battle.battleData.playerSide = 'defender';
    state.rng = 1;
    const result = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'defender' });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.cities.find((entry) => entry.id === city.id)).toMatchObject({
      factionId: 'cao',
      prisonerServiceDaysThisMonth: 0,
      prisonerCavalryDaysThisMonth: 0,
    });
  });

  it('charges returning militia and their new wounded only to the field on the final battle day', () => {
    const { state, battle } = battleFixture((initial) => {
      const city = initial.cities.find((entry) => entry.id === 'ye')!;
      city.reservePools = createReservePools();
      city.reserve = 0;
      city.garrisonTroops += 500;
      city.population -= 500;
    });
    const city = state.cities.find((entry) => entry.id === 'ye')!;
    const service = city.troopServiceDaysThisMonth!;
    const militia = battle.battleData.units.find(
      (unit) => unit.side === 'defender' && unit.isMilitia,
    )!;
    applyCombatDamage(militia, 100);
    const ended = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'attacker' });
    expect(ended.ok, ended.error).toBe(true);
    let next = decodeV03Save(encodeV03Save(ended.state));
    next.events.forEach((event) => (event.acknowledged = true));
    next = executeV03Command(next, { type: 'advance', days: 1 }).state;
    expect(next.cities.find((entry) => entry.id === 'ye')?.troopServiceDaysThisMonth).toBe(service);
    expect(
      next.troopSources.find((source) => source.cityId === 'ye' && source.sourceOfficerId === null)
        ?.wounded,
    ).toBe(60);
    expect(validateV03State(next)).toBe(true);
  });

  it('surrenders without a route and keeps the whole wounded contingent in custody', () => {
    const { state, battle, veteran } = battleFixture();
    applyCombatDamage(veteran, 5000);
    for (const city of state.cities.filter((entry) => entry.factionId === 'cao')) {
      city.factionId = null;
      city.governorId = null;
      city.governanceMode = 'steward';
    }
    for (const officer of state.officers.filter((entry) => entry.factionId === 'cao'))
      officer.governorOfCityId = null;
    // This isolated settlement scenario has no owned rear sources.
    expect(previewRetreat(state, battle, 'attacker').risk).toBe(100);
    const result = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'attacker' });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.officers.find((officer) => officer.id === 'caocao')).toMatchObject({
      troops: 0,
      wounded: 3000,
      location: { kind: 'captured', cityId: 'ye' },
    });
    expect(
      result.state.journeys.some((journey) => journey.id === `${battle.attackerJourneyId}:return`),
    ).toBe(false);
    expect(validateV03State(result.state)).toBe(true);
  });

  it('rolls commanders independently and never duplicates a partly captured army on reload', () => {
    const { state, battle, veteran } = battleFixture();
    applyCombatDamage(veteran, 1000);
    battle.battleData.engaged = true;
    state.rng = 1975;
    const result = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'attacker' });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.officers.find((officer) => officer.id === 'caocao')).toMatchObject({
      troops: 4000,
      wounded: 600,
      location: { kind: 'captured', cityId: 'ye' },
    });
    expect(result.state.officers.find((officer) => officer.id === 'xiahoudun')?.location.kind).toBe(
      'journey',
    );
    const returning = result.state.journeys.find(
      (journey) => journey.id === `${battle.attackerJourneyId}:return`,
    )!;
    expect(returning.manifest.officerIds).toEqual(['xiahoudun']);
    expect(returning.manifest.troopCount).toBe(2000);
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });

  it('lets defending commanders retreat probabilistically while rear wounded and reserves are lost with the city', () => {
    const { state, battle } = battleFixture((initial) => {
      initial.officers.find((officer) => officer.id === 'yuanshao')!.wounded = 3000;
    });
    state.playerFactionId = 'yuan';
    state.playerCapitalCityId = 'ye';
    state.factions.forEach((faction) => (faction.isPlayer = faction.id === 'yuan'));
    battle.battleData.playerSide = 'defender';
    battle.battleData.engaged = true;
    state.rng = 1;
    expect(state.troopSources.some((source) => source.cityId === 'ye' && source.wounded > 0)).toBe(
      true,
    );
    const population = state.cities.find((city) => city.id === 'ye')!.population;
    const rear =
      state.cities.find((city) => city.id === 'ye')!.reserve +
      state.troopSources
        .filter((source) => source.cityId === 'ye')
        .reduce((sum, source) => sum + source.troops + source.wounded, 0);
    const result = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'defender' });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.cities.find((city) => city.id === 'ye')?.factionId).toBe('cao');
    expect(result.state.cities.find((city) => city.id === 'ye')!.population).toBeGreaterThanOrEqual(
      population + rear,
    );
    expect(result.state.troopSources.some((source) => source.cityId === 'ye')).toBe(false);
    const returned = result.state.journeys.find(
      (journey) => journey.id === `${battle.id}:defender-return`,
    )!;
    expect(returned).toBeDefined();
    expect(
      result.state.cities.find((city) => city.id === returned.destinationCityId)?.factionId,
    ).toBe('yuan');
    expect(
      result.state.officers.some(
        (officer) => officer.factionId === 'yuan' && officer.location.kind === 'journey',
      ),
    ).toBe(true);
    expect(validateV03State(result.state)).toBe(true);
  });

  it('keeps rear treatment running during a field battle without reinforcing deployed tokens', () => {
    const { state, battle } = battleFixture((initial) => {
      initial.officers.find((officer) => officer.id === 'yuanshao')!.wounded = 3000;
    });
    const source = state.troopSources.find((entry) => entry.sourceOfficerId === 'yuanshao')!;
    const fieldBefore = battle.battleData.units.find((unit) =>
      battle.defenderFormationOfficerIds[unit.id]?.includes('yuanshao'),
    )!.troops;
    expect(state.cities.find((city) => city.id === 'ye')!.food).toBeGreaterThan(0);
    state.events.forEach((event) => (event.acknowledged = true));
    const result = completeV03BattleDay(state, battle.id);
    expect(result.ok, result.error).toBe(true);
    const healed = Math.ceil(source.wounded * 0.1);
    expect(result.state.troopSources.find((entry) => entry.id === source.id)).toMatchObject({
      troops: source.troops + healed,
      wounded: source.wounded - healed,
    });
    expect(
      result.state.battles
        .find((entry) => entry.id === battle.id)!
        .battleData.units.find((unit) => unit.id.includes('yuanshao'))!.troops,
    ).toBe(fieldBefore);
  });

  it('conserves leftover food after charging the final day exactly once', () => {
    const { state, battle, veteran } = battleFixture();
    applyCombatDamage(veteran, 5000);
    battle.battleData.engaged = true;
    state.rng = 1;
    const city = state.cities.find((entry) => entry.id === 'ye')!;
    const before = city.food + battle.attackerFood + battle.defenderFood;
    const demand = (['attacker', 'defender'] as const).reduce(
      (sum, side) =>
        sum +
        Math.floor(
          battle.battleData.units
            .filter((unit) => unit.side === side)
            .reduce(
              (count, unit) =>
                count + (unit.troops + unit.wounded) * (unit.troopType === 'cavalry' ? 2 : 1),
              0,
            ) * 0.04,
        ),
      0,
    );
    const result = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'attacker' });
    const after =
      result.state.cities.find((entry) => entry.id === city.id)!.food +
      result.state.journeys
        .filter((journey) => journey.kind === 'return')
        .reduce((sum, journey) => sum + journey.manifest.carriedFood, 0);
    expect(before - after).toBe(demand);
    expect(result.state.battles.find((entry) => entry.id === battle.id)?.lastRationDay).toBe(
      state.absoluteDay,
    );
    const snapshot = decodeV03Save(encodeV03Save(result.state));
    expect(snapshot).toEqual(result.state);
    expect(
      applyV03BattleAction(snapshot, battle.id, { type: 'retreat', side: 'attacker' }).ok,
    ).toBe(false);
  });

  it('lets NPCs and auto-command retreat only when their shared threshold and route permit it', () => {
    const { battle, veteran, ally } = battleFixture();
    applyCombatDamage(veteran, veteran.troops - 100);
    applyCombatDamage(ally, ally.troops - 100);
    battle.battleData.retreatAllowed.attacker = true;
    expect(runBattleAiTurn(battle.battleData, 'attacker').outcome?.reason).toBe('retreat');
    battle.battleData.retreatAllowed.attacker = false;
    expect(runBattleAiTurn(battle.battleData, 'attacker').outcome?.reason).not.toBe('retreat');
  });
  it('leaves exactly 3000 wounded after 5000 effective casualties, independent of attack fragmentation', () => {
    const { veteran } = battleFixture();
    const repeated = structuredClone(veteran),
      single = structuredClone(veteran);
    for (let i = 0; i < 5000; i++) applyCombatDamage(repeated, 1);
    applyCombatDamage(single, 50_000);
    expect(repeated).toMatchObject({
      troops: 0,
      wounded: 3000,
      casualtyRemainder: 0,
      troopExperience: 1200,
    });
    expect(single).toEqual(repeated);
    expect(applyCombatDamage(single, 100)).toBe(0);
    expect(single.wounded).toBe(3000);
  });

  it('allocates healthy, wounded and permanent losses without exceeding any original member', () => {
    for (let retained = 0; retained <= 6; retained++) {
      const shares = allocatePersonnel(retained, [1, 2, 3]);
      for (let healthy = 0; healthy <= retained; healthy++) {
        const ready = allocatePersonnel(healthy, shares);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(retained);
        expect(ready.reduce((a, b) => a + b, 0)).toBe(healthy);
        expect(ready.every((count, i) => count <= shares[i]!)).toBe(true);
        expect(shares.every((count, i) => count <= [1, 2, 3][i]!)).toBe(true);
      }
    }
  });

  it('keeps a defeated elite contingent when its ally wins, including experience and save reload', () => {
    const { state, battle, veteran, ally } = battleFixture();
    applyCombatDamage(veteran, 5000);
    veteran.combatCasualtiesReceived = 5000;
    const enemies = battle.battleData.units.filter((unit) => unit.side === 'defender');
    for (const unit of enemies)
      applyCombatDamage(unit, unit.troops - (unit === enemies[0] ? 1 : 0));
    Object.assign(ally, { x: 10, y: 10 });
    Object.assign(enemies[0]!, { x: 11, y: 10 });
    const result = applyV03BattleAction(state, battle.id, {
      type: 'attack',
      unitId: ally.id,
      targetId: enemies[0]!.id,
    });
    expect(result.ok, result.error).toBe(true);
    const commander = result.state.officers.find((officer) => officer.id === 'caocao')!;
    expect(commander).toMatchObject({
      troops: 0,
      wounded: 3000,
      troopExperience: 1260,
      location: { kind: 'city', cityId: 'ye' },
    });
    expect(validateV03State(result.state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });

  it('previews without consuming RNG, then orderly retreat carries all wounded and waits until tomorrow', () => {
    const { state, battle, veteran } = battleFixture();
    applyCombatDamage(veteran, 5000);
    veteran.combatCasualtiesReceived = 5000;
    battle.battleData.engaged = true;
    state.rng = 1;
    const before = structuredClone(state);
    expect(previewRetreat(state, battle, 'attacker').risk).toBe(5);
    expect(state).toEqual(before);
    const result = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'attacker' });
    expect(result.ok, result.error).toBe(true);
    const returned = result.state.journeys.find(
      (journey) => journey.id === `${battle.attackerJourneyId}:return`,
    )!;
    expect(returned.manifest.troopCount).toBe(5000);
    expect(returned.manifest.composition.woundedTroops).toBe(3000);
    expect(returned.departedAbsoluteDay).toBe(state.absoluteDay + 1);
    expect(result.state.officers.find((officer) => officer.id === 'caocao')).toMatchObject({
      wounded: 3000,
      troopExperience: 1240,
    });
    expect(validateV03State(result.state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });

  it('cannot turn forced defeat into cheap retreat, and supports a pure-wounded return', () => {
    const { state, battle, veteran, ally } = battleFixture();
    for (const unit of [veteran, ally]) {
      const count = unit.troops;
      applyCombatDamage(unit, count);
      unit.combatCasualtiesReceived = count;
    }
    state.rng = 1;
    const result = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'attacker' });
    expect(result.ok, result.error).toBe(true);
    expect(
      result.state.battles.find((entry) => entry.id === battle.id)?.battleData.outcome?.reason,
    ).toBe('elimination');
    expect(result.state.officers.find((officer) => officer.id === 'caocao')).toMatchObject({
      troops: 0,
      wounded: 2000,
      troopExperience: 1240,
    });
    const returned = result.state.journeys.find(
      (journey) => journey.id === `${battle.attackerJourneyId}:return`,
    )!;
    expect(returned.manifest.troopCount).toBe(2800);
    expect(returned.manifest.composition.woundedTroops).toBe(2800);
    expect(validateV03State(result.state)).toBe(true);
  });
});
