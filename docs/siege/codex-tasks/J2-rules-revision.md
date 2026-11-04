# Codex task J2 — rules revision and the balance gate

Planned and validated by Claude; implemented by Codex. You stopped task J correctly: its balance
gate cannot be met by tuning alone. The planner has diagnosed why and approved the rule changes
below; they are in plan §5.11, `docs/siege/03-chencang-v0.2-plan.md`, and §5.3, §5.4, §5.6, §5.9 and
§5.10 were updated to match. Read §5.11 first, and `.artifacts/siege/J-two-ais-report.md` for your own
findings.

## The diagnosis

Over 200 `brute` games: first wall entry is always day 3–4, Wei loses a median of 1150 of its 1300, and
it wins 100%. Everyone walks onto empty wall cells, then fights at full strength on a one-cell walkway,
while archers shoot the wall with no risk and a ram breaks the gate in three hits. Defended climbs are
rarely forced, so Shu's losses are trivial and assault is almost never used.

## Rule changes (approved; implement exactly)

1. **Climb.** New action `{ type: 'climb', unitId }`. A Shu ground unit at a ladder base or wall foot, with
   an empty wall cell directly above (or at the ladder's top), gains +1 foothold on that cell, with no
   combat, and is `acted`. At 3 it mounts, by the same path as an attack that fills the bar. It cannot be an
   assault. Remove the direct step from a ladder base or wall foot onto the wall in `movement.ts`. Stepping
   up from a **finished mound** onto an empty wall cell stays allowed. Ramps and broken gates are unchanged.
2. **Walkway frontage.** Any attack with both units at wall level counts at most `wallFrontage: 200` troops,
   on both sides. For a unit standing at wall level, morale shock is computed against
   `min(troops, wallFrontage)` rather than its full strength.
3. **Thrown off the wall.** A Shu unit at wall level whose morale falls below `ROUTED_MORALE` is not routed.
   It returns to the climbing position below its cell if free, else the nearest free ground cell south of the
   trench. Its morale becomes `ROUTED_MORALE`, `moved` and `acted` are true, the cell's foothold becomes 0, and
   a `thrownOffWall` entry is logged. Shu units that come down this way remain usable.
4. **Volleys.** `archerToWallRange: 2`. New `suppressRange: 3` for suppress only. `suppressionDamageMultiplier:
0.25`. Task I's day-one suppression still works at distance 3. Normal attacks need a filled trench.
5. **Attacking uphill.** New `climbingAttackMultiplier: 0.35` on every attack launched from a climbing
   position, including assaults and mounds. Add it to `SiegeDamageModifiers`, and show it in the forecast's
   data. Towers do not get it. It does not change foothold gains or the counterattack.
6. **Gate.** `southGateDurability: 800`, `ramDamage: 160`.
7. **Courtyard.** Victory by courtyard requires a Shu unit in the courtyard and no active Wei unit there.
8. **Attrition.** `weiNightRecovery: 0.25`: each night every Wei unit with `troops > 0` recovers that share of
   its wounded (floored), logged. New `cityFrontage: 400` for ground combat with both units inside
   `CITY_BOUNDS`; gate frontage takes precedence where it already applies.
9. **`anyPrice`.** From day 2, it assaults whenever a defender stands over a climbing position, keeps as many
   climbing positions in use as it can, and rotates wounded units out and fresh ones in. It still counters
   preparations, but cost does not stop it. `careful` never assaults: it climbs when the cell is empty and
   attacks normally when defended. `brute` stays as specified. Keep the seeded plans.

## Tuning authority

You may now change any value in `tuning.ts` to meet the targets, without asking, inside these bounds. Report
each change. Outside these bounds, or for any change to rule meaning beyond the above, stop and report.

| Value                                     | Allowed            |
| ----------------------------------------- | ------------------ |
| `climbingAttackMultiplier`                | 0.2–0.6            |
| `wallFrontage` / `cityFrontage`           | 100–300 / 300–600  |
| `boulderCoefficient`                      | 0.2–0.6            |
| Assault counter (ladder, foot / mound)    | 2–5 / 1.5–4        |
| Assault frontages                         | ±25%               |
| Fire arrow coefficient, engine durability | ±50%               |
| `weiNightRecovery`                        | 0–0.5              |
| Gate durability, ram damage               | 700–1000 / 120–200 |
| Morale values for assault and thrown-off  | ±50%               |

AI behaviour is yours to improve freely, including the defender's positioning (concentrating on mounted units,
standing over raised ladders, moving before preparing). Both AIs must remain free of hidden information:
they may not read the other side's pending night order.

## Targets

Plan §6.3, unchanged except 完守 is now 10–40%, in this order of importance:

1. `brute` ≤ 15%, `anyPrice` ≥ 85%, `careful` 25–40%.
2. Foothold by day 2 ≥ 90%. Shu on the wall by day 5 ≥ 70%.
3. `anyPrice` median winning loss 5000–9000.
4. `careful` mean winning day 8–11, idle days ≤ 1.5, distinct games ≥ 150, turn time ≤ 1 s, 完守 10–40%.

If you cannot reach all of them, stop at the best candidate, keep it in the tree, and report which rows fail by how
much, what you tried, and what you recommend. Do not redefine a metric or special-case seeds. Do not make `careful`
or `brute` deliberately stupid to hit a number; their failures must come from Wei's counters working.

## Tests

- A test for every change above, using real rule calls, including: walking onto an empty wall is rejected; climb at 3
  mounts; climb cannot be an assault; a mound still allows the step; walkway frontage on both sides; a thrown-off unit
  stays usable and clears the foothold; volley rejected at 3 and accepted at 2; suppress accepted at 3; the uphill
  multiplier appears in the forecast and damage; the gate takes exactly the expected number of hits; a courtyard with
  a live defender does not win; night recovery.
- Update Task I's day-one feasibility test for climb. Do not weaken it.
- `npx vitest run tests/siege` stays green. Update tests only where these rules change the expected result.

## Checks to run and report

`node tools/siege-sim.mjs 200 --strict` with the full table; `--trace careful 228` and `--trace anyPrice 228`, each
day in one line; `npx vitest run tests/siege`; `npx tsc --noEmit -p .`; `npx prettier --check src/siege tests/siege
tools/siege-sim.mjs`; `npx vite build`. Report every tuning change as old → new, with the reason. No `git commit`.
Another Codex job is working on `docs/siege/chencang/art/s8-*` and `tools/build-siege-blockout.mjs` in this checkout; do
not touch or stage those. Keep your report out of `docs/`: write it to `.artifacts/siege/J2-report.md`.
