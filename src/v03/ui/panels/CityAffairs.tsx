import { TROOP_TYPES } from '../../campaign/troop-experience';
import { troopName } from '../../rendering/presentation';
import { getCityCapabilities } from '../../governance/authority';
import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, StatGrid } from '../kit';
import { localizeAppMessage } from '../shared/app-copy-2';
import { cityWorkActions, workLabel, WorkBudget, type CityWorkAction } from './CityWork';
import { PendingGovernor } from './GovernorAppointment';

export function CityAffairs({
  context,
  onWork,
  onGovernor,
}: {
  context: GameplayContext;
  onWork: (action: CityWorkAction) => void;
  onGovernor: () => void;
}) {
  const { state, selectedCity: city, locale, t } = context;
  if (!city) return null;
  const direct = city.id === state.playerCapitalCityId && city.governanceMode === 'ruler';
  return (
    <section className="v03-city-affairs">
      <StatGrid
        values={[
          ...TROOP_TYPES.map((type) => ({
            label: `${troopName(type, locale)} · ${message(locale, 'ui.reserve.soldiers.93')}`,
            value: city.reservePools[type].troops.toLocaleString(),
          })),
          { label: message(locale, 'flow.farming'), value: city.farming },
          { label: message(locale, 'flow.commerce'), value: city.commerce },
          { label: message(locale, 'ui.population.94'), value: city.population.toLocaleString() },
          {
            label: message(locale, 'ui.reserve.soldiers.93'),
            value: city.reserve.toLocaleString(),
          },
        ]}
      />
      {direct ? (
        <>
          <WorkBudget context={context} />
          <p className="v03-step-intro">{message(locale, 'flow.chooseWork')}</p>
          <div className="v03-work-menu">
            {cityWorkActions.map((action) => (
              <Button
                key={action}
                className="v03-step-choice"
                aria-label={workLabel(context, action)}
                onClick={() => onWork(action)}
              >
                <strong>{workLabel(context, action)}</strong>
                <span aria-hidden>→</span>
              </Button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>
            {localizeAppMessage(getCityCapabilities(state, city.id).reason ?? '', locale, state)}
          </p>
          <p>
            {t.governor}:{' '}
            {city.governorId
              ? context.localizedOfficerName(
                  state.officers.find((entry) => entry.id === city.governorId)?.name ?? '',
                )
              : t.localSteward}
          </p>
          <Button className="v03-step-choice" onClick={onGovernor}>
            {message(locale, 'flow.appointments')}
            <span aria-hidden>→</span>
          </Button>
          <PendingGovernor context={{ ...context, selectedCity: city }} />
        </>
      )}
    </section>
  );
}
