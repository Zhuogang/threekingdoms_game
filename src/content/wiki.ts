import type { Action } from '../game/types';

export interface WikiBlock {
  heading: string;
  paragraphs: string[];
}
export interface WikiSection {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  blocks: WikiBlock[];
  actions?: Action[];
  kind?: 'troops' | 'tactics' | 'traits';
}

export const WIKI_SECTIONS: WikiSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    summary: 'Your first month, your first army, and how to win.',
    keywords: ['入门 新手 回合 月 胜利 霸主', 'beginner tutorial month victory hegemon'],
    blocks: [
      {
        heading: 'A safe first month',
        paragraphs: [
          'Choose a scenario and ruler. Cao Cao offers a balanced start; Story difficulty gives a quieter opening. An optional opening truce prevents every house, including yours, from marching until it expires.',
          'Select a city you own, then an available officer in its sidebar. Use Develop farms for food, Encourage trade for gold, and Restore order for public support and defenses. Read the cost and outcome preview before confirming an order.',
          'Each officer normally receives one assignment per month. A city action takes effect immediately and makes that officer busy; they cannot then march that month. Keep a different officer available if you intend to march.',
          'Recruit soldiers adds city reserves. Muster assigns those reserves to an available officer. Recruitment itself uses an assignment, so another available officer may be needed to muster and march in the same month.',
          'Advance month resolves queued marches, rival orders, income, upkeep and events. Transfers take effect immediately. Read the monthly report and adviser suggestions before planning again. Opening this Wiki never advances time.',
        ],
      },
      {
        heading: 'Campaign victory',
        paragraphs: [
          'Unify all 24 cities, or hold Luoyang and at least 16 cities for 12 consecutive months to become Hegemon. A rival can also claim the Hegemon title. Losing your last city ends your campaign.',
          'The map is a connected city network: marches target neighboring cities. Drag to pan, scroll to zoom, and double-click to reset. The city index is a text-based way to select cities.',
        ],
      },
    ],
  },
  {
    id: 'troops',
    title: 'Troop types',
    summary: 'Recognize all six troop types, their reach, counters and movement.',
    keywords: [
      '步兵 骑兵 弓兵 水军 先锋 卫兵 工兵 盾 枪 马 弓',
      'infantry cavalry archer marines vanguard guard spear bow horse',
    ],
    kind: 'troops',
    blocks: [
      {
        heading: 'Read the troop table',
        paragraphs: [
          'Movement is a point budget, not a promise of that many tiles. Orthogonal steps count; diagonals do not. Forests, hills, gates and enemy zones of control can reduce how far you move. Attack range uses orthogonal distance: one tile sideways plus one tile up is distance two.',
          'Infantry deals 20% more normal damage to cavalry; cavalry deals 30% more to archers; archers deal 15% more to infantry. Vanguard has a general 15% attack bonus. Guard takes 20% less normal attack damage and has a stronger counterattack.',
          'Use the small insignia and the selected commander panel to distinguish Vanguard and Guard from ordinary infantry. Their painted foot-soldier illustration is shared; the crossed swords and shield remain different.',
        ],
      },
      {
        heading: 'Change an officer’s troop type',
        paragraphs: [
          'In your city, choose an available officer who already leads troops, open the officer orders, and choose Reorganize troops. Pick a different type and confirm. It costs 150 gold, 15 stamina, the monthly assignment and 20% of that officer’s troops.',
          'Troop types are assigned to officers. Spears, bows, horses and shields in the illustrations identify those types; they are not separate items to click or equip.',
        ],
      },
    ],
  },
  {
    id: 'equipment',
    title: 'Equipment and weapons',
    summary: 'What Fine arms does, how to issue it, and why there is no weapon-use button.',
    keywords: ['武器 装备 兵器 精良 发放 没收 武力', 'weapon equipment equip fine arms confiscate'],
    actions: ['equip', 'confiscate'],
    blocks: [
      {
        heading: 'Issue and use Fine arms',
        paragraphs: [
          'Select an owned city and an available officer without equipment. Under officer orders choose Issue fine arms. The order costs 180 gold and 10 stamina, uses that officer’s monthly assignment, and adds 5 Might, up to 105.',
          'The bonus applies automatically through the officer’s Might. In battle you still move, attack or use tactics; there is no separate weapon-use action. An officer can hold only one Fine arms upgrade.',
          'Confiscate equipment removes the upgrade, reduces Might by 5 and loyalty by 12, and returns 100 gold. It costs 5 stamina and a monthly assignment. Consider the loyalty loss before confirming.',
          'There are currently no individual weapon inventories, weapon durability, ammunition purchases or weapon-swapping controls. Changing a soldier from a spear to a bow means reorganizing their troop type.',
        ],
      },
    ],
  },
  {
    id: 'battle',
    title: 'Battle controls',
    summary: 'A complete turn: select, move, attack or cast, then end the day.',
    keywords: [
      '攻击 移动 操作 鼠标 待命 反击 自动 战斗 营地',
      'attack move click control counterattack auto battle camp',
    ],
    blocks: [
      {
        heading: 'Command one unit',
        paragraphs: [
          'Click a friendly unit on the battlefield, or select its commander in the sidebar. The panel shows its troop type, strength, movement, range, morale and available actions. Use Next ready commander to cycle through units that can still act.',
          'Click a highlighted reachable tile to move. Alternatively select a destination such as E4 in Move to tile and press Move unit. The Reachable tiles highlight already accounts for terrain and enemy control.',
          'To make a normal attack, leave tactic targeting off, then click an enemy in range or choose its attack entry in the sidebar. Read the casualty and counterattack forecast first. Clicking an enemy in range issues the attack immediately.',
          'You may move once and then attack or cast one tactic. Attacking, casting or Hold position spends the action and ends that unit’s movement. You cannot attack first and then move. Hold position does not grant a special defense buff.',
          'Select another ready commander and repeat. End battle day lets the opposing army act and begins the next day if the battle continues. Scroll the side panel to reach commands that are below the fold.',
        ],
      },
      {
        heading: 'Forecasts, counters and quick controls',
        paragraphs: [
          'A surviving defender counters only if the attacker is within its own attack range and it is not routed or confused. A normal counter is 50% of a normal hit; Guard counters at 70%. Tactics do not receive counterattacks. Forecasts are estimates, not guaranteed exact damage.',
          'Show enemy reach overlays tiles the enemy can threaten after moving. Fit battlefield shows the entire board; Readable tiles enlarges units and may require panning; Center selected unit finds the current commander.',
          'Advance to contact automatically advances battle days until the armies can engage; it can spend food and expose your army to enemy turns. Auto-resolve lets the AI finish the battle under the same combat rules. Use manual orders when you want direct control.',
        ],
      },
      {
        heading: 'Win a battle',
        paragraphs: [
          'Capture the enemy camp, defeat all enemy units, or break the army when all surviving enemy units are routed. A routed unit cannot capture the camp. You may pass through your own camp but cannot end a move on it.',
          'Defenders win if the attacker has not won when the day limit is reached: normally 30 days, or 10 for a raid. Defeated officers may be captured, especially after an adjacent finishing blow or encirclement; battle defeat does not kill named officers.',
        ],
      },
    ],
  },
  {
    id: 'tactics',
    title: 'Tactics and tactic points',
    summary: 'All six tactics, requirements, costs and target selection.',
    keywords: [
      '火攻 鼓舞 扰乱 伏兵 落石 劫粮 计策 灰色 智力',
      'fire rally confuse ambush rockfall raid supplies tactic intellect',
    ],
    kind: 'tactics',
    blocks: [
      {
        heading: 'Cast a tactic',
        paragraphs: [
          'Choose a commander, press a tactic button in the sidebar, then choose a valid target on the map or in the target list. Rally targets yourself or an ally; the other tactics target enemies. Cancel targeting before issuing a normal attack or move.',
          'Each side has a shared pool capped at 30 points and regains 2 each battle day. The opening pool depends on the army’s intellect. Cunning reduces each tactic’s cost by 1, with a minimum of 1.',
          'The table lists base intellect requirements. Veterans at level 3 or above need 10 less intellect. Most tactics reach 2 tiles, or 3 for archers or commanders with intellect at least 80; Ambush and Rockfall remain limited to 2.',
          'Militia garrisons cannot cast tactics. Confused units cannot act; wavering or routed units cannot cast. A disabled button explains missing intellect, terrain or points when hovered. A valid caster may still have no target in range.',
        ],
      },
    ],
  },
  {
    id: 'terrain',
    title: 'Terrain, weather and morale',
    summary: 'Understand rivers, walls, morale marks, flanking and movement stops.',
    keywords: [
      '地形 河流 山 森林 城墙 城门 士气 天气 下雨 溃败 动摇 控制区 星星',
      'terrain water hill forest wall gate morale weather rain rout zoc flank status',
    ],
    blocks: [
      {
        heading: 'Terrain and movement',
        paragraphs: [
          'Plain tiles cost 1 movement point. Forests and hills cost 2 for most troops, 3 for cavalry and 1 for Vanguard. Marines spend 2 on dry ground and 1 on water; other types cannot enter water. A dry crossing drawn on a plain tile remains walkable.',
          'Gates cost 2 movement points. Defenders can move on wall tiles; attackers cannot. A city with defense at least 60 has walls and gates. Walls reduce normal damage received to 60%, gates to 75%.',
          'Enemy control can stop your move before your point budget runs out. Cavalry can pass through one enemy-controlled tile before the next stop. Use the highlighted reachable and stop tiles rather than counting empty squares alone.',
          'Normal attacks gain 10% damage for each additional friendly unit adjacent to the target, capped at 30%. Rain weakens archery and fire; wind and forests can strengthen fire. The sidebar shows today’s weather and tomorrow’s forecast.',
        ],
      },
      {
        heading: 'Read the marks on a unit',
        paragraphs: [
          'The faction stripe and crest show allegiance; the surname is the commander, and the number is troop strength. A horse, bow or spear figure shows troop type; the small insignia resolves shared illustrations. Stars mark veteran levels, not remaining actions.',
          'A ready dot or circle means an action remains; an arrow means movement is used but an action remains; a check means finished for today; a question mark means confusion. Rally removes confusion, but does not restore an action that has already been spent.',
          'Below 40 morale a unit wavers and deals 15% less damage; below 20 it routs, cannot attack or cast, and takes 20% more damage. Routed troops may only move or hold. Rally raises morale and gives an inspired attack bonus of 20% for the day.',
          'A nearby defeat lowers morale. Fed units that were not hit recover 3 morale at day end. Watch the glyphs and colored morale stripe together; a healthy troop count alone does not mean the unit can fight.',
        ],
      },
    ],
  },
  {
    id: 'economy',
    title: 'City management and economy',
    summary: 'Farms, trade, public support, recruits, provisions and monthly upkeep.',
    keywords: [
      '内政 金钱 金 农业 商贸 城防 民心 粮食 经济 招兵 预备兵 买粮 卖粮',
      'economy farm commerce gold food reserve recruit tax upkeep city',
    ],
    actions: ['farm', 'commerce', 'govern', 'relieve', 'buyFood', 'sellFood', 'recruit', 'plunder'],
    blocks: [
      {
        heading: 'Where to give city orders',
        paragraphs: [
          'Select an owned city, select an available officer, and open Develop, Officers, Diplomacy or Harsh measures. Choose an order, read its preview, and confirm. Costs come from that city, not a shared national treasury.',
          'A city action requires enough local gold, food when specified, and officer stamina. The table lists the base gold and stamina costs; successful city actions also use a monthly assignment. Failed chance-based attempts still spend their order costs.',
          'Recruitment reduces population and public support while adding reserves. Each officer can command at most 5,000 soldiers. Muster transfers soldiers between reserves and an available officer without consuming a monthly assignment.',
        ],
      },
      {
        heading: 'Monthly income and shortages',
        paragraphs: [
          'Every month, commerce and population generate gold; farms and population generate food, with a larger harvest in September. Both reserve and officer-led soldiers consume food and pay. Expanding an army increases upkeep even when it stays home.',
          'City food upkeep is rounded up from soldiers × 0.12; pay is rounded up from soldiers × 0.025. Food shortage causes 15% of soldiers to desert and lowers public support and officer loyalty; unpaid wages also hurt loyalty. Income and harvest are added before upkeep.',
          'Keep public support above 30 to avoid unrest risk. Use Restore order or Relieve the people to recover. Farming and commerce cap at 999; public support and defense cap at 100.',
          'Plunder gives immediate loot but severely damages farming, commerce, support and population, and starts a three-month cooldown. Check the exact preview; benevolent officers resent it. It is an emergency tradeoff rather than free income.',
        ],
      },
    ],
  },
  {
    id: 'officers',
    title: 'Officers, loyalty and training',
    summary: 'Assignments, stamina, recruitment, governors, traits and levels.',
    keywords: [
      '武将 忠诚 体力 太守 训练 等级 特性 寻访 招募 奖赏 宴席',
      'officer loyalty stamina governor train experience level trait search reward feast',
    ],
    actions: ['search', 'train', 'reward', 'feast', 'appoint', 'reorganize', 'banish'],
    kind: 'traits',
    blocks: [
      {
        heading: 'Keep officers ready and loyal',
        paragraphs: [
          'Might improves military effectiveness; intellect helps civil work and tactics. Stamina pays for assignments and recovers by 35 each month, capped at 100. Busy officers become available when the next month starts.',
          'Search for talent looks for a local free officer. Persuade an officer can target local free officers or captives, or enemies in neighboring cities; check the displayed chance. Rulers cannot be persuaded.',
          'Rewards raise the selected officer’s loyalty by 15. A feast raises local serving officers’ loyalty by 8 and stamina by 10; the host spends the assignment. Officers under loyalty 30 may leave in January or July, except those with Loyal.',
          'Appoint a governor to help maintain public support through intellect. Dismiss officer makes the officer local and unaffiliated, returning their soldiers to reserves; use the preview before making this decision.',
        ],
      },
      {
        heading: 'Training and veteran levels',
        paragraphs: [
          'Drill troops requires assigned soldiers and grants 25 experience and 1 Might. Battle also awards experience. Each 100 experience grants a level, up to level 5; level gains improve stats, and level 3 lowers tactic intellect requirements by 10.',
          'Traits follow the officer across allegiance changes. Hover or focus a trait chip for its effect. Cunning, Fierce, Loyal, Benevolent and Greedy influence different rules; the table summarizes them.',
        ],
      },
    ],
  },
  {
    id: 'marches',
    title: 'Marches, supplies and transfers',
    summary: 'Prepare an expedition, choose conquest or raids, and move resources.',
    keywords: [
      '出征 行军 运输 调兵 邻城 征服 劫掠 洗劫 军粮 补给',
      'march supply transport transfer conquer raid sack provisions',
    ],
    blocks: [
      {
        heading: 'Send an army',
        paragraphs: [
          'Select your source city, open March an army, choose a neighboring target and available commanders with troops, then choose an intent and supply duration. Review total soldiers, committed food and target information before issuing the order.',
          'Food is committed and commanders become busy when you issue the march. The army resolves on Advance month. A busy commander, an active truce or alliance, insufficient food, or a non-neighboring target can block the order.',
          'Conquer occupies a city after victory. Sack conquers and plunders it. Raid seeks loot without keeping the city and has a 10-day limit; some weak or undefended cities are raided without a battle. The planner describes the expected behavior.',
          'Conquest and sack offer 10, 20 or 30 supply days; raids carry 10. Initial food equals days × ceil(total troops / 25). Battle consumes food daily; check days left for both armies and avoid arriving with no margin for a longer fight.',
        ],
      },
      {
        heading: 'Transfers and battle aftermath',
        paragraphs: [
          'Use Transport to move a selected officer, their army and local gold, food or reserves to a neighboring city you own. Review the available amounts and confirm. Transfers take effect immediately, cost the convoy commander 15 stamina, and use their monthly assignment.',
          'After battle, read the recap for losses, captures and victory reason. A captured officer can be dealt with in the holding city’s prisoner panel. Winning a battle does not always occupy the target: the chosen march intent matters.',
        ],
      },
    ],
  },
  {
    id: 'diplomacy',
    title: 'Diplomacy, scouting and prisoners',
    summary: 'Reveal enemy cities, persuade officers and manage peace or captives.',
    keywords: [
      '外交 同盟 侦察 战争 迷雾 俘虏 劝降 释放 处决 离间',
      'diplomacy alliance scout fog prisoner persuade release execute subvert',
    ],
    actions: ['scout', 'persuade', 'subvert', 'alliance'],
    blocks: [
      {
        heading: 'Information and peaceful options',
        paragraphs: [
          'Rival city details are foggy until scouted. Reconnaissance reveals a neighboring city for two months. Loot estimates and city values may otherwise be approximate; scouting improves the information you plan with.',
          'Persuasion depends on the acting officer’s intellect and the target’s loyalty; captives are easier to persuade, Loyal targets harder, and Benevolent officers improve the chance. A recruited enemy officer brings half of their troops.',
          'Negotiate alliance proposes six months of peace, with odds shown before confirmation. Sow dissent reduces a neighboring enemy city’s public support and officer loyalty. Breaking an alliance has a reputation cost.',
          'Large houses can provoke coalitions. Events and invitations appear in reports; read their choices before answering. Difficulty changes rival behavior and opening conditions, without giving rivals free resources or damage bonuses.',
        ],
      },
      {
        heading: 'Captured officers',
        paragraphs: [
          'Select the city holding a captive and use the prisoner panel to attempt recruitment, release them or execute them. Recruitment uses a suitable serving officer and the displayed persuasion rules. Execution permanently removes that officer from the campaign.',
          'Rival houses also handle prisoners each month. Your captured officers appear in the officer roster with the holding house and city, and changes are recorded in the monthly report.',
        ],
      },
    ],
  },
  {
    id: 'saving',
    title: 'Saving, settings and accessibility',
    summary: 'Save safely, switch languages, enlarge the map and reopen this guide.',
    keywords: [
      '保存 存档 读档 导出 导入 设置 字号 键盘 Wiki 帮助',
      'save load export import settings keyboard language zoom wiki help',
    ],
    blocks: [
      {
        heading: 'Protect your progress',
        paragraphs: [
          'Successful commands autosave in this browser, including mid-battle progress. Wait for All progress saved. Save & load provides three manual slots and JSON export/import; export a backup before clearing browser data or changing devices.',
          'If saving fails, the game shows the failure and a retry control. Do not assume an unsaved action is durable. Manual slots and the automatic save are separate; importing or restoring replaces the active campaign.',
        ],
      },
      {
        heading: 'Read and control comfortably',
        paragraphs: [
          'Use Eng / 中文 to change language, including while reading this Wiki. It changes presentation, not game progress. Settings offers Compact, Comfortable and Large display sizes, sound and reduced motion.',
          'Open Wiki from the top bar or any dialog header, or press F1. Escape closes it and returns to the same screen or unfinished form. Reading, searching and changing chapters issue no game orders.',
          'Use Tab and Shift+Tab to move between controls, Enter or Space to activate buttons, and Escape to close the Wiki. The city list, commander list, destination selector and attack-target list provide alternatives to precise map clicking.',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Common questions',
    summary: 'Why a unit will not move, a button is gray, or your army cannot march.',
    keywords: [
      '为什么 不能 灰色 不动 不会 找不到 问题 FAQ',
      'why cannot disabled gray blocked stuck faq',
    ],
    blocks: [
      {
        heading: 'Why can’t this unit move or attack?',
        paragraphs: [
          'Check whose side it is, whether it has already moved or acted, and whether it is confused or routed. A unit cannot stop on its own camp, cross impassable water or enter attacker-blocked walls. An enemy outside range cannot be attacked yet.',
          'If a tactic is selected, map clicks are choosing its targets. Cancel tactic targeting to move or make a normal attack. If the unit has acted, select another ready commander or end the battle day.',
        ],
      },
      {
        heading: 'Why is this city order disabled?',
        paragraphs: [
          'City orders need the planning phase, an owned city, a suitable available officer, enough stamina and local resources, and any special requirements. Hover the disabled command for its reason. A pending battle must be finished before city orders resume.',
          'Recruit soldiers creates reserves, not an immediately ready second army. Assign troops with Muster, keep the marching officer’s assignment unused, and check neighbor links, peace agreements and supply food.',
        ],
      },
      {
        heading: 'Where are my weapons and the rest of the controls?',
        paragraphs: [
          'The weapon in a troop drawing is its type symbol; normal attack uses it automatically. Fine arms is a passive Might upgrade. There is no manual aiming, ammunition or weapon-selection screen.',
          'Scroll the battle sidebar down to see movement selectors, tactics and target lists. Use Readable tiles if units are too small, then drag to reach off-screen units, or use Fit battlefield to return to an overview.',
        ],
      },
    ],
  },
];
