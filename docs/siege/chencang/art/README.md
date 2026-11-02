# 陈仓攻城战：美术资产

由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../01-chencang-art-plan.md)。

## 全图灰盒

48×32 全图按计划 §4 的斜俯视投影渲染，缩到 50%（每格 32×24，一层 12px）。只用来检查布局和高度，不上传 ImageGen。

![全图灰盒](blockout-full.png)

## S1 风格锁定（2026-11-02 通过）

| ID    | 资产                                              | 尺寸      | 出图                   |
| ----- | ------------------------------------------------- | --------- | ---------------------- |
| S1-01 | [陈仓全城小景](s1-01-city-vignette/README.md)     | 1536×1024 | 6 张，定稿 `v2-a.webp` |
| S1-02 | [南门门楼（标准件）](s1-02-south-gate/README.md)  | 1024×1024 | 4 张，定稿 `v4.webp`   |
| S1-03 | [城墙模块表](s1-03-wall-kit/README.md)            | 1536×1024 | 4 张，定稿 `v4.webp`   |
| S1-04 | [地表底板](s1-04-ground-plate/README.md)          | 1536×1024 | 3 张，定稿 `v2.webp`   |
| S1-05 | [蜀戟兵姿态表](s1-05-shu-halberd-sheet/README.md) | 1536×1024 | 5 张，定稿 `v5.webp`   |
| S1-06 | [魏弓兵姿态表](s1-06-wei-archer-sheet/README.md)  | 1536×1024 | 4 张，定稿 `v4.webp`   |

顺序：S1-01（三种风格）→ 你选风格 → S1-02 → 你确认标准件 → S1-03、S1-04 → S1-05、S1-06 → 预览页测试场景（计划 §11）。每个提示词出 3–4 张，选一张。

**画法：α 整画切层**（2026-11-01 在预览页对比后定，计划 §9.2）。城池是一整张画，按 `masks/` 切层，会变的部分在整画上局部重画；营地、器械、部队等不在城池画里的东西才出分件。S1-03、S1-04 只在预览页作 β 对照。

## S2 全图与完好态（2026-11-02 通过）

| ID    | 资产                                       | 尺寸      | 出图                 |
| ----- | ------------------------------------------ | --------- | -------------------- |
| S2-01 | [全图整画](s2-01-full-map/README.md)       | 3072×1536 | 21 张                |
| S2-08 | [中军帐和营帐](s2-08-camp-tents/README.md) | 1536×1024 | 3 张，定稿 `v2.webp` |
| S2-09 | [木栅模块](s2-09-palisade-kit/README.md)   | 1536×1024 | 3 张，定稿 `v2.webp` |
| S2-10 | [器械工棚](s2-10-workshop/README.md)       | 1536×1024 | 6 张，定稿 `v6.webp` |
| S2-11 | [野外点缀](s2-11-field-scenery/README.md)  | 1536×1024 | 3 张，定稿 `v3.webp` |

顺序：S2-01 分六步，一步一步来：先在 S1-01 v2-a 上补画马道，再按西北、东北、南、西南、东南五块向外扩画；每步选定后跑 `node tools/compose-siege-map.mjs` 拿到下一步的输入（见 S2-01 的说明）。S2-08 到 S2-11 是分件表，和 S2-01、和彼此都不相干，随时可以出。

S1-02 以后的提示词按脚本里的 `CHOSEN_STYLE`（风格字母）和 `CHOSEN_VIGNETTE`（作风格参考上传的那张 S1-01）生成，现在是 A 和 `v2-a.webp`；S1-03 起上传的标准件是 `CHOSEN_GATE`，现在是 S1-02 的 `v4.webp`。改选别的，就改这几项再重新生成。分件的提示词开头有一段由灰盒算出的像素坐标（对位坐标段），帮 ImageGen 把屋顶、门、女墙放准。

## S3 状态变体

| ID       | 资产                                               | 尺寸      | 出图                                                              |
| -------- | -------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| S3-01    | [城堑填堑](s3-01-trench-fill/README.md)            | 1536×1024 | 6 张，定稿 `trench-half-v1.webp`、`trench-filled-v3.webp`         |
| S3-02    | [南门受损](s3-02-gate-south-damaged/README.md)     | 1536×1024 | 3 张，定稿 `gate-south-damaged-v2.webp`                           |
| S3-03    | [南门门破](s3-03-gate-south-broken/README.md)      | 1536×1024 | 3 张，定稿 `gate-south-broken-v2.webp`                            |
| S3-04    | [北门门破](s3-04-gate-north-broken/README.md)      | 1536×1024 | 3 张，定稿 `gate-north-broken-v2.webp`                            |
| S3-05    | [西门门破](s3-05-gate-west-broken/README.md)       | 1536×1024 | 3 张，定稿 `gate-west-broken-v2.webp`                             |
| S3-06    | [东门门破](s3-06-gate-east-broken/README.md)       | 1536×1024 | 3 张，定稿 `gate-east-broken-v2.webp`                             |
| S3-07/08 | [重墙（施工中、建成）](s3-07-inner-wall/README.md) | 1536×1024 | 6 张，定稿 `inner-wall-works-v1.webp`、`inner-wall-built-v1.webp` |

做法（计划 §9.2）：每一态是 S2-01 定稿全图上一块 1536×1024 的局部重画。跑 `node tools/compose-siege-states.mjs` 从全图裁出每一态的输入 `inputs/<态>.png`（新几何如重墙，先贴上灰盒）；选定后把文件名填进脚本的 `STATE_PICKS`，重跑两个脚本，就切出和全图对齐的补丁 `patches/<态>.png`（位置在 `patches/<态>.json`），以及贴回全图的对比 `previews/<态>.webp`。各件互不相干，可以同时出。

## S4 器械与反制

| ID    | 资产                                                 | 尺寸      | 出图                 |
| ----- | ---------------------------------------------------- | --------- | -------------------- |
| S4-01 | [云梯车](s4-01-ladder-cart/README.md)                | 1536×1024 | 3 张，定稿 `v2.webp` |
| S4-02 | [云梯架上墙面](s4-02-ladder-on-wall/README.md)       | 1536×1024 | 3 张，定稿 `v3.webp` |
| S4-03 | [冲车](s4-03-ram/README.md)                          | 1536×1024 | 3 张，定稿 `v1.webp` |
| S4-04 | [井阑](s4-04-siege-tower/README.md)                  | 1536×1024 | 3 张，定稿 `v1.webp` |
| S4-05 | [井阑燃烧、倾覆](s4-05-siege-tower-wrecks/README.md) | 1536×1024 | 3 张，定稿 `v3.webp` |
| S4-06 | [土车](s4-06-earth-cart/README.md)                   | 1536×1024 | 3 张，定稿 `v3.webp` |
| S4-07 | [城头石磨吊架](s4-07-millstone-crane/README.md)      | 1536×1024 | 2 张，定稿 `v3.webp` |

和 S2-08 到 S2-11 一样是品红底的 2 倍分件表，上传 S1-02 当标准件，各件互不相干。燃烧态只画焦黑和余烬，火苗和烟由程序加（MVP 计划 §8.3）；朝西推行由程序把朝东那件左右翻转。

## 每个文件夹里有什么

- `blockout.png`（姿态表是 `guide.png`）：上传 ImageGen 的参考图。
- `grid.png`：透明底的格子和轮廓，叠在出图上检查对位。
- `masks/`：每个立体件在画面上的轮廓蒙版，α 法切层用；女墙前沿单独一张（`*-parapet.png`，L4 层）。只有 S1-01 和 S2-01 有。
- `footprints.json`：每个物件的占地格、高度、锚点（占地西南角的地面点）和像素框。
- `README.md`：说明、上传清单、完整提示词和检查项。
- `attempts/`：出的图。
