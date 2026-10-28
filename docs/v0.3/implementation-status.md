# v0.3 implementation and acceptance status

## Current candidate · October 28, 2026

Checked against the working tree, including the recent noncombat and battle-flow changes. The earlier milestone sections below retain their original dates and test counts.

- Implemented: fixed two-point ten-day city budgets; free preparation actions; group feast/reward/equipment; retained-contingent governor handovers and capital synchronization; conquest governance prompts; ordinary multi-officer transfers; ruler-captive recruitment consequences and current-ruler faction names; city overview statistics; battle action menus and multi-battle day recovery.
- Fresh documentation-pass check: **820/820 unit/integration tests passed** with one worker. [Audit and commands](documentation-audit-2026-10-28.md).
- Recent focused implementation browser checks cover six ordinary-transfer cases, two governor-transfer cases and four multi-battle recovery cases across EN/ZH. These were targeted runs, not a fresh full browser/production/hardware certification. Build, UI lint and changed-file formatting passed during implementation.
- Still open: long player campaigns, real low-end hardware testing and final art approval. Push/PR/remote CI remain deferred.

[Current rules](player-guide.md) · [Release notes](release-notes.md) · [Open work](../next-steps.md)

## Dated implementation milestones

## 2026-10-26 武将扩容整体复核：完成

复核 R1–R5 的数据、生命周期、归属、招募编兵、头像资料与存储及战斗衔接。已补齐固定基础兵种和已故记录零兵员的保存校验；资料页说明未建模的开局势力，不把甘宁、刘表的后续关系倒推到 190 年初，并标注推算、争议、游戏参考及玩法近似年份。战中资料改读战场当前健康兵／伤兵，合编时明确标注编队合计，查阅不修改战后分配记录；成年成长报告按实际增量显示能力上限处的 0／部分成长。

新增 15 项复核测试，先复现再修复；全量 659／659 通过（49 文件）。相关浏览器首轮 34／36 通过，修正两项新测试的术语文本定位后，四项新增界面测试全部通过；覆盖双语、320px、真实反击伤兵、重载、只读、名册状态、缺图及原有生命周期、招募、撤退、被俘和恢复。新构建生产 `/hegemony/` 15 项通过；24 局真实开局战役各 90 日、3,705 次存档往返，以及 36 条受控完整流程和 24 次年界检查再次全部通过。旧测试已改用实际兵种匹配的武将，不再靠改人物兵种建场景；精确兵员、经验和口粮断言保留。见[整体复核验证记录](evidence/officer-roster-review-2026-10-26/README.md)。历史 R1–R5 证据保留原样，长期人工平衡验收仍开放。

## 2026-10-26 武将扩容 R5：集成回归完成

以下保留 R5 交付时的记录，当前整体复核见上方。

R1–R5 自动化实现验收完成。已新增两个剧本各六势力的 36 条新将全流程回归：真实搜索、同兵种编兵、出征、上下水、伤兵、主动撤退、被俘释放／招降、整编与恢复，关键阶段逐次存取档。另以两个种子核对全部 12 组合的两次年界、登场去重及亡者不复活。

固定种子自然战役回放发现月界到达漏办：第 60 天月结替换行程状态后，入战或卸载未执行，武将指向已交付行程而导致存档校验失败。已调整为月结前办理当日到达，并补充月界入战、伤兵返城、物资及零兵太守候选人到达回归。开始页益州势力的中文简介也已修正；旧浏览器场景按新任官配置、训练禁用按钮和头像包装结构同步，保留规则断言。

本轮新增 54 项回归，全量规则／集成 644／644 通过（48 文件）。24 个固定种子战役各完成 90 日，共 2,160 战役日及 3,705 次存档往返；整个世界中观察到 23 位不同新将实际出征。完整浏览器首轮 144／151 通过，7 条旧场景／选择器修正后相关 25 项全部通过，包含所有失败项；没有把它写成修正后又完整跑了一遍。生产 `/hegemony/` 15 项通过，覆盖全部 12 种开局实际选择、推进、导出与重载。构建、UI、字体、资源、格式与最终指纹检查见 [R5 验证记录](evidence/officer-roster-r5-2026-10-26/README.md)。长期平衡、真实低端机和美术批准仍待人工验收；旧存档不迁移，未提交或推送。

## 2026-10-26 武将扩容 R4：统一头像、98 人名册与资料

以下保留 R4 交付时的记录，当前进度见上方 R5。

R1–R4 已完成，R5 尚未开始。新增仅含 98 人身份与 128／256px 路径的运行索引，制作提示词与来源清单不进入头像索引。45 位新将接入新图，53 位旧人物继续使用早期原图，16 套修订像保留为未启用变体，不自动按年龄换脸。开始页、城池列表／详情、战场统帅及侧栏共用路径与姓氏回退，马腾／马良、祖茂的旧 ID 保持正确映射。

战略地图新增人物名册，显示全部 98 人，可按中英文姓名、复姓和五种状态筛选，每页最多 12 张小头像，资料页才加载大头像。名册从定义及当前世界记录只读派生，未来和已故人物不进入现役操作；当前在途、在战、被俘、归属和年龄按游戏记录显示，俘虏转运中不显示虚假的驻城链接。城池在职与在野分组；外城、在野、敌方等详情保留权限说明，不显示直接训练／装备／编兵按钮。

资料展示当前能力或成年基准、兵种、位置、年龄、年代及来源，参考卒年明确不决定本局命运。字体已重建并逐字核验 98 人的 149 个姓名汉字，包括祎、叡、恪、瑾、瓒、懿、谡、琬。新增吕蒙、陆逊、周泰、朱然、徐盛、丁奉六个楼船外观资格，按个人名单生效；画像统帅与船型统帅仍相同，没有增加新水战倍率或宣称旧特性已接通。

新增 17 项数据／渲染测试，全量 590／590 通过（46 文件）。浏览器验收覆盖中英文、320／390px、桌面、200% 缩放、分页和懒加载、未登场／已故／被俘状态、复姓缺图、城市权限与新统帅战场／侧栏回退；生产子路径、构建与最终检查见[R4 验证记录](evidence/officer-roster-r4-2026-10-26/README.md)。R5 仍需完整玩法与战役平衡验收。

## 2026-10-26 武将扩容 R3：招募、NPC 首都与首次编兵

以下保留 R3 交付时的记录，当前进度见上方 R4。本地在野搜索共享资格与执行检查，空池禁用且不扣点；正常尝试沿用本地随机抽选、原成功率与忠诚初始化，失败消耗一点，加入不赠兵。玩家仍只直接办理君主本城城务。NPC 当前首都使用单独的内部执行入口，普通命令不能越权；地方城沿用自治。

两种自治城市共享每月最多三工作点，自动搜索与首次编兵各每月一次，计数随城市工作月份保存、重置；读档、归还后再编兵或首都迁移不重置当月次数。安全事项优先，再按武智合计、ID 选择零兵将。合格对象须同城本方、无健康兵也无伤兵、整编完成且未被已批准命令预留；按同兵种可支配库存编入 100–500 人，不强制太守优先。

库存不足时管理者提供征募能力、兵种取受兵目标；征募正常扣金钱、人口与一个工作点，之后编兵另扣一点及真实同兵种库存。不能负担的可选事项跳过，执行前重算并比对状态、库存经验、粮食、预留和工作点，过期计划拒绝且无副作用。月结完整接回兵员来源与口粮记录，修复原自治回填漏掉这两类记录的问题，保留经验及已付口粮，避免重复士兵或再次计粮。

全量规则／集成 573／573 通过（45 文件），包括新增 44 项招募／编兵测试：首都／地方城真实月结、两个正常月结内招募编兵、99／100／499／500／501 库存、异兵种、伤兵／整编／俘虏／预留、预算、已付口粮跨月转移及次日正常计粮、过期计划及越权。中英文新增 6 项浏览器、既有兵种征募 2 项和 R2 生命周期 8 项均通过。构建、UI、本批格式、源码指纹及链接校验通过；全仓库格式仍有 40 个未修改的既有素材文档／生成 JSON 遗留项，见[R3 验证记录](evidence/officer-roster-r3-2026-10-26/README.md)。战略 AI 原出征选择规则保持，新部已进入实际出征；未将本轮测试当作整体战役平衡或 R4 头像验收。

## 2026-10-26 武将扩容 R2：初始化、年度登场与存储校验

以下保留 R2 交付时的记录，当前进度见上方 R3。实际新战役已使用统一人物配置：190 年 69 位在世人物，200 年 66 位在世人物加 15 条死亡记录。两剧本共 12 种玩家势力组合的显式君主、首都、太守及兵员账均有测试；待登场者不进入世界名单，不增加兵、粮、人口或工作点。身份字典已统一覆盖 98 人。

年界保留原有月结次序：先处理旧人物增龄和自治，再以固定 ID 顺序创建当年在野零兵新人，合并同年人才消息并提交已处理年份，不额外消耗随机数。既有在野、在职、被俘或已故记录都跳过；局内不执行历史／游戏参考卒年死亡。存档绑定名册版本与年份，严格检查应有人物及死亡记录，缺失时拒绝续玩；合法的年界结算前游标可保存重载。旧名册不迁移，恢复界面说明原因并保留原始数据。

年龄支持不详；已故和未知年龄不增长。18 岁只把少年差额叠加到当前能力，不重置经验、等级、装备或训练收益；实际命令验证孙策装备训练至 100 后成年增为 103，重载不会再领一次。恰好 18 岁登场者直接用成年基准。另修复中立城在野者被空势力比较当作守将的问题，覆盖守军创建、撤退与战后判俘。

全量规则／集成测试 529／529 通过（44 文件），含 17 项新增生命周期集成、2 项月度年龄边界及 3 项中立城战后回归；中英文生命周期浏览器 8 项、既有新战役／城务／战斗浏览器 3 项通过。构建、UI、本批文件格式、97 个本地链接及 12 份源码指纹校验通过；全仓库格式检查另有 40 个未修改的既有素材文档／生成 JSON 遗留项。完整结果见[R2 验证记录](evidence/officer-roster-r2-2026-10-26/README.md)。旧测试中依赖已修正的 190 年归属、开局人数或虚构人物 ID 的场景已显式建模招募／任命，保留原有兵员、权限、俘虏和存储断言。R3 的 NPC 首都、搜索及首次编兵、R4 的头像和资料界面、R5 的整体玩法验收仍待接续。

## 2026-10-26 武将扩容 R1：年表与开局配置

以下记录 R1 交付时的范围，当前运行接入情况见上方 R2。98 人统一人物库（53 既有＋45 新增）已落实稳定身份、头像引用、生卒与来源类型、实际可用年、成年能力、唯一兵种，以及 190／200 的明确状态、所属、城市与职务。按用户补充，史料缺失参考《三国志11》，参考字段与史料推定／争议值分开；两来源都缺失时仍支持不详。R1 当时仅验收数据与配置，未接入实际初始化、年度登场、招募 AI 或界面。见[核定人物表与差异账](13-officer-roster-data.md)、[分阶段计划](12-officer-roster-expansion-plan.md)。

配置预览：190 年 34 在职、35 在野、29 待登场，随后五年新增 6 人；200 年 50 在职、16 在野、15 已故、17 待登场，随后五年新增 5 人。开局当年卒者保留，之后命运由游戏决定。新增者全部零兵；原部因归属变化归原城同兵种预备兵。为保持北海城务入口，190 年颜良改驻并从本城张郃原部重分配 700 骑兵，逐城逐兵种总量守恒；200 年吕蒙接替祖茂任寿春太守。人口、金钱和粮食不随新增人物增加。

新增 16 项人物数据／开局配置测试已通过；覆盖 98 人与头像一一对应、复姓及旧 ID、游戏参考来源、16／18 岁边界、同年死亡、未出生与未知年龄、明确君主与太守、非预归属、零兵和逐城兵种守恒。全量规则／集成测试在单 worker 下 507／507 通过（43 文件），构建、UI 检查通过。本次未改界面，未运行浏览器验收。首轮与构建并行时战斗性能用例超阈值，结束并行任务后按原阈值串行全量通过，未放宽指标。首轮临时目录权限错误通过改用工作区内临时目录解决。生成命令为 `node tools/v03-officer-roster-audit.mjs`；[机器账与数据指纹](evidence/officer-roster-2026-10-26/roster-audit.json)、[游戏年表参考快照](evidence/officer-roster-2026-10-26/san11-reference.json)已保存。

## 2026-10-26 城池详情插画与闲置素材清理

8 张区域城池插画已接入城池总览及详情，24 座城与大地图共用地域匹配（含襄阳江汉风格）。桌面以插画搭配势力信息，窄屏上下排列；加载失败保留城名字符占位与全部操作。移除 6 张闲置地形图、5 张旧地图／候选底图、6 张对应 v0.3 源 PNG 和旧 SVG 生成脚本，并清理注册与清单。61 项渲染检查、15 个开发浏览器用例及 1 个生产子路径用例通过，覆盖八种地域、中英文、390/1366/1920px、200% 缩放、缺图回退及原有出征／返回流程；构建、UI、格式和本地资源／文档链接检查通过。截图：[桌面](evidence/city-art-2026-10-26/desktop-zh.png)、[窄屏](evidence/city-art-2026-10-26/mobile-zh.png)。

实施后复核修复四个边界：城池总览按容器实际宽度切换布局，解决 900px 窗口在 200% 缩放下的双栏挤压；小于 400px 的资源区改为两列并允许长数字换行，解决 320px 大额资源串栏；未知城池 ID（含对象原型同名值）安全回退中原；主地图清单移除已删除旧底图的活动参考路径，原风格出处保留为历史资源 ID。190/200 两剧本的 24 城映射一致。慢加载与损坏图片不改变占位尺寸，重新打开可恢复加载。新增 3 项渲染回归、4 项浏览器边界用例；64 项渲染、19 个开发浏览器及 1 个生产子路径／缩放用例通过，构建通过。46 个运行资源和 7 份有效清单的文件引用检查通过，退役提示词记录保留历史说明。截图：[320px 大额资源](evidence/city-art-2026-10-26/review-stocks-320-zh.png)、[200% 缩放操作区](evidence/city-art-2026-10-26/review-zoom-200-en.png)。

## 2026-10-26 作战图标 1 人／3 人调整

六种陆上外观已改用 ink-04：少于 500 人显示 1 个代表人物，500 人及以上显示 3 个。每组使用同一张单兵底图、相同画布、单兵尺寸和前景位置，只增加两名后排人物；人物不会随人数档位缩放。两种船只继续使用 ink-03。59 项渲染检查和本轮 14 个浏览器用例通过（像素用例修正水墨半透明素材的样本门槛后单独重跑通过）；构建通过，40/56/112px 对比及游戏截图已复核。见[来源、完整提示词、排列参数与验证说明](assets/units-count-ink-04.md)。

## 2026-10-26 作战图标可读性

14 张 ink-03 图标已由内置 image_gen 重生成并接入：三人/五人代表图替代六人/百人密集阵列，圆盾、方盾、马匹、马铠和弓的轮廓更突出。兵种、500 人、Lv.11 和船型选择规则保持不变。已完成 40/56px 尺寸对比及游戏截图复核，58 项渲染检查、13 项浏览器用例、构建、UI 和格式检查通过。见[单位清单、提示词与对比](assets/units-readable-ink-03.md)。

## 2026-10-26 战场显示与营地移除

已实现战场使用窗口宽度、铺满窗口、原生全屏、五类面板独立开关与悬浮小地图；隐藏指令栏后保留核心操作，退出恢复原布局。营地从数据、胜负、AI、渲染和当前说明中移除。首轮全量规则/集成检查及新增通行回归、45 个不同浏览器用例、构建、UI 与格式检查通过；桌面和窄屏截图已复核。详见[本轮实施记录](11-battle-display-and-camp-removal.md)。

实施后复核已修复迟到全屏授权、Escape 优先级、AI 普通攻击漏记接战及高缩放小地图遮挡四个问题。新增 19 项规则回归，全量 485 项通过；本轮 17 个相关浏览器用例通过，构建和静态检查通过。详见[复核记录](11-battle-display-and-camp-removal.md#2026-10-26-实施后复核)。

## 2026-10-26 伤兵机制

伤兵机制 W0–W6 已实现，W7 自动验证及三组机器短回放完成；实施后边界复核也已完成。整编绕过、微量断粮、日末击溃、俘虏粮债、等待改道、中立供粮及快照关联已修复，新增 10 个回归用例。当前全量 465 项单元／集成、本轮 12 项相关中英浏览器、构建、UI、格式和本地文件链接检查通过。首轮 103 个浏览器分批证据与试玩存档保留在[首轮记录](evidence/wounded-system-2026-10-26/README.md)，最新修复和范围见[复核记录](evidence/wounded-review-2026-10-26.md)及[分阶段进度](10-wounded-system-implementation-plan.md)。新存档仍为 `personnelSchema: 1`，旧档可原文导出，不迁移。设计参数未改，长期人工平衡和真实低端机验收仍待执行；下文保留历史版本证据。

The scope below is maintained against the October 28 working tree. Dated validation sections refer to their original candidates. **Core implementation, F01–F08 and RV01–RV10 are complete with recorded automated evidence.** This is a local playable candidate; human acceptance is not complete. [Features](release-notes.md) · [How to play](player-guide.md) · [Open work](../next-steps.md).

The October 23–25 battlefield redesign (P0–P7) is tracked in the [battlefield canvas plan](08-battlefield-canvas-plan.md). The subsequent October 22 playability/UI implementation is tracked in the [new implementation ledger](playability-implementation.md), including current automated results and unchanged human gates. The validation counts below describe the earlier RV candidate.

## Implemented scope

| Track                 | Delivered behavior                                                                                                                                                                           | Remaining boundary                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G Geography           | 24 anchors, 42 estimated links, distance/profile/ETA labels, multi-hop travel and anchor-sensitivity report.                                                                                 | Approximate anchors/roads/generalized rivers; not historical GIS reconstruction.                                                                            |
| L Calendar/logistics  | Daily clock/cursor, fixed-point food, service accounting, reservations, cargo delivery, arrivals/return and month boundaries.                                                                | New long-session edge cases need player evidence; do not extrapolate focused tests to every route-failure sequence.                                         |
| V Governors           | Direct capital, two-point ten-day work budgets, retained-contingent handovers, ordinary officer transfers, plans/answers and protected resources.                                            | Development now uses a shared 500-point cap; seeded and loaded values retain their scale. No multi-city coordination or stochastic future-budget simulator. |
| B Battles             | 15 painted 48×32 battlefields by route/direction, three base troop types and six tactics, ZOC/morale, common water, forecasts/AI, saved submissions and aftermath.                           | Human battle feel and campaign pacing are not certified by automated passes.                                                                                |
| R UI/rendering        | Top-down React/SVG battlefield with portrait tokens, camera/minimap controls, stable fitting, exact living-unit counts, full inboxes, bilingual feedback/Wiki, conditions and confirmations. | Real low-end hardware, broader manual readability and long-session usability remain open.                                                                   |
| A Artwork             | Painted atlas, city art, 15 battlefields, unit/vessel sprites and officer portraits with provenance and native fallbacks.                                                                    | Final player art approval and targeted revisions remain open; see the current art manifests rather than earlier asset counts.                               |
| I Integration/storage | New entry/save namespace, strict associations/limits, autosave/export/import recovery, Campaign menu/Resume and safe transient reset.                                                        | Very long human campaigns still need field exposure.                                                                                                        |
| Q Validation          | Unit/integration/browser/production/performance checks, diagnostics and preserved evidence.                                                                                                  | Four user sessions, real low-end test and art acceptance remain outstanding; remote CI deferred.                                                            |

Detailed rules: [numbered system references](README.md#system-references). Full P01–P11 handoff history: [prior implementation plan](history/implementation-plan-2026-10-21.md).

## Closed repairs

| Milestone | Completed scope                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01–F03   | Small-party fixed-point rations; arrival-only, once-only loot; undelivered full-store cargo accounting.                                                                                     |
| F04–F06   | Stop at event/month boundaries, battle-created returns move next day, unique officer/militia formation identities.                                                                          |
| F07–F08   | Reject nonparticipant battle commands; validate save cross-references and unique active associations.                                                                                       |
| RV01–RV02 | Participant-only clock/UI battle gating; stable main frames, compact minimaps, Fit geometry and Resume observer.                                                                            |
| RV03–RV05 | Campaign recovery/import/save feedback; complete player inbox/report backlog; incumbent-transfer discovery and correct appointment states/labels; later changes allow retained contingents. |
| RV06–RV08 | Living-unit selection/counts, economy/stat/help/availability, bilingual routine results/rejections/logs/formation names.                                                                    |
| RV09–RV10 | Shared-rule tactical condition inspection and cancelable, focus-safe whole-battle withdrawal.                                                                                               |

[RV completion ledger](playability-review-and-todo.md#rv-completion-ledger) records exact criteria and ownership. The [initial audit of 33ad2fc](history/implementation-audit-33ad2fc.md) and pre-repair screenshot/clock reproductions are historical records. They must not be presented as current blockers.

## Recorded validation

These results were obtained October 21 for the RV candidate, not rerun by the October 22 documentation cleanup:

| Check                       | Recorded result                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Full unit/integration suite | 668 passed, one existing skip, 46 files; includes legacy and v0.3 tests.                                 |
| v0.3 browser suite          | 34 passed; six affected capital/Wiki/responsive cases rerun after final CSS.                             |
| TypeScript/production build | Pass; 670.05 kB application JS before gzip, existing chunk-size advisory and dependency-comment notices. |
| Production subpath          | One pass for `/hegemony/` assets and save reload.                                                        |
| Tactical performance        | One pass for existing 10v10 tactical-day p95 <50 ms on the recorded host; not rendering FPS.             |
| Formatting/whitespace       | Pass.                                                                                                    |
| Portrait validation         | 53 named mappings plus garrison, 108 WebP renditions; technical validation, not new v0.3 art approval.   |

[Commands, environment and nine runtime captures](evidence/rv-implementation-2026-10-21/README.md). Browser assertions cover EN/ZH, 390/1366/1920 effective CSS px and 200% zoom, four-map Fit corners/occupancy, ten-frame stability, NPC/mixed/two-player day submission, storage recovery, inboxes, transfers, reserve/assignment/march and withdrawal.

## Balance disposition

The final 24-run 96-month narrow-bot matrix recorded no selected-player elimination, true unification or Hegemon victory. Paired tuning variants did not show a safe progression improvement; the player accepted the miss and retained the conservative rival policy. The bot's limited policy is not a human win-rate target. N/A observations are not zeroes. [Campaign evidence](evidence/README.md) preserves raw results, generation hashes and rejected experiments; those hashes do not fingerprint this later whole tree.

## Open work, acceptance and publication

- The development-cap repair and other playability tasks now have implementation and checks in the [new ledger](playability-implementation.md).
- Four player sessions: each 12 campaign months and three manual battles. The player chose to play and report; not deferred or passed.
- Real low-end-machine startup/map/battle/long-resolution check, with actual hardware/browser observations.
- Specific art revision feedback, revised runtime review and approval. All generated v0.3 art remains draft.
- Push, PR and remote CI remain explicitly deferred. Local configuration/passing local tests do not imply remote CI passed.

The v0.2 human-gate deferral and earlier portrait/profile approvals apply only to that recorded scope. They do not waive these v0.3 gates. See [next steps and test record](../next-steps.md).
