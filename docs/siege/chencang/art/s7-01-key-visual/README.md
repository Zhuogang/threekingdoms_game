# S7-01 主视觉：雪中陈仓

`s7-01-key-visual` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 主视觉，也是开始画面"特别战役 · 陈仓之战"卡的底图（美术 A07、H07）。左上留出一块安静的地方给程序写标题。
- 雪夜：一架云梯靠在南墙上烧着，火光映在雪上；郝昭立在门楼前的城头；诸葛亮坐四轮车在城下近景（背影或侧背影）。
- **2026-11-02 选定 `attempts/v2.webp`**：左上是安静的夜空，能放标题；燃烧的云梯、城头的郝昭、近景的诸葛亮都清楚。四角和旗面在原尺寸下查过，没有印章、落款和文字。运行时用的 1536×1024 和 768×512 在 `runtime/`；每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s7-01-key-visual/style-reference.png`（第一张：S2-01 定稿全图南半城，风格和建筑参考）
2. `public/assets/v03/portraits/zhugeliang.webp`（诸葛亮立绘，只作人物参考）
3. `docs/siege/chencang/art/s5-07-portrait-hao-zhao/attempts/v1.webp`（郝昭立绘，只作人物参考）

```text
Output: a landscape painting exactly 1536 by 1024 pixels. The key visual of a strategy game campaign: the south gate of Chencang on a snowy night. The wall and its two-storey gate tower rise across the right two thirds of the picture, seen from the south and a little below; a scaling ladder leans against the wall to the left of the gate and is burning, its fire throwing warm orange light over the snow and the brick and sending smoke up into the falling snow. On the wall top beside the gate tower stands Hao Zhao, the Wei commander, in a dark red cloak and an iron helmet with a short red plume, looking down, with a few Wei archers along the parapet. In the near foreground at lower left, seen from behind and a little to the side, Zhuge Liang sits in his small four-wheeled carriage in a white crane-feather cloak and dark silk kerchief cap, holding a white feather fan, looking up at the wall, with a line of Shu-Han soldiers and banners on blank silk behind him. Keep the upper left third of the picture quiet (dark sky and falling snow) for a title the game will add.

Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.

The attached portraits after the first image only show who the named people are (face, headwear and dress); paint them as small or medium figures in the scene, not as portraits. Shu-Han soldiers wear jade-green padded coats with red trim and rounded iron helmets; Wei soldiers wear deep indigo coats over black lacquered lamellar and round iron helmets.

Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; restrained winter palette of paper-white snow, ochre earth, grey brick, slate roofs, Shu-Han jade green with red trim and Wei deep indigo, with fire in vermilion and orange washes. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.

Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.
```

## 看什么

- 和 S2-01 全图、S5 立绘放在一起是同一套画风；城门楼、城墙和全图里的一致。
- 没有任何文字、印章、外框；没有血腥。
- 左上三分之一安静，能放标题。
- 火光是画面的焦点；诸葛亮和郝昭一个在城下、一个在城头，一眼看得出对峙。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
