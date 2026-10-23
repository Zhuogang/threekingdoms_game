# ④南 水网泽国（江南）

`bf04-wetland-south` · 第二轮 · 由 `node tools/build-battlefield-art.mjs` 生成，请改脚本而不是改这个文件。

- 太湖平原：与 ④北 同一布局，换成稻田、竹林和江南水乡。

## 参考图

![layout](layout.png)

## 格子布局（48×32）

x 0–47 从左到右，y 0–31 从上到下。攻方在左，守方在右。`a`/`d` 是攻方、守方营地。

```
............~...............~...................
............~~..............~...................
...bbb......~~..............~....VV....~~~......
..bbbbb..T...~..............~~.r.VV...~~~~~.....
...bbb..TTT..~~.............~~rrr......~~~......
~........T...~~.......~.....~~.r............rrr.
~~~~~.........~.....~~~~~~~.~~.............rrrr~
~~~~~~~~~~....~~.~~~~~~~~~~~~~~..........~~~~~~~
.....~~~~~~~~~~~~~~~......~~~~~~~~~~~~~~~~~~~~~~
..........~~~~~~~............~~~~~~~~~~~~.......
..^^^^^^^.....~~~...rrrrr....~....~.............
..^.....^......~~..rr~~~rr...~........~~~~~~~~~.
..^.....^.......~..r~~~~~r..~~........~^^^^^^^~.
..^.....^.......~..rr~~~rr..~.........~^.....^~.
..^^^^^^^......~~...rrrrr...~.........~^.....^~.
...............~~...........~.........~^.....^~.
+++++a+++++++++=+++++++++++==+++++++++=+++d..^~.
.....rrr.......~rrr........~..........~^.....^~.
....r~~~r......~rrrr.......~..........~^.....^~.
...rr~~~rr....~~rrr........~..........~^.....^~.
....r~~~r.....~~.......rrr.~~.........~^^^.^^^~.
.....rrr......~.......rrrrr~~.......T.~~~~=~~~~.
.........r....~........rrr..~......TTT....+.....
.......rrrrr..~~....~.......~.......T.....+.....
.........r~~~~~~~~~~~~~~....~~.................~
~~~~~~~~~~~~~~~~~~~~~~~~~~~.~~.........~~~~~~~~~
~~~~~~~~~~~.....~.......~~~~~~~~~~~~~~~~~~~~~~~~
~...............~..........~~~~~~~~~~~~.....VV..
.........VV.....~~.^^^^^^^^..~~bbbbbb.......VV..
..rrr....VV......~.^......^..~~bbbbb.......^^^..
.rrrrr...........~~^......^...~..b........^^^^^.
..rrr.............~^^^^^^^^...~............^^^..
```

| 符号 | 画面 | 规则格子 | 参考图颜色 |
| --- | --- | --- | --- |
| `.` | 田地、空地 | 平原 | #d6c496 |
| `+` | 道路、小径 | 平原 | #967046 |
| `=` | 桥、栈道、码头 | 平原 | #684220 |
| `V` | 村落、房舍 | 平原 | #b05842 |
| `T` | 树林 | 森林 | #386838 |
| `b` | 竹林 | 森林 | #188c6e |
| `r` | 芦苇荡 | 森林 | #a8b858 |
| `^` | 丘陵、土岗、堤 | 丘陵 | #928860 |
| `~` | 水 | 水 | #4076b0 |

- 攻方部署区：x 10–13，y 11–20，可用 40 格
- 守方部署区：x 34–37，y 11–20，可用 40 格

| 规则格子 | 实际 | 目标 |
| --- | --- | --- |
| 平原 | 65% | 45% |
| 森林 | 8% | 15% |
| 丘陵 | 5% | 10% |
| 水 | 23% | 30% |
| 峭壁 | 0% | 0% |

## 提示词

上传 `layout.png`，尺寸 1536×1024，粘贴：

```text
Strictly preserve the positions, shapes and sizes of every feature in the attached layout image. The attached image is a color-coded layout map, not a style reference: repaint it as a finished illustration while keeping every boundary in the same place.

The flat color blocks only mark where each feature goes. Paint natural, organic shapes: rivers and shores curve smoothly, groves have soft irregular outlines, hills are rounded, fields are irregular plots. Never copy the square stair-step edges of the blocks. Keep every feature within about half a block of where it is marked.

Subject: a top-down 2D battlefield map for a Three Kingdoms strategy game. Camera is straight overhead (orthographic, 90 degrees down). No perspective, no horizon, no sky, no tilted or isometric view. Output 1536×1024, landscape, the whole frame filled edge to edge.

Layout legend (each color in the layout image means exactly this):
- #d6c496 (beige): flooded green rice paddies divided by narrow bunds
- #967046 (brown): a stone-paved causeway
- #684220 (dark brown): arched stone bridges
- #b05842 (red-brown): whitewashed canal-side houses with dark tile roofs
- #386838 (dark green): a few camphor trees
- #188c6e (teal green): bamboo groves
- #a8b858 (yellow-green): reed beds around the ponds
- #928860 (olive): polder dikes and a raised mound ringed by water on the right
- #4076b0 (blue): a web of winding canals, two broad channels and lotus ponds

Setting: The Taihu lake plain near Wu, late Eastern Han dynasty. Humid early summer. Palette: jade green paddies, teal water, dark green bamboo, white walls and dark grey roofs.

Style: traditional Chinese ink-wash painting with light color (水墨淡彩). Soft brush texture, subtle rice-paper grain, gentle ink outlines on roads, banks, walls and cliff edges. Light from the upper left with very soft shadows.

Game readability: keep open ground calm, flat and low-contrast so game unit tokens placed on top stay readable. Keep detail density even across the whole map, with no vignette and no darkened corners.

Do not include: any text, letters, labels, seals or signatures; grid lines; borders, frames, scroll edges or paper margins; compass or legend; people, soldiers, horses, carts, boats with crews, flags, tents or banners; horizon, sky or distant mountains; modern objects.
```

## 出图记录

出的图放进 `attempts/`，文件名用 `v1.webp`、`v2.webp` 依次编号。
