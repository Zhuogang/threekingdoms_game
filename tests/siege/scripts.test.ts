import { describe, expect, it } from 'vitest';
import { competentPlan, runShuScript } from '../../src/siege/ai/scripts';
import { runDefenderTurn } from '../../src/siege/ai/defender';
import { distance } from '../../src/siege/rules/combat';
import { createSiegeState } from '../../src/siege/rules/state';
import {
  CAMP_CELLS,
  SOUTH_TRENCH,
  WORKSHOPS,
  layoutSymbol,
} from '../../src/siege/content/chencang';

describe('scripted Shu strategies', () => {
  for (const strategy of ['competent', 'brute'] as const) {
    it.each([1, 2, 3, 4, 5])(
      `${strategy} seed %i reaches an identical ending on replay within 21 days`,
      (seed) => {
        const play = () => {
          let state = createSiegeState(seed);
          for (let days = 0; days < 21 && !state.outcome; days++) {
            const before = structuredClone(state);
            const next = runShuScript(state, strategy);
            expect(state).toEqual(before);
            expect(next.day).toBeLessThanOrEqual(21);
            if (strategy === 'brute') {
              expect(next.engines).toEqual([]);
              expect(next.workshops.every((w) => w.queue === null)).toBe(true);
              expect(
                next.log.some((e) => e.code === 'queueEngine' || e.code === 'engineCompleted'),
              ).toBe(false);
            }
            state = next;
          }
          expect(['victory', 'historical', 'defeat']).toContain(state.outcome);
          return state;
        };
        expect(play()).toEqual(play());
      },
      30000,
    );
  }

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))(
    'keeps the main body at least five cells from Wei and the wall, issuing only orders (seed %i)',
    (seed) => {
      let state = createSiegeState(seed);
      const inspect = (draft: typeof state) => {
        const main = draft.units.find((u) => u.id === 'shu-zhugeliang')!;
        expect(main.level).toBe('ground');
        expect(main.y - 16).toBeGreaterThanOrEqual(5);
        expect(main.routed).toBe(false);
        for (const wei of draft.units.filter((u) => u.side === 'wei' && u.troops > 0))
          expect(distance(main, wei)).toBeGreaterThanOrEqual(5);
      };
      while (!state.outcome) {
        state = runShuScript(state, 'competent', (draft) => {
          inspect(draft);
          const defended = runDefenderTurn(draft);
          inspect(defended);
          return defended;
        });
        inspect(state);
      }
      expect(
        state.log.some(
          (e) => e.params.unitId === 'shu-zhugeliang' && ['fillTrench', 'attack'].includes(e.code),
        ),
      ).toBe(false);
      expect(state.log.some((e) => e.code === 'order' && e.params.side === 'shu')).toBe(true);
    },
    30000,
  );

  it('moves the command formation back when the Wei line advances', () => {
    const initial = createSiegeState(1);
    Object.assign(
      initial.units.find((u) => u.id === 'wei-haozhao')!,
      { x: 23, y: 22 },
    );
    const state = runShuScript(initial, 'competent', () => {});
    const main = state.units.find((u) => u.id === 'shu-zhugeliang')!;
    expect(main.y).toBeGreaterThan(25);
    expect(
      distance(
        main,
        state.units.find((u) => u.id === 'wei-haozhao')!,
      ),
    ).toBeGreaterThanOrEqual(5);
    expect(
      state.log.some(
        (e) => e.params.unitId === main.id && ['fillTrench', 'attack'].includes(e.code),
      ),
    ).toBe(false);
  });

  it.each(Array.from({ length: 10 }, (_, i) => i + 1))(
    'keeps routes stable, clears exits and delivers every pre-day-8 build by day 10 (seed %i)',
    (seed) => {
      let state = createSiegeState(seed);
      const positions = new Map<string, { x: number; y: number }[]>();
      while (!state.outcome) {
        const before = state;
        state = runShuScript(state, 'competent');
        for (const engine of state.engines) {
          const history = positions.get(engine.id) ?? [];
          const [a, b] = history.slice(-2);
          if (a && b && (a.x !== b.x || a.y !== b.y))
            expect([engine.x, engine.y]).not.toEqual([a.x, a.y]);
          history.push({ x: engine.x, y: engine.y });
          positions.set(engine.id, history);
          if (!before.engines.some((e) => e.id === engine.id) && !state.outcome) {
            const built = state.log.find(
              (e) => e.code === 'engineCompleted' && e.params.engineId === engine.id,
            )!;
            const exit = WORKSHOPS.find((w) => w.id === built.params.workshopId)!.spawn;
            expect([engine.x, engine.y]).not.toEqual([exit.x, exit.y]);
          }
        }
      }
      const earlyBuilds = state.log.filter((e) => e.code === 'engineCompleted' && e.day < 8);
      expect(earlyBuilds.length).toBeGreaterThanOrEqual(4);
      for (const built of earlyBuilds) {
        const first = state.log.find(
          (e) => e.code === 'shuEngineChoice' && e.params.engineId === built.params.engineId,
        )!;
        expect(first).toBeDefined();
        const arrival = state.log.find(
          (e) =>
            e.code === 'shuEngineArrived' &&
            e.params.engineId === built.params.engineId &&
            e.params.x === first.params.x &&
            e.params.y === first.params.y,
        );
        expect(arrival, String(built.params.engineId)).toBeDefined();
        expect(arrival!.day).toBeLessThanOrEqual(10);
        // First destinations are the actual trench/ladder jobs, rather than exit waypoints.
        expect(first.params.y).toBe(19);
      }
      for (const engine of state.engines) {
        const choices = state.log.filter(
          (e) => e.code === 'shuEngineChoice' && e.params.engineId === engine.id,
        );
        for (let i = 1; i < choices.length; i++) {
          const prev = choices[i - 1]!;
          const current = choices[i]!;
          if (prev.params.x !== current.params.x || prev.params.y !== current.params.y)
            expect(
              Number(prev.params.blocked) >= 2 ||
                state.log.some(
                  (e) =>
                    e.code === 'shuEngineArrived' &&
                    e.params.engineId === engine.id &&
                    e.day <= current.day &&
                    e.params.x === prev.params.x &&
                    e.params.y === prev.params.y,
                ),
            ).toBe(true);
        }
      }
    },
    30000,
  );

  it('varies lanes, queue order, ram timing and rotation without advancing the game RNG', () => {
    const plans = Array.from({ length: 32 }, (_, seed) => competentPlan(seed));
    for (const plan of plans) {
      expect(plan.columns.length).toBeGreaterThanOrEqual(2);
      expect(plan.columns.length).toBeLessThanOrEqual(4);
      expect(new Set(plan.columns).size).toBe(plan.columns.length);
      for (const x of plan.columns) {
        expect(layoutSymbol(x, 16)).toBe('W');
        expect(SOUTH_TRENCH.some((c) => c.x === x && c.y === 18)).toBe(true);
      }
    }
    for (const key of ['columns', 'cartFirst', 'ramDay', 'rotation'] as const)
      expect(new Set(plans.map((plan) => JSON.stringify(plan[key]))).size).toBeGreaterThan(1);
    const state = createSiegeState(1);
    expect(runShuScript(state, 'competent').rngState).toBe(state.rngState);
  });

  it('opens both workshops with a cart and ladder and supervises construction', () => {
    const seed = Array.from({ length: 20 }, (_, i) => i + 1).find(
      (s) => !competentPlan(s).cartFirst,
    )!;
    const state = runShuScript(createSiegeState(seed), 'competent');
    expect(state.log.filter((e) => e.code === 'queueEngine')).toHaveLength(2);
    expect(state.log.some((e) => e.code === 'order' && e.params.kind === 'supervise')).toBe(true);
    expect(state.engines.map((e) => e.kind)).toContain('earthCart');
    expect(
      state.engines.some((e) => e.kind === 'ladder') ||
        state.workshops.some((w) => w.queue === 'ladder'),
    ).toBe(true);
  });

  it('rotates the most wounded formation before sending fresh troops forward', () => {
    const initial = createSiegeState(1);
    Object.assign(initial.units[1]!, { troops: 800, wounded: 1000 });
    Object.assign(initial.units[2]!, { troops: 900, wounded: 500 });
    const state = runShuScript(initial, 'competent');
    expect(state.log.some((e) => e.code === 'order' && e.params.kind === 'rotate')).toBe(true);
    expect(state.units[1]).toMatchObject({ troops: 1300, wounded: 500, level: 'ground' });
    expect(CAMP_CELLS.some((c) => c.x === state.units[1]!.x && c.y === state.units[1]!.y)).toBe(
      true,
    );
    expect(state.units[2]!.wounded).toBe(500);
  });

  it('fills multiple outer trench columns before their inner cells', () => {
    let state = createSiegeState(2);
    for (let day = 0; day < 15 && !state.outcome; day++) {
      state = runShuScript(state, 'competent');
      for (const { x } of SOUTH_TRENCH) {
        if (state.trenchFill[`${x},17`]! > 0) expect(state.trenchFill[`${x},18`]).toBe(3);
      }
    }
    expect(
      competentPlan(2).columns.filter((x) => state.trenchFill[`${x},18`]! > 0).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it.each([1, 4])(
    'keeps the early cart approach clear and exposes it to act 1 fire (seed %i)',
    (seed) => {
      let state = createSiegeState(seed);
      for (let day = 0; day < 5; day++) state = runShuScript(state, 'competent');
      expect(state.enginesLostAct1).toBeGreaterThan(0);
      expect(state.engines.some((e) => e.kind === 'earthCart' && e.wrecked)).toBe(true);
    },
  );

  it('queues and completes a tower after the opening tools in act 2', () => {
    let state = createSiegeState(2);
    state.act = 2;
    state.day = 6;
    for (const workshop of state.workshops)
      for (const kind of ['ladder', 'earthCart'])
        state.log.push({
          day: 1,
          code: 'engineCompleted',
          params: { workshopId: workshop.id, kind, engineId: `opening-${workshop.id}-${kind}` },
        });
    for (const workshop of state.workshops)
      for (const kind of ['ladder', 'earthCart'])
        state.log.push({
          day: 5,
          code: 'shuEngineArrived',
          params: { engineId: `opening-${workshop.id}-${kind}`, x: 20, y: 19 },
        });
    for (let day = 0; day < 4; day++) state = runShuScript(state, 'competent', () => {});
    expect(state.log.some((e) => e.code === 'engineCompleted' && e.params.kind === 'tower')).toBe(
      true,
    );
  });
});
