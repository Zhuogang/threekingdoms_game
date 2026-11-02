# S6-03 图标表一：器械、反制、军令

`s6-03-icons-siege` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 4×3 宫格，每格 384×341，十二个图标：云梯、冲车、土车、井阑；火箭、石磨、礌石、筑重墙；鼓舞、督造、轮换、死守（MVP 计划 §4.7–§4.9）。
- 墨色剪影加一点朱红，不带外框；底框、选中态、灰显由界面代码画，所以图标本身要简单（32px 还认得出）。
- **2026-11-02 选定 `attempts/v3.webp`**（待你确认）：笔画最一致，32px 下十二个都认得出；v2 的死守画成了西式盾。ImageGen 出的透明通道有噪点（实心处 252–254、底上有一层 1），存 `attempts/` 时线性拉到 0 和 255，软边保留；原图不动。选定的透明 PNG 是 `selected.png`；方形图标 128、64、32px 在 `icons/`，由 `attempts/cut_poses.py`、`attempts/prepare_ui.py` 切出，不重画。每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. 不上传参考图。

```text
Output: an image exactly 1536 by 1024 pixels. A sheet of twelve user-interface icons for a Three Kingdoms siege strategy game.

Arrange the sheet as a 4 by 3 grid of equal cells (384×341 pixels each, no borders drawn): one element centred in each cell with clear empty space around it, nothing crossing into a neighbouring cell.

Rows left to right, top to bottom:
1. siege ladder cart (云梯): a wheeled cart with a tall leaning ladder
2. battering ram (冲车): a roofed wheeled shed with a ram beam sticking out
3. earth cart (土车): a small two-wheeled barrow heaped with earth
4. siege tower (井阑): a tall timber tower on wheels with a platform on top
5. fire arrow (火箭): an arrow whose head is wrapped in flame (the flame is the vermilion accent)
6. millstone drop (石磨): a heavy round millstone hanging from a rope, about to fall
7. dropped boulders (礌石): two boulders falling with short speed strokes
8. build the inner wall (筑重墙): a short rammed-earth wall between wooden shuttering boards with a rammer
9. rally (鼓舞): a war drum with crossed drumsticks
10. speed up construction (督造): a carpenter’s square crossed with a mallet
11. rotate troops (轮换): two curved arrows chasing each other around a small tent
12. hold fast (死守): a tall shield planted firmly, with a single upright spear behind it

Style: each icon is a single bold Chinese ink-brush pictogram in near-black ink (#2a2622) with exactly one small accent in vermilion (#b5402e), like a carved seal motif without the seal border: confident thick brush strokes, simple flat silhouette, no shading or gradients, no circle, square or frame around it. All twelve share the same stroke weight and visual size, and each must stay recognisable when shrunk to 32 pixels.

Output a PNG with a genuinely transparent background (a real alpha channel): every pixel outside the elements is fully transparent; soft smoke, dust, glow and spray keep their partial transparency. No background colour, paper, ground or frame.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines, cell borders or guide marks; ground, scenery or backgrounds; people, soldiers, horses, flags or banners; modern objects.
```

## 看什么

- 背景真的是透明的（PNG 带 alpha）：烟、尘、光晕边缘是半透明，不是一块底色。
- 每格一件，不出格；缩到游戏大小（一半）还看得懂。
- 十二个图标笔画粗细和大小一致，每个只有一处朱红。
- 缩到 32px 每个都还认得出、彼此不混。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（无损 webp，保留透明通道）。
