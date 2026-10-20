import { describe, expect, it, vi } from 'vitest';
import { createGame, dispatch, validateState } from '../src/game/campaign';
import * as reports from '../src/game/reports';
import type { GameState, MonthlyReportEvent } from '../src/game/types';
import { decodeSave, encodeSave } from '../src/platform/saves';
import queuedLegacy from './fixtures/legacy-queued-battle.json';
import planningLegacy from './fixtures/legacy-multi-battle-planning.json';

function advance(state: GameState, type: 'endMonth' | 'battleAuto' | 'battleRetreat'): GameState {
  const result = dispatch(state, { type });
  expect(result.error).toBeUndefined();
  return result.state;
}

function finish(state: GameState): GameState {
  for (let guard = 0; state.phase === 'battle'; guard++) {
    if (guard >= 60) throw new Error('Unbounded battle queue');
    state = advance(state, 'battleAuto');
    expect(validateState(state)).toBeNull();
  }
  return state;
}

describe('structured monthly report lifecycle', () => {
  it('labels an immediate capture only after the destination changes owner', () => {
    let state = createGame('cao');
    const target = state.cities.find((city) => city.id === 'xiapi')!;
    target.factionId = null;
    target.governorId = null;
    target.reserve = 0;
    state.officers
      .filter((officer) => officer.cityId === target.id)
      .forEach((officer) => {
        officer.factionId = null;
        officer.troops = 0;
        officer.captive = false;
      });
    const marched = dispatch(state, {
      type: 'march',
      sourceId: 'puyang',
      targetId: 'xiapi',
      officerIds: ['xiahouyuan'],
    });
    expect(marched.ok).toBe(true);
    state = finish(advance(marched.state, 'endMonth'));
    expect(state.cities.find((city) => city.id === target.id)!.factionId).toBe('cao');
    expect(state.reports.latest!.events).toContainEqual(
      expect.objectContaining({
        kind: 'battle',
        targetId: 'xiapi',
        attackerId: 'cao',
        defenderId: null,
        outcome: 'captured',
        days: 1,
      }),
    );
  });
  it('records both held cities and captures exactly once across a two-battle reload', () => {
    let state = decodeSave(JSON.stringify(planningLegacy));
    state = advance(state, 'endMonth');
    expect(state.reports.pending).toMatchObject({ turn: state.turn, partial: false });
    const uninterrupted = finish(state);
    state = advance(state, 'battleRetreat');
    expect(state.phase).toBe('battle');
    expect(state.reports.pending!.events.filter((event) => event.kind === 'battle')).toHaveLength(
      1,
    );
    const resumed = finish(decodeSave(encodeSave(state)));
    const equivalent = finish(state);
    expect(resumed).toEqual(equivalent);
    expect(resumed.reports.pending).toBeNull();
    expect(resumed.reports.latest).toMatchObject({
      turn: planningLegacy.state.turn,
      year: planningLegacy.state.year,
      month: planningLegacy.state.month,
      partial: false,
    });
    const battles = resumed.reports.latest!.events.filter((event) => event.kind === 'battle');
    expect(battles).toHaveLength(2);
    expect(battles[0]!.outcome).toBe('held');
    expect(new Set(battles.map((event) => event.orderId)).size).toBe(2);
    expect(
      uninterrupted.reports.latest!.events.filter((event) => event.kind === 'battle'),
    ).toHaveLength(2);
    expect(decodeSave(encodeSave(resumed))).toEqual(resumed);
  });

  it('does not reconstruct missing history from a legacy midbattle save', () => {
    const state = decodeSave(JSON.stringify(queuedLegacy));
    expect(state.reports).toEqual({ pending: null, latest: null });
    const beforeTurn = state.turn;
    const next = finish(state);
    expect(next.turn).toBe(beforeTurn + 1);
    expect(next.reports.latest).toMatchObject({ turn: beforeTurn, partial: true });
    expect(next.reports.latest!.events.filter((event) => event.kind === 'battle')).toHaveLength(2);
  });

  it('attaches alliance expiry to the month being resolved, including December', () => {
    const state = createGame('cao');
    state.turn = 11;
    state.month = 12;
    state.alliances = [{ a: 'cao', b: 'dong', untilTurn: 12 }];
    const next = finish(advance(state, 'endMonth'));
    expect(next.reports.latest).toMatchObject({ turn: 11, year: 190, month: 12 });
    expect(next.reports.latest!.events).toContainEqual(
      expect.objectContaining({
        kind: 'allianceExpired',
        a: 'cao',
        b: 'dong',
        involvesPlayer: true,
      }),
    );
    expect(next.year).toBe(191);
  });

  it('records successful border recruitment using the actual gain and aggregates by city/faction', () => {
    const state = createGame('cao');
    state.officers.forEach((officer) => (officer.busy = true));
    const officer = state.officers.find((item) => item.id === 'liru')!;
    officer.busy = false;
    officer.troops = 0;
    officer.loyalty = 100;
    const city = state.cities.find((item) => item.id === 'luoyang')!;
    city.reserve = 600;
    city.loyalty = 100;
    city.food = 100000;
    city.gold = 1000;
    // Keep the rival adviser free to recruit: no dissent target at the border, and the city
    // is not in the recently-plundered state that would also stop it from being stripped.
    state.cities.find((item) => item.id === 'chenliu')!.loyalty = 40;
    city.plunderCooldownUntil = 3;
    const next = finish(advance(state, 'endMonth'));
    expect(next.reports.latest!.events).toContainEqual(
      expect.objectContaining({
        kind: 'borderRecruitment',
        factionId: 'dong',
        cityId: 'luoyang',
        troops: 450,
      }),
    );
    reports.beginMonthlyReport(state);
    reports.recordMonthlyEvent(state, {
      kind: 'borderRecruitment',
      factionId: 'dong',
      cityId: 'luoyang',
      troops: 100,
    });
    reports.recordMonthlyEvent(state, {
      kind: 'borderRecruitment',
      factionId: 'dong',
      cityId: 'luoyang',
      troops: 200,
    });
    expect(state.reports.pending!.events).toHaveLength(1);
    expect(state.reports.pending!.events[0]).toMatchObject({ troops: 300 });
  });

  it('publishes a calm empty report and finalizes terminal campaigns without an extra month', () => {
    const state = createGame('cao');
    state.cities.forEach((city) => {
      city.factionId = 'cao';
      city.governorId = null;
    });
    state.officers.forEach((officer) => {
      if (officer.factionId) officer.factionId = 'cao';
    });
    const next = advance(state, 'endMonth');
    expect(next).toMatchObject({ phase: 'finished', turn: 1 });
    expect(next.reports.latest).toMatchObject({ turn: 0, events: [], omitted: 0 });
    expect(reports.reportHighlights(next.reports.latest!)).toEqual([]);
    expect(validateState(next)).toBeNull();
  });

  it('records no battle result for a march that stands down', () => {
    const state = decodeSave(JSON.stringify(planningLegacy));
    const order = state.orders[0]!;
    const target = state.cities.find((city) => city.id === order.targetId)!;
    target.factionId = order.factionId;
    target.governorId = null;
    state.officers
      .filter((officer) => officer.cityId === target.id && officer.factionId !== order.factionId)
      .forEach((officer) => {
        officer.factionId = null;
        officer.troops = 0;
        officer.captive = false;
      });
    const next = finish(advance(state, 'endMonth'));
    expect(
      next.reports.latest!.events.some(
        (event) => event.kind === 'battle' && event.orderId === order.id,
      ),
    ).toBe(false);
  });

  it('report observations change neither gameplay fields nor RNG/counters', () => {
    const start = decodeSave(JSON.stringify(planningLegacy));
    const observed = finish(advance(start, 'endMonth'));
    const spy = vi.spyOn(reports, 'recordMonthlyEvent').mockImplementation(() => {});
    let unobserved: GameState;
    try {
      unobserved = finish(advance(start, 'endMonth'));
    } finally {
      spy.mockRestore();
    }
    const strip = ({ reports: _reports, ...gameplay }: GameState) => gameplay;
    expect(strip(unobserved!)).toEqual(strip(observed));
  });
});

describe('bounded report ordering and import integrity', () => {
  it('rejects a report claiming that the active or future queued battle already resolved', () => {
    const state = advance(decodeSave(JSON.stringify(planningLegacy)), 'endMonth');
    for (const order of state.resolution!.queue) {
      const malformed = structuredClone(state);
      reports.recordMonthlyEvent(malformed, {
        kind: 'battle',
        orderId: order.id,
        sourceId: order.sourceId,
        targetId: order.targetId,
        attackerId: order.factionId,
        defenderId: malformed.cities.find((city) => city.id === order.targetId)!.factionId,
        outcome: 'held',
        days: 1,
        involvesPlayer: true,
        bordersPlayer: false,
      });
      expect(() => decodeSave(encodeSave(malformed))).toThrow();
    }
  });
  it('prioritizes player battles, border captures, player expiry, captures, then recruitment', () => {
    const state = createGame('cao');
    reports.beginMonthlyReport(state);
    const battle = {
      kind: 'battle',
      sourceId: 'luoyang',
      targetId: 'chenliu',
      attackerId: 'dong',
      defenderId: 'yuan',
      outcome: 'captured',
      days: 1,
      involvesPlayer: false,
      bordersPlayer: false,
    } as const;
    reports.recordMonthlyEvent(state, {
      kind: 'borderRecruitment',
      cityId: 'luoyang',
      factionId: 'dong',
      troops: 100,
    });
    reports.recordMonthlyEvent(state, { ...battle, orderId: 'army-1' });
    reports.recordMonthlyEvent(state, {
      kind: 'allianceExpired',
      a: 'cao',
      b: 'dong',
      involvesPlayer: true,
    });
    reports.recordMonthlyEvent(state, { ...battle, orderId: 'army-2', bordersPlayer: true });
    reports.recordMonthlyEvent(state, {
      ...battle,
      orderId: 'army-3',
      defenderId: 'cao',
      involvesPlayer: true,
      outcome: 'held',
    });
    reports.recordMonthlyEvent(state, { ...battle, orderId: 'army-4', outcome: 'held' });
    expect(reports.reportHighlights(state.reports.pending!).map((event) => event.key)).toEqual([
      'battle:army-3',
      'battle:army-2',
      'alliance:cao:dong',
      'battle:army-1',
      'recruit:dong:luoyang',
    ]);
    expect(state.reports.pending!.events).toHaveLength(6);
  });
  it('keeps high priority events and stable ties while reporting truncation truthfully', () => {
    const state = createGame('cao');
    reports.beginMonthlyReport(state);
    for (let index = 0; index < 130; index++)
      reports.recordMonthlyEvent(state, {
        kind: 'battle',
        orderId: `army-${index + 1}`,
        sourceId: 'luoyang',
        targetId: 'chenliu',
        attackerId: 'dong',
        defenderId: 'cao',
        outcome: 'held',
        days: 1,
        involvesPlayer: index >= 127,
        bordersPlayer: false,
      });
    const report = state.reports.pending!;
    expect(report.events).toHaveLength(128);
    expect(report.omitted).toBe(2);
    expect(reports.reportHighlights(report).map((event) => event.key)).toEqual([
      'battle:army-128',
      'battle:army-129',
      'battle:army-130',
    ]);
    const last = report.events.at(-1)!;
    reports.recordMonthlyEvent(state, last);
    expect(report.events).toHaveLength(128);
    expect(report.omitted).toBe(2);
    expect(reports.reportEventCity(last)).toBe('chenliu');
    const alliance = {
      kind: 'allianceExpired',
      key: 'alliance:cao:dong',
      sequence: 0,
      a: 'cao',
      b: 'dong',
      involvesPlayer: true,
    } as const;
    expect(reports.reportEventCity(alliance)).toBeNull();
  });

  it('rejects malformed enums, references, amounts, duplicates, dates, and oversized collections', () => {
    const valid = finish(advance(decodeSave(JSON.stringify(planningLegacy)), 'endMonth'));
    expect(valid.reports.latest!.events.length).toBeGreaterThan(0);
    const mutations: ((state: GameState) => void)[] = [
      (state) => {
        state.reports.latest!.month = 13;
      },
      (state) => {
        state.reports.latest!.turn++;
      },
      (state) => {
        state.reports.latest!.omitted++;
      },
      (state) => {
        state.reports.latest!.seenKeys.push(state.reports.latest!.seenKeys[0]!);
      },
      (state) => {
        (state.reports.latest!.events[0] as any).kind = 'fiction';
      },
      (state) => {
        (state.reports.latest!.events[0] as any).targetId = 'missing';
      },
      (state) => {
        (state.reports.latest!.events[0] as any).days = 31;
      },
      (state) => {
        state.reports.latest!.events.push(
          ...Array.from({ length: 129 }, () => state.reports.latest!.events[0]!),
        );
      },
      (state) => {
        const event = state.reports.latest!.events[0] as Extract<
          MonthlyReportEvent,
          { kind: 'battle' }
        >;
        event.involvesPlayer = !event.involvesPlayer;
      },
    ];
    for (const mutate of mutations) {
      const state = structuredClone(valid);
      mutate(state);
      expect(() => decodeSave(encodeSave(state))).toThrow();
    }
    expect(decodeSave(encodeSave(valid))).toEqual(valid);
  });
});
