# S4-01 云梯车

`s4-01-ladder-cart` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 三格各一件：朝北推行（1×2 格，梯架升向北端，高 2.5 层）、朝东推行（2×1 格）、烧毁残骸（1×2 格）。每格 128×96、每层 48px。
- 朝西推行由程序把朝东那件左右翻转（美术计划 §9.5）。
- **2026-11-02 选定 `attempts/v2.webp`**（待你确认）：对位最准，侧面梯架升向东、乘员棚在后。透明版 `selected-transparent.png` 由 `attempts/key.py` 确定性抠出品红（不重画）；每张的提示词、源文件和对位量测记在 `generation-manifest.json`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh）。

## 参考图

![blockout](blockout.png)

叠图检查用 `grid.png`（透明底）：黑线是地面格子，红线是立体件的面，橙线是墙顶等顶面上的格子。

## 上传与提示词

尺寸 1536×1024。上传：

1. `blockout.png`
2. `docs/siege/chencang/art/s1-02-south-gate/attempts/v4.webp`（第二张，标准件）

```text
Output requirements: create an image exactly 1536 by 1024 pixels. Treat the first attached block-out as the exact 1536×1024 registration canvas. Paint only the requested pieces; every empty background pixel must be perfectly uniform pure magenta RGB(255,0,255), hex #FF00FF. Apply paper grain and watercolour texture only inside their silhouettes, never on the magenta background. No paper sheet, paper margin, background texture, cast shadow, floor or haze.

Registration landmarks on this canvas (pixel boxes measured from the block-out):
Piece 1, the ladder cart, heading north:
- whole piece: x=205..307, y=370..654
- ground footprint, where it stands: x=192..320, y=476..668
Piece 2, the ladder cart, heading east:
- whole piece: x=646..890, y=423..601
- ground footprint, where it stands: x=640..896, y=524..620
Piece 3, the ladder cart, burnt out:
- whole piece: x=1229..1331, y=406..618
- ground footprint, where it stands: x=1216..1344, y=440..632
Keep each piece inside its whole-piece box and stand it on its ground footprint; match heights to the block-out rather than making anything taller.

Match the brushwork, line weight, colours and lighting of the second attached image exactly.

Style priority — A 界画淡彩: Paint the object as a TWO-DIMENSIONAL TRADITIONAL CHINESE JIEHUA PAINTING. Finely ruled, uniform slender ink contours define the architecture with quiet precise architectural draughtsmanship. Flat, pale, transparent ochre and grey watercolour washes with soft ink diffusion; snow left as clean paper-white. Keep brick and roof-tile marks sparse and deliberately drawn by hand, with generous calm untextured surfaces. The result must unmistakably read as fine Chinese ink-and-light-colour architectural painting, not a realistic digital render. No photographic material textures, physically based rendering, glossy surfaces, dense mottling or dark heavy outlines.

The first attached image is a colour-coded 3D block-out, not a style reference. Strictly preserve the position, footprint, height and outline of every block: each block's top face and front face must stay within about a quarter of a grid cell of where it is drawn. Replace the flat colours with finished materials and keep straight architecture straight. Natural features (snow drifts, ice edges, trench banks, paths) may have soft organic edges, within half a cell of where they are marked.

Camera: orthographic three-quarter top-down view, looking due north and tilted about 50 degrees down from the horizon. Strictly parallel projection: no perspective, no vanishing points, near and far objects the same size. Every vertical edge is perfectly vertical, every east-west edge perfectly horizontal, and north-south edges run straight up the image. Only top faces and south-facing front faces are visible; east and west side faces are never visible.

Subject: a Shu-Han siege ladder cart (云梯车) of the Three Kingdoms period for a strategy game, three separate pieces side by side, one centred in each third of the image. The cart is a heavy four-wheeled timber chassis carrying a folded scaling ladder on a triangular timber truss, with a small hide-covered shelter at the rear for the crew. Left: heading north, away from the viewer, the truss rising toward its far (north) end. Middle: the same cart heading east, seen from its side, the truss rising toward its right (east) end. Right: the same cart burnt out where it stood, charred black and smouldering, with glowing orange embers along the burnt timbers but no large flames and no smoke (the game adds flames and smoke on top), the ladder collapsed onto the chassis. Same cart, same size and timber in all three.
In the block-out, one grid cell is 128 pixels wide and 96 pixels deep, and one height level is 48 pixels.

Isolated object only, on a perfectly flat solid magenta (#FF00FF) background with no gradient, texture or ground. Nothing else in the frame. Clean edges against the background, and no magenta tint reflected onto the object.

Light: low winter sun from the lower left (south-west). Front faces catch a pale warm light and top faces carry fresh snow. Shade the object itself only; do not paint any cast shadow on the ground.

Style: traditional Chinese ink-wash painting with light colour (水墨淡彩), with the precision of jiehua (界画) ruled-line architectural painting: crisp, straight, evenly weighted ink lines on walls, gate towers, timber and roof tiles; soft transparent washes on snow, earth, ice and water; subtle rice-paper grain. Restrained winter palette: warm paper-white snow, ochre rammed earth, grey brick, dark timber, slate roof tiles, muted pine green, with small accents of red lacquer.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines or guide marks; ground, snowfield, cast shadows or anything besides the requested pieces; people, soldiers, horses, flags, banners or pennants; modern objects.
```

## 看什么

- 和 S1-02 标准件、S1-01 v2-a 是不是同一套笔法、颜色和光照。
- 每件都在自己的框里，底边落在灰盒的地面框上；背景纯品红，没有地面、雪地和落地影子。
- 三件是同一辆车：同样的轮、架和大小。
- 残骸看得出是烧坏的云梯车，没有大火苗和烟。
- 把图缩到一半（游戏 100% 的大小）看：放在 S1-01 的雪地上不突兀。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……
