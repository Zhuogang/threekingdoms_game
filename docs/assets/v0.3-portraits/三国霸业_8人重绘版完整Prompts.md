# 三国霸业：8 人重绘版完整 Prompts

本文件用于本轮重点返工的 8 人：郭嘉、诸葛亮、庞统、孙权、诸葛瑾、蒋琬、孔融、马良。

## 统一重绘规则

- **优先复用已有资源**：把当前已经相对可用的头像作为参考图，保留画风、光线、羊皮纸背景和构图比例。
- **只改辨识度，不要整套换风格**：目标是修正“过于英俊、过于统一”的问题。
- **保持游戏适配**：头肩像、1:1 方图、五官在 48px 仍可辨认。
- **避免遮脸**：扇子、手势、羽饰都不能遮住主要五官。

## 当前可复用参考图路径

- `guojia` → `/mnt/data/batch_01_wei_portraits/guojia.png`
- `zhugeliang` → `/mnt/data/batch_02_shu_portraits/zhugeliang.png`
- `pangtong` → `/mnt/data/batch_02_shu_portraits/pangtong.png`
- `sunquan` → `/mnt/data/batch_03_wu_portraits/sunquan.png`
- `zhugejin` → `/mnt/data/batch_03_wu_portraits/zhugejin.png`
- `jiangwan` → `/mnt/data/batch_02_shu_portraits/jiangwan.png`
- `kongrong` → `/mnt/data/batch_04_warlords_portraits/kongrong.png`
- `maliang_shu` → `/mnt/data/batch_02_shu_portraits/maliang_shu.png`

## 8 人完整重绘 Prompts

### guojia

```text
Edit / regenerate Guo Jia. Reuse the approved current Guo Jia portrait as the primary visual reference for identity and palette. Keep the frail genius /病弱才子 feeling, the pale blue-grey robe, and the thoughtful hand-gesture concept. Move the hand LOWER so that it does not block the mouth or most of the chin. The fingertips may lightly touch the lower jawline or rest near the collarbone, but the full nose-mouth-chin silhouette should read clearly at small size. Preserve the parchment backdrop, head-and-shoulders framing, and restrained elegant brushwork. He should remain refined, intelligent, slightly tired, and subtly fragile—not glamorous or flashy.
```

### zhugeliang

```text
Edit / regenerate Zhuge Liang. Reuse the current approved portrait style as a reference for rendering quality, but redesign the character for MUCH stronger recognizability. Zhuge Liang must be instantly identifiable through 羽扇纶巾: a clearly visible dark 纶巾 headcloth and a feather fan entering the frame without covering the face. He should look like a calm, brilliant, composed strategist in his late twenties or early thirties, with clear eyes, slight or minimal facial hair, pale grey / moon-white / sage robes, and quiet authority. Avoid generic handsome scholar energy. Preserve the parchment background, bust framing, and game-portrait readability.
```

### pangtong

```text
Edit / regenerate Pang Tong. Reuse the current approved portrait set only as a style reference, but intentionally DE-GLAMORIZE the face. Pang Tong should not be handsome in an idol-like way. Give him a less regular face, broader or slightly shorter proportions, a somewhat tired or heavy-lidded gaze, sparse and slightly untidy facial hair, and a more casually tied or slightly disordered hairstyle. Clothing should be plain, even a little worn. The feeling should be 奇士 / 凤雏: brilliant, unconventional, modestly unkempt, and memorable. Preserve the parchment background and bust portrait framing.
```

### sunquan

```text
Edit / regenerate Sun Quan. Reuse current rendering style but redesign for stronger ruler identity. Sun Quan should not read as a generic pretty noble youth. Give him a broader face, steadier and more commanding eyes, a stronger jaw, and a more grounded, ruler-like presence. Clothing should feel like the lord of Jiangdong: warm reds, browns, or muted gold accents, noble but not excessive. Light moustache and short beard are appropriate. He should feel like someone who can rule and decide, not just a handsome aristocrat. Preserve parchment background and bust framing.
```

### zhugejin

```text
Edit / regenerate Zhuge Jin. Reuse current palette and style, but differentiate him strongly from Jiang Wan and Kong Rong. Zhuge Jin should look older than Zhuge Liang, warmer and more厚重, with a longer face, more visible moustache and beard, and a gentle but dignified expression. He is a diplomat and elder brother figure—温厚、持重、外柔内稳. Use sober formal attire and a neat scholar cap. Avoid making him too handsome, too youthful, or too similar to any generic minister portrait.
```

### jiangwan

```text
Edit / regenerate Jiang Wan. Reuse style but redesign into a practical administrative statesman rather than a refined beauty. Jiang Wan should have a broader, plainer, more grounded face than Zhuge Jin and Kong Rong; neat but modest facial hair; a simple formal cap; and the quiet, stable presence of a late-Shu governing pillar. He should look capable of handling state affairs, calm under pressure, and not showy. Avoid elegant literati prettiness or a clone-like scholar face.
```

### kongrong

```text
Edit / regenerate Kong Rong. Reuse current art style, but differentiate him clearly from Zhuge Jin and Jiang Wan. Kong Rong should feel like an Eastern Han 名士: refined, literary, slightly proud, cultured, and lightly aristocratic. Give him a more slender literati face, less practical / administrative presence, more graceful scholar attire, and a hat or hair arrangement with stronger Han literati flavor. He may appear somewhat aloof or lofty. Avoid generic minister blandness or the same facial pattern used for other civil officials.
```

### maliang_shu

```text
Edit / regenerate Ma Liang. Reuse current style and keep him elegant, but make the 白眉 trait clearly visible. His brows should be noticeably pale / whitish while still natural-looking. Preserve the refined scholar-official aura, gentle expression, and graceful posture. Keep him distinct from other gentle civil officials through the eyebrow signature and slightly more graceful, youthful bearing. Avoid letting him collapse into a generic pretty scholar with ordinary dark eyebrows.
```

