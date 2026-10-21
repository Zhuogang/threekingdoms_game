import { createGame, dispatch, validateState, type NewGameOptions } from '../game/campaign';
import type { GameCommand, GameState, RivalAggression } from '../game/types';
import { autosave } from '../platform/autosave';
let current: GameState;
const listeners = new Set<() => void>();
export const session = {
  getSnapshot: () => current ?? (current = createGame('cao', 190)),
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  execute: (command: GameCommand) => {
    const result = dispatch(session.getSnapshot(), command);
    if (result.ok) {
      current = result.state;
      void autosave.save(current);
      listeners.forEach((fn) => fn());
    }
    return result;
  },
  start: (
    faction: string,
    seed: number,
    aggression: RivalAggression = 'balanced',
    options: NewGameOptions = {},
  ) => {
    current = createGame(faction, seed, aggression, options);
    void autosave.save(current);
    listeners.forEach((fn) => fn());
  },
  load: (state: GameState) => {
    const error = validateState(state);
    if (error) throw new Error(error);
    current = structuredClone(state);
    void autosave.save(current);
    listeners.forEach((fn) => fn());
  },
};
