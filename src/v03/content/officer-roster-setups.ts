import { OFFICER_CATALOG, type OfficerDefinition } from './officer-catalog';
import { LEGACY_OPENING_ARMIES, OFFICER_OPENING_PLACEMENTS } from './officer-opening-placements';
import {
  officerAgeAtYear,
  officerBaseStatsAtYear,
  officerOpeningLifeStatus,
} from './officer-timeline';
import { SCENARIOS } from './scenario';
import type { TroopType } from './types';

export const OFFICER_ROSTER_VERSION = 1;
export type OfficerOpeningStatus = 'serving' | 'free' | 'deceased' | 'pending';
export type OfficerRosterScenarioId = 'divided-realm-190' | 'guandu-200';

export interface OfficerOpening {
  id: string;
  status: OfficerOpeningStatus;
  factionId: string | null;
  cityId: string;
  age: number | null;
  force: number;
  intellect: number;
  loyalty: number;
  troopType: TroopType;
  troops: number;
  wounded: 0;
  experience: 0;
  troopExperience: 0;
  reorganizationDays: 0;
  role: 'ruler' | 'governor' | 'officer' | 'none';
  /** A map/affiliation abstraction, not a claim that an independent leader was historically free. */
  placementNote: string;
  unmodeledHouse: { zh: string; en: string } | null;
}

export interface OfficerRosterSetup {
  scenarioId: OfficerRosterScenarioId;
  year: number;
  factions: readonly { id: string; leaderOfficerId: string; capitalCityId: string }[];
  officers: OfficerOpening[];
  cities: {
    id: string;
    factionId: string | null;
    governorId: string | null;
    healthyTroops: number;
    workPoints: number;
    reserveAdditions: Record<TroopType, number>;
  }[];
  reserveReturns: { officerId: string; cityId: string; troopType: TroopType; troops: number }[];
  reserveAssignments: { officerId: string; cityId: string; troopType: TroopType; troops: number }[];
}

/** Explicit offices, never inferred from array position or the first matching name. */
const FACTION_OPENINGS = {
  'divided-realm-190': [
    ['cao', 'caocao', 'chenliu'],
    ['liu', 'liubei', 'pingyuan'],
    ['sun', 'sunjian', 'jianye'],
    ['yuan', 'yuanshao', 'ye'],
    ['dong', 'dongzhuo', 'changan'],
    ['yan', 'liuyan', 'chengdu'],
  ],
  'guandu-200': [
    ['cao', 'caocao', 'xuchang'],
    ['yuan', 'yuanshao', 'ye'],
    ['liu', 'liubei', 'wancheng'],
    ['sun', 'sunce', 'jianye'],
    ['yan', 'liuzhang', 'chengdu'],
    ['ma', 'maliang', 'tianshui'],
  ],
} as const;

const GOVERNORS: Record<OfficerRosterScenarioId, Readonly<Record<string, string>>> = {
  'divided-realm-190': {
    tianshui: 'lijue',
    luoyang: 'lubu',
    jinyang: 'wenchou',
    puyang: 'xiahouyuan',
    xuchang: 'caoren',
    shouchun: 'chengpu',
    wu: 'handang',
    chaisang: 'huanggai',
    wancheng: 'guosi',
    hanzhong: 'wuyi',
    zitong: 'zhangren',
    jiangzhou: 'yanyan',
    beihai: 'yanliang',
  },
  'guandu-200': {
    chenliu: 'caoren',
    puyang: 'xiahoudun',
    xiapi: 'yujin',
    luoyang: 'zhangliao',
    jinyang: 'wenchou',
    beihai: 'zhanghe',
    wu: 'chengpu',
    chaisang: 'huanggai',
    shouchun: 'lvmeng',
    changan: 'machao',
    zitong: 'zhangren',
    jiangzhou: 'yanyan',
    hanzhong: 'wuyi',
  },
};

const UNMODELED_HOUSES: Readonly<Record<string, { zh: string; en: string }>> = {
  gongsunzan: { zh: '公孙瓒', en: 'Gongsun Zan' },
  taoqian: { zh: '陶谦', en: 'Tao Qian' },
  liubiao: { zh: '刘表', en: 'Liu Biao' },
  yuanshu: { zh: '袁术', en: 'Yuan Shu' },
  hansui: { zh: '韩遂', en: 'Han Sui' },
  zhanglu: { zh: '张鲁', en: 'Zhang Lu' },
  maliang: { zh: '马腾', en: 'Ma Teng' },
  pangde: { zh: '马腾', en: 'Ma Teng' },
  zhanghe: { zh: '韩馥', en: 'Han Fu' },
  tianfeng: { zh: '汉廷旧职', en: 'Han court service' },
  jushou: { zh: '韩馥', en: 'Han Fu' },
  guotu: { zh: '韩馥', en: 'Han Fu' },
  yujin: { zh: '鲍信', en: 'Bao Xin' },
  huangzhong: { zh: '刘表', en: 'Liu Biao' },
  ganning: { zh: '刘表／黄祖', en: 'Liu Biao / Huang Zu' },
};

const PLACEMENT_NOTES: Readonly<Record<string, string>> = {
  xunyu: '190年尚未归曹，颍川映射许昌；191年投曹不会在局内强制重演。',
  chengyu: '190年在东阿地区，映射濮阳；192年归曹尚未发生。',
  lusu: '200年孙策尚在，孙权继位后延见鲁肃尚未发生；东城映射寿春。',
  zhaoyun: '200年依袁绍的刘备与赵云重逢尚未发生；北方落点映射北平。',
  simayi: '河内温县映射洛阳，已可搜索但尚未入曹操幕府。',
  liuzhang:
    '190年奉车都尉等朝职不直接等于董卓臣属；作为刘焉家族班底在成都，是保留六势力地图的明确抽象。',
  kongrong: '190年北海独立领袖未建模；200年已入许都任汉官，未作为曹操幕僚。',
  liubiao: '190年赴荆州在年内，年初放洛阳汉官位置；200年襄阳原势力未独立建模。',
  zhoutai: '九江下蔡映射寿春；200年已属孙氏，驻吴为现有版图的驻防抽象。',
  gaoshun: '早年从属时点缺失，参考三国志11的董卓／吕布班底；190年驻洛阳，200年开局已故。',
  xuyou: '190年随袁绍入冀州发生于年内，开局按邺地人才；200年归袁，不能预先转曹。',
  zhuran: '200年初仍为地方人才；孙权统事后任县长不提前至开局。',
  zhugejin: '200年初尚未由弘咨推荐入孙权幕府，保留为建业在野。',
  xusheng: '客居吴，孙权统事后任官不提前至200年初。',
  yanliang:
    '190年由邺改驻北海补地方班底；旧所部归邺预备兵，改用北海张郃原有的700骑兵，不额外生兵。200年仍驻邺。',
};

function unmodeledHouse(id: string, year: number) {
  // Former court service is not a separate house; neither is a later patron at an earlier opening.
  if (id === 'tianfeng' || (year === 190 && (id === 'ganning' || id === 'liubiao'))) return null;
  return UNMODELED_HOUSES[id] ?? null;
}

function placementNote(
  officer: OfficerDefinition,
  year: number,
  status: OfficerOpeningStatus,
): string {
  if (status === 'pending')
    return `未到${officer.timeline.debutYear}年，只进入日程，不创建现役对象；届时在野零兵。`;
  if (status === 'deceased')
    return `${officer.timeline.deathYear}年卒，早于开局；${officer.timeline.deathKind === 'game-reference' ? '采用三国志11参考卒年。' : '不再创建可用人物。'}`;
  const house = unmodeledHouse(officer.id, year);
  if (status === 'free' && house) {
    return `原势力／关系：${house.zh}，未独立建模；游戏中作为地方人才供搜索。${PLACEMENT_NOTES[officer.id] ?? ''}`;
  }
  if (PLACEMENT_NOTES[officer.id] && (year === 190 || status === 'free'))
    return PLACEMENT_NOTES[officer.id]!;
  return status === 'serving'
    ? '开局已效力本势力；驻防城市按现有24城版图映射，不代表史实当日驻地。'
    : '地方在野人才，需按现有城务权限搜索；占城不自动加入。';
}

/**
 * Reviewed configuration consumed by new-campaign initialization and lifecycle validation.
 * This pure builder never mutates the archived SCENARIOS or creates runtime officers.
 */
export function createOfficerRosterSetup(scenarioId: OfficerRosterScenarioId): OfficerRosterSetup {
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error('Unknown roster scenario: ' + scenarioId);
  const year = scenario.year;
  const index = year === 190 ? 0 : 2;
  const factions = FACTION_OPENINGS[scenarioId].map(([id, leaderOfficerId, capitalCityId]) => ({
    id,
    leaderOfficerId,
    capitalCityId,
  }));
  const officers: OfficerOpening[] = OFFICER_CATALOG.map((officer) => {
    const placement = OFFICER_OPENING_PLACEMENTS[officer.id];
    if (!placement) throw new Error('Missing opening placement: ' + officer.id);
    const employer = placement[index];
    const life = officerOpeningLifeStatus(officer.timeline, year);
    const status: OfficerOpeningStatus =
      life === 'available' ? (employer === null ? 'free' : 'serving') : life;
    const factionId = status === 'serving' ? employer : null;
    const cityId = life === 'pending' ? officer.timeline.debutCityId : placement[index + 1]!;
    const ageYear = life === 'deceased' ? officer.timeline.deathYear! : year;
    const stats = officerBaseStatsAtYear(
      { force: officer.adultForce, intellect: officer.adultIntellect },
      officer.timeline.birthYear,
      ageYear,
    );
    const ruler = factions.some((faction) => faction.leaderOfficerId === officer.id);
    const governor = Object.values(GOVERNORS[scenarioId]).includes(officer.id);
    return {
      id: officer.id,
      status,
      factionId,
      cityId,
      age: officerAgeAtYear(officer.timeline.birthYear, ageYear),
      ...stats,
      loyalty:
        year === 190 && officer.id === 'lubu'
          ? 58
          : year === 190 && factionId === 'dong' && !officer.isNew
            ? 70
            : 88,
      troopType: officer.troopType,
      troops: 0,
      wounded: 0,
      experience: 0,
      troopExperience: 0,
      reorganizationDays: 0,
      role: status !== 'serving' ? 'none' : ruler ? 'ruler' : governor ? 'governor' : 'officer',
      placementNote: placementNote(officer, year, status),
      unmodeledHouse: status === 'free' ? unmodeledHouse(officer.id, year) : null,
    };
  });
  const byId = new Map(officers.map((officer) => [officer.id, officer]));
  const reserveReturns: OfficerRosterSetup['reserveReturns'] = [];
  for (const [officerId, cityId, troopType, troops] of LEGACY_OPENING_ARMIES[scenarioId] ?? []) {
    const officer = byId.get(officerId);
    const owner = scenario.cities.find((city) => city.id === cityId)?.factionId;
    if (officer?.status === 'serving' && officer.cityId === cityId && officer.factionId === owner)
      officer.troops += troops;
    else reserveReturns.push({ officerId, cityId, troopType, troops });
  }
  const cities = scenario.cities.map((city) => {
    const serving = officers.filter(
      (officer) =>
        officer.status === 'serving' &&
        officer.cityId === city.id &&
        officer.factionId === city.factionId,
    );
    const reserveAdditions: Record<TroopType, number> = { infantry: 0, cavalry: 0, archer: 0 };
    for (const entry of reserveReturns)
      if (entry.cityId === city.id) reserveAdditions[entry.troopType] += entry.troops;
    return {
      id: city.id,
      factionId: city.factionId,
      governorId: GOVERNORS[scenarioId][city.id] ?? null,
      healthyTroops: serving.reduce((sum, officer) => sum + officer.troops, 0),
      workPoints: city.factionId === null ? 0 : 2,
      reserveAdditions,
    };
  });
  const reserveAssignments: OfficerRosterSetup['reserveAssignments'] = [];
  if (scenarioId === 'divided-realm-190') {
    const city = cities.find((candidate) => candidate.id === 'beihai')!;
    const officer = byId.get('yanliang')!;
    const troops = 700;
    if (
      officer.status !== 'serving' ||
      officer.cityId !== city.id ||
      city.reserveAdditions.cavalry < troops
    )
      throw new Error('Invalid explicit Beihai cavalry redistribution.');
    city.reserveAdditions.cavalry -= troops;
    city.healthyTroops += troops;
    officer.troops += troops;
    reserveAssignments.push({
      officerId: officer.id,
      cityId: city.id,
      troopType: 'cavalry',
      troops,
    });
  }
  return { scenarioId, year, factions, officers, cities, reserveReturns, reserveAssignments };
}

/** Births/deaths after the opening are deliberately irrelevant to this static appearance list. */
export function scheduledOfficerDebuts(scenarioId: OfficerRosterScenarioId) {
  const setup = createOfficerRosterSetup(scenarioId);
  const pendingIds = new Set(
    setup.officers.filter((officer) => officer.status === 'pending').map((officer) => officer.id),
  );
  return OFFICER_CATALOG.filter((officer) => pendingIds.has(officer.id))
    .map((officer) => ({
      id: officer.id,
      year: officer.timeline.debutYear,
      cityId: officer.timeline.debutCityId,
    }))
    .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
}
