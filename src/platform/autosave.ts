import { factionById } from '../content/scenario';
import type { GameState } from '../game/types';
import { saveSlot } from './saves';

export interface AutosaveStatus {
  status: 'idle' | 'saving' | 'saved' | 'error';
  error: string | null;
}

let snapshot: AutosaveStatus = { status: 'idle', error: null };
let latestState: GameState | null = null;
let generation = 0;
let guardInstalled = false;
const listeners = new Set<() => void>();

function publish(status: AutosaveStatus) {
  snapshot = status;
  listeners.forEach((listener) => listener());
}

function installNavigationGuard() {
  if (guardInstalled || typeof window === 'undefined') return;
  guardInstalled = true;
  window.addEventListener('beforeunload', (event) => {
    if (snapshot.status !== 'saving' && snapshot.status !== 'error') return;
    event.preventDefault();
    event.returnValue = '';
  });
}

/**
 * The session invokes save synchronously when it accepts a command, starts a
 * campaign, or restores a snapshot. React only observes this store: saving does
 * not wait for an effect or depend on whether a UI component is still mounted.
 */
export const autosave = {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  save: (state: GameState): Promise<void> => {
    installNavigationGuard();
    latestState = state;
    const token = ++generation;
    publish({ status: 'saving', error: null });
    const name = `${factionById(state.playerFactionId)?.name ?? state.playerFactionId} · ${state.year}-${String(state.month).padStart(2, '0')}`;
    return saveSlot('auto', name, state).then(
      () => {
        if (token === generation) publish({ status: 'saved', error: null });
      },
      (error: unknown) => {
        if (token === generation)
          publish({
            status: 'error',
            error: error instanceof Error ? error.message : 'Could not save your campaign.',
          });
      },
    );
  },
  retry: (): Promise<void> => (latestState ? autosave.save(latestState) : Promise.resolve()),
};
