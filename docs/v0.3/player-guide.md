# v0.3 player guide / 中英玩法指南

Updated October 28, 2026 against the current working tree. [Overview](README.md) · [Release notes](release-notes.md) · [Known limits](implementation-status.md). The game itself has searchable Chinese/English Wiki help; this guide covers the same current version, not the older Pixi game.

## 中文玩法指南

### 1. 开始与目标

按[根 README](../../README.md#start-playing)启动本地服务，打开 Vite 地址。首次游玩时选择 190 或 200 剧本及势力，再点“开始新战役”；新手可从曹操开始。如已有有效自动存档，游戏会直接恢复，通过“战役菜单”可继续或新开，新开前会确认并提供导出。

每月抽象为 30 日。你经营君主本城，向其他城市征调物资或下达出征令，并在交战时指挥己方部队。可以控制全部城市完成统一，或在每个月界持有洛阳及至少 16 城，连续 12 个月界达成称霸。两种结局分开统计。君主被俘后由最忠诚的自由武将继位；没有自由武将时势力覆灭。

主界面以大地图为主，点击城池后才打开操作窗口。“返回城池”回到本城概况，“返回大地图”或关闭按钮回到原地图位置；Esc 逐层返回。

城池概况直接显示守军、预备兵、粮食、金钱、农业、商业、人口和治安／民心；治安与民心是同一个城市数值。城务中另显示可用工作点（未用点数最多累积 6 点）。

### 2. 第一月：征募 → 分配 → 出征

1. 在大地图点击君主本城，打开城池窗口，概况显示金粮，再点“城务”查看农商、预备兵、人口及可用工作点。每城每旬（10 个游戏日）增加 2 点，未用点数可累积至 6 点，执行事务仍需在世己方驻将；武将进出不改变额度，迁都、任免不刷新已用点数。
2. 在“城务”选“征募士兵”，指派执行武将，查看变化后点“确认执行”，成功后返回城务菜单。征募先把人口转为**预备兵**，不会直接增加武将带兵数。征募也会消耗工作点并降低少量民心。
3. 返回城池，依次进入“驻城武将 → 选择武将 → 调整兵力”，输入希望的**最终带兵数**，核对变化后点“确认执行”。完成后返回这名武将的详情。例如从 800 改为 900，会从预备兵分配 100；改为 0 会归还所部。配兵不耗工作点，仍受兵种、兵员、整编和已有承诺限制。
4. 返回城池概况，点“出征”，勾选随军武将，选择目标并核对军粮、行程和敌军；点击“确认出征”。君主本城直接派出所选武将，窗口关闭并回到原位置的大地图，显示部队行军标记。
5. 出征兵力等于所选武将**整支所部**之和。太守城市的方案仍可能因最低留守、预留与军粮出现缺口，需接受缩减、等待或取消。
6. 方案若需要决策，可接受、接受缩减、等待足额或取消。出发后会出现实际行程；未抵达不会瞬间获得目的地资源或开战。
7. 推进一日或到下个事件。关键报告需要确认，普通月报与天下纪事不会暂停；军队会行军、吃粮、到达并开战。胜败之后仍需处理驻留或返程。

地图上方的状态栏显示本城工作点、各城金粮合计及下月变化、进犯我方的敌军、进行中的战斗、待决事项和带兵武将；点击即可前往对应城池、战场或名单。敌军一旦出发进犯我方城池，收件箱会通报来源、约数兵力与抵达日期，地图以红色标出该军，城池旁显示剩余天数；“下个事件”会在当日停下，但不阻止逐日推进。不针对我方的诸侯征战仍只记入天下纪事。

城务直接进入核对页并预选推荐执行武将（可点“重新指派武将”更换）。征兵会建议本城武将可统领的最便宜兵种，并列出可统领者。“预备兵补入武将”（城务、驻城武将或出征页）不耗工作点，按武力从高到低把同兵种预备兵补入驻将。预览会显示每项事务此后每月的影响，例如新兵的开支与税基损失、开发的回本时间；城池概况显示每月收入、开支与存粮可支撑时长。出征页只列出可达目的地并按行程排序，说明不可选原因，对比所需与可用军粮，并列出尚需配兵的武将。

配兵、归还所部、赏赐和装备不耗工作点，保留原有资源成本与限制；其他城务每次消耗 1 点；用尽需等下个旬界。“恢复民心”已取消：治安不花钱且恢复更多。太守和 AI 同样执行。迁都或任免不会刷新额度。长途出征要留够城市运转、行军和战斗的粮食。

### 3. 太守、地方自治与订单

普通武将跨城调动：打开出发城的“城务 → 武将调动”，勾选多人或全选可用驻将，再选择另一座己方城池。确认前查看健全兵、伤兵、行程天数和去返路粮；确认后携带整支所部出发，不耗工作点。途中暂停治疗和整编，抵达后直接驻城，无需任命或等待月界。兵种、经验及整编状态保留；君主、现任太守、待赴任或已被批准命令占用的人选显示不可选原因。可从“军情与命令”查看在途队伍。

工作点在每月第 11 日、第 21 日和下月第 1 日各增加 2 点，未用点数可累积，最多 6 点（一个月的量），跳过时间不再浪费。推进十日和逐日推进采用同一游戏时间；遇报告或战斗提前停下，只计算实际经过的天数。面板显示可用点数与距下次增加的游戏日数。收入、粮耗、任职交接及自动搜索、首次自动配兵次数仍按原月度规则结算。旧存档保留原有消耗，跨过下个旬界后照常累积。

君主本城可以直接内政。其他城市由正式太守或地方班底自治，不能逐项控制其农业、装备或编兵；你仍可查看库存、征调金粮兵、下达出征令、任免太守并临阵指挥。

点击己方自治城市，进入“城务 → 太守任免”，在“太守人选”中查看候选人及不可用理由。任职和调任均无需先清空所部。跨城调任携带现有健全兵与伤兵，保留兵种、经验和整编状态；出发时扣除来源城守军和去返路粮，途中不治疗或推进整编，抵达后在合法月界就任。原职和目的地当前治理持续到实际交接，不会点击后立即换城或刷新工作点。选择君主表示亲治：实际就任时同步切换君主本城，原本城转为自治；待赴任期间仍保留原本城。

攻占城市并确认战报后，自动选择新城治理方式：“自任太守”需要君主已经抵达，将新城设为君主本城，原本城转为地方班底维持，两城库存、兵员和已用工作点保留；“任命太守”允许同城驻将保留所部立即就任，跨城人选沿用调任行程和月界。可点“稍后处理”，暂由地方班底维持，并从收件箱的治理待办继续；连续攻城逐城处理，未决事项读档后仍保留。

从城池进入“调拨物资 → 选择命令 → 选择目的地 → 填写数量 → 查看方案”，核对后再提交。核对页返回不会生成订单或扣除资源；足额请求按原规则直接出发并返回请求菜单，有缺额时进入答复页，接受、缩减、等待或取消后返回菜单。待答复方案退出后可继续查看，订单也保留在“军情与命令”中。

资源订单的目的地是友城。答复说明可执行量、缺额、最早出发和预计到达；接受后保留相应资源，出发后从来源库存扣除，到达才交付。已派出且仍允许返程的行程可请求召回；进入战斗后不能瞬间召回。目的地易手或容量不足等情况会有报告。

含兵力的调拨会按实际路线另备单程路粮，骑兵粮耗为两倍；确认页显示额外开销。出发时扣除交付物资和路粮，途中消耗路粮，余粮随队到达。路粮不足的部队不会出发，可以等待或缩减请求。该扣粮修正适用于新出发行程，不追溯扣除旧存档中已在途部队的出发粮。

从地图打开“外交 → 选择势力 → 结盟或解盟”，核对成功率或解盟后果后确认，得到答复后返回该势力详情。有效同盟持续六个月，期间双方不能互相出征。提议页逐项列出成功率的加减：对方君主仁德 +10、勇猛 −10，我方是最强势力或对方正在进犯我方各 −30，解盟后二十四个月内 −30，我方仅有两城或更少 +15。结盟时距目标超过五日的出征部队返程，五日以内的照常交战。

敌对势力依君主性格行事（外交页和武将资料可见）：勇猛者胜算较低也出兵并会劫掠攻不下的城池，仁德者谨慎且不亲征，智谋者更看重伤亡，贪婪者偏好富庶城池并会劫掠。劫掠不夺城，但守方战败会损失金粮、民心与开发。攻占的城池民心最高 50（仁德君主 60）。详见游戏指南“敌对势力”。联盟邀请有独立的确认页，加入后返回外交列表。势力详情中的游戏指南可查看规则说明。

对同一势力每月只能提议一次，成功或失败都会记次；解盟当月也不能向对方重新提议。其他势力分别计次，读档不会重置。

地图底部“军情与命令”和顶栏“收件箱”列出全部当前事项，可滚动查看。时间停住时先看报告的到期数量，以及是否还有己方战场未提交本日指令。纯 NPC 战斗会自动处理，不需要你替敌军操作。

### 4. 装备与本城经营

宴饮可勾选本城在世己方驻将并全选，只有所选者获得最多 8 点忠诚，整场耗 1 点工作点。赏赐、赐予兵器同样支持多选与全选可用武将：分别按每人 100 金、180 金合计，不耗工作点；忠诚已满、已有兵器或武力封顶者会说明原因。确认前显示人数、总费用及各将实际变化；无选择、资金不足或人员失效时整批不执行。

发展、征兵、搜索和治安等城务先选择执行武将；宴饮直接勾选参与者，普通调动另选驻将与目的城。征兵按执行者武力计算人数，搜索和治安使用其智力；农业、商业等固定效果保持原样。每城共用每旬固定 2 点；配兵、归还所部、赏赐和装备不耗点，不新增个人行动次数或任务占用时间。

赏赐、装备、训练和配兵从“驻城武将 → 选择武将”进入，每次只打开一项操作，确认后回到武将详情。俘虏从“驻城武将 → 俘虏 → 选择俘虏”进入，处置后返回俘虏列表；“劝降本城全部俘虏”对本月尚未劝降的每名俘虏各试一次。俘虏每到月界忠诚 −5，劝降成功率（100 减忠诚）随之上升；敌方只要供得起口粮便会关押并每月劝降。城务操作在确认前显示预计变化；未确认时返回不会消耗资源或工作点。

| 操作             | 当前作用与注意事项                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 精良兵器         | 选武将配发，180 金、不耗工作点；武力增加最多 5，上限 105。不是拾取后拖到战场使用的道具，没有独立武器背包或攻城兵器操作。                                                                                                                          |
| 赏赐             | 100 金、不耗工作点，单将忠诚最多 +15。                                                                                                                                                                                                            |
| 训练             | 需要驻城且带兵的武将；每次武将经验 +25，不再直接加武力。参战武将在战斗结算时另得所部战斗经验的一半。每 100 经验升一级，升级时弓兵智力 +2，其他兵种武力 +2，受属性上限约束（武力 100，精良兵器 105）。经验到 500 或 5 级后禁用，旧档更高经验保留。 |
| 赈济             | 80 金、600 粮、一个工作点；城市民心最多 +15、人口 +1,500。                                                                                                                                                                                        |
| 发展农商         | 各花 80 金和一个工作点，农业最多 +20、商业最多 +10，上限为 500。临近上限显示实际增量；已有数值不重算，达到上限时不可继续发展。                                                                                                                    |
| 买卖粮食         | 买入 2,000 粮花 200 金；卖出 2,000 粮得 200 金，也共用工作点，受库存和已批准预留限制。                                                                                                                                                            |
| 搜索、治安、宴饮 | 分别寻找可加入武将、恢复城市民心、提高驻城武将忠诚；效果和不可用原因在反馈及面板中显示。                                                                                                                                                          |

灰色按钮先看理由：权限、阶段、工作点、库存、已有承诺、无合适武将、属性上限均可能造成限制。地图上的“预备兵”和武将“带兵”是不同数字。

城市民心只调整月税收：原基础税收先向下取整，再乘以 `0.8＋民心／500`，最终向下取整，系数范围 80%–100%；粮食与征兵公式不变。武将忠诚保留继位和俘虏处置作用，自治仅在驻将忠诚低于 55 时考虑赏赐或宴饮。

### 5. 基础兵种与水上单位

下表是基础行动预算，不等于每次一定能走这么多格。林地、丘陵、水陆边界、占位和敌方控制区都会影响可达格。射程按逻辑格计算，不按画面像素距离。

| 兵种          | 基础移动预算 | 普通攻击射程 | 使用提示                                 |
| ------------- | ------------ | ------------ | ---------------------------------------- |
| 步兵 Infantry | 3            | 1            | 常规近战部队。                           |
| 骑兵 Cavalry  | 5            | 1            | 平地机动快；林地/丘陵费用较高。          |
| 弓兵 Archers  | 3            | 3            | 可远射，在正常射程内可从岸上打水中目标。 |

同类武将所部可在战场上合并显示为编队；单位兵力不等于单名武将的完整个人面板。民兵是守军编组的一种，不能使用计策。

### 6. 战斗操作、计策与水战

己方部队手动移动成功后，会在附近弹出“攻击、计策、待命、关闭”。选攻击或具体计策后，菜单收起，再在地图点击高亮目标才执行；关闭不撤销移动，也不消耗剩余行动，可重新选中该部队打开菜单。没有合法目标的选项显示不可用原因，自动指挥和失败移动不弹出。

战场是 48×32 的正俯视方格大地图，可以拖动和缩放，每方最多 10 个编队；攻方从左侧入场，守方在右侧。打哪张战场由进攻方走的最后一段路线决定（另有几种按进攻方向的特例），同一路线同一方向每次都是同一张图，例如过黄河会打"黄河津渡"，出斜谷攻长安会打"河谷川地"。战斗标题显示战场名。部队主体使用水墨编队图，下水后变为载兵小船、上岸恢复；按当前存活兵力显示：少于 500 人用小队，500 人及以上用大队，船只暂不分规模。左上角保留编队统领的小头像：右上角小旗是势力色，左下角是兵种，右下角"×3"表示编队里有三位武将，下方是兵力数字和兵力条。可攻击的敌军有红圈，混乱或鼓舞的部队上方有小图标，已行动的部队变灰，溃败的部队半透明。缩得很小时，保留小队图，隐藏头像和次要标记；图片无法加载时显示兵种字。"网格"按钮可以隐藏格线。画面只是格子的插画：每格算平原、森林、丘陵、水还是峭壁，以检查格子时显示的地形为准。选己方存活部队，点绿色可达格移动，选射程内敌军普通攻击，或先选计策再选合法目标。普通部队每战斗日通常一次移动、一次行动；“待命”用于结束该部队行动。先看伤害/反击或计策预览，再执行。

| 计策               | 基础计策点 | 基础条件                                                          |
| ------------------ | ---------- | ----------------------------------------------------------------- |
| 火计 Fire          | 4          | 智力 60；天气、地形和水上状态会影响伤害。                         |
| 混乱 Confuse       | 3          | 智力 70；有成功率，命中会让目标失去下一次行动。                   |
| 鼓舞 Rally         | 3          | 智力 50 或武力 85；对己方目标恢复士气、清除混乱并提供下一击加成。 |
| 劫粮 Raid supplies | 4          | 智力 60 或骑兵；针对敌军粮草。                                    |
| 伏兵 Ambush        | 3          | 智力 60，自己在森林，且当天尚未移动。                             |
| 落石 Rockfall      | 4          | 智力 65，自己在丘陵；丘陵目标不在合法目标中。                     |

这是基础值：等级达到 3 时智力要求降低 10，机谋特性可减计策点费用；以当前计策面板列出的实际费用、范围和禁用理由为准。普通计策范围通常 2 格，弓兵或智力 ≥80 可到 3 格；伏兵/落石最多 2 格。计策点由同一方共用，每战斗日恢复 2，上限 30。溃败、动摇、已行动、民兵、点数不足或无合法目标均可能阻止施放。火计打林中目标、或智力远高于对手时在风天施放，伤害高于普通攻击且不受反击；落石另扣 10 点士气，雨天照样有效。

两军部署相距约 15 列，通常两三日内接战。与敌军相邻的部队被牵制、不能移动，但已溃散的部队可向相邻空格退一步。士气开战为 80；粮草充足且一个战斗日内未损兵的部队，次日恢复 5 点士气（最多到 80）。低于 40 动摇（伤害 −15%、不能用计），低于 20 溃散（只能移动或待命）。

“战场状况”一行显示天气→次日、双方粮草和所选部队的移动/射程；“地形与倍率”展开后显示武力/智力/等级及检查地形的倍率。“?” 可打开战斗指南。标题栏显示若此刻到时限谁胜。我方与敌方部队分列，敌方列表显示其计策点及每支部队的武力/智力。选择攻击时，射程内目标旁显示我方造成/承受的伤亡、目标攻击后士气以及是否将溃散或歼灭；鼠标停在绿色格上会圈出从该格可攻击的敌军。结束战斗日后地图回放敌军回合（“跳过”或 Esc 直接看结果），随后汇总敌军攻击、我军损失及动摇/溃散的部队。战况按日排列，双方的移动与待命各合并为一行，可展开查看。点击格子会检查状态，**合法移动或攻击仍会执行**；检查不是单独的安全浏览模式。

所有兵种可进出可通行水格，不需要水军技能或船库存。涉及水的每步至少花 2 移动点；在水上攻击 ×0.75、受到兵力伤害 ×1.25，上岸恢复陆地规则。岸水互攻只需满足正常射程；峭壁所有兵种均不可进入。战场能涉水不代表大地图能离开配置路线任意渡海。

全部己方战场都提交“结束战斗日”后，全局只推进一天。一场结束后，关闭战报会显示未完战斗；若剩余战场都已提交，可点“推进一日”继续本日结算，读档后同样可继续，不会重复推进日期。非玩家战场自动处理。正常/突袭上限分别为 30/14 日，到时可战兵力多者胜、平手守方胜；击溃、士气溃败或撤退可提前结束。敌将按性格作战：武力远高于智力或勇猛者冒进，智谋之士固守并多用计；敌军改变态势时战况会写明。委任指挥不会擅自撤退，诸将想撤时会关闭委任并发出报告，请你亲自指挥或下令撤退。“整军撤退”无需选择棋子，确认后放弃整场战斗，取消或 Escape 不改变战况或抽取被俘结果。

任务分别是占领、突袭和洗劫：突袭胜利后掠取并返程，不夺城；洗劫在夺城基础上破坏和掠夺，会损害城市。需要资源时也要考虑长期损失。

### 伤兵、撤退、被俘与恢复

君主被俘时仍立即选出继任者，势力有继任者就会继续存在，并以现任君主姓名显示。招降被俘君主成功时，原势力其余在世武将忠诚与所属城池民心各下降 10 点，最低为 0；招降失败、释放、交换或处决均不触发这项下降。被俘君主身份随存档保留，原所部整编、归还及月度尝试次数规则不变。

征兵时确定步、弓或骑，一名武将只带一种基础兵种；可战兵与随将伤兵合计最多 10000。有效战斗减员的 60% 成为伤兵，40% 永久损失，小额伤害累计余数。可战归零是击溃，仍可能有伤兵；只有两者都归零才是全灭并清空兵员经验。5000 精骑全部失去战斗力时，可留下 3000 伤兵；伤兵保留经验，不能在战场行动或治疗。断粮减员是永久损失。

有合法退路时，未接战撤退被俘率为 0%，接战后有序撤退为每将 5%，击溃或士气溃败的被迫溃退为每将 25%。各将独立判定，确认框也显示至少一将被俘的概率；无退路明确显示整军投降。守方失城也按此判定。逃脱者真实行军：有序撤退带走全部随军生还者，被迫溃退只带走三分之二随军伤兵。友城正在交战可城外等待，不自动增援。

新出征自动把旧伤兵留在本城，保留来源和经验。城内有粮、完整驻留一日后，每城按兵种汇总恢复 10% 伤兵并向上取整；首日 3000 恢复 300，约 22 个有效日恢复九成。在途、城外等待和战场上不治疗。留城老兵在原将同城、同势力、未被占用且有容量时自动归队，否则作为独立可用兵源保留；不同兵种不能混补。

将军被俘时随军所部一起被俘，后方旧伤兵不连带改投。招降成功保留兵种和经验，但所部需 10 个己方有粮驻城日整编，期间不能作战或征调；治疗可同时进行，被看押或在途不推进整编。释放、成功交换均真实返乡，由看押城拨付现有粮食内的返程预算，不凭空补粮；无可达归属城时，释放武将并将所部遣散为当地人口。招降、交换每月一次尝试，交换失败双方也计次，失败后仍可释放或处决。处决武将时所部遣散，不成为胜方兵。失城时城内预备兵、旧伤兵及未参战整编人员散编，不自动加入占领军。

所部、预备兵、待归队老兵、伤兵与俘虏均吃粮，骑兵两倍；俘虏由看押方供粮，不另付己方兵饷。在“驻城武将”或武将详情展开“兵员、养伤与遣散”，查看分项和遣散预览；遣散无需工作点，永久移除对应人员与经验。各城武将均可不耗工作点“归还全部所部”，伤兵继续在城休养，不免粮。出征、战报和俘虏处置均显示实际可战、伤兵与限制。

自治城也可归还全部所部，且无需太守剩余工作点，方便调整留守与后方休养；任职和普通调动均不要求先归还所部。归还会取消该将所有同城旧兵源的自动归队，保留兵种、兵员经验与整编限制。自治补兵现在覆盖普通驻将，保留同兵种 1000 预备兵并遵守伤兵容量、整编和订单承诺；待就任人选不会被重新配兵。治安已满、所有驻将忠诚已满、兵力数不变的命令不能确认，也不消耗工作点。

### 7. 镜头、快捷键与存档

- 主地图：滚轮/按钮缩放，拖动或方向键平移，Home/Fit 显示全图，小地图可定位；Tab 后 Enter/空格可选城市。
- 快捷键（输入框外）：空格推进 1 日，Shift+空格推进 10 日，N 至下一事件，I 收件箱，O 军情与命令，C 君主本城，D 外交；战场中 W 待命、E 结束战斗日。每次推进都会说明停下的原因与日期。
- 战场显示：“放大战场”铺满窗口，“全屏”进入浏览器全屏；“显示面板”可分别切换指令栏、小地图、操作提示、全局顶栏和战场列表。退出放大恢复原布局，Escape 优先取消当前操作/弹窗。隐藏指令栏时，底部仍有托管、结束战斗日及更多行动中的撤退。
- 战场：Fit 全图，Unit 聚焦所选部队；小地图移动视口。地图获得焦点后方向键移动格子光标，Enter/空格执行该格操作；Shift+方向键平移镜头，+/- 缩放，Home 全图。
- 游戏中 F1 打开 Wiki，Escape 关闭 Wiki 或取消确认框。中英切换和读指南不推进时间。
- 自动存档只有一个；“导出”另存下载文件。“导入”只接受含人员结构标记的合法 v0.3 存档；伤兵功能之前的旧档不兼容、不自动迁移。开始页允许先导出旧档原文，新开确认取消时保留旧档。成功导入清空旧草稿，失败保留本局。
- 存档属于浏览器配置与地址；换端口、浏览器、隐身窗口或清理网站数据可能看不到原档，先导出。自动保存失败时保持页面打开、导出备份，再重试保存。

### 8. 常见疑问与反馈

| 现象                | 先检查                                                                             |
| ------------------- | ---------------------------------------------------------------------------------- |
| 时间不走            | 确认到期报告，并提交每场己方战斗的本日；若其余战场均已提交，点“推进一日”继续结算。 |
| 征兵后武将兵力没变  | 新兵在预备兵；还需“调整兵力”。                                                     |
| 出征方案为零或很少  | 整支所部、武将是否可用、留守要求、已批准预留、粮食和路线；方案会列出缺口。         |
| 任命没立刻生效      | 跨城人选可携带所部调任，须抵达后等合法月界就任。                                   |
| 地图部队很小/看不全 | 开战时镜头已对准己方部队；Fit 看全图，再缩放或用 Unit 聚焦。                       |
| 战绩不容易扩大      | 当前战略平衡仍有限；不要把诊断机器人结果当作个人胜率。记录实际体验供下一轮修订。   |

提交问题时附剧本/势力、日期、语言、浏览器/视口、导出存档、复现步骤和预期/实际结果。[玩家测试记录模板](next-steps.md#player-test-record)。素材仍是草稿；指出具体场景、缩放和遮挡问题有助于定向修改。

## English player guide

### Start and the first month

Launch using the [project README](../../README.md#start-playing). On a fresh browser profile, choose the 190 or 200 scenario and a house, then start; Cao Cao is a reasonable first campaign. A valid browser autosave opens automatically, and Campaign menu offers Resume or a confirmed new game with Export available first. Change language with 中文/EN; F1 opens the in-game Wiki during play.

1. Select the ruler's capital. The overview shows garrison, reserve, gold, food, farming, commerce, population and public order/city loyalty (one shared city value). **City affairs** also shows the ten-day work budget. Every owned city refreshes to two points every ten game days and still needs a living friendly stationed executor. Officer movements do not change the quota; capital moves and appointments preserve spent work.
2. Open **City affairs → Recruit soldiers → assign an officer → Confirm order**. Completion returns to the affairs menu. Recruits enter **city reserve**. Recruitment uses a work point and population; it does not directly increase an officer's army.
3. Return to the city and open **Officers in the city → choose an officer → Set troop count**. Enter the desired **final** troop count, review the changes, then **Confirm order**. Completion returns to that officer. Increasing 800 to 900 assigns 100 reserve soldiers; setting zero returns the force. Assignment uses no work points; troop type, reserve, reorganization and existing commitments still apply.
4. Click your capital on the map, then **March out** in its city window. Choose officers and a destination, check provisions, ETA and defenders, then **Confirm march**. Capital armies depart directly; the window closes and the army appears on the map at the same camera position. City affairs and officers have separate entries; Escape and the footer return one level at a time.
5. Army strength is the sum of the chosen **whole officer forces**. Governor-city proposals may have a shortfall because they protect a minimum garrison, provisions and prior commitments.
6. If a plan needs a decision, accept, accept a reduced amount, wait or cancel. Approved stock is reserved. Departure creates a journey; delivery and battle wait for arrival.
7. Advance one day, ten days or to the next event. Acknowledge critical reports, command your arriving troops in battle, then read the aftermath and follow the order through its return. Routine monthly summaries and rival battles do not pause the clock.

The strip above the map shows your capital's work points, total gold and food with next month's change, armies marching on your cities, active battles, decisions waiting and officers with troops; each entry opens the relevant city, battle or list. When a rival army departs toward one of your cities, an inbox update gives its source, approximate strength and arrival date, the army appears on the map in red, and the city shows the days remaining. **Next event** stops on that day; it does not block day advances. Rival wars that do not target you stay in the world chronicle.

City work opens directly on its review with the recommended executor (**Choose another officer** to change it). Recruitment suggests the cheapest troop type a local officer can lead and lists who can lead it. **Fill officers from reserve** (City affairs, Officers in the city or March out) moves matching reserve soldiers to the stationed officers for free, strongest commanders first. Previews show each action's lasting monthly effect, such as a recruit's upkeep and lost tax or a development's payback time, and the city overview shows monthly income, upkeep and food runway. The march form lists only reachable destinations, nearest first, explains blocked ones, shows provisions needed against stock and lists officers who still need troops.

Each city gains two work points every ten actual game days; unused points carry over up to six, one month’s worth. Restore loyalty is retired: security is free and restores more. Monthly income and office handovers remain monthly. Capital changes, appointments and departing officers do not refund points. Long journeys need food for travel and fighting. The world uses 30-day months; reading help and moving the camera do not advance it.

### Governors, economy and weapons

Ordinary officer transfers: open the source city’s **City affairs → Transfer officers**, check one or more officers and choose another friendly city. Review healthy troops, wounded, travel days and outbound/return provisions before confirming. Transfers use no work points, preserve whole contingents and arrive as stationed officers immediately, without an appointment or monthly wait. Healing and reorganization pause in transit. Rulers, serving governors, pending appointees and officers committed to approved orders show why they are unavailable. Track travelling parties in **Marches & orders**.

Feasts let you check local friendly guests or select all, costing one work point for the entire feast and adding up to 8 loyalty only to selected officers. Rewards and fine arms support the same selection, costing 100 and 180 gold per recipient without work points. Review headcount, total cost and actual gains before confirming; an unaffordable or invalid group is rejected in full.

Only your capital accepts direct city work. Other cities are autonomous under governors or local stewards; use supply requests and campaign orders instead of controlling their individual internal actions. You retain tactical command of your forces.

Open **City affairs → Governor appointments** in an autonomous city. Appointment submission returns to affairs, showing its pending status. Candidates show shared availability reasons. Appointment and transfer do not require clearing the contingent. A transfer carries healthy and wounded personnel with their type, XP and reorganization intact. Departure debits ready soldiers and outbound/return provisions from the source. Treatment and reorganization pause during travel; office changes at a legal monthly boundary after arrival. Existing authority remains until handover. Accepted resource orders protect stock; dispatched parties deliver on arrival. Recall is a return request while the journey permits it, not instant teleportation or removal from an active battle. The map dock opens **Marches & orders** in its own window; reports are in the top-bar Inbox. Critical reports and unsubmitted manual battles explain clock pauses. A battle blocks only its contested city and committed officers. Captured rulers are succeeded by the most loyal free officer; a house falls when no free officer remains.

After a conquest report, choose the new city's governance. **Govern personally** requires the ruler to be present and moves the ruler's capital; the old capital returns to stewardship. Both cities retain stock, personnel and spent work points. **Appoint a governor** allows a local officer to take office immediately with their contingent, while remote candidates travel and wait for a monthly boundary. **Decide later** leaves local stewardship and keeps an Inbox task. Captured cities are handled in order and pending choices survive reload.

Open **Send supplies** in the sending city; the flow is **request kind → destination → amounts → review → submit**. Review does not issue an order or spend stock. Full requests still dispatch on submission; shortfalls open the existing accept/reduce/wait/cancel decisions. Completion returns to the request menu, and orders remain in Marches & orders.

Troop transfers separately provision the actual outbound route, with double food for cavalry. Review shows this additional cost. Departure deducts cargo plus provisions; travel consumes provisions and delivers any remainder. Underfed forces cannot depart. This applies to new departures; existing journeys in older saves are not retroactively charged.

Diplomacy follows **house → action → confirmation → house details**. Accepted alliances last six months and block attacks between allies. The confirmation screen shows the acceptance chance term by term (a benevolent ruler +10, a fierce one −10, −30 when you are the strongest house or their army is marching on you, −30 for 24 months after breaking a treaty, +15 while you hold two cities or fewer) or the consequences of breaking a treaty. A new treaty turns back armies more than five days from their target; closer ones still fight.

Rival houses act on their ruler’s traits, shown on the diplomacy page and officer profiles: fierce rulers march at worse odds and raid cities they cannot take, benevolent ones wait for clear odds and never lead in person, cunning ones weigh losses heavily, greedy ones prefer rich cities and raid. A raid takes no city, but a defeated defender loses gold, food, loyalty and development. A conquered city starts at no more than 50 loyalty (60 under a benevolent ruler). See **Rival houses** in the in-game guide. Coalition invitations have a separate confirmation and return to the diplomacy list. House details link to the in-game rules.

Each target house allows one proposal per month, including failed offers. Breaking a treaty also prevents another proposal to that house until next month. Other houses have separate limits; loading does not reset them.

Development, recruitment, search and security ask for an executing officer; feasts select guests directly, and ordinary transfers select officers and a destination. For work with an executor, recruitment uses force, search and security use intellect, and fixed effects keep their existing formulas. Officers share the city work budget; this does not add individual action limits or task duration.

Open **Officers in the city → choose an officer** for assignment, training, rewards and equipment. Each order returns to that officer on success; reward/equipment screens also permit group selection. Prisoners have a separate list and decision screen; **Ask every prisoner here to serve** tries each captive not yet asked this month. Captives lose 5 loyalty at every month boundary, so the chance (100 minus loyalty) improves; rival houses hold captives and ask monthly while they can feed them. Previews are read-only; returning before confirmation spends nothing.

| Action                            | Cost and effect                                                                                                                                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fine arms                         | 180 gold/person, no work points; up to +5 force, cap 105. Existing arms or a full force cap blocks another grant.                                                                                                                                                                                        |
| Reward                            | 100 gold/person, no work points; up to +15 loyalty.                                                                                                                                                                                                                                                      |
| Feast                             | 1 work point for the whole group; up to +8 loyalty for checked guests only.                                                                                                                                                                                                                              |
| Training                          | 1 point; +25 officer XP and no direct force. Officers who fight also gain half their troops’ battle XP at settlement. Each 100 XP is a level: +2 intellect for archers or +2 force for other types, within the cap (100, or 105 with fine arms). Blocked at 500 XP/level 5; higher saved XP is retained. |
| Relief                            | 1 point, 80 gold and 600 food; up to +15 city loyalty and +1,500 population.                                                                                                                                                                                                                             |
| Development                       | 1 point and 80 gold; up to +20 farming or +10 commerce, cap 500. Existing values are not rescaled.                                                                                                                                                                                                       |
| Food trade                        | 1 point; buy/sell 2,000 food for 200 gold, subject to stocks and reservations.                                                                                                                                                                                                                           |
| Assignment and contingent returns | No work points; preserve personnel/type, reserve, capacity and reorganization checks. Assignment sets a final healthy troop count.                                                                                                                                                                       |
| Ordinary transfer                 | No work points; deduct actual route and possible-return provisions and move the whole selected party.                                                                                                                                                                                                    |
| Search and public order           | 1 point; previews explain availability and effects without exposing the random search result.                                                                                                                                                                                                            |

Governors and AI share the work-point costs and refresh. Disabled controls explain authority, resources, staffing, commitments and caps. Fine arms is an officer upgrade, not a weapon inventory or siege system.

City loyalty only modifies monthly tax: multiply the existing rounded base tax by `0.8 + loyalty / 500`, then round down again. The multiplier ranges from 80% to 100%; food and recruitment formulas are unchanged. Officer loyalty retains its succession and prisoner-decision roles. Autonomy only considers rewards or feasts when a local officer has less than 55 loyalty.

### Troops and battlefield actions

Successful manual movement opens a nearby unit menu: **Attack, Tactics, Wait, Close**. Selecting attack or a specific tactic dismisses the menu so you can choose a highlighted map target before execution. Closing preserves the move and remaining action; select the unit again to reopen. Unavailable choices show a reason. Failed moves and automatic command do not open the menu.

Battles are fought on a draggable, zoomable 48×32 top-down board; the attacker enters on the left. The attacker's last route leg picks one of 15 painted battlefields (a few attack directions have their own), and the same leg and direction always give the same field, named in the battle heading. Unit tokens show a small ink squad below 500 surviving troops and a large formation at 500 or more, changing to a crewed boat on water and back on land. The highest-level officer appears as a separate portrait badge alongside a faction pennant, a troop-type seal, a ×N badge for multi-officer formations, the troop count and a strength bar; attackable enemies have a red ring, confused or inspired units an icon, acted units turn grey and routed units fade. Zoomed far out, squad art remains while portraits and secondary badges hide; the Grid button hides the grid lines. The painting illustrates the grid; inspect a cell to see whether it counts as plain, forest, hill, water or cliff.

| Type     | Base movement budget | Ordinary range |
| -------- | -------------------- | -------------- |
| Infantry | 3                    | 1              |
| Cavalry  | 5                    | 1              |
| Archers  | 3                    | 3              |

Budgets are movement points, not guaranteed tiles. Forest/hills cost more for most types; cavalry pays more. Occupation, enemy zone of control and water affect reachable cells. Formations can group same-type officers. Militia cannot use tactics. Waterborne units retain their infantry, cavalry or archer identity and share the same water penalties.

Select a living friendly formation, click a highlighted reachable cell to move, then attack an enemy in range or choose a tactic and a legal target. Units normally move once and act once per battle day. Armies deploy about 15 columns apart and usually meet within two or three days. A formation next to an enemy is pinned, except that a routed one may step to a free neighbouring cell. Read the forecasts first: while choosing an attack, each target in range shows what you deal, what you take back, its morale afterwards and whether it routs or is destroyed, and hovering a green cell rings the enemies you could strike from there. The conditions line shows weather → next weather, both sides' food and the selected unit's movement/range; **Terrain and multipliers** expands force/intellect/level and the inspected terrain's multipliers. The header says who would win if time ran out now. Your formations and the enemy's are listed separately; the enemy list shows its tactic points and each formation's force and intellect. Clicking a tile inspects it **and still executes a legal move or attack**.

Morale starts at 80. A fed formation that lost no troops during a battle day regains 5 morale the next dawn, up to 80. Below 40 a formation wavers (−15% damage, no tactics); below 20 it routs and can only move or hold. After you end a day, the enemy turn replays on the map (Skip or Esc jumps to the end), followed by a summary of its attacks, your losses and any formation that wavers or routs. The battle log is grouped by day; each side's moves and holds collapse into one expandable line.

| Tactic        | Base side-wide point cost | Basic requirement                                                                 |
| ------------- | ------------------------- | --------------------------------------------------------------------------------- |
| Fire          | 4                         | Intellect 60; weather/terrain/water affect damage.                                |
| Confuse       | 3                         | Intellect 70; chance to make the enemy lose its next turn.                        |
| Rally         | 3                         | Intellect 50 or force 85; friendly morale, confusion recovery and next-hit bonus. |
| Raid supplies | 4                         | Intellect 60 or cavalry; targets enemy provisions.                                |
| Ambush        | 3                         | Intellect 60, standing in forest, not moved today.                                |
| Rockfall      | 4                         | Intellect 65, standing on a hill; hill targets are excluded.                      |

At level 3, intellect thresholds drop by 10. Cunning can reduce point costs. Use the actual panel for current cost, range, legal targets and rejection reasons. General tactic range is two, or three for archers/intellect ≥80; Ambush/Rockfall cap at two. Points are shared by your side, regenerate two per battle day and cap at 30. Low morale, militia, prior action, missing points or missing legal targets can prevent a tactic. Fire outdamages an ordinary hit on a forest target, or in Wind for a much cleverer caster, and draws no counterattack; Rockfall adds a 10-point morale blow and still works in rain.

All types can cross passable water without a naval skill or boat inventory. A step touching water costs at least two movement points. A unit on water deals ×0.75 attack damage and receives ×1.25 troop damage. Shore/water attacks are legal in normal range. Cliffs are impassable for everyone. Tactical water access does not create arbitrary strategic sea routes.

Submit End battle day in **every player battle**; the global day advances once. Closing a finished battle report exposes the remaining fields. If they already submitted, use **Advance 1 day** to resume the shared day; reload preserves this state. NPC-only battles resolve automatically. Normal battles time out at 30 days, raids at 14: more combat-ready troops wins, defender wins ties. Defeat, rout or withdrawal can end a battle earlier. Rival commanders fight in character: a leader with far more force than intellect, or a fierce one, presses forward; a clever one holds ground and uses more tactics. The log notes when the enemy army changes posture. Auto-command never withdraws your army: when your officers would withdraw, it switches itself off and a report asks you to take command or withdraw. Withdraw army works without selecting a unit and concedes the whole battle; Cancel/Escape preserves state and RNG.

Soldier level is separate from officer level. Mean soldier XP starts at 0, with one level per 100 XP up to level 20 / 1900 XP. Levels 11–20 display heavy infantry, elite cavalry or strong archers; reinforcement can dilute mean XP and return them to ordinary art. The 500-soldier size threshold, leader portraits and commander-based boat/tower-warship selection still apply independently. Officer details, battle details and reserves show mean XP and distance to the next level.

**Set troop count** previews actual before/after counts, levels, experience and formations, including elite downgrades. Experience travels with healthy and wounded soldiers and only same-type reserves can reinforce an officer. Losses preserve the survivors' mean; having neither healthy nor wounded resets it. Battle aftermath lists each original contingent's capped XP gain, level change and promotion, with separate notices for no combat participation and annihilation. Reports retain the historical result after later reinforcements or reloads.

Capture takes a city after victory. Raid plunders and returns without taking it; Sack combines capture with destructive plunder. Loot and returning survivors still travel. There is no siege phase.

### Wounded troops, retreat and captivity

Recruitment selects infantry, cavalry or archers. Each officer commands one base type, with a combined healthy/wounded capacity of 10,000. Effective combat casualties become 60% wounded and 40% permanent losses, carrying fractional remainders across hits. Zero healthy troops means defeated; remaining wounded keep their XP. Thus 5,000 elite cavalry can leave 3,000 wounded. Wounded cannot act or heal on the field; starvation losses are permanent.

With a valid refuge route, capture risk per officer is 0% before engagement, 5% for an orderly withdrawal after engagement and 25% for forced defeat or rout. Officers roll independently; confirmation shows both individual risk and the chance of any capture. No route means explicit surrender. Losing defenders use the same rules. Orderly escape retains all survivors; forced escape retains all healthy and two thirds of field wounded. Returns take real journeys and may wait outside a friendly city in battle without reinforcing it.

Existing wounded stay in the departure city with their source and XP. Each full supplied city day heals 10% of eligible wounded, rounded up after grouping by city/type: 3,000 heals 300 on the first day and about 90% over 22 effective days. Travel, field battles and outside waiting give no treatment. Rear veterans rejoin their original officer only in the same city, under the same house, when uncommitted and within capacity; otherwise they remain a separate usable source.

Captured rulers are succeeded immediately. A surviving house displays its current ruler’s name. Successfully recruiting the captured ruler lowers the former house’s remaining living officers and owned cities by 10 loyalty, floored at zero; refusal, release, exchange and execution cause no such loss. The captivity identity survives saves; existing army and monthly decision rules remain.

Captured officers retain their field contingent. Recruitment requires 10 supplied days in a city owned by the army faction before it can fight or supply a troop requisition; healing proceeds alongside it. Ordinary relocation retains the remaining reorganization days; captivity and travel pause them. Release and successful exchange create actual return journeys, funded from the holding city's available food up to the travel budget. Without a reachable home city, release frees the officer and disbands the army into local population. Recruitment/exchange attempts are monthly; refused exchange uses both attempts. Release/execution remain available after refusal. Execution disbands the contingent. Rear reserves, old wounded and undeployed reorganizing troops disperse when their city falls.

Healthy troops, reserves, rear veterans, wounded and prisoners all consume food; cavalry counts twice. The holder feeds prisoners without paying own-army wages. Expand **Personnel, recovery & disbanding** in city officers/details to review counts and disband selected personnel without a work point. Disbanding permanently removes their XP. **Return the whole contingent** uses no work points in any city and leaves wounded in city care; returning troops does not remove their food cost.

Autonomous cities also allow whole-contingent returns without a work point. Returning troops is optional; appointment and ordinary relocation never require clearing the contingent first. Returns cancel all same-city rear detachments' auto-rejoin for that officer and preserve type, XP and reorganization. Autonomous reinforcement includes other stationed officers, protects 1,000 same-type reservists, and respects wounded capacity, reorganization and approved orders. Pending appointees are not re-armed. Full city loyalty, full local officer loyalty and unchanged troop counts block ineffective security, feast and assignment orders without spending work.

### Controls, saves, endings and troubleshooting

- Campaign: wheel/buttons zoom, drag/arrows pan, Home/Fit shows the atlas; minimap repositions. Tab/Enter/Space selects cities.
- Shortcuts (outside text fields): Space advances 1 day, Shift+Space 10 days, N to the next event, I opens the inbox, O marches & orders, C the ruler's capital, D diplomacy; in battle, W waits and E ends the battle day. Every advance says why and when it stopped.
- Battlefield display: Expand battlefield fills the window; Fullscreen enters native fullscreen when allowed. Show panels toggles commands, minimap, help, top bar and battle list. Restore layout restores prior settings. With commands hidden, the compact bar retains auto-command, End battle day and More actions → Withdraw.
- Battlefield: Fit shows the field; Unit focuses selection. With map focus, arrows move the cell cursor and Enter/Space executes; Shift+arrows pans, +/- zooms, Home fits. Minimap moves the viewport.
- Wiki: F1 opens during play, Escape closes or cancels a confirmation. Language/camera/help do not change the date.
- Saves: one autosave per browser profile/address; Export creates a portable backup independently. A different port/browser/private session has separate storage. Keep the tab open and export if saving fails, then Retry save. Valid v0.3 saves now require the personnel schema marker. Saves from before wounded troops are incompatible; export their raw data from the start screen before replacing them. Cancel preserves the old save. Invalid imports preserve the campaign/drafts; valid imports reset transient controls.
- Victory: all-city unification or Luoyang plus at least 16 cities held across 12 consecutive monthly boundaries for Hegemon. Protect your capital; losing it can end your campaign.

If time stops, inspect due reports and unfinished player battle submissions. If a march is empty, check whole-officer strength, garrison, food, available officers, reserved stock and route. If recruitment seems ineffective, assign reserve soldiers. If a governor has not changed, check travel and the month boundary. Fit before zooming when a map is confusing.

The candidate's strategic pacing and artwork still need player review. Report scenario/house, game date, locale, browser/viewport, exported save and reproduction steps using the [test record](next-steps.md#player-test-record). Four long sessions, real low-end hardware and draft-art approval remain open; automated diagnostics are not a player win-rate claim.
