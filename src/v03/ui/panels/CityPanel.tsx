import { message } from '../../i18n';
import { PrisonerPanel } from './PrisonerPanel';
import { Button } from '../kit';
import { isCityCommitted } from '../../governance/commitments';

import { displayName } from '../shared/app-copy-3';
import type { GameplayContext } from '../hooks/gameplayView';
import { GovernancePanel } from './GovernancePanel';

export function CityPanel({
  context,
}: {
  context: GameplayContext & {
    state: NonNullable<GameplayContext['state']>;
    selectedCity: NonNullable<GameplayContext['selectedCity']>;
  };
}) {
  const { state, selectedCity, t, locale } = context;
  return (
    <>
      <div className="v03-city-head">
        <div
          className="v03-city-seal"
          style={{
            borderColor:
              state.factions.find((faction) => faction.id === selectedCity.factionId)?.color ??
              '#817762',
          }}
        >
          {selectedCity.chinese.slice(0, 1)}
        </div>
        <div>
          <span
            className="v03-kicker"
            title={message(locale, 'ui.anchor.confidence.historical.anchors.are.regiona.398', {
              p0: context.selectedGeo?.confidence ?? '—',
            })}
          >
            {t.city}
          </span>
          <h2>{displayName(selectedCity, locale)}</h2>
          <small>
            {state.factions.find((faction) => faction.id === selectedCity.factionId)?.name ??
              message(locale, 'ui.independent.10')}
          </small>
        </div>
      </div>
      <div className="v03-city-stats">
        <div>
          <small>{t.governance}</small>
          <strong>
            {selectedCity.governanceMode === 'ruler'
              ? t.rulerCapital
              : selectedCity.governanceMode === 'governor'
                ? t.governor
                : t.localSteward}
          </strong>
        </div>
        <div>
          <small>{t.garrison}</small>
          <strong>
            {isCityCommitted(state, selectedCity.id)
              ? `${message(locale, 'ui.garrison.in.the.field.92')}: ${state.battles
                  .filter(
                    (battle) =>
                      battle.active &&
                      state.journeys.find((journey) => journey.id === battle.attackerJourneyId)
                        ?.destinationCityId === selectedCity.id,
                  )
                  .flatMap((battle) =>
                    battle.battleData.units.filter((unit) => unit.side === 'defender'),
                  )
                  .reduce((sum, unit) => sum + unit.troops, 0)
                  .toLocaleString()}`
              : selectedCity.garrisonTroops.toLocaleString()}
          </strong>
        </div>
        <div>
          <small>{message(locale, 'ui.reserve.soldiers.93')}</small>
          <strong>{selectedCity.reserve.toLocaleString()}</strong>
        </div>
        <div>
          <small>{message(locale, 'ui.population.94')}</small>
          <strong>{selectedCity.population.toLocaleString()}</strong>
        </div>
        <div>
          <small>{t.food}</small>
          <strong>
            {(isCityCommitted(state, selectedCity.id)
              ? (state.battles.find(
                  (battle) =>
                    battle.active &&
                    state.journeys.find((journey) => journey.id === battle.attackerJourneyId)
                      ?.destinationCityId === selectedCity.id,
                )?.defenderFood ?? selectedCity.food)
              : selectedCity.food
            ).toLocaleString()}
          </strong>
        </div>
        <div>
          <small>{t.gold}</small>
          <strong>{selectedCity.gold.toLocaleString()}</strong>
        </div>
        <div>
          <small>{t.loyalty}</small>
          <strong>{selectedCity.loyalty}%</strong>
        </div>
        <div>
          <small>{message(locale, 'ui.economy.95')}</small>
          <strong>
            {selectedCity.farming} / {selectedCity.commerce}
          </strong>
        </div>
      </div>
      <PrisonerPanel context={context} />
      {selectedCity.factionId !== state.playerFactionId ? (
        <>
          <div className="v03-officer-list">
            {state.officers
              .filter(
                (officer) =>
                  officer.alive &&
                  officer.location.kind === 'city' &&
                  officer.location.cityId === selectedCity.id,
              )
              .map((officer) => (
                <p key={officer.id}>
                  {displayName(officer, locale)} · {officer.troops.toLocaleString()}
                </p>
              ))}
          </div>
          <Button
            onClick={() => {
              const sources = state.cities
                .filter(
                  (city) =>
                    city.factionId === state.playerFactionId && !isCityCommitted(state, city.id),
                )
                .map((city) => ({
                  city,
                  route: context.orderServices.planRoute({
                    state,
                    sourceCityId: city.id,
                    targetCityId: selectedCity.id,
                    departureDay: state.absoluteDay,
                    troopCount: 1,
                    kind: 'campaign',
                    composition: { troopTypes: [] },
                  }),
                }))
                .filter((entry) => entry.route)
                .sort((a, b) => a.route!.estimatedDays - b.route!.estimatedDays);
              context.setTargetCityId(selectedCity.id);
              if (sources[0]) context.setSelectedCityId(sources[0].city.id);
              context.setCampaignTab('forces');
            }}
          >
            {message(locale, 'ui.march.here.96')}
          </Button>
        </>
      ) : null}
      {selectedCity.factionId === state.playerFactionId ? (
        <GovernancePanel context={{ ...context, selectedCity: selectedCity! }} />
      ) : (
        <p className="v03-muted">{message(locale, 'ui.this.city.is.outside.your.authority.97')}</p>
      )}
    </>
  );
}
