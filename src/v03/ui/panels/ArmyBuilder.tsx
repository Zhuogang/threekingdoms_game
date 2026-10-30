import { message } from '../../i18n';
import { useEffect, useMemo, useState } from 'react';
import type { GameplayContext } from '../hooks/gameplayView';
import { armyPreview, marchDestinationBlock } from '../../governance/army';
import { availableCityResources } from '../../governance/authority';
import { localizeAppMessage } from '../shared/app-copy-2';
import { ReserveFillButton } from './ReserveFill';
import { isCityCommitted } from '../../governance/commitments';
import { troopName } from '../../rendering/presentation';
import { Button, Input, Select, Field, StatGrid } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { TroopProgress } from './TroopProgress';

export function ArmyBuilder({ context }: { context: GameplayContext }) {
  const {
    state,
    locale,
    selectedCity,
    targetCityId,
    setTargetCityId,
    intent,
    setIntent,
    dispatch,
  } = context;
  const [officerIds, setOfficerIds] = useState<string[]>([]);
  const [foodOverride, setFoodOverride] = useState('');
  // The source is local to this form; changing it does not move the city window's selection.
  const [sourceId, setSourceId] = useState(() =>
    selectedCity?.factionId === state.playerFactionId ? selectedCity.id : state.playerCapitalCityId,
  );
  const source = state.cities.find((city) => city.id === sourceId);
  const stationed = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.factionId === state.playerFactionId &&
      officer.location.kind === 'city' &&
      officer.location.cityId === source?.id,
  );
  const officers = stationed.filter((officer) => officer.troops > 0);
  // Officers without troops are listed so the player sees who could march once assigned.
  const unarmed = stationed.filter((officer) => officer.troops === 0);
  const availableIds = officers.map((officer) => officer.id).join(',');
  useEffect(() => {
    setOfficerIds([]);
    setFoodOverride('');
  }, [source?.id]);
  const selectedIds = officerIds.filter((id) => availableIds.split(',').includes(id));
  const preview = armyPreview(state, source?.id ?? '', targetCityId, selectedIds, intent);
  // Reachable destinations, nearest first; a blocked one says why before Confirm.
  const targets = useMemo(
    () =>
      state.cities
        .filter((city) => city.factionId !== state.playerFactionId)
        .map((city) => ({
          city,
          ...armyPreview(state, source?.id ?? '', city.id, selectedIds, intent),
          blocked: source ? marchDestinationBlock(state, source.id, city.id, intent) : null,
        }))
        .filter((entry) => entry.route)
        .sort(
          (a, b) =>
            a.route!.estimatedDays - b.route!.estimatedDays || a.city.id.localeCompare(b.city.id),
        ),
    [state, source?.id, selectedIds.join(','), intent],
  );
  const availableFood = source ? availableCityResources(state, source.id).food : 0;
  const target = state.cities.find((city) => city.id === targetCityId);
  const committed = source ? isCityCommitted(state, source.id) : false;
  return (
    <div className="v03-army-builder">
      <section className="v03-army-selection">
        <h3>{message(locale, 'flow.chooseOfficers')}</h3>
        <Field label={message(locale, 'ui.source.city.21')}>
          <Select value={source?.id ?? ''} onChange={(event) => setSourceId(event.target.value)}>
            {state.cities
              .filter((city) => city.factionId === state.playerFactionId)
              .map((city) => (
                <option key={city.id} value={city.id} disabled={isCityCommitted(state, city.id)}>
                  {displayName(city, locale)}
                </option>
              ))}
          </Select>
        </Field>
        <p className="v03-muted">
          {message(locale, 'ui.choose.officers.the.army.contains.all.of.their.t.22')}
        </p>
        {officers.map((officer) => (
          <label key={officer.id} className="v03-army-officer">
            <Input
              type="checkbox"
              disabled={committed || officer.reorganizationDays > 0}
              checked={selectedIds.includes(officer.id)}
              onChange={(event) =>
                setOfficerIds(
                  event.target.checked
                    ? [...selectedIds, officer.id]
                    : selectedIds.filter((id) => id !== officer.id),
                )
              }
            />
            <span>
              <strong>{displayName(officer, locale)}</strong>
              <TroopProgress unit={officer} locale={locale} compact />
              <small>
                {officer.troops.toLocaleString()} · {troopName(officer.troopType, locale)} ·{' '}
                {message(locale, 'ui.force.intellect.loyalty.23')} {officer.force} /{' '}
                {officer.intellect} / {officer.loyalty}
              </small>
            </span>
          </label>
        ))}
        {unarmed.map((officer) => (
          <p key={officer.id} className="v03-army-officer is-unarmed">
            <strong>{displayName(officer, locale)}</strong>{' '}
            <small>{message(locale, 'army.noTroops')}</small>
          </p>
        ))}
        {source ? <ReserveFillButton context={context} cityId={source.id} /> : null}
        {committed ? (
          <p role="status">{message(locale, 'ui.this.city.is.committed.to.an.active.battle.24')}</p>
        ) : null}
        {!officers.length ? <p>{message(locale, 'flow.noOfficers')}</p> : null}
      </section>
      <section className="v03-army-destination">
        <h3>{message(locale, 'flow.destination')}</h3>
        <Field label={message(locale, 'ui.destination.house.then.eta.25')}>
          <Select value={targetCityId} onChange={(event) => setTargetCityId(event.target.value)}>
            <option value="">—</option>
            {targets.map(({ city, route, blocked }) => {
              const owner = state.factions.find((faction) => faction.id === city.factionId);
              return (
                <option key={city.id} value={city.id} disabled={Boolean(blocked)}>
                  {displayName(city, locale)} ·{' '}
                  {owner ? displayName(owner, locale) : message(locale, 'ui.independent.10')} ·{' '}
                  {city.garrisonTroops.toLocaleString()} · {route?.estimatedDays ?? '—'}{' '}
                  {message(locale, 'ui.days.15')}
                  {blocked ? ` · ${localizeAppMessage(blocked, locale, state)}` : ''}
                </option>
              );
            })}
          </Select>
        </Field>
        <Field label={message(locale, 'ui.intent.26')}>
          <Select
            value={intent}
            onChange={(event) => setIntent(event.target.value as typeof intent)}
          >
            <option value="conquer">{context.t.conquer}</option>
            <option value="raid">{context.t.raid}</option>
            <option value="sack">{context.t.sack}</option>
          </Select>
        </Field>
        <Field
          label={message(locale, 'ui.provisions.27')}
          hint={message(locale, 'ui.defaults.to.the.outbound.battle.and.return.requi.28')}
        >
          <Input
            type="number"
            min={preview.food}
            value={foodOverride || preview.food}
            onChange={(event) => setFoodOverride(event.target.value)}
          />
        </Field>
      </section>
      <footer className="v03-army-submit">
        <StatGrid
          values={[
            { label: context.t.troops, value: preview.troops.toLocaleString() },
            {
              label: locale === 'zh' ? '留城伤兵' : 'Wounded staying behind',
              value: preview.officers
                .reduce((sum, officer) => sum + officer.wounded, 0)
                .toLocaleString(),
            },
            { label: context.t.garrison, value: target?.garrisonTroops.toLocaleString() ?? '—' },
            {
              label: context.t.travel,
              value: preview.route
                ? `${preview.route.estimatedDays} ${message(locale, 'ui.days.15')}`
                : '—',
            },
            {
              label: message(locale, 'army.provisions'),
              value: message(locale, 'army.provisionsValue', {
                need: (Number(foodOverride) || preview.food).toLocaleString(),
                have: availableFood.toLocaleString(),
              }),
            },
          ]}
        />
        <p>
          {message(locale, 'ui.force.comparison.29')}:{' '}
          {target && target.garrisonTroops
            ? `${(preview.troops / target.garrisonTroops).toFixed(1)}×`
            : '—'}
        </p>
        <Button
          variant="primary"
          disabled={!source || !preview.route || !selectedIds.length || committed}
          onClick={() => {
            if (!source) return;
            dispatch({
              type: 'marchArmy',
              sourceCityId: source.id,
              targetCityId,
              officerIds: selectedIds,
              intent,
              ...(foodOverride ? { food: Number(foodOverride) } : {}),
            });
          }}
        >
          {message(
            locale,
            source?.governanceMode === 'ruler' ? 'flow.confirmMarch' : 'flow.requestMarch',
          )}
        </Button>
      </footer>
    </div>
  );
}
