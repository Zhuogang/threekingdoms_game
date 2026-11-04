# v0.5 ledger

Active branch: `v0.5`, from `v0.4` at `b543ee7`. The [plan](plan.md) sets the scope, the [implementation briefs](tickets.md) define each ticket, and the [art requests](art-requests.md) list every image the owner generates. The [brainstorm](brainstorm.md) records the survey and the owner's decisions of November 4, 2026.

Nothing below is implemented yet. A row changes to **done** only with the commit hash, the evidence file where the brief asks for one, and the test command that passed.

## Phase order

| Phase | Tickets                                       | Can run in parallel with                                                                    |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 0     | F-01, F-02, F-03, F-04, F-05, F-06            | —                                                                                           |
| 1     | O-01, O-02, O-03                              | Phase 2 (different modules, except `types.ts` and `storage.ts` edits, which are serialized) |
| 2     | B-01 → B-05 in order                          | Phase 1, Phase 5                                                                            |
| 3     | B-06, B-07, B-08, B-09, P-01                  | P-04, P-06                                                                                  |
| 4     | P-02, P-03, P-05                              | Phase 5                                                                                     |
| 5     | L-01, L-02, L-03, L-04                        | Phases 2–4                                                                                  |
| 6     | Owner sessions, wiki and guide, release notes | —                                                                                           |

## Tickets

| ID   | Title                                    | Effort | Status      | Commit | Evidence                                    | Notes                         |
| ---- | ---------------------------------------- | ------ | ----------- | ------ | ------------------------------------------- | ----------------------------- |
| F-01 | `balance/` module                        | M      | not started |        |                                             |                               |
| F-02 | Unit table                               | S      | not started |        |                                             |                               |
| F-03 | City data table                          | S      | not started |        | owner review of the 24 records              |                               |
| F-04 | Save version 4                           | S      | not started |        |                                             |                               |
| F-05 | Pacing harness v2 and baselines          | M      | not started |        | `evidence/battle-pacing-00-baseline-*.json` |                               |
| F-06 | Wall-clock probe and v0.4 baseline       | M      | not started |        | `evidence/battle-wallclock-v04.json`        |                               |
| O-01 | Leadership and politics data             | M      | not started |        | owner approval of the stat table            |                               |
| O-02 | Leadership in battle and camp (soft cap) | M      | not started |        |                                             |                               |
| O-03 | Politics in the city                     | S      | not started |        |                                             |                               |
| B-01 | Standing orders                          | L      | not started |        | `evidence/battle-pacing-01-orders.json`     |                               |
| B-02 | Facing                                   | M      | not started |        | `evidence/battle-pacing-02-facing.json`     |                               |
| B-03 | Charge, brace, archer melee              | S      | not started |        | `evidence/battle-pacing-03-charge.json`     |                               |
| B-04 | Baggage train                            | M      | not started |        | `evidence/battle-pacing-04-baggage.json`    |                               |
| B-05 | Army morale, break, pursuit              | M      | not started |        | `evidence/battle-pacing-05-break.json`      |                               |
| B-06 | Commander cards and signs                | L      | not started |        | `evidence/battle-pacing-06-cards.json`      |                               |
| B-07 | Duels                                    | M      | not started |        |                                             |                               |
| B-08 | Deployment arrangements                  | M      | not started |        |                                             |                               |
| B-09 | Battle tiers and quick resolve           | S      | not started |        |                                             |                               |
| P-01 | Day flow UI                              | L      | not started |        | `evidence/battle-wallclock-v05.json`        |                               |
| P-02 | Playback v2                              | L      | not started |        | screenshots; owner check                    | needs art A-01, A-05 approved |
| P-03 | Duel scene                               | M      | not started |        |                                             | needs art A-06                |
| P-04 | Officer lines                            | M      | not started |        | owner review of the lines                   |                               |
| P-05 | Highlights                               | S      | not started |        |                                             |                               |
| P-06 | Historical units of measure              | M      | not started |        | owner review of the unit names              |                               |
| L-01 | Per-city caps                            | S      | not started |        |                                             |                               |
| L-02 | Population growth                        | S      | not started |        |                                             |                               |
| L-03 | Curves output and baseline               | M      | not started |        | `evidence/curves-00-baseline.json`          |                               |
| L-04 | Tuning pass                              | M      | not started |        | `evidence/curves-NN-*.json`                 |                               |

## Art

| ID   | Group                      | Count | Priority | Status    | Needed by  |
| ---- | -------------------------- | ----- | -------- | --------- | ---------- |
| A-01 | Facing views               | 12    | P0       | requested | P-02       |
| A-02 | Action poses               | 6     | P1       | requested | P-02       |
| A-03 | Baggage train              | 4     | P0 / P1  | requested | B-04, P-02 |
| A-04 | Fleeing poses              | 3     | P1       | requested | P-02       |
| A-05 | Effects                    | 9     | P0 / P1  | requested | P-02       |
| A-06 | Duel scene                 | 5     | P1       | requested | P-03       |
| A-07 | Card and arrangement seals | 12    | P1       | requested | P-01       |
| A-08 | Paper texture              | 1     | P2       | requested | P-01       |
| A-09 | Banner scroll              | 1     | P2       | requested | P-05       |

## Owner checkpoints

1. F-03 city table (24 rows) before merge.
2. O-01 leadership and politics table (98 rows) before O-02 uses it.
3. P-04 officer lines before P-02 shows them.
4. P-06 unit names before the strings replace "gold" and "food".
5. Art approvals per item in `docs/v0.5/art/manifest.json`.
6. Four play sessions at the end of Phase 4, with the debrief questions from plan section 7.
