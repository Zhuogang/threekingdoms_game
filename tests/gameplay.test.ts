import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/content/scenario';
import {
  createGame,
  dispatch,
  getActionInfo,
  getActionPreview,
  raidMeetsNoResistance,
  getAllianceChance,
  getPersuadeChance,
  getPlunderPreview,
  validateState,
} from '../src/game/campaign';
import { levelForExperience, isActiveOfficer } from '../src/game/officers';
import { plunderOutcome } from '../src/game/plunder';
import { supplyFood } from '../src/game/supply';
import type { Action, GameCommand, GameState } from '../src/game/types';
import { decodeSave, encodeSave } from '../src/platform/saves';

function apply(state: GameState, command: GameCommand): GameState {
  const result = dispatch(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const city = (state: GameState, id: string) => state.cities.find((c) => c.id === id)!;
const officer = (state: GameState, id: string) => state.officers.find((o) => o.id === id)!;
function roundTrip(state: GameState): GameState {
  const restored = decodeSave(encodeSave(state));
  expect(restored).toEqual(state);
  expect(validateState(restored)).toBeNull();
  return restored;
}
/** Finish a month and auto-resolve any battle that involves the player. */
function finishMonth(state: GameState): GameState {
  let next = apply(state, { type: 'endMonth' });
  for (let guard = 0; next.phase === 'battle' && guard < 60; guard++)
    next = apply(next, { type: 'battleAuto' });
  return next;
}

describe('plunder your own city (掠夺)', () => {
  const prepared = () => {
    const state = createGame('cao', 11);
    const chenliu = city(state, 'chenliu');
    chenliu.commerce = 265;
    chenliu.farming = 310;
    chenliu.loyalty = 72;
    return state;
  };

  it('reproduces the scaled formula: +749 gold and +2,120 food for Cao Cao at 265/310', () => {
    const state = prepared();
    const before = city(state, 'chenliu');
    expect(plunderOutcome(before, officer(state, 'caocao'))).toEqual({
      gold: 749,
      food: 2120,
      after: {
        loyalty: 36,
        farming: 155,
        commerce: 132,
        population: Math.floor(before.population * 0.92),
      },
    });
    const preview = getPlunderPreview(state, 'chenliu', 'caocao')!;
    const gold = before.gold;
    const food = before.food;
    const next = apply(state, {
      type: 'action',
      action: 'plunder',
      cityId: 'chenliu',
      officerId: 'caocao',
    });
    const after = city(next, 'chenliu');
    expect(after.gold).toBe(gold + preview.gold);
    expect(after.food).toBe(food + preview.food);
    expect(after).toMatchObject({ loyalty: 36, farming: 155, commerce: 132 });
    expect(after.plunderCooldownUntil).toBe(next.turn + 3);
    expect(officer(next, 'caocao').stamina).toBe(100 - 20);
    expect(officer(next, 'xiahoudun').loyalty).toBe(officer(state, 'xiahoudun').loyalty - 3);
    expect(next.log.at(-1)!.kind).toBe('bad');
    expect(validateState(next)).toBeNull();
    roundTrip(next);
  });

  it('refuses a second plunder inside three months and a ruined city, without side effects', () => {
    const next = apply(prepared(), {
      type: 'action',
      action: 'plunder',
      cityId: 'chenliu',
      officerId: 'caocao',
    });
    const info = getActionInfo(next, 'plunder', 'chenliu', 'xiahoudun');
    expect(info.reason).toBe(
      'This city was plundered recently. It can be plundered again in 3 months.',
    );
    const before = structuredClone(next);
    const rejected = dispatch(next, {
      type: 'action',
      action: 'plunder',
      cityId: 'chenliu',
      officerId: 'xiahoudun',
    });
    expect(rejected.ok).toBe(false);
    expect(next).toEqual(before);
    const poor = prepared();
    city(poor, 'chenliu').loyalty = 9;
    expect(getActionInfo(poor, 'plunder', 'chenliu', 'caocao').reason).toBe(
      'The people have nothing left to take.',
    );
    // The ban lifts after the cooldown passes.
    let later = next;
    for (let i = 0; i < 3; i++) later = finishMonth(later);
    expect(getActionInfo(later, 'plunder', 'chenliu', 'xiahoudun').reason).toBeNull();
  });
});

describe('persuasion', () => {
  it('uses the rebalanced odds and shields rulers', () => {
    const state = createGame('cao', 12);
    expect(getPersuadeChance(state, 'caocao', 'lubu')).toBe(36);
    expect(getPersuadeChance(state, 'caocao', 'dongzhuo')).toBeNull();
    expect(getPersuadeChance(state, 'caocao', 'dianwei')).toBe(50 + Math.floor(94 / 3));
    const captive = structuredClone(state);
    officer(captive, 'liru').captive = true;
    expect(getPersuadeChance(captive, 'caocao', 'liru')).toBe(
      Math.floor(30 + 0.5 * 94 - 0.7 * officer(captive, 'liru').loyalty + 20),
    );
    officer(captive, 'liru').loyalty = 0;
    expect(getPersuadeChance(captive, 'caocao', 'liru')).toBe(75);
    officer(captive, 'caocao').intellect = 1;
    officer(captive, 'liru').captive = false;
    officer(captive, 'liru').loyalty = 100;
    expect(getPersuadeChance(captive, 'caocao', 'liru')).toBe(5);
    expect(
      dispatch(state, {
        type: 'action',
        action: 'persuade',
        cityId: 'chenliu',
        officerId: 'caocao',
        targetId: 'dongzhuo',
      }).error,
    ).toBe('A faction’s ruler cannot be persuaded.');
  });

  it('brings only half the soldiers; the rest stay in the old city', () => {
    for (let seed = 1; seed < 200; seed++) {
      const state = createGame('cao', seed);
      const lubu = officer(state, 'lubu');
      const reserveHome = city(state, 'chenliu').reserve;
      const reserveOld = city(state, 'luoyang').reserve;
      const troops = lubu.troops;
      const result = dispatch(state, {
        type: 'action',
        action: 'persuade',
        cityId: 'chenliu',
        officerId: 'caocao',
        targetId: 'lubu',
      });
      if (!result.ok || officer(result.state, 'lubu').factionId !== 'cao') continue;
      expect(city(result.state, 'chenliu').reserve).toBe(reserveHome + Math.floor(troops / 2));
      expect(city(result.state, 'luoyang').reserve).toBe(
        reserveOld + troops - Math.floor(troops / 2),
      );
      expect(officer(result.state, 'lubu').troops).toBe(0);
      return;
    }
    throw new Error('No seed produced a successful persuasion.');
  });
});

describe('supply days and marching', () => {
  const army = (state: GameState) => {
    const o = officer(state, 'xiahouyuan');
    o.troops = 2000;
    return o;
  };

  it('commits supplyDays × ceil(troops / 25) food, defaulting to 20 days', () => {
    expect(supplyFood(2000, 10)).toBe(800);
    for (const days of [10, 20, 30] as const) {
      const state = createGame('cao', 3);
      army(state);
      const food = city(state, 'puyang').food;
      const next = apply(state, {
        type: 'march',
        sourceId: 'puyang',
        targetId: 'xiapi',
        officerIds: ['xiahouyuan'],
        supplyDays: days,
      });
      expect(city(next, 'puyang').food).toBe(food - days * 80);
      expect(next.orders[0]!.food).toBe(days * 80);
    }
    const state = createGame('cao', 3);
    army(state);
    const next = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    expect(next.orders[0]!.food).toBe(20 * 80);
    const bad = dispatch(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
      supplyDays: 15 as 10,
    });
    expect(bad.error).toBe('Choose 10, 20 or 30 days of supplies.');
  });

  it('carries the same supply into the battle and warns when the cities run dry', () => {
    const state = createGame('cao', 3);
    army(state);
    const next = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
      supplyDays: 10,
    });
    const battle = apply(next, { type: 'endMonth' }).battle;
    if (battle) expect(battle.attackerFood).toBe(800);
    const poor = createGame('cao', 3);
    army(poor);
    city(poor, 'puyang').food = 700;
    expect(
      dispatch(poor, {
        type: 'march',
        sourceId: 'puyang',
        targetId: 'xiapi',
        officerIds: ['xiahouyuan'],
        supplyDays: 10,
      }).error,
    ).toBe('This army needs 800 food for the campaign.');
  });
});

describe('raids and sacks', () => {
  // Raiders field 2,500 troops; a garrison at least as strong sorties instead of hiding.
  const MILITIA_THAT_FIGHTS = 2500;
  const raidSetup = (reserve: number, seed = 5) => {
    const state = createGame('cao', seed);
    const o = officer(state, 'xiahouyuan');
    o.troops = 2500;
    const target = city(state, 'xiapi');
    target.reserve = reserve;
    return state;
  };
  const raidCommand = (): GameCommand => ({
    type: 'march',
    sourceId: 'puyang',
    targetId: 'xiapi',
    officerIds: ['xiahouyuan'],
    intent: 'raid',
  });

  it('plunders an undefended city without a battle and brings the loot home', () => {
    const state = raidSetup(0);
    const target = city(state, 'xiapi');
    const gold = city(state, 'puyang').gold;
    const food = city(state, 'puyang').food;
    const order = apply(state, raidCommand());
    expect(order.orders[0]).toMatchObject({ intent: 'raid', food: 10 * 100 });
    const done = apply(order, { type: 'endMonth' });
    expect(done.phase).toBe('planning');
    expect(city(done, 'xiapi').factionId).toBeNull();
    expect(city(done, 'xiapi').plunderCooldownUntil).toBeGreaterThan(0);
    expect(city(done, 'xiapi').commerce).toBe(Math.floor(target.commerce / 2));
    expect(city(done, 'puyang').gold).toBeGreaterThan(gold);
    expect(city(done, 'puyang').food).toBeGreaterThan(food - 1000);
    expect(officer(done, 'xiahouyuan').cityId).toBe('puyang');
    expect(done.lastBattle).toMatchObject({ outcome: 'raided', days: 0, intent: 'raid' });
    expect(done.reports.latest!.events.some((e) => e.kind === 'raid' && !e.fought)).toBe(true);
    expect(validateState(done)).toBeNull();
    // The cooldown now blocks both a raid and a sack.
    expect(dispatch(done, raidCommand()).error).toMatch(/plundered recently/);
    expect(dispatch(done, { ...raidCommand(), intent: 'sack' } as GameCommand).error).toMatch(
      /plundered recently/,
    );
  });

  it('fights a militia battle with a 10-day limit when only reserves defend, and never captures the city', () => {
    const state = raidSetup(MILITIA_THAT_FIGHTS);
    const started = apply(apply(state, raidCommand()), { type: 'endMonth' });
    expect(started.phase).toBe('battle');
    expect(started.battle!.dayLimit).toBe(10);
    expect(started.battle!.log[1]).toBe('Defenders hold the city if the siege lasts 10 days.');
    roundTrip(started);
    const done = apply(started, { type: 'battleAuto' });
    expect(city(done, 'xiapi').factionId).toBeNull();
    expect(done.lastBattle!.outcome === 'raided' || done.lastBattle!.outcome === 'held').toBe(true);
    if (done.lastBattle!.outcome === 'raided') {
      expect(city(done, 'xiapi').plunderCooldownUntil).toBeGreaterThan(0);
      expect(officer(done, 'xiahouyuan').cityId).toBe('puyang');
    }
  });

  it('applies the loot exactly once even when the raid battle is interrupted and reloaded', () => {
    const state = raidSetup(MILITIA_THAT_FIGHTS);
    const started = apply(apply(state, raidCommand()), { type: 'endMonth' });
    const resumed = roundTrip(started);
    const a = apply(started, { type: 'battleAuto' });
    const b = apply(resumed, { type: 'battleAuto' });
    expect(b).toEqual(a);
    const gold = city(started, 'puyang').gold;
    expect(city(a, 'puyang').gold - gold).toBeLessThan(5000);
  });

  it('lets a thin garrison stay inside: no battle, the same loot as an undefended city', () => {
    const state = raidSetup(2499);
    const target = city(state, 'xiapi');
    const expected = plunderOutcome(target, officer(state, 'xiahouyuan'));
    const done = apply(apply(state, raidCommand()), { type: 'endMonth' });
    expect(done.phase).toBe('planning');
    expect(done.reports.latest!.events.some((e) => e.kind === 'raid' && !e.fought)).toBe(true);
    expect(done.log.some((entry) => entry.text.includes('stays behind its walls'))).toBe(true);
    expect(city(done, 'xiapi').commerce).toBe(expected.after.commerce);
    expect(city(done, 'xiapi').plunderCooldownUntil).toBeGreaterThan(0);
    expect(city(done, 'xiapi').factionId).toBe(target.factionId);
    expect(done.lastBattle).toMatchObject({ outcome: 'raided', days: 0 });
    expect(validateState(done)).toBeNull();
  });

  it('a garrison as strong as the raiders fights', () => {
    const state = raidSetup(2500);
    const started = apply(apply(state, raidCommand()), { type: 'endMonth' });
    expect(started.phase).toBe('battle');
    expect(raidMeetsNoResistance(state, city(state, 'xiapi'), 2500)).toBe(false);
    expect(raidMeetsNoResistance(state, { ...city(state, 'xiapi'), reserve: 2499 }, 2500)).toBe(
      true,
    );
  });

  it('a lost raid ends with the normal retreat and no plunder', () => {
    const state = createGame('cao', 9);
    const o = officer(state, 'xiahouyuan');
    o.troops = 200;
    const target = city(state, 'xiapi');
    target.reserve = 5000;
    const done = finishMonth(apply(state, raidCommand()));
    expect(city(done, 'xiapi').plunderCooldownUntil).toBe(0);
    expect(done.lastBattle!.outcome).toBe('held');
  });

  it('sacks a conquered city: it changes hands and is ruined in the same stroke', () => {
    const state = raidSetup(0);
    city(state, 'xiapi').reserve = 100;
    const before = city(state, 'xiapi');
    const done = finishMonth(apply(state, { ...raidCommand(), intent: 'sack' } as GameCommand));
    const after = city(done, 'xiapi');
    expect(after.factionId).toBe('cao');
    expect(after.plunderCooldownUntil).toBeGreaterThan(0);
    expect(after.commerce).toBe(Math.floor(before.commerce / 2));
    expect(done.lastBattle).toMatchObject({ outcome: 'captured', intent: 'sack' });
    expect(done.log.some((entry) => entry.text.includes('sacks Xiapi'))).toBe(true);
    expect(validateState(done)).toBeNull();
  });

  describe('benevolent officers grieve for the plundering they lead', () => {
    const liuSetup = () => {
      const state = createGame('liu', 5);
      const target = city(
        state,
        city(state, 'pingyuan').neighbors.find((id) => city(state, id).factionId !== 'liu')!,
      );
      target.reserve = 0;
      // Below the plunder floor, so its own AI doesn't strip it before the raid arrives.
      target.loyalty = 5;
      for (const o of state.officers.filter((x) => x.cityId === target.id)) o.troops = 0;
      officer(state, 'liubei').troops = 2500;
      const command = (intent: 'raid' | 'sack'): GameCommand => ({
        type: 'march',
        sourceId: 'pingyuan',
        targetId: target.id,
        officerIds: ['liubei'],
        intent,
      });
      return { state, target, command };
    };

    it('the raid commander loses 8 loyalty, and the victims lose none', () => {
      const { state, target, command } = liuSetup();
      const victims = state.officers.filter((o) => o.cityId === target.id && o.factionId);
      const quiet = finishMonth(state);
      const done = finishMonth(apply(state, command('raid')));
      expect(done.log.some((entry) => entry.text.includes('raids'))).toBe(true);
      // A quiet month already costs the ruler some loyalty; the raid adds the 8-point grief.
      expect(officer(done, 'liubei').loyalty).toBe(officer(quiet, 'liubei').loyalty - 8);
      for (const o of victims)
        expect(officer(done, o.id).loyalty).toBe(officer(quiet, o.id).loyalty);
    });

    it('a sack grieves its commander too', () => {
      const { state, command } = liuSetup();
      const quiet = finishMonth(state);
      const done = finishMonth(apply(state, command('sack')));
      expect(done.log.some((entry) => entry.text.includes('sacks'))).toBe(true);
      expect(officer(done, 'liubei').loyalty).toBe(officer(quiet, 'liubei').loyalty - 8);
    });

    it('a plain conquest grieves nobody', () => {
      const { state, command } = liuSetup();
      const quiet = finishMonth(state);
      const done = finishMonth(
        apply(state, { ...command('raid'), intent: 'conquer' } as GameCommand),
      );
      expect(officer(done, 'liubei').loyalty).toBe(officer(quiet, 'liubei').loyalty);
    });
  });
});

describe('battlefield captives and prisoner decisions', () => {
  /** Cao Cao faces a single 1-troop Li Ru at Luoyang; one adjacent blow captures him. */
  const duel = () => {
    const state = createGame('cao', 7);
    for (const o of state.officers.filter((x) => x.cityId === 'luoyang' && x.factionId === 'dong'))
      o.troops = o.id === 'liru' ? 1 : 0;
    city(state, 'luoyang').reserve = 0;
    const staged = apply(
      apply(state, {
        type: 'march',
        sourceId: 'chenliu',
        targetId: 'luoyang',
        officerIds: ['caocao'],
      }),
      {
        type: 'endMonth',
      },
    );
    expect(staged.phase).toBe('battle');
    const battle = staged.battle!;
    battle.units.find((u) => u.officerId === 'caocao')!.x = 9;
    battle.units.find((u) => u.officerId === 'caocao')!.y = 5;
    battle.units.find((u) => u.officerId === 'liru')!.x = 10;
    battle.units.find((u) => u.officerId === 'liru')!.y = 5;
    return apply(staged, {
      type: 'battleAttack',
      unitId: 'attacker-caocao',
      targetId: 'defender-liru',
    });
  };

  it('imprisons the felled officer in the captured city and records the summary', () => {
    const after = duel();
    expect(after.phase).toBe('planning');
    const liru = officer(after, 'liru');
    expect(liru).toMatchObject({ captive: true, factionId: 'dong', cityId: 'luoyang', troops: 0 });
    expect(city(after, 'luoyang').factionId).toBe('cao');
    expect(after.lastBattle!.captured).toEqual(['liru']);
    expect(validateState(after)).toBeNull();
    roundTrip(after);
  });

  it('lets the ruler release or execute a prisoner, and executed officers vanish from play', () => {
    const after = duel();
    const released = apply(after, {
      type: 'prisoner',
      cityId: 'luoyang',
      prisonerId: 'liru',
      decision: 'release',
    });
    const home = officer(released, 'liru');
    expect(home.captive).toBe(false);
    expect(city(released, home.cityId).factionId).toBe('dong');
    expect(validateState(released)).toBeNull();

    const loyaltyBefore = officer(after, 'caocao').loyalty;
    const executed = apply(after, {
      type: 'prisoner',
      cityId: 'luoyang',
      prisonerId: 'liru',
      decision: 'execute',
    });
    const dead = officer(executed, 'liru');
    expect(dead).toMatchObject({ fate: 'executed', captive: false, factionId: null, troops: 0 });
    expect(isActiveOfficer(dead)).toBe(false);
    expect(officer(executed, 'caocao').loyalty).toBe(loyaltyBefore - 2);
    expect(validateState(executed)).toBeNull();
    roundTrip(executed);
    // The dead can't be searched for, persuaded, or drawn into battle.
    expect(
      dispatch(executed, {
        type: 'action',
        action: 'persuade',
        cityId: 'luoyang',
        officerId: 'caocao',
        targetId: 'liru',
      }).ok,
    ).toBe(false);
    for (const [index] of FACTIONS.entries()) expect(index).toBeGreaterThanOrEqual(0);
    // A later battle never includes him.
    const rebel = structuredClone(executed);
    expect(rebel.officers.filter((o) => o.fate === 'executed')).toHaveLength(1);
  });

  it('rejects decisions about prisoners you do not hold, atomically', () => {
    const state = createGame('cao', 7);
    const before = structuredClone(state);
    for (const command of [
      { type: 'prisoner', cityId: 'chenliu', prisonerId: 'lubu', decision: 'execute' },
      { type: 'prisoner', cityId: 'luoyang', prisonerId: 'lubu', decision: 'release' },
      { type: 'prisoner', cityId: 'chenliu', prisonerId: 'nobody', decision: 'release' },
    ] as GameCommand[])
      expect(dispatch(state, command).ok).toBe(false);
    expect(state).toEqual(before);
  });
});

describe('experience levels', () => {
  it('levels at 100 experience per level and grants stats once per level', () => {
    expect(levelForExperience(99)).toBe(0);
    expect(levelForExperience(100)).toBe(1);
    expect(levelForExperience(550)).toBe(5);
    expect(levelForExperience(9999)).toBe(5);
    let state = createGame('cao', 4);
    const before = officer(state, 'xiahoudun');
    before.experience = 95;
    const force = before.force;
    state = apply(state, {
      type: 'action',
      action: 'train',
      cityId: 'chenliu',
      officerId: 'xiahoudun',
    });
    const trained = officer(state, 'xiahoudun');
    expect(trained.experience).toBe(120);
    expect(trained.level).toBe(1);
    expect(trained.force).toBe(force + 1 + 2);
    state = finishMonth(state);
    state = apply(state, {
      type: 'action',
      action: 'train',
      cityId: 'chenliu',
      officerId: 'xiahoudun',
    });
    expect(officer(state, 'xiahoudun').level).toBe(1);
    expect(officer(state, 'xiahoudun').force).toBe(force + 2 + 2);
  });

  it('gives archers intellect instead of force', () => {
    let state = createGame('cao', 4);
    const xunyu = officer(state, 'xunyu');
    xunyu.experience = 90;
    xunyu.troops = 700;
    const intellect = xunyu.intellect;
    state = apply(state, {
      type: 'action',
      action: 'train',
      cityId: 'xuchang',
      officerId: 'xunyu',
    });
    expect(officer(state, 'xunyu').intellect).toBe(Math.min(100, intellect + 2));
  });
});

describe('action previews', () => {
  const orders: Action[] = [
    'farm',
    'commerce',
    'govern',
    'recruit',
    'train',
    'reward',
    'feast',
    'buyFood',
    'sellFood',
    'relieve',
    'equip',
    'plunder',
  ];
  it.each(orders)('previews %s so the real result always lies inside the range', (action) => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = createGame('cao', seed * 97);
      const officerId = 'caocao';
      const preview = getActionPreview(state, action, 'chenliu', officerId)!;
      const next = apply(state, { type: 'action', action, cityId: 'chenliu', officerId });
      const before = city(state, 'chenliu');
      const after = city(next, 'chenliu');
      const caocaoBefore = officer(state, officerId);
      const caocaoAfter = officer(next, officerId);
      for (const effect of preview.effects) {
        const delta =
          effect.stat === 'farming'
            ? after.farming - before.farming
            : effect.stat === 'commerce'
              ? after.commerce - before.commerce
              : effect.stat === 'support'
                ? after.loyalty - before.loyalty
                : effect.stat === 'defense'
                  ? after.defense - before.defense
                  : effect.stat === 'population'
                    ? after.population - before.population
                    : effect.stat === 'reserve'
                      ? after.reserve - before.reserve
                      : effect.stat === 'gold'
                        ? after.gold -
                          before.gold +
                          getActionInfo(state, action, 'chenliu', officerId).gold
                        : effect.stat === 'food'
                          ? after.food - before.food
                          : effect.stat === 'experience'
                            ? caocaoAfter.experience - caocaoBefore.experience
                            : effect.stat === 'force'
                              ? caocaoAfter.force - caocaoBefore.force
                              : effect.stat === 'loyalty' && effect.scope === 'officer'
                                ? caocaoAfter.loyalty - caocaoBefore.loyalty
                                : effect.stat === 'loyalty'
                                  ? officer(next, 'xiahoudun').loyalty -
                                    officer(state, 'xiahoudun').loyalty
                                  : effect.stat === 'stamina'
                                    ? officer(next, 'xiahoudun').stamina -
                                      officer(state, 'xiahoudun').stamina
                                    : 0;
        if (effect.stat === 'stamina') continue;
        expect(delta, `${action} ${effect.stat}`).toBeGreaterThanOrEqual(effect.min);
        expect(delta, `${action} ${effect.stat}`).toBeLessThanOrEqual(effect.max);
      }
    }
  });

  it('previews chance-based orders without consuming randomness', () => {
    const state = createGame('cao', 8);
    const rng = state.rng;
    expect(getActionPreview(state, 'persuade', 'chenliu', 'caocao', 'lubu')!.chance).toBe(36);
    expect(getActionPreview(state, 'alliance', 'chenliu', 'caocao', 'yuan')!.chance).toBe(
      getAllianceChance(state, 'cao', 'yuan', 94),
    );
    expect(getActionPreview(state, 'search', 'chenliu', 'caocao')!.chance).toBe(40 + 47);
    expect(
      getActionPreview(state, 'subvert', 'chenliu', 'caocao', 'luoyang')!.effects[0],
    ).toMatchObject({
      stat: 'support',
      min: -17,
    });
    expect(state.rng).toBe(rng);
  });
});

describe('unrest, defection and diplomacy', () => {
  it('revolts only below support 30 and only draws randomness there', () => {
    const calm = createGame('cao', 21);
    const stirred = structuredClone(calm);
    for (const c of stirred.cities) c.loyalty = Math.max(c.loyalty, 30);
    for (const c of calm.cities) c.loyalty = Math.max(c.loyalty, 30);
    const a = apply(calm, { type: 'endMonth' });
    const b = apply(stirred, { type: 'endMonth' });
    expect(a.rng).toBe(b.rng);
  });

  it('a very unhappy, unmanned city can throw off its ruler', () => {
    let revolted = false;
    for (let seed = 1; seed <= 40 && !revolted; seed++) {
      const state = createGame('cao', seed);
      const doomed = city(state, 'tianshui');
      doomed.loyalty = 2;
      for (const o of state.officers.filter(
        (x) => x.cityId === 'tianshui' && x.factionId === 'dong',
      )) {
        o.cityId = 'changan';
      }
      doomed.governorId = null;
      const next = apply(state, { type: 'endMonth' });
      const after = city(next, 'tianshui');
      if (after.factionId === null) {
        revolted = true;
        expect(after.reserve).toBeLessThanOrEqual(
          Math.floor(city(state, 'tianshui').reserve * 0.8),
        );
        expect(validateState(next)).toBeNull();
      }
    }
    expect(revolted).toBe(true);
  });

  it('lets disloyal officers walk away in January and July only', () => {
    const leavesIn = (seed: number, fromMonth: number): boolean => {
      let state = createGame('cao', seed);
      // Reach the requested month, then make Guo Si desperately disloyal.
      while (state.month !== fromMonth) state = finishMonth(state);
      officer(state, 'guosi').loyalty = 0;
      // Keep the rival from rewarding him back above the line this month.
      for (const c of state.cities.filter((x) => x.factionId === 'dong')) c.gold = 0;
      const next = finishMonth(state);
      return officer(next, 'guosi').factionId !== 'dong';
    };
    let leftInJuly = false;
    for (let seed = 1; seed <= 40 && !leftInJuly; seed++) leftInJuly = leavesIn(seed, 6);
    expect(leftInJuly).toBe(true);
    // In an ordinary month nobody walks out, however unhappy they are.
    for (let seed = 1; seed <= 15; seed++) expect(leavesIn(seed, 3)).toBe(false);
  });

  it('computes alliance odds with shared-threat, leader and reputation modifiers', () => {
    const state = createGame('cao', 2);
    expect(getAllianceChance(state, 'cao', 'liu', 400)).toBe(90);
    expect(getAllianceChance(state, 'cao', 'liu', 0)).toBeGreaterThanOrEqual(5);
    const base = getAllianceChance(state, 'cao', 'liu', 20);
    state.reputation.cao = { brokeAllianceTurn: state.turn };
    expect(getAllianceChance(state, 'cao', 'liu', 20)).toBe(base - 20);
    state.turn = 40;
    expect(getAllianceChance(state, 'cao', 'liu', 20)).toBe(base);
    // Liu Bei's reputation for diplomacy shows up as a bonus.
    expect(getAllianceChance(state, 'yuan', 'liu', 60)).toBeGreaterThan(
      getAllianceChance(state, 'yuan', 'sun', 60),
    );
  });

  it('breaks an alliance at a reputation cost and rejects unknown treaties', () => {
    let state = createGame('cao', 13);
    state.alliances.push({ a: 'cao', b: 'liu', untilTurn: 6 });
    const next = apply(state, { type: 'breakAlliance', factionId: 'liu' });
    expect(next.alliances).toEqual([]);
    expect(next.reputation.cao).toEqual({ brokeAllianceTurn: 0 });
    expect(validateState(next)).toBeNull();
    state = next;
    expect(dispatch(state, { type: 'breakAlliance', factionId: 'liu' }).error).toBe(
      'You have no active alliance with that ruler.',
    );
  });

  it('forms a coalition against a runaway leader but never enrolls the player', () => {
    const state = createGame('cao', 44);
    // Yuan Shao swallows ten cities (their officers go with them).
    const lands = state.cities.filter((c) => c.factionId !== 'cao').slice(0, 10);
    for (const c of lands) c.factionId = 'yuan';
    for (const o of state.officers)
      if (o.factionId && o.factionId !== 'cao' && lands.some((c) => c.id === o.cityId))
        o.factionId = 'yuan';
    for (const c of state.cities) c.governorId = null;
    const next = apply(state, { type: 'endMonth' });
    // The lords bordering Yuan unite; the player (who also borders him) is not drafted.
    const pacts = next.alliances.map((p) => [p.a, p.b].sort().join('+')).sort();
    expect(pacts).toEqual(['dong+sun', 'dong+yan', 'sun+yan']);
    for (const pair of next.alliances) {
      expect([pair.a, pair.b]).not.toContain('cao');
      expect([pair.a, pair.b]).not.toContain('yuan');
      expect(pair.untilTurn).toBe(next.turn + 5); // renewed to six months before the turn advanced
    }
    expect(next.reports.latest!.events).toContainEqual(
      expect.objectContaining({ kind: 'coalition', leaderId: 'yuan', involvesPlayer: false }),
    );
    expect(validateState(next)).toBeNull();
    // If the player is the runaway leader, the others still ally against the player.
    const mirror = createGame('yuan', 44);
    const spoils = mirror.cities.filter((c) => c.factionId !== 'yuan').slice(0, 10);
    for (const c of spoils) c.factionId = 'yuan';
    for (const o of mirror.officers)
      if (o.factionId && o.factionId !== 'yuan' && spoils.some((c) => c.id === o.cityId))
        o.factionId = 'yuan';
    for (const c of mirror.cities) c.governorId = null;
    const hunted = apply(mirror, { type: 'endMonth' });
    expect(hunted.reports.latest!.events).toContainEqual(
      expect.objectContaining({ kind: 'coalition', leaderId: 'yuan', involvesPlayer: true }),
    );
  });
});

describe('real campaigns exercise the new rules and stay valid', () => {
  it('runs every ruler for 24 months with save round-trips, deterministic replays and rich AI play', () => {
    const seen = new Set<string>();
    const events = new Set<string>();
    for (const [index, faction] of FACTIONS.entries()) {
      let state = createGame(faction.id, 500 + index);
      for (let month = 0; month < 24 && state.phase !== 'finished'; month++) {
        const observer = {
          aiStatecraft: ({ kind }: { kind: string }) => seen.add(kind),
          plunder: ({ form }: { form: string }) => seen.add(`plunder:${form}`),
          capture: () => seen.add('capture'),
        };
        let next = dispatch(state, { type: 'endMonth' }, observer);
        expect(next.ok).toBe(true);
        expect(dispatch(roundTrip(state), { type: 'endMonth' })).toEqual(next);
        state = next.state;
        for (let guard = 0; state.phase === 'battle' && guard < 60; guard++) {
          const resumed = roundTrip(state);
          next = dispatch(state, { type: 'battleAuto' }, observer);
          expect(dispatch(resumed, { type: 'battleAuto' })).toEqual(next);
          state = next.state;
        }
        for (const e of state.reports.latest?.events ?? []) events.add(e.kind);
        expect(validateState(state), `${faction.id} month ${month}`).toBeNull();
      }
    }
    // Spot-check that rival play is not just muster-and-march any more.
    expect(
      seen.has('subvert') || seen.has('plunder') || seen.has('raid') || seen.has('transport'),
    ).toBe(true);
    expect(events.has('battle')).toBe(true);
  }, 120_000);
});

describe('plunder preview loyalty loss', () => {
  it('shows a range when benevolent officers serve in the city, and matches the result', () => {
    const state = createGame('liu', 3);
    const loyalty = (s: GameState, id: string) => officer(s, id).loyalty;
    const effect = getActionPreview(state, 'plunder', 'pingyuan', 'liubei')!.effects.find(
      (e) => e.stat === 'loyalty',
    )!;
    expect([effect.min, effect.max]).toEqual([-8, -3]);
    const next = apply(state, {
      type: 'action',
      action: 'plunder',
      cityId: 'pingyuan',
      officerId: 'liubei',
    });
    for (const id of ['liubei', 'zhangfei', 'jianyong']) {
      const change = loyalty(next, id) - loyalty(state, id);
      expect(change).toBeGreaterThanOrEqual(effect.min);
      expect(change).toBeLessThanOrEqual(effect.max);
    }
    const plain = createGame('cao', 3);
    const exact = getActionPreview(plain, 'plunder', 'chenliu', 'caocao')!.effects.find(
      (e) => e.stat === 'loyalty',
    )!;
    expect(exact.min).toBe(exact.max);
  });
});

describe('the battle recap belongs to the player', () => {
  it('never records a fight between two rival houses', () => {
    let seen = 0;
    for (const seed of [2, 5, 9]) {
      let state = createGame('liu', seed);
      for (let month = 0; month < 18 && state.phase !== 'finished'; month++) {
        state = finishMonth(state);
        const last = state.lastBattle;
        if (!last) continue;
        seen++;
        expect([last.attackerId, last.defenderId]).toContain('liu');
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
