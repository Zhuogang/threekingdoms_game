import { getCityCapabilities } from '../../governance/authority';

import { localizeAppMessage } from '../shared/app-copy-2';

import type { GameplayContext } from '../hooks/gameplayView';
import { GovernorAppointment } from './GovernorAppointment';
import { CityActions } from './CityActions';
export function GovernancePanel({
  context,
}: {
  context: GameplayContext & {
    state: NonNullable<GameplayContext['state']>;
    selectedCity: NonNullable<GameplayContext['selectedCity']>;
  };
}) {
  const { t, selectedCity, localizedOfficerName, state, locale } = context;
  return (
    <div className="v03-governor-box">
      <div className="v03-section-title">
        <h3>{selectedCity.governanceMode === 'ruler' ? t.rulerCapital : t.governor}</h3>
        <span>
          {selectedCity.governorId
            ? localizedOfficerName(
                state.officers.find((officer) => officer.id === selectedCity.governorId)?.name ??
                  '',
              )
            : selectedCity.governanceMode === 'ruler'
              ? ''
              : t.localSteward}
        </span>
      </div>
      {selectedCity.id !== state.playerCapitalCityId ? (
        <GovernorAppointment context={{ ...context, selectedCity: selectedCity! }} />
      ) : null}
      {selectedCity.governanceMode === 'ruler' ? (
        <CityActions context={{ ...context, selectedCity: selectedCity! }} />
      ) : (
        <small className="v03-muted">
          {localizeAppMessage(
            getCityCapabilities(state, selectedCity.id).reason ?? '',
            locale,
            state,
          )}
        </small>
      )}
    </div>
  );
}
