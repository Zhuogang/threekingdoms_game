# S5-08 立绘：王生

`s5-08-portrait-wang-sheng` · 由 `node tools/build-siege-blockout.mjs` 生成，请改脚本而不是改这个文件。计划见 [01-chencang-art-plan.md](../../../01-chencang-art-plan.md) §9.2、§13。

- 魏将，郝昭的副将（《资治通鉴》载曹真派郝昭、王生守陈仓，MVP 计划 §4.2）。
- **2026-11-02 选定 `attempts/v2.webp`**（待你确认）：敦实、朴素，比郝昭粗壮，正脸 48px 也认得出。运行时用的 256px 和 128px 在 `runtime/`（同 v0.3 的质量设置）；每张的提示词、源文件和选择理由记在 `generation-manifest.json`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh）。

## 上传与提示词

尺寸 1024×1024。上传：

1. 不上传参考图（和 v0.3 立绘同一套做法）。

```text
Use case: historical-scene. Asset type: one individual square officer portrait for a Three Kingdoms strategy game.

Original imagined historical character illustration, one Chinese person only, centered head and shoulders, head and all headwear entirely inside image with a little empty headroom, face large and readable at 48 pixels, slight three-quarter pose.

Elegant hand-painted historical portrait with precise dark ink contours, muted mineral watercolor, warm plain parchment backdrop, soft even lighting, realistic individual facial anatomy, premium illustrated strategy game asset. Restrained late-Han / Three Kingdoms period clothing and headwear.

No frame, no lettering, no Chinese characters, no watermark, no scenery, no extra people, no modern clothing, no exaggerated fantasy armor, no commercial-game copy. Make this person clearly distinctive in facial structure, age, hair, expression, clothing, and headwear.

Subject: Portray 王生 (wangsheng) as a Chinese historical figure of the late Han / Three Kingdoms era. Age impression: 30-40. Face: broad, round, sturdy face with a heavy brow. Facial hair: thick drooping moustache and a short square chin beard. Headwear / hairstyle: low rounded iron cap with leather ear flaps. Distinctive cues: loyal, practical deputy; steady and watchful; plain dark lamellar armour, no cloak. Character goal: must read as Hao Zhao's reliable second: plainer and heavier-set than him. Avoid: looking like Hao Zhao, scholar, nobleman.

Production emphasis:  Square 1:1 canvas, zoomed-out bust framing: the top 10 percent of canvas is plain parchment; entire headwear and hair lie below that margin, full head and shoulders visible; unobscured face. Every individual must have a distinct natural face, matching the supplied age and identity cues.
```

## 看什么

- 和 `public/assets/v03/portraits/` 里的诸葛亮、姜维、曹真放在一起，是同一套画风、同样的取景和底色。
- 缩到 48px 还认得出脸；和郝昭、王生、靳详彼此一眼分得开。

## 出图记录

出的图放进 `attempts/`，依次命名 `v1.webp`、`v2.webp`……（1024×1024）。选定后另存运行时用的 256px 和 128px（`-small`）webp，同 v0.3。
