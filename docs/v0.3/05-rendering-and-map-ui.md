# Rendering, map controls and UI

Current reference checked October 25, 2026. [Player controls](player-guide.md) · [Runtime screenshots](evidence/rv-implementation-2026-10-21/README.md#fresh-runtime-captures) · [Original rendering contract](history/design/05-rendering-and-map-ui.md).

## Active renderer

v0.3 uses **React and SVG**, not the old Pixi map. Source lives in [src/v03/rendering](../../src/v03/rendering/index.ts) with application wiring in `App.tsx` and `styles.css`. Pure rule queries supply terrain, selection, reachable cells, targets, forecasts, water status and objectives; rendering does not calculate another combat model or advance time.

The battlefield is a pure 2D, top-down board of 64×64 world-unit squares: cell `(x, y)` is centered at `(64x, 64y)`, so a 48×32 battle is a 3072×2048 world. These are world coordinates, not CSS pixels or movement distances. `geometry.ts` and viewport helpers own bounds, picking, camera fit/pan/zoom and viewport polygons. City anchors and party route progression have separate campaign projection helpers.

Each canvas battlefield draws its shipped painting ([records](assets/battlefield-canvases.json), `public/assets/v03/battlefields/`) under a faint grid; until it loads, or without one, five tiled terrain patterns stand in. A battle opens, and Unit focuses, at 48 screen pixels per cell or more; Fit shows the whole field. Each unit token shows the new small ink squad, with the formation's highest-level officer in a separate corner portrait (ties by force, then ID; militia have no portrait), a faction pennant, a troop-type seal, a ×N badge for multi-officer formations, the exact troop count and a strength bar against starting troops. Attackable enemies get a red ring; confused and inspired units an icon; units that have acted are greyed and routed units fade. Below 44 screen pixels per cell squad art remains, while portraits and secondary badges hide. On water the squad is replaced by a crewed boat; returning to land restores the base troop art. The sidebar shows squad art alongside the officer portrait. All troop counts use small squads in this stage. See [runtime art records](assets/unit-squads-runtime.json). The faint grid can be hidden with the Grid camera button. In `npm run dev`, `?battlefield-preview=<id>` opens a preview page that overlays any painting attempt on its layout with deployment zones and sample units.

## Included interface

- Campaign pan/zoom/Fit, route and travel labels, city/governance symbols, journey/status overlays and compact minimap.
- Battlefield Fit/Unit/Camps controls, keyboard cell navigation/orders, camera navigation, minimap viewport/pan and native selection/reachability/attack/water overlays.
- Exact locale troop counts, living-only interaction, weather/food/unit/tile inspection, complete player orders/reports and contextual Wiki links.
- Accessible confirmation dialogs with focus/Escape behavior, safe campaign menu/resume, localized officer/formation labels and routine feedback.
- Manifest-backed raster artwork with native rendering fallbacks; hill/cliff/water identity comes from logical terrain, not a painted impression.

The campaign now uses the 3260×2340 China-wide ink canvas and eight small frontal city icon variants (imperial, plains, frontier, loess, basin, mountain, river and Jiangnan). The canvas spans world coordinates `(-1300, -790)` through `(1960, 1550)` at the existing geographic scale. New campaigns start on the original 1600×1000 city region; dragging and zooming explore the larger canvas, while Fit/Home show the whole painting. The minimap uses the same background without stretching its aspect ratio. City anchors, route distances, travel and combat rules are unchanged. Artwork manifests: [background](assets/campaign-china-full-ink-01.json), [city icons](assets/cities-front-ink-01.json).

RV02 bounded main SVG frames independently from minimaps, corrected intrinsic sizing feedback and reattaches the battlefield resize observer after menu/session remount. RV06 removed false zero labels for small forces and active defeated-unit markers. The final capital helper/reason text spans sidebar columns without stretching adjacent action buttons.

## Evidence and remaining limits

Recorded browser checks cover EN/ZH, 390/1366/1920 effective CSS widths and 200% zoom. All four maps assert projected corner containment at Fit, useful occupancy and ≤1 CSS px drift over ten settled frames; atlas minimap is ≤240 px/31% of frame width. These checks supplement control visibility. They do not prove low-end rendering FPS, every font/accessibility setting or human usability.

Nine [fresh runtime captures](evidence/rv-implementation-2026-10-21/README.md#fresh-runtime-captures) show atlas and each battlefield at Fit/working zoom. Regional screenshots use a controlled Xiapi save with substituted templates; the destination title and regional kicker can differ. No historical-location claim or art approval follows from a screenshot. Real low-end hardware and player visual feedback remain open.
