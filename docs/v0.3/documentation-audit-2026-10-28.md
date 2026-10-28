# Documentation audit · October 28, 2026

Reviewed the root README, documentation indexes, current v0.3 player/developer/system references, release/status/handoff/QA documents, dated plans and archived local links against the current working tree. Source IDs and measurements in historical records remain scoped to their dates. This pass changes documentation and in-game help prose, not gameplay rules.

## Current rules reconciled

- City work: fixed two-point refresh every ten actual game days, no staffing multiplier or accumulation, free assignment/returns/reward/equipment/ordinary relocation, and no work refund through appointments or capital changes. Income and office handovers remain monthly.
- Development: the shared 500 cap, actual capped gains and retained seeded/loaded values replace the obsolete 100-cap limitation. Training checks XP and force independently.
- Selection: feast/reward/fine arms have checkboxes, total cost/effect previews and atomic confirmation; only selected officers benefit. Ordinary transfers have their own entry and carry healthy/wounded contingents, XP, type and reorganization without assigning an office.
- Governance: retained-contingent cross-city appointments, effective ruler/capital synchronization, conquest choices and persistent deferred Inbox tasks.
- Battles and prisoners: movement action menu, unfinished-field navigation and already-submitted shared-day recovery; immediate succession, captured-ruler recruitment loyalty loss and current-ruler faction names. Ordinary relocation pauses remaining reorganization days rather than requiring them to expire before travelling.
- Interface and saves: current city overview metrics, three base troop types with elite presentation, camp removal, personnel/roster save requirements, fixed-port startup and browser-storage ownership.

Authoritative checks used [city actions](../../src/v03/governance/city-actions.ts), [appointments](../../src/v03/governance/appointments.ts), [ordinary transfers](../../src/v03/governance/officer-transfer.ts), [commands](../../src/v03/commands.ts), [engine](../../src/v03/engine.ts), [prisoners](../../src/v03/campaign/prisoners.ts), [storage](../../src/v03/platform/storage.ts), [battle/session UI](../../src/v03/ui/hooks/useGameSession.ts), [Wiki](../../src/v03/wiki.ts) and [package scripts](../../package.json).

## Cleanup

- README is a current launch/feature/recovery entry point; obsolete commit pinning, staffing budgets, troop-free transfers, development warnings and duplicated dated updates were removed.
- The bilingual player guide keeps group actions with city management, separates ordinary relocation from governor handover, and provides a compact English action table. Developer and system references use current sources and scripts.
- Status now leads with current delivery and validation. Earlier stage counts remain dated. Completed development repairs were removed from the open-work table; current acceptance stays in [next steps](../next-steps.md).
- Superseded plans explicitly defer to current rules. Missing retired/optional source references in archives are preserved as historical paths rather than broken file links. Evidence JSON, screenshots and recorded hashes were not rewritten.

## Checks and boundaries

- Fresh current unit/integration run: `npm test -- --maxWorkers=1 --reporter=json --outputFile=.artifacts/docs-maintenance/current-tests.json` — **820 passed, 0 failed**. The ignored report is a local output, not a portable evidence attachment.
- Local reference check: **105 Markdown documents, 1,330 local file/image/heading references, 0 errors**. The initial scan found **51 dead references**, all retired/optional source links in archives; those references were preserved as historical paths. External website availability was not part of this local audit.
- The earlier October 28 implementation checks covered six ordinary-transfer browser cases, two governor-transfer cases and four multi-battle recovery cases across Chinese/English, including narrow layouts and reload. Those were focused runs; this documentation pass does not claim a new full browser/production or hardware run.
- `npm run build`, Prettier checks for all changed Markdown/in-game help, and `git diff --check` passed. Old build sizes, timings, art counts and RV totals in dated evidence are not current-tree measurements.

Long player sessions, actual low-end hardware testing and final artwork approval remain open. Push, PR and remote CI remain deferred. [Current status](implementation-status.md) and [next steps](../next-steps.md) retain those acceptance boundaries.
