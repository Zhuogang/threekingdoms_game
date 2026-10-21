# Baye rebuild milestones

> **Archived:** the original rebuild milestones of October 17, 2026. This file is not updated. See the [documentation index](../README.md).

> **Implementation status — October 17, 2026:** The user requested the full playable game in one implementation pass. An authored Atlas edition now provides the economic, conquest, campaign, battle, scenario, presentation, and save systems described in [the implementation guide](../implementation.md). All 66 core/save tests, five Chrome journeys, and production smoke checks pass; see [validation](validation.md). This does not mark all original milestone gates complete: frozen legacy fidelity, broad browser coverage, and measured release performance remain open.

This roadmap records the original plan to build a polished desktop-browser strategy game in small, playable increments. Each milestone has a demonstration, measurable completion criteria, and a learning goal. Its delivery sequence is historical; its unfulfilled quality gates remain useful follow-up work.

The first two playable slices stay deliberately small. One proves city management and saving; the next proves the campaign-to-battle-to-campaign loop. Broader content follows those working foundations. Visual design starts before implementation and continues throughout.

## Proposed V1 scope

Release one complete historical scenario with ruler selection, campaign management, officers, diplomacy, military orders, tactical battles, baseline AI, victory/defeat, settings, and reliable local saves with import/export. The [baseline](../reference-baseline.md) will turn these categories into an explicit mechanic checklist.

Development begins with a synthetic scenario of three connected cities, two factions, and approximately six officers. These numbers keep fixtures understandable; they are not limits on the engine. The final historical scenario is selected during M0. Existing mod packs do not automatically define V1.

Target desktop/laptop browsers with mouse and keyboard. Initial layout checkpoints are 1280 by 720 and 1920 by 1080 CSS pixels, with zoom and smaller-available-area checks. Confirm these on the development hardware in M0. Chrome/Edge and Firefox are the proposed release browser set; add Safari to the support claim only after testing it on an actual supported environment. WebKit automation alone does not establish Safari hardware coverage.

## Milestone overview

| Milestone | Playable or reviewable result                                             | Depends on                        |
| --------- | ------------------------------------------------------------------------- | --------------------------------- |
| M0        | Rules baseline, V1 checklist, and campaign/battle design studies          | Existing reference review         |
| M1        | One economic action, month progression, styled map/panel, and save/reload | M0                                |
| M2        | One complete conquest through a small tactical battle                     | M1                                |
| M3        | Campaign systems and baseline campaign AI                                 | M2                                |
| M4        | Full agreed battle rules and one complete historical scenario             | M3                                |
| M5        | Cohesive art, interface, audio, accessibility, and playtest revisions     | Starts at M0; final gate after M4 |
| M6        | Browser reliability, measured performance, and release package            | M4 and M5                         |

There are no calendar estimates yet. Estimate a milestone after its preceding slice reveals the actual rule and asset work. Finishing a gate means the demonstrated behavior works, not merely that its files exist.

## M0 Establish rules and visual direction

**Deliver:** a source-backed rule ledger, a frozen baseline manifest, the V1 mechanic checklist, synthetic scenario definitions, and representative campaign/battle screen designs.

Start with the classic entry identified in the reference catalog. Record hashes of selected source/data, engine settings, script hooks, and multipliers. Read the actual data before declaring a particular library file canonical. Classify each rule as verified, uncertain, intentionally changed, or deferred. Define which defects are corrected without disguising them as original behavior.

For the visual studies, show a selected city, officers, resources, a development command, and an understandable result. Show a battlefield selection, movement range, and attack preview. Use realistic Chinese labels and numbers so the layout is tested against actual information density. Choose original or licensed art sources and record provenance.

**Done when:** the first economic action's timing, formula, bounds, resource costs, and officer availability are specified; campaign/battle phases are mapped; every intended V1 rule is inventoried; representative screens work at the target sizes; and the baseline and visual direction are concrete enough to implement.

**Learn:** extracting a specification from code, distinguishing facts from assumptions, and designing an interface around player decisions.

## M1 Build the first economic loop

**Deliver:** the strict TypeScript/Vite foundation, React city management panel, PixiJS campaign map, small validated scenario, seeded RNG, one economic action, minimum monthly progression, and a versioned IndexedDB save with file export/import.

Use the agriculture action as the first source-backed rule. Display its immediate farming gain and costs, mark the officer's availability correctly, and complete the queued work at the specified phase. Other monthly systems can remain explicitly unimplemented in this development slice. A small deterministic opponent may wait or make one supported action.

**Demonstration:** start a game, select a city, develop agriculture, inspect the cost/result, advance a month, save, refresh, reload, and continue.

**Done when:**

- The demonstration works in a real browser, including map picking and keyboard-accessible city selection.
- Invalid commands leave resources, assignments, date, and RNG unchanged.
- The same seed and commands produce the same state; save/reload produces the same continuation.
- Repeated mounting or leaving the map does not duplicate Pixi tickers or listeners.
- The production build serves through a local static server with correct asset paths. A public deployment is not necessary for this gate.
- The screen follows the initial typography, spacing, color, and interaction rules rather than deferring all design work.

**Learn:** type modeling, runtime validation, commands and state ownership, React/Pixi integration, useful tests, and the difference between development and production builds.

## M2 Complete one conquest loop

**Deliver:** one supported army dispatch, a small battlefield with movement and basic attack, a minimal tactical opponent, battle completion, campaign aftermath, and resumption of remaining monthly work.

Use one troop type and a small terrain set initially. Store the campaign continuation and committed troops/resources in state. Battle resolution is computed in the core. Resume the campaign without relying on the lifetime of a screen or animation.

**Demonstration:** prepare an army, attack a neighboring city, play a battle, capture or lose it, return to the campaign, and finish the month.

**Done when:** wins, losses, and legal retreat behavior for the supported slice have explicit outcomes; troops/officers/resources remain consistent; aftermath cannot apply twice; and reloads during battle and before campaign continuation produce the same result as uninterrupted play. Skipping animations changes no rule outcome.

**Learn:** finite state machines, graph/grid rules, resumable workflows, and testing the connection between two game systems.

## M3 Expand the campaign and its AI

**Deliver:** the agreed domestic, officer, diplomacy, logistics, recruitment, and economic systems. Add monthly/annual changes and random events in their baseline order. Replace temporary campaign AI with documented policies.

Implement one family of actions at a time, pairing its rules with interface controls and reference examples. The inventory includes development, governance, search, rewards, equipment/confiscation, trade, officer movement, transport, persuasion and subversion, reconnaissance, recruitment, troop assignment, and army dispatch. The M0 checklist settles exact inclusion and terminology.

**Done when:** every in-scope campaign rule has a source-backed fixture or documented intentional difference; AI actions pass the same legal command path with any baseline exceptions explicit; and seeded multi-month scenarios complete without duplicate assignments, invalid references, impossible resource values, or stuck phases. Each available command explains its costs and reasons for rejection.

**Learn:** growing a model without duplicating business rules, data-driven balancing, explainable AI, and tests for relationships between entities.

## M4 Complete battles and one historical scenario

**Deliver:** the agreed unit classes, terrain effects, movement/range, skills, statuses, weather, provisions, battle-day progression, tactical AI, automatic AI-versus-AI outcomes, and campaign victory/defeat conditions. Integrate one complete historical scenario through the validated content pipeline.

Convert data into the new schema outside the reference folder, with explicit encoding conversion and stable IDs. Begin with small extraction samples before importing a full library. Resolve discrepancies among resource settings, embedded scripts, and C defaults; do not silently combine different variants.

**Done when:** the selected scenario can be started, played through both modes, saved/resumed, and completed; the in-scope rule checklist is covered; boundary cases match the frozen baseline or its documented corrections; and invalid content fails with actionable diagnostics. Runtime comparison against a separately copied reference is useful if that copy can be made runnable. Until then, label source-derived fixtures accurately rather than claiming executable parity.

**Learn:** composing many rules, distinguishing content from code, deterministic debugging, and using an existing implementation as evidence.

## M5 Finish presentation and usability

**Deliver:** consistent map artwork, portraits, fonts, panel styling, feedback animation, audio, settings, and revised player flows. This milestone finishes design work that has been present since M0.

Keep the historical atlas direction only if it remains readable and supports player decisions. Replace development placeholders, optimize assets, and record their sources. Give cities, officers, armies, and factions consistent visual identity. Add motion to explain change and audio to reinforce feedback.

**Done when:** core flows are usable with mouse and keyboard; dialogs restore sensible focus; costs, results, and next actions are understandable in playtests; Chinese text and long labels fit; supported viewport/zoom combinations remain usable; reduced motion and audio controls work; and information is never encoded only through color. A skipped or failed animation cannot prevent game progress.

**Learn:** visual hierarchy, interaction design, accessible controls, asset production, and turning playtest observations into focused revisions.

## M6 Harden and prepare V1 release

**Deliver:** robust autosave/manual slot handling, import/export, save compatibility checks and migration fixtures, error/loading states, browser coverage, performance evidence, and a reproducible static release build.

Test storage denial/quota errors, malformed and unsupported saves, missing assets, background/foreground transitions, resize, repeated screen entry, and WebGL context loss/recovery. Report the last successfully committed save; preserve the active game when saving fails. Serialize save writes and validate imported state before activation.

Select a representative laptop and representative full-scenario map/battle workload during M1-M2. Measure load time, transferred asset size, frame time during pan/zoom, and the longest simulation task. Set explicit performance budgets from that baseline and record them before M4 completes. M6 must meet those budgets; introduce workers or renderer optimizations only for measured problems.

**Done when:** the full player flow passes in the agreed browser set; interrupted/reloaded games recover the last committed snapshot; supported save migrations have fixtures; incompatible input leaves working data intact; critical visual and rule checks pass; and the release assets can be built, served, and rolled back reproducibly. Publication is a separate execution step after the release build is ready; this planning task does not deploy anything.

**Learn:** browser constraints, durability, schema evolution, profiling, and repeatable delivery.

## How to use each milestone as a lesson

Start with one player story and trace its state changes. Explain the new concept, implement the smallest working path, add tests for actual failure boundaries, then demonstrate it. End with a short decision note: what changed, why, what was tested, and what tradeoff remains.

Good early exercises are to predict an agricultural result for fixed random draws, explain why an invalid action cannot charge resources, and describe the saved data needed to resume a battle. Later exercises include adding a new economic rule without editing the renderer and diagnosing a seeded AI failure from a command log.

## Features deliberately deferred

Additional historical scenarios, multiplayer, accounts/cloud saves, Android, native desktop packaging, 3D, procedural campaigns, a general content editor, arbitrary JavaScript mod execution, complete legacy save/mod compatibility, and offline-reopen caching are later projects. They should not hold up the first complete scenario.

The architecture leaves extension points through data definitions, commands, queries, and storage adapters. It does not require implementing a general plugin system before those needs exist.
