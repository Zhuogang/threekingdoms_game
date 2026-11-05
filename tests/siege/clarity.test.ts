import { describe, expect, it } from 'vitest';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { predictSiegeAttack, predictSiegeClimb } from '../../src/siege/rules/combat';
import { placeName } from '../../src/siege/ui/places';
import { morningReport } from '../../src/siege/ui/report';
import { fireRangeCells } from '../../src/siege/ui/fireRange';
import { actorCommandKinds, siegeCommands, actionContext } from '../../src/siege/ui/commands';
import { forecastTableData } from '../../src/siege/ui/forecastData';
import {
  enqueueCards,
  visibleCard,
  noticeCorner,
  type QueuedCard,
} from '../../src/siege/ui/cardQueue';
import { walkthroughTargets, startWalkthrough } from '../../src/siege/ui/walkthrough';
import { counterCards } from '../../src/siege/ui/counters';
import { cellKey } from '../../src/siege/content/chencang';

const event = (code: string, cell: string, day = 1) => ({ code, day, params: { cell } });

describe('M2 place names and coherent morning stories', () => {
  it.each([
    ['8,7', '南门门楼', 'South gatehouse'],
    ['6,7', '南墙西段', 'South wall, west run'],
    ['10,7', '南墙东段', 'South wall, east run'],
    ['6,10', '南墙西段', 'South wall, west run'],
    ['8,2', '北门门楼', 'North gatehouse'],
    ['6,2', '北墙西段', 'North wall, west run'],
    ['10,2', '北墙东段', 'North wall, east run'],
    ['4,4', '西墙北段', 'West wall, north run'],
    ['4,6', '西墙南段', 'West wall, south run'],
    ['12,4', '东墙北段', 'East wall, north run'],
    ['12,6', '东墙南段', 'East wall, south run'],
    ['12,5', '东门门楼', 'East gatehouse'],
  ])('names %s by its run in both languages', (cell, zh, en) => {
    expect(placeName(cell, 'zh')).toBe(zh);
    expect(placeName(cell, 'en')).toBe(en);
  });
  it('merges fire and snow, orders live threats before changes and good news, and retains map positions', () => {
    const state = createSiegeState(228);
    state.day = 2;
    state.preparations.millstones['8,7'] = { day: 1, hoisted: true };
    state.log = [
      event('brazierPrepared', '10,7'),
      event('brazierDoused', '10,7', 2),
      event('engineLost', '6,10'),
      event('millstonePrepared', '8,7'),
    ];
    const before = structuredClone(state);
    for (const locale of ['en', 'zh'] as const) {
      const items = morningReport(state.log, state.preparations, state.day, locale);
      expect(items.map((i) => i.priority)).toEqual([0, 1, 2]);
      expect(items.map((i) => i.code)).toEqual([
        'millstonePrepared',
        'engineLost',
        'brazierDoused',
      ]);
      expect(items[2]!.text).toContain(locale === 'zh' ? '火盆熄灭' : 'snow extinguished');
      expect(items[2]!.counter).toContain(locale === 'zh' ? '推进' : 'advance');
      expect(items[2]!.text).not.toContain('10,7');
      expect(items[2]!.place).toEqual({ x: 10, y: 7, level: 'wall' });
    }
    expect(counterCards(state, [], 'en').map((c) => c.kind)).not.toContain('fire');
    expect(state).toEqual(before);
  });
  it('does not announce a fire threat when every nearby archer is suppressed', () => {
    const state = createSiegeState(228);
    state.day = 2;
    state.preparations.braziers['6,7'] = { litDay: 1 };
    state.units
      .filter((u) => u.side === 'wei')
      .forEach((u) => {
        u.suppressedDay = state.day;
      });
    const items = morningReport(
      [event('brazierPrepared', '6,7')],
      state.preparations,
      2,
      'en',
      [],
      state,
    );
    expect(items[0]!.priority).toBe(3);
    expect(items[0]!.text).toContain('no defender can use it today');
    expect(fireRangeCells(state)).toEqual([]);
  });
  it('does not describe consumed preparations as live threats or repeat surviving preparations', () => {
    const state = createSiegeState(1);
    state.preparations.braziers['6,7'] = { litDay: 1 };
    state.preparations.millstones['8,7'] = { day: 1, hoisted: false };
    const items = morningReport(
      [event('brazierPrepared', '6,7'), event('millstonePrepared', '8,7')],
      state.preparations,
      2,
      'en',
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.priority).toBe(0);
    expect(items[0]!.code).toBe('brazierPrepared');
  });
});

describe('fire range means a ladder can burn today', () => {
  function fixture() {
    const state = createSiegeState(1);
    state.day = 2;
    state.units
      .filter((u) => u.side === 'wei' && u.troopType === 'archer')
      .forEach((u) => {
        u.acted = true;
      });
    const archer = state.units.find((u) => u.side === 'wei' && u.troopType === 'archer')!;
    Object.assign(archer, { x: 6, y: 7, acted: false });
    return { state, archer };
  }
  it('draws nothing with no brazier or with a brazier prepared today', () => {
    const { state } = fixture();
    expect(fireRangeCells(state)).toEqual([]);
    state.preparations.braziers['6,7'] = { litDay: state.day };
    expect(fireRangeCells(state)).toEqual([]);
  });
  it('draws exactly the reachable ground cells around one ready archer, and excludes distant archers', () => {
    const { state, archer } = fixture();
    state.preparations.braziers['6,7'] = { litDay: 1 };
    const expected = [
      '5,5',
      '6,5',
      '7,5',
      '5,6',
      '7,6',
      '8,6',
      '3,7',
      '4,8',
      '5,8',
      '6,8',
      '7,8',
      '8,8',
      '5,9',
      '6,9',
      '7,9',
      '6,10',
    ];
    expect(fireRangeCells(state).map(cellKey)).toEqual(expected);
    archer.suppressedDay = state.day;
    expect(fireRangeCells(state)).toEqual([]);
    delete archer.suppressedDay;
    archer.acted = true;
    expect(fireRangeCells(state)).toEqual([]);
  });
  it('allows a ready brazier next to the archer, but no further away', () => {
    const { state } = fixture();
    state.preparations.braziers['6,7'] = { litDay: 1 };
    expect(fireRangeCells(state)).toHaveLength(16);
    delete state.preparations.braziers['6,7'];
    state.preparations.braziers['8,7'] = { litDay: 1 };
    expect(fireRangeCells(state)).toHaveLength(0);
  });
});

describe('actor actions and forecast comparison', () => {
  it('filters impossible unit actions and orders enabled actions first for either player side', () => {
    const state = createSiegeState(228);
    const infantry = actorCommandKinds(state, 'shu-weiyan', 'shu');
    for (const kind of ['suppress', 'raiseLadder', 'ram', 'buildWall'])
      expect(infantry).not.toContain(kind);
    const archer = actorCommandKinds(state, 'shu-captain-3', 'shu');
    for (const kind of ['coverEngine', 'climb', 'fillTrench', 'pileEarth'])
      expect(archer).not.toContain(kind);
    expect(actorCommandKinds(state, 'wei-haozhao', 'shu')).toEqual([]);
    expect(actorCommandKinds(state, 'wei-haozhao', 'wei')).not.toContain('buildWall');
    state.act = 2;
    expect(actorCommandKinds(state, 'wei-haozhao', 'wei')).toContain('buildWall');
    const commands = siegeCommands(state, 'shu-weiyan');
    const split = commands.findIndex((c) => c.reason);
    expect(commands.slice(0, split).every((c) => !c.reason)).toBe(true);
    expect(commands.slice(split).every((c) => c.reason)).toBe(true);
  });
  it.each(['ladder', 'ram', 'earthCart', 'tower'] as const)(
    '%s gets only its own actions',
    (kind) => {
      const state = createSiegeState(228);
      const engine = state.engines[0]!;
      engine.kind = kind;
      const kinds = actorCommandKinds(state, engine.id, 'shu');
      const own = {
        ladder: ['raiseLadder'],
        ram: ['ram'],
        earthCart: ['fillTrench', 'pileEarth'],
        tower: ['attack', 'suppress'],
      }[kind];
      expect(new Set(kinds)).toEqual(new Set(['move', ...own, 'standby']));
      expect(actorCommandKinds(state, engine.id, 'wei')).toEqual([]);
    },
  );
  it('compares true before/after footholds, own losses and morale for an attack and an empty-cell climb', () => {
    const state = createSiegeState(228);
    state.units[12]!.x = 5;
    state.engines[0]!.raisedAt = { x: 6, y: 7 };
    Object.assign(state.units[1]!, { x: 6, y: 10 });
    state.footholds['6,7'] = 2;
    const normal = predictSiegeClimb(state, 'shu-weiyan')!,
      assault = predictSiegeClimb(state, 'shu-weiyan', { assault: true })!;
    const data = forecastTableData(normal, assault, state.footholds['6,7']!);
    expect(data[1]).toMatchObject({
      enemyCasualties: 0,
      ownCasualties: assault.casualties,
      footholdBefore: 2,
      footholdAfter: T.footholdComplete,
      wouldMount: true,
      moraleAfter: assault.sourceMoraleAfter,
    });
    expect(actionContext(state, 'shu-weiyan', 'en')).toContain(`+${T.climbFoothold}`);
    Object.assign(state.units[12]!, { x: 6, y: 7 });
    const attack = predictSiegeAttack(state, 'shu-weiyan', state.units[12]!.id)!,
      forced = predictSiegeAttack(state, 'shu-weiyan', state.units[12]!.id, { assault: true })!;
    expect(forecastTableData(attack, forced, 2)[1]).toMatchObject({
      enemyCasualties: forced.casualties,
      ownCasualties: forced.counterattack.casualties,
      footholdBefore: 2,
      footholdAfter: forced.footholdAfter,
      moraleAfter: forced.sourceMoraleAfter,
    });
    expect(actionContext(state, 'shu-weiyan', 'zh')).toContain('头上有守军');
  });
});

describe('one notice at a time and map guidance', () => {
  it('deduplicates, queues without interruption, blocks during report/replay, and defers hints during walkthrough', () => {
    const hint: QueuedCard = { id: 'hint-wall', type: 'hint' },
      counter: QueuedCard = { id: 'counter-fire', type: 'counter' };
    const queue = enqueueCards([hint], [hint, counter], []);
    expect(queue).toEqual([hint, counter]);
    const clear = { report: false, replay: false, modal: false, walkthrough: false };
    expect(visibleCard(queue, clear)).toBe(hint);
    expect(visibleCard(queue, { ...clear, report: true })).toBeNull();
    expect(visibleCard(queue, { ...clear, replay: true })).toBeNull();
    expect(visibleCard(queue, { ...clear, modal: true })).toBeNull();
    expect(visibleCard(queue, { ...clear, walkthrough: true })).toBe(counter);
    expect(visibleCard([hint], { ...clear, walkthrough: true })).toBeNull();
    expect(enqueueCards(queue, [hint], [hint.id])).toEqual([counter]);
  });
  it('places cards in a corner that does not overlap the selected actor', () => {
    expect(noticeCorner(880, 550, 380, 200, [20, 20, 80, 90])).toEqual({ left: 488, top: 12 });
    expect(noticeCorner(880, 550, 380, 200, [500, 350, 600, 450])).toEqual({ left: 12, top: 12 });
  });
  it('points step one at both ladders, step three at the base, step four at the top, and step six at defenders', () => {
    const state = createSiegeState(228),
      progress = startWalkthrough(state);
    expect(walkthroughTargets(progress, state, 'shu')).toHaveLength(2);
    progress.ladderId = state.engines[0]!.id;
    state.units[12]!.x = 5;
    state.engines[0]!.raisedAt = { x: 6, y: 7 };
    expect(walkthroughTargets({ ...progress, step: 3 }, state, 'shu')).toEqual([
      { x: 6, y: 10, level: 'ground' },
    ]);
    expect(walkthroughTargets({ ...progress, step: 4 }, state, 'shu')).toEqual([
      { x: 6, y: 7, level: 'wall' },
    ]);
    expect(
      walkthroughTargets({ ...progress, step: 6 }, state, 'shu').every(
        (c) => c.y === 7 && c.level === 'wall',
      ),
    ).toBe(true);
  });
});
