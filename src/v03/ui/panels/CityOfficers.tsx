import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, StatGrid } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { TroopProgress } from './TroopProgress';
import { CityPersonnelPanel } from './CityPersonnelPanel';
import { UnitIcon } from '../../rendering/UnitIcon';
import { officerWorkActions, workLabel, WorkBudget, type CityWorkAction } from './CityWork';

export function CityOfficers({
  context,
  prisoners = false,
  onOfficer,
  onPrisoners,
}: {
  context: GameplayContext;
  prisoners?: boolean;
  onOfficer: (id: string) => void;
  onPrisoners?: () => void;
}) {
  const { state, selectedCity: city, locale, t } = context;
  const officers = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.location.kind === (prisoners ? 'captured' : 'city') &&
      'cityId' in officer.location &&
      officer.location.cityId === city?.id,
  );
  const captured = state.officers.filter(
    (officer) =>
      officer.alive && officer.location.kind === 'captured' && officer.location.cityId === city?.id,
  ).length;
  return (
    <section className="v03-roster">
      <p className="v03-step-intro">
        {message(locale, prisoners ? 'flow.choosePrisoner' : 'flow.chooseOfficer')}
      </p>
      {officers.length ? (
        <div className="v03-roster-list">
          {officers.map((officer) => (
            <Button
              key={officer.id}
              className="v03-step-choice"
              onClick={() => onOfficer(officer.id)}
              aria-label={displayName(officer, locale)}
            >
              <span>
                <strong>{displayName(officer, locale)}</strong>
                <TroopProgress unit={officer} locale={locale} compact />
                <small>
                  {officer.troops.toLocaleString()} {t.troops} · {message(locale, 'ui.force.53')}{' '}
                  {officer.force} · {message(locale, 'ui.intellect.54')} {officer.intellect}
                </small>
              </span>
              <span aria-hidden>→</span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="v03-muted">{message(locale, 'flow.emptyRoster')}</p>
      )}
      {!prisoners && captured > 0 ? (
        <Button className="v03-step-choice" onClick={onPrisoners}>
          {message(locale, 'ui.prisoners.104')} · {captured}
          <span aria-hidden>→</span>
        </Button>
      ) : null}
      {!prisoners ? <CityPersonnelPanel context={context} /> : null}
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
    officer.factionId === state.playerFactionId && city?.factionId === state.playerFactionId;
  return (
    <section className="v03-officer-detail">
      <div className="v03-troop-summary">
        <UnitIcon {...officer} onWater={false} locale={locale} />
        <TroopProgress unit={officer} locale={locale} />
      </div>
      <StatGrid
        values={[
          { label: t.troops, value: officer.troops.toLocaleString() },
          { label: message(locale, 'ui.loyalty.52'), value: officer.loyalty },
          { label: message(locale, 'ui.force.53'), value: officer.force },
          { label: message(locale, 'ui.intellect.54'), value: officer.intellect },
          { label: locale === 'zh' ? '武将经验' : 'Officer XP', value: officer.experience },
          { label: locale === 'zh' ? '武将等级' : 'Officer level', value: officer.level },
        ]}
      />
      <p>{officer.equipment === 'Fine arms' ? t.fineArmsEquipped : t.noFineArms}</p>
      {friendly ? (
        <>
          {city?.id === state.playerCapitalCityId ? (
            <WorkBudget context={context} />
          ) : (
            <p>{context.capitalReason('train', officer.id)}</p>
          )}
          <div className="v03-work-menu officer-work-menu">
            {officerWorkActions.map((action) => (
              <Button
                key={action}
                className="v03-step-choice"
                onClick={() => onWork(action)}
                aria-label={workLabel(context, action)}
              >
                <strong>{workLabel(context, action)}</strong>
                <span aria-hidden>→</span>
              </Button>
            ))}
          </div>
          <CityPersonnelPanel context={context} officerId={officer.id} />
        </>
      ) : (
        <p className="v03-muted">{message(locale, 'flow.inspectOnly')}</p>
      )}
    </section>
  );
}
