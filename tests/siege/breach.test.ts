import { describe, expect, it } from 'vitest';
import { planAttackerTurn } from '../../src/siege/ai/attacker';
import { planDefenderTurn } from '../../src/siege/ai/defender';
import { COURTYARD } from '../../src/siege/content/chencang';
import { ROUTED_MORALE } from '../../src/siege/rules/constants';
import { endDay } from '../../src/siege/rules/day';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { deserializeSiegeSave, serializeSiegeSave } from '../../src/siege/save';
import { advanceWalkthrough, startWalkthrough } from '../../src/siege/ui/walkthrough';
import { act, engine, refused } from './rulesFixtures';

const top = { x: 20, y: 16, level: 'wall' as const };
const key = '20,16';
function fixture(route: 'ladder' | 'wallFoot') {
  const state = createSiegeState(228);
  const base = { x: 20, y: route === 'ladder' ? 19 : 17, level: 'ground' as const };
  const first = state.units.find((u) => u.id === 'shu-weiyan')!;
  const second = state.units.find((u) => u.id === 'shu-wangping')!;
  const third = state.units.find((u) => u.id === 'shu-liaohua')!;
  const wei = state.units.find((u) => u.id === 'wei-wangsheng')!;
  Object.assign(first, base);
  Object.assign(second, base, { x: 21, y: 19 });
  Object.assign(third, base, { x: 19, y: 19 });
  Object.assign(wei, top, { x: 25 });
  state.units = [first, second, third, wei];
  state.engines = route === 'ladder' ? [engine('ladder', 20, 19, { raisedAt: top })] : [];
  if (route === 'wallFoot') {
    state.trenchFill['20,17'] = T.trenchCapacity;
    state.trenchFill['20,18'] = T.trenchCapacity;
  }
  return { state, base, first, second, third, wei };
}

for (const route of ['ladder', 'wallFoot'] as const) {
  describe(`open breach via ${route}`, () => {
    it('keeps three footholds on mounting and admits the next unit in one normal climb tomorrow', () => {
      const { state, base, first, second, third } = fixture(route);
      state.footholds[key] = 2;
      const mounted = act(state, { type: 'climb', unitId: first.id });
      expect(mounted.footholds[key]).toBe(3);
      expect(mounted.units[0]).toMatchObject({ ...top, moved: true, acted: true });
      expect(mounted.log).toContainEqual({
        day: 1,
        code: 'wallGained',
        params: { unitId: first.id, from: `20,${base.y}`, cell: key },
      });
      let next = act(mounted, { type: 'move', unitId: second.id, ...base });
      refused(next, { type: 'climb', unitId: second.id });
      refused(next, { type: 'move', unitId: first.id, ...top, x: 19 });
      next = endDay(next);
      next = act(next, { type: 'move', unitId: first.id, ...top, x: 19 });
      const before = next.units.map(({ troops, wounded, morale }) => ({ troops, wounded, morale }));
      const logStart = next.log.length;
      next = act(next, { type: 'climb', unitId: second.id });
      expect(next.units[1]).toMatchObject({ ...top, moved: true, acted: false });
      expect(
        next.units.map(({ troops, wounded, morale }) => ({ troops, wounded, morale })),
      ).toEqual(before);
      expect(next.footholds[key]).toBe(3);
      expect(next.log.slice(logStart).map((e) => e.code)).toEqual(['wallGained', 'climb']);
      next = act(next, { type: 'move', unitId: third.id, ...base });
      refused(next, { type: 'climb', unitId: third.id });
      refused(next, { type: 'move', unitId: second.id, ...top, x: 21 });
    });

    it('seals when Wei walks onto the cell, then requires foothold build-up again', () => {
      const { state, first, wei } = fixture(route);
      state.footholds[key] = 3;
      wei.x = 21;
      let next = act(state, { type: 'move', unitId: wei.id, ...top });
      expect(next.footholds[key]).toBe(0);
      expect(next.log).toContainEqual({
        day: 1,
        code: 'footholdChanged',
        params: { cell: key, sourceId: wei.id, before: 3, after: 0, reason: 'sealed' },
      });
      refused(next, { type: 'climb', unitId: first.id });
      next = endDay(next);
      next = act(next, { type: 'move', unitId: wei.id, ...top, x: 21 });
      next = act(next, { type: 'climb', unitId: first.id });
      expect(next.footholds[key]).toBe(1);
      expect(next.units[0]!.level).toBe('ground');
    });

    it.each([1, 2] as const)('leaves foothold %i alone when Wei stands on it', (value) => {
      const { state, wei } = fixture(route);
      state.footholds[key] = value;
      wei.x = 21;
      const next = act(state, { type: 'move', unitId: wei.id, ...top });
      expect(next.footholds[key]).toBe(value);
      expect(next.log.some((e) => e.params.reason === 'sealed')).toBe(false);
    });

    it.each([1, 2] as const)(
      'retains partial foothold %i overnight with infantry at the base',
      (value) => {
        const { state } = fixture(route);
        state.footholds[key] = value;
        expect(endDay(state).footholds[key]).toBe(value);
      },
    );

    it.each(['routed', 'dead', 'ground'] as const)(
      'seals only a living wall occupant (%s)',
      (condition) => {
        const { state, wei, second } = fixture(route);
        Object.assign(wei, top);
        if (condition === 'routed') Object.assign(wei, { routed: true, morale: 0 });
        else if (condition === 'dead') wei.troops = 0;
        else Object.assign(wei, { y: 15, level: 'ground' });
        state.footholds[key] = 3;
        const next = act(state, { type: 'move', unitId: second.id, x: 21, y: 20, level: 'ground' });
        expect(next.footholds[key]).toBe(condition === 'routed' ? 0 : 3);
        expect(next.log.some((e) => e.params.reason === 'sealed')).toBe(condition === 'routed');
      },
    );

    it.each([1, 2, 3] as const)(
      'keeps only completed foothold %i at night with an empty base',
      (value) => {
        const { state, first } = fixture(route);
        state.footholds[key] = value;
        const empty = act(state, { type: 'move', unitId: first.id, x: 20, y: 20, level: 'ground' });
        const next = endDay(empty);
        expect(next.footholds[key]).toBe(value === 3 ? 3 : 0);
        if (value < 3)
          expect(next.log).toContainEqual({
            day: 1,
            code: 'footholdChanged',
            params: {
              cell: key,
              sourceId: 'night',
              before: value,
              after: 0,
              reason: 'nightPositionEmpty',
            },
          });
      },
    );

    it('clears the breach when a mounted unit is thrown off that cell', () => {
      const { state, first, wei } = fixture(route);
      Object.assign(first, top, { morale: ROUTED_MORALE, troops: 2000 });
      Object.assign(wei, { x: 21, troops: 300 });
      state.footholds[key] = 3;
      const next = act(state, { type: 'attack', unitId: wei.id, targetId: first.id });
      expect(next.footholds[key]).toBe(0);
      expect(next.units[0]!.level).toBe('ground');
      expect(next.log).toContainEqual({
        day: 1,
        code: 'footholdChanged',
        params: { cell: key, sourceId: first.id, before: 3, after: 0, reason: 'thrownOffWall' },
      });
      expect(next.log.some((e) => e.code === 'thrownOffWall')).toBe(true);
    });

    it.each(['careful', 'anyPrice', 'brute'] as const)(
      '%s AI uses a normal climb through an open breach',
      (method) => {
        const { state, first } = fixture(route);
        state.day = 2;
        state.footholds[key] = 3;
        const plan = planAttackerTurn(state, method);
        expect(plan.filter((a) => a.type === 'climb')).toContainEqual({
          type: 'climb',
          unitId: first.id,
        });
        expect(plan.filter((a) => a.type === 'climb').every((a) => !a.assault)).toBe(true);
      },
    );

    it('the existing defender AI walks a free defender onto the empty breach and seals it', () => {
      const { state, wei } = fixture(route);
      wei.x = 18;
      state.stats.firstWallDay = 1;
      // The two courtyard guards are already assigned; this wall unit is free to seal.
      const guards = createSiegeState(228)
        .units.filter((u) => u.side === 'wei' && u.id !== wei.id)
        .slice(0, 2);
      guards.forEach((guard, i) => Object.assign(guard, COURTYARD[i]!, { level: 'ground' }));
      state.units.push(...guards);
      state.footholds[key] = 3;
      const plan = planDefenderTurn(state);
      expect(plan).toContainEqual({ type: 'move', unitId: wei.id, ...top });
      let next = state;
      for (const action of plan) next = act(next, action);
      expect(next.units.find((u) => u.id === wei.id)).toMatchObject(top);
      expect(next.footholds[key]).toBe(0);
      expect(next.log.some((e) => e.params.reason === 'sealed')).toBe(true);
    });
  });
}

describe('breach position and persistence', () => {
  it.each(['wrecked', 'lost', 'unraised'] as const)(
    'clears an open breach at night when its ladder is %s, even with infantry at the base',
    (condition) => {
      const { state } = fixture('ladder');
      state.footholds[key] = 3;
      if (condition === 'wrecked')
        Object.assign(state.engines[0]!, { wrecked: true, durability: 0 });
      else if (condition === 'lost') state.engines = [];
      else delete state.engines[0]!.raisedAt;
      const next = endDay(state);
      expect(next.footholds[key]).toBe(0);
      expect(next.log.find((e) => e.code === 'footholdChanged')?.params.reason).toBe(
        condition === 'wrecked' ? 'nightLadderDestroyed' : 'nightPositionEmpty',
      );
    },
  );

  it('keeps a breach over a filled wall foot even when the ladder there is wrecked', () => {
    const { state } = fixture('wallFoot');
    state.footholds[key] = 3;
    state.engines = [engine('ladder', 20, 19, { raisedAt: top, wrecked: true, durability: 0 })];
    expect(endDay(state).footholds[key]).toBe(3);
    state.trenchFill['20,17'] = 0;
    expect(endDay(state).footholds[key]).toBe(0);
  });

  it('round-trips a save with a completed breach without changing the save format', () => {
    const state = createSiegeState(228);
    state.engines[0]!.raisedAt = { x: 18, y: 16 };
    state.footholds['18,16'] = 3;
    const save = { playerSide: 'shu' as const, state, phase: 'battle' as const, facings: {} };
    expect(deserializeSiegeSave(serializeSiegeSave(save))).toEqual(save);
  });

  it('completes Shu walkthrough step four on mounting with no foothold change', () => {
    const { state, first, second } = fixture('ladder');
    state.footholds[key] = 3;
    const progress = { ...startWalkthrough(state), step: 4, infantryId: first.id };
    const next = act(state, { type: 'climb', unitId: first.id });
    expect(next.log.some((e) => e.code === 'footholdChanged')).toBe(false);
    const ui = { tab: 'commands', selected: first.id, playerSide: 'shu' as const };
    expect(advanceWalkthrough(progress, next, ui)?.step).toBe(5);
    expect(advanceWalkthrough({ ...progress, infantryId: second.id }, next, ui)?.step).toBe(4);
    expect(advanceWalkthrough({ ...progress, logCursor: next.log.length }, next, ui)?.step).toBe(4);
  });
});
