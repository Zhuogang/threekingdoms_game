# Integration, saves and validation

Current reference checked October 28, 2026. [Developer guide](development.md) · [Current status](implementation-status.md) · [Original integration/QA brief](history/design/07-integration-and-validation.md).

## Running implementation

`src/main.tsx` mounts `src/v03/App.tsx`. `executeV03Command` routes requests to the strategic, governance, diplomacy and tactical domains. Authoritative state is serializable `V03GameState`; React/SVG presents it. Authored scenarios/identities are shared with older modules, but the legacy campaign/Pixi application is not the v0.3 runtime.

Daily journeys/accounting, autonomy/appointments, plan previews and answers, six tactics/water, aftermath, monthly events, diplomacy/endings, cameras/minimaps, bilingual Wiki and save recovery are integrated. F01–F08 and RV01–RV10 are completed with regression evidence; they are not open implementation tracks.

## Actual save contract

- Envelope: `format: hegemony.save`, `version: 3`, `ruleset: hegemony-3`.
- Browser key: `hegemony-v0.3:autosave`, one localStorage slot. Earlier IndexedDB guides describe the old game.
- Import checks: 16 MiB byte limit, schema/finite bounds, 48×32 campaign terrain (1,536 cells), cross-entity references, journey/order/officer membership and saved daily cursor.
- Current saves require `personnelSchema: 1` and the current `officerRosterVersion`. Earlier personnel/roster schemas are rejected with raw-export recovery; compatible saves retain work counters and pending decisions. Ordinary transfers use the `transfer` journey kind; group actions pass selected `officerIds` through the command boundary.
- History retention is bounded; active/pending associations remain subject to validation. See `platform/storage.ts` for exact current retention limits.
- Invalid/oversized/malformed/known-old/future saves are rejected without replacing current state or draft controls. A valid import resets campaign-bound transient UI.
- Local saving and file export have distinct results. Failed storage preserves the live in-memory campaign, exposes Retry and permits export. Export is not a claim of successful local persistence.

## Recorded automated checks

The October 28 documentation audit reran the current unit/integration suite: **820 tests passed**. Recent focused browser checks cover group actions, transfer, appointments and multi-battle recovery; they are not a fresh full browser or production-hosting certification. See [current status](implementation-status.md) and [the audit](documentation-audit-2026-10-28.md).

The [October 21 RV record](evidence/rv-implementation-2026-10-21/README.md) records 668 passes/one existing skip across 46 files, 34 browser cases and six final affected-case reruns. Build/typecheck, `/hegemony/` production, 10v10 tactical performance, formatting and portrait validation passed. The October 22 documentation audit does not rerun or redate those gameplay checks.

Current commands are `npm test -- --maxWorkers=1 --no-file-parallelism`, `npm run build`, `npm run format:check`, `npm run test:e2e`, `npm run test:production`, `npm run test:perf:v03` and `npm run validate:portraits:v03`. The [developer guide](development.md#validation-commands) explains environment and legacy script distinctions.

The [campaign evidence](evidence/README.md) retains generation-time fingerprints and rejected tuning trials. The conservative one-front rival policy remains; the player accepted the narrow-bot progression miss. Report true unification separately from Hegemon; unavailable diagnostic counters remain N/A. Do not claim the historical run hashes describe the present tree or rerun them over the old evidence files.

## Still open

Four player sessions (12 months and three manual battles each), a real low-end-machine check, and specific draft-art revision/approval. Geography retains stated research limits. Local CI configuration is not evidence of remote CI: push/PR/remote CI remain deferred. See [next steps](../next-steps.md) for the current action list and [status](implementation-status.md) for the acceptance boundary.
