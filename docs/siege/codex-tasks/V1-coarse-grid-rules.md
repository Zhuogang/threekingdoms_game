# Codex task V1 — the coarse board: content, rules, AI

Planned and validated by Claude; implemented by Codex. First of three packages (V1 rules, V2 render, V3 guidance).

The user, after a long playtest: "问题越来越多不是越来越少". An audit found the rules engine and the stack sound and the board model wrong: 1536 fine cells, one unit per 64×48 cell, about 40% of walkable city cells hidden behind the painting and about 20% overlapping another plane. They have now said "尽量做完粗格子". **Do not change the action model.** No action points, no pooled move-and-attack. One move and one action a day stays. Balance is not the concern: implement what is written, report what the simulation does, and do not tune anything to compensate.

## The idea

The rules move to a 17×14 board whose columns and rows have different widths. Each board cell is a span of the old fine cells. The painting stays in fine coordinates, unchanged.

Because the rows next to the south wall stay 1:1 (`16`, `17`, `18`), the distances that matter across the wall and the trench are unchanged. So **`tuning.ts` keeps its values**, including ranges, `trenchCapacity`, foothold, frontage numbers and engine moves. `movementBudget` stays 3. The only tuning entries that change are the two that are map coordinates, `nightEngineMinY` → 10 and `nightEngineMaxY` → 11.

## `src/siege/content/coarseGrid.ts` (new)

```ts
// Inclusive fine-cell spans. Index = board coordinate.
export const COL_SPANS = [[0,3],[4,7],[8,11],[12,13],[14,14],[15,16],[17,19],[20,22],[23,24],[25,27],[28,30],[31,32],[33,33],[34,35],[36,39],[40,43],[44,47]] as const;
export const ROW_SPANS = [[0,2],[3,3],[4,4],[5,6],[7,8],[9,11],[12,15],[16,16],[17,17],[18,18],[19,21],[22,25],[26,28],[29,31]] as const;
```

Export also `fineCellsOf(cell): Cell[]` and `fineSpanOf(cell)`. Named coordinates, used everywhere instead of literals:

`WEST_WALL_COL = 4`, `EAST_WALL_COL = 12`, `NORTH_WALL_ROW = 2`, `SOUTH_WALL_ROW = 7`, `TRENCH_INNER_ROW = 8`, `TRENCH_OUTER_ROW = 9`, `APPROACH_ROW = 10`, `ROAD_COL = 8`, `MIDDLE_ROAD_ROW = 5`.

## `src/siege/content/chencang.ts`

Rename today's 48×32 array to `CHENCANG_ART_LAYOUT`. It stays an exact copy of `docs/siege/chencang/art/layout.txt`, and only art and render code may read it. `CHENCANG_LAYOUT` becomes this board, with the same symbols:

```
row  fine y
 0   0-2    .................
 1   3      ^..-----=-----...
 2   4      ^..-OWWWGWWWO-...
 3   5-6    ^..-W..M+M..W-...
 4   7-8    T..-WMBB+KKMW-.T.
 5   9-11   ^..=G+++++++G=...
 6   12-15  ^..-WRBR+RBRW-..^
 7   16     ^..-OWWWGWWWO-..^
 8   17     ^..-----=-----..^
 9   18     ...-----=-----..^
10   19-21  ........+.......^
11   22-25  .....SS.+.SS.....
12   26-28  ^.PPPPPP+PPPPPP..
13   29-31  ^.Ptt.t.+CC.ttPT.
```

Everything derived from the layout should keep working from these symbols: `CITY_BOUNDS` (west 4, east 12, north 2, south 7), `GATES` (one cell each), `SOUTH_TRENCH` (rows 8 and 9), `INNER_WALL_SEGMENTS` (four, in the same row-major order as the fine segments, so `state.innerWall` indexes still name the same art), `COURTYARD`, `CAMP_CELLS`.

Explicit geometry replaces derivations that assumed runs of cells:

- **`RAMPS`** becomes a table of single cells, each joining one ground cell to one wall cell directly north, south, east or west of it. Eight, the ones painted: `(7,3)↔(7,2)`, `(9,3)↔(9,2)`, `(5,4)↔(4,4)`, `(11,4)↔(12,4)`, `(5,6)↔(4,6)`, `(11,6)↔(12,6)`, `(7,6)↔(7,7)`, `(9,6)↔(9,7)`. Row 6's four cells have symbol `R` and are also ramps while unbuilt. Replace `{cells, ground, wall}` with whatever is simplest for these, and keep `cellHeight` for a ramp cell at 2. If a segment is built on a ramp cell the wall terrain wins and it stops being a ramp.
- **`COURTYARD`**: the `K` cells of row 4.
- **`WORKSHOPS`**: two, cols 5–6 and 10–11 of row 11. Spawn is the free one of the cells directly north of the workshop (row 10), the inner column first (6, then 5; 10, then 11). If both are taken, keep today's behaviour for a blocked spawn.
- **`DEPLOY_SHU`**: open cells of rows 10 and 11, plus `CAMP_CELLS`.

## One unit per cell, one plane per cell

- A cell holds at most one living unit, **regardless of level**. `canStop` compares cells, not positions. Enemy blocking in `unitSearch` is also by cell. This is the rule that removes "two units overlapping on two planes". It only has force at gates, because every other cell has one plane.
- The gate cell keeps two levels, top and passage. Keep `level` on positions and everything built on it.
- A usable ladder still shares its cell with a unit. Other engines still block.

## Starting positions (`state.ts`)

- Shu, in roster order (`SHU_ROSTER`): `(8,12) (7,11) (8,11) (9,11) (4,11) (12,11) (3,11) (13,11) (2,11) (14,11)`, all ground. Zhuge Liang keeps the road behind the line.
- Wei, in roster order, all on the south wall: `(8,7) (7,7) (6,7) (9,7) (10,7) (11,7)`.
- Engines: ladder `(6,10)`, ladder `(10,10)`, ram `(8,10)`, earth cart `(7,10)`.
- Bump `SIEGE_VERSION` and the schema literal in `save.ts` to `siege_v0.3`. Old saves must be refused quietly, as any other save of an unknown version is today, without a crash. Tell me what the player sees.

## Replacing literals

Find every fine-grid literal and every assumption about run length in `src/siege/rules`, `src/siege/ai` and `src/siege/ui`, and use the named constants. At least:

- `src/siege/ai/defender.ts`: lines around 170–175, 222, 424–440, 469, 490. `src/siege/ai/attacker.ts`: lines around 83–131, and its column plans.
- `src/siege/rules/combat.ts`: `cell.y > 18` around line 664 becomes `> TRENCH_OUTER_ROW`. `src/siege/rules/day.ts`, `events.ts`, `preparations.ts`, `actions.ts`.
- `src/siege/ui/places.ts`, `climbGuide.ts`, `nextGoalGuide.ts`, `walkthrough.ts`, `howToPlay.ts`, `commands.ts`, `fireRange.ts`, `counters.ts`, `devPlaythrough.ts`.

Anything that says `x < 24` to mean "west of the road" becomes `x < ROAD_COL`. Attacker column plans that picked a fine x become the board columns over the south wall: `5, 6, 7, 9, 10, 11`.

Grep for it afterwards and list in your report any numeric coordinate you left, with why. Text the player reads that counts cells must still be true on the new board.

**Render bridge, temporary.** Render code gets the minimum to keep compiling and to show units in roughly the right place: read fine coordinates through `CHENCANG_ART_LAYOUT`, and turn a board cell into a fine one through a single helper in `src/siege/render/`. V2 rewrites this properly. Do not spend time on looks.

## Tests

Migrate `tests/siege` to the new board. Prefer named cells and helpers to literals, since the old tests hold 449 hard-coded positions: add helpers to `tests/siege/rulesFixtures.ts`. A test whose point was the fine geometry itself (a run of three ramp cells, say) should be rewritten to state the same rule on the new board, or removed if the rule is gone, and listed in your report. Never weaken an assertion just to get a green result.

New tests, in `tests/siege/coarseGrid.test.ts`:

1. The spans cover 0–47 and 0–31 exactly once, in order.
2. The `CHENCANG_LAYOUT` rows have the listed lengths, and each wall, gate and trench board cell covers the same symbol in `CHENCANG_ART_LAYOUT` (`W`/`O`/`G`, `-`/`=`). This is the check that the board sits on the painting.
3. Every eight ramps joins a passable ground cell to a walkway cell next to it.
4. Two living units can never share a cell, at any level: try a move onto a gate cell whose other level is taken.
5. From the south wall, a Shu unit can step down, reach an unbroken gate's inside cell, and `openGate` within two days of ordinary moves.

**Allowed to fail after this package, and only these, because V2 rewrites them:** `tests/siege/renderV02.test.ts`, `stateArt.test.ts`, `mapPieces.test.ts`, `betaCity.test.ts`, `picking.test.ts`, `mapClick.test.ts`, `visibility.test.ts`, `southRamps.test.ts`, `renderNightReplay.test.ts`, `scene.test.ts`, `tests/e2e-siege/*`. List which of them fail. `tsc` must pass.

## Docs

Add `### 5.14 粗格子棋盘（2026-11-05，任务 V）` to `docs/siege/03-chencang-v0.2-plan.md`, in Chinese: why, the spans, one unit per cell regardless of level, the ramp table, what did not change (one move, one action, tuning). Update §5.4 or any other section this makes false, and `docs/siege/00-progress.md`.

## Validation you can run

```bash
npx tsc --noEmit
npx vitest run tests/siege --maxWorkers=2 --testTimeout=120000
node tools/siege-sim.mjs 200 --strict --output .artifacts/siege/sim-v1.json
```

`--strict` must find no illegal plan. Report the win rate, median day and median losses per method beside the previous numbers (careful 31.5%, anyPrice 86.5%, brute 23%), and say why they moved if you can tell. **Do not tune.** If a method can't win at all, or no game finishes, that's a structural bug: find it and tell me what you changed.

You can't run Chromium here. Don't commit; I validate and commit.

## Report

Files changed, rules whose meaning changed even slightly, literals left, tests rewritten or removed, tests failing, the simulation table, and anything in this brief that turned out wrong for the code.
