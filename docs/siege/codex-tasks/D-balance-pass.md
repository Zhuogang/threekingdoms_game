# Codex task D — balance pass against the plan's targets (M5)

Planned and validated by Claude; implemented by Codex. Builds on tasks A–C.
Targets: `docs/siege/02-chencang-mvp-plan.md` §5.3. Current result (50 games
each, `node tools/siege-sim.mjs 50`): competent 100 % wins, always day 19;
brute 100 % wins, always day 14; 0 % of games lose an engine in act 1.

## What the planner found (traces of seed 1)

1. **Brute breaks the gate by hand.** Units attacking a gate deal ×0.1 of a
   full-strength hit, which for 3,000-man units is still ~140 a day; the south
   gate falls on day 11 and 18,000 men walk in. The plan says only rams damage
   gates effectively.
2. **Wei ignore Shu inside the walls.** In the competent game one Shu unit
   climbs on day 15, goes down a ramp and stands in the courtyard on day 19,
   while 1,000 Wei sit on the south wall at morale 95.
3. **Wall archers never reach the trench work.** They stay at x 17, 25, 30;
   carts and ladders work at x 20 and 28 on y 19, which a wall archer (range 3)
   only reaches from the same column. Fire arrows would kill a cart in one shot
   (250 × 0.4 = 100 > 80) but are never in range, so nothing burns in act 1.
4. **Every seed plays the same game**: fixed opening, deterministic combat,
   and a script that makes the same choices; only weather differs.

## Allowed changes

- **Rules (one change):** a unit attacking a gate counts at most **100** troops
  (a gate frontage, like the wall-foot 100), still ×0.1. Update the forecast,
  the plan-referencing comment, and add a test (a 3,000-man unit and a 300-man
  unit deal the same gate damage).
- **Draft numbers you may tune** (only these; list every change with before,
  after and the sim evidence): ram damage per hit (160), fire-arrow coefficient
  (0.4), burning damage per day (20), boulder coefficient (0.25), engine
  durabilities, workshop build days, infantry fill rate (0.5).
- **Defender AI (`src/siege/ai/defender.ts`):**
  - shift wall archers along the walk to stand above the columns where Shu
    engines or fillers work (y 18–19), and fire on them; a raised ladder first;
  - keep the wall cell above each raised ladder and each filled wall foot
    occupied before Shu can step up (fighting then goes through the 150/100
    frontage); refill it when its holder routs;
  - Shu on the wall or inside the city is the top threat after the millstone:
    the nearest units attack it, and as soon as any Shu unit is on the wall or
    inside, at least two Wei units move onto courtyard cells and stay there;
  - keep the ≤ 1 s turn budget.
- **Competent script (`src/siege/ai/scripts.ts`):** vary by seed, using a
  seeded choice that does not consume the state's RNG (e.g. hash of
  `state.seed`): which two to four trench columns to work (from columns not
  blocked by the corner towers or the bridge), the workshop queue order,
  when the ram goes in, and the rotation threshold. It should still play
  like a reasonable player.
- **`tools/siege-sim.mjs`:** add `--trace <strategy> <seed>` printing one line
  per day (day, outcome, south gate durability, Shu and Wei troops, Shu units
  on the wall and inside the city, live engines, full trench cells, each Wei
  unit's troops and morale) for future validation.

Not allowed: other rule changes, edits under `src/v03`, `src/siege/render`,
`src/siege/dev`, `docs/`; `git commit`.

## Acceptance (§5.3, 200 games per strategy: `node tools/siege-sim.mjs 200`)

competent win 55–75 %; brute win ≤ 5 %; competent mean winning day 13–18;
≥ 80 % of games lose at least one engine by the end of act 1; Wei turn p95 ≤ 1 s.
Iterate (change → sim → read traces) up to the targets. If a target cannot be
met within the allowed changes, stop and report which and why, with the closest
result and what further change you would propose — do not change anything
outside the list.

Finish with `npx vitest run tests/siege`, `npx tsc --noEmit -p .`,
`npx prettier --check src/siege tests/siege tools/siege-sim.mjs` passing, and
update tests whose expectations changed with the tuned numbers (say which).

## Report

The 200-game table, every tuned number (before → after, why), the AI
changes, two `--trace` excerpts (one competent win, one brute loss), and any
target not met.
