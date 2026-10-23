import { Landmark, Swords, Package, Users } from 'lucide-react';
import { message } from '../../i18n';
import { isCityCommitted } from '../../governance/commitments';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, StatGrid } from '../kit';
import { displayName } from '../shared/app-copy-3';

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
        .sort((a, b) => a.route!.estimatedDays - b.route!.estimatedDays)[0];
      if (nearest) context.setSelectedCityId(nearest.city.id);
    }
    context.setCampaignTab('forces');
  };
  return (
    <div className="v03-city-overview">
      <div className="v03-city-summary">
        <div className="v03-city-emblem" style={{ borderColor: owner?.color }}>
          {city.chinese.slice(0, 1)}
        </div>
        <div>
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
          { label: t.food, value: (field?.defenderFood ?? city.food).toLocaleString() },
          { label: t.gold, value: city.gold.toLocaleString() },
          { label: t.loyalty, value: `${city.loyalty}%` },
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
