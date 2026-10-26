/**
 * Which canvas battlefield a campaign battle is fought on
 * (docs/v0.3/08-battlefield-canvas-plan.md §6–§8). The attacker's last route
 * leg picks the terrain; five attack directions override it. The same leg and
 * direction always give the same battlefield (plan B2).
 */

/** Default battlefield of each of the 42 routes, keyed by the sorted city pair. */
const ROUTE_BATTLEFIELD: Readonly<Record<string, string>> = {
  'beihai--pingyuan': 'bf01-north-plain',
  'beiping--pingyuan': 'bf01-north-plain',
  'beiping--ye': 'bf01-north-plain',
  'pingyuan--ye': 'bf01-north-plain',
  'chenliu--puyang': 'bf02-central-farmland',
  'chenliu--shouchun': 'bf02-central-farmland',
  'chenliu--xuchang': 'bf02-central-farmland',
  'puyang--xiapi': 'bf02-central-farmland',
  'shouchun--xuchang': 'bf02-central-farmland',
  'luoyang--ye': 'bf03-yellow-river-ford',
  'pingyuan--puyang': 'bf03-yellow-river-ford',
  'puyang--ye': 'bf03-yellow-river-ford',
  'jianye--xiapi': 'bf04-wetland-north',
  'shouchun--xiapi': 'bf04-wetland-north',
  'jianye--wu': 'bf04-wetland-south',
  'chaisang--jiangling': 'bf05-yangtze-bank',
  'chaisang--jiangxia': 'bf05-yangtze-bank',
  'chaisang--jianye': 'bf05-yangtze-bank',
  'jiangling--jiangxia': 'bf05-yangtze-bank',
  'jianye--shouchun': 'bf05-yangtze-crossing',
  'changan--tianshui': 'bf06-valley-north',
  'jiangxia--xiangyang': 'bf06-valley-south',
  'wancheng--xiangyang': 'bf06-valley-south',
  'jinyang--luoyang': 'bf07-taihang',
  'jinyang--ye': 'bf07-taihang',
  'beihai--xiapi': 'bf07-rolling-hills',
  'wancheng--xuchang': 'bf07-rolling-hills',
  'chaisang--wu': 'bf08-south-hills',
  'chengdu--jiangzhou': 'bf08-south-hills',
  'chengdu--zitong': 'bf08-south-hills',
  'jiangling--xiangyang': 'bf08-south-hills',
  'jiangxia--shouchun': 'bf08-south-hills',
  'jiangzhou--zitong': 'bf08-south-hills',
  'changan--hanzhong': 'bf09-gorge',
  'hanzhong--tianshui': 'bf09-gorge',
  'hanzhong--xiangyang': 'bf09-gorge',
  'jiangling--jiangzhou': 'bf09-three-gorges',
  'changan--luoyang': 'bf10-mountain-pass',
  'chenliu--luoyang': 'bf10-mountain-pass',
  'hanzhong--zitong': 'bf10-mountain-pass',
  'jiangxia--xuchang': 'bf10-mountain-pass',
  'luoyang--wancheng': 'bf10-mountain-pass',
};

/** The five direction special cases, keyed `target<-source` (plan §7). */
const DIRECTION_OVERRIDES: Readonly<Record<string, string>> = {
  'jianye<-xiapi': 'bf05-yangtze-crossing',
  'shouchun<-chenliu': 'bf04-wetland-north',
  'shouchun<-xuchang': 'bf04-wetland-north',
  'xiapi<-puyang': 'bf04-wetland-north',
  'xiapi<-beihai': 'bf04-wetland-north',
  'luoyang<-jinyang': 'bf03-yellow-river-ford',
  'changan<-hanzhong': 'bf06-valley-north',
};

export const BATTLEFIELD_NAMES: Readonly<Record<string, { zh: string; en: string }>> = {
  'bf01-north-plain': { zh: '北方旷野', en: 'Northern Plain' },
  'bf02-central-farmland': { zh: '中原沃野', en: 'Central Farmland' },
  'bf03-yellow-river-ford': { zh: '黄河津渡', en: 'Yellow River Ford' },
  'bf04-wetland-north': { zh: '水网泽国', en: 'Waterlands' },
  'bf04-wetland-south': { zh: '水网泽国', en: 'Waterlands' },
  'bf05-yangtze-bank': { zh: '大江·沿江', en: 'Great River Shore' },
  'bf05-yangtze-crossing': { zh: '大江·渡江', en: 'Great River Crossing' },
  'bf06-valley-north': { zh: '河谷川地', en: 'River Valley' },
  'bf06-valley-south': { zh: '河谷川地', en: 'River Valley' },
  'bf07-taihang': { zh: '北方山丘', en: 'Northern Hills' },
  'bf07-rolling-hills': { zh: '北方山丘', en: 'Northern Hills' },
  'bf08-south-hills': { zh: '南方丘陵', en: 'Southern Hills' },
  'bf09-gorge': { zh: '峡谷栈道', en: 'Gorge Plank Road' },
  'bf09-three-gorges': { zh: '峡谷栈道', en: 'Gorge Plank Road' },
  'bf10-mountain-pass': { zh: '雄关隘口', en: 'Mountain Pass' },
};

export function routeKey(a: string, b: string): string {
  return [a, b].sort().join('--');
}

/**
 * The battlefield for an attack that marched along `routeCityIds` (source first,
 * target last). Only the last leg counts; a missing route falls back to the
 * open plain so a battle can always start.
 */
export function selectCampaignBattlefield(routeCityIds: readonly string[]): string {
  const target = routeCityIds.at(-1) ?? '';
  const from = routeCityIds.at(-2) ?? '';
  return (
    DIRECTION_OVERRIDES[`${target}<-${from}`] ??
    ROUTE_BATTLEFIELD[routeKey(from, target)] ??
    'bf01-north-plain'
  );
}

export function battlefieldName(id: string | undefined, locale: 'en' | 'zh'): string | undefined {
  return id ? BATTLEFIELD_NAMES[id]?.[locale] : undefined;
}
