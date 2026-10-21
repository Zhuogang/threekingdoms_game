# Ink visual update: pre-commit validation

Validated locally on 2026-10-20 on branch `hegemony_of_the_three_kindoms_v0.2`.

This record covers the combined campaign-map painting, enlarged city architecture variants, regional battlefield art, and infantry/cavalry/archer miniatures. The implementation and this record are saved together in the visual-update commit. The earlier v0.2 balance and release evidence continues to describe its original candidate.

## Results

| Check                     | Result                                                                  |
| ------------------------- | ----------------------------------------------------------------------- |
| `npm test`                | 363 passed, 1 intentional skip; 17 files passed                         |
| `npm run build`           | Passed strict TypeScript checks and production bundling                 |
| `npm run format:check`    | Passed after correcting one comment's indentation in `battleTerrain.ts` |
| `git diff --check`        | Passed                                                                  |
| `npm run test:e2e`        | All 59 passed; 4.2 minutes                                              |
| `npm run test:production` | All 7 passed; 42.2 seconds                                              |
| `npm run test:perf`       | Passed; auto-resolve p50 16.2 ms, p95 19.4 ms, max 21.5 ms              |
| Image decoding            | All 8 new WebP files decoded; all 7 terrain/unit sprites retain alpha   |

The same visual implementation also passed normal and 4× CPU-throttled frame-rate checks immediately before this commit-validation run. Both had 16.7 ms median battle-render intervals, with p95 16.9 / 17.4 ms and zero idle draws. Detailed reports are `.artifacts/perf/fps-baseline-ink-units.json` and `.artifacts/perf/fps-cpu-4x-ink-units.json`; only comment formatting changed afterward.

## Coverage and review

- All 24 city selections with both painted and fallback map backgrounds; pointer picking after pan, zoom, resize and dragging.
- All 12 language/display/viewport readability combinations, keyboard controls and actual 200% Chrome zoom.
- Four regional battlefield profiles, real wall/gate tiles, terrain fallback, all six existing troop types, unit-image fallback and status variants.
- Campaign commands, three-month functional playthroughs in both languages, manual battles, queued legacy battles, imports/exports, save-slot recovery and scenario switching.
- Production deployment beneath `/hegemony/`, asset loading, persisted settings, portraits, battle continuation and WebGL-unavailable fallback.
- Source diff reviewed for presentation-only scope, owned texture disposal, deployment-base-aware URLs and missing-image behavior. No gameplay-rule, RNG, troop-class, dependency or save-schema changes.
- Inspected map, battlefield, troop-legend and compact/comfortable screenshots. New image payload totals 670,904 bytes. Asset provenance and final prompts are recorded in [campaign-map-art.md](campaign-map-art.md), [battlefield-art.md](battlefield-art.md) and [combat-unit-art.md](combat-unit-art.md).

Build output retains the existing nonfatal annotation warnings from Zod. No new runtime errors appeared in the browser checks. Browser evidence is local Chrome on Windows; CPU throttling is not a physical low-end-machine test. Previously deferred human playtests, real-device checks, push, PR and CI remain deferred.
