import type { City, Faction, Officer } from './types';

/**
 * 200 CE, the eve of Guandu: Cao Cao holds the emperor and the central plains, Yuan Shao the
 * whole north. It reuses the same atlas and the same fifty-two officers as the 190 scenario, plus
 * Ma Chao; otherwise only who owns what — and who has already died — changes. (This file must not import
 * `scenario.ts`: the registry there calls `buildGuandu` while it is being built.)
 */
export interface GuanduBase {
  cities: City[];
  officers: Officer[];
  /** Officers who exist only in this scenario, appended after the shared roster. */
  extraOfficers: Officer[];
  factions: Faction[];
}

const OWNER: Record<string, string | null> = {
  xuchang: 'cao',
  chenliu: 'cao',
  puyang: 'cao',
  xiapi: 'cao',
  luoyang: 'cao',
  ye: 'yuan',
  jinyang: 'yuan',
  beiping: 'yuan',
  pingyuan: 'yuan',
  beihai: 'yuan',
  wancheng: 'liu',
  jianye: 'sun',
  wu: 'sun',
  chaisang: 'sun',
  shouchun: 'sun',
  tianshui: 'ma',
  changan: 'ma',
  chengdu: 'yan',
  zitong: 'yan',
  jiangzhou: 'yan',
  hanzhong: 'yan',
  xiangyang: null,
  jiangling: null,
  jiangxia: null,
};

/** [faction, city] for officers who serve or wander in 200 CE. */
const PLACEMENT: Record<string, [string | null, string]> = {
  caocao: ['cao', 'xuchang'],
  xunyu: ['cao', 'xuchang'],
  xuchu: ['cao', 'xuchang'],
  jiaxu: ['cao', 'xuchang'],
  chenqun: ['cao', 'xuchang'],
  xiahoudun: ['cao', 'puyang'],
  chengyu: ['cao', 'puyang'],
  yujin: ['cao', 'xiapi'],
  caoren: ['cao', 'chenliu'],
  xiahouyuan: ['cao', 'chenliu'],
  zhangliao: ['cao', 'luoyang'],
  xuhuang: ['cao', 'luoyang'],
  yuanshao: ['yuan', 'ye'],
  tianfeng: ['yuan', 'ye'],
  yanliang: ['yuan', 'ye'],
  wenchou: ['yuan', 'jinyang'],
  jushou: ['yuan', 'jinyang'],
  zhanghe: ['yuan', 'beihai'],
  guotu: ['yuan', 'beihai'],
  liubei: ['liu', 'wancheng'],
  guanyu: ['liu', 'wancheng'],
  zhangfei: ['liu', 'wancheng'],
  jianyong: ['liu', 'wancheng'],
  sunce: ['sun', 'jianye'],
  zhouyu: ['sun', 'jianye'],
  chengpu: ['sun', 'wu'],
  handang: ['sun', 'wu'],
  taishici: ['sun', 'wu'],
  huanggai: ['sun', 'chaisang'],
  lusu: ['sun', 'chaisang'],
  zuzhao: ['sun', 'shouchun'],
  maliang: ['ma', 'tianshui'],
  machao: ['ma', 'changan'],
  liuzhang: ['yan', 'chengdu'],
  fazheng: ['yan', 'chengdu'],
  zhangren: ['yan', 'zitong'],
  zhangsong: ['yan', 'zitong'],
  yanyan: ['yan', 'jiangzhou'],
  wuyi: ['yan', 'hanzhong'],
  huangquan: ['yan', 'hanzhong'],
  huangzhong: [null, 'xiangyang'],
  weiyan: [null, 'jiangling'],
  ganning: [null, 'jiangxia'],
  zhaoyun: [null, 'beiping'],
};

/** Those who had already died by 200 CE rest in the roster, inert. */
const DECEASED = new Set([
  'dongzhuo',
  'liru',
  'huaxiong',
  'lubu',
  'lijue',
  'guosi',
  'sunjian',
  'dianwei',
  'liuyan',
]);

const FACTIONS_200: Faction[] = [
  {
    id: 'cao',
    name: 'Cao Cao',
    chinese: '曹',
    leader: 'Cao Cao',
    color: '#53778d',
    motto: 'Strike while the enemy is stretched',
    description:
      'Master of the central plains with the emperor in his camp, facing the largest army in the realm along the Yellow River.',
    difficulty: 'Challenging',
  },
  {
    id: 'yuan',
    name: 'Yuan Shao',
    chinese: '袁',
    leader: 'Yuan Shao',
    color: '#93824b',
    motto: 'Numbers win wars',
    description:
      'Lord of the whole north with four provinces and a vast host. Press the advantage before Cao Cao can consolidate.',
    difficulty: 'Approachable',
  },
  {
    id: 'liu',
    name: 'Liu Bei',
    chinese: '刘',
    leader: 'Liu Bei',
    color: '#577b5d',
    motto: 'Virtue above ambition',
    description:
      'A hunted guest with a single city, yet his oath brothers fight like armies. Survive the giants, and the realm may still turn.',
    difficulty: 'Challenging',
  },
  {
    id: 'sun',
    name: 'Sun Ce',
    chinese: '孙',
    leader: 'Sun Ce',
    color: '#b06443',
    motto: 'The Little Conqueror',
    description:
      'The young conqueror of Jiangdong, with his brilliant friend Zhou Yu at his side. The rivers are yours to command.',
    difficulty: 'Balanced',
  },
  {
    id: 'yan',
    name: 'Liu Zhang',
    chinese: '蜀',
    leader: 'Liu Zhang',
    color: '#827399',
    motto: 'Beyond the mountain gates',
    description:
      'A gentle ruler behind the western mountains, surrounded by advisers who see further than he does.',
    difficulty: 'Approachable',
  },
  {
    id: 'ma',
    name: 'Ma Teng',
    chinese: '马',
    leader: 'Ma Teng',
    color: '#8a6f3e',
    motto: 'Riders of the west',
    description:
      'Cavalry lord of Liang, with Tianshui and Chang’an as his walls. A small realm, and a fast one.',
    difficulty: 'Challenging',
  },
];

export function buildGuandu(base: GuanduBase) {
  const cities: City[] = base.cities.map((city) => {
    const factionId = OWNER[city.id] ?? null;
    return {
      ...city,
      neighbors: [...city.neighbors],
      factionId,
      defense: factionId ? city.defense + 5 : 15,
      loyalty: 72,
      gold: factionId ? 1600 : 650,
      food: factionId ? 14000 : 6000,
      reserve: factionId ? 1200 : 600,
      governorId: null,
    };
  });
  const officers: Officer[] = [...base.officers, ...base.extraOfficers].map((officer, index) => {
    const dead = DECEASED.has(officer.id);
    const [factionId, cityId] = dead
      ? [null, officer.cityId]
      : (PLACEMENT[officer.id] ?? [null, officer.cityId]);
    const lone = officer.id === 'maliang';
    return {
      ...officer,
      factionId,
      cityId,
      age: officer.age + 10,
      loyalty: 88,
      troops: dead || !factionId ? 0 : lone ? 2000 : 700 + (index % 4) * 100,
      fate: dead ? ('deceased' as const) : ('active' as const),
    };
  });
  for (const city of cities)
    city.governorId =
      officers.find(
        (o) =>
          o.cityId === city.id &&
          o.factionId === city.factionId &&
          o.factionId !== null &&
          o.fate === 'active',
      )?.id ?? null;
  return {
    id: 'guandu-200',
    title: 'The eve of Guandu',
    year: 200,
    description:
      'Cao Cao guards the emperor and the heartland; Yuan Shao commands the north and marches south. Between the giants, smaller banners wait for their chance.',
    factions: FACTIONS_200,
    cities,
    officers,
  };
}
