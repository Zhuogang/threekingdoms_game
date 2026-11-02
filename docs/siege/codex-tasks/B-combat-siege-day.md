# Codex task B — combat, siege mechanics and the day (M3, part 2 of 3)

Planned and validated by Claude; implemented by Codex. Builds on task A
(`src/siege/content/chencang.ts`, `src/siege/rules/{types,constants,state,map,movement}.ts`);
extend those types where needed, keeping the state plain JSON. Read
`docs/siege/02-chencang-mvp-plan.md` §4.3–§4.11 — every number below comes from
there unless marked _(draft, task B)_.

## Hard constraints

Same as task A: no edits under `src/v03`, `src/siege/render`, `src/siege/dev`,
`docs/`, `tools/`; pure deterministic functions; no `git commit`; finish with
`npx vitest run tests/siege`, `npx tsc --noEmit -p .`,
`npx prettier --check src/siege tests/siege` all passing.

## Actions — `src/siege/rules/actions.ts`

`applySiegeAction(state, action) → { ok: true, state, events } | { ok: false, reason }`,
never mutating its input. `SiegeAction`:
`move` (unit → x, y, level, using task A pathing), `attack` (unit → unit or
gate), `fillTrench` (unit or earth cart → trench cell), `raiseLadder` (ladder
engine), `ram` (ram engine → gate), `moveEngine`, `queueEngine` (workshop,
kind), `fireArrows` (Wei archer → engine), `dropMillstone` (Wei unit → ram),
`dropBoulders` (Wei infantry on the wall → Shu unit below), `buildWall` (Wei
unit on an inner-wall segment cell), `order` (kind, target), `endDay`,
`withdraw` (Shu gives up: historical ending, lower rating). A unit moves once
and acts once per day (move then act, or act only), as in the field battle.

## Combat — `src/siege/rules/combat.ts`

Mirror `baseDamage` in `src/v03/battle/engine.ts` (force ratio, morale, troop
matchup, wavering/routed, terrain defence, the 20-person floor) and reuse
`troopDamageMultiplier` / `applyCombatDamage` from `src/v03/battle/experience.ts`,
with the frontage cap of plan §4.3: counted troops = min(attacker troops,
frontage); everything else multiplies as written.

| engagement (classify from positions/levels)                         | frontage | modifier                           |
| ------------------------------------------------------------------- | -------- | ---------------------------------- |
| both on the ground, outside or inside                               | none     | field rules                        |
| Shu archer on the ground → Wei on the wall                          | 600      | Wei takes ×0.3 (parapet)           |
| Shu on a raised ladder's cell → Wei on its wall cell                | 150      | counterattacks on the climber ×1.5 |
| Shu on a wall-foot cell → Wei on the wall cell north                | 100      | same ×1.5                          |
| melee through a broken gate passage                                 | 300      | —                                  |
| Shu siege tower → any Wei unit in range 4 (wall or inside the city) | 300      | ignores the parapet                |
| Wei on the wall → Shu below                                         | none     | ×1.3 height; Wei archers' range +1 |

Ranges: infantry 1 (orthogonally adjacent, counting wall↔ladder/wall-foot as
adjacent), archers 2. Counterattack as in the field battle. Morale loss and
rout thresholds as the field battle (constants from task A). A routed or
destroyed Wei unit on the wall leaves its cell; a routed Wei unit retreats
toward the nearest ramp. `predictSiegeAttack(state, attacker, target)` is a
pure forecast (casualties both ways, frontage used, modifiers) for UI and AI.

## Siege mechanics

- **Gates** (§4.5): a ram on its gate's approach cell may `ram` once per day:
  −160 durability _(draft, task B)_. Units attacking a gate deal ×0.1 of their
  normal damage. Gate state: `damaged` below half (for the art swap),
  `broken` at 0 → its passage opens to both sides and every Wei unit loses
  10 morale.
- **Trench** (§4.6): `fillTrench` on a south-trench cell orthogonally adjacent
  to the actor: an earth cart adds 1 (3 uses, then the cart is consumed), an
  infantry unit without an engine adds 0.5. A cell is full at 3. An inner-row
  cell (y 17) can only be filled after the outer cell (y 18) in the same column
  is full.
- **Ladders** (§4.7): a ladder engine on y 19 directly south of a full-or-empty
  outer trench cell at column x may `raiseLadder`: `raisedAt` = wall cell (x, 16),
  the engine stays at (x, 19). Task A movement already lets Shu step from there.
- **Engines and workshops** (§4.7): build days ladder 2, ram 3, earth cart 1,
  tower 4 (tower only from act 2). Durability ladder 120, ram 300, cart 80,
  tower 250; move 2 (tower 1). At most 6 unwrecked engines on the map; a
  workshop builds one at a time; a finished engine appears on the workshop's
  exit cell or the nearest free one. Durability 0 → `wrecked` (stays, blocks).
- **Countermeasures** (§4.8): `fireArrows`: a Wei archer hits an engine in range
  (wall +1) for troops × 0.4 × weather (wind 1.25, snow 0.6) and sets it
  burning; burning engines lose 20 at each day's end. `dropMillstone`: a Wei
  unit on a gate-top cell, or on the wall cell directly above the ram's
  approach cell, deals −200 to that ram; each Wei unit once per two days.
  `dropBoulders`: Wei infantry on a wall cell hit the Shu unit on the ladder
  cell or wall-foot cell directly below for troops × 0.25 casualties (×1.5 if
  that unit attacked from there this day or is climbing), once per unit per day.
  `buildWall`: from act 2, a Wei unit on an inner-wall segment cell adds 1
  (4 to finish a segment; built segments become walls for task A movement).
- **Orders** (§4.9), one per side per day: Zhuge Liang `rally` (+15 morale),
  `supervise` (a workshop −1 day), `rotate` (a Shu unit with wounded goes to a
  free camp cell inside the palisade, cannot act this day, and next day gets
  half its wounded back as troops); Hao Zhao `rally`, `holdFast` (Wei units on
  one wall run — the contiguous wall cells between two towers or gates — take
  ×0.7 casualties this day), `nightRepair` (a gate +100, capped at max, not if
  broken).
- **Acts** (§3): act 2 starts on day 6, or the day after Shu lose a second engine
  in act 1; it unlocks towers for Shu and `buildWall` for Wei.

## The day — `src/siege/rules/day.ts`

`endDay(state, defenderTurn?)`: plan §4.11 order — Shu actions are done →
`defenderTurn(state)` (task C supplies the AI; default does nothing) → burning
engines −20, workshop progress (finished engines appear), grain −1,
Zhang He distance −1, morale recovery as the field battle (+5 to units that lost
no troops, cap 80), wounded/rotate bookkeeping, reset moved/acted, next day's
weather from the RNG (clear 60%, snow 30%, wind 10% _(draft)_), outcome check.

## Outcome — `src/siege/rules/outcome.ts` (§4.11)

`victory` if at a day's end a Shu unit stands on a courtyard cell, or every
Wei unit is destroyed or routed. `historical` when grain reaches 0 at a day's
end, or on `withdraw`. `defeat` if every Shu unit is destroyed or routed, or
the Zhuge Liang main body is.

## Tests (`tests/siege/`)

At least: frontage caps (2,000 troops on a ladder count as 150; an archer volley
against the wall uses 600 and ×0.3; a tower ignores the parapet); a ram breaks
the south gate in 5 days and the passage opens with −10 Wei morale; units hit a
gate for a tenth of normal; trench order (inner refused until outer is full;
infantry adds 0.5; a cart is consumed after 3); a raised ladder lets a Shu unit
attack the wall cell and step up once it is empty; fire arrows with weather and
next-day burning; the millstone's two-day cooldown; boulders' ×1.5 on climbers;
inner wall completion turns cells into walls; each order's effect and the
once-per-day limit; act 2 by day 6 and by two lost engines; `endDay` order,
grain and the historical ending on day 20; victory on the courtyard; defeat on
the main body; same seed and actions → identical states.

## Corrections to task A (from the planner's review)

Make these first; they change task A's files and tests, which is allowed for
this task:

1. **Roster.** 赵云 (at Jigu, not Chencang), 严颜, 蒋琬 and 费祎 (civil posts in
   Chengdu) were not at the siege. Keep Zhuge Liang, 魏延, 姜维, 王平, 吴懿, 廖化
   and give the other four Shu units unnamed captains like the Wei ones
   (`shu-captain-1..4`, chinese `蜀军校尉1..4`, force 55–62, intellect 40–50,
   `portraitId: null`): two infantry, two archers, troop counts unchanged.
2. **Rams.** Rams move on plain ground as well as roads, bridges and broken
   gate passages; they never enter filled trench cells, so the bridge stays the
   only way across. (Task A's road-only rule stranded new rams at the workshop
   exits, which are snow cells.)
3. **Opening positions.** Make the opening deterministic and sensible instead
   of a random cell in each zone: Hao Zhao on the south gate top (x 23, y 16,
   wall level); the three Wei archers spread along the south wall walk; Wang
   Sheng and the infantry captain on the south wall walk east and west of the
   gate. Shu units in a line across y 21–23 in roster order, centred on the
   road, avoiding the workshops; Zhuge Liang on the road at y 25. The seed then
   only drives weather and combat variation.
4. **Weather.** Keep the precomputed `weatherByDay` schedule, but draw it with
   clear 60 %, snow 30 %, wind 10 %; `endDay` reads the next day's entry.
