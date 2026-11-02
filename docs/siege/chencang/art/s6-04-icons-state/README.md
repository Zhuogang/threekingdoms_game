# S6-04 图标表二：高度、登城、填堑、余粮、援军等

`s6-04-icons-state` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 4×3 宫格，每格 384×341，十二个图标：高度、登城、填堑、城门；城墙、余粮、援军、士气；兵力、伤兵、日、夜修（MVP 计划 §4、§7）。
- 画风同 S6-03，两张表放在一起要像一套。
- **2026-11-02 选定 `attempts/v3.webp`**（待你确认）：和 S6-03 v3 是一套，32px 下都认得出。ImageGen 出的透明通道有噪点（实心处 252–254、底上有一层 1），存 `attempts/` 时线性拉到 0 和 255，软边保留；原图不动。选定的透明 PNG 是 `selected.png`；方形图标 128、64、32px 在 `icons/`，由 `attempts/cut_poses.py`、`attempts/prepare_ui.py` 切出，不重画。每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. 不上传参考图；出图后和 S6-03 放在一起看。

```text
Output: an image exactly 1536 by 1024 pixels. A sheet of twelve user-interface icons for a Three Kingdoms siege strategy game, a companion set to an existing sheet of engine and order icons.

Arrange the sheet as a 4 by 3 grid of equal cells (384×341 pixels each, no borders drawn): one element centred in each cell with clear empty space around it, nothing crossing into a neighbouring cell.

Rows left to right, top to bottom:
1. height (高度): three stacked steps rising to the right
2. climb the wall (登城): a ladder leaning on a crenellated wall top, with an upward arrow stroke
3. fill the trench (填堑): a basket tipping earth into a narrow ditch
4. city gate (城门): a gate tower over a pair of closed studded doors
5. city wall (城墙): a short crenellated wall section
6. grain supply (余粮): a tied grain sack with a few spilled grains
7. reinforcements (援军): a galloping horse head with a pennant streaming behind
8. morale (士气): a battle flag streaming in the wind on a short pole
9. troop strength (兵力): three spears standing upright side by side
10. wounded (伤兵): a broken spear with a bandage wrapped around it
11. day (日): a sun disc with a few short brush rays (the disc is the vermilion accent)
12. night repair (夜修): a crescent moon above a mallet

Style: each icon is a single bold Chinese ink-brush pictogram in near-black ink (#2a2622) with exactly one small accent in vermilion (#b5402e), like a carved seal motif without the seal border: confident thick brush strokes, simple flat silhouette, no shading or gradients, no circle, square or frame around it. All twelve share the same stroke weight and visual size, and each must stay recognisable when shrunk to 32 pixels.

Output a PNG with a genuinely transparent background (a real alpha channel): every pixel outside the elements is fully transparent; soft smoke, dust, glow and spray keep their partial transparency. No background colour, paper, ground or frame.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines, cell borders or guide marks; ground, scenery or backgrounds; people, soldiers, horses, flags or banners; modern objects.
```

## 看什么

- 背景真的是透明的（PNG 带 alpha）：烟、尘、光晕边缘是半透明，不是一块底色。
- 每格一件，不出格；缩到游戏大小（一半）还看得懂。
- 和 S6-03 放在一起像同一套。
- 缩到 32px 每个都还认得出。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（无损 webp，保留透明通道）。
