import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { actorTodo, nextActor } from '../../src/siege/ui/actorTodo';
import { actionContext, siegeCommands } from '../../src/siege/ui/commands';
import { applySiegeAction } from '../../src/siege/rules/actions';
import { createSiegeState } from '../../src/siege/rules/state';
import { endDay } from '../../src/siege/rules/day';
import { runAttackerTurn } from '../../src/siege/ai/attacker';
import { runDefenderTurn } from '../../src/siege/ai/defender';

// This rule bot audits the UI queue. It makes no claim about mouse input or balance.
describe('V3 todo bot, both player sides', () => {
  for (const side of ['shu', 'wei'] as const)
    it.each([1, 7, 228])(
      `${side} seed %i never selects a status-only actor`,
      (seed) => {
        let state = createSiegeState(seed);
        let days = 0,
          actions = 0,
          moves = 0,
          statusOnly = 0,
          selections = 0;
        while (!state.outcome) {
          if (side === 'wei') state = runAttackerTurn(state, 'careful');
          let current: string | null = null;
          let count = 0;
          while (!state.outcome) {
            const next = nextActor(state, current, side);
            if (!next) break;
            const todo = actorTodo(state, next.id, side);
            expect(todo).not.toBe('none');
            const candidates = siegeCommands(state, next.id, side).filter(
              (c) => !c.reason && c.action && c.kind !== 'order' && c.kind !== 'standby',
            );
            const command = candidates.find((c) =>
              todo === 'act'
                ? c.action!.type !== 'move' && c.action!.type !== 'moveEngine'
                : c.action!.type === 'move' || c.action!.type === 'moveEngine',
            );
            expect(command?.action, `${side}/${seed}/${state.day}/${next.id}/${todo}`).toBeTruthy();
            const result = applySiegeAction(state, command!.action!);
            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error(result.reason);
            state = result.state;
            current = next.id;
            selections++;
            if (todo === 'act') actions++;
            else moves++;
            expect(++count).toBeLessThan(60);
          }
          for (const actor of [
            ...state.units.filter((u) => u.side === side),
            ...(side === 'shu' ? state.engines : []),
          ]) {
            if (actorTodo(state, actor.id, side) === 'none' && actionContext(state, actor.id, 'en'))
              statusOnly++;
          }
          days++;
          if (state.outcome) break;
          if (side === 'shu') state = runDefenderTurn(state);
          state = endDay(state);
          expect(days).toBeLessThanOrEqual(12);
        }
        const metrics = {
          side,
          seed,
          days,
          selections,
          actions,
          moves,
          statusOnly,
          idleSelections: 0,
          illegalActions: 0,
          outcome: state.outcome,
        };
        mkdirSync('.artifacts/siege/v3-checks', { recursive: true });
        writeFileSync(
          `.artifacts/siege/v3-checks/todo-bot-${side}-${seed}.json`,
          JSON.stringify(metrics, null, 2) + '\n',
        );
        console.info('V3 todo bot', JSON.stringify(metrics));
        expect(statusOnly).toBeGreaterThan(0);
      },
      120000,
    );
});
