# 陈仓攻城战：2.5D 美术计划

> 状态：**计划稿**（2026-10-31），§3 决定已于 2026-11-01 确认，DS5 同日定为 α；S1 六件已出图，2026-11-02 通过验收（§11.2），S2 的出图材料已备好（§9.2、§13）。本文件只管美术；攻城规则、2.5D 渲染器、战斗 AI 和战役接入另写计划，本文只列出它们必须满足的接口（§16）。玩法与 MVP 范围见 [02-chencang-mvp-plan.md](02-chencang-mvp-plan.md)（分支 `siege_v0.1`），其 §8 定了 MVP 要做的美术子集，§13 列出对本文的改动。

## 0. 摘要

- **一座城，一场战役**：陈仓之战（228 年冬）。先做成独立的历史战役，不进大地图；做好后，城防套件、攻城器械和部队给后续城池（易京等）复用。
- **画面 2.5D**：规则仍是 48×32 方格；画面改为**正面斜俯视**，有高度、有立面、有遮挡。攻方从画面下方（南）进攻，城在上方，城墙正面朝向玩家。
- **美术总量约 460 件**，分 S1–S7 七个阶段（§13）。本文详写 **S1 风格锁定**：投影规范、高度与比例、风格固定段、陈仓布局初稿、灰盒参考图、第一批 6 件 ImageGen 资产的完整提示词、测试场景和验收清单。
- **工作约定**沿用战场重做：我写布局、灰盒参考图、提示词和接入；你在 ImageGen 出图；每件经你确认再做下一件。S1 不通过，后面都不做。

## 1. 范围

### 本计划包括

| 类别 | 内容                                                              |
| ---- | ----------------------------------------------------------------- |
| 规范 | 2.5D 投影、高度层、比例尺、光照、遮挡与分层、切图与命名、动画方案 |
| 风格 | 风格圣经、调色板、军色、提示词固定段、三种风格候选                |
| 布局 | 陈仓 48×32 格子布局初稿和高度表（美术用，规则映射只是草案）       |
| 管线 | 灰盒参考图工具的规格（`tools/build-siege-blockout.mjs`，已写）    |
| 资产 | S1 六件资产的提示词与验收；S2–S7 的清单与关口                     |

### 不包括

攻城规则（城门耐久、云梯、填堑、重墙、地道的数值和判定）、2.5D 渲染器的实现、AI、战役模式接入、音频、存档格式。S1 的测试场景只需要一个静态分层的开发预览页（§11），可以先用现有的 React/SVG 搭，正式渲染器另议。

## 2. 史实底本（取材用）

| 项目       | 内容                                                                             | 来源性质                         |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------- |
| 时间       | 228 年冬（蜀建兴六年、魏太和二年十二月），诸葛亮第二次北伐，出散关，围陈仓       | 史载                             |
| 地点       | 陈仓，今陕西宝鸡市东，渭水河谷，秦岭北麓                                         | 史载；游戏内地形为改编，不是实测 |
| 守方       | 曹真预料诸葛亮下次会出陈仓，事先派郝昭等守城并修治城防。郝昭兵仅千余人           | 史载                             |
| 攻方       | 诸葛亮率数万人                                                                   | 史载                             |
| 劝降       | 诸葛亮派郝昭同乡靳详在城外喊话劝降，郝昭在城楼上作答拒绝；靳详再次劝降，又被拒绝 | 史载                             |
| 一阶段     | 蜀军起云梯、冲车；郝昭用火箭逆射烧毁云梯，用绳索连着石磨砸断冲车                 | 史载                             |
| 二阶段     | 蜀军造百尺井阑向城内射击，用土丸填平城堑，准备直接攀城；郝昭在城内再筑一道重墙   | 史载                             |
| 三阶段     | 蜀军挖地道（地突），想从城内钻出；郝昭在城内横向挖沟截断地道                     | 史载                             |
| 时长       | 昼夜攻守二十余日                                                                 | 史载                             |
| 援军       | 曹真派费曜等增援；魏明帝召张郃领兵驰援，张郃判断蜀军粮少，赶到之前就会退兵       | 史载                             |
| 结局       | 蜀军粮尽退兵，魏将王双率骑追击，被蜀军击破斩杀                                   | 史载                             |
| 季节       | 冬雪                                                                             | 依据十二月推定，雪景为美术选择   |
| 出场武将   | 诸葛亮、魏延、姜维、王平（蜀），郝昭、王双、张郃（魏），靳详（使者）             | 史书未记全，部分属于游戏安排     |
| 诸葛亮形象 | 羽扇纶巾、乘四轮车                                                               | 演义形象，美术选择               |

**战役骨架**（美术按它组织）：序章 劝降 → 一阶段 云梯冲车 → 二阶段 井阑填堑 → 三阶段 地突 → 终章 援军将至，退兵与追击。双方都可以玩：蜀军要在余粮和援军两个倒计时内破城；魏军以千余人守城。

## 3. 决定

2026-11-01 确认：九项全部按推荐定。DS5 本来就留到 S1 实测后再定（α 还是 β）；DS6 定了 A，S1-01 仍出三种风格作对照。同日在预览页对比 α、β 后，DS5 定为 **α**（§9.2）。

| ID  | 决定         | 选项                                                                       | 定案                                            | 理由                                                                                                       |
| --- | ------------ | -------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| DS1 | 投影         | 正面斜俯视（格子与屏幕对齐） / 界画式斜投影（格子变平行四边形） / 等距菱形 | **正面斜俯视**                                  | 格子仍是横平竖直的矩形，好读、好点选；ImageGen 只需画"顶面 + 南立面"，最容易画对。上一版等距菱形效果不好   |
| DS2 | 格子屏幕比例 | 64×48（俯角约 49°） / 64×56（约 61°）                                      | **64×48**                                       | 立体感更强；遮挡用剪影处理（§9.4）                                                                         |
| DS3 | 方位         | 攻方在下（南）、城在上 / 沿用攻左守右                                      | **攻方在下**                                    | 城墙正面朝向玩家，云梯、冲车、门楼都看得见；也和史实相合（蜀军出散关，自南而来）。只用于攻城图，野战图不变 |
| DS4 | 光源         | 西南方冬日低阳 / 沿用野战图的左上光                                        | **西南低阳**                                    | 照亮朝向玩家的南立面；冬天太阳在南，物理上也对。左上（西北）光会让南立面全在背光里                         |
| DS5 | 画法         | α 整画切层 / β 地表整画 + 建筑分件 / γ 立面贴图拼装                        | **α 整画切层**（2026-11-01 实测后定），γ 作保底 | 见 §9.2：α 整座城一气呵成；β 的墙更厚重，S1-02 与 S1-03 的垛口大小、节奏接不上                             |
| DS6 | 风格         | A 界画淡彩 / B 写意淡彩 / C 沙盘微缩                                       | **A 界画淡彩**，S1-01 三种都出                  | 界画是中国画里专画建筑的传统，线条平直精确，本身就是平行投影，最适合 2.5D 建筑                             |
| DS7 | 季节         | 冬雪 / 无雪                                                                | **冬雪**                                        | 合乎十二月；雪地让深色部队和墙体对比强                                                                     |
| DS8 | 部队画法     | 沿用 ink-04（小队 1 人、大队 3 人，人物尺寸固定） / 5–9 人军阵             | **沿用 ink-04**                                 | 之前已验证人多会缩小、看不清；2.5D 下同样适用                                                              |
| DS9 | 军色         | 见 §6.3                                                                    | **以战役势力色为基准，拉开明度**                | 刘 `#577b5d` 与曹 `#53778d` 明度太近，雪地和灰度下分不清                                                   |

## 4. 2.5D 投影规范（A01）

### 4.1 投影

- 正交平行投影，镜头朝正北，俯视约 49°，**没有偏航**：东西向的边水平，南北向的边竖直向上，所有竖直棱线竖直。
- 只看得见两种面：**顶面**和**朝南的立面**。东西两侧的立面永远看不见，南北向的城墙只看得到墙顶和南端截面。
- 没有透视、没有消失点，近处远处一样大。

### 4.2 坐标与尺寸（100% 缩放）

| 量                         | 值                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------ |
| 一格                       | 宽 64px，进深 48px                                                                   |
| 一层高度                   | 24px                                                                                 |
| 画布                       | 3072×1536（32 行 × 48px），原点在西北角；四边由程序淡出成纸色（2026-11-02 改，§9.2） |
| 格子 (x, y) 高度 h 的顶面  | 左上角 `(64x, 48y − 24h)`，大小 64×48                                                |
| 该格的南立面               | 从 `48(y+1) − 24h` 到 `48(y+1)`，高 24h                                              |
| 低于地面（h = −1，堑与河） | 底面下沉 24px；北岸的南立面露出 24px 土壁，南岸被下一行盖住                          |

- **ImageGen 单张出图**最大 1536×1024。S1-01 证明这个尺寸按 100%（一格 64×48）画城池已经够细，所以全图整画按 100% 分块扩画（§9.2），不再像野战图那样半尺寸出图再放大。
- **缩放**沿用现在的每格 32–96px 宽。分件按 100% 的 2 倍出图（每格 128×96、每层 48px），最大缩放 150% 时仍清晰。

### 4.3 光与影

- 冬日低阳从**西南（画面左下）**来：南立面受暖色淡光，顶面积雪，冷蓝灰影子投向**东北（画面右上）**，长度约为物体高度的 0.6 倍。
- **分件不画落地影子**，只画自身明暗；落地影子由程序按几何投出，保证所有件方向一致。整画（α）里的影子保留画的，程序只给部队投影。

### 4.4 与现有战场的关系

野战图保持纯 2D 正俯视、攻左守右，不受影响。两种画面语言会并存：陈仓先定位为展示级的大场面，野战要不要也改成 2.5D，等陈仓做完再议。

## 5. 高度层与比例尺（A02、A04）

### 5.1 高度层

| 层  | 用于                                       |
| --- | ------------------------------------------ |
| −1  | 堑、冰河                                   |
| 0   | 地面、道路、桥、城门洞、地道口             |
| 0.5 | 女墙（城墙外沿的垛口，叠在墙顶上）         |
| 1   | 土丘、营帐、木栅                           |
| 1.5 | 中军帐、冲车                               |
| 2   | 营房、武库、粮仓、器械工棚、重墙（建成后） |
| 2.5 | 帅府正堂                                   |
| 3   | **城墙顶走道**（守军站在这一层）           |
| 5   | 角楼、侧门楼、北门楼屋脊；井阑平台         |
| 6   | 井阑顶                                     |
| 7   | **南门楼屋脊**（全图最高）                 |

### 5.2 比例尺（以 100% 缩放计）

| 物体                       | 高     | 屏幕高度 | 说明                                          |
| -------------------------- | ------ | -------- | --------------------------------------------- |
| 步兵、弓兵（单人，含兵器） | 1.5 层 | 约 36px  | 和现有 ink-04 单兵的屏幕尺寸相近              |
| 骑兵（人加马）             | 1.8 层 | 约 43px  |                                               |
| 武将（战场形象）           | 2 层   | 约 48px  | 有意放大，一眼认出                            |
| 城墙（到走道）             | 3 层   | 72px     | 约为人的两倍；加女墙 84px，挡住北面约 1.75 行 |
| 南门楼（到屋脊）           | 7 层   | 168px    |                                               |
| 云梯                       | 3 层   | 72px     | 架上墙顶                                      |
| 冲车                       | 1.5 层 | 36px     | 有顶棚                                        |
| 井阑                       | 6 层   | 144px    | 平台在 5 层，高过城墙，能向城内射             |

## 6. 风格圣经（A03）

### 6.1 基调

水墨淡彩，配合**界画**的线：建筑、木构、瓦垄用平直、粗细均匀的墨线；雪、土、冰、水用透明淡彩；带宣纸纹。部队沿用 ink-04 的特征：粗黑轮廓、无五官、墨色肌理填色，在雪地上一眼能分出来。

### 6.2 调色板（提议）

| 用途               | 色值      |
| ------------------ | --------- |
| 雪（暖纸白）       | `#ece9e1` |
| 雪中阴影（冷蓝灰） | `#9aa3ad` |
| 夯土（赭）         | `#a8875a` |
| 城砖（灰）         | `#7d7a78` |
| 木构（深褐）       | `#4a3a2e` |
| 瓦顶（板岩灰）     | `#5b6168` |
| 门楼柱（赭红漆）   | `#8e3b2c` |
| 雪松（暗绿）       | `#3b4e3f` |
| 冰面（浅青灰）     | `#b8c6c9` |
| 墨线               | `#2a2622` |
| 火光（点缀）       | `#e07a2f` |

### 6.3 军色

战役界面里刘是 `#577b5d`，曹是 `#53778d`，色相不同，但明度和饱和度几乎一样，雪地上、灰度下、对色弱玩家都难分。提议：

- **蜀**：偏亮的青绿 `#5f9a5a` 战袍，赤色 `#a8432f` 镶边；
- **魏**：深靛蓝 `#2f4a6e` 战袍，黑漆札甲；
- 旗帜由程序用战役势力色绘制；军服负责明度上的区分。

### 6.4 提示词固定段

每件资产的提示词由这些固定段加本件的说明组成。S1 定稿后写进灰盒工具，改风格只改固定段，再重新生成全部提示词（同野战图的 `STYLE` 等四段）。

**FIDELITY**（有灰盒参考图时用）

```text
The attached image is a colour-coded 3D block-out, not a style reference. Strictly preserve the position, footprint, height and outline of every block: each block's top face and front face must stay within about a quarter of a grid cell of where it is drawn. Replace the flat colours with finished materials and keep straight architecture straight. Natural features (snow drifts, ice edges, trench banks, paths) may have soft organic edges, within half a cell of where they are marked.
```

**PROJECTION**

```text
Camera: orthographic three-quarter top-down view, looking due north and tilted about 50 degrees down from the horizon. Strictly parallel projection: no perspective, no vanishing points, near and far objects the same size. Every vertical edge is perfectly vertical, every east-west edge perfectly horizontal, and north-south edges run straight up the image. Only top faces and south-facing front faces are visible; east and west side faces are never visible.
```

**LIGHT**（场景） / **LIGHT_SPRITE**（分件）

```text
Light: low winter sun from the lower left (south-west). Front faces catch a pale warm light, top faces carry fresh snow, and soft cool blue-grey shadows fall toward the upper right.
```

```text
Light: low winter sun from the lower left (south-west). Front faces catch a pale warm light and top faces carry fresh snow. Shade the object itself only; do not paint any cast shadow on the ground.
```

**STYLE_A 界画淡彩**（推荐）

```text
Style: traditional Chinese ink-wash painting with light colour (水墨淡彩), with the precision of jiehua (界画) ruled-line architectural painting: crisp, straight, evenly weighted ink lines on walls, gate towers, timber and roof tiles; soft transparent washes on snow, earth, ice and water; subtle rice-paper grain. Restrained winter palette: warm paper-white snow, ochre rammed earth, grey brick, dark timber, slate roof tiles, muted pine green, with small accents of red lacquer.
```

**STYLE_B 写意淡彩**

```text
Style: expressive Chinese ink-wash painting with light colour (写意淡彩): confident loose brush strokes and wet-on-wet washes, architecture suggested with fewer lines but still straight and readable, generous paper-white snow, subtle rice-paper grain. Restrained winter palette: ochre earth, grey brick, dark timber, slate roofs, muted pine green.
```

**STYLE_C 沙盘微缩**

```text
Style: a hand-made military sand-table diorama (沙盘) finished in Chinese ink-wash colours: matte clay ground, carved wooden buildings with slightly softened edges, gentle ambient occlusion where surfaces meet, faint ink outlines. Everything stays in sharp focus; no tilt-shift blur. Restrained winter palette: paper-white snow, ochre earth, grey brick, dark timber, slate roofs.
```

**SURFACES**（可读性）

```text
Game readability: surfaces soldiers stand on (open ground, roads, wall walkways, gate passages) are calm, flat and light, with low texture contrast. Vertical faces are clearly darker than top faces, so every height step reads at a glance. Walls are exactly as thick as marked; the walkway on top of each wall is a clean light strip with a crenellated parapet along its outer edge. Keep detail density even across the image, with no vignette and no darkened corners.
```

**SPRITE**（分件背景）

```text
Isolated object only, on a perfectly flat solid magenta (#FF00FF) background with no gradient, texture or ground. Nothing else in the frame. Clean edges against the background, and no magenta tint reflected onto the object.
```

如果你用的 ImageGen 支持透明背景，就改为要求透明背景，去掉品红。

**EXCLUDE_SCENE** / **EXCLUDE_SPRITE**

```text
Do not include: any text, letters, calligraphy, seals or signatures; grid lines; borders, frames or paper margins; legend or compass; people, soldiers, horses, flags, banners or pennants; perspective views, horizon or sky; vignette; modern objects.
```

```text
Do not include: any text, letters, calligraphy, seals or signatures; grid lines or guide marks; ground, scenery or cast shadows; people, soldiers, horses, flags, banners or pennants; modern objects.
```

旗帜和字一律由程序绘制，ImageGen 写的字会糊。

## 7. 陈仓布局初稿（48×32）

x 0–47 从左到右（西到东），y 0–31 从上到下（北到南）。蜀军自南面散关道来，魏援军从东面长安方向来。

```
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
................................................
..............++++++++++++++++++++++++++++++++++
^^^.........-----------==-----------............
^^^^........--OWWWWWWWWGGWWWWWWWWO--............
^^^^^.......--W.....MMM++MMM.....W--............
^^TTT^......--WM.BBBBB.++KKKK...MW--....TT......
^TTTTT......--WM.BBBBB.++KKKK...MW--...TTTT.....
^^TTT^......--WM.BBBBB.++KKKK...MW--....TT......
^^^^^.......--W........++........W--............
^^^^...+++++==G++++++++++++++++++G==++++++++++++
^^^^...+....--WM.......++.......MW--............
^^^....+....--WM.BBBBB.++.BBBBB.MW--............
^^^....+....--WM.BBBBB.++.BBBBB.MW--.........^^.
^^.....+....--WR.RRRRRR++RRRRRR.RW--........^^^.
^^.....+....--W.....MMM++MMM.....W--.........^^^
^......+....--OWWWWWWWWGGWWWWWWWWO--.........^^^
^......+....-----------==-----------.........^^^
.......+....-----------==-----------..........^^
.......+...............++.......................
.......+...............++.......................
.......+...............++.......................
.......++++++++++++++++++.......................
...............SSSS.X..++....SSSS...............
...............SSSS....++....SSSS...............
.......................++.......................
..........PPPPPPPPPPPPP++PPPPPPPPPPPPP..........
^^^.......P.ttt..ttt...++...ttt..ttt.P..........
^^^^......P.ttt..ttt...++.CCCC..ttt..P....TTT...
^^^^^.....P.ttt..ttt...++.CCCC..ttt..P...TTTTT..
^^^^^^....P.ttt..ttt...++...ttt..ttt.P....TTT...
^^^^^^^...P............++............P..........
```

### 7.1 图例与高度

规则一栏只是草案，以攻城规则计划为准。

| 符号 | 画面                               | 高度              | 规则（草案）                     | 灰盒顶面色                     |
| ---- | ---------------------------------- | ----------------- | -------------------------------- | ------------------------------ |
| `.`  | 雪原、空地                         | 0                 | 平原                             | `#e6e4dc`                      |
| `+`  | 踩实的雪泥路、城内环城道           | 0                 | 平原                             | `#967046`                      |
| `~`  | 冰封的河                           | −1                | 水                               | `#9cc0d0`                      |
| `-`  | 城堑（半冻的水，陡土岸）           | −1                | 水；填平后变平原                 | `#7fa6b8`                      |
| `=`  | 木桥                               | 0                 | 平原                             | `#684220`                      |
| `W`  | 城墙（夯土包砖，走道加外沿女墙）   | 3                 | 城墙：守方可站，攻方需云梯       | `#8c8c9c`，立面 `#5e5e6e`      |
| `O`  | 角楼                               | 3，屋脊 5         | 城墙                             | 墙身 `#c8b8a0`，屋顶 `#50565e` |
| `G`  | 城门洞（上有门楼）                 | 0                 | 城门：有耐久                     | `#de2828`                      |
| `M`  | 马道（贴着墙内侧的坡道）           | 0 → 3             | 连接城内地面和墙顶（MVP §4.4）   | `#b4a48c`                      |
| `K`  | 帅府：y 6 一行是正堂，y 7–8 是前庭 | 正堂 2.5          | 正堂不可入；前庭是**攻方目标格** | `#b05842`                      |
| `B`  | 营房、武库、粮仓                   | 2                 | 不可入                           | `#a0704c`                      |
| `R`  | 重墙（开战时只是一条施工线）       | 0 → 2             | 平原 → 建成后成墙                | 虚线 `#9a8f74`                 |
| `^`  | 丘陵（秦岭余脉、东侧土原）         | 1                 | 丘陵                             | `#928860`                      |
| `T`  | 雪松林                             | 0（树冠视觉高 2） | 森林                             | `#386838`                      |
| `P`  | 蜀营木栅                           | 1                 | 森林                             | `#965ca0`                      |
| `t`  | 营帐                               | 1                 | 不可入（暂定）                   | `#c9b48a`                      |
| `C`  | 丞相中军帐                         | 1.5               | 不可入                           | `#b23a2a`                      |
| `S`  | 器械工棚（打造云梯、冲车、井阑）   | 2                 | 不可入                           | `#7a5a3a`                      |
| `X`  | 地道口                             | 0                 | 平原                             | `#3a2a1a`                      |

门楼的占地：南门楼 x 22–25、y 16（两层，屋脊 7）；北门楼 x 22–25、y 4（一层，屋脊 5）；西门楼 x 14、y 9–11，东门楼 x 33、y 9–11（一层，屋脊 5）。门楼坐在城墙上，视觉上可以向北多出半格。

### 7.2 要点

- **城很小**：墙内 18×11 格，合"小城、千余人守"。小城也让 2.5D 的建筑细节集中。
- **城门四座**：南门正对蜀营大路；东门通长安方向的大路（援军从东边入场）；北门过桥接渭水岸路（守军退路）；西门有一条小路绕到蜀军西翼。
- **杀伤带**：南墙在 y 16，堑在 y 17–18，蜀军部署在 y 20–25。墙头弓兵射程若加 1（规则待定），正好覆盖堑和 y 19–20。
- **重墙**：y 14 一道，留 x 16、x 23–24、x 31 三个口，两端接东西墙。建成后，南墙和重墙之间的 y 15 环城道就成了一个口袋：攻方登上南墙，前面还有一道墙。
- **地道**：地道口在蜀营前 (20, 23)，在地下向北穿过堑和南墙。地下层的画法见 B12（P2）。
- **蜀营**：木栅从 y 26 起围出营地，大路穿营而过，过木栅处立辕门；中军帐在大路东侧；两座器械工棚在 y 23–24，打造进度看得见。
- **马道**（2026-11-02 加，MVP 计划 §4.4）：每面墙两条，在城门两侧，紧贴墙内侧，每条 3 格。低端在门内的路旁，向外升到墙顶。S1 的六件出图时还没有马道，所以 S1 的灰盒不画它们；S2-01 第 1 步在 v2-a 上补画。
- **部署区**（MVP 计划 §4.1）：蜀军在 y 21–25 的空地和木栅以内，魏军在墙上和城内。只是界面高亮，不进画面。
- 格子比例、节奏和"每块围起来的地方至少两个门"的校验，等攻城规则定了再跑，不在美术计划里定。

## 8. 灰盒参考图（A05、J01）

ImageGen 能否画对 2.5D 透视，关键在参考图。野战图上传的是平面色块图；攻城图上传的是**按 §4 投影渲染出来的块面图**。

### 8.1 工具：`tools/build-siege-blockout.mjs`

2026-11-01 已写成：`node tools/build-siege-blockout.mjs`，除了仓库已有的 prettier（给生成的文档排版）不依赖别的包，十秒内跑完，输出到 `docs/siege/chencang/art/`。除了下面列的，还多出一张 50% 的全图灰盒 `blockout-full.png`，用来检查整张布局。布局或高度改了，改脚本再重跑。

- **输入**：
  - 布局（§7 的字符布局）；
  - 每种符号的高度和颜色（§7.1）；
  - 复合物件的定义：门楼、角楼（墙身盒子加屋顶棱柱，歇山顶简化成梯形加三角形）、帅府、营帐；
  - 本次出图的取景范围和比例（每格像素、每层像素）。
- **渲染**：按 §4.2 的公式，从北到南逐行画，同一行内从低到高（画家算法）。顶面用图例色，南立面用同色加深约 35%，每个面加 1px 深色描边。堑和河画出北岸土壁；重墙画成地面上的虚线。
- **输出**（每件资产一个文件夹）：
  - `blockout.png`：上传 ImageGen 用；
  - `grid.png`：透明底的格子和顶面轮廓，叠在出图上检查对位；
  - `masks/<物件 id>.png`：每个立体物件在屏幕上的轮廓蒙版，α 法切层用；
  - `footprints.json`：每个物件的占地格、高度、锚点、在图中的像素框；
  - `README.md`：本件说明、完整提示词、验收项。
- **人物表的参考图**：画好等分格子和每格的脚底基线、头顶线，作为部队姿态表的版式参考。

### 8.2 目录

```
docs/siege/chencang/art/
  README.md                 资产清单和状态（同 battlefield-art/README.md）
  s1-01-city-vignette/      blockout.png、grid.png、masks/、README.md、attempts/
  s1-02-south-gate/
  ...
public/assets/siege/chencang/   入库的运行资源
```

出图放 `attempts/`，依次命名 `v1.webp`、`v2.webp`，三种风格候选加后缀：`v1-a.webp`、`v1-b.webp`、`v1-c.webp`。

## 9. 分层、切图与动画（J02–J04）

### 9.1 图层

| 层              | 内容                                         | 来源                                   |
| --------------- | -------------------------------------------- | -------------------------------------- |
| L0 远景         | 北面冰河、北原、远山                         | 整画，可做视差（P1）                   |
| L1 地表         | 雪原、道路、堑、桥、建筑地基                 | 整画                                   |
| L2 贴花         | 车辙、焦土、碎石、插地箭                     | 分件（S3）                             |
| L3 立体件与部队 | 城墙、门楼、建筑、营帐、器械、部队、程序投影 | 分件，按深度统一排序                   |
| L4 女墙前沿     | 南墙外沿的垛口                               | 从城墙件里拆出，盖在墙头部队的下半身上 |
| L5 特效         | 火、烟、雪、箭雨                             | 分件或粒子                             |
| L6 界面         | 选中框、射程、剪影、旗帜、兵力条             | 程序绘制                               |

**深度排序**：按物件占地的最南一行排，同一行按高度从低到高；部队和立体件统一参与排序。墙头的部队画在墙顶面之上，再被 L4 女墙前沿盖住下半身，所以不需要另画"墙头半身版"。

### 9.2 三种做法

| 做法                       | 怎么做                                                       | 优点                                 | 缺点                                                               |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------ |
| **α 整画切层**             | 整座城一次画成，按灰盒蒙版切出墙、楼、房                     | 光影和风格天然一致                   | 要求画和灰盒对得很准；损坏、起火等状态要局部重画；不能给别的城复用 |
| **β 地表整画 + 建筑分件**  | 地表一张图；墙段、门楼、建筑按 2 倍分辨率单独出              | 细节足、状态好做、套件可给易京等复用 | 各件之间的光影和笔触要靠固定段和标准件对齐                         |
| **γ 立面贴图拼装**（保底） | 只让 ImageGen 画正对的立面和顶面材质，由程序贴到已知的矩形上 | 几何绝对准                           | 画面偏"拼贴"，屋顶等复杂形体难做                                   |

S1 用同一个取景同时做 α 和 β（§10），在预览页里对比后定。两种都画不对透视时，退到 γ。

**2026-11-01 定 α。** 在预览页同一视角对比，α 的整座城笔法、光影一气呵成。β 的墙更厚重、砖纹更密，南门两侧 S1-02 的小垛口和 S1-03 的大垛口并排时节奏接不上。由此：

- **城池**用整画按蒙版切层，和 S1 预览页的做法一样。城墙、门楼、角楼、城内建筑都不再单独出分件。
- **会变的部分**在整画上局部重画，切成和蒙版对齐的补丁，按状态替换。包括城门受损和门破、填堑、重墙施工、起火和焦痕。
- **不在城池画里的东西**仍出分件：蜀军营地、器械、部队、野外点缀。S1-02 仍是这些分件的风格标准件。
- **S1-03、S1-04** 不进游戏，只作对照（预览页的 β 选项，`src/siege/render/betaCity.ts`）。
- **全图**：48×32 格在 100% 下是 3072×1536，超出单张出图尺寸。2026-11-02 备 S2 时定了做法（S2-01，`docs/siege/chencang/art/s2-01-full-map/`）：
  - **城池本体就用 S1-01 v2-a**，放在全图的 (768, 48)，不重画。它和灰盒对得准，蒙版已经能切；全图灰盒里城池那一块和 S1-01 的灰盒逐像素相同，只多了马道。
  - **第 1 步补画马道**：v2-a 上贴八块马道灰盒，让 ImageGen 编辑，只取马道外扩 12px、再渐变 10px 的一圈贴回 v2-a。这也是 S3 局部重画的试点。
  - **第 2–6 步分块扩画**：按西北、东北、南、西南、东南分五块，每块 1536×1024，输入是"已画好的部分 + 这块要画的灰盒"。每块只取新画的部分，在已画好的一侧留 48px 渐变。五块的顺序保证每块要画的地方都是新的、其余都已画好（工具里有检查）。只有冰河最北那 48px 的条子在 x 1536 处有一道硬接缝，落在程序淡出的地图边上。
  - **对齐**：编辑会把已画的部分也轻微重画，可能整体错开几个像素。拼图脚本 `tools/compose-siege-map.mjs` 拼之前先在 ±8px 内找出最吻合的错位，对齐后再拼，并报出偏移、差值和色偏，差得多就重出那一块。
  - **整画里只画地面**：营帐、木栅、辕门、工棚、树仍是分件（S2-08～S2-11）。地道口留到 v0.2，先画成雪地。
  - **地图边缘**：四边由程序淡出成纸色（留白），整画不画远山；B02 远景视差留到 S7。

### 9.3 切图与命名

- 分件锚点：占地区域西南角的地面点。`footprints.json` 记录每件的占地格、高度和像素框。
- 背景：品红抠图，或透明底；四周留 32px 以上空白。
- 命名：`<类别>-<名称>-<状态>@2x.webp`，例如 `gate-south-intact@2x.webp`、`wall-front-4-breach@2x.webp`。

### 9.4 遮挡

- 被墙或楼挡住的部队，程序画一圈墨色剪影，透过墙也看得见。
- 选中或悬停的部队附近，挡住它的墙段半透明。
- 镜头栏加一个"透视墙体"开关，打开后所有立体件半透明。

### 9.5 动画（J04）

- ImageGen 画不出前后一致的连续帧，所以小兵不做逐帧动画：每个兵种按三个朝向各出三个姿势（待机、行进、攻击），配合程序的位移、起伏和前冲补间。
- 武将的战场形象（P1）拆成部件做剪纸式绑定，由程序驱动。
- 器械的推行、撞击、坍塌，用"完好 / 受损 / 毁坏"几个状态图，加程序抖动和粒子。
- 朝向：蜀军攻城时多是背影（朝北），魏军多是正面（朝南）；东西两向共用一张侧面图，左右翻转。

## 10. S1 风格锁定：第一批资产

> 2026-11-01：灰盒工具已写好。**出图时以工具生成的 `docs/siege/chencang/art/<资产>/README.md` 为准**，那里有完整的提示词、上传清单和检查项。本节的提示词是初稿，和生成版有这些差别：
>
> - S1-03 的六件改了（见 §10.4）。
> - S1-05 人物高度从 280px 改成 240px，因为每格只有 341px 高，否则戟会顶出格子。
> - S1-04 改为不画落地影子（墙和建筑后放，影子由程序画），可读性段只管地面。
> - 天气从 "bright overcast" 改为 "a clear, cold winter day"，不然和西南低阳的影子冲突。
> - 重墙施工线改用深一点的 `#9a8f74`，原来的 `#c9c2ae` 在雪地上几乎看不见。
> - S1-02 加了一句：灰盒里的红色只标门洞，不要画成红色。

### 10.1 总览

| ID    | 资产                            | 尺寸      | 上传                         | 用途                                 |
| ----- | ------------------------------- | --------- | ---------------------------- | ------------------------------------ |
| S1-01 | 陈仓全城小景，A/B/C 三种风格    | 1536×1024 | 灰盒                         | 选风格；做 α 测试                    |
| S1-02 | 南门门楼标准件                  | 1024×1024 | 灰盒                         | **标准件**：之后每件都拿它当风格参考 |
| S1-03 | 城墙模块表（6 件）              | 1536×1024 | 灰盒                         | β 测试（定 α 后只作对照）            |
| S1-04 | 地表底板（取景同 S1-01）        | 1536×1024 | 灰盒                         | β 测试（定 α 后只作对照）            |
| S1-05 | 蜀戟兵姿态表（3 朝向 × 3 姿势） | 1536×1024 | 人物版式图、现有 ink-04 步兵 | 部队可读性                           |
| S1-06 | 魏弓兵姿态表（6 格）            | 1536×1024 | 人物版式图、现有 ink-04 弓兵 | 部队可读性                           |

**顺序**：S1-01（三种风格）→ 你选风格 → S1-02 → 你确认标准件 → S1-03、S1-04 → S1-05、S1-06 → 测试场景（§11）→ 定稿。每个提示词出 3–4 张，选一张。从 S1-03 起，每次都额外上传定稿的 S1-02 当风格参考，并在提示词开头加一句：`Match the brushwork, line weight, colours and lighting of the second attached image exactly.`

### 10.2 S1-01 陈仓全城小景

- **取景**：x 12–35、y 1–21（24×21 格），每格 64×48、每层 24px，正好是游戏 100% 的分辨率，不用放大。底部留 16px。
- **出三张**：提示词相同，只把风格段换成 STYLE_A、STYLE_B、STYLE_C。
- **看什么**：整体是否好看；城墙顶走道、城门、堑和桥是否一眼可辨；建筑有没有画出东西侧面（不该有）；有没有透视。

```text
{FIDELITY}

{PROJECTION}

Subject: the walled fortress of Chencang seen from the south, a battlefield map for a Three Kingdoms strategy game. Output 1536×1024, landscape, filled edge to edge. In the block-out, one grid cell is 64 pixels wide and 48 pixels deep, and one height level is 24 pixels.

Block-out legend (each colour means exactly this):
- pale grey-white (#e6e4dc): open ground under fresh snow
- brown (#967046): trampled mud-and-snow roads, including the ring road just inside the walls
- steel blue, one level below the ground (#7fa6b8): the defensive trench around the walls, half-frozen dark water between steep earth banks
- dark brown (#684220): plank bridges over the trench in front of each gate
- blue-grey top with darker front (#8c8c9c / #5e5e6e): the city wall, rammed earth faced with grey brick, three levels high, with a light walkway on top and a crenellated parapet along its outer edge
- red (#de2828): gate passages through the wall; paint them as dark open gateways with heavy closed timber doors, never red
- cream walls with slate roof blocks (#c8b8a0 / #50565e): timber gate towers and corner towers with snow-covered grey tile hip-and-gable roofs; the south gate tower has two storeys and is the tallest building, the others have one
- red-brown (#b05842): the commandant's residence, a main hall along the north side with a walled front courtyard
- tan (#a0704c): long single-storey barracks, armoury and granary with tiled roofs
- dashed light grey line on the ground (#c9c2ae): where an inner wall will later be built; paint only trampled ground with a few stacks of timber and baskets of earth

Setting: Chencang, a small but formidable Wei frontier fortress in the Wei River valley, winter of 228 AD. Compact and military rather than grand: brick-faced rammed-earth walls, a deep trench, trampled paths, snow on every roof and walkway. Bright overcast winter day.

{LIGHT}

{STYLE_A | STYLE_B | STYLE_C}

{SURFACES}

{EXCLUDE_SCENE}
```

### 10.3 S1-02 南门门楼（标准件）

- **取景**：x 21–26（6 格墙），城门洞 x 23–24，门楼 x 22–25；每格 128×96、每层 48px（100% 的 2 倍）。物件底边是地面线，不含地面和堑。
- **看什么**：比例、线条、歇山顶、积雪、立面明暗、门扇；这一件定了，就是之后所有件的样板。

```text
{FIDELITY}

{PROJECTION}

Subject: one building piece for a strategy game: the south gate of Chencang. A six-cell section of the city wall (rammed earth faced with grey brick, three levels high, a light walkway on top and a crenellated parapet along the front edge) with a two-cell gate passage in the middle. Heavy iron-studded timber gate doors stand closed inside the passage. On the wall above the passage stands a two-storey timber gate tower: red-lacquered columns, white plastered walls with lattice windows, a wooden gallery around the upper storey, and a snow-covered grey tile hip-and-gable roof with gently upturned eaves. Output 1024×1024. In the block-out, one grid cell is 128 pixels wide and 96 pixels deep, and one height level is 48 pixels.

{SPRITE}

{LIGHT_SPRITE}

{STYLE_A}

{EXCLUDE_SPRITE}
```

### 10.4 S1-03 城墙模块表

- **版式**：3×2 宫格，每格 512×512 放一件；每格 128×96、每层 48px。
- **六件**（2026-11-01 按灰盒实测调整：每件四周要留 32px，512 格放得下的才放）：
  1. 南墙直段，3 格长，正面朝南，女墙在外沿；
  2. 西南角楼（南墙和西墙相接，一层角楼）；
  3. 东南角楼；
  4. 西墙段，南北向 2 格长：只见墙顶和南端截面，女墙在西侧外沿；
  5. 东墙段，同上，女墙在东侧外沿；
  6. 北墙直段，3 格长，从城内看：女墙在北沿，看得到女墙内侧。
- 西门（一层门楼，南北 3 格）连同屋顶高约 550px，放不进 512 格，改到 S2 和东门一起单独出图。

```text
Match the brushwork, line weight, colours and lighting of the second attached image exactly.

{FIDELITY}

{PROJECTION}

Subject: a modular kit of city-wall pieces for a strategy game, six separate pieces arranged in a 3 by 2 grid exactly as in the block-out, one piece per cell, with clear empty space between pieces. All pieces share the same wall: rammed earth faced with grey brick, three levels high, a light walkway on top with a crenellated parapet along the outer edge, snow on every top surface.
Top row, left to right: a straight four-cell section of the south wall; the south-west corner with a small one-storey corner tower; the south-east corner with a small one-storey corner tower.
Bottom row, left to right: a three-cell section of the west wall running north-south, so only its top walkway and its southern end face are visible, parapet along the west edge; the same for the east wall, parapet along the east edge; the west gate, a passage running east-west through the west wall with closed timber doors and a small one-storey gate tower above.
In the block-out, one grid cell is 128 pixels wide and 96 pixels deep, and one height level is 48 pixels.

{SPRITE}

{LIGHT_SPRITE}

{STYLE_A}

{EXCLUDE_SPRITE}
```

### 10.5 S1-04 地表底板

- **取景**：同 S1-01。灰盒里墙和建筑都压平成地基色块（`#5a5650`）。
- **用途**：β 法的 L1 地表，上面再摆 S1-02、S1-03 的分件。

```text
{FIDELITY}

{PROJECTION}

Subject: the ground layer only of a battlefield map for a strategy game: the site of the walled fortress of Chencang in the snow, with every wall and building removed. Output 1536×1024, landscape, filled edge to edge. One grid cell is 64 pixels wide and 48 pixels deep.

Block-out legend:
- pale grey-white (#e6e4dc): open ground under fresh snow
- brown (#967046): trampled mud-and-snow roads and paths
- steel blue, one level below the ground (#7fa6b8): the defensive trench, half-frozen dark water between steep earth banks
- dark brown (#684220): plank bridges over the trench
- dark grey (#5a5650): flat stone and rammed-earth foundations where walls and buildings will later be placed as separate pieces; paint them as bare, level foundations with no walls, no buildings and no rubble
- dashed light grey line (#c9c2ae): trampled ground with a few stacks of timber and baskets of earth

Setting: Chencang, Wei River valley, winter of 228 AD. Bright overcast winter day.

{LIGHT}

{STYLE_A}

{SURFACES}

{EXCLUDE_SCENE}
```

### 10.6 S1-05 蜀戟兵姿态表

- **上传**：人物版式图（3×3 等分格，标出脚底基线和头顶线），以及现有的 `docs/v0.3/assets/generated/units-count-ink-04/infantry.png`。
- **看什么**：缩到约 36px 高时，三个朝向、三个姿势是否都看得懂；和现有 ink-04 步兵是不是同一套画风。

```text
Subject: a character pose sheet of one Shu-Han halberd infantryman for a strategy game, the same soldier drawn nine times. Arrange the sheet as a 3 by 3 grid of equal cells (512×341 pixels each) exactly as in the first attached guide: one full-body figure per cell, every figure the same size (about 280 pixels from the soles to the top of the helmet; the halberd may reach higher), feet on the marked baseline.
Rows, top to bottom: seen from behind, facing away (north); seen from the side, facing right (east); seen from the front, facing the viewer (south).
Columns, left to right: standing ready; marching mid-stride; attacking, thrusting the halberd forward.
Camera: the same orthographic three-quarter top-down camera as the battlefield, about 50 degrees from above, so the top of the helmet and the shoulders are visible and the figure is slightly foreshortened.
The soldier: a late Eastern Han infantryman in a bright jade-green (#5f9a5a) padded war coat with red (#a8432f) trim over dark iron lamellar armour, a fur-lined collar against the winter cold, a rounded iron helmet with a neck guard, wrapped leggings and boots, a ji (戟) halberd and a small round wooden shield. No facial features, like the reference figure. Identical armour, colours, weapon and proportions in every cell.
Style: match the second attached reference figure exactly in brushwork and colour handling: bold dark ink outline, flat ink-textured colour fills, no facial features. Match its style only, not its camera angle.
Light: low winter sun from the lower left (south-west); shade the figure only, with no cast shadow.

{SPRITE}

{EXCLUDE_SPRITE}
```

### 10.7 S1-06 魏弓兵姿态表

- **版式**：3×2 宫格，每格 512×512。
- **六格**：第一行正面（朝南）的待机、拉弓、放火箭（箭头燃烧）；第二行背面待机、侧面（朝东）待机、侧面拉弓。
- **上传**：人物版式图，以及现有的 `docs/v0.3/assets/generated/units-count-ink-04/archer.png`。

```text
Subject: a character pose sheet of one Wei archer for a strategy game, the same soldier drawn six times. Arrange the sheet as a 3 by 2 grid of equal cells (512×512 pixels each) exactly as in the first attached guide: one full-body figure per cell, every figure the same size (about 300 pixels from the soles to the top of the helmet), feet on the marked baseline.
Top row, all seen from the front facing the viewer (south): standing ready; drawing the bow; loosing a fire arrow with a burning arrowhead.
Bottom row: standing ready, seen from behind (north); standing ready, seen from the side facing right (east); drawing the bow, seen from the side facing right.
Camera: the same orthographic three-quarter top-down camera as the battlefield, about 50 degrees from above, so the top of the helmet and the shoulders are visible and the figure is slightly foreshortened.
The soldier: a Wei archer in a deep indigo (#2f4a6e) padded war coat over black lacquered lamellar armour, a fur-lined collar against the winter cold, a round iron helmet with a neck guard, a long recurve bow and a quiver at the hip. No facial features, like the reference figure. Identical armour, colours, bow and proportions in every cell.
Style: match the second attached reference figure exactly in brushwork and colour handling: bold dark ink outline, flat ink-textured colour fills, no facial features. Match its style only, not its camera angle.
Light: low winter sun from the lower left (south-west); shade the figure only, with no cast shadow.

{SPRITE}

{EXCLUDE_SPRITE}
```

## 11. S1 测试场景与验收

### 11.1 测试场景（我来做，开发模式预览页）

- 打开方式：`npm run dev` 后访问 `?siege-preview`，只用于开发（`src/siege/dev/SiegePreview.tsx`）。
- 2026-11-01 已做 α 部分：定稿的 S1-01（v2-a）按蒙版切层，多行的物件（南北向的墙、侧门楼）再按行切片，和部队一起按深度排序（`src/siege/render/scene.ts`）。
- 2026-11-01 接入 β 和真兵种：
  - S1-04 v2 地表上摆 S1-02 南门和 S1-03 城墙模块，在页面里先拼成一整张图，再用 α 的同一套蒙版切层（拼法见 `src/siege/render/betaCity.ts`）。
  - 直段每 3 格一件，两端各裁 4px 墨线收边，件与件刚好对接；整段的两头各外伸 2px，盖住门楼、角楼的收边，每件最多拉宽 4%。南北向墙段由北往南叠，后一件盖住前一件的南端截面。
  - 没有分件的 11 个物件（北门、东西门、北面两座角楼、城内建筑）可选从 α 原画抠来补上，或者留空只看分件。程序投影还没做。
  - 蜀戟兵换成 S1-05、魏弓兵换成 S1-06（按 `poses.json` 的脚底锚点，人高 36px），可以逐支切换朝向和动作；魏步兵还没有攻城图，暂用 ink-04。
  - 对比后 DS5 定 α（§9.2），β 选项留作对照。
- 内容：S1-01 的取景范围，可拖动、缩放（每格 32–96px），网格可开关。
- 两种画法切换：
  - **α**：S1-01 定稿图，按灰盒蒙版切出立体件；
  - **β**：S1-04 地表，加 S1-02、S1-03 分件，加程序投影。
- 摆 10 支部队：6 支蜀军在堑外和桥上（背影），2 支魏弓兵在南墙头（正面，被女墙挡住下半身），2 支魏步兵在环城道上（被南墙挡住，显示剪影）。
- 截图：100%、50%、150% 三档，各给你一张 α 和一张 β。

### 11.2 风格锁定验收

2026-11-02 你确认通过。S1-05 定 v5、S1-06 定 v4，S1-02 v4 是标准件。"分件之间看不出拼接"一项是在 β 对照里发现拼不好，才定了 α。

- [x] 100% 缩放下，城墙顶走道、城门、堑、桥一眼能分辨。
- [x] 所有立体件的顶面与灰盒误差不超过 1/4 格（横 16px、纵 12px）。
- [x] 没有透视，没有画出东西侧面，竖直棱线竖直。
- [x] 光照和影子方向在所有件之间一致；分件之间看不出拼接。
- [x] 小兵在约 36px 高时，三个朝向、蜀魏两军、步弓两种都分得清，转成灰度也分得清。
- [x] 墙头的弓兵和墙后的步兵（剪影）一眼看得懂。
- [x] 雪地上摆 10 支部队，画面不乱。
- [x] 你认可 S1-02 南门门楼作为标准件。

通过后（都已做）：

- 固定段定稿已在灰盒工具里（`STYLES`、`CHOSEN_*`）；
- `docs/siege/chencang/art/README.md` 已记下风格 A 和画法 α；
- S2 的出图材料已备好（§9.2、§13）。

## 12. 部队与武将的补充约定

- 部队标记沿用现有战场的界面元素：势力小旗、兵种章、武将头像角标、兵力条，都由程序画在人物上方。
- 现有立绘：诸葛亮、姜维、王平、曹真在 `public/assets/v03/portraits/`，魏延、张郃在 `public/assets/portraits/`；需要新画的立绘是郝昭、王双、靳详（F02）。
- 兵种外观按阵营各做一套（蜀、魏），不沿用野战图里不分势力的小队图。

## 13. 后续阶段

| 阶段                | 内容（编号见附录 A）                                               | 约数 | 依赖                          | 关口                             |
| ------------------- | ------------------------------------------------------------------ | ---- | ----------------------------- | -------------------------------- |
| **S1 风格锁定**     | A01–A05、J01–J04、S1-01～06                                        | 15   | 预览页（静态）                | §11.2                            |
| **S2 全图与完好态** | B01、B03 完好、B04 全套完好、B05–B07 完好、B09、B10、B11、A06      | 70   | 全图预览                      | 全图在预览页通过你的审阅         |
| **S3 状态变体**     | B03 填堑、B04 损伤与缺口、B05–B07 受损起火坍塌、B08 重墙、B13、B14 | 90   | 2.5D 渲染器原型、攻城规则草案 | 每种状态在预览页里切换无破绽     |
| **S4 器械与反制**   | C01–C07、D01–D05                                                   | 60   | 渲染器支持状态切换和补间      | 每种器械的推行、使用、毁坏能看懂 |
| **S5 部队与武将**   | E01–E07、E09、F01–F04                                              | 110  | 同上                          | 全部部队在场时可读               |
| **S6 特效与界面**   | G01–G09、H01–H08                                                   | 90   | 渲染器支持粒子                | 战斗日回放清楚、不卡顿           |
| **S7 叙事与主视觉** | I01–I04、A07、A08、B02 视差、B12、B15                              | 30   | 战役流程                      | 序章到结局完整走通               |

合计约 460 件（静态图、状态变体、动画部件都计入）。S2 起每阶段开工前，先把该阶段的逐件清单和提示词写进 `docs/siege/chencang/art/`。

MVP 的 S2 是五件（MVP 计划 §8.2），2026-11-02 已写好：

- S2-01 全图整画，分六步编辑（§9.2）；
- S2-08 中军帐和三种营帐；
- S2-09 木栅模块：东西段、南北段、两个转角、辕门；
- S2-10 器械工棚，空着和造器械中两态；
- S2-11 野外点缀：三种雪松、枯树、乱石、鹿角。

S2-08 到 S2-11 都是品红底的 2 倍分件表，上传 S1-02 当标准件，和 S2-01、和彼此都不相干。

**2026-11-02 S2 出完并通过**（你在审阅页 `attempts/s2-review.html` 确认）。出图改用 Codex 内置 image_gen（`codex exec`，gpt-6.1-sol，xhigh），每件的提示词、源文件和选择理由记在各自的 `generation-manifest.json`。过程中定了三件事：

- **分件的透明版不再让 ImageGen 抠图**，改由 `attempts/key.py` 确定性抠品红：不重画，不透明像素原样保留，边缘按背景色反混合去品红边。
- **扩画的场景描述写明像素位置**：S2-01 南块第一轮把十字路画到了营地边上，加了路和营地的坐标才对；西南、东南两块出图前就加上了。
- **S2-10 工棚灰盒加高**（檐 2 层、脊 3 层）：原来檐高 1.1 层，比小兵还矮，三张都自己把柱子画高了。定稿 v6 的底边仍比地面框低 32px，游戏按画出来的底边对齐。

S3 也按局部重画做：每一态是 S2-01 定稿全图上一块 1536×1024 的编辑。灰盒工具给每一态写出可改区域（paint）、拼接权重（blend），新几何（重墙）另写一张贴在输入图上的灰盒；`tools/compose-siege-states.mjs` 从全图裁出输入，选定后对齐（±8px）切成补丁 `patches/<态>.png`，记下它在全图上的位置。

S4（器械与反制，七件）按 S2-08～S2-11 的分件表做法出：灰盒工具里每种器械按占地和高度建灰盒（云梯车 1×2 格、梯架 2.5 层；搭墙的云梯跨两行城堑到 3 层墙顶；冲车 1×2；井阑 2×2、6 层；土车 1×1；石磨吊架立在墙顶走道上），燃烧态只画焦黑和余烬，火苗和烟由程序加，朝西由程序翻转朝东那件。抠图时发现 ImageGen 会把框里的品红画暗（梯级之间），`attempts/key.py` 因此把"红蓝都明显高于绿"的像素也当背景，半透明的边缘像素用中性墨色，不再按背景反混合；S2 的透明版也用新规则重抠了，不透明像素不变。

## 14. 风险与对策

| 风险                                        | 对策                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ImageGen 不守斜俯视投影（画透视、画出侧面） | 灰盒参考图 + PROJECTION 固定段；每件出 3–4 张挑选；局部重画；仍不行就退到 γ 立面贴图法           |
| 几百件之间风格漂移                          | 固定段统一；从 S1-03 起每次都上传 S1-02 标准件当参考；每阶段末把全部件摆进预览页对比             |
| 整图分辨率不够画建筑细节                    | 定 α 后城池仍是 100% 整画：S1-01 v2-a 在 100% 下已够细；放大到 150% 以上要看局部重画能否补细节   |
| 墙后部队看不见                              | 墨色剪影、附近墙段半透明、"透视墙体"开关                                                         |
| 蜀魏分不清                                  | 军服明度拉开（§6.3）；旗帜程序着色；S1 用灰度检查                                                |
| 动画不一致                                  | 不做逐帧；三朝向三姿势加补间；武将用部件绑定                                                     |
| 资源体积                                    | 全图 3072×1536 WebP 不超过 1.5 MB；分件打成图集；陈仓全部运行资源目标 25 MB 以内，进战斗时才加载 |
| 工作量大（约 460 件，每件 3–4 次生成）      | S1 关口先挡住方向性错误；城防、器械、部队套件留给后续城池复用                                    |
| 2.5D 与野战 2D 风格并存                     | 陈仓先定位为展示级大场面；做完再决定野战是否跟进                                                 |

## 15. 默认值

- 投影 64×48，一层 24px，西南光，攻方在下。
- 风格 A 界画淡彩，冬雪。
- 部队沿用 ink-04 的 1 人／3 人规则，按阵营各做一套。
- 背景用品红抠图；工具支持透明时改透明。
- 每件出 3–4 张；你确认后才做下一件。

## 16. 对其他计划的要求（接口）

美术能用起来，渲染和规则至少要满足这些条件：

- **渲染**：
  - §4.2 的投影公式；
  - 画家算法深度排序，部队参与排序；
  - L0–L6 分层；
  - 墙头部队上盖 L4 女墙前沿；
  - 墙后部队显示剪影，附近墙段半透明；
  - 程序按几何投影子；
  - 点选取最上面的顶面；
  - 每格 32–96px 缩放；
  - 进入战斗时才加载资源。
- **规则**：
  - 每格有高度；
  - 城墙格守方可站，攻方需云梯；
  - 城门有耐久和"已破"状态；
  - 堑可以填平；
  - 重墙可以在战斗中建成；
  - 地道走地下层；
  - 帅府前庭是目标格；
  - 部署是攻方在南、守方在城内和墙上。

这些要求都交给后续的攻城规则计划和 2.5D 渲染计划细化。

## 附录 A：美术总表

优先级：P0 = 可玩切片，P1 = 完整版，P2 = 极致版。"阶段"对应 §13。

### A 方向与规范

| 编号 | 资产                                                                        | 级  | 阶段 |
| ---- | --------------------------------------------------------------------------- | --- | ---- |
| A01  | 2.5D 投影规范（§4）                                                         | P0  | S1   |
| A02  | 高度层定义（§5.1）                                                          | P0  | S1   |
| A03  | 风格圣经与固定段（§6）                                                      | P0  | S1   |
| A04  | 比例尺表（§5.2）                                                            | P0  | S1   |
| A05  | 灰盒参考图（§8）                                                            | P0  | S1   |
| A06  | 色彩脚本：晨雪、正午、黄昏火攻、雪夜、黎明援军                              | P1  | S2   |
| A07  | 主视觉：雪夜陈仓，云梯着火，诸葛亮在城下四轮车上，郝昭立于城头              | P1  | S7   |
| A08  | 概念图 ×6：城池鸟瞰、门楼特写、蜀军大营、井阑对射、地道剖面、张郃铁骑出山口 | P1  | S7   |

### B 战场环境

| 编号 | 资产           | 状态/变体                                                                            | 级                | 阶段  |
| ---- | -------------- | ------------------------------------------------------------------------------------ | ----------------- | ----- |
| B01  | 全图地表       | 雪原、冻土、车辙、散关道、营地地面、城内夯土与石板                                   | P0                | S2    |
| B02  | 远景视差       | 北面冰河、北原、远山，三层                                                           | P1                | S7    |
| B03  | 城堑           | 完好 · 半填 · 填平 · 冰沿                                                            | P0                | S2/S3 |
| B04  | 城墙套件       | 南墙段、东西墙段、内外转角、垛口、马道坡、女墙前沿层；每件 完好 · 损伤 · 重损 · 缺口 | P0                | S2/S3 |
| B05  | 南门门楼       | 完好 · 受损 · 门破 · 起火 · 坍塌                                                     | P0                | S1/S3 |
| B06  | 东、西、北门楼 | 各 完好 · 受损 · 门破                                                                | P1                | S2/S3 |
| B07  | 角楼 ×4        | 完好 · 起火                                                                          | P1                | S2/S3 |
| B08  | 重墙           | 施工线 → 脚手架施工中 → 建成                                                         | P0                | S3    |
| B09  | 城内建筑       | 帅府正堂与前庭、营房 ×3、粮仓（可烧）、武库、马厩、水井、望楼                        | P0 帅府 / P1 其余 | S2    |
| B10  | 蜀军大营       | 中军帐、营帐 ×4、辕门木栅、粮车队、器械工棚 ×2（打造进度 3 档）                      | P1                | S2    |
| B11  | 野外点缀       | 雪松、枯柳、乱石、拒马、鹿角、篝火、废村                                             | P1                | S2    |
| B12  | 地下层         | 切到地下视图：蜀军地突与魏军横截的隧道网、地面塌陷坑                                 | P2                | S7    |
| B13  | 战痕贴花       | 焦土、碎石、插地箭、雪中脚印、墨点血迹、瓦砾                                         | P1                | S3    |
| B14  | 天气与光照     | 晴 · 阴 · 雪 · 风雪，日 · 黄昏 · 夜（夜里火光为主光源）                              | P1                | S3    |
| B15  | 前景层         | 飘雪、镜头边缘雪枝（不遮格子）                                                       | P2                | S7    |

### C 攻城器械（蜀）

| 编号 | 资产         | 状态/动作                                         | 级  | 阶段 |
| ---- | ------------ | ------------------------------------------------- | --- | ---- |
| C01  | 车载云梯     | 推行 · 搭上墙面 · 攀爬 · 被火箭点燃 · 燃烧 · 倒塌 | P0  | S4   |
| C02  | 冲车         | 推行 · 撞门 · 被石磨砸中 · 折断                   | P0  | S4   |
| C03  | 井阑（百尺） | 工棚里分三段搭建 · 推行 · 顶层齐射 · 着火 · 倾覆  | P1  | S4   |
| C04  | 土车         | 运土 · 倾倒填堑                                   | P1  | S4   |
| C05  | 地突         | 掘进土堆 · 地面破土涌出 · 被横截塌陷              | P2  | S4   |
| C06  | 木幔、盾车   | 掩护推进                                          | P2  | S4   |
| C07  | 器械残骸     | 烧毁的云梯、断冲车、倒塌井阑（留在场上成为障碍）  | P1  | S4   |

### D 守城与反制（魏）

| 编号 | 资产     | 内容                               | 级  | 阶段 |
| ---- | -------- | ---------------------------------- | --- | ---- |
| D01  | 火箭逆射 | 引弓、火矢弹道、命中点燃           | P0  | S4   |
| D02  | 绳连石磨 | 城头吊架、石磨坠下、砸毁冲车、收回 | P0  | S4   |
| D03  | 滚木礌石 | 从墙头推落                         | P1  | S4   |
| D04  | 筑重墙   | 搬土、立木、夯墙                   | P1  | S4   |
| D05  | 横截地道 | 地下挖掘与交锋                     | P2  | S4   |

### E 部队

| 编号 | 资产                 | 内容                                            | 级  | 阶段  |
| ---- | -------------------- | ----------------------------------------------- | --- | ----- |
| E01  | 蜀步兵               | 3 朝向 × 待机、行进、攻击；另加攀梯、推车、运土 | P0  | S1/S5 |
| E02  | 蜀弓弩兵             | 3 朝向 × 待机、行进、射击；另加井阑上射击       | P0  | S5    |
| E03  | 蜀骑兵               | 3 朝向 × 待机、奔驰、冲锋                       | P1  | S5    |
| E04  | 魏步兵               | 3 朝向 × 待机、格挡、攻击；另加推滚木           | P0  | S5    |
| E05  | 魏弓兵               | 正面待机、拉弓、放火箭；背面、侧面              | P0  | S1/S5 |
| E06  | 魏援军骑兵（张郃部） | 入场冲锋                                        | P1  | S5    |
| E07  | 旗帜                 | 认旗、丞相帅旗、"郝"字旗；字由程序绘制          | P0  | S5    |
| E08  | ~~墙头半身版~~       | 取消，由 B04 女墙前沿层代替                     | —   | —     |
| E09  | 溃散与阵亡           | 墨化消散，不画血腥                              | P1  | S5    |

### F 武将

| 编号 | 资产         | 内容                                                                     | 级                        | 阶段 |
| ---- | ------------ | ------------------------------------------------------------------------ | ------------------------- | ---- |
| F01  | 战场武将形象 | 诸葛亮（四轮车、羽扇纶巾）、魏延、姜维、王平、郝昭、王双、张郃；部件绑定 | P0 诸葛亮、郝昭 / P1 其余 | S5   |
| F02  | 新立绘       | 郝昭、王双、靳详                                                         | P0 郝昭                   | S5   |
| F03  | 表情差分     | 主要人物各 4–6 种                                                        | P1                        | S5   |
| F04  | 计策特写插图 | 诸葛亮发令、郝昭城头怒喝、魏延请战、姜维冲阵                             | P2                        | S5   |

### G 特效

| 编号 | 资产                                           | 级  | 阶段 |
| ---- | ---------------------------------------------- | --- | ---- |
| G01  | 火：小火、蔓延、大火、余烬、火矢尾迹           | P0  | S6   |
| G02  | 烟：烟柱、弥漫烟、黑烟                         | P0  | S6   |
| G03  | 雪：轻雪、重雪、风雪、落地雪粉、墙头积雪震落   | P1  | S6   |
| G04  | 冲击：撞门尘爆、木屑、碎石、墙体崩落、石磨砸击 | P0  | S6   |
| G05  | 箭雨弧线、插墙箭簇                             | P1  | S6   |
| G06  | 六种计策的 2.5D 版                             | P1  | S6   |
| G07  | 地道破土：地面龟裂、土块飞溅                   | P2  | S6   |
| G08  | 水墨笔触打击：步兵横扫、弓兵点刺、骑兵长拖     | P1  | S6   |
| G09  | 城破：城门倒下 + 全屏墨染转场                  | P1  | S6   |

### H 界面

| 编号 | 资产                                                   | 级         | 阶段 |
| ---- | ------------------------------------------------------ | ---------- | ---- |
| H01  | 城防面板：城门和各墙段耐久、重墙进度                   | P0         | S6   |
| H02  | 双倒计时：张郃援军距离、蜀军余粮天数                   | P0         | S6   |
| H03  | 攻具营造面板：工棚队列和进度                           | P1         | S6   |
| H04  | 图标约 40 个：器械、反制、高度、登城、填堑、地道       | P0（部分） | S6   |
| H05  | 高度与射线提示：墙头射程延伸、视线遮挡、可攀爬墙段高亮 | P0         | S6   |
| H06  | 阶段横幅：水墨卷轴展开                                 | P1         | S6   |
| H07  | 战役选择卡："陈仓之战 · 建兴六年冬"                    | P1         | S6   |
| H08  | 地下视图切换                                           | P2         | S6   |

### I 叙事

| 编号 | 资产                                                                                           | 级  | 阶段 |
| ---- | ---------------------------------------------------------------------------------------------- | --- | ---- |
| I01  | 开场连环画 6–8 格：街亭之后、出散关、兵临陈仓、靳详两度劝降、开战                              | P1  | S7   |
| I02  | 事件插画：火烧云梯、石磨碎冲车、百尺井阑、重墙一夜而起、地下横截、张郃将至、蜀军退兵、王双伏诛 | P1  | S7   |
| I03  | 结局插画：史实结局，加架空的"陈仓陷落""郝昭突围"                                               | P2  | S7   |
| I04  | 对话框、名牌、卷轴底纹                                                                         | P1  | S7   |

### J 技术美术

| 编号 | 内容                                                | 级  | 阶段 |
| ---- | --------------------------------------------------- | --- | ---- |
| J01  | 灰盒工具 `tools/build-siege-blockout.mjs`（§8.1）   | P0  | S1   |
| J02  | 深度排序与遮挡规则（§9.1、§9.4）                    | P0  | S1   |
| J03  | 切图与命名规范（§9.3）                              | P0  | S1   |
| J04  | 动画方案（§9.5）                                    | P0  | S1   |
| J05  | 资产清单、命名与校验脚本（同 `validate:portraits`） | P1  | S2   |
| J06  | 性能预算：精灵数、粒子数、低配降级                  | P1  | S3   |
