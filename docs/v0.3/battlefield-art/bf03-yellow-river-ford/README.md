# ③ 黄河津渡

`bf03-yellow-river-ford` · 第一轮 · 由 `node tools/build-battlefield-art.mjs` 生成，请改脚本而不是改这个文件。

- 白马津、孟津一类的黄河渡口：浑黄大河竖贯中间，河心三块沙洲，两岸大堤只在两处渡口断开。
- 沙洲两侧各 3 格水，渡口有码头伸入水中；守方岸后是台地。

## 参考图

![layout](layout.png)

## 格子布局（48×32）

x 0–47 从左到右，y 0–31 从上到下。攻方在左，守方在右。`a`/`d` 是攻方、守方营地。

```
..................^^~~~~~~~~^^..................
..................^^~~~~~~~~^^..................
...............TTT^^~~~~~~~~^^.T................
...............TTT^^~~~__~~~^^TTT........^......
...............TTT^^~~~__~~r^^.T......^^^^^^^...
..................^^~~~__~~r^^........^^^^^^^...
..................^^~~~__~~r^^.VV.....^^^^^^^...
....................~~~__~~r...VV........^......
.................+++~~=__=~~++..................
................++..~~~__~~~.++.................
...............++.^^~~~~~~~~^^++................
...............+..^^~~~~~~~~^^.++...............
..............++..^^~~~__~~~^^..+++.............
..............+...^^r~~__~~~^^....+++...........
.............++...^^r~~__~~~^^......++++........
............++....^^r~~__~~~^^.........+++......
.....a+++++++.....^^r~~__~~~^^...........+d.....
............++....^^r~~__~~~^^.........+++......
.............++...^^r~~__~~~^^......++++........
..............+...^^~~~__~~~^^....+++...........
..............++..^^~~~~~~~~^^..+++.............
...............+..^^~~~~~~~~^^.++...............
...............++.^^~~~__~~~^^++................
................++..~~~__~~~.++.................
.................+++~~=__=~~++..................
.....TTT......VV....~~~__~~~.............^......
....TTTTT.....VV..^^~~~__~~~^^........^^^^^^^...
.....TTT..........^^~~~__~~~^^........^^^^^^^...
...............TTT^^~~~__~~~^^........^^^^^^^...
...............TTT^^~~~~~~~~^^...........^......
...............TTT^^~~~~~~~~^^..................
..................^^~~~~~~~~^^..................
```

| 符号 | 画面 | 规则格子 | 参考图颜色 |
| --- | --- | --- | --- |
| `.` | 田地、空地 | 平原 | #d6c496 |
| `+` | 道路、小径 | 平原 | #967046 |
| `=` | 桥、栈道、码头 | 平原 | #684220 |
| `_` | 沙洲、河滩、干河床 | 平原 | #ece2c4 |
| `V` | 村落、房舍 | 平原 | #b05842 |
| `T` | 树林 | 森林 | #386838 |
| `r` | 芦苇荡 | 森林 | #a8b858 |
| `^` | 丘陵、土岗、堤 | 丘陵 | #928860 |
| `~` | 水 | 水 | #4076b0 |

- 攻方部署区：x 10–13，y 11–20，可用 40 格
- 守方部署区：x 34–37，y 11–20，可用 40 格

| 规则格子 | 实际 | 目标 |
| --- | --- | --- |
| 平原 | 74% | 55% |
| 森林 | 3% | 8% |
| 丘陵 | 10% | 12% |
| 水 | 13% | 25% |
| 峭壁 | 0% | 0% |

## 提示词

上传 `layout.png`，尺寸 1536×1024，粘贴：

```text
Strictly preserve the positions, shapes and sizes of every feature in the attached layout image. The attached image is a color-coded layout map, not a style reference: repaint it as a finished illustration while keeping every boundary in the same place.

The flat color blocks only mark where each feature goes. Paint natural, organic shapes: rivers and shores curve smoothly, groves have soft irregular outlines, hills are rounded, fields are irregular plots. Never copy the square stair-step edges of the blocks. Keep every feature within about half a block of where it is marked.

Subject: a top-down 2D battlefield map for a Three Kingdoms strategy game. Camera is straight overhead (orthographic, 90 degrees down). No perspective, no horizon, no sky, no tilted or isometric view. Output 1536×1024, landscape, the whole frame filled edge to edge.

Layout legend (each color in the layout image means exactly this):
- #d6c496 (beige): flat loess farmland
- #967046 (brown): dirt roads leading to the two ferries
- #684220 (dark brown): short wooden ferry jetties
- #ece2c4 (pale cream): pale sand bars in the middle of the river
- #b05842 (red-brown): small ferry hamlets
- #386838 (dark green): bank-side willows
- #a8b858 (yellow-green): thin reed fringes on the river edge
- #928860 (olive): high earthen levees along both banks, and loess terraces on the right side
- #4076b0 (blue): the wide, muddy, ochre-brown Yellow River with silt swirls

Setting: The Yellow River at Baima ford, late Eastern Han dynasty, around 200 AD. Early spring, dry wind, silt-laden water. Palette: ochre, khaki, muddy brown-yellow water, grey-brown earth.

Style: traditional Chinese ink-wash painting with light color (水墨淡彩). Soft brush texture, subtle rice-paper grain, gentle ink outlines on roads, banks, walls and cliff edges. Light from the upper left with very soft shadows.

Game readability: keep open ground calm, flat and low-contrast so game unit tokens placed on top stay readable. Keep detail density even across the whole map, with no vignette and no darkened corners.

Do not include: any text, letters, labels, seals or signatures; grid lines; borders, frames, scroll edges or paper margins; compass or legend; people, soldiers, horses, carts, boats with crews, flags, tents or banners; horizon, sky or distant mountains; modern objects.
```

## 出图记录

出的图放进 `attempts/`，文件名用 `v1.webp`、`v2.webp` 依次编号。
