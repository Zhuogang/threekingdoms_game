# S1-04 地表底板

`s1-04-ground-plate` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §10。

- 取景同 S1-01。灰盒里的城墙和建筑都压平成暗灰色地基（`#5a5650`），只留地面。
- β 法的 L1 地表层：上面再摆 S1-02、S1-03 的分件。画法定 α 后不进游戏，只在预览页作 β 对照。
- 2026-11-01 完成三版，采用 `attempts/v2.webp`；北桥及地基已按灰盒复核，完整提示词及检查见 `generation-manifest.json`。

## 参考图

![blockout](blockout.png)

叠图检查用 `grid.png`（透明底）：黑线是地面格子，红线是立体件的面，橙线是墙顶等顶面上的格子。

## 上传与提示词

尺寸 1536×1024。上传：

1. `blockout.png`
2. `docs/siege/chencang/art/s1-01-city-vignette/attempts/v2-a.webp`（第二张，风格参考）

```text
Match the brushwork, line weight, colours and lighting of the second attached image (the chosen city view) exactly.

Style priority — A 界画淡彩: The entire image is a TWO-DIMENSIONAL TRADITIONAL CHINESE JIEHUA PAINTING on warm rice paper. Finely ruled, uniform slender ink contours define the architecture with quiet precise architectural draughtsmanship. Flat, pale, transparent ochre and grey watercolour washes; broad untouched paper-white snow. Show soft ink diffusion and visible subtle paper fibres throughout the image. Keep brick and roof-tile marks sparse and deliberately drawn by hand, with generous calm untextured surfaces. The result must unmistakably read as fine Chinese ink-and-light-colour architectural painting, not a realistic digital environment. No photographic material textures, physically based rendering, glossy surfaces, dense mottling or dark heavy outlines. Preserve every block's location and silhouette from the reference, and keep open snow and roads free of added trees, rocks or extra buildings.

The first attached image is a colour-coded 3D block-out, not a style reference. Strictly preserve the position, footprint, height and outline of every block: each block's top face and front face must stay within about a quarter of a grid cell of where it is drawn. Replace the flat colours with finished materials and keep straight architecture straight. Natural features (snow drifts, ice edges, trench banks, paths) may have soft organic edges, within half a cell of where they are marked.

Camera: orthographic three-quarter top-down view, looking due north and tilted about 50 degrees down from the horizon. Strictly parallel projection: no perspective, no vanishing points, near and far objects the same size. Every vertical edge is perfectly vertical, every east-west edge perfectly horizontal, and north-south edges run straight up the image. Only top faces and south-facing front faces are visible; east and west side faces are never visible.

Subject: the ground layer only of a battlefield map for a strategy game: the site of the walled fortress of Chencang in the snow, with every wall and building removed. Output 1536×1024, landscape, filled edge to edge. One grid cell is 64 pixels wide and 48 pixels deep.

Block-out legend:
- pale grey-white (#e6e4dc): open ground under fresh snow
- brown (#967046): trampled mud-and-snow roads: the two streets that cross the city between its four gates, the approach roads, and the road along the river bank
- steel blue, one level below the ground (#7fa6b8), with ochre-brown earth banks (#8c7356): the defensive trench around the walls, half-frozen dark water between steep earth banks
- dark brown (#684220): plank bridges over the trench in front of the gates
- red-brown (#b05842): a paved courtyard
- short dashes on the ground (#9a8f74): where an inner wall will later be built; paint only trampled ground with a few stacks of timber and baskets of earth
- dark grey (#5a5650): flat stone and rammed-earth foundations where walls and buildings will later be placed as separate pieces; paint them as bare, level foundations with no walls, no buildings and no rubble

Setting: Chencang, Wei River valley, winter of 228 AD. A clear, cold winter day.

Light: low winter sun from the lower left (south-west); the trench banks facing the viewer catch a pale warm light. Paint no cast shadows anywhere: the walls and buildings are added later with their own shadows.

Style: traditional Chinese ink-wash painting with light colour (水墨淡彩), with the precision of jiehua (界画) ruled-line architectural painting: crisp, straight, evenly weighted ink lines on walls, gate towers, timber and roof tiles; soft transparent washes on snow, earth, ice and water; subtle rice-paper grain. Restrained winter palette: warm paper-white snow, ochre rammed earth, grey brick, dark timber, slate roof tiles, muted pine green, with small accents of red lacquer.

Game readability: open ground, roads, bridges and foundations are calm, flat and light, with low texture contrast, so soldiers and wall pieces placed on top stay readable. Keep detail density even across the image, with no vignette and no darkened corners.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines; borders, frames or paper margins; legend or compass; people, soldiers, horses, flags, banners or pennants; perspective views, horizon or sky; vignette; modern objects.
```

## 看什么

- 和选定的 S1-01 是不是同一套笔法和颜色。
- 地基是平的暗灰色地块，没有画出墙、房子或瓦砾。
- 堑的北岸土壁、桥、路和 S1-01 对得上。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……
