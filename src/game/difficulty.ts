import type { Difficulty, RivalAggression } from './types';

/**
 * Difficulty presets only tune how rivals behave (aggression, opening truce, personalities).
 * They never grant anyone resources or combat bonuses (design decision D8).
 */
export interface DifficultyPreset {
  label: string;
  description: string;
  aggression: RivalAggression;
  truceMonths: number;
  personalities: boolean;
}

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  story: {
    label: 'Story',
    description:
      'Cautious rivals, a two-month opening truce and no house personalities. Time to learn.',
    aggression: 'cautious',
    truceMonths: 2,
    personalities: false,
  },
  standard: {
    label: 'Standard',
    description: 'Balanced rivals with their own personalities. The intended experience.',
    aggression: 'balanced',
    truceMonths: 0,
    personalities: true,
  },
  warlord: {
    label: 'Warlord',
    description:
      'Aggressive rivals with sharp personalities and no truce. Expect war in month one.',
    aggression: 'aggressive',
    truceMonths: 0,
    personalities: true,
  },
};
export const DIFFICULTIES = Object.keys(DIFFICULTY_PRESETS) as Difficulty[];
export const isDifficulty = (value: unknown): value is Difficulty =>
  DIFFICULTIES.includes(value as Difficulty);
