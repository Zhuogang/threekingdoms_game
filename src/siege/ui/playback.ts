import { planDefenderTurn, runDefenderTurn } from '../ai/defender';
import { applySiegeAction } from '../rules/actions';
import { endDay } from '../rules/day';
import type { SiegeAction, SiegeState } from '../rules/types';
export interface PlaybackFrame {
  state: SiegeState;
  action: SiegeAction;
}
/** Presentation frames are disposable. The final result always comes from the tested daily resolver. */
export function resolveSiegeDay(state: SiegeState): { frames: PlaybackFrame[]; final: SiegeState } {
  let draft = state;
  const frames: PlaybackFrame[] = [];
  for (const action of planDefenderTurn(state)) {
    const result = applySiegeAction(draft, action);
    if (result.ok) {
      draft = result.state;
      frames.push({ state: draft, action });
    }
  }
  return { frames, final: endDay(state, runDefenderTurn) };
}
