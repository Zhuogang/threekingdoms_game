export type CityTier = 'S' | 'A' | 'B' | 'C' | 'D';
export interface CityRecord {
  id: string;
  tier: CityTier;
  /** Opening values. */
  population: number;
  farming: number;
  commerce: number;
  /** Development ceilings; unused until ticket L-01. */
  farmingCap: number;
  commerceCap: number;
  /** Opening loyalty (Dong-owned cities start at 55 in the 190 scenario instead). */
  loyalty: number;
  /** One line: the Han commandery and the reasoning for the tier. */
  provenance: string;
}

interface TierRow {
  population: number;
  farming: number;
  commerce: number;
  farmingCap: number;
  commerceCap: number;
}
export const CITY_TIER_ROWS: Readonly<Record<CityTier, Readonly<TierRow>>> = Object.freeze({
  S: Object.freeze({
    population: 140_000,
    farming: 340,
    commerce: 300,
    farmingCap: 800,
    commerceCap: 700,
  }),
  A: Object.freeze({
    population: 110_000,
    farming: 300,
    commerce: 280,
    farmingCap: 650,
    commerceCap: 600,
  }),
  B: Object.freeze({
    population: 85_000,
    farming: 260,
    commerce: 240,
    farmingCap: 500,
    commerceCap: 480,
  }),
  C: Object.freeze({
    population: 60_000,
    farming: 220,
    commerce: 200,
    farmingCap: 400,
    commerceCap: 380,
  }),
  D: Object.freeze({
    population: 40_000,
    farming: 180,
    commerce: 160,
    farmingCap: 300,
    commerceCap: 280,
  }),
});

const OPENING_LOYALTY = 72;
const seeds: ReadonlyArray<readonly [string, CityTier, string]> = [
  [
    'wancheng',
    'S',
    '南阳郡: the most populous commandery of the Han census, rich plains around the Eastern Han imperial homeland.',
  ],
  ['chengdu', 'S', '蜀郡: the Chengdu plain, the granary of Yi province.'],
  ['jiangzhou', 'S', '巴郡: seat of Ba, a large populous commandery on the river trade route.'],
  ['xuchang', 'A', '颍川郡: populous central-plain commandery, seat of the later Han court.'],
  [
    'luoyang',
    'A',
    '河南尹: the old capital district; large but ravaged in 190, its weight is strategic.',
  ],
  ['chenliu', 'A', '陈留郡: dense Yan-province farmland on the Bian river.'],
  ['beihai', 'A', '北海国: large Qing-coast kingdom with salt and farmland.'],
  ['pingyuan', 'A', '平原国: Qing-province plain with dense settlement.'],
  ['jiangling', 'A', '南郡: the Jingzhou river hub on the Yangtze.'],
  ['wu', 'A', '吴郡: rich lower Yangtze commandery.'],
  ['jianye', 'A', '丹阳郡: Yangtze-south commandery with a wide populated plain.'],
  ['ye', 'B', '魏郡: wealthy Ji-province seat, solid but below the central plain.'],
  ['xiapi', 'B', '下邳国: Xu-province crossroads, productive but war-worn.'],
  ['shouchun', 'B', '九江郡: Huai-river commandery, moderate population.'],
  ['zitong', 'B', '广汉郡: Shu commandery north of Chengdu, mountain-ringed farmland.'],
  ['chaisang', 'B', '豫章郡: Yangtze port with a moderate hinterland.'],
  ['puyang', 'B', '东郡: Yan-province plain, flood-prone and mid-sized.'],
  ['changan', 'C', '京兆尹: the western capital district, in decline after the 190 burning.'],
  ['hanzhong', 'C', '汉中郡: mountain basin with a small population.'],
  ['jiangxia', 'C', '江夏郡: frontier river commandery, thinly settled.'],
  ['jinyang', 'C', '太原郡: northern highland commandery, modest farmland.'],
  [
    'xiangyang',
    'C',
    '南郡 (Xiangyang): a fortress town on the Han river, strategic more than populous.',
  ],
  ['tianshui', 'D', '汉阳郡: far-western border commandery, sparse population.'],
  ['beiping', 'D', '右北平郡: northeastern frontier commandery, the smallest tier.'],
];

export const CITY_RECORDS: Readonly<Record<string, CityRecord>> = Object.freeze(
  Object.fromEntries(
    seeds.map(([id, tier, provenance]) => [
      id,
      Object.freeze({ id, tier, ...CITY_TIER_ROWS[tier], loyalty: OPENING_LOYALTY, provenance }),
    ]),
  ),
);
