# 战场美术素材包

这里是战场幕布的出图工作区。方案和背景见 [08-battlefield-canvas-plan.md](../08-battlefield-canvas-plan.md)。

## 目录

每张幕布一个文件夹，里面有：

- `README.md`：这张图的描述、48×32 格子布局、图例、部署区、格子比例，以及完整的提示词。
- `layout.png`：1536×1024 的色块参考图（每格 32px），出图时上传。
- `layout.txt`：纯文本格子布局，以后导入游戏数据用。
- `attempts/`：出好的图放这里，依次命名为 `v1.webp`、`v2.webp`……

除 `attempts/` 以外，这些文件都由 [tools/build-battlefield-art.mjs](../../../tools/build-battlefield-art.mjs) 生成，修改布局或提示词要改脚本，然后重新运行：

```bash
node tools/build-battlefield-art.mjs
```

脚本还会做校验：

- 营地在干地上，双方营地之间有路可通，每方部署区至少 10 格可用；
- 没有封死、谁也到不了的空地；
- 夯土墙、砖石墙（`W`）只有 1 格厚；
- 被墙围起来的地方至少有两个门（连在一起的门格算一个门）。

后两条的原因见计划文档第 5 节"墙和门的规矩"：规则里没有攻城，墙打不破，只有一个门时守方站在门上就能把墙内变成死角。

## 清单

| 战场 | 文件夹 | 轮次 | 状态 |
| --- | --- | --- | --- |
| ① 北方旷野 | [bf01-north-plain](bf01-north-plain/README.md) | 一 | **v4 已入库**（`public/assets/v03/battlefields/bf01-north-plain.webp`），画风样板；旧布局 v1 保留 |
| ② 中原沃野 | [bf02-central-farmland](bf02-central-farmland/README.md) | 一 | **v3 已入库**（`public/assets/v03/battlefields/bf02-central-farmland.webp`） |
| ③ 黄河津渡 | [bf03-yellow-river-ford](bf03-yellow-river-ford/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf03-yellow-river-ford.webp`） |
| ④北 水网泽国（淮泗） | [bf04-wetland-north](bf04-wetland-north/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf04-wetland-north.webp`） |
| ⑤A 大江·沿江 | [bf05-yangtze-bank](bf05-yangtze-bank/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf05-yangtze-bank.webp`） |
| ⑤B 大江·渡江 | [bf05-yangtze-crossing](bf05-yangtze-crossing/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf05-yangtze-crossing.webp`） |
| ⑥北 河谷川地（渭水） | [bf06-valley-north](bf06-valley-north/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf06-valley-north.webp`） |
| ⑥南 河谷川地（汉水） | [bf06-valley-south](bf06-valley-south/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf06-valley-south.webp`） |
| ⑦太行 北方山丘 | [bf07-taihang](bf07-taihang/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf07-taihang.webp`） |
| ⑧ 南方丘陵 | [bf08-south-hills](bf08-south-hills/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf08-south-hills.webp`） |
| ⑨峡谷 峡谷栈道 | [bf09-gorge](bf09-gorge/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf09-gorge.webp`） |
| ⑩ 雄关隘口 | [bf10-mountain-pass](bf10-mountain-pass/README.md) | 一 | **v1 已入库**（`public/assets/v03/battlefields/bf10-mountain-pass.webp`） |
| ④南 水网泽国（江南） | [bf04-wetland-south](bf04-wetland-south/README.md) | 二 | v1 已出图，待审核 |
| ⑦丘陵 北方山丘（沂蒙、方城） | [bf07-rolling-hills](bf07-rolling-hills/README.md) | 二 | v1 已出图，待审核 |
| ⑨三峡 峡谷栈道（三峡） | [bf09-three-gorges](bf09-three-gorges/README.md) | 二 | v1 已出图，待审核 |

同一布局的两种变体（④北/④南、⑥北/⑥南）共用格子，只换配色和提示词。

## 出图要点

1. 上传该文件夹的 `layout.png`，尺寸选 1536×1024，粘贴 README 里的整段提示词。
2. 同一个提示词出 3–4 张，挑对位最准、边缘最自然的一张。
3. 参考图的边缘已经做了圆角处理，提示词也要求画成自然形状。如果出图还是照抄方块边缘，告诉我，再加强这一点。
4. 有墙的图，提示词要求墙画成 1 格粗的细线、门画成明显的开口，不要把门涂成红色（之前 ①、② 的出图都把门画成了红块）；木栅要比夯土墙明显更轻、更细。
5. 出好的图放进 `attempts/`，然后在这张表里更新状态。

## 图例（所有战场通用）

每种颜色对应一种画面元素，每种画面元素只对应一种规则格子。

| 符号 | 画面 | 规则格子 | 颜色 |
| --- | --- | --- | --- |
| `.` | 田地、空地 | 平原 | #d6c496 |
| `+` | 道路、小径 | 平原 | #967046 |
| `=` | 桥、栈道、码头 | 平原 | #684220 |
| `_` | 沙洲、河滩、干河床 | 平原 | #ece2c4 |
| `V` | 村落、房舍 | 平原 | #b05842 |
| `G` | 城门、寨门 | 平原 | #de2828 |
| `T` | 树林 | 森林 | #386838 |
| `b` | 竹林 | 森林 | #188c6e |
| `r` | 芦苇荡 | 森林 | #a8b858 |
| `P` | 木栅、鹿角 | 森林 | #965ca0 |
| `^` | 丘陵、土岗、堤 | 丘陵 | #928860 |
| `~` | 水 | 水 | #4076b0 |
| `#` | 峭壁、岩壁 | 峭壁 | #4e3e34 |
| `W` | 城墙、关墙（夯土、砖石） | 峭壁 | #848496 |

每张图 README 里的提示词会按这张图的实际内容，说明每种颜色具体画什么，比如同样是 `~`，③ 里是浑黄的黄河，⑨ 里是峡谷急流。

## 已知差距

格子比例是初稿，有几张和计划里的目标比例差得较多，尤其是森林偏少。各图 README 里列出了"实际/目标"对照，看过出图效果后再一起调。
