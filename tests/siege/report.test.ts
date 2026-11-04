import { describe, expect, it } from 'vitest';
import { morningReport, REPORT_CODES, reportObservations } from '../../src/siege/ui/report';
import { placeName } from '../../src/siege/ui/places';
import { createSiegeState } from '../../src/siege/rules/state';
import { siegeText, type SiegeTextKey } from '../../src/siege/i18n';
import { selectCounterCard, engineLossAnswers, COUNTER_KINDS } from '../../src/siege/ui/counters';
import { serializeSiegeSave, deserializeSiegeSave } from '../../src/siege/save';
import type { SiegeLogEntry } from '../../src/siege/rules/types';

const keys: Record<(typeof REPORT_CODES)[number], [SiegeTextKey, SiegeTextKey]> = {
  brazierPrepared: ['reportBrazier', 'counterFire'],
  millstonePrepared: ['reportMillstone', 'counterMillstone'],
  bouldersPrepared: ['reportBoulders', 'counterBoulders'],
  torches: ['reportTorchesIdle', 'counterTorches'],
  nightAssault: ['reportNightAdvanced', 'counterTorches'],
  sortieHit: ['reportSortieHit', 'counterSortie'],
  sortieRepelled: ['reportSortieUnavailable', 'counterSortie'],
  nightRepair: ['reportRepair', 'counterRepair'],
  holdFastOrdered: ['reportHold', 'counterHold'],
  brazierDoused: ['reportSnow', 'counterSnow'],
  fireArrowHit: ['reportFireHit', 'counterFire'],
  engineBurning: ['reportBurn', 'counterFire'],
  engineLost: ['reportEngineLost', 'wayBuild'],
  millstoneHit: ['reportMillHit', 'counterMillstone'],
  bouldersHit: ['reportBoulderHit', 'counterBoulders'],
  innerWallCompleted: ['reportWall', 'counterWall'],
  thrownOffWall: ['reportThrown', 'counterThrown'],
  footholdChanged: ['reportBreachSealed', 'counterThrown'],
};
const entry = (code: string, params: SiegeLogEntry['params'] = {}): SiegeLogEntry => ({
  day: 1,
  code,
  params,
});
describe('pure morning report', () => {
  it.each(['zh', 'en'] as const)(
    'reports only sealed foothold changes for both sides in %s, with place names and Shu threat priority',
    (locale) => {
      const state = createSiegeState(228);
      const sealed = entry('footholdChanged', {
        cell: '18,16',
        reason: 'sealed',
        before: 3,
        after: 0,
        sourceId: 'wei-wangsheng',
      });
      const log = [
        entry('footholdChanged', { cell: '20,16', reason: 'climb', before: 0, after: 1 }),
        entry('footholdChanged', {
          cell: '21,16',
          reason: 'nightPositionEmpty',
          before: 2,
          after: 0,
        }),
        entry('engineLost', { engineId: 'starting-ladder-1' }),
        sealed,
      ];
      for (const side of ['shu', 'wei'] as const) {
        const items = morningReport(log, state.preparations, 2, locale, [], undefined, side);
        const item = items.find((i) => i.code === 'footholdChanged')!;
        const cell = placeName('18,16', locale);
        expect(item.text).toBe(
          locale === 'zh'
            ? `魏军站回${cell}，缺口被封住。`
            : `Wei retook ${cell} and sealed the breach.`,
        );
        expect(item.text).not.toMatch(/\d/);
        expect(item.place).toEqual({ x: 18, y: 16, level: 'wall' });
        expect(items.filter((i) => i.code === 'footholdChanged')).toHaveLength(1);
        if (side === 'shu') {
          expect(item.priority).toBe(0);
          expect(items[0]).toBe(item);
        }
      }
      const weiToday = morningReport(
        [{ ...sealed, day: 2 }],
        state.preparations,
        2,
        locale,
        [],
        undefined,
        'wei',
      );
      expect(weiToday).toHaveLength(1);
      const before = structuredClone(state);
      morningReport(log, state.preparations, 2, locale);
      expect(state).toEqual(before);
    },
  );

  for (const code of REPORT_CODES)
    for (const locale of ['zh', 'en'] as const)
      it(`${code}: ${locale} cause and counter`, () => {
        const state = createSiegeState(228);
        const params = {
          cell: '18,16',
          engineId: 'starting-ladder-1',
          targetId: 'shu-weiyan',
          unitId: 'shu-weiyan',
          gateId: 'south',
          before: 90,
          after: 30,
          reason: 'sealed',
          damage: 60,
          casualties: 12,
          effectiveDay: 2,
          start: '17,16',
          end: '22,16',
          segment: 1,
          from: '18,16',
          to: '18,19',
        };
        if (code === 'brazierPrepared') state.preparations.braziers[params.cell] = { litDay: 1 };
        if (code === 'millstonePrepared')
          state.preparations.millstones[params.cell] = { day: 1, hoisted: true };
        if (code === 'bouldersPrepared') state.preparations.boulders[params.cell] = { day: 1 };
        const log = [entry(code, params)];
        const before = structuredClone(log);
        const items = morningReport(log, state.preparations, 2, locale);
        const expected = siegeText(locale, keys[code][0], {
          ...params,
          cell: placeName(params.cell, locale),
          from: placeName(params.from, locale),
          to: placeName(params.to, locale),
          engine: siegeText(locale, 'ladder'),
          unit: locale === 'zh' ? '魏延' : 'Wei Yan',
          gate: siegeText(locale, 'south'),
          loss: 0,
        });
        expect(items).toHaveLength(1);
        expect(items[0]!.text).toBe(expected);
        expect(items[0]!.counter).toBe(siegeText(locale, keys[code][1]));
        expect(items[0]!.icon).toBeTruthy();
        expect(log).toEqual(before);
      });
  it('explains night collisions in order, guards and unavailable raids, and observed foothold loss', () => {
    const p = createSiegeState(1).preparations;
    const log = [
      entry('fireArrowHit', { engineId: 'ram', before: 100, after: 90 }),
      entry('nightAssault', { result: 'stopped' }),
      entry('torches', { assault: true }),
      entry('fireArrowHit', { engineId: 'ladder', before: 90, after: 20 }),
      entry('sortieRepelled', { reason: 'guard', engineId: 'ram' }),
      entry('sortieRepelled', { reason: 'nightAssault', engineId: 'ram' }),
      entry('footholdChanged', { cell: '18,16', reason: 'boulders', before: 1, after: 0 }),
      entry('bouldersHit', { cell: '18,16', casualties: 10, targetId: 'shu-weiyan' }),
    ];
    const items = morningReport(log, p, 2, 'en');
    expect(items.find((i) => i.code === 'fireArrowHit')!.text).toMatch(/^Wei fire arrows/);
    expect(items.some((i) => i.code === 'nightAssault')).toBe(false);
    expect(items.find((i) => i.code === 'torches')!.text).toContain('failed');
    expect(items.filter((i) => i.code === 'fireArrowHit')[1]!.text).toContain('met Wei torches');
    expect(items.some((i) => i.text.includes('Guards repelled'))).toBe(true);
    expect(items.some((i) => i.text.includes('Your night assault defeated'))).toBe(true);
    expect(items.find((i) => i.code === 'bouldersHit')!.text).toContain('1 foothold lost');
    expect(items.map((i) => i.priority)).toEqual([...items.map((i) => i.priority)].sort());
  });
  it('lists surviving preparations once, ignores consumed/new preparations, stale events and hidden orders', () => {
    const state = createSiegeState(1);
    state.preparations.braziers['18,16'] = { litDay: 1 };
    state.preparations.millstones['23,16'] = { day: 1, hoisted: false };
    state.preparations.boulders['20,16'] = { day: 2 };
    const log = [
      entry('brazierPrepared', { cell: '18,16' }),
      entry('order', { side: 'wei' }),
      { day: 0, code: 'engineLost', params: {} },
    ];
    expect(morningReport(log, state.preparations, 2, 'en').map((i) => i.code)).toEqual([
      'brazierPrepared',
    ]);
    expect(morningReport([], state.preparations, 2, 'en')).toHaveLength(1);
    expect(morningReport([], createSiegeState(1).preparations, 1, 'en')).toEqual([]);
  });
  it('observes completed inner walls from before/after snapshots without mutating the rules', () => {
    const before = createSiegeState(1),
      after = structuredClone(before);
    before.innerWall[0] = 3;
    after.innerWall[0] = 4;
    after.innerWall[1] = 3;
    const originals = structuredClone([before, after]);
    const observations = reportObservations(before, after);
    expect(observations).toEqual([entry('innerWallCompleted', { segment: 1 })]);
    expect(morningReport([], after.preparations, 2, 'en', observations)[0]!.text).toContain(
      'segment 1',
    );
    expect([before, after]).toEqual(originals);
  });
});
describe('counter cards', () => {
  for (const [kind, code] of [
    ['fire', 'brazierPrepared'],
    ['millstone', 'millstoneHit'],
    ['boulders', 'bouldersHit'],
    ['sortie', 'sortieHit'],
    ['torches', 'torches'],
    ['snow', 'brazierDoused'],
    ['engineLoss', 'engineLost'],
  ] as const)
    it(`selects ${kind} once and persists dismissal`, () => {
      const state = createSiegeState(1);
      state.log = [entry(code)];
      expect(selectCounterCard(state, [], 'zh')?.kind).toBe(kind);
      expect(selectCounterCard(state, [kind, 'nightEvent'], 'en')).toBeNull();
      expect(selectCounterCard(state, ['nightEvent'], 'en', 'wei')).toBeNull();
      const save = {
        state,
        playerSide: 'shu' as const,
        phase: 'battle' as const,
        facings: {},
        presentation: {
          openingStep: 6,
          bannersSeen: [],
          dismissedHints: [],
          dismissedCounters: [kind],
        },
      };
      expect(deserializeSiegeSave(serializeSiegeSave(save))).toEqual(save);
    });
  it('prioritizes burning/loss and provides at least three actual routes without phantom ladders', () => {
    const state = createSiegeState(228);
    state.log = [entry('brazierPrepared'), entry('engineBurning')];
    expect(selectCounterCard(state, [], 'en')!.kind).toBe('engineLoss');
    expect(engineLossAnswers(state)).toContain('wayLadder');
    state.engines.forEach((e) => (e.wrecked = true));
    const lines = engineLossAnswers(state);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines).not.toContain('wayLadder');
    expect(lines).not.toContain('wayRam');
    expect(lines).toContain('wayBuild');
    expect(lines).toContain('wayMound');
    state.units.filter((u) => u.troopType === 'infantry').forEach((u) => (u.routed = true));
    expect(engineLossAnswers(state)).not.toContain('wayMound');
    expect(selectCounterCard(state, COUNTER_KINDS, 'en')).toBeNull();
  });
});
