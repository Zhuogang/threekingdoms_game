import { activeUnit, usableEngine } from '../rules/combat';
import { SIEGE_TUNING as T } from '../rules/tuning';
import type { SiegeSide, SiegeState } from '../rules/types';
import { placeName, reportCell } from './places';
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
export function counterCards(
  state: SiegeState,
  dismissed: readonly string[],
  locale: SiegeLocale,
  playerSide: SiegeSide = 'shu',
) {
  if (playerSide !== 'shu' || state.outcome) return [];
  // A loss takes priority over the preparation that caused it.
  const kinds = (
    ['engineLoss', ...COUNTER_KINDS.filter((k) => k !== 'engineLoss')] as CounterKind[]
  ).filter(
    (k) =>
      !dismissed.includes(k) &&
      state.log.some(
        (e) =>
          (moves[k].codes.includes(e.code) &&
            !(
              k === 'fire' &&
              e.code === 'brazierPrepared' &&
              e.params.cell &&
              !state.preparations.braziers[String(e.params.cell)] &&
              state.log.some(
                (d) =>
                  d.code === 'brazierDoused' && d.params.cell === e.params.cell && d.day >= e.day,
              )
            )) ||
          (k === 'engineLoss' && e.code === 'fireArrowHit' && e.params.burning === true),
      ),
  );
  return kinds.map((kind) => {
    const move = moves[kind];
    const event = [...state.log].reverse().find((e) => move.codes.includes(e.code));
    const engine = state.engines.find((e) => e.id === event?.params.engineId);
    const unit = state.units.find((u) => u.id === (event?.params.targetId ?? event?.params.unitId));
    const location = reportCell(event?.params.cell) ?? engine ?? unit;
    return {
      kind,
      icon: move.title,
      title: siegeText(locale, move.title) + (location ? ` · ${placeName(location, locale)}` : ''),
      lines: (kind === 'engineLoss' ? engineLossAnswers(state) : [move.answer]).map((key) =>
        siegeText(locale, key),
      ),
    };
  });
}
export function selectCounterCard(
  state: SiegeState,
  dismissed: readonly string[],
  locale: SiegeLocale,
  playerSide: SiegeSide = 'shu',
) {
  return counterCards(state, dismissed, locale, playerSide)[0] ?? null;
}
