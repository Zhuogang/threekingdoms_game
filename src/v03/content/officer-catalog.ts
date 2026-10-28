import type { TroopType } from './types';
import type { OfficerIdentity } from './officerIdentity';
import { OFFICER_HISTORY } from './officer-history';
import type { OfficerTimeline } from './officer-timeline';

export interface OfficerDefinition extends OfficerIdentity {
  id: string;
  /** Production manifest ID; differs from legacy runtime aliases for Ma Teng / Zu Mao. */
  portraitId: string;
  adultForce: number;
  adultIntellect: number;
  troopType: TroopType;
  isNew: boolean;
  timeline: OfficerTimeline;
}

type OfficerSeed = [
  id: string,
  name: string,
  chinese: string,
  surnameEn: string,
  surnameZh: string,
  portraitId: string,
  adultForce: number,
  adultIntellect: number,
  troopType: TroopType,
  isNew: boolean,
];

/** Shared identity and adult baselines; opening roles are configured explicitly, never by position. */
const SEEDS: OfficerSeed[] = [
  ['caocao', 'Cao Cao', '曹操', 'Cao', '曹', 'caocao', 82, 94, 'cavalry', false],
  ['xiahoudun', 'Xiahou Dun', '夏侯惇', 'Xiahou', '夏侯', 'xiahoudun', 91, 63, 'cavalry', false],
  ['xunyu', 'Xun Yu', '荀彧', 'Xun', '荀', 'xunyu', 38, 98, 'archer', false],
  ['caoren', 'Cao Ren', '曹仁', 'Cao', '曹', 'caoren', 86, 71, 'infantry', false],
  ['xiahouyuan', 'Xiahou Yuan', '夏侯渊', 'Xiahou', '夏侯', 'xiahouyuan', 89, 66, 'cavalry', false],
  ['chengyu', 'Cheng Yu', '程昱', 'Cheng', '程', 'chengyu', 56, 90, 'archer', false],
  ['yujin', 'Yu Jin', '于禁', 'Yu', '于', 'yujin', 80, 75, 'infantry', false],
  ['liubei', 'Liu Bei', '刘备', 'Liu', '刘', 'liubei', 77, 82, 'infantry', false],
  ['guanyu', 'Guan Yu', '关羽', 'Guan', '关', 'guanyu', 98, 79, 'cavalry', false],
  ['zhangfei', 'Zhang Fei', '张飞', 'Zhang', '张', 'zhangfei', 99, 42, 'cavalry', false],
  ['jianyong', 'Jian Yong', '简雍', 'Jian', '简', 'jianyong', 35, 81, 'archer', false],
  ['sunjian', 'Sun Jian', '孙坚', 'Sun', '孙', 'sunjian', 90, 78, 'infantry', false],
  ['sunce', 'Sun Ce', '孙策', 'Sun', '孙', 'sunce', 95, 76, 'cavalry', false],
  ['huanggai', 'Huang Gai', '黄盖', 'Huang', '黄', 'huanggai', 86, 73, 'infantry', false],
  ['chengpu', 'Cheng Pu', '程普', 'Cheng', '程', 'chengpu', 84, 80, 'infantry', false],
  ['handang', 'Han Dang', '韩当', 'Han', '韩', 'handang', 82, 68, 'archer', false],
  ['zuzhao', 'Zu Mao', '祖茂', 'Zu', '祖', 'zumao', 79, 55, 'infantry', false],
  ['yuanshao', 'Yuan Shao', '袁绍', 'Yuan', '袁', 'yuanshao', 70, 81, 'cavalry', false],
  ['yanliang', 'Yan Liang', '颜良', 'Yan', '颜', 'yanliang', 94, 47, 'cavalry', false],
  ['wenchou', 'Wen Chou', '文丑', 'Wen', '文', 'wenchou', 93, 48, 'cavalry', false],
  ['zhanghe', 'Zhang He', '张郃', 'Zhang', '张', 'zhanghe', 90, 82, 'cavalry', false],
  ['tianfeng', 'Tian Feng', '田丰', 'Tian', '田', 'tianfeng', 35, 95, 'archer', false],
  ['jushou', 'Ju Shou', '沮授', 'Ju', '沮', 'jushou', 46, 92, 'archer', false],
  ['guotu', 'Guo Tu', '郭图', 'Guo', '郭', 'guotu', 44, 80, 'infantry', false],
  ['dongzhuo', 'Dong Zhuo', '董卓', 'Dong', '董', 'dongzhuo', 85, 69, 'cavalry', false],
  ['lubu', 'Lü Bu', '吕布', 'Lü', '吕', 'lubu', 100, 32, 'cavalry', false],
  ['jiaxu', 'Jia Xu', '贾诩', 'Jia', '贾', 'jiaxu', 34, 98, 'archer', false],
  ['liru', 'Li Ru', '李儒', 'Li', '李', 'liru', 30, 93, 'archer', false],
  ['lijue', 'Li Jue', '李傕', 'Li', '李', 'lijue', 78, 49, 'cavalry', false],
  ['guosi', 'Guo Si', '郭汜', 'Guo', '郭', 'guosi', 77, 37, 'infantry', false],
  ['huaxiong', 'Hua Xiong', '华雄', 'Hua', '华', 'huaxiong', 90, 45, 'cavalry', false],
  ['zhangliao', 'Zhang Liao', '张辽', 'Zhang', '张', 'zhangliao', 94, 85, 'cavalry', false],
  ['liuyan', 'Liu Yan', '刘焉', 'Liu', '刘', 'liuyan', 47, 81, 'archer', false],
  ['liuzhang', 'Liu Zhang', '刘璋', 'Liu', '刘', 'liuzhang', 35, 58, 'infantry', false],
  ['zhangren', 'Zhang Ren', '张任', 'Zhang', '张', 'zhangren', 88, 78, 'archer', false],
  ['yanyan', 'Yan Yan', '严颜', 'Yan', '严', 'yanyan', 86, 72, 'archer', false],
  ['wuyi', 'Wu Yi', '吴懿', 'Wu', '吴', 'wuyi', 80, 73, 'infantry', false],
  ['huangquan', 'Huang Quan', '黄权', 'Huang', '黄', 'huangquan', 63, 86, 'archer', false],
  ['zhaoyun', 'Zhao Yun', '赵云', 'Zhao', '赵', 'zhaoyun', 97, 88, 'cavalry', false],
  ['taishici', 'Taishi Ci', '太史慈', 'Taishi', '太史', 'taishici', 94, 68, 'archer', false],
  ['dianwei', 'Dian Wei', '典韦', 'Dian', '典', 'dianwei', 97, 40, 'infantry', false],
  ['xuchu', 'Xu Chu', '许褚', 'Xu', '许', 'xuchu', 96, 35, 'infantry', false],
  ['xuhuang', 'Xu Huang', '徐晃', 'Xu', '徐', 'xuhuang', 91, 76, 'infantry', false],
  ['ganning', 'Gan Ning', '甘宁', 'Gan', '甘', 'ganning', 94, 74, 'infantry', false],
  ['huangzhong', 'Huang Zhong', '黄忠', 'Huang', '黄', 'huangzhong', 95, 70, 'archer', false],
  ['weiyan', 'Wei Yan', '魏延', 'Wei', '魏', 'weiyan', 92, 64, 'infantry', false],
  ['zhouyu', 'Zhou Yu', '周瑜', 'Zhou', '周', 'zhouyu', 74, 98, 'archer', false],
  ['lusu', 'Lu Su', '鲁肃', 'Lu', '鲁', 'lusu', 53, 94, 'archer', false],
  ['fazheng', 'Fa Zheng', '法正', 'Fa', '法', 'fazheng', 36, 93, 'archer', false],
  ['zhangsong', 'Zhang Song', '张松', 'Zhang', '张', 'zhangsong', 28, 89, 'archer', false],
  ['chenqun', 'Chen Qun', '陈群', 'Chen', '陈', 'chenqun', 30, 91, 'archer', false],
  ['maliang', 'Ma Teng', '马腾', 'Ma', '马', 'mateng', 87, 66, 'cavalry', false],
  ['machao', 'Ma Chao', '马超', 'Ma', '马', 'machao', 97, 44, 'cavalry', false],
  ['xunyou', 'Xun You', '荀攸', 'Xun', '荀', 'xunyou', 34, 96, 'infantry', true],
  ['guojia', 'Guo Jia', '郭嘉', 'Guo', '郭', 'guojia', 28, 97, 'archer', true],
  ['simayi', 'Sima Yi', '司马懿', 'Sima', '司马', 'simayi', 63, 97, 'infantry', true],
  ['caohong', 'Cao Hong', '曹洪', 'Cao', '曹', 'caohong', 81, 53, 'cavalry', true],
  ['yuejin', 'Yue Jin', '乐进', 'Yue', '乐', 'yuejin', 85, 59, 'infantry', true],
  ['lidian', 'Li Dian', '李典', 'Li', '李', 'lidian', 76, 79, 'infantry', true],
  ['pangde', 'Pang De', '庞德', 'Pang', '庞', 'pangde', 94, 69, 'cavalry', true],
  ['manchong', 'Man Chong', '满宠', 'Man', '满', 'manchong', 61, 84, 'infantry', true],
  ['caopi', 'Cao Pi', '曹丕', 'Cao', '曹', 'caopi', 68, 81, 'cavalry', true],
  ['caozhen', 'Cao Zhen', '曹真', 'Cao', '曹', 'caozhen', 83, 77, 'cavalry', true],
  ['dengai', 'Deng Ai', '邓艾', 'Deng', '邓', 'dengai', 82, 92, 'infantry', true],
  ['simashi', 'Sima Shi', '司马师', 'Sima', '司马', 'simashi', 66, 88, 'infantry', true],
  ['caorui', 'Cao Rui', '曹叡', 'Cao', '曹', 'caorui', 52, 83, 'infantry', true],
  ['zhugeliang', 'Zhuge Liang', '诸葛亮', 'Zhuge', '诸葛', 'zhugeliang', 38, 100, 'infantry', true],
  ['pangtong', 'Pang Tong', '庞统', 'Pang', '庞', 'pangtong', 32, 98, 'archer', true],
  ['maliang_shu', 'Ma Liang', '马良', 'Ma', '马', 'maliang_shu', 28, 86, 'infantry', true],
  ['masu', 'Ma Su', '马谡', 'Ma', '马', 'masu', 55, 84, 'infantry', true],
  ['wangping', 'Wang Ping', '王平', 'Wang', '王', 'wangping', 79, 76, 'infantry', true],
  ['jiangwei', 'Jiang Wei', '姜维', 'Jiang', '姜', 'jiangwei', 89, 90, 'cavalry', true],
  ['jiangwan', 'Jiang Wan', '蒋琬', 'Jiang', '蒋', 'jiangwan', 30, 89, 'infantry', true],
  ['feiyi', 'Fei Yi', '费祎', 'Fei', '费', 'feiyi', 27, 91, 'infantry', true],
  ['liaohua', 'Liao Hua', '廖化', 'Liao', '廖', 'liaohua', 74, 66, 'infantry', true],
  ['guanping', 'Guan Ping', '关平', 'Guan', '关', 'guanping', 83, 65, 'cavalry', true],
  ['liushan', 'Liu Shan', '刘禅', 'Liu', '刘', 'liushan', 23, 38, 'infantry', true],
  ['sunquan', 'Sun Quan', '孙权', 'Sun', '孙', 'sunquan', 67, 83, 'infantry', true],
  ['zhangzhao', 'Zhang Zhao', '张昭', 'Zhang', '张', 'zhangzhao', 30, 89, 'infantry', true],
  ['lvmeng', 'Lü Meng', '吕蒙', 'Lü', '吕', 'lvmeng', 81, 87, 'infantry', true],
  ['luxun', 'Lu Xun', '陆逊', 'Lu', '陆', 'luxun', 69, 96, 'infantry', true],
  ['zhugejin', 'Zhuge Jin', '诸葛瑾', 'Zhuge', '诸葛', 'zhugejin', 32, 83, 'infantry', true],
  ['lingtong', 'Ling Tong', '凌统', 'Ling', '凌', 'lingtong', 89, 61, 'cavalry', true],
  ['zhoutai', 'Zhou Tai', '周泰', 'Zhou', '周', 'zhoutai', 91, 48, 'infantry', true],
  ['zhuran', 'Zhu Ran', '朱然', 'Zhu', '朱', 'zhuran', 75, 73, 'archer', true],
  ['xusheng', 'Xu Sheng', '徐盛', 'Xu', '徐', 'xusheng', 81, 76, 'archer', true],
  ['dingfeng', 'Ding Feng', '丁奉', 'Ding', '丁', 'dingfeng', 82, 71, 'infantry', true],
  ['zhugeke', 'Zhuge Ke', '诸葛恪', 'Zhuge', '诸葛', 'zhugeke', 42, 88, 'archer', true],
  ['gongsunzan', 'Gongsun Zan', '公孙瓒', 'Gongsun', '公孙', 'gongsunzan', 84, 68, 'cavalry', true],
  ['taoqian', 'Tao Qian', '陶谦', 'Tao', '陶', 'taoqian', 40, 67, 'infantry', true],
  ['liubiao', 'Liu Biao', '刘表', 'Liu', '刘', 'liubiao', 36, 76, 'infantry', true],
  ['yuanshu', 'Yuan Shu', '袁术', 'Yuan', '袁', 'yuanshu', 65, 59, 'cavalry', true],
  ['hansui', 'Han Sui', '韩遂', 'Han', '韩', 'hansui', 73, 78, 'cavalry', true],
  ['zhanglu', 'Zhang Lu', '张鲁', 'Zhang', '张', 'zhanglu', 32, 71, 'infantry', true],
  ['chengong', 'Chen Gong', '陈宫', 'Chen', '陈', 'chengong', 43, 92, 'archer', true],
  ['gaoshun', 'Gao Shun', '高顺', 'Gao', '高', 'gaoshun', 88, 73, 'infantry', true],
  ['kongrong', 'Kong Rong', '孔融', 'Kong', '孔', 'kongrong', 24, 80, 'infantry', true],
  ['xuyou', 'Xu You', '许攸', 'Xu', '许', 'xuyou', 25, 89, 'archer', true],
];

export const OFFICER_CATALOG: readonly OfficerDefinition[] = SEEDS.map(
  ([
    id,
    name,
    chinese,
    surnameEn,
    surnameZh,
    portraitId,
    adultForce,
    adultIntellect,
    troopType,
    isNew,
  ]) => {
    const timeline = OFFICER_HISTORY[id];
    if (!timeline) throw new Error('Missing officer history: ' + id);
    return {
      id,
      name,
      chinese,
      surnameEn,
      surnameZh,
      portraitKey: id,
      portraitId,
      adultForce,
      adultIntellect,
      troopType,
      isNew,
      timeline,
    };
  },
);

export const OFFICER_CATALOG_BY_ID: ReadonlyMap<string, OfficerDefinition> = new Map(
  OFFICER_CATALOG.map((officer) => [officer.id, officer]),
);
