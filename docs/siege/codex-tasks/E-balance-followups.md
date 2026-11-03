# Codex task E — follow-ups from the planner's review of task D

Planned and validated by Claude; implemented by Codex. The planner reran
`node tools/siege-sim.mjs 200` (results identical to task D's report: competent
59.5 % wins, mean day 15.9, 82 % lose an engine in act 1; brute 0 %), then
traced the outliers. Three problems remain; the targets of task D still apply
and must still hold after the fixes.

## 1. Zhuge Liang's main body fills the trench under the wall (script bug)

All three competent defeats (seeds 20, 44, 50) are the same: on day 7–8 the
script moves `shu-zhugeliang` (1,000 men, whose rout is a defeat) to (22, 18)
and (22, 17) to fill the trench below the gate; Hao Zhao and two units on the
wall grind it to rout by day 10–11. A competent player never does that.
**Fix in `src/siege/ai/scripts.ts`:** the main body never fills, climbs or
attacks, and stays at least 5 cells (Manhattan) from every Wei unit on the
wall and from the wall line y 16 (it may move back if the line moves); it only
gives orders. Add a test: over seeds 1–20 the main body never comes within
4 cells of a Wei unit.

## 2. Engines oscillate and block the workshop exits (script bug)

Seed 20, days 4–11: `workshop-2-ladder-3-1` moves (31,22) → (31,20) → (31,22) →
(31,20)…; carts sit on (16,25) and (18,25) for six days; the ram takes five
days along y 21. **Fix:** engines path toward a fixed target with a route that
does not undo the previous day's move (keep each engine's target in the
script's choice, recomputed only when blocked for two days), units yield the
cells an engine's route needs, and freshly built engines leave the exit cell
the day they appear. Add a test: on seeds 1–10 no engine returns to a cell it
left the day before, and every engine built before day 8 reaches its first
target by day 10.

## 3. Earth carts must fill faster than infantry (design)

Task D set the infantry fill rate equal to a cart load (1), which makes carts
pointless apart from freeing a unit. Restore the plan's intent (§4.6: infantry
fill at half efficiency): **infantry 0.5**; you may raise a cart load to
**1.5** (two loads fill a cell, three loads per cart, so one cart fills
1.5 cells) if the targets need it. Update the plan-referencing comments and
tests.

## Then

Re-run `node tools/siege-sim.mjs 200` and keep the task D targets (competent
55–75 %, brute ≤ 5 %, mean winning day 13–18, ≥ 80 % lose an engine in act 1,
Wei p95 ≤ 1 s), now with **zero competent defeats caused by the main body**.
You may retune only the task D list of draft numbers (ram damage per hit,
fire-arrow coefficient, burning per day, boulder coefficient, engine
durabilities, workshop build days) plus the cart load above. Same constraints
as before (no other rule changes, no edits under `src/v03`, `src/siege/render`,
`src/siege/dev`, `docs/`; no `git commit`), and finish with
`npx vitest run tests/siege`, `npx tsc --noEmit -p .`,
`npx prettier --check src/siege tests/siege tools/siege-sim.mjs`.

## Report

The 200-game table, the winning-day distribution, every number changed
(before → after, why), and the traces for seeds 20 and 44.
