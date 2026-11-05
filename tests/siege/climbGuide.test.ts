import { describe, expect, it } from 'vitest';
import { DEPLOY_SHU, DEPLOY_WEI, SHU_ROSTER, sameCell } from '../../src/siege/content/chencang';
import { SIEGE_COPY, siegeText } from '../../src/siege/i18n';
import { createSiegeState } from '../../src/siege/rules/state';
import { cellTerrain } from '../../src/siege/rules/map';
import { reachableCells } from '../../src/siege/rules/movement';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import type { SiegeUnit } from '../../src/siege/rules/types';
import { actionContext, deployUnit, siegeCommands } from '../../src/siege/ui/commands';
import { climbGuide, climbGuideText, type ClimbGuide } from '../../src/siege/ui/climbGuide';
import {
  settleWalkthrough,
  startWalkthrough,
  walkthroughNeedsEndDay,
  walkthroughTargets,
} from '../../src/siege/ui/walkthrough';
import { deserializeSiegeSave, serializeSiegeSave } from '../../src/siege/save';
import { act, engine } from './rulesFixtures';

const base = { x: 18, y: 19 };
const top = { x: 18, y: 16 };
function fixture() {
  const state = createSiegeState(228);
  const unit = state.units.find((u) => u.id === 'shu-weiyan')!;
  Object.assign(unit, { x: 18, y: 21 });
  state.units = [unit];
  state.engines = [engine('ladder', base.x, base.y, { id: 'ladder' })];
  return { state, unit, ladder: state.engines[0]! };
}

describe('climb guide rule observations', () => {
  it.each(['ladder', 'wallFoot'] as const)(
    'reports a breach on ready and allyAbove via %s, at the base and on the way',
    (route) => {
      const { state, unit, ladder } = fixture();
      const routeBase = route === 'ladder' ? base : { x: 18, y: 17 };
      if (route === 'ladder') ladder.raisedAt = top;
      else {
        state.engines = [];
        state.trenchFill['18,17'] = T.trenchCapacity;
        state.trenchFill['18,18'] = T.trenchCapacity;
      }
      Object.assign(unit, routeBase);
      state.footholds['18,16'] = T.footholdComplete;
      const before = structuredClone(state);
      expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'ready', breach: true, top });
      expect(state).toEqual(before);
      state.units.push({ ...unit, id: 'ally', ...top, level: 'wall' });
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
    state.engines.push(engine('ladder', 18, 19, { id: 'second', raisedAt: { x: 19, y: 16 } }));
    state.units.push({ ...unit, id: 'enemy', side: 'wei', x: 19, y: 16, level: 'wall' });
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
    Object.assign(unit, { y: 21 });
    ladder.raisedAt = top;
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      route: 'ladder',
      base,
      steps: 2,
      canReach: true,
      moved: false,
    });
    unit.y = 25;
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      steps: 6,
      canReach: false,
      moved: false,
    });
    Object.assign(unit, { y: 20, moved: true });
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
      const routeBase = route === 'ladder' ? base : { x: 18, y: 17 };
      if (route === 'ladder') ladder.raisedAt = top;
      else {
        state.engines = [];
        state.trenchFill['18,17'] = T.trenchCapacity;
        state.trenchFill['18,18'] = T.trenchCapacity;
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
      expect(climbGuide(state, unit.id)?.kind).toBe('ready');
    },
  );
  it('uses raisedAt for the chosen ladder and keeps the nearest route despite an occupied top', () => {
    const { state, unit, ladder } = fixture();
    ladder.raisedAt = { x: 19, y: 16 };
    state.engines.push(engine('ladder', 21, 21, { id: 'far', raisedAt: { x: 21, y: 16 } }));
    Object.assign(unit, { x: 18, y: 20 });
    state.units.push({ ...unit, id: 'ally', ...ladder.raisedAt, level: 'wall' });
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'allyAbove',
      base,
      top: ladder.raisedAt,
      atBase: false,
    });
  });
  it('checks defenders before allies at either kind of base', () => {
    for (const y of [19, 17]) {
      const { state, unit, ladder } = fixture();
      Object.assign(unit, { x: 18, y });
      ladder.x = 18;
      ladder.y = y;
      ladder.raisedAt = { x: 19, y: 16 };
      if (y === 17) state.trenchFill['18,17'] = T.trenchCapacity;
      else state.engines.push(engine('ladder', 18, 19, { id: 'second', raisedAt: top }));
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
    for (const y of [19, 20]) {
      unit.y = y;
      expect(climbGuide(state, unit.id)).toMatchObject({
        kind: 'ladderNotRaised',
        atBase: y === 19,
      });
    }
  });
  it('never reports walkToBase with zero steps across route and occupant states', () => {
    for (const route of ['ladder', 'wallFoot'] as const)
      for (const occupant of ['none', 'ally', 'enemy', 'dead'] as const)
        for (const atBase of [false, true])
          for (const moved of [false, true]) {
            const { state, unit, ladder } = fixture();
            const routeBase = route === 'ladder' ? base : { x: 18, y: 17 };
            ladder.raisedAt = top;
            if (route === 'wallFoot') {
              state.engines = [];
              state.trenchFill['18,17'] = T.trenchCapacity;
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
    Object.assign(unit, { x: 18, y: 20 });
    ladder.raisedAt = top;
    for (const [x, y] of [
      [18, 21],
      [17, 20],
      [19, 20],
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
    Object.assign(unit, { x: 20, y: 21 });
    const west = engine('ladder', 18, 19, { id: 'west' });
    const east = engine('ladder', 22, 19, { id: 'east', raisedAt: { x: 22, y: 16 } });
    state.engines = [east, west];
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      base: { x: 22, y: 19 },
    });
    west.raisedAt = top;
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'walkToBase', base });
    const ally = { ...unit, id: 'ally', ...base };
    state.units.push(ally);
    delete east.raisedAt;
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'ladderNotRaised', ladderId: 'east' });
    east.x = 23;
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
    Object.assign(unit, { x: 18, y: 18 });
    state.trenchFill['18,18'] = T.trenchCapacity;
    expect(climbGuide(state, unit.id)).toEqual({ kind: 'noRoute' });
    state.trenchFill['18,17'] = T.trenchCapacity;
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'walkToBase',
      route: 'wallFoot',
      base: { x: 18, y: 17 },
      steps: 1,
      canReach: true,
    });
    unit.y = 17;
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'ready', position: 'wallFoot' });
    state.mounds['18,17'] = T.moundComplete;
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'ready', position: 'mound' });
    state.units.push({ ...unit, id: 'enemy', side: 'wei', y: 16, level: 'wall' });
    expect(climbGuide(state, unit.id)).toMatchObject({
      kind: 'defenderAbove',
      defenderId: 'enemy',
      base: { x: 18, y: 17 },
      top,
    });
  });
  it('prefers a wall foot over an equally distant unraised ladder', () => {
    const { state, unit } = fixture();
    Object.assign(unit, { x: 18, y: 18 });
    state.trenchFill['18,17'] = T.trenchCapacity;
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
      state.engines.push(engine('tower', 18, 20));
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
    expect(context(unit.id, 'zh')).toBe(climbGuideText(guide, 'zh', () => ''));
    expect(context(ladder.id, 'en')).toBe('Infantry can climb from this cell once it is raised.');
    expect(state).toEqual(before);
    Object.assign(unit, { x: 17, y: 19 });
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
    '云梯还没架起：选中云梯点「架梯」，再点「登城」。',
    'The ladder is not raised. Select it, press Raise ladder, then Climb.',
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
      expect(climbGuideText(ally, 'zh', () => '魏延')).toBe(
        '上方被魏延占着：魏延沿城墙走开后，下一支一步上墙。',
      );
      expect(climbGuideText(ally, 'en', () => 'Wei Yan')).toBe(
        'Wei Yan holds the wall above. Once that unit moves along the wall, the next one goes straight up.',
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
        'climbAllyAboveBreach',
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
  it('keeps the original starts on unique, passable, unoccupied deployment cells', () => {
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
    SHU_ROSTER.forEach((entry, index) => {
      const expected =
        index === 0 ? { x: 23, y: 25 } : { x: 19 + index, y: 21 + Math.floor((index - 1) / 3) };
      expect(state.units.find((u) => u.id === entry.id)).toMatchObject(expected);
    });
  });
  it('cannot reach either ladder from default deployment on day one and explains the wait', () => {
    const state = createSiegeState(228);
    const ladders = state.engines.filter((e) => e.kind === 'ladder');
    for (const ladder of ladders) ladder.raisedAt = { x: ladder.x, y: 16 };
    const infantry = state.units.filter((u) => u.side === 'shu' && u.troopType === 'infantry');
    for (const unit of infantry) {
      const reachable = reachableCells(state, unit.id);
      for (const ladder of ladders)
        expect(reachable.some((c) => c.level === 'ground' && sameCell(c, ladder))).toBe(false);
      const guide = climbGuide(state, unit.id)!;
      expect(guide).toMatchObject({ kind: 'walkToBase', canReach: false, moved: false });
      expect(climbGuideText(guide, 'zh', () => '')).toContain('今天走不到');
      expect(climbGuideText(guide, 'en', () => '')).toContain('too far today');
    }
  });
  it.each([
    ['shu-weiyan', 18],
    ['shu-captain-2', 29],
  ] as const)(
    'reaches the matching ladder and walkthrough step four on day one after redeploying %s, in either order',
    (unitId, x) => {
      for (const moveFirst of [true, false]) {
        let state = createSiegeState(228);
        state = deployUnit(state, unitId, { x, y: 21, level: 'ground' });
        const unit = state.units.find((u) => u.id === unitId)!;
        const ladder = state.engines.find((e) => e.kind === 'ladder' && e.x === unit.x)!;
        expect(reachableCells(state, unitId)).toContainEqual({
          x: ladder.x,
          y: ladder.y,
          level: 'ground',
          cost: 2,
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
        expect(state.footholds[`${ladder.x},16`]).toBe(1);
        expect(state.day).toBe(1);
      }
    },
  );
  it('loads and continues an old-position v0.2 save without moving its units or changing its format', () => {
    const state = createSiegeState(228);
    Object.assign(
      state.units.find((u) => u.id === 'shu-weiyan')!,
      { x: 20, y: 21 },
    );
    Object.assign(
      state.units.find((u) => u.id === 'shu-captain-2')!,
      { x: 26, y: 23 },
    );
    const save = { state, phase: 'battle' as const, playerSide: 'shu' as const, facings: {} };
    const loaded = deserializeSiegeSave(serializeSiegeSave(save));
    expect(loaded).toEqual(save);
    const next = act(loaded.state, {
      type: 'move',
      unitId: 'shu-weiyan',
      x: 18,
      y: 20,
      level: 'ground',
    });
    expect(next.units.find((u) => u.id === 'shu-weiyan')).toMatchObject({ x: 18, y: 20 });
    expect(loaded.state).toEqual(state);
  });
});

describe('walkthrough step three day rhythm', () => {
  it.each([
    ['shu-weiyan', 'starting-ladder-1', 18],
    ['shu-captain-2', 'starting-ladder-2', 29],
  ] as const)(
    'checks every available infantry move toward %s’s ladder without mutation',
    (unitId, ladderId, x) => {
      let state = createSiegeState(228);
      const progress = { ...startWalkthrough(state), step: 3, ladderId };
      const before = structuredClone(state);
      expect(walkthroughNeedsEndDay(progress, state, 'shu')).toBe(true);
      expect(state).toEqual(before);
      expect(walkthroughTargets(progress, state, 'shu')).toEqual([{ x, y: 19, level: 'ground' }]);
      state = deployUnit(state, unitId, { x, y: 21, level: 'ground' });
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
        { x, y: 20 },
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
