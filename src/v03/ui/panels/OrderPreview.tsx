import { message } from '../../i18n';

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
            {t.requested}: {t.gold} {orderPreview.preview.requested.gold.toLocaleString()} ·{' '}
            {t.food} {orderPreview.preview.requested.food.toLocaleString()} · {t.troops}{' '}
            {orderPreview.preview.requested.troops.toLocaleString()}
          </span>
          <strong>
            {t.planAvailable}: {t.gold} {orderPreview.preview.executable.gold.toLocaleString()} ·{' '}
            {t.food} {orderPreview.preview.executable.food.toLocaleString()} · {t.troops}{' '}
            {orderPreview.preview.executable.troops.toLocaleString()}
          </strong>
          <span>
            {t.planGap}: {t.gold} {orderPreview.preview.deficit.gold.toLocaleString()} · {t.food}{' '}
            {orderPreview.preview.deficit.food.toLocaleString()} · {t.troops}{' '}
            {orderPreview.preview.deficit.troops.toLocaleString()}
          </span>
        </>
      ) : (
        <>
          <span>
            {t.requested}: {orderPreview.preview.requestedTroops.toLocaleString()} {t.troops} ·{' '}
            {t.food} {orderPreview.preview.requestedFood.toLocaleString()}
          </span>
          <strong>
            {t.planAvailable}: {orderPreview.preview.executableTroops.toLocaleString()} {t.troops} ·{' '}
            {t.food} {orderPreview.preview.executableFood.toLocaleString()}
          </strong>
          <span>
            {t.planGap}: {orderPreview.preview.deficitTroops.toLocaleString()} {t.troops} · {t.food}{' '}
            {Math.max(
              0,
              orderPreview.preview.requestedFood - orderPreview.preview.executableFood,
            ).toLocaleString()}
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
          {t.routeDistance}: {orderPreview.preview.route.roadKmNominal.toLocaleString()} km ·{' '}
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
