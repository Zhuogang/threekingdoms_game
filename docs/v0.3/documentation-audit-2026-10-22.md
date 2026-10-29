# v0.3 documentation audit · October 22, 2026

Reviewed the Markdown documentation tree and current implementation entry, command/state/save boundaries, calendar/travel, governance, battle rules, rendering assets/controls, Wiki, package scripts and recorded evidence. Implementation reference: `1e02e65`, now on branch `hegemony_of_the_three_kindoms_v0.3`.

This pass edits Markdown and reorganizes historical Markdown only. It does not alter game code, tests, dependencies, asset files, manifests, evidence JSON, screenshots, hashes or gameplay rules. No new ImageGen run, server launch, campaign experiment, human playtest, hardware result or remote operation is claimed.

## Findings corrected

| Problem                                                                                                    | Result                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current indexes still called the branch `v0.3` and linked to closed findings as active tasks.              | Current entry points identify the actual branch/implementation and separate closed F/RV work from open acceptance. Historical branch names stay in dated records.                  |
| Mixed implementation guide described v0.3 features as absent, then continued into Pixi/IndexedDB gameplay. | New active developer guide; old guide split into the v0.2 archive. `docs/implementation.md` is a navigation page.                                                                  |
| Numbered track briefs mixed proposals, pre-fix defects, completed updates and unchecked targets.           | Concise current system references at their familiar paths; original long briefs retained under `history/design/`, including geography tables/citations and original decisions.     |
| No complete out-of-game onboarding for the new campaign model.                                             | Bilingual player guide explains first month, reserve/whole-officer dispatch, governor authority, equipment, six types/tactics, water, clock pauses, controls, saves and reporting. |
| Feature inventory did not distinguish new v0.3 systems from ported features.                               | Release notes separate daily/governor/travel/field/save redesign from retained scenarios, ink style, tactics, diplomacy and endings. Exclusions/limits remain visible.             |
| Current next steps included a long v0.2 decision log and deferrals.                                        | Active list now contains only current gates/maintenance; prior version's completion/decisions moved to its archive.                                                                |
| Legacy docs and optional reference-checkout links were mixed with active navigation.                       | Versioned archive index, historical-source boundaries, rebased relative links and current documentation index.                                                                     |
| Art integration was easy to confuse with approval or full figure coverage.                                 | Seven active definitions plus one inactive alternative, all draft; three dedicated figure types/native remaining identities, exact revision/approval gates stated.                 |
| Economy guidance suggested farming/commerce development works at the start of either scenario.             | Both scenarios seed every city above the action's current 100 cap. The guide and release notes state the limitation; a bounded rules review is listed in current next steps.       |
| Test counts and old fingerprints could look newly certified.                                               | October 21 gameplay evidence is explicitly dated; October 22 checks cover documentation only. Original artifacts retained.                                                         |

## Where things live

- Player/product: root README, [v0.3 overview](README.md), [player guide](player-guide.md), [release notes](release-notes.md).
- Current engineering: [developer guide](development.md), numbered references, [status](implementation-status.md), [handoff](implementation-plan.md), [current next steps](next-steps.md).
- v0.3 history: [index](history/README.md), original eight briefs, prior P01–P11 plan, initial `33ad2fc` audit and original proposal page.
- Older games: [archive index](../archive/README.md), `archive/v0.1/`, `archive/v0.2/`, `archive/design/`.
- Evidence/provenance: existing JSON/image/source paths preserved; [RV validation](evidence/rv-implementation-2026-10-21/README.md), [campaign diagnostics](evidence/README.md), [asset records](../assets/README.md).

## Documentation verification

Final checks cover repository Markdown local targets/heading anchors, archive navigation, current package-script/source references, manifest/runtime status facts, formatting and whitespace. Optional local BAYE source-checkout references are historical provenance rather than bundled dependencies; external websites are not network-certified by this local audit. Any unavailable historical machine-only artifacts are identified as such rather than treated as current evidence.

| Documentation check  | Result                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation           | 62 Markdown files; 610 local references checked, including 58 Markdown heading anchors; no missing bundled targets or heading anchors. Thirteen optional BAYE-checkout source references remain explicitly historical/unbundled.         |
| Archive preservation | Nineteen old Markdown records relocated; nine original v0.3 design/plan snapshots retained; old implementation/next-step sections split into the v0.2 archive. Research tables, original decisions and dated findings remain accessible. |
| Source-derived facts | Two scenarios, six houses and 24 cities each; 42 routes; 24×20, ten formations per side; six movement budgets/tactic costs and point regeneration/cap match imported domain exports.                                                     |
| Save/economy facts   | Actual autosave key, 16 MiB limit, three-point cap and reward/fine-arms/relief prices match exports; no proposed `formatVersion` substituted for the actual envelope field.                                                              |
| Art facts            | Seven runtime definitions, eight manifest entries including the inactive alternative; all draft. Existing provenance and asset files unchanged.                                                                                          |
| Change boundary      | No source, test, script, package, runtime asset, screenshot, evidence JSON or manifest changes. Gameplay tests were not rerun.                                                                                                           |

The game suite was not rerun because no source/tests/assets/rules changed. Recorded results remain 668 passes/one skip, 34 browser cases plus six affected reruns and the associated build/production/performance/format/portrait checks from October 21. Four player sessions, real low-end-machine testing, draft-art feedback/approval and deferred publication retain their prior dispositions.

Final documentation verification: repository `npm run format:check` and `git diff --check` passed; the local-target/heading audit reported zero bundled-link errors. This documentation pass changes Markdown only.
