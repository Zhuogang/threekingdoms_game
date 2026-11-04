import { DEPLOY_SHU, GATES, SOUTH_TRENCH, sameCell } from '../content/chencang';
import { applySiegeAction } from '../rules/actions';
import { activeUnit, usableEngine, predictSiegeClimb, climbingPosition } from '../rules/combat';
import { siegeText, type SiegeLocale } from '../i18n';
import { placeName } from './places';
import { engineReachable, reachableCells } from '../rules/movement';
import type { SiegeAction, SiegePosition, SiegeState, SiegeSide } from '../rules/types';

export type CommandKind =
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
export function actorCommandKinds(
  state: SiegeState,
  id: string,
  playerSide: SiegeSide,
): CommandKind[] {
  const unit = state.units.find((u) => u.id === id);
  if (unit) {
    if (unit.side !== playerSide) return [];
    if (unit.side === 'wei') return ['move', 'attack', 'buildWall', 'order', 'standby'];
    return unit.troopType === 'archer'
      ? ['move', 'attack', 'suppress', 'order', 'standby']
      : ['move', 'attack', 'coverEngine', 'pileEarth', 'climb', 'fillTrench', 'order', 'standby'];
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

export function actionContext(state: SiegeState, id: string, locale: SiegeLocale) {
  const unit = state.units.find((u) => u.id === id);
  const actor = unit ?? state.engines.find((e) => e.id === id);
  if (!actor) return '';
  if (unit && unit.troopType !== 'archer') {
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
  const result = applySiegeAction(state, action);
  return result.ok ? null : result.reason;
}
/** Every action entry uses the same validator as its eventual execution. */
export function siegeCommands(
  state: SiegeState,
  id: string,
  playerSide: SiegeSide = 'shu',
): SiegeCommand[] {
  const unit = state.units.find((u) => u.id === id),
    engine = state.engines.find((e) => e.id === id);
  const move = unit ? reachableCells(state, id) : engineReachable(state, id);
  const moveAction = (p: SiegePosition): SiegeAction =>
    unit
      ? { type: 'move', unitId: id, ...p }
      : { type: 'moveEngine', engineId: id, x: p.x, y: p.y };
  const choose = (kind: CommandKind, actions: SiegeAction[]): SiegeCommand => {
    for (const action of actions)
      if (actionReason(state, action) === null) return { kind, action, reason: null };
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
  if (unit)
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
    choose('raiseLadder', [{ type: 'raiseLadder', engineId: id }]),
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
  const kinds = actorCommandKinds(state, id, playerSide);
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
      : !engine || !usableEngine(engine) || engine.acted)
  )
    return state;
  const next = structuredClone(state);
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
export function deployUnit(state: SiegeState, id: string, to: SiegePosition): SiegeState {
  const unit = state.units.find((u) => u.id === id && u.side === 'shu');
  if (!unit || !DEPLOY_SHU.some((c) => sameCell(c, to) && to.level === 'ground')) return state;
  const next = structuredClone(state),
    actor = next.units.find((u) => u.id === id)!;
  const other = next.units.find((u) => u.id !== id && u.level === 'ground' && sameCell(u, to));
  if (other && other.side !== 'shu') return state;
  if (other) Object.assign(other, { x: actor.x, y: actor.y });
  Object.assign(actor, to);
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
      if (next === state) next = structuredClone(state);
      next.units.find((u) => u.id === unit.id)!.moved = true;
    } else next = standBy(next, unit.id, playerSide);
  }
  if (playerSide === 'shu')
    for (const engine of state.engines.filter((e) => usableEngine(e) && (!e.acted || !e.moved))) {
      if (engine.acted) {
        if (next === state) next = structuredClone(state);
        next.engines.find((e) => e.id === engine.id)!.moved = true;
      } else next = standBy(next, engine.id, playerSide);
    }
  return next;
}

export function extraActionTargets(
  state: SiegeState,
  id: string,
  kind: 'suppress' | 'coverEngine' | 'pileEarth',
  playerSide: SiegeSide = 'shu',
): SiegeAction[] {
  const unit = state.units.find((u) => u.id === id);
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
