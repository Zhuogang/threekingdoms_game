# S6-02 冲击

`s6-02-impacts` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 3×3 宫格，每格 512×341，透明底。第一行尘爆小、中、大；第二行碎木、碎石、礌石两块；第三行插在雪里的箭簇、插在墙面上的箭簇、瓦砾堆。
- 冲车撞门、礌石落地、石磨砸冲车时出尘爆和碎片，碎片由程序四散；箭由程序画成墨线，落地后换成插着的箭簇（MVP 计划 §8.3）。
- **2026-11-02 选定 `attempts/v1.webp`**（待你确认）：尘爆最好（边缘散开、带土块），墙上的箭簇没画墙。ImageGen 出的透明通道有噪点（实心处 252–254、底上有一层 1），存 `attempts/` 时线性拉到 0 和 255，软边保留；原图不动。选定的透明 PNG 是 `selected.png`；逐格切出的元素在 `poses/`、`poses-game/`，由 `attempts/cut_poses.py`、`attempts/prepare_ui.py` 切出，不重画。每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s6-01-fire-smoke/style-reference.png`（S2-01 定稿全图的一块，风格参考）

```text
Output: an image exactly 1536 by 1024 pixels. A sheet of separate painted impact and debris elements for a siege battle in a strategy game, nine elements.

Arrange the sheet as a 3 by 3 grid of equal cells (512×341 pixels each, no borders drawn): one element centred in each cell with clear empty space around it, nothing crossing into a neighbouring cell.

Top row, bursts of snow-dust and earth thrown up by an impact, sitting on an invisible ground line near the bottom of each cell: small, medium, large.
Middle row: a scatter of broken wooden splinters and planks flying apart; a scatter of broken stone and brick fragments; two heavy rough-hewn stone boulders (礌石) of the kind defenders drop from walls, side by side.
Bottom row: four arrows stuck at angles into a patch of snow, seen from the map camera; four arrows stuck into a vertical brick wall face, seen from the front, with only the arrows and a few chips of brick (no wall); a low pile of broken roof tiles and bricks (rubble).

Style: traditional Chinese ink-wash painting with light colour, matching the attached painting (the battlefield map these effects are laid over) in brushwork, ink weight and palette: loose expressive ink strokes and soft transparent washes, warm restrained colour; flames in vermilion, orange and pale yellow washes with dark ink tips, smoke in layered grey ink washes. Seen from the same high three-quarter camera as the map. Painted, not photographic, no glossy CG fire.

Output a PNG with a genuinely transparent background (a real alpha channel): every pixel outside the elements is fully transparent; soft smoke, dust, glow and spray keep their partial transparency. No background colour, paper, ground or frame.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines, cell borders or guide marks; ground, scenery or backgrounds; people, soldiers, horses, flags or banners; modern objects.
```

## 看什么

- 背景真的是透明的（PNG 带 alpha）：烟、尘、光晕边缘是半透明，不是一块底色。
- 每格一件，不出格；缩到游戏大小（一半）还看得懂。
- 尘爆是半透明的，边缘散开。
- 墙上的箭簇只画箭和几点碎砖，不画墙。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（无损 webp，保留透明通道）。
