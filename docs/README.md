# Documentation

## Start here

Current game: [v0.3 implementation tracks](v0.3/README.md), local branch `v0.3`. The October 21 audit identifies a playable candidate with remaining correctness defects and planned features, not a finished release. v0.3 excludes siege systems and old-save compatibility; its scope, code evidence and remaining tasks are linked below.

| Document                                                          | What it is for                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [v0.3 implementation status](v0.3/implementation-status.md)       | Current track and E01–E15 status, checks and user decisions                            |
| [v0.3 full implementation audit](v0.3/implementation-audit.md)    | Source-to-plan comparison, confirmed defects and reproducible evidence                 |
| [v0.3 remaining implementation plan](v0.3/implementation-plan.md) | P01–P11, coding-agent ownership, parallel work, acceptance criteria and ImageGen steps |
| [implementation.md](implementation.md)                            | Current v0.3 module tour followed by the historical v0.2 guide                         |
| [next-steps.md](next-steps.md)                                    | The to-do list, open and settled design decisions, and what comes next                 |

Historical v0.2 implementation and evidence (not current v0.3 acceptance):

- [v0.2 improvement plan](v0.2-improvement-plan.md): agent assignments, dependencies, acceptance criteria and Ma Chao's imagegen workflow.
- [v0.2 validation record](v0.2-validation.md): implementation status, automated results and remaining release gates.
- [v0.2 human playtest](v0.2-playtest.md): four-session checklist, findings, visual review and real low-end hardware evidence.

## Historical rules and shared provenance

| Document                                                 | What it is for                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [v0.2-rules.md](v0.2-rules.md)                           | Every rule v0.2 added or changed, with its constants                                                                                      |
| [v0.2-summary.md](v0.2-summary.md)                       | The previous game's implementation and testing summary                                                                                    |
| [v0.2-notes.md](v0.2-notes.md)                           | Deviations from the plan, and the balance evidence with targets                                                                           |
| [implementation.md](implementation.md)                   | How the code fits together: commands, economy, AI, battle formulas, and a source tour                                                     |
| [architecture.md](architecture.md)                       | The original design proposal and its tradeoffs                                                                                            |
| [reference-baseline.md](reference-baseline.md)           | Findings from the original Baye source. Its links point into a local `baye-fmj-app-main` checkout, which the repository does not include. |
| [assets/portrait-credits.md](assets/portrait-credits.md) | Portrait provenance and the officer identity mapping                                                                                      |

## History

Finished plans and records, kept for their reasoning and evidence. They are not updated.

| Document                                                                               | What it records                                                                                          |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [archive/gameplay-improvement-plan.md](archive/gameplay-improvement-plan.md)           | The v0.2 plan: tasks, the §6 balance targets and playtest checklist, the §7 decisions and the §8 backlog |
| [archive/v0.2-review.md](archive/v0.2-review.md)                                       | The v0.2 review: every finding, the fixes, tracks T1–T5, and the R1–R8 task cards                        |
| [archive/v0.1-improvement-plan.md](archive/v0.1-improvement-plan.md)                   | The v0.1 improvement plan                                                                                |
| [archive/v0.1-improvement-acceptance.md](archive/v0.1-improvement-acceptance.md)       | How v0.1 met that plan                                                                                   |
| [archive/validation.md](archive/validation.md)                                         | v0.1 release validation                                                                                  |
| [archive/validation-baseline-2026-10-19.md](archive/validation-baseline-2026-10-19.md) | v0.1 measurements before its improvements                                                                |
| [archive/validation-browser-2026-10-19.md](archive/validation-browser-2026-10-19.md)   | v0.1 browser evidence                                                                                    |
| [archive/ai-balance.md](archive/ai-balance.md)                                         | v0.1 rival-policy measurements                                                                           |
| [archive/roadmap.md](archive/roadmap.md)                                               | The original rebuild milestones                                                                          |

## Data

- `ai-diagnostics/` and `validation-evidence/` hold the v0.1 measurement files that the archived records cite.
- `images/` holds the screenshots and portrait sheet used by the README and those records.
- New diagnostics are written to `.artifacts/`, which Git ignores. The reproducible v0.3 audit script and selected output are preserved in [v0.3/evidence](v0.3/evidence/reproductions.json).
