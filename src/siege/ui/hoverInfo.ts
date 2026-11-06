import { sameCell } from '../content/chencang';
import { siegeText, type SiegeLocale } from '../i18n';
import { cellHeight, cellTerrain, gateAt } from '../rules/map';
import { SIEGE_TUNING as T } from '../rules/tuning';
import type { SiegePosition, SiegeState } from '../rules/types';
import { engineKey } from './story';
import { placeName } from './places';

export function hoverInfo(state: SiegeState, p: SiegePosition | null, locale: SiegeLocale): string {
  if (!p) return '';
  const text = (key: Parameters<typeof siegeText>[1], params = {}) =>
    siegeText(locale, key, params);
  const terrain = cellTerrain(state, p.x, p.y);
  const occupants = [
    ...state.units
      .filter((u) => u.troops > 0 && sameCell(u, p) && u.level === p.level)
      .map((u) => (locale === 'zh' ? u.officer.chinese : u.officer.name)),
    ...(p.level === 'ground'
      ? state.engines
          .filter((e) => sameCell(e, p))
          .map((e) => `${text(engineKey(e.kind))}${e.wrecked ? ` (${text('wreck')})` : ''}`)
      : []),
  ];
  const gate = gateAt(p.x, p.y);
  if (gate)
    occupants.push(`${text(gate)} ${state.gates[gate].durability}/${state.gates[gate].max}`);
  const cover =
    terrain === 'hill'
      ? text('terrainCover', { n: 0.8 })
      : terrain === 'wood'
        ? text('terrainCover', { n: 0.82 })
        : p.level === 'wall'
          ? text('parapetCover', { n: T.parapetMultiplier })
          : '';
  const hold =
    p.level === 'wall' &&
    state.holdFast?.day === state.day &&
    state.holdFast.cells.some((c) => sameCell(c, p));
  return [
    `${placeName(p, locale)}·${text(p.level)}`,
    text(terrain),
    text('hoverHeight', { n: cellHeight(state, p.x, p.y, p.level) }),
    occupants.join(', ') || text('hoverEmpty'),
    cover,
    hold ? text('holdFastCover', { n: T.holdFastMultiplier }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
