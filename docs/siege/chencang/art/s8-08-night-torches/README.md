# S8-08 幕间插画：雪夜举火与夜袭

`s8-08-night-torches` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [03-chencang-v0.2-plan.md](../../../03-chencang-v0.2-plan.md) §9。

- 插画，1536×1024。雪夜。南墙女墙上一溜火盆和火把把墙面照成暖色，魏军弓手在火光里引弓；城下，一小队举火把的魏兵从门洞冲出，正把火把捅向停在城堑边的土车，车下已起小火；蜀军几名持戟的卫兵从暗处跑来。
- **2026-11-03 选定 `attempts/v2.webp`**（planner 已选）：Firelit wall, the sortie at the cart, and the Shu guards arriving too late。原尺寸下检查过四角和旗面，没有文字、印章和落款；运行时用的 1536×1024（quality 88）和 768×512（quality 85）在 `runtime/`；每张的提示词、源文件哈希、选择理由和检查记在 `generation-manifest.json`，候选对比在 `comparison.png`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），日志在仓库根目录 `attempts/s8-08/codex.log`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s7-01-key-visual/style-reference.png`

```text
Output: a landscape painting exactly 1536 by 1024 pixels. Event scene: torches on the wall and a night sortie. A snowy night, the sky deep ink-blue with falling snow. Along the top of Chencang's south wall a row of iron braziers and torches burns between the crenels, throwing warm orange light down the brick face and onto the snow below; Wei archers in deep indigo stand in the firelight with bows drawn, aiming down. Below the wall, a small party of Wei infantrymen carrying torches has rushed out through the gate and across the bridge; two of them thrust their torches into a wheeled earth cart parked at the edge of the frozen trench, and small flames are already licking up its side. From the darkness to the south, a few Shu-Han halberdiers in jade green run toward the cart with shields raised, too late. The far camp of the Shu-Han army is a line of faint tent shapes and dying campfires in the snow. Dramatic but without gore.

Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.

Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; a night palette of deep indigo and ink greys with paper-white snow, the firelight in vermilion and orange washes as the main light source. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.

Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.
```

## 看什么

- 夜景但不是全黑，火光是主光源；看得出是魏军出城放火、蜀军赶来护车；没有血。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
