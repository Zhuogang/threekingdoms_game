import type { BattlefieldProfile, City, Faction, Officer, TroopType } from '../game/types';
import { buildGuandu } from './guandu';

const DIVIDED_REALM_META = {
  id: 'divided-realm-190',
  title: 'A divided realm',
  year: 190,
  description:
    'The Han court falters. Six ambitious houses raise their banners. From the northern plains to the rivers of the south, a new dynasty awaits its founder.',
};
const DIVIDED_FACTIONS: Faction[] = [
  {
    id: 'cao',
    name: 'Cao Cao',
    chinese: '曹',
    leader: 'Cao Cao',
    color: '#53778d',
    motto: 'Order from chaos',
    description:
      'A resourceful strategist in the central plains. Strong commerce and balanced officers make an excellent first campaign.',
    difficulty: 'Balanced',
  },
  {
    id: 'liu',
    name: 'Liu Bei',
    chinese: '刘',
    leader: 'Liu Bei',
    color: '#577b5d',
    motto: 'Virtue above ambition',
    description:
      'A modest foothold, an extraordinary brotherhood. Guan Yu and Zhang Fei are your greatest strength.',
    difficulty: 'Challenging',
  },
  {
    id: 'sun',
    name: 'Sun Jian',
    chinese: '孙',
    leader: 'Sun Jian',
    color: '#b06443',
    motto: 'Master of the rivers',
    description:
      'Command the rich southern waterways. A spacious homeland and skilled naval officers reward patient expansion.',
    difficulty: 'Approachable',
  },
  {
    id: 'yuan',
    name: 'Yuan Shao',
    chinese: '袁',
    leader: 'Yuan Shao',
    color: '#93824b',
    motto: 'The weight of legacy',
    description:
      'An established northern power with ample troops and celebrated generals. Unite your forces and march south.',
    difficulty: 'Balanced',
  },
  {
    id: 'dong',
    name: 'Dong Zhuo',
    chinese: '董',
    leader: 'Dong Zhuo',
    color: '#965e69',
    motto: 'The throne is power',
    description:
      'Hold the imperial heartland and unleash Lü Bu. Rich cities and formidable cavalry come with fragile loyalties.',
    difficulty: 'Balanced',
  },
  {
    id: 'yan',
    name: 'Liu Yan',
    chinese: '蜀',
    leader: 'Liu Yan',
    color: '#827399',
    motto: 'Beyond the mountain gates',
    description:
      'Sheltered by the western mountains, cultivate a prosperous realm before emerging into the central plains.',
    difficulty: 'Approachable',
  },
];
export const TROOP_LABELS: Record<TroopType, string> = {
  infantry: 'Infantry',
  cavalry: 'Cavalry',
  archer: 'Archers',
  naval: 'Marines',
  elite: 'Vanguard',
  guard: 'Guard',
};
type CitySeed = [string, string, string, string, number, number, string | null, string[]];
const citySeeds: CitySeed[] = [
  ['tianshui', 'Tianshui', '天水', 'WESTERN GATES', 105, 230, 'dong', ['changan', 'hanzhong']],
  [
    'changan',
    'Chang’an',
    '长安',
    'GUANZHONG',
    250,
    290,
    'dong',
    ['tianshui', 'luoyang', 'hanzhong'],
  ],
  [
    'luoyang',
    'Luoyang',
    '洛阳',
    'IMPERIAL HEARTLAND',
    430,
    300,
    'dong',
    ['changan', 'jinyang', 'chenliu', 'wancheng', 'ye'],
  ],
  ['jinyang', 'Jinyang', '晋阳', 'NORTHERN FRONTIER', 435, 135, 'yuan', ['luoyang', 'ye']],
  [
    'ye',
    'Ye',
    '邺',
    'HEBEI',
    610,
    165,
    'yuan',
    ['jinyang', 'luoyang', 'pingyuan', 'puyang', 'beiping'],
  ],
  ['beiping', 'Beiping', '北平', 'NORTHERN FRONTIER', 790, 85, null, ['ye', 'pingyuan']],
  ['pingyuan', 'Pingyuan', '平原', 'HEBEI', 735, 225, 'liu', ['ye', 'beiping', 'beihai', 'puyang']],
  ['beihai', 'Beihai', '北海', 'QINGZHOU', 890, 285, 'yuan', ['pingyuan', 'xiapi']],
  [
    'puyang',
    'Puyang',
    '濮阳',
    'CENTRAL PLAINS',
    655,
    315,
    'cao',
    ['ye', 'pingyuan', 'chenliu', 'xiapi'],
  ],
  [
    'chenliu',
    'Chenliu',
    '陈留',
    'CENTRAL PLAINS',
    570,
    370,
    'cao',
    ['puyang', 'luoyang', 'xuchang', 'shouchun'],
  ],
  [
    'xuchang',
    'Xuchang',
    '许昌',
    'YINGCHUAN',
    560,
    455,
    'cao',
    ['chenliu', 'wancheng', 'shouchun', 'jiangxia'],
  ],
  ['xiapi', 'Xiapi', '下邳', 'XUZHOU', 860, 390, null, ['beihai', 'puyang', 'shouchun', 'jianye']],
  [
    'shouchun',
    'Shouchun',
    '寿春',
    'HUAINAN',
    750,
    470,
    'sun',
    ['chenliu', 'xuchang', 'xiapi', 'jianye', 'jiangxia'],
  ],
  [
    'jianye',
    'Jianye',
    '建业',
    'JIANGDONG',
    860,
    560,
    'sun',
    ['xiapi', 'shouchun', 'wu', 'chaisang'],
  ],
  ['wu', 'Wu', '吴', 'JIANGDONG', 930, 635, 'sun', ['jianye', 'chaisang']],
  [
    'chaisang',
    'Chaisang',
    '柴桑',
    'YANGTZE VALLEY',
    725,
    640,
    'sun',
    ['wu', 'jianye', 'jiangxia', 'jiangling'],
  ],
  [
    'jiangxia',
    'Jiangxia',
    '江夏',
    'JINGZHOU',
    610,
    565,
    null,
    ['xuchang', 'shouchun', 'chaisang', 'xiangyang', 'jiangling'],
  ],
  [
    'xiangyang',
    'Xiangyang',
    '襄阳',
    'JINGZHOU',
    460,
    520,
    null,
    ['wancheng', 'jiangxia', 'jiangling', 'hanzhong'],
  ],
  [
    'wancheng',
    'Wancheng',
    '宛城',
    'NANYANG',
    405,
    425,
    'dong',
    ['luoyang', 'xuchang', 'xiangyang'],
  ],
  [
    'hanzhong',
    'Hanzhong',
    '汉中',
    'QINLING MOUNTAINS',
    240,
    420,
    'yan',
    ['tianshui', 'changan', 'xiangyang', 'zitong'],
  ],
  ['zitong', 'Zitong', '梓潼', 'SHU', 140, 495, 'yan', ['hanzhong', 'chengdu', 'jiangzhou']],
  ['chengdu', 'Chengdu', '成都', 'SHU', 115, 600, 'yan', ['zitong', 'jiangzhou']],
  ['jiangzhou', 'Jiangzhou', '江州', 'BA', 290, 635, 'yan', ['chengdu', 'zitong', 'jiangling']],
  [
    'jiangling',
    'Jiangling',
    '江陵',
    'JINGZHOU',
    455,
    650,
    null,
    ['xiangyang', 'jiangxia', 'chaisang', 'jiangzhou'],
  ],
];
const DIVIDED_CITIES: City[] = citySeeds.map(
  ([id, name, chinese, region, x, y, factionId, neighbors], index) => ({
    id,
    name,
    chinese,
    region,
    x,
    y,
    factionId,
    neighbors,
    population: 65000 + (index % 6) * 13500,
    farming: 240 + (index % 5) * 35,
    commerce: 220 + (index % 4) * 45,
    defense: factionId ? 30 + (index % 3) * 5 : 15,
    loyalty: factionId === 'dong' ? 55 : 72,
    gold: factionId ? 1600 : 650,
    food: factionId ? 14000 : 6000,
    reserve: factionId ? 1200 : 600,
    governorId: null,
    plunderCooldownUntil: 0,
  }),
);
/** Terrain profile used to generate each city's battlefield (content, not save state). */
const BATTLEFIELD_BY_CITY: Record<string, BattlefieldProfile> = {
  jiangxia: 'river',
  chaisang: 'river',
  jianye: 'river',
  wu: 'river',
  shouchun: 'river',
  jiangling: 'river',
  hanzhong: 'mountain',
  zitong: 'mountain',
  tianshui: 'mountain',
  jiangzhou: 'mountain',
  chengdu: 'forest',
  xiangyang: 'forest',
  wancheng: 'forest',
};
export function battlefieldProfile(cityId: string): BattlefieldProfile {
  return BATTLEFIELD_BY_CITY[cityId] ?? 'plains';
}
type OfficerSeed = [
  string,
  string,
  string,
  string | null,
  string,
  number,
  number,
  TroopType,
  number?,
];
const officerSeeds: OfficerSeed[] = [
  ['caocao', 'Cao Cao', '曹操', 'cao', 'chenliu', 82, 94, 'cavalry', 35],
  ['xiahoudun', 'Xiahou Dun', '夏侯惇', 'cao', 'chenliu', 91, 63, 'cavalry', 34],
  ['xunyu', 'Xun Yu', '荀彧', 'cao', 'xuchang', 38, 98, 'archer', 27],
  ['caoren', 'Cao Ren', '曹仁', 'cao', 'xuchang', 86, 71, 'guard', 22],
  ['xiahouyuan', 'Xiahou Yuan', '夏侯渊', 'cao', 'puyang', 89, 66, 'cavalry', 27],
  ['chengyu', 'Cheng Yu', '程昱', 'cao', 'puyang', 56, 90, 'archer', 49],
  ['yujin', 'Yu Jin', '于禁', 'cao', 'chenliu', 80, 75, 'infantry', 29],
  ['liubei', 'Liu Bei', '刘备', 'liu', 'pingyuan', 77, 82, 'infantry', 29],
  ['guanyu', 'Guan Yu', '关羽', 'liu', 'pingyuan', 98, 79, 'elite', 30],
  ['zhangfei', 'Zhang Fei', '张飞', 'liu', 'pingyuan', 99, 42, 'elite', 23],
  ['jianyong', 'Jian Yong', '简雍', 'liu', 'pingyuan', 35, 81, 'archer', 29],
  ['sunjian', 'Sun Jian', '孙坚', 'sun', 'jianye', 90, 78, 'naval', 35],
  ['sunce', 'Sun Ce', '孙策', 'sun', 'jianye', 95, 76, 'cavalry', 16],
  ['huanggai', 'Huang Gai', '黄盖', 'sun', 'chaisang', 86, 73, 'naval', 44],
  ['chengpu', 'Cheng Pu', '程普', 'sun', 'shouchun', 84, 80, 'guard', 36],
  ['handang', 'Han Dang', '韩当', 'sun', 'wu', 82, 68, 'naval', 34],
  ['zuzhao', 'Zu Mao', '祖茂', 'sun', 'shouchun', 79, 55, 'infantry', 32],
  ['yuanshao', 'Yuan Shao', '袁绍', 'yuan', 'ye', 70, 81, 'guard', 36],
  ['yanliang', 'Yan Liang', '颜良', 'yuan', 'ye', 94, 47, 'cavalry', 29],
  ['wenchou', 'Wen Chou', '文丑', 'yuan', 'jinyang', 93, 48, 'cavalry', 28],
  ['zhanghe', 'Zhang He', '张郃', 'yuan', 'beihai', 90, 82, 'elite', 23],
  ['tianfeng', 'Tian Feng', '田丰', 'yuan', 'ye', 35, 95, 'archer', 46],
  ['jushou', 'Ju Shou', '沮授', 'yuan', 'jinyang', 46, 92, 'archer', 32],
  ['guotu', 'Guo Tu', '郭图', 'yuan', 'beihai', 44, 80, 'infantry', 31],
  ['dongzhuo', 'Dong Zhuo', '董卓', 'dong', 'changan', 85, 69, 'guard', 50],
  ['lubu', 'Lü Bu', '吕布', 'dong', 'luoyang', 100, 32, 'cavalry', 30],
  ['jiaxu', 'Jia Xu', '贾诩', 'dong', 'changan', 34, 98, 'archer', 43],
  ['liru', 'Li Ru', '李儒', 'dong', 'luoyang', 30, 93, 'archer', 38],
  ['lijue', 'Li Jue', '李傕', 'dong', 'tianshui', 78, 49, 'cavalry', 34],
  ['guosi', 'Guo Si', '郭汜', 'dong', 'wancheng', 77, 37, 'infantry', 35],
  ['huaxiong', 'Hua Xiong', '华雄', 'dong', 'wancheng', 90, 45, 'elite', 31],
  ['zhangliao', 'Zhang Liao', '张辽', 'dong', 'tianshui', 94, 85, 'cavalry', 21],
  ['liuyan', 'Liu Yan', '刘焉', 'yan', 'chengdu', 47, 81, 'guard', 55],
  ['liuzhang', 'Liu Zhang', '刘璋', 'yan', 'chengdu', 35, 58, 'infantry', 24],
  ['zhangren', 'Zhang Ren', '张任', 'yan', 'zitong', 88, 78, 'archer', 30],
  ['yanyan', 'Yan Yan', '严颜', 'yan', 'jiangzhou', 86, 72, 'guard', 45],
  ['wuyi', 'Wu Yi', '吴懿', 'yan', 'hanzhong', 80, 73, 'infantry', 29],
  ['huangquan', 'Huang Quan', '黄权', 'yan', 'hanzhong', 63, 86, 'archer', 21],
  ['zhaoyun', 'Zhao Yun', '赵云', null, 'beiping', 97, 88, 'cavalry', 22],
  ['taishici', 'Taishi Ci', '太史慈', null, 'beihai', 94, 68, 'archer', 24],
  ['dianwei', 'Dian Wei', '典韦', null, 'chenliu', 97, 40, 'guard', 25],
  ['xuchu', 'Xu Chu', '许褚', null, 'xuchang', 96, 35, 'elite', 22],
  ['xuhuang', 'Xu Huang', '徐晃', null, 'luoyang', 91, 76, 'infantry', 23],
  ['ganning', 'Gan Ning', '甘宁', null, 'jiangxia', 94, 74, 'naval', 22],
  ['huangzhong', 'Huang Zhong', '黄忠', null, 'xiangyang', 95, 70, 'archer', 42],
  ['weiyan', 'Wei Yan', '魏延', null, 'jiangling', 92, 64, 'infantry', 20],
  ['zhouyu', 'Zhou Yu', '周瑜', null, 'jianye', 74, 98, 'naval', 16],
  ['lusu', 'Lu Su', '鲁肃', null, 'chaisang', 53, 94, 'naval', 18],
  ['fazheng', 'Fa Zheng', '法正', null, 'chengdu', 36, 93, 'archer', 16],
  ['zhangsong', 'Zhang Song', '张松', null, 'zitong', 28, 89, 'archer', 22],
  ['chenqun', 'Chen Qun', '陈群', null, 'xiapi', 30, 91, 'archer', 20],
  ['maliang', 'Ma Teng', '马腾', null, 'tianshui', 87, 66, 'cavalry', 34],
];
const DIVIDED_OFFICERS: Officer[] = officerSeeds.map(
  ([id, name, chinese, factionId, cityId, force, intellect, troopType, age = 30], index) => ({
    id,
    name,
    chinese,
    factionId,
    cityId,
    force,
    intellect,
    troopType,
    age,
    loyalty: id === 'lubu' ? 58 : factionId === 'dong' ? 70 : 88,
    stamina: 100,
    troops: factionId ? 700 + (index % 4) * 100 : 0,
    busy: false,
    captive: false,
    experience: 0,
    level: 0,
    equipment: null,
    fate: 'active' as const,
  }),
);
/** Each city starts under the most senior serving officer of its owner. */
export function assignGovernors(cities: City[], officers: Officer[]): void {
  for (const city of cities)
    city.governorId =
      officers.find(
        (o) =>
          o.cityId === city.id &&
          o.factionId === city.factionId &&
          o.factionId !== null &&
          o.fate === 'active',
      )?.id ?? null;
}
assignGovernors(DIVIDED_CITIES, DIVIDED_OFFICERS);

/** Everything the simulation needs to know about a starting situation. */
export interface ScenarioDefinition {
  id: string;
  title: string;
  year: number;
  description: string;
  factions: Faction[];
  cities: City[];
  officers: Officer[];
}
export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    ...DIVIDED_REALM_META,
    factions: DIVIDED_FACTIONS,
    cities: DIVIDED_CITIES,
    officers: DIVIDED_OFFICERS,
  },
  buildGuandu({ cities: DIVIDED_CITIES, officers: DIVIDED_OFFICERS, factions: DIVIDED_FACTIONS }),
];
export const DEFAULT_SCENARIO_ID = DIVIDED_REALM_META.id;
export const scenarioById = (id: string): ScenarioDefinition | undefined =>
  SCENARIOS.find((scenario) => scenario.id === id);

/**
 * The scenario the engine and interface are currently looking at. These live bindings
 * switch when a game is created or loaded (ctivateScenario), so every module that
 * reads FACTIONS / INITIAL_* sees the roster that matches the state in front of it.
 */
export let SCENARIO: Pick<ScenarioDefinition, 'id' | 'title' | 'year' | 'description'> =
  DIVIDED_REALM_META;
export let FACTIONS: Faction[] = DIVIDED_FACTIONS;
export let INITIAL_CITIES: City[] = DIVIDED_CITIES;
export let INITIAL_OFFICERS: Officer[] = DIVIDED_OFFICERS;
export function activateScenario(id: string): ScenarioDefinition {
  const scenario = scenarioById(id) ?? SCENARIOS[0]!;
  if (SCENARIO.id !== scenario.id) {
    SCENARIO = scenario;
    FACTIONS = scenario.factions;
    INITIAL_CITIES = scenario.cities;
    INITIAL_OFFICERS = scenario.officers;
  }
  return scenario;
}
export function factionById(id: string | null | undefined): Faction | undefined {
  return FACTIONS.find((f) => f.id === id);
}
