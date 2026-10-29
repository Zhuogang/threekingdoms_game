# Documentation

Updated October 29, 2026. **v0.4 is the active development target; v0.3 remains the playable baseline.** The [v0.4 implementation plan](implementation.md) is the source of truth for new work. The [v0.4 ticket ledger](v0.4/README.md) records implementation progress and validation; planned behavior is not a release claim.

## Start v0.4 work

Read the [scope](implementation.md#1-direction-for-v04), establish [V04-00 decision fixtures and traces](implementation.md#v04-00--establish-trustworthy-decision-evidence), then follow the [work order](implementation.md#7-handoff-and-completion-checklist). Correct legality, food/calendar forecasts, status lifetime and the dominated governor action before policy tuning or persistent objectives. The plan contains the acceptance checklist and [evaluation/release gates](implementation.md#5-evaluation-protocol-and-release-gates); there is no separate root backlog to keep in sync.

The existing [developer guide](v0.3/development.md) and [system references](v0.3/README.md#system-references) explain the v0.3 code that v0.4 builds on. Their completed tasks and test totals are historical baseline records, not v0.4 completion evidence. Runtime code remains under `src/v03/` until an implementation change requires otherwise.

## Documentation layout

| Location                               | Scope                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [implementation.md](implementation.md) | Canonical v0.4 plan, tickets V04-00–V04-09, work order and release gates; formerly `docs/improvement.md`.                                            |
| [v0.4/](v0.4/README.md)                | Implemented changes, comparative evidence and the [player/hardware validation packet](v0.4/player-validation.md).                                    |
| [v0.3/](v0.3/README.md)                | Existing gameplay/developer references, release notes, plans, remaining acceptance, artwork records and evidence.                                    |
| [archive/](archive/README.md)          | v0.1/v0.2 documents and original design studies. v0.1 diagnostic and display collections now live with that version.                                 |
| [assets/](assets/README.md)            | Shared asset provenance, portrait sources and older visual records. Stable paths are retained because manifests and generation tools reference them. |
| [images/](images/)                     | Shared README screenshots and historical captures; each retains its original version/date.                                                           |

The old root implementation entry and next-steps checklist now live at [v0.3/implementation.md](v0.3/implementation.md) and [v0.3/next-steps.md](v0.3/next-steps.md). Existing v0.3 documents remain together rather than moving a second time into `archive/`. Their dated claims and historical publication deferrals apply to their original snapshots.

Keep new v0.4 planning in the canonical plan and implemented-system references/evidence under [v0.4/](v0.4/README.md); use ignored `.artifacts/` for working output. Keep older evidence, hashes and source records intact. Player sessions, real low-end hardware checks and final art approval remain outstanding; archiving a checklist does not complete it.

## Play the existing game

- [Project README](../README.md): install, launch, gameplay and screenshots.
- [Player guide / 中英玩法指南](v0.3/player-guide.md): campaign, city management, officers, battles, controls and saves.
- [v0.3 release notes](v0.3/release-notes.md) and [implementation status](v0.3/implementation-status.md): delivered scope and recorded validation.
- [Remaining v0.3 acceptance](v0.3/next-steps.md): player/hardware/art checks and the reusable player test record.
- [v0.3 history](v0.3/history/README.md) and [diagnostic evidence](v0.3/evidence/README.md): dated decisions, measurements and limitations.
