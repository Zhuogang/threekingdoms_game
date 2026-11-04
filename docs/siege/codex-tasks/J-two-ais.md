# Codex task J — both AIs and the simulation targets

Planned and validated by Claude; implemented by Codex. The specification is
[`docs/siege/03-chencang-v0.2-plan.md`](../03-chencang-v0.2-plan.md) §6 and §11 row J, on
top of the rules from package I (`src/siege/rules/`). Where this brief and the plan differ,
this brief wins.

## Why

The rules now allow move and counter, but nothing plays it yet. The defender must prepare
visibly and strike the next day. The attacker must read those preparations and answer them,
both as the player's opponent when playing Wei and as the simulation's test player. The
simulation is the only balance evidence we have, so its numbers must be meaningful.

## Constraints

- AI changes state only through `applySiegeAction`. No process-level caches. Deterministic
  for a given state.
- Balance is changed only in `src/siege/rules/tuning.ts`, or in AI decisions. Do not change a
  rule's meaning from plan §5 to hit a number. If a target looks unreachable without doing so,
  stop tuning, and report the conflict with the evidence and your recommendation.
- Do not lower a target or redefine a metric to pass it.
- Do not change `src/siege/ui` or `src/siege/render` beyond what compiling requires. Do not touch
  S8 art paths. No `git commit`.

## Decisions the planner has already made

1. **Who the player faces as Wei.** Export `attackerMethodForSeed(seed)`: an even seeded split
   between `careful` and `anyPrice`, so that Wei games differ and some are genuinely dangerous.
   `brute` is for simulation only.
2. **API.** `runAttackerTurn(state, method)` and `planAttackerTurn(state, method)` in
   `src/siege/ai/attacker.ts`, matching `planDefenderTurn` and `runDefenderTurn`. One full
   simulated day is `runAttackerTurn` → `runDefenderTurn` → `endDay`. `scripts.ts` keeps only
   `brute` (it may be folded into `attacker.ts` if that is simpler), and existing `competent`
   callers become `careful`.
3. **Seeded plans stay.** The variety across seeds comes from the plan's seeded choices (lanes,
   ladder or cart first, ram day, rotation threshold, assault day) and from weather, not from
   random damage (DV7).

## Deliverables

1. **Defender** per plan §6.1: the four steps in `planDefenderTurn`, with its priorities.
   Suppressed units are skipped for anything they may not do. It chooses one night order per the
   §6.1 cascade.
2. **Attacker** per plan §6.2: the three methods, counters to each preparation, the mound plan,
   night orders, and keeping the main body at a safe distance.
3. **`tools/siege-sim.mjs`**: strategies `careful`, `anyPrice`, `brute`; default 200 games per
   strategy. Add each game's first foothold day, first wall day, assault count, night collision
   results and both sides' `score`, all from `state.stats`. Print the §6.3 table with a pass or
   fail mark per row and exit non-zero when a row fails with `--strict`. `--trace <method> <seed>`
   prints one game day by day, including each day's preparations, counters and night orders.
4. **Tests** in `tests/siege/`:
   - The §6.1 invariants: over many seeds, no fire arrows without a usable brazier, no millstone
     unhoisted, no boulders unstacked, never using a preparation made the same day.
   - Attacker counters, each on a built state: a brazier near a raised ladder leads to cover and
     suppress; a hoisted millstone leads to suppressing the tower before ramming or to covering the
     ram; last night's sortie leads to a guard beside exposed engines; last night's torches lead to
     no night assault.
   - Both AIs under 1 second per turn on the worst state you can construct.
   - A full game completes for each method and for at least 20 seeds, without a rejected action.

## The targets (plan §6.3, 200 games each)

| Metric                                                        | Target    |
| ------------------------------------------------------------- | --------- |
| `careful` win rate                                            | 25–40%    |
| `anyPrice` win rate                                           | ≥ 85%     |
| `brute` win rate                                              | ≤ 15%     |
| Games with a foothold ≥ 1 by the end of day 2                 | ≥ 90%     |
| Games with a Shu unit on the wall by the end of day 5         | ≥ 70%     |
| `careful` mean winning day                                    | 8–11      |
| `anyPrice` median total Shu loss when winning                 | 5000–9000 |
| Days with no combat, foothold change or engine loss, per game | ≤ 1.5     |
| Distinct games over 200 seeds (outcome, day, loss)            | ≥ 150     |
| Defender and attacker turn time                               | ≤ 1 s     |
| Defender's 完守 rate against `careful`                        | 20–40%    |

The foothold, wall, idle-day and distinct-game rows apply to `careful` unless you state otherwise.
A "win" for the percentages is `outcome === 'victory'`.

## Checks to run and report

- `node tools/siege-sim.mjs 200 --strict`, with the full table in your report.
- `node tools/siege-sim.mjs --trace careful 228`: the plan's V1 gate says this seed should show a
  foothold on day 2 and someone on the wall by day 5. Include a one-line summary of each day. If it
  misses, say why.
- `npx vitest run tests/siege`, `npx tsc --noEmit -p .`,
  `npx prettier --check src/siege tests/siege tools docs/siege`, `npx vite build`.
- Report every `tuning.ts` value you changed from the plan's draft, old → new, with the reason.
  Interpretations and anything not done.
