/** Regional art direction, not a replacement for the saved tactical terrain grid.
 * Sources and historical limits: docs/assets/battlefield-art.md.
 */
export type Landscape = 'alluvial' | 'dry' | 'basin' | 'highland' | 'southern';
interface Geography {
  landscape: Landscape;
  en: string;
  zh: string;
}
const regions: Record<string, Geography> = {
  tianshui: { landscape: 'dry', en: 'Wei valley · loess slopes', zh: '渭河谷地 · 黄土丘陵' },
  changan: { landscape: 'dry', en: 'Guanzhong · Wei River plain', zh: '关中 · 渭河平原' },
  luoyang: {
    landscape: 'alluvial',
    en: 'Yi–Luo basin · river terraces',
    zh: '伊洛盆地 · 河谷台地',
  },
  jinyang: { landscape: 'dry', en: 'Fen River basin · valley fields', zh: '汾河盆地 · 河谷田野' },
  ye: { landscape: 'alluvial', en: 'Zhang River plain · open fields', zh: '漳河平原 · 开阔田野' },
  beiping: {
    landscape: 'dry',
    en: 'Northern frontier · plains and foothills',
    zh: '北方边地 · 平原山麓',
  },
  pingyuan: {
    landscape: 'alluvial',
    en: 'Hebei–Shandong plain · open fields',
    zh: '冀鲁平原 · 开阔田野',
  },
  beihai: { landscape: 'alluvial', en: 'Shandong · plains and low hills', zh: '山东 · 平原低丘' },
  puyang: { landscape: 'alluvial', en: 'Central plain · alluvial lowlands', zh: '中原 · 冲积平原' },
  chenliu: { landscape: 'alluvial', en: 'Central plain · open farmland', zh: '中原 · 开阔农田' },
  xuchang: { landscape: 'alluvial', en: 'Ying River basin · farmland', zh: '颍河流域 · 平原农田' },
  xiapi: { landscape: 'alluvial', en: 'Yi–Si lowlands · river plain', zh: '沂泗低地 · 河流平原' },
  shouchun: { landscape: 'southern', en: 'Huai River · lowland banks', zh: '淮河 · 低地河岸' },
  jianye: {
    landscape: 'southern',
    en: 'Lower Yangtze · riverbanks and hills',
    zh: '长江下游 · 河岸丘陵',
  },
  wu: { landscape: 'southern', en: 'Taihu plain · lowland waterways', zh: '太湖平原 · 低地水网' },
  chaisang: {
    landscape: 'southern',
    en: 'Yangtze–Poyang region · banks and hills',
    zh: '长江鄱阳湖地区 · 河岸丘陵',
  },
  jiangxia: {
    landscape: 'southern',
    en: 'Middle Yangtze · river lowlands',
    zh: '长江中游 · 河流低地',
  },
  xiangyang: {
    landscape: 'basin',
    en: 'Han River valley · terraces and groves',
    zh: '汉水谷地 · 台地林地',
  },
  wancheng: {
    landscape: 'basin',
    en: 'Nanyang basin · fields and groves',
    zh: '南阳盆地 · 田野林地',
  },
  hanzhong: {
    landscape: 'highland',
    en: 'Upper Han valley · Qinling–Daba ridges',
    zh: '汉水上游 · 秦巴山间谷地',
  },
  zitong: {
    landscape: 'highland',
    en: 'Northern Sichuan · wooded foothills',
    zh: '川北 · 林木山麓',
  },
  chengdu: {
    landscape: 'basin',
    en: 'Chengdu plain · farmland and groves',
    zh: '成都平原 · 农田林地',
  },
  jiangzhou: {
    landscape: 'highland',
    en: 'Yangtze–Jialing region · river hills',
    zh: '长江嘉陵江地区 · 河谷山丘',
  },
  jiangling: {
    landscape: 'southern',
    en: 'Jianghan plain · Yangtze lowlands',
    zh: '江汉平原 · 长江低地',
  },
};
export const battleGeography = (cityId: string): Geography =>
  regions[cityId] ?? { landscape: 'alluvial', en: 'Fields and foothills', zh: '田野山麓' };
