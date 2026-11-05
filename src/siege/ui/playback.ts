import { cloneSiegeState } from '../rules/clone';
import { defenderTurnSteps, planDefenderTurn } from '../ai/defender';
import {
  attackerMethodForSeed,
  attackerTurnSteps,
  planAttackerTurn,
  runAttackerTurn,
} from '../ai/attacker';
import { applySiegeAction } from '../rules/actions';
import { endDay } from '../rules/day';
import type { SiegeAction, SiegeState, SiegeSide } from '../rules/types';
import { nightReplay, type NightPresentation } from '../render/nightReplay';
export interface PlaybackFrame {
  state: SiegeState;
  action: SiegeAction;
  night?: NightPresentation;
}
/** Presentation frames are disposable. The final result always comes from the tested daily resolver. */
export function resolveAttackerPhase(state: SiegeState): {
  frames: PlaybackFrame[];
  final: SiegeState;
} {
  // The opponent receives no unresolved Wei night order, even when called from a dev fixture.
  const visible = cloneSiegeState(state);
  delete visible.nightOrders.wei;
  const method = attackerMethodForSeed(state.seed);
  const final = runAttackerTurn(visible, method);
  if (state.nightOrders.wei) final.nightOrders.wei = structuredClone(state.nightOrders.wei);
  let draft = visible;
  const frames: PlaybackFrame[] = [];
  for (const action of planAttackerTurn(visible, method)) {
    const result = applySiegeAction(draft, action);
    if (result.ok) {
      draft = result.state;
      frames.push({ state: draft, action });
    }
  }
  return { frames, final };
}
export function resolveSiegeDay(
  state: SiegeState,
  playerSide: SiegeSide = 'shu',
): { frames: PlaybackFrame[]; final: SiegeState } {
  let draft = state;
  const frames: PlaybackFrame[] = [];
  for (const action of playerSide === 'shu' ? planDefenderTurn(state) : []) {
    const result = applySiegeAction(draft, action);
    if (result.ok) {
      draft = result.state;
      frames.push({ state: draft, action });
    }
  }
  const final = endDay(draft);
  frames.push(
    ...nightReplay(draft, final).map((frame) => ({
      ...frame,
      action: { type: 'endDay' as const },
    })),
  );
  if (playerSide === 'wei' && !final.outcome) {
    const attacker = resolveAttackerPhase(final);
    frames.push(...attacker.frames);
    return { frames, final: attacker.final };
  }
  return { frames, final };
}

/** A task boundary, unlike a resolved Promise/microtask, lets the browser handle input. */
export function yieldSiegeTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/** Consume the same AI actions in the same order, yielding only between actions. */
export async function resolveSiegeDayAsync(
  state: SiegeState,
  playerSide: SiegeSide = 'shu',
  yieldTask: () => Promise<void> = yieldSiegeTask,
): Promise<{ frames: PlaybackFrame[]; final: SiegeState }> {
  let draft = state;
  const frames: PlaybackFrame[] = [];
  if (playerSide === 'shu')
    for (const frame of defenderTurnSteps(state)) {
      draft = frame.state;
      frames.push(frame);
      await yieldTask();
    }
  const final = endDay(draft);
  frames.push(
    ...nightReplay(draft, final).map((frame) => ({
      ...frame,
      action: { type: 'endDay' as const },
    })),
  );
  if (playerSide === 'wei' && !final.outcome) {
    await yieldTask();
    const attacker = await resolveAttackerPhaseAsync(final, yieldTask);
    frames.push(...attacker.frames);
    return { frames, final: attacker.final };
  }
  return { frames, final };
}

export async function resolveAttackerPhaseAsync(
  state: SiegeState,
  yieldTask: () => Promise<void> = yieldSiegeTask,
): Promise<{ frames: PlaybackFrame[]; final: SiegeState }> {
  const visible = cloneSiegeState(state);
  delete visible.nightOrders.wei;
  const steps = attackerTurnSteps(visible, attackerMethodForSeed(state.seed));
  const frames: PlaybackFrame[] = [];
  let step = steps.next();
  while (!step.done) {
    frames.push(step.value);
    await yieldTask();
    step = steps.next();
  }
  // Keep the opponent's hidden order out of every presentation frame as before.
  const final = cloneSiegeState(step.value.state);
  if (state.nightOrders.wei) final.nightOrders.wei = structuredClone(state.nightOrders.wei);
  return { frames, final };
}
