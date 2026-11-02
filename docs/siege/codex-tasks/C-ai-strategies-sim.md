# Codex task C — Wei defence AI, scripted Shu strategies, simulation (M3 part 3 / M5 start)

Planned and validated by Claude; implemented by Codex. Builds on tasks A and B
(`src/siege/rules/*`). Read `docs/siege/02-chencang-mvp-plan.md` §5 and §10 (M3
gate: scripted games run from day 1 to an ending without errors).

## Hard constraints

As before: no edits under `src/v03`, `src/siege/render`, `src/siege/dev`,
`docs/`; rules files may only change to fix a bug you find (say so in the
report, with a test); pure and deterministic (the AI must not use
`Math.random` — use the state's RNG through the rules' helpers, or none);
no `git commit`; finish with `npx vitest run tests/siege`,
`npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tools/siege-sim.mjs`.

## `src/siege/ai/defender.ts` — Wei defence AI (§5.1)

`planDefenderTurn(state) → SiegeAction[]` and `runDefenderTurn(state) → state`
(applies them with `applySiegeAction`, skipping any the rules reject). It is the
`defenderTurn` passed to `endDay`. Score candidate actions per unit and take the
best, with this priority (the plan's list):

1. a ram on a gate approach → millstone;
2. engines in range → fire arrows, raised ladders first, then towers, carts;
3. threatened wall cells (raised ladder, filled wall foot, Shu on the wall) →
   move the nearest free units there; Shu on the wall → counterattack;
   boulders on the climbers below;
4. wounded units (below half their opening troops or wavering) leave the
   pressed section and fresh ones take their place;
5. act 2 → units not on a threatened section build the inner wall, the
   segment facing the most gaps first;
6. gate broken or inner wall lost → fall back on the courtyard and hold;
7. sorties are rare: only against a ram or earth cart alone at the bridge
   head with no Shu unit within 2 cells.
   Use Hao Zhao's daily order: `nightRepair` when a gate is below half,
   `holdFast` on the most pressed run, else `rally` the lowest-morale unit.
   Turn time must stay under 1 s on this machine (plan §5.3).

## `src/siege/ai/scripts.ts` — Shu scripted strategies (§5.2, for simulation only)

`runShuScript(state, strategy: 'competent' | 'brute') → state` plays one Shu day
and calls `endDay` with the defender AI.

- **competent**: keep both workshops busy (earth carts and ladders first, then
  a ram; towers in act 2); push carts to the outer trench row and fill at two
  or more columns at once (outer row first); raise ladders where the wall is
  thin; bring the ram to the south gate along the road and bridge; archers
  shoot the wall cells over the climbing points; climb with fresh units and
  `rotate` the most wounded; Zhuge Liang's orders: `supervise` while engines
  are queued, otherwise `rally`. Once inside, march on the courtyard.
- **brute**: no engines; every unit marches to the south gate and bridge head,
  attacks the gate and anything in reach.

## `tools/siege-sim.mjs` (§5.3)

Loads the TypeScript through Vite's `ssrLoadModule` exactly like
`tools/v04-campaign-calibration.mjs`. `node tools/siege-sim.mjs [games=200]
[out=.artifacts/siege/sim.json]` plays N seeds per strategy (seeds 1..N) to an
outcome (cap at day 21) and writes and prints: win/historical/defeat rates per
strategy, mean and distribution of the winning day, per-engine-kind built /
destroyed / survival, the share of games where Shu lost at least one engine by
the end of act 1, the p50/p95/max Wei turn time, and any game that threw (seed
and error). Exit code 1 if any game threw.

## Tests (`tests/siege/`)

- The defender plans a millstone against a ram on the south approach; fires
  on a raised ladder before a cart; sends a unit to a wall cell above a raised
  ladder; uses `nightRepair` on a gate under half; builds the inner wall in act
  2; plans in under 1 s from a crowded mid-siege state.
- Each strategy plays seeds 1–5 to an outcome within 21 days without throwing,
  deterministically (the same seed twice → identical final states).
- `brute` never builds an engine.

## Report

Include the sim output for 50 games per strategy (`node tools/siege-sim.mjs 50`).
Do not tune rule numbers to hit the §5.3 targets in this task — the planner
will look at the results first.
