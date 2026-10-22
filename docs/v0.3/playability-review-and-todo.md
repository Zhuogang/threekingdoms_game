# v0.3 playability review and scoped to-do list

Originally reviewed October 21, 2026 against `01e65ef` on branch `v0.3`; proposed tasks were saved in `91c9623`. **RV01–RV10 are now implemented in the local candidate.** The original findings and acceptance cards below remain as the historical baseline; their line references describe the pre-repair source. Current implementation and acceptance evidence are recorded in the completion ledger below.

The follow-up repairs remove the reproduced campaign clock lock and map sizing failures, and expose existing campaign and battle mechanics more clearly. They preserve the core systems and original F01–F08 fixes. Human acceptance remains separate from automated completion.

## RV completion ledger

The work ran in parallel with one App editor: integration agent (`rv_app_integration`), rendering agent (`rv_rendering`), domain/feedback agent (`rv_domain_feedback`), and root integration/QA/docs. Clock and map repairs were implemented first. No new artwork or ImageGen batch was required.

| Task | Implemented result                                                                                                                                                                             | Acceptance evidence                                                                                                                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV01 | Only player-participating battles control tactical tabs, forced navigation and clock blocking; engine authority remains intact.                                                                | Natural Sun/610301/day-40 UI progression in EN/ZH; mixed NPC/player and two-player-battle submission/reload regressions.                                                                                                   |
| RV02 | Primary SVG frames are independently bounded; minimaps retain compact sizing; battlefield observer reattaches after menu/session remount.                                                      | Four maps × three widths × two languages × 1×/2× zoom; all projected corners inside Fit, useful occupancy and ten settled frames ≤1 px drift; atlas minimap ≤240 px/31%. Fresh captures linked below.                      |
| RV03 | In-game Campaign menu, Resume, confirmed replacement with Export; clean successful new/import; invalid imports preserve drafts; distinct save/export feedback and save version classification. | Active/finished menu, same-ID and cross-scenario imports, invalid draft preservation, blocked storage/export/retry/reload; alert and toast do not cover each other at 390 px/200%.                                         |
| RV04 | Complete player-only actionable-first order list and complete pending-report list with true total/due counts; blocked advancement focuses reports.                                             | UI fixture with nine player orders, nine rival orders and twelve reports; every report acknowledged before day advancement in EN/ZH. Existing order-command tests retain accept/reduce/wait/cancel/recall coverage.        |
| RV05 | Shared eligibility exposes incumbent governor transfers and unavailable reasons; accurate appoint/replace/dismiss controls preserve pending null dismissal.                                    | UI troop-free incumbent transfer and pending-dismissal reload; existing boundary, late-arrival, cancellation and work-quota regressions.                                                                                   |
| RV06 | Living units only in map, minimap, roster and selection; retained historical losses stay in state; exact locale troop counts with sized badges.                                                | UI zero-troop exclusion and 500/700 labels; renderer tests for 1/500/700/1,500/100,000; living-selection recovery uses the same survival filter.                                                                           |
| RV07 | Reserve/population, officer attributes, recruit → assign → march help at controls and Wiki; pure shared availability reasons match execution.                                                  | City-action regressions cover either training cap, quota, stocks and commitments; UI recruit result and disabled cap; bilingual Wiki/help. Existing reward/equip/relief browser sequence checks persisted numeric results. |
| RV08 | Bounded routine city/result/rejection and tactical-log translations, including formation names, water suffixes, confusion, rout and initial battle.                                            | Actual domain emitters for all fourteen city actions and six tactics; EN preservation, Chinese names/text and numeric consistency; Chinese roster/browser checks.                                                          |
| RV09 | Battle conditions show weather/forecast, food, movement/range, force/intellect/level and inspected terrain/fire/water effects with Wiki link.                                                  | Shared unchanged rule helpers tested across terrain/weather, six unit types and four water pairings; EN/ZH browser readout and responsive review.                                                                          |
| RV10 | Bilingual whole-battle withdrawal confirmation with Cancel, Escape, focus return and duplicate-submit guard.                                                                                   | EN/ZH cancellation preserves state, F1 cannot stack a competing modal, confirmation concedes once; narrow/200% controls reviewed.                                                                                          |

Current full-suite results and runtime captures are in [the RV validation record](evidence/rv-implementation-2026-10-21/README.md). These repairs do not claim a measured improvement in campaign win rate or completion of player-owned acceptance. Art stays `draft`; four long play sessions, a real low-end-machine check and later art revisions remain open. Push/PR/remote CI remain deferred.

Keep the accepted v0.3 contract: daily time with 30-day months, existing route estimates, governor autonomy and troop-free boundary transfers, 24×20 battles, six tactics, universal water penalties, survivor-count timeout with defender ties, one automatic save, and no siege. Keep the conservative one-front rival policy and the explicitly accepted strategic diagnostic miss. Art remains draft. Broader strategic AI, new victory targets, extra save slots, new units, new economic systems, and geographic reconstruction are outside this patch plan.

## Historical pre-repair validation and evidence

The table below records the original read-only review, before RV implementation. Its passing tests did not cover the reproduced defects. Current results are in the completion record above.

| Check                                              | Fresh result                    | What this establishes                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | 594 passed, 1 skipped; 43 files | Existing unit/integration cases pass. The skipped case remains skipped; this is not complete UI coverage.                                                                  |
| `npm run build`                                    | Pass, including TypeScript      | Production compilation passes. Two Zod comment notices and the existing 644.21 kB JS chunk advisory remain.                                                                |
| `npm run format:check`                             | Pass                            | Repository formatting before the documentation edits; repeated for the final docs.                                                                                         |
| `npm run test:e2e`                                 | 15 passed                       | Existing browser cases, including six tactics, four maps, EN/ZH, 390/1366/1920 px and 200% zoom. They do not assert correct map framing or the newly found recovery paths. |
| `npm run test:production`                          | 1 passed                        | `/hegemony/` assets and save reload.                                                                                                                                       |
| `npm run test:perf:v03`                            | 1 passed                        | Existing 10v10 tactical-day test meets its 50 ms p95 threshold on this host. It does not establish rendering FPS or low-end hardware performance.                          |
| `npm run validate:portraits`                       | Pass                            | 53 named mappings plus garrison, 108 WebP renditions and existing provenance/checksums. Human visual review remains separate.                                              |
| Additional read-only browser reproduction          | Two defects confirmed           | The NPC-only battle clock lock and campaign minimap dimensions below. No tracked reproduction script or new passing test was added.                                        |

The [runtime check](evidence/review-2026-10-21/runtime-check.json) records a 1440×960 isolated Chrome session. With Sun, seed `610301`, scenario `divided-realm-190`, the world reaches day 40 with only Dong's `battle-13` against an independent city. The browser disables all three strategic clock controls, while End battle day returns “This is not the player-controlled side.” The engine's normal advance command succeeds to day 41. This is an interface progression defect; engine authorization should remain intact.

In the same browser check, the campaign map frame was 926×926 CSS px and its minimap was 924×924, although the minimap's intended maximum width is 240 px. The fresh battlefield screenshot also shows excessive blank space above a cropped field. The campaign selector conflict is source-confirmed; the battlefield sizing/ResizeObserver feedback mechanism still needs diagnosis.

These are failure evidence, not approved art references:

- [Campaign layout screenshot](evidence/review-2026-10-21/campaign-layout.png)
- [Battlefield layout screenshot](evidence/review-2026-10-21/battlefield-layout.png)

The 96-month campaign experiments were not repeated because gameplay source and the user's balance disposition have not changed. Their hashes describe their generation snapshots; later diagnostics-tool changes mean they are not fingerprints of today's complete tree. See [campaign evidence](evidence/README.md).

## Recommended order

| ID   | Priority / owner | Small outcome                                                       | Dependency                      |
| ---- | ---------------- | ------------------------------------------------------------------- | ------------------------------- |
| RV01 | P0 · I/B + Q     | NPC battles stop blocking the player's campaign clock               | First                           |
| RV02 | P1 · R + Q       | Main maps fit; minimaps stay compact and stable                     | First; before art review        |
| RV03 | P1 · I + Q       | New/Resume/import work as a coherent campaign lifecycle             | After RV01                      |
| RV04 | P1 · I/V + Q     | Every player order and pending report is discoverable               | After RV01                      |
| RV05 | P1 · V/I + Q     | Existing governor transfers are reachable and correctly labeled     | After RV03                      |
| RV06 | P1 · B/R + Q     | Living, defeated and selected units are represented truthfully      | After RV02                      |
| RV07 | P2 · V/I + Q     | Capital actions explain reserve, stats and availability             | After RV05                      |
| RV08 | P2 · I/B/V + Q   | Routine play stays in the selected language                         | Alongside the final copy review |
| RV09 | P2 · B/I + Q     | Existing battle weather, supply and terrain effects are inspectable | After RV02/RV06                 |
| RV10 | P2 · I/B + Q     | Immediate withdrawal has a brief confirmation                       | After RV01; independent polish  |

P0/P1 tasks form the recommended first patch. P2 tasks are bounded usability work for the same version; they must not become a rules redesign. I is the single editor of shared `App.tsx` sections. Domain/rendering owners can prepare helpers, isolated tests, and review notes in parallel; Q owns regression fixtures and acceptance evidence. Integrate App changes sequentially to avoid overlapping edits.

## RV01 — NPC-only battles must not trap the campaign

**Evidence:** `src/v03/App.tsx:1370` includes every active battle; `1478–1485` auto-opens the first; `2206/2213/2220` disable strategic time for any active battle. `src/v03/engine.ts:1782` and `1813–1817` correctly reject manual actions by nonparticipants. The browser reproduction above confirms the dead end.

**Scope:** distinguish player-participating battles from automatic rival battles for tactical tabs, forced navigation, day submission and clock blocking. Keep the existing engine authority checks and automatic rival resolution. No auto-battle mode or new battle scheduler.

**Acceptance:**

- The Sun/day-40 case advances through the real UI without importing another save or clearing storage; rival battles progress automatically.
- One player battle plus one rival battle waits only for the player's unfinished submission. Two player battles still require both submissions exactly once.
- Save/reload preserves battle cursors. Cover the source case in EN/ZH and retain the engine's nonparticipant-rejection regression.

## RV02 — Stable map frames and compact minimaps

**Evidence:** `.v03-map-frame > svg` in `styles.css:244–246` overrides `.v03-campaign-minimap` at `282–291` through selector specificity. The measured minimap covers almost the whole atlas. Fresh battlefield captures show a cropped field; relevant sizing is in `styles.css:139–147,186–196,700–713`, `App.tsx:1439–1451`, and `BattlefieldMapView.tsx:579–583`.

**Scope:** give the primary SVG and minimap independent sizing; diagnose and bound the battlefield frame/observer interaction. Fix camera integration or CSS as needed without replacing the renderer, projection, terrain, or art. Do not assume the battlefield cause until measured.

**Acceptance:**

- Campaign minimap respects its intended 240 px/31% maximum and stays inside the frame without obscuring most cities.
- After assets/fonts load and repeated resize, dimensions settle rather than continually growing. Sample at least ten successive frames after settling and allow no more than 1 CSS px drift.
- Fit contains all four projected battlefield corners with usable padding; the playable field is visible in the initial viewport. Test all four templates at 390/1366/1920 px, EN/ZH and 200% zoom.
- Add geometry/occupancy assertions alongside existing visibility checks. Review real screenshots before refreshing README images.

## RV03 — Campaign menu, clean imports, honest save feedback

**Evidence:** autosave loads at `App.tsx:1300–1305`; New campaign exists only inside the no-state start screen (`1908,1961`). There is no in-game route back to scenario selection. Successful import (`1563–1575`) leaves campaign-bound drafts such as `orderPreview`, target, troop assignments and reduced-order inputs intact. Export reports the local-save success string at `1555` although it only downloads a file.

**Scope:** add a small campaign-menu flow with Resume and New campaign; deliberately replace the existing single autosave only after confirmation, with Export available first. Reset all campaign-bound transient UI on successful new/import, including view, selection, previews and draft quantities. Give local saving and file export distinct messages. Classify malformed/old/future imports accurately rather than calling every non-v3 object an older save (`platform/storage.ts:892`). Keep one slot and the existing format.

**Acceptance:**

- Reach scenario/faction selection from active and finished games; Cancel/Resume leaves the campaign, date and battle cursor unchanged.
- New campaign explains autosave replacement; export is available. Successful cross-scenario/faction import has no stale preview or assignment, including reused officer/city IDs.
- Failed/oversized/malformed/old/future import preserves the current game and autosave; failed import also preserves the user's current draft.
- A blocked local-storage write shows Retry, keeps play state alive and allows export. Export never claims that failed local storage was saved. Restoring storage and retrying permits correct reload. Verify both languages.

## RV04 — Player orders and report backlogs remain reachable

**Evidence:** `App.tsx:1794–1843` collects all factions' orders; `3494` renders only the last six. Rival directives can displace a player's pending decision and display controls the backend rejects. `worldEvents` at `1789–1793` shows only eight reports, and `3784` reports that capped count rather than the true backlog. Clearing visible reports reveals older ones, but the player cannot see the real outstanding total while time waits on due reports.

**Scope:** make the default order inbox player-owned, prioritize actionable decisions, and provide paging/expansion or bounded scrolling instead of silent truncation. Rival activity may remain informational, with no player command controls. Show the true outstanding/due report count, make all reports discoverable, and point to a report when it blocks advancement. Keep current pause and acknowledgement rules.

**Acceptance:** more than six mixed rival/player orders and more than eight reports do not hide a required player decision. Every accept/reduce/wait/cancel/recall and report acknowledgement is reachable in EN/ZH, including narrow layouts. A dispatched, waiting, or lower-priority order cannot displace an actionable player decision. Cover the backlog and authority cases through the UI.

## RV05 — Expose the governor transfers the engine supports

**Evidence:** `App.tsx:1351` excludes officers governing a different city, while `governance/authority.ts:198–215` and `appointments.ts:108,205` support troop-free incumbent transfers at the boundary. Existing command integration tests already cover the path. At `App.tsx:2902`, an occupied destination labels submission as Dismiss even when a replacement is selected.

**Scope:** derive candidate availability from the shared appointment rules and distinguish appoint, replace and dismiss. Explain why troop-bearing or traveling candidates cannot transfer. Preserve troop-free travel, original-office retention until handover, and boundary-only authority changes.

**Acceptance:** a troop-free incumbent can be selected and transferred between friendly cities through the UI. The source retains its governor until the legal handover; late arrival/replacement/cancellation match existing engine behavior. Replacement and dismissal labels match the submitted action in both languages. No repeated appointment grants extra monthly work.

## RV06 — Trustworthy troop labels and defeated-unit presentation

**Evidence:** `App.tsx:2052` and `2563` render all retained units, including zero-troop units; `2072–2074` checks side without survival. `BattlefieldMapView.tsx:348` floors troop strength in thousands, so a living 500- or 700-soldier unit displays `0`.

**Scope:** separate active units from historical losses in map, minimap, roster and selection. Use a clear small-unit count format consistent with the roster. Preserve historical units in save/battle records; do not change casualties or troop scaling.

**Acceptance:** defeated units cannot be selected or shown ready for orders; selection clears or moves to a living friendly unit when needed. A current selection cannot silently refer to a dead unit after resolution or reload. Counts of 1, 500, 700, 1500 and larger forces read unambiguously; no living unit displays zero. Map/minimap/roster totals agree.

## RV07 — Explain the existing capital economy and action limits

**Evidence:** the city summary at `App.tsx:2804–2837` omits reserve and population. Recruitment adds reserve; assignment consumes it (`governance/city-actions.ts:237–270`). Officer rows hide the loyalty/force/experience affected by their buttons. Training is enabled unless both caps are reached (`App.tsx:3153`), while the command rejects either cap (`city-actions.ts:288`).

**Scope:** show existing reserve/population and relevant officer stats; add a short recruit → assign → march explanation at the controls and in the Wiki. Reuse shared eligibility/reason calculations for existing actions, including work points and committed stock. Preserve every cost, cap, effect and authority rule.

**Acceptance:** recruiting visibly increases reserve, assigning visibly moves reserve into an officer's troops, and the player can see the result of reward/equipment/training. Force-only cap, experience-only cap, no work points, committed resources and insufficient stock produce accurate availability and explanations. Valid actions remain enabled. Check EN/ZH and a normal first-month play sequence.

## RV08 — Complete routine English/Chinese feedback

**Evidence:** `App.tsx:847–883` lacks translations for tactic, initial-battle, rout and confusion messages emitted by `battle/engine.ts:231,780–812,1129,1143`. Routine city results fall through to raw English at `App.tsx:799`; an authority reason is rendered directly at `3212`. The battle help uses raw officer names at `2408`.

**Scope:** finish the bounded set of messages already emitted by current actions/events, common rejections, battle logs and officer labels. Keep technical evidence-grade notes clearly identified. Do not refactor the entire event system or add narrative content.

**Acceptance:** exercise every city action, each tactic's eligible success/failure case, initial battle, confusion, rout/retreat, paused report and governor authority rejection in both locales. Chinese feedback and visible names remain Chinese, English remains English, and numeric values/outcomes agree with the engine. Tests should detect raw known English fallback strings in these Chinese flows.

## RV09 — Inspect existing tactical conditions

**Evidence:** current/next weather and food exist in tactical state; weather changes fire behavior (`battle/engine.ts:223–229,374–379`). The App does not display them, and unit detail shows only troops, morale and status (`App.tsx:2639–2643`). Terrain titles do not explain existing effects.

**Scope:** a compact status/inspection area for current and next weather, supplies, selected unit movement/range and tactic-relevant attributes, plus the selected tile's existing effects and water penalties. Derive values from shared rule helpers. Keep the map readable and all combat rules unchanged.

**Acceptance:** the player can explain an ineligible tactic, the current water modifier, range and supply/weather situation from the battle screen. Displayed values match forecasts and resolution across six unit types and four land/water source-target pairings. The strip fits the established responsive/zoom matrix and links to the matching Wiki topic.

## RV10 — Confirm immediate withdrawal

**Evidence:** `App.tsx:2737–2749` immediately submits retreat, and `battle/engine.ts:829–832` concedes the field. Existing warning text is accurate; adding a cancelable confirmation is optional usability polish rather than a rule defect.

**Scope:** one concise bilingual confirmation stating that the whole battle is conceded. No undo, retreat-path system or additional confirmation on ordinary attacks/moves.

**Acceptance:** Cancel leaves game state identical; Confirm resolves exactly once; keyboard focus and Escape work predictably; the confirmation remains usable on mobile and at 200% zoom.

## Art and human acceptance after the repairs

1. **R/Q:** after RV02/RV06, capture the existing atlas and all four battlefields at Fit and working zoom with real overlays. Current failure screenshots cannot establish art quality.
2. **A/R + player:** collect specific revision notes, then scope at most the assets implicated by those notes. Read the local ImageGen skill and provenance before editing; reference the original asset, preserve ink-wash style, overlay quiet zones, alpha and anchors, inspect runtime size, and update dimensions/hash/prompt/provenance. Keep status `draft` until the player approves the rendered result. No new ImageGen batch is requested by this review.
3. **Q/I:** run the new regression cases plus the existing unit/build/format/browser/production matrix after implementation. Recheck 10v10 performance after any affected rendering/rule integration; do not substitute it for frame-time or low-end measurements.
4. **Player:** retain the four previously requested 12-month/three-manual-battle sessions and a real low-end-machine check as open gates. A short smoke session covering Sun/day-40, new/resume/import, order backlog, governor transfer and a water/tactic battle can catch these repairs early; it supplements the agreed sessions.

RV implementation is complete with automated evidence recorded above. The progression blocker and map framing failures are repaired. Do not describe v0.3 as fully accepted while the player-owned gates remain open.
