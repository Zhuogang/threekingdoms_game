import { describe, expect, it } from 'vitest';
import { siegeBaseDamage } from '../../src/siege/rules/combat';
import { applySiegeAction } from '../../src/siege/rules/actions';
import {
  activeUnit,
  climbingPosition,
  damageEngine,
  predictSiegeAttack,
  wallFoothold,
} from '../../src/siege/rules/combat';
import { endDay } from '../../src/siege/rules/day';
import { createSiegeState } from '../../src/siege/rules/state';
import { scoreSiege } from '../../src/siege/rules/score';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { deserializeSiegeSave, serializeSiegeSave } from '../../src/siege/save';
import type { SiegeAction, SiegeState } from '../../src/siege/rules/types';
import { act, duel, engine, refused } from './rulesFixtures';

function climb(position: 'ladder' | 'wallFoot' | 'mound' = 'ladder') {
  const fixture = duel({ y: position === 'ladder' ? 19 : 17 });
  fixture.state.engines =
    position === 'ladder' ? [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })] : [];
  if (position !== 'ladder') {
    fixture.state.trenchFill['20,17'] = 3;
    fixture.state.trenchFill['20,18'] = 3;
  }
  if (position === 'mound') fixture.state.mounds['20,17'] = T.moundComplete;
  return fixture;
}
function clearTomorrow(state: SiegeState): SiegeState {
  state.weatherByDay[state.day + 1] = 'clear';
  return endDay(state);
}

describe('v0.2 day-one feasibility from the actual opening', () => {
  it('raises both starting ladders and accepts an infantry unit at a ladder base', () => {
    let state = createSiegeState(228);
    for (const ladder of state.engines.filter((entry) => entry.kind === 'ladder'))
      state = act(state, { type: 'raiseLadder', engineId: ladder.id });
    const unit = state.units[1]!;
    Object.assign(unit, { x: 18, y: 21 }); // Legal deployment directly behind this ladder.
    state = act(state, { type: 'move', unitId: unit.id, x: 18, y: 19, level: 'ground' });
    // Empty cells require climb; the defended path is still feasible from this deployment.
    state = act(state, { type: 'climb', unitId: unit.id });
    const defended = createSiegeState(228);
    Object.assign(defended.units[1]!, { x: 18, y: 21 });
    Object.assign(defended.units[11]!, { x: 18, y: 16 });
    const raised = act(defended, { type: 'raiseLadder', engineId: defended.engines[0]!.id });
    const moved = act(raised, { type: 'move', unitId: unit.id, x: 18, y: 19, level: 'ground' });
    expect(
      act(moved, { type: 'attack', unitId: unit.id, targetId: defended.units[11]!.id }).footholds[
        '18,16'
      ],
    ).toBe(1);
    expect(state.day).toBe(1);
    expect(wallFoothold(state, '18,16')).toBe(1);
  });
  it('moves the ram three cells to (24,18) in one move and fills from the starting cart', () => {
    let state = createSiegeState(228);
    const ram = state.engines.find((entry) => entry.kind === 'ram')!;
    const cart = state.engines.find((entry) => entry.kind === 'earthCart')!;
    state = act(state, { type: 'moveEngine', engineId: ram.id, x: 24, y: 18 });
    state = act(state, { type: 'moveEngine', engineId: cart.id, x: 21, y: 19 });
    state = act(state, { type: 'fillTrench', engineId: cart.id, x: 21, y: 18 });
    expect(state.trenchFill['21,18']).toBe(1.5);
    expect(state.day).toBe(1);
  });
  it('moves a deployed archer to y19 and suppresses a wall defender three away', () => {
    let state = createSiegeState(228);
    const archer = state.units[8]!;
    expect(archer.troopType).toBe('archer');
    Object.assign(archer, { x: 26, y: 21 }); // Legal DEPLOY_SHU cell.
    state = act(state, { type: 'move', unitId: archer.id, x: 26, y: 19, level: 'ground' });
    const target = state.units[14]!;
    expect(predictSiegeAttack(state, archer.id, target.id)?.inRange).toBe(false);
    refused(state, { type: 'attack', unitId: archer.id, targetId: target.id });
    state = act(state, { type: 'suppress', unitId: archer.id, targetId: target.id });
    expect(state.units[14]!.suppressedDay).toBe(1);
    expect(state.day).toBe(1);
  });
});

describe('Wei preparations and suppression', () => {
  it.each(['fireArrows', 'dropMillstone', 'dropBoulders'] as const)(
    '%s requires preparation on an earlier day',
    (type) => {
      const { state, shu, wei } = climb();
      Object.assign(
        wei,
        type === 'fireArrows' ? { troopType: 'archer' } : type === 'dropMillstone' ? { x: 23 } : {},
      );
      if (type === 'dropMillstone') state.engines = [engine('ram', 23, 17)];
      const strike: SiegeAction =
        type === 'dropBoulders'
          ? { type, unitId: wei.id, targetId: shu.id }
          : { type, unitId: wei.id, engineId: 'engine' };
      refused(state, strike);
      const prepare: SiegeAction = {
        type:
          type === 'fireArrows'
            ? 'lightBrazier'
            : type === 'dropMillstone'
              ? 'hoistMillstone'
              : 'stackBoulders',
        unitId: wei.id,
      };
      let next = act(state, prepare);
      // Use a fresh crew on the same cell: day checking must not just rely on acted.
      next.units[1]!.acted = false;
      refused(next, strike, /earlier day/);
      next = clearTomorrow(next);
      next = act(next, strike);
      expect(next.units[1]!.acted).toBe(true);
      if (type === 'dropMillstone')
        expect(next.preparations.millstones['23,16']!.hoisted).toBe(false);
      if (type === 'dropBoulders') expect(next.preparations.boulders['20,16']).toBeUndefined();
    },
  );
  it.each([
    'lightBrazier',
    'hoistMillstone',
    'stackBoulders',
    'fireArrows',
    'dropMillstone',
    'dropBoulders',
  ] as const)('suppression blocks %s', (type) => {
    const { state, shu, wei } = climb();
    wei.suppressedDay = state.day;
    const action: SiegeAction =
      type === 'fireArrows' || type === 'dropMillstone'
        ? { type, unitId: wei.id, engineId: 'engine' }
        : type === 'dropBoulders'
          ? { type, unitId: wei.id, targetId: shu.id }
          : { type, unitId: wei.id };
    refused(state, action, /suppressed/);
  });
  it('quarters a volley and reduces a suppressed defender counterattack to 70%, then clears at night', () => {
    const { state, shu, wei } = climb();
    state.units.push({ ...shu, id: 'archer', troopType: 'archer', x: 21, y: 18 });
    const normalDamage = Math.floor(
      siegeBaseDamage(state, state.units[2]!, wei, T.volleyFrontage) * T.parapetMultiplier,
    );
    let next = act(state, { type: 'suppress', unitId: 'archer', targetId: wei.id });
    expect(next.units[1]!.troops).toBe(
      wei.troops - Math.floor(normalDamage * T.suppressionDamageMultiplier),
    );
    expect(predictSiegeAttack(next, shu.id, wei.id)!.counterattack.modifiers.suppression).toBe(0.7);
    next = clearTomorrow(next);
    expect(next.units[1]!.suppressedDay).toBeUndefined();
  });
  it('allows suppressed units to move and ordinary attack, but blocks sortie service', () => {
    let state = createSiegeState(228);
    const wei = state.units[10]!;
    wei.suppressedDay = 1;
    state.engines = [engine('ram', 24, 20)];
    refused(
      state,
      { type: 'order', side: 'wei', kind: 'sortie', target: 'engine' },
      /unsuppressed/,
    );
    Object.assign(state.units[1]!, { x: 24, y: 17 });
    state = act(state, { type: 'move', unitId: wei.id, x: 24, y: 16, level: 'wall' });
    state = act(state, { type: 'attack', unitId: wei.id, targetId: state.units[1]!.id });
    expect(state.units[10]!.acted).toBe(true);
  });
  it('never allows ground archers to use a wall brazier', () => {
    const { state, wei } = climb();
    Object.assign(wei, { troopType: 'archer', level: 'ground', y: 19 });
    state.preparations.braziers['20,16'] = { litDay: 0 };
    refused(state, { type: 'fireArrows', unitId: wei.id, engineId: 'engine' }, /wall archer/);
  });
  it('douses every brazier when the next day is snow, with events', () => {
    const state = createSiegeState(228);
    state.preparations.braziers = { '17,16': { litDay: 1 }, '30,16': { litDay: 1 } };
    state.weatherByDay[2] = 'snow';
    const next = endDay(state);
    expect(next.preparations.braziers).toEqual({});
    expect(next.log.filter((entry) => entry.code === 'brazierDoused')).toHaveLength(2);
  });
});

describe('footholds, displacement and assaults', () => {
  it.each([
    ['ladder', false, 150, 1, 1.5],
    ['wallFoot', false, 100, 1, 1.5],
    ['mound', false, 300, 2, 1.2],
    ['ladder', true, T.climbing.ladder.assaultFrontage, 2, T.climbing.ladder.assaultCounter],
    ['wallFoot', true, 300, 2, T.climbing.wallFoot.assaultCounter],
    ['mound', true, 600, 3, T.climbing.mound.assaultCounter],
  ] as const)(
    '%s assault=%s forecasts and applies frontage %i / gain %i / counter %f',
    (position, assault, frontage, gain, counter) => {
      const { state, shu, wei } = climb(position);
      const forecast = predictSiegeAttack(state, shu.id, wei.id, { assault })!;
      expect(forecast).toMatchObject({
        frontage,
        footholdGain: gain,
        footholdAfter: gain,
        wouldMount: gain === 3,
      });
      expect(forecast.counterattack.modifiers.climbing).toBe(counter);
      const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id, assault });
      expect(wallFoothold(next, wei)).toBe(gain === 3 ? 0 : gain);
      expect(next.units[0]!.level).toBe(gain === 3 ? 'wall' : 'ground');
      expect(next.units[0]!.morale).toBe(forecast.sourceMoraleAfter);
    },
  );
  it('shows both normal and assault forecasts without mutating the state, and rejects assault on the ground', () => {
    const { state, shu, wei } = climb();
    wei.troops = 1000;
    const before = structuredClone(state);
    const normal = predictSiegeAttack(state, shu, wei)!;
    const assault = predictSiegeAttack(state, shu, wei, { assault: true })!;
    expect(assault.casualties).toBeGreaterThan(normal.casualties);
    expect(assault.counterattack.casualties).toBeGreaterThan(normal.counterattack.casualties);
    expect(state).toEqual(before);
    state.engines = [];
    expect(predictSiegeAttack(state, shu, wei, { assault: true })).toBeNull();
    refused(state, { type: 'attack', unitId: shu.id, targetId: wei.id, assault: true });
  });
  it.each([false, true])(
    'mounts at three, displacing the defender (blocked=%s) with minus ten morale',
    (blocked) => {
      const { state, shu, wei } = climb();
      state.footholds['20,16'] = 2;
      if (blocked) for (const x of [19, 21]) state.units.push({ ...wei, id: `blocker-${x}`, x });
      const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
      expect(next.units[0]).toMatchObject({
        x: 20,
        y: 16,
        level: 'wall',
        moved: true,
        acted: true,
      });
      expect(next.units[1]!.morale).toBe(
        predictSiegeAttack(state, shu, wei)!.targetMoraleAfter - 10,
      );
      expect(next.units[1]!.level).toBe(blocked ? 'ground' : 'wall');
      expect(next.stats.firstWallDay).toBe(1);
      expect(wallFoothold(next, wei)).toBe(0);
    },
  );
  it.each([0, 1, 2, 3])('boulders reduce foothold %i by two with a floor of zero', (foothold) => {
    const { state, shu, wei } = climb();
    state.footholds['20,16'] = foothold as 0 | 1 | 2 | 3;
    state.day = 2;
    state.preparations.boulders['20,16'] = { day: 1 };
    const next = act(state, { type: 'dropBoulders', unitId: wei.id, targetId: shu.id });
    expect(wallFoothold(next, wei)).toBe(Math.max(0, foothold - 2));
  });
  it.each(['empty', 'destroyed', 'routed'] as const)(
    'clears footholds at night when the climbing position is %s',
    (condition) => {
      const { state, shu } = climb();
      state.footholds['20,16'] = 2;
      if (condition === 'empty') shu.x++;
      else if (condition === 'destroyed')
        Object.assign(state, damageEngine(state, state.engines[0]!, 200));
      else shu.routed = true;
      expect(wallFoothold(endDay(state), '20,16')).toBe(0);
    },
  );
  it('retains occupied live footholds at night and gives no gain if the counter routs the source', () => {
    const { state, shu, wei } = climb();
    state.footholds['20,16'] = 1;
    expect(wallFoothold(endDay(state), wei)).toBe(1);
    shu.morale = 20;
    const forecast = predictSiegeAttack(state, shu, wei)!;
    expect(forecast.footholdGain).toBe(0);
    const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(activeUnit(next.units[0]!)).toBe(false);
    expect(wallFoothold(next, wei)).toBe(1);
  });
  it.each([false, true])(
    'assault costs ten morale and affects neighbours only if not mounted (mount=%s)',
    (mount) => {
      const { state, shu, wei } = climb();
      state.units.push({ ...shu, id: 'neighbour', x: 21 });
      if (mount) state.footholds['20,16'] = 1;
      const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id, assault: true });
      expect(next.units[2]!.morale).toBe(80 - (mount ? 0 : 5));
      expect(next.units[0]!.assaultedDay).toBe(1);
      expect(next.stats.assaults).toBe(1);
    },
  );
  it('doubles boulder damage after an assault today', () => {
    const { state, shu, wei } = climb();
    state.day = 2;
    state.preparations.boulders['20,16'] = { day: 1 };
    shu.assaultedDay = 2;
    shu.attackedFromBelowDay = 2;
    const next = act(state, { type: 'dropBoulders', unitId: wei.id, targetId: shu.id });
    expect(shu.troops - next.units[0]!.troops).toBe(
      Math.floor(
        wei.troops *
          T.boulderCoefficient *
          T.climbingBoulderMultiplier *
          T.assaultBoulderMultiplier,
      ),
    );
  });
  it('cancels all preparations when Shu finishes climbing onto an empty wall cell', () => {
    const { state, shu, wei } = climb();
    wei.x = 22;
    state.preparations = {
      braziers: { '20,16': { litDay: 1 } },
      millstones: { '20,16': { hoisted: true, day: 1 } },
      boulders: { '20,16': { day: 1 } },
    };
    state.footholds['20,16'] = 2;
    const next = act(state, { type: 'climb', unitId: shu.id });
    expect(next.preparations).toEqual({ braziers: {}, millstones: {}, boulders: {} });
    expect(next.stats.firstWallDay).toBe(1);
  });
});

describe('cover and permanent mounds', () => {
  it('covers an adjacent ladder, extinguishes fire, and reduces subsequent fire damage without ignition', () => {
    const { state, shu, wei } = climb();
    state.day = 2;
    wei.troopType = 'archer';
    state.engines[0]!.burning = true;
    state.preparations.braziers['20,16'] = { litDay: 1 };
    let next = act(state, { type: 'coverEngine', unitId: shu.id, engineId: 'engine' });
    next = act(next, { type: 'fireArrows', unitId: wei.id, engineId: 'engine' });
    expect(next.engines[0]).toMatchObject({
      covered: true,
      burning: false,
      durability:
        T.engines.ladder.durability -
        Math.floor(300 * T.fireArrowCoefficient * T.coveredFireMultiplier),
    });
    expect(endDay(next).engines[0]!.durability).toBe(next.engines[0]!.durability);
    state.engines[0]!.kind = 'tower';
    refused(state, { type: 'coverEngine', unitId: shu.id, engineId: 'engine' });
  });
  it('drops only 100 damage on a covered ram', () => {
    const { state, wei } = duel({}, { x: 23 });
    state.day = 2;
    state.engines = [engine('ram', 23, 17, { covered: true })];
    state.preparations.millstones['23,16'] = { day: 1, hoisted: true };
    expect(
      act(state, { type: 'dropMillstone', unitId: wei.id, engineId: 'engine' }).engines[0]!
        .durability,
    ).toBe(200);
  });
  it('adds infantry and cart earth, completes at six, and gives the finished slope its combat benefits', () => {
    const { state, shu, wei } = climb('wallFoot');
    shu.y = 18;
    let next = act(state, { type: 'pileEarth', unitId: shu.id, x: 20, y: 17 });
    expect(next.mounds['20,17']).toBe(1);
    next = clearTomorrow(next);
    next = act(next, { type: 'pileEarth', unitId: shu.id, x: 20, y: 17 });
    next.engines = [engine('earthCart', 21, 17, { uses: 2 })];
    next.trenchFill['21,17'] = 3;
    for (let count = 0; count < 2; count++) {
      next = clearTomorrow(next);
      next = act(next, { type: 'pileEarth', engineId: 'engine', x: 20, y: 17 });
    }
    expect(next.mounds['20,17']).toBe(6);
    expect(next.stats.moundsBuilt).toBe(1);
    expect(next.engines).toEqual([]);
    next = act(next, { type: 'move', unitId: shu.id, x: 20, y: 17, level: 'ground' });
    expect(climbingPosition(next, next.units[0]!, wei)).toBe('mound');
    expect(predictSiegeAttack(next, shu.id, wei.id)).toMatchObject({
      frontage: 300,
      footholdGain: 2,
    });
    next.preparations.boulders['20,16'] = { day: 1 };
    const hit = act(next, { type: 'dropBoulders', unitId: wei.id, targetId: shu.id });
    expect(next.units[0]!.troops - hit.units[0]!.troops).toBe(
      Math.floor(wei.troops * T.boulderCoefficient * T.moundBoulderMultiplier),
    );
    refused(next, { type: 'fireArrows', unitId: wei.id, engineId: '20,17' });
    refused(next, { type: 'order', side: 'wei', kind: 'sortie', target: '20,17' });
    expect(endDay(hit).mounds['20,17']).toBe(6);
  });
  it('requires both filled trench rows and an adjacent ground worker', () => {
    const { state, shu } = climb('wallFoot');
    shu.y = 18;
    state.trenchFill['20,18'] = 1.5;
    refused(state, { type: 'pileEarth', unitId: shu.id, x: 20, y: 17 });
    state.trenchFill['20,18'] = 3;
    shu.level = 'wall';
    refused(state, { type: 'pileEarth', unitId: shu.id, x: 20, y: 17 });
  });
});

function nightFixture() {
  const state = createSiegeState(228);
  state.day = 2;
  state.engines = [engine('ladder', 20, 21), engine('ram', 24, 20, { id: 'ram' })];
  // Keep the routes and the sortie target unescorted unless a test adds a guard.
  for (const unit of state.units.filter((unit) => unit.side === 'shu')) unit.y = 25;
  state.weatherByDay[3] = 'clear';
  return state;
}

describe('night orders and clashes', () => {
  it('advances at most two cells along a clear route and raises a ladder; orders are hidden in public log until resolution', () => {
    let state = nightFixture();
    state = act(state, { type: 'order', side: 'shu', kind: 'nightAssault' });
    expect(state.log.at(-1)!.params).toEqual({ side: 'shu' });
    expect(state.engines[0]!.y).toBe(21);
    refused(state, { type: 'order', side: 'shu', kind: 'rally', target: state.units[1]!.id });
    const next = endDay(state);
    expect(next.engines[0]).toMatchObject({ y: 19, raisedAt: { x: 20, y: 16 } });
    expect(next.engines[1]!.y).toBe(19);
    expect(next.nightOrders).toEqual({});
  });
  it('torches stop a night assault and allow one prepared fire shot per wall archer', () => {
    let state = nightFixture();
    state.engines[0]!.y = 19;
    Object.assign(state.units[12]!, { x: 20, y: 16 });
    state.preparations.braziers['20,16'] = { litDay: 1 };
    state = act(state, { type: 'order', side: 'shu', kind: 'nightAssault' });
    state = act(state, { type: 'order', side: 'wei', kind: 'torches' });
    const next = endDay(state);
    expect(next.engines[1]!.y).toBe(20);
    expect(next.engines[0]!.durability).toBeLessThan(200);
    expect(next.log.filter((entry) => entry.code === 'fireArrowHit')).toHaveLength(1);
    expect(next.stats.nightClashes).toBe(1);
  });
  it('unopposed torches cost all Wei their normal morale recovery', () => {
    let state = nightFixture();
    for (const unit of state.units) unit.morale = 60;
    state = act(state, { type: 'order', side: 'wei', kind: 'torches' });
    const next = endDay(state);
    expect(next.units[10]!.morale).toBe(60);
    expect(next.units[0]!.morale).toBe(65);
  });
  it.each([false, true])(
    'sortie hits an unguarded engine (covered=%s), then burning resolves',
    (covered) => {
      let state = nightFixture();
      state.engines[1]!.covered = covered;
      state = act(state, { type: 'order', side: 'wei', kind: 'sortie', target: 'ram' });
      const next = endDay(state);
      expect(next.engines[1]).toMatchObject({
        durability: 300 - (covered ? 75 : 170),
        burning: !covered,
      });
      expect(next.log.find((entry) => entry.code === 'sortieHit')!.params.damage).toBe(
        covered ? 75 : 150,
      );
    },
  );
  it.each(['ground', 'wall'] as const)(
    'repels a sortie with an adjacent active %s guard, hurting the strongest gate-top defender by ten percent',
    (level) => {
      let state = nightFixture();
      Object.assign(state.units[1]!, { x: 24, y: level === 'wall' ? 16 : 21, level });
      if (level === 'wall') state.engines[1]!.y = 17;
      state = act(state, { type: 'order', side: 'wei', kind: 'sortie', target: 'ram' });
      const next = endDay(state);
      expect(next.engines[1]!.durability).toBe(300);
      expect(next.units[10]!.troops).toBe(274);
    },
  );
  it('night assault defeats a sortie without inflicting the guard penalty', () => {
    let state = nightFixture();
    state = act(state, { type: 'order', side: 'shu', kind: 'nightAssault' });
    state = act(state, { type: 'order', side: 'wei', kind: 'sortie', target: 'ram' });
    const next = endDay(state);
    expect(next.engines[1]!.durability).toBe(300);
    expect(next.units[10]!.troops).toBe(300);
    expect(next.stats.nightClashes).toBe(1);
    expect(next.log.find((entry) => entry.code === 'sortieRepelled')!.params.reason).toBe(
      'nightAssault',
    );
  });
  it('hold fast is effective only on the next day and clears the following night', () => {
    let state = createSiegeState(228);
    const shu = state.units[8]!;
    Object.assign(shu, { x: 22, y: 19 });
    const wei = state.units[11]!;
    state = act(state, { type: 'order', side: 'wei', kind: 'holdFast', target: wei.id });
    expect(predictSiegeAttack(state, shu.id, wei.id)!.modifiers.holdFast).toBe(1);
    state = endDay(state);
    expect(predictSiegeAttack(state, shu.id, wei.id)!.modifiers.holdFast).toBe(0.7);
    expect(endDay(state).holdFast).toBeUndefined();
  });
  it('records main-body threat and the wall held at night permanently', () => {
    const state = createSiegeState(228);
    Object.assign(state.units[10]!, { x: 23, y: 22, level: 'ground' });
    Object.assign(state.units[1]!, { x: 20, y: 16, level: 'wall' });
    const next = endDay(state);
    expect(next.mainBodyThreatened).toBe(true);
    expect(next.stats.wallEverHeldAtNight).toBe(true);
  });
});

describe('scores and v0.2 persistence', () => {
  it.each([
    ['victory', T.score.fastVictoryDay, 9000, false, 'swiftVictory'],
    ['victory', T.score.fastVictoryDay + 1, T.score.costlyVictoryLosses, false, 'victory'],
    [
      'victory',
      T.score.fastVictoryDay + 1,
      T.score.costlyVictoryLosses + 1,
      false,
      'costlyVictory',
    ],
    ['historical', 12, T.score.orderlyWithdrawalLosses, false, 'orderlyWithdrawal'],
    ['historical', 12, T.score.orderlyWithdrawalLosses + 1, false, 'grainWithdrawal'],
    ['historical', 5, 0, true, 'grainWithdrawal'],
    ['defeat', 4, 5000, false, 'defeat'],
  ] as const)(
    'scores Shu %s day %i losses %i withdrawn=%s as %s',
    (outcome, day, loss, withdrawn, tier) => {
      const state = createSiegeState(228);
      Object.assign(state, { outcome, day, withdrawn });
      state.stats.shuLost = loss;
      const score = scoreSiege(state, 'shu');
      expect(score.tier).toBe(tier);
      expect(score.score).toBe(Object.values(score.parts).reduce((sum, value) => sum + value, 0));
      expect(Number.isFinite(score.score)).toBe(true);
    },
  );
  it.each([
    ['defeat', false, false, 'annihilation'],
    ['historical', false, false, 'perfectDefense'],
    ['historical', true, false, 'firmDefense'],
    ['historical', false, true, 'firmDefense'],
    ['historical', true, true, 'narrowDefense'],
    ['victory', true, true, 'cityFallen'],
  ] as const)('scores Wei %s gate=%s wall=%s as %s', (outcome, gate, wall, tier) => {
    const state = createSiegeState(228);
    state.outcome = outcome;
    state.stats.gateEverBroken = gate;
    state.stats.wallEverHeldAtNight = wall;
    state.stats.wallNights = wall ? 3 : 0;
    const score = scoreSiege(state, 'wei');
    expect(score.tier).toBe(tier);
    expect(score.score).toBe(Object.values(score.parts).reduce((sum, value) => sum + value, 0));
  });
  it('calculates numerical parts, including fractional casualty points and engine/early-withdrawal bonuses', () => {
    const state = createSiegeState(228);
    state.outcome = 'victory';
    state.day = 4;
    state.stats.shuLost = T.score.shuCasualtyScale / 4;
    expect(scoreSiege(state, 'shu')).toMatchObject({
      score: 103.25,
      parts: { outcome: 60, speed: 24, casualties: 11.25, engines: 5, mainBody: 3 },
    });
    state.outcome = 'historical';
    state.withdrawn = true;
    state.day = 8;
    state.stats.weiLost = 200;
    state.stats.enginesLost = 3;
    expect(scoreSiege(state, 'wei')).toMatchObject({
      score: 91.25,
      parts: { outcome: 50, gate: 10, wall: 10, casualties: 11.25, engines: 5, speed: 5 },
    });
  });
  it('is deterministic across every new action and JSON save round trips for both player sides', () => {
    const play = () => {
      let state = createSiegeState(228);
      state = act(state, { type: 'raiseLadder', engineId: state.engines[0]!.id });
      state = act(state, { type: 'order', side: 'shu', kind: 'nightAssault' });
      state = act(state, { type: 'lightBrazier', unitId: state.units[12]!.id });
      return endDay(state);
    };
    const state = play();
    expect(state).toEqual(play());
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    for (const playerSide of ['shu', 'wei'] as const) {
      const save = { state, playerSide, phase: 'battle' as const, facings: {} };
      expect(deserializeSiegeSave(serializeSiegeSave(save))).toEqual(save);
    }
    expect(applySiegeAction(state, { type: 'endDay' })).toMatchObject({ ok: true });
  });
});

describe('v0.2 boundary cases and accounting', () => {
  it('suppresses from a tower at range four, ignoring the parapet and spending its action', () => {
    const { state, wei } = duel();
    state.engines = [engine('tower', 20, 20)];
    const normal = predictSiegeAttack(state, 'engine', wei.id)!;
    expect(normal.inRange).toBe(true);
    expect(normal.modifiers.parapet).toBe(1);
    const next = act(state, { type: 'suppress', engineId: 'engine', targetId: wei.id });
    expect(next.units[1]!.troops).toBe(
      wei.troops - Math.floor(normal.casualties * T.suppressionDamageMultiplier),
    );
    refused(next, { type: 'suppress', engineId: 'engine', targetId: wei.id });
    state.engines[0]!.y++;
    refused(state, { type: 'suppress', engineId: 'engine', targetId: wei.id });
  });
  it('suppression remains a quarter volley when a ground archer stands on a ladder base', () => {
    const { state, shu, wei } = climb();
    shu.troopType = 'archer';
    const ordinary = predictSiegeAttack(state, shu, wei)!;
    const firingState = structuredClone(state);
    firingState.engines = [];
    const volley = predictSiegeAttack(firingState, shu.id, wei.id)!;
    const next = act(state, { type: 'suppress', unitId: shu.id, targetId: wei.id });
    expect(volley.frontage).toBe(600);
    expect(ordinary.frontage).toBe(150);
    expect(next.units[1]!.troops).toBe(
      wei.troops -
        Math.floor(
          Math.floor(siegeBaseDamage(state, shu, wei, T.volleyFrontage) * T.parapetMultiplier) *
            T.suppressionDamageMultiplier,
        ),
    );
  });
  it('shares an earlier-day brazier with a different archer within one wall cell', () => {
    const { state, wei } = climb();
    state.day = 2;
    wei.troopType = 'archer';
    state.preparations.braziers['21,16'] = { litDay: 1 };
    state.engines[0]!.durability = 300;
    state.engines[0]!.max = 300;
    expect(
      act(state, { type: 'fireArrows', unitId: wei.id, engineId: 'engine' }).engines[0]!.burning,
    ).toBe(true);
    state.preparations.braziers = { '22,16': { litDay: 1 } };
    refused(state, { type: 'fireArrows', unitId: wei.id, engineId: 'engine' }, /brazier/);
  });
  it('keeps night advancement on a clear northward route and leaves engines beyond y22 alone', () => {
    let state = nightFixture();
    Object.assign(state.units[1]!, { x: 20, y: 20 });
    state.engines.push(engine('earthCart', 27, 23, { id: 'outside' }));
    state = act(state, { type: 'order', side: 'shu', kind: 'nightAssault' });
    const next = endDay(state);
    expect(next.engines[0]!.y).toBe(21);
    expect(next.engines[2]!.y).toBe(23);
    expect(
      next.log.find(
        (entry) => entry.code === 'nightMorale' && entry.params.unitId === state.units[1]!.id,
      )!.params,
    ).toMatchObject({ before: 80, after: 77 });
  });
  it('torches apply minus five morale near the trench and cannot use a brazier prepared that day', () => {
    let state = nightFixture();
    Object.assign(state.units[1]!, { x: 20, y: 20 });
    Object.assign(state.units[12]!, { x: 20, y: 16 });
    state.engines[0]!.y = 19;
    state.preparations.braziers['20,16'] = { litDay: state.day };
    state = act(state, { type: 'order', side: 'shu', kind: 'nightAssault' });
    state = act(state, { type: 'order', side: 'wei', kind: 'torches' });
    const next = endDay(state);
    expect(next.engines[0]!.durability).toBe(T.engines.ladder.durability);
    expect(next.log.find((entry) => entry.code === 'nightMorale')!.params).toMatchObject({
      before: 80,
      after: 75,
      reason: 'torches',
    });
  });
  it('checks suppression again when the night sortie resolves', () => {
    let state = nightFixture();
    state = act(state, { type: 'order', side: 'wei', kind: 'sortie', target: 'ram' });
    state.units[10]!.suppressedDay = 2;
    const next = endDay(state);
    expect(next.engines[1]!.durability).toBe(300);
    expect(next.log.find((entry) => entry.code === 'sortieRepelled')!.params.reason).toBe(
      'unavailable',
    );
    expect(next.units[10]!.suppressedDay).toBeUndefined();
  });
  it('counts destroyed engines once and distinguishes consumed carts from engine losses', () => {
    let state = createSiegeState(228);
    const ladder = state.engines[0]!;
    const before = structuredClone(state);
    state = damageEngine(state, ladder, 200);
    expect(before.stats.enginesLost).toBe(0);
    expect(state.stats.enginesLost).toBe(1);
    state = damageEngine(state, state.engines[0]!, 200);
    expect(state.stats.enginesLost).toBe(1);
    expect(state.log.filter((entry) => entry.code === 'engineLost')).toHaveLength(1);
    const cart = state.engines.find((entry) => entry.kind === 'earthCart')!;
    cart.uses = 1;
    cart.y = 19;
    state = act(state, { type: 'fillTrench', engineId: cart.id, x: 21, y: 18 });
    expect(state.stats.enginesLost).toBe(1);
    expect(state.engines.find((entry) => entry.id === cart.id)).toBeUndefined();
  });
  it('records troop losses including wounded, and removes recovered wounded from losses', () => {
    let state = createSiegeState(228);
    const unit = state.units[1]!;
    unit.troops -= 100;
    unit.wounded = 60;
    state = act(state, { type: 'order', side: 'shu', kind: 'rotate', target: unit.id });
    expect(state.stats.shuLost).toBe(100);
    state = endDay(state);
    expect(state.stats.shuLost).toBe(70);
    expect(state.units[1]!.wounded).toBe(30);
  });
  it('records a broken gate forever and awards no gate repair after it has fallen', () => {
    let state = createSiegeState(228);
    state.engines = [engine('ram', 23, 17)];
    state.gates.south.durability = T.ramDamage;
    state = act(state, { type: 'order', side: 'wei', kind: 'nightRepair', target: 'south' });
    state = act(state, { type: 'ram', engineId: 'engine', gateId: 'south' });
    const next = endDay(state);
    expect(next.stats.gateEverBroken).toBe(true);
    expect(next.gates.south.durability).toBe(0);
  });
  it('records a transient threat even if that Wei unit later moves away', () => {
    let state = createSiegeState(228);
    const wei = state.units[10]!;
    Object.assign(wei, { x: 23, y: 22, level: 'ground' });
    state = act(state, { type: 'move', unitId: wei.id, x: 23, y: 20, level: 'ground' });
    expect(state.mainBodyThreatened).toBe(true);
    expect(endDay(state).mainBodyThreatened).toBe(true);
  });
});

it.each([false, true])(
  'floors fractional fire damage and leaves integer durability (covered=%s)',
  (covered) => {
    const { state, wei } = climb();
    state.day = 2;
    state.weather = 'snow';
    Object.assign(wei, { troopType: 'archer', troops: 201 });
    state.preparations.braziers['20,16'] = { litDay: 1 };
    state.engines[0]!.covered = covered;
    const before = state.engines[0]!.durability;
    const next = act(state, { type: 'fireArrows', unitId: wei.id, engineId: state.engines[0]!.id });
    const damage = Math.floor(
      201 * T.fireArrowCoefficient * T.snowFireMultiplier * (covered ? T.coveredFireMultiplier : 1),
    );
    expect(next.engines[0]!.durability).toBe(before - damage);
    expect(Number.isInteger(next.engines[0]!.durability)).toBe(true);
    expect(next.log.find((e) => e.code === 'fireArrowHit')!.params.damage).toBe(damage);
  },
);

it('counts a guarded night sortie as combat when computing idle days', () => {
  const state = createSiegeState(228);
  state.engines = [engine('ram', 24, 18)];
  Object.assign(state.units[1]!, { x: 24, y: 19 });
  const ordered = act(state, { type: 'order', side: 'wei', kind: 'sortie', target: 'engine' });
  const next = endDay(ordered);
  expect(next.stats.weiLost).toBe(26);
  expect(next.stats.idleDays).toBe(0);
  expect(next.stats.lastActiveDay).toBe(1);
  expect(next.stats.nightResults).toContainEqual({
    day: 1,
    kind: 'sortieRepelled',
    result: 'guard',
  });
});
