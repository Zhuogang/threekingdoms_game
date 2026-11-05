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

| ID   | Title                                    | Effort | Status                                   | Commit               | Evidence                                    | Notes                                                                                                                                   |
| ---- | ---------------------------------------- | ------ | ---------------------------------------- | -------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | `balance/` module                        | M      | done                                     | `028df88`, `999997b` |                                             | Pacing and 12-month campaign identical; tables rebound locally for speed                                                                |
| F-02 | Unit table                               | S      | done                                     | `7b20ce8`            |                                             | Pacing and campaign identical; charge, brace and archer melee values ready for B-03                                                     |
| F-03 | City data table                          | S      | done, owner review open                  | `552562d`            | owner review of the 24 records              | 24 records by census tier; no existing test needed changes                                                                              |
| F-04 | Save version 4                           | S      | done                                     | `c30e418`            |                                             | Version-3 saves rejected                                                                                                                |
| F-05 | Pacing harness v2 and baselines          | M      | done                                     | `2525586`, `393d908` | `evidence/battle-pacing-00-baseline-*.json` | 8v8: median 14 days, rout 27%, attacker wins 45%, Rally 69%, 182 distinct outcomes per map; `--compact` for committed evidence          |
| F-06 | Wall-clock probe and v0.4 baseline       | M      | v0.4 baseline done                       | `f5536fa`            | `evidence/battle-wallclock-v04.json`        | v0.4 flow: 287 clicks, 23.9 per day, 12 days; v0.5 flow comes with P-01                                                                 |
| O-01 | Leadership and politics data             | M      | done, owner review of the 98 values open | `decfb98`, `a9a76cf` | owner approval of the stat table            | Values in `content/officer-stats.ts`; five adjusted by the tech lead (Sima Yi 94; Zhao Yun 85, Wei Yan 86, Xu Huang 87, Xiahou Yuan 86) |
| O-02 | Leadership in battle and camp (soft cap) | M      | done                                     | `0809ead`            |                                             | Rosters without leadership keep the old rules, so pacing is unchanged                                                                   |
| O-03 | Politics in the city                     | S      | done                                     | `2005434`            |                                             | Merged with L-01                                                                                                                        |
| B-01 | Standing orders                          | L      | done                                     | `b2050e6`            | `evidence/battle-pacing-01-orders.json`     | Orders off: pacing identical. 8v8 with orders: 13 days (14), rout 29.5% (26.8%), Rally 65% (69%); only skirmish fires in the harness    |
| B-02 | Facing                                   | M      | not started                              |                      | `evidence/battle-pacing-02-facing.json`     |                                                                                                                                         |
| B-03 | Charge, brace, archer melee              | S      | not started                              |                      | `evidence/battle-pacing-03-charge.json`     |                                                                                                                                         |
| B-04 | Baggage train                            | M      | not started                              |                      | `evidence/battle-pacing-04-baggage.json`    |                                                                                                                                         |
| B-05 | Army morale, break, pursuit              | M      | not started                              |                      | `evidence/battle-pacing-05-break.json`      |                                                                                                                                         |
| B-06 | Commander cards and signs                | L      | not started                              |                      | `evidence/battle-pacing-06-cards.json`      |                                                                                                                                         |
| B-07 | Duels                                    | M      | not started                              |                      |                                             |                                                                                                                                         |
| B-08 | Deployment arrangements                  | M      | not started                              |                      |                                             |                                                                                                                                         |
| B-09 | Battle tiers and quick resolve           | S      | not started                              |                      |                                             |                                                                                                                                         |
| P-01 | Day flow UI                              | L      | not started                              |                      | `evidence/battle-wallclock-v05.json`        |                                                                                                                                         |
| P-02 | Playback v2                              | L      | not started                              |                      | screenshots; owner check                    | needs art A-01, A-05 approved                                                                                                           |
| P-03 | Duel scene                               | M      | not started                              |                      |                                             | needs art A-06                                                                                                                          |
| P-04 | Officer lines                            | M      | content done, owner review open          | `572171a`            | owner review of the lines                   | Rendering comes with P-02 and P-03                                                                                                      |
| P-05 | Highlights                               | S      | not started                              |                      |                                             |                                                                                                                                         |
| P-06 | Historical units of measure              | M      | done, owner review of unit names open    | `4337bdd`            | owner review of the unit names              | Engine-authored English reasons still say gold/food; listed in the commit                                                               |
| L-01 | Per-city caps                            | S      | done                                     | `2005434`            |                                             | Merged with O-03                                                                                                                        |
| L-02 | Population growth                        | S      | done                                     | `ecdbe17`            |                                             | Growth 0.3% / 0.1% / 0 by loyalty; famine −0.5%                                                                                         |
| L-03 | Curves output and baseline               | M      | baseline done                            | `ecdbe17`            | `evidence/curves-00-baseline.json`          | 60 months (120 too slow); leading house 9–10 cities at month 48–60 in 190                                                               |
| L-04 | Tuning pass                              | M      | not started                              |                      | `evidence/curves-NN-*.json`                 |                                                                                                                                         |

## Art

| ID   | Group                      | Count | Priority | Status    | Needed by  |
| ---- | -------------------------- | ----- | -------- | --------- | ---------- |
| A-01 | Facing views               | 12    | P0       | postponed | P-02       |
| A-02 | Action poses               | 6     | P1       | postponed | P-02       |
| A-03 | Baggage train              | 4     | P0 / P1  | postponed | B-04, P-02 |
| A-04 | Fleeing poses              | 3     | P1       | postponed | P-02       |
| A-05 | Effects                    | 9     | P0 / P1  | postponed | P-02       |
| A-06 | Duel scene                 | 5     | P1       | postponed | P-03       |
| A-07 | Card and arrangement seals | 12    | P1       | postponed | P-01       |
| A-08 | Paper texture              | 1     | P2       | postponed | P-01       |
| A-09 | Banner scroll              | 1     | P2       | postponed | P-05       |

## Validation baseline (November 5, 2026, `2bb3b77`)

Recorded in the cloud container (Intel Xeon 2.1 GHz, 4 cores, Node 22.23) before any v0.5 code change:

| Check                                               | Result                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                          | 1,082 of 1,085 pass; the 3 failures are the performance gate only                                                   |
| Performance gate, 10v10 48×32 engaged / congested   | p95 76.7 ms / 69.2 ms against the 50 ms target; this machine is slower than the ARM container where the gate passed |
| `npm run build`, `npm run lint:ui`                  | pass                                                                                                                |
| `npm run format:check`                              | source passes; 40 older files under `docs/assets` and `docs/v0.3` fail and are left alone                           |
| `tools/battle-pacing.mjs` (20 per map, canvas only) | median contact day 2, length 11, timeouts 3.3%, Rally 58%                                                           |

Until the gate is re-run on the owner's hardware, battle tickets are held to a relative gate: the performance test's p95 must stay within 15% of the numbers above on this machine. Refactor tickets (F-01, F-02) must leave `tools/battle-pacing.mjs` and a 12-month `tools/v03-campaign-diagnostics.mjs` run identical apart from timestamps and hashes.

Art is postponed, not dropped. Code that will show new art keeps the existing sprites and glyph fallbacks, so each image can be dropped in later.

## Owner checkpoints

1. F-03 city table (24 rows) before merge.
2. O-01 leadership and politics table (98 rows) before O-02 uses it.
3. P-04 officer lines before P-02 shows them.
4. P-06 unit names before the strings replace "gold" and "food".
5. Art approvals per item in `docs/v0.5/art/manifest.json`.
6. Four play sessions at the end of Phase 4, with the debrief questions from plan section 7.
