import { message } from '../../i18n';
import { formatEvent } from '../../i18n/events';

import { type V03Locale } from '../../wiki';

import type { V03DomainEvent, V03GameState } from '../../types';
import { gameDate } from '../../types';

import { localizeOrderMessage } from './legacy-feedback';
export function localizedEvent(
  event: V03DomainEvent,
  state: V03GameState,
  locale: V03Locale,
): { title: string; detail: string } {
  const structured = formatEvent(event, state, locale);
  if (structured) return structured;
  const cityName = (id: string | null | undefined) => {
    const city = state.cities.find((entry) => entry.id === id);
    return city?.chinese ?? id ?? '未知城市';
  };
  const factionName = (id: string | null | undefined) => {
    if (!id) return '中立势力';
    return state.factions.find((faction) => faction.id === id)?.chinese ?? id;
  };
  if (event.kind === 'diplomacy') {
    const faction = factionName(event.entityId);
    const [result, rawChance] = event.detail.split(':');
    const chance = Number(rawChance);
    const titles: Record<string, Record<V03Locale, string>> = {
      'Alliance accepted': { en: 'Alliance accepted', zh: '同盟成立' },
      'Alliance declined': { en: 'Alliance declined', zh: '同盟遭拒' },
      'Alliance broken': { en: 'Alliance ended', zh: '同盟已解除' },
      'Coalition joined': { en: 'Coalition joined', zh: '已加入聯盟' },
    };
    const title = titles[event.title]?.[locale] ?? event.title;
    if (locale === 'zh') {
      if (result === 'accepted') return { title, detail: `與${faction}的六個月同盟已生效。` };
      if (result === 'declined')
        return { title, detail: `${faction}拒絕了提議（${chance}% 接受概率）。` };
      if (result === 'broken') return { title, detail: `與${faction}的同盟已解除。` };
      return { title, detail: `${faction}加入討伐董卓聯盟，並與存續盟友締結六個月同盟。` };
    }
    if (result === 'accepted')
      return { title, detail: `A six-month alliance with ${faction} is now active.` };
    if (result === 'declined')
      return { title, detail: `${faction} declined the offer (${chance}% acceptance chance).` };
    if (result === 'broken') return { title, detail: `The alliance with ${faction} has ended.` };
    return {
      title,
      detail: `${faction} joined the anti-Dong coalition and formed six-month treaties with its surviving members.`,
    };
  }
  if (event.kind === 'campaignEvent') {
    let payload: { key?: string; entityIds?: string[] } = {};
    try {
      payload = JSON.parse(event.detail) as typeof payload;
    } catch {
      /* Keep the event readable if imported text is malformed. */
    }
    if (
      payload.key === 'governor-appointment-delayed' ||
      payload.key === 'governor-appointment-cancelled'
    ) {
      const city = state.cities.find((entry) => entry.id === payload.entityIds?.[0]);
      const officer = state.officers.find((entry) => entry.id === payload.entityIds?.[1]);
      if (payload.key === 'governor-appointment-delayed')
        return locale === 'zh'
          ? {
              title: '太守任命延後',
              detail: `${officer?.chinese ?? '候選人'}尚未抵達${city?.chinese ?? '目標城市'}，任命將於下月再次檢查；目前治理安排保持不變。`,
            }
          : {
              title: 'Governor appointment delayed',
              detail: `${officer?.name ?? 'The candidate'} has not reached ${city?.name ?? 'the city'}. Current governance remains unchanged; the appointment will be checked again next month.`,
            };
      return locale === 'zh'
        ? {
            title: '太守任命已取消',
            detail: `${city?.chinese ?? '該城'}的候選人已不再符合任命條件，目前治理安排保持不變；你可以重新選擇人選。`,
          }
        : {
            title: 'Governor appointment cancelled',
            detail: `${city?.name ?? 'The city'}’s candidate is no longer eligible. Current governance remains unchanged; you may choose another candidate.`,
          };
    }
    const labels: Record<string, Record<V03Locale, string>> = {
      'anti-dong-coalition': {
        en: 'An anti-Dong coalition formed among rival houses.',
        zh: '諸侯組成了討伐董卓的聯盟。',
      },
      'dong-burns-luoyang': {
        en: 'Dong Zhuo evacuated Luoyang and moved officers, reserves, and supplies toward Chang’an.',
        zh: '董卓撤離洛陽，將武將、預備兵與物資轉往長安。',
      },
      plague: {
        en: 'A plague reduced city population and public support.',
        zh: '疫病造成城市人口與民心下降。',
      },
      'bumper-harvest': {
        en: 'A bumper harvest added food to the city stores.',
        zh: '豐收為城市糧倉增加了糧食。',
      },
      locusts: {
        en: 'Locusts consumed part of the city’s food stores.',
        zh: '蝗災消耗了部分城市存糧。',
      },
      bandits: {
        en: 'Bandits stole gold and reserves and weakened public support.',
        zh: '盜匪劫走金錢與預備兵，民心也有所下降。',
      },
      'wandering-officer': {
        en: 'A wandering officer moved to a new city.',
        zh: '一名在野武將前往新的城市。',
      },
      'come-of-age': {
        en: 'An officer came of age and improved force and intellect.',
        zh: '一名武將成年，統率與智力有所提升。',
      },
      festival: {
        en: 'A city held a festival, spending gold to improve public support.',
        zh: '城市舉辦節慶，花費金錢提升民心。',
      },
      drought: { en: 'Drought damaged farmland.', zh: '旱災損害了農田。' },
      scholar: {
        en: 'A scholar improved an officer’s intellect.',
        zh: '一名武將受到學者啟發，智力提升。',
      },
      'alliance-expired': { en: 'A six-month alliance expired.', zh: '一項六個月同盟已到期。' },
      'coalition-invitation': {
        en: 'The coalition invited your faction to join its treaties against Dong Zhuo.',
        zh: '討伐董卓的聯盟邀請你的勢力加入同盟。',
      },
    };
    const key = payload.key ?? '';
    const affected = (payload.entityIds ?? []).map((id) => {
      const city = state.cities.find((entry) => entry.id === id);
      const officer = state.officers.find((entry) => entry.id === id);
      const faction = state.factions.find((entry) => entry.id === id);
      return locale === 'zh'
        ? (city?.chinese ?? officer?.chinese ?? faction?.chinese ?? id)
        : (city?.name ?? officer?.name ?? faction?.name ?? id);
    });
    const body = labels[key]?.[locale] ?? message(locale, 'ui.a.campaign.event.occurred.133');
    const title =
      key === 'coalition-invitation'
        ? message(locale, 'ui.anti.dong.coalition.invitation.134')
        : message(locale, 'ui.campaign.event.135');
    return {
      title,
      detail:
        affected.length && key !== 'anti-dong-coalition'
          ? `${body} ${affected.join(message(locale, 'ui.text.136'))}`
          : body,
    };
  }
  if (event.kind === 'hegemonWarning') {
    const faction = factionName(event.entityId);
    const months = Number(event.detail);
    return locale === 'zh'
      ? {
          title: '稱霸進度警告',
          detail: `${faction}已控制洛陽與十六座城市，連續維持 ${months} 個月。`,
        }
      : {
          title: event.title,
          detail: `${faction} holds Luoyang and sixteen cities; its claim has lasted ${months} month${months === 1 ? '' : 's'}.`,
        };
  }
  if (locale === 'en') return { title: event.title, detail: event.detail };
  if (event.kind === 'monthBoundary') {
    const date = gameDate({ startYear: state.startYear, absoluteDay: event.absoluteDay });
    return {
      title: '月度结算完成',
      detail: `${date.year} 年 ${date.month} 月的经济与治理变更已完成结算。`,
    };
  }
  if (event.kind === 'governorChanged') {
    const city = state.cities.find((entry) => entry.id === event.entityId);
    const officer = city?.governorId
      ? state.officers.find((entry) => entry.id === city.governorId)
      : null;
    return officer
      ? { title: '新太守就任', detail: `${officer.chinese}现任${city?.chinese ?? '该城'}太守。` }
      : { title: '城市改由地方班底治理', detail: `${city?.chinese ?? '该城'}目前没有正式太守。` };
  }
  if (event.kind === 'battleReady' || event.kind === 'battleResolved') {
    const battle = state.battles.find((entry) => entry.id === event.entityId);
    const journey = state.journeys.find((entry) => entry.id === battle?.attackerJourneyId);
    const target = cityName(journey?.destinationCityId);
    if (event.kind === 'battleReady' && battle)
      return {
        title: '野战开始',
        detail: `${factionName(battle.attackerFactionId)}在${target}附近遭遇${factionName(battle.defenderFactionId)}。`,
      };
    if (battle) {
      const winner = battle.outcome === 'draw' ? null : battle.outcome;
      const winningFactionId =
        winner === 'attacker'
          ? battle.attackerFactionId
          : winner === 'defender'
            ? battle.defenderFactionId
            : null;
      const title =
        event.title === 'Field victory'
          ? '野战获胜'
          : event.title === 'Field defeat'
            ? '野战失利'
            : '野战平局';
      return {
        title,
        detail: winningFactionId
          ? `${factionName(winningFactionId)}在${target}控制战场。`
          : `双方在${target}未分胜负，守方保有城市。`,
      };
    }
  }
  if (event.kind === 'journeyArrival') {
    const journey = state.journeys.find((entry) => entry.id === event.entityId);
    const target = cityName(journey?.destinationCityId);
    const titleMap: Record<string, string> = {
      'Army arrived without a commander': '部队抵达但没有可用主将',
      'Destination unavailable': '目标不可用',
      'Warehouse full': '仓库已满',
      'March arrived safely': '部队安全抵达',
      'Army awaiting battle queue': '部队等待战场队列',
      'Route redirected': '行程已改道',
      'Party awaiting refuge': '队伍等待安置',
      'Journey arrived': '行程抵达',
    };
    const title = titleMap[event.title] ?? '行程报告';
    if (event.title === 'Warehouse full')
      return { title, detail: `${target}的仓储容量不足；队伍与全部货物继续保留并等待卸货。` };
    if (event.title === 'March arrived safely')
      return { title, detail: `出征队抵达${target}时，该城已归友方控制，因此没有发生战斗。` };
    if (event.title === 'Army awaiting battle queue')
      return { title, detail: `${target}已有一场野战，部队在城外等待，粮草仍会持续消耗。` };
    if (event.title === 'Route redirected')
      return { title, detail: `${target}已不再友好，运输队正返回可通行的友方城市。` };
    if (event.title === 'Party awaiting refuge')
      return {
        title,
        detail: `${target}已不再友好，目前没有可到达的友方城市；队伍与货物仍记录在等待行程中。`,
      };
    if (event.title === 'Journey arrived') return { title, detail: '运输队已抵达目标城市。' };
    if (event.title === 'Army arrived without a commander')
      return { title, detail: `部队已抵达${target}，但没有可用的存活主将。` };
    if (event.title === 'Destination unavailable')
      return { title, detail: '目标城市已不存在，队伍和货物仍保留在等待行程中。' };
  }
  if (event.kind === 'factionEliminated')
    return { title: '你的势力已覆灭', detail: '旗下已没有任何城市。' };
  if (event.kind === 'victory') {
    const faction = factionName(event.entityId);
    if (event.title === 'Proclaimed Hegemon')
      return {
        title: '稱霸天下',
        detail: `${faction}連續十二個月控制洛陽與十六座城市，正式稱霸。`,
      };
    const unified = state.cities.every((city) => city.factionId === event.entityId);
    return unified
      ? { title: '天下一统', detail: `${faction}已控制全部城市。` }
      : { title: '战役结束', detail: `${faction}控制了你的旧都。` };
  }
  return { title: event.title, detail: localizeOrderMessage(event.detail, locale) };
}
