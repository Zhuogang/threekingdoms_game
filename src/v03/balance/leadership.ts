import { deepFreeze } from './freeze';

/** Leadership as a soft command cap: managed men, desertion, and battle effects of unmanaged men. */
export const LEADERSHIP = deepFreeze({
  /** Men one point of leadership manages. */
  capacityPerPoint: 100,
  /** Share of unmanaged men who desert each month while stationed in a city. */
  desertCity: 0.05,
  /** Share of unmanaged men who desert each month on a journey. */
  desertMarch: 0.1,
  /** Extra incoming casualties per unit of excess share. */
  unmanagedIncoming: 0.5,
  /** Opening morale lost per unit of excess share. */
  unmanagedMorale: 20,
  /** Opening morale before leadership. */
  openingMoraleBase: 60,
  /** Opening morale per point of leadership. */
  openingMoralePerLeadership: 0.2,
  /** Opening morale of militia formations. */
  militiaMorale: 60,
  /** Weight of leadership (the rest is force) in the ordinary-hit quality term. */
  hitLeadershipWeight: 0.6,
  /** Highest leadership. */
  max: 100,
} as const);
