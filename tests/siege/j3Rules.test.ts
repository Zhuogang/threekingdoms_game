import { describe, expect, it } from 'vitest';
import { attackerPlan, planAttackerTurn, runAttackerTurn } from '../../src/siege/ai/attacker';
import { applySiegeAction } from '../../src/siege/rules/actions';
import { moraleAfterCasualties, predictSiegeClimb } from '../../src/siege/rules/combat';
import { endDay } from '../../src/siege/rules/day';
import { scoreSiege } from '../../src/siege/rules/score';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { deserializeSiegeSave, serializeSiegeSave } from '../../src/siege/save';
import { act, duel, engine, refused } from './rulesFixtures';

describe('J3 assault climb', () => {
  it.each(['ladder', 'wallFoot', 'mound'] as const)(
    'forecasts and applies empty-cell assault costs at a %s, with deterministic replay',
    (position) => {
      const { state, shu, wei } = duel({ y: position === 'ladder' ? 19 : 17 });
      wei.x = 25;
      if (position === 'ladder')
        state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
      else {
        state.trenchFill['20,17'] = 3;
        state.trenchFill['20,18'] = 3;
        if (position === 'mound') state.mounds['20,17'] = 6;
      }
      const neighbour = { ...shu, id: 'neighbour', x: 21 };
      const far = { ...shu, id: 'far', x: 23 };
      state.units.push(neighbour, far);
      const before = structuredClone(state);
      const forecast = predictSiegeClimb(state, shu.id, { assault: true })!;
      const loss = Math.floor(T.assaultClimbLoss * T.climbing[position].assaultFrontage);
      expect(forecast).toMatchObject({
        sourceId: shu.id,
        top: { x: 20, y: 16 },
        position,
        assault: true,
        frontage: T.climbing[position].assaultFrontage,
        casualties: loss,
        footholdGain: 2,
        footholdAfter: 2,
        wouldMount: false,
        sourceMoraleAfter: moraleAfterCasualties(shu, loss) - T.assaultMoraleLoss,
        neighbourMoraleLoss: T.assaultNeighbourLoss,
      });
      expect(state).toEqual(before);
      const action = { type: 'climb', unitId: shu.id, assault: true } as const;
      const next = act(state, action);
      expect(applySiegeAction(state, action)).toEqual(applySiegeAction(state, action));
      expect(next.footholds['20,16']).toBe(2);
      expect(next.units[0]).toMatchObject({
        troops: shu.troops - loss,
        morale: forecast.sourceMoraleAfter,
        assaultedDay: state.day,
        climbing: true,
        acted: true,
        level: 'ground',
      });
      expect(next.units[2]!.morale).toBe(neighbour.morale - T.assaultNeighbourLoss);
      expect(next.units[3]!.morale).toBe(far.morale);
      expect(next.stats.assaults).toBe(1);
      expect(next.stats.shuLost).toBeGreaterThanOrEqual(loss);
      const tomorrow = endDay(next);
      const mounting = predictSiegeClimb(tomorrow, shu.id, { assault: true })!;
      expect(mounting).toMatchObject({
        footholdAfter: 3,
        wouldMount: true,
        neighbourMoraleLoss: 0,
      });
      const mounted = act(tomorrow, action);
      expect(mounted.units[0]).toMatchObject({
        x: 20,
        y: 16,
        level: 'wall',
        moved: true,
        acted: true,
      });
      expect(mounted.units[2]!.morale).toBe(tomorrow.units[2]!.morale);
      expect(mounted.stats.assaults).toBe(2);
      expect(mounted.footholds['20,16']).toBe(0);
    },
  );

  it('keeps normal climbing free and rejects occupied, unavailable, and destroyed connections', () => {
    const { state, shu, wei } = duel();
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    expect(predictSiegeClimb(state, shu)).toBeNull();
    refused(state, { type: 'climb', unitId: shu.id, assault: true });
    wei.x = 25;
    expect(predictSiegeClimb(state, shu)).toMatchObject({
      casualties: 0,
      sourceMoraleAfter: shu.morale,
      footholdGain: 1,
      neighbourMoraleLoss: 0,
    });
    const next = act(state, { type: 'climb', unitId: shu.id });
    expect(next.units[0]).toMatchObject({
      troops: shu.troops,
      wounded: shu.wounded,
      morale: shu.morale,
    });
    expect(next.stats.assaults).toBe(0);
    refused(next, { type: 'climb', unitId: shu.id, assault: true });
    state.engines[0]!.wrecked = true;
    expect(predictSiegeClimb(state, shu, { assault: true })).toBeNull();
    refused(state, { type: 'climb', unitId: shu.id, assault: true });
  });

  it('forecasts the recoverable fall when assault morale breaks immediately after mounting', () => {
    const { state, shu, wei } = duel({ morale: 31 });
    wei.x = 25;
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    state.footholds['20,16'] = 2;
    const forecast = predictSiegeClimb(state, shu, { assault: true })!;
    const next = act(state, { type: 'climb', unitId: shu.id, assault: true });
    expect(forecast.wouldMount).toBe(true);
    expect(next.units[0]).toMatchObject({
      level: 'ground',
      routed: false,
      morale: forecast.sourceMoraleAfter,
    });
    expect(next.log.filter((e) => e.code === 'thrownOffWall')).toHaveLength(1);
  });

  it('does not grant foothold when self-casualties eliminate the climber', () => {
    const { state, shu, wei } = duel({ troops: 1 });
    wei.x = 25;
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    expect(predictSiegeClimb(state, shu, { assault: true })).toMatchObject({
      casualties: 1,
      footholdGain: 0,
      wouldMount: false,
    });
    const next = act(state, { type: 'climb', unitId: shu.id, assault: true });
    expect(next.units[0]!.troops).toBe(0);
    expect(next.stats.assaults).toBe(1);
    expect(next.stats.firstWallDay).toBeNull();
  });
});

describe('J3 attacker policies', () => {
  it('seeds ram days across 2–5 without consuming weather RNG', () => {
    const days = new Set(Array.from({ length: 200 }, (_, i) => attackerPlan(i + 1).ramDay));
    expect([...days].sort()).toEqual([2, 3, 4, 5]);
    expect(attackerPlan(228)).toEqual(attackerPlan(228));
  });

  it.each(['careful', 'anyPrice'] as const)(
    '%s replaces a wrecked ram before discretionary engines',
    (method) => {
      const state = createSiegeState(228);
      const ram = state.engines.find((e) => e.kind === 'ram')!;
      ram.wrecked = true;
      ram.durability = 0;
      expect(planAttackerTurn(state, method)).toContainEqual({
        type: 'queueEngine',
        workshopId: 'workshop-1',
        kind: 'ram',
      });
    },
  );

  it('lets careful cover a threatened opening ladder before the first prepared fire shot', () => {
    const state = createSiegeState(228);
    state.day = 2;
    state.weather = 'clear';
    state.engines = [engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 } })];
    const archer = state.units[12]!;
    Object.assign(archer, { x: 18, y: 16, troops: 300 });
    state.preparations.braziers['18,16'] = { litDay: 1 };
    const actions = planAttackerTurn(state, 'careful');
    const coverIndex = actions.findIndex(
      (a) => a.type === 'coverEngine' && a.engineId === 'engine',
    );
    expect(coverIndex).toBeGreaterThanOrEqual(0);
    let protectedState = state;
    for (const action of actions.slice(0, coverIndex + 1))
      protectedState = act(protectedState, action);
    const fire = { type: 'fireArrows', unitId: archer.id, engineId: 'engine' } as const;
    const uncovered = act(state, fire).engines[0]!;
    const covered = act(protectedState, fire).engines[0]!;
    expect(covered.covered).toBe(true);
    expect(covered.durability).toBe(
      T.engines.ladder.durability -
        Math.floor(300 * T.fireArrowCoefficient * T.coveredFireMultiplier),
    );
    expect(covered.durability).toBeGreaterThan(uncovered.durability);
    expect(covered.burning).toBe(false);
  });

  it('anyPrice rams through a hoisted millstone; careful first suppresses or waits even when covered', () => {
    const state = createSiegeState(228);
    state.day = 5;
    state.engines = [engine('ram', 24, 17, { covered: true })];
    for (const u of state.units.filter((u) => u.side === 'shu' && u.troopType === 'archer'))
      u.acted = true;
    Object.assign(state.units[10]!, { x: 24, y: 16 });
    state.preparations.millstones['24,16'] = { day: 4, hoisted: true };
    expect(planAttackerTurn(state, 'anyPrice')).toContainEqual({
      type: 'ram',
      engineId: 'engine',
      gateId: 'south',
    });
    expect(planAttackerTurn(state, 'careful').some((a) => a.type === 'ram')).toBe(false);
  });

  it.each(['infantry', 'archer'] as const)(
    'anyPrice assaults an empty ladder with %s on consecutive days; careful never assaults',
    (troopType) => {
      const state = createSiegeState(228);
      state.day = 2;
      Object.assign(state.units[1]!, { x: 18, y: 19, troopType });
      state.engines = [engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 } })];
      for (const wei of state.units.filter((u) => u.side === 'wei')) wei.x = 24;
      const unitId = state.units[1]!.id;
      expect(planAttackerTurn(state, 'anyPrice')).toContainEqual({
        type: 'climb',
        unitId,
        assault: true,
      });
      const careful = planAttackerTurn(state, 'careful');
      expect(careful.some((a) => 'assault' in a && a.assault)).toBe(false);
      if (troopType === 'infantry') expect(careful).toContainEqual({ type: 'climb', unitId });
      const next = endDay(runAttackerTurn(state, 'anyPrice'));
      expect(planAttackerTurn(next, 'anyPrice')).toContainEqual({
        type: 'climb',
        unitId,
        assault: true,
      });
    },
  );
});

describe('J3 wall nights and scores', () => {
  it('counts nights once, including multiple units and the final night, but not intraday entry', () => {
    let state = createSiegeState(228);
    expect(state.stats.wallNights).toBe(0);
    state.stats.firstWallDay = 1;
    state = endDay(state);
    expect(state.stats.wallNights).toBe(0);
    Object.assign(state.units[1]!, { x: 20, y: 16, level: 'wall' });
    Object.assign(state.units[2]!, { x: 21, y: 16, level: 'wall' });
    state = endDay(state);
    expect(state.stats.wallNights).toBe(1);
    state = endDay(state);
    expect(state.stats.wallNights).toBe(2);
    state.day = 12;
    state.grain = 1;
    state = endDay(state);
    expect(state.outcome).toBe('historical');
    expect(state.stats.wallNights).toBe(3);
    expect(endDay(state).stats.wallNights).toBe(3);
  });

  it.each([
    [false, 0, 'perfectDefense'],
    [false, 2, 'perfectDefense'],
    [false, 3, 'firmDefense'],
    [true, 0, 'firmDefense'],
    [true, 2, 'firmDefense'],
    [true, 3, 'narrowDefense'],
  ] as const)(
    'scores held gateBroken=%s wallNights=%i as %s',
    (gateEverBroken, wallNights, tier) => {
      const state = createSiegeState(228);
      state.outcome = 'historical';
      Object.assign(state.stats, { gateEverBroken, wallNights, wallEverHeldAtNight: true });
      expect(scoreSiege(state, 'wei')).toMatchObject({
        tier,
        parts: { wall: wallNights <= 2 ? 10 : 0, gate: gateEverBroken ? 0 : 10 },
      });
    },
  );

  it('round-trips wallNights and rejects missing, fractional, negative and over-limit values', () => {
    const state = createSiegeState(228);
    state.stats.wallNights = 2;
    const save = { playerSide: 'shu' as const, state, phase: 'battle' as const, facings: {} };
    expect(deserializeSiegeSave(serializeSiegeSave(save))).toEqual(save);
    for (const value of [undefined, -1, 1.5, T.days + 1, '2']) {
      const invalid = structuredClone(save);
      Reflect.set(invalid.state.stats, 'wallNights', value);
      expect(() => deserializeSiegeSave(JSON.stringify(invalid))).toThrow();
    }
  });

  it('saves each quarter-point infantry fill and rejects unsupported fractions', () => {
    const { state, shu } = duel();
    const next = act(state, { type: 'fillTrench', unitId: shu.id, x: 20, y: 18 });
    expect(next.trenchFill['20,18']).toBe(T.infantryFill);
    const save = { playerSide: 'shu' as const, state: next, phase: 'battle' as const, facings: {} };
    expect(deserializeSiegeSave(serializeSiegeSave(save))).toEqual(save);
    Reflect.set(next.trenchFill, '20,18', 0.1);
    expect(() => deserializeSiegeSave(JSON.stringify(save))).toThrow();
  });

  it('preserves the approved scoring scale ratios', () => {
    expect(T.score.shuCasualtyScale / T.score.costlyVictoryLosses).toBeCloseTo(6000 / 5000);
    expect(T.score.orderlyWithdrawalLosses / T.score.costlyVictoryLosses).toBeCloseTo(4000 / 5000);
  });
});
