# S6-05 卷轴横幅和面板纸纹

`s6-05-paper` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 四件，都留白（字由程序写）：上方一条完整的横幅卷轴（两端木轴，中间纸面）；下方左一块面板纸纹（方形，程序做无缝平铺）；下方右上一块名牌（窄长的木框纸牌）；右下一块对话框底（锦缎镶边的纸面）。
- 横幅由程序从中间切开卷起、展开（MVP 计划 §8.3）：两端木轴各切一段，中间纸面横向重复。面板纸纹出图后由脚本做成可平铺。
- **2026-11-02 选定 `attempts/v2.webp`**（待你确认）：卷轴木轴和锦缎镶边最干净，纸面全空。ImageGen 出的透明通道有噪点（实心处 252–254、底上有一层 1），存 `attempts/` 时线性拉到 0 和 255，软边保留；原图不动。选定的透明 PNG 是 `selected.png`；四件和横幅两端、可重复的中段、可平铺的纸纹在 `pieces/`（`pieces.json`），由 `attempts/cut_poses.py`、`attempts/prepare_ui.py` 切出，不重画。每张的提示词、源文件和选择理由记在 `generation-manifest.json`。

## 上传与提示词

尺寸 1536×1024。上传：

1. 不上传参考图。

```text
Output: an image exactly 1536 by 1024 pixels. Four separate blank paper and silk pieces for the interface of a Three Kingdoms strategy game, laid out without overlapping:

- Top, across almost the whole width (x=64..1472, y=96..352): a horizontal hanging scroll, unrolled: a long strip of warm cream rice paper mounted on pale blue-grey silk borders, with a dark lacquered wooden roller at each end capped with small bronze ends. The paper is completely blank and evenly textured along its length, so its middle can be repeated.
- Bottom left (x=64..640, y=448..1024): a square of plain warm rice paper with subtle fibres and faint watercolour mottling, completely blank, even in tone from edge to edge.
- Bottom right, upper (x=768..1472, y=448..640): a narrow horizontal name plaque: a thin dark wooden frame around blank cream paper.
- Bottom right, lower (x=768..1472, y=704..992): a dialogue panel: blank cream paper mounted in a narrow border of muted indigo brocade with a fine cloud pattern.

Seen straight on, flat, evenly lit, no perspective and no cast shadows. Traditional Chinese mounting craft, restrained and elegant, matching a game painted in ink and light colour.

Output a PNG with a genuinely transparent background (a real alpha channel): every pixel outside the elements is fully transparent; soft smoke, dust, glow and spray keep their partial transparency. No background colour, paper, ground or frame.

Do not include: any text, letters, calligraphy, seals or signatures on any piece; ornaments on the blank paper; grid lines or guide marks; backgrounds; modern objects.
```

## 看什么

- 四件纸面都完全空白。
- 横幅中间纸面纹理均匀，可以横向重复；面板纸纹整块色调均匀。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（无损 webp，保留透明通道）。
