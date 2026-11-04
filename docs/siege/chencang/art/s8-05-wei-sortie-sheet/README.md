# S8-05 魏军夜袭小队姿态表

`s8-05-wei-sortie-sheet` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [03-chencang-v0.2-plan.md](../../../03-chencang-v0.2-plan.md) §9。

- 版式同 S5-03：3×2 宫格，每格 512×512，同一个 S5-03 的魏步兵，手持火把。第一行：正面（朝南，出城向观者走来）持火把行进；背面（朝北，折返）持火把行进；侧面（朝东）持火把行进。第二行：正面把火把捅向身前（点火）；正面举盾后退（被击退）；侧面蹲下点燃脚下的柴（点火）。
- **2026-11-03 选定 `attempts/v2.webp`**（planner 已选）：All six poses clean, and the crouching pose has the kindling bundle the prompt asks for。透明版 `selected-transparent.png` 由 `attempts/key.py` 抠出品红；`attempts/cut_poses.py` 按 3×2 切格，`min-island=0` 保留火星，`poses/`、`poses-game/` 和 `poses.json` 记录姿态、36/300 游戏缩放及脚底锚点；每张的提示词、源文件哈希、选择理由和检查记在 `generation-manifest.json`，候选对比在 `comparison.png`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），日志在仓库根目录 `attempts/s8-05/codex.log`。

## 参考图

![guide](guide.png)

## 上传与提示词

尺寸 1536×1024。上传：

1. `guide.png`
2. `docs/siege/chencang/art/s5-03-wei-infantry-sheet/attempts/v1.webp`

```text
Subject: a character pose sheet of the same Wei infantryman as on the second attached sheet, for a strategy game, drawn six times on a night sortie carrying a burning torch. Arrange the sheet as a 3 by 2 grid of equal cells (512×512 pixels each) exactly as in the first attached guide: one figure per cell, every figure the same size (about 300 pixels from the soles to the top of the helmet, up to the dashed line), feet on the solid baseline.
Top row: seen from the front (facing south, toward the viewer), striding forward with a torch held up in the right hand and a short sword in the left; seen from behind (facing north, away from the viewer), striding with the torch held up; seen from the side facing right (east), striding with the torch held ahead of him.
Bottom row: seen from the front, lunging to thrust the torch into something low in front of him; seen from the front, backing away behind his raised shield with the torch lowered (driven off); seen from the side facing right (east), crouching to touch the torch to a bundle of kindling at his feet.
The torch: a short wooden stave with a wrapped head burning with a small, simple orange-and-yellow flame and a few sparks; the flame is small and does not light the figure dramatically.
Camera: the same orthographic three-quarter top-down camera as the battlefield, about 50 degrees from above, so the top of the helmet and the shoulders are visible and the figure is slightly foreshortened.
The soldier: a deep indigo (#2f4a6e) padded war coat under black-lacquered lamellar armour, a rounded iron helmet with a neck guard, wrapped leggings and boots, a tall rectangular wooden shield faced with lacquered hide, slung or held; no facial features. Identical armour, colours and proportions in every cell, and the same soldier as on the second attached sheet.
Style: match the second attached sheet (the Wei infantry pose sheet) exactly in brushwork and colour handling: bold dark ink outline, flat ink-textured colour fills, no facial features. Match its style, proportions and figure size.
Light: low winter sun from the lower left (south-west); shade the figure only, with no cast shadow; the torch adds only a faint warm tint to the hand holding it.

Registration on the guide: column centres x=256, 768, 1280; feet baselines y=456 (top row), y=968 (bottom row); helmet guide lines y=156 and y=668, exactly 300 pixels above the baselines.

Isolated object only, on a perfectly flat solid magenta (#FF00FF) background with no gradient, texture or ground. Nothing else in the frame. Clean edges against the background, and no magenta tint reflected onto the object.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines or guide marks; ground, scenery or cast shadows; additional figures, horses, flags, banners or pennants; modern objects.
```

## 看什么

- 和 S5-03 是同一个兵；火把是暖橙色的一点，不画大火；六格都踩在基线上；缩到 36px 看得出拿着火把。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1536×1024）。
