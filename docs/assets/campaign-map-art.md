# Campaign map ink painting

The earlier campaign background described below was removed on 2026-10-26. This is a historical record; the active map is the China-wide v0.3 painting.

Generated with the built-in imagegen tool on 2026-10-20 for the requested 中式水墨画 visual style.

- Runtime asset: `public/assets/maps/han-realm-ink.webp`, 2000 × 1440, WebP quality 86.
- Layout guide: derived from `src/rendering/mapGeometry.ts` (land outline, river curves, mountain regions).
- Source image: `exec-e54754e5-e3e4-48a9-9469-735720a9d745.png`; local working copy `.artifacts/atlas/ink-source.png`.
- The painted terrain follows the game's schematic atlas, not a georeferenced historical survey. City coordinates, connections, terrain rules, saves and battle balance are unchanged.
- City gatehouses, faction roofs/flags, selection rings, roads, region text and city nameplates are rendered separately. The prior procedural atlas remains the fallback if the painting cannot load.

## City symbol variations

Symbols use native Pixi drawing in `src/rendering/citySymbols.ts`, matching the ink outlines and muted faction colors. These are fixed artistic identities, not live indicators of city wealth or defensive strength.

- Luoyang and Chang'an: largest palace precincts, tiered roofs, side halls and broad walls.
- Ye, Chengdu and Jianye: substantial compounds with side halls.
- Pingyuan and Zitong: modest thatched houses within a low earthen enclosure.
- Tianshui, Hanzhong, Beiping and Jinyang: fortified watchtowers.
- Jiangxia, Jiangling, Chaisang and Wu: gatehouses with a small quay and water strokes.
- Remaining cities: standard walled gatehouses.

Label clearance, selection rings and pointer hit areas account for each symbol's size.

City-symbol follow-up validation: production build and typecheck passed; five browser checks passed (all-city selection with artwork and fallback, on-demand redraw, and large-font English/Chinese views). After tightening label bounds, all-city selection and both language views were rerun successfully. No game-rule or save changes were made.

## Validation

- Typecheck and production build passed.
- All 12 existing readability combinations passed (1366/1920 widths, English/Chinese, compact/comfortable/large), as did the existing on-demand renderer interaction check.
- Both new checks passed: all 24 cities can be selected with the painting loaded and with the image request blocked; presentation changes preserve the campaign save. These were rerun after the final southern-label placement adjustment.
- Production subdirectory smoke check passed, including the ink asset under `/hegemony/`, language switching, persistent saves and reload.
- Final previews: `.artifacts/atlas/campaign-en.png` and `.artifacts/atlas/campaign-zh.png`.
- These checks cover this visual follow-up; the previously committed full v0.2 validation evidence describes its earlier candidate and was not regenerated.

## Final generation prompt

Use case: stylized-concept. Asset type: background for the main map of a Three Kingdoms strategy game.
Input image role: exact layout guide ONLY. Create an exquisite traditional CHINESE INK WASH PAINTING (中式水墨画, 水墨山水) of this map, on warm ivory xuan rice paper. This is ink on paper, NOT a colorful 3D terrain render, not a European fantasy map. Monochrome charcoal and silver-gray ink with very restrained pale celadon in water, immense refinement, flowing brushwork, dry-brush texture, layered diluted ink washes, Chinese mountain texture strokes (皴法), generous breathing space and quiet white valleys. Mountains should have recognizably Chinese landscape painting brush forms, expressive overlapping ridgelines seen from a high bird's-eye map view. Maintain terrain legibility, not an opaque cloudscape.
Strict composition: preserve the reference's EXACT north-up framing, coastline on the narrow right strip, every main river path and mountain belt positions; landscape ratio 25:18, fills all edges without frame or margins. Gray ovals are mountain regions only: replace them with ORGANIC brush-painted ranges and natural foothills, never elliptical patches. Lower left basin, western rugged ranges, central west east-west ridge, northern range, open central/northeastern plains, softer wooded southern hills. Rivers are winding clean ivory negative-space ribbons with delicate light gray/very pale blue-green bank washes along the reference paths. Sea at right is pale misty celadon wash with delicate water brush marks. Small groups of brush-painted pines on slopes, agricultural valleys mostly left quiet.
No lettering whatsoever, no calligraphy, no seals, no compass, no borders, no cities, no roads, no grid, no UI, no flags. Interactive city markers and names are rendered separately. Avoid saturated green/yellow, photoreal textures, sculpted 3D, heavy black areas. Primary palette: warm paper #e9e7d8, ink #3c4540, soft stone gray, muted sage washes. High craftsmanship, historical Chinese ink atlas, detailed but calm so foreground city names remain easy to read. Output around 2000x1440.
