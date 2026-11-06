import { describe, expect, it } from 'vitest';
import { activeUnit, predictSiegeAttack } from '../../src/siege/rules/combat';
import { silenceSiegeLog } from '../../src/siege/rules/clone';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { ROUTED_MORALE } from '../../src/siege/rules/constants';
import { act, duel, engine } from './rulesFixtures';

function field() {
  return duel(
    { x: 7, y: 10, level: 'ground', troops: 2000, morale: 60, troopType: 'infantry' },
    { x: 8, y: 10, level: 'ground', troops: 2000, morale: ROUTED_MORALE, troopType: 'infantry' },
  );
}
const awards = (state: ReturnType<typeof field>['state']) =>
  state.log.filter((e) => e.code === 'routMorale');

describe('action rout morale', () => {
  it('awards the source and allies by distance from the broken enemy, once each', () => {
    const { state, shu, wei } = field();
    state.units.push({ ...shu, id: 'near', x: 10, y: 10, morale: 50 });
    const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(activeUnit(next.units[1]!)).toBe(false);
    expect(next.units[0]!.morale).toBe(70);
    expect(next.units[2]!.morale).toBe(55);
    expect(awards(next).map((e) => e.params)).toEqual([
      { unitId: shu.id, routedId: wei.id, before: 60, after: 70, role: 'source' },
      { unitId: 'near', routedId: wei.id, before: 50, after: 55, role: 'nearby' },
    ]);
  });
  it('counts annihilation and caps gains at 100, logging only actual gains', () => {
    const { state, shu, wei } = field();
    shu.morale = 95;
    wei.troops = 1;
    wei.morale = 80;
    state.units.push({ ...shu, id: 'capped', x: 9, morale: 100 });
    const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(next.units[1]!.troops).toBe(0);
    expect(next.units[0]!.morale).toBe(100);
    expect(awards(next)).toHaveLength(1);
    expect(awards(next)[0]!.params).toMatchObject({ before: 95, after: 100 });
  });
  it('does not reward or unroute inactive friends, or friends beyond two cells', () => {
    const { state, shu, wei } = field();
    state.units.push(
      { ...shu, id: 'routed', x: 9, morale: 60, routed: true },
      { ...shu, id: 'low', x: 8, y: 11, morale: ROUTED_MORALE - 1 },
      { ...shu, id: 'dead', x: 8, y: 12, troops: 0 },
      { ...shu, id: 'far', x: 11 },
    );
    const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(next.units.slice(2)).toEqual(state.units.slice(2));
    expect(awards(next)).toHaveLength(1);
  });
  it.each([false, true])(
    'rewards a Shu fall that remains active, even on a silent AI draft (silent=%s)',
    (silent) => {
      const { state, shu, wei } = field();
      Object.assign(shu, { x: 7, y: 7, level: 'wall', morale: ROUTED_MORALE });
      Object.assign(wei, { x: 6, y: 7, level: 'wall', morale: 60 });
      state.engines = [engine('ladder', 7, 10, { raisedAt: { x: 7, y: 7 } })];
      state.units.push({ ...wei, id: 'wei-near', x: 7, y: 6, level: 'ground' });
      if (silent) silenceSiegeLog(state.log);
      const next = act(state, { type: 'attack', unitId: wei.id, targetId: shu.id });
      expect(next.units[0]).toMatchObject({
        level: 'ground',
        morale: ROUTED_MORALE,
        routed: false,
      });
      expect(activeUnit(next.units[0]!)).toBe(true);
      expect(next.units[1]!.morale).toBe(70);
      expect(next.units[2]!.morale).toBe(65);
      if (!silent) expect(awards(next)).toHaveLength(2);
    },
  );
  it('awards a surviving counterattacker and its nearby side when the actor breaks', () => {
    const { state, shu, wei } = field();
    Object.assign(shu, { morale: ROUTED_MORALE, troops: 3000 });
    Object.assign(wei, { morale: 80, troops: 5000 });
    state.units.push({ ...wei, id: 'wei-near', x: 6 });
    const forecast = predictSiegeAttack(state, shu, wei)!;
    const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(activeUnit(next.units[0]!)).toBe(false);
    expect(next.units[0]!.troops).toBeGreaterThan(0);
    expect(next.units[1]!.morale).toBe(forecast.targetMoraleAfter + T.routMoraleSource);
    expect(next.units[2]!.morale).toBe(85);
    expect(awards(next).every((e) => e.params.routedId === shu.id)).toBe(true);
  });
  it('an engine has no source reward but its side still receives nearby morale', () => {
    const { state, shu, wei } = field();
    Object.assign(wei, { x: 7, y: 7, level: 'wall', troops: 2000 });
    Object.assign(shu, { x: 6, y: 7, level: 'wall' });
    state.engines = [engine('tower', 7, 10)];
    const next = act(state, { type: 'attack', engineId: 'engine', targetId: wei.id });
    expect(activeUnit(next.units[1]!)).toBe(false);
    expect(next.units[0]!.morale).toBe(65);
    expect(awards(next)).toHaveLength(1);
    expect(awards(next)[0]!.params.role).toBe('nearby');
  });
  it('does not credit the enemy for an actor or neighbour broken only by assaultCosts', () => {
    const { state, shu, wei } = duel({ morale: 31, troops: 5000 }, { troops: 300, morale: 100 });
    state.engines = [engine('ladder', 7, 10, { raisedAt: { x: 7, y: 7 } })];
    state.units.push({ ...shu, id: 'friend', x: 6, morale: ROUTED_MORALE });
    const forecast = predictSiegeAttack(state, shu, wei, { assault: true })!;
    expect(forecast.counterattack.casualties).toBeGreaterThan(0);
    const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id, assault: true });
    expect(activeUnit(next.units[0]!)).toBe(false);
    expect(activeUnit(next.units[2]!)).toBe(false);
    expect(awards(next)).toEqual([]);
  });
  it('forecast includes the real source gain on a rout, including the cap', () => {
    for (const morale of [60, 95, 100]) {
      const { state, shu, wei } = field();
      shu.morale = morale;
      const forecast = predictSiegeAttack(state, shu, wei)!;
      const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
      expect(forecast.routsTarget).toBe(true);
      expect(forecast.sourceMoraleAfter).toBe(next.units[0]!.morale);
    }
  });
  it('forecast includes a rout caused by displacement on mounting', () => {
    const { state, shu, wei } = duel({ morale: 70 }, { troops: 3000, morale: 31 });
    state.engines = [engine('ladder', 7, 10, { raisedAt: { x: 7, y: 7 } })];
    state.footholds['7,7'] = 2;
    const forecast = predictSiegeAttack(state, shu, wei)!;
    const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(forecast.routsTarget).toBe(true);
    expect(activeUnit(next.units[1]!)).toBe(false);
    expect(forecast.sourceMoraleAfter).toBe(next.units[0]!.morale);
  });
  it('a Wei wall attacker routed by a counter keeps its real morale and gets no source gain', () => {
    const { state, shu, wei } = duel(
      { x: 7, y: 7, level: 'wall', morale: 80, troops: 5000, troopType: 'infantry' },
      { x: 6, y: 7, level: 'wall', morale: ROUTED_MORALE, troops: 3000, troopType: 'infantry' },
    );
    const forecast = predictSiegeAttack(state, wei, shu)!;
    const next = act(state, { type: 'attack', unitId: wei.id, targetId: shu.id });
    const actualSourceGain = awards(next)
      .filter((e) => e.params.unitId === wei.id && e.params.role === 'source')
      .reduce((gain, e) => gain + Number(e.params.after) - Number(e.params.before), 0);
    expect(forecast.counterattack.possible).toBe(true);
    expect(forecast.counterattack.casualties).toBeGreaterThan(0);
    expect(next.units[1]!.troops).toBeGreaterThan(0);
    expect(next.units[1]!.routed).toBe(true);
    expect(next.units[1]!.morale).toBeLessThan(ROUTED_MORALE);
    expect(forecast.sourceMoraleAfter).toBe(next.units[1]!.morale);
    expect(forecast.sourceRoutMoraleGain).toBe(actualSourceGain);
    expect(actualSourceGain).toBe(0);
  });
  it('a Shu wall target that breaks cannot also counter-rout the Wei wall attacker', () => {
    const { state, shu, wei } = duel(
      { x: 7, y: 7, level: 'wall', morale: ROUTED_MORALE, troops: 5000, troopType: 'infantry' },
      { x: 6, y: 7, level: 'wall', morale: ROUTED_MORALE, troops: 3000, troopType: 'infantry' },
    );
    const forecast = predictSiegeAttack(state, wei, shu)!;
    const next = act(state, { type: 'attack', unitId: wei.id, targetId: shu.id });
    // The resolver uses this forecast's counterattack.possible: once the initial
    // hit breaks the target, no counter is applied, even though Shu survives its fall.
    expect(forecast.routsTarget).toBe(true);
    expect(forecast.counterattack).toMatchObject({ possible: false, casualties: 0 });
    expect(next.log.some((e) => e.code === 'thrownOffWall' && e.params.unitId === shu.id)).toBe(
      true,
    );
    expect(next.units[1]!.routed).toBe(false);
    expect(forecast.sourceMoraleAfter).toBe(next.units[1]!.morale);
    expect(forecast.sourceRoutMoraleGain).toBe(T.routMoraleSource);
    expect(awards(next).find((e) => e.params.unitId === wei.id)?.params).toMatchObject({
      before: ROUTED_MORALE,
      after: forecast.sourceMoraleAfter,
      role: 'source',
    });
  });
  it('does not reward striking an already routed target', () => {
    const { state, shu, wei } = field();
    wei.routed = true;
    const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(next.units[0]!.morale).toBe(shu.morale);
    expect(awards(next)).toHaveLength(0);
  });
});
