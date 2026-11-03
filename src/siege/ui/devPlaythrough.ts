import { runShuScript, type ShuStrategy } from '../ai/scripts';
import type { SiegeState } from '../rules/types';
import type { SiegeSave } from '../save';

/** Imported by the UI only inside import.meta.env.DEV. Uses the simulation's unmodified rules. */
export function playScriptDays(state: SiegeState, strategy: ShuStrategy, days = 21): SiegeState {
  if (
    !['competent', 'brute'].includes(strategy) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 21
  )
    throw new Error('Use competent or brute and between 1 and 21 days.');
  let next = state;
  for (let i = 0; i < days && !next.outcome; i++) next = runShuScript(next, strategy);
  return next;
}
export interface SiegeDev {
  playScript: (strategy: ShuStrategy, days?: number) => Promise<SiegeState['outcome']>;
  snapshot: () => SiegeSave;
}
declare global {
  interface Window {
    __siegeDev?: SiegeDev;
  }
}
