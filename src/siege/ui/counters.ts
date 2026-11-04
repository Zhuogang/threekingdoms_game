import { activeUnit, usableEngine } from '../rules/combat';
import { SIEGE_TUNING as T } from '../rules/tuning';
import type { SiegeSide, SiegeState } from '../rules/types';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';

export const COUNTER_KINDS = [
  'fire',
  'millstone',
  'boulders',
  'sortie',
  'torches',
  'snow',
  'engineLoss',
] as const;
export type CounterKind = (typeof COUNTER_KINDS)[number];
const moves: Record<CounterKind, { codes: string[]; title: SiegeTextKey; answer: SiegeTextKey }> = {
  fire: { codes: ['brazierPrepared', 'fireArrowHit'], title: 'brazier', answer: 'counterFire' },
  millstone: {
    codes: ['millstonePrepared', 'millstoneHit'],
    title: 'millstone',
    answer: 'counterMillstone',
  },
  boulders: {
    codes: ['bouldersPrepared', 'bouldersHit'],
    title: 'boulders',
    answer: 'counterBoulders',
  },
  sortie: { codes: ['sortieHit', 'sortieRepelled'], title: 'sortie', answer: 'counterSortie' },
  torches: { codes: ['torches'], title: 'torches', answer: 'counterTorches' },
  snow: { codes: ['brazierDoused'], title: 'snow', answer: 'counterSnow' },
  engineLoss: {
    codes: ['engineLost', 'engineBurning'],
    title: 'engineLoss',
    answer: 'counterFire',
  },
};
/** Forward routes describe their prerequisites, so no unavailable ladder is suggested. */
export function engineLossAnswers(state: SiegeState): SiegeTextKey[] {
  const engines = state.engines.filter(usableEngine);
  const infantry = state.units.some(
    (u) => u.side === 'shu' && u.troopType === 'infantry' && activeUnit(u),
  );
  const troops = state.units.some((u) => u.side === 'shu' && activeUnit(u));
  const earth = infantry || engines.some((e) => e.kind === 'earthCart');
  const lines: SiegeTextKey[] = [];
  if (engines.some((e) => e.kind === 'ladder')) lines.push('wayLadder');
  if (engines.some((e) => e.kind === 'ram')) lines.push('wayRam');
  if (engines.some((e) => e.kind === 'tower')) lines.push('wayTower');
  if (state.workshops.length && engines.length < T.engineCap) lines.push('wayBuild');
  if (earth) lines.push('wayFill', 'wayMound');
  if (troops) lines.push('wayAssault');
  if (lines.length < 3 && state.workshops.length && engines.length < T.engineCap)
    lines.push('wayBuildLadder', 'wayBuildRam');
  return lines;
}
export function selectCounterCard(
  state: SiegeState,
  dismissed: readonly string[],
  locale: SiegeLocale,
  playerSide: SiegeSide = 'shu',
) {
  if (playerSide !== 'shu' || state.outcome) return null;
  // A loss takes priority over the preparation that caused it.
  const kind = (
    ['engineLoss', ...COUNTER_KINDS.filter((k) => k !== 'engineLoss')] as CounterKind[]
  ).find(
    (k) =>
      !dismissed.includes(k) &&
      state.log.some(
        (e) =>
          moves[k].codes.includes(e.code) ||
          (k === 'engineLoss' && e.code === 'fireArrowHit' && e.params.burning === true),
      ),
  );
  if (!kind) return null;
  const move = moves[kind];
  return {
    kind,
    icon: move.title,
    title: siegeText(locale, move.title),
    lines: (kind === 'engineLoss' ? engineLossAnswers(state) : [move.answer]).map((key) =>
      siegeText(locale, key),
    ),
  };
}
