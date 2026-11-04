# S8-09 图标表三

`s8-09-icons-counters` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [03-chencang-v0.2-plan.md](../../../03-chencang-v0.2-plan.md) §9。

- 版式同 S6-03：4×3 宫格每格 384×341，透明底，墨色剪影加一处朱红。十二个：压制、蒙皮、土山、强攻；夜攻、举火、夜袭、备火；吊石磨、堆礌石、晨报、立足。
- **2026-11-03 选定 `attempts/v3.webp`**（planner 已选）：The most distinct set at small size, especially the hide。原图自带透明通道，不抠品红；无损候选逐像素保留原通道，`selected.png` 才按 S6 将 alpha≤2 归零、alpha≥250 拉满并线性保留软边；`attempts/cut_poses.py` 切格，`attempts/prepare_ui.py icons` 生成 `icons/` 的 128、64、32px 图标；每张的提示词、源文件哈希、选择理由和检查记在 `generation-manifest.json`，候选对比在 `comparison.png`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），日志在仓库根目录 `attempts/s8-09/codex.log`。

## 上传与提示词

尺寸 1536×1024。上传：

1. 不上传参考图。

```text
Output: an image exactly 1536 by 1024 pixels. A sheet of twelve user-interface icons for a Three Kingdoms siege strategy game.

Arrange the sheet as a 4 by 3 grid of equal cells (384×341 pixels each, no borders drawn): one element centred in each cell with clear empty space around it, nothing crossing into a neighbouring cell.

Rows left to right, top to bottom:
1. suppressing volley (压制): three arrows flying in a flat fan toward a crenellated wall top
2. hide covering (蒙皮): a ladder with a draped animal hide hanging over its rails
3. earth mound (土山): a ramp of heaped earth with a log crib at its tall end
4. storm the wall (蚁附强攻): a wall face with a rope and grapnel and three small climbing figures
5. night assault (夜攻): a crescent moon over a wheeled ladder cart moving forward
6. light the torches (举火): a brazier bowl with a tall flame (the flame is the vermilion accent)
7. night sortie (夜袭): an open gate with a running figure holding a torch
8. light a brazier (备火): a three-legged iron brazier bowl with kindling and a single spark
9. hoist the millstone (吊石磨): a crane arm with a round millstone hanging below it on a rope
10. stack boulders (堆礌石): three boulders stacked on a wall edge
11. morning report (晨报): a partly unrolled scroll with a rising sun above it
12. foothold (立足): a wall top with three small notches, one filled in vermilion

Style: each icon is a single bold Chinese ink-brush pictogram in near-black ink (#2a2622) with exactly one small accent in vermilion (#b5402e), like a carved seal motif without the seal border: confident thick brush strokes, simple flat silhouette, no shading or gradients, no circle, square or frame around it. All twelve share the same stroke weight and visual size, and each must stay recognisable when shrunk to 32 pixels.

Output a PNG with a genuinely transparent background (a real alpha channel): every pixel outside the elements is fully transparent; soft smoke, dust, glow and spray keep their partial transparency. No background colour, paper, ground or frame.

Do not include: any text, letters, calligraphy, seals or signatures; grid lines, cell borders or guide marks; ground, scenery or backgrounds; people, soldiers, horses, flags or banners other than described; modern objects.
```

## 看什么

- 和 S6-03、S6-04 放一起笔画一致；32px 下十二个都认得出、彼此不混。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（无损 webp，保留透明通道）。
