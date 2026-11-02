# S6-01 火与烟

`s6-01-fire-smoke` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 3×3 宫格，每格 512×341，透明底。第一行火焰小、中、大；第二行蔓延的火（宽而低）、火星余烬、焦痕贴花（俯视地面）；第三行淡烟团、上升的烟柱、黑烟。
- 程序把四种火焰轮换显示，加缩放、闪烁、明暗；烟团向东北飘升、变大、淡出；焦痕贴在器械和地面上（MVP 计划 §8.3）。
- 风格参考是 S2-01 定稿全图的一块（`style-reference.png`），火和烟要像同一幅画里画出来的。
- **2026-11-02 选定 `attempts/v1.webp`**（待你确认）：三种火焰大小分得开，焦痕带余烬，烟是半透明的灰墨。ImageGen 出的透明通道有噪点（实心处 252–254、底上有一层 1），存 `attempts/` 时线性拉到 0 和 255，软边保留；原图不动。选定的透明 PNG 是 `selected.png`；逐格切出的元素在 `poses/`（游戏尺寸 50% 在 `poses-game/`，锚点见 `poses.json`），由 `attempts/cut_poses.py`、`attempts/prepare_ui.py` 切出，不重画。每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. `docs/siege/chencang/art/s6-01-fire-smoke/style-reference.png`（S2-01 定稿全图的一块，风格参考）

```text
Output: an image exactly 1536 by 1024 pixels. A sheet of separate painted effect elements of fire and smoke for a strategy game, nine elements.

Arrange the sheet as a 3 by 3 grid of equal cells (512×341 pixels each, no borders drawn): one element centred in each cell with clear empty space around it, nothing crossing into a neighbouring cell.

Top row, flames standing on an invisible ground line near the bottom of each cell: a small flame (a hand-sized tongue of fire); a medium fire; a large roaring fire, about three times as tall as the small one.
Middle row: a low spreading fire, wide and short, as fire running along timber; a loose cluster of sparks and glowing embers drifting upward; a scorch mark decal: a blackened, charred patch of ground with ash and a few cinders, seen from above at the map camera angle, flat on the ground.
Bottom row: a single soft puff of pale grey smoke; a rising column of grey smoke, tall and narrow, leaning slightly to the upper right; a heavy billow of thick black smoke.

Style: traditional Chinese ink-wash painting with light colour, matching the attached painting (the battlefield map these effects are laid over) in brushwork, ink weight and palette: loose expressive ink strokes and soft transparent washes, warm restrained colour; flames in vermilion, orange and pale yellow washes with dark ink tips, smoke in layered grey ink washes. Seen from the same high three-quarter camera as the map. Painted, not photographic, no glossy CG fire.

Output a PNG with a genuinely transparent background (a real alpha channel): every pixel outside the elements is fully transparent; soft smoke, dust, glow and spray keep their partial transparency. No background colour, paper, ground or frame.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines, cell borders or guide marks; ground, scenery or backgrounds; people, soldiers, horses, flags or banners; modern objects.
```

## 看什么

- 背景真的是透明的（PNG 带 alpha）：烟、尘、光晕边缘是半透明，不是一块底色。
- 每格一件，不出格；缩到游戏大小（一半）还看得懂。
- 火焰三种大小明显不同；烟是半透明的灰墨，不是一块实心的灰。
- 焦痕是平贴地面的，从斜俯视看是扁的。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（无损 webp，保留透明通道）。
