import { SOUTH_TRENCH, sameCell } from '../content/chencang';
import {
  activeUnit,
  climbingPosition,
  distance,
  predictSiegeClimb,
  usableEngine,
  wallFoothold,
  type ClimbingPosition,
} from '../rules/combat';
import { isWallFoot } from '../rules/map';
import { SIEGE_TUNING as T } from '../rules/tuning';
import { makeWayDestination, reachableCells } from '../rules/movement';
import type { Cell, SiegeState } from '../rules/types';
import { siegeText, type SiegeLocale } from '../i18n';

export type ClimbGuide =
  | { kind: 'acted' }
  | {
      kind: 'ready';
      position: ClimbingPosition;
      gain: number;
      top: Cell;
      breach: boolean;
      makeWayId?: string;
    }
  | { kind: 'defenderAbove'; defenderId: string; top: Cell; base: Cell }
  | {
      kind: 'allyAbove';
      allyId: string;
      route: 'ladder' | 'wallFoot';
      top: Cell;
      base: Cell;
      atBase: boolean;
      breach: boolean;
      blocked?: 'moved' | 'boxed';
    }
  | { kind: 'ladderNotRaised'; ladderId: string; base: Cell; atBase: boolean; steps: number }
  | {
      kind: 'walkToBase';
      route: 'ladder' | 'wallFoot';
      base: Cell;
      steps: number;
      canReach: boolean;
      moved: boolean;
      occupiedBy?: string;
    }
  | { kind: 'noRoute' };

/** Read-only guidance: rule forecasts and geometry decide whether climbing is possible. */
export function climbGuide(state: SiegeState, unitId: string): ClimbGuide | null {
  const unit = state.units.find((u) => u.id === unitId);
  if (
    !unit ||
    !activeUnit(unit) ||
    unit.side !== 'shu' ||
    unit.troopType !== 'infantry' ||
    unit.level !== 'ground' ||
    unit.y < 17
  )
    return null;
  if (unit.acted) return { kind: 'acted' };
  const forecast = predictSiegeClimb(state, unitId);
  if (forecast)
    return {
      kind: 'ready',
      position: forecast.position,
      ...(forecast.makeWay ? { makeWayId: forecast.makeWay.unitId } : {}),
      gain: forecast.footholdGain,
      top: forecast.top,
      breach: wallFoothold(state, forecast.top) === T.footholdComplete,
    };
  const defender = state.units.find(
    (u) => u.side !== unit.side && u.troops > 0 && climbingPosition(state, unit, u) !== null,
  );
  if (defender)
    return {
      kind: 'defenderAbove',
      defenderId: defender.id,
      top: { x: defender.x, y: defender.y },
      base: { x: unit.x, y: unit.y },
    };
  const ally = state.units.find(
    (u) => u.side === 'shu' && u.troops > 0 && climbingPosition(state, unit, u) !== null,
  );
  if (ally)
    return {
      kind: 'allyAbove',
      allyId: ally.id,
      ...(wallFoothold(state, ally) === T.footholdComplete
        ? { blocked: ally.moved ? ('moved' as const) : ('boxed' as const) }
        : {}),
      route: climbingPosition(state, unit, ally) === 'ladder' ? 'ladder' : 'wallFoot',
      top: { x: ally.x, y: ally.y },
      base: { x: unit.x, y: unit.y },
      atBase: true,
      breach: wallFoothold(state, ally) === T.footholdComplete,
    };

  const routes = [
    ...state.engines
      .filter((e) => e.kind === 'ladder' && usableEngine(e))
      .map((e) => ({
        route: 'ladder' as const,
        base: { x: e.x, y: e.y },
        ladderId: e.id,
        raised: Boolean(e.raisedAt),
        top: e.raisedAt,
      })),
    ...SOUTH_TRENCH.filter((c) => isWallFoot(state, c.x, c.y)).map((base) => ({
      route: 'wallFoot' as const,
      base,
      ladderId: '',
      raised: true,
      top: { x: base.x, y: base.y - 1 },
    })),
  ].map((route) => ({
    ...route,
    steps: distance(unit, route.base),
    occupiedBy: state.units.find(
      (u) =>
        u.id !== unitId &&
        u.side === unit.side &&
        u.troops > 0 &&
        u.level === 'ground' &&
        sameCell(u, route.base),
    )?.id,
  }));
  routes.sort(
    (a, b) =>
      a.steps - b.steps ||
      Number(Boolean(a.occupiedBy)) - Number(Boolean(b.occupiedBy)) ||
      Number(b.raised) - Number(a.raised) ||
      a.base.x - b.base.x ||
      a.base.y - b.base.y,
  );
  const route = routes[0];
  if (!route) return { kind: 'noRoute' };
  const { base, steps } = route;
  if (!route.raised)
    return { kind: 'ladderNotRaised', ladderId: route.ladderId, base, atBase: steps === 0, steps };
  const allyAbove = state.units.find(
    (u) =>
      u.side === 'shu' && u.troops > 0 && u.level === 'wall' && route.top && sameCell(u, route.top),
  );
  if (allyAbove && route.top)
    return {
      kind: 'allyAbove',
      allyId: allyAbove.id,
      ...(wallFoothold(state, allyAbove) === T.footholdComplete &&
      !makeWayDestination(state, allyAbove)
        ? { blocked: allyAbove.moved ? ('moved' as const) : ('boxed' as const) }
        : {}),
      route: route.route,
      top: route.top,
      base,
      atBase: false,
      breach: wallFoothold(state, route.top) === T.footholdComplete,
    };
  return {
    kind: 'walkToBase',
    route: route.route,
    base,
    steps,
    canReach: reachableCells(state, unitId).some((c) => c.level === 'ground' && sameCell(c, base)),
    moved: unit.moved,
    occupiedBy: route.occupiedBy,
  };
}

export function climbGuideText(
  guide: ClimbGuide,
  locale: SiegeLocale,
  nameOf: (id: string) => string,
): string {
  switch (guide.kind) {
    case 'acted':
      return siegeText(locale, 'climbActed');
    case 'ready':
      if (guide.makeWayId)
        return siegeText(locale, 'climbMakeWay', { name: nameOf(guide.makeWayId) });
      if (guide.breach) return siegeText(locale, 'climbBreachOpen');
      return siegeText(
        locale,
        guide.position === 'ladder'
          ? 'contextLadder'
          : guide.position === 'mound'
            ? 'contextMound'
            : 'contextWallFoot',
        { gain: guide.gain },
      );
    case 'defenderAbove':
      return siegeText(locale, 'climbDefenderAbove', { name: nameOf(guide.defenderId) });
    case 'allyAbove':
      if (guide.breach && guide.blocked)
        return siegeText(locale, guide.blocked === 'moved' ? 'climbAllyMoved' : 'climbAllyBoxed', {
          name: nameOf(guide.allyId),
        });
      return siegeText(
        locale,
        guide.breach
          ? 'climbMakeWay'
          : guide.route === 'ladder'
            ? 'climbAllyAbove'
            : 'climbAllyAboveFoot',
        { name: nameOf(guide.allyId) },
      );
    case 'ladderNotRaised':
      return siegeText(locale, guide.atBase ? 'climbRaiseAtBase' : 'climbRaiseThenWalk');
    case 'walkToBase':
      if (guide.occupiedBy)
        return siegeText(locale, 'climbOccupied', { name: nameOf(guide.occupiedBy) });
      return siegeText(
        locale,
        guide.moved
          ? 'climbMoved'
          : !guide.canReach
            ? 'climbTooFar'
            : guide.route === 'ladder'
              ? 'climbWalkLadder'
              : 'climbWalkWallFoot',
        { n: guide.steps },
      );
    case 'noRoute':
      return siegeText(locale, 'climbNoRoute');
  }
}
