# S5-09 立绘：靳详

`s5-09-portrait-jin-xiang` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 郝昭的同乡，诸葛亮派他到城下两次劝降（开场，MVP 计划 §3）。是说客，不是武将。
- **2026-11-02 选定 `attempts/v2.webp`**（待你确认）：恳切、略带不安的文人说客，没有甲胄，和诸葛亮分得开。运行时用的 256px 和 128px 在 `runtime/`（同 v0.3 的质量设置）；每张的提示词、源文件和选择理由记在 `generation-manifest.json`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh）。

## 上传与提示词

尺寸 1024×1024。上传：

1. 不上传参考图（和 v0.3 立绘同一套做法）。

```text
Use case: historical-scene. Asset type: one individual square officer portrait for a Three Kingdoms strategy game.

Original imagined historical character illustration, one Chinese person only, centered head and shoulders, head and all headwear entirely inside image with a little empty headroom, face large and readable at 48 pixels, slight three-quarter pose.

Elegant hand-painted historical portrait with precise dark ink contours, muted mineral watercolor, warm plain parchment backdrop, soft even lighting, realistic individual facial anatomy, premium illustrated strategy game asset. Restrained late-Han / Three Kingdoms period clothing and headwear.

No frame, no lettering, no Chinese characters, no watermark, no scenery, no extra people, no modern clothing, no exaggerated fantasy armor, no commercial-game copy. Make this person clearly distinctive in facial structure, age, hair, expression, clothing, and headwear.

Subject: Portray 靳详 (jinxiang) as a Chinese historical figure of the late Han / Three Kingdoms era. Age impression: 35-45. Face: open, earnest face with gentle features and slightly anxious eyes. Facial hair: thin neat moustache and a small pointed beard. Headwear / hairstyle: soft black civilian headcloth (介帻). Distinctive cues: persuasive envoy and old acquaintance; plain dark-green travelling robe with a fur-trimmed cloak, no armour. Character goal: must read as a civilian go-between, earnest rather than cunning. Avoid: armour, weapons, a scholar-strategist look like Zhuge Liang.

Production emphasis:  Square 1:1 canvas, zoomed-out bust framing: the top 10 percent of canvas is plain parchment; entire headwear and hair lie below that margin, full head and shoulders visible; unobscured face. Every individual must have a distinct natural face, matching the supplied age and identity cues.
```

## 看什么

- 和 `public/assets/v03/portraits/` 里的诸葛亮、姜维、曹真放在一起，是同一套画风、同样的取景和底色。
- 缩到 48px 还认得出脸；和郝昭、王生、靳详彼此一眼分得开。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1024×1024）。选定后另存运行时用的 256px 和 128px（`-small`）webp，同 v0.3。
