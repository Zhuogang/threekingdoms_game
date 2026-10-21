# Hegemony of the Three Kingdoms · v0.3

An independent, bilingual Three Kingdoms strategy game with historically informed travel estimates, autonomous governor-run cities, daily campaign time, and large ink-wash field battles.

v0.3 is a new game built on reusable parts of the earlier BAYE remake. It has its own rules and save format; v0.1/v0.2 saves are not compatible.

**Candidate status · October 21, 2026:** the implementation is on the local `v0.3` branch. The full source review found remaining logistics, battle-control, save-validation and UI defects, plus planned features that are still missing. Start with the [implementation audit](docs/v0.3/implementation-audit.md), [current status](docs/v0.3/implementation-status.md) and [prioritized agent plan](docs/v0.3/implementation-plan.md). This is a playable development candidate, not a completed release. All seven generated art assets remain drafts for revisions; player playtests and the low-end-machine check are pending.

## Run locally

Requires Node.js 22.12 or newer.

1. Run npm ci.
2. Run npm run dev.
3. Open the local URL printed by Vite, normally http://127.0.0.1:5173/.
4. Choose a scenario and house, then begin a campaign.

Use the language toggle and open Field guide / Wiki (游戏指南 / Wiki) at any time. Autosaves stay in this browser profile. Export a v0.3 save to keep a portable backup.

## Play

The world advances by day. Choose one day, ten days, or the next event. A month has 30 days; cities, armies, orders, battles, and saves use the same calendar.

The campaign atlas contains 24 cities and 42 configured routes. Route records distinguish straight-line distance from estimated road distance and travel time. For example, Hanzhong–Chang'an is about 225 km straight-line, roughly 425 km by the modeled route, and 33 nominal marching days. These are transparent historical-geography estimates, not surveyed Han-era road measurements; see [the geography record](docs/v0.3/01-geography-and-routes.md).

The ruler's capital currently offers direct farmland and commerce development. Other cities use governor or local-steward authority, monthly passive development, and resource/campaign orders. The order engine supports proposals, reduction and waiting, but the UI does not yet expose the full plan or all choices. A full governor work planner remains to be implemented. Governance changes take effect at a monthly boundary after any required travel. Player armies have manual tactical controls; multi-battle navigation and command ownership need the fixes listed in the audit.

## Field battles

Battles use a 24×20 logical grid shown in a high-angle oblique ink-wash view. The regional templates represent the Hanzhong valleys, Shouchun waterways, lower Yi–Shu plains, and Chengdu basin. Select a unit, move to a highlighted cell, choose an enemy in range, and end the battle day when your side is ready.

Every troop type can enter passable water. While on a water cell, units deal 25% less damage and receive 25% more troop damage; shore units may attack water units within normal range. Normal battles have a 30-day limit, raids 10 days; at the limit, the side with more surviving troops controls the field and ties go to the defender. The current tactical actions are move, attack and wait. Planned tactics, retreat, zone of control and damage forecasts are not yet implemented. The game has no siege phase, walls, gates, or siege weapons.

## Screenshots from the current v0.3 build

These are browser captures of the current candidate. The displayed generated artwork remains draft for revisions; the screenshots do not constitute final art approval or geographic validation.

![v0.3 campaign atlas, city symbols, routes, and governor controls](docs/images/v03-campaign.png)

![v0.3 24×20 river battlefield, unit miniatures, and minimap](docs/images/v03-battlefield.png)

## Art and attribution

The campaign map, ground texture, ridge prop, unit miniatures, and transport craft are original ImageGen artwork for this game. Geographic anchors, routes, and playable terrain remain program data; the campaign background is atmosphere art and does not define exact geography. See the [asset manifest](docs/v0.3/assets/manifest.json), [art provenance and prompts](docs/v0.3/assets/provenance.md), and [rendering contract](docs/v0.3/05-rendering-and-map-ui.md).

BAYE is the project's historical source and code reference: [erduoniba/baye-fmj-app](https://github.com/erduoniba/baye-fmj-app). The current game is an independent redesign, not an official BAYE or San10WPK product. The reference source directory is not needed to build or play.

## Save behavior

The game stores one automatic v0.3 save in local browser storage and supports v0.3 JSON export/import. Older save versions are recognized and rejected without overwriting the current campaign. Browser storage is scoped to the local browser profile and address, so export a backup before clearing site data or moving to another URL.

## Check the project

Run these commands from the repository root:

- npm test — all repository regression tests, including both old rules and the v0.3 implementation.
- npx vitest run tests/v03 — the v0.3 domain tests specifically.
- npm run build — strict TypeScript check and production build.
- npm run test:e2e — v0.3 browser smoke tests against the local development server.
- npm run test:production — subpath hosting/save-reload smoke test against the existing production build; run after the build.
- npm run test:perf:v03 — 30 fixed-seed 10v10 battle-day samples with a p95 target below 50 ms.
- npm run format:check — formatting check.

The v0.3 scope, implementation tracks, contracts, and validation ledger are in [docs/v0.3](docs/v0.3/README.md). The [documentation index](docs/README.md) lists v0.2 records as historical project evidence and identifies v0.3 as the active game.

The audit re-ran 100 v0.3 tests and the whole suite (467 passed, 1 skipped), plus the build. Passing these tests does not cover the confirmed audit defects. The existing CI workflow still references a removed performance script; remote CI, push and PR are not part of this local snapshot.
