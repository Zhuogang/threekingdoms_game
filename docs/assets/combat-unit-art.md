# Ink combat unit artwork

## Scope

Visual follow-up to the ink campaign map and battlefield. The user clarified that “工兵” meant **弓兵**: archers, alongside infantry and cavalry. No engineer class, balance, movement, combat, roster or save-schema changes.

- Infantry: standing spear-and-shield soldier.
- Cavalry: mounted lancer, with the entire horse visible.
- Archer: drawn bow and arrow, clearly different from the spear silhouette.
- Elite and guard share the infantry illustration but retain crossed-sword and shield insignia respectively. Naval units retain the distinct boat insignia.
- Attackers face right and defenders face left. Allegiance still uses a faction stripe and crest.
- Commander surnames sit above the miniature, strength below it. Readiness, inspiration, morale, veteran pips, selection and target borders remain separate tactical marks.
- The bilingual troop legend pairs the art with the existing icon and translated troop label. Missing pictures fall back to those icons.
- These are period-inspired decorative miniatures, not verified reconstructions of late-Han equipment.

## Assets and generation

Generated with the **built-in imagegen tool**, one transparent image per troop type, on 2026-10-20. No CLI or external image API was used. Original PNGs remain in the Codex generated-image directory. Sharp trimmed transparent margins, resized each image to fit 256×256, and encoded WebP at quality 88 / alpha quality 100, retaining genuine alpha.

| Runtime asset                       | Dimensions | Bytes  | Original generated PNG                          |
| ----------------------------------- | ---------- | ------ | ----------------------------------------------- |
| `public/assets/units/infantry.webp` | 144×256    | 18,948 | `exec-a7c27f04-1323-413c-83e8-7a254976e41b.png` |
| `public/assets/units/cavalry.webp`  | 184×256    | 19,904 | `exec-0176c04d-95f7-46c4-9c6d-489b3387b9f4.png` |
| `public/assets/units/archer.webp`   | 200×256    | 20,748 | `exec-3e404028-2d24-4dcc-b9f2-905625d8c7c5.png` |

Total additional image payload: **59,600 bytes**. Asset URLs honor Vite's deployment base. Each mounted Pixi renderer owns and disposes its textures; unit containers continue using the existing on-demand cached rendering and movement animation.

### Final prompts

#### Infantry

Use case: historical-scene. Asset type: single transparent game unit sprite for a Chinese Three Kingdoms ink-wash strategy game.
Subject: one full-body Chinese infantry spearman with a broad rectangular shield, simple late-Han helmet and lamellar vest, standing steady in three-quarter view facing right. Spear clearly rises alongside him, shield held across body. No horse, no bow.
Style: 中式水墨画, bold confident charcoal-black brush silhouettes, restrained warm grey ink washes, a little off-white on armor, hand-painted dry brush edges. Period-inspired, not a historical reconstruction. Extremely simple shapes readable as a 40-pixel battlefield miniature, not a detailed portrait.
Composition: isolated centered full figure including feet, spear tip and shield, square canvas with 12% clear margin on all sides. Figure fills most of height. True transparent background, no scenery, no paper rectangle, no text, no badge, no border, no watermark, no shadow extending outside figure. Neutral charcoal palette; faction colors will be added by game code.

#### Cavalry

Use case: historical-scene. Asset type: single transparent battlefield unit sprite for a Chinese Three Kingdoms ink-wash strategy game.
Subject: one Chinese mounted cavalry soldier on one horse, entire horse and rider in side/three-quarter view facing right, horse standing in a strong alert pose. Rider wears simple late-Han inspired helmet and lamellar vest, holds a long upright lance. Horse legs and head must form unmistakable silhouette.
Style: 中式水墨画, charcoal-black expressive brush contours, restrained warm grey ink washes, bone-white highlights, small hints of muted brown. Simplified bold shapes readable as a 40-pixel miniature, no intricate decorative detail.
Composition: centered complete horse, rider and lance on square transparent canvas, 10% clear margins all sides. Absolutely no scenery, no text, no badge, no frame, no watermark, no paper background. True alpha transparency. Faction colors added separately by game. Period-inspired illustration, not historical reconstruction.

#### Archer

Use case: historical-scene. Asset type: single transparent battlefield unit sprite for Chinese Three Kingdoms strategy game.
Subject: one full-body Chinese foot archer, simple late-Han inspired helmet, light lamellar vest and robe, planted feet, side/three-quarter view facing right. Holding a LARGE curved bow in his left hand with arm extended to right, right hand pulling bowstring toward cheek, arrow pointing right. The empty curve and string triangle of bow must be clearly readable. Small quiver on back. No shield, no spear, no horse.
Style: 中式水墨画, confident charcoal-black brush outlines, warm grey ink washes, bone-white highlights and tiny muted brown accents. Simplified readable silhouette for a 40-pixel game miniature. Match hand-painted ink soldier and cavalry sprites. Period-inspired illustration, not historical reconstruction.
Composition: centered complete figure including full bow and arrow, square canvas, clear 10% margin around entire silhouette. True transparent background; no scenery, paper rectangle, ground, labels, badges, borders, watermark or text. Neutral colors, faction colors added separately by game code.

## Verification

Validated locally on 2026-10-20:

- Strict TypeScript / production build passed; formatting and `git diff --check` passed.
- 61 unit tests passed in `presentation.test.ts` and `battle-rules.test.ts`.
- 9 distinct development browser checks passed: loaded/missing unit pictures (all six troop types, status variants, legend fallback, bilingual save preservation and movement), six 1366×768 language/display combinations, and the existing on-demand redraw/movement check. The eight artwork/layout checks were repeated after tightening the compact layout and passed again.
- 2 production browser checks passed: deployment beneath `/hegemony/` with all three unit assets loaded, bilingual persistent saves, and reload/completion of a partially played battle.
- 2 frame-rate profiles passed on a 10-versus-10 battlefield at 1280×720, DPR 1, Chrome 155: normal and 4× CPU throttling both had a 16.7 ms median battle-render interval (about 60 FPS), p95 16.9 / 17.4 ms, and zero battle intervals above the test's slow-frame threshold. Idle maps submitted zero draws. Reports: `.artifacts/perf/fps-baseline-ink-units.json` and `.artifacts/perf/fps-cpu-4x-ink-units.json`. CPU throttling is a simulation, not a real low-end device result.
- Inspected final screenshots for miniature silhouettes, mirrored facing, readable strength counts, legend images, and compact/comfortable layouts. Screenshots are under `.artifacts/unit-art/`, with laptop readability captures under `.artifacts/improvements/`.

No balance diagnostics were regenerated: this change does not modify simulation rules. Existing human-playtest and publication deferrals remain in effect.
