# v0.3：每日战役、太守自治与水墨战场

文档核对：**2026-10-28，当前工作区**。这是可本地游玩的候选版，人工长期平衡试玩、真实低端机和美术批准仍未完成。旧记录中的提交号、测试数量和阶段限制只适用于各自日期。

## 从这里开始

| 目的                       | 文档                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 安装、启动、存档与功能总览 | [根 README](../../README.md)                                                                                |
| 实际操作与规则             | [中文玩法指南](player-guide.md#中文玩法指南) / [English player guide](player-guide.md#english-player-guide) |
| 最近改动与范围             | [版本说明 / Release notes](release-notes.md)                                                                |
| 实现与验证状态             | [当前状态](implementation-status.md)                                                                        |
| 下一步与反馈               | [当前待办](../next-steps.md)、[首次试玩脚本](first-hour-playtest.md)                                        |
| 修改代码                   | [Developer guide](development.md)、[维护接续](implementation-plan.md)                                       |

## 当前可玩内容

- 190/200 两个剧本，各六个可选势力；24 城、42 条连接、98 人定义及逐年登场。
- 内部按日推进，30 日/月；行军、资源运输、武将调动、太守赴任和返程都有真实行程、路粮与到达。
- 每城每 10 个游戏日刷新至 2 点工作点，不随武将数量改变、不累计。配兵、归还所部、赏赐、装备和普通调动不耗点；迁都、任免不退还已用点数。
- 城池主界面直接显示守军、预备兵、粮食、金钱、农业、商业、人口及治安／民心。农业和商业发展上限为 500，不重算已有数值。
- 宴饮、赏赐、赐予兵器支持勾选与全选，确认前显示合计费用和实际变化，费用不足整批不执行。
- “出发城 → 城务 → 武将调动”可选择多名普通驻将，携带健全兵和伤兵到另一己方城池；抵达即驻城，无需任命太守或等月界。君主、太守和被任命／命令占用的人选显示不可选原因。
- 太守跨城赴任也可携带所部，抵达后在合法月界交接；君主实际就任同步切换君主本城。攻城确认战报后选择自任、任命或稍后处理，未决事项保留在收件箱。
- 15 张 48×32 正俯视战场，三种基础兵种及精锐外观、六种计策、士气、控制区、预测和手动／自动指挥。停止移动后显示行动菜单；一场结束后可继续未完战斗，已全部提交时可推进一日。
- 水格对所有兵种开放：水上攻击 ×0.75、承受兵力伤害 ×1.25。战斗没有营地、城墙／城门攻防、攻城器械或市街阶段。
- 伤兵、撤退判俘、真实返程、恢复与整编；君主被俘立即继位，招降成功对原势力扣忠诚／民心，处决不扣。存续势力显示现任君主。
- 外交、同盟、月事件、天下一统与称霸；中英 Wiki、武将名册、相机／小地图、战场放大／全屏、单一自动档和导入导出。

普通武将调动与太守赴任分别处理驻留和职务。两者都保留所部的兵种、经验、伤兵及整编状态，在途暂停治疗和整编；已用工作点不会因移动或任免刷新。

## System references

These describe the current implementation. Dated plans preserve earlier decisions and validation; use the player guide and references below for current rules.

| Reference                                                         | Purpose                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| [00 Decisions and contracts](00-decisions-and-contracts.md)       | Product decisions, source ownership and saved-state boundaries.     |
| [01 Geography and routes](01-geography-and-routes.md)             | Anchors, distances, party ETA and research limits.                  |
| [02 Calendar and logistics](02-calendar-and-logistics.md)         | Daily sequencing, provisions, transfer, arrival and return.         |
| [03 Governors and authority](03-governors-and-authority.md)       | Work points, appointments, ordinary transfers and protected orders. |
| [04 Battles and water](04-battlefields-and-water-combat.md)       | Maps, tactics, water, outcomes and shared battle-day progression.   |
| [05 Rendering and UI](05-rendering-and-map-ui.md)                 | React/SVG maps, city windows, group actions and display controls.   |
| [06 Artwork](06-imagegen-and-artwork.md)                          | Assets, provenance and review limits.                               |
| [07 Integration and validation](07-integration-and-validation.md) | Save contract, validation commands and evidence boundaries.         |

## Plans, evidence and remaining acceptance

The [playability ledger](playability-implementation.md), [battlefield plan](08-battlefield-canvas-plan.md), [wounded design](09-wounded-retreat-and-captivity-design.md), [wounded implementation](10-wounded-system-implementation-plan.md), [display changes](11-battle-display-and-camp-removal.md), [roster plan](12-officer-roster-expansion-plan.md) and [roster data](13-officer-roster-data.md) retain their dated scope. [Earlier design briefs](history/README.md) and [versioned archives](../archive/README.md) are historical references.

See [current status](implementation-status.md) for validation and [next steps](../next-steps.md) for open acceptance. Automated checks do not replace long player campaigns, physical low-end hardware testing or art approval. The accepted historical narrow-bot progression miss is not a human win-rate claim. Push, PR and remote CI remain deferred.

[October 28 documentation audit](documentation-audit-2026-10-28.md) records the current cleanup and checks.
