import type { SiegeAttackForecast, SiegeClimbForecast } from '../rules/combat';

export function forecastTableData(
  normal: SiegeAttackForecast | SiegeClimbForecast,
  assault: SiegeAttackForecast | SiegeClimbForecast | null,
  before: number,
) {
  return [normal, ...(assault ? [assault] : [])].map((f, i) => ({
    kind: i ? ('assault' as const) : ('normal' as const),
    enemyCasualties: 'counterattack' in f ? f.casualties : 0,
    ownCasualties: 'counterattack' in f ? f.counterattack.casualties : f.casualties,
    footholdBefore: before,
    footholdAfter: f.footholdAfter,
    footholdGain: f.footholdGain,
    wouldMount: f.wouldMount,
    moraleAfter: f.sourceMoraleAfter,
    gateDamage: 'gateDamage' in f ? f.gateDamage : undefined,
  }));
}
