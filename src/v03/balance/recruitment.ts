import { deepFreeze } from './freeze';

/** Recruitment by region and troop type. Initial game balance, not historical estimates. */
export const RECRUITMENT = deepFreeze({
  regions: {
    north: ['beiping', 'jinyang', 'ye', 'pingyuan', 'beihai', 'tianshui', 'changan'],
    central: [
      'luoyang',
      'puyang',
      'chenliu',
      'xuchang',
      'xiapi',
      'shouchun',
      'wancheng',
      'hanzhong',
    ],
  },
  /** Percent multiplier on recruits per troop type and region (PF-RL-04). */
  multiplier: {
    infantry: 100,
    archer: 75,
    cavalryNorth: 60,
    cavalryCentral: 50,
    cavalrySouth: 40,
  },
  /** Gold cost per troop type and region. */
  gold: {
    infantry: 200,
    archer: 350,
    cavalryNorth: 400,
    cavalryCentral: 500,
    cavalrySouth: 600,
  },
  /** Recruits before the multiplier: base + force * perForce. */
  base: 300,
  /** Recruits added per point of the recruiter's force. */
  perForce: 5,
  /** Residents a recruitment can never take from a city. */
  protectedPopulation: 1000,
} as const);
