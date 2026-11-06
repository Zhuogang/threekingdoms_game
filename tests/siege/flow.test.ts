import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSiegeState } from '../../src/siege/rules/state';
import { validateSiegeAction } from '../../src/siege/rules/actions';
import { engineReachable, pathTo, walkingDistances } from '../../src/siege/rules/movement';
import { actorTodo, actorQueue, nextActor } from '../../src/siege/ui/actorTodo';
import { actorTargets, siegeCommands, actionContext, standBy } from '../../src/siege/ui/commands';
import { nextGoalGuide, nextGoalGuideText } from '../../src/siege/ui/nextGoalGuide';
import { climbGuide, climbGuideText } from '../../src/siege/ui/climbGuide';
import { engineGuide } from '../../src/siege/ui/engineGuide';
import { hoverInfo } from '../../src/siege/ui/hoverInfo';
import { createRenderScene, RENDER_SCENES } from '../../src/siege/dev/renderScenes';
import { climbingBase, raisedLadderFoot } from '../../src/siege/render/boardGeometry';
import { unitVisual } from '../../src/siege/render/stateArt';
import { TargetIcons, targetIconRects } from '../../src/siege/render/TargetIcons';
import { resolveMapClick } from '../../src/siege/ui/mapClick';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { endDay } from '../../src/siege/rules/day';
import { act, engine, isolatedUnit, southWall, approach } from './rulesFixtures';

describe('V3 executable actor queue', () => {
  it('classifies ready, spent, immobile, dead and missing actors without using status or orders', () => {
    const { state, unit } = isolatedUnit('shu', approach());
    state.engines = [
      engine('ladder', 6, 10, { id: 'ladder' }),
      engine('ram', 8, 10, { id: 'ram' }),
    ];
    const before = structuredClone(state);
    expect(actorTodo(state, unit.id, 'shu')).toBe('act'); // Raise ladder on the same cell.
    expect(actorTodo(state, 'ladder', 'shu')).toBe('act');
    expect(actorTodo(state, 'ram', 'shu')).toBe('move');
    expect(actorTodo(state, unit.id, 'wei')).toBe('none');
    expect(actorTodo(state, 'ram', 'wei')).toBe('none');
    expect(actorTodo(state, 'missing', 'shu')).toBe('none');
    expect(state).toEqual(before);
    const spent = standBy(state, unit.id);
    expect(actorTodo(spent, unit.id, 'shu')).toBe('none');
    const dead = structuredClone(state);
    dead.units[0]!.troops = 0;
    expect(actorTodo(dead, unit.id, 'shu')).toBe('none');
    const still = structuredClone(state);
    still.engines = [];
    Object.assign(still.units[0]!, { moved: true, y: 11 });
    expect(actionContext(still, unit.id, 'en')).not.toBe('');
    expect(actorTodo(still, unit.id, 'shu')).toBe('none');
  });
  it('an already raised ladder has no todo, including after its spent flags reset', () => {
    const state = createSiegeState(228);
    state.engines = [engine('ladder', 6, 10, { raisedAt: { x: 6, y: 7 } })];
    expect(actorTodo(state, 'engine', 'shu')).toBe('none');
  });
  it.each([false, true])(
    'a unit just climbed (existing breach=%s) retains only real actions',
    (breach) => {
      const { state, unit } = isolatedUnit('shu', approach());
      state.engines = [engine('ladder', 6, 10, { raisedAt: { x: 6, y: 7 } })];
      state.units.push(createSiegeState(228).units.find((u) => u.side === 'wei')!);
      state.footholds['6,7'] = breach ? 3 : 2;
      const next = act(state, { type: 'climb', unitId: unit.id });
      expect(next.units[0]).toMatchObject({ level: 'wall', moved: true, acted: !breach });
      expect(actorTodo(next, unit.id, 'shu')).toBe('none'); // Empty wall, no action target.
      if (breach) {
        const enemy = { ...unit, id: 'enemy', side: 'wei' as const, ...southWall(7), troops: 300 };
        const contested = { ...next, units: [...next.units, enemy] };
        expect(actorTodo(contested, unit.id, 'shu')).toBe('act');
      }
    },
  );
  it('cycles actions first, units before engines within each group, then move-only actors', () => {
    const { state, unit } = isolatedUnit('shu', approach(5));
    state.engines = [
      engine('ladder', 6, 10, { id: 'ladder' }),
      engine('ram', 8, 10, { id: 'ram' }),
    ];
    // Unit has Cover engine, both it and ladder can act; ram can only move.
    expect(actorQueue(state, 'shu').map((a) => a.id)).toEqual([unit.id, 'ladder', 'ram']);
    expect(nextActor(state, null, 'shu')?.id).toBe(unit.id);
    expect(nextActor(state, unit.id, 'shu')?.id).toBe('ladder');
    expect(nextActor(state, 'ladder', 'shu')?.id).toBe('ram');
    expect(nextActor(state, 'ram', 'shu')?.id).toBe(unit.id);
    const done = { ...state, units: state.units.map((u) => ({ ...u, acted: true })), engines: [] };
    expect(nextActor(done, unit.id, 'shu')).toBeNull();
    const wei = isolatedUnit('wei', southWall());
    expect(actorTodo(wei.state, wei.unit.id, 'wei')).toBe('act');
    expect(nextActor(wei.state, null, 'wei')?.id).toBe(wei.unit.id);
  });
  it.each(['shu', 'wei'] as const)(
    '%s: skips A, finishes B, continues to C, and wraps after the group',
    (side) => {
      const state = createSiegeState(228);
      const roster = state.units.filter((u) => u.side === side).slice(0, 3);
      roster.forEach((u, i) =>
        Object.assign(u, side === 'shu' ? approach(5 + i) : southWall(5 + i)),
      );
      state.units = roster;
      state.engines = [];
      const [a, b, c] = roster;
      expect(actorQueue(state, side).map((u) => u.id)).toEqual(roster.map((u) => u.id));
      expect(nextActor(state, a!.id, side)?.id).toBe(b!.id); // Tab skips A.
      const done = standBy(state, b!.id, side);
      expect(nextActor(done, b!.id, side)?.id).toBe(c!.id);
      expect(nextActor(done, c!.id, side)?.id).toBe(a!.id);
      const lastDone = standBy(done, c!.id, side);
      expect(nextActor(lastDone, c!.id, side)?.id).toBe(a!.id);
      const dead = {
        ...state,
        units: roster.map((u) => ({ ...u, troops: u === b ? 0 : u.troops })),
      };
      expect(nextActor(dead, b!.id, side)?.id).toBe(c!.id);
      expect(nextActor(dead, 'missing', side)?.id).toBe(a!.id);
    },
  );
  it('continues across units/engines and action/move groups before wrapping', () => {
    const { state, unit } = isolatedUnit('shu', approach(5));
    state.engines = [
      engine('ladder', 6, 10, { id: 'ladder' }),
      engine('ram', 8, 10, { id: 'ram' }),
      engine('earthCart', 12, 11, { id: 'cart' }),
    ];
    expect(actorQueue(state, 'shu').map((a) => a.id)).toEqual([unit.id, 'ladder', 'ram', 'cart']);
    expect(nextActor(standBy(state, unit.id), unit.id, 'shu')?.id).toBe('ladder');
    expect(nextActor(standBy(state, 'ladder'), 'ladder', 'shu')?.id).toBe('ram');
    expect(nextActor(state, 'ram', 'shu')?.id).toBe('cart');
    expect(nextActor(state, 'cart', 'shu')?.id).toBe(unit.id);
    expect(nextActor({ ...state, units: [], engines: [] }, unit.id, 'shu')).toBeNull();
  });
});

describe('V3 wreck occupancy', () => {
  it.each([8, 9])(
    'routes and stops on bridge wreck (8,%i), and a fresh ram reaches the approach',
    (y) => {
      const { state, unit } = isolatedUnit('shu', approach(8));
      state.units.push(createSiegeState(228).units.find((u) => u.side === 'wei')!);
      state.engines = [engine('ram', 8, y, { id: 'wreck', wrecked: true, durability: 0 })];
      expect(pathTo(state, unit.id, 8, 8, 'ground')).toEqual([
        approach(8),
        { x: 8, y: 9, level: 'ground' },
        { x: 8, y: 8, level: 'ground' },
      ]);
      expect(pathTo(state, unit.id, 8, y, 'ground')).not.toBeNull();
      const walked = act(state, { type: 'move', unitId: unit.id, x: 8, y, level: 'ground' });
      expect(resolveMapClick({ state: walked, selected: unit.id }, walked.units[0]!)).toEqual({
        type: 'none',
      });
      const replacement = {
        ...state,
        units: state.units.map((u) => (u.id === unit.id ? { ...u, x: 4, y: 11 } : u)),
        engines: [...state.engines, engine('ram', 8, 10, { id: 'fresh' })],
      };
      expect(engineReachable(replacement, 'fresh')).toContainEqual({
        x: 8,
        y: 8,
        level: 'ground',
        cost: 2,
      });
      const arrived = act(replacement, { type: 'moveEngine', engineId: 'fresh', x: 8, y: 8 });
      const rammed = act(arrived, { type: 'ram', engineId: 'fresh', gateId: 'south' });
      expect(rammed.gates.south.durability).toBe(800 - T.ramDamage);
      expect(resolveMapClick({ state: arrived }, { x: 8, y: 8, level: 'ground' })).toEqual({
        type: 'select',
        id: 'fresh',
      });
    },
  );
  it('workshops reuse a wrecked exit without removing its art', () => {
    const state = createSiegeState(228);
    state.engines = [engine('ram', 6, 10, { id: 'wreck', wrecked: true, durability: 0 })];
    const next = endDay(
      act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'ladder' }),
    );
    expect(next.engines).toHaveLength(2);
    expect(next.engines[1]).toMatchObject({ x: 6, y: 10 });
  });
  it('towers cannot park on a usable ladder, but may occupy its wreck and take cell selection', () => {
    const state = createSiegeState(228);
    state.units = [];
    state.engines = [
      engine('ladder', 6, 10, { id: 'ladder', raisedAt: { x: 6, y: 7 } }),
      engine('tower', 5, 10, { id: 'tower' }),
    ];
    const move = { type: 'moveEngine' as const, engineId: 'tower', x: 6, y: 10 };
    expect(engineReachable(state, 'tower')).not.toContainEqual(
      expect.objectContaining({ x: 6, y: 10 }),
    );
    expect(validateSiegeAction(state, move)).not.toBeNull();
    const wrecked = {
      ...state,
      engines: state.engines.map((e) =>
        e.id === 'ladder' ? { ...e, wrecked: true, durability: 0 } : e,
      ),
    };
    const arrived = act(wrecked, move);
    expect(resolveMapClick({ state: arrived }, approach())).toEqual({
      type: 'select',
      id: 'tower',
    });
    expect(resolveMapClick({ state: arrived, selected: 'tower' }, approach())).toEqual({
      type: 'none',
    });
  });
});

describe('V3 targets, fixed slots and truthful guidance', () => {
  it('reports the real walking cost when a cart forces a detour to the base', () => {
    const { state, unit } = isolatedUnit('shu', approach(4));
    state.engines = [
      engine('ladder', 6, 10, { id: 'ladder' }),
      engine('ram', 5, 10, { id: 'block' }),
    ];
    const cost = walkingDistances(state, unit.id).find((p) => p.x === 6 && p.y === 10)?.cost;
    expect(cost).toBeGreaterThan(2);
    expect(climbGuide(state, unit.id)).toMatchObject({ kind: 'ladderNotRaised', steps: cost });
  });
  it('explains a blocked route without advertising a false distance', () => {
    const { state, unit } = isolatedUnit('shu', approach(4));
    state.engines = [engine('ladder', 6, 10)];
    for (const [x, y] of [
      [3, 10],
      [5, 10],
      [4, 11],
    ])
      state.units.push({ ...unit, id: `block-${x}`, side: 'wei', x: x!, y: y! });
    const guide = climbGuide(state, unit.id)!;
    expect(guide).toMatchObject({ kind: 'ladderNotRaised', noPath: true });
    expect(climbGuideText(guide, 'en', () => '')).toContain('route to this base is blocked');
  });
  it('Attack and Ram buttons agree both ways with icons over every ordinary review fixture', () => {
    let actors = 0,
      targets = 0;
    const slots = new Map<string, string[]>();
    for (const name of RENDER_SCENES.filter((n) => n !== 'board')) {
      const state = createRenderScene(name).state;
      for (const side of ['shu', 'wei'] as const) {
        for (const actor of [
          ...state.units.filter((u) => u.side === side),
          ...(side === 'shu' ? state.engines : []),
        ]) {
          const commands = siegeCommands(state, actor.id, side);
          const icons = actorTargets(state, actor.id, side);
          for (const kind of [
            'attack',
            'ram',
            'suppress',
            'fireArrows',
            'dropMillstone',
            'dropBoulders',
          ]) {
            const enabled = commands.some((c) => c.kind === kind && !c.reason);
            expect(
              icons.some((t) => t.action.type === kind),
              `${name}/${actor.id}/${kind}`,
            ).toBe(enabled);
          }
          for (const t of icons) expect(validateSiegeAction(state, t.action)).toBeNull();
          const type = `${side}/${'troopType' in actor ? actor.troopType : actor.kind}`;
          const order = commands.map((c) => c.kind);
          expect(order, type).toEqual(slots.get(type) ?? order);
          slots.set(type, order);
          actors++;
          targets += icons.length;
        }
      }
    }
    console.info('V3 fixture audit', JSON.stringify({ actors, targets, fixedLayouts: slots.size }));
    expect(actors).toBeGreaterThan(200);
    expect(targets).toBeGreaterThan(0);
    expect(slots.size).toBe(8);
  });
  it('defines one vector symbol per icon and a use per legal target', () => {
    const { state } = isolatedUnit('shu', { x: 8, y: 8, level: 'ground' });
    state.engines = [engine('ram', 8, 8)];
    const targets = actorTargets(state, 'engine', 'shu');
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ id: 'south', icon: 'hammer' });
    const entries = targetIconRects(state, targets, new Map());
    const html = renderToStaticMarkup(createElement(TargetIcons, { entries, prefix: 'test' }));
    expect((html.match(/<symbol /g) ?? []).length).toBe(6);
    expect((html.match(/<use /g) ?? []).length).toBe(targets.length);
    expect(resolveMapClick({ state, selected: 'engine' }, { x: 8, y: 7, level: 'ground' })).toEqual(
      { type: 'target', id: 'south' },
    );
    const counters = createSiegeState(228);
    counters.day = 2;
    counters.engines = [
      engine('ram', 8, 8),
      engine('ladder', 6, 10, { id: 'ladder', raisedAt: { x: 6, y: 7 } }),
    ];
    Object.assign(counters.units[1]!, { x: 6, y: 10 });
    counters.preparations.millstones['8,7'] = { day: 1, hoisted: true };
    counters.preparations.boulders['6,7'] = { day: 1 };
    for (const [id, type] of [
      ['wei-haozhao', 'dropMillstone'],
      ['wei-captain-1', 'dropBoulders'],
    ] as const) {
      expect(siegeCommands(counters, id, 'wei').find((c) => c.kind === type)?.reason).toBeNull();
      expect(actorTargets(counters, id, 'wei').find((t) => t.action.type === type)?.icon).toBe(
        'stone',
      );
    }
  });
  it.each(['zh', 'en'] as const)(
    '%s spent wall unit describes tomorrow without a frame; engine destinations are explicit',
    (locale) => {
      const { state, unit } = isolatedUnit('shu', southWall());
      unit.acted = true;
      const guide = nextGoalGuide(state, unit.id)!;
      expect(guide.kind).toBe('tomorrow');
      expect('target' in guide).toBe(false);
      expect(nextGoalGuideText(guide, locale, () => '')).toContain(
        locale === 'zh' ? '明日' : 'Tomorrow',
      );
      state.engines = [engine('ram', 8, 10)];
      expect(engineGuide(state, 'engine')?.target).toEqual({ x: 8, y: 8, level: 'ground' });
      expect(actionContext(state, 'engine', locale)).toContain('(8,8)');
    },
  );
  it('climbers follow the row-ten line, while a filled foot without a ladder uses row eight', () => {
    const { state, unit } = isolatedUnit('shu', approach());
    state.footholds['6,7'] = 2;
    state.engines = [engine('ladder', 6, 10, { raisedAt: { x: 6, y: 7 } })];
    const visual = unitVisual(state, unit);
    expect(visual.foot).toEqual(raisedLadderFoot(unit));
    expect(climbingBase(state, { x: 6, y: 7 })).toEqual(approach());
    state.engines = [];
    state.trenchFill['6,8'] = state.trenchFill['6,9'] = 3;
    Object.assign(unit, { y: 8 });
    expect(climbingBase(state, { x: 6, y: 7 }, unit)).toEqual({ x: 6, y: 8, level: 'ground' });
  });
  it('hover text includes terrain, plane height, occupants and conditional rule cover, and clears on leave', () => {
    const state = createSiegeState(228);
    expect(hoverInfo(state, null, 'en')).toBe('');
    const wall = hoverInfo(state, southWall(), 'en');
    expect(wall).toContain('Height 3');
    expect(wall).toContain('Parapet: ground Shu volley ×0.3');
    expect(wall).toContain('Captain');
    expect(hoverInfo(state, { x: 0, y: 1, level: 'ground' }, 'en')).toContain(
      'Terrain damage ×0.8',
    );
    expect(hoverInfo(state, { x: 4, y: 12, level: 'ground' }, 'zh')).toContain('地形伤害 ×0.82');
  });
});
