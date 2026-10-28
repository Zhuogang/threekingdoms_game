# v0.3 developer guide

Updated October 28, 2026 against the current working tree. [Playability history](playability-implementation.md). [Product overview](README.md) · [Decisions/contracts](00-decisions-and-contracts.md) · [Status](implementation-status.md) · [Maintenance handoff](implementation-plan.md).

## Install and run

Node.js 22.12 or newer is required. From the repository root:

```powershell
npm ci
npm run dev
```

Use the Vite URL, normally `http://127.0.0.1:5173/`; Ctrl+C stops the server. `npm run build` type-checks and builds `dist/`; `npm run preview` serves it locally. `npm run dev -- --port 5173 --strictPort` prevents silently using another occupied port. Browser autosaves are address/profile-specific, so changing the port is not a way to reopen the same save.

## Active source map

```text
src/main.tsx → src/v03/App.tsx → executeV03Command
                                  ↓
                   strategic engine / governance / tactical rules
                                  ↓
                       V03GameState + saved daily cursor
                            ↙                 ↘
                  React/SVG maps       validated v3 envelope
                                             ↓
                               localStorage + JSON export/import
```

| Source                                                                                                                                                     | Owns                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [types.ts](../../src/v03/types.ts), [commands.ts](../../src/v03/commands.ts), [initial-state.ts](../../src/v03/initial-state.ts)                           | New serializable state, command boundary and scenario adaptation.                                                            |
| [engine.ts](../../src/v03/engine.ts)                                                                                                                       | Daily integration, arrivals, food/service ledgers, battle creation/aftermath, monthly settlement and campaign endings.       |
| [calendar/index.ts](../../src/v03/calendar/index.ts), [day-resolution.ts](../../src/v03/calendar/day-resolution.ts)                                        | Date/ETA, route snapshots, supply/food helpers and serializable day scheduling.                                              |
| [geography/index.ts](../../src/v03/geography/index.ts), [illustration.ts](../../src/v03/geography/illustration.ts)                                         | Anchors, route estimates and generalized display geography.                                                                  |
| [governance](../../src/v03/governance/orders.ts)                                                                                                           | Orders/services, authority, appointments, ordinary transfers, shared action effects and ten-day autonomous work.             |
| [strategic-ai.ts](../../src/v03/strategic-ai.ts), [campaign](../../src/v03/campaign/monthly-systems.ts)                                                    | Rival planning, events, coalitions, alliances and Hegemon progress.                                                          |
| [battle](../../src/v03/battle/index.ts)                                                                                                                    | Map generation, movement/ZOC, target queries, forecasts, six tactics, AI, morale/water/outcomes.                             |
| [rendering](../../src/v03/rendering/index.ts)                                                                                                              | React/SVG views, projection, picking, viewport fit/pan/zoom, minimaps, party layers, assets and native fallbacks.            |
| [App.tsx](../../src/v03/App.tsx), [styles.css](../../src/v03/styles.css), [wiki.ts](../../src/v03/wiki.ts), [ui/feedback.ts](../../src/v03/ui/feedback.ts) | Presentation, nine bilingual Wiki topics, action/readout integration, routine/formation localization and transient UI state. |
| [platform/storage.ts](../../src/v03/platform/storage.ts)                                                                                                   | Strict v3 envelope, input/history bounds, associations, localStorage autosave and validated import/export.                   |

Authored [scenario.ts](../../src/v03/content/scenario.ts), `guandu.ts`, traits and identity types now live in `src/v03/content`. The previous engines, UI, Pixi dependency, IndexedDB implementation and legacy tests have been retired; the local `v0.2-final` tag preserves their source. Presentation is split across `ui/screens`, `ui/panels`, `ui/hooks` and `ui/kit`, with typed messages in `i18n`.

## Invariants for changes

- Domain commands own game effects; invalid commands preserve the original state. Camera, locale and help must not consume time or randomness.
- Use shared capability/action/target/forecast helpers. Do not reproduce costs, terrain/water multipliers or authority only in UI.
- Maintain unique officer/formation/journey membership, approved-stock protection, once-only cargo delivery and the serialized day cursor across save/reload.
- Distinguish NPC-only battles, unsubmitted manual fields and already-submitted remaining fields. Do not block a fully submitted day after another field resolves; preserve one shared date advance.
- Work refreshes to two points every ten actual game days, independent of staffing. Keep monthly economy/talent/appointment counters separate; migration or appointments cannot refund used work.
- Group actions and ordinary transfers validate all targets and total committed costs before mutating state. Transfers retain healthy/wounded personnel, XP, type and reorganization; arrival changes stationing without assigning an office.
- Assign one editor per shared App/engine/type/command/storage file in parallel work; domain, rendering and art can use isolated ownership.
- Keep draft art/provenance and source-backed geography limits explicit. Raster changes do not change terrain or ETA.

## Validation commands

| Command                                            | What it checks                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | Active v0.3 unit/integration suite, including the tactical performance budget. |
| `npm run build`                                    | TypeScript and production build.                                               |
| `npm run format:check`                             | Repository formatting.                                                         |
| `npm run test:e2e`                                 | Active v0.3 browser flows and responsive/zoom/layout checks.                   |
| `npm run test:production`                          | Production subpath assets and save reload.                                     |
| `npm run test:perf:v03`                            | Active tactical-day performance.                                               |
| `npm run validate:portraits:v03`                   | Current 98-officer assets/manifests; requires sharp, not human art acceptance. |
| `npm run lint:ui`                                  | Shared controls, tokens, minimum type sizes and UI module length.              |
| `npm run diagnostics:battles -- OUTPUT 200`        | Seeded pacing distributions; add `--baseline` to load the preservation tag.    |

Browser tests use Chrome locally; CI config may use Playwright's bundled browser. Tests start isolated servers. `HEGEMONY_V03_PORT` and `HEGEMONY_PRODUCTION_PORT` select test ports. Do not point tests at a player's live save/profile. Run browser/performance work separately when collecting reliable timing. In restricted Windows sessions, a writable ignored temporary directory may be needed for TEMP/TMP/TMPDIR; the recorded RV run documents this environment adjustment.

The v0.3 portrait validator uses `sharp` (install it in an ignored tool directory or supply `PORTRAIT_SHARP_PATH`); the older portrait command validates retained legacy assets.

The v0.2 performance, production and FPS scripts have been removed. `npm run diagnostics:ai -- --months 96 --output OUTPUT` runs the active `tools/v03-campaign-diagnostics.mjs`. Follow [the evidence protocol](evidence/README.md), write new output to `.artifacts/` or a new named record, and retain source/config fingerprints. Never overwrite historical evidence to make it appear current.

Development builds provide named fixtures from the Campaign menu and a frozen state/command harness at `?debug=1`. Production builds exclude both. Regenerate bundled fonts after changing the catalogs or authored text with `python tools/subset-fonts.py`; install `fonttools` and `brotli` into `.artifacts/fonttools` first. The script caches upstream sources and records compressed sizes and hashes in `public/fonts/manifest.json`.

## Documentation maintenance

Update the player guide/Wiki when controls or rules change, the numbered system reference for technical boundaries, release notes for user-visible changes, and status/evidence for actual validation. Current status and next steps should agree. Preserve dated audit/research/test records in history; do not globally replace historical branch names, counts or hashes.

The [October 28 audit](documentation-audit-2026-10-28.md) records current documentation checks; the [October 22 audit](documentation-audit-2026-10-22.md) preserves the earlier cleanup. The [playability ledger](playability-implementation.md) records current checks and the remaining human gates; [RV validation](evidence/rv-implementation-2026-10-21/README.md) remains historical evidence.
