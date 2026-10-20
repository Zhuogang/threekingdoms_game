/** Officer traits are content, not saved state: they follow the officer, never the banner. */
export type Trait = 'benevolent' | 'fierce' | 'cunning' | 'loyal' | 'greedy';

export const TRAIT_INFO: Record<Trait, { name: string; chinese: string; description: string }> = {
  benevolent: {
    name: 'Benevolent',
    chinese: '仁德',
    description:
      'Persuades with +8% odds, but loses 8 loyalty when a city they serve in is plundered.',
  },
  fierce: {
    name: 'Fierce',
    chinese: '勇猛',
    description: 'Counterattacks hit 10% harder.',
  },
  cunning: {
    name: 'Cunning',
    chinese: '智谋',
    description: 'Every tactic they cast costs 1 less tactic point (never below 1).',
  },
  loyal: {
    name: 'Loyal',
    chinese: '忠义',
    description:
      'Persuasion against them is half as likely, and they never leave in January or July.',
  },
  greedy: {
    name: 'Greedy',
    chinese: '贪婪',
    description: 'When they lead a plunder, raid or sack, the gold taken rises by 20%.',
  },
};

export const OFFICER_TRAITS: Record<string, Trait[]> = {
  caocao: ['cunning'],
  xiahoudun: ['fierce', 'loyal'],
  xunyu: ['cunning', 'loyal'],
  caoren: ['loyal'],
  xiahouyuan: ['fierce'],
  chengyu: ['cunning', 'greedy'],
  yujin: ['loyal'],
  liubei: ['benevolent', 'loyal'],
  guanyu: ['fierce', 'loyal'],
  zhangfei: ['fierce'],
  jianyong: ['benevolent'],
  sunjian: ['fierce'],
  sunce: ['fierce'],
  huanggai: ['fierce', 'loyal'],
  chengpu: ['loyal'],
  handang: ['fierce'],
  zuzhao: ['loyal'],
  yuanshao: ['greedy'],
  yanliang: ['fierce'],
  wenchou: ['fierce'],
  zhanghe: ['cunning', 'fierce'],
  tianfeng: ['cunning', 'loyal'],
  jushou: ['cunning', 'loyal'],
  guotu: ['cunning', 'greedy'],
  dongzhuo: ['greedy', 'fierce'],
  lubu: ['fierce', 'greedy'],
  jiaxu: ['cunning'],
  liru: ['cunning', 'greedy'],
  lijue: ['greedy'],
  guosi: ['greedy'],
  huaxiong: ['fierce'],
  zhangliao: ['fierce', 'loyal'],
  liuyan: ['benevolent'],
  liuzhang: ['benevolent'],
  zhangren: ['fierce', 'loyal'],
  yanyan: ['fierce', 'loyal'],
  wuyi: ['loyal'],
  huangquan: ['cunning', 'loyal'],
  zhaoyun: ['fierce', 'loyal'],
  taishici: ['fierce', 'loyal'],
  dianwei: ['fierce', 'loyal'],
  xuchu: ['fierce', 'loyal'],
  xuhuang: ['loyal'],
  ganning: ['fierce', 'greedy'],
  huangzhong: ['fierce'],
  weiyan: ['fierce'],
  zhouyu: ['cunning'],
  lusu: ['benevolent', 'cunning'],
  fazheng: ['cunning'],
  zhangsong: ['cunning', 'greedy'],
  chenqun: ['benevolent'],
  maliang: ['fierce'],
};

export const traitsOf = (officerId: string): readonly Trait[] => OFFICER_TRAITS[officerId] ?? [];
export const hasTrait = (officerId: string, trait: Trait): boolean =>
  traitsOf(officerId).includes(trait);
