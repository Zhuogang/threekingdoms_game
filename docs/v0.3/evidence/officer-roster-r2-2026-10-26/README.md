# 武将扩容 R2 验证记录

2026-10-26。完成 R2 人物初始化、年度登场、成年成长和存储校验。R1 年表与两套开局配置已进入实际新战役；R3 招募／NPC 首都／首次编兵、R4 头像和人物资料界面、R5 整体玩法验收尚未开始。见[阶段计划](../../12-officer-roster-expansion-plan.md)和[实施进度](../../implementation-status.md)。

## 运行结果

| 剧本 | 在世                   | 开局已故记录 | 世界名单合计 | 静态待登场 |
| ---- | ---------------------- | ------------ | ------------ | ---------- |
| 190  | 69（34 在职、35 在野） | 0            | 69           | 29         |
| 200  | 66（50 在职、16 在野） | 15           | 81           | 17         |

两个剧本各六势力的开局均通过实际初始化、存取往返、君主／首都／太守及原有兵员账校验。新增人物不会赠兵、粮、人口或金钱；待登场者没有运行对象。生卒依据和《三国志11》参考数据沿用 R1，未重新改变年表。

年界在原有月结和旧人物增龄之后创建新人，合并同年人才消息并提交年份。按固定 ID 顺序处理，不额外抽取随机数；新人不追溯参加刚结束的自治行动，也不插入正在进行的战斗。已有身份记录包括已故／被俘者一律不重建。存储要求开局及已处理年份的人物记录完整，丢失记录判为无效，不自动补人；允许合法的年界月结前游标保存重载。

已故年龄冻结、未知年龄跳过增长；开局当年死亡或开局后的历史／游戏参考卒年不强制杀人。到 18 岁只对当前能力叠加差额：实际装备、训练命令使 17 岁孙策到武力 100，成年到 103，保留经验 100、等级 1 和精良兵器；重载后不重复成长。恰好 18 岁登场的吕蒙直接采用成年基准。224→225 专用场景验证姜维到年登场；不代表模拟了整段正常战役。

另修复中立城的空势力比较：在野居民不进入守军、不参加撤退和战后判俘，征服／劫掠占领／劫掠离开三种结算均有回归测试。零兵在职武将仍沿用原有撤退、被俘规则。

## 实跑检查

| 检查                         | 结果                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| 全量规则／集成               | 529／529 通过，44 文件；在单 worker 下运行，含原有战斗性能门槛                                    |
| 本批新增规则覆盖             | 17 项生命周期集成、2 项月度年龄边界、3 项中立城战后回归，共 22 项                                 |
| 新增浏览器验收               | 中英文共 8 项：两剧本存档续玩、跨年通知及重载幂等、旧名册提示及原数据保留                         |
| 既有浏览器回归               | 3 项：新开战役／导入导出、城务装备救济、48×32 战斗显示及续玩                                      |
| TypeScript／生产构建         | 通过；保留已有包体提示（当前 JS 941.18 kB，gzip 290.84 kB）及依赖注释提示                         |
| UI 静态检查                  | 通过                                                                                              |
| 本次修改的文件格式／差异空白 | Prettier 和 `git diff --check` 通过                                                               |
| 全仓库格式检查               | 未通过：40 个未修改的既有素材文档／生成 JSON 格式问题；与本批修改文件无交集，未扩散修改           |
| 文档链接及数据账             | 本地链接有效，12 份相关源码指纹匹配，98 个唯一人物、48 份城市兵员账守恒、2 个实际开局存取往返有效 |

全量测试日志：[unit-integration.log](unit-integration.log)。浏览器日志：[生命周期 8 项](browser-lifecycle.log)、[原有流程 3 项](browser-smoke.log)。[构建日志](build.log)、[本批格式检查](changed-format-check.log)、[全仓库格式遗留项](global-format-check.log)分别归档。[中文人才通知](annual-notice-zh.png)、[英文人才通知](annual-notice-en.png)已目视检查，年份、姓名及搜索说明正常显示；未用这些截图替代 R4 的完整头像、字体或窄屏验收。

R1 阶段结束时为 507 项规则测试，本批增加 22 项。原有测试依赖旧归属的场景显式模拟已经招募的人物、重新任命太守或受控军队；虚构身份改为真实已登场人物，保留原有权限、兵员、伤兵、经验、粮耗及存储断言，未放宽产品规则或性能阈值。

## 复现

Windows 测试临时目录使用工作区 `.artifacts/vitest-temp`，仅对当前命令设置 `TEMP`／`TMP`；全量测试与构建、浏览器串行，避免干扰性能断言。

```powershell
New-Item -ItemType Directory -Path .artifacts/vitest-temp -Force | Out-Null
$env:TEMP = (Resolve-Path .artifacts/vitest-temp).Path
$env:TMP = $env:TEMP
npm test -- --maxWorkers=1
npm run build
npm run lint:ui
$env:HEGEMONY_V03_PORT = '5182'
npx playwright test --config playwright.v03.config.ts tests/e2e-v03/officer-lifecycle.spec.ts
npx playwright test --config playwright.v03.config.ts tests/e2e-v03/campaign-smoke.spec.ts --grep 'starts a campaign|runs reward, equipment|renders and resumes'
node tools/v03-officer-roster-audit.mjs
git diff --check
```

默认沙箱禁止访问本地 socket，首轮浏览器未进入测试并终止；允许本机测试网络后在独立的 5182 端口重跑，11 项通过。没有操作用户 5173 页面或其存档。旧名册存档不迁移，界面提示新开战役，原始数据保留。

[roster-audit.json](roster-audit.json)保留 R2 交付时的人物库、开局、日程、兵员账、实际初始化及源码指纹。R3 起 `node tools/v03-officer-roster-audit.mjs` 输出新的 [R3 机器账](../officer-roster-r3-2026-10-26/roster-audit.json)，不覆盖本快照；旧指纹不代表后续源码。原始 [R1 数据账](../officer-roster-2026-10-26/roster-audit.json)和[游戏参考快照](../officer-roster-2026-10-26/san11-reference.json)继续保留。
