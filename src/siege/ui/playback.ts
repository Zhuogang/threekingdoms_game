import { planDefenderTurn } from '../ai/defender';
import { attackerMethodForSeed, planAttackerTurn, runAttackerTurn } from '../ai/attacker';
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
  const visible = structuredClone(state);
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
