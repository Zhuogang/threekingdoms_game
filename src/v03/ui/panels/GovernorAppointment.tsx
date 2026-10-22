import { Button, Select } from '../kit';
import { message } from '../../i18n';

import { canAppointGovernor } from '../../governance/authority';

import { localizeAppMessage } from '../shared/app-copy-2';
import { absoluteDateLabel, displayName } from '../shared/app-copy-3';
import type { GameplayContext } from '../hooks/gameplayView';

export function GovernorAppointment({
  context,
}: {
  context: GameplayContext & {
    state: NonNullable<GameplayContext['state']>;
    selectedCity: NonNullable<GameplayContext['selectedCity']>;
  };
}) {
  const {
    selectedCity,
    locale,
    governorSelection,
    setGovernorDraft,
    t,
    governorCandidates,
    state,
    localizedOfficerName,
    dispatch,
  } = context;
  return (
    <>
      <div className="v03-row">
        <small>{message(locale, 'ui.officers.in.battle.in.transit.or.captured.cannot.396')}</small>
        <Select
          key={selectedCity.id}
          id="v03-governor-select"
          aria-label={message(locale, 'ui.governor.candidate.98')}
          value={governorSelection}
          onChange={(event) =>
            setGovernorDraft({
              cityId: selectedCity.id,
              officerId: event.target.value,
            })
          }
        >
          <option value="">{t.localSteward}</option>
          {governorCandidates.map((officer) => {
            const cityId = officer.location.kind === 'city' ? officer.location.cityId : '';
            const city = state.cities.find((entry) => entry.id === cityId);
            return (
              <option
                key={officer.id}
                value={officer.id}
                disabled={!canAppointGovernor(state, selectedCity.id, officer.id).ok}
              >
                {localizedOfficerName(officer.name)} · {city ? displayName(city, locale) : ''}
                {!canAppointGovernor(state, selectedCity.id, officer.id).ok
                  ? ` · ${localizeAppMessage(canAppointGovernor(state, selectedCity.id, officer.id).reason ?? '', locale)}`
                  : ''}
              </option>
            );
          })}
        </Select>
        <Button
          type="button"
          disabled={
            !canAppointGovernor(state, selectedCity.id, governorSelection || null).ok ||
            (!governorSelection && !selectedCity.governorId && !selectedCity.pendingAppointment)
          }
          title={localizeAppMessage(
            canAppointGovernor(state, selectedCity.id, governorSelection || null).reason ?? '',
            locale,
            state,
          )}
          onClick={() => {
            dispatch({
              type: 'appointGovernor',
              cityId: selectedCity.id,
              officerId: governorSelection || null,
            });
          }}
        >
          {!governorSelection
            ? selectedCity.governorId
              ? t.dismiss
              : selectedCity.pendingAppointment
                ? message(locale, 'ui.cancel.appointment.99')
                : t.localSteward
            : selectedCity.governorId && selectedCity.governorId !== governorSelection
              ? message(locale, 'ui.replace.governor.100')
              : t.appoint}
        </Button>
      </div>
      {selectedCity.pendingAppointment
        ? (() => {
            const pendingOfficer = selectedCity.pendingAppointment.governorId
              ? state.officers.find(
                  (officer) => officer.id === selectedCity.pendingAppointment?.governorId,
                )
              : null;
            const transfer = selectedCity.pendingAppointment.journeyId
              ? state.journeys.find(
                  (journey) => journey.id === selectedCity.pendingAppointment?.journeyId,
                )
              : null;
            const effective = absoluteDateLabel(
              state.startYear,
              selectedCity.pendingAppointment.effectiveDay,
              locale,
            );
            const arrival = transfer
              ? absoluteDateLabel(state.startYear, transfer.expectedArrivalDay, locale)
              : null;
            const source = transfer
              ? state.cities.find((city) => city.id === transfer.sourceCityId)
              : null;
            const subject = pendingOfficer
              ? localizedOfficerName(pendingOfficer.name)
              : t.localSteward;
            return (
              <small className="v03-muted">
                {transfer
                  ? message(locale, 'ui.is.traveling.from.due.takes.effect.no.earlier.th.101', {
                      p0: subject,
                      p1: source ? displayName(source, locale) : transfer.sourceCityId,
                      p2: arrival,
                      p3: effective,
                    })
                  : message(locale, 'ui.pending.scheduled.to.take.effect.102', {
                      p0: subject,
                      p1: effective,
                    })}
              </small>
            );
          })()
        : null}
    </>
  );
}
