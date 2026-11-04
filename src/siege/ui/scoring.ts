import { scoreSiege } from '../rules/score';
import type { SiegeSide, SiegeState } from '../rules/types';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
export function scoringScreen(state: SiegeState, locale: SiegeLocale, side: SiegeSide) {
  const result = state.stats.score?.[side] ?? scoreSiege(state, side);
  const tier: SiegeTextKey =
    result.tier === 'victory'
      ? 'scoreVictory'
      : result.tier === 'defeat'
        ? 'scoreDefeat'
        : result.tier;
  const labels: Record<string, SiegeTextKey> = {
    outcome: 'scorePartOutcome',
    speed: 'scorePartSpeed',
    casualties: 'scorePartCasualties',
    engines: 'scorePartEngines',
    mainBody: 'scorePartMainBody',
    gate: 'scorePartGate',
    wall: 'scorePartWall',
  };
  return {
    tier: siegeText(locale, tier),
    score: result.score,
    parts: Object.entries(result.parts).map(([key, value]) => ({
      key,
      label: siegeText(locale, labels[key]!),
      value,
    })),
    history: siegeText(locale, 'scoreHistory', { n: state.day }),
    summary: [
      { label: siegeText(locale, 'assaultCount'), value: state.stats.assaults },
      { label: siegeText(locale, 'nightClashCount'), value: state.stats.nightClashes },
      { label: siegeText(locale, 'moundCount'), value: state.stats.moundsBuilt },
    ],
  };
}
