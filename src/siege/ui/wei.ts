import { GATES, cellKey } from '../content/chencang';
import { activeUnit, distance } from '../rules/combat';
import { actionReason } from './commands';
import { placeName } from './places';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import type { SiegeAction, SiegePosition, SiegeState } from '../rules/types';

/** Readiness is a view of rules and current operators, never a second action validator. */
export function preparationRows(state: SiegeState) {
  return (['braziers', 'millstones', 'boulders'] as const).flatMap((table) =>
    Object.entries(state.preparations[table]).map(([cell, prep]) => {
      const [x, y] = cell.split(',').map(Number);
      const place: SiegePosition = { x: x!, y: y!, level: 'wall' };
      const day = 'litDay' in prep ? prep.litDay : prep.day;
      const operators = state.units.filter(
        (u) =>
          u.side === 'wei' &&
          activeUnit(u) &&
          u.level === 'wall' &&
          (table === 'braziers'
            ? u.troopType === 'archer' && distance(u, place) <= 1
            : cellKey(u) === cell && (table !== 'boulders' || u.troopType === 'infantry')),
      );
      const status: SiegeTextKey =
        'hoisted' in prep && !prep.hoisted
          ? 'preparationSpent'
          : day >= state.day
            ? 'preparationTomorrow'
            : operators.length && operators.every((u) => u.suppressedDay === state.day)
              ? 'preparationBlocked'
              : !operators.some((u) => !u.acted && u.suppressedDay !== state.day)
                ? 'preparationNoOperator'
                : 'preparationReady';
      return {
        cell,
        place,
        kind: (table === 'braziers'
          ? 'brazier'
          : table === 'millstones'
            ? 'millstone'
            : 'boulders') as SiegeTextKey,
        status,
      };
    }),
  );
}
export type WeiOrderKind = 'rally' | 'holdFast' | 'nightRepair' | 'torches' | 'sortie';
export const weiOrderLabel = (kind: WeiOrderKind): SiegeTextKey =>
  kind === 'holdFast' ? 'holdFastOrder' : kind;
export function weiOrderTargets(state: SiegeState, kind: WeiOrderKind, locale: SiegeLocale) {
  const targets =
    kind === 'torches'
      ? [{ target: undefined, label: siegeText(locale, 'torches') }]
      : kind === 'nightRepair'
        ? Object.keys(GATES).map((target) => ({
            target,
            label: siegeText(locale, target as keyof typeof GATES),
          }))
        : kind === 'sortie'
          ? state.engines
              .filter((e) => !e.wrecked && e.durability > 0)
              .map((e) => ({
                target: e.id,
                label: `${siegeText(locale, e.kind === 'ram' ? 'ramEngine' : e.kind)} · ${placeName(e, locale)}`,
              }))
          : state.units
              .filter(
                (u) =>
                  u.side === 'wei' && u.troops > 0 && (kind !== 'holdFast' || u.level === 'wall'),
              )
              .map((u) => ({
                target: u.id,
                label: `${locale === 'zh' ? u.officer.chinese : u.officer.name} · ${placeName(u, locale)}`,
              }));
  return targets.map((option) => {
    const action = { type: 'order', side: 'wei', kind, target: option.target } as SiegeAction;
    return { ...option, action, reason: actionReason(state, action) };
  });
}
export function tonightOrder(state: SiegeState, locale: SiegeLocale) {
  const t = (key: SiegeTextKey) => siegeText(locale, key);
  const order = state.nightOrders.wei;
  if (order) {
    const target =
      order.kind === 'sortie' ? state.engines.find((e) => e.id === order.target) : null;
    return `${t(order.kind)}${order.kind === 'nightRepair' ? ` · ${t(order.target)}` : target ? ` · ${t(target.kind === 'ram' ? 'ramEngine' : target.kind)} · ${placeName(target, locale)}` : ''}`;
  }
  if (state.holdFast?.day === state.day + 1)
    return `${t('holdFastOrder')} · ${placeName(state.holdFast.cells[0], locale)}`;
  return state.ordersUsed.wei[state.day] ? t('rally') : t('orderNone');
}
