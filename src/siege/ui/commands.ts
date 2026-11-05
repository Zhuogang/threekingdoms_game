import { TRENCH_INNER_ROW } from '../content/coarseGrid';
import { cloneSiegeState } from '../rules/clone';
import { SIEGE_TUNING as T } from '../rules/tuning';
import { DEPLOY_SHU, DEPLOY_WEI, GATES, SOUTH_TRENCH, sameCell } from '../content/chencang';
import { validateSiegeAction } from '../rules/actions';
import {
  activeUnit,
  usableEngine,
  predictSiegeClimb,
  climbingPosition,
  distance,
  predictSiegeAttack,
} from '../rules/combat';
import { siegeText, type SiegeLocale } from '../i18n';
import { placeName } from './places';
import { nextGoalGuide, nextGoalGuideText } from './nextGoalGuide';
import { climbGuide, climbGuideText } from './climbGuide';
import { engineReachable, reachableCells } from '../rules/movement';
import type { SiegeAction, SiegePosition, SiegeState, SiegeSide } from '../rules/types';

export type ExtraCommandKind =
  'suppress' | 'coverEngine' | 'pileEarth' | 'fireArrows' | 'dropMillstone' | 'dropBoulders';
export type CommandKind =
  | 'openGate'
  | 'lightBrazier'
  | 'fireArrows'
  | 'hoistMillstone'
  | 'dropMillstone'
  | 'stackBoulders'
  | 'dropBoulders'
  | 'suppress'
  | 'coverEngine'
  | 'pileEarth'
  | 'move'
  | 'attack'
  | 'climb'
  | 'raiseLadder'
  | 'fillTrench'
  | 'buildWall'
  | 'ram'
  | 'order'
  | 'standby';
export interface SiegeCommand {
  kind: CommandKind;
  action?: SiegeAction;
  reason: string | null;
}
function unraisedLadderUnder(state: SiegeState, id: string) {
  const unit = state.units.find(
    (u) => u.id === id && u.side === 'shu' && u.troopType === 'infantry' && u.level === 'ground',
  );
  return (
    unit &&
    state.engines.find(
      (e) => e.kind === 'ladder' && usableEngine(e) && !e.raisedAt && sameCell(e, unit),
    )
  );
}
export function actorCommandKinds(
  state: SiegeState,
  id: string,
  playerSide: SiegeSide,
): CommandKind[] {
  const unit = state.units.find((u) => u.id === id);
  if (unit) {
    if (unit.side !== playerSide) return [];
    if (unit.side === 'wei')
      return [
        'move',
        'attack',
        ...(unit.troopType === 'archer'
          ? (['lightBrazier', 'fireArrows'] as const)
          : (['stackBoulders'] as const)),
        'hoistMillstone',
        'dropMillstone',
        'dropBoulders',
        ...(state.act >= 2 ? (['buildWall'] as const) : []),
        'order',
        'standby',
      ];
    const canOpen = Object.values(GATES).some(
      (gate) => !validateSiegeAction(state, { type: 'openGate', unitId: id, gateId: gate.id }),
    );
    return unit.troopType === 'archer'
      ? ['move', 'attack', 'suppress', 'order', 'standby']
      : [
          ...(canOpen ? ['openGate' as const] : []),
          'move',
          'attack',
          'coverEngine',
          'pileEarth',
          ...(unraisedLadderUnder(state, id) ? ['raiseLadder' as const] : []),
          'climb',
          'fillTrench',
          'order',
          'standby',
        ];
  }
  if (playerSide !== 'shu') return [];
  const engine = state.engines.find((e) => e.id === id);
  if (!engine) return [];
  const own: Record<typeof engine.kind, CommandKind[]> = {
    ladder: ['raiseLadder'],
    ram: ['ram'],
    earthCart: ['fillTrench', 'pileEarth'],
    tower: ['attack', 'suppress'],
  };
  return ['move', ...own[engine.kind], 'standby'];
}

const commandCache = new WeakMap<SiegeState, Map<string, SiegeCommand[]>>();
const contextCache = new WeakMap<SiegeState, Map<string, string>>();
export function siegeCommands(state: SiegeState, id: string, side: SiegeSide = 'shu') {
  let cache = commandCache.get(state);
  if (!cache) commandCache.set(state, (cache = new Map()));
  const key = JSON.stringify([id, side]);
  let commands = cache.get(key);
  if (!commands) cache.set(key, (commands = computeSiegeCommands(state, id, side)));
  return commands;
}
export function actionContext(state: SiegeState, id: string, locale: SiegeLocale): string {
  let cache = contextCache.get(state);
  if (!cache) contextCache.set(state, (cache = new Map()));
  const key = JSON.stringify([id, locale]);
  if (!cache.has(key)) cache.set(key, computeActionContext(state, id, locale));
  return cache.get(key)!;
}

function computeActionContext(state: SiegeState, id: string, locale: SiegeLocale) {
  const unit = state.units.find((u) => u.id === id);
  const actor = unit ?? state.engines.find((e) => e.id === id);
  if (!actor) return '';
  const nextGoal = nextGoalGuide(state, id);
  if (nextGoal)
    return nextGoalGuideText(nextGoal, locale, (unitId) => {
      const other = state.units.find((u) => u.id === unitId)!;
      return locale === 'zh' ? other.officer.chinese : other.officer.name;
    });
  if (
    unit?.level === 'wall' &&
    activeUnit(unit) &&
    !unit.moved &&
    !reachableCells(state, id).length
  )
    return siegeText(locale, 'contextWallBlocked');
  const guide = climbGuide(state, id);
  if (guide) {
    const sentence = climbGuideText(guide, locale, (unitId) => {
      const other = state.units.find((u) => u.id === unitId)!;
      return locale === 'zh' ? other.officer.chinese : other.officer.name;
    });
    if (guide.kind === 'ready' || guide.kind === 'defenderAbove') return sentence;
    const canFill = siegeCommands(state, id, 'shu').some(
      (c) => c.kind === 'fillTrench' && !c.reason,
    );
    return canFill ? `${siegeText(locale, 'contextFill')} ${sentence}` : sentence;
  }
  if (!unit && siegeCommands(state, id, 'shu').some((c) => c.kind === 'raiseLadder' && !c.reason))
    return siegeText(locale, 'contextRaiseLadder');
  if (unit && unit.troopType !== 'archer' && unit.y >= TRENCH_INNER_ROW) {
    if (
      state.units.some(
        (u) => u.side !== unit.side && activeUnit(u) && climbingPosition(state, unit, u),
      )
    )
      return siegeText(locale, 'contextDefender');
    const climb = predictSiegeClimb(state, unit);
    if (climb)
      return siegeText(
        locale,
        climb.position === 'ladder'
          ? 'contextLadder'
          : climb.position === 'mound'
            ? 'contextMound'
            : 'contextWallFoot',
        { gain: climb.footholdGain },
      );
  }
  if (
    siegeCommands(state, id, unit?.side ?? 'shu').some((c) => c.kind === 'fillTrench' && !c.reason)
  )
    return siegeText(locale, 'contextFill');
  return siegeText(locale, 'contextGeneral', {
    place: placeName(actor, locale),
    level: siegeText(locale, unit?.level ?? 'ground'),
  });
}
export function actionReason(state: SiegeState, action: SiegeAction): string | null {
  return validateSiegeAction(state, action);
}
/** Every action entry uses the same validator as its eventual execution. */
function computeSiegeCommands(
  state: SiegeState,
  id: string,
  playerSide: SiegeSide = 'shu',
): SiegeCommand[] {
  const unit = state.units.find((u) => u.id === id),
    engine = state.engines.find((e) => e.id === id);
  const kinds = actorCommandKinds(state, id, playerSide);
  const move = kinds.includes('move')
    ? unit
      ? reachableCells(state, id)
      : engineReachable(state, id)
    : [];
  const moveAction = (p: SiegePosition): SiegeAction =>
    unit
      ? { type: 'move', unitId: id, ...p }
      : { type: 'moveEngine', engineId: id, x: p.x, y: p.y };
  const actor = unit ?? engine;
  // Necessary conditions only, retaining the exhaustive candidate order. No legal
  // candidate can be skipped, so the first legal action and fallback stay identical.
  const plausible = (action: SiegeAction): boolean => {
    if (action.type === 'fillTrench' || action.type === 'pileEarth')
      return Boolean(actor && distance(actor, action) === 1);
    if (action.type === 'coverEngine') {
      const target = state.engines.find((e) => e.id === action.engineId);
      return Boolean(unit && target && distance(unit, target) <= 1);
    }
    if (action.type === 'suppress') {
      const target = state.units.find((u) => u.id === action.targetId);
      return Boolean(
        actor && target && distance(actor, target) <= (unit ? T.suppressRange : T.towerRange),
      );
    }
    if (action.type === 'attack') {
      const target = 'gateId' in action ? action.gateId : action.targetId;
      return Boolean(actor && predictSiegeAttack(state, id, target)?.inRange);
    }
    if (action.type === 'ram')
      return Boolean(engine && GATES[action.gateId].approaches.some((c) => sameCell(c, engine)));
    return true;
  };
  const choose = (kind: CommandKind, actions: SiegeAction[]): SiegeCommand => {
    if (!kinds.includes(kind)) return { kind, reason: null };
    for (const action of actions)
      if (plausible(action) && actionReason(state, action) === null)
        return { kind, action, reason: null };
    const action = actions[0] ?? { type: 'suppress', unitId: id, targetId: '' };
    return { kind, action, reason: actionReason(state, action) };
  };
  const attacks: SiegeAction[] = state.units
    .filter((u) => u.side !== playerSide && u.troops > 0)
    .map((u) =>
      unit
        ? { type: 'attack', unitId: id, targetId: u.id }
        : { type: 'attack', engineId: id, targetId: u.id },
    );
  if (unit?.side === 'shu')
    attacks.push(
      ...(Object.keys(GATES) as Array<keyof typeof GATES>).map((gateId) => ({
        type: 'attack' as const,
        unitId: id,
        gateId,
      })),
    );
  const commanderTarget =
    unit?.side === playerSide
      ? unit.id
      : (state.units.find((u) => u.side === playerSide && u.troops > 0)?.id ?? '');
  const commands: SiegeCommand[] = [
    choose(
      'openGate',
      Object.values(GATES).map((gate) => ({ type: 'openGate', unitId: id, gateId: gate.id })),
    ),
    ...(['lightBrazier', 'hoistMillstone', 'stackBoulders'] as const).map((kind) =>
      choose(kind, [{ type: kind, unitId: id }]),
    ),
    ...(['fireArrows', 'dropMillstone', 'dropBoulders'] as const).map((kind) =>
      choose(
        kind,
        extraActionTargets(state, id, kind, playerSide).length
          ? extraActionTargets(state, id, kind, playerSide)
          : [
              kind === 'dropBoulders'
                ? { type: kind, unitId: id, targetId: '' }
                : { type: kind, unitId: id, engineId: '' },
            ],
      ),
    ),
    choose(
      'suppress',
      state.units
        .filter((u) => u.side !== playerSide && u.troops > 0)
        .map((u): SiegeAction =>
          unit
            ? { type: 'suppress', unitId: id, targetId: u.id }
            : { type: 'suppress', engineId: id, targetId: u.id },
        ),
    ),
    choose(
      'coverEngine',
      state.engines.length
        ? state.engines.map((e): SiegeAction => ({
            type: 'coverEngine',
            unitId: id,
            engineId: e.id,
          }))
        : [{ type: 'coverEngine', unitId: id, engineId: '' }],
    ),
    choose(
      'pileEarth',
      SOUTH_TRENCH.filter((c) => c.y === Math.min(...SOUTH_TRENCH.map((p) => p.y))).map(
        (c): SiegeAction =>
          unit
            ? { type: 'pileEarth', unitId: id, ...c }
            : { type: 'pileEarth', engineId: id, ...c },
      ),
    ),
    choose('move', [moveAction(move[0] ?? { x: -1, y: -1, level: 'ground' })]),
    choose('attack', attacks.length ? attacks : [{ type: 'attack', unitId: id, targetId: '' }]),
    choose('climb', [
      { type: 'climb', unitId: id },
      {
        type: 'move',
        unitId: id,
        ...(unit?.level === 'ground'
          ? (move.find((p) => p.level === 'wall') ?? { x: -1, y: -1, level: 'wall' as const })
          : { x: -1, y: -1, level: 'wall' as const }),
      },
    ]),
    choose('raiseLadder', [
      { type: 'raiseLadder', engineId: unraisedLadderUnder(state, id)?.id ?? id },
    ]),
    choose(
      'fillTrench',
      SOUTH_TRENCH.map((c) =>
        unit
          ? { type: 'fillTrench', unitId: id, ...c }
          : { type: 'fillTrench', engineId: id, ...c },
      ),
    ),
    choose('buildWall', [{ type: 'buildWall', unitId: id }]),
    choose(
      'ram',
      (Object.keys(GATES) as Array<keyof typeof GATES>).map((gateId) => ({
        type: 'ram',
        engineId: id,
        gateId,
      })),
    ),
    choose('order', [{ type: 'order', side: playerSide, kind: 'rally', target: commanderTarget }]),
    {
      kind: 'standby' as const,
      reason: unit
        ? activeUnit(unit) && !unit.acted
          ? null
          : 'This attacker cannot act today.'
        : engine && usableEngine(engine) && !engine.acted
          ? null
          : 'This attacker cannot act today.',
    },
  ];
  return commands
    .filter((c) => kinds.includes(c.kind))
    .sort((a, b) => Number(Boolean(a.reason)) - Number(Boolean(b.reason)));
}
export function standBy(state: SiegeState, id: string, playerSide: SiegeSide = 'shu'): SiegeState {
  const unit = state.units.find((u) => u.id === id),
    engine = state.engines.find((e) => e.id === id);
  if (
    state.outcome ||
    (unit
      ? unit.side !== playerSide || !activeUnit(unit) || unit.acted
      : playerSide !== 'shu' || !engine || !usableEngine(engine) || engine.acted)
  )
    return state;
  const next = cloneSiegeState(state);
  const actor = next.units.find((u) => u.id === id) ?? next.engines.find((e) => e.id === id)!;
  actor.moved = true;
  actor.acted = true;
  next.log.push({
    day: next.day,
    code: 'standby',
    params: { ...('side' in actor ? { unitId: id } : { engineId: id }) },
  });
  return next;
}
export function deployUnit(
  state: SiegeState,
  id: string,
  to: SiegePosition,
  playerSide: SiegeSide = 'shu',
): SiegeState {
  const unit = state.units.find((u) => u.id === id && u.side === playerSide);
  const cells = playerSide === 'shu' ? DEPLOY_SHU : DEPLOY_WEI;
  if (!unit || !cells.some((c) => sameCell(c, to) && to.level === c.level)) return state;
  if (
    state.engines.some(
      (engine) => sameCell(engine, to) && !(engine.kind === 'ladder' && usableEngine(engine)),
    )
  )
    return state;
  const next = cloneSiegeState(state),
    actor = next.units.find((u) => u.id === id)!;
  const other = next.units.find((u) => u.id !== id && u.troops > 0 && sameCell(u, to));
  if (other && other.side !== playerSide) return state;
  if (other) Object.assign(other, { x: actor.x, y: actor.y, level: actor.level });
  Object.assign(actor, { x: to.x, y: to.y, level: to.level });
  return next;
}

/** Cycle from the selected roster position, including when that unit just spent its action. */
export function nextShuUnit(
  state: SiegeState,
  selected: string | null,
  playerSide: SiegeSide = 'shu',
) {
  const roster = state.units.filter((unit) => unit.side === playerSide);
  const index = roster.findIndex((unit) => unit.id === selected);
  for (let offset = 1; offset <= roster.length; offset++) {
    const candidate = roster[(index + offset) % roster.length]!;
    if (activeUnit(candidate) && !candidate.acted) return candidate;
  }
  return null;
}

/** Presentation standby uses the existing per-actor standby operation. */
export function standByAll(state: SiegeState, playerSide: SiegeSide) {
  if (state.outcome) return state;
  let next = state;
  for (const unit of state.units.filter(
    (u) => u.side === playerSide && activeUnit(u) && (!u.acted || !u.moved),
  )) {
    // An actor that already acted may still have a move; standby finishes that move too.
    if (unit.acted) {
      if (next === state) next = cloneSiegeState(state);
      next.units.find((u) => u.id === unit.id)!.moved = true;
    } else next = standBy(next, unit.id, playerSide);
  }
  if (playerSide === 'shu')
    for (const engine of state.engines.filter((e) => usableEngine(e) && (!e.acted || !e.moved))) {
      if (engine.acted) {
        if (next === state) next = cloneSiegeState(state);
        next.engines.find((e) => e.id === engine.id)!.moved = true;
      } else next = standBy(next, engine.id, playerSide);
    }
  return next;
}

export function extraActionTargets(
  state: SiegeState,
  id: string,
  kind: ExtraCommandKind,
  playerSide: SiegeSide = 'shu',
): SiegeAction[] {
  const unit = state.units.find((u) => u.id === id);
  if (kind === 'fireArrows' || kind === 'dropMillstone')
    return state.engines
      .filter(usableEngine)
      .map((e) => ({ type: kind, unitId: id, engineId: e.id }));
  if (kind === 'dropBoulders')
    return state.units
      .filter((u) => u.side !== playerSide && activeUnit(u))
      .map((u) => ({ type: kind, unitId: id, targetId: u.id }));
  if (kind === 'coverEngine')
    return state.engines
      .filter(usableEngine)
      .map((e) => ({ type: kind, unitId: id, engineId: e.id }));
  if (kind === 'suppress')
    return state.units
      .filter((u) => u.side !== playerSide && activeUnit(u))
      .map((u) =>
        unit
          ? { type: kind, unitId: id, targetId: u.id }
          : { type: kind, engineId: id, targetId: u.id },
      );
  const actor = unit ?? state.engines.find((e) => e.id === id);
  return SOUTH_TRENCH.filter(
    (c) =>
      c.y === Math.min(...SOUTH_TRENCH.map((p) => p.y)) &&
      actor &&
      Math.abs(c.x - actor.x) + Math.abs(c.y - actor.y) === 1,
  ).map((c) => (unit ? { type: kind, unitId: id, ...c } : { type: kind, engineId: id, ...c }));
}
