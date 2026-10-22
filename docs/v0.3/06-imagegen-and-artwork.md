# ImageGen artwork: integrated drafts and revision workflow

Current reference checked October 22, 2026. [Asset manifest](assets/manifest.json) · [Generation provenance and prompts](assets/provenance.md) · [Original art brief](history/design/06-imagegen-and-artwork.md).

## What is integrated

Seven original runtime asset definitions are integrated: ground material, pine ridge prop, infantry, archer, cavalry, transport craft and campaign background. An eighth manifest entry, `campaign-paper-wash-02`, is an **inactive review alternative**, not the active atlas. All eight entries remain `draft`. Technical integration and human approval are separate states.

| Asset class             | Current runtime specification                                          |
| ----------------------- | ---------------------------------------------------------------------- |
| Ground                  | 512×512 opaque material.                                               |
| Ridge                   | 512×512 alpha; normalized anchor (0.5, 0.84).                          |
| Infantry/archer/cavalry | 256×256 alpha; foot anchor (0.5, 0.86).                                |
| Transport craft         | 256×128 alpha; anchor (0.5, 0.60).                                     |
| Campaign backgrounds    | 1000×1000 opaque; one active original, one inactive paper alternative. |

`src/v03/rendering/assets.ts` supplies runtime paths, dimensions, draw sizes, anchors and native fallbacks. The manifest/provenance retains source files, prompt IDs, hashes and validation notes. No artwork was generated, revised or approved in the October 22 documentation pass.

## Coverage and visual limits

Infantry, archers and cavalry have separate figure sprites. Guard, elite and naval retain native identity badges rather than dedicated full figure art. The shared craft indicates water transport; it is not a purchased vessel or special unit ability. Forest/camp/other terrain also use native graphics where the raster set is incomplete. A complete regional texture/prop pack and all six dedicated figure variants are not delivered assets.

Painted river/mountain washes are illustrative; exact city anchors, logical terrain, routes and water penalties belong to data/native overlays. Neither the active background nor the alternate paper proves ancient geographic accuracy.

After RV02/RV06, the [nine runtime captures](evidence/rv-implementation-2026-10-21/README.md#fresh-runtime-captures) establish framing and provide review material. They do not approve style, small-size legibility, every overlapping formation or true low-end performance. Earlier v0.2 portrait/profile approvals do not approve the v0.3 asset set.

## Next revision steps

1. Collect a specific player issue with map/region, zoom, language, screenshot and desired change. Use the current runtime views rather than a concept image alone.
2. Identify the affected manifest entry and original source; distinguish an artwork issue from a camera, badge or logical-terrain issue. Change only the relevant asset(s).
3. When actually generating/editing, read the available ImageGen skill and existing provenance. Use the original local image as reference; preserve ink-wash palette, overlay quiet zones, foot anchors and existing transparency unless the requested change requires otherwise. Do not introduce siege imagery or painted hidden rules.
4. Inspect source and runtime-sized output; verify dimensions, alpha edges, anchor, compressed file, small-size identity and native fallback. Check it in actual map/battle overlays at Fit and working zoom, both languages and narrow/200% layouts.
5. Update source/output references, prompt intent, dimensions, alpha, bytes/hash, manifest and provenance together. Keep `draft` until the player approves the integrated rendering; record the precise approved scope.
6. Measure runtime download/decode/draw behavior on the actual low-end machine. Do not substitute file decoding or simulated CPU throttling for the requested real-device check.

Do not launch another generation batch just because an old design brief lists variants. Player-directed revisions and any expansion should be scoped first. [Open gates](../next-steps.md).
