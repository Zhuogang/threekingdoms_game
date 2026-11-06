import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { POSE_SETS, sheet } from '../../src/siege/render/assets';
import {
  anchor,
  centre,
  contains,
  hitRect,
  planeRect,
  positionAt,
  raisedLadderFoot,
} from '../../src/siege/render/boardGeometry';
import { engineFootprint, engineSprite, unitVisual } from '../../src/siege/render/stateArt';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { createSiegeState } from '../../src/siege/rules/state';
import { resolveMapClick } from '../../src/siege/ui/mapClick';
import { playScriptDays } from '../../src/siege/ui/devPlaythrough';
import { siegeCommands, actionContext } from '../../src/siege/ui/commands';
import { nextGoalGuide, nextGoalGuideText } from '../../src/siege/ui/nextGoalGuide';
import { climbGuide } from '../../src/siege/ui/climbGuide';
import { siegeText } from '../../src/siege/i18n';
import { act, engine } from './rulesFixtures';

describe('V2 engine footprints, original figures and cell registration', () => {
  it.each(['ladder', 'earthCart', 'ram', 'tower'] as const)(
    '%s owns one cell in every state',
    (kind) => {
      for (const flags of [
        {},
        { covered: true },
        { burning: true },
        { wrecked: true },
        { acted: true },
      ]) {
        const e = engine(kind, 6, 10, flags);
        expect(engineFootprint(e)).toEqual([{ x: 6, y: 10, level: 'ground' }]);
        const sprite = engineSprite(e);
        expect(sprite.rect.every(Number.isFinite)).toBe(true);
        const r = planeRect({ x: 6, y: 10, level: 'ground' });
        expect(sprite.rect[0]).toBeLessThan(r[2]);
        expect(sprite.rect[2]).toBeGreaterThan(r[0]);
      }
    },
  );
  it('raised ladders own base and wall top; uniformly register the approved top and base', () => {
    for (const covered of [false, true]) {
      const e = engine('ladder', 6, 10, { covered, raisedAt: { x: 6, y: 7 } }),
        sprite = engineSprite(e),
        source = sheet(sprite.sheet);
      expect(source.pieces.length).toBeGreaterThan(0);
      expect(engineFootprint(e)).toEqual([
        { x: 6, y: 10, level: 'ground' },
        { x: 6, y: 7, level: 'wall' },
      ]);
      const sx = (sprite.rect[2] - sprite.rect[0]) / (sprite.crop[2] - sprite.crop[0]),
        sy = (sprite.rect[3] - sprite.rect[1]) / (sprite.crop[3] - sprite.crop[1]);
      expect(sx).toBeCloseTo(sy, 10);
      const top = [(sprite.crop[0] + sprite.crop[2]) / 2, sprite.crop[1]],
        base = [top[0]!, sprite.crop[3]];
      const mapped = (pixel: number[]) => [
        sprite.rect[0] + (pixel[0]! - sprite.crop[0]) * sx,
        sprite.rect[1] + (pixel[1]! - sprite.crop[1]) * sy,
      ];
      expect(mapped(top)).toEqual(anchor({ x: 6, y: 7, level: 'wall' }));
      expect(mapped(base)).toEqual(raisedLadderFoot(e));
      expect(sx).toBeCloseTo(covered ? 216 / 486 : 216 / 534, 10);
      e.wrecked = true;
      expect(engineFootprint(e)).toHaveLength(1);
    }
  });
  it.each([1, 2, 3] as const)(
    'foothold %i retains the real unscaled climbing poses only at 1 and 2',
    (progress) => {
      const state = createSiegeState(228),
        unit = state.units[1]!;
      Object.assign(unit, { x: 6, y: 8 });
      state.engines[0]!.y = 8;
      state.engines[0]!.raisedAt = { x: 6, y: 7 };
      state.footholds['6,7'] = progress;
      const visual = unitVisual(state, unit);
      expect(visual.climbing).toBe(progress < 3);
      expect(visual.figures.some((f) => f.name.includes('climb'))).toBe(progress < 3);
      if (progress < 3)
        for (const figure of visual.figures)
          expect(figure.pose).toBe(POSE_SETS['s5-01']!.poses.get(figure.name));
      else expect(visual.foot).toEqual(anchor(unit));
    },
  );
  it('normal formation feet fit their planes in every facing and activity, without shrinking poses', () => {
    const state = createSiegeState(228),
      unit = state.units[1]!;
    let checks = 0;
    for (const p of [
      { x: 7, y: 10, level: 'ground' as const },
      { x: 6, y: 7, level: 'wall' as const },
      { x: 8, y: 7, level: 'wall' as const },
      { x: 4, y: 5, level: 'wall' as const },
    ])
      for (const troops of [800, 2000, 3000])
        for (const facing of ['north', 'south', 'east', 'west'] as const)
          for (const activity of [undefined, 'move', 'attack', 'fillTrench']) {
            Object.assign(unit, p, { troops });
            const visual = unitVisual(state, unit, facing, activity),
              r = planeRect(unit);
            for (const f of visual.figures) {
              expect(contains(r, visual.foot[0] + f.offset[0], visual.foot[1] + f.offset[1])).toBe(
                true,
              );
              expect(f.pose).toBe(visual.pose);
            }
            checks++;
          }
    expect(checks).toBe(192);
  });
  it('hit-centres and nameplates resolve units in crowds, gate tops and scripted day 9', () => {
    const start = createSiegeState(228),
      crowd = structuredClone(start),
      walkway = structuredClone(start);
    Object.assign(crowd.units[1]!, { x: 6, y: 8 });
    crowd.engines[0]!.y = 8;
    crowd.engines[0]!.raisedAt = { x: 6, y: 7 };
    crowd.footholds['6,7'] = 2;
    Object.assign(walkway.units[1]!, { x: 5, y: 7, level: 'wall' });
    const day9 = playScriptDays(createSiegeState(1), 'careful', 8);
    expect(day9.day).toBe(9);
    for (const state of [start, crowd, walkway, day9])
      for (const unit of state.units.filter((u) => u.troops > 0 && u.x >= 0)) {
        const picked = positionAt(state, ...centre(hitRect(unit, state)!));
        expect(picked).toEqual({ x: unit.x, y: unit.y, level: unit.level });
        expect(resolveMapClick({ state, pickedUnitId: unit.id }, picked)).toEqual({
          type: 'select',
          id: unit.id,
        });
      }
  });
  it.each(['ladder', 'earthCart', 'ram', 'tower'] as const)(
    'a unit at a shared %s base remains visible after the engine slices',
    (kind) => {
      const state = createSiegeState(228),
        unit = state.units[1]!;
      Object.assign(unit, { x: 6, y: 10 });
      state.engines = [engine(kind, 6, 10)];
      const markup = renderToStaticMarkup(createElement(SiegeMapView, { state, locale: 'en' }));
      expect(markup.indexOf(`data-unit="${unit.id}"`)).toBeGreaterThan(
        markup.lastIndexOf('data-piece="engine"'),
      );
    },
  );
  it('Raise ladder from the base still offers Climb without changing rules', () => {
    let state = createSiegeState(228);
    const id = state.units[1]!.id;
    Object.assign(state.units[1]!, { x: 6, y: 10 });
    state.units = state.units.filter((u) => u.id === id);
    const command = siegeCommands(state, id).find((c) => c.kind === 'raiseLadder')!;
    expect(command).toMatchObject({
      reason: null,
      action: { type: 'raiseLadder', engineId: state.engines[0]!.id },
    });
    for (const locale of ['zh', 'en'] as const)
      expect(actionContext(state, id, locale)).toBe(siegeText(locale, 'climbRaiseAtBase'));
    state = act(state, command.action!);
    expect(siegeCommands(state, id).find((c) => c.kind === 'raiseLadder')?.reason).toBeTruthy();
    expect(siegeCommands(state, id).find((c) => c.kind === 'climb')?.reason).toBeNull();
  });
  it('inside units retain next-goal guidance and a boxed-in wall defender retains context', () => {
    const state = createSiegeState(228),
      shu = state.units[1]!,
      wei = state.units.find((u) => u.side === 'wei')!;
    Object.assign(shu, { x: 7, y: 6 });
    expect(climbGuide(state, shu.id)).toBeNull();
    for (const locale of ['zh', 'en'] as const)
      expect(actionContext(state, shu.id, locale)).toBe(
        nextGoalGuideText(nextGoalGuide(state, shu.id)!, locale, (id) => {
          const other = state.units.find((u) => u.id === id)!;
          return locale === 'zh' ? other.officer.chinese : other.officer.name;
        }),
      );
    for (const unit of [shu, wei]) {
      const s = structuredClone(state),
        u = s.units.find((v) => v.id === unit.id)!;
      Object.assign(u, { x: 6, y: 7, level: 'wall', moved: false });
      s.units = s.units.filter((v) => v.id === u.id);
      for (const [x, y, level] of [
        [5, 7, 'wall'],
        [7, 7, 'wall'],
        [6, 6, 'ground'],
      ] as const)
        s.units.push({
          ...u,
          id: `block-${x}`,
          x,
          y,
          level,
          side: u.side === 'shu' ? 'wei' : 'shu',
        });
      for (const locale of ['zh', 'en'] as const)
        expect(actionContext(s, u.id, locale)).toBe(siegeText(locale, 'contextWallBlocked'));
    }
  });
});
