import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/content/scenario';
import { createGame, dispatch } from '../src/game/campaign';
import { getReachableTiles } from '../src/game/battle';
import type { Action, GameCommand, GameState } from '../src/game/types';
import { decodeSave, encodeSave } from '../src/platform/saves';

function apply(state: GameState, command: GameCommand): GameState {
  const result = dispatch(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
function roundTrip(state: GameState): GameState {
  const restored = decodeSave(encodeSave(state));
  expect(restored).toEqual(state);
  expect(restored).not.toBe(state);
  return restored;
}

describe('portable save codec', () => {
  it('round-trips every starting ruler without losing data', () => {
    for (const faction of FACTIONS) roundTrip(createGame(faction.id, 0xffffffff));
  });

  it('preserves completed actions and committed armies before month resolution', () => {
    let state = createGame('cao', 123456);
    state = apply(state, {
      type: 'action',
      action: 'farm',
      cityId: 'chenliu',
      officerId: 'caocao',
    });
    state = apply(state, {
      type: 'assignTroops',
      cityId: 'puyang',
      officerId: 'xiahouyuan',
      amount: 1800,
    });
    state = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    const restored = roundTrip(state);
    expect(apply(restored, { type: 'endMonth' })).toEqual(apply(state, { type: 'endMonth' }));
  });

  it('restores battle moves, action usage and resolution cursor with identical aftermath', () => {
    let state = createGame('cao', 16);
    state = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    state = apply(state, { type: 'endMonth' });
    expect(state.phase).toBe('battle');
    roundTrip(state);
    const unit = state.battle!.units.find((u) => u.side === state.battle!.playerSide)!;
    const tile = getReachableTiles(state.battle!, unit.id)[0]!;
    state = apply(state, { type: 'battleMove', unitId: unit.id, ...tile });
    state = roundTrip(state);
    state = apply(state, { type: 'battleWait', unitId: unit.id });
    const restored = roundTrip(state);
    const next = apply(state, { type: 'battleAuto' });
    expect(apply(restored, { type: 'battleAuto' })).toEqual(next);
    roundTrip(next);
  });

  it('accepts saved terminal victories and defeats', () => {
    let victory = createGame('cao');
    victory.cities.forEach((c) => {
      c.factionId = 'cao';
    });
    victory.officers.forEach((o) => {
      if (o.factionId) o.factionId = 'cao';
    });
    victory = apply(victory, { type: 'endMonth' });
    expect(roundTrip(victory).winner).toBe('cao');
    let defeat = createGame('liu');
    const city = defeat.cities.find((c) => c.id === 'pingyuan')!;
    city.factionId = 'yuan';
    city.governorId = null;
    defeat.officers
      .filter((o) => o.factionId === 'liu')
      .forEach((o) => {
        o.captive = true;
        o.troops = 0;
      });
    defeat = apply(defeat, { type: 'endMonth' });
    while (defeat.phase === 'battle') defeat = apply(defeat, { type: 'battleAuto' });
    expect(roundTrip(defeat).phase).toBe('finished');
  });

  it('accepts all real AI-war states, including prisoners and interrupted defensive battles', () => {
    let battleSnapshots = 0;
    for (const [index, faction] of FACTIONS.entries()) {
      let state = createGame(faction.id, 220 + index);
      for (let month = 0; month < 24 && state.phase !== 'finished'; month++) {
        state = roundTrip(apply(state, { type: 'endMonth' }));
        for (let guard = 0; state.phase === 'battle' && guard < 60; guard++) {
          battleSnapshots++;
          state = roundTrip(apply(state, { type: 'battleAuto' }));
        }
        expect(state.phase).not.toBe('battle');
      }
    }
    expect(battleSnapshots).toBeGreaterThan(5);
  }, 30000);

  it.each([
    'not json',
    '{',
    'null',
    '[]',
    '{"format":"baye.save","formatVersion":2}',
    '{"__proto__":{"polluted":true}}',
  ])('rejects malformed or unsupported payload %s', (payload) => {
    expect(() => decodeSave(payload)).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects unsupported content and structural corruption before loading', () => {
    const payload = JSON.parse(encodeSave(createGame('cao')));
    const mutations = [
      () => {
        payload.scenario = 'unknown';
      },
      () => {
        payload.scenario = 'divided-realm-190';
        payload.state.cities = [null];
      },
      () => {
        payload.state = null;
      },
    ];
    for (const mutate of mutations) {
      mutate();
      expect(() => decodeSave(JSON.stringify(payload))).toThrow(/damaged|unsupported/);
    }
  });

  it('rejects semantically invalid data even when all fields have valid types', () => {
    const original = createGame('cao');
    const invalid = structuredClone(original);
    invalid.officers[0]!.cityId = 'missing-city';
    expect(() => decodeSave(encodeSave(invalid))).toThrow(/inconsistent/);
    expect(original.officers[0]!.cityId).toBe('chenliu');
    roundTrip(original);
  });

  it('rejects mismatched battle and campaign orders without modifying the valid snapshot', () => {
    let state = createGame('cao');
    state = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    state = apply(state, { type: 'endMonth' });
    const payload = JSON.parse(encodeSave(state));
    payload.state.battle.order.food++;
    expect(() => decodeSave(JSON.stringify(payload))).toThrow(/continuation/);
    roundTrip(state);
  });

  it('enforces the import size bound before attempting JSON parsing', () => {
    expect(() => decodeSave(' '.repeat(5_000_001))).toThrow(/too large/);
  });

  it('rejects a battle save missing a committed defender or reserve garrison', () => {
    let state = createGame('cao');
    state = apply(state, {
      type: 'march',
      sourceId: 'chenliu',
      targetId: 'luoyang',
      officerIds: ['caocao'],
    });
    state = apply(state, { type: 'endMonth' });
    expect(state.phase).toBe('battle');
    const defenders = state.battle!.units.filter((unit) => unit.side === 'defender');
    expect(defenders.length).toBeGreaterThan(1);
    expect(defenders.some((unit) => unit.officerId.startsWith('militia-'))).toBe(true);
    for (const defender of defenders) {
      const broken = structuredClone(state);
      broken.battle!.units = broken.battle!.units.filter((unit) => unit.id !== defender.id);
      expect(() => decodeSave(encodeSave(broken))).toThrow(/inconsistent/);
    }
    roundTrip(state);
  });

  it('rejects a continuation that commits the same commander to a second army', () => {
    let state = createGame('cao');
    state = apply(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    state = apply(state, { type: 'endMonth' });
    const broken = structuredClone(state);
    broken.resolution!.queue.push({ ...structuredClone(broken.battle!.order), id: 'army-copy' });
    expect(() => decodeSave(encodeSave(broken))).toThrow(/inconsistent/);
    roundTrip(state);
  });

  it('accepts the full ten-officer defense without deploying an eleventh unit for reserves', () => {
    let state = createGame('cao');
    const defenders = state.officers.filter((officer) => officer.factionId !== 'cao').slice(0, 11);
    for (const officer of defenders) {
      officer.cityId = 'luoyang';
      officer.factionId = 'dong';
      officer.troops = 1000;
    }
    state.cities.forEach((city) => {
      city.governorId = null;
    });
    state = apply(state, {
      type: 'march',
      sourceId: 'chenliu',
      targetId: 'luoyang',
      officerIds: ['caocao'],
    });
    state = apply(state, { type: 'endMonth' });
    expect(state.phase).toBe('battle');
    expect(state.battle!.units.filter((unit) => unit.side === 'defender')).toHaveLength(10);
    expect(state.battle!.units.some((unit) => unit.officerId.startsWith('militia-'))).toBe(false);
    roundTrip(state);
  });

  it('keeps mixed player orders and AI responses resumable for every ruler across varied seeds', () => {
    const actions: Action[] = [
      'farm',
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
    ];
    let accepted = 0,
      rejected = 0,
      battles = 0;
    for (const [factionIndex, faction] of FACTIONS.entries()) {
      for (const seed of [387 + factionIndex, 62_019 + factionIndex]) {
        let choices = seed;
        const pick = (length: number) => {
          // Test-command selection has its own stream; it never consumes game RNG.
          choices = (Math.imul(choices, 1_664_525) + 1_013_904_223) >>> 0;
          return choices % length;
        };
        let state = createGame(faction.id, seed);
        for (let month = 0; month < 18 && state.phase !== 'finished'; month++) {
          for (let attempt = 0; attempt < 4; attempt++) {
            const cities = state.cities.filter((city) => city.factionId === faction.id);
            const city = cities[pick(cities.length)]!;
            const officers = state.officers.filter(
              (officer) =>
                officer.cityId === city.id && officer.factionId === faction.id && !officer.captive,
            );
            if (!officers.length) continue;
            const officer = officers[pick(officers.length)]!;
            const targetId = city.neighbors[pick(city.neighbors.length)]!;
            const kind = pick(5);
            let command: GameCommand;
            if (kind === 0)
              command = {
                type: 'assignTroops',
                cityId: city.id,
                officerId: officer.id,
                amount: pick(5001),
              };
            else if (kind === 1)
              command = { type: 'march', sourceId: city.id, targetId, officerIds: [officer.id] };
            else if (kind === 2)
              command = {
                type: 'transfer',
                sourceId: city.id,
                targetId,
                officerId: officer.id,
                gold: 100,
                food: 300,
                troops: 50,
              };
            else {
              const action = actions[pick(actions.length)]!;
              const target =
                action === 'alliance'
                  ? FACTIONS[pick(FACTIONS.length)]!.id
                  : action === 'persuade'
                    ? state.officers[pick(state.officers.length)]!.id
                    : targetId;
              command = {
                type: 'action',
                action,
                cityId: city.id,
                officerId: officer.id,
                targetId: target,
              };
            }
            const before = structuredClone(state);
            const result = dispatch(state, command);
            expect(state).toEqual(before);
            if (result.ok) {
              accepted++;
              state = roundTrip(result.state);
            } else {
              rejected++;
              expect(result.state).toBe(state);
            }
          }
          state = roundTrip(apply(state, { type: 'endMonth' }));
          for (let guard = 0; state.phase === 'battle' && guard < 60; guard++) {
            battles++;
            const resumed = roundTrip(state);
            const next = apply(state, { type: guard % 3 ? 'battleAuto' : 'battleRetreat' });
            expect(apply(resumed, { type: guard % 3 ? 'battleAuto' : 'battleRetreat' })).toEqual(
              next,
            );
            state = roundTrip(next);
          }
          expect(state.phase).not.toBe('battle');
        }
      }
    }
    expect(accepted).toBeGreaterThan(100);
    expect(rejected).toBeGreaterThan(100);
    expect(battles).toBeGreaterThan(10);
  }, 30_000);
});
