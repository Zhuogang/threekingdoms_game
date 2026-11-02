# Codex task A — siege state, content, map and movement (M3, part 1 of 3)

Planned and validated by Claude; implemented by Codex. Read first:
`docs/siege/02-chencang-mvp-plan.md` §1, §4.1–§4.2, §4.4–§4.6, §4.8 (inner wall), §9.
The layout is `docs/siege/chencang/art/layout.txt` (48×32; x 0–47 west→east,
y 0–31 north→south). Symbols: `~` river, `.` snow, `+` road, `=` bridge,
`-` trench, `^` hill, `T` wood, `P` palisade, `W` wall, `O` corner tower,
`G` gate, `M` horse ramp, `B` barracks/armoury/granary, `K` residence
(row 6 is the hall; rows 7–8 are the front courtyard), `R` inner-wall line,
`S` workshop, `t` tent, `C` chancellor's tent, `X` (treat as snow).

## Hard constraints

- Do **not** modify anything under `src/v03`, `src/siege/render`, `src/siege/dev`,
  `docs/`, `tools/` or existing tests. New code goes in `src/siege/content/`,
  `src/siege/rules/`, new tests in `tests/siege/`.
- Pure, deterministic TypeScript; state is plain JSON (no classes, Maps or Sets
  inside the state; helpers may use them internally). No `Math.random`, no Date.
- Reuse exported v03 helpers where they fit (`movementBudget` from
  `src/v03/battle/rules.ts`; `applyCombatDamage`, `troopDamageMultiplier` from
  `src/v03/battle/experience.ts` — task B will need these). Field constants that
  are private in `src/v03/battle/engine.ts` (WAVERING 40, ROUTED 20, MIN 5,
  the LCG `advanceRandomState`, FNV `tacticalSeed`) are re-declared in
  `src/siege/rules/constants.ts` with a comment naming their source.
- Do not run `git commit`. When done: `npx vitest run tests/siege`,
  `npx tsc --noEmit -p .` and `npx prettier --check src/siege tests/siege` must
  all pass (node is at `$HOME/.local/node/bin`).

## Deliverables

### `src/siege/content/chencang.ts`

- `CHENCANG_LAYOUT: readonly string[]` — must equal `layout.txt` (a test reads
  the file and compares).
- Named geometry, derived from the layout where possible (no hand lists that
  could drift), exported as constants:
  - `GATES`: `south` (x 23–24, y 16), `north` (x 23–24, y 4), `west` (x 14, y 10),
    `east` (x 33, y 10); each with its cells, the max durability (south 800,
    others 500) and the outside approach cell(s) a ram must stand on (the bridge
    cell next to the gate).
  - `RAMPS`: the eight `M` runs with their cells ordered low end → high end, the
    ground cell the low end connects to and the wall cell the high end connects
    to (plan §4.4: low beside the gate road, high end against the wall).
  - `SOUTH_TRENCH`: rows y 17 (inner, wall side) and 18 (outer), x 12–35 minus
    the bridge x 23–24. Only the south trench can be filled in the MVP.
  - `INNER_WALL_SEGMENTS`: y 14, runs x 15, x 17–22, x 25–30, x 32 (gaps x 16,
    23–24, 31), each needing 4 build points.
  - `COURTYARD`: the `K` cells of rows 7–8 (the Shu objective).
  - `WORKSHOPS`: two, from the `S` blocks (x 15–18 and x 29–32, y 23–24), each with
    the cell where finished engines appear (the cell south of its middle front).
  - `DEPLOY_SHU` and `DEPLOY_WEI` per plan §4.1 (Shu: y 21–25 open cells minus
    workshops, plus open cells inside the palisade; Wei: wall walkways, gate tops
    and open cells inside the city).
- `SHU_ROSTER` (10 units) and `WEI_ROSTER` (6 units) per plan §4.2. Shu: the
  main body (Zhuge Liang, 1,000, infantry) plus 9 units of 1,500–3,000 (total
  about 20,000), infantry and archers (crossbows) only, led by 魏延, 姜维 (as
  infantry), 王平, 吴懿, 廖化 and others available in
  `src/v03/content/officer-catalog.ts`; take force/intellect from there. Wei:
  郝昭 (new: force 76, intellect 74), 王生 (new: force 64, intellect 52) and
  four captains without portraits (force 50–58, intellect 35–45), 150–300 men
  each, total about 1,300; infantry and archers.

### `src/siege/rules/types.ts` and `constants.ts`

`SiegeState` (JSON) holding at least: `version`, `seed`, `rngState`, `day`
(1-based), `act` (1 | 2), `weather` per day (`clear` | `snow` | `wind`), `grain`
(starts 20), `zhangheDistance` (starts 22), `units` (id, side `shu` | `wei`,
officer, troopType, troops, wounded, morale, force, intellect, x, y,
`level: 'ground' | 'wall'`, moved, acted, `routed`), `engines` (id, kind
`ladder` | `ram` | `earthCart` | `tower`, x, y, durability, max, `burning`,
`raisedAt?` wall cell for a raised ladder, `uses?` for earth carts, `wrecked`),
`gates` (per gate: durability, max, `broken`), `trenchFill` (cell key → 0–3),
`innerWall` (segment index → 0–4), `workshops` (queue item or null, days
remaining), `ordersUsed` (per side, per day), `log`, `outcome`
(null | `victory` | `historical` | `defeat`).

### `src/siege/rules/state.ts`

`createSiegeState(seed: number): SiegeState` — places every unit on a deploy
cell (deterministic from the seed), Wei archers on wall walkways along the
south wall, everything else per the zones.

### `src/siege/rules/map.ts`

- `cellTerrain(state, x, y)` → `plain | hill | wood | water | trench | wall |
gate | building | ramp | courtyard | works`, applying state: a trench cell
  filled to 3 is `plain`; an inner-wall segment built to 4 is `wall` (height 2).
- `cellHeight(state, x, y, level)`: wall walkway 3, built inner wall 2, ramp
  cells interpolated low→high (1, 2, 3 along the run), ground 0.
- `isWallFoot(state, x, y)`: a filled inner-row trench cell (y 17) directly
  south of a wall cell.

### `src/siege/rules/movement.ts`

- Positions are `(x, y, level)`. `reachableCells(state, unitId)` and
  `pathTo(state, unitId, x, y, level)` with the unit's budget
  (`movementBudget(troopType)`); step cost plain/courtyard/ramp 1, hill/wood 2;
  water, unfilled trench and buildings impassable; units and unwrecked engines
  block (wrecks block too: plan §4.7).
- Wall level: Wei move freely along wall walkways and gate tops (gate cells at
  wall level connect the walls either side, §4.4). Wall level and ground connect
  only through a ramp: the high-end ramp cell connects to its wall cell, the
  low-end cell to its ground cell, middle cells only along the ramp.
- Shu reach wall level only from (a) the base cell of a raised ladder (the
  ladder engine's own cell) to its `raisedAt` wall cell, or (b) a wall-foot cell
  to the wall cell directly north; the target wall cell must be empty (fighting
  for occupied wall cells is task B). Once on the wall, Shu follow the same wall
  and ramp rules as Wei.
- Gate passage (ground level at a gate cell): Wei may pass while the gate
  stands; both sides once it is broken.
- Engine movement (`engineReachable`): budget 2 (tower 1); rams only on road,
  bridge and broken-gate cells; other engines on plain cells; engines never
  enter the wall level.

## Tests (`tests/siege/`)

- layout equals `layout.txt`; derived geometry matches the numbers above
  (gate cells, eight ramps with correct low/high ends, 44 south-trench cells,
  segment lengths 1/6/6/1, courtyard non-empty, workshops at the S blocks).
- rosters: 10 Shu (≈20,000 ±10%), 6 Wei (≈1,300 ±15%); all units start on
  their side's deploy cells, no two share a cell; `createSiegeState` is
  deterministic for a seed and differs for another seed only where randomness
  is used.
- movement: a Wei unit on the south wall reaches the north wall walk via the
  walls and gate tops without touching the ground; a Wei unit cannot step from
  the wall to the ground except at a ramp's high end; a Shu unit south of the
  trench cannot enter the trench or the wall; after filling a y 17 and y 18
  trench pair to 3 it can walk onto the wall-foot cell and then onto the empty
  wall cell; with a raised ladder it reaches the wall from the ladder's cell;
  the south gate passage is closed to Shu until broken; a ram cannot leave
  road/bridge cells.
