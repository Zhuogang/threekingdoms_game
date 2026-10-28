# Rendering, map controls and UI

Current reference checked October 28, 2026. [Player controls](player-guide.md) · [Runtime screenshots](evidence/rv-implementation-2026-10-21/README.md#fresh-runtime-captures) · [Original rendering contract](history/design/05-rendering-and-map-ui.md).

## Active renderer

v0.3 uses **React and SVG**, not the old Pixi map. Source lives in [src/v03/rendering](../../src/v03/rendering/index.ts) with application wiring in `App.tsx` and `styles.css`. Pure rule queries supply terrain, selection, reachable cells, targets, forecasts, water status and terrain effects; rendering does not calculate another combat model or advance time.

The battlefield is a pure 2D, top-down board of 64×64 world-unit squares: cell `(x, y)` is centered at `(64x, 64y)`, so a 48×32 battle is a 3072×2048 world. These are world coordinates, not CSS pixels or movement distances. `geometry.ts` and viewport helpers own bounds, picking, camera fit/pan/zoom and viewport polygons. City anchors and party route progression have separate campaign projection helpers.

Each canvas battlefield draws its shipped painting ([records](assets/battlefield-canvases.json), `public/assets/v03/battlefields/`) under a faint grid; until it loads, or without one, five tiled terrain patterns stand in. A battle opens, and Unit focuses, at 48 screen pixels per cell or more; Fit shows the whole field. Each unit token shows the matching ink formation, with the formation's highest-level officer in a separate corner portrait (ties by force, then ID; militia have no portrait), a faction pennant, a troop-type seal, a ×N badge for multi-officer formations, the exact troop count and a strength bar against starting troops. Attackable enemies get a red ring; confused and inspired units an icon; units that have acted are greyed and routed units fade. Below 44 screen pixels per cell squad art remains, while portraits and secondary badges hide. On water the squad is replaced by a tower warship when its portrait commander is Zhou Yu, Cheng Pu, Huang Gai, Han Dang, Gan Ning, Guan Yu, Sun Ce, Lu Su, Lü Meng, Lu Xun, Zhou Tai, Zhu Ran, Xu Sheng or Ding Feng; everyone else, including militia, uses a crewed boat; returning to land restores the base troop art. The sidebar shows squad art alongside the officer portrait. Current surviving strength below 500 uses small squads; 500 or more uses large formations. Both occupy one tactical cell. Vessel choice is independent of troop count. Eligibility is immediate and follows officer identity across factions, with no fee, training order or date unlock. Mixed formations use the same highest-level commander as their portrait, not any subordinate. This stage changes vessel presentation only; water combat modifiers remain unchanged. See [runtime art records](assets/unit-squads-runtime.json). The faint grid can be hidden with the Grid camera button. In `npm run dev`, `?battlefield-preview=<id>` opens a preview page that overlays any painting attempt on its layout with deployment zones and sample units.

## Readable unit icons (October 26)

Land icons now use the ink-04 set: one figure for small squads and three for large squads. Each pair reuses exactly the same normalized single-figure pixels, canvas size and front position; adding people never shrinks them. The low boat and tower warship retain ink-03 art. Heavy infantry, elite cavalry and strong archers retain their Lv.11 threshold; size still changes at 500 troops. The low crewed boat and two-deck tower warship keep their commander-based selection. See the [complete unit inventory, prompts and actual-size comparison](assets/units-count-ink-04.md).

## Battlefield display (October 26)

Battle mode uses the available window width. **Expand battlefield / 放大战场** fills the window and initially hides the command panel, top bar, battle list and help. **Fullscreen / 全屏** requests native fullscreen; embedded browsers that decline it retain window expansion. **Show panels / 显示面板** independently toggles commands, minimap, help, top bar and battle list. The minimap floats over the map with width capped at 30% of the main canvas, and help starts collapsed. Restore layout or Escape exits window expansion and restores prior panel settings; leaving native fullscreen does the same. Confirmation dialogs take precedence, followed by closing the focused menu, canceling inspection/tactics (including sidebar or hidden-command focus), and restoring the layout. Pending fullscreen requests cannot override Restore, navigation or closing the game shell.

When commands are hidden, a compact bar keeps auto-command, End battle day and More actions → Withdraw available. Display changes do not advance the campaign. Camps have been removed from rules, AI goals, map data, map/minimap markers and camera controls. No old-save migration was added. [Implementation and validation](11-battle-display-and-camp-removal.md).

## Current city and action flows

The city overview shows garrison, reserves, food, gold, farming, commerce, population and public order/city loyalty. Public order and city loyalty name the same city value. The responsive stat grid follows the city-window width.

City affairs contains ordinary officer transfers alongside existing work. Transfer, feast, reward and equipment forms use officer checkboxes/select-all and shared domain previews, preserving selection and state until confirmation. Group costs are validated atomically. Ordinary transfers also appear in Marches & orders.

Conquest reports open governance choices; unfinished choices remain in the Inbox. Effective ruler appointments keep the capital label synchronized. Closing a resolved battle report exposes another unfinished battle rather than hiding it behind disabled date controls; a fully submitted shared day offers Advance 1 day.

## Included interface

- Campaign pan/zoom/Fit, route and travel labels, city/governance symbols, journey/status overlays and compact minimap.
- Battlefield Fit/Unit controls, keyboard cell navigation/orders, camera navigation, minimap viewport/pan and native selection/reachability/attack/water overlays.
- Exact locale troop counts, living-only interaction, weather/food/unit/tile inspection, complete player orders/reports and contextual Wiki links.
- Accessible confirmation dialogs with focus/Escape behavior, safe campaign menu/resume, localized officer/formation labels and routine feedback.
- Manifest-backed raster artwork with native rendering fallbacks; hill/cliff/water identity comes from logical terrain, not a painted impression.

The campaign now uses the 3260×2340 China-wide ink canvas and eight small frontal city icon variants (imperial, plains, frontier, loess, basin, mountain, river and Jiangnan). The canvas spans world coordinates `(-1300, -790)` through `(1960, 1550)` at the existing geographic scale. New campaigns start on the original 1600×1000 city region; dragging and zooming explore the larger canvas, while Fit/Home show the whole painting. The minimap uses the same background without stretching its aspect ratio. City anchors, route distances, travel and combat rules are unchanged. Artwork manifests: [background](assets/campaign-china-full-ink-01.json), [city icons](assets/cities-front-ink-01.json).

City overview/detail panels use the eight [regional city paintings](assets/cities-regional-ink-02.json), sharing the city-to-region mapping with map icons. The illustration sits beside the faction/status summary on desktop and above it on narrow screens; resources and actions follow. Failed image loads keep a city-character placeholder and working actions. Obsolete terrain sprite materials and old map/background candidates have been removed.

City overview layout follows its actual container width, including CSS/browser zoom: below 600px the illustration and actions stack; below 400px resources use two columns, with long numbers wrapping inside each cell. Slow or corrupt images keep the same frame; opening the city again retries loading. Unknown city IDs fall back to plains art, including IDs that match Object.prototype names.

RV02 bounded main SVG frames independently from minimaps, corrected intrinsic sizing feedback and reattaches the battlefield resize observer after menu/session remount. RV06 removed false zero labels for small forces and active defeated-unit markers. The final capital helper/reason text spans sidebar columns without stretching adjacent action buttons.

## Evidence and remaining limits

Recorded browser checks cover EN/ZH, 390/1366/1920 effective CSS widths and 200% zoom. All four maps assert projected corner containment at Fit, useful occupancy and ≤1 CSS px drift over ten settled frames; atlas minimap is ≤240 px/31% of frame width. These checks supplement control visibility. They do not prove low-end rendering FPS, every font/accessibility setting or human usability.

Nine [fresh runtime captures](evidence/rv-implementation-2026-10-21/README.md#fresh-runtime-captures) show atlas and each battlefield at Fit/working zoom. Regional screenshots use a controlled Xiapi save with substituted templates; the destination title and regional kicker can differ. No historical-location claim or art approval follows from a screenshot. Real low-end hardware and player visual feedback remain open.
