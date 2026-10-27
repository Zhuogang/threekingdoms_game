# 武将扩容 R5 集成回归

2026-10-26。覆盖 190／200 两个剧本及每个剧本的六个势力。人物扩容 R1–R5 的自动化实现验收完成；完整战役平衡和真实低端机试玩仍由玩家验证。[阶段计划](../../12-officer-roster-expansion-plan.md)、[实施进度](../../implementation-status.md)。

## 本轮修复

固定种子 `divided-realm-190 / cao / 970301` 在第 60 天暴露月界到达漏办：月结先将最新行程写回，随后到达扫描无法分辨刚交付的行程，典韦与新将乐进仍停留在已交付行程里，没有入战，存档校验失败。现在先办理月界当日到达，再结算月份，最后刷新，避免漏办和重复交付。月界入战、伤兵返城、无人押送的物资交付、零兵新太守候选人的到达均有真实命令回归。

开始页益州势力的中文简介从误写的“幽州骑兵”改为益州山川与内政。既有浏览器测试同步新版 UI：训练禁用时核对按钮状态、原因及数据不变；头像检查定位包装元素内的实际图片；自然 NPC 战斗场景改用同种子的 200 年孙氏开局。190 年该种子先进入玩家战斗，不再符合旧场景的 NPC-only 前提。被俘颜良场景同时清理其北海太守职务，遵守保存校验中的双向任官约束。

## 覆盖与证据

| 检查                 | 结果                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 全量规则／集成       | 644／644 通过，48 文件，含新增 54 项 R5 回归；见 [unit-integration.log](unit-integration.log)                         |
| 各势力新将完整流程   | 12 组合 × 3 结局，共 36 条；搜索、同兵种编兵、出征、上下水、反击致伤、主动撤退／被俘释放／被俘招降、整编及恢复        |
| 各势力跨年           | 12 组合 × 2 种子，共 24 次；两次年界、零兵在野落点、重载去重、开局已故及局内死亡不复活                                |
| 月界回归             | 4 条跨系统新将流程及 2 条物资／任官到达；不重复交付，不丢失伤兵及经验                                                 |
| 真实开局固定种子战役 | 24 局 × 90 日，共 2,160 战役日；3,705 次保存、解码及相等比较，225 场战斗记录                                          |
| 开发浏览器           | 首轮完整 151 项：144 通过、7 条旧场景／选择器失败；修正后相关 25 项全部通过，覆盖全部 7 条失败项；未重复跑整套 151 项 |
| 生产子路径           | `/hegemony/` 15 项全部通过：12 种开局实际点击、推进、下载导出及重载，另含地图、城池图、字体、新头像及懒加载名册       |
| 构建、UI、字体与资源 | 通过；见构建、UI、字体覆盖及人物审计记录                                                                              |
| 本批格式与差异       | 本轮文件格式与空白检查；全仓库另有 40 项未修改的既有素材文档／JSON 格式遗留                                           |

[integration-matrix.json](integration-matrix.json)保存逐组合、种子、人物 ID、兵种、口粮、伤兵、经验、归属与世界记录数；[roster-audit.json](roster-audit.json)保留当前 98 人配置、两剧本 48 城账、初始化和源码／字体指纹。R1–R4 证据按原时点保留，不覆写为本轮结果。

可控流程使用名册中真实、当代、已登场的新将，显式迁到搜索城市、配置资源及相邻守军，缩短路线以逐步检查规则；没有声称自然开局一定能在每个首都找到同一个人。跨年采用两个年末快照，未模拟跳过的日期。24 局战役保留真实开局、资源和路线；玩家脚本只在规划期办理本城可支付的搜索／同兵种首次编兵，再使用既有相邻城出征策略；战术由现有 AI 驱动。

自然战役的人物指标统计每局的整个世界，包含 NPC，不能当作所选玩家势力的招募数量。24 局中共观察到 23 位不同新将由在野转入势力、28 位获得兵力、23 位实际在途或参战；前后两项可能包含不同人物。各局明细直接列出 ID，没有用数据库人数替代实际使用证据。这些回放用于实现回归，不代表难度、胜率或长期平衡已验收。

日志：[初轮完整浏览器](browser-all-initial.log)、[修正及关联复测](browser-final.log)、[生产](production.log)、[战役回放](replays.log)、[构建](build.log)、[UI](ui-lint.log)、[字体](font-coverage.json)、[196 张头像资源](portraits.log)、[本批格式](changed-format.log)、[遗留格式](global-format.log)、[最终审计](final-audit.log)。

截图已目视检查：[190 年曹操生产开局](production-190-cao.png)、[200 年益州生产开局](production-200-yizhou.png)、[楼船与统帅](warship-portrait.png)、[下水后重新上岸](disembarked-portrait.png)、[390px 伤兵操作](wounded-city-390-zh.png)、[撤退风险](retreat-risk-zh.png)。人物名册、缺图、复姓和 320px 的完整视觉证据仍见 [R4](../officer-roster-r4-2026-10-26/README.md)。

## 复现

```powershell
$env:TEMP = (Resolve-Path .artifacts/vitest-temp).Path
$env:TMP = $env:TEMP
npm test -- --maxWorkers=1
node tools/v03-roster-regression.mjs
npm run build
npm run lint:ui
python tools/validate-officer-fonts.py docs/v0.3/evidence/officer-roster-r5-2026-10-26/font-coverage.json
$env:PORTRAIT_SHARP_PATH = "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"
npm run validate:portraits:v03
node tools/v03-officer-roster-audit.mjs
$env:HEGEMONY_V03_PORT = '5182'
npx playwright test --config playwright.v03.config.ts
$env:HEGEMONY_PRODUCTION_PORT = '4174'
npx playwright test --config playwright.production-v03.config.ts
git diff --check
```

头像校验使用已安装的工作区运行时 `sharp`，无须下载新依赖；其他机器可将 `PORTRAIT_SHARP_PATH` 指向自己的安装位置。测试采用独立浏览器上下文和 5182／4174 端口，没有读写用户 5173 页面里的存档。构建仍有既有包体与第三方注释提示。旧存档不迁移，美术批准、长期平衡试玩及真实低端机检查不纳入本次自动化完成声明。未提交或推送本轮修改。
