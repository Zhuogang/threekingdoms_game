import { planDefenderTurn } from '../ai/defender';
import { applySiegeAction } from '../rules/actions';
import { endDay } from '../rules/day';
import type { SiegeAction, SiegeState } from '../rules/types';
import { nightReplay, type NightPresentation } from '../render/nightReplay';
export interface PlaybackFrame {
  state: SiegeState;
  action: SiegeAction;
  night?: NightPresentation;
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
  const final = endDay(draft);
  frames.push(
    ...nightReplay(draft, final).map((frame) => ({
      ...frame,
      action: { type: 'endDay' as const },
    })),
  );
  return { frames, final };
}
