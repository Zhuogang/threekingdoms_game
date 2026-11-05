import { SIEGE_TUNING } from './tuning';

export const SIEGE_VERSION = 'siege_v0.3';
export const SIEGE_DAYS: number = SIEGE_TUNING.days;
export const INITIAL_ZHANGHE_DISTANCE = SIEGE_TUNING.zhangheDistance;
export const INITIAL_MORALE = SIEGE_TUNING.moraleRecoveryCap;

// Private field-battle constants copied from src/v03/battle/engine.ts.
export const WAVERING_MORALE = 40;
export const ROUTED_MORALE = 20;
export const MIN_MORALE = 5;

/** FNV seed derivation, copied from src/v03/battle/engine.ts (tacticalSeed). */
export function tacticalSeed(id: string, seed: number): number {
  let hash = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/** LCG, copied from src/v03/battle/engine.ts (advanceRandomState). */
export function advanceRandomState(value: number): number {
  return (Math.imul(value >>> 0, 1664525) + 1013904223) >>> 0;
}
