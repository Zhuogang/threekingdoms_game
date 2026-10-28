import { Button, Select } from '../kit';
import { message } from '../../i18n';

import { canAppointGovernor } from '../../governance/authority';
import { previewGovernorTransfer } from '../../governance/appointments';

import { localizeAppMessage } from '../shared/app-copy-2';
import { absoluteDateLabel, displayName } from '../shared/app-copy-3';
import type { GameplayContext } from '../hooks/gameplayView';

export function GovernorAppointment({
  context,
  onComplete,
}: {
  context: GameplayContext & {
    state: NonNullable<GameplayContext['state']>;
    selectedCity: NonNullable<GameplayContext['selectedCity']>;
  };
  onComplete?: () => void;
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
  const rulerId = state.factions.find(
    (faction) => faction.id === state.playerFactionId,
  )!.leaderOfficerId;
  const personalRule = governorSelection === rulerId;
  const preview = previewGovernorTransfer(
    state,
    selectedCity.id,
    governorSelection || null,
    context.orderServices,
  );
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
                {officer.id === rulerId ? (locale === 'zh' ? ' · 君主亲治' : ' · Ruler') : ''}
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
            !preview.ok ||
            !canAppointGovernor(state, selectedCity.id, governorSelection || null).ok ||
            (!governorSelection && !selectedCity.governorId && !selectedCity.pendingAppointment)
          }
          title={localizeAppMessage(
            canAppointGovernor(state, selectedCity.id, governorSelection || null).reason ?? '',
            locale,
            state,
          )}
          onClick={() => {
            const result = dispatch({
              type: 'appointGovernor',
              cityId: selectedCity.id,
              officerId: governorSelection || null,
            });
            if (result?.ok) onComplete?.();
          }}
        >
          {personalRule
            ? locale === 'zh'
              ? '君主亲治'
              : 'Govern personally'
            : !governorSelection
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
      {personalRule ? (
        <p className="v03-muted">
          {locale === 'zh'
            ? '君主到达并于月界就任后，此城成为君主本城，原本城转为自治；生效前本城不变。'
            : 'After the ruler arrives and takes office at a monthly boundary, this city becomes the ruler’s capital and the previous capital becomes autonomous. Until then, the capital stays unchanged.'}
        </p>
      ) : null}
      {!preview.ok ? (
        <p role="status">{localizeAppMessage(preview.reason, locale, state)}</p>
      ) : null}
      {preview.ok && preview.transfer ? (
        <p className="v03-muted">
          {locale === 'zh'
            ? '所部随行（含伤兵）'
            : 'Contingent travels with the officer (including wounded)'}
          : {preview.transfer.party.troopCount} · {preview.transfer.route.estimatedDays}{' '}
          {locale === 'zh' ? '日；去返路粮' : 'days; outbound/return provisions'}:{' '}
          {preview.transfer.food}
        </p>
      ) : null}
      <PendingGovernor context={context} />
    </>
  );
}

export function PendingGovernor({
  context,
}: {
  context: GameplayContext & {
    selectedCity: NonNullable<GameplayContext['selectedCity']>;
  };
}) {
  const { selectedCity, state, locale, localizedOfficerName, t } = context;
  return (
    <>
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
            const personalRule =
              pendingOfficer?.id ===
              state.factions.find((faction) => faction.id === state.playerFactionId)!
                .leaderOfficerId;
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
                {personalRule
                  ? locale === 'zh'
                    ? ' 君主亲治待生效：就任时切换君主本城，原本城转为自治。'
                    : ' Personal rule pending: the capital moves on taking office; the previous capital becomes autonomous.'
                  : ''}
              </small>
            );
          })()
        : null}
    </>
  );
}
