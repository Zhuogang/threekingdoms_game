# 武将扩容 R4 验证记录

2026-10-26。接通新头像、98 人名册及资料界面；两套开局、年代、势力与 R3 招募编兵规则保持。R5 整体验收仍未开始。[阶段计划](../../12-officer-roster-expansion-plan.md)、[实施进度](../../implementation-status.md)。

## 实现范围

- 从制作清单生成仅含 ID 和两档路径的轻量索引，覆盖 98 人及民兵。原有 53 人保留早期原头像，45 位新人用新图；16 套修订像不增加人物、不自动换脸。马腾、马良和祖茂的旧 ID 映射保持。
- 开始页、城池名单／资料、战场及侧栏统一解析。HTML 和 SVG 缺图时保留姓氏及完整姓名，复姓从身份定义读取。名册面板按需加载，每页最多 12 张小图，资料才加载大图，不一次解码 196 张头像。
- 名册按姓名／复姓和五种状态筛选，定义与世界记录只读派生；未来与已故者不创建对象、不开放现役操作。资料展示当前年龄、所属、位置、兵种、能力或成年基准及年代来源，参考卒年不决定局内命运。在途俘虏不显示假的驻城链接或列入实地俘虏名单。
- 城池在职与在野分组，外城、在野、被俘或已故者没有直接训练／装备／编兵菜单。有效驻城链接只导航，正常权限与命令保持。
- 保留原八位楼船统帅，明确新增吕蒙、陆逊、周泰、朱然、徐盛、丁奉六个外观资格；190 年开局增加已登场的周泰。其他新增吴将不自动获得。画像与船型仍由同一统帅决定，水战倍率和旧特性未新增效果。

## 检查结果

| 检查                 | 结果                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| 全量规则／集成       | 590／590 通过，46 文件；新增 17 项头像、资料、状态与权限测试                                           |
| R4 开发浏览器        | 12 项：中英文、320／390／1366px、200% 缩放、分页懒加载、滚动／键盘返回、状态权限、缺图及新统帅战场回退 |
| 既有开发浏览器       | 3 项通过：新战役／存取、装备与救济、48×32 战场                                                         |
| 生产子路径           | 新名册／头像及既有城池素材、发布续玩共 3 项通过                                                        |
| 字体 cmap 及哈希     | 全 98 人的 149 个姓名汉字覆盖，祎叡恪瑾瓒懿谡琬无缺字，两字体哈希有效                                  |
| 头像资源             | 98 人两档实际文件及哈希核对，民兵两档存在；45 人新路径、53 人原图                                      |
| 构建与 UI            | 通过，保留既有包体提示；目录面板另按需加载                                                             |
| 本次格式、数据与链接 | 本批文件 Prettier、差异空白、人物及资源指纹和本地链接检查通过                                          |
| 全仓库格式检查       | 保留 40 个未修改的既有素材文档／JSON 格式遗留项                                                        |

[font-coverage.json](font-coverage.json)检查实际打包字体 cmap，不把系统回退当作通过。汉字子集由 356,272 增至 440,376 字节，许可原文保持。日志：[规则集成](unit-integration.log)、[R4 浏览器](browser.log)、[既有流程](browser-smoke.log)、[生产子路径](production.log)、[构建](build.log)。

生产测试检查浏览器解析后的 `/hegemony/` 实际图片 URL、自然宽度与成功加载，兼容构建中的相对路径。战场场景起初攻打无守军城池，按现有规则立即结束；补入从人口扣除的 500 名受控民兵后，新统帅通过真实征募、编兵和行军进入可检查战场，未改战斗规则。Windows 文件占用一度导致两份文件格式化写入失败，结束并发写入后重跑。

## 复现

```powershell
node tools/generate-officer-portraits.mjs
python tools/subset-fonts.py
python tools/validate-officer-fonts.py docs/v0.3/evidence/officer-roster-r4-2026-10-26/font-coverage.json
$env:TEMP = (Resolve-Path .artifacts/vitest-temp).Path
$env:TMP = $env:TEMP
npm test -- --maxWorkers=1
npm run build
npm run lint:ui
$env:HEGEMONY_V03_PORT = '5182'
npx playwright test --config playwright.v03.config.ts tests/e2e-v03/officer-directory.spec.ts
npx playwright test --config playwright.v03.config.ts tests/e2e-v03/campaign-smoke.spec.ts --grep 'starts a campaign|runs reward, equipment|renders and resumes'
$env:HEGEMONY_PRODUCTION_PORT = '4174'
npx playwright test --config playwright.production-v03.config.ts
node tools/v03-officer-roster-audit.mjs
git diff --check
```

字体源文件与 fonttools 使用既有 `.artifacts/` 缓存。测试使用独立端口与上下文，没有操作用户 5173 页面或存档。当前美术仍为 draft，未发布或宣称正式批准。

截图目视复核发现资料页间距变量未定义，已改为现有间距 token，并增加桌面左右间距及窄屏上下间距断言。由列表底部进入资料时会回到内容顶部，不抢走姓名筛选框的输入焦点。最终截图见[桌面资料](profile-zh-desktop.png)、[320px 英文资料](profile-en-320.png)、[200% 缩放缺图](fallback-en-zoom.png)、[新统帅战场回退](battle-fallback.png)。[本批格式检查](changed-format.log)、[全仓库遗留格式项](global-format.log)另存。

[roster-audit.json](roster-audit.json)保存 R4 数据、实际开局往返与相关源码／字体指纹；[R1](../officer-roster-2026-10-26/README.md)、[R2](../officer-roster-r2-2026-10-26/README.md)、[R3](../officer-roster-r3-2026-10-26/README.md)证据按时点保留。R5 的各势力全流程、伤兵、恢复、上下水与综合验收仍待接续。
