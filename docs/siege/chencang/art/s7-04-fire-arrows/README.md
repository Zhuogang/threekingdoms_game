# S7-04 幕间：火箭逆射，烧毁云梯

`s7-04-fire-arrows` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 第一幕中的事件插画（美术 I02）：守军火箭逆射，云梯着火，梯上的蜀兵往下撤。
- **2026-11-02 选定 `attempts/v2.webp`**：火箭往下射、两架云梯着火、蜀兵后撤；v1、v3 照搬了全图那块的构图（连城内都画了）。四角和旗面在原尺寸下查过，没有印章、落款和文字。运行时用的 1536×1024 和 768×512 在 `runtime/`；每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s7-01-key-visual/style-reference.png`（第一张：S2-01 定稿全图南半城，风格和建筑参考）

```text
Output: a landscape painting exactly 1536 by 1024 pixels. Event scene: the defenders burn the scaling ladders. Dusk, snow falling. Along the south wall of Chencang, Wei archers in deep indigo lean between the crenels and loose fire arrows downward, the burning arrowheads drawing short streaks of light. Two Shu-Han scaling ladders leaning against the wall have caught fire; flames climb their rails and black smoke rolls up the brick face; Shu-Han soldiers in jade green scramble down the ladders and fall back across the half-filled trench, shields raised. In the foreground, the wheeled ladder carts and a few soldiers with earth baskets, lit orange by the fire. Dramatic but without gore.

Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.

Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; restrained winter palette of paper-white snow, ochre earth, grey brick, slate roofs, Shu-Han jade green with red trim and Wei deep indigo, with fire in vermilion and orange washes. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.

Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.
```

## 看什么

- 和 S2-01 全图、S5 立绘放在一起是同一套画风；城门楼、城墙和全图里的一致。
- 没有任何文字、印章、外框；没有血腥。
- 火箭从城头往下射，云梯在烧；没有血腥。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
