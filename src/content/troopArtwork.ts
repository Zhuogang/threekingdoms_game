import type { TroopType } from '../game/types';

export const TROOP_ART_FILES = {
  infantry: 'units/infantry.webp',
  cavalry: 'units/cavalry.webp',
  archer: 'units/archer.webp',
} as const;

export type TroopArtKey = keyof typeof TROOP_ART_FILES;

/** Elite and guard retain their own insignia over the shared foot-soldier figure. */
export const TROOP_ART_KEY: Record<TroopType, TroopArtKey | null> = {
  infantry: 'infantry',
  cavalry: 'cavalry',
  archer: 'archer',
  elite: 'infantry',
  guard: 'infantry',
  naval: null,
};
