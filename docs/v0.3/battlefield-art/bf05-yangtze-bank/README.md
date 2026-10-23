# ⑤A 大江·沿江

`bf05-yangtze-bank` · 第一轮 · 由 `node tools/build-battlefield-art.mjs` 生成，请改脚本而不是改这个文件。

- 长江中游岸路：大江横贯地图上方，江中有一座芦苇洲，部队在下方江岸带行军作战。
- 守方一侧是临江红色石壁和水寨，石壁中留一条下水的坡道。

## 参考图

![layout](layout.png)

## 格子布局（48×32）

x 0–47 从左到右，y 0–31 从上到下。攻方在左，守方在右。`a`/`d` 是攻方、守方营地。

```
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~_______~~~~~~~~~~~~~~~~PPPPPPP~
~~~~~~~~~~~~~~~__rrrrrrr__~~~~~~~~~~~~~~P~~~~~P~
~~~~~~~~~~~~~~~~~_______~~~~~~~~~~~~~~~~P~~~~~P~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~~P~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~~P~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~PPPGPPP~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#####+####
~~~~~~~~~~~~~~~~~~~~________~~~~~~~~~~#####+####
~~~~~~~~~~~~~~~~________________~~~~~~#####+####
____~~~~~~~~~_______........________~~#####+####
______rrrrr_____.........rrrrr..______#####+####
....rrrrrrrrr..........rrrrrrrrr....________....
......rrrrr..............rrrrr..................
..............................VV................
..............................VV................
................................................
......+++++++++++++++++++.................++++++
+++++a+++++++++.......+++++++++....+++++++d++...
............................++++++++++..........
................................................
................VV..............................
................VV..............................
................................................
.............................................^..
........^.........................^^^^^....^^^^^
.....^^^^^^^..........^..........^^^T^^^..^^^^^^
....^^^^^^^^^.....^^^^T^^^^.....^^TTTTT^^..^^^^^
.....^^^^^^^.....^^TTTTTTT^^.....^^^T^^^.....^..
........^.........^^^^T^^^^.......^^^^^.........
```

| 符号 | 画面 | 规则格子 | 参考图颜色 |
| --- | --- | --- | --- |
| `.` | 田地、空地 | 平原 | #d6c496 |
| `+` | 道路、小径 | 平原 | #967046 |
| `_` | 沙洲、河滩、干河床 | 平原 | #ece2c4 |
| `V` | 村落、房舍 | 平原 | #b05842 |
| `G` | 城门、寨门 | 平原 | #de2828 |
| `T` | 树林 | 森林 | #386838 |
| `r` | 芦苇荡 | 森林 | #a8b858 |
| `P` | 木栅、鹿角 | 森林 | #965ca0 |
| `^` | 丘陵、土岗、堤 | 丘陵 | #928860 |
| `~` | 水 | 水 | #4076b0 |
| `#` | 峭壁、岩壁 | 峭壁 | #4e3e34 |

- 攻方部署区：x 10–13，y 14–23，可用 40 格
- 守方部署区：x 34–37，y 14–23，可用 40 格

| 规则格子 | 实际 | 目标 |
| --- | --- | --- |
| 平原 | 54% | 35% |
| 森林 | 5% | 12% |
| 丘陵 | 6% | 8% |
| 水 | 32% | 38% |
| 峭壁 | 3% | 7% |

## 提示词

上传 `layout.png`，尺寸 1536×1024，粘贴：

```text
Strictly preserve the positions, shapes and sizes of every feature in the attached layout image. The attached image is a color-coded layout map, not a style reference: repaint it as a finished illustration while keeping every boundary in the same place.

The flat color blocks only mark where each feature goes. Paint natural, organic shapes: rivers and shores curve smoothly, groves have soft irregular outlines, hills are rounded, fields are irregular plots. Never copy the square stair-step edges of the blocks. Keep every feature within about half a block of where it is marked.

Walls and palisades are exactly one block thick: paint them as a single continuous line along the marked blocks, never as a wide band. Paint every red gate block as a clear open gateway in the wall, wide enough to read at a glance; the red only marks the opening, so never paint the gate itself red. A timber palisade is a light fence of sharpened stakes, visibly lighter and thinner than an earth or stone wall.

Subject: a top-down 2D battlefield map for a Three Kingdoms strategy game. Camera is straight overhead (orthographic, 90 degrees down). No perspective, no horizon, no sky, no tilted or isometric view. Output 1536×1024, landscape, the whole frame filled edge to edge.

Layout legend (each color in the layout image means exactly this):
- #d6c496 (beige): riverside fields and grass
- #967046 (brown): the riverside road and a slipway cut through the cliffs
- #ece2c4 (pale cream): pale mud flats and beaches along the shore, and a sandy river island
- #b05842 (red-brown): small riverside hamlets
- #de2828 (bright red): the water gate of the fort
- #386838 (dark green): broadleaf woods on the hills
- #a8b858 (yellow-green): tall reed beds on the shore and on the island
- #965ca0 (purple): the timber palisade of a water fort standing in the river
- #928860 (olive): rounded green hills on the landward side
- #4076b0 (blue): the vast grey-green Yangtze river with long current lines
- #4e3e34 (dark grey-brown): red sandstone river cliffs (赤壁)

Setting: The middle Yangtze near Red Cliffs, late Eastern Han dynasty, around 208 AD. Early winter mist over the water. Palette: grey-green water, pale sand, yellow reeds, rust-red cliffs, dark green hills.

Style: traditional Chinese ink-wash painting with light color (水墨淡彩). Soft brush texture, subtle rice-paper grain, gentle ink outlines on roads, banks, walls and cliff edges. Light from the upper left with very soft shadows.

Game readability: keep open ground calm, flat and low-contrast so game unit tokens placed on top stay readable. Keep detail density even across the whole map, with no vignette and no darkened corners.

Do not include: any text, letters, labels, seals or signatures; grid lines; borders, frames, scroll edges or paper margins; compass or legend; people, soldiers, horses, carts, boats with crews, flags, tents or banners; horizon, sky or distant mountains; modern objects.
```

## 出图记录

出的图放进 `attempts/`，文件名用 `v1.webp`、`v2.webp` 依次编号。
