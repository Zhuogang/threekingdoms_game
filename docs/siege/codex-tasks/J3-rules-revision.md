# Codex task J3 — second rules revision and the balance gate

Planned and validated by Claude; implemented by Codex. J2 moved the structure the right way: footholds, wall entry
and idle days all pass, `brute` fell from 100% to 24%, and the wall now changes hands daily. Read your report at
`.artifacts/siege/J2-report.md`. The planner has diagnosed what is left, and approved the changes below. They are also
recorded in plan §5.11 (`docs/siege/03-chencang-v0.2-plan.md`).

## The diagnosis

- **`careful` only wins on day 12.** Its seeded ram day is 5–9, and the gate needs five hits, so the gate route opens too
  late to matter.
- **`brute` beats `careful`** because infantry alone can fill a whole wall-foot column, which is a route that cannot be
  burned and needs no engines. That removes the reason to build carts.
- **`anyPrice` stops assaulting after about day 3.** Once defenders move off, the cell above is empty, and an empty cell can
  only be climbed at +1, while a defended one assaults at +2. So an empty cell is slower than a defended one, which is
  absurd, and its cost disappears.
- **完守 cannot be reached**: one Shu unit on the wall for one night in twelve days loses it, so it says nothing about how well
  Wei defended.

## Changes (approved; implement exactly)

1. **Assault climb.** `climb` accepts `assault: true`: foothold +2 instead of +1, the same morale cost as an assault (−10, and
   −5 to neighbours if it does not mount), and casualties to the climber of `assaultClimbLoss` × the position's assault
   frontage (start `assaultClimbLoss: 0.25`, so 100 at a ladder and 75 at a wall foot). It counts in `stats.assaults`, sets
   `assaultedDay`, and is forecast like an assault. Normal `climb` stays free at +1. Add a helper so the UI can forecast it.
2. **Infantry fill.** `infantryFill: 0.25` (was 0.5). Carts stay at 1.5 per load, so workshops matter.
3. **Earlier rams.** `careful` and `anyPrice` start ramming earlier: seeded ram day `2 + choice(4)`. `anyPrice` rams whenever
   it can, millstone or not. `careful` still answers a hoisted millstone first, per plan §6.2. Both replace a lost ram when
   they can.
4. **`anyPrice` assaults daily.** From day 2 every unit at a climbing position assaults, defended or not.
5. **Wei's tiers.** Add `stats.wallNights`, the count of nights ending with a Shu unit on the wall. 完守: held, gate never
   broken, `wallNights ≤ 2`. 固守: held, exactly one of those two conditions. 险守: held, neither. Update `score.ts`, its tests, and
   the wall points: `+10` when `wallNights ≤ 2`, in place of "never". Add `stats.wallNights` to save validation.
6. **Score thresholds follow the game.** Set `costlyVictoryLosses` at the midpoint between `careful`'s and `anyPrice`'s median
   winning loss, rounded to the nearest 100, so 攻克 and 惨胜 separate those two ways of winning. Scale `shuCasualtyScale` and
   `orderlyWithdrawalLosses` in proportion from their current ratio to `costlyVictoryLosses`. Report the numbers.

## Targets (plan §6.3 as now revised)

In order of importance:

1. `brute` ≤ 15%, `anyPrice` ≥ 85%, `careful` 25–40%, and **`brute` < `careful`**.
2. Foothold by day 2 ≥ 90%; Shu on the wall by day 5 ≥ 70%.
3. `anyPrice` median winning loss **≥ 3000** (lowered from 5000: Wei has 1,300 men, and the score thresholds now follow what it
   can actually inflict), and at least 1.5× `careful`'s median winning loss.
4. `careful` mean winning day 8–11; idle days ≤ 1.5; distinct games ≥ 150; turn time ≤ 1 s; 完守 against `careful` 10–40%.

Update the targets in `tools/siege-sim.mjs`.

## Tuning authority

As in J2 (`docs/siege/codex-tasks/J2-rules-revision.md`), plus: `assaultClimbLoss` 0.1–0.4; `infantryFill` 0.2–0.5; seeded ram
day range; AI behaviour. Report each change. Re-examine J2's extreme settings, since several were pushed to their limits to
compensate for problems that these changes now address: uphill 0.2, boulder 0.6, assault counters 5 and 4, and fire 0.6 with a
150-durability ladder (one shot kills an uncovered ladder, so report whether that still leaves `careful` a real chance to cover it
first). Prefer moderate values when several candidates pass.

If you cannot pass every row, keep the best candidate, and report the misses. Priorities 1–3 matter most. A near miss in priority 4
is acceptable if you say so. Stop after a reasonable search; the interface work depends on this. Do not redefine metrics or
special-case seeds.

## Checks to run and report

`node tools/siege-sim.mjs 200 --strict` with the table; `--trace careful 228` and `--trace anyPrice 228`, one line per day;
`npx vitest run tests/siege`; `npx tsc --noEmit -p .`; `npx prettier --check src/siege/rules src/siege/ai tests/siege tools/siege-sim.mjs`;
`npx vite build`. Tests for each change above. Every tuning change as old → new with its reason. No `git commit`. Another Codex job is
editing `src/siege/render` and its tests in this checkout: do not touch or stage them. Write your report to `.artifacts/siege/J3-report.md`.
