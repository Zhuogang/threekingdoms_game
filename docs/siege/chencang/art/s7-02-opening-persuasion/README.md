# S7-02 开场一：靳详城下劝降

`s7-02-opening-persuasion` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 开场第一张（美术 I01）：靳详在城下喊话劝降，郝昭在城头听。白天，雪后。
- **2026-11-02 选定 `attempts/v1.webp`**：纸色天空和全图一致；靳详在桥头举手喊话，郝昭在城头听。四角和旗面在原尺寸下查过，没有印章、落款和文字。运行时用的 1536×1024 和 768×512 在 `runtime/`；每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s7-01-key-visual/style-reference.png`（第一张：S2-01 定稿全图南半城，风格和建筑参考）
2. `docs/siege/chencang/art/s5-09-portrait-jin-xiang/attempts/v2.webp`（靳详立绘，只作人物参考）
3. `docs/siege/chencang/art/s5-07-portrait-hao-zhao/attempts/v1.webp`（郝昭立绘，只作人物参考）

```text
Output: a landscape painting exactly 1536 by 1024 pixels. Opening scene: Jin Xiang, an envoy and old acquaintance of the defender, stands before the south gate of Chencang on a clear winter morning after snow and calls up to the wall to urge its surrender. He is a civilian in a soft black headcloth, a plain dark-green travelling robe and a fur-trimmed cloak, standing at the near end of the wooden bridge over the frozen trench with one hand raised, two Shu-Han attendants a few steps behind him. Above him the brick wall and the closed gate rise steeply; on the wall top Hao Zhao in his dark red cloak and red-plumed helmet leans on the parapet listening, among a few Wei soldiers. In the far distance to the south, the tents and banners of the Shu-Han camp under the snowy foothills. A calm, tense moment, no fighting.

Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.

The attached portraits after the first image only show who the named people are (face, headwear and dress); paint them as small or medium figures in the scene, not as portraits. Shu-Han soldiers wear jade-green padded coats with red trim and rounded iron helmets; Wei soldiers wear deep indigo coats over black lacquered lamellar and round iron helmets.

Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; restrained winter palette of paper-white snow, ochre earth, grey brick, slate roofs, Shu-Han jade green with red trim and Wei deep indigo, with fire in vermilion and orange washes. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.

Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.
```

## 看什么

- 和 S2-01 全图、S5 立绘放在一起是同一套画风；城门楼、城墙和全图里的一致。
- 没有任何文字、印章、外框；没有血腥。
- 靳详是文人、没有甲胄；郝昭在城头。
- 没有交战，气氛平静而紧张。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
