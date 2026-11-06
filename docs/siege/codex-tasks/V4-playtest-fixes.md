# Codex task V4 — two playtest bugs on the coarse board

Branch `siege_v0.2`, at `b6adf37`. Don't commit. Don't tune balance. Don't change game rules. Saves don't matter: don't spend effort on them. Don't touch `attempts/`. Touch `src/v03` only if you must, and tell me why.

The user playtested and reported: "经常有图标无法显示" and "云梯上的士兵点不到". I reproduced both. My evidence is below, so don't re-derive it, but do read the code it names.

## Bug 1: art is fetched on first use

Art URLs are globbed eagerly, but each image is fetched only when first drawn. I ran one game with the dev server killed right after the battle began: 23 images failed, 13 `<img>` broke, and commands `suppress`, `ram`, `attack`, `openGate`, `coverEngine`, `raiseLadder`, `climb` and `order` lost their icons. Raised ladders drew as blank white pillars, because the mask's image was missing. The climb poses, the tower and the trench patches failed too. The same game with the server alive had no failures. Any lost connection does this, and first use always has a delay.

In a prototype I loaded the 111 images that game draws into `new Image()` objects and held references before killing the server. After the kill the page issued no image requests at all, and nothing failed. So that's the mechanism to build.

### 1a. Preload all runtime art

New module `src/siege/render/preloadArt.ts`.

- Build the list of every URL the battle and its story screens can draw, by exporting from the modules that own them: `src/siege/render/assets.ts` (map composite and masks, not `grid.png`; sheets; patches; inner-wall masks; effects; the `href` of every pose in `POSE_SETS`, not the unused pose variants), `src/siege/ui/storyAssets.tsx`, and portraits (`portraitFiles`, duplicated in `SiegeMapView.tsx` and `SiegeApp.tsx`, plus each officer's `officerPortraitPath` fallback where one applies). Don't write a second copy of those globs.
- `SiegeApp` starts it once on mount, as a module-level singleton that survives remounts. It runs in the background: it never blocks the player or the opening. At most 8 at a time. Use `decode()`, which also avoids decoding on first draw, and treat a failed `decode()` as non-fatal if the image has a `naturalWidth`. Retry a failed image once.
- Hold the `Image` objects in a module-level array for the life of the page. The references are what make this work.
- Expose progress as `data-art-preload="<loaded>/<total>/<failed>"` on `.siege-app`.

### 1b. Say so when the dev server is gone

The user reported this as a game bug, because the page gave no sign. Dev builds only: on `import.meta.hot` event `vite:ws:disconnect`, show a slim, visible strip over the map, in both languages through `i18n`. Roughly: "开发服务器已断开：还没载入的图片会显示不出来。重启服务器后刷新页面。" It has `data-testid="dev-server-lost"`. It must not cover the map's controls or take clicks, and it must not exist in a production build.

### 1c. A roster click must show the actor

`select(u.id)` from 我军列表 (`SiegeApp.tsx:1677` and the engine button at `:1697`) doesn't move the camera, so an off-screen actor and its target icons stay off-screen: 2 of the 9 actors with target icons in my audit. Make both buttons call `map.current?.reveal(...)` as `chooseNext` does, which pans only when it has to. Don't change anything else about the camera.

## Bug 2: soldiers on a ladder can't be clicked

`unitVisual` in `src/siege/render/stateArt.ts` draws a climbing unit's figures up the ladder (`offset`, progress 1 and 2), a storming unit as a sprite up the ladder, and a unit on a mound raised by `moundFoot`. Its comment says "Picking still uses the logical base cell". `positionAt` only knows cells, so a click on those figures lands on whatever cell is behind them. With Jiang Wei selected, I clicked the upper climber on the ladder at column 10: the click resolved to `{x:10,y:7,level:'wall'}` and opened an attack forecast on the enemy standing there. The climber was never selected. That happens at every height I sampled.

The ladder body has a related hole. A vertical sweep of the raised ladder at column 10 gives rows 10, 9, 8 and then wall 7. Rows 8 and 9 are moat cells that the ladder's `engineFootprint` doesn't include, so clicking the middle of a raised ladder does nothing.

### The rule

A figure drawn away from its own cell owns the pixels it stands on. Non-displaced units keep the existing contract in `tests/e2e-siege/map-clicks.spec.ts:208` ("figures outside their cell use the cell under the cursor; nameplates are the explicit exception"). Don't widen picking for them.

A unit is displaced when it is climbing, storming, or standing on a mound. Give `unitVisual` a list of screen rectangles for these only: per figure from foot + offset, pose anchor and pose size, honouring `flip`; for a storming unit, its sprite rect. Others get an empty list.

In `hitAt` in `SiegeMapView.tsx`, keep the order: target icon, then nameplate, then these two new steps, then the cell under the cursor. Both new steps run **only when no command is armed (`clickMode` is null) and not in deploy**:

1. **Displaced figure.** If the point is inside a displaced unit's rectangle, the frontmost such unit is picked, through the same path a nameplate uses, so selection, hover outline, hover line and cursor all follow. Rename `plateUnitId` to something true, such as `pickedUnitId`, in the code and tests. Two exceptions, where the cell under the cursor wins instead:
   - the point is inside `planeRect` of a wall cell with a living occupant: the walkway belongs to whoever stands on it;
   - that cell is in `reachable` for the selected actor: a legal move or mount, including the gold frame, must stay clickable through a figure.
2. **Ladder body.** If the point is inside a raised, usable ladder's sprite rect and the cell under the cursor holds no living unit and isn't in `reachable`, select that ladder. Add nothing to `engineFootprint`, because occlusion and outlines depend on it.

With a command armed, the cell under the cursor decides, exactly as today. So in attack mode a click over a climber still hits the enemy on the wall behind, and in move mode the wall cell is still the wall cell.

Keep `resolveMapClick` pure and unit-tested.

## Tests

Unit (`tests/siege`):
- the preload list contains every `POSE_SETS` href, every sheet image, every patch and every story icon, with no duplicates;
- the priority rules above, including both exceptions and armed modes.

Browser, with the real mouse at the real on-screen position (`page.mouse.click`, panning first; these are what my old tests failed to do):

`tests/e2e-siege/figure-clicks.spec.ts`
- Fixture with ladders raised at columns 6 and 10, a climber at foothold 1 and one at foothold 2, plus a storming unit (`assaultedDay === state.day`) and a unit on a finished mound. For each figure's on-screen box (`[data-unit] image[data-sprite="figure"]`, or the storm sprite), click its centre: once with nothing selected, once with another own unit selected. `data-selected` must become that unit, and no forecast may open.
- An enemy on the wall above a climber: clicking its figure on the walkway or its plate still opens the forecast.
- Attack armed: clicking over the climber hits the enemy behind. Move armed: the wall cell is still reachable through the figure, and a mount through the gold frame still works.
- Clicking the raised ladder over the moat, with nobody there, selects the ladder.
- Sweep: play `careful` for 2, 4, 6 and 8 days and, for every living Shu unit that is on screen after panning, click each displaced figure's centre and assert the selection. List in your report any non-displaced unit whose figure centre doesn't select it. Don't widen picking to make that pass.

`tests/e2e-siege/art-preload.spec.ts`
- Wait for `data-art-preload` to reach total with 0 failed. Then abort all image requests with `page.route` (**this stands in for a dead server**) and fail on any aborted request. Play `careful` to day 8, select every actor, open the morning report and the other tabs, and require no `<img>` with `complete && !naturalWidth`.
- `dev-server-lost`: absent normally. Trigger it however you can from a test. If you can't, say so and I'll check it by hand.

A roster-click check: selecting an off-screen actor from 我军列表 brings its plate into view.

## Validation you can run

```bash
npx tsc --noEmit
npx vitest run tests/siege --maxWorkers=2 --testTimeout=120000
npx vite build
```

You can't run browsers here, so reason your specs through carefully. I'll run them and the full browser suite. Fix existing tests only where this brief changes the behaviour they check, and name each one.

Report, briefly: what changed, the size in MB and count of the preload list, anything in the list you left out and why, each existing test you changed and why, and anything not done.
