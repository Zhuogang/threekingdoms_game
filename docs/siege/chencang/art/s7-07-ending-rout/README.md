# S7-07 结局：蜀军溃败（架空）

`s7-07-ending-rout` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 架空结局"蜀军溃败"（美术 I03）：器械烧毁，蜀军在雪地里溃退，城头魏军欢呼，远山上张郃援军的旗出现。
- **2026-11-02 选定 `attempts/v1.webp`**：器械焦毁、蜀军扶伤后撤、魏军城头欢呼、山脊上援军出现；v3 画了配重投石机，不合时代。四角和旗面在原尺寸下查过，没有印章、落款和文字。运行时用的 1536×1024 和 768×512 在 `runtime/`；每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s7-01-key-visual/style-reference.png`（第一张：S2-01 定稿全图南半城，风格和建筑参考）

```text
Output: a landscape painting exactly 1536 by 1024 pixels. Ending scene, the defeat of the attackers: before the south wall of Chencang on a grey winter afternoon. Siege engines lie burnt and broken in the snow before the trench, still smoking; Shu-Han soldiers in jade green fall back across the snowy plain in disorder, some helping wounded comrades, banners trailing. On the intact wall the Wei defenders in deep indigo raise their weapons and banners, the deep-indigo commander’s banner flying from the gate tower. On the hills far to the east, a dark line of Wei cavalry with many banners appears over the ridge: the relief army arriving. Bleak and cold, without gore.

Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.

Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; restrained winter palette of paper-white snow, ochre earth, grey brick, slate roofs, Shu-Han jade green with red trim and Wei deep indigo, with fire in vermilion and orange washes. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.

Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.
```

## 看什么

- 和 S2-01 全图、S5 立绘放在一起是同一套画风；城门楼、城墙和全图里的一致。
- 没有任何文字、印章、外框；没有血腥。
- 城墙完好、魏军在城头；蜀军溃退；远处山脊出现援军。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
