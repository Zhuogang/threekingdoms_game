import { SIEGE_TUNING as T } from './tuning';
import type { SiegeSide, SiegeState } from './types';

export type ShuScoreTier =
  'swiftVictory' | 'victory' | 'costlyVictory' | 'orderlyWithdrawal' | 'grainWithdrawal' | 'defeat';
export type WeiScoreTier =
  'annihilation' | 'perfectDefense' | 'firmDefense' | 'narrowDefense' | 'cityFallen';
export interface SiegeScore {
  side: SiegeSide;
  tier: ShuScoreTier | WeiScoreTier;
  score: number;
  parts: Record<string, number>;
}

/** Score completed games from explicit statistics, without replaying or parsing logs. */
export function scoreSiege(state: SiegeState, side: SiegeSide): SiegeScore {
  if (!state.outcome) throw new Error('Scoring requires a completed siege.');
  const S = T.score;
  const victory = state.outcome === 'victory';
  const defeat = state.outcome === 'defeat';
  const stats = state.stats;
  let tier: SiegeScore['tier'];
  let parts: Record<string, number>;
  if (side === 'shu') {
    tier = victory
      ? state.day <= S.fastVictoryDay
        ? 'swiftVictory'
        : stats.shuLost <= S.costlyVictoryLosses
          ? 'victory'
          : 'costlyVictory'
      : defeat
        ? 'defeat'
        : !state.withdrawn && stats.shuLost <= S.orderlyWithdrawalLosses
          ? 'orderlyWithdrawal'
          : 'grainWithdrawal';
    parts = {
      outcome: victory
        ? S.shuVictory
        : defeat
          ? S.shuDefeat
          : state.withdrawn
            ? S.shuWithdrawn
            : S.shuHistorical,
      speed: victory ? Math.min(S.speedCap, S.speedPerDay * Math.max(0, T.days - state.day)) : 0,
      casualties: S.casualtyPoints * Math.max(0, 1 - stats.shuLost / S.shuCasualtyScale),
      engines: stats.enginesLost <= S.engineLossAllowance ? S.shuEnginePoints : 0,
      mainBody: state.mainBodyThreatened ? 0 : S.mainBodyPoints,
    };
  } else {
    tier = victory
      ? 'cityFallen'
      : defeat
        ? 'annihilation'
        : stats.gateEverBroken && stats.wallNights > S.wallNightAllowance
          ? 'narrowDefense'
          : stats.gateEverBroken || stats.wallNights > S.wallNightAllowance
            ? 'firmDefense'
            : 'perfectDefense';
    parts = {
      outcome: victory ? S.weiFall : defeat ? S.weiAnnihilation : S.weiHeld,
      gate: stats.gateEverBroken ? 0 : S.gatePoints,
      wall: stats.wallNights > S.wallNightAllowance ? 0 : S.wallPoints,
      casualties: S.casualtyPoints * Math.max(0, 1 - stats.weiLost / S.weiCasualtyScale),
      engines: stats.enginesLost >= S.engineKills ? S.weiEnginePoints : 0,
      speed: state.withdrawn && state.day <= S.withdrawalDay ? S.withdrawalPoints : 0,
    };
  }
  return { side, tier, parts, score: Object.values(parts).reduce((sum, part) => sum + part, 0) };
}
