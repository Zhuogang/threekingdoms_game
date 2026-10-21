# Battlefield ink artwork and regional settings

Visual follow-up, 2026-10-20. The tactical renderer uses Chinese ink-painted terrain, connected river banks, dry gravel crossings, continuous walls, open gates and tented camps. Region descriptions are bilingual. Army banners retain faction colors.

The subsequent [combat unit art pass](combat-unit-art.md) adds matching infantry, cavalry and archer miniatures, with asset provenance and its own validation results.

## Geography and scope

`src/rendering/battleGeography.ts` assigns regional art direction to all 24 cities in both scenarios. Dry northern valleys use earth tones and low eroded hills; alluvial plains use open field contours; southern basins use cultivated land and broadleaf/bamboo groves; mountain settings use rocky ridges and pines.

The source references describe broad physical geography. They are not evidence for the exact terrain of a particular battle in 190 or 200 CE. These are regional artistic interpretations on the game's existing tactical grid, oriented for opposing armies rather than a north-up survey. Ancient river courses, coastlines and historical city locations are not reconstructed by this change. Beiping and the other game locations retain the scenario's naming conventions.

Ground truth for movement is always the saved `battle.terrain` array. Trees appear only on forest cells, ridges only on hill cells, water only on water cells, and fortifications only on their existing cells. A dry crossing is shown only on a plain cell between opposite water neighbors. Wall/gate art follows existing wall/gate adjacency. No terrain generation, city profile assignments, movement costs, damage rules, RNG, or save data are changed.

The existing tactical "forest" category at Chengdu is depicted as groves within farmland, consistent with a plain setting; it is not turned into a mountain wilderness. Shouchun is identified with the Huai, not the Yangtze. Hanzhong combines mountain terrain with a valley setting rather than treating the entire area as peaks.

## Geographic references

- [Hanzhong municipal government: geography](https://www.hanzhong.gov.cn/hzszf/mlhz/hzgk/202409/96f3304196fe4de4a13c848c03956a10.shtml): upper Han valley between the Qinling and Micang/Daba mountains.
- [UNESCO: Qingcheng and Dujiangyan](https://whc.unesco.org/en/list/1001): the irrigated Chengdu flatlands and their relationship to the western highlands.
- [Huainan municipal government: Shouxian / historical Shouchun](https://www.huainan.gov.cn/HUAINANCHINA/AboutHuainan/1260045526.html): south bank of the middle Huai River.
- [Tianshui municipal culture and tourism bureau](https://www.tianshui.gov.cn/wlj/mlts/tsgk/ztgk.htm) and [municipal ecological planning](https://www.tianshui.gov.cn/info/1631/866531.htm): western Qinling / Wei valley setting, loess hills and eroded valleys.
- [Luoyang basin settlement study, npj Heritage Science](https://www.nature.com/articles/s40494-025-02277-7): Yi–Luo alluvial plain within a surrounding basin.
- [Xiangyang geography, local media](https://xiangyang.cjyun.org/p/446177.html): Han valley, low plains, terraces and surrounding hills.

Other per-city regional labels are broad cartographic associations used for art direction, not claims about exact historical battle sites.

## Assets and provenance

Generated with the built-in imagegen tool; source `exec-6d218273-9189-426f-a555-4c733bfee605.png` (1254 × 1254, true alpha), retained locally at `.artifacts/battle-art/source.png`.

Four quadrants were cropped and optimized to 256 × 256 WebP at quality 88, retaining alpha. Runtime files in `public/assets/terrain/`: `pine.webp`, `grove.webp`, `ridge.webp`, `loess.webp` (139,640 bytes total). No new dependency or external runtime image request is required. Each mounted renderer owns and releases its textures; missing images fall back to ink vector symbols with the same terrain classification. Static layers retain on-demand rendering and the existing DPR cap.

## Validation

- Typecheck and production build passed; formatting and diff checks passed.
- 80 targeted unit tests passed, with one intentional legacy-hash regeneration test skipped. Existing battle rules and legacy save continuations remain unchanged.
- Eight development-browser checks passed: four laptop display/language combinations, on-demand rendering and movement, all four battlefield profiles in both languages, and walled-battle movement with artwork loaded or blocked. Three initially failed checks were corrected and rerun successfully (a cancelled renderer overwriting its loading-status attribute, plus an out-of-range test-fixture defense value).
- Two production checks passed under `/hegemony/`: bilingual save/reload with all artwork loaded, and reloading/completing an in-progress battle.
- Both baseline and 4× CPU-throttled performance checks passed at 1280 × 720, DPR 1, Chrome 155, with 10 units per side. Actual battle-render median was 16.7 ms in both; p95 was 17.1 / 17.4 ms. Both recorded zero idle renders. These are desktop browser measurements, not a physical low-end-device certification.
- Screenshots: `.artifacts/battle-art/{xiapi,shouchun,hanzhong,chengdu}-en.png`, plus `walls-ink.png` and `walls-fallback.png`. Performance reports: `.artifacts/perf/fps-{baseline,cpu-4x}-ink-battlefield.json`.
- Test servers were stopped after verification. The earlier committed full v0.2 evidence still refers to its earlier candidate.

## Generation prompt

Use case: stylized-concept. Asset type: transparent terrain sprite atlas for a Chinese Three Kingdoms tactical strategy game, in traditional Chinese ink wash painting (中式水墨画) style.
Create ONE square 2-by-2 sprite sheet with four distinct isolated terrain vignettes. Each vignette is entirely contained in its quadrant with generous fully transparent margins, centered, same high oblique overhead viewpoint (nearly top down), suitable for a square tactical map tile. Upper left: a compact grove of 5 ink-painted pine trees with recognizable irregular pine canopies, visible trunks and sparse low shrubs. Upper right: a small grove of broadleaf trees mixed with slender bamboo, soft leafy gray-green clusters and visible branches, subtropical southern Chinese grove. Lower left: 3 craggy rocky ridges with expressive Chinese dry-brush mountain texture strokes, pale stone faces and dark ink creases, viewed from high above, no distant background, no tall horizon silhouette. Lower right: low rounded loess hills with eroded ochre-gray slopes, dry-brush gullies and sparse scrub, clearly lower and smoother than the rocky ridges.
Palette: restrained charcoal ink #3c4540, pale warm gray, muted sage, very subtle earth ochre. Fine hand-painted rice-paper brush aesthetic, but all EMPTY SPACE must be actual transparent alpha, not painted paper. Soft drybrush feathered bases, clear readable shapes at 64 pixels. No text, no letters, no grid, no dividing lines, no borders, no city, no rivers, no buildings, no characters, no UI, no opaque background, no checkerboard. All artwork must stay inside its own quadrant; center horizontal and vertical seams should be completely transparent. Output 1024x1024 or larger square.
