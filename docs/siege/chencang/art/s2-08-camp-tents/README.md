# S2-08 中军帐和营帐

`s2-08-camp-tents` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 2×2 宫格，每格 768×512 放一件；每格 128×96、每层 48px，同 S1-02。
- 左上是丞相中军帐（4×2 格，高 1.5 层）；其余三格是三种一格的营帐（高 1 层），游戏里随机排成行，所以大小、形状要一样，只是细节不同。
- 帐上的旗由程序画，这里不画。
- **2026-11-02 选定 `attempts/v2.webp`**（2026-11-02 你在审阅页确认）：对位最准，中军帐在框内 16px 以内（雪檐略高），营帐连拉绳在 22px 以内；营帐的拉绳和地钉每边伸出约 20px，排成行时地钉相碰。透明版 `selected-transparent.png` 由 `attempts/key.py`（仓库根目录出图工作区）确定性抠出品红：不重画，不透明像素原样保留，边缘按背景色反混合去品红边。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），每张的提示词、源文件和对位量测记在 `generation-manifest.json`。

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
Piece 1, the chancellor's command tent:
- whole piece: x=128..640, y=175..379
- ground footprint, where it stands: x=128..640, y=199..391
Piece 2, soldiers' tent, variant A:
- whole piece: x=1098..1206, y=195..316
- ground footprint, where it stands: x=1088..1216, y=230..326
Piece 3, soldiers' tent, variant B:
- whole piece: x=330..438, y=707..828
- ground footprint, where it stands: x=320..448, y=742..838
Piece 4, soldiers' tent, variant C:
- whole piece: x=1098..1206, y=707..828
- ground footprint, where it stands: x=1088..1216, y=742..838
Keep each piece inside its whole-piece box and stand it on its ground footprint; match heights to the block-out rather than making anything taller.

Match the brushwork, line weight, colours and lighting of the second attached image exactly.

Style priority — A 界画淡彩: Paint the object as a TWO-DIMENSIONAL TRADITIONAL CHINESE JIEHUA PAINTING. Finely ruled, uniform slender ink contours define the architecture with quiet precise architectural draughtsmanship. Flat, pale, transparent ochre and grey watercolour washes with soft ink diffusion; snow left as clean paper-white. Keep brick and roof-tile marks sparse and deliberately drawn by hand, with generous calm untextured surfaces. The result must unmistakably read as fine Chinese ink-and-light-colour architectural painting, not a realistic digital render. No photographic material textures, physically based rendering, glossy surfaces, dense mottling or dark heavy outlines.

The first attached image is a colour-coded 3D block-out, not a style reference. Strictly preserve the position, footprint, height and outline of every block: each block's top face and front face must stay within about a quarter of a grid cell of where it is drawn. Replace the flat colours with finished materials and keep straight architecture straight. Natural features (snow drifts, ice edges, trench banks, paths) may have soft organic edges, within half a cell of where they are marked.

Camera: orthographic three-quarter top-down view, looking due north and tilted about 50 degrees down from the horizon. Strictly parallel projection: no perspective, no vanishing points, near and far objects the same size. Every vertical edge is perfectly vertical, every east-west edge perfectly horizontal, and north-south edges run straight up the image. Only top faces and south-facing front faces are visible; east and west side faces are never visible.

Subject: tents for the Shu-Han army camp in a strategy game, four separate pieces arranged in a 2 by 2 grid exactly as in the block-out, one piece centred in each 768×512 cell, with clear empty space between pieces.
Top left: the chancellor's command tent (中军帐): a large rectangular ridge tent, four cells wide and two deep, of heavy dark red-lacquered canvas on a timber frame, the front curtain tied open, low wooden steps at the entrance, snow along the ridge. The grandest tent in the camp, but still a field tent rather than a building.
Top right, bottom left and bottom right: three variants of a one-cell soldiers' tent: a small ridge tent of undyed hemp canvas with snow on its slopes and guy ropes pegged close. Variant A is closed; variant B has its front flap tied back, showing a dark interior; variant C is older and patched, with a short stack of firewood against its side. All three the same size and shape, so they can stand in rows.
In the block-out, one grid cell is 128 pixels wide and 96 pixels deep, and one height level is 48 pixels.

Isolated object only, on a perfectly flat solid magenta (#FF00FF) background with no gradient, texture or ground. Nothing else in the frame. Clean edges against the background, and no magenta tint reflected onto the object.

Light: low winter sun from the lower left (south-west). Front faces catch a pale warm light and top faces carry fresh snow. Shade the object itself only; do not paint any cast shadow on the ground.

Style: traditional Chinese ink-wash painting with light colour (水墨淡彩), with the precision of jiehua (界画) ruled-line architectural painting: crisp, straight, evenly weighted ink lines on walls, gate towers, timber and roof tiles; soft transparent washes on snow, earth, ice and water; subtle rice-paper grain. Restrained winter palette: warm paper-white snow, ochre rammed earth, grey brick, dark timber, slate roof tiles, muted pine green, with small accents of red lacquer.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines or guide marks; ground, snowfield, cast shadows or anything besides the requested pieces; people, soldiers, horses, flags, banners or pennants; modern objects.
```

## 看什么

- 和 S1-02 标准件、S1-01 v2-a 是不是同一套笔法、颜色和光照。
- 每件都在自己的框里，底边落在灰盒的地面框上；背景纯品红，没有地面、雪地和落地影子。
- 中军帐比营帐明显气派，但仍是帐篷，不像房子。
- 三种营帐大小、轮廓一样，排成一行时不乱。
- 把图缩到一半（游戏 100% 的大小）看：放在 S1-01 的雪地上不突兀。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……
