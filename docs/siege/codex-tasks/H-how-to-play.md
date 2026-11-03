# Codex task H — how to play: guide panel, day-1 walkthrough, easier 督造

Planned and validated by Claude; implemented by Codex. Builds on tasks F and G
(`src/siege/ui/SiegeApp.tsx`, `SiegeStory.tsx`, `story.ts`, `src/siege/i18n`).

## Why

The first playtester did not know how to play, and especially not how to build
engines or what 督造 does. Today building lives in the 工棚 tab, while 督造 is
hidden in the collapsed 军令 `<details>` of the unit card; nothing in the game
explains either, nor what to do with an engine once it exists.

## Constraints

As task G: rules (`src/siege/rules`), AI and sim unchanged; no edits under
`src/v03`; no `git commit`. All text in zh and en; the missing-key test and the
font-coverage test must pass (if the font test fails, list the missing
characters in the report — the planner regenerates the fonts).

## Deliverables

1. **「玩法」/ "How to play" panel.** A top-bar button (also key `H`) opens a
   panel on the S6-05 paper, closable with Esc or a close button, with short
   sections, each a few lines:
   - 目标: hold a Shu unit in 帅府前庭 (the courtyard, rows 7–8 north of the
     inner wall) at the end of a day before grain (20 days) runs out; losing
     Zhuge Liang's main body loses the battle; withdrawing ends it historically.
   - 一日: each unit moves once and acts once; 结束本日 (E) lets Wei act.
   - 造器械: 工棚 tab → 营造…; each workshop builds one at a time; days per kind
     **read from the rules' constants** (云梯, 冲车, 土车, 井阑 from 第二幕);
     at most six usable engines; a finished engine appears at its workshop door
     at the end of the day.
   - 督造: Zhuge Liang's order — one workshop that is building finishes a day
     sooner; one order a day (鼓舞 / 督造 / 轮换).
   - 用器械, one line each: 土车 → move to the row just south of the trench and
     填堑 (outer row first, then the row under the wall; infantry fill at a third
     of a cart load); 云梯 → same row, 架梯, then a unit on the ladder 登城;
     冲车 → along the road to the bridge before the south gate, 撞门 once a day;
     井阑 → shoots over the parapet. Use the rules' numbers, not hard-coded text.
   - 城防: fire arrows burn engines near the wall, millstones break rams; the
     frontage caps (attack forecast shows them); keep wounded units rotating.
   Opening the panel does not change the game state.
2. **Day-1 walkthrough.** On a new game, after deploy, a small step box (not
   modal; the map stays usable) walks through, advancing when the player has
   actually done each step (derived from state/UI, not from a "next" click):
   1. open the 工棚 tab; 2. 营造土车 at a workshop; 3. 营造云梯 at the other;
   4. 督造 one of them; 5. 结束本日. Then, when the first earth cart exists:
   6. select it; 7. move it to the row south of the trench (highlight those
   cells); 8. 填堑. The control each step needs gets a pulsing outline. "跳过引导"
   ends it; done/skipped is remembered in the save's presentation data (like
   `dismissedHints`) and a "重看引导" button in the 玩法 panel restarts it.
   While it runs, first-time hints do not pop over it.
3. **督造 from the workshop.** In the 工棚 tab, each workshop that is building
   shows a 督造 button (Zhuge Liang's order, same command as the 军令 one),
   disabled with the rules' reason when unavailable (order already given today,
   nothing building, Zhuge Liang routed…). Keep the 军令 path working.
4. **Deploy-phase clarity.** In deploy, the 工棚 tab says building starts after
   开始战斗 instead of showing only disabled buttons.

## Checks to run and report

- `npx vitest run tests/siege`, `npx tsc --noEmit -p .`,
  `npx prettier --check src/siege tests/siege tests/e2e-siege`,
  `npx vite build`, `node tools/siege-sim.mjs 50` unchanged from before.
- Unit tests: walkthrough step derivation (each step completes on the right
  state change); the 玩法 panel's numbers come from the rules (change a
  constant in the test's view → text follows, or assert against the constants).
- Extend `tests/e2e-siege/battle.spec.ts` (or add `howto.spec.ts`): open and
  close 玩法; follow the walkthrough steps 1–5 by clicking, including 督造 from
  the 工棚 tab, and check the queue's days left drop by one; skip, reload, it
  stays skipped. Screenshots to `.artifacts/siege/screens/`: `howto.png`,
  `howto-en.png`, `walk-1.png`, `walk-4.png`, `walk-6.png`,
  `workshop-supervise.png`. Your sandbox cannot start Chromium — write the
  spec; the planner runs it.
- Report interpretations and anything not done.
