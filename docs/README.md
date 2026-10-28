# Documentation

Updated October 28, 2026 against the current working tree. **v0.3 is the active game.** This pass updates documentation; dated implementation/evidence records retain their original source IDs and measurements.

## For players

| Read                                                | Purpose                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Project README](../README.md)                      | Install, launch, version identity, features and screenshots.                            |
| [v0.3 overview](v0.3/README.md)                     | Scope and navigation in Chinese/English.                                                |
| [Player guide / 中英玩法指南](v0.3/player-guide.md) | First campaign, governors, economy, weapons, units, tactics, water, controls and saves. |
| [v0.3 release notes](v0.3/release-notes.md)         | New systems, inherited features, completed repairs and exclusions.                      |
| [Current status](v0.3/implementation-status.md)     | Implemented work, recorded tests and remaining human gates.                             |
| [Next steps](next-steps.md)                         | Only current-version open work and how to report playtests.                             |

## For contributors

Start with the [developer guide](v0.3/development.md), then the [decisions/contracts](v0.3/00-decisions-and-contracts.md) and relevant [system reference](v0.3/README.md#system-references). Current maintenance handoff is in the [implementation plan](v0.3/implementation-plan.md). The [RV completion ledger](v0.3/playability-review-and-todo.md#rv-completion-ledger) retains task acceptance history.

## Evidence, art and history

- [Current implementation and validation](v0.3/implementation-status.md): latest recorded scope and checks. [RV screenshots and checks](v0.3/evidence/rv-implementation-2026-10-21/README.md) describe the October 21 candidate.
- [Campaign diagnostic evidence](v0.3/evidence/README.md): generation-time fingerprints, rejected balance trials and the accepted diagnostic miss.
- [Art status and revision workflow](v0.3/06-imagegen-and-artwork.md), [manifest](v0.3/assets/manifest.json), [provenance](v0.3/assets/provenance.md): integrated draft assets and review boundaries.
- [Shared/legacy asset records](assets/README.md): portrait provenance and older visual work, with their version scope.
- [v0.3 history](v0.3/history/README.md): initial audit, original design briefs and superseded planning snapshots. Findings there are dated observations, not automatically current defects.
- [v0.1/v0.2 archive](archive/README.md): previous rules, implementation guides, tests, plans and version-specific deferrals.
- [October 28 documentation audit](v0.3/documentation-audit-2026-10-28.md): current rules, cleanup and link checks. The [October 22 audit](v0.3/documentation-audit-2026-10-22.md) retains the earlier reorganization.

Historical evidence JSON, screenshots, hashes and prompt/source records are retained in place. `ai-diagnostics/` and `validation-evidence/` are old measurement collections; v0.3 evidence lives under `v0.3/evidence/`. New working output normally belongs in ignored `.artifacts/`.
