import { attackerMethodForSeed, runAttackerTurn, type AttackerMethod } from '../ai/attacker';
import { SIEGE_TUNING as T } from '../rules/tuning';
import { runDefenderTurn } from '../ai/defender';
import { endDay } from '../rules/day';
import type { SiegeState, SiegeSide } from '../rules/types';
import type { SiegeSave } from '../save';

/** Imported by the UI only inside import.meta.env.DEV. Uses the simulation's unmodified rules. */
export function playScriptDays(
  state: SiegeState,
  strategy: AttackerMethod,
  days: number = T.days,
  playerSide: SiegeSide = 'shu',
): SiegeState {
  if (
    !['careful', 'anyPrice', 'brute'].includes(strategy) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > T.days
  )
    throw new Error(`Use careful, anyPrice or brute and between 1 and ${T.days} days.`);
  let next = state;
  for (let i = 0; i < days && !next.outcome; i++) {
    if (playerSide === 'shu') next = endDay(runDefenderTurn(runAttackerTurn(next, strategy)));
    else {
      // A Wei UI snapshot already includes this morning’s Shu phase.
      next = endDay(runDefenderTurn(next));
      if (!next.outcome) next = runAttackerTurn(next, attackerMethodForSeed(next.seed));
    }
  }
  return next;
}
export interface SiegeDev {
  renderCounts: { static: number; units: number; overlays: number };
  playScript: (strategy: AttackerMethod, days?: number) => Promise<SiegeState['outcome']>;
  snapshot: () => SiegeSave;
}
declare global {
  interface Window {
    __siegeDev?: SiegeDev;
  }
}
