# S7-06 结局：粮尽退兵，王双追击被斩（史实）

`s7-06-ending-withdrawal` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 史实结局（美术 I02）：粮尽，蜀军退回散关的山道；王双率魏骑追击，中伏。画成中伏的一刻，不画血腥。
- **2026-11-02 选定 `attempts/v1.webp`**：远处蜀军撤上山道，近景魏骑冲进伏弩，没有血腥。四角和旗面在原尺寸下查过，没有印章、落款和文字。运行时用的 1536×1024 和 768×512 在 `runtime/`；每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s7-01-key-visual/style-reference.png`（第一张：S2-01 定稿全图南半城，风格和建筑参考）

```text
Output: a landscape painting exactly 1536 by 1024 pixels. Ending scene, the historical outcome: the Shu-Han army, its grain exhausted, withdraws southward into the snowy Qinling mountains. A long column of soldiers in jade green, carts and banners winds up a narrow valley road between steep snowy slopes and pines, small in the middle distance. In the foreground below a rocky bend of the road, a troop of Wei cavalry in deep indigo, led by a commander with a tall plume on a dark horse, gallops in pursuit straight into an ambush: Shu-Han crossbowmen rise from behind rocks and pines on the slopes above them, crossbows levelled, and the leading horses rear in alarm. Cold blue-grey evening light, falling snow. The moment of the trap springing, without gore.

Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.

Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; restrained winter palette of paper-white snow, ochre earth, grey brick, slate roofs, Shu-Han jade green with red trim and Wei deep indigo, with fire in vermilion and orange washes. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.

Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.
```

## 看什么

- 和 S2-01 全图、S5 立绘放在一起是同一套画风；城门楼、城墙和全图里的一致。
- 没有任何文字、印章、外框；没有血腥。
- 蜀军在远处撤入山道；近景魏骑中伏，没有血腥。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
