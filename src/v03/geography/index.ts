import { estimateTravel, type TravelComposition } from '../calendar';

/**
 * Versioned geography contract for the independent v0.3 ruleset.
 *
 * The route kilometres below are research estimates, not surveyed Han roads. City
 * anchors, evidence grades, and the estimate method stay alongside the game data so
 * the map can be redrawn without changing travel time or erasing uncertainty.
 */
export type GeographyConfidence = 'A' | 'B' | 'C';
export type RoadTerrain = 'plain' | 'hill' | 'mountain';
export type RouteClass = 'P' | 'H' | 'M' | 'R' | 'B';
export type CityId =
  | 'tianshui'
  | 'changan'
  | 'luoyang'
  | 'jinyang'
  | 'ye'
  | 'beiping'
  | 'pingyuan'
  | 'beihai'
  | 'puyang'
  | 'chenliu'
  | 'xuchang'
  | 'xiapi'
  | 'shouchun'
  | 'jianye'
  | 'wu'
  | 'chaisang'
  | 'jiangxia'
  | 'xiangyang'
  | 'wancheng'
  | 'hanzhong'
  | 'zitong'
  | 'chengdu'
  | 'jiangzhou'
  | 'jiangling';

export interface CityGeography {
  id: CityId;
  nameEn: string;
  nameZh: string;
  historicalSeatName: string;
  validYears: readonly [number, number];
  latitude: number;
  longitude: number;
  confidence: GeographyConfidence;
  researchNotes: string;
  sourceRefs: readonly string[];
  /** The non-geographic point used to keep overlapping map labels legible. */
  labelOffset?: readonly [number, number];
}

export interface RouteSegment {
  terrain: RoadTerrain;
  lengthKm: number;
  /** Notes distinguish a measured local passage from a terrain-class estimate. */
  researchNote: string;
  /** No route currently has a verified, directional ferry delay. */
  fixedDelayDays: number;
}

export interface RouteDefinition {
  id: string;
  fromCityId: CityId;
  toCityId: CityId;
  straightLineKm: number;
  roadKmLow: number;
  roadKmNominal: number;
  roadKmHigh: number;
  routeClass: RouteClass;
  baselineDaysLow: number;
  baselineDaysNominal: number;
  baselineDaysHigh: number;
  segments: readonly RouteSegment[];
  confidence: 'estimated';
  estimateMethod: string;
  researchNotes: string;
  sourceRefs: readonly string[];
}

const TGAZ = 'https://tgaz.fudan.edu.cn/tgaz/placename/';
const RESEARCH_DOC = 'docs/v0.3/01-geography-and-routes.md';
const CHGIS = 'https://chgis.fas.harvard.edu/pages/intro/';

/** Han-era seat anchors. C-grade locations are explicitly regional approximations. */
export const CITY_GEOGRAPHY: readonly CityGeography[] = [
  {
    id: 'tianshui',
    nameEn: 'Tianshui',
    nameZh: '天水',
    historicalSeatName: '冀县，今甘谷区域',
    validYears: [190, 200],
    latitude: 34.73,
    longitude: 105.33,
    confidence: 'C',
    researchNotes: '汉末汉阳郡治；古冀县位置有多种说法，采用甘谷区域代表点。',
    sourceRefs: [
      'https://www.tianshui.gov.cn/wlj/info/1852/289532.htm',
      'https://www.tianshui.gov.cn/dsb/info/1883/22612.htm',
    ],
  },
  {
    id: 'changan',
    nameEn: "Chang'an",
    nameZh: '长安',
    historicalSeatName: '汉长安城，今西安西北汉城区域',
    validYears: [190, 200],
    latitude: 34.32,
    longitude: 108.94,
    confidence: 'A',
    researchNotes: '使用汉长安县城区域，不使用唐长安或现代市中心。',
    sourceRefs: [TGAZ + 'hvd_70623'],
  },
  {
    id: 'luoyang',
    nameEn: 'Luoyang',
    nameZh: '洛阳',
    historicalSeatName: '汉魏洛阳故城',
    validYears: [190, 200],
    latitude: 34.73,
    longitude: 112.6,
    confidence: 'B',
    researchNotes: '以明确的汉魏故城位置作区域锚点；跨期县名资料不直接套用至190年。',
    sourceRefs: [TGAZ + 'hvd_82853'],
  },
  {
    id: 'jinyang',
    nameEn: 'Jinyang',
    nameZh: '晋阳',
    historicalSeatName: '晋阳古城区域，今太原晋源附近',
    validYears: [190, 200],
    latitude: 37.76,
    longitude: 112.52,
    confidence: 'B',
    researchNotes: '古城区域可定位；现有郡治记录较晚，汉末精确点仍需复核。',
    sourceRefs: [TGAZ + 'hvd_94184'],
  },
  {
    id: 'ye',
    nameEn: 'Ye',
    nameZh: '邺',
    historicalSeatName: '邺城北城区域，今临漳邺镇附近',
    validYears: [190, 200],
    latitude: 36.27,
    longitude: 114.41,
    confidence: 'B',
    researchNotes: '借同城址位置定位，不将后世“临漳”县名提前。',
    sourceRefs: [TGAZ + 'hvd_82197'],
  },
  {
    id: 'beiping',
    nameEn: 'Beiping',
    nameZh: '北平',
    historicalSeatName: '右北平郡治土垠，今唐山丰润银城铺区域',
    validYears: [190, 200],
    latitude: 39.83,
    longitude: 118.16,
    confidence: 'A',
    researchNotes: '代表土垠，不是现代北京或后期易京。',
    sourceRefs: [TGAZ + 'hvd_87632'],
  },
  {
    id: 'pingyuan',
    nameEn: 'Pingyuan',
    nameZh: '平原',
    historicalSeatName: '平原县故城，今平原县西南张官店区域',
    validYears: [190, 200],
    latitude: 37.02,
    longitude: 116.44,
    confidence: 'A',
    researchNotes: '古县城区域锚点。',
    sourceRefs: [TGAZ + 'hvd_45100'],
  },
  {
    id: 'beihai',
    nameEn: 'Beihai',
    nameZh: '北海',
    historicalSeatName: '北海国治剧县，暂取昌乐西北区域',
    validYears: [190, 200],
    latitude: 36.72,
    longitude: 118.8,
    confidence: 'C',
    researchNotes: '古剧县位置仍有歧义；这是区域估算点，不是广西北海。',
    sourceRefs: ['https://shandong-chorography.org/database/c76/section/1/article/9/'],
  },
  {
    id: 'puyang',
    nameEn: 'Puyang',
    nameZh: '濮阳',
    historicalSeatName: '濮阳/东郡区域，暂取今濮阳县附近',
    validYears: [190, 200],
    latitude: 35.7,
    longitude: 115.01,
    confidence: 'C',
    researchNotes: '东郡范围跨期较大；县治仍需查证，采用区域代表点。',
    sourceRefs: [TGAZ + 'hvd_115179'],
  },
  {
    id: 'chenliu',
    nameEn: 'Chenliu',
    nameZh: '陈留',
    historicalSeatName: '陈留县故城，今开封陈留镇区域',
    validYears: [190, 200],
    latitude: 34.67,
    longitude: 114.52,
    confidence: 'A',
    researchNotes: '汉末年代覆盖的历史县城记录。',
    sourceRefs: [TGAZ + 'hvd_44324'],
  },
  {
    id: 'xuchang',
    nameEn: 'Xuchang',
    nameZh: '许昌',
    historicalSeatName: '许县，今许昌东南张潘故城',
    validYears: [190, 200],
    latitude: 33.99,
    longitude: 114.01,
    confidence: 'A',
    researchNotes: '界面名可用许昌；许昌为221年后的名称。',
    sourceRefs: [TGAZ + 'hvd_83011'],
  },
  {
    id: 'xiapi',
    nameEn: 'Xiapi',
    nameZh: '下邳',
    historicalSeatName: '下邳故城，今睢宁古邳东侧',
    validYears: [190, 200],
    latitude: 34.12,
    longitude: 117.89,
    confidence: 'A',
    researchNotes: '汉末历史县城区域。',
    sourceRefs: [TGAZ + 'hvd_42821'],
  },
  {
    id: 'shouchun',
    nameEn: 'Shouchun',
    nameZh: '寿春',
    historicalSeatName: '寿春古城区域，今寿县',
    validYears: [190, 200],
    latitude: 32.58,
    longitude: 116.78,
    confidence: 'B',
    researchNotes: '采用古城区域位置，不以现代县政府点替代。',
    sourceRefs: [
      'https://www.huainan.gov.cn/HUAINANCHINA/AboutHuainan/1260045526.html',
      TGAZ + 'hvd_33465',
    ],
  },
  {
    id: 'jianye',
    nameEn: 'Jianye',
    nameZh: '建业',
    historicalSeatName: '秣陵县故治，后称建业',
    validYears: [190, 200],
    latitude: 31.84,
    longitude: 118.83,
    confidence: 'A',
    researchNotes: '190/200年位置取秣陵县故治；后期建业城中心北移。',
    sourceRefs: [TGAZ + 'hvd_40520'],
  },
  {
    id: 'wu',
    nameEn: 'Wu',
    nameZh: '吴',
    historicalSeatName: '吴县，今苏州古城区域',
    validYears: [190, 200],
    latitude: 31.31,
    longitude: 120.62,
    confidence: 'A',
    researchNotes: '汉末吴县区域。',
    sourceRefs: [TGAZ + 'hvd_40404'],
  },
  {
    id: 'chaisang',
    nameEn: 'Chaisang',
    nameZh: '柴桑',
    historicalSeatName: '柴桑故城区域，今九江西南',
    validYears: [190, 200],
    latitude: 29.64,
    longitude: 115.94,
    confidence: 'A',
    researchNotes: '不等同于现代九江市中心。',
    sourceRefs: [TGAZ + 'hvd_41145'],
  },
  {
    id: 'jiangxia',
    nameEn: 'Jiangxia',
    nameZh: '江夏',
    historicalSeatName: '夏口/汉阳附近战略区域',
    validYears: [190, 200],
    latitude: 30.58,
    longitude: 114.27,
    confidence: 'C',
    researchNotes: '汉末城址与郡治有迁移；作为战略区域抽象，不声称两个剧本都在同一点。',
    sourceRefs: ['https://www.hanyang.gov.cn/mlhy/lsyg/202008/t20200826_1434281.shtml'],
  },
  {
    id: 'xiangyang',
    nameEn: 'Xiangyang',
    nameZh: '襄阳',
    historicalSeatName: '襄阳汉水南岸古城区域',
    validYears: [190, 200],
    latitude: 32.03,
    longitude: 112.16,
    confidence: 'B',
    researchNotes: '位于汉水南岸，不是对岸樊城。',
    sourceRefs: [TGAZ + 'hvd_43736'],
  },
  {
    id: 'wancheng',
    nameEn: 'Wancheng',
    nameZh: '宛城',
    historicalSeatName: '宛县/宛城，今南阳古城区域',
    validYears: [190, 200],
    latitude: 33.0,
    longitude: 112.54,
    confidence: 'A',
    researchNotes: '郡县记录与省级沿革资料交叉核对。',
    sourceRefs: [
      TGAZ + 'hvd_115648',
      'https://wlt.hubei.gov.cn/bmdt/ztzl/zshb/201912/t20191226_1799409.shtml',
    ],
  },
  {
    id: 'hanzhong',
    nameEn: 'Hanzhong',
    nameZh: '汉中',
    historicalSeatName: '汉中郡治南郑，今汉中汉台区域',
    validYears: [190, 200],
    latitude: 33.08,
    longitude: 107.05,
    confidence: 'B',
    researchNotes: '使用汉台古城区域，不取现代南郑区政府点。',
    sourceRefs: [
      'https://www.hanzhong.gov.cn/hzszf/mlhz/hzgk/202409/96f3304196fe4de4a13c848c03956a10.shtml',
      TGAZ + 'hvd_70985',
    ],
  },
  {
    id: 'zitong',
    nameEn: 'Zitong',
    nameZh: '梓潼',
    historicalSeatName: '梓潼县城区域（汉末古址待核）',
    validYears: [190, 200],
    latitude: 31.64,
    longitude: 105.16,
    confidence: 'C',
    researchNotes: '采用现代县城区域近似点；未核实汉末县治，不使用唐梓潼郡点。',
    sourceRefs: [CHGIS],
  },
  {
    id: 'chengdu',
    nameEn: 'Chengdu',
    nameZh: '成都',
    historicalSeatName: '成都县古城区域',
    validYears: [190, 200],
    latitude: 30.65,
    longitude: 104.08,
    confidence: 'A',
    researchNotes: '汉末年代覆盖的历史县城记录。',
    sourceRefs: [TGAZ + 'hvd_44394'],
  },
  {
    id: 'jiangzhou',
    nameEn: 'Jiangzhou',
    nameZh: '江州',
    historicalSeatName: '江州，今重庆嘉陵江口区域',
    validYears: [190, 200],
    latitude: 29.56,
    longitude: 106.56,
    confidence: 'B',
    researchNotes: '201年迁南城；190/200年具体旧城点仍须补核，暂取区域代表点。',
    sourceRefs: [TGAZ + 'hvd_44662'],
  },
  {
    id: 'jiangling',
    nameEn: 'Jiangling',
    nameZh: '江陵',
    historicalSeatName: '江陵县古城，今荆州古城区域',
    validYears: [190, 200],
    latitude: 30.35,
    longitude: 112.19,
    confidence: 'A',
    researchNotes: '不使用现代江陵县政府新址。',
    sourceRefs: [TGAZ + 'hvd_43676'],
  },
];

interface RouteSeed {
  id: string;
  straight: number;
  klass: RouteClass;
  low: number;
  nominal: number;
  high: number;
  daysLow: number;
  days: number;
  daysHigh: number;
  note: string;
}

/** Exact existing 42 edges, sorted by endpoint ID. Distances match the plan's audit table. */
const ROUTE_SEEDS: readonly RouteSeed[] = [
  {
    id: 'beihai--pingyuan',
    straight: 215,
    klass: 'P',
    low: 245,
    nominal: 265,
    high: 285,
    daysLow: 10,
    days: 14,
    daysHigh: 19,
    note: '北山东平原；古济水/黄河河道需复核。',
  },
  {
    id: 'beihai--xiapi',
    straight: 300,
    klass: 'H',
    low: 375,
    nominal: 420,
    high: 465,
    daysLow: 17,
    days: 25,
    daysHigh: 35,
    note: '山东丘陵南缘—沂沭泗流域。',
  },
  {
    id: 'beiping--pingyuan',
    straight: 345,
    klass: 'P',
    low: 400,
    nominal: 435,
    high: 470,
    daysLow: 16,
    days: 22,
    daysHigh: 32,
    note: '渤海湾西侧河北平原；北平起点为土垠。',
  },
  {
    id: 'beiping--ye',
    straight: 515,
    klass: 'P',
    low: 590,
    nominal: 645,
    high: 695,
    daysLow: 24,
    days: 33,
    daysHigh: 47,
    note: '河北平原长途，图上不能当作短路。',
  },
  {
    id: 'chaisang--jiangling',
    straight: 370,
    klass: 'R',
    low: 480,
    nominal: 555,
    high: 630,
    daysLow: 22,
    days: 32,
    daysHigh: 47,
    note: '长江中游岸路，不是跨湖直线或航道。',
  },
  {
    id: 'chaisang--jiangxia',
    straight: 190,
    klass: 'R',
    low: 250,
    nominal: 285,
    high: 325,
    daysLow: 11,
    days: 17,
    daysHigh: 24,
    note: '长江走廊岸路。',
  },
  {
    id: 'chaisang--jianye',
    straight: 370,
    klass: 'R',
    low: 480,
    nominal: 555,
    high: 625,
    daysLow: 22,
    days: 32,
    daysHigh: 46,
    note: '沿江岸路；港口水路另行建模。',
  },
  {
    id: 'chaisang--wu',
    straight: 485,
    klass: 'H',
    low: 605,
    nominal: 680,
    high: 750,
    daysLow: 28,
    days: 40,
    daysHigh: 57,
    note: '皖南/江南丘陵；避让鄱阳湖。',
  },
  {
    id: 'changan--hanzhong',
    straight: 225,
    klass: 'B',
    low: 400,
    nominal: 425,
    high: 450,
    daysLow: 23,
    days: 33,
    daysHigh: 44,
    note: '褒斜道专项；235公里山路加接近道路，不设30日下限。',
  },
  {
    id: 'changan--luoyang',
    straight: 340,
    klass: 'H',
    low: 425,
    nominal: 475,
    high: 525,
    daysLow: 20,
    days: 28,
    daysHigh: 40,
    note: '关中—崤函—洛阳盆地。',
  },
  {
    id: 'changan--tianshui',
    straight: 335,
    klass: 'H',
    low: 415,
    nominal: 465,
    high: 515,
    daysLow: 19,
    days: 28,
    daysHigh: 39,
    note: '渭河谷地/陇山过渡；天水锚点取冀县区域。',
  },
  {
    id: 'chengdu--jiangzhou',
    straight: 270,
    klass: 'H',
    low: 335,
    nominal: 375,
    high: 415,
    daysLow: 16,
    days: 22,
    daysHigh: 32,
    note: '川中丘陵，不画直穿山脊的路。',
  },
  {
    id: 'chengdu--zitong',
    straight: 150,
    klass: 'H',
    low: 190,
    nominal: 210,
    high: 235,
    daysLow: 9,
    days: 13,
    daysHigh: 18,
    note: '成都平原—涪江/梓潼丘陵。',
  },
  {
    id: 'chenliu--luoyang',
    straight: 175,
    klass: 'P',
    low: 200,
    nominal: 220,
    high: 235,
    daysLow: 8,
    days: 11,
    daysHigh: 16,
    note: '洛阳盆地东出—中原平原。',
  },
  {
    id: 'chenliu--puyang',
    straight: 125,
    klass: 'P',
    low: 140,
    nominal: 155,
    high: 165,
    daysLow: 6,
    days: 8,
    daysHigh: 11,
    note: '中原平原；古黄河渡口待核。',
  },
  {
    id: 'chenliu--shouchun',
    straight: 315,
    klass: 'P',
    low: 360,
    nominal: 390,
    high: 420,
    daysLow: 15,
    days: 20,
    daysHigh: 28,
    note: '汴淮间平原。',
  },
  {
    id: 'chenliu--xuchang',
    straight: 90,
    klass: 'P',
    low: 100,
    nominal: 110,
    high: 120,
    daysLow: 4,
    days: 6,
    daysHigh: 8,
    note: '中原平原；许昌对应汉末许县。',
  },
  {
    id: 'hanzhong--tianshui',
    straight: 245,
    klass: 'M',
    low: 365,
    nominal: 410,
    high: 460,
    daysLow: 21,
    days: 33,
    daysHigh: 46,
    note: '陇南/西汉水—汉中山地走廊候选。',
  },
  {
    id: 'hanzhong--xiangyang',
    straight: 495,
    klass: 'M',
    low: 740,
    nominal: 840,
    high: 935,
    daysLow: 41,
    days: 66,
    daysHigh: 93,
    note: '沿汉水上游经安康区域；按岸路而非水里程。',
  },
  {
    id: 'hanzhong--zitong',
    straight: 240,
    klass: 'M',
    low: 360,
    nominal: 405,
    high: 455,
    daysLow: 20,
    days: 32,
    daysHigh: 46,
    note: '汉中—广元—剑阁—梓潼，需绕行。',
  },
  {
    id: 'jiangling--jiangxia',
    straight: 200,
    klass: 'R',
    low: 260,
    nominal: 300,
    high: 340,
    daysLow: 12,
    days: 17,
    daysHigh: 25,
    note: '江汉平原岸路；古湖泊避让待核。',
  },
  {
    id: 'jiangling--jiangzhou',
    straight: 550,
    klass: 'M',
    low: 825,
    nominal: 935,
    high: 1045,
    daysLow: 46,
    days: 74,
    daysHigh: 104,
    note: '三峡/鄂西长距离山地陆路；水路须另建。',
  },
  {
    id: 'jiangling--xiangyang',
    straight: 185,
    klass: 'H',
    low: 235,
    nominal: 260,
    high: 290,
    daysLow: 11,
    days: 16,
    daysHigh: 22,
    note: '荆门—襄阳走廊。',
  },
  {
    id: 'jiangxia--shouchun',
    straight: 325,
    klass: 'H',
    low: 405,
    nominal: 455,
    high: 505,
    daysLow: 19,
    days: 27,
    daysHigh: 38,
    note: '大别山北/南侧走廊待核。',
  },
  {
    id: 'jiangxia--xiangyang',
    straight: 255,
    klass: 'R',
    low: 335,
    nominal: 385,
    high: 435,
    daysLow: 15,
    days: 22,
    daysHigh: 32,
    note: '汉江走廊岸路。',
  },
  {
    id: 'jiangxia--xuchang',
    straight: 380,
    klass: 'M',
    low: 570,
    nominal: 645,
    high: 720,
    daysLow: 32,
    days: 51,
    daysHigh: 72,
    note: '桐柏/大别山过渡；义阳走廊候选。',
  },
  {
    id: 'jiangzhou--zitong',
    straight: 265,
    klass: 'H',
    low: 335,
    nominal: 375,
    high: 415,
    daysLow: 16,
    days: 22,
    daysHigh: 32,
    note: '四川盆地丘陵。',
  },
  {
    id: 'jianye--shouchun',
    straight: 210,
    klass: 'H',
    low: 260,
    nominal: 295,
    high: 325,
    daysLow: 12,
    days: 18,
    daysHigh: 25,
    note: '淮南—江淮；过江点待核。',
  },
  {
    id: 'jianye--wu',
    straight: 180,
    klass: 'P',
    low: 205,
    nominal: 225,
    high: 240,
    daysLow: 9,
    days: 12,
    daysHigh: 16,
    note: '江南平原；湖泊避让。',
  },
  {
    id: 'jianye--xiapi',
    straight: 270,
    klass: 'P',
    low: 310,
    nominal: 335,
    high: 360,
    daysLow: 13,
    days: 17,
    daysHigh: 24,
    note: '淮泗—江淮平原；过河点待核。',
  },
  {
    id: 'jinyang--luoyang',
    straight: 335,
    klass: 'M',
    low: 505,
    nominal: 575,
    high: 640,
    daysLow: 28,
    days: 46,
    daysHigh: 64,
    note: '太行/太岳山间走廊；黄河渡口待核。',
  },
  {
    id: 'jinyang--ye',
    straight: 235,
    klass: 'M',
    low: 355,
    nominal: 400,
    high: 450,
    daysLow: 20,
    days: 32,
    daysHigh: 45,
    note: '太行山越岭，不可按平原直连。',
  },
  {
    id: 'luoyang--wancheng',
    straight: 190,
    klass: 'M',
    low: 290,
    nominal: 325,
    high: 365,
    daysLow: 17,
    days: 26,
    daysHigh: 37,
    note: '伏牛山间通道候选。',
  },
  {
    id: 'luoyang--ye',
    straight: 235,
    klass: 'H',
    low: 295,
    nominal: 330,
    high: 365,
    daysLow: 14,
    days: 20,
    daysHigh: 28,
    note: '黄河北岸/太行东麓通道。',
  },
  {
    id: 'pingyuan--puyang',
    straight: 195,
    klass: 'P',
    low: 225,
    nominal: 245,
    high: 265,
    daysLow: 9,
    days: 13,
    daysHigh: 18,
    note: '华北平原；古河道待核。',
  },
  {
    id: 'pingyuan--ye',
    straight: 200,
    klass: 'P',
    low: 230,
    nominal: 250,
    high: 270,
    daysLow: 10,
    days: 13,
    daysHigh: 18,
    note: '河北平原。',
  },
  {
    id: 'puyang--xiapi',
    straight: 315,
    klass: 'P',
    low: 365,
    nominal: 395,
    high: 425,
    daysLow: 15,
    days: 20,
    daysHigh: 29,
    note: '鲁西南—泗水流域平原。',
  },
  {
    id: 'puyang--ye',
    straight: 85,
    klass: 'P',
    low: 95,
    nominal: 105,
    high: 110,
    daysLow: 4,
    days: 6,
    daysHigh: 8,
    note: '河北/豫北平原。',
  },
  {
    id: 'shouchun--xiapi',
    straight: 200,
    klass: 'P',
    low: 230,
    nominal: 250,
    high: 270,
    daysLow: 10,
    days: 13,
    daysHigh: 18,
    note: '淮泗平原。',
  },
  {
    id: 'shouchun--xuchang',
    straight: 300,
    klass: 'P',
    low: 345,
    nominal: 375,
    high: 405,
    daysLow: 14,
    days: 19,
    daysHigh: 27,
    note: '颍淮平原。',
  },
  {
    id: 'wancheng--xiangyang',
    straight: 115,
    klass: 'P',
    low: 130,
    nominal: 140,
    high: 155,
    daysLow: 6,
    days: 7,
    daysHigh: 11,
    note: '南阳盆地—汉江谷地。',
  },
  {
    id: 'wancheng--xuchang',
    straight: 175,
    klass: 'H',
    low: 220,
    nominal: 245,
    high: 270,
    daysLow: 10,
    days: 15,
    daysHigh: 21,
    note: '南阳盆地东北出山口。',
  },
];

const BASE_TERRAIN_SPLIT: Record<RouteClass, readonly [number, number, number]> = {
  P: [1, 0, 0],
  H: [0.5, 0.5, 0],
  M: [0.3, 0.2, 0.5],
  R: [0.6, 0.4, 0],
  B: [0, 0, 0],
};

function makeSegments(seed: RouteSeed): readonly RouteSegment[] {
  if (seed.klass === 'B') {
    return [
      {
        terrain: 'mountain',
        lengthKm: 235,
        researchNote: '褒谷口—斜峪关，地方资料概述谷道约235公里；非汉末测绘。',
        fixedDelayDays: 0,
      },
      {
        terrain: 'plain',
        lengthKm: 190,
        researchNote: '两端衔接道路名义估算；按上下限调整为165–215公里。',
        fixedDelayDays: 0,
      },
    ];
  }
  const [plainShare, hillShare, mountainShare] = BASE_TERRAIN_SPLIT[seed.klass];
  const shares: readonly [RoadTerrain, number][] = [
    ['plain', plainShare],
    ['hill', hillShare],
    ['mountain', mountainShare],
  ];
  return shares
    .filter(([, share]) => share > 0)
    .map(([terrain, share]) => ({
      terrain,
      lengthKm: seed.nominal * share,
      researchNote: `类别 ${seed.klass} 地形占比估算；路线控制点尚未逐条 GIS 复原。`,
      fixedDelayDays: 0,
    }));
}

function cityPair(id: string): readonly [CityId, CityId] {
  const [from, to] = id.split('--');
  if (!from || !to) throw new Error(`Invalid route ID: ${id}`);
  return [from as CityId, to as CityId];
}

export const ROUTE_DEFINITIONS: readonly RouteDefinition[] = ROUTE_SEEDS.map((seed) => {
  const [fromCityId, toCityId] = cityPair(seed.id);
  return {
    id: seed.id,
    fromCityId,
    toCityId,
    straightLineKm: seed.straight,
    roadKmLow: seed.low,
    roadKmNominal: seed.nominal,
    roadKmHigh: seed.high,
    routeClass: seed.klass,
    baselineDaysLow: seed.daysLow,
    baselineDaysNominal: seed.days,
    baselineDaysHigh: seed.daysHigh,
    segments: makeSegments(seed),
    confidence: 'estimated',
    estimateMethod:
      '大圆锚点距离 × 类别绕行系数；按类别地形占比分段，名义道路长度 / 分段名义速度后仅在总和末尾向上取整。',
    researchNotes: seed.note,
    sourceRefs: [RESEARCH_DOC + '#42-条现有边的首轮全量审计', CHGIS],
  };
});

export const CITY_GEOGRAPHY_BY_ID: ReadonlyMap<CityId, CityGeography> = new Map(
  CITY_GEOGRAPHY.map((city) => [city.id, city]),
);
export const ROUTE_BY_ID: ReadonlyMap<string, RouteDefinition> = new Map(
  ROUTE_DEFINITIONS.map((route) => [route.id, route]),
);

export function routeIdBetween(a: CityId, b: CityId): string {
  return a < b ? `${a}--${b}` : `${b}--${a}`;
}

export interface StrategicRouteLeg {
  fromCityId: CityId;
  toCityId: CityId;
  route: RouteDefinition;
  direction: 'forward' | 'reverse';
}

export interface StrategicRoutePath {
  /** Ordered endpoints and intermediate friendly cities, including both endpoints. */
  cityIds: CityId[];
  legs: StrategicRouteLeg[];
  roadKmNominal: number;
  /** Continuous travel estimate, rounded once across the ordered leg segments. */
  estimatedDays: number;
  /** Fractional work-day cost used to compare candidate paths before the final rounding. */
  workDays: number;
}

export interface StrategicRouteOptions {
  /** Transit is permitted only through this set; callers should pass currently friendly cities. */
  allowedCityIds?: ReadonlySet<CityId>;
  departureAbsoluteDay?: number;
  composition?: TravelComposition;
}

/**
 * Find the lowest estimated-time path across the versioned 42-edge land network.
 * Equal-cost paths resolve lexicographically, so save/replay and UI use the same path.
 * The result preserves each researched edge and direction for route snapshots and display.
 */
export function findStrategicRoutePath(
  fromCityId: CityId,
  toCityId: CityId,
  options: StrategicRouteOptions = {},
): StrategicRoutePath | null {
  if (fromCityId === toCityId) {
    if (options.allowedCityIds && !options.allowedCityIds.has(fromCityId)) return null;
    return { cityIds: [fromCityId], legs: [], roadKmNominal: 0, estimatedDays: 0, workDays: 0 };
  }
  const allowed = options.allowedCityIds;
  if (allowed && (!allowed.has(fromCityId) || !allowed.has(toCityId))) return null;
  const departureAbsoluteDay = options.departureAbsoluteDay ?? 0;
  const composition = options.composition ?? { troopTypes: ['infantry'] as const };
  const paths = new Map<CityId, StrategicRoutePath>([
    [
      fromCityId,
      { cityIds: [fromCityId], legs: [], roadKmNominal: 0, estimatedDays: 0, workDays: 0 },
    ],
  ]);
  const pending = new Set<CityId>(CITY_GEOGRAPHY.map((city) => city.id));

  while (pending.size > 0) {
    const current = [...pending]
      .filter((cityId) => paths.has(cityId))
      .sort((a, b) => {
        const pathA = paths.get(a)!;
        const pathB = paths.get(b)!;
        return (
          pathA.workDays - pathB.workDays ||
          pathA.cityIds.join('|').localeCompare(pathB.cityIds.join('|'))
        );
      })[0];
    if (!current) break;
    pending.delete(current);
    if (current === toCityId) return paths.get(current)!;

    const currentPath = paths.get(current)!;
    const adjacent = ROUTE_DEFINITIONS.filter(
      (route) => route.fromCityId === current || route.toCityId === current,
    ).sort((a, b) => a.id.localeCompare(b.id));
    for (const route of adjacent) {
      const next = route.fromCityId === current ? route.toCityId : route.fromCityId;
      if (!pending.has(next) || (allowed && !allowed.has(next))) continue;
      const direction: StrategicRouteLeg['direction'] =
        route.fromCityId === current ? 'forward' : 'reverse';
      const estimate = estimateTravel(route, direction, departureAbsoluteDay, composition);
      const legWorkDays =
        estimate.segments.reduce((sum, segment) => sum + segment.workDays, 0) +
        estimate.fixedDelayDays;
      const legs = [...currentPath.legs, { fromCityId: current, toCityId: next, route, direction }];
      const cityIds = [...currentPath.cityIds, next];
      const workDays = currentPath.workDays + legWorkDays;
      const candidate: StrategicRoutePath = {
        cityIds,
        legs,
        roadKmNominal: currentPath.roadKmNominal + route.roadKmNominal,
        estimatedDays: Math.max(1, Math.ceil(workDays - 1e-10)),
        workDays,
      };
      const existing = paths.get(next);
      if (
        !existing ||
        workDays < existing.workDays - 1e-10 ||
        (Math.abs(workDays - existing.workDays) <= 1e-10 &&
          cityIds.join('|').localeCompare(existing.cityIds.join('|')) < 0)
      )
        paths.set(next, candidate);
    }
  }
  return null;
}

/** Great-circle distance, rounded to the nearest 5 km for audit displays only. */
export function straightLineDistanceKm(a: CityGeography, b: CityGeography): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(b.longitude - a.longitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const km = 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(haversine)));
  return Math.round(km / 5) * 5;
}

export interface AnchorRouteSensitivity {
  routeId: string;
  otherCityId: CityId;
  baselineStraightLineKm: number;
  minimumStraightLineKm: number;
  maximumStraightLineKm: number;
  minimumDeltaKm: number;
  maximumDeltaKm: number;
}

/**
 * Recalculate straight-line distances to adjacent route anchors after moving a city
 * by the requested radius in eight compass directions. Nominal road km are deliberately
 * unchanged: this is a visual/anchor sensitivity check, not authority to rewrite roads.
 */
export function analyzeAnchorSensitivity(
  cityId: CityId,
  radiusKm: 20 | 40,
): AnchorRouteSensitivity[] {
  const city = CITY_GEOGRAPHY_BY_ID.get(cityId);
  if (!city) throw new Error(`Unknown city anchor ${cityId}.`);
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const degrees = (value: number) => (value * 180) / Math.PI;
  const angularDistance = radiusKm / 6371.0088;
  const displaced = Array.from({ length: 8 }, (_, index) => {
    const bearing = radians(index * 45);
    const latitude = radians(city.latitude);
    const longitude = radians(city.longitude);
    const nextLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const nextLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
      );
    return { ...city, latitude: degrees(nextLatitude), longitude: degrees(nextLongitude) };
  });
  return ROUTE_DEFINITIONS.filter(
    (route) => route.fromCityId === cityId || route.toCityId === cityId,
  )
    .map((route) => {
      const otherCityId = route.fromCityId === cityId ? route.toCityId : route.fromCityId;
      const other = CITY_GEOGRAPHY_BY_ID.get(otherCityId)!;
      const baselineStraightLineKm = straightLineDistanceKm(city, other);
      const distances = displaced.map((anchor) => straightLineDistanceKm(anchor, other));
      const minimumStraightLineKm = Math.min(...distances);
      const maximumStraightLineKm = Math.max(...distances);
      return {
        routeId: route.id,
        otherCityId,
        baselineStraightLineKm,
        minimumStraightLineKm,
        maximumStraightLineKm,
        minimumDeltaKm: minimumStraightLineKm - baselineStraightLineKm,
        maximumDeltaKm: maximumStraightLineKm - baselineStraightLineKm,
      };
    })
    .sort((a, b) => a.routeId.localeCompare(b.routeId));
}

/** The five current C-grade anchors called out for ±20/40 km review in the route plan. */
export const C_GRADE_ANCHOR_IDS: readonly CityId[] = CITY_GEOGRAPHY.filter(
  (city) => city.confidence === 'C',
).map((city) => city.id);

export interface MapBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export const CAMPAIGN_MAP_BOUNDS: MapBounds = {
  minLatitude: 28.8,
  maxLatitude: 40.5,
  minLongitude: 103.2,
  maxLongitude: 121.6,
};

/**
 * A simple north-up equirectangular projection for the campaign canvas. It is an
 * illustration projection only; distance estimates always use route kilometres.
 */
export function projectCampaignPoint(
  latitude: number,
  longitude: number,
  bounds: MapBounds = CAMPAIGN_MAP_BOUNDS,
): { x: number; y: number } {
  const meanLatitude = (bounds.minLatitude + bounds.maxLatitude) / 2;
  const longitudeScale = Math.cos((meanLatitude * Math.PI) / 180);
  const xStart = bounds.minLongitude * longitudeScale;
  const xEnd = bounds.maxLongitude * longitudeScale;
  return {
    x: ((longitude * longitudeScale - xStart) / (xEnd - xStart)) * 1000,
    y: ((bounds.maxLatitude - latitude) / (bounds.maxLatitude - bounds.minLatitude)) * 1000,
  };
}

export interface ProjectedCityRoute {
  cityIds: readonly CityId[];
  points: readonly { x: number; y: number }[];
  /** These are network connectors between city anchors, not reconstructed road alignments. */
  geometryBasis: 'schematic-city-anchor-network';
}

export interface ProjectedCampaignRoute extends ProjectedCityRoute {
  routeId: string;
  nominalRoadKm: number;
  baselineDaysNominal: number;
  confidence: 'estimated';
  sourceRefs: readonly string[];
  researchNotes: string;
}

/**
 * Project an ordered route through the configured city network. The line follows
 * city anchors and known graph legs only; it must not be presented as a surveyed
 * ancient road or as a terrain-accurate corridor.
 */
export function projectCityRoute(
  cityIds: readonly CityId[],
  project: (latitude: number, longitude: number) => { x: number; y: number } = projectCampaignPoint,
): ProjectedCityRoute | null {
  if (cityIds.length < 2) return null;
  const cities = cityIds.map((cityId) => CITY_GEOGRAPHY_BY_ID.get(cityId));
  if (cities.some((city) => !city)) return null;
  for (let index = 0; index < cityIds.length - 1; index++) {
    if (!ROUTE_BY_ID.has(routeIdBetween(cityIds[index]!, cityIds[index + 1]!))) return null;
  }
  return {
    cityIds: [...cityIds],
    points: cities.map((city) => project(city!.latitude, city!.longitude)),
    geometryBasis: 'schematic-city-anchor-network',
  };
}

/** Map presentation data keeps estimated road kilometres separate from travel days. */
export function projectCampaignRoute(
  route: RouteDefinition,
  project: (latitude: number, longitude: number) => { x: number; y: number } = projectCampaignPoint,
): ProjectedCampaignRoute {
  const geometry = projectCityRoute([route.fromCityId, route.toCityId], project);
  if (!geometry) throw new Error(`Route ${route.id} has invalid city anchors or graph topology.`);
  return {
    ...geometry,
    routeId: route.id,
    nominalRoadKm: route.roadKmNominal,
    baselineDaysNominal: route.baselineDaysNominal,
    confidence: route.confidence,
    sourceRefs: route.sourceRefs,
    researchNotes: route.researchNotes,
  };
}

/**
 * Interpolate an in-transit marker along the strategic network using saved route
 * snapshot progress. Snapshot kilometres determine progress; city-anchor geometry
 * is only a schematic display, and this function never changes ETA or road distance.
 */
export function projectJourneyPosition(
  cityIds: readonly CityId[],
  segmentLengthsKm: readonly number[],
  segmentProgressKm: readonly number[],
  project: (latitude: number, longitude: number) => { x: number; y: number } = projectCampaignPoint,
): { x: number; y: number } | null {
  if (
    segmentLengthsKm.length === 0 ||
    segmentLengthsKm.length !== segmentProgressKm.length ||
    segmentLengthsKm.some((length) => !Number.isFinite(length) || length < 0) ||
    segmentProgressKm.some((progress) => !Number.isFinite(progress) || progress < 0)
  )
    return null;
  const route = projectCityRoute(cityIds, project);
  if (!route) return null;
  const routeLengths = cityIds.slice(1).map((cityId, index) => {
    const edge = ROUTE_BY_ID.get(routeIdBetween(cityIds[index]!, cityId));
    return edge?.roadKmNominal ?? 0;
  });
  const totalSnapshotKm = segmentLengthsKm.reduce((sum, length) => sum + length, 0);
  const totalRouteKm = routeLengths.reduce((sum, length) => sum + length, 0);
  if (totalSnapshotKm <= 0 || totalRouteKm <= 0) return null;
  const completedSnapshotKm = segmentLengthsKm.reduce(
    (sum, length, index) => sum + Math.min(length, segmentProgressKm[index]!),
    0,
  );
  if (completedSnapshotKm >= totalSnapshotKm) return route.points.at(-1)!;
  let remainingRouteKm = (completedSnapshotKm / totalSnapshotKm) * totalRouteKm;
  for (let index = 0; index < routeLengths.length; index++) {
    const legLength = routeLengths[index]!;
    const from = route.points[index]!;
    const to = route.points[index + 1]!;
    if (remainingRouteKm <= legLength || index === routeLengths.length - 1) {
      const fraction = Math.max(0, Math.min(1, remainingRouteKm / legLength));
      return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
      };
    }
    remainingRouteKm -= legLength;
  }
  return null;
}

export function validateGeographyData(): string[] {
  const errors: string[] = [];
  if (CITY_GEOGRAPHY.length !== 24)
    errors.push(`Expected 24 cities; found ${CITY_GEOGRAPHY.length}.`);
  if (ROUTE_DEFINITIONS.length !== 42)
    errors.push(`Expected 42 routes; found ${ROUTE_DEFINITIONS.length}.`);
  const cityIds = new Set(CITY_GEOGRAPHY.map((city) => city.id));
  if (cityIds.size !== CITY_GEOGRAPHY.length) errors.push('City IDs are not unique.');
  const routeIds = new Set(ROUTE_DEFINITIONS.map((route) => route.id));
  if (routeIds.size !== ROUTE_DEFINITIONS.length) errors.push('Route IDs are not unique.');
  for (const route of ROUTE_DEFINITIONS) {
    if (!cityIds.has(route.fromCityId) || !cityIds.has(route.toCityId)) {
      errors.push(`${route.id} references a missing city.`);
    }
    if (!(route.roadKmLow <= route.roadKmNominal && route.roadKmNominal <= route.roadKmHigh)) {
      errors.push(`${route.id} has an invalid road-kilometre range.`);
    }
    const segmentKm = route.segments.reduce((sum, segment) => sum + segment.lengthKm, 0);
    if (Math.abs(segmentKm - route.roadKmNominal) > 0.001) {
      errors.push(`${route.id} segments total ${segmentKm}, expected ${route.roadKmNominal}.`);
    }
    if (route.straightLineKm > route.roadKmLow)
      errors.push(`${route.id} road estimate is shorter than its straight line.`);
  }
  return errors;
}
