export type V03Locale = 'en' | 'zh';
export type V03WikiTopic =
  | 'overview'
  | 'calendar'
  | 'movement'
  | 'units'
  | 'battle'
  | 'water'
  | 'governance'
  | 'requisition'
  | 'diplomacy';

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
          "Battles are fought on a 48×32 top-down grid; drag to pan and scroll to zoom. The attacker's last route leg picks the battlefield, so the same road always leads to the same field. The painting illustrates the grid: each cell counts as plain, forest, hill, water, or cliff, and inspecting a cell shows which. Painted walls are impassable like cliffs, and their gates are open ground.",
          'Battles last at most 30 days. At the limit, the side with more surviving troops controls the field; ties go to the defender.',
          'Six tactics are available when their officer and terrain requirements are met: Fire, Confuse, Rally, Raid Supplies, Ambush, and Rockfall. Tactic points regenerate by 2 each battle day. Costs, range, target rules, chance, casualties, morale, and supply effects are shown in the tactic panel before you commit; those forecasts use the same rules as resolution.',
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
          'At the capital, one staffed monthly work point can reward an officer for 100 gold and up to 15 loyalty, issue fine arms for 180 gold and up to 5 force (force limit 105), or relieve the people for 80 gold and 600 food to add up to 15 city loyalty and 300 population. Governors can choose these actions from their own city budget and work points; committed resources remain protected.',
          'Recruit → assign → march: recruitment adds soldiers to the city reserve, not an officer’s army. Set an officer’s troop count and assign those reserve soldiers before preparing a march. Open City affairs, choose one task, then confirm; completion returns to affairs. For assignment, training, rewards or equipment, open Officers in the city, choose one officer and one order; completion returns to their details. Escape returns one level without executing an unconfirmed order. Disabled actions explain their work-point, stock, commitment or attribute limit.',
          'Click a city on the map, then March out. Choose the officers who will march, a destination and provisions, then Confirm march to return to the map. Their complete forces determine the army total; provisions default to outbound travel, battle and return. Capital armies depart directly. Governor cities keep their accept/reduce/wait/cancel proposal flow, minimum garrison and protected commitments.',
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
  {
    id: 'diplomacy',
    title: 'Diplomacy and alliances',
    sections: [
      {
        heading: 'Six-month treaties',
        body: [
          'Alliance proposals use the ruler’s intellect: the base chance is 40 plus half of that intellect, with a 5–90% limit. Offering to unite against the strongest house can add 20 points; proposing to the strongest house removes 30. Breaking an alliance reduces your chance for the next twelve months.',
          'A successful treaty lasts six campaign months and prevents both houses from attacking one another. Campaigns already on the road turn back at the next safe route decision. Breaking a treaty takes effect immediately.',
          'If the anti-Dong coalition forms, a non-Dong player can accept its invitation to join six-month treaties with its surviving members. The invitation expires after three months.',
          'Holding Luoyang and at least sixteen cities at every monthly boundary for twelve consecutive months proclaims a Hegemon. Rival claims are reported when they begin and when three months remain. This is separate from capturing every city for unification.',
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
          '战场是 48×32 的正俯视方格，可以拖动平移、滚轮缩放。打哪张战场由进攻方最后一段路线决定，同一条路每次都打同一张图。画面只是格子的插画：每格算平原、森林、丘陵、水还是峭壁，检查格子即可看到。画里的城墙和峭壁一样不能通行，城门是普通地面。',
          '战斗最多持续三十日。到达期限时，剩余兵力较多的一方控制战场；双方兵力相同时由守方获胜。',
          '武将满足能力和地形条件时可用六种计策：火计、混乱、鼓舞、劫粮、伏兵和落石。每个战斗日回复 2 点计策点。计策面板会在使用前显示消耗、射程、目标条件、概率、伤亡、士气与粮草效果；预览与实际结算使用同一套规则。',
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
          '君主本城每个驻城武将每月提供一个工作点（最多 3 点）：可花 100 金赏赐武将（忠诚最多 +15）、花 180 金配发精良兵器（武力最多 +5，上限 105），或花 80 金与 600 粮赈济百姓（民心最多 +15、人口 +300）。太守也可在自身城市预算与工作点内决定这些动作，已承诺的资源会保留。',
          '征募 → 分配 → 出征：征募先增加城市预备兵，不会直接增加武将带兵。设定武将带兵数并从预备兵分配后，再准备出征。城务中选择一项事务并确认，完成后回到城务菜单。配兵、训练、赏赐和装备从驻城武将中选人，再进入单项操作页，完成后回到该武将详情。Esc 逐层返回，未确认的命令不会执行。不可用的行动会说明工作点、库存、已有承诺或属性上限的限制。',
          '点击地图上的城池，再点出征。选择随军武将、目标与军粮，确认出征后返回地图查看行军。以完整所部合计兵力；军粮默认包含去程、战斗及返程。君主本城直接出发，太守城市保留接受、缩减、等待与取消的方案流程，并保护最低留守兵力及已有承诺。',
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
  {
    id: 'diplomacy',
    title: '外交與同盟',
    sections: [
      {
        heading: '六個月盟約',
        body: [
          '同盟提議以君主智力計算：基礎概率為 40 加上智力的一半，並限制在 5%–90%。共同對抗最強勢力可加 20 點；向最強勢力提議則減 30 點。解除同盟後十二個月內，提議成功率會降低。',
          '成功的同盟持續六個戰役月，雙方不能互相攻擊。已在途的出征隊會在下一個安全路線節點返程。解除同盟立即生效。',
          '討伐董卓聯盟成立時，非董卓玩家可以接受邀請，與仍存續的盟友締結六個月同盟。邀請三個月後失效。',
          '在每個月界都控制洛陽與至少十六座城市，連續維持十二個月即可稱霸。若敵方開始稱霸，遊戲會在進度開始與剩餘三個月時發出警告。稱霸與攻取全部城市、天下一統是不同勝利條件。',
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
