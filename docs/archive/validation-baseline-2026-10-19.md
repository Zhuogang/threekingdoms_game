# Pre-improvement v0.1 baseline

> **Archived:** v0.1 measurements taken before its improvements. This file is not updated. See the [documentation index](../README.md).

Captured October 19, 2026 (local date), before application changes for the improvement plan.

| Item                          | Recorded value                                     |
| ----------------------------- | -------------------------------------------------- |
| Branch                        | `hegemony_of_the_three_kindoms_v0.1`               |
| Source commit                 | `dbc9302f1e7b5c9178e0cbd7a5000f1fd01c3aeb`         |
| Initial working tree          | Only `docs/v0.1-improvement-plan.md` was untracked |
| Node                          | `v24.15.0`                                         |
| OS                            | Windows x64, kernel `10.0.26300`                   |
| Chrome                        | `155.0.8059.80`                                    |
| Browser test default viewport | 1280 × 720; production 1440 × 1000                 |

## Commands actually run

| Command                            | Result                                |
| ---------------------------------- | ------------------------------------- |
| `npm run format:check`             | Passed                                |
| `npm test`                         | 121 tests passed across four files    |
| `npm run build`                    | Passed                                |
| Existing development browser suite | 18 tests passed                       |
| `npm run test:production`          | Three tests passed under `/hegemony/` |
| Baseline screenshot capture        | Eight scene captures passed           |

The initial sandboxed unit run could not rename Vitest's temporary compile-cache files (`EPERM`).
The approved unsandboxed rerun passed. This was an execution-environment failure, not a failing
game assertion. The production build emitted the existing dependency annotation and large-chunk
warnings; compilation and bundling succeeded.

The development suite and screenshots ran against a frozen copy of the pre-change source on
port 5190. This allowed implementation work to proceed without contaminating the baseline. The
production suite ran against the pre-change build. The frozen copies, temporary test configuration,
and capture scripts are ignored local artifacts, not release dependencies.

## Retained compatibility fixtures

The six JSON saves under `tests/fixtures/legacy-*.json` were generated and successfully decoded
using the pre-change engine. `legacy-manifest.json` records their exact SHA-256 hashes and source
commit. Formatting was finalized before recording those hashes. Do not regenerate these fixtures
using the improved engine.

- Planning: an ordinary Cao Cao campaign, seed 190.
- Battle: one committed attack against a neutral garrison.
- Queued battle: the first active battle, with a second distinct army waiting in the same month.
- Finished: a valid unified campaign produced through month resolution.
- Dense battle: 17 units, all six troop classes, adjacent opponents, militia, duplicate Cao and
  Xiahou surnames, the Taishi compound surname, moved, acted, confused, and inspired states.
- Multi-battle planning: two issued player orders before End Month, for testing report accumulation
  from its beginning.

The dense fixture uses controlled legal campaign assignments and attributes before ordinary march
and battle creation. Its visual positions and statuses remain within semantic validation. It is a
test scenario, not a claim that these officers serve those factions in the historical scenario.

`legacy-continuations.json` contains hashes of the exact original gameplay results after finishing
the three battle fixtures. The compatibility test compares every original top-level field,
including RNG, resources, officers, orders, logs, counters, and resolution state. Only newly added
metadata fields are excluded from that old/new hash comparison. New-build uninterrupted/reloaded
comparisons include all fields.

## Before screenshots

| Scene                 | 1366 × 768                                       | 1920 × 1080                                      |
| --------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Campaign, English     | [Image](../images/baseline/campaign-1366-en.png) | [Image](../images/baseline/campaign-1920-en.png) |
| Campaign, Chinese     | [Image](../images/baseline/campaign-1366-zh.png) | [Image](../images/baseline/campaign-1920-zh.png) |
| Dense battle, English | [Image](../images/baseline/battle-1366-en.png)   | [Image](../images/baseline/battle-1920-en.png)   |
| Dense battle, Chinese | [Image](../images/baseline/battle-1366-zh.png)   | [Image](../images/baseline/battle-1920-zh.png)   |

No deleted reference files were recreated or required. AI diagnostic comparisons are recorded
with the final policy measurements rather than inferred from these browser captures.
