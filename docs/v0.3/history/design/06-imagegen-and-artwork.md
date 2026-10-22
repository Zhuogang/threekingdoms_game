# Track 06：imagegen 与原创水墨美术

> **Historical design / planning record, retained October 22, 2026.** Statements such as “pending” describe this document’s original implementation stage. Read the [current v0.3 overview](../../README.md), [current status](../../implementation-status.md) and [player guide](../../player-guide.md) for the playable version. This record does not create new implementation work.

**状态（2026-10-21 审计）：7 个原创 ImageGen 候选已生成、登记并接入候选画面；manifest 中全部仍为 `draft`。目前只有 3 种兵种具备独立人物图，主地图河山是示意而非地理校准结果；变体、区域地物、实际小尺寸人工审核、用户指定修订及低端设备检查未完成。详见本文末的实施审计。**

**负责人：独立美术代理。**

**定位：** 为新三国游戏制作中式水墨素材，保持地域与战术信息可读。San10WPK 仅作为空间层次和操作阅读的参考，不复制其素材或移植其攻城系统。

本轨道可以独立于 [04：战场和水战](04-battlefields-and-water-combat.md) 开始；通过 [05：渲染与地图 UI](05-rendering-and-map-ui.md) 的视觉合同接入。imagegen 生成画作，程序决定坐标、通行、范围、命中和数值。

## 1. 美术方向与范围

- 宣纸暖白、炭墨轮廓、灰绿与淡赭少量设色；山水有笔触但不遮挡单位。
- 高视角斜俯视，地面采用 2:1 菱形投影；地物有层次，避免正侧面高山遮住数行格子。
- 可走山坡 `hill` 与不可走峭壁 `cliff` 是不同语义。峭壁用断面/陡缘造型配合程序的不可通行标记；山坡保留缓坡脚与可展开的地面。原生标记可先交付，不必等峭壁绘画完成才验证寻路。
- 24×20 的整体空间以连贯河道、岸线、田地与山谷组织，不能将旧地形图标机械铺满四倍面积。
- 步兵、骑兵、弓兵的轮廓保持清楚；其他保留兵种也有明确徽记。阵营、战斗数值、等级和状态由界面添加，不烘焙进画作。
- 全兵种下水使用共同运输表达；不要求水军技能。画面表达在舟/运输平台上作战，尤其不能让骑兵读成马匹踩在水面。
- 本轮不制作战场城墙、城门、攻城器、破门、街巷攻城或设施损毁套件。主地图古城图标可以有城楼外形，仍只是地图身份。

## 2. 并行生产与阻塞点

| 可以先做                             | 开始前需要什么             | 不需要等待什么         |
| ------------------------------------ | -------------------------- | ---------------------- |
| 水墨风格板、地面材质候选             | 本节方向与已有原创素材参考 | 地理全表、战场 AI      |
| 一块秦岭低山、一组树林、一顶野战营帐 | 05 的投影、锚点与尺寸合同  | 最终地图生成器         |
| 步兵/弓兵/骑兵投影样板               | 单位脚点与方向规则         | 新伤害公式             |
| 通用运输舟形 + 各兵种组合样板        | 水上状态显示合同           | 水战具体乘数与移动费用 |
| 四区域材质与地物变体                 | 一张通过实际镜头验证的样板 | 其他三个区域的玩法平衡 |

**等待项：** 主地图最终背景必须等 [01：地理与路线](01-geography-and-routes.md) 的布局参考批准；最终战场贴合截图必须等 05 可运行镜头；正式采用必须通过游戏内小尺寸审核。将“需要最终验收”与“不能开始工作”分开，避免三个轨道互相空等。

## 3. 资产合同 V1

以下与 05 共用，实施前冻结。文件名、尺寸或锚点改变必须升级清单版本，不能只在渲染代码里补偿。

| 类别                      | 运行时规格                                   | 锚点与边界                                                | 推荐路径（未来实现）                                       |
| ------------------------- | -------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| 地表材质                  | 512×512 WebP，通常不透明                     | 不带格线；由渲染器裁切实际地形边界                        | `public/assets/v03/terrain/material-<kind>-<variant>.webp` |
| 立体地物                  | 512×512 WebP，真实 alpha                     | 锚点 `(0.5,0.84)`；至少 8% 安全边；清单注明占地与最大外扩 | `public/assets/v03/terrain/prop-<kind>-<variant>.webp`     |
| 单位                      | 256×256 WebP，真实 alpha                     | 脚点 `(0.5,0.86)`；完整武器/马匹在画布内                  | `public/assets/v03/units/<type>-<variant>.webp`            |
| 通用运输标记              | 256×128 WebP，真实 alpha                     | 锚点 `(0.5,0.60)`；预留叠放兵种图标的位置                 | `public/assets/v03/units/transport-craft-<variant>.webp`   |
| 主地图背景                | 布局批准后确定画幅；建议长边约 3072 像素起测 | 保持批准的投影与边界比例；不拉伸适配旧图                  | `public/assets/v03/maps/realm-ink-<layoutVersion>.webp`    |
| UI 图标、范围、道路、格线 | 程序原生图形                                 | 无生成文字；不交由 imagegen 制作逻辑标记                  | 05 拥有                                                    |

生成源图可以更大或采用工具实际返回尺寸；最终裁切和缩放后必须精确达到清单规格。透明边缘不是可随意裁掉的空白：脚点坐标必须保持不变。地表材质、河岸线和立体地物属于不同类型，不用一个透明大贴图同时承担全部语义。

### 3.1 资产清单必须记录

稳定资产 ID、合同版本、相对路径、尺寸、alpha、脚点、名义绘制宽高、占地、最大外扩、朝向/可否镜像、变体种子、可替代资产 ID、生成来源、提示词 ID 与最终文件 hash。

- 文件命名使用新游戏的通用类别和 `v03`，不新增 `baye` 前缀。
- 候选状态为 `draft → reviewed → approved → integrated`；“生成成功”只意味着 draft。
- 05 遇缺图时按资产类别显示原生语义回退。清单不含攻击/防御/移动倍率。
- 变体由地图种子或坐标稳定选择；画面切换与随机变体选择不消耗游戏 RNG。
- 原创素材允许复用，但必须证明其投影、脚点与风格符合 V1。复用旧图不等于免除审核。

## 4. 分批任务与明确产物

### A0：风格与投影样板

产物：一份含现有原创地图/单位、目标水墨色板、参考地面菱形和单位脚点的简短美术板；一块山岭、一组树、一名步兵和一只运输舟的候选。

验收：05 把四项放进灰盒，近景和全图都能理解；没有纸质矩形背景、棋盘格、遮挡式巨山或脚点漂移。玩家的水墨方向已确定，样板审核是实际可读性检查，不重新询问是否采用中式水墨。

### A1：地表、河流与地区地物

首批建议：

| 分组         | 素材需求                               | 变体目的                                     |
| ------------ | -------------------------------------- | -------------------------------------------- |
| 地表         | 北方平地、南方田地、低山谷地、道路材质 | 控制亮度，减少重复纹理                       |
| 水面         | 平静河面、浅色岸边、水纹               | 保持水格与陆格容易辨认，不用深色大浪遮挡高亮 |
| 河岸装饰     | 河岸植被、卵石滩                       | 岸线几何由程序生成，装饰不能改变通行边界     |
| 北方低丘     | 低矮黄土坡与疏灌木                     | 区别于秦岭岩岭                               |
| 秦岭山谷     | 石岭、松林、开阔谷地                   | 形成河谷而非密集山墙                         |
| 不可通行峭壁 | 低占屏面积的岩壁断面与陡缘             | 区别于可走山坡；占位和禁止进入标记由程序提供 |
| 南方平原     | 田埂、疏林、竹丛                       | 成都样板保持平原可耕空间                     |
| 野战营地     | 帐篷与旗杆                             | 标识营地位置，不引入城门/攻城含义            |

每组先 1 个通过样板，再补 1–2 个变体；不以“素材数量多”代替整体质量。桥梁/渡口仅在 04/05 已定义其通行表示时做装饰版本，不能凭美术创造唯一可下水入口；所有单位按规则可进入水域。营地帐篷是目标覆盖图形，不代表 `fort` 地形或额外减伤；美术不得以重甲城堡外观暗示防御加成。

### A2：作战单位与水上表示

- 先检验现有步兵、骑兵、弓兵是否能适配新投影；不符合时分别生成同画风新版本。
- 单位基础朝向固定为面向画面右侧的三分之四视角。简单镜像须由清单标识；武器、徽记不能导致镜像后文字倒置，因为原图不得含文字。
- 护卫、先锋等保留类型可复用符合合同的主轮廓，但必须在 05 中保留独立兵种标记。
- 水上不替换单位类型。通用舟形承托精简单位轮廓或兵种徽记，兵力、士气、攻击/防御修正仍由 UI 展示。
- 骑兵的水上缩略图保留马头/骑兵徽记等身份线索，表现运输中；不制作“水军专属免惩罚”版。
- 水中攻击降低、防御降低的具体数值引用 04，不能画在旗帜、船身或技能徽章里。

交付：六种类型在陆地与水面上的组合联系表，以及真实镜头中的 10v10 截图。只给三个高清人物 PNG 不算完成。

### A3：地理校准后的主地图画作

1. 01 提交批准的布局参考：24 城锚点、主河流、山系、海岸、允许留白及来源等级。城市标记可以放在参考中作为定位辅助，但正式画作不含城市/文字。
2. 05 输出等比例的生成参考与叠图检查底图，包含准确边界与关键河谷位置。
3. 06 生成两个风格候选，选择地理结构更稳定且前景更易读者。
4. 将生成图与批准布局叠加检查；偏离关键河谷、山系、海岸时有针对性编辑，不通过移动城图标来迎合错误画作。
5. 正式地理线与道路仍由程序绘制；生成背景负责地貌笔触与气氛。无法稳定遵守的精细河道，采用平静背景加程序河道的组合，保持地图正确。
6. 在实际主地图测试全城可点、标签避让、路线可见、在途军旗可辨，才导出最终 WebP。

最终画幅与地理布局一致；不把当前 2000×1440 旧示意底图扩到更高分辨率后称为“真实地理”。

### A4：整合与发布素材

产物：版本化资产清单、正式 WebP、来源记录、完整提示词、尺寸/hash 校验、游戏内对照图及缺图回退证据。未采用候选留在 `.artifacts/v03-art/`，正式采用内容进入项目资产目录，不能仅保存在生成工具默认目录。

## 5. imagegen 执行规程

参考本机 [imagegen 技能](C:/Users/pengz/.codex/skills/.system/imagegen/SKILL.md)。后续实现代理首次实际使用该技能时，先在进度消息中说明；本文件只规划流程。

1. 默认使用内置 imagegen；无需要求用户提供 API key。没有用户明确要求时，不转为 CLI/API。
2. 新图仅给文字与必要参考；编辑已有本地图片前，先用查看图片工具检查目标。分别说明“布局约束”“风格参考”“编辑目标”，不混淆角色。
3. 透明资产明确请求真实透明背景，并保留 alpha。不能把白底或棋盘格当透明图交付。
4. 每类独立资产/变体分别调用；不靠一张复杂大拼图规避视角与边距控制。少量风格概览可用联系表，但运行时素材需独立校验。
5. 图像生成完成后检查轮廓、内容、视角、脚点、安全边和禁用元素。修改内容继续使用 imagegen 编辑；脚本仅做已明确的裁切、缩放、编码与验证。
6. 每轮只改明确的问题，如“降低山岭高度”或“把骑兵船载轮廓留在同一脚点”，避免同时改变画风与构图。
7. 复制采用结果进项目并登记来源；保留既有资产直到 05 完成切换，不静默覆盖同名旧图。
8. 概念图、源图和实际运行时图分别标记，防止 README 使用概念图冒充游戏截图。

## 6. 可直接使用的提示词模板

每次生成都在模板外补充资产 ID、参考角色、合同版本与具体变体内容。以下不包含战斗数值或不可见的规则要求。

### 6.1 山林地物

> Use case: stylized-concept. Asset type: one transparent terrain prop for an original Chinese Three Kingdoms tactical game. Subject: [low Qinling rocky ridge / sparse pine grove / low loess hill / southern broadleaf grove]. Traditional Chinese ink wash on a high oblique 2:1 ground projection; restrained charcoal, warm grey, muted sage and very light ochre. Input A is the ground projection and footprint guide; input B is our original art style reference. Keep a compact, low silhouette so nearby troops remain visible. Entire prop fits inside the canvas with transparent margins; the contact point is horizontally centered near 84% of canvas height. True transparent background. No paper rectangle, text, grid, labels, walls, gatehouse, UI, characters, checkerboard or watermark. Do not bake a terrain border or gameplay tile into the picture.

### 6.2 可重复地表

> Use case: stylized-concept. Asset type: quiet ground material for a Chinese ink-wash strategy game. Subject: [northern open earth / cultivated southern plain / pale mountain-valley ground]. Fine low-contrast brush texture with sparse organic detail, even lighting, no dominant object, no horizon. Intended to be sampled and clipped by game code, with unobtrusive repetition. Warm ivory, diluted charcoal, a restrained touch of grey-green or ochre. No text, roads, rivers, city, grid, frame, UI or baked shadows from tall objects. Produce a flat material study; geographical boundaries are supplied by the renderer.

生成器不保证无缝；必须实际平铺检查。无法无缝时，改用更均匀的材质或由渲染器作受控混合，不隐瞒接缝。

### 6.3 单位

> Use case: historical-scene. Asset type: single transparent unit sprite. Subject: [late-Han inspired infantry with spear and shield / mounted lancer with complete horse / foot archer with clearly curved drawn bow]. Match our approved Chinese ink wash style, bold readable silhouette, charcoal and warm grey with restrained pale highlights. High oblique view consistent with the 2:1 ground reference, facing screen-right in three-quarter view. Complete figure and weapon, no cropped feet, bow or horse. Contact point centered near 86% of canvas height with transparent safety margins. True transparent background. No scenery, ground tile, water, faction colors, text, badges, UI, paper backdrop or watermark. Readable as a small tactical miniature; period-inspired rather than a verified archaeological reconstruction.

### 6.4 全兵种通用的水上载具

> Use case: stylized-concept. Asset type: a shared transport-craft base for tactical unit markers. A small simple wooden transport boat or low river platform seen from the same approved high oblique 2:1 angle. Clear horizontal footprint, understated ink-painted hull and very small pale water ripples; leave a quiet central area for a troop silhouette or class badge added by game code. It should read as ordinary transport used by any army, not an elite warship or naval skill. Traditional Chinese ink wash, neutral charcoal, pale grey and muted brown. Full craft contained with transparent margins, contact anchor centered near 60% of canvas height. True transparent background, no person, horse, text, stats, insignia, UI, paper rectangle, checkerboard or watermark.

### 6.5 主地图底图

> Use case: stylized-concept. Asset type: geography-aligned background for an original Three Kingdoms strategy game. Create a refined Chinese ink-wash atlas on warm ivory rice-paper texture, high bird's-eye view with quiet open plains, expressive but low-contrast mountain brushwork, and restrained celadon water. Input A is the approved geography layout and exact framing constraint; preserve its mountain belts, river corridors, basins, coast and label-safe zones. Input B is our own original style reference only. Keep city markers, roads, route highlights, all labels and UI out of the final painting because they are rendered separately. No lettering, seal, compass, border, flags, saturated 3D terrain or fantasy map elements. Where a precise river boundary is uncertain, keep the wash quiet rather than inventing new branches. Match the approved aspect ratio without moving landmarks.

## 7. 验收清单

### 自动资产检查

- 清单中每个正式 ID 有可解码文件；路径大小写和部署基础路径一致。
- 尺寸与 V1 合同一致；透明素材确实有 alpha，边缘没有棋盘纹或不透明纸框。
- 脚点、安全边和轮廓不被裁断；不能因自动 trim 导致不同变体站位漂移。
- 记录单文件与总传输体积、解码纹理内存估算。建议首轮新增正式图像压缩总量以 3 MiB 为优化目标；超出先查大背景/重复素材，最终预算由性能负责人依据真实设备确认。
- 限制生成素材进入版本库的范围；未用候选、原始大图与手册截图不进入运行时包。
- hash、提示词记录和文件匹配；重新生成相似图不能冒用上一次来源记录。

### 游戏内人工检查

- 四区域：汉中山谷、寿春水网、下邳平原、成都田野；同一投影与画风。
- 近景辨认单位、兵力与水上状态，全图辨认河道、敌我位置和营地。
- 所有类型下水后都有一致运输表达；骑兵不踩水、不溺水；水军外观不暗示规则豁免。
- 岸线与真实水格一致，所有单位可以按照 04 的规则进入水域，桥/渡口装饰不误导为唯一入口。
- 1366 与 1920 宽、中英与大字号测试后，无贴图遮住关键标签或可走格。
- 地物绘画不会把无规则意义的高度画成必然不可通行；森林/山地的可走性说明来自 UI。
- `hill` 山坡与 `cliff` 峭壁在近景和全图都可区分；程序的峭壁标记在缺图时仍然清楚。营地装饰不改变原有地面类别，也不暗示提供防御。
- 缺图时原生符号仍传达同样的兵种、阵营、水上与目标信息。
- 无战场城门、墙体攻坚或损毁效果；主地图城市图标不被误认作此次包含攻城玩法。

## 8. 完成报告与交接

交付给 05：合同/清单版本、正式资产 ID、尺寸与脚点、最大占位、镜像规则、回退类别、来源/提示词记录以及四区域游戏内截图。交付给集成/QA：文件与总包大小、验证结果、采用/未采用列表、仍需用户视觉确认的问题。

只有通过游戏内验收的素材可标记 `integrated`。README 图片应由集成负责人对最终可玩版本重新截图；本轨道提供图片和来源，不修改战斗规则、地理坐标或 Wiki 数值来迎合画作。

## 9. 实施审计（2026-10-21）

核对对象：`public/assets/v03/`、`src/v03/rendering/assets.ts`、`docs/v0.3/assets/manifest.json`、`provenance.md`、渲染组件以及 v0.3 浏览器验证。所有当前候选继续保持 `draft`；只有用户完成最终视觉复核并同意具体版本后，才可逐项升级状态。用户要求的具体艺术修订仍待用户反馈，本审计不推断或替代该决定。

| 状态   | 范围与证据                                                                  | 结论                                                                                                                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 已实现 | `docs/v0.3/assets/manifest.json`、`provenance.md`                           | 7 项独立候选均有稳定 ID、类别、运行时尺寸、alpha、锚点/绘制尺寸、来源文件、prompt ID、SHA-256 与 `draft` 状态；保留生成源图及两张独立主地图候选。每个独立资产分别生成，没有把运行时资产做成一张拼图。                                                                  |
| 已实现 | manifest、`src/v03/rendering/assets.ts`                                     | 地表材质 512×512 不透明；松岭 512×512 alpha、锚点 (0.5,0.84)；步兵/弓兵/骑兵 256×256 alpha、锚点 (0.5,0.86)；运输舟 256×128 alpha、锚点 (0.5,0.60)；主地图背景 1000×1000 不透明。renderer 使用 BASE_URL、基础图像载入失败时转为原生图形。                              |
| 已实现 | `provenance.md`、manifest                                                   | 地面平铺边缘在 WebP 后的均值差记录为 1.46/255；透明精灵的 alpha bounding box 和锚点像素有记录；地图候选 02 的来源、输出尺寸、文件体积、哈希和选择理由有记录。                                                                                                          |
| 已实现 | `tests/e2e-v03/campaign-smoke.spec.ts`                                      | 浏览器检查主地图 atlas 返回 200 且以图像节点显示；战场可加载图像；步兵/弓兵/骑兵/运输舟文件可解码，四角透明、中心不透明。该测试是技术层验证，不证明艺术质量或完整兵种组合。                                                                                            |
| 部分   | 资产构成、`BattlefieldMapView.tsx`、`presentation.ts`                       | 七项候选中只有步兵、弓兵、骑兵有独立人物精灵；naval、elite、guard 使用原生文字徽记。水上有一个通用运输舟，不含各兵种与运输舟的近景/远景组合版。六种类别数据均可显示，但六种都具备专属美术、在水上依然易辨认，尚未达成。                                                |
| 部分   | `ground-material-ink-01`、`ridge-pine-ink-01`                               | 已有单种地面材质与一款低松岭；森林目前由程序圆形树冠绘制。缺少不同平原/田地/道路/浅岸/水面材质，以及独立树林、南方植被、黄土坡、峭壁断面和野战营地美术；现有原生图形可以维持基本语义，但不满足完整地区变体包。                                                         |
| 部分   | `campaign-map-ink-01`、`provenance.md`、`src/v03/geography/illustration.ts` | 背景按 1000×1000 canonical 投影和 24 城锚点参考生成；较低对比和留白是候选 02 的选择理由。生成指南里的河/山走廊为示意，`illustration.ts` 也把线路明示为 generalized；背景不是经过来源核实的地理底图。精确城市、河流、山系与路线必须使用程序叠层并和 01 的权威数据核对。 |
| 部分   | manifest `status` 字段、provenance                                          | 七项资产状态全部是 `draft`。技术规格可验证，但尚无用户逐项视觉批准，也没有完整的 10v10、小尺寸、四区、缺图回退人工对照截图记录。当前战场截图自动化只证明组件存在、图像可加载。                                                                                         |
| 待验收 | 06 第 7 节                                                                  | 缺少 390px、1366×768、1920×1080、大字号和 200% 浏览器缩放下的完整素材可读性验收；特别是骑兵上舟、两阵营单位重叠、峭壁/山坡区别、营地目标及水上倍率标签。用户人工游玩/视觉检查仍待执行。                                                                                |
| 待验收 | 06 第 7 节                                                                  | 没有完整 WebP 总包大小、解码纹理内存估算及低端机器加载/绘制测量；目前只给主地图文件记录 85,930 bytes。低端实机测试按用户约定留待用户完成并反馈。                                                                                                                       |

### 后续优先级与验收

1. **P1 — 先完成地理与资产画布校准。** 等 01 给出来源与置信度明确的 24 城、河流、山系、海岸和标注留白数据，再与 05/01 重叠核对主地图候选；对偏离的山水进行局部有针对性的 ImageGen 修订。验收：城标/标签不靠挪动真实锚点来迁就画作；准确水系/路线/城市由程序绘制；最终艺术没有额外河道或山带造成误读。
2. **P1 — 处理用户指定的美术修订并逐项审阅七个候选。** 收集并实现用户明确的修订意见，每次只改变对应的画面问题；重新检查尺寸、alpha、锚点和路径，并更新 hash/provenance。验收：用户在实际集成画面中确认每个采用版本；未确认项保持 `draft`，不推定批准。
3. **P1 — 补齐玩法所需美术覆盖。** 至少验证六个兵种的陆上与水上缩略表现，必要时补生成护卫/精锐/水上部队徽记或组合用图；制作区别 hill/cliff 的轮廓、营地、基本森林和地域地面/河岸候选。验收：六种身份在常用视距和水上运输表达下仍清楚；程序回退与原 art 表达同一规则信息；城墙/城门/攻城器不进入战场包。
4. **P1 — 完成小尺寸与地区截图审核。** 在最终可玩界面检查下邳平原、寿春水网、汉中山谷、成都田野四场景以及 10v10；覆盖中英、390、1366×768、1920×1080、大字号及缺图回退。验收：没有资产压住河岸、兵种徽记、范围提示、地图标签或关键操作，骑兵上水不会读成马匹踏水。
5. **P1 — 做完资产包和低端设备性能验收。** 登记全体 runtime files 的总下载量/像素内存，并在真实低端设备测首次解码、切图和战斗帧时；由用户执行实机检查并记录结果。验收：提供机器、系统、浏览器、视口、资产版本和实际观测；超过建议体积时明确说明采用/压缩决定。
6. **P2 — 确认、归档和锁定版本。** 用户确认后更新 manifest 状态、prompt/provenance、hash 与批准截图，并清楚列出未采用候选。验收：每个 `approved` 或 `integrated` 资产都有与实际运行文件 hash 一致的来源记录和游戏内证明；未通过人工审核的继续为 `draft`。

在用户完成人工视觉复核与低端设备实测前，本轨保持候选状态，不把“生成成功”或自动化文件解码测试记作美术完成。
