# Codex task M3 — the last four e2e failures

Planned and validated by Claude; implemented by Codex. The planner ran the full siege Playwright suite on M2's code: 20 pass, 4 fail. The log is
`.artifacts/siege/m2-e2e.log`, and failure screenshots are under `.artifacts/siege/test-results/*/test-failed-1.png`. Read them. M2's panel, overlay and
walkthrough look right, so keep this narrow.

## Failures and what to do

1. **A silhouette takes a unit's click (real bug).** `shu-v02.spec.ts:161`: clicking `map-unit-wei-captain-1` (a unit on the wall at 18,16) times out, because
   `<image data-sprite="silhouette">` intercepts pointer events. A player might not be able to select a unit standing behind something. Make every unit selectable
   wherever it stands: silhouettes must either pass clicks to the unit's hit target or select the same unit. Make sure the hit target stays above occluding wall and
   tower slices at all zoom levels. Add a unit-level or e2e check for a unit that is drawn as a silhouette.
2. **Sidebar overflows slightly at 1280×720 (real).** `clarity.spec.ts:8`: `sidebar-content` `{"scroll":486,"height":483}`. `shu-v02.spec.ts:21`: `{"scroll":486,"height":465}`. So up to 21px too
   tall when the walkthrough box is open. Tighten the layout (spacing, the collapsed-section rows, the Withdraw button's placement) until it fits with the walkthrough box
   showing, for every actor kind. Do not hide content or weaken the assertion.
3. **Replay skip race (test only).** `battle.spec.ts:31` via `helpers.ts:80`: `replay-skip` is detached because the 130 ms replay ends before the click. Make the helper tolerate
   a replay that has already finished: wait for the replay to end, clicking skip only if it is still there, without a fixed sleep and without swallowing other errors.

## Also

With those fixed, `report.png`, `counter-card.png`, `assault-forecast.png`, `defense-panel.png`, `score.png`, `actions-en.png` and `actions-zh.png` must all be written by the specs, because the planner reviews
them. Check that the code path for each is reached before anything that could fail on an earlier line, or move each screenshot to its own short test.

## Constraints and checks

No rule or AI changes. No `git commit`. Your sandbox cannot start Chromium. Run `npx vitest run tests/siege`, `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege`.
