import type { SiegeState } from './types';

const silentLogs = new WeakSet<SiegeState['log']>();
export function silenceSiegeLog(log: SiegeState['log']): void {
  silentLogs.add(log);
}
export function isSilentSiegeLog(log: SiegeState['log']): boolean {
  return silentLogs.has(log);
}

/** Log entries are append-only values; drafts own their array, not the old entries.
 * Combat also uses this for branch-local drafts, retaining its active actor references.
 */
export function cloneSiegeState<T extends Pick<SiegeState, 'log'>>(state: T): T {
  const { log, ...rest } = state;
  const copy = log.slice();
  if (silentLogs.has(log)) silentLogs.add(copy);
  return { ...structuredClone(rest), log: copy } as T;
}
