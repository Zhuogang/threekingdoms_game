import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/content/scenario';
import {
  chooseAlliancePartner,
  createGame,
  dispatch,
  getActionInfo,
  validateState,
} from '../src/game/campaign';
import type { Action, GameCommand, GameState } from '../src/game/types';
import { decodeSave, encodeSave } from '../src/platform/saves';

function apply(state: GameState, command: GameCommand): GameState {
  const result = dispatch(state, command);
  expect(result.error, JSON.stringify(command)).toBeUndefined();
  expect(result.ok).toBe(true);
  return result.state;
}
function completeMonth(state: GameState): GameState {
  state = apply(state, { type: 'endMonth' });
  for (let guard = 0; state.phase === 'battle' && guard < 60; guard++)
    state = apply(state, { type: 'battleAuto' });
  expect(state.phase).not.toBe('battle');
  return state;
}
function neutralNeighbors(): GameState {
  const state = createGame('cao', 428);
  for (const city of state.cities) {
    if (city.factionId !== 'cao') {
      city.factionId = null;
      city.governorId = null;
    }
  }
  for (const officer of state.officers) {
    if (officer.factionId !== 'cao') {
      officer.factionId = null;
      officer.troops = 0;
    }
  }
  return state;
}

describe('campaign command boundaries', () => {
  it('creates valid, independent scenarios for all six rulers', () => {
    for (const faction of FACTIONS) expect(validateState(createGame(faction.id))).toBeNull();
    const first = createGame('cao');
    first.cities[0]!.food = 0;
    expect(createGame('cao').cities[0]!.food).toBeGreaterThan(0);
    expect(() => createGame('missing')).toThrow();
  });

  it('uses the inspected integer farming formula immediately and commits officer availability', () => {
    const state = createGame('cao', 1);
    const before = structuredClone(state);
    const city = state.cities.find((c) => c.id === 'chenliu')!;
    const next = apply(state, {
      type: 'action',
      action: 'farm',
      cityId: 'chenliu',
      officerId: 'caocao',
    });
    const nextCity = next.cities.find((c) => c.id === city.id)!;
    // Seed 1 xorshift32 gives 270369; 270369 mod 4 = 1, so effort=3.
    expect(nextCity.farming - city.farming).toBe(Math.floor(94 / 10) * 3 + (94 >> 1));
    expect(nextCity.gold).toBe(city.gold - 100);
    expect(next.officers.find((o) => o.id === 'caocao')).toMatchObject({ busy: true, stamina: 80 });
    expect(state).toEqual(before);
    expect(validateState(next)).toBeNull();
  });

  it('rejects repeated actions, hostile orders and insufficient resources without mutation or RNG use', () => {
    const state = apply(createGame('cao'), {
      type: 'action',
      action: 'farm',
      cityId: 'chenliu',
      officerId: 'caocao',
    });
    const commands: GameCommand[] = [
      { type: 'action', action: 'commerce', cityId: 'chenliu', officerId: 'caocao' },
      { type: 'action', action: 'farm', cityId: 'ye', officerId: 'yuanshao' },
      { type: 'march', sourceId: 'chenliu', targetId: 'chengdu', officerIds: ['xiahoudun'] },
      { type: 'assignTroops', cityId: 'chenliu', officerId: 'xiahoudun', amount: 999999 },
      {
        type: 'transfer',
        sourceId: 'chenliu',
        targetId: 'xuchang',
        officerId: 'xiahoudun',
        gold: -1,
        food: 0,
        troops: 0,
      },
      {
        type: 'action',
        action: 'persuade',
        cityId: 'chenliu',
        officerId: 'xiahoudun',
        targetId: 'nobody',
      },
    ];
    const before = JSON.stringify(state);
    for (const command of commands) {
      const result = dispatch(state, command);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      expect(JSON.stringify(state)).toBe(before);
    }
  });

  it('does not mutate state or roll RNG when presenting action previews', () => {
    const state = createGame('cao');
    const before = JSON.stringify(state);
    expect(getActionInfo(state, 'farm', 'chenliu', 'caocao').reason).toBeNull();
    expect(getActionInfo(state, 'farm', 'chenliu').gold).toBe(100);
    expect(getActionInfo(state, 'farm', 'chenliu').reason).toContain('officer');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('musters from reserve without duplicating troops and returns released troops', () => {
    let state = createGame('cao');
    const original =
      state.cities.find((c) => c.id === 'chenliu')!.reserve +
      state.officers.find((o) => o.id === 'caocao')!.troops;
    state = apply(state, {
      type: 'assignTroops',
      cityId: 'chenliu',
      officerId: 'caocao',
      amount: 1500,
    });
    expect(
      state.cities.find((c) => c.id === 'chenliu')!.reserve +
        state.officers.find((o) => o.id === 'caocao')!.troops,
    ).toBe(original);
    state = apply(state, {
      type: 'assignTroops',
      cityId: 'chenliu',
      officerId: 'caocao',
      amount: 0,
    });
    expect(state.cities.find((c) => c.id === 'chenliu')!.reserve).toBe(original);
  });

  it('transports resources and the commander exactly once, then repairs the governor assignment', () => {
    const state = createGame('cao');
    const oldSource = state.cities.find((c) => c.id === 'chenliu')!;
    const oldTarget = state.cities.find((c) => c.id === 'xuchang')!;
    const next = apply(state, {
      type: 'transfer',
      sourceId: 'chenliu',
      targetId: 'xuchang',
      officerId: 'caocao',
      gold: 100,
      food: 500,
      troops: 200,
    });
    expect(next.cities.find((c) => c.id === 'chenliu')!.gold).toBe(oldSource.gold - 100);
    expect(next.cities.find((c) => c.id === 'xuchang')!.gold).toBe(oldTarget.gold + 100);
    expect(next.officers.find((o) => o.id === 'caocao')).toMatchObject({
      cityId: 'xuchang',
      busy: true,
      stamina: 85,
    });
    expect(next.cities.find((c) => c.id === 'chenliu')!.governorId).not.toBe('caocao');
    expect(validateState(next)).toBeNull();
  });

  it('rejects demobilization beyond reserve capacity without losing soldiers or corrupting a save', () => {
    const state = createGame('cao');
    state.cities.find((city) => city.id === 'chenliu')!.reserve = 9_999_999;
    expect(validateState(state)).toBeNull();
    const snapshot = structuredClone(state);
    const result = dispatch(state, {
      type: 'assignTroops',
      cityId: 'chenliu',
      officerId: 'caocao',
      amount: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(state).toEqual(snapshot);
    expect(validateState(result.state)).toBeNull();
  });

  it.each<Action>([
    'commerce',
    'govern',
    'search',
    'recruit',
    'train',
    'reward',
    'feast',
    'buyFood',
    'sellFood',
    'relieve',
    'scout',
    'persuade',
    'subvert',
    'alliance',
    'equip',
    'confiscate',
    'banish',
    'appoint',
  ])('implements %s as a valid, atomic city command', (action) => {
    const state = createGame('cao', 12);
    const officer = state.officers.find((o) => o.id === 'xiahoudun')!;
    if (action === 'confiscate') {
      officer.equipment = 'Fine arms';
      officer.force += 5;
    }
    const targetId =
      action === 'persuade'
        ? 'dianwei'
        : action === 'alliance'
          ? 'dong'
          : ['scout', 'subvert'].includes(action)
            ? 'luoyang'
            : undefined;
    const info = getActionInfo(state, action, 'chenliu', officer.id);
    const next = apply(state, {
      type: 'action',
      action,
      cityId: 'chenliu',
      officerId: officer.id,
      targetId,
    });
    expect(next.revision).toBe(state.revision + 1);
    expect(next.officers.find((o) => o.id === officer.id)!.busy).toBe(true);
    expect(next.stats.commandsIssued).toBe(1);
    expect(next.cities.find((c) => c.id === 'chenliu')!.gold).toBe(
      state.cities.find((c) => c.id === 'chenliu')!.gold -
        info.gold +
        (action === 'sellFood' ? 80 : action === 'confiscate' ? 100 : 0),
    );
    expect(validateState(next)).toBeNull();
  });
});

describe('month resolution and campaign continuation', () => {
  it('restores officer availability, advances the calendar, and applies income only once', () => {
    let state = neutralNeighbors();
    state.month = 12;
    state.turn = 11;
    state = apply(state, {
      type: 'action',
      action: 'farm',
      cityId: 'chenliu',
      officerId: 'caocao',
    });
    const beforeGold = state.cities.find((c) => c.id === 'chenliu')!.gold;
    const next = completeMonth(state);
    expect(next).toMatchObject({
      year: 191,
      month: 1,
      turn: 12,
      phase: 'planning',
      battle: null,
      resolution: null,
    });
    expect(next.officers.find((o) => o.id === 'caocao')).toMatchObject({
      age: 36,
      busy: false,
      stamina: 100,
    });
    expect(next.cities.find((c) => c.id === 'chenliu')!.gold).toBeGreaterThan(beforeGold);
    expect(validateState(next)).toBeNull();
  });

  it('commits a march now, enters battle at month end, and resumes identically after serialization', () => {
    let state = neutralNeighbors();
    const food = state.cities.find((c) => c.id === 'puyang')!.food;
    const troops = state.officers.find((o) => o.id === 'xiahouyuan')!.troops;
    state = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    expect(state.cities.find((c) => c.id === 'puyang')!.food).toBe(
      food - 20 * Math.ceil(troops / 25),
    );
    expect(state.orders).toHaveLength(1);
    expect(validateState(state)).toBeNull();
    state = apply(state, { type: 'endMonth' });
    expect(state.phase).toBe('battle');
    expect(state.turn).toBe(0);
    expect(state.resolution!.index).toBe(0);
    expect(validateState(state)).toBeNull();
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    const next = apply(state, { type: 'battleAuto' });
    expect(apply(restored, { type: 'battleAuto' })).toEqual(next);
    expect(next.turn).toBe(1);
    expect(next.phase).toBe('planning');
    expect(next.resolution).toBeNull();
    expect(validateState(next)).toBeNull();
    const repeat = dispatch(next, { type: 'battleAuto' });
    expect(repeat.ok).toBe(false);
    expect(repeat.state).toBe(next);
  });

  it('continues through two queued attacks before one monthly upkeep', () => {
    let state = neutralNeighbors();
    state = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    state = apply(state, {
      type: 'march',
      sourceId: 'xuchang',
      targetId: 'jiangxia',
      officerIds: ['caoren'],
    });
    state = apply(state, { type: 'endMonth' });
    expect(state.resolution!.index).toBe(0);
    state = apply(state, { type: 'battleRetreat' });
    expect(state.phase).toBe('battle');
    expect(state.resolution!.index).toBe(1);
    expect(state.turn).toBe(0);
    state = apply(state, { type: 'battleRetreat' });
    expect(state.phase).toBe('planning');
    expect(state.turn).toBe(1);
    expect(state.resolution).toBeNull();
    expect(validateState(state)).toBeNull();
  });

  it('automatically captures an undefended destination without leaving a finished battle pending', () => {
    let state = neutralNeighbors();
    state.cities.find((c) => c.id === 'xiapi')!.reserve = 0;
    state = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    state = completeMonth(state);
    expect(state.cities.find((c) => c.id === 'xiapi')!.factionId).toBe('cao');
    expect(state.officers.find((o) => o.id === 'xiahouyuan')!.cityId).toBe('xiapi');
    expect(state.stats.citiesCaptured).toBe(1);
    expect(validateState(state)).toBeNull();
  });

  it('permits a complete unification victory and stops accepting commands afterward', () => {
    let state = createGame('cao');
    state.cities.forEach((c) => {
      c.factionId = 'cao';
    });
    state.officers.forEach((o) => {
      if (o.factionId) o.factionId = 'cao';
    });
    state = completeMonth(state);
    expect(state).toMatchObject({ phase: 'finished', winner: 'cao' });
    expect(validateState(state)).toBeNull();
    expect(dispatch(state, { type: 'endMonth' }).ok).toBe(false);
  });

  it('ends a campaign when its last city falls', () => {
    let state = createGame('liu');
    state.cities.find((c) => c.id === 'pingyuan')!.factionId = 'yuan';
    state.cities.find((c) => c.id === 'pingyuan')!.governorId = null;
    state.officers
      .filter((o) => o.factionId === 'liu')
      .forEach((o) => {
        o.captive = true;
        o.troops = 0;
      });
    state = completeMonth(state);
    expect(state.phase).toBe('finished');
    expect(state.winner).not.toBe('liu');
    expect(validateState(state)).toBeNull();
  });

  it('reproduces an entire seeded year with AI wars and never breaks state invariants', () => {
    let uninterrupted = createGame('cao', 641),
      saved = createGame('cao', 641);
    for (let i = 0; i < 12 && uninterrupted.phase !== 'finished'; i++) {
      uninterrupted = completeMonth(uninterrupted);
      saved = completeMonth(JSON.parse(JSON.stringify(saved)) as GameState);
      expect(saved).toEqual(uninterrupted);
      expect(validateState(uninterrupted), `month ${i + 1}`).toBeNull();
    }
  }, 30000);

  it('keeps every ruler’s multi-year wars and every interrupted battle save valid', () => {
    for (const [index, faction] of FACTIONS.entries()) {
      let state = createGame(faction.id, 1001 + index);
      for (let month = 0; month < 36 && state.phase !== 'finished'; month++) {
        state = apply(state, { type: 'endMonth' });
        expect(validateState(state), `${faction.id}, month ${month}, before battle`).toBeNull();
        for (let guard = 0; state.phase === 'battle' && guard < 60; guard++) {
          state = apply(JSON.parse(JSON.stringify(state)) as GameState, { type: 'battleAuto' });
          expect(
            validateState(state),
            `${faction.id}, month ${month}, after battle ${guard}`,
          ).toBeNull();
        }
        expect(state.phase).not.toBe('battle');
      }
    }
  }, 30000);
});

describe('semantic save validation', () => {
  it('rejects contradictory ownership, calendar, map and resource data', () => {
    const mutations: ((s: GameState) => void)[] = [
      (s) => {
        s.cities[0]!.gold = -1;
      },
      (s) => {
        s.officers[0]!.cityId = 'missing';
      },
      (s) => {
        s.month = 13;
      },
      (s) => {
        s.turn = 4;
      },
      (s) => {
        s.cities[0]!.neighbors.push('chengdu');
      },
      (s) => {
        s.officers.push({ ...s.officers[0]! });
      },
      (s) => {
        s.officers[0]!.captive = true;
      },
      (s) => {
        s.phase = 'finished';
        s.winner = 'cao';
      },
      (s) => {
        s.phase = 'battle';
      },
    ];
    for (const mutate of mutations) {
      const state = createGame('cao');
      mutate(state);
      expect(validateState(state)).not.toBeNull();
    }
  });

  it('rejects corrupted battle continuations and overlapping units', () => {
    let state = neutralNeighbors();
    state = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    state = apply(state, { type: 'endMonth' });
    const noCursor = structuredClone(state);
    noCursor.resolution!.index = 99;
    expect(validateState(noCursor)).not.toBeNull();
    const overlap = structuredClone(state);
    overlap.battle!.units[1]!.x = overlap.battle!.units[0]!.x;
    overlap.battle!.units[1]!.y = overlap.battle!.units[0]!.y;
    expect(validateState(overlap)).toContain('overlap');
  });
});

describe('AI alliance partners', () => {
  it('are neighbours of the proposer, with the longest shared border first', () => {
    const state = createGame('cao', 11);
    const border = (a: string, b: string) =>
      state.cities
        .filter((c) => c.factionId === a)
        .reduce(
          (sum, c) =>
            sum +
            c.neighbors.filter((id) => state.cities.find((n) => n.id === id)!.factionId === b)
              .length,
          0,
        );
    let checked = 0;
    for (const proposer of FACTIONS) {
      for (const strongest of FACTIONS) {
        if (strongest.id === proposer.id) continue;
        const before = structuredClone(state);
        const partner = chooseAlliancePartner(state, proposer.id, strongest.id);
        expect(state).toEqual(before);
        if (!partner) continue;
        checked++;
        const shared = border(proposer.id, partner.id);
        expect(shared).toBeGreaterThan(0);
        // No other eligible neighbour of the proposer has a longer shared border.
        for (const other of FACTIONS)
          if (
            border(proposer.id, other.id) > shared &&
            ![proposer.id, strongest.id, state.playerFactionId].includes(other.id)
          )
            expect(border(other.id, strongest.id)).toBe(0);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('AI prisoner policy', () => {
  /** Cao captives held in an AI city whose officers are too dim to win anyone over. */
  const jail = (cityId: string, ids: string[], loyalty: number, judgeIntellect: number) => {
    const state = createGame('cao', 21);
    for (const o of state.officers.filter((x) => x.cityId === cityId && x.factionId))
      o.intellect = judgeIntellect;
    for (const id of ids) {
      const o = state.officers.find((x) => x.id === id)!;
      o.captive = true;
      o.cityId = cityId;
      o.troops = 0;
      o.loyalty = loyalty;
    }
    return state;
  };
  const prisonerEvents = (state: GameState) =>
    state.reports.latest!.events.filter((event) => event.kind === 'prisoner');

  it('releases hopeless captives and tells the player, unless the house executes', () => {
    const released = completeMonth(jail('ye', ['xiahoudun'], 100, 20));
    const freed = released.officers.find((o) => o.id === 'xiahoudun')!;
    expect(freed.captive).toBe(false);
    expect(freed.factionId).toBe('cao');
    expect(prisonerEvents(released)).toMatchObject([{ officerId: 'xiahoudun', fate: 'released' }]);

    const executed = completeMonth(jail('luoyang', ['xiahoudun'], 100, 20));
    const dead = executed.officers.find((o) => o.id === 'xiahoudun')!;
    expect(dead.fate).toBe('executed');
    expect(prisonerEvents(executed)).toMatchObject([{ officerId: 'xiahoudun', fate: 'executed' }]);
    expect(validateState(executed)).toBeNull();
    expect(decodeSave(encodeSave(executed))).toEqual(executed);
  });

  it('keeps at most two captives per city and never executes where the policy forbids it', () => {
    const state = jail('ye', ['xiahoudun', 'xunyu', 'caoren', 'xiahouyuan'], 85, 70);
    const next = completeMonth(state);
    const held = next.officers.filter(
      (o) => o.captive && o.cityId === 'ye' && o.factionId === 'cao',
    );
    expect(held.length).toBeLessThanOrEqual(2);
    expect(next.officers.filter((o) => o.fate === 'executed')).toHaveLength(0);
  });

  it('wins over a promising captive through the ordinary persuade rules', () => {
    let recruited = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const state = jail('ye', ['chengyu'], 5, 90);
      state.rng = seed * 101;
      const next = completeMonth(state);
      if (next.officers.find((o) => o.id === 'chengyu')!.factionId === 'yuan') {
        recruited++;
        expect(prisonerEvents(next)).toMatchObject([{ fate: 'recruited' }]);
      }
    }
    expect(recruited).toBeGreaterThan(0);
  });
});
