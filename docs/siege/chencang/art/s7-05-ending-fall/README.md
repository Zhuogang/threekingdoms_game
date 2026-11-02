# S7-05 结局：陈仓陷落（架空）

`s7-05-ending-fall` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 架空结局"陈仓陷落"（美术 I03）：南门已破，蜀军涌入，城头换上蜀军的旗。
- **2026-11-02 选定 `attempts/v3.webp`**：只有这张是四轮小车由兵推着（v1、v2 画成了马拉的有篷车）；城门破、城头换上红旗。四角和旗面在原尺寸下查过，没有印章、落款和文字。运行时用的 1536×1024 和 768×512 在 `runtime/`；每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s7-01-key-visual/style-reference.png`（第一张：S2-01 定稿全图南半城，风格和建筑参考）
2. `public/assets/v03/portraits/zhugeliang.webp`（诸葛亮立绘，只作人物参考）

```text
Output: a landscape painting exactly 1536 by 1024 pixels. Ending scene, the fall of Chencang: a grey winter morning after the battle. The south gate of Chencang stands broken open, its iron-studded doors smashed and hanging, the gate tower scorched and missing tiles but standing; red Shu-Han banners with blank faces now fly from the gate tower and along the wall. A column of Shu-Han soldiers marches in through the gate over the wooden bridge; at the head of the column, Zhuge Liang rides in his small four-wheeled carriage in his white crane-feather cloak and kerchief cap, feather fan in hand. Thin smoke rises from inside the city; broken siege engines and scattered arrows lie in the snow in the foreground. Victorious but sober, not triumphant.

Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.

The attached portraits after the first image only show who the named people are (face, headwear and dress); paint them as small or medium figures in the scene, not as portraits. Shu-Han soldiers wear jade-green padded coats with red trim and rounded iron helmets; Wei soldiers wear deep indigo coats over black lacquered lamellar and round iron helmets.

Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; restrained winter palette of paper-white snow, ochre earth, grey brick, slate roofs, Shu-Han jade green with red trim and Wei deep indigo, with fire in vermilion and orange washes. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.

Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.
```

## 看什么

- 和 S2-01 全图、S5 立绘放在一起是同一套画风；城门楼、城墙和全图里的一致。
- 没有任何文字、印章、外框；没有血腥。
- 城门破、城头换上蜀旗（旗面空白）；诸葛亮的车在入城队伍前头。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
