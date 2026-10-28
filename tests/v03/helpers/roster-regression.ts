import assert from 'node:assert/strict';
import { createV03Game } from '../../../src/v03/initial-state';
import { SCENARIOS } from '../../../src/v03/content/scenario';
import { OFFICER_CATALOG_BY_ID } from '../../../src/v03/content/officer-catalog';
import { scheduledOfficerDebuts } from '../../../src/v03/content/officer-roster-setups';
import { hasNavalTraining } from '../../../src/v03/content/naval-commanders';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { createPersonnelDay, cityPersonnelSummary } from '../../../src/v03/campaign/personnel';
import { decidePrisoner } from '../../../src/v03/campaign/prisoners';
import { previewRetreat } from '../../../src/v03/campaign/battle-aftermath';
import { armyPreview } from '../../../src/v03/governance/army';
import { applyCombatDamage } from '../../../src/v03/battle/experience';
import { getForcedBattleOutcome } from '../../../src/v03/battle/engine';
import { battleTerrainAt, waterCombatModifiers } from '../../../src/v03/battle';
import { PILOT_LOGISTICS_RATES } from '../../../src/v03/calendar';
import { ROUTE_DEFINITIONS } from '../../../src/v03/geography';
import { applyV03BattleAction, completeV03BattleDay } from '../../../src/v03/engine';
import { executeV03Command } from '../../../src/v03/commands';
import { encodeV03Save, decodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState, V03Command, V03Journey } from '../../../src/v03/types';

export const ROSTER_MATRIX = SCENARIOS.flatMap((scenario) =>
  scenario.factions.map((faction) => ({ scenarioId: scenario.id, factionId: faction.id })),
);
export const FLOW_MODES = ['retreat', 'capture-release', 'capture-recruit'] as const;
export type FlowMode = (typeof FLOW_MODES)[number];
const person = (state: V03GameState, id: string) =>
  state.officers.find((entry) => entry.id === id)!;
const place = (state: V03GameState, id: string) => state.cities.find((entry) => entry.id === id)!;
const active = (state: V03GameState) => state.battles.find((entry) => entry.active)!;
function saved(state: V03GameState, stage: string) {
  assert(validateV03State(state), 'Invalid state at ' + stage);
  const loaded = decodeV03Save(encodeV03Save(state));
  assert.deepEqual(loaded, state, 'Round trip at ' + stage);
  return loaded;
}
function command(state: V03GameState, input: V03Command) {
  const result = executeV03Command(state, input);
  assert(result.ok, result.error);
  return result.state;
}
function ack(state: V03GameState) {
  state.events.forEach((event) => {
    event.acknowledged = true;
  });
  return state;
}
function short(journey: V03Journey) {
  journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
    ...segment,
    lengthKm: 1,
    fixedDelayDays: 0,
  }));
  journey.segmentProgressKm.fill(0);
  journey.segmentWaitDays.fill(0);
}
function until(state: V03GameState, done: (state: V03GameState) => boolean, limit = 15) {
  for (let day = 0; day < limit; day++) {
    if (done(state)) return state;
    state = command(ack(state), { type: 'advance', days: 1 });
  }
  assert(done(state), 'Timed out waiting for a controlled journey');
  return state;
}
function seedForRisk(percent: number, captured: boolean) {
  for (let seed = 0; seed < 100; seed++)
    if (((Math.imul(seed, 1664525) + 1013904223) >>> 0) % 100 < percent === captured) return seed;
  throw new Error('No seed matches capture branch');
}

/** Controlled resources, two real contemporary identities and shortened travel; no invented officer IDs. */
export function runRosterFlow(scenarioId: string, factionId: string, mode: FlowMode, startDay = 0) {
  const seed = mode === 'retreat' ? 3 : mode === 'capture-release' ? 5 : 7;
  let state = createV03Game(factionId, seed, scenarioId);
  state.absoluteDay = startDay;
  state.monthIndex = Math.floor(startDay / 30);
  const sourceId = state.playerCapitalCityId;
  const rulerId = state.factions.find((entry) => entry.id === factionId)!.leaderOfficerId;
  const adjacent = new Set<string>(
    ROUTE_DEFINITIONS.flatMap((route) =>
      route.fromCityId === sourceId
        ? [route.toCityId]
        : route.toCityId === sourceId
          ? [route.fromCityId]
          : [],
    ),
  );
  const target =
    state.cities.find((entry) => adjacent.has(entry.id) && entry.factionId !== factionId) ??
    state.cities.find((entry) => adjacent.has(entry.id))!;
  const enemy = state.factions.find(
    (entry) =>
      entry.id !== factionId &&
      (target.factionId === null ||
        target.factionId === factionId ||
        entry.id === target.factionId),
  )!;
  const targetId = target.id;
  for (const entry of state.officers) {
    if (entry.location.kind !== 'city' || entry.location.cityId !== targetId) continue;
    const refuge = state.cities.find(
      (city) => city.id !== targetId && city.factionId === entry.factionId,
    )!;
    entry.location = { kind: 'city', cityId: refuge.id };
    if (entry.governorOfCityId === targetId) entry.governorOfCityId = null;
    if (entry.factionId !== null && entry.alive) refuge.garrisonTroops += entry.troops;
  }
  const free = state.officers.filter(
    (entry) =>
      entry.alive && entry.factionId === null && OFFICER_CATALOG_BY_ID.get(entry.id)?.isNew,
  );
  const type = mode === 'retreat' ? 'infantry' : mode === 'capture-release' ? 'archer' : 'cavalry';
  const typed = free.filter((entry) => entry.troopType === type);
  const newcomer = typed.find((entry) => hasNavalTraining(entry.id)) ?? typed[0] ?? free[0]!;
  const defender = free.find((entry) => entry.id !== newcomer.id)!;
  const id = newcomer.id;
  assert(newcomer && defender && target, 'Missing controlled participants');
  for (const entry of state.officers)
    if (
      entry.id !== id &&
      entry.factionId === null &&
      entry.location.kind === 'city' &&
      entry.location.cityId === sourceId
    )
      entry.location = { kind: 'city', cityId: targetId };
  newcomer.location = { kind: 'city', cityId: sourceId };
  Object.assign(defender, {
    factionId: enemy.id,
    location: { kind: 'city', cityId: targetId },
    troops: 900,
    wounded: 0,
    troopExperience: 1200,
    loyalty: 100,
  });
  Object.assign(target, {
    factionId: enemy.id,
    governanceMode: 'steward',
    governorId: null,
    reserve: 0,
    reservePools: createReservePools(),
    garrisonTroops: 900,
    food: 1_000_000,
    gold: 100_000,
    population: target.population - 900,
  });
  const source = place(state, sourceId);
  Object.assign(source, {
    gold: 100_000,
    food: 1_000_000,
    reserve: 1000,
    reservePools: createReservePools(),
    loyalty: 100,
  });
  source.reservePools[newcomer.troopType] = { troops: 1000, troopExperience: 1250 };
  state.personnelDay = createPersonnelDay(state);
  state = saved(state, 'controlled opening');
  const cohort = state.officers.length;
  const cityPeople = cityPersonnelSummary(state, sourceId).troops;
  state = command(state, {
    type: 'cityAction',
    cityId: sourceId,
    action: 'search',
    officerId: rulerId,
  });
  assert.equal(
    person(state, id).factionId,
    factionId,
    'Actual search must recruit the new identity',
  );
  assert.equal(person(state, id).troops, 0);
  state = saved(state, 'search');
  state = command(state, {
    type: 'cityAction',
    cityId: sourceId,
    action: 'assign-troops',
    officerId: id,
    amount: 700,
  });
  assert.equal(person(state, id).troopExperience, 1250);
  assert.equal(place(state, sourceId).reservePools[newcomer.troopType].troops, 300);
  assert.equal(place(state, sourceId).workPointsUsed, 1);
  assert.equal(
    cityPersonnelSummary(state, sourceId).troops,
    cityPeople,
    'Assignment must conserve soldiers',
  );
  state = saved(state, 'assignment');
  const quote = armyPreview(state, sourceId, targetId, [id], 'conquer');
  const grain = place(state, sourceId).food;
  state = command(state, {
    type: 'marchArmy',
    sourceCityId: sourceId,
    targetCityId: targetId,
    officerIds: [id],
    intent: 'conquer',
  });
  assert.equal(place(state, sourceId).food, grain - quote.food);
  const journey = state.journeys.find((entry) => entry.kind === 'campaign')!;
  assert.deepEqual(journey.manifest.officerIds, [id]);
  assert.equal(journey.manifest.carriedFood, quote.food);
  short(journey);
  state = saved(state, 'outbound');
  state = until(state, (s) => Boolean(active(s)));
  const battleId = active(state).id;
  let battle = active(state);
  const aId = battle.battleData.units.find((unit) => unit.side === 'attacker')!.id;
  const dId = battle.battleData.units.find((unit) => unit.side === 'defender')!.id;
  battle.battleData.map.terrain.fill('plain');
  battle.battleData.map.terrain[4 * battle.battleData.map.width + 5] = 'water';
  Object.assign(
    battle.battleData.units.find((unit) => unit.id === aId)!,
    { x: 4, y: 4 },
  );
  Object.assign(
    battle.battleData.units.find((unit) => unit.id === dId)!,
    { x: 20, y: 20 },
  );
  state = saved(ack(state), 'battle start');
  let action = applyV03BattleAction(state, battleId, { type: 'move', unitId: aId, x: 5, y: 4 });
  assert(action.ok, action.error);
  state = saved(action.state, 'embark');
  battle = active(state);
  const onWater = battle.battleData.units.find((unit) => unit.id === aId)!;
  assert.equal(battleTerrainAt(battle.battleData.map, onWater), 'water');
  assert.equal(
    waterCombatModifiers(
      battle.battleData.map,
      onWater,
      battle.battleData.units.find((unit) => unit.id === dId)!,
    ).attackMultiplier,
    0.75,
  );
  const beforeFood = battle.attackerFood;
  const day = completeV03BattleDay(ack(state), battleId);
  assert(day.ok, day.error);
  state = saved(day.state, 'water battle day');
  battle = active(state);
  const ration =
    700 * (newcomer.troopType === 'cavalry' ? 2 : 1) * PILOT_LOGISTICS_RATES.battleFoodPerTroopDay;
  assert.equal(
    battle.attackerFood,
    beforeFood - ration,
    'Battle must pay exactly one day of weighted rations',
  );
  action = applyV03BattleAction(state, battleId, { type: 'move', unitId: aId, x: 6, y: 4 });
  assert(action.ok, action.error);
  state = saved(action.state, 'disembark');
  battle = active(state);
  const attacker = battle.battleData.units.find((unit) => unit.id === aId)!;
  assert.equal(attacker.troopType, newcomer.troopType);
  assert.equal(attacker.troopExperience, 1250);
  assert.equal(battleTerrainAt(battle.battleData.map, attacker), 'plain');
  Object.assign(
    battle.battleData.units.find((unit) => unit.id === dId)!,
    { x: 7, y: 4 },
  );
  action = applyV03BattleAction(state, battleId, { type: 'attack', unitId: aId, targetId: dId });
  assert(action.ok, action.error);
  state = saved(action.state, 'combat');
  battle = active(state);
  const wounded = battle.battleData.units.find((unit) => unit.id === aId)!.wounded;
  assert(wounded > 0, 'Actual counterattack must leave wounded');
  if (mode === 'retreat') {
    const preview = previewRetreat(state, battle, 'attacker');
    assert(preview.destination);
    state.rng = seedForRisk(preview.risk, false);
    action = applyV03BattleAction(state, battleId, { type: 'retreat', side: 'attacker' });
    assert(action.ok, action.error);
    state = saved(action.state, 'orderly retreat');
    assert.equal(person(state, id).location.kind, 'journey');
  } else {
    const unit = battle.battleData.units.find((unit) => unit.id === aId)!;
    applyCombatDamage(unit, unit.troops);
    battle.battleData.outcome = getForcedBattleOutcome(battle.battleData);
    assert(battle.battleData.outcome, 'Zero healthy must force defeat');
    const preview = previewRetreat(state, battle, 'attacker');
    state.rng = seedForRisk(preview.risk, true);
    const settled = completeV03BattleDay(ack(state), battleId);
    assert(settled.ok, settled.error);
    state = saved(settled.state, 'captured');
    assert.equal(person(state, id).location.kind, 'captured');
    assert.equal(person(state, id).troops, 0);
    assert(person(state, id).wounded > 0);
    person(state, id).loyalty = 10;
    state.rng = 1;
    const decision = decidePrisoner(
      state,
      enemy.id,
      id,
      mode === 'capture-release' ? 'release' : 'recruit',
    );
    assert(decision.ok, decision.error);
    state = saved(decision.state, mode);
    if (mode === 'capture-recruit') {
      assert.equal(person(state, id).factionId, enemy.id);
      assert.equal(person(state, id).reorganizationDays, 10);
    }
  }
  const lossCount = person(state, id).troops + person(state, id).wounded;
  const xp = person(state, id).troopExperience;
  if (mode !== 'capture-recruit') {
    const returning = state.journeys.find(
      (entry) => entry.manifest.officerIds.includes(id) && entry.kind === 'return',
    )!;
    assert(returning);
    short(returning);
    const returningWounded = person(state, id).wounded;
    state = saved(state, 'returning');
    state = until(state, (s) => person(s, id).location.kind === 'city');
    assert.equal(person(state, id).wounded, returningWounded, 'No healing while travelling');
  }
  state = saved(state, 'home/captor city');
  // Recovery checks must not become a second war after monthly autonomous work.
  state.alliances = state.factions.flatMap((a, index) =>
    state.factions.slice(index + 1).map((b) => ({
      a: a.id,
      b: b.id,
      expiresMonthIndex: state.monthIndex + 6,
    })),
  );
  const beforeHealing = person(state, id).wounded;
  for (let day = 0; day < 12; day++) state = command(ack(state), { type: 'advance', days: 1 });
  assert(person(state, id).wounded < beforeHealing, 'Wounded must recover with city food');
  assert.equal(person(state, id).troops + person(state, id).wounded, lossCount);
  assert.equal(person(state, id).troopExperience, xp);
  assert.equal(person(state, id).reorganizationDays, 0);
  assert.equal(state.officers.length, cohort);
  state = saved(state, 'recovered');
  return {
    scenarioId,
    factionId,
    mode,
    seed,
    officerId: id,
    troopType: newcomer.troopType,
    naval: hasNavalTraining(id),
    recruited: true,
    assigned: 700,
    marched: true,
    embarked: true,
    disembarked: true,
    battleDailyFood: ration,
    outboundFood: quote.food,
    woundedAfterCombat: wounded,
    recovered: beforeHealing - person(state, id).wounded,
    retainedExperience: xp,
    finalFactionId: person(state, id).factionId,
    finalRosterCount: state.officers.length,
    finalDay: state.absoluteDay,
  };
}

/** Controlled year-end snapshots; the intervening 358 days are not simulated. */
export function runRosterYearBoundary(scenarioId: string, factionId: string, seed: number) {
  let state = createV03Game(factionId, seed, scenarioId);
  const openingDead = state.officers.filter((entry) => !entry.alive).map((entry) => entry.id);
  const initial = state.officers.length;
  for (const officer of state.officers)
    Object.assign(officer, { troops: 0, wounded: 0, troopExperience: 0, loyalty: 100 });
  for (const city of state.cities)
    Object.assign(city, {
      garrisonTroops: 0,
      reserve: 0,
      reservePools: createReservePools(),
      population: 1000,
      gold: 0,
      food: 100_000,
      commerce: 0,
      farming: 0,
      loyalty: 100,
    });
  state.absoluteDay = 359;
  state.monthIndex = 11;
  state.personnelDay = createPersonnelDay(state);
  state = saved(state, 'year end');
  const due = scheduledOfficerDebuts(scenarioId as 'divided-realm-190' | 'guandu-200').filter(
    (entry) => entry.year === state.startYear + 1,
  );
  assert(due.length > 0);
  state = command(ack(state), { type: 'advance', days: 1 });
  assert.equal(state.lastOfficerDebutYear, state.startYear + 1);
  assert.equal(state.officers.length, initial + due.length);
  for (const entry of due) {
    const officer = person(state, entry.id);
    assert.equal(officer.factionId, null);
    assert.equal(officer.troops + officer.wounded, 0);
    assert.deepEqual(officer.location, { kind: 'city', cityId: entry.cityId });
  }
  state = command(ack(saved(state, 'annual debut')), { type: 'advance', days: 1 });
  for (const entry of due)
    assert.equal(state.officers.filter((officer) => officer.id === entry.id).length, 1);
  const killedId = due[0]!.id;
  person(state, killedId).alive = false;
  const frozenAge = person(state, killedId).age;
  state.absoluteDay = 719;
  state.monthIndex = 23;
  state.alliances = state.alliances.filter((entry) => entry.expiresMonthIndex > state.monthIndex);
  state.coalitionInvitations = state.coalitionInvitations.filter(
    (entry) => entry.expiresMonthIndex > state.monthIndex,
  );
  state.personnelDay = createPersonnelDay(state);
  state = command(ack(saved(state, 'second year end')), { type: 'advance', days: 1 });
  state = saved(state, 'second annual debut');
  assert.equal(state.lastOfficerDebutYear, state.startYear + 2);
  assert.equal(person(state, killedId).alive, false);
  assert.equal(person(state, killedId).age, frozenAge);
  assert(openingDead.every((id) => !person(state, id).alive));
  assert.equal(new Set(state.officers.map((entry) => entry.id)).size, state.officers.length);
  return {
    scenarioId,
    factionId,
    seed,
    appearedIds: due.map((entry) => entry.id),
    killedId,
    openingDeadPreserved: openingDead.length,
    finalYear: state.lastOfficerDebutYear,
    finalRosterCount: state.officers.length,
    saveRoundTrip: true,
  };
}
