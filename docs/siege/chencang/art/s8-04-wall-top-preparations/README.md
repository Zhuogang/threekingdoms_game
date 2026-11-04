# S8-04 城头备物

`s8-04-wall-top-preparations` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [03-chencang-v0.2-plan.md](../../../03-chencang-v0.2-plan.md) §9。

- 几何：四件，都是放在墙顶走道上的小件（游戏抬高 3 层，同 S4-07）：火盆未燃（0.6 层，三足铁盆，盆里是柴）；火盆燃着（同样的盆，柴烧红、盆口发亮，**不画火苗和烟**，程序加）；柴薪捆（0.5 层，两捆扎好的柴和一捆浸油的布箭）；礌石堆（0.7 层，六七块石头和两根滚木堆在女墙内侧）。每件 1 格，四件各居一个四分之一宽。
- 前三轮共九张：第一轮 v1–v3、第二轮 v4–v6 沿用同一灰盒提示词；第三轮 v7–v9 只上传 S1-02 v4，定稿 v8。第三轮日志：`attempts/s8-04/codex-round3.log`。
- Generated without a blockout because its plain box overrode the round-bowl prompt.
- 旧 blockout.png、grid.png 和灰盒坐标只作历史对照，不上传；从实际 alpha islands 切件，footCentreAnchor 放在墙格走道中心（3 层），fitWidthPx 为 34、34、32、40，等比缩放。
- **2026-11-03 选定 `attempts/v8.webp`**（planner 已选）：Round bowls on splayed legs that read at game size; the lit one is mostly dark charcoal with embers, not a red sheet. Generated without a blockout, because the blockout's box overrode the prompt.透明版 `selected-transparent.png` 由 `attempts/key.py` 确定性抠出品红（不重画）；实际 alpha 框、相对灰盒的偏移和脚底中心见 `footprints.json`；每张的提示词、源文件哈希、选择理由和检查记在 `generation-manifest.json`，候选对比在 `comparison.png`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），日志在仓库根目录 `attempts/s8-04/codex-round3.log`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s1-02-south-gate/attempts/v4.webp`

### 第三轮：v7–v9（权威提示词）

```text
Output requirements: create an image exactly 1536 by 1024 pixels. Paint only the requested pieces; every empty background pixel must be perfectly uniform pure magenta RGB(255,0,255), hex #FF00FF. Apply paper grain and watercolour texture only inside their silhouettes, never on the magenta background. No paper sheet, paper margin, background texture, cast shadow, floor or haze.

Layout: the four pieces stand in a row with their bases on the line y=560, centred at x=192, 576, 960 and 1344, each about 110 pixels wide and at most 120 pixels tall, with clear empty magenta between them.

Match the brushwork, line weight, colours and lighting of the attached image exactly.

Style priority — A 界画淡彩: Paint the object as a TWO-DIMENSIONAL TRADITIONAL CHINESE JIEHUA PAINTING. Finely ruled, uniform slender ink contours define the architecture with quiet precise architectural draughtsmanship. Flat, pale, transparent ochre and grey watercolour washes with soft ink diffusion; snow left as clean paper-white. Keep brick and roof-tile marks sparse and deliberately drawn by hand, with generous calm untextured surfaces. The result must unmistakably read as fine Chinese ink-and-light-colour architectural painting, not a realistic digital render. No photographic material textures, physically based rendering, glossy surfaces, dense mottling or dark heavy outlines.

Camera: orthographic three-quarter top-down view, looking due north and tilted about 50 degrees down from the horizon. Strictly parallel projection: no perspective, no vanishing points, near and far objects the same size. Every vertical edge is perfectly vertical, every east-west edge perfectly horizontal, and north-south edges run straight up the image. Only top faces and south-facing front faces are visible; east and west side faces are never visible.

Subject: four small pieces of a Wei garrison's wall-top equipment (守城备物) for a strategy game, four separate pieces side by side, one centred in each quarter of the image, each standing on a single grid cell of a wall walkway (the walkway itself is NOT drawn). First: an unlit iron brazier (火盆): a ROUND, shallow, bowl-shaped cast-iron basin standing on three splayed legs, seen from the same high three-quarter camera so that its round rim reads as an ellipse, heaped with split firewood and kindling. It is round, never square or rectangular, with no flat tray or frame. Second: the same round brazier lit: a low heap of charcoal and split wood in the bowl, mostly dark charcoal with deep red and orange embers glowing between the pieces, and a warm glow on the iron rim, but NO flames and NO smoke (the game adds them). It stays mostly dark with embers, never a solid sheet of red. Third: fire-arrow supplies, two bundles of split firewood tied with rope and a bundle of arrows with oil-soaked cloth heads standing in a wooden tub. Fourth: a pile of boulders (礌石), six or seven rough grey stones the size of a man's head stacked with two rolling logs, ready to be pushed over the parapet. Each piece small enough to sit within one cell, with snow on the upper surfaces of the wood and stone.

Isolated object only, on a perfectly flat solid magenta (#FF00FF) background with no gradient, texture or ground. Nothing else in the frame. Clean edges against the background, and no magenta tint reflected onto the object.

Light: low winter sun from the lower left (south-west). Front faces catch a pale warm light and top faces carry fresh snow. Shade the object itself only; do not paint any cast shadow on the ground.

Style: traditional Chinese ink-wash painting with light colour (水墨淡彩), with the precision of jiehua (界画) ruled-line architectural painting: crisp, straight, evenly weighted ink lines on walls, gate towers, timber and roof tiles; soft transparent washes on snow, earth, ice and water; subtle rice-paper grain. Restrained winter palette: warm paper-white snow, ochre rammed earth, grey brick, dark timber, slate roof tiles, muted pine green, with small accents of red lacquer.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines or guide marks; ground, snowfield, cast shadows or anything besides the requested pieces; people, soldiers, horses, flags, banners or pennants; modern objects. No square trays, boxes or rectangular frames for the braziers.
```

### 第一、二轮：v1–v6（历史提示词）

两轮使用同一提示词，上传顺序：`blockout.png`、`docs/siege/chencang/art/s1-02-south-gate/attempts/v4.webp`；日志 `attempts/s8-04/codex.log` 只保留第一轮的原始文件名。

```text
Output requirements: create an image exactly 1536 by 1024 pixels. Treat the first attached block-out as the exact 1536×1024 registration canvas. Paint only the requested pieces; every empty background pixel must be perfectly uniform pure magenta RGB(255,0,255), hex #FF00FF. Apply paper grain and watercolour texture only inside their silhouettes, never on the magenta background. No paper sheet, paper margin, background texture, cast shadow, floor or haze.

Registration landmarks on this canvas (pixel boxes measured from the block-out):
Piece 1, the unlit brazier:
- whole piece: x=148..236, y=469..555
- ground footprint, where it stands: x=128..256, y=482..578
- baseCentre registration anchor: x=192, y=530; world (0.5, 16.5, 0)
Piece 2, the lit brazier, embers only:
- whole piece: x=532..620, y=469..555
- ground footprint, where it stands: x=512..640, y=482..578
- baseCentre registration anchor: x=576, y=530; world (0.5, 16.5, 0)
Piece 3, fire-arrow supplies:
- whole piece: x=906..1014, y=474..550
- ground footprint, where it stands: x=896..1024, y=474..570
- baseCentre registration anchor: x=960, y=522; world (0.5, 16.5, 0)
Piece 4, boulders and rolling logs:
- whole piece: x=1290..1398, y=459..566
- ground footprint, where it stands: x=1280..1408, y=473..569
- baseCentre registration anchor: x=1344, y=521; world (0.5, 16.5, 0)
Keep each piece inside its whole-piece box and stand it on its ground footprint; match heights to the block-out rather than making anything taller.

Match the brushwork, line weight, colours and lighting of the second attached image exactly.

Style priority — A 界画淡彩: Paint the object as a TWO-DIMENSIONAL TRADITIONAL CHINESE JIEHUA PAINTING. Finely ruled, uniform slender ink contours define the architecture with quiet precise architectural draughtsmanship. Flat, pale, transparent ochre and grey watercolour washes with soft ink diffusion; snow left as clean paper-white. Keep brick and roof-tile marks sparse and deliberately drawn by hand, with generous calm untextured surfaces. The result must unmistakably read as fine Chinese ink-and-light-colour architectural painting, not a realistic digital render. No photographic material textures, physically based rendering, glossy surfaces, dense mottling or dark heavy outlines.

The first attached image is a colour-coded 3D block-out, not a style reference. Strictly preserve the position, footprint, height and outline of every block: each block's top face and front face must stay within about a quarter of a grid cell of where it is drawn. Replace the flat colours with finished materials and keep straight architecture straight. Natural features (snow drifts, ice edges, trench banks, paths) may have soft organic edges, within half a cell of where they are marked.

Camera: orthographic three-quarter top-down view, looking due north and tilted about 50 degrees down from the horizon. Strictly parallel projection: no perspective, no vanishing points, near and far objects the same size. Every vertical edge is perfectly vertical, every east-west edge perfectly horizontal, and north-south edges run straight up the image. Only top faces and south-facing front faces are visible; east and west side faces are never visible.

Subject: four small pieces of a Wei garrison's wall-top equipment (守城备物) for a strategy game, four separate pieces side by side, one centred in each quarter of the image, each standing on a single grid cell of a wall walkway (the walkway itself is NOT drawn). First: an unlit iron brazier (火盆), a shallow three-legged iron bowl heaped with split firewood and kindling. Second: the same brazier lit, the wood glowing deep red and orange with bright embers and a warm glow on the iron rim, but NO flames and NO smoke (the game adds them). Third: fire-arrow supplies, two bundles of split firewood tied with rope and a bundle of arrows with oil-soaked cloth heads standing in a wooden tub. Fourth: a pile of boulders (礌石), six or seven rough grey stones the size of a man's head stacked with two rolling logs, ready to be pushed over the parapet. Each piece small enough to sit within one cell, with snow on the upper surfaces of the wood and stone.
In the block-out, one grid cell is 128 pixels wide and 96 pixels deep, and one height level is 48 pixels.

Isolated object only, on a perfectly flat solid magenta (#FF00FF) background with no gradient, texture or ground. Nothing else in the frame. Clean edges against the background, and no magenta tint reflected onto the object.

Light: low winter sun from the lower left (south-west). Front faces catch a pale warm light and top faces carry fresh snow. Shade the object itself only; do not paint any cast shadow on the ground.

Style: traditional Chinese ink-wash painting with light colour (水墨淡彩), with the precision of jiehua (界画) ruled-line architectural painting: crisp, straight, evenly weighted ink lines on walls, gate towers, timber and roof tiles; soft transparent washes on snow, earth, ice and water; subtle rice-paper grain. Restrained winter palette: warm paper-white snow, ochre rammed earth, grey brick, dark timber, slate roof tiles, muted pine green, with small accents of red lacquer.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines or guide marks; ground, snowfield, cast shadows or anything besides the requested pieces; people, soldiers, horses, flags, banners or pennants; modern objects.
```

## 看什么

- 和 S1-02 标准件是同一套笔法、颜色和光照。
- 按实际 alpha islands 从左到右切四件；所有腿、柴和滚木都随所属物件保留，背景无品红边。
- 都是能放在一格宽的走道上的小物件，缩到游戏尺寸还认得出是火盆、柴、石头；燃着的火盆只有红光，没有火苗。
- 100% 游戏尺寸：火盆各宽 34px，柴薪捆宽 32px，礌石堆宽 40px；用 footCentreAnchor 对齐墙格走道中心，等比缩放。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……
