import { describe, expect, it } from 'vitest';
import { COURTYARD, sameCell } from '../../src/siege/content/chencang';
import { planAttackerTurn } from '../../src/siege/ai/attacker';
import { planDefenderTurn } from '../../src/siege/ai/defender';
import { activeUnit, predictSiegeAttack, siegeBaseDamage } from '../../src/siege/rules/combat';
import { ROUTED_MORALE } from '../../src/siege/rules/constants';
import { endDay } from '../../src/siege/rules/day';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { siegeCommands } from '../../src/siege/ui/commands';
import { act, duel, engine, refused } from './rulesFixtures';

describe('J2 climbing', () => {
  it.each(['ladder', 'wallFoot'] as const)(
    'requires three climb actions at an empty %s',
    (position) => {
      const { state, shu, wei } = duel({ y: position === 'ladder' ? 19 : 17 });
      wei.x = 25;
      if (position === 'ladder')
        state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
      else {
        state.trenchFill['20,17'] = 3;
        state.trenchFill['20,18'] = 3;
      }
      refused(state, { type: 'move', unitId: shu.id, x: 20, y: 16, level: 'wall' });
      let next = state;
      for (let day = 1; day <= 3; day++) {
        next = act(next, { type: 'climb', unitId: shu.id });
        expect(next.units[0]).toMatchObject({ acted: true, level: day === 3 ? 'wall' : 'ground' });
        expect(next.footholds['20,16']).toBe(day === 3 ? 0 : day);
        expect(next.units.map((u) => u.troops)).toEqual(state.units.map((u) => u.troops));
        if (day < 3) next = endDay(next);
      }
      expect(next.units[0]).toMatchObject({ x: 20, y: 16, moved: true, acted: true });
      expect(next.stats.firstWallDay).toBe(3);
    },
  );

  it('rejects climb from a wrong position, with a defender, and from a destroyed ladder', () => {
    const { state, shu, wei } = duel();
    refused(state, { type: 'climb', unitId: shu.id });
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    refused(state, { type: 'climb', unitId: shu.id });
    wei.x = 25;
    state.engines[0]!.durability = 0;
    refused(state, { type: 'climb', unitId: shu.id });
  });

  it('allows a real move onto an empty wall from a completed mound', () => {
    const { state, shu, wei } = duel({ y: 17 });
    wei.x = 25;
    state.trenchFill['20,17'] = 3;
    state.trenchFill['20,18'] = 3;
    state.mounds['20,17'] = 5;
    refused(state, { type: 'move', unitId: shu.id, x: 20, y: 16, level: 'wall' });
    state.mounds['20,17'] = 6;
    expect(
      act(state, { type: 'move', unitId: shu.id, x: 20, y: 16, level: 'wall' }).units[0]!.level,
    ).toBe('wall');
  });

  it('exposes the climb action through the existing command validator', () => {
    const { state, shu, wei } = duel();
    wei.x = 25;
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    const command = siegeCommands(state, shu.id).find((entry) => entry.kind === 'climb')!;
    expect(command).toMatchObject({ action: { type: 'climb', unitId: shu.id }, reason: null });
    expect(act(state, command.action!).footholds['20,16']).toBe(1);
  });
});

describe('J2 combat and attrition', () => {
  it('caps walkway combat on both sides and shocks morale against wall frontage', () => {
    const { state, shu, wei } = duel(
      { y: 16, level: 'wall', troops: 2400 },
      { x: 21, troops: 600 },
    );
    const f = predictSiegeAttack(state, shu, wei)!;
    expect(f).toMatchObject({
      frontage: T.wallFrontage,
      countedTroops: T.wallFrontage,
      counterattack: { frontage: T.wallFrontage, countedTroops: T.wallFrontage },
    });
    const shock = (casualties: number) =>
      Math.min(45, Math.max(1, Math.ceil((casualties / T.wallFrontage) * 55)));
    const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(next.units[1]!.troops).toBe(wei.troops - f.casualties);
    expect(next.units[0]!.troops).toBe(shu.troops - f.counterattack.casualties);
    expect(next.units[1]!.morale).toBe(wei.morale - shock(f.casualties));
    expect(next.units[0]!.morale).toBe(shu.morale - shock(f.counterattack.casualties));
  });

  it.each([false, true])(
    'throws a low-morale Shu unit to a free ladder base or nearest southern ground (blocked=%s)',
    (blocked) => {
      const { state, shu, wei } = duel({ y: 16, level: 'wall', morale: ROUTED_MORALE }, { x: 21 });
      state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
      state.footholds['20,16'] = 2;
      if (blocked)
        state.units.push({ ...shu, id: 'blocker', x: 20, y: 19, level: 'ground', morale: 80 });
      const next = act(state, { type: 'attack', unitId: wei.id, targetId: shu.id });
      const fallen = next.units[0]!;
      expect(fallen).toMatchObject({
        level: 'ground',
        morale: ROUTED_MORALE,
        moved: true,
        acted: true,
        routed: false,
      });
      expect(fallen.y).toBe(19);
      expect(fallen.x).toBe(blocked ? 19 : 20);
      expect(next.footholds['20,16']).toBe(0);
      expect(next.log.filter((e) => e.code === 'thrownOffWall')).toHaveLength(1);
      expect(activeUnit(fallen)).toBe(true);
      refused(next, { type: 'move', unitId: shu.id, x: 20, y: 20, level: 'ground' });
      const tomorrow = endDay(next);
      const moved = act(tomorrow, { type: 'move', unitId: shu.id, x: 20, y: 20, level: 'ground' });
      expect(activeUnit(moved.units[0]!)).toBe(true);
    },
  );

  it('returns a thrown-off unit to its filled wall foot', () => {
    const { state, shu, wei } = duel({ y: 16, level: 'wall', morale: ROUTED_MORALE }, { x: 21 });
    state.trenchFill['20,17'] = 3;
    state.trenchFill['20,18'] = 3;
    state.footholds['20,16'] = 2;
    const next = act(state, { type: 'attack', unitId: wei.id, targetId: shu.id });
    expect(next.units[0]).toMatchObject({
      x: 20,
      y: 17,
      level: 'ground',
      routed: false,
      morale: ROUTED_MORALE,
    });
    expect(next.footholds['20,16']).toBe(0);
  });

  it.each(['ladder', 'wallFoot', 'mound'] as const)(
    'applies uphill damage and forecasts the modifier for normal and assault %s attacks',
    (position) => {
      const { state, shu, wei } = duel({ y: position === 'ladder' ? 19 : 17 });
      if (position === 'ladder')
        state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
      else state.trenchFill['20,17'] = 3;
      if (position === 'mound') state.mounds['20,17'] = 6;
      for (const assault of [false, true]) {
        const f = predictSiegeAttack(state, shu, wei, { assault })!;
        expect(f.modifiers.climbingAttackMultiplier).toBe(T.climbingAttackMultiplier);
        expect(f.counterattack.modifiers.climbingAttackMultiplier).toBe(1);
        expect(f.footholdGain).toBe(
          assault ? T.climbing[position].assaultFoothold : T.climbing[position].foothold,
        );
        expect(f.casualties).toBe(
          Math.floor(
            siegeBaseDamage(state, shu, wei, f.countedTroops) * T.climbingAttackMultiplier,
          ),
        );
        const next = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id, assault });
        expect(next.units[1]!.troops).toBe(wei.troops - f.casualties);
      }
      state.engines = [engine('tower', 20, 20)];
      expect(predictSiegeAttack(state, 'engine', wei)!.modifiers.climbingAttackMultiplier).toBe(1);
    },
  );

  it('rejects volleys at three, accepts suppression at three and volleys at two', () => {
    const { state, shu, wei } = duel({ troopType: 'archer' });
    refused(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    const expected = Math.floor(
      Math.floor(siegeBaseDamage(state, shu, wei, T.volleyFrontage) * T.parapetMultiplier) *
        T.suppressionDamageMultiplier,
    );
    expect(
      act(state, { type: 'suppress', unitId: shu.id, targetId: wei.id }).units[1]!.troops,
    ).toBe(wei.troops - expected);
    shu.y = 20;
    refused(state, { type: 'suppress', unitId: shu.id, targetId: wei.id });
    state.trenchFill['20,18'] = 3;
    shu.y = 18;
    const f = predictSiegeAttack(state, shu, wei)!;
    expect(f.inRange).toBe(true);
    expect(act(state, { type: 'attack', unitId: shu.id, targetId: wei.id }).units[1]!.troops).toBe(
      wei.troops - f.casualties,
    );
  });

  it('takes exactly ceil(gate durability / ram damage) hits without night repair', () => {
    let state = createSiegeState(228);
    const ram = state.engines.find((e) => e.kind === 'ram')!;
    Object.assign(ram, { x: 24, y: 17 });
    const hits = Math.ceil(T.southGateDurability / T.ramDamage);
    for (let i = 1; i <= hits; i++) {
      state = act(state, { type: 'ram', engineId: ram.id, gateId: 'south' });
      expect(state.gates.south.durability).toBe(
        Math.max(0, T.southGateDurability - i * T.ramDamage),
      );
      expect(state.gates.south.broken).toBe(i === hits);
      if (i < hits) state = endDay(state);
    }
  });

  it('requires the courtyard to be clear of active Wei units', () => {
    const { state, shu, wei } = duel(
      { ...COURTYARD[0]!, level: 'ground' },
      { ...COURTYARD[1]!, level: 'ground' },
    );
    expect(endDay(state).outcome).toBeNull();
    wei.routed = true;
    expect(endDay(state).outcome).toBe('victory');
    expect(sameCell(shu, COURTYARD[0]!)).toBe(true);
  });

  it('uses city frontage on both sides and preserves gate precedence', () => {
    const { state, shu, wei } = duel(
      { x: 23, y: 12 },
      { x: 24, y: 12, level: 'ground', troops: 700 },
    );
    const f = predictSiegeAttack(state, shu, wei)!;
    expect(f).toMatchObject({
      frontage: T.cityFrontage,
      counterattack: { frontage: T.cityFrontage },
    });
    expect(act(state, { type: 'attack', unitId: shu.id, targetId: wei.id }).units[1]!.troops).toBe(
      wei.troops - f.casualties,
    );
    Object.assign(shu, { x: 23, y: 15 });
    Object.assign(wei, { x: 23, y: 16 });
    state.gates.south.broken = true;
    expect(predictSiegeAttack(state, shu, wei)!.frontage).toBe(T.gateFrontage);
  });

  it('heals the floored wounded share for living Wei, including routed units, but never revives the dead', () => {
    const state = createSiegeState(228);
    Object.assign(state.units[10]!, { troops: 200, wounded: 79 });
    Object.assign(state.units[11]!, { troops: 100, wounded: 43, routed: true });
    Object.assign(state.units[12]!, { troops: 0, wounded: 50 });
    const next = endDay(state);
    for (const index of [10, 11]) {
      const before = state.units[index]!;
      const recovered = Math.floor(before.wounded * T.weiNightRecovery);
      expect(next.units[index]!).toMatchObject({
        troops: before.troops + recovered,
        wounded: before.wounded - recovered,
      });
      expect(next.log).toContainEqual({
        day: 1,
        code: 'weiNightRecovery',
        params: {
          unitId: before.id,
          recovered,
          before: before.troops,
          after: before.troops + recovered,
        },
      });
    }
    expect(next.units[12]!.troops).toBe(0);
  });
});

describe('J2 AI policies', () => {
  it('assaults with an archer already under a defended ladder instead of suppressing', () => {
    const state = createSiegeState(228);
    state.day = 2;
    Object.assign(state.units[8]!, { x: 18, y: 19 });
    Object.assign(state.units[11]!, { x: 18, y: 16 });
    state.engines = [engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 } })];
    state.preparations.boulders['18,16'] = { day: 1 };
    const actions = planAttackerTurn(state, 'anyPrice');
    expect(actions).toContainEqual({
      type: 'attack',
      unitId: state.units[8]!.id,
      targetId: state.units[11]!.id,
      assault: true,
    });
    expect(
      actions.some(
        (a) => a.type === 'suppress' && 'unitId' in a && a.unitId === state.units[8]!.id,
      ),
    ).toBe(false);
  });
  it('rotates a wounded climber before a fresh unit assaults the freed base', () => {
    const state = createSiegeState(228);
    state.day = 2;
    Object.assign(state.units[1]!, { x: 18, y: 19, troops: 600, wounded: 400, morale: 30 });
    Object.assign(state.units[2]!, { x: 18, y: 20 });
    Object.assign(state.units[11]!, { x: 18, y: 16 });
    state.engines = [engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 } })];
    const actions = planAttackerTurn(state, 'anyPrice');
    const rotation = actions.findIndex(
      (a) => a.type === 'order' && a.kind === 'rotate' && a.target === state.units[1]!.id,
    );
    const assault = actions.findIndex(
      (a) =>
        a.type === 'attack' &&
        'unitId' in a &&
        a.unitId === state.units[2]!.id &&
        'assault' in a &&
        a.assault,
    );
    expect(rotation).toBeGreaterThanOrEqual(0);
    expect(assault).toBeGreaterThan(rotation);
  });

  it('assaults simultaneously from both occupied climbing positions', () => {
    const state = createSiegeState(228);
    state.day = 2;
    Object.assign(state.units[1]!, { x: 18, y: 19 });
    Object.assign(state.units[2]!, { x: 29, y: 19 });
    Object.assign(state.units[11]!, { x: 18, y: 16 });
    Object.assign(state.units[13]!, { x: 29, y: 16 });
    state.engines = [
      engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 } }),
      engine('ladder', 29, 19, { id: 'right', raisedAt: { x: 29, y: 16 } }),
    ];
    const actions = planAttackerTurn(state, 'anyPrice');
    for (const unit of state.units.slice(1, 3))
      expect(
        actions.some(
          (a) =>
            a.type === 'attack' &&
            'unitId' in a &&
            a.unitId === unit.id &&
            'assault' in a &&
            a.assault,
        ),
      ).toBe(true);
  });
  it.each(['careful', 'anyPrice', 'brute'] as const)(
    '%s uses the defended climbing position from day two',
    (method) => {
      const state = createSiegeState(228);
      state.day = 2;
      Object.assign(state.units[1]!, { x: 18, y: 19 });
      Object.assign(state.units[11]!, { x: 18, y: 16 });
      state.engines[0]!.raisedAt = { x: 18, y: 16 };
      const attacks = planAttackerTurn(state, method).filter(
        (a) => a.type === 'attack' && 'targetId' in a && a.targetId === state.units[11]!.id,
      );
      expect(attacks).toContainEqual({
        type: 'attack',
        unitId: state.units[1]!.id,
        targetId: state.units[11]!.id,
        ...(method === 'careful' ? {} : { assault: true }),
      });
    },
  );

  it('keeps both planners independent of the hidden opposing night order', () => {
    const state = createSiegeState(228);
    const hidden = structuredClone(state);
    hidden.nightOrders.wei = { kind: 'torches' };
    for (const method of ['careful', 'anyPrice', 'brute'] as const)
      expect(planAttackerTurn(hidden, method)).toEqual(planAttackerTurn(state, method));
    hidden.nightOrders.wei = undefined;
    hidden.nightOrders.shu = { kind: 'nightAssault' };
    expect(planDefenderTurn(hidden)).toEqual(planDefenderTurn(state));
  });
});
