# Codex task R2 — corrections to R after the planner's validation

Package R is in the working tree, uncommitted. The planner ran the browser suite and reviewed the screenshots: 94 of 99 pass, and units now fit their cells. Four things need correcting. No rule changes: the simulation must stay identical.

## 1. Clicking a soldier at the edge of a formation selects nothing

`tests/e2e-siege/render-v02.spec.ts` fails for `nightTorches`, `sortie` and `worst`: it clicks the centre of a unit's **first figure**, and that point lands in the neighbouring empty cell, so `preview-selection` stays `none`. A player will do the same. Their complaint is "选不中".

Add one row to `resolveMapClick`, just above the final `onCell` fallback: **if the picked cell has no occupant and is not green, and the click point is inside a living unit's figure rectangle (`visual.rect`), treat it as a click on that unit** (the unit rows above apply, so an enemy becomes a target when an own actor is selected). Several rectangles: the frontmost by `compareDepth`. The resolver stays pure: pass it a `unitAtPoint` value that `SiegeMapView` computes from the click's scene coordinates.

Green cells and occupied cells still win over a figure poking into them. That is deliberate: a green cell must always be clickable. Hover uses the same logic, so the outline shows it.

Add unit tests for the row and its priority, and a case to the e2e property test: click the centre of **every** figure of every unit (`[data-sprite="figure"]`), in fixtures with no unit selected, and assert that unit becomes selected.

## 2. The ladder you are working on must not be ghosted

Screenshots: a unit on or next to a ladder fades that ladder to 40%, and a gold frame on the ladder fades it as well, so the thing the player is working on nearly disappears. An engine fades only when it covers something that is **not in its own click footprint**. A tower over a ladder fades. A ladder over the unit at its own base, or over its own gold frame, does not: the unit already paints in front of it.

Update the e2e assertion on `starting-ladder-1`: it stays at opacity 1 here. Add a case for fading: a fixture with a tower covering a ladder base, with a unit selected on that base: the tower fades and the ladder does not.

## 3. Two specs are wrong, not the code

- `map-clicks.spec.ts`, "hover predicts…": `command-attack` is `aria-disabled` here, and Playwright waits forever for it to become enabled. Remove that click. An enemy under the cursor with an own actor selected is already a target by the table, so the red outline needs no attack mode.
- `map-clicks.spec.ts`, "a real click through hint-card text…": hint cards wait while the walkthrough runs, so no notice appears after `begin`. Skip the walkthrough first, then select a unit so that a hint appears, as the other fixtures do. If a fresh game still shows none, use a fixture that does.

## Constraints

As R. No rule, tuning or AI change. Keep Q's render separation. Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege tools`, `npx vitest run tests/siege --maxWorkers=1`. Your sandbox cannot start Chromium; the planner runs Playwright. Do not commit. Report briefly.
