# S7-03 开场二：郝昭城头拒降

`s7-03-opening-refusal` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 开场第二张（美术 I01）：郝昭在门楼前的城头拒绝，手按剑，守军张弓待命。
- **2026-11-02 选定 `attempts/v1.webp`**：拒绝的手势最有力，郝昭和立绘一致；旗面空白。四角和旗面在原尺寸下查过，没有印章、落款和文字。运行时用的 1536×1024 和 768×512 在 `runtime/`；每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s7-01-key-visual/style-reference.png`（第一张：S2-01 定稿全图南半城，风格和建筑参考）
2. `docs/siege/chencang/art/s5-07-portrait-hao-zhao/attempts/v1.webp`（郝昭立绘，只作人物参考）

```text
Output: a landscape painting exactly 1536 by 1024 pixels. Opening scene: Hao Zhao refuses to surrender. A closer view on the wall top of Chencang beside the two-storey gate tower, seen from slightly below along the parapet: Hao Zhao stands at the crenellated parapet in his dark red cloak, black lacquered armour and iron helmet with a short red plume, one hand on his sword hilt, the other raised flat in refusal, his face stern. Along the wall behind him Wei archers in deep indigo coats stand ready with arrows nocked, and a square deep-indigo banner with a blank face flies from the gate tower. Below and beyond the wall, small in the distance, the Shu-Han army waits on the snowy plain before its camp. Late afternoon light, light snow.

Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.

The attached portraits after the first image only show who the named people are (face, headwear and dress); paint them as small or medium figures in the scene, not as portraits. Shu-Han soldiers wear jade-green padded coats with red trim and rounded iron helmets; Wei soldiers wear deep indigo coats over black lacquered lamellar and round iron helmets.

Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; restrained winter palette of paper-white snow, ochre earth, grey brick, slate roofs, Shu-Han jade green with red trim and Wei deep indigo, with fire in vermilion and orange washes. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.

Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.
```

## 看什么

- 和 S2-01 全图、S5 立绘放在一起是同一套画风；城门楼、城墙和全图里的一致。
- 没有任何文字、印章、外框；没有血腥。
- 郝昭的拒绝姿态清楚，像 S5-07 立绘里的那个人。
- 旗面空白，没有字。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
