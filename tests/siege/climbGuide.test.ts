import { describe, expect, it } from 'vitest';
import {
  COURTYARD,
  DEPLOY_SHU,
  DEPLOY_WEI,
  SHU_ROSTER,
  sameCell,
} from '../../src/siege/content/chencang';
import { SIEGE_COPY, siegeText } from '../../src/siege/i18n';
import { createSiegeState } from '../../src/siege/rules/state';
import { cellTerrain } from '../../src/siege/rules/map';
import { reachableCells } from '../../src/siege/rules/movement';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import type { SiegeUnit } from '../../src/siege/rules/types';
import { actionContext, deployUnit, siegeCommands } from '../../src/siege/ui/commands';
import { nextGoalGuide, nextGoalGuideText } from '../../src/siege/ui/nextGoalGuide';
import { climbGuide, climbGuideText, type ClimbGuide } from '../../src/siege/ui/climbGuide';
import {
  settleWalkthrough,
  startWalkthrough,
  walkthroughNeedsEndDay,
  walkthroughTargets,
} from '../../src/siege/ui/walkthrough';
import { deserializeSiegeSave, serializeSiegeSave } from '../../src/siege/save';
import { act, engine } from './rulesFixtures';

const base = { x: 6, y: 10 };
const top = { x: 6, y: 7 };
function fixture() {
  const state = createSiegeState(228);
  const unit = state.units.find((u) => u.id === 'shu-weiyan')!;
  Object.assign(unit, { x: 4, y: 10 });
  state.units = [unit];
  state.engines = [engine('ladder', base.x, base.y, { id: 'ladder' })];
  return { state, unit, ladder: state.engines[0]! };
}

describe('climb guide rule observations', () => {
  it.each(['ladder', 'wallFoot'] as const)(
    'reports a breach on ready and allyAbove via %s, at the base and on the way',
    (route) => {
      const { state, unit, ladder } = fixture();
      const routeBase = route === 'ladder' ? base : { x: 6, y: 8 };
      if (route === 'ladder') ladder.raisedAt = top;
      else {
        state.engines = [];
        state.trenchFill['6,8'] = T.trenchCapacity;
        state.trenchFill['6,9'] = T.trenchCapacity;
      }
      Object.assign(unit, routeBase);
      state.footholds['6,7'] = T.footholdComplete;
      const before = structuredClone(state);
      expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'ready', breach: true, top });
      expect(state).toEqual(before);
      state.units.push({ ...unit, id: 'ally', ...top, level: 'wall', moved: true });
      for (const atBase of [true, false]) {
        Object.assign(unit, { y: routeBase.y + (atBase ? 0 : 1) });
        const beforeAlly = structuredClone(state);
        expect(climbGuide(state, unit.id)).toMatchObject({
          kind: 'allyAbove',
          breach: true,
          allyId: 'ally',
          route,
          atBase,
        });
        expect(state).toEqual(beforeAlly);
      }
    },
  );

  it('ignores missing, enemy, archer, wall, dead, routed and inactive units', () => {
    const { state, unit } = fixture();
    expect(climbGuide(state, 'missing')).toBeNull();
    for (const changes of [
      { side: 'wei' as const },
      { troopType: 'archer' as const },
      { level: 'wall' as const },
      { troops: 0 },
      { routed: true },
      { morale: 0 },
    ]) {
      state.units = [{ ...unit, ...changes }];
      expect(climbGuide(state, unit.id)).toBeNull();
    }
  });
  it('checks acted before ready, and ready before a defender on another connected top', () => {
    const { state, unit, ladder } = fixture();
    Object.assign(unit, base, { acted: true });
    ladder.raisedAt = top;
    expect(climbGuide(state, unit.id)).toEqual({ kind: 'acted' });
    unit.acted = false;
    state.engines.push(engine('ladder', 7, 10, { id: 'second', raisedAt: { x: 7, y: 7 } }));
    state.units.push({ ...unit, id: 'enemy', side: 'wei', x: 7, y: 7, level: 'wall' });
    expect(climbGuide(state, unit.id)).toEqual({
      kind: 'ready',
      position: 'ladder',
      gain: 1,
      top,
      breach: false,
    });
  });
  it('reports a living defender above a raised ladder, including a routed defender', () => {
    const { state, unit, ladder } = fixture();
    Object.assign(unit, base);
    ladder.raisedAt = top;
    const defender = {
      ...unit,
      id: 'enemy',
      side: 'wei' as const,
      ...top,
      level: 'wall' as const,
      routed: true,
    };
    state.units.push(defender);
    expect(climbGuide(state, unit.id)).toEqual({
      kind: 'defenderAbove',
      defenderId: 'enemy',
      top,
      base,
    });
    defender.troops = 0;
    expect(climbGuide(state, unit.id)?.kind).toBe('ready');
  });
  it('distinguishes arrival at an unraised base, reachable, too far and already moved', () => {
    const { state, unit, ladder } = fixture();
    expect(climbGuide(state, unit.id)).toEqual({
      kind: 'ladderNotRaised',
      ladderId: 'ladder',
      base,
      atBase: false,
      steps: 2,
    });
    Object.assign(unit, base);
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'ladderNotRaised',
      atBase: true,
      steps: 0,
    });
    Object.assign(unit, { x: 4, y: 10 });
    ladder.raisedAt = top;
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      route: 'ladder',
      base,
      steps: 2,
      canReach: true,
      moved: false,
    });
    unit.x = 0;
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      steps: 6,
      canReach: false,
      moved: false,
    });
    Object.assign(unit, { x: 5, y: 10, moved: true });
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      steps: 1,
      canReach: false,
      moved: true,
    });
  });
  it.each(['ladder', 'wallFoot'] as const)(
    'reports an ally above a %s at the base and on the way without changing routes or state',
    (route) => {
      const { state, unit, ladder } = fixture();
      const routeBase = route === 'ladder' ? base : { x: 6, y: 8 };
      if (route === 'ladder') ladder.raisedAt = top;
      else {
        state.engines = [];
        state.trenchFill['6,8'] = T.trenchCapacity;
        state.trenchFill['6,9'] = T.trenchCapacity;
      }
      const ally: SiegeUnit = { ...unit, id: 'ally', ...top, level: 'wall', routed: true };
      state.units.push(ally);
      for (const atBase of [false, true]) {
        Object.assign(unit, { x: routeBase.x, y: routeBase.y + (atBase ? 0 : 1) });
        const before = structuredClone(state);
        expect(climbGuide(state, unit.id)).toEqual({
          kind: 'allyAbove',
          breach: false,
          allyId: ally.id,
          route,
          top,
          base: routeBase,
          atBase,
        });
        expect(state).toEqual(before);
      }
      // Living occupants block the top even when routed; dead or ground allies do not.
      ally.troops = 0;
      expect(climbGuide(state, unit.id)?.kind).toBe('ready');
      ally.troops = unit.troops;
      ally.level = 'ground';
      ally.y = 6; // Ground formations belong inside, not under an ordinary wall cell.
      expect(climbGuide(state, unit.id)?.kind).toBe('ready');
    },
  );
  it('uses raisedAt for the chosen ladder and keeps the nearest route despite an occupied top', () => {
    const { state, unit, ladder } = fixture();
    ladder.raisedAt = { x: 7, y: 7 };
    state.engines.push(engine('ladder', 7, 10, { id: 'far', raisedAt: { x: 7, y: 7 } }));
    Object.assign(unit, { x: 5, y: 10 });
    state.units.push({ ...unit, id: 'ally', ...ladder.raisedAt, level: 'wall' });
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'allyAbove',
      base,
      top: ladder.raisedAt,
      atBase: false,
    });
  });
  it('checks defenders before allies at either kind of base', () => {
    for (const y of [10, 8]) {
      const { state, unit, ladder } = fixture();
      Object.assign(unit, { x: 6, y });
      ladder.x = 6;
      ladder.y = y;
      ladder.raisedAt = { x: 6, y: 7 };
      if (y === 8) state.trenchFill['6,8'] = T.trenchCapacity;
      else state.engines.push(engine('ladder', 7, 10, { id: 'second', raisedAt: top }));
      state.units.push(
        { ...unit, id: 'ally', ...ladder.raisedAt, level: 'wall' },
        { ...unit, id: 'enemy', side: 'wei', ...top, level: 'wall' },
      );
      expect(climbGuide(state, unit.id)).toMatchObject({
        kind: 'defenderAbove',
        defenderId: 'enemy',
      });
    }
  });
  it('checks an unraised ladder before a Shu unit on the wall, at the base and on the way', () => {
    const { state, unit } = fixture();
    state.units.push({ ...unit, id: 'ally', ...top, level: 'wall' });
    for (const y of [10, 11]) {
      unit.x = base.x;
      unit.y = y;
      expect(climbGuide(state, unit.id)).toMatchObject({
        kind: 'ladderNotRaised',
        atBase: y === 10,
      });
    }
  });
  it('never reports walkToBase with zero steps across route and occupant states', () => {
    for (const route of ['ladder', 'wallFoot'] as const)
      for (const occupant of ['none', 'ally', 'enemy', 'dead'] as const)
        for (const atBase of [false, true])
          for (const moved of [false, true]) {
            const { state, unit, ladder } = fixture();
            const routeBase = route === 'ladder' ? base : { x: 6, y: 8 };
            ladder.raisedAt = top;
            if (route === 'wallFoot') {
              state.engines = [];
              state.trenchFill['6,8'] = T.trenchCapacity;
            }
            Object.assign(unit, { ...routeBase, y: routeBase.y + (atBase ? 0 : 1), moved });
            if (occupant !== 'none')
              state.units.push({
                ...unit,
                id: 'occupant',
                side: occupant === 'enemy' ? 'wei' : 'shu',
                ...top,
                level: 'wall',
                troops: occupant === 'dead' ? 0 : unit.troops,
              });
            const guide = climbGuide(state, unit.id)!;
            if (guide.kind === 'walkToBase') expect(guide.steps).toBeGreaterThan(0);
            if (atBase) expect(guide.kind).not.toBe('walkToBase');
          }
  });
  it('uses actual reachability rather than Manhattan distance for blocked routes', () => {
    const { state, unit, ladder } = fixture();
    Object.assign(unit, { x: 5, y: 10 });
    ladder.raisedAt = top;
    for (const [x, y] of [
      [4, 10],
      [5, 9],
      [5, 11],
    ])
      state.engines.push(engine('ram', x!, y!, { id: `${x},${y}` }));
    state.units.push({ ...unit, id: 'ally', ...base });
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      steps: 1,
      canReach: false,
      occupiedBy: 'ally',
    });
  });
  it('chooses distance, then free bases, then ready routes, then lowest x independent of array order', () => {
    const { state, unit } = fixture();
    Object.assign(unit, { x: 8, y: 10 });
    const west = engine('ladder', 6, 10, { id: 'west' });
    const east = engine('ladder', 10, 10, { id: 'east', raisedAt: { x: 10, y: 7 } });
    state.engines = [east, west];
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      base: { x: 10, y: 10 },
    });
    west.raisedAt = top;
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'walkToBase', base });
    const ally = { ...unit, id: 'ally', ...base };
    state.units.push(ally);
    delete east.raisedAt;
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'ladderNotRaised', ladderId: 'east' });
    east.x = 11;
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      base,
      occupiedBy: 'ally',
    });
    ally.troops = 0;
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'walkToBase', occupiedBy: undefined });
  });
  it('finds filled wall feet and mounds, and uses shared geometry for their defenders', () => {
    const { state, unit } = fixture();
    state.engines = [];
    Object.assign(unit, { x: 6, y: 9 });
    state.trenchFill['6,9'] = T.trenchCapacity;
    expect(climbGuide(state, unit.id)).toEqual({ kind: 'noRoute' });
    state.trenchFill['6,8'] = T.trenchCapacity;
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      route: 'wallFoot',
      base: { x: 6, y: 8 },
      steps: 1,
      canReach: true,
    });
    unit.y = 8;
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'ready', position: 'wallFoot' });
    state.mounds['6,8'] = T.moundComplete;
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'ready', position: 'mound' });
    state.units.push({ ...unit, id: 'enemy', side: 'wei', y: 7, level: 'wall' });
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'defenderAbove',
      defenderId: 'enemy',
      base: { x: 6, y: 8 },
      top,
    });
  });
  it('prefers a wall foot over an equally distant unraised ladder', () => {
    const { state, unit } = fixture();
    Object.assign(unit, { x: 6, y: 9 });
    state.trenchFill['6,8'] = T.trenchCapacity;
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      route: 'wallFoot',
      steps: 1,
    });
  });
  it.each([{ wrecked: true }, { durability: 0 }])(
    'does not route through an unusable ladder: %j',
    (changes) => {
      const { state, unit, ladder } = fixture();
      Object.assign(ladder, changes);
      state.engines.push(engine('tower', 6, 10));
      expect(climbGuide(state, unit.id)).toEqual({ kind: 'noRoute' });
    },
  );
  it('is pure, prepends fill guidance, and explains raising a selected ladder', () => {
    const { state, unit, ladder } = fixture();
    // Fixture edits below become new immutable snapshots at the UI boundary.
    const context = (id: string, locale: 'en' | 'zh') =>
      actionContext(structuredClone(state), id, locale);
    const before = structuredClone(state);
    const guide = climbGuide(state, unit.id)!;
    expect(context(unit.id, 'zh')).toBe(`此处可填城堑。 ${climbGuideText(guide, 'zh', () => '')}`);
    expect(context(ladder.id, 'en')).toBe('Infantry can climb from this cell once it is raised.');
    expect(state).toEqual(before);
    Object.assign(unit, { x: 5, y: 10 });
    expect(context(unit.id, 'zh')).toBe(
      `此处可填城堑。 ${climbGuideText(climbGuide(state, unit.id)!, 'zh', () => '')}`,
    );
    Object.assign(unit, base);
    ladder.raisedAt = top;
    expect(context(unit.id, 'zh')).toBe(siegeText('zh', 'contextLadder', { gain: 1 }));
    state.units.push({ ...unit, id: 'enemy', side: 'wei', ...top, level: 'wall' });
    expect(context(unit.id, 'zh')).toBe(
      climbGuideText(climbGuide(state, unit.id)!, 'zh', () => unit.officer.chinese),
    );
  });
});

const walk = {
  kind: 'walkToBase',
  route: 'ladder',
  base,
  steps: 2,
  canReach: true,
  moved: false,
} as const;
const sentences: [ClimbGuide, string, string][] = [
  [{ kind: 'acted' }, '今天已行动，明天才能攀爬。', 'Already acted today. It can climb tomorrow.'],
  [
    { kind: 'defenderAbove', defenderId: 'defender', top, base },
    '头上有守军（姓名），不能攀爬：用「攻击」或强攻积累立足。',
    'Name holds the wall above. Attack or assault to build footholds.',
  ],
  [
    { kind: 'allyAbove', allyId: 'ally', route: 'ladder', top, base, atBase: true, breach: false },
    '梯顶被姓名占着：先让姓名沿城墙走开，才能继续攀爬。',
    'Name holds the top of the ladder. Move that unit along the wall, then climb.',
  ],
  [
    {
      kind: 'allyAbove',
      allyId: 'ally',
      route: 'wallFoot',
      top,
      base,
      atBase: false,
      breach: false,
    },
    '墙头被姓名占着：先让姓名沿城墙走开，才能继续攀爬。',
    'Name holds the wall above. Move that unit along the wall, then climb.',
  ],
  [
    { kind: 'ladderNotRaised', ladderId: 'ladder', base, atBase: true, steps: 0 },
    '云梯还没架起：点「架梯」，再点「登城」。',
    'The ladder is not raised. Press Raise ladder, then Climb.',
  ],
  [
    { kind: 'ladderNotRaised', ladderId: 'ladder', base, atBase: false, steps: 2 },
    '云梯还没架起：选中云梯点「架梯」，部队再移到金框。',
    'The ladder is not raised. Select it, press Raise ladder, then move to the gold frame.',
  ],
  [
    walk,
    '要站到金框（云梯所在那一格）才能登城，还差 2 格。',
    "Stand on the gold frame, the ladder's own cell, to climb: 2 to go.",
  ],
  [
    { ...walk, route: 'wallFoot' },
    '要站到金框（填平的墙脚）才能登城，还差 2 格。',
    'Stand on the gold frame, the filled wall foot, to climb: 2 to go.',
  ],
  [
    { ...walk, canReach: false },
    '金框还差 2 格，今天走不到：先走近，明天再上。',
    'The gold frame is too far today (2 to go). Move closer and climb tomorrow.',
  ],
  [
    { ...walk, canReach: false, moved: true },
    '金框还差 2 格，今天已移动：明天再走。',
    'This unit has moved and the gold frame is 2 away. Continue tomorrow.',
  ],
  [
    { ...walk, occupiedBy: 'ally', moved: true, canReach: false },
    '金框已被姓名占住：换一架云梯，或让它先走。',
    'Name holds the gold frame. Use another ladder or move it first.',
  ],
  [
    { kind: 'noRoute' },
    '云梯都没了：去工棚补造，或填平城堑从墙脚攀爬。',
    'No ladders left. Build one at a workshop, or fill the trench and climb the wall foot.',
  ],
];
describe('bilingual climb guide sentences', () => {
  it.each(['ladder', 'wallFoot'] as const)(
    'uses the open-breach sentences for %s in both locales',
    (route) => {
      const position = route;
      const ready: ClimbGuide = { kind: 'ready', position, gain: 1, top, breach: true };
      const ally: ClimbGuide = {
        kind: 'allyAbove',
        route,
        allyId: 'ally',
        base,
        top,
        atBase: true,
        breach: true,
      };
      expect(climbGuideText(ready, 'zh', () => '')).toBe('缺口已打开：点「登城」直接上墙。');
      expect(climbGuideText(ready, 'en', () => '')).toBe(
        'The breach is open. Climb to go straight onto the wall.',
      );
      expect(climbGuideText(ally, 'zh', () => '魏延')).toBe('点「登城」上墙，魏延会沿城墙让开。');
      expect(climbGuideText(ally, 'en', () => 'Wei Yan')).toBe(
        'Climb to go up; Wei Yan will move along the wall.',
      );
    },
  );

  it.each(sentences)('renders $kind in both languages', (guide, zh, en) => {
    expect(climbGuideText(guide, 'zh', () => '姓名')).toBe(zh);
    expect(climbGuideText(guide, 'en', () => 'Name')).toBe(en);
  });
  it('uses grammatical English at a distance of one', () => {
    for (const [guide, sentence] of [
      [walk, "Stand on the gold frame, the ladder's own cell, to climb: 1 to go."],
      [
        { ...walk, route: 'wallFoot' as const },
        'Stand on the gold frame, the filled wall foot, to climb: 1 to go.',
      ],
      [
        { ...walk, canReach: false },
        'The gold frame is too far today (1 to go). Move closer and climb tomorrow.',
      ],
      [
        { ...walk, moved: true, canReach: false },
        'This unit has moved and the gold frame is 1 away. Continue tomorrow.',
      ],
    ] as const)
      expect(climbGuideText({ ...guide, steps: 1 }, 'en', () => '')).toBe(sentence);
  });
  it.each(['ladder', 'mound', 'wallFoot'] as const)('retains the ready %s context', (position) => {
    for (const locale of ['zh', 'en'] as const) {
      const key =
        position === 'ladder'
          ? 'contextLadder'
          : position === 'mound'
            ? 'contextMound'
            : 'contextWallFoot';
      expect(
        climbGuideText({ kind: 'ready', position, gain: 1, top, breach: false }, locale, () => ''),
      ).toBe(siegeText(locale, key, { gain: 1 }));
    }
  });
  it('has nonempty bilingual keys for every sentence and map label', () => {
    for (const copy of Object.values(SIEGE_COPY))
      for (const key of [
        'climbActed',
        'climbDefenderAbove',
        'climbAllyAbove',
        'climbAllyAboveFoot',
        'climbBreachOpen',
        'climbMakeWay',
        'climbRaiseAtBase',
        'climbRaiseThenWalk',
        'climbWalkLadder',
        'climbWalkWallFoot',
        'climbTooFar',
        'climbMoved',
        'climbOccupied',
        'climbNoRoute',
        'climbBaseLabel',
        'climbWallFootLabel',
        'climbUnraisedLabel',
      ] as const)
        expect(copy[key].length).toBeGreaterThan(0);
  });
});

describe('day-one access and save compatibility', () => {
  it('keeps the required coarse starts on unique, passable, unoccupied deployment cells', () => {
    const state = createSiegeState(228);
    for (const unit of state.units) {
      const deployment = unit.side === 'shu' ? DEPLOY_SHU : DEPLOY_WEI;
      expect(deployment.some((c) => sameCell(c, unit) && c.level === unit.level)).toBe(true);
      if (unit.level === 'ground')
        expect(['plain', 'hill', 'wood', 'courtyard']).toContain(
          cellTerrain(state, unit.x, unit.y),
        );
      else expect(['wall', 'gate']).toContain(cellTerrain(state, unit.x, unit.y));
      expect(state.units.filter((u) => sameCell(u, unit) && u.level === unit.level)).toHaveLength(
        1,
      );
      expect(state.engines.some((e) => unit.level === 'ground' && sameCell(e, unit))).toBe(false);
    }
    const starts = [
      [8, 12],
      [7, 11],
      [8, 11],
      [9, 11],
      [4, 11],
      [12, 11],
      [3, 11],
      [13, 11],
      [2, 11],
      [14, 11],
    ];
    SHU_ROSTER.forEach((entry, index) => {
      const [x, y] = starts[index]!;
      expect(state.units.find((u) => u.id === entry.id)).toMatchObject({ x, y });
    });
  });
  it('reports the new day-one access honestly: three infantry can reach an opening ladder', () => {
    const state = createSiegeState(228);
    for (const ladder of state.engines.filter((e) => e.kind === 'ladder'))
      ladder.raisedAt = { x: ladder.x, y: 7 };
    const ready: string[] = [];
    for (const unit of state.units.filter((u) => u.side === 'shu' && u.troopType === 'infantry')) {
      const guide = climbGuide(state, unit.id)!;
      expect(guide.kind).toBe('walkToBase');
      if (guide.kind === 'walkToBase' && guide.canReach) ready.push(unit.id);
      else {
        expect(climbGuideText(guide, 'zh', () => '')).toContain('今天走不到');
        expect(climbGuideText(guide, 'en', () => '')).toContain('too far today');
      }
    }
    expect(ready).toEqual(['shu-wangping', 'shu-wuyi', 'shu-liaohua']);
  });
  it.each([
    ['shu-weiyan', 6],
    ['shu-captain-2', 10],
  ] as const)(
    'reaches the matching ladder and walkthrough step four on day one after redeploying %s, in either order',
    (unitId, x) => {
      for (const moveFirst of [true, false]) {
        let state = createSiegeState(228);
        state.units = state.units.filter((u) => u.side !== 'wei' || u.x !== x);
        state = deployUnit(state, unitId, { x: x - 1, y: 10, level: 'ground' });
        const ladder = state.engines.find((e) => e.kind === 'ladder' && e.x === x)!;
        expect(reachableCells(state, unitId)).toContainEqual({
          x: ladder.x,
          y: ladder.y,
          level: 'ground',
          cost: 1,
        });
        let progress = startWalkthrough(state);
        const ui = { tab: 'commands', selected: ladder.id };
        if (moveFirst)
          state = act(state, { type: 'move', unitId, x: ladder.x, y: ladder.y, level: 'ground' });
        // The move, if any, predates step three's cursor.
        progress = settleWalkthrough(progress, state, ui)!;
        state = act(state, { type: 'raiseLadder', engineId: ladder.id });
        progress = settleWalkthrough(progress, state, ui)!;
        if (!moveFirst)
          state = act(state, { type: 'move', unitId, x: ladder.x, y: ladder.y, level: 'ground' });
        progress = settleWalkthrough(progress, state, { ...ui, selected: unitId })!;
        expect(progress).toMatchObject({ step: 4, infantryId: unitId });
        expect(siegeCommands(state, unitId).find((c) => c.kind === 'climb')?.reason).toBeNull();
        state = act(state, { type: 'climb', unitId });
        expect(state.footholds[`${ladder.x},7`]).toBe(1);
        expect(state.day).toBe(1);
      }
    },
  );
  it('loads and continues a coarse v0.3 save without moving its units', () => {
    const state = createSiegeState(228);
    Object.assign(
      state.units.find((u) => u.id === 'shu-weiyan')!,
      { x: 7, y: 10 },
    );
    Object.assign(
      state.units.find((u) => u.id === 'shu-captain-2')!,
      { x: 9, y: 11 },
    );
    const save = { state, phase: 'battle' as const, playerSide: 'shu' as const, facings: {} };
    const loaded = deserializeSiegeSave(serializeSiegeSave(save));
    expect(loaded).toEqual(save);
    const next = act(loaded.state, {
      type: 'move',
      unitId: 'shu-weiyan',
      x: 6,
      y: 10,
      level: 'ground',
    });
    expect(next.units.find((u) => u.id === 'shu-weiyan')).toMatchObject({ x: 6, y: 10 });
    expect(loaded.state).toEqual(state);
  });
});

describe('walkthrough step three day rhythm', () => {
  it.each([
    ['shu-weiyan', 'starting-ladder-1', 6],
    ['shu-captain-2', 'starting-ladder-2', 10],
  ] as const)(
    'checks every available infantry move toward %s’s ladder without mutation',
    (unitId, ladderId, x) => {
      let state = createSiegeState(228);
      state.units = state.units.filter(
        (u) => u.side === 'wei' || u.troopType === 'archer' || u.id === unitId,
      );
      const progress = { ...startWalkthrough(state), step: 3, ladderId };
      const before = structuredClone(state);
      expect(walkthroughNeedsEndDay(progress, state, 'shu')).toBe(true);
      expect(state).toEqual(before);
      expect(walkthroughTargets(progress, state, 'shu')).toEqual([{ x, y: 10, level: 'ground' }]);
      state = deployUnit(state, unitId, { x: x - 1, y: 10, level: 'ground' });
      expect(walkthroughNeedsEndDay(progress, state, 'shu')).toBe(false);
      const unit = state.units.find((u) => u.id === unitId)!;
      for (const changes of [
        { moved: true },
        { acted: true },
        { routed: true },
        { troops: 0 },
        { morale: 0 },
      ]) {
        const unavailable = structuredClone(state);
        Object.assign(
          unavailable.units.find((u) => u.id === unitId)!,
          changes,
        );
        expect(walkthroughNeedsEndDay(progress, unavailable, 'shu')).toBe(true);
      }
      // A nearby archer or defender cannot complete the infantry arrival step.
      state.units = state.units.filter((u) => u.id !== unit.id);
      Object.assign(
        state.units.find((u) => u.troopType === 'archer')!,
        { x, y: 10 },
      );
      expect(walkthroughNeedsEndDay(progress, state, 'shu')).toBe(true);
    },
  );
  it('only prompts during active Shu step three with a usable target ladder', () => {
    const state = createSiegeState(228);
    const progress = { ...startWalkthrough(state), step: 3, ladderId: 'starting-ladder-1' };
    expect(walkthroughNeedsEndDay(undefined, state, 'shu')).toBe(false);
    expect(walkthroughNeedsEndDay(progress, state, 'wei')).toBe(false);
    for (const status of ['done', 'skipped'] as const)
      expect(walkthroughNeedsEndDay({ ...progress, status }, state, 'shu')).toBe(false);
    for (const step of [1, 2, 4, 5, 6, 7, 8, 9])
      expect(walkthroughNeedsEndDay({ ...progress, step }, state, 'shu')).toBe(false);
    expect(walkthroughNeedsEndDay({ ...progress, ladderId: 'missing' }, state, 'shu')).toBe(false);
    state.engines[0]!.wrecked = true;
    expect(walkthroughNeedsEndDay(progress, state, 'shu')).toBe(false);
  });
});

describe('S guidance after mounting and ally make-way', () => {
  it.each(['zh', 'en'] as const)(
    '%s describes all next goals with actual walking distances and a free target',
    (locale) => {
      const { state, unit } = fixture();
      Object.assign(unit, { x: 6, y: 7, level: 'wall' });
      state.engines = [];
      let guide = nextGoalGuide(state, unit.id)!;
      expect(guide).toMatchObject({
        kind: 'gate',
        steps: 2,
        target: { x: 8, y: 7, level: 'wall' },
      });
      expect(nextGoalGuideText(guide, locale, () => '')).toBe(
        siegeText(locale, 'nextGate', { n: 2 }),
      );
      expect(actionContext(state, unit.id, locale)).toBe(
        nextGoalGuideText(guide, locale, () => ''),
      );
      // Block the short road and the side-gate inside cells: the nearest free
      // opening position requires a real detour around the courtyard.
      Object.assign(unit, { x: 8, y: 4, level: 'ground' });
      for (const [x, y] of [
        [8, 3],
        [8, 5],
        [5, 5],
        [11, 5],
      ])
        state.units.push({ ...unit, id: `blocker-${x}-${y}`, side: 'wei', x: x!, y: y! });
      guide = nextGoalGuide(state, unit.id)!;
      expect(guide.kind).toBe('gate');
      if ('target' in guide)
        expect(guide.steps).toBeGreaterThan(
          Math.abs(unit.x - guide.target.x) + Math.abs(unit.y - guide.target.y),
        );
      state.units.splice(1);
      Object.assign(unit, { x: 8, y: 6 });
      expect(nextGoalGuide(state, unit.id)).toEqual({ kind: 'openNow' });
      expect(nextGoalGuideText({ kind: 'openNow' }, locale, () => '')).toBe(
        siegeText(locale, 'nextOpenNow'),
      );
      const commands = siegeCommands(state, unit.id, 'shu');
      expect(commands[0]).toMatchObject({ kind: 'openGate', reason: null });
      const enemy = {
        ...unit,
        id: 'guard',
        side: 'wei' as const,
        x: 8,
        y: 7,
        level: 'wall' as const,
      };
      state.units.push(enemy);
      guide = nextGoalGuide(state, unit.id)!;
      expect(guide).toEqual({ kind: 'guarded', defenderId: 'guard' });
      expect(nextGoalGuideText(guide, locale, () => '守将')).toBe(
        siegeText(locale, 'nextGateGuarded', { name: '守将' }),
      );
      state.units.pop();
      state.gates.south.broken = true;
      guide = nextGoalGuide(state, unit.id)!;
      expect(guide.kind).toBe('courtyard');
      if ('target' in guide) {
        expect(guide.steps).toBeGreaterThan(0);
        expect(COURTYARD.some((c) => sameCell(c, guide.target))).toBe(true);
        expect(nextGoalGuideText(guide, locale, () => '')).toBe(
          siegeText(locale, 'nextCourtyard', { n: guide.steps }),
        );
        state.units.push({ ...unit, id: 'occupant', ...guide.target });
        const other = nextGoalGuide(state, unit.id)!;
        expect(other).not.toEqual(guide);
        expect(other.kind).toBe('courtyard');
      }
    },
  );
  it.each(['ladder', 'wallFoot'] as const)(
    '%s gives all three ally sentences in both locales',
    (route) => {
      const { state, unit, ladder } = fixture();
      const routeBase = route === 'ladder' ? base : { x: 6, y: 8 };
      Object.assign(unit, routeBase);
      if (route === 'ladder') ladder.raisedAt = top;
      else {
        state.engines = [];
        state.trenchFill['6,8'] = 3;
        state.trenchFill['6,9'] = 3;
      }
      state.footholds['6,7'] = 3;
      const ally = { ...unit, id: 'ally', ...top, level: 'wall' as const };
      state.units.push(ally);
      for (const status of ['ready', 'moved', 'boxed'] as const) {
        ally.moved = status === 'moved';
        state.units = [unit, ally];
        if (status === 'boxed')
          state.units.push(
            { ...ally, id: 'left', side: 'wei', x: 5 },
            { ...ally, id: 'right', side: 'wei', x: 7 },
          );
        const guide = climbGuide(state, unit.id)!;
        expect(guide.kind).toBe(status === 'ready' ? 'ready' : 'allyAbove');
        if (status === 'ready') expect(guide).toMatchObject({ makeWayId: ally.id });
        else expect(guide).toMatchObject({ blocked: status });
        for (const locale of ['zh', 'en'] as const)
          expect(climbGuideText(guide, locale, () => '魏延')).toBe(
            siegeText(
              locale,
              status === 'ready'
                ? 'climbMakeWay'
                : status === 'moved'
                  ? 'climbAllyMoved'
                  : 'climbAllyBoxed',
              { name: '魏延' },
            ),
          );
      }
    },
  );
});
