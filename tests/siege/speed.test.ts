import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { GATES, SOUTH_TRENCH, sameCell } from '../../src/siege/content/chencang';
import { applySiegeAction, validateSiegeAction } from '../../src/siege/rules/actions';
import { cloneSiegeState } from '../../src/siege/rules/clone';
import { activeUnit, usableEngine } from '../../src/siege/rules/combat';
import { engineReachable, reachableCells } from '../../src/siege/rules/movement';
import { createSiegeState } from '../../src/siege/rules/state';
import { endDay } from '../../src/siege/rules/day';
import { runAttackerTurn, type AttackerMethod } from '../../src/siege/ai/attacker';
import { runDefenderTurn } from '../../src/siege/ai/defender';
import {
  actionContext,
  actorCommandKinds,
  extraActionTargets,
  siegeCommands,
  type CommandKind,
  type SiegeCommand,
} from '../../src/siege/ui/commands';
import type {
  SiegeAction,
  SiegePosition,
  SiegeState,
  SiegeSide,
} from '../../src/siege/rules/types';

const metrics: Array<{
  method: string;
  seed: number;
  states: number;
  commandChecks: number;
  candidateChecks: number;
  legal: number;
  rejected: number;
}> = [];
afterAll(() => {
  mkdirSync('.artifacts/siege', { recursive: true });
  writeFileSync(
    '.artifacts/siege/q-equivalence-metrics.json',
    JSON.stringify(metrics, null, 2) + '\n',
  );
});

function executionReason(state: SiegeState, action: SiegeAction): string | null {
  const result = applySiegeAction(state, action);
  return result.ok ? null : result.reason;
}
// Frozen reference from before Q. Deliberately retains every exhaustive candidate,
// original ordering and execution-based legality rather than sharing the optimisation.
function exhaustiveCommands(
  state: SiegeState,
  id: string,
  playerSide: SiegeSide,
  visit: (actions: SiegeAction[]) => void = () => {},
): SiegeCommand[] {
  const unit = state.units.find((u) => u.id === id),
    engine = state.engines.find((e) => e.id === id);
  const move = unit ? reachableCells(state, id) : engineReachable(state, id);
  const moveAction = (p: SiegePosition): SiegeAction =>
    unit
      ? { type: 'move', unitId: id, ...p }
      : { type: 'moveEngine', engineId: id, x: p.x, y: p.y };
  const choose = (kind: CommandKind, actions: SiegeAction[]): SiegeCommand => {
    visit(actions);
    for (const action of actions)
      if (executionReason(state, action) === null) return { kind, action, reason: null };
    const action = actions[0] ?? { type: 'suppress', unitId: id, targetId: '' };
    return { kind, action, reason: executionReason(state, action) };
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
    // R adds the unit-panel entry point; keep the exhaustive reference aligned.
    choose('raiseLadder', [
      {
        type: 'raiseLadder',
        engineId:
          unit?.side === 'shu' && unit.troopType === 'infantry' && unit.level === 'ground'
            ? (state.engines.find(
                (e) => e.kind === 'ladder' && usableEngine(e) && !e.raisedAt && sameCell(e, unit),
              )?.id ?? id)
            : id,
      },
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
  const kinds = actorCommandKinds(state, id, playerSide);
  return commands
    .filter((c) => kinds.includes(c.kind))
    .sort((a, b) => Number(Boolean(a.reason)) - Number(Boolean(b.reason)));
}
function freezeLog(state: SiegeState) {
  for (const entry of state.log) {
    Object.freeze(entry.params);
    Object.freeze(entry);
  }
}
function sampledStates(method: AttackerMethod, seed: number) {
  const samples: SiegeState[] = [];
  let state = createSiegeState(seed);
  while (!state.outcome) {
    const sample = [1, 3, 6, 9, 12].includes(state.day);
    if (sample) samples.push(state);
    freezeLog(state);
    state = runAttackerTurn(state, method);
    if (sample) samples.push(state);
    freezeLog(state);
    state = runDefenderTurn(state);
    if (sample) samples.push(state);
    freezeLog(state);
    state = endDay(state);
  }
  samples.push(state);
  return samples;
}
function addCandidates(state: SiegeState, candidates: Map<string, SiegeAction>) {
  const add = (action: SiegeAction) => candidates.set(JSON.stringify(action), action);
  add({ type: 'endDay' });
  add({ type: 'withdraw' });
  for (const unit of state.units) {
    for (const position of reachableCells(state, unit.id))
      add({ type: 'move', unitId: unit.id, ...position });
    add({ type: 'move', unitId: unit.id, x: -1, y: -1, level: 'wall' });
    add({ type: 'climb', unitId: unit.id, assault: true });
    for (const target of state.units.filter((u) => u.side !== unit.side))
      add({ type: 'attack', unitId: unit.id, targetId: target.id, assault: true });
  }
  for (const engine of state.engines)
    for (const position of engineReachable(state, engine.id))
      add({ type: 'moveEngine', engineId: engine.id, x: position.x, y: position.y });
  add({ type: 'order', side: 'shu', kind: 'nightAssault' });
  add({ type: 'order', side: 'wei', kind: 'torches' });
  for (const unit of state.units) {
    add({ type: 'order', side: unit.side, kind: 'rally', target: unit.id });
    add({ type: 'order', side: 'shu', kind: 'rotate', target: unit.id });
    add({ type: 'order', side: 'wei', kind: 'holdFast', target: unit.id });
    add({ type: 'order', side: 'wei', kind: 'holdFast', target: { x: unit.x, y: unit.y } });
  }
  for (const gateId of Object.keys(GATES) as Array<keyof typeof GATES>)
    add({ type: 'order', side: 'wei', kind: 'nightRepair', target: gateId });
  for (const engine of state.engines)
    add({ type: 'order', side: 'wei', kind: 'sortie', target: engine.id });
  for (const workshop of state.workshops)
    add({ type: 'order', side: 'shu', kind: 'supervise', target: workshop.id });
  for (const side of ['shu', 'wei'] as const)
    add({ type: 'order', side, kind: 'rally', target: 'missing' });
  for (const workshopId of [...state.workshops.map((w) => w.id), 'missing'])
    for (const kind of ['ladder', 'ram', 'earthCart', 'tower'] as const)
      add({ type: 'queueEngine', workshopId, kind });
}

describe('Q state copies and exhaustive legality equivalence', () => {
  it('copies every mutable state branch independently, sharing only append-only log entries', () => {
    const state = createSiegeState(228);
    state.log.push({ day: 1, code: 'probe', params: { value: 17 } });
    const copy = cloneSiegeState(state);
    expect(copy).toEqual(state);
    const independent = (before: unknown, after: unknown) => {
      if (!before || typeof before !== 'object') return;
      expect(after).not.toBe(before);
      for (const key of Object.keys(before))
        independent(
          (before as Record<string, unknown>)[key],
          (after as Record<string, unknown>)[key],
        );
    };
    const { log: beforeLog, ...before } = state;
    const { log: afterLog, ...after } = copy;
    independent(before, after);
    expect(afterLog).not.toBe(beforeLog);
    expect(afterLog[0]).toBe(beforeLog[0]);
    copy.units[0]!.morale--;
    copy.stats.nightResults.push({ day: 1, kind: 'probe', result: 'hit' });
    copy.log.push({ day: 1, code: 'new', params: {} });
    expect(state.units[0]!.morale).toBe(copy.units[0]!.morale + 1);
    expect(state.stats.nightResults).toHaveLength(0);
    expect(state.log).toHaveLength(1);
  });

  for (const method of ['careful', 'anyPrice', 'brute'] as const)
    it.each([1, 228])(
      `${method} seed %i preserves all reasons, chosen commands, caches and old log entries`,
      (seed) => {
        const samples = sampledStates(method, seed);
        let commandChecks = 0;
        let candidateChecks = 0;
        let legal = 0;
        for (const state of samples) {
          freezeLog(state);
          const before = structuredClone(state);
          const candidates = new Map<string, SiegeAction>();
          for (const side of ['shu', 'wei'] as const)
            for (const actor of [...state.units, ...state.engines, { id: 'missing' }]) {
              const expected = exhaustiveCommands(state, actor.id, side, (actions) => {
                for (const action of actions) candidates.set(JSON.stringify(action), action);
              });
              const commands = siegeCommands(state, actor.id, side);
              expect(commands, `${method}/${seed}/${state.day}/${side}/${actor.id}`).toEqual(
                expected,
              );
              expect(siegeCommands(state, actor.id, side)).toBe(commands);
              commandChecks++;
            }
          addCandidates(state, candidates);
          for (const action of candidates.values()) {
            const reason = validateSiegeAction(state, action);
            expect(reason, JSON.stringify(action)).toBe(executionReason(state, action));
            if (reason === null) legal++;
            candidateChecks++;
          }
          for (const locale of ['en', 'zh'] as const) {
            const id = state.units[1]!.id;
            expect(actionContext(state, id, locale)).toBe(actionContext(state, id, locale));
            expect(siegeCommands(cloneSiegeState(state), id)).not.toBe(siegeCommands(state, id));
          }
          expect(state).toEqual(before);
        }
        metrics.push({
          method,
          seed,
          states: samples.length,
          commandChecks,
          candidateChecks,
          legal,
          rejected: candidateChecks - legal,
        });
        console.info(
          'Q equivalence',
          JSON.stringify({
            method,
            seed,
            states: samples.length,
            commandChecks,
            candidateChecks,
            legal,
            rejected: candidateChecks - legal,
          }),
        );
      },
      120000,
    );
});
