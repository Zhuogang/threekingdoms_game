# v0.3：每日战役、太守自治与水墨水陆战场

文档核对：2026-10-25。分支：`hegemony_of_the_three_kindoms_v0.3`；实现提交：`1e02e65`。**核心功能、F01–F08 修复、RV01–RV10 改进已实现并有自动化证据；人工试玩、真实低端机和美术批准仍未完成。** 这是可本地游玩的候选版。

v0.3 是独立发展的三国策略游戏。BAYE 是历史来源，旧规则复刻不再是产品目标；旧版存档不兼容。保留中式水墨风格；战场改为可拖动缩放的纯 2D 正俯视大地图，参考空间组织与可读性，不复制 San10WPK 的素材或攻城功能。

10 月 22 日可玩性与界面计划的实现、规则变更和新验证记录见[实施台账](playability-implementation.md)。

2026-10-26：[战场放大／全屏、独立面板开关与营地移除](11-battle-display-and-camp-removal.md)。

## 从这里开始

| 目的                           | 文档                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 安装、启动、看实机画面         | [根 README](../../README.md)                                                                                 |
| 新手怎么玩，包括装备与兵种     | [中文玩法指南](player-guide.md#中文玩法指南) / [English player guide](player-guide.md#english-player-guide)  |
| 这版新增了什么、什么没做       | [版本说明 / release notes](release-notes.md)                                                                 |
| 完成了哪些任务、测试到什么程度 | [当前实施状态](implementation-status.md)、[RV 完成台账](playability-review-and-todo.md#rv-completion-ledger) |
| 还要做什么                     | [当前待办](../next-steps.md)、[维护接续计划](implementation-plan.md)                                         |
| 修改代码或排查实现             | [Developer guide](development.md)                                                                            |

## 当前可玩的内容

- 190/200 两个剧本，每个六个势力；24 城、42 条连接。
- 内部按日，30 日/月；推进一日、一旬或到下个事件。行军、运输、调任和返程有实际在途状态、口粮与交付。
- 君主本城直辖；其余城市由太守或地方班底自治。可征调金粮兵、下达出征令，按方案接受、缩减、等待或取消；任免在月界生效，跨城候选人无兵旅行后就任。
- 本城有工作点预算、征募/编兵、搜索、治安、训练、宴饮、赏赐、精良兵器、赈济和买卖粮食。农业/商业发展按钮存在，但两个剧本的所有城市开局值均高于当前 100 上限，开局不可用；[数值与上限待核对](../next-steps.md#open-now)。
- 48×32 的手绘战场 15 张（10 种地形，其中 5 种有两个变体），按进攻方最后一段路线和进攻方向选图，详见[战场计划](08-battlefield-canvas-plan.md)；六类兵种、六种计策、士气、控制区、预览与 AI。自治不影响玩家临阵指挥。
- 所有兵种可进入可通行水格；在水上攻击 ×0.75、承受兵力伤害 ×1.25，岸上可按正常射程攻击水上单位。没有水军技能门槛。
- 外交、六个月同盟、月事件、天下一统和称霸结局；称霸与统一分别统计。
- 相机/全图/聚焦/小地图、精确兵力数字、战场天气/粮草/地形检查、完整订单和报告列表、中英 Wiki。
- 单一自动存档、导入/导出、战役菜单与继续、安全替换战役、存储失败重试、撤退确认。
- 战斗伤兵、保留精锐经验、整军撤退逐将判俘、守方退往友城、俘虏所部整编、自动恢复与完整粮耗；可在城市查看兵员并归还或遣散所部。见[规则](09-wounded-retreat-and-captivity-design.md)和[验证记录](evidence/wounded-system-2026-10-26/README.md)。

**不包含攻城系统**，没有城墙、城门、攻城器或市街阶段。正常战斗上限 30 日，突袭 10 日；到时存活兵力较多者控制战场，平手守方胜。全歼、夺取敌营或撤离等规则可提前结束战斗。

地图是带置信度的地理估计和地域玩法样板，不是汉末古道/河道的精确复原。汉中—长安名义基准约 425 km / 33 日，具体队伍 ETA 按编成和路线快照计算，不是写死的最低天数。

## System references

These describe the implemented candidate. Original long design briefs are retained in [history/design](history/README.md#original-design-briefs); unchecked targets there are not a second active task list.

| Reference                                                         | Current purpose                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| [00 Decisions and contracts](00-decisions-and-contracts.md)       | D1–D11, source ownership, saved state and presentation boundaries. |
| [01 Geography and routes](01-geography-and-routes.md)             | Anchors, road estimates, party ETA and research limits.            |
| [02 Calendar and logistics](02-calendar-and-logistics.md)         | Daily sequencing, food, cargo, travel and return.                  |
| [03 Governors and authority](03-governors-and-authority.md)       | Capital work, autonomy, appointments, requests and commitments.    |
| [04 Battlefields and water](04-battlefields-and-water-combat.md)  | Maps, unit/tactic rules, water and outcomes.                       |
| [05 Rendering and map UI](05-rendering-and-map-ui.md)             | React/SVG projection, cameras, minimaps and responsive checks.     |
| [06 ImageGen and artwork](06-imagegen-and-artwork.md)             | Integrated draft assets, coverage limits and revision process.     |
| [07 Integration and validation](07-integration-and-validation.md) | Actual entry, save format, scripts and evidence.                   |

## Wounded troops: design and implementation

- [伤兵 撤退 被俘与恢复设计](09-wounded-retreat-and-captivity-design.md)：第一节保留实现前基线，其后是本次规则；玩法已接通，默认参数仍待长期玩家反馈。
- [伤兵机制实施计划](10-wounded-system-implementation-plan.md)：W0–W6 已实现；W7 完整回归与人工试玩分开记录。见[实际实施与测试](evidence/wounded-system-2026-10-26/README.md)，其中含三个可导入的试玩存档。

本次增加 `personnelSchema: 1`，伤兵功能之前的存档不兼容且不迁移；开始页允许先导出旧档原文，取消新开仍保留原档。

实施后对整编、断粮、俘虏粮账和等待改道的边界再次复核，修复与最新验证见[实施后复核记录](evidence/wounded-review-2026-10-26.md)。

## Evidence and remaining acceptance

Recorded October 21: **668 passed / 1 skipped / 46 files; 34 browser cases passed**, with six affected cases rechecked after final CSS; build/typecheck, production subpath, tactical performance, formatting and portrait checks passed. October 22 is a documentation audit, not a new gameplay certification. [Detailed validation and nine runtime views](evidence/rv-implementation-2026-10-21/README.md).

The conservative rival policy remains. The player accepted the 96-month narrow-bot progression miss; that does not establish a satisfactory human campaign or a player victory rate. Four long play sessions and the real low-end-machine test are open. All generated v0.3 assets remain `draft`, awaiting specific revisions and runtime approval. Push/PR/remote CI remain deferred.

[Current status](implementation-status.md) is authoritative for completion; [next steps](../next-steps.md) is authoritative for open work. [Historical audit/design](history/README.md) explains earlier findings and proposals without reopening completed tasks.
