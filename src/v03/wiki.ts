export type V03Locale = 'en' | 'zh';
export type V03WikiTopic =
  | 'overview'
  | 'calendar'
  | 'movement'
  | 'units'
  | 'battle'
  | 'water'
  | 'governance'
  | 'requisition';

export interface V03WikiArticle {
  id: V03WikiTopic;
  title: string;
  sections: { heading: string; body: string[] }[];
}

const ENGLISH: readonly V03WikiArticle[] = [
  {
    id: 'overview',
    title: 'Getting started',
    sections: [
      {
        heading: 'Your first campaign',
        body: [
          'Choose a ruler and scenario, then use the campaign map to inspect cities and routes. Select a city to read its owner, governor, garrison, food, and gold.',
          'A ruler directly administers the capital. Other cities are run by their governor or local steward. You can request resources and issue a campaign order for those cities, then take command yourself when a battle begins.',
          'Time advances only when you choose one day, ten days, or the next visible event. Reading reports, opening the wiki, or changing the map view never advances the calendar.',
        ],
      },
    ],
  },
  {
    id: 'calendar',
    title: 'Calendar and time',
    sections: [
      {
        heading: 'A 30-day month',
        body: [
          'The simulation advances one day at a time. Every month is an abstract 30 days and every year has 12 months. Monthly income, upkeep, and administration changes settle once at the month boundary.',
          'A ten-day advance is the same as choosing one day ten times when no event pauses the game. “Next event” stops at the next visible arrival, battle, deadline, or decision and has a safe maximum distance.',
          'An army that leaves on a day begins its journey that day. Arrival, battle, food charges, and month settlement use the same absolute-day clock, so a long march can cross several months.',
        ],
      },
    ],
  },
  {
    id: 'movement',
    title: 'Cities, routes, and travel',
    sections: [
      {
        heading: 'How travel time is estimated',
        body: [
          'The campaign map places cities using their historical regional anchors. The line distance is for reference; travel uses the estimated road route, terrain segments, and the slowest movement class in a mixed force.',
          'The Hanzhong–Chang’an route is currently estimated at roughly 425 road kilometres and 33 days for a normal mixed force. It is a documented design estimate, not a measured Han-era itinerary. Route details include the evidence grade and assumptions.',
          'Map zoom and city-marker size never change distance or arrival time. An order preview shows its route, estimated departure, arrival, and the supplies needed for the march and likely battle.',
        ],
      },
    ],
  },
  {
    id: 'units',
    title: 'Troop types',
    sections: [
      {
        heading: 'The field units',
        body: [
          'Infantry holds ground and provides a dependable line. Cavalry moves quickly and can exploit open flanks. Archers attack at range but need friendly troops to protect them.',
          'Guard, elite, and naval units remain in the starting roster. Naval is a troop label only: it does not unlock water movement or remove the shared water penalties.',
          'Unit strength depends on troop count, officer leadership, morale, status, and the actual terrain under the unit. A camp marker is an objective and gives no extra defensive bonus.',
        ],
      },
    ],
  },
  {
    id: 'battle',
    title: 'Battle controls',
    sections: [
      {
        heading: 'Move and attack',
        body: [
          'Select one of your units. Highlighted cells are legal destinations for its remaining movement; click one to move. Select an enemy inside the displayed attack range to attack it.',
          'A unit normally moves once and acts once per battle day. When your side has finished, end the battle day. Rivals then take their turn and the battle day resolves.',
          'A battle begins outside the destination city. This version has no walls, gates, siege weapons, climbing, or city-street battle phase. Field camps are ordinary terrain with a tactical objective overlay.',
          'Battle maps use a 24×20 logical grid. The angled painting is a view of that grid; it does not change movement distance, attack range, or terrain rules.',
          'Battles last at most 30 days. At the limit, the side with more surviving troops controls the field; ties go to the defender.',
        ],
      },
    ],
  },
  {
    id: 'water',
    title: 'Water combat',
    sections: [
      {
        heading: 'Crossing and fighting in water',
        body: [
          'Every troop type can enter and leave a passable water tile. A move that touches water costs more movement than a move across open ground. A cliff tile cannot be entered.',
          'While a unit stands on water, its attack damage is multiplied by 0.75 and incoming troop damage by 1.25. The same rule applies to infantry, cavalry, archers, guard, elite, and naval units. Moving back to land restores the normal modifiers.',
          'A unit on shore can attack a unit in water, and a unit in water can attack a shore unit, when the target is within normal weapon range. Water does not grant immunity.',
          'Strategic water routes still require a configured connection. Being allowed to wade through a battlefield water tile does not let an army cross any river or sea on the campaign map.',
        ],
      },
    ],
  },
  {
    id: 'governance',
    title: 'Governors and city control',
    sections: [
      {
        heading: 'Capital and autonomous cities',
        body: [
          'Your capital is directly ruled. You can manage its internal work. A city with a formal governor is autonomous; an unassigned city is maintained by local stewards. Neither gives you direct access to every officer and internal action.',
          'Appointing or dismissing a governor takes effect at the next monthly settlement. Repeated appointments cannot refresh a city’s monthly work or reset its commitments.',
          'Autonomy does not remove tactical command. If your forces enter a manual battle, you can still command your units regardless of which city sent them.',
        ],
      },
    ],
  },
  {
    id: 'requisition',
    title: 'Resource and campaign orders',
    sections: [
      {
        heading: 'Ask the governor for a plan',
        body: [
          'For an autonomous city, request gold, food, or troops for another friendly city, or direct it to prepare an army for a named destination. The governor checks available stock, previous commitments, minimum garrison, the route, and the requested deadline.',
          'The response lists what can be sent or fielded, what is missing, the earliest preparation date, and the estimated arrival date. If it cannot meet the full request, you choose to accept a smaller plan, wait for the full amount, or cancel.',
          'Accepting a plan reserves the resources. Dispatch creates a real journey with a saved route snapshot. Resources arrive only when the party reaches the destination; repeated confirmation cannot create a second shipment.',
          'A destination that changes hands, a blocked route, or a full storehouse is reported and handled explicitly. Resources are not teleported back or silently discarded.',
        ],
      },
    ],
  },
];

const CHINESE: readonly V03WikiArticle[] = [
  {
    id: 'overview',
    title: '新手入门',
    sections: [
      {
        heading: '开始一场战役',
        body: [
          '选择剧本和君主后，在大地图查看城市与路线。点选城市可查看归属、太守、守军、粮食和金钱。',
          '君主本城由玩家直辖。其他城市由太守或地方班底自治。玩家可以向辖城征调资源、下达出征命令；进入战斗后仍可亲自指挥。',
          '只有选择推进一日、十日或到下个可见事件时，时间才会前进。查看报告、打开 Wiki 或缩放地图都不会推进日历。',
        ],
      },
    ],
  },
  {
    id: 'calendar',
    title: '日历与时间',
    sections: [
      {
        heading: '每月抽象为三十日',
        body: [
          '世界按日推进，每月固定为抽象的三十日，每年十二个月。月收入、维持费用与治理变更只在月界结算一次。',
          '没有事件暂停时，推进十日等同于连续推进十次一日。“到下个事件”会停在下一个可见的抵达、战斗、期限或待决事项，并设有安全上限。',
          '部队离城当天开始行军。抵达、战斗、粮草扣除和月结使用同一绝对日，因此长途行军会跨越数月。',
        ],
      },
    ],
  },
  {
    id: 'movement',
    title: '城市、路线与行军',
    sections: [
      {
        heading: '行程如何估算',
        body: [
          '大地图城市使用历史区域锚点。直线距离仅供参考；实际行程按估算道路、路段地形以及混编部队中最慢的兵种计算。',
          '当前汉中—长安路线估计约四百二十五公里；普通混编部队约需三十三日。这是有记录的设计估算，并非汉末实测行程。路线详情会列出证据等级与假设。',
          '地图缩放和城市图标大小不会改变距离与抵达时间。下令预览会显示路线、预计出发与抵达时间，以及行军和预期战斗需要的粮草。',
        ],
      },
    ],
  },
  {
    id: 'units',
    title: '兵种',
    sections: [
      {
        heading: '战场部队',
        body: [
          '步兵稳定守线。骑兵机动较快，适合利用开阔侧翼。弓兵可以远程攻击，但需要友军保护。',
          '开局名册仍保留护卫、精锐和水兵。水兵只是兵种标签，不再解锁下水，也不免除统一水上惩罚。',
          '部队战力受兵力、将领统率、士气、状态以及脚下真实地形影响。营地只是战术目标标记，不额外提供防御加成。',
        ],
      },
    ],
  },
  {
    id: 'battle',
    title: '战斗操作',
    sections: [
      {
        heading: '移动与攻击',
        body: [
          '先选择己方部队。高亮格为当前可到达位置；点选一格即可移动。选择显示在攻击范围内的敌军即可发起攻击。',
          '每支部队通常每天可以移动一次并行动一次。己方完成操作后结束战斗日，随后由对手行动并结算本日战斗。',
          '战斗发生在目标城市外围。本版没有城墙、城门、攻城器、攀墙或城内巷战阶段。野战营地是普通地形上的战术目标。',
          '战场使用 24×20 逻辑格。斜俯视画面是这些格子的投影，不会改变移动距离、射程或地形规则。',
          '战斗最多持续三十日。到达期限时，剩余兵力较多的一方控制战场；双方兵力相同时由守方获胜。',
        ],
      },
    ],
  },
  {
    id: 'water',
    title: '水战',
    sections: [
      {
        heading: '涉水与水上交战',
        body: [
          '所有兵种都可以进入和离开可通行水格。移动路径只要涉及水格，就比平地移动消耗更多行动力。峭壁不可进入。',
          '部队位于水格时，攻击伤害乘以 0.75，受到的兵力伤害乘以 1.25。步兵、骑兵、弓兵、护卫、精锐和水兵使用同一规则。上岸后恢复陆地规则。',
          '岸上与水上部队只要处于正常武器射程内就可以互相攻击；水域不会带来免疫。',
          '战略地图行军仍须有已配置的交通路线。允许战场涉水，不代表部队可以在大地图任意横渡江河或海域。',
        ],
      },
    ],
  },
  {
    id: 'governance',
    title: '太守与城市治理',
    sections: [
      {
        heading: '君主本城与自治城市',
        body: [
          '君主本城由玩家直接治理。正式任命太守的城市进入自治；没有正式太守的城市由地方班底维持。玩家不能直接逐项操控这些城市的武将和内政。',
          '任命或免职要等到下一个月界生效。反复任免不会刷新城市当月内政额度，也不会清除既有承诺。',
          '自治不影响临阵指挥。来自任何城市的部队进入手动战斗后，玩家仍可控制自己的部队。',
        ],
      },
    ],
  },
  {
    id: 'requisition',
    title: '征调资源与出征命令',
    sections: [
      {
        heading: '先看太守方案',
        body: [
          '玩家可以要求自治城市向另一座友城运送金、粮或兵，也可以命令太守为指定目标准备部队。太守会检查可用库存、已有承诺、最低留守兵力、路线和期限。',
          '答复会列明可交付或可出征数量、缺口、最早筹备日和预计抵达日。无法满足全部要求时，玩家选择接受缩减方案、等待足额筹备或取消。',
          '接受方案后资源进入预留。部队出发时生成带路线快照的真实行程，抵达后才交付；重复确认不会复制运输队。',
          '目的地易手、道路中断或仓库满额时会明确报告并处理；资源不会瞬间返回，也不会无声消失。',
        ],
      },
    ],
  },
];

const ARTICLES: Record<V03Locale, readonly V03WikiArticle[]> = { en: ENGLISH, zh: CHINESE };

export function getV03WikiArticles(locale: V03Locale): readonly V03WikiArticle[] {
  return ARTICLES[locale];
}

export function getV03WikiArticle(locale: V03Locale, topic: V03WikiTopic): V03WikiArticle {
  return ARTICLES[locale].find((article) => article.id === topic)!;
}
