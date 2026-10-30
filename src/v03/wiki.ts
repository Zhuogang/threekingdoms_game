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
  | 'diplomacy'
  | 'rivals';

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
          'The simulation advances one day at a time. Every month is an abstract 30 days and every year has 12 months. Monthly income and upkeep settle once at the month boundary.',
          'A ten-day advance is the same as choosing one day ten times when no event pauses the game. “Next event” stops at the next visible arrival, battle, deadline, or decision and has a safe maximum distance. It also stops on the day a rival army departs toward one of your cities; that army is drawn in red with its arrival countdown. Every advance says why and when it stopped. While you command a battle, only battle reports (a new battle or a result) hold up the battle day; other reports wait in the inbox until the field is quiet. Shortcuts outside text fields: Space one day, Shift+Space ten days, N next event, I inbox, O orders, C capital, D diplomacy; in battle A attacks, W waits, E ends the day and Esc steps back.',
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
          'Infantry, cavalry and archers remain the three base troop types. Soldier level is independent of officer level: levels 1–10 use ordinary art; levels 11–20 use heavy infantry, elite cavalry or strong archers. Below 500 troops uses small squads; 500 or more uses large formations. On water, the approved naval commanders use tower warships and others use crewed boats, regardless of soldier level or size.',
          'The officer detail and battlefield show soldier level, mean XP and XP to the next level. New recruits have zero XP; reinforcement mixes experience by headcount and can downgrade an elite force. The assignment preview shows both formations, counts, levels and experience before confirmation. Veterans returning to the matching reserve pool retain their experience.',
          'Survivors that caused or received combat casualties gain 40 participation XP, up to 80 damage XP relative to starting troop count, and 20 victory XP after battle; each battle awards at most 140 and total XP is capped at 1900. Each level above 1 adds 2% normal/counterattack damage and reduces incoming normal/counterattack damage by 1%; tactics receive no level multiplier. Growth reports preserve each original contingent’s XP and level change, promotion, or annihilation even after later reinforcement.',
          'Unit strength depends on troop count, officer leadership, morale, status, and the actual terrain under the unit.',
          'Each officer commands one base type. Healthy and attached wounded share a 10,000-person cap. Effective combat loss becomes 60% wounded and 40% permanent loss; zero healthy means defeated, while zero healthy and wounded means annihilation. Wounded retain XP but cannot act or heal on the field. Starvation losses are permanent.',
          'Existing wounded automatically stay in the departure city with their own source and XP. Each full supplied city day heals 10% per city/type group, rounded up: 3,000 heals 300 first and about 90% over 22 effective days. Travel and outside waiting give no treatment. Rear veterans rejoin their original officer only in the same city, under the same house, when available and within capacity; otherwise they remain a separate source.',
          'All military personnel consume food, including reserves, rear veterans, wounded and captives; cavalry counts twice. Expand Personnel, recovery & disbanding under Military on the city page or in officer details to review upkeep and disband selected soldiers without a work point. Returning the whole contingent uses no work points in any city; wounded stay in city care and still eat.',
          'Recruitment draws people from the city’s population. Infantry costs 200 gold and archers 350 for a force-based batch; cavalry costs 400 / 500 / 600 gold in the north / centre / south for 60% / 50% / 40% of the infantry headcount. At force 70 a cavalry soldier costs about 1.0 / 1.5 / 2.3 gold against 0.3 for infantry, and still eats double.',
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
          'A successful manual move opens the unit action menu: Attack, Tactics, Wait or Close. Attack and tactic selection return you to the highlighted map targets before executing. Close keeps the move and remaining action; select the moved unit to reopen the menu. Unavailable options explain their restrictions.',
          'A battle begins outside the destination city. This version has no walls, gates, siege weapons, climbing, or city-street battle phase. Battles end through defeat, withdrawal or the day limit.',
          "Battles are fought on a 48×32 top-down grid; drag to pan and scroll to zoom. The attacker's last route leg picks the battlefield, so the same road always leads to the same field. The painting illustrates the grid: each cell counts as plain, forest, hill, water, or cliff, and inspecting a cell shows which. Painted walls are impassable like cliffs, and their gates are open ground.",
          'Battles last at most 30 days, raids 14. At the limit, the side with more surviving troops controls the field; ties go to the defender. The header shows who would win if time ran out now.',
          'Armies deploy about 15 columns apart and usually meet within two or three days. A formation next to an enemy is pinned and cannot move, except that a routed formation may take one step to a free neighbouring cell to break contact.',
          'Morale starts at 80. A fed formation that lost no troops during a battle day regains 5 morale at the next dawn, up to 80; a side that cannot pay its daily rations does not recover. Below 40 a formation wavers (−15% damage, no tactics); below 20 it routs and can only move or hold. When every formation of a side has routed, that side loses.',
          'Six tactics are available when their officer and terrain requirements are met: Fire, Confuse, Rally, Raid Supplies, Ambush, and Rockfall. Tactic points regenerate by 2 each battle day; Rally costs 3. Fire outdamages an ordinary hit on a forest target or, for a much cleverer caster, in Wind, and draws no counterattack; Rockfall from a hill adds a morale blow and still works in rain. Costs, range, target rules, chance, casualties, morale, and supply effects are shown in the tactic panel before you commit; those forecasts use the same rules as resolution.',
          'Confuse skips exactly the next activation, including a routed unit’s move or hold. It works even after the target has acted today, persists across days, and does not stack. Rally clears confusion and restores morale; its +20% bonus lasts until one normal attack, counterattack or Ambush hit. Fire and Rockfall neither use nor consume the bonus. Repeated Rally refreshes one bonus without stacking.',
          'Nothing is selected for you: click a formation, then a green cell. The move stays provisional until the formation acts, and Esc or right-click takes it back; clicking open ground lets go of the formation. Click the selected formation again to give orders where it stands. Choose Attack (A) to show its red range, then click a target inside it; clicking an enemy otherwise only shows its details. While choosing an attack, each target in range shows what you deal, what you take back, its morale afterwards and whether it routs or is destroyed. Hovering a green cell rings the enemies you could strike from there. After you end the day, the enemy turn replays on the map (Esc or Skip jumps to the end) and a summary lists attacks, your losses and any formation that wavers or routs.',
          'Rival commanders fight in character: a leader with far more force than intellect, or a fierce one, presses forward and accepts more risk; a clever leader holds ground and spends tactic points more readily. The log says when the enemy army changes posture. Auto-command never withdraws your army: when your officers would withdraw, it turns itself off and asks you to take command or withdraw.',
          'Withdraw army concedes the whole battle without requiring a selected unit. With a route, capture risk is 0% before engagement, 5% per officer after engagement and 25% for forced defeat or rout. Officers roll independently; confirmation also shows the risk of any capture. No refuge route means surrender. Cancel changes neither state nor RNG. Orderly escape retains all survivors; forced escape retains all healthy and two thirds of field wounded. Losing defenders use the same rules and actual return journeys.',
          'A returning party stranded at a hostile city surrenders once its house has no cities, active campaigns or battles. Friendly, allied and independent destinations do not trigger this rule, and an active battle at the destination delays settlement. Officers retain their healthy and wounded contingents in captivity. The receiving city takes the remaining cargo; any goods that cannot fit stay outside awaiting warehouse space. Houses with a surviving city or campaign can still seek refuge.',
          'Captured officers retain their field army; old rear wounded do not follow their change of house. Successful recruitment requires ten supplied city days of army reorganization before fighting or troop requisition, with healing alongside it. Ordinary relocation preserves the remaining reorganization days and pauses them in transit. Release and exchange use real return journeys and available holding-city food. With no reachable home, release frees the officer and disbands the contingent. Recruitment/exchange attempts are monthly, including both sides of a refused exchange; release or execution remain available afterward. Execution disbands the army. Captured rulers are succeeded immediately; successful recruitment then lowers the former house’s remaining living officers and owned cities by 10 loyalty, floored at zero. Refusal or execution causes no loyalty loss. Surviving houses display their current ruler’s name. Rear stock disperses when its city falls.',
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
          'While a unit stands on water, its attack damage is multiplied by 0.75 and incoming troop damage by 1.25. The same rule applies to infantry, cavalry and archers. Moving back to land restores the normal modifiers.',
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
          'Appointing an officer already in the city, or dismissing a governor, takes effect at once; a candidate from another city takes office on the day they arrive. Officers keep their contingents when taking office. Cross-city transfers carry healthy and wounded soldiers, preserve XP and reorganization, and provision outbound/return travel; treatment and reorganization pause in transit. Repeated appointments cannot refresh work points or reset commitments.',
          'For ordinary officers, open the source city’s page, Logistics → Transfer officers, check one or more officers and select another friendly city. Preview people, travel days and outbound/return provisions. Transfers use no work points, retain whole contingents and arrive as stationed officers without an appointment or monthly wait. Rulers, governors, pending appointees and committed officers are unavailable. Track travelling groups in Marches & orders.',
          'After confirming a conquest report, choose personal rule or a governor. Personal rule requires the ruler to be present and moves the ruler’s capital; the old capital returns to stewardship. Local candidates may immediately govern the newly captured city with their contingents. Remote candidates travel there and take office on arrival. Decide later keeps an Inbox task, including after reload; both cities retain stock, personnel and spent work.',
          'Every owned city gains two work points every ten game days, independent of staffing; unused points carry over up to six, one month’s worth, so skipping time loses nothing. Execution still requires a living local officer. Assignment, contingent returns, rewards and equipment use no work points. Rewards cost 100 gold for up to 15 loyalty; fine arms cost 180 gold for up to 5 force (limit 105). Relief costs one point, 80 gold and 600 food for up to 15 city loyalty and 1,500 population, about a year of tax to repay. Market trade buys or sells 2,000 food for 200 gold per point. Restore loyalty is retired: security is free and restores more. In your capital a task also occupies the officer who carries it out: development and training 10 days; recruiting, security, relief and searches 5; market trade 2. The effect lands at once; until the days pass that officer cannot take another capital task, but can still defend, march and change troops. Feasts, rewards, equipment and troop changes occupy no one. Governors and AI use the same work points (without task days) and protect committed resources. Capital moves and appointments preserve spent work.',
          'Recruit → assign → march: recruitment adds soldiers to the city reserve, not an officer’s army. Set an officer’s troop count and assign those reserve soldiers before preparing a march. The city window is one page: Military (march, directives, recruiting, reserves), Administration, Officers and Logistics list every operation directly, so scroll to the one you need. A task opens its review with the best-suited free officer; completion returns to the same place on the city page. For assignment or training, choose the officer on the city page; completion returns to their details. Escape returns one level without executing an unconfirmed order. Disabled actions explain their work-point, stock, commitment or attribute limit.',
          'Click a city on the map, then March out. Choose the officers who will march, a destination and provisions, then Confirm march to return to the map. Their complete forces determine the army total; provisions default to outbound travel, battle and return. Capital armies depart directly. Governor cities keep their accept/reduce/wait/cancel proposal flow, minimum garrison and protected commitments.',
          'Feasts allow checked local guests for one work point; only selected officers gain up to 8 loyalty. Rewards and fine arms support multiple recipients at 100 and 180 gold per officer, without work points. Select all includes eligible recipients. Review totals and actual gains before confirming; insufficient funds or an invalid recipient reject the whole order.',
          'Development costs 80 gold and one work point: farming gains up to 20, commerce up to 10, capped at 500. Preview shows the actual gain near the cap. Existing city values are not rescaled.',
          'Monthly tax is the existing base tax, rounded down, multiplied by (0.8 + city loyalty / 500), then rounded down again: 80–100% of base tax. Food and recruitment formulas are unchanged. Officer loyalty retains its succession and prisoner-decision roles; autonomy only considers rewards or feasts when a local officer is below 55 loyalty.',
          'Officers grow through deeds. Training adds 25 officer XP and no longer raises force by itself; officers who fight gain half their troops’ battle XP when the battle settles. Every 100 XP is a level (up to level 5 at 500 XP), and each level adds 2 force, or 2 intellect for archers, within the force cap of 100 (105 with fine arms). Training is unavailable at 500 XP or level 5; existing higher XP is preserved. Preview and feedback show actual gains.',
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
          'The proposal page lists every term of the acceptance chance. The base is 40 plus half of your ruler’s intellect. Both of you bordering the strongest house adds 20; proposing to the strongest house removes 30, and so does being the strongest house yourself. A house whose army is marching on you is 30 less willing. A benevolent ruler is 10 more willing and a fierce one 10 less. Breaking a treaty costs 30 on every offer for 24 months. While you hold two cities or fewer, offers gain 15. The result is limited to 5–90%.',
          'A successful treaty lasts six campaign months and prevents both houses from attacking one another. Campaigns between the two houses more than five days from their target turn back at the next safe route decision; closer armies press on and fight, so a treaty is no instant shield. Breaking a treaty takes effect immediately.',
          'If the anti-Dong coalition forms, a non-Dong player can accept its invitation to join six-month treaties with its surviving members. The invitation expires after three months.',
          'Holding Luoyang and at least sixteen cities at every monthly boundary for twelve consecutive months proclaims a Hegemon. Rival claims are reported when they begin and when three months remain. This is separate from capturing every city for unification.',
        ],
      },
    ],
  },
  {
    id: 'rivals',
    title: 'Rival houses',
    sections: [
      {
        heading: 'Character comes from the ruler',
        body: [
          'Each rival house acts on its current ruler’s traits, shown on the diplomacy page and in officer profiles; succession can change a house’s character. A house marches when it estimates at least 80% of the defenders’ strength. A fierce ruler marches at 70% and leaves home more exposed; a benevolent ruler waits for 95% and never leads a campaign in person; a cunning ruler counts expected losses twice. Rulers without these traits keep the neutral policy.',
          'Some cities are worth more: Luoyang, a city the house lost by conquest in the last year, the leading house’s cities, rich cities for a greedy ruler and isolated ones for a cunning ruler. Together these add at most half again to a target’s value.',
          'Fierce and greedy rulers raid another house’s city when a conquest is out of reach but they estimate at least half the defenders’ strength. A raid takes no city: a defeated defender loses gold, food, loyalty and development, and the city cannot be raided again for 90 days. A raid on your city is reported as raiders marching on it.',
        ],
      },
      {
        heading: 'Prisoners and conquest',
        body: [
          'Captives lose 5 loyalty at every month boundary, so the chance to recruit them (100 minus loyalty, 5–90%) improves the longer they are held. Rival houses keep captives and ask them every month while they can feed them; only a benevolent ruler lets go those too loyal to turn (75+). In a city’s prisoner list, Ask every prisoner here to serve tries each captive not yet asked this month.',
          'A city taken by conquest starts with loyalty no higher than 50, or 60 under a benevolent ruler. Its new governor spends early work on relief and public order, which leaves a short window to strike back.',
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
          '世界按日推进，每月固定为抽象的三十日，每年十二个月。月收入与维持费用只在月界结算一次。',
          '没有事件暂停时，推进十日等同于连续推进十次一日。“到下个事件”会停在下一个可见的抵达、战斗、期限或待决事项，并设有安全上限；敌军出发进犯我方城池的当日也会停下，地图以红色标出该军及抵达倒计时。每次推进都会说明停下的原因与日期。亲自指挥战斗时，只有战斗报告（新战斗或战果）会拦住结束战斗日；其余报告留在收件箱，等战事告一段落再看。快捷键（输入框外）：空格推进一日，Shift+空格推进十日，N 到下个事件，I 收件箱，O 军情与命令，C 君主本城，D 外交；战场中 A 攻击、W 待命、E 结束战斗日、Esc 退回上一步。',
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
          '基础兵种仍只有步、骑、弓。部队等级独立于武将等级：1–10 级使用普通图，11–20 级分别使用重步兵、精锐骑兵、强弓兵图；少于 500 人用小队，500 人及以上用大队。下水后按既定主将资格使用楼船或载兵小船，部队等级和人数不改变船型。',
          '武将详情和战场显示兵员等级、平均经验及距下一级经验。新兵经验为零，补兵按人数平均经验，可能使精锐降回普通；确认前会预览人数、等级、经验和图标变化。交回兵池的老兵保留经验，只能补入同兵种部队。',
          '造成或承受过有效战斗伤亡的幸存部队，战后获得 40 点参战经验、按战果与开战人数计算的最多 80 点经验，以及胜方 20 点经验；每战最多 140 点，总经验上限 1900。每升一级，普攻与反击伤害增加 2%，承受普攻与反击伤害减少 1%，计策不叠加等级倍率。成长战报保存各原部队当时的经验、等级变化、精锐晋升或全灭清零，之后补兵不会改写旧战报。',
          '部队战力受兵力、将领统率、士气、状态以及脚下真实地形影响。',
          '一将只带一个基础兵种，可战与随将伤兵合计最多 10000 人。有效战斗减员的 60% 成为伤兵，40% 永久损失；可战归零是击溃，两者归零才是全灭。伤兵保留经验，不能在战场行动或恢复。断粮减员是永久损失。',
          '新出征自动将旧伤兵留城，保留来源和经验。有粮完整驻城一日后，按每城同兵种汇总恢复 10% 并向上取整：3000 首日恢复 300，约 22 个有效日恢复九成。在途和城外等待不恢复。留城老兵仅在原将同城、同势力、可用且有容量时自动归队，否则作为独立兵源保留。',
          '所部、预备兵、待归队老兵、伤兵与俘虏都吃粮，骑兵两倍；看押方承担俘虏口粮，不另付己方兵饷。城池页“军事”分组或武将详情中可展开“兵员、养伤与遣散”，查看粮耗并无工作点遣散指定人员。各城“归还全部所部”均不耗工作点，伤兵继续留城休养和吃粮。',
          '征募从城市人口中抽调。步兵每批 200 金、弓兵 350 金（人数随武力）；骑兵在北方／中原／南方分别花 400／500／600 金，人数为步兵的 60%／50%／40%。以武力 70 计，每名骑兵约 1.0／1.5／2.3 金，步兵约 0.3 金；骑兵仍吃双倍口粮。',
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
          '手动移动成功后弹出攻击、计策、待命和关闭。选择攻击或具体计策后菜单收起，点击地图高亮目标才执行；关闭保留移动及剩余行动，可重新选中该部队打开菜单。不可用选项说明限制原因。',
          '战斗发生在目标城市外围。本版没有城墙、城门、攻城器、攀墙或城内巷战阶段。战斗通过击败敌军、撤退或达到时限结束。',
          '战场是 48×32 的正俯视方格，可以拖动平移、滚轮缩放。打哪张战场由进攻方最后一段路线决定，同一条路每次都打同一张图。画面只是格子的插画：每格算平原、森林、丘陵、水还是峭壁，检查格子即可看到。画里的城墙和峭壁一样不能通行，城门是普通地面。',
          '战斗最多持续三十日，劫掠战十四日。到达期限时，剩余兵力较多的一方控制战场；双方兵力相同时由守方获胜。标题栏会显示若此刻到时限谁将获胜。',
          '两军部署相距约 15 列，通常两三日内接战。与敌军相邻的部队被牵制、不能移动；但已溃散的部队可向相邻空格退一步脱离接触。',
          '士气开战时为 80。粮草充足、且一个战斗日内未损失兵力的部队，次日拂晓恢复 5 点士气，最多到 80；付不起当日口粮的一方不恢复。士气低于 40 时动摇（伤害 −15%，不能用计）；低于 20 时溃散，只能移动或待命。一方全部部队溃散即告败退。',
          '武将满足能力和地形条件时可用六种计策：火计、混乱、鼓舞、劫粮、伏兵和落石。每个战斗日回复 2 点计策点；鼓舞消耗 3 点。火计对林中目标、或智力远高于对手的施计者在风天，伤害高于普通攻击，且不受反击；从丘陵施放的落石另有士气打击，雨天照样有效。计策面板会在使用前显示消耗、射程、目标条件、概率、伤亡、士气与粮草效果；预览与实际结算使用同一套规则。',
          '混乱会跳过下一次行动，包括溃退部队的移动或待命；今日已行动的目标也可受影响，效果跨日保留，重复施放不叠加。鼓舞解除混乱并恢复士气；其 +20% 伤害保留到一次普攻、反击或伏兵命中后消耗。火计和落石不享受也不消耗此加成；再次鼓舞只刷新，不叠加。',
          '系统不会替你选中部队：先点部队，再点绿色格。部队行动前移动都可撤回，按 Esc 或右键即可；点空地取消选中。再点一次选中的部队，可原地下达行动。选“攻击”（A）后显示红色攻击范围，再点范围内的敌军出手；平时点敌军只显示其信息。选择攻击时，射程内每个目标旁会显示我方造成与承受的伤亡、目标攻击后的士气，以及是否将其击溃或歼灭。鼠标停在绿色格上时，会圈出从该格能攻击到的敌军。结束战斗日后，地图回放敌军回合（Esc 或“跳过”直接看结果），并汇总敌军攻击、我军损失及动摇或溃散的部队。',
          '敌将按性格作战：武力远高于智力或性情勇猛者敢于冒进；智谋之士则固守阵地，更舍得花计策点。敌军改变态势时战况会写明。委任指挥绝不擅自撤退：诸将想撤时，委任会自动关闭，请你亲自指挥或下令撤退。',
          '“整军撤退”无需选中棋子，确认后整场认输。有退路时，未接战被俘率为 0%，接战后每将 5%，击溃或士气溃败的被迫溃退每将 25%；各将独立判定，确认页也显示至少一将被俘的概率。无路明确投降，取消不改变状态或随机结果。有序逃脱保留全部随军生还者，被迫逃脱只带走三分之二随军伤兵。守方失城同样判定，逃脱后真实行军。',
          '返程队伍困在敌对城池，且本势力已无城池、在途出征或未结束的战斗时，队伍投降。友方、盟友及独立城池不触发此规则；目的地正在交战时，等待战斗结束再处理。武将保留健卒、伤兵及其经验，转为俘虏。接收城池取得剩余货物，仓库装不下的部分仍在城外等待空间。仍有城池或出征部队的势力可以继续寻找安置地点。',
          '武将被俘时随军所部一起被俘，后方旧伤兵不连带改投。招降成功后所部需 10 个有粮驻城日整编，期间不能作战或征调，可同时恢复伤兵。释放、交换真实返乡，由看押城在现有粮食内拨付返程预算；无可达归属城则释放武将并遣散所部。招降、交换每月一次，交换失败双方也计次，之后仍可释放或处决。处决所部遣散。君主被俘时立即继位；招降成功后，原势力其余在世武将忠诚及所属城池民心各降 10 点，最低为 0；失败或处决均不降低这两项。存续势力显示现任君主姓名。失城后方库存散编，不直接变成占领军。',
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
          '部队位于水格时，攻击伤害乘以 0.75，受到的兵力伤害乘以 1.25。步兵、骑兵和弓兵使用同一规则。上岸后恢复陆地规则。',
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
          '任命本城驻将或免去太守立即生效；他城人选抵达当日就任。就任无需先清空所部。跨城调任携带健全兵和伤兵，保留经验及整编状态，另备去返路粮；在途暂停治疗和整编。反复任免不会刷新城市本旬已用工作点，也不会清除既有承诺。',
          '普通驻将从出发城城池页的“调度 → 武将调动”勾选多人或全选，再选择另一座己方城池。确认前查看人数、行程和去返路粮；不耗工作点，携带整支所部，抵达后直接驻城，无需任命或等待月界。君主、现任太守、待赴任和已被批准命令占用的人选显示不可选原因。在途队伍可从“军情与命令”查看。',
          '攻城后确认战报，自动选择自任太守或任命太守。自任要求君主已经抵达，将新城设为君主本城，原本城转为地方班底维持；新城同城驻将可保留所部立即任太守，跨城候选启程调任，抵达即就任。可稍后处理并从收件箱待办继续，读档仍保留；两城库存、兵员和已用工作点不刷新。',
          '每城每旬（10 个游戏日）增加 2 点，不随驻将人数变化；未用点数可累积，最多 6 点（一个月的量），跳过时间不再浪费。执行仍需在世己方驻将。配兵、归还所部、赏赐和装备不耗工作点。赏赐花 100 金（忠诚最多 +15），精良兵器花 180 金（武力最多 +5，上限 105）；赈济花 1 点、80 金与 600 粮（民心最多 +15、人口 +1,500），约一年税收可回本。市场买卖每点 2,000 粮换 200 金。“恢复民心”已取消：治安不花钱且恢复更多。君主本城的事务还会占用执行武将的时间：发展与训练 10 日，征兵、治安、赈济、搜索 5 日，买卖粮 2 日。效果立即生效；工期内该武将不能再接城务，但仍可守城、出征和配兵。宴饮、赏赐、装备和配兵不占用武将。太守和 AI 使用同样的工作点（不计工期），已承诺的资源会保留；迁都、任免不刷新已用点数。',
          '征募 → 分配 → 出征：征募先增加城市预备兵，不会直接增加武将带兵。设定武将带兵数并从预备兵分配后，再准备出征。城池窗口是一整页：“军事”（出征、出征令、征兵、预备兵）、“内政”、“武将”、“调度”四组直接列出全部操作，向下滚动即可找到。选择事务后进入确认页，并自动推荐最合适的空闲武将；完成后回到城池页原来的位置。配兵、训练在城池页点选武将后进行，完成后回到该武将详情。Esc 逐层返回，未确认的命令不会执行。不可用的行动会说明工作点、库存、已有承诺或属性上限的限制。',
          '点击地图上的城池，再点出征。选择随军武将、目标与军粮，确认出征后返回地图查看行军。以完整所部合计兵力；军粮默认包含去程、战斗及返程。君主本城直接出发，太守城市保留接受、缩减、等待与取消的方案流程，并保护最低留守兵力及已有承诺。',
          '宴饮可勾选本城己方驻将，整场消耗 1 点，仅所选者获得最多 8 忠诚。赏赐与精良兵器支持多选，分别按每人 100 金和 180 金合计，不耗工作点。全选仅包括可用人选；确认前显示总费用和实际变化，资金不足或任何人选失效时整批不执行。',
          '发展农业或商业各花 80 金和一个工作点，农业最多 +20、商业最多 +10，上限 500。临近上限时预览实际增量；已有城市数值不重算。',
          '每月税收为原基础税收向下取整后，乘以（0.8＋城市民心／500），再向下取整，即原税收的 80%–100%。粮食与征兵公式不变。武将忠诚保留继位与俘虏处置作用，自治仅在驻将忠诚低于 55 时考虑赏赐或宴饮。',
          '武将靠战功成长。训练每次 +25 武将经验，不再直接加武力；参战武将在战斗结算时获得所部战斗经验的一半。每 100 经验升一级（500 经验即 5 级封顶），每级武力 +2，弓兵改为智力 +2，武力上限 100（精良兵器 105）。经验到 500 或 5 级后不能再训练，旧档更高经验保留；预览和结果显示实际增量。',
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
    title: '外交与同盟',
    sections: [
      {
        heading: '六个月盟约',
        body: [
          '提议页面列出成功率的每一项。基础为 40 加我方君主智力的一半。双方都与最强势力接壤加 20；向最强势力提议减 30，我方自己是最强势力也减 30。对方军队正在进犯我方时减 30。对方君主仁德加 10、勇猛减 10。解除同盟后二十四个月内，每次提议减 30。我方仅有两城或更少时加 15。最终限制在 5%–90%。',
          '成功的同盟持续六个战役月，双方不能互相攻击。双方距目标超过五日的出征部队会在下一个安全路线节点返程；五日以内的部队继续进军并交战，盟约不能临时当作挡箭牌。解除同盟立即生效。',
          '讨伐董卓联盟成立时，非董卓玩家可以接受邀请，与仍存续的盟友缔结六个月同盟。邀请三个月后失效。',
          '在每个月界都控制洛阳与至少十六座城市，连续维持十二个月即可称霸。若敌方开始称霸，游戏会在进度开始与剩余三个月时发出警告。称霸与攻取全部城市、天下一统是不同胜利条件。',
        ],
      },
    ],
  },
  {
    id: 'rivals',
    title: '敌对势力',
    sections: [
      {
        heading: '性格来自君主',
        body: [
          '每个敌对势力依其现任君主的性格行事，外交页面和武将资料中可见；君主更替可能改变势力性格。一般势力预估胜算达到守军的 80% 才出征。勇猛的君主 70% 即出兵，更敢让本城空虚；仁德的君主要等到 95%，且从不亲自领兵；智谋的君主对预计伤亡的重视加倍。没有这些性格的君主维持一般策略。',
          '有些城池更值得争夺：洛阳、一年内被攻占的旧城、领先势力的城池；贪婪的君主偏好富庶城池，智谋的君主偏好孤立无援的城池。这些加成合计最多使目标价值提高一半。',
          '勇猛和贪婪的君主在攻不下城池、但预估胜算仍有一半时，会劫掠其他势力的城池。劫掠不夺城：守方战败会损失金粮、民心与开发，该城 90 日内不会再被劫掠。针对我方城池的劫掠会以“敌军劫掠”报告。',
        ],
      },
      {
        heading: '俘虏与攻城',
        body: [
          '俘虏每到月界忠诚下降 5，劝降成功率（100 减忠诚，5%–90%）随关押时间上升。敌对势力只要供得起口粮，就会关押俘虏并每月劝降；只有仁德的君主会释放忠诚 75 以上、难以劝降的俘虏。在城池俘虏列表中，“劝降本城全部俘虏”会对本月尚未劝降的每名俘虏各尝试一次。',
          '攻占的城池民心最高为 50，仁德君主为 60。新太守会先用工作点赈济与整顿治安，原主因此有短暂的反攻时机。',
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
