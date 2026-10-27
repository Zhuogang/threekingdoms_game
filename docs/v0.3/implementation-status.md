# v0.3 implementation and acceptance status

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

Documentation checked October 22, 2026. Active branch: `hegemony_of_the_three_kindoms_v0.3`; implementation commit: `1e02e65`. **Core implementation, F01–F08 and RV01–RV10 are complete with recorded automated evidence.** This is a local playable candidate; human acceptance is not complete. [Features](release-notes.md) · [How to play](player-guide.md) · [Open work](../next-steps.md).

The October 23–25 battlefield redesign (P0–P7) is tracked in the [battlefield canvas plan](08-battlefield-canvas-plan.md). The subsequent October 22 playability/UI implementation is tracked in the [new implementation ledger](playability-implementation.md), including current automated results and unchanged human gates. The validation counts below describe the earlier RV candidate.

## Implemented scope

| Track                 | Delivered behavior                                                                                                                                                                           | Remaining boundary                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G Geography           | 24 anchors, 42 estimated links, distance/profile/ETA labels, multi-hop travel and anchor-sensitivity report.                                                                                 | Approximate anchors/roads/generalized rivers; not historical GIS reconstruction.                                                                            |
| L Calendar/logistics  | Daily clock/cursor, fixed-point food, service accounting, reservations, cargo delivery, arrivals/return and month boundaries.                                                                | New long-session edge cases need player evidence; do not extrapolate focused tests to every route-failure sequence.                                         |
| V Governors           | Direct capital, monthly autonomous work, boundary appointments, troop-free travel/handover, plans/answers/recall and shared work/stock eligibility.                                          | Development now uses a shared 500-point cap; seeded and loaded values retain their scale. No multi-city coordination or stochastic future-budget simulator. |
| B Battles             | 15 painted 48×32 battlefields by route/direction, six types/tactics, ZOC/morale, common water, forecasts/AI, saved submissions and aftermath.                                                | Human battle feel and campaign pacing are not certified by automated passes.                                                                                |
| R UI/rendering        | Top-down React/SVG battlefield with portrait tokens, camera/minimap controls, stable fitting, exact living-unit counts, full inboxes, bilingual feedback/Wiki, conditions and confirmations. | Real low-end hardware, broader manual readability and long-session usability remain open.                                                                   |
| A Artwork             | Seven active generated definitions and one inactive paper alternative, documented source/hash/anchors and native fallback.                                                                   | All draft. Dedicated full figure art covers infantry/archer/cavalry; the other types use native identities. Revisions/approval are open.                    |
| I Integration/storage | New entry/save namespace, strict associations/limits, autosave/export/import recovery, Campaign menu/Resume and safe transient reset.                                                        | Very long human campaigns still need field exposure.                                                                                                        |
| Q Validation          | Unit/integration/browser/production/performance checks, diagnostics and preserved evidence.                                                                                                  | Four user sessions, real low-end test and art acceptance remain outstanding; remote CI deferred.                                                            |

Detailed rules: [numbered system references](README.md#system-references). Full P01–P11 handoff history: [prior implementation plan](history/implementation-plan-2026-10-21.md).

## Closed repairs

| Milestone | Completed scope                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01–F03   | Small-party fixed-point rations; arrival-only, once-only loot; undelivered full-store cargo accounting.                                             |
| F04–F06   | Stop at event/month boundaries, battle-created returns move next day, unique officer/militia formation identities.                                  |
| F07–F08   | Reject nonparticipant battle commands; validate save cross-references and unique active associations.                                               |
| RV01–RV02 | Participant-only clock/UI battle gating; stable main frames, compact minimaps, Fit geometry and Resume observer.                                    |
| RV03–RV05 | Campaign recovery/import/save feedback; complete player inbox/report backlog; troop-free incumbent transfers and correct appointment states/labels. |
| RV06–RV08 | Living-unit selection/counts, economy/stat/help/availability, bilingual routine results/rejections/logs/formation names.                            |
| RV09–RV10 | Shared-rule tactical condition inspection and cancelable, focus-safe whole-battle withdrawal.                                                       |

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
