# v0.3 design, audit and planning history

Organized October 22, 2026. These records preserve rationale and dated observations. Read [current overview](../README.md), [status](../implementation-status.md), [player guide](../player-guide.md) and [maintenance handoff](../implementation-plan.md) first. Unchecked requirements or defect statements here do not automatically describe the implemented candidate.

| Record                                                         | Historical scope                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [Initial audit](implementation-audit-33ad2fc.md)               | Source-to-plan review of commit `33ad2fc`, before F01–F08 repairs.                                                             |
| [Proposal navigation and decisions](proposal-2026-10-21.md)    | Original October 21 transition from the earlier proposal into v0.3 tracks. Its “planning only” statement refers to that stage. |
| [Prior implementation plan](implementation-plan-2026-10-21.md) | P01–P11 packages, handoffs and earlier acceptance wording before this docs reorganization.                                     |

The [RV review/completion ledger](../playability-review-and-todo.md) stays at its original path because it combines the closed RV01–RV10 acceptance ledger with clearly marked pre-repair findings. [Pre-repair runtime evidence](../evidence/review-2026-10-21/runtime-check.json) and [later passing validation/captures](../evidence/rv-implementation-2026-10-21/README.md) are separate artifacts.

## Original design briefs

These are preserved snapshots of the long multi-stage briefs, including research tables, proposed interfaces, historical audit sections and targets. The current numbered references one directory above state actual behavior; use source/tests/status to judge completion.

- [00 Decisions and contracts](design/00-decisions-and-contracts.md).
- [01 Geography, 24-city/42-link research tables and sources](design/01-geography-and-routes.md).
- [02 Calendar and logistics](design/02-calendar-and-logistics.md).
- [03 Governors and authority](design/03-governors-and-authority.md).
- [04 Battlefields and water](design/04-battlefields-and-water-combat.md).
- [05 Rendering and map UI](design/05-rendering-and-map-ui.md).
- [06 ImageGen and artwork](design/06-imagegen-and-artwork.md).
- [07 Integration and validation](design/07-integration-and-validation.md).

Historical names such as branch `v0.3`, proposed `formatVersion`, old source directories, earlier test counts and “pending” statements are retained for context. The actual branch is now `hegemony_of_the_three_kindoms_v0.3`, envelope field is `version: 3`, runtime is `src/v03`, and current recorded counts are in [status](../implementation-status.md). No old balance or art approval is inherited without its explicit version scope.
