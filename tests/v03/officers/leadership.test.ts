import { describe, expect, it, vi } from 'vitest';

// The reserve test needs a controllable threat; everything else uses the real helper.
const threatened = vi.hoisted(() => ({ on: false }));
vi.mock('../../../src/v03/ai/campaign-threats', async (original) => {
  const real = await original<typeof import('../../../src/v03/ai/campaign-threats')>();
  return {
    ...real,
    incomingCampaignThreats: (...args: Parameters<typeof real.incomingCampaignThreats>) =>
      threatened.on ? [{ journeyId: 'test' } as never] : real.incomingCampaignThreats(...args),
  };
});

import {
  advanceBattleDay,
  applyBattleAction,
  battleCommander,
  createBattleMap,
  createTacticalBattle,
  predictBattleAttack,
  predictBattleTactic,
  runBattleAiTurn,
  type BattleRosterEntry,
  type V03TacticalBattleState,
} from '../../../src/v03/battle';
import { advanceV03 } from '../../../src/v03/engine';
import { executeV03Command } from '../../../src/v03/commands';
import { createV03Game } from '../../../src/v03/initial-state';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import {
  excessShare,
  managedCapacity,
  settleDesertion,
} from '../../../src/v03/campaign/leadership';
import { availableReserveTroops } from '../../../src/v03/campaign/personnel';
import { formatEvent } from '../../../src/v03/i18n/events';
import { preparePuyangArmy } from '../helpers/army-fixture';
import { LEADERSHIP } from '../../../src/v03/balance';

function entry(
  id: string,
  troops: number,
  leadership: number | undefined,
  extra: Partial<BattleRosterEntry> = {},
): BattleRosterEntry {
  return {
    id,
    name: id,
    troopType: 'infantry',
    troops,
    force: 70,
    intellect: 60,
    ...(leadership === undefined ? {} : { leadership, excessShare: 0 }),
    ...extra,
  };
}

function plainBattle(
  attackerUnits: BattleRosterEntry[],
  defenderUnits: BattleRosterEntry[],
  seed = 11,
): V03TacticalBattleState {
  const map = createBattleMap({ regionId: 'xiapi', seed });
  map.terrain.fill('plain');
  const battle = createTacticalBattle({
    id: 'leadership',
    map,
    seed,
    playerSide: 'attacker',
    supplies: { attacker: 1_000_000, defender: 1_000_000 },
    attackerUnits,
    defenderUnits,
  });
  battle.weather = 'clear';
  battle.nextWeather = 'clear';
  return battle;
}

function runToEnd(initial: V03TacticalBattleState) {
  let battle = initial;
  for (let day = 0; day < battle.dayLimit && !battle.outcome; day++) {
    for (const side of ['attacker', 'defender'] as const) {
      battle = runBattleAiTurn(battle, side);
      if (battle.outcome) break;
    }
    if (!battle.outcome) battle = advanceBattleDay(battle);
  }
  return battle;
}

const troopsOf = (battle: V03TacticalBattleState, side: 'attacker' | 'defender') =>
  battle.units.filter((unit) => unit.side === side).reduce((sum, unit) => sum + unit.troops, 0);

describe('O-02 leadership in battle', () => {
  it('one 90-leadership officer with 3,000 men beats three 40-leadership officers with 1,000 each', () => {
    for (const bigSide of ['attacker', 'defender'] as const) {
      const big = [entry('big', 3000, 90)];
      const small = [entry('s1', 1000, 40), entry('s2', 1000, 40), entry('s3', 1000, 40)];
      const end = runToEnd(
        bigSide === 'attacker' ? plainBattle(big, small) : plainBattle(small, big),
      );
      const smallSide = bigSide === 'attacker' ? 'defender' : 'attacker';
      expect(troopsOf(end, bigSide)).toBeGreaterThan(troopsOf(end, smallSide));
    }
  });

  it('opens at 60 + leadership/5 - 20 x unmanaged share, militia at 60, bare rosters at 80', () => {
    const battle = plainBattle(
      [
        entry('l100', 5000, 100),
        entry('l50', 3000, 50),
        entry('l30', 10_000, 30, { excessShare: 0.7 }),
        entry('militia', 800, 0, { isMilitia: true }),
      ],
      [entry('bare', 1000, undefined)],
    );
    const morale = (id: string) => battle.units.find((unit) => unit.id === id)!.morale;
    expect(morale('l100')).toBe(80);
    expect(morale('l50')).toBe(70);
    expect(morale('l30')).toBe(52);
    expect(morale('militia')).toBe(60);
    expect(morale('bare')).toBe(80);
    const bare = battle.units.find((unit) => unit.id === 'bare')!;
    expect('leadership' in bare).toBe(false);
    expect('excessShare' in bare).toBe(false);
  });

  it('forecasts equal the resolved casualties, and unmanaged men take x1.35 at excess 0.7', () => {
    const make = (share: number) => {
      const battle = plainBattle(
        [entry('hitter', 2000, 60)],
        [entry('target', 3000, 60, { excessShare: share })],
      );
      const hitter = battle.units.find((unit) => unit.id === 'hitter')!;
      const target = battle.units.find((unit) => unit.id === 'target')!;
      Object.assign(hitter, { x: 5, y: 5 });
      Object.assign(target, { x: 6, y: 5 });
      return battle;
    };
    const plain = predictBattleAttack(make(0), 'hitter', 'target')!.estimatedCasualties!;
    const forecast = predictBattleAttack(make(0.7), 'hitter', 'target')!;
    expect(forecast.estimatedCasualties! / plain).toBeCloseTo(1.35, 1);
    const resolved = applyBattleAction(make(0.7), {
      type: 'attack',
      unitId: 'hitter',
      targetId: 'target',
    });
    expect(resolved.state.units.find((unit) => unit.id === 'target')!.troops).toBe(
      3000 - forecast.estimatedCasualties!,
    );
    // Damaging tactics scale the same way.
    const fire = (share: number) => {
      const battle = make(share);
      battle.tacticPoints.attacker = 30;
      battle.units.find((unit) => unit.id === 'hitter')!.intellect = 90;
      return predictBattleTactic(battle, 'hitter', 'fire', 'target')!;
    };
    expect(fire(0.7).maxCasualties / fire(0).maxCasualties).toBeCloseTo(1.35, 1);
  });

  it('weights hit quality by leadership: a higher-leadership formation wins the exchange', () => {
    const battle = plainBattle(
      [entry('high', 1000, 90, { force: 60 })],
      [entry('low', 1000, 30, { force: 60 })],
    );
    Object.assign(
      battle.units.find((unit) => unit.id === 'high')!,
      { x: 5, y: 5, morale: 80 },
    );
    Object.assign(
      battle.units.find((unit) => unit.id === 'low')!,
      { x: 6, y: 5, morale: 80 },
    );
    const out = predictBattleAttack(battle, 'high', 'low')!.estimatedCasualties!;
    const back = predictBattleAttack(battle, 'low', 'high')!.estimatedCasualties!;
    expect(out).toBeGreaterThan(back);
  });

  it('chooses the commander by leadership, then force, then id, skipping militia', () => {
    const battle = plainBattle(
      [
        entry('a-militia', 900, 0, { isMilitia: true, force: 99 }),
        entry('b', 1000, 60, { force: 70 }),
        entry('c', 1000, 80, { force: 50 }),
        entry('d', 1000, 80, { force: 60 }),
      ],
      [entry('x', 1000, undefined, { force: 60 }), entry('y', 1000, undefined, { force: 80 })],
    );
    expect(battleCommander(battle, 'attacker')!.id).toBe('d');
    expect(battleCommander(battle, 'defender')!.id).toBe('y');
    battle.units.find((unit) => unit.id === 'd')!.troops = 0;
    expect(battleCommander(battle, 'attacker')!.id).toBe('c');
  });
});

function stationedOfficer(state: ReturnType<typeof createV03Game>) {
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  const officer = state.officers.find(
    (entry) =>
      entry.alive &&
      entry.factionId === state.playerFactionId &&
      entry.location.kind === 'city' &&
      entry.location.cityId === city.id &&
      entry.troops > 0,
  )!;
  return { city, officer };
}

describe('O-02 desertion', () => {
  function monthEnd(leadership: number) {
    const state = createV03Game('cao', 7001);
    const { city, officer } = stationedOfficer(state);
    const added = 10_000 - officer.troops;
    city.garrisonTroops += added;
    city.population -= Math.min(city.population, added);
    Object.assign(officer, { leadership, troops: 10_000, wounded: 0 });
    state.personnelDay = createPersonnelDay(state);
    state.absoluteDay = 29;
    state.monthIndex = 0;
    state.events.forEach((event) => (event.acknowledged = true));
    const after = advanceV03(state, 1).state;
    return {
      officer: after.officers.find((entry) => entry.id === officer.id)!,
      city: after.cities.find((entry) => entry.id === city.id)!,
      state: after,
    };
  }

  it('a 30-leadership officer with 10,000 in a city loses 350 men to the population', () => {
    const managed = monthEnd(100);
    const loose = monthEnd(30);
    expect(managed.officer.troops - loose.officer.troops).toBe(350);
    // Growth (L-02) is rounded down on the 350 extra residents, so allow one of rounding.
    expect(loose.city.population - managed.city.population).toBeGreaterThanOrEqual(350);
    expect(loose.city.population - managed.city.population).toBeLessThanOrEqual(351);
    const notice = loose.state.events.find((event) => event.code === 'report.desertion')!;
    expect(notice).toMatchObject({
      tier: 'notice',
      params: { officerId: loose.officer.id, count: 350 },
    });
    expect(formatEvent(notice, loose.state, 'en')!.detail).toMatch(
      /^350 men slipped away from .+'s camp\.$/,
    );
    expect(formatEvent(notice, loose.state, 'zh')!.detail).toMatch(/营中逃散350人/);
    expect(managed.state.events.some((event) => event.code === 'report.desertion')).toBe(false);
  });

  it('loses 700 on a journey', () => {
    const state = createV03Game('cao', 481516);
    preparePuyangArmy(state);
    const result = executeV03Command(state, {
      type: 'issueCampaignDirective',
      sourceCityId: 'puyang',
      targetCityId: 'xiapi',
      intent: 'conquer',
      requestedTroops: 700,
      requestedByDay: null,
    });
    expect(result.ok, result.error).toBe(true);
    const marching = result.state;
    const officer = marching.officers.find((entry) => entry.location.kind === 'journey')!;
    const troopsBefore = officer.troops;
    Object.assign(officer, { leadership: 30, troops: 10_000 });
    const journey = marching.journeys.find(
      (entry) => officer.location.kind === 'journey' && entry.id === officer.location.journeyId,
    )!;
    const countBefore = journey.manifest.troopCount;
    const deserted = settleDesertion(marching);
    expect(deserted.find((entry) => entry.officerId === officer.id)!.count).toBe(700);
    expect(officer.troops).toBe(9300);
    expect(journey.manifest.troopCount).toBe(Math.max(0, countBefore - 700));
    expect(troopsBefore).toBeLessThan(10_000);
  });

  it('helpers agree with the balance table', () => {
    expect(managedCapacity({ leadership: 30 })).toBe(3000);
    expect(excessShare({ leadership: 30, troops: 10_000 })).toBeCloseTo(0.7);
    expect(excessShare({ leadership: 80, troops: 5000 })).toBe(0);
    expect(LEADERSHIP.capacityPerPoint).toBe(100);
  });
});

describe('O-02 reserve filling', () => {
  function fixture() {
    const state = createV03Game('cao', 610301);
    const { city } = stationedOfficer(state);
    const local = state.officers.filter(
      (entry) =>
        entry.alive &&
        entry.factionId === 'cao' &&
        entry.location.kind === 'city' &&
        entry.location.cityId === city.id,
    );
    // One infantry commander with leadership 40 and a deep reserve of matching soldiers.
    for (const officer of local) officer.troopType = 'infantry';
    const lead = local[0]!;
    for (const officer of local.slice(1))
      Object.assign(officer, { troops: 0, wounded: 0, reorganizationDays: 1 });
    Object.assign(lead, { leadership: 40, troops: 1000, wounded: 0 });
    city.reservePools.infantry.troops = 8000;
    city.reserve = Object.values(city.reservePools).reduce((sum, pool) => sum + pool.troops, 0);
    state.personnelDay = createPersonnelDay(state);
    return { state, city, lead };
  }

  it('fills to the managed capacity first and tops up only under threat', () => {
    threatened.on = false;
    const { state, city, lead } = fixture();
    expect(availableReserveTroops(state, city.id, 'infantry')).toBeGreaterThanOrEqual(8000);
    const calm = executeV03Command(state, { type: 'fillOfficersFromReserve', cityId: city.id });
    expect(calm.ok, calm.error).toBe(true);
    expect(calm.state.officers.find((entry) => entry.id === lead.id)!.troops).toBe(4000);

    threatened.on = true;
    try {
      const war = executeV03Command(state, { type: 'fillOfficersFromReserve', cityId: city.id });
      expect(war.ok, war.error).toBe(true);
      expect(war.state.officers.find((entry) => entry.id === lead.id)!.troops).toBeGreaterThan(
        4000,
      );
    } finally {
      threatened.on = false;
    }
  });
});
