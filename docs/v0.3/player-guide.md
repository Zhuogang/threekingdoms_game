# v0.3 player guide / 中英玩法指南

Updated October 22, 2026 for the map-first city-window prototype. [Overview](README.md) · [Release notes](release-notes.md) · [Known limits](implementation-status.md). The game itself has searchable Chinese/English Wiki help; this guide covers the same current version, not the older Pixi game.

## 中文玩法指南

### 1. 开始与目标

按[根 README](../../README.md#start-playing)启动本地服务，打开 Vite 地址。首次游玩时选择 190 或 200 剧本及势力，再点“开始新战役”；新手可从曹操开始。如已有有效自动存档，游戏会直接恢复，通过“战役菜单”可继续或新开，新开前会确认并提供导出。

每月抽象为 30 日。你经营君主本城，向其他城市征调物资或下达出征令，并在交战时指挥己方部队。可以控制全部城市完成统一，或在每个月界持有洛阳及至少 16 城，连续 12 个月界达成称霸。两种结局分开统计。君主被俘后由最忠诚的自由武将继位；没有自由武将时势力覆灭。

主界面以大地图为主，点击城池后才打开操作窗口。“返回城池”回到本城概况，“返回大地图”或关闭按钮回到原地图位置；Esc 逐层返回。

### 2. 第一月：征募 → 分配 → 出征

1. 在大地图点击君主本城，打开城池窗口，概况显示金粮，再点“城务”查看农商、预备兵、人口及本月工作点。工作点等于驻城在世己方武将数，上限 3；本城内政共用这些点。
2. 在“城务”选“征募士兵”，指派执行武将，查看变化后点“确认执行”，成功后返回城务菜单。征募先把人口转为**预备兵**，不会直接增加武将带兵数。征募也会消耗工作点并降低少量民心。
3. 返回城池，依次进入“驻城武将 → 选择武将 → 调整兵力”，输入希望的**最终带兵数**，核对变化后点“确认执行”。完成后返回这名武将的详情。例如从 800 改为 900，会从预备兵分配 100；改为 0 会归还所部。调整也受工作点和已有承诺限制。
4. 返回城池概况，点“出征”，勾选随军武将，选择目标并核对军粮、行程和敌军；点击“确认出征”。君主本城直接派出所选武将，窗口关闭并回到原位置的大地图，显示部队行军标记。
5. 出征兵力等于所选武将**整支所部**之和。太守城市的方案仍可能因最低留守、预留与军粮出现缺口，需接受缩减、等待或取消。
6. 方案若需要决策，可接受、接受缩减、等待足额或取消。出发后会出现实际行程；未抵达不会瞬间获得目的地资源或开战。
7. 推进一日或到下个事件。关键报告需要确认，普通月报与天下纪事不会暂停；军队会行军、吃粮、到达并开战。胜败之后仍需处理驻留或返程。

不是每个动作都能在同一个月做完。工作点用尽需等月界；不要反复任免太守试图刷新额度。长途出征要留够城市运转、行军和战斗的粮食。

### 3. 太守、地方自治与订单

君主本城可以直接内政。其他城市由正式太守或地方班底自治，不能逐项控制其农业、装备或编兵；你仍可查看库存、征调金粮兵、下达出征令、任免太守并临阵指挥。

点击己方自治城市，进入“城务 → 太守任免”，在“太守人选”中查看候选人及不可用理由。跨城调任必须先归还全部带兵，再按路线旅行；抵达后在合法月界就任。原职和目的地当前治理持续到实际交接，不会点击后立即换城或刷新工作点。

从城池进入“征调资源 → 选择命令 → 选择目的地 → 填写数量 → 查看方案”，核对后再提交。核对页返回不会生成订单或扣除资源；足额请求按原规则直接出发并返回请求菜单，有缺额时进入答复页，接受、缩减、等待或取消后返回菜单。待答复方案退出后可继续查看，订单也保留在“军情与命令”中。

资源订单的目的地是友城。答复说明可执行量、缺额、最早出发和预计到达；接受后保留相应资源，出发后从来源库存扣除，到达才交付。已派出且仍允许返程的行程可请求召回；进入战斗后不能瞬间召回。目的地易手或容量不足等情况会有报告。

从地图打开“外交 → 选择势力 → 结盟或解盟”，核对成功率或解盟后果后确认，得到答复后返回该势力详情。有效同盟持续六个月，期间双方不能互相出征。联盟邀请有独立的确认页，加入后返回外交列表。势力详情中的游戏指南可查看规则说明。

地图底部“军情与命令”和顶栏“收件箱”列出全部当前事项，可滚动查看。时间停住时先看报告的到期数量，以及是否还有己方战场未提交本日指令。纯 NPC 战斗会自动处理，不需要你替敌军操作。

### 4. 装备与本城经营

每项城务先选择执行武将。征兵按执行者武力计算人数，搜索和治安使用其智力；农业、商业等固定效果保持原样。所有执行者共用城市工作点，不新增个人行动次数或任务占用时间。

赏赐、装备、训练和配兵从“驻城武将 → 选择武将”进入，每次只打开一项操作，确认后回到武将详情。俘虏从“驻城武将 → 俘虏 → 选择俘虏”进入，处置后返回俘虏列表。城务操作在确认前显示预计变化；未确认时返回不会消耗资源或工作点。

| 操作             | 当前作用与注意事项                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 精良兵器         | 选武将配发，180 金、一个工作点；武力增加最多 5，上限 105。不是拾取后拖到战场使用的道具，没有独立武器背包或攻城兵器操作。                |
| 赏赐             | 100 金、一个工作点，单将忠诚最多 +15。                                                                                                  |
| 训练             | 需要驻城且带兵的武将；经验 +25、武力 +1。升级时弓兵再加智力 2，其他兵种再加武力 2，均受属性上限约束；经验或武力达到训练上限时不可训练。 |
| 赈济             | 80 金、600 粮、一个工作点；城市民心最多 +15、人口 +300。                                                                                |
| 发展农商         | 各花 80 金和一个工作点，提高 1 点；当前上限为 500。已有数值不重算，达到上限时不可继续发展。                                             |
| 买卖粮食         | 买入 800 粮花 80 金；卖出 800 粮得 80 金，也共用工作点，受库存和已批准预留限制。                                                        |
| 搜索、治安、宴饮 | 分别寻找可加入武将、恢复城市民心、提高驻城武将忠诚；效果和不可用原因在反馈及面板中显示。                                                |

灰色按钮先看理由：权限、阶段、工作点、库存、已有承诺、无合适武将、属性上限均可能造成限制。地图上的“预备兵”和武将“带兵”是不同数字。

### 5. 基础兵种与水上单位

下表是基础行动预算，不等于每次一定能走这么多格。林地、丘陵、水陆边界、占位和敌方控制区都会影响可达格。射程按逻辑格计算，不按画面像素距离。

| 兵种          | 基础移动预算 | 普通攻击射程 | 使用提示                                 |
| ------------- | ------------ | ------------ | ---------------------------------------- |
| 步兵 Infantry | 3            | 1            | 常规近战部队。                           |
| 骑兵 Cavalry  | 5            | 1            | 平地机动快；林地/丘陵费用较高。          |
| 弓兵 Archers  | 3            | 3            | 可远射，在正常射程内可从岸上打水中目标。 |

同类武将所部可在战场上合并显示为编队；单位兵力不等于单名武将的完整个人面板。民兵是守军编组的一种，不能使用计策。

### 6. 战斗操作、计策与水战

战场是 48×32 的正俯视方格大地图，可以拖动和缩放，每方最多 10 个编队；攻方从左侧入场，守方在右侧。打哪张战场由进攻方走的最后一段路线决定（另有几种按进攻方向的特例），同一路线同一方向每次都是同一张图，例如过黄河会打"黄河津渡"，出斜谷攻长安会打"河谷川地"。战斗标题显示战场名。部队主体使用水墨编队图，下水后变为载兵小船、上岸恢复；按当前存活兵力显示：少于 500 人用小队，500 人及以上用大队，船只暂不分规模。左上角保留编队统领的小头像：右上角小旗是势力色，左下角是兵种，右下角"×3"表示编队里有三位武将，下方是兵力数字和兵力条。可攻击的敌军有红圈，混乱或鼓舞的部队上方有小图标，已行动的部队变灰，溃败的部队半透明。缩得很小时，保留小队图，隐藏头像和次要标记；图片无法加载时显示兵种字。"网格"按钮可以隐藏格线。画面只是格子的插画：每格算平原、森林、丘陵、水还是峭壁，以检查格子时显示的地形为准。选己方存活部队，点绿色可达格移动，选射程内敌军普通攻击，或先选计策再选合法目标。普通部队每战斗日通常一次移动、一次行动；“待命”用于结束该部队行动。先看伤害/反击或计策预览，再执行。

| 计策               | 基础计策点 | 基础条件                                                          |
| ------------------ | ---------- | ----------------------------------------------------------------- |
| 火计 Fire          | 4          | 智力 60；天气、地形和水上状态会影响伤害。                         |
| 混乱 Confuse       | 3          | 智力 70；有成功率，命中会让目标失去下一次行动。                   |
| 鼓舞 Rally         | 2          | 智力 50 或武力 85；对己方目标恢复士气、清除混乱并提供下一击加成。 |
| 劫粮 Raid supplies | 4          | 智力 60 或骑兵；针对敌军粮草。                                    |
| 伏兵 Ambush        | 3          | 智力 60，自己在森林，且当天尚未移动。                             |
| 落石 Rockfall      | 4          | 智力 65，自己在丘陵；丘陵目标不在合法目标中。                     |

这是基础值：等级达到 3 时智力要求降低 10，机谋特性可减计策点费用；以当前计策面板列出的实际费用、范围和禁用理由为准。普通计策范围通常 2 格，弓兵或智力 ≥80 可到 3 格；伏兵/落石最多 2 格。计策点由同一方共用，每战斗日恢复 2，上限 30。溃败、动摇、已行动、民兵、点数不足或无合法目标均可能阻止施放。

“战场状况”显示天气/次日预报、双方粮草、移动/射程、武力/智力/等级及检查地形的倍率。“?” 可打开战斗指南。点击格子会检查状态，**合法移动或攻击仍会执行**；检查不是单独的安全浏览模式。

所有兵种可进出可通行水格，不需要水军技能或船库存。涉及水的每步至少花 2 移动点；在水上攻击 ×0.75、受到兵力伤害 ×1.25，上岸恢复陆地规则。岸水互攻只需满足正常射程；峭壁所有兵种均不可进入。战场能涉水不代表大地图能离开配置路线任意渡海。

全部己方战场都提交“结束战斗日”后，全局只推进一天；单场已提交的不要重复操作。非玩家战场自动处理。正常/突袭上限分别为 30/10 日，到时存活兵力多者胜、平手守方胜；全歼、夺取对方野战营地或撤离可提前结束。营地不是城墙，也不提供隐藏城防倍率。“撤离战场”确认后会放弃整场战斗，取消或 Escape 不会改变战况。

任务分别是占领、突袭和洗劫：突袭胜利后掠取并返程，不夺城；洗劫在夺城基础上破坏和掠夺，会损害城市。需要资源时也要考虑长期损失。

### 7. 镜头、快捷键与存档

- 主地图：滚轮/按钮缩放，拖动或方向键平移，Home/Fit 显示全图，小地图可定位；Tab 后 Enter/空格可选城市。
- 战场：Fit 全图，Unit 聚焦所选部队，Camps 看营地；小地图移动视口。地图获得焦点后方向键移动格子光标，Enter/空格执行该格操作；Shift+方向键平移镜头，+/- 缩放，Home 全图。
- 游戏中 F1 打开 Wiki，Escape 关闭 Wiki 或取消确认框。中英切换和读指南不推进时间。
- 自动存档只有一个；“导出”另存下载文件。“导入”只接受合法 v0.3 存档，不迁移旧版。成功导入清空旧草稿，失败保留本局。
- 存档属于浏览器配置与地址；换端口、浏览器、隐身窗口或清理网站数据可能看不到原档，先导出。自动保存失败时保持页面打开、导出备份，再重试保存。

### 8. 常见疑问与反馈

| 现象                | 先检查                                                                           |
| ------------------- | -------------------------------------------------------------------------------- |
| 时间不走            | 到期报告是否确认；每场己方战斗是否已提交本日。                                   |
| 征兵后武将兵力没变  | 新兵在预备兵；还需“调整兵力”。                                                   |
| 出征方案为零或很少  | 整支所部、武将是否可用、留守要求、已批准预留、粮食和路线；方案会列出缺口。       |
| 任命没立刻生效      | 调任人须无兵、抵达，并等合法月界。                                               |
| 地图部队很小/看不全 | 开战时镜头已对准己方部队；Fit 看全图，再缩放或用 Unit 聚焦。                     |
| 战绩不容易扩大      | 当前战略平衡仍有限；不要把诊断机器人结果当作个人胜率。记录实际体验供下一轮修订。 |

提交问题时附剧本/势力、日期、语言、浏览器/视口、导出存档、复现步骤和预期/实际结果。[玩家测试记录模板](../next-steps.md#player-test-record)。素材仍是草稿；指出具体场景、缩放和遮挡问题有助于定向修改。

## English player guide

### Start and the first month

Launch using the [project README](../../README.md#start-playing). On a fresh browser profile, choose the 190 or 200 scenario and a house, then start; Cao Cao is a reasonable first campaign. A valid browser autosave opens automatically, and Campaign menu offers Resume or a confirmed new game with Export available first. Change language with 中文/EN; F1 opens the in-game Wiki during play.

1. Select the ruler's capital. The overview shows gold and food; **City affairs** shows development, population, reserve and monthly work points. Staffing supplies one point per stationed living friendly officer, capped at three.
2. Open **City affairs → Recruit soldiers → assign an officer → Confirm order**. Completion returns to the affairs menu. Recruits enter **city reserve**. Recruitment uses a work point and population; it does not directly increase an officer's army.
3. Return to the city and open **Officers in the city → choose an officer → Set troop count**. Enter the desired **final** troop count, review the changes, then **Confirm order**. Completion returns to that officer. Increasing 800 to 900 assigns 100 reserve soldiers; setting zero returns the force. This also uses the shared work budget.
4. Click your capital on the map, then **March out** in its city window. Choose officers and a destination, check provisions, ETA and defenders, then **Confirm march**. Capital armies depart directly; the window closes and the army appears on the map at the same camera position. City affairs and officers have separate entries; Escape and the footer return one level at a time.
5. Army strength is the sum of the chosen **whole officer forces**. Governor-city proposals may have a shortfall because they protect a minimum garrison, provisions and prior commitments.
6. If a plan needs a decision, accept, accept a reduced amount, wait or cancel. Approved stock is reserved. Departure creates a journey; delivery and battle wait for arrival.
7. Advance one day, ten days or to the next event. Acknowledge critical reports, command your arriving troops in battle, then read the aftermath and follow the order through its return. Routine monthly summaries and rival battles do not pause the clock.

Work points reset at monthly settlement, not by repeated appointments. Long journeys need food for travel and fighting. The world uses 30-day months; reading help and moving the camera do not advance it.

### Governors, economy and weapons

Only your capital accepts direct city work. Other cities are autonomous under governors or local stewards; use supply requests and campaign orders instead of controlling their individual internal actions. You retain tactical command of your forces.

Open **City affairs → Governor appointments** in an autonomous city. Appointment submission returns to affairs, showing its pending status. Candidates show shared availability reasons. Cross-city candidates must have zero troops, travel to the new city and take office at a legal monthly boundary. Existing authority remains until handover. Accepted resource orders protect stock; dispatched parties deliver on arrival. Recall is a return request while the journey permits it, not instant teleportation or removal from an active battle. The map dock opens **Marches & orders** in its own window; reports are in the top-bar Inbox. Critical reports and unsubmitted manual battles explain clock pauses. A battle blocks only its contested city and committed officers. Captured rulers are succeeded by the most loyal free officer; a house falls when no free officer remains.

Supply requests follow **request kind → destination → amounts → review → submit**. Review does not issue an order or spend stock. Full requests still dispatch on submission; shortfalls open the existing accept/reduce/wait/cancel decisions. Completion returns to the request menu, and orders remain in Marches & orders.

Diplomacy follows **house → action → confirmation → house details**. Accepted alliances last six months and block attacks between allies. The confirmation screen shows the acceptance chance or the consequences of breaking a treaty. Coalition invitations have a separate confirmation and return to the diplomacy list. House details link to the in-game rules.

City affairs first asks for an executing officer: recruitment uses force, search and security use intellect, and fixed effects keep their existing formulas. Officers share the city work budget; this does not add individual action limits or task duration.

Open **Officers in the city → choose an officer** for assignment, training, rewards and equipment. Each order has its own screen and returns to the selected officer on success. Prisoners have a separate list and individual decision screen. Fine arms is an officer action: **180 gold and one work point**, up to +5 force, capped at 105. There is no separate weapon inventory, manual weapon-use button or siege equipment. Reward costs 100 gold for up to +15 officer loyalty. Relief costs 80 gold/600 food for up to +15 city loyalty and +300 population. Training needs a stationed officer with troops and adds 25 experience/+1 force; a level-up adds two intellect for archers or two more force for other types, within the attribute cap. Either the experience or force training cap can block it. Farming/commerce development costs 80 gold and a work point for one point of improvement, capped at 500; existing values are not rescaled. Buy/sell trades 800 food for 80 gold. These actions share work points and stock/commitment checks. Search, security and feasts provide the other existing city options. Disabled controls explain authority, resources, staffing, stage, commitments and caps.

### Troops and battlefield actions

Battles are fought on a draggable, zoomable 48×32 top-down board; the attacker enters on the left. The attacker's last route leg picks one of 15 painted battlefields (a few attack directions have their own), and the same leg and direction always give the same field, named in the battle heading. Unit tokens show a small ink squad below 500 surviving troops and a large formation at 500 or more, changing to a crewed boat on water and back on land. The highest-level officer appears as a separate portrait badge alongside a faction pennant, a troop-type seal, a ×N badge for multi-officer formations, the troop count and a strength bar; attackable enemies have a red ring, confused or inspired units an icon, acted units turn grey and routed units fade. Zoomed far out, squad art remains while portraits and secondary badges hide; the Grid button hides the grid lines. The painting illustrates the grid; inspect a cell to see whether it counts as plain, forest, hill, water or cliff.

| Type     | Base movement budget | Ordinary range |
| -------- | -------------------- | -------------- |
| Infantry | 3                    | 1              |
| Cavalry  | 5                    | 1              |
| Archers  | 3                    | 3              |

Budgets are movement points, not guaranteed tiles. Forest/hills cost more for most types; cavalry pays more. Occupation, enemy zone of control and water affect reachable cells. Formations can group same-type officers. Militia cannot use tactics. Waterborne units retain their infantry, cavalry or archer identity and share the same water penalties.

Select a living friendly formation, click a highlighted reachable cell to move, then attack an enemy in range or choose a tactic and a legal target. Units normally move once and act once per battle day. Read damage/counterattack/tactic forecasts first. The conditions panel shows weather/next weather, food, range/movement, force/intellect/level and terrain multipliers. Clicking a tile inspects it **and still executes a legal move or attack**.

| Tactic        | Base side-wide point cost | Basic requirement                                                                 |
| ------------- | ------------------------- | --------------------------------------------------------------------------------- |
| Fire          | 4                         | Intellect 60; weather/terrain/water affect damage.                                |
| Confuse       | 3                         | Intellect 70; chance to make the enemy lose its next turn.                        |
| Rally         | 2                         | Intellect 50 or force 85; friendly morale, confusion recovery and next-hit bonus. |
| Raid supplies | 4                         | Intellect 60 or cavalry; targets enemy provisions.                                |
| Ambush        | 3                         | Intellect 60, standing in forest, not moved today.                                |
| Rockfall      | 4                         | Intellect 65, standing on a hill; hill targets are excluded.                      |

At level 3, intellect thresholds drop by 10. Cunning can reduce point costs. Use the actual panel for current cost, range, legal targets and rejection reasons. General tactic range is two, or three for archers/intellect ≥80; Ambush/Rockfall cap at two. Points are shared by your side, regenerate two per battle day and cap at 30. Low morale, militia, prior action, missing points or missing legal targets can prevent a tactic.

All types can cross passable water without a naval skill or boat inventory. A step touching water costs at least two movement points. A unit on water deals ×0.75 attack damage and receives ×1.25 troop damage. Shore/water attacks are legal in normal range. Cliffs are impassable for everyone. Tactical water access does not create arbitrary strategic sea routes.

Submit End battle day in **every player battle**; the global day advances once. NPC-only battles resolve automatically. Normal battles time out at 30 days, raids at 10: more surviving troops wins, defender wins ties. Elimination, an opposing camp capture or withdrawal can end a battle earlier. Camps give no hidden city-defense bonus. Withdrawal confirmation concedes the whole battle; Cancel/Escape preserves state.

Soldier level is separate from officer level. Mean soldier XP starts at 0, with one level per 100 XP up to level 20 / 1900 XP. Levels 11–20 display heavy infantry, elite cavalry or strong archers; reinforcement can dilute mean XP and return them to ordinary art. The 500-soldier size threshold, leader portraits and commander-based boat/tower-warship selection still apply independently. Officer details, battle details and reserves show mean XP and distance to the next level.

**Set troop count** previews actual before/after counts, levels, experience and formations, including elite downgrades. Experience travels with soldiers and only same-type reserves can reinforce an officer. Normal losses preserve the survivors' mean; annihilation resets it. Battle aftermath lists each original contingent's capped XP gain, level change and promotion, with separate notices for no combat participation and annihilation. Reports retain the historical result after later reinforcements or reloads.

Capture takes a city after victory. Raid plunders and returns without taking it; Sack combines capture with destructive plunder. Loot and returning survivors still travel. There is no siege phase.

### Controls, saves, endings and troubleshooting

- Campaign: wheel/buttons zoom, drag/arrows pan, Home/Fit shows the atlas; minimap repositions. Tab/Enter/Space selects cities.
- Battlefield: Fit shows the field; Unit focuses selection; Camps shows camps. With map focus, arrows move the cell cursor and Enter/Space executes; Shift+arrows pans, +/- zooms, Home fits. Minimap moves the viewport.
- Wiki: F1 opens during play, Escape closes or cancels a confirmation. Language/camera/help do not change the date.
- Saves: one autosave per browser profile/address; Export creates a portable backup independently. A different port/browser/private session has separate storage. Keep the tab open and export if saving fails, then Retry save. Only v0.3 imports are accepted; invalid imports preserve the campaign/drafts, valid imports reset transient controls.
- Victory: all-city unification or Luoyang plus at least 16 cities held across 12 consecutive monthly boundaries for Hegemon. Protect your capital; losing it can end your campaign.

If time stops, inspect due reports and unfinished player battle submissions. If a march is empty, check whole-officer strength, garrison, food, available officers, reserved stock and route. If recruitment seems ineffective, assign reserve soldiers. If a governor has not changed, check travel and the month boundary. Fit before zooming when a map is confusing.

The candidate's strategic pacing and artwork still need player review. Report scenario/house, game date, locale, browser/viewport, exported save and reproduction steps using the [test record](../next-steps.md#player-test-record). Four long sessions, real low-end hardware and draft-art approval remain open; automated diagnostics are not a player win-rate claim.
