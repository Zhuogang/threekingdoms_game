import { describe, expect, it } from 'vitest';
import {
  attackSafeguards,
  attackThreshold,
  attackWilling,
  RIVAL_AGGRESSIONS,
  type AiAttackCandidate,
} from '../src/game/aiPolicy';
import { createGame, dispatch, validateState } from '../src/game/campaign';
import type { GameCommand, GameState } from '../src/game/types';
import { decodeSave, encodeSave } from '../src/platform/saves';
import queuedLegacy from './fixtures/legacy-queued-battle.json';
import { FACTIONS } from '../src/content/scenario';

const candidate: AiAttackCandidate = {
  turn: 1,
  factionId: 'dong',
  sourceId: 'luoyang',
  targetId: 'chenliu',
  attackingPower: 2000,
  defendingTroops: 1000,
  defense: 50,
  attackingTroops: 2000,
  sourceTroops: 2500,
  reserve: 500,
  food: 10000,
};

describe('rival willingness and common departure safeguards', () => {
  it.each(RIVAL_AGGRESSIONS)('%s uses strict threshold comparison', (preset) => {
    const threshold = attackThreshold(candidate, preset);
    expect(attackWilling({ ...candidate, attackingPower: threshold }, preset)).toBe(false);
    expect(attackWilling({ ...candidate, attackingPower: threshold + 1 }, preset)).toBe(true);
  });

  it('has nested acceptance on identical candidates, including every willingness band', () => {
    expect(RIVAL_AGGRESSIONS.map((preset) => attackWilling(candidate, preset))).toEqual([
      false,
      false,
      true,
    ]);
    expect(
      RIVAL_AGGRESSIONS.map((preset) =>
        attackWilling({ ...candidate, attackingPower: 2100 }, preset),
      ),
    ).toEqual([false, true, true]);
    expect(
      RIVAL_AGGRESSIONS.map((preset) =>
        attackWilling({ ...candidate, attackingPower: 3000 }, preset),
      ),
    ).toEqual([true, true, true]);
    for (let power = 0; power < 5000; power += 17) {
      const accepted = RIVAL_AGGRESSIONS.map((preset) =>
        attackWilling({ ...candidate, attackingPower: power }, preset),
      );
      if (accepted[0]) expect(accepted[1]).toBe(true);
      if (accepted[1]) expect(accepted[2]).toBe(true);
    }
  });

  it.each(RIVAL_AGGRESSIONS)('%s shares exact reserve and food boundaries', () => {
    expect(attackSafeguards({ ...candidate, reserve: 499 }).reserves).toBe(false);
    expect(attackSafeguards({ ...candidate, reserve: 500 }).reserves).toBe(true);
    const { marchFood, upkeep } = attackSafeguards(candidate);
    expect(attackSafeguards({ ...candidate, food: marchFood + upkeep - 1 }).food).toBe(false);
    expect(attackSafeguards({ ...candidate, food: marchFood + upkeep }).food).toBe(true);
    expect(upkeep).toBe(300); // Includes the departing soldiers.
  });

  it.each([499, 500, 600])(
    'mustering preserves existing reserves at the %i boundary',
    (reserve) => {
      const state = createGame('cao');
      state.turn = 1;
      state.month = 2;
      state.officers.forEach((officer) => (officer.busy = true));
      const officer = state.officers.find((item) => item.id === 'lubu')!;
      officer.busy = false;
      officer.troops = 1000;
      const city = state.cities.find((item) => item.id === 'luoyang')!;
      city.reserve = reserve;
      const snapshots: AiAttackCandidate[] = [];
      const result = dispatch(
        state,
        { type: 'endMonth' },
        {
          aiCandidate: (value) => snapshots.push(structuredClone(value)),
        },
      );
      expect(result.ok).toBe(true);
      expect(snapshots.length).toBeGreaterThan(0);
      expect(snapshots[0]!.reserve).toBe(Math.min(reserve, 500));
      expect(snapshots[0]!.attackingTroops).toBe(1000 + Math.max(0, reserve - 500));
      expect(validateState(result.state)).toBeNull();
    },
  );

  it('does not attack during the opening turn, even with overwhelming armies', () => {
    let attacks = 0;
    const result = dispatch(
      createGame('cao', 190, 'aggressive'),
      { type: 'endMonth' },
      {
        aiMarch: () => attacks++,
      },
    );
    expect(result.ok).toBe(true);
    expect(attacks).toBe(0);
  });

  it('the saved preset changes the very next AI planning decision without rewriting prior orders', () => {
    const start = createGame('cao');
    start.turn = 1;
    start.month = 2;
    start.officers.forEach((officer) => (officer.busy = true));
    const officer = start.officers.find((item) => item.id === 'lubu')!;
    officer.busy = false;
    officer.troops = 1000;
    officer.force = 100;
    const source = start.cities.find((city) => city.id === 'luoyang')!;
    source.reserve = 500;
    source.food = 10000;
    for (const city of start.cities.filter(
      (city) => source.neighbors.includes(city.id) && city.factionId !== source.factionId,
    ))
      city.reserve = 100000;
    const target = start.cities.find((city) => city.id === 'chenliu')!;
    target.reserve = 1000;
    target.defense = 0;
    start.officers.filter((item) => item.cityId === target.id).forEach((item) => (item.troops = 0));
    const marched: Record<string, string[]> = {};
    for (const preset of RIVAL_AGGRESSIONS) {
      const changed = dispatch(start, { type: 'setRivalAggression', value: preset });
      expect(changed.ok).toBe(true);
      marched[preset] = [];
      const result = dispatch(
        changed.state,
        { type: 'endMonth' },
        { aiMarch: (order) => marched[preset]!.push(order.targetId) },
      );
      expect(result.ok).toBe(true);
      expect(validateState(result.state)).toBeNull();
    }
    // Dong Zhuo's personality (-0.2 aggression) makes his lords bolder than the shared slider:
    // 1.15x on Balanced clears the 1,600-power army, while Cautious (1.8x) still refuses.
    expect(marched).toEqual({ cautious: [], balanced: ['chenliu'], aggressive: ['chenliu'] });
  });
});

describe('aggression commands and persistence', () => {
  it('sets creation policy before serialization and rejects invalid creation values', () => {
    for (const preset of RIVAL_AGGRESSIONS)
      expect(decodeSave(encodeSave(createGame('cao', 190, preset))).rivalAggression).toBe(preset);
    expect(() => createGame('cao', 190, 'unknown' as never)).toThrow();
  });

  it('changes only aggression and revision while preserving already committed armies', () => {
    const start = createGame('cao');
    const march = dispatch(start, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    }).state;
    const result = dispatch(march, { type: 'setRivalAggression', value: 'aggressive' });
    expect(result.ok).toBe(true);
    expect(result.state).toEqual({
      ...march,
      rivalAggression: 'aggressive',
      revision: march.revision + 1,
    });
    expect(decodeSave(encodeSave(result.state))).toEqual(result.state);
  });

  it('rejects invalid values and phases atomically', () => {
    const battle = decodeSave(JSON.stringify(queuedLegacy));
    const finished = createGame('cao');
    finished.phase = 'finished';
    for (const [state, value] of [
      [createGame('cao'), 'unknown'],
      [battle, 'aggressive'],
      [finished, 'cautious'],
    ] as const) {
      const original = structuredClone(state);
      const result = dispatch(state, { type: 'setRivalAggression', value } as GameCommand);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      expect(state).toEqual(original);
    }
  });

  it('migrates a legacy battle to v2 with deterministic defaults and no other change', () => {
    const state = decodeSave(JSON.stringify(queuedLegacy));
    const legacy = queuedLegacy.state;
    expect(state.version).toBe(2);
    expect(state.ruleset).toBe('baye-atlas-2');
    // Gameplay state and the RNG stream are untouched by migration.
    expect(state.rng).toBe(legacy.rng);
    expect(state.rivalAggression).toBe('balanced');
    expect(state.reports).toEqual({ pending: null, latest: null });
    expect(state.battle!.dayLimit).toBe(30);
    expect(state.battle!.nextWeather).toBe(legacy.battle!.weather);
    expect(state.battle!.units.every((unit) => unit.hurt === false)).toBe(true);
    expect(state.truceUntilTurn).toBe(0);
    expect(state.lastBattle).toBeNull();
    expect(state.cities.every((city) => city.plunderCooldownUntil === 0)).toBe(true);
    expect(
      state.orders.concat(state.resolution?.queue ?? []).every((o) => o.intent === 'conquer'),
    ).toBe(true);
    expect(decodeSave(JSON.stringify(queuedLegacy))).toEqual(state);
    const malformed = structuredClone(queuedLegacy) as Record<string, any>;
    malformed.state.rivalAggression = 'reckless';
    expect(() => decodeSave(JSON.stringify(malformed))).toThrow();
  });
});

function finishPassiveMonth(state: GameState): GameState {
  let next = dispatch(state, { type: 'endMonth' });
  expect(dispatch(decodeSave(encodeSave(state)), { type: 'endMonth' })).toEqual(next);
  if (!next.ok) throw new Error(next.error);
  state = next.state;
  for (let guard = 0; state.phase === 'battle'; guard++) {
    if (guard >= 60) throw new Error('Unbounded monthly resolution.');
    if (validateState(state)) throw new Error(validateState(state)!);
    const restored = decodeSave(encodeSave(state));
    next = dispatch(state, { type: 'battleAuto' });
    const resumed = dispatch(restored, { type: 'battleAuto' });
    expect(resumed).toEqual(next);
    if (!next.ok) throw new Error(next.error);
    state = next.state;
  }
  expect(validateState(state)).toBeNull();
  return state;
}

describe('bounded deterministic AI correctness matrix', () => {
  it('keeps six factions × three presets × two seeds valid for twelve months and identical after interrupted saves', () => {
    let runs = 0;
    for (const faction of FACTIONS)
      for (const preset of RIVAL_AGGRESSIONS)
        for (const seed of [190, 641]) {
          let state = createGame(faction.id, seed, preset);
          for (let month = 0; month < 12 && state.phase !== 'finished'; month++)
            state = finishPassiveMonth(state);
          expect(validateState(decodeSave(encodeSave(state)))).toBeNull();
          runs++;
        }
    expect(runs).toBe(36);
  }, 180000);
});
