# Codex task V3b — fixes from browser validation of V3

V3 is uncommitted in the working tree: keep it and build on it. I ran the browser tests (110 of 119 pass) and a bot that finds work only through 下一队. Don't commit. Don't tune balance. Saves don't matter.

## Code

1. **`nextActor` continues from where the player is.** Today an actor that is no longer in the queue restarts at the queue's first entry. So when a player skips A with Tab, finishes B, the automatic selection jumps back to A, and every finished actor sends them back to the same skipped one. Remember position by roster order: after the current actor, take the next queued actor later in the roster within the same group (`act`, then `move`), wrapping around once the group is done. This must hold whether the current actor is still queued or not. Unit tests: skip A, finish B, get C; wrap-around; a dead current actor.

2. **When there's no next actor, keep the selection.** It must not clear. `climb-guide.spec.ts:329` shows the panel empty after a move left the unit with nothing to do and nothing else queued. The player should still see that unit, its line of guidance, and the 结束本日 emphasis.

3. **The panel must fit at 1280×720 in both languages.** `sidebar-content` overflows: English 475 > 457 and 475 > 440 (with the walkthrough card), and 459 > 457 at `shu-v02.spec.ts:63`. Fix it in CSS or spacing, not by hiding commands or by loosening the check. Find the tallest real case and leave some margin for it, since 2 px of slack will break again.

## Tests, all browser tests you can't run

Read each and reason it through. Fix the test if the test is wrong, the code if not.

| Test | Failure | My reading |
|---|---|---|
| `coarse-flow.spec.ts:104` | clicks grey `command-climb` and waits for it to be enabled | Playwright refuses disabled buttons. Use the way other specs click grey buttons, e.g. `clickGreyClimb` in `climb-guide.spec.ts`, or hover. |
| `map-clicks.spec.ts:61` day9 (zh, en) | expected `starting-ladder-1`, got `workshop-1-tower-5-1` | A tower shares the ladder's cell. Skip cells that hold more than one engine in this loop, and confirm from the rules that a tower may park on a usable ladder's cell. If it may, confirm the player can still reach the ladder. Tell me how. |
| `map-clicks.spec.ts:196` | no `[data-overlay="hover"]`, owner `(1,3)` | The figure top of shu-weiyan resolves to a far-off cell at `(1,3)`, which suggests a point off the current view or a unit not where the test thinks. Use a unit on screen, and assert the panned point is inside the map. |

## Validation you can run

```bash
npx tsc --noEmit
npx vitest run tests/siege --maxWorkers=2 --testTimeout=120000
npx vite build
```

Report: what you changed, what each table row turned out to be, the tallest panel case you measured or reasoned through, and anything left. Keep it short.
