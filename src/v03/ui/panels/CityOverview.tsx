import { Landmark, Swords, Package, Users } from 'lucide-react';
import { message } from '../../i18n';
import { isCityCommitted } from '../../governance/commitments';
import { forecastCityEconomy } from '../../campaign/economy';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, StatGrid } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { CityIllustration } from '../shared/CityIllustration';

export function CityOverview({
  context,
  onManage,
  onSupplies,
  onOfficers,
}: {
  context: GameplayContext;
  onManage: () => void;
  onSupplies: () => void;
  onOfficers: () => void;
}) {
  const { state, selectedCity: city, locale, t } = context;
  if (!city) return null;
  const owner = state.factions.find((entry) => entry.id === city.factionId);
  const friendly = city.factionId === state.playerFactionId;
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
  const net = economy
    ? {
        gold: economy.production.gold - economy.upkeep.gold,
        food: economy.production.food - economy.upkeep.food,
      }
    : null;
  const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toLocaleString()}`;
  const officers = state.officers.filter(
    (officer) =>
      officer.alive && officer.location.kind === 'city' && officer.location.cityId === city.id,
  );
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
          </p>
          <small>
            {committed
              ? message(locale, 'ui.garrison.in.the.field.92')
              : message(locale, 'flow.chooseAction')}
          </small>
        </div>
      </div>
      <StatGrid
        values={[
          { label: t.garrison, value: troops.toLocaleString() },
          {
            label: message(locale, 'city.reserveNotDefending'),
            value: city.reserve.toLocaleString(),
          },
          { label: t.food, value: (field?.defenderFood ?? city.food).toLocaleString() },
          { label: t.gold, value: city.gold.toLocaleString() },
          { label: message(locale, 'flow.farming'), value: city.farming.toLocaleString() },
          { label: message(locale, 'flow.commerce'), value: city.commerce.toLocaleString() },
          { label: message(locale, 'ui.population.94'), value: city.population.toLocaleString() },
          { label: message(locale, 'flow.publicOrder'), value: `${city.loyalty}%` },
          ...(economy && net
            ? [
                {
                  label: message(locale, 'city.monthlyGold'),
                  value: message(locale, 'city.monthlyFlow', {
                    net: signed(net.gold),
                    income: economy.production.gold.toLocaleString(),
                    upkeep: economy.upkeep.gold.toLocaleString(),
                  }),
                },
                {
                  label: message(locale, 'city.monthlyFood'),
                  value: message(locale, 'city.monthlyFlow', {
                    net: signed(net.food),
                    income: economy.production.food.toLocaleString(),
                    upkeep: economy.upkeep.food.toLocaleString(),
                  }),
                },
                {
                  label: message(locale, 'city.foodRunway'),
                  value:
                    net.food >= 0
                      ? message(locale, 'city.foodGrowing')
                      : message(locale, 'city.foodMonths', {
                          months: Math.floor(city.food / -net.food),
                        }),
                },
              ]
            : []),
        ]}
      />
      <div className="v03-city-actions-grid">
        <Button variant="primary" className="v03-city-action" onClick={march} disabled={committed}>
          <Swords size={28} />
          <span>
            <strong>{message(locale, friendly ? 'flow.march' : 'ui.march.here.96')}</strong>
            <small>{message(locale, 'flow.marchHint')}</small>
          </span>
          <span aria-hidden>→</span>
        </Button>
        <Button className="v03-city-action" onClick={onOfficers}>
          <Users size={26} />
          <span>
            <strong>
              {message(locale, 'flow.officers')} · {officers.length}
            </strong>
            <small>{message(locale, 'flow.officersHint')}</small>
          </span>
          <span aria-hidden>→</span>
        </Button>
        {friendly ? (
          <>
            <Button className="v03-city-action" onClick={onManage}>
              <Landmark size={26} />
              <span>
                <strong>{message(locale, 'flow.manage')}</strong>
                <small>{message(locale, 'flow.manageHint')}</small>
              </span>
              <span aria-hidden>→</span>
            </Button>
            <Button className="v03-city-action" onClick={onSupplies}>
              <Package size={26} />
              <span>
                <strong>{t.requestSupplies}</strong>
                <small>{message(locale, 'flow.suppliesHint')}</small>
              </span>
              <span aria-hidden>→</span>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
