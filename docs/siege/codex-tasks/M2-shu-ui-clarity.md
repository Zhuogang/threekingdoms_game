# Codex task M2 — make the Shu interface readable

Planned and validated by Claude; implemented by Codex. Package M works: its logic is right and most specs pass. But the
planner reviewed the screenshots in `.artifacts/siege/screens/` (`report.png`, `counter-card.png`, `assault-forecast.png`,
`defense-panel.png`, `walk-1.png`, `score.png`) against the acceptance question, and it does not pass yet: **without reading any
document, can a new player tell what the enemy just prepared, how to answer it, how far up the wall they are, and why an attack
is not working?** Look at those images before starting. All of this must work at 1280×720.

## Fixes

1. **No coordinates in player-facing text.** "wall cell 29,16", "South gate (23,16)" and "wall run 15,16–22,16" mean nothing to a
   player. Add one helper that names a place, in zh and en: 南门门楼, 南墙西段, 南墙东段, and so on, by the wall run it belongs to, and
   use it in the report, cards, hints and panels. Coordinates may remain only in `data-` attributes.
2. **The morning report tells one story.**
   - Merge contradictions. A brazier lit and doused in the same night is one line: "魏军在南墙东段备了火，但雪夜灭了火盆", with its counter
     reflecting that it is no longer a threat.
   - Most urgent first: threats that can strike today, then what changed, then good news.
   - Clicking an item pans the map to that place and pulses it, and keeps the report open.
3. **Replace the "wall archer range" overlay.** It paints red bands over the whole trench, including where nothing can fire, which teaches
   the player to ignore red. Rename it 火箭射程 / "Fire arrow range", default on: only cells that a wall archer next to a **ready brazier**
   can reach. With no ready brazier it draws nothing. So red now means "a ladder here can burn today", which is the tell the design wants.
4. **The action panel fits and shows what matters.**
   - Show only actions this actor could ever do. An infantry unit never sees 压制, 架梯, 撞门 or 筑墙; an archer never sees 蒙皮 or 攀爬; an engine shows
     only its own.
   - Available actions first, full size. Unavailable ones after them, smaller, without permanent reason text: the rule's reason appears on hover
     and focus, and in one shared line under the list, so that touch and keyboard users get it too.
   - One context line above the actions, derived from the position: "你在梯底：攀爬，立足 +1", "头上有守军：可攻击或强攻", "此处可填城堑".
   - With a unit selected, its actions must fit without scrolling.
5. **Forecast is a comparison, not a list of chips.** A compact table, side by side, 普通 and 强攻: enemy casualties, own casualties, foothold
   before → after (with 登城 called out when it mounts), morale after. Own casualties are the most prominent number. The checkbox selects a
   column, and the chosen column is highlighted. Modifier chips move into a collapsed "详细修正" `<details>`. It must fit without scrolling. Same
   layout for an assault climb.
6. **Defence tab**: rampart rows first, since they are the point: place name, defenders, pressure bar, preparation icons, foothold pips. Clicking a
   row pans to it. Then the south gate. The other three gates collapse into one line, because nothing attacks them in this version.
7. **Unit list**: the player's side only, grouped: 部队, 器械. Enemy units are selected on the map. It must not push the selected unit's card off screen.
8. **Walkthrough shows where.** Each step pulses its target on the **map** as well as in the panel: the ladders in step 1, the ladder's base in step 3, the wall
   cell above in step 4, and so on. Keep the box compact.
9. **Only one thing talks at a time.** Hint and counter cards queue. Nothing pops during the morning report or a replay, and first-time hints wait while the
   walkthrough runs. Cards must not cover the unit the player is working on: place them where they do not overlap the current selection.
10. **Portraits**: no `?` placeholder. Units without a portrait use their idle pose sprite.
11. **Score parts** are displayed as whole numbers. The score itself stays computed the same way.

## The three e2e failures

The planner ran the specs; the log is `.artifacts/siege/m-e2e-fails.log`. Fix them:

- `battle.spec.ts:7` and `howto.spec.ts:22`: `page.evaluate: TypeError: Cannot read properties of undefined (reading 'snapshot')`. A hook is read
  before it exists, or after navigation. `shu-v02.spec.ts` uses the same helper and passes, so compare them. Wait properly instead of adding a sleep.
- `battle.spec.ts:29`: expects `There are already 8 usable engines on the map.`, and receives `The engine limit has been reached.` Decide which text the player
  should see (the one with the number) and make the code and the test agree.

Your sandbox cannot start Chromium. Keep assertions on behaviour and text, not pixels, and use `data-testid`s.

## Constraints

No rule or AI changes. Do not touch `src/v03`. Numbers on screen still come from `tuning.ts`; new text in zh and en, with fonts regenerated from the local sources.
Do not fork components: Wei (package N) will reuse all of these by `playerSide`, so do not hard-code Shu. No `git commit`.

## Tests

Unit tests for: place naming; report merging and ordering; the fire-range cell set (none without a ready brazier; prepared-today not ready; correct cells with one); action
filtering per actor kind; forecast table data; the card queue. Update e2e specs, and add assertions that with a unit selected at 1280×720 the action panel and forecast do not
scroll (`scrollHeight <= clientHeight`, or the Stand by button is within the viewport).

## Checks to run and report

`npx vitest run tests/siege`, `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege`, `npx vite build`. List what the planner should look at in the new
screenshots, and say where a fix was not fully possible.
