# Codex task N — playing as Wei

Planned and validated by Claude; implemented by Codex. The specification is
[`docs/siege/03-chencang-v0.2-plan.md`](../03-chencang-v0.2-plan.md) §4.2, §7.1, §7.4, §7.5, §7.6 and §11 row
N, on top of package M's interface. Where this brief and the plan differ, this brief wins.

## Why

The playtester found Wei the appealing side. A small garrison with one day's notice of every enemy move, reading what
the attacker is doing and preparing the answer, is a different game from Shu's, and has to feel like one, not like the
Shu interface with the labels changed.

## Constraints

- No rule or AI changes beyond bugs you find, which you must report. `attackerMethodForSeed(seed)` picks the opponent.
- Reuse package M's report, cards, forecast and scoring components; extend them by `playerSide`, do not fork them.
- Everything in zh and en, numbers from `tuning.ts`, fonts regenerated from the local sources.
- `src/v03/App.tsx` changes only in route parsing. No `git commit`.

## Deliverables

1. **Choosing a side** (§7.1): the campaign card has two main buttons, 汉军 · 诸葛亮 (`data-testid="start-shu"`, S7-01 art)
   and 魏军 · 郝昭 (`data-testid="start-wei"`, S8-10 art), plus 继续（汉军 / 魏军） when a save exists. Routes `#chencang/shu`,
   `#chencang/wei`, `#chencang/load`. Each side keeps its own save, so one never overwrites the other: verify this
   explicitly, since §12 requires it. Adjust `save.ts`'s key scheme if needed and say what you did.
2. **Opening**: same two exchanges, with Hao Zhao's closing line from §4.2. Act 2 banner in Wei's wording from §7.4.
3. **Deployment**: pick a Wei unit, click a highlighted `DEPLOY_WEI` cell to swap or place, then start.
4. **The day**: Shu's turn from `runAttackerTurn` plays as a skippable replay, then the morning report, then the player.
   结束本日 goes to the night replay and on to the next day's Shu turn. Wei's night order stays hidden from the attacker AI
   until the night resolves.
5. **Wei's unit card** (§7.4): move, attack, 备火, 火箭, 吊石磨, 投石磨, 堆礌石, 投礌石, 筑墙 (act 2), orders (鼓舞, 死守, 夜修, 举火,
   夜袭 with target selection), wait. Disabled entries give the rule's reason, including "prepared today, usable tomorrow"
   and "suppressed today". Remove the "the defender is AI-controlled" gate in `siegeCommands`, keyed on `playerSide`.
6. **守备 tab** (§7.4): replaces 工棚 for Wei. It lists every preparation by wall run with its readiness, inner wall progress,
   gates, and tonight's order. Clicking a row pans to it.
7. **Morning report for Wei** (§7.2's Wei list), with counter cards `suppress`, `cover`, `mound`, `assault`, `nightAssault`.
   Each answers: what is the enemy doing, and what can you do about it now? Also a card for a Shu unit mounting the wall,
   which is the moment Wei most needs to know its options.
8. **Endings and score** (§7.4, §7.5): held → S8-07 with `s8-07` art; Shu routed → S7-07 with Wei wording; city fallen → S7-05 with
   Wei wording. Wei's tiers and parts from `score.ts`. S8-08 is the Act 2 banner art for Wei and the first-sortie or first-torches
   event card on both sides (one per game, only if that event occurs).
9. **How to play for Wei** and a **day-one walkthrough** (§7.6): select Hao Zhao → hoist the millstone → select an archer → light a
   brazier → end the day → (day 2) read the report → fire arrows at the ladder. 重看引导 replays by side. All numbers from `tuning.ts`.

## Tests

- `tests/siege/`: command availability per side; preparation readiness labels; report items for Wei; side-separated saves; scoring
  screen data for all five Wei tiers.
- `tests/e2e-siege/wei.spec.ts`: choose Wei → deploy → hoist and light → end the day → the Shu replay → day 2: fire arrows and drop a
  millstone → play to the ending with a deterministic helper → the score screen; save, reload and check that it matches; start
  a Shu game and confirm the Wei save is untouched. Screenshots to `.artifacts/siege/screens/`: `wei-card.png`, `wei-deploy.png`,
  `wei-day2.png`, `wei-defense-tab.png`, `wei-ending.png`, `wei-howto.png`. Your sandbox cannot start Chromium: write them, and the
  planner runs them.

## Checks to run and report

`npx vitest run tests/siege`, `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege`, `npx vite build`.
Report interpretations and anything not done. Say honestly whether the Wei side has enough to do each day, and what is thin.
