import { DEPLOY_SHU, GATES, SOUTH_TRENCH, sameCell } from '../content/chencang';
import { applySiegeAction } from '../rules/actions';
import { activeUnit, usableEngine } from '../rules/combat';
import { engineReachable, reachableCells } from '../rules/movement';
import type { SiegeAction, SiegePosition, SiegeState } from '../rules/types';

export type CommandKind =
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
export function actionReason(state: SiegeState, action: SiegeAction): string | null {
  const result = applySiegeAction(state, action);
  return result.ok ? null : result.reason;
}
/** Every action entry uses the same validator as its eventual execution. */
export function siegeCommands(state: SiegeState, id: string): SiegeCommand[] {
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
    const action = actions[0]!;
    return { kind, action, reason: actionReason(state, action) };
  };
  const attacks: SiegeAction[] = state.units
    .filter((u) => u.side === 'wei' && u.troops > 0)
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
    unit?.side === 'shu'
      ? unit.id
      : (state.units.find((u) => u.side === 'shu' && u.troops > 0)?.id ?? '');
  const commands = [
    choose('move', [moveAction(move[0] ?? { x: -1, y: -1, level: 'ground' })]),
    choose('attack', attacks.length ? attacks : [{ type: 'attack', unitId: id, targetId: '' }]),
    choose('climb', [
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
    choose('order', [{ type: 'order', side: 'shu', kind: 'rally', target: commanderTarget }]),
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
  // The defender is visible and inspectable, but receives its actions from the AI.
  if (unit?.side === 'wei')
    return commands.map((c) => ({ ...c, reason: 'Choose a living friendly unit.' }));
  return commands;
}
export function standBy(state: SiegeState, id: string): SiegeState {
  const unit = state.units.find((u) => u.id === id),
    engine = state.engines.find((e) => e.id === id);
  if (
    state.outcome ||
    (unit
      ? unit.side !== 'shu' || !activeUnit(unit) || unit.acted
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
export function nextShuUnit(state: SiegeState, selected: string | null) {
  const roster = state.units.filter((unit) => unit.side === 'shu');
  const index = roster.findIndex((unit) => unit.id === selected);
  for (let offset = 1; offset <= roster.length; offset++) {
    const candidate = roster[(index + offset) % roster.length]!;
    if (activeUnit(candidate) && !candidate.acted) return candidate;
  }
  return null;
}
