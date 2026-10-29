# ImageGen artwork: integrated drafts and revision workflow

Current reference checked October 28, 2026. [Asset manifest](assets/manifest.json) · [Generation provenance and prompts](assets/provenance.md) · [Original art brief](history/design/06-imagegen-and-artwork.md).

## October 26 one-/three-person revision

Land icons now use one person or three copies of the same single-person sprite at an identical scale. Six single-person sources were edited with built-in image_gen and packaged as twelve fixed-size land icons; ink-03 vessels continue unchanged. [Prompts, sources and actual-size comparison](assets/units-count-ink-04.md).

## October 26 readable unit icons (first iteration)

Fourteen ink-03 unit images replace the dense formation textures with bold three-/five-person symbols and simplified vessels. All were generated individually with built-in image_gen, packaged with native transparency, and inspected at 40/56px. [Inventory, complete prompts, source images and comparison](assets/units-readable-ink-03.md). The ink-02 set remains an inactive archive.

## Current runtime artwork

| Asset class               | Active artwork                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------- |
| Campaign background       | One 3260×2340 China-wide ink painting, shared by map and minimap.                       |
| Campaign city markers     | Eight small frontal city icons.                                                         |
| City detail illustrations | Eight 512×512 regional paintings, using the same city-to-region mapping as map markers. |
| Land units                | Twelve fixed-scale ink-04 one-/three-person icons.                                      |
| Vessels                   | Two ink-03 icons: transport boat and tower warship.                                     |
| Battlefields              | Fifteen painted 48×32 canvases; terrain and movement remain rule data.                  |

City overviews pair an uncropped building silhouette with faction/status information, followed by resources and actions. Narrow screens stack the illustration above the summary. Only transparent safety padding is outside the display frame. Image failure preserves the frame with a city-character fallback, and all actions remain available. Eight regional styles cover all 24 scenario cities; Xiangyang now shares the river style with Jiangling, Jiangxia and Chaisang. Shouchun and Xiapi use the water-city style, without changing their geographic or battle data. [Detail painting provenance](assets/cities-regional-ink-02.json) · [Map-marker provenance](assets/cities-front-ink-01.json).

City overview layout follows its actual container width, including CSS/browser zoom: below 600px the illustration and actions stack; below 400px resources use two columns, with long numbers wrapping inside each cell. Slow or corrupt images keep the same frame; opening the city again retries loading. Unknown city IDs fall back to plains art, including IDs that match Object.prototype names.

Current officer portraits cover 98 identities in 128px and 256px renditions. The active portrait index, fallback behavior and retained variants are described in the [portrait inventory](../assets/v0.3-portraits/asset-inventory.md); historical 53-officer validation totals describe the earlier asset set.

## Retired artwork removed October 26

At the user's request, six unused terrain images and five old campaign backgrounds/candidates were removed from public assets. The six corresponding v0.3 source PNGs and obsolete SVG basemap generator were also removed. Their runtime definitions and legacy manifest entries were deleted; historical prompts and dated test records remain documentation only. The old ink-01 unit records in [manifest.json](assets/manifest.json) are an inactive archive.

The active China-wide painting, city art, battlefield canvases and terrain rules remain in use. Dedicated native terrain overlays continue to show exact gameplay terrain. Technical integration and human style approval remain separate states.

## Next revision steps

1. Collect a specific player issue with map/region, zoom, language, screenshot and desired change. Use the current runtime views rather than a concept image alone.
2. Identify the affected manifest entry and original source; distinguish an artwork issue from a camera, badge or logical-terrain issue. Change only the relevant asset(s).
3. When actually generating/editing, read the available ImageGen skill and existing provenance. Use the original local image as reference; preserve ink-wash palette, overlay quiet zones, foot anchors and existing transparency unless the requested change requires otherwise. Do not introduce siege imagery or painted hidden rules.
4. Inspect source and runtime-sized output; verify dimensions, alpha edges, anchor, compressed file, small-size identity and native fallback. Check it in actual map/battle overlays at Fit and working zoom, both languages and narrow/200% layouts.
5. Update source/output references, prompt intent, dimensions, alpha, bytes/hash, manifest and provenance together. Keep `draft` until the player approves the integrated rendering; record the precise approved scope.
6. Measure runtime download/decode/draw behavior on the actual low-end machine. Do not substitute file decoding or simulated CPU throttling for the requested real-device check.

Do not launch another generation batch just because an old design brief lists variants. Player-directed revisions and any expansion should be scoped first. [Open gates](next-steps.md).
