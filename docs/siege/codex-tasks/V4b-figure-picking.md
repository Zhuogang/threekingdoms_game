# Codex task V4b — fixes from browser validation of V4

V4 is uncommitted in the working tree: keep it and build on it. Don't commit. Don't tune balance or change game rules. Saves don't matter.

I ran your specs in a browser and killed a real server after your preloader finished: 241/241 loaded, then 0 image requests, 0 failed, 0 broken. The preloader is good. Don't change it. These are the remaining problems.

## Code

### 1. Change the picking rule

I told you not to widen picking for ordinary figures. Your sweep changed my mind: 14 to 21% of ordinary figures can't be clicked at their centre. A formation's back row stands over the thin row north of it, so clicking Wei Yan's soldiers at (1508,854) selects the ram, and Jiang Wei's at (1376,854) does nothing. That is the bug the user reported, in another place.

The exception for an occupied walkway is also too wide. It uses the whole `planeRect`, and an upper climber's centre falls inside it, so clicking him at the parapet still hits the enemy. Use figure boxes, not the plane.

In `pickDisplacedArt` (rename it to fit), with no command armed, not in deploy, and the cell under the cursor not in `reachable`:

| Order | If the point is inside… | Result |
|---|---|---|
| a | a figure box of a living unit standing on the cell under the cursor | the cell under the cursor (its occupant) |
| b | a displaced figure's box | that unit |
| c | (the cell under the cursor holds a living unit) | the cell under the cursor |
| d | an ordinary figure's box | that unit, frontmost by depth |
| e | a raised usable ladder's sprite rect | that ladder |
| f | otherwise | the cell under the cursor |

So `visual` needs a box per figure for every unit, not only displaced ones. A storming unit has one box, its sprite. Keep a way to tell displaced from ordinary. With a command armed, nothing changes: the cell under the cursor decides.

Order (d) replaces the old contract in `tests/e2e-siege/map-clicks.spec.ts:208`. Update that test and its name to the new one: with nothing armed, a figure owns its pixels unless the cell under the cursor has its own occupant or is a legal move. Keep the nameplate part. Fix any other test that relied on the old rule, and name each one.

### 2. A climber's nameplate must not cover the wall

`plateRect` puts a plate above the figure's top. For a climber the top is at the parapet, so the plate lands on the walkway and covers the enemy standing there. In the screenshot only the enemy's feet show, and the plate takes the clicks meant for that enemy.

For a climbing or storming unit, put the plate just below the ladder's foot: top at `foot[1] + 10`, centred on the foot, so it sits on the unit's own base cell, clear of the engine's durability bar at `rect[3] + 3` to `+ 7`. Keep the upward spread for overlaps, and keep plates on-map. `positionBounds`, used by `reveal`, should keep working from the plate's rect. On-mound units keep the plate above them.

## Tests: errors I found by running them

| Test | What happened | Fix |
|---|---|---|
| `art-preload.spec.ts:40` | `page.route` disables the browser's cache, so a preloaded image is requested again and aborted. This was my instruction and it was wrong. | Use `context.setOffline(true)` once preloading is done, and fail on any image request that fails. Keep the rest. |
| `figure-clicks.spec.ts:99` | The storm piece's nested `<svg>` has a `boundingBox` covering the whole sheet, so the click landed on empty trench at (480,460). | Get real boxes from the game: in the page, import `unitVisual` as you do in the sweep, and convert its boxes to client coordinates. Use that for every figure, not just storms. |
| `figure-clicks.spec.ts:258` | Same `<svg>` box problem, and the ladder was in fact on screen and centred. | Use `engineSprite(...).rect` converted to client coordinates. |
| `figure-clicks.spec.ts:134` | Blocked by the plate in code item 2. It should pass after that. Reason it through. | Also add: at a progress-2 ladder with an enemy above, the upper climber's centre selects the climber and the enemy's figure opens the forecast. |
| `figure-clicks.spec.ts:292` | With a ladder selected, clicking an enemy sets a target but shows no forecast, because a ladder can't attack. | Under the new rule, assert selection only: ordinary and displaced figures must select their unit, except that a point inside another living unit's box on the cell under the cursor goes to that occupant. Make misses fail the test. List in your report any you had to exempt and why. |

Add unit tests for each row of the table above, including (a) beating (b), and a figure over an engine's cell (the ram case).

## Validation you can run

```bash
npx tsc --noEmit
npx vitest run tests/siege --maxWorkers=2 --testTimeout=120000
npx vite build
```

Report, briefly: what changed, each existing test you changed and why, what you reasoned through about plates at the foot (including the case of a plate meeting a neighbour's), and anything not done.
