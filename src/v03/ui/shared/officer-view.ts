import { OFFICER_CATALOG, OFFICER_CATALOG_BY_ID } from '../../content/officer-catalog';
import { officerAgeAtYear } from '../../content/officer-timeline';
import { custodyHolder } from '../../campaign/personnel';
import { officerRosterPlan } from '../../campaign/officer-lifecycle';
import type { V03GameState, V03Officer } from '../../types';

export const OFFICER_STATUSES = ['serving', 'free', 'captured', 'pending', 'deceased'] as const;
export type OfficerStatus = (typeof OFFICER_STATUSES)[number];
export const OFFICER_STATUS_LABELS: Record<OfficerStatus, { zh: string; en: string }> = {
  serving: { zh: '在职', en: 'Serving' },
  free: { zh: '在野', en: 'Free' },
  captured: { zh: '被俘', en: 'Captured' },
  pending: { zh: '未登场', en: 'Not yet appeared' },
  deceased: { zh: '已故', en: 'Deceased' },
};
export function officerStatus(officer?: V03Officer): OfficerStatus {
  if (!officer) return 'pending';
  if (!officer.alive) return 'deceased';
  if (officer.location.kind === 'captured') return 'captured';
  return officer.factionId === null ? 'free' : 'serving';
}
/** Read-only projection: future/dead records are never created or repaired by viewing them. */
export function officerDossier(state: V03GameState, id: string) {
  const definition = OFFICER_CATALOG_BY_ID.get(id);
  if (!definition) return null;
  const runtime = state.officers.find((officer) => officer.id === id);
  const year = state.startYear + Math.floor(state.monthIndex / 12);
  const status = officerStatus(runtime);
  const opening = officerRosterPlan(state.scenarioId)?.opening.officers.find(
    (entry) => entry.id === id,
  );
  const battle =
    runtime?.location.kind === 'battle'
      ? state.battles.find(
          (entry) =>
            runtime.location.kind === 'battle' &&
            entry.id === runtime.location.battleId &&
            entry.active,
        )
      : undefined;
  const formation =
    battle &&
    Object.entries({
      ...battle.attackerFormationOfficerIds,
      ...battle.defenderFormationOfficerIds,
    }).find(([, members]) => members.includes(id));
  const unit = formation && battle?.battleData.units.find((entry) => entry.id === formation[0]);
  const cityId =
    runtime &&
    (runtime.location.kind === 'city' ||
      (runtime.location.kind === 'captured' && !runtime.location.journeyId))
      ? runtime.location.cityId
      : null;
  return {
    definition,
    runtime,
    year,
    status,
    cityId,
    age: runtime ? runtime.age : officerAgeAtYear(definition.timeline.birthYear, year),
    holderFactionId: runtime ? custodyHolder(state, runtime) : null,
    opening,
    personnel: unit
      ? { troops: unit.troops, wounded: unit.wounded, shared: formation![1].length > 1 }
      : runtime
        ? { troops: runtime.troops, wounded: runtime.wounded, shared: false }
        : null,
    canVisitCity: Boolean(runtime?.alive && cityId),
  };
}
export function officerDirectory(
  state: V03GameState,
  query = '',
  status: OfficerStatus | 'all' = 'all',
) {
  const search = query.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
  return OFFICER_CATALOG.map((definition) => officerDossier(state, definition.id)!).filter(
    (entry) =>
      (status === 'all' || entry.status === status) &&
      (!search ||
        [
          entry.definition.name,
          entry.definition.chinese,
          entry.definition.surnameEn,
          entry.definition.surnameZh,
        ]
          .join(' ')
          .normalize('NFKD')
          .replace(/\p{M}/gu, '')
          .toLowerCase()
          .includes(search)),
  );
}
export function officerLocation(
  state: V03GameState,
  officer: V03Officer | undefined,
  locale: 'zh' | 'en',
): string {
  if (!officer) return '—';
  const name = (id: string) => {
    const city = state.cities.find((entry) => entry.id === id);
    return city ? (locale === 'zh' ? city.chinese : city.name) : '—';
  };
  if (officer.location.kind === 'city') return name(officer.location.cityId);
  if (
    officer.location.kind === 'captured' &&
    officer.location.cityId &&
    !officer.location.journeyId
  )
    return name(officer.location.cityId);
  if (officer.location.kind === 'journey' || officer.location.kind === 'captured') {
    const journeyId = officer.location.journeyId;
    const journey = state.journeys.find((entry) => entry.id === journeyId);
    return (
      (locale === 'zh' ? '在途' : 'Travelling') +
      (journey ? ': ' + name(journey.sourceCityId) + ' → ' + name(journey.destinationCityId) : '')
    );
  }
  return locale === 'zh' ? '战斗中' : 'In battle';
}
export const officerCopy = {
  zh: {
    directory: '人物名册',
    show: '显示',
    away: '在外',
    troops: '兵',
    scopes: {
      all: '全部人物',
      mine: '我方武将',
      'mine-troops': '我方带兵驻将',
      'mine-empty': '我方无兵驻将',
    },
    search: '查找姓名或复姓',
    all: '全部状态',
    profile: '人物资料',
    back: '返回名册',
    close: '关闭人物名册',
    previous: '上一页',
    next: '下一页',
    noMatches: '没有符合条件的人物。',
    serving: '驻城在职',
    free: '本城在野',
    faction: '所属势力',
    location: '当前位置',
    age: '年龄（虚岁）',
    birth: '生年',
    death: '年表参考卒年',
    debut: '登场年份',
    debutCity: '计划登场地',
    unknown: '不详',
    unborn: '尚未出生',
    surname: '姓氏',
    force: '武力',
    intellect: '智力',
    type: '基础兵种',
    adult: '成年基准',
    current: '当前能力',
    visit: '查看所在城池',
    reference: '年表依据',
    game: '游戏参考',
    inferred: '推算',
    disputed: '有争议',
    design: '玩法近似',
    history: '史料',
    dateNote: '史料缺失时采用已标注的游戏参考；参考卒年只用于开局判断，不决定本局命运。',
    pendingNote: '尚未登场，仅供查阅；到登场年份后在当地以在野、零兵身份出现。',
    deadNote: '此人在本局已故，不能搜索、任官或领兵。',
    freeNote: '尚未加入势力，需由当地城务搜索招募；占城不会自动获得此人。',
    readOnly: '人物名册用于查阅；任官、编兵与出征仍从所属城池按正常权限办理。',
    naval: '楼船展示资格',
    yes: '有',
    no: '无',
    holder: '俘虏持有方',
    opening: '开局安排',
    unmodeledHouse: '原势力未独立建模',
    openingNote: '六势力剧本将其作为地方人才安排；当前所属与位置以本局记录为准。',
    formationHealthy: '当前编队健康兵',
    formationWounded: '当前编队伤兵',
    formationNote: '合编时显示当前编队合计；各武将所部在战后按原有人数比例分配。',
    years: '岁',
    records: '人物',
  },
  en: {
    directory: 'Officer directory',
    show: 'Show',
    away: 'Away',
    troops: 'troops',
    scopes: {
      all: 'All officers',
      mine: 'Your officers',
      'mine-troops': 'Yours with troops in a city',
      'mine-empty': 'Yours without troops',
    },
    search: 'Search names or surnames',
    all: 'All statuses',
    profile: 'Officer profile',
    back: 'Back to directory',
    close: 'Close officer directory',
    previous: 'Previous',
    next: 'Next',
    noMatches: 'No matching officers.',
    serving: 'Serving in this city',
    free: 'Local free officers',
    faction: 'Faction',
    location: 'Current location',
    age: 'Age (nominal)',
    birth: 'Born',
    death: 'Reference death year',
    debut: 'Appearance year',
    debutCity: 'Planned appearance city',
    unknown: 'Unknown',
    unborn: 'Not born yet',
    surname: 'Surname',
    force: 'Force',
    intellect: 'Intellect',
    type: 'Base troop type',
    adult: 'Adult baseline',
    current: 'Current abilities',
    visit: 'View current city',
    reference: 'Timeline sources',
    game: 'Game reference',
    inferred: 'Inferred',
    disputed: 'Disputed',
    design: 'Gameplay approximation',
    history: 'Historical source',
    dateNote:
      'Marked game references fill missing historical dates. Reference deaths affect openings only, never a running campaign.',
    pendingNote:
      'Not yet available. Appears locally as a free officer with no soldiers in the scheduled year.',
    deadNote: 'Deceased in this campaign; unavailable for searches, appointments or command.',
    freeNote:
      'Not serving a faction. Recruit through local city searches; taking the city does not recruit this officer.',
    readOnly:
      'This directory is for inspection. Appointments, armies and marches retain normal city permissions.',
    naval: 'Tower-warship eligibility',
    yes: 'Yes',
    no: 'No',
    holder: 'Captor',
    opening: 'Opening arrangement',
    unmodeledHouse: 'Original house is not modeled separately',
    openingNote:
      'This six-house scenario starts the officer as local talent. Current faction and location follow this campaign.',
    formationHealthy: 'Current formation healthy soldiers',
    formationWounded: 'Current formation wounded',
    formationNote:
      'Merged units show the current formation total. Each officer’s contingent is allocated proportionally after battle.',
    years: 'years',
    records: 'officers',
  },
};
