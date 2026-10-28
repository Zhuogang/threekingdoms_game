import { useRef } from 'react';
import { Button, Input, Select } from '../kit';
import { message } from '../../i18n';

import type { V03BattleIntent } from '../../types';

import { absoluteDateLabel, displayName } from '../shared/app-copy-3';
import type { GameplayContext } from '../hooks/gameplayView';
import { OrderPreview } from './OrderPreview';
export function OrderForm({
  context,
  onSubmitted,
  fixedDestination = false,
  showPreview = true,
  onReview,
}: {
  context: GameplayContext & {
    state: NonNullable<GameplayContext['state']>;
    selectedCity: NonNullable<GameplayContext['selectedCity']>;
  };
  onSubmitted?: () => void;
  fixedDestination?: boolean;
  showPreview?: boolean;
  onReview?: () => void;
}) {
  const {
    t,
    targetCityId,
    setTargetCityId,
    availableTargets,
    locale,
    state,
    requestedByDay,
    setRequestedByDay,
    requestKind,
    requestedGold,
    setRequestedGold,
    requestedFood,
    setRequestedFood,
    requestedResourceTroops,
    setRequestedResourceTroops,
    submitResourceOrder,
    requestedTroops,
    setRequestedTroops,
    intent,
    setIntent,
    submitCampaignOrder,
    selectedRoute,
    selectedCity,
    locationName,
    orderPreview,
    orderPreviewOrder,
    orderPreviewSourceCity,
  } = context;
  const submitted = useRef(false);
  const submit = () => {
    if (onReview) {
      onReview();
      return;
    }
    if (submitted.current) return;
    submitted.current = true;
    const result = requestKind === 'resource' ? submitResourceOrder() : submitCampaignOrder();
    if (result?.ok && onSubmitted) onSubmitted();
    else submitted.current = false;
  };
  return (
    <div className="v03-order-form">
      {fixedDestination ? (
        <p>
          {locationName(selectedCity.id)} → {locationName(targetCityId)}
        </p>
      ) : (
        <label className="v03-field">
          {t.to}
          <Select value={targetCityId} onChange={(event) => setTargetCityId(event.target.value)}>
            <option value="">—</option>
            {availableTargets.map((city) => (
              <option key={city.id} value={city.id}>
                {displayName(city, locale)}
              </option>
            ))}
          </Select>
        </label>
      )}
      <label className="v03-field">
        {t.deadline}
        <Input
          type="number"
          min={state.absoluteDay}
          placeholder={message(locale, 'ui.no.deadline.64')}
          value={requestedByDay}
          onChange={(event) => setRequestedByDay(event.target.value)}
        />
      </label>
      {requestKind === 'resource' ? (
        <>
          <div className="v03-row">
            <label className="v03-field">
              {t.gold}
              <Input
                type="number"
                min="0"
                value={requestedGold}
                onChange={(event) => setRequestedGold(Number(event.target.value))}
              />
            </label>
            <label className="v03-field">
              {t.food}
              <Input
                type="number"
                min="0"
                value={requestedFood}
                onChange={(event) => setRequestedFood(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="v03-row">
            <label className="v03-field">
              {t.resourceTroops}
              <Input
                type="number"
                min="0"
                step="100"
                value={requestedResourceTroops}
                onChange={(event) => setRequestedResourceTroops(Number(event.target.value))}
              />
            </label>
            <Button
              type="button"
              disabled={!targetCityId || requestedResourceTroops < 0}
              onClick={submit}
            >
              {onReview ? message(locale, 'flow.proposal') : t.request}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="v03-row">
            <label className="v03-field">
              {t.troops}
              <Input
                type="number"
                min="1"
                step="100"
                value={requestedTroops}
                onChange={(event) => setRequestedTroops(Number(event.target.value))}
              />
            </label>
            <label className="v03-field">
              {t.intent}
              <Select
                value={intent}
                onChange={(event) => setIntent(event.target.value as V03BattleIntent)}
              >
                <option value="conquer">{t.conquer}</option>
                <option value="raid">{t.raid}</option>
                <option value="sack">{t.sack}</option>
              </Select>
            </label>
          </div>
          <Button
            type="button"
            className="v03-block"
            disabled={!targetCityId || requestedTroops <= 0}
            onClick={submit}
          >
            {onReview ? message(locale, 'flow.proposal') : t.issue}
          </Button>
        </>
      )}
      {selectedRoute ? (
        <div className="v03-route-preview">
          <strong>{selectedRoute.roadKmNominal} km</strong>
          <span>
            {t.estimatedArrival}:{' '}
            {absoluteDateLabel(
              state.startYear,
              state.absoluteDay + selectedRoute.estimatedDays,
              locale,
            )}{' '}
            · {selectedRoute.estimatedDays} {message(locale, 'ui.days.15')}
          </span>
          <small>
            {t.routeStops}:{' '}
            {(selectedRoute.routeCityIds ?? [selectedCity.id, targetCityId])
              .map((cityId) => locationName(cityId))
              .join(' → ')}
          </small>
        </div>
      ) : targetCityId ? (
        <p className="v03-muted">{t.noRoute}</p>
      ) : null}
      {showPreview && orderPreview ? (
        <OrderPreview
          context={{
            ...context,
            orderPreview: orderPreview!,
            orderPreviewSourceCity: orderPreviewSourceCity!,
            orderPreviewOrder: orderPreviewOrder!,
          }}
        />
      ) : null}
    </div>
  );
}
