# Codex task I — rules v0.2: counters, footholds, two-sided day

Planned and validated by Claude; implemented by Codex. The specification is
[`docs/siege/03-chencang-v0.2-plan.md`](../03-chencang-v0.2-plan.md), especially
§4.3 (order of the day), §5 (rules), §10 (change list) and §11 row I. Read those
first. Where this brief and the plan differ, this brief wins.

## Why

Playtesters found v0.1 slow and hopeless: nothing happens for days, climbing the
wall looks impossible, and once the engines burn there is nothing left to try.
v0.2 is a game of move and counter, in 12 days, playable from either side. This
package is the rules kernel only.

## Constraints

- Rules stay plain JSON and deterministic; no process-level caches; the only
  seeded randomness is weather (DV7).
- Every number in plan §5.10 and §5.3 goes in `src/siege/rules/tuning.ts`, as one
  exported object. `ENGINE_RULES` moves there. No magic numbers in rules code for
  anything in those tables.
- Do not touch `src/v03` and do not change field-battle code.
- Do not touch `tools/build-siege-blockout.mjs`, `docs/siege/chencang/art/`,
  `attempts/`, or `src/siege/render/mapPieces.ts`: another Codex job is working on
  S8 art in this same checkout. Do not revert or stage anything of theirs.
- UI (`src/siege/ui`, `src/siege/render`): only the minimum edits needed to keep
  it compiling and keep a Shu game playable (see deliverable 8). New buttons,
  panels and art are later packages.
- No `git commit`. Do not edit `tests/e2e-siege` (package M updates them).

## Decisions the planner has already made

These settle gaps in the plan. Follow them; do not reopen them.

1. **Archer range to the wall is 3.** The trench is rows y 17–18, so y 19 to the
   wall top (y 16) is exactly 3 under the Manhattan `distance`. Shu ground archers'
   normal attack and suppress on wall targets both use `archerToWallRange: 3`.
   Ground-to-ground archer range stays 2.
2. **"Prepare today, use tomorrow" is enforced by day number.** All three
   preparations require `preparedDay < state.day`. `boulders` is
   `Record<cell, { day: number }>`, not a boolean. Rejections have clear reasons.
3. **`endDay(state)` is the night only**, in the §4.3 order, with no defender
   callback. Export `runDefenderTurn(state)` from `src/siege/ai/defender.ts`. Package
   J adds `runAttackerTurn`. `applySiegeAction({ type: 'endDay' })` runs the night
   only, so whoever drives the game runs the phases first.
4. **Night orders live in `state.nightOrders`**, `{ shu?: {...}, wei?: {...} }`,
   using the same one-order-a-day budget as immediate orders. They are cleared after
   night resolution. The opposing order is not revealed until the night resolves
   (the UI will rely on this), though it is in the JSON state.
5. **`holdFast`**: the order sets `holdFast = { day: state.day + 1, cells }`. The
   night that it is issued must not delete it; the following night does. It reduces
   damage only when `holdFast.day === state.day`.
6. **Statistics live in `state.stats`**, so scoring does not parse the log:
   `shuLost`, `weiLost` (initial troops − current troops, wounded count as lost until
   recovered), `enginesLost`, `assaults`, `nightClashes`, `moundsBuilt`,
   `gateEverBroken`, `wallEverHeldAtNight` (a Shu unit stood on the wall at a day's
   end), `firstFootholdDay`, `firstWallDay`.
7. **"Still able to act" in §5.4** means `activeUnit(source)` after the counterattack
   is settled. A source routed by the counter gains no foothold.
8. **Log codes.** Every new event pushes a `state.log` entry with enough params for a
   later morning report and replay (who, which cell or engine, values before and after).
   Include: prepared brazier, millstone and boulders; brazier doused by snow; suppressed;
   covered; earth piled and mound finished; foothold changed (with reason); wall gained;
   defender displaced; assault; night assault advanced; torches; clash result; sortie
   hit or repelled; engine lost. List the final codes in your report.

## Deliverables

1. `src/siege/rules/tuning.ts` and constants: `SIEGE_VERSION = 'siege_v0.2'`, 12 days,
   Zhang He 14, act 2 on day 4 (early transition unchanged), engine cap 8, §5.3 engine
   table, south gate 600 with the other gates at 400, ram damage 200, night repair +100.
2. `types.ts` and `state.ts`: all new fields from §10.1 and `stats`; starting engines
   from §5.2 (ladders (18,19), (29,19); ram (24,21); earth cart (21,20)), all intact.
3. Footholds (§5.4): gain from each climbing position; full at 3 mounts the wall and
   displaces any defender per §5.4; boulders −2; night clearing; empty wall cells can
   still be walked onto. Export a helper so the UI can read a wall cell's foothold.
4. New Shu actions (§5.6): `suppress`, `coverEngine`, `pileEarth`, and `assault: true`
   on an attack. `predictSiegeAttack` takes `{ assault?: boolean }` and also returns
   `footholdGain`, `footholdAfter`, and whether the attack would mount the wall. Suppressed
   units are blocked from the actions listed in §5.6, and their counterattack is ×0.7.
5. Wei preparations (§5.7): `lightBrazier`, `hoistMillstone`, `stackBoulders`, with
   `fireArrows`, `dropMillstone`, `dropBoulders` changed to depend on them. Remove the
   millstone cooldown and remove fire arrows from ground archers. Snow douses braziers at
   the change of day, and a Shu unit occupying a cell cancels that cell's preparations.
6. Orders and the night (§5.8, §4.3): `nightAssault`, `torches`, `sortie` (with a target
   engine), corrected `holdFast`, clash resolution, then the rest of the §4.3 order.
   `mainBodyThreatened` per §5.9.
7. `src/siege/rules/score.ts` per §5.9: `{ side, tier, score, parts }`, both sides.
8. Keep the game running: `src/siege/save.ts` uses the new key
   `threekingdoms-siege-chencang-v2` with `playerSide`, schema tightened, old key left
   alone. Minimal `scripts.ts` and `defender.ts` adaptation so the simulation still runs
   and the AI uses the new preconditions: at the very least it must prepare before it
   strikes. Package J rewrites both AIs, so do not polish them. `SiegeApp` runs the defender
   turn then `endDay`, so a Shu game still plays.

## Tests to add

New file(s) under `tests/siege/`; update existing tests where v0.2 changes the expected
value, and say in your report which ones and why. Never delete a test merely to make it
pass. Cover at least:

- **Day-one feasibility, from a real `createSiegeState`:** both ladders can be raised
  where they start; a ladder base accepts a unit and attacks the wall cell above; the ram
  reaches (24,18) with a single move; the earth cart reaches y 19 and fills (21,18); a
  deployed archer can reach y 19 and suppress a wall defender 3 away, on day 1.
- No fire arrows without a brazier, no millstone unhoisted, no boulders unstacked; a
  preparation made today cannot be used today but can tomorrow; suppressed units cannot
  prepare or strike.
- Foothold +1, +2 and +3 by position and assault; full at 3 displaces the defender (along
  the wall, and off it when there is nowhere to go, −10 morale) and mounts the attacker with
  `moved` and `acted` true; boulders −2 with a floor of 0; night clearing when the ladder dies
  or the position is empty; no gain when the counter routs the source.
- Assault forecast shows both sets of numbers; morale −10, neighbours −5 only if it did
  not mount; boulders ×2 on a unit that assaulted today.
- Cover: fire ×0.4 and no ignition, millstone 100, sortie 75; towers cannot be covered.
- Mound: progress, built at 6, frontage 300, foothold +2, boulders ×0.5, cannot be sortie
  targeted or burned.
- Night collisions: assault meets torches, assault with no torches, torches with no assault
  (Wei loses morale recovery), sortie hit, sortie repelled by an adjacent unit, sortie meets
  assault. Hold fast takes effect the next day only, then clears.
- Snow douses braziers. Score: all six Shu tiers and all five Wei tiers, and part sums.
- Determinism: the same actions give deep-equal state, and state survives a JSON round trip.

## Checks to run and report

`npx vitest run tests/siege`, `npx tsc --noEmit -p .`,
`npx prettier --check src/siege tests/siege`, `npx vite build`, and
`node tools/siege-sim.mjs 50` must finish without failures (balance targets are package J's
job; just report the numbers). Report interpretations of the plan, anything not done, and
the final list of log codes and tuning keys. Your sandbox cannot start Chromium.
