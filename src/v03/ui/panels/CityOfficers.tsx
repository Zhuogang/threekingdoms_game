import { message } from '../../i18n';
import { officerBusyDays } from '../../governance/city-actions';
import type { V03Officer } from '../../types';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { TroopProgress } from './TroopProgress';
import { CityPersonnelPanel } from './CityPersonnelPanel';
import { UnitIcon } from '../../rendering/UnitIcon';
import { OfficerPortrait } from '../../rendering/OfficerPortrait';
import { OfficerProfile } from './OfficerProfile';
import { officerCopy, officerStatus, OFFICER_STATUS_LABELS } from '../shared/officer-view';
import {
  officerWorkActions,
  workLabel,
  workTaskName,
  WorkBudget,
  type CityWorkAction,
} from './CityWork';

/** The capital task an officer is still occupied with, if any. */
export function BusyNote({ context, officer }: { context: GameplayContext; officer: V03Officer }) {
  const days = officerBusyDays(context.state, officer);
  if (!days || !officer.cityWork || officer.factionId !== context.state.playerFactionId)
    return null;
  return (
    <small className="v03-officer-busy">
      {message(context.locale, 'officer.busy', {
        task: workTaskName(context, officer.cityWork.action as CityWorkAction),
        days,
      })}
    </small>
  );
}

/** Officers in the selected city (or its prisoners), grouped; each opens their detail. */
export function OfficerRoster({
  context,
  prisoners = false,
  onOfficer,
}: {
  context: GameplayContext;
  prisoners?: boolean;
  onOfficer: (id: string) => void;
}) {
  const { state, selectedCity: city, locale, t } = context;
  const copy = officerCopy[locale];
  const officers = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.location.kind === (prisoners ? 'captured' : 'city') &&
      !(officer.location.kind === 'captured' && officer.location.journeyId) &&
      'cityId' in officer.location &&
      officer.location.cityId === city?.id,
  );
  const groups = prisoners
    ? [{ title: message(locale, 'ui.prisoners.104'), people: officers }]
    : [
        { title: copy.serving, people: officers.filter((officer) => officer.factionId !== null) },
        { title: copy.free, people: officers.filter((officer) => officer.factionId === null) },
      ];
  if (!officers.length) return <p className="v03-muted">{message(locale, 'flow.emptyRoster')}</p>;
  return (
    <>
      {groups
        .filter((group) => group.people.length)
        .map((group) => (
          <section className="v03-city-roster-group" key={group.title}>
            <h4>
              {group.title} · {group.people.length}
            </h4>
            <div className="v03-roster-list">
              {group.people.map((officer) => (
                <Button
                  key={officer.id}
                  className="v03-step-choice"
                  onClick={() => onOfficer(officer.id)}
                  aria-label={displayName(officer, locale)}
                >
                  <OfficerPortrait id={officer.id} locale={locale} />
                  <span>
                    <strong>{displayName(officer, locale)}</strong>
                    <small>{OFFICER_STATUS_LABELS[officerStatus(officer)][locale]}</small>
                    <BusyNote context={context} officer={officer} />
                    {officer.factionId !== null ? (
                      <TroopProgress unit={officer} locale={locale} compact />
                    ) : null}
                    <small>
                      {officer.troops.toLocaleString()} {t.troops} ·{' '}
                      {message(locale, 'ui.force.53')} {officer.force} ·{' '}
                      {message(locale, 'ui.intellect.54')} {officer.intellect}
                    </small>
                  </span>
                  <span aria-hidden>→</span>
                </Button>
              ))}
            </div>
          </section>
        ))}
    </>
  );
}

export function CityPrisoners({
  context,
  onOfficer,
}: {
  context: GameplayContext;
  onOfficer: (id: string) => void;
}) {
  const { state, selectedCity: city, locale } = context;
  const askable =
    city?.factionId === state.playerFactionId
      ? state.officers.filter(
          (officer) =>
            officer.alive &&
            officer.location.kind === 'captured' &&
            !officer.location.journeyId &&
            officer.location.cityId === city.id &&
            officer.prisonerActionMonth !== state.monthIndex,
        ).length
      : 0;
  return (
    <section className="v03-roster">
      <p className="v03-step-intro">{message(locale, 'flow.choosePrisoner')}</p>
      {city?.factionId === state.playerFactionId ? (
        <>
          <Button
            className="v03-step-choice"
            disabled={!askable || state.phase === 'finished'}
            onClick={() => context.dispatch({ type: 'recruitPrisoners', cityId: city.id })}
          >
            {message(locale, 'prisoners.recruitAll', { count: askable })}
          </Button>
          <p className="v03-muted">{message(locale, 'prisoners.captivityHint')}</p>
        </>
      ) : null}
      <OfficerRoster context={context} prisoners onOfficer={onOfficer} />
    </section>
  );
}

export function OfficerDetail({
  context,
  officerId,
  onWork,
}: {
  context: GameplayContext;
  officerId: string;
  onWork: (action: CityWorkAction) => void;
}) {
  const { state, selectedCity: city, locale, t } = context;
  const officer = state.officers.find((entry) => entry.id === officerId);
  if (!officer) return null;
  const friendly =
    officer.alive &&
    officer.location.kind === 'city' &&
    officer.location.cityId === city?.id &&
    officer.factionId === state.playerFactionId &&
    city?.factionId === state.playerFactionId;
  const direct =
    friendly && city?.id === state.playerCapitalCityId && city.governanceMode === 'ruler';
  return (
    <section className="v03-officer-detail">
      <OfficerProfile state={state} id={officer.id} locale={locale} />
      {officer.factionId !== null ? (
        <div className="v03-troop-summary">
          <UnitIcon {...officer} onWater={false} locale={locale} />
          <TroopProgress unit={officer} locale={locale} />
        </div>
      ) : null}
      <p>{officer.equipment === 'Fine arms' ? t.fineArmsEquipped : t.noFineArms}</p>
      <BusyNote context={context} officer={officer} />
      {friendly ? (
        <>
          {city?.id === state.playerCapitalCityId ? (
            <WorkBudget context={context} />
          ) : (
            <p>{context.capitalReason('train', officer.id)}</p>
          )}
          {direct ? (
            <div className="v03-work-menu officer-work-menu">
              {officerWorkActions.map((action) => (
                <Button
                  key={action}
                  className="v03-step-choice"
                  onClick={() => onWork(action)}
                  aria-label={workLabel(context, action)}
                  disabled={
                    action === 'train' &&
                    !context.capitalAvailability(
                      action,
                      officer.id,
                      context.troopAssignments[officer.id] ?? officer.troops,
                    ).ok
                  }
                  title={
                    action !== 'train'
                      ? undefined
                      : context.capitalReason(
                          action,
                          officer.id,
                          context.troopAssignments[officer.id] ?? officer.troops,
                        )
                  }
                >
                  <strong>{workLabel(context, action)}</strong>
                  <span aria-hidden>→</span>
                </Button>
              ))}
            </div>
          ) : null}
          <CityPersonnelPanel context={context} officerId={officer.id} />
        </>
      ) : (
        <p className="v03-muted">{message(locale, 'flow.inspectOnly')}</p>
      )}
    </section>
  );
}
