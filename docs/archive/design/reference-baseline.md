# Baye reference baseline

> Historical source references: retired files and the optional BAYE checkout are recorded as paths below, not links to files shipped in the current tree. See the [current documentation index](../../README.md) for active source references.

> **Historical record, reorganized October 22, 2026.** Rules, results, approvals and pending statements below belong to the original version/date. See the [current v0.3 overview](../../v0.3/README.md) for the running game. Original body retained; local links rebased.

The reference defines evidence for game behavior. The rebuild preserves the core rules while allowing a new interface, clearer state ownership, and explicitly recorded corrections. A baseline must identify a particular combination of source, content, settings, and scripts; the repository contains multiple variants.

This initial record distinguishes inspected behavior from decisions still to be made. It is not a completed rule specification or a claim of runtime parity.

## Reference handling

`baye-fmj-app-main/` stays read-only. Do not install dependencies, run formatters, generate assets, or build inside it. Even an out-of-tree CMake build can write `baye/version.h` into its source directory: see `baye-fmj-app-main/Baye/baye_c/src/CMakeLists.txt`, around line 87.

If executable comparison becomes useful, prepare a separate working copy and keep generated files there. Extraction tools must accept a read-only source path and a distinct output path. The new game must build and run with the reference folder absent.

## Confirmed behavior

| System                 | Inspected evidence                                                                      | Consequence for the rebuild                                                             |
| ---------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Campaign phases        | `GameDevDrv`, `baye-fmj-app-main/Baye/baye_c/src/tactic.c`, around line 703             | Player decisions precede AI decisions, order resolution, and environment updates        |
| Calendar               | `ConditionUpdate`, `baye-fmj-app-main/Baye/baye_c/src/tactic.c`, around line 675        | Month rollover and annual updates must have explicit ordering                           |
| Economic action timing | `AssartMake`, `baye-fmj-app-main/Baye/baye_c/src/citycmdb.c`, around line 370           | Farming gain and money/stamina costs occur when issuing the action; work is also queued |
| Officer return         | `AssartDrv`, `baye-fmj-app-main/Baye/baye_c/src/citycmd.c`, around line 81              | Later order execution restores the officer to the city                                  |
| Battle progression     | `GamFight`, `baye-fmj-app-main/Baye/baye_c/src/Fight.c`, around line 78                 | Daily updates, player actions, AI actions, and provisions form distinct stages          |
| Battle variants        | `FgtInit`, `baye-fmj-app-main/Baye/baye_c/src/Fight.c`, around line 123                 | Automatic resolution and interactive combat are separate paths                          |
| Rule switches          | `baye-fmj-app-main/Baye/baye_c/src/baye/attribute.h`, around line 181                   | Overflow fixes, AI policies, age growth, and other settings may change behavior         |
| Browser scripts        | `script_init`, `baye-fmj-app-main/Baye/baye_c/src/platform/js/script.c`, around line 18 | Embedded JavaScript can change rules beyond C defaults                                  |
| Old saves              | `GamSaveRcd`, `baye-fmj-app-main/Baye/baye_c/src/gamEng.c`, around line 934             | Raw struct serialization is a legacy format, not the new save schema                    |

As a first formula example, the inspected agricultural calculation uses integer `IQ / 10`, a random value from 2 through 5, and `IQ >> 1`, then applies an agriculture multiplier and a cap. Multipliers and C integer-width behavior require explicit baseline choices. A correct translation must preserve operation order rather than replacing the expression with a superficially similar floating-point calculation.

## Baseline selection at M0

The library catalog (`baye-fmj-app-main/Baye/baye_offline/libs.json`) labels its first entry as the classic version and points to `dat-v2-mod.lib` with `dat-mod.lib` as another path. These are baseline candidates, not yet a verified declaration that either contains unmodified original behavior.

Record:

- Source and selected data-file hashes, plus relevant script resources.
- Scenario identity and initial city/officer/faction data.
- Effective engine flags, multipliers, and AI policy settings.
- Formula order, integer rounding, caps, action timing, and random-draw semantics.
- Victory/defeat checks, calendar events, and campaign/battle phase ordering.
- Any difference introduced intentionally, with its reason and an example.

Choose a documented baseline before scaling content conversion. Keep the small synthetic development scenario separately identified; it is a teaching/testing fixture rather than a claim of historical completeness.

## Rule ledger format

For each mechanic, record `rule ID`, source file/function, relevant data/settings, preconditions, immediate effects, delayed effects, random inputs, expected examples, and status. Use four status values: verified, uncertain, intentionally changed, or deferred. A source-backed example may be verified by inspection while executable comparison is still pending; record that distinction.

For example, `campaign.develop_agriculture` should include ownership, available officer, money, stamina, farming cap, and order capacity; it should distinguish the immediate gain/cost from later officer return. Invalid-action behavior must be atomic in the rebuild. If the reference leaves partial effects on a failure path, record the correction explicitly.

Proposed fidelity policy: preserve meaningful costs, timing, probabilities, progression, and AI choices; correct unintended corruption/overflow through named decisions and tests. Rebalancing and additional mechanics are separate changes so their effects remain understandable.

## Reuse and evidence limits

The core license file (`baye-fmj-app-main/Baye/baye_c/LICENSE`) contains MIT terms, the web package license file (`baye-fmj-app-main/Baye/baye_offline/LICENSE`) contains GPL version 2 text, and some original source headers carry older copyright notices. Record provenance and review applicable terms before copying code or distributing inherited assets. A top-level notice alone does not resolve every component's provenance.

Some documented build/runtime pieces are absent from this checkout, including the web package's referenced `scripts/build.js` and some input scripts. The baseline therefore begins with source inspection and independently calculated examples. Any later runtime comparison should record the exact working copy and configuration used.
