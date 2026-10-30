import { message } from '../../i18n';
import { isCityCommitted } from '../../governance/commitments';
import { forecastCityEconomy } from '../../campaign/economy';
import type { GameplayContext } from '../hooks/gameplayView';
import { StatGrid } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { CityIllustration } from '../shared/CityIllustration';
import { WorkBudget } from './CityWork';
import {
  CityAdministration,
  CityLogistics,
  CityMilitary,
  CityOfficerSection,
  type CityOperations,
} from './CitySections';

/** One scrolling page: the city at a glance, then every operation grouped by purpose. */
export function CityOverview({
  context,
  operations,
}: {
  context: GameplayContext;
  operations: Omit<CityOperations, 'onMarch'>;
}) {
  const { state, selectedCity: city, locale, t } = context;
  if (!city) return null;
  const owner = state.factions.find((entry) => entry.id === city.factionId);
  const friendly = city.factionId === state.playerFactionId;
  const direct =
    friendly && city.id === state.playerCapitalCityId && city.governanceMode === 'ruler';
  const committed = isCityCommitted(state, city.id);
  const field = state.battles.find(
    (battle) =>
      battle.active &&
      state.journeys.find((journey) => journey.id === battle.attackerJourneyId)
        ?.destinationCityId === city.id,
  );
  const troops = field
    ? field.battleData.units
        .filter((unit) => unit.side === 'defender')
        .reduce((sum, unit) => sum + unit.troops, 0)
    : city.garrisonTroops;
  // The same next-settlement forecast governors use, shown to the player for their own cities.
  const economy = friendly && !field ? forecastCityEconomy(state, city.id) : null;
  const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toLocaleString()}`;
  const flow = (key: 'gold' | 'food') =>
    economy ? (
      <>
        {signed(economy.production[key] - economy.upkeep[key])}
        <small>
          {message(locale, 'city.flowDetail', {
            income: economy.production[key].toLocaleString(),
            upkeep: economy.upkeep[key].toLocaleString(),
          })}
        </small>
      </>
    ) : null;
  const netFood = economy ? economy.production.food - economy.upkeep.food : 0;
  const governor = city.governorId
    ? state.officers.find((entry) => entry.id === city.governorId)
    : undefined;
  const march = () => {
    context.setTargetCityId(friendly ? '' : city.id);
    if (!friendly) {
      const nearest = state.cities
        .filter(
          (entry) => entry.factionId === state.playerFactionId && !isCityCommitted(state, entry.id),
        )
        .map((entry) => ({
          city: entry,
          route: context.orderServices.planRoute({
            state,
            sourceCityId: entry.id,
            targetCityId: city.id,
            departureDay: state.absoluteDay,
            troopCount: 1,
            kind: 'campaign',
            composition: { troopTypes: [] },
          }),
        }))
        .filter((entry) => entry.route)
        // Prefer a source that can actually march: officers with troops who are not
        // reorganizing. Then the nearest, with the capital winning ties.
        .map((entry) => ({
          ...entry,
          ready: state.officers.some(
            (officer) =>
              officer.alive &&
              officer.factionId === state.playerFactionId &&
              officer.location.kind === 'city' &&
              officer.location.cityId === entry.city.id &&
              officer.troops > 0 &&
              officer.reorganizationDays === 0,
          ),
        }))
        .sort(
          (a, b) =>
            Number(b.ready) - Number(a.ready) ||
            a.route!.estimatedDays - b.route!.estimatedDays ||
            Number(b.city.id === state.playerCapitalCityId) -
              Number(a.city.id === state.playerCapitalCityId),
        )[0];
      if (nearest) context.setSelectedCityId(nearest.city.id);
    }
    context.setCampaignTab('forces');
  };
  const sections = { context, operations: { ...operations, onMarch: march }, direct };
  return (
    <div className="v03-city-overview">
      <div className="v03-city-hero">
        <CityIllustration city={city} />
        <div className="v03-city-summary" style={{ borderColor: owner?.color }}>
          <strong>
            {owner ? displayName(owner, locale) : message(locale, 'ui.independent.10')}
          </strong>
          <p>
            {city.id === state.playerCapitalCityId
              ? t.rulerCapital
              : friendly
                ? message(locale, 'flow.yourCity')
                : message(locale, 'flow.foreignCity')}
            {friendly
              ? ` · ${
                  direct
                    ? message(locale, 'city.ruledDirectly')
                    : governor
                      ? message(locale, 'city.governedBy', {
                          name: displayName(governor, locale),
                        })
                      : t.localSteward
                }`
              : ''}
          </p>
          {direct ? <WorkBudget context={context} /> : null}
          {committed ? <small>{message(locale, 'ui.garrison.in.the.field.92')}</small> : null}
        </div>
      </div>
      <StatGrid
        values={[
          { label: t.gold, value: city.gold.toLocaleString() },
          { label: t.food, value: (field?.defenderFood ?? city.food).toLocaleString() },
          ...(economy
            ? [
                { label: message(locale, 'city.monthlyGold'), value: flow('gold') },
                { label: message(locale, 'city.monthlyFood'), value: flow('food') },
              ]
            : []),
          { label: t.garrison, value: troops.toLocaleString() },
          {
            label: message(locale, 'city.reserveNotDefending'),
            value: city.reserve.toLocaleString(),
          },
          { label: message(locale, 'ui.population.94'), value: city.population.toLocaleString() },
          { label: message(locale, 'flow.publicOrder'), value: `${city.loyalty}%` },
          { label: message(locale, 'flow.farming'), value: city.farming.toLocaleString() },
          { label: message(locale, 'flow.commerce'), value: city.commerce.toLocaleString() },
          ...(economy
            ? [
                {
                  label: message(locale, 'city.foodRunway'),
                  value:
                    netFood >= 0
                      ? message(locale, 'city.foodGrowing')
                      : message(locale, 'city.foodMonths', {
                          months: Math.floor(city.food / -netFood),
                        }),
                },
              ]
            : []),
        ]}
      />
      <CityMilitary {...sections} friendly={friendly} committed={committed} />
      {friendly ? <CityAdministration {...sections} /> : null}
      <CityOfficerSection {...sections} />
      {friendly ? <CityLogistics {...sections} /> : null}
    </div>
  );
}
