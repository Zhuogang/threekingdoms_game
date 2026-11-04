import { describe, expect, it } from 'vitest';
import {
  attackerMethodForSeed,
  attackerPlan,
  planAttackerTurn,
  runAttackerTurn,
  type AttackerMethod,
} from '../../src/siege/ai/attacker';
import { planDefenderTurn, runDefenderTurn } from '../../src/siege/ai/defender';
import { applySiegeAction } from '../../src/siege/rules/actions';
import { activeUnit, climbingPosition, distance } from '../../src/siege/rules/combat';
import { endDay } from '../../src/siege/rules/day';
import { fireArrowsReason } from '../../src/siege/rules/preparations';
import { scoreSiege } from '../../src/siege/rules/score';
import { createSiegeState } from '../../src/siege/rules/state';
import {
  CAMP_CELLS,
  GATES,
  SOUTH_TRENCH,
  cellKey,
  sameCell,
  layoutSymbol,
} from '../../src/siege/content/chencang';
import { deserializeSiegeSave, serializeSiegeSave } from '../../src/siege/save';
import type { SiegeAction, SiegeEngine, SiegeState } from '../../src/siege/rules/types';

const engine = (
  kind: SiegeEngine['kind'],
  x: number,
  y: number,
  extra: Partial<SiegeEngine> = {},
): SiegeEngine => ({
  id: `${kind}-${x}-${y}`,
  kind,
  x,
  y,
  durability: 300,
  max: 300,
  burning: false,
  wrecked: false,
  ...extra,
});
function replay(state: SiegeState, actions: SiegeAction[], wei = false) {
  let next = state;
  for (const action of actions) {
    if (wei && 'unitId' in action) {
      const unit = next.units.find((u) => u.id === action.unitId)!;
      if (action.type === 'fireArrows') {
        expect(
          fireArrowsReason(
            next,
            unit,
            next.engines.find((e) => e.id === action.engineId)!,
          ),
        ).toBeNull();
      }
      if (action.type === 'dropMillstone') {
        expect(next.preparations.millstones[cellKey(unit)]).toMatchObject({ hoisted: true });
        expect(next.preparations.millstones[cellKey(unit)]!.day).toBeLessThan(next.day);
      }
      if (action.type === 'dropBoulders')
        expect(next.preparations.boulders[cellKey(unit)]!.day).toBeLessThan(next.day);
      if (
        [
          'fireArrows',
          'dropMillstone',
          'dropBoulders',
          'lightBrazier',
          'hoistMillstone',
          'stackBoulders',
        ].includes(action.type)
      )
        expect(unit.suppressedDay).not.toBe(next.day);
    }
    const result = applySiegeAction(next, action);
    expect(result, JSON.stringify(action)).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.reason);
    next = result.state;
  }
  return next;
}

function checkMain(state: SiegeState) {
  const main = state.units.find((u) => u.id === 'shu-zhugeliang')!;
  expect(main.level).toBe('ground');
  expect(main.y).toBeGreaterThanOrEqual(21);
  expect(main.routed).toBe(false);
  for (const wei of state.units.filter((u) => u.side === 'wei' && activeUnit(u)))
    expect(distance(main, wei)).toBeGreaterThanOrEqual(5);
}

describe('v0.2 attacker and defender integration', () => {
  for (const method of ['careful', 'anyPrice', 'brute'] as const) {
    it.each(Array.from({ length: 20 }, (_, i) => i + 1))(
      `${method} seed %i completes without a rejected action or an unusable preparation`,
      (seed) => {
        let state = createSiegeState(seed);
        let turns = 0;
        while (!state.outcome && turns++ < 12) {
          const before = structuredClone(state);
          const rng = state.rngState;
          const actions = planAttackerTurn(state, method);
          expect(state).toEqual(before);
          expect(planAttackerTurn(JSON.parse(JSON.stringify(state)), method)).toEqual(actions);
          if (method === 'careful')
            expect(actions.some((a) => a.type === 'attack' && 'assault' in a && a.assault)).toBe(
              false,
            );
          if (method === 'brute') {
            expect(actions.some((a) => a.type === 'queueEngine')).toBe(false);
            for (const action of actions.filter((a) => a.type === 'attack' && 'targetId' in a)) {
              if (action.type === 'attack' && 'unitId' in action && 'targetId' in action) {
                const attack = replay(state, actions.slice(0, actions.indexOf(action)));
                const source = attack.units.find((u) => u.id === action.unitId)!;
                const target = attack.units.find((u) => u.id === action.targetId)!;
                if (climbingPosition(attack, source, target) !== null)
                  expect(action).toMatchObject({ assault: true });
              }
            }
          }
          state = replay(state, actions);
          expect(state.rngState).toBe(rng);
          checkMain(state);
          const defended = planDefenderTurn(state);
          state = replay(state, defended, true);
          checkMain(state);
          state = endDay(state);
          for (const c of SOUTH_TRENCH.filter((c) => c.y === 17))
            if (state.trenchFill[cellKey(c)]! > 0) expect(state.trenchFill[`${c.x},18`]).toBe(3);
        }
        expect(state.outcome).not.toBeNull();
        expect(state.day).toBeLessThanOrEqual(12);
        expect(state.stats.score).toEqual({
          shu: scoreSiege(state, 'shu'),
          wei: scoreSiege(state, 'wei'),
        });
        expect(state.stats.nightResults.length).toBeGreaterThan(0);
        expect(
          deserializeSiegeSave(serializeSiegeSave({ state, phase: 'battle', facings: {} })).state,
        ).toEqual(state);
      },
      30000,
    );
  }

  it('splits Wei opponents evenly and varies every seeded plan choice', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    expect(seeds.filter((s) => attackerMethodForSeed(s) === 'careful')).toHaveLength(100);
    expect(seeds.filter((s) => attackerMethodForSeed(s) === 'anyPrice')).toHaveLength(100);
    const plans = seeds.map((seed) => attackerPlan(seed));
    for (const key of ['columns', 'cartFirst', 'ramDay', 'rotation', 'assaultDay'] as const)
      expect(new Set(plans.map((p) => JSON.stringify(p[key]))).size).toBeGreaterThan(1);
    for (const p of plans) {
      expect(p.columns.length).toBeGreaterThanOrEqual(2);
      expect(p.columns.length).toBeLessThanOrEqual(4);
      expect(new Set(p.columns).size).toBe(p.columns.length);
      for (const x of p.columns) {
        expect(layoutSymbol(x, 16)).toBe('W');
        expect(SOUTH_TRENCH.some((c) => c.x === x && c.y === 18)).toBe(true);
      }
    }
  });

  it('retreats the main body when Wei advances and spends no combat or work action on it', () => {
    const s = createSiegeState(1);
    Object.assign(
      s.units.find((u) => u.id === 'wei-haozhao')!,
      { x: 23, y: 22, level: 'ground' },
    );
    const next = runAttackerTurn(s, 'careful');
    checkMain(next);
    expect(next.units[0]!.y).toBeGreaterThan(25);
    expect(
      next.log.some(
        (e) =>
          e.params.unitId === 'shu-zhugeliang' &&
          ['attack', 'fillTrench', 'pileEarth', 'coverEngine'].includes(e.code),
      ),
    ).toBe(false);
  });

  it('opens with both tools, keeps engine movement deterministic, and dispatches new construction on Shu phases', () => {
    let s = createSiegeState(228);
    const positions = new Map<string, CellHistory>();
    for (let i = 0; i < 6 && !s.outcome; i++) {
      const before = structuredClone(s);
      const first = runAttackerTurn(s, 'careful');
      expect(runAttackerTurn(s, 'careful')).toEqual(first);
      expect(s).toEqual(before);
      for (const e of first.engines) {
        const history = positions.get(e.id) ?? [];
        history.push([e.x, e.y]);
        positions.set(e.id, history);
      }
      s = endDay(runDefenderTurn(first));
    }
    expect(s.log.filter((e) => e.code === 'queueEngine').length).toBeGreaterThanOrEqual(4);
    expect(s.log.some((e) => e.code === 'engineCompleted' && e.params.kind === 'tower')).toBe(true);
    expect([...positions.values()].some((xs) => new Set(xs.map(String)).size > 1)).toBe(true);
  });

  it('rotates the most wounded eligible formation when no night advance is called for', () => {
    const s = createSiegeState(1);
    s.engines = [];
    Object.assign(s.units[1]!, { troops: 800, wounded: 1000 });
    Object.assign(s.units[2]!, { troops: 900, wounded: 500 });
    const next = endDay(runAttackerTurn(s, 'careful'));
    expect(next.log.some((e) => e.code === 'order' && e.params.kind === 'rotate')).toBe(true);
    expect(next.units[1]).toMatchObject({ troops: 1300, wounded: 500, level: 'ground' });
    expect(CAMP_CELLS.some((c) => sameCell(c, next.units[1]!))).toBe(true);
  });
});
type CellHistory = number[][];

for (const method of ['careful', 'anyPrice'] as AttackerMethod[])
  describe(`${method} preparation counters`, () => {
    it('covers a threatened raised ladder and suppresses its brazier archer', () => {
      const s = createSiegeState(228);
      s.day = 2;
      s.engines = [engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 } })];
      s.preparations.braziers['18,16'] = { litDay: 1 };
      Object.assign(
        s.units.find((u) => u.id === 'wei-captain-1')!,
        { x: 18, y: 16 },
      );
      Object.assign(s.units[1]!, { x: 19, y: 19 });
      Object.assign(s.units[8]!, { x: 18, y: 20 });
      const next = runAttackerTurn(s, method);
      expect(next.engines[0]!.covered).toBe(true);
      expect(next.units.find((u) => u.id === 'wei-captain-1')!.suppressedDay).toBe(2);
    });
    it('suppresses a hoisted gate millstone before ramming or covers the ram', () => {
      const s = createSiegeState(228);
      s.day = 9;
      s.act = 2;
      s.engines = [engine('ram', 24, 17)];
      s.preparations.millstones['23,16'] = { hoisted: true, day: 1 };
      Object.assign(s.units[1]!, { x: 24, y: 18 });
      Object.assign(s.units[8]!, { x: 23, y: 19 });
      const actions = planAttackerTurn(s, method);
      const next = replay(s, actions);
      const ramIndex = actions.findIndex((a) => a.type === 'ram');
      expect(
        next.engines[0]!.covered ||
          next.units.find((u) => u.id === 'wei-haozhao')!.suppressedDay === 9,
      ).toBe(true);
      if (ramIndex >= 0)
        expect(
          actions.slice(0, ramIndex).some((a) => a.type === 'suppress' || a.type === 'coverEngine'),
        ).toBe(true);
    });
    it('covers the ram and waits when suppression is out of reach', () => {
      const s = createSiegeState(228);
      s.day = 9;
      s.act = 2;
      s.engines = [engine('ram', 24, 17)];
      s.preparations.millstones['23,16'] = { hoisted: true, day: 1 };
      for (const u of s.units.filter((u) => u.side === 'shu' && u.troopType === 'archer'))
        Object.assign(u, { x: u.x, y: 30 });
      Object.assign(s.units[1]!, { x: 24, y: 18 });
      expect(runAttackerTurn(s, method).engines[0]!.covered).toBe(true);
    });
    it('leaves guards beside engines after a sortie, without reading a pending enemy order', () => {
      const s = createSiegeState(228);
      s.day = 2;
      s.engines = [engine('ram', 24, 18), engine('earthCart', 21, 19)];
      s.log.push({ day: 1, code: 'sortieHit', params: { engineId: s.engines[0]!.id } });
      const next = runAttackerTurn(s, method);
      for (const e of next.engines.filter((e) =>
        GATES.south.approaches.some((c) => distance(c, e) <= 4),
      ))
        expect(
          next.units.some(
            (u) =>
              u.side === 'shu' &&
              u.troopType === 'infantry' &&
              u.level === 'ground' &&
              activeUnit(u) &&
              distance(u, e) <= 1,
          ),
        ).toBe(true);
      const hidden = structuredClone(s);
      hidden.nightOrders.wei = { kind: 'torches' };
      expect(planAttackerTurn(hidden, method)).toEqual(planAttackerTurn(s, method));
    });
    it('answers last night’s torches with daytime suppression and no night assault', () => {
      const s = createSiegeState(228);
      s.day = 2;
      s.engines = [
        engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 } }),
        engine('ladder', 29, 19, { raisedAt: { x: 29, y: 16 } }),
      ];
      s.log.push({ day: 1, code: 'torches', params: { result: 'caughtAssault' } });
      Object.assign(s.units[8]!, { x: 17, y: 19 });
      const actions = planAttackerTurn(s, method);
      expect(actions.some((a) => a.type === 'order' && a.kind === 'nightAssault')).toBe(false);
      expect(actions.some((a) => a.type === 'suppress')).toBe(true);
    });
    it('uses two infantry builders and a loaded cart on a filled mound lane', () => {
      const s = createSiegeState(228);
      const x = attackerPlan(s.seed).moundColumn;
      s.trenchFill[`${x},17`] = 3;
      s.trenchFill[`${x},18`] = 3;
      s.trenchFill[`${x - 1},17`] = 3;
      s.trenchFill[`${x + 1},17`] = 3;
      s.engines = [engine('earthCart', x, 18, { uses: 3 })];
      Object.assign(s.units[6]!, { x: x - 1, y: 17 });
      Object.assign(s.units[7]!, { x: x + 1, y: 17 });
      const next = runAttackerTurn(s, method);
      expect(next.mounds[`${x},17`]).toBe(4);
    });
  });

it('both AIs run a crowded eight-engine, completed-trench state in under one second', () => {
  const s = createSiegeState(228);
  s.day = 10;
  s.act = 2;
  s.engines = [18, 20, 27, 29].map((x) => engine('ladder', x, 19, { raisedAt: { x, y: 16 } }));
  s.engines.push(
    engine('ram', 23, 17),
    engine('tower', 22, 19),
    engine('tower', 25, 19),
    engine('earthCart', 21, 18, { uses: 3 }),
  );
  for (const c of SOUTH_TRENCH) {
    s.trenchFill[cellKey(c)] = 3;
    if (c.y === 17) s.mounds[cellKey(c)] = 6;
  }
  s.preparations.braziers['17,16'] = { litDay: 1 };
  s.preparations.boulders['22,16'] = { day: 1 };
  s.preparations.millstones['23,16'] = { hoisted: true, day: 1 };
  Object.assign(s.units[1]!, { x: 19, y: 16, level: 'wall' });
  const before = structuredClone(s);
  const timings: Record<string, number> = {};
  for (const method of ['careful', 'anyPrice', 'brute'] as const) {
    const t = performance.now();
    const next = runAttackerTurn(s, method);
    timings[method] = performance.now() - t;
    expect(timings[method]).toBeLessThan(1000);
    expect(next).toEqual(replay(s, planAttackerTurn(s, method)));
  }
  const t = performance.now();
  const defended = runDefenderTurn(s);
  timings.defender = performance.now() - t;
  expect(defended).toEqual(replay(s, planDefenderTurn(s), true));
  expect(timings.defender).toBeLessThan(1000);
  expect(s).toEqual(before);
  console.info('Crowded AI timings (ms)', JSON.stringify(timings));
});

it('moves a mound worker aside so a loaded cart can reach the inner trench', () => {
  const state = createSiegeState(228);
  const x = attackerPlan(state.seed).moundColumn;
  state.trenchFill[`${x},18`] = 3;
  state.engines = [engine('earthCart', x, 20, { uses: 3 })];
  Object.assign(state.units[1]!, { x, y: 18 });
  const next = runAttackerTurn(state, 'careful');
  expect(next.engines[0]).toMatchObject({ x, y: 18, uses: 2 });
  expect(next.trenchFill[`${x},17`]).toBeGreaterThanOrEqual(1.5);
  expect(next.log.some((e) => e.code === 'move' && e.params.unitId === state.units[1]!.id)).toBe(
    true,
  );
});
