import { useMemo } from 'react';
import { AlertTriangle, Coins, Hammer, Swords, Users, Wheat, ScrollText } from 'lucide-react';
import { message } from '../../i18n';
import { forecastCityEconomy } from '../../campaign/economy';
import { pendingCityGovernance } from '../../governance/conquest';
import {
  cityWorkQuota,
  cityWorkRefreshDays,
  cityWorkUsedThisPeriod,
} from '../../governance/city-actions';
import { isOfficerCommitted } from '../../governance/commitments';
import { Button } from '../kit';
import { displayName } from '../shared/app-copy-3';
import type { GameplayContext } from '../hooks/gameplayView';

type StatusContext = GameplayContext & { state: NonNullable<GameplayContext['state']> };

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toLocaleString()}`;

/** Live campaign state in one strip: everything shown here is already computed by the rules. */
export function CampaignStatus({
  context,
  onOpenDirectory,
}: {
  context: StatusContext;
  onOpenDirectory: () => void;
}) {
  const { state, locale } = context;
  const summary = useMemo(() => {
    const own = state.cities.filter((city) => city.factionId === state.playerFactionId);
    let gold = 0,
      food = 0,
      goldNet = 0,
      foodNet = 0;
    for (const city of own) {
      const forecast = forecastCityEconomy(state, city.id);
      gold += city.gold;
      food += city.food;
      goldNet += forecast.projectedGold - city.gold;
      foodNet += forecast.projectedFood - city.food;
    }
    const threats = state.journeys
      .filter(
        (journey) =>
          journey.kind === 'campaign' &&
          journey.ownerFactionId !== state.playerFactionId &&
          (journey.status === 'outbound' || journey.status === 'waiting') &&
          own.some((city) => city.id === journey.destinationCityId),
      )
      .map((journey) => ({
        id: journey.id,
        cityId: journey.destinationCityId,
        days: Math.max(0, journey.expectedArrivalDay - state.absoluteDay),
      }))
      .sort((a, b) => a.days - b.days || a.id.localeCompare(b.id));
    const ready = state.officers.filter(
      (officer) =>
        officer.alive &&
        officer.factionId === state.playerFactionId &&
        officer.location.kind === 'city' &&
        officer.troops > 0 &&
        !isOfficerCommitted(state, officer.id),
    ).length;
    const capital = state.cities.find((city) => city.id === state.playerCapitalCityId);
    const quota = capital ? cityWorkQuota(state, capital) : 0;
    const work = capital ? Math.max(0, quota - cityWorkUsedThisPeriod(state, capital)) : 0;
    const legend = state.factions
      .map((faction) => ({
        faction,
        cities: state.cities.filter((city) => city.factionId === faction.id).length,
      }))
      .filter((entry) => entry.cities > 0)
      .sort(
        (a, b) =>
          Number(b.faction.id === state.playerFactionId) -
            Number(a.faction.id === state.playerFactionId) || b.cities - a.cities,
      );
    return { gold, food, goldNet, foodNet, threats, ready, quota, work, legend };
  }, [state]);
  const decisions =
    context.activeOrders.filter(
      (order) => !order.journeyId && ['proposed', 'waiting'].includes(order.status),
    ).length + pendingCityGovernance(state).length;
  const cityName = (id: string) => {
    const city = state.cities.find((entry) => entry.id === id);
    return city ? displayName(city, locale) : id;
  };
  const battleCity = (battle: (typeof context.activeBattles)[number]) =>
    state.journeys.find((journey) => journey.id === battle.attackerJourneyId)?.destinationCityId;
  return (
    <div className="v03-campaign-status" aria-label={message(locale, 'status.label')}>
      <div className="v03-status-items">
        <Button
          variant="ghost"
          size="sm"
          title={message(locale, 'status.workHint')}
          onClick={() => context.focusCampaignCity(state.playerCapitalCityId, { pan: true })}
        >
          <Hammer size={14} aria-hidden="true" />
          {message(locale, 'status.work', {
            remaining: summary.work,
            quota: summary.quota,
            days: cityWorkRefreshDays(state),
          })}
        </Button>
        <span className="v03-status-item" title={message(locale, 'status.netHint')}>
          <Coins size={14} aria-hidden="true" />
          {summary.gold.toLocaleString()} ({signed(summary.goldNet)})
        </span>
        <span
          className={`v03-status-item ${summary.foodNet < 0 ? 'is-warning' : ''}`}
          title={message(locale, 'status.netHint')}
        >
          <Wheat size={14} aria-hidden="true" />
          {summary.food.toLocaleString()} ({signed(summary.foodNet)})
        </span>
        {summary.threats.map((threat) => (
          <Button
            key={threat.id}
            variant="danger"
            size="sm"
            onClick={() => context.focusCampaignCity(threat.cityId, { pan: true })}
          >
            <AlertTriangle size={14} aria-hidden="true" />
            {message(locale, 'status.threat', { city: cityName(threat.cityId), days: threat.days })}
          </Button>
        ))}
        {context.activeBattles.map((battle) => (
          <Button
            key={battle.id}
            variant="danger"
            size="sm"
            onClick={() => {
              context.setSelectedBattleId(battle.id);
              context.setViewMode('battle');
            }}
          >
            <Swords size={14} aria-hidden="true" />
            {message(locale, 'status.battle', { city: cityName(battleCity(battle) ?? '') })}
          </Button>
        ))}
        {decisions ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              context.setCampaignTab('orders');
              context.setCampaignWindowOpen(true);
            }}
          >
            <ScrollText size={14} aria-hidden="true" />
            {message(locale, 'status.decisions', { count: decisions })}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onOpenDirectory}>
          <Users size={14} aria-hidden="true" />
          {message(locale, 'status.ready', { count: summary.ready })}
        </Button>
      </div>
      <ul className="v03-faction-legend" aria-label={message(locale, 'status.legend')}>
        {summary.legend.map(({ faction, cities }) => (
          <li key={faction.id}>
            <span className="v03-legend-swatch" style={{ backgroundColor: faction.color }} />
            {displayName(faction, locale)} {cities}
          </li>
        ))}
      </ul>
    </div>
  );
}
