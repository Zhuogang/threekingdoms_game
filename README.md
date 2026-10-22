# Hegemony of the Three Kingdoms · v0.3

An independent, bilingual Three Kingdoms strategy game built around historically informed travel estimates, autonomous governor-run cities, daily campaign time, and large ink-wash field battles. v0.3 is a new game with its own rules and save format; v0.1/v0.2 saves are not compatible.

**Local candidate · October 21, 2026 · branch `v0.3`.** The original eight audited defects and all ten [follow-up playability tasks](docs/v0.3/playability-review-and-todo.md#rv-completion-ledger) are implemented. The campaign clock handles NPC-only battles, maps fit stable frames, and recovery, orders, governors, troop counts, bilingual help and tactical readouts are clearer. Four player play sessions, a real low-end-machine check and art revision/approval remain open. See the [implementation status](docs/v0.3/implementation-status.md) and [fresh validation](docs/v0.3/evidence/rv-implementation-2026-10-21/README.md). The initial audit and pre-repair layout captures remain historical evidence.

## Run locally

Requires Node.js 22.12 or newer.

1. Run `npm ci`.
2. Run `npm run dev`.
3. Open the local URL printed by Vite, normally `http://127.0.0.1:5173/`.
4. Choose a scenario and house, then begin a campaign.

Use the language toggle and open **Field guide / Wiki** (**游戏指南 / Wiki**) at any time. Autosaves stay in this browser profile; export a v0.3 save to keep a portable backup.

Use **Campaign menu / 战役菜单** to resume or choose a new campaign. Starting over requires confirmation and offers export first. A failed import leaves your campaign and drafts intact; a successful import starts with clean controls. Export downloads a file independently of local saving; if browser storage fails, export remains available and **Retry save / 重试保存** retries the current state.

## Campaign and governance

The world advances by day. Choose one day, ten days, or the next event. A month has 30 days; cities, armies, orders, battles and saves use the same calendar.

The atlas contains 24 cities and 42 configured routes. Route records distinguish straight-line distance from estimated road distance and travel time. Hanzhong–Chang'an is about 225 km straight-line, roughly 425 km by the modeled route and 33 nominal marching days. These are transparent historical-geography estimates, not surveyed Han-era road measurements; see the [geography and routes record](docs/v0.3/01-geography-and-routes.md).

The ruler directly manages the capital. Cities with a formal governor run monthly local administration; the player retains authority over campaign orders and can manually command player battles. A governor order previews the requested amount, available amount, shortfall, route and earliest arrival, then lets the player accept, reduce, wait or cancel. Governor appointments take effect at a month boundary, and a transfer candidate must travel without troops. Multi-city coordination and stochastic future-budget forecasting are outside this candidate's planner.

## Field battles

Field battles use a 24×20 logical grid in a high-angle oblique view. Four regional templates represent the Hanzhong valleys, Shouchun waterways, lower Yi–Shu plains and Chengdu basin. Select a unit, move to a highlighted cell, choose an eligible target or tactic, and end the battle day when ready. The in-game wiki describes all six tactics and their costs and eligibility.

All troop types can enter passable water. Units on water deal 25% less damage and receive 25% more troop damage; units on shore may attack water units within normal range. Normal battles have a 30-day limit and raids 10 days. At the limit, the side with more surviving troops controls the field; ties go to the defender. The game has no siege phase, walls, gates or siege weapons. Regional battle maps are gameplay templates, not historically surveyed terrain.

## Current browser captures

Fresh 1920×1080 captures after the playability repairs show the compact atlas minimap and fitted battlefield. [All four templates at Fit and working zoom](docs/v0.3/evidence/rv-implementation-2026-10-21/README.md) are available for review. Battle captures use a controlled test save with shortened travel and substituted regional terrain; they illustrate rendering, not historical battle locations. Artwork remains draft pending player feedback.

![Current v0.3 campaign atlas and governor controls](docs/images/v03-campaign.png)

![Current v0.3 24×20 battlefield, water terrain, tactics and controls](docs/images/v03-battlefield.png)

## Art and attribution

The campaign map, battlefield textures, ridge props, unit miniatures and transport craft include original ImageGen artwork. Generated assets remain `draft` for revisions as requested. Geographic anchors, routes and playable terrain come from program data; atmospheric artwork does not define exact geography. See the [asset manifest](docs/v0.3/assets/manifest.json), [art provenance and prompts](docs/v0.3/assets/provenance.md) and [rendering contract](docs/v0.3/05-rendering-and-map-ui.md).

BAYE is the project's historical source and code reference: [erduoniba/baye-fmj-app](https://github.com/erduoniba/baye-fmj-app). This game is an independent redesign, not an official BAYE or San10WPK product. The reference source directory is not needed to build or play.

## Saves

The game stores one automatic v0.3 save in local browser storage and supports v0.3 JSON export/import. Older save versions are recognized and rejected without overwriting the current campaign. Browser storage is scoped to the local browser profile and address, so export a backup before clearing site data or moving to another URL.

## Validation

Run these commands from the repository root:

- `npm test -- --maxWorkers=1 --no-file-parallelism` — 668 passed, 1 skipped across 46 files.
- `npx tsc --noEmit` and `npm run build` — type check and production build pass.
- `npm run format:check` — formatting check passes.
- `npm run test:e2e` — 34 Playwright browser tests cover all six tactics, four templates, EN/ZH, 390/1366/1920 px and 200% zoom, plus the RV clock, geometry, recovery, inbox, governor, troop, economy and withdrawal regressions.
- `npm run test:production` — production subpath and save-reload smoke test passes.
- `npm run test:perf:v03` — tactical-day performance test passes.
- `npm run validate:portraits` — 53 named mappings plus garrison and 108 WebP renditions pass validation; the contact sheet still needs human review.

The 24-run, 96-month campaign-bot diagnostic completed without selected-player eliminations, true unifications or Hegemon victories. A matched 48-month second-front trial increased rival campaigns and battles, but reduced average player cities and caused one early elimination, with no new victory outcomes. The user accepted this diagnostic miss for v0.3, and the conservative one-front policy remains. The narrow bot is diagnostic evidence, not a player win-rate target; the four requested play sessions remain open. Raw results and limits are recorded in the [validation evidence](docs/v0.3/evidence/README.md).

The [v0.3 documentation index](docs/v0.3/README.md) contains the design contracts, implementation tracks, art records and acceptance status. The [project documentation index](docs/README.md) identifies v0.3 as the active game and v0.2 records as historical evidence.
