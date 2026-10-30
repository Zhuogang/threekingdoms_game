import { message } from './';
import type { V03DomainEvent, V03GameState } from '../types';
import { gameDate } from '../types';
import type { V03Locale } from '../wiki';

/** New reports use stable data; old saves fall back to the legacy reader. */
export function formatEvent(
  event: V03DomainEvent,
  state: V03GameState,
  locale: V03Locale,
): { title: string; detail: string } | null {
  if (!event.code) return null;
  const name = (id: unknown, kind: 'cities' | 'officers' | 'factions') => {
    const entry = state[kind].find((item) => item.id === id);
    return entry
      ? locale === 'zh'
        ? entry.chinese
        : entry.name
      : message(locale, 'ui.independent.10');
  };
  const p = event.params ?? {};
  if (event.code === 'city.governance')
    return {
      title: locale === 'zh' ? '城市治理已安排' : 'City governance arranged',
      detail:
        locale === 'zh'
          ? `${name(p.cityId, 'cities')}：${p.choice === 'self' ? '君主亲治，已切换君主本城。' : `已选择${name(p.officerId, 'officers')}任太守；跨城调任以到达和任职时间为准。`}`
          : `${name(p.cityId, 'cities')}: ${p.choice === 'self' ? 'the ruler now governs personally; the ruler’s capital has moved.' : `${name(p.officerId, 'officers')} was chosen as governor; transfers take effect after arrival and the appointment date.`}`,
    };
  if (event.code === 'officer.debut') {
    const names = String(p.officerIds ?? '')
      .split(',')
      .filter(Boolean)
      .map((id) => name(id, 'officers'))
      .join(locale === 'zh' ? '、' : ', ');
    return {
      title: locale === 'zh' ? '人才登场' : 'New local officers',
      detail:
        locale === 'zh'
          ? `${p.year}年：${names}已在当地登场，可通过城务搜索招募。`
          : `${p.year}: ${names} appeared locally and can be recruited through city searches.`,
    };
  }
  if (event.code === 'battle.outcome' && event.battleOutcome) {
    const report = event.battleOutcome;
    const city = name(report.cityId, 'cities');
    const battle = state.battles.find((entry) => entry.id === event.entityId);
    const playerSide =
      battle?.attackerFactionId === state.playerFactionId
        ? 'attacker'
        : battle?.defenderFactionId === state.playerFactionId
          ? 'defender'
          : null;
    const held = report.cityCaptured
      ? message(locale, 'ui.city.captured.157')
      : message(locale, 'ui.city.held.158');
    const winner = name(
      report.winner === 'attacker' ? battle?.attackerFactionId : battle?.defenderFactionId,
      'factions',
    );
    return {
      title: playerSide
        ? report.winner === 'draw'
          ? message(locale, 'ui.battle.drawn.159')
          : report.winner === playerSide
            ? message(locale, 'ui.field.victory.160')
            : message(locale, 'ui.field.defeat.161')
        : message(locale, 'ui.battle.at.holds.162', { p0: city, p1: winner }),
      detail: `${city} · ${held}`,
    };
  }
  if (event.code === 'threat.approach') {
    const arrival = gameDate({ startYear: state.startYear, absoluteDay: Number(p.arrivalDay) });
    const raid = p.intent === 'raid';
    return {
      title: message(locale, raid ? 'event.raid.title' : 'event.threat.title', {
        city: name(p.targetCityId, 'cities'),
      }),
      detail: message(locale, raid ? 'event.raid.detail' : 'event.threat.detail', {
        faction: name(p.factionId, 'factions'),
        source: name(p.sourceCityId, 'cities'),
        city: name(p.targetCityId, 'cities'),
        troops: Number(p.troops).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US'),
        date: message(locale, 'ui.month.day.137', {
          p0: arrival.year,
          p1: arrival.month,
          p2: arrival.day,
        }),
        days: Math.max(0, Number(p.arrivalDay) - event.absoluteDay),
      }),
    };
  }
  if (event.code === 'month.summary')
    return {
      title: message(locale, 'ui.monthly.summary.163'),
      detail: message(locale, 'ui.net.city.changes.governor.actions.and.shortages..164'),
    };
  if (event.code === 'ruler.succession')
    return {
      title: message(locale, 'ui.a.new.ruler.succeeds.165'),
      detail: message(locale, 'ui.succeeds.who.is.captured.or.no.longer.free.166', {
        p0: name(p.previousOfficerId, 'officers'),
        p1: name(p.successorOfficerId, 'officers'),
      }),
    };
  if (event.code === 'ruler.eliminated')
    return {
      title: message(locale, 'ui.house.eliminated.167'),
      detail: message(locale, 'ui.has.no.free.officer.remaining.168', {
        p0: name(p.factionId, 'factions'),
      }),
    };
  if (event.code === 'prisoner.decision') {
    const actions: Record<string, string> = {
      release: message(locale, 'ui.released.169'),
      recruit: message(locale, 'ui.recruited.170'),
      exchange: message(locale, 'ui.exchanged.171'),
      execute: message(locale, 'ui.executed.172'),
    };
    return {
      title: message(locale, 'ui.prisoner.decision.173'),
      detail: `${name(p.officerId, 'officers')} · ${p.accepted ? actions[String(p.action)] : message(locale, 'ui.refused.174')}${p.accepted && p.rulerDefection ? (locale === 'zh' ? `。${name(p.formerFactionId, 'factions')}的其余在世武将忠诚下降 ${p.officerLoyaltyLoss} 点，所属城池民心下降 ${p.cityLoyaltyLoss} 点，最低为 0。` : `. ${name(p.formerFactionId, 'factions')}: remaining living officers lose ${p.officerLoyaltyLoss} loyalty and owned cities lose ${p.cityLoyaltyLoss} loyalty, floored at zero.`) : ''}`,
    };
  }
  if (event.code === 'battleReady') {
    const battle = state.battles.find((entry) => entry.id === event.entityId);
    const journey = state.journeys.find((entry) => entry.id === battle?.attackerJourneyId);
    const city = name(journey?.destinationCityId, 'cities');
    return {
      title: message(locale, 'ui.the.battle.at.begins.175', { p0: city }),
      detail: message(locale, 'ui.the.armies.have.deployed.in.the.field.176'),
    };
  }
  if (event.code === 'battle.withdrawalAsked') {
    const battle = state.battles.find((entry) => entry.id === event.entityId);
    const journey = state.journeys.find((entry) => entry.id === battle?.attackerJourneyId);
    const city = name(journey?.destinationCityId, 'cities');
    return {
      title: message(locale, 'event.withdrawalAsked', { city }),
      detail: message(locale, 'event.withdrawalAskedDetail'),
    };
  }
  if (event.code === 'journey.strandedSurrender')
    return {
      title: locale === 'zh' ? '归途无援，队伍投降' : 'Stranded return party surrendered',
      detail:
        locale === 'zh'
          ? `${name(p.factionId, 'factions')}的返程队伍在${name(p.cityId, 'cities')}投降：本势力已无城池、在途出征或未结束的战斗。武将及其健卒、伤兵转为俘虏。接收方取得 ${p.gold} 金、${p.food} 粮；其中 ${p.waitingGold} 金、${p.waitingFood} 粮仍在城外等待仓储空间。`
          : `${name(p.factionId, 'factions')}'s returning party surrendered at ${name(p.cityId, 'cities')}: its house has no cities, active campaigns or battles. Officers retain their healthy and wounded troops in captivity. The receiving city takes ${p.gold} gold and ${p.food} food; ${p.waitingGold} gold and ${p.waitingFood} food remain outside awaiting storage space.`,
    };
  if (event.code === 'journey.captured')
    return {
      title: message(locale, 'event.officersCaptured'),
      detail: message(locale, 'event.officersCapturedDetail', {
        officers: String(p.officerIds ?? '')
          .split(',')
          .map((id) => name(id, 'officers'))
          .join(', '),
        city: name(p.cityId, 'cities'),
      }),
    };
  if (event.code === 'journeyArrival') {
    const journey = state.journeys.find((entry) => entry.id === event.entityId);
    return {
      title: message(locale, 'ui.journey.report.177'),
      detail: message(locale, 'ui.the.party.has.reached.178', {
        p0: name(journey?.destinationCityId, 'cities'),
      }),
    };
  }
  const titles: Record<string, import('./en').MessageKey> = {
    requisitionResponse: 'event.requisitionResponse',
    governorChanged: 'event.governorChanged',
    campaignEvent: 'event.campaignEvent',
    hegemonWarning: 'event.hegemonWarning',
    diplomacy: 'event.diplomacy',
    factionEliminated: 'event.factionEliminated',
    victory: 'event.victory',
  };
  const key = titles[event.code];
  if (key)
    return {
      title: message(locale, key),
      detail: message(locale, 'event.detail', {
        name: name(event.entityId, event.kind === 'governorChanged' ? 'cities' : 'factions'),
      }),
    };
  return null;
}
