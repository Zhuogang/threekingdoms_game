import { deepFreeze } from './freeze';

/** Morale thresholds and recovery for tactical formations. */
export const MORALE = deepFreeze({
  /** Morale a formation starts a battle with. */
  opening: 80,
  /** Below this a formation is wavering: it cannot use tactics and hits weaker. */
  wavering: 40,
  /** Below this a formation is routed. */
  routed: 20,
  /** Morale never falls below this from combat or tactics. */
  floor: 5,
  /** Morale a fed formation that lost no troops regains each day. */
  recovery: 5,
  /** Daily recovery stops at this value (PF-RL-11). */
  recoveryCap: 80,
} as const);
