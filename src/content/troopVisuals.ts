import type { TroopType } from '../game/types';

/** Original 24-unit vector paths, shared by React SVG and Pixi's SVG renderer. */
export const TROOP_VISUALS: Record<TroopType, { paths: string[] }> = {
  infantry: { paths: ['M5 21 17 9 M14 7 21 3 18 10 14 7 Z M4 17 8 21'] },
  cavalry: {
    paths: [
      'M5 21 6 15 10 11 8 8 10 3 13 6 17 6 21 11 19 14 15 13 14 17 17 21',
      'M10 3 7 5 4 11 3 18 5 21',
      'M16 9 16.1 9',
    ],
  },
  archer: { paths: ['M6 3 Q22 12 6 21 L11 12 6 3', 'M3 12 22 12 M18 8 22 12 18 16'] },
  naval: {
    paths: [
      'M3 16 21 16 18 21 7 21 3 16 Z',
      'M11 3 11 16 M12 4 19 13 12 13',
      'M2 22 Q5 20 8 22 Q11 24 14 22 Q17 20 22 22',
    ],
  },
  elite: {
    paths: [
      'M4 3 15 12 13 14 3 4 4 3 Z M14 13 21 20 M12 16 17 11',
      'M20 3 9 12 11 14 21 4 20 3 Z M10 13 3 20 M7 11 12 16',
    ],
  },
  guard: {
    paths: ['M12 2 21 6 20 14 Q18 20 12 23 Q6 20 4 14 L3 6 12 2 Z', 'M12 6 12 18 M7 11 17 11'],
  },
};
