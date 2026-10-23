import { describe, expect, it } from 'vitest';
import { playtestFixture, PLAYTEST_FIXTURES } from '../../src/v03/dev/fixtures';
import { createV03Game } from '../../src/v03/initial-state';
import { executeV03Command } from '../../src/v03/commands';
import { advanceV03 } from '../../src/v03/engine';
import { isCityCommitted, isOfficerCommitted } from '../../src/v03/governance/commitments';
import {
  resolveSuccessions,
  decidePrisoner,
  prisonerHolder,
} from '../../src/v03/campaign/prisoners';
import { eventTier } from '../../src/v03/campaign/reports';
import { orderLifecycle } from '../../src/v03/governance/order-lifecycle';
import { validateV03State, encodeV03Save, decodeV03Save } from '../../src/v03/platform/storage';
import { formatEvent } from '../../src/v03/i18n/events';
import { en } from '../../src/v03/i18n/en';
import { zh } from '../../src/v03/i18n/zh';
import { getV03CityActionAvailability } from '../../src/v03/governance/city-actions';
import { planGovernorMonthlyWork } from '../../src/v03/governance/autonomy';
import {
  nearestLegalBattleCell,
  battleMovementPreview,
} from '../../src/v03/rendering/battle-input';
import { gridToWorld } from '../../src/v03/rendering/geometry';

function prisonerState() {
  const state = createV03Game('cao', 142);
  const prisoner = state.officers.find(
    (officer) => officer.factionId === 'dong' && officer.alive && officer.id !== 'dongzhuo',
  )!;
  if (prisoner.location.kind === 'city') {
    const city = state.cities.find(
      (city) => prisoner.location.kind === 'city' && city.id === prisoner.location.cityId,
    )!;
    city.garrisonTroops -= prisoner.troops;
  }
  prisoner.location = { kind: 'captured', cityId: 'chenliu' };
  prisoner.troops = 0;
  if (prisoner.governorOfCityId) {
    const city = state.cities.find((city) => city.id === prisoner.governorOfCityId)!;
    city.governorId = null;
    city.governanceMode = 'steward';
    prisoner.governorOfCityId = null;
  }
  return { state, prisoner };
}

describe('playability plan contracts', () => {
  it('gives each marching officer a separate formation', () => {
    const state = playtestFixture('battle');
    const battle = state.battles[0]!;
    const officers = state.journeys.find((journey) => journey.id === battle.attackerJourneyId)!
      .manifest.officerIds;
    expect(battle.battleData.units.filter((unit) => unit.side === 'attacker')).toHaveLength(
      officers.length,
    );
    expect(
      Object.values(battle.attackerFormationOfficerIds).every((members) => members.length === 1),
    ).toBe(true);
  });
  it('has catalog entries for every emitted tactical event code', () => {
    for (const code of [
      'begin',
      'attack',
      'water',
      'move',
      'wait',
      'confused',
      'tactic',
      'retreat',
      'rout',
      'elimination',
      'camp',
      'timeout',
      'day',
      'shortage',
    ]) {
      expect(en[`log.${code}` as keyof typeof en]).toBeTruthy();
      expect(zh[`log.${code}` as keyof typeof zh]).toBeTruthy();
    }
  });
  it('ends and saves a defeat when no free player officer remains', () => {
    const state = playtestFixture('battle');
    const battle = state.battles[0]!;
    for (const officer of state.officers.filter(
      (officer) =>
        officer.factionId === state.playerFactionId && officer.location.kind !== 'battle',
    )) {
      if (officer.location.kind === 'city')
        state.cities.find(
          (city) => officer.location.kind === 'city' && city.id === officer.location.cityId,
        )!.garrisonTroops -= officer.troops;
      officer.troops = 0;
      officer.location = { kind: 'captured', cityId: 'luoyang' };
    }
    for (const unit of battle.battleData.units.filter((unit) => unit.side === 'attacker'))
      unit.troops = 0;
    battle.battleData.outcome = { winner: 'defender', reason: 'elimination' };
    battle.playerDayComplete = true;
    const next = advanceV03(state, 1).state;
    expect(next.phase).toBe('finished');
    expect(next.factions.find((faction) => faction.id === state.playerFactionId)!.eliminated).toBe(
      true,
    );
    expect(validateV03State(next)).toBe(true);
  });
  it('repairs an earlier v3 save whose ruler was captured before succession existed', () => {
    const { state } = prisonerState();
    const ruler = state.officers.find((officer) => officer.id === 'caocao')!;
    const city = state.cities.find(
      (city) => ruler.location.kind === 'city' && city.id === ruler.location.cityId,
    )!;
    city.garrisonTroops -= ruler.troops;
    ruler.troops = 0;
    ruler.location = { kind: 'captured', cityId: 'luoyang' };
    const loaded = decodeV03Save(encodeV03Save(state));
    expect(loaded.factions.find((faction) => faction.id === 'cao')!.leaderOfficerId).not.toBe(
      ruler.id,
    );
    expect(loaded.events.filter((event) => event.code === 'ruler.succession')).toHaveLength(1);
    expect(validateV03State(loaded)).toBe(true);
  });
  it('keeps a selected governor-city army intact through dispatch', () => {
    const state = createV03Game('cao', 142);
    const city = state.cities.find((city) => city.id === 'puyang')!;
    city.garrisonTroops += 10_000;
    city.food = 100_000;
    const officer = state.officers.find(
      (officer) =>
        officer.alive &&
        officer.troops > 0 &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    )!;
    const result = executeV03Command(state, {
      type: 'marchArmy',
      sourceCityId: city.id,
      targetCityId: 'xiapi',
      officerIds: [officer.id],
      intent: 'conquer',
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.journeys[0]!.manifest.officerIds).toEqual([officer.id]);
    expect(validateV03State(result.state)).toBe(true);
  });
  it('protects already-reserved provisions from a direct capital march', () => {
    const state = createV03Game('cao', 142);
    const city = state.cities.find((city) => city.id === state.playerCapitalCityId)!;
    state.requisitions.push({
      id: 'reserved-provisions',
      factionId: 'cao',
      sourceCityId: city.id,
      targetCityId: 'xuchang',
      requested: { gold: 0, food: city.food, troops: 0 },
      proposed: { gold: 0, food: city.food, troops: 0 },
      createdDay: 0,
      requestedByDay: null,
      earliestDepartureDay: 0,
      estimatedArrivalDay: 10,
      status: 'reserved',
      journeyId: null,
      governanceRevision: state.governanceRevision,
      message: 'Reserved provisions',
    });
    const officer = state.officers.find(
      (officer) =>
        officer.factionId === 'cao' &&
        officer.troops > 0 &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    )!;
    const result = executeV03Command(state, {
      type: 'marchArmy',
      sourceCityId: city.id,
      targetCityId: 'luoyang',
      officerIds: [officer.id],
      intent: 'conquer',
    });
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.error).toMatch(/food/);
  });
  it('has identical catalog keys in both locales', () =>
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort()));
  it.each(PLAYTEST_FIXTURES)('loads a valid, round-trippable %s fixture', (name) => {
    const state = playtestFixture(name);
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });
  it('allows capital work, diplomacy and a new army during rival combat', () => {
    const state = playtestFixture('rival-battle');
    const city = state.cities.find((city) => city.id === state.playerCapitalCityId)!;
    expect(isCityCommitted(state, city.id)).toBe(false);
    expect(
      executeV03Command(state, { type: 'cityAction', cityId: city.id, action: 'develop-farming' })
        .ok,
    ).toBe(true);
    expect(executeV03Command(state, { type: 'proposeAlliance', targetFactionId: 'liu' }).ok).toBe(
      true,
    );
    const ids = state.officers
      .filter(
        (officer) =>
          officer.alive &&
          officer.factionId === state.playerFactionId &&
          officer.troops > 0 &&
          officer.location.kind === 'city' &&
          officer.location.cityId === city.id,
      )
      .map((officer) => officer.id);
    const target = state.cities.find((city) => city.id === 'jiangxia')!;
    expect(
      executeV03Command(state, {
        type: 'marchArmy',
        sourceCityId: city.id,
        targetCityId: target.id,
        officerIds: ids,
        intent: 'conquer',
      }).ok,
    ).toBe(true);
  });
  it('locks only contested cities and officers, with a shared reason', () => {
    const state = playtestFixture('battle'),
      battle = state.battles[0]!;
    expect(isCityCommitted(state, 'luoyang')).toBe(true);
    const officer = state.officers.find(
      (officer) => officer.location.kind === 'battle' && officer.location.battleId === battle.id,
    )!;
    expect(isOfficerCommitted(state, officer.id)).toBe(true);
    expect(getV03CityActionAvailability(state, { cityId: 'luoyang', action: 'security' }).ok).toBe(
      false,
    );
    expect(
      executeV03Command(state, { type: 'cityAction', cityId: 'chenliu', action: 'develop-farming' })
        .error,
    ).not.toMatch(/planning/);
  });
  it.each(['attacker', 'defender', 'draw'] as const)(
    'reports numbers and officer fates for %s',
    (winner) => {
      const state = playtestFixture('battle'),
        battle = state.battles[0]!;
      battle.battleData.outcome = { winner: winner === 'draw' ? null : winner, reason: 'dayLimit' };
      battle.playerDayComplete = true;
      const next = advanceV03(state, 1).state;
      const report = next.events.find((event) => event.kind === 'battleResolved')!;
      expect(report.battleOutcome?.attacker.startingTroops).toBe(
        battle.battleData.units
          .filter((unit) => unit.side === 'attacker')
          .reduce((sum, unit) => sum + unit.initialTroops, 0),
      );
      expect(report.battleOutcome?.winner).toBe(winner);
      expect([
        ...report.battleOutcome!.attacker.returned,
        ...report.battleOutcome!.attacker.captured,
      ]).toHaveLength(Object.values(battle.attackerFormationOfficerIds).flat().length);
      for (const locale of ['en', 'zh'] as const)
        expect(formatEvent(report, next, locale)?.title).toBeTruthy();
      expect(validateV03State(next)).toBe(true);
    },
  );
  it('uses neutral non-pausing rival outcomes', () => {
    const state = playtestFixture('rival-battle'),
      battle = state.battles[0]!;
    battle.battleData.outcome = { winner: 'attacker', reason: 'dayLimit' };
    const next = advanceV03(state, 1).state;
    const report = next.events.find((event) => event.kind === 'battleResolved')!;
    expect(eventTier(next, report)).toBe('chronicle');
    expect(formatEvent(report, next, 'en')?.title).not.toMatch(/victory|defeat/i);
  });
  it('succeeds to the most loyal free officer exactly once', () => {
    const state = playtestFixture('ruler-captured');
    const house = state.factions.find((faction) => faction.id === 'cao')!;
    const loyal = state.officers
      .filter(
        (officer) =>
          officer.alive && officer.factionId === 'cao' && officer.location.kind !== 'captured',
      )
      .sort((a, b) => b.loyalty - a.loyalty || a.id.localeCompare(b.id))[0]!;
    expect(house.leaderOfficerId).toBe(loyal.id);
    expect(state.events.filter((event) => event.code === 'ruler.succession')).toHaveLength(1);
    resolveSuccessions(state);
    expect(state.events.filter((event) => event.code === 'ruler.succession')).toHaveLength(1);
  });
  it('eliminates a house only when no free officer remains', () => {
    const { state } = prisonerState();
    for (const officer of state.officers.filter((officer) => officer.factionId === 'dong')) {
      officer.location = { kind: 'captured', cityId: 'chenliu' };
      officer.troops = 0;
    }
    resolveSuccessions(state);
    expect(state.factions.find((faction) => faction.id === 'dong')?.eliminated).toBe(true);
    expect(state.cities.some((city) => city.factionId === 'dong')).toBe(false);
  });
  it('releases prisoners and persists the monthly decision', () => {
    const { state, prisoner } = prisonerState();
    const result = decidePrisoner(state, 'cao', prisoner.id, 'release');
    expect(result.ok).toBe(true);
    expect(result.state.officers.find((officer) => officer.id === prisoner.id)?.location.kind).toBe(
      'city',
    );
    expect(validateV03State(result.state)).toBe(true);
  });
  it('recruitment is seeded and cannot be retried in the same month', () => {
    const { state, prisoner } = prisonerState();
    const first = decidePrisoner(state, 'cao', prisoner.id, 'recruit');
    expect(first).toEqual(decidePrisoner(state, 'cao', prisoner.id, 'recruit'));
    expect(decidePrisoner(first.state, 'cao', prisoner.id, 'recruit').ok).toBe(false);
  });
  it('executes permanently and keeps the resulting save valid', () => {
    const { state, prisoner } = prisonerState();
    const result = decidePrisoner(state, 'cao', prisoner.id, 'execute');
    expect(result.ok).toBe(true);
    expect(result.state.officers.find((officer) => officer.id === prisoner.id)?.alive).toBe(false);
    expect(
      prisonerHolder(
        result.state,
        result.state.officers.find((officer) => officer.id === prisoner.id)!,
      ),
    ).toBe(null);
    expect(validateV03State(result.state)).toBe(true);
  });
  it('exchanges two prisoners on acceptance using the shared seeded rule', () => {
    const { state, prisoner } = prisonerState();
    const own = state.officers.find(
      (officer) => officer.factionId === 'cao' && officer.id !== 'caocao',
    )!;
    if (own.location.kind === 'city')
      state.cities.find(
        (city) => own.location.kind === 'city' && city.id === own.location.cityId,
      )!.garrisonTroops -= own.troops;
    own.location = { kind: 'captured', cityId: 'luoyang' };
    own.troops = 0;
    let result = decidePrisoner(state, 'cao', prisoner.id, 'exchange', own.id);
    for (
      let seed = 1;
      seed < 100 &&
      result.state.officers.find((officer) => officer.id === own.id)?.location.kind === 'captured';
      seed++
    ) {
      state.rng = seed;
      result = decidePrisoner(state, 'cao', prisoner.id, 'exchange', own.id);
    }
    expect(result.state.officers.find((officer) => officer.id === own.id)?.location).toEqual({
      kind: 'city',
      cityId: 'chenliu',
    });
  });
  it('retains the same order through battle and return', () => {
    const state = playtestFixture('battle'),
      order = state.directives[0]!;
    expect(orderLifecycle(state, order).stage).toBe('in-battle');
    const battle = state.battles[0]!;
    battle.battleData.outcome = { winner: 'defender', reason: 'dayLimit' };
    battle.playerDayComplete = true;
    const next = advanceV03(state, 1).state;
    expect(orderLifecycle(next, next.directives[0]!).stage).toBe('returning');
  });
  it('auto command is seeded and survives reload', () => {
    const state = playtestFixture('battle');
    const enabled = executeV03Command(state, {
      type: 'setBattleAutoCommand',
      battleId: state.battles[0]!.id,
      enabled: true,
    }).state;
    expect(advanceV03(enabled, 1)).toEqual(advanceV03(decodeV03Save(encodeV03Save(enabled)), 1));
  });
  it('shows real shortage deltas and permits starting development up to 500', () => {
    const state = playtestFixture('shortage');
    const next = advanceV03(state, 1).state;
    const event = next.events.find((event) => event.code === 'month.summary')!;
    expect(event.tier).toBe('critical');
    const row = event.monthlySummary!.find((row) => row.cityId === state.playerCapitalCityId)!;
    expect(row.shortage).toBe(true);
    expect(row.food).toBe(
      next.cities.find((city) => city.id === row.cityId)!.food -
        state.cities.find((city) => city.id === row.cityId)!.food,
    );
    const fresh = createV03Game('cao', 1);
    expect(
      getV03CityActionAvailability(fresh, { cityId: 'chenliu', action: 'develop-farming' }).ok,
    ).toBe(true);
    const city = fresh.cities.find((city) => city.id === 'puyang')!;
    city.farming = 500;
    city.commerce = 500;
    city.loyalty = 100;
    expect(planGovernorMonthlyWork(fresh, city.id, 1).action).not.toBe('develop-farming');
  });
  it('snaps near legal cells and previews a connected legal path', () => {
    const tile = { x: 3, y: 4 };
    expect(nearestLegalBattleCell(gridToWorld({ x: 3.8, y: 4 }), [tile])).toEqual(tile);
    expect(nearestLegalBattleCell(gridToWorld({ x: 5, y: 4 }), [tile])).toBe(null);
    expect(
      battleMovementPreview({ x: 1, y: 1 }, { x: 3, y: 1 }, [
        { x: 2, y: 1, cost: 1 },
        { x: 3, y: 1, cost: 2 },
      ]),
    ).toEqual([
      { x: 1, y: 1, cost: 0 },
      { x: 2, y: 1, cost: 1 },
      { x: 3, y: 1, cost: 2 },
    ]);
  });
});
