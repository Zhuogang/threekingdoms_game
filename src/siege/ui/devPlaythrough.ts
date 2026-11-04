import { runAttackerTurn, type AttackerMethod } from '../ai/attacker';
import { runDefenderTurn } from '../ai/defender';
import { endDay } from '../rules/day';
import type { SiegeState } from '../rules/types';
import type { SiegeSave } from '../save';

/** Imported by the UI only inside import.meta.env.DEV. Uses the simulation's unmodified rules. */
export function playScriptDays(state: SiegeState, strategy: AttackerMethod, days = 21): SiegeState {
  if (
    !['careful', 'anyPrice', 'brute'].includes(strategy) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 21
  )
    throw new Error('Use careful, anyPrice or brute and between 1 and 21 days.');
  let next = state;
  for (let i = 0; i < days && !next.outcome; i++)
    next = endDay(runDefenderTurn(runAttackerTurn(next, strategy)));
  return next;
}
export interface SiegeDev {
  playScript: (strategy: AttackerMethod, days?: number) => Promise<SiegeState['outcome']>;
  snapshot: () => SiegeSave;
}
declare global {
  interface Window {
    __siegeDev?: SiegeDev;
  }
}
