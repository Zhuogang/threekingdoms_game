import { createContext, useContext } from 'react';
import type { Faction } from '../game/types';

/**
 * The houses of the game on screen, provided by App from the game state, for components that
 * receive no state (officer marks, the battle panel). Never read the module-level FACTIONS.
 */
export const FactionsContext = createContext<readonly Faction[]>([]);

export function useFaction(id: string | null | undefined): Faction | undefined {
  return useContext(FactionsContext).find((faction) => faction.id === id);
}
