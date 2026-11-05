import { message } from '../../i18n';
import { formatDistance, formatGrain, formatMen, formatMoney } from '../../i18n/units';

import { ORDER_REASON_COPY } from '../shared/app-copy-1';

import { absoluteDateLabel } from '../shared/app-copy-3';
import type { GameplayContext } from '../hooks/gameplayView';

export function OrderPreview({
  context,
}: {
  context: GameplayContext & {
    state: NonNullable<GameplayContext['state']>;
    orderPreview: NonNullable<GameplayContext['orderPreview']>;
  };
}) {
  const {
    orderPreviewOrder,
    locationName,
    orderPreview,
    t,
    orderPreviewSourceCity,
    orderPreviewTroops,
    locale,
    state,
  } = context;
  return (
    <div className="v03-route-preview" aria-live="polite">
      {orderPreviewOrder ? (
        <strong>
          {locationName(orderPreviewOrder.sourceCityId)} →{' '}
          {locationName(orderPreviewOrder.targetCityId)}
        </strong>
      ) : null}
      {'executable' in orderPreview.preview ? (
        <>
          <span>
            {t.requested}: {formatMoney(orderPreview.preview.requested.gold, locale)} ·{' '}
            {formatGrain(orderPreview.preview.requested.food, locale)} ·{' '}
            {formatMen(orderPreview.preview.requested.troops, locale)}
          </span>
          <strong>
            {t.planAvailable}: {formatMoney(orderPreview.preview.executable.gold, locale)} ·{' '}
            {formatGrain(orderPreview.preview.executable.food, locale)} ·{' '}
            {formatMen(orderPreview.preview.executable.troops, locale)}
          </strong>
          <span>
            {t.planGap}: {formatMoney(orderPreview.preview.deficit.gold, locale)} ·{' '}
            {formatGrain(orderPreview.preview.deficit.food, locale)} ·{' '}
            {formatMen(orderPreview.preview.deficit.troops, locale)}
          </span>
          {orderPreview.preview.travelFood > 0 ? (
            <span>
              {locale === 'zh'
                ? '另需路粮（从出发城扣除）'
                : 'Additional travel provisions (debited at source)'}
              : {formatGrain(orderPreview.preview.travelFood, locale)}
              {orderPreview.preview.travelFoodDeficit > 0
                ? ` · ${t.planGap}: ${orderPreview.preview.travelFoodDeficit.toLocaleString()}`
                : ''}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <span>
            {t.requested}: {formatMen(orderPreview.preview.requestedTroops, locale)} ·{' '}
            {formatGrain(orderPreview.preview.requestedFood, locale)}
          </span>
          <strong>
            {t.planAvailable}: {formatMen(orderPreview.preview.executableTroops, locale)} ·{' '}
            {formatGrain(orderPreview.preview.executableFood, locale)}
          </strong>
          <span>
            {t.planGap}: {formatMen(orderPreview.preview.deficitTroops, locale)} ·{' '}
            {formatGrain(
              Math.max(0, orderPreview.preview.requestedFood - orderPreview.preview.executableFood),
              locale,
            )}
          </span>
        </>
      )}
      {orderPreviewSourceCity ? (
        <span>
          {t.garrison}:{' '}
          {Math.max(0, orderPreviewSourceCity.garrisonTroops - orderPreviewTroops).toLocaleString()}
        </span>
      ) : null}
      <small>
        {orderPreview.preview.earliestDepartureDay === null
          ? message(locale, 'ui.earliest.departure.undetermined.65')
          : `${message(locale, 'ui.earliest.departure.66')}: ${absoluteDateLabel(state.startYear, orderPreview.preview.earliestDepartureDay, locale)}`}
        {' · '}
        {orderPreview.preview.estimatedArrivalDay === null
          ? message(locale, 'ui.arrival.undetermined.67')
          : `${t.estimatedArrival}: ${absoluteDateLabel(state.startYear, orderPreview.preview.estimatedArrivalDay, locale)}`}
      </small>
      {orderPreview.preview.route ? (
        <small>
          {t.routeDistance}: {formatDistance(orderPreview.preview.route.roadKmNominal, locale)} ·{' '}
          {orderPreview.preview.route.estimatedDays} {message(locale, 'ui.days.15')}
          {orderPreview.preview.route.routeCityIds?.length ? (
            <>
              {' · '}
              {t.routeStops}:{' '}
              {orderPreview.preview.route.routeCityIds
                .map((cityId) => locationName(cityId))
                .join(' → ')}
            </>
          ) : null}
        </small>
      ) : null}
      {orderPreview.preview.reasonCodes.length ? (
        <small>
          {t.reasons}:{' '}
          {orderPreview.preview.reasonCodes
            .map((code) => ORDER_REASON_COPY[code][locale])
            .join(' · ')}
        </small>
      ) : null}
    </div>
  );
}
