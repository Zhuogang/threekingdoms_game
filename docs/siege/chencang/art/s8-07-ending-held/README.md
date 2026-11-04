# S8-07 结局插画：魏军守住

`s8-07-ending-held` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [03-chencang-v0.2-plan.md](../../../03-chencang-v0.2-plan.md) §9。

- 插画，1536×1024，用于魏方「守住」的三种等级。黎明，雪后初晴。郝昭立在南门门楼上远眺；城下蜀军大营正在拔营，车队沿散关道向南远去，烧毁的云梯残骸还在城堑边；东方地平线上尘土扬起，隐约有骑兵的旗。
- **2026-11-03 选定 `attempts/v2.webp`**（planner 已选）：Hao Zhao above the retreat, the wrecks by the trench, and a far line of relief banners。原尺寸下检查过四角和旗面，没有文字、印章和落款；运行时用的 1536×1024（quality 88）和 768×512（quality 85）在 `runtime/`；每张的提示词、源文件哈希、选择理由和检查记在 `generation-manifest.json`，候选对比在 `comparison.png`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），日志在仓库根目录 `attempts/s8-07/codex.log`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s7-01-key-visual/style-reference.png`
2. `docs/siege/chencang/art/s5-07-portrait-hao-zhao/attempts/v1.webp`

```text
Output: a landscape painting exactly 1536 by 1024 pixels. Ending scene: Chencang holds. Dawn after a snowfall, the sky clearing to pale gold in the east. On the south gate tower of Chencang stands Hao Zhao, the Wei commander, the man of the second attached portrait, in dark lamellar armour and a red cloak, one hand on the parapet, looking south over the plain; a few exhausted Wei soldiers in deep indigo rest against the crenels beside him, and a hoisted millstone still hangs from a crane on the tower. Below, across the frozen trench, the Shu-Han camp is striking its tents: columns of soldiers in jade green and lines of carts file away southward along the snowy road toward the mountains, banners lowered, while the charred skeletons of two scaling ladders and a crushed ram lie abandoned at the edge of the trench. Far on the eastern horizon, a long plume of dust and the small dark shapes of cavalry banners mark the approach of the Wei relief army. Quiet and spare, with no fighting.

Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.

Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; restrained winter palette of paper-white snow, ochre earth, grey brick, slate roofs, Shu-Han jade green with red trim and Wei deep indigo, with the dawn in pale gold washes. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.

Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.
```

## 看什么

- 和 S7-05、S7-06 是同一套画风；郝昭的样子对得上立绘；没有文字、印章；蜀军是在退，不是在攻。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
