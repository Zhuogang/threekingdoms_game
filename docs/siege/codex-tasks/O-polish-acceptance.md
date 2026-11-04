# Codex task O — polish and acceptance

Planned and validated by Claude; implemented by Codex. The specification is
[`docs/siege/03-chencang-v0.2-plan.md`](../03-chencang-v0.2-plan.md) §11 row O and §12. The planner played a complete Shu game through the real UI
and read all twelve morning reports together. No single-day test can see the problems below.

## Morning report: what is new or dangerous today

Evidence from one game, days 5–12, with these lines repeating every day:

```text
魏军在南墙西段备有礌石，但今日没有守军可使用。
魏军在南墙西段备有礌石，但今日没有守军可使用。
昨夜魏军举火，你未夜攻，魏军放弃了士气回复。
```

And on day 7, for one cart:

```text
魏军火箭命中 土车，耐久 80 → 11。
土车 已被毁，必须改用其他进攻路线。
昨夜 土车 持续燃烧，耐久 11 → 0。
```

And on day 3, for one brazier:

```text
昨夜降雪，南墙东段的火盆熄灭。
魏军在南墙东段备了火，但雪夜灭了火盆。
```

1. **Report what changed or can strike today.** A standing preparation that nobody can use today appears at most once, the day it first becomes unusable. It stays visible in the Defence tab. Merge
   the same event on several cells of a wall run into one line with a count ("南墙西段备了 2 处礌石"). Never print two identical lines.
2. **One event, one line.** Chain the events of one engine in one night into one line ("土车被火箭烧毁（80 → 0）"), with the counter for the loss. A brazier doused by snow is one line per wall run, whether it was lit
   yesterday or earlier.
3. **Limit the report.** At most about five items, threats first; the rest behind a "more" line. Keep it short enough that a player reads it every morning.
4. **Chinese spacing.** Templates print stray spaces: "魏军在南墙西段 备火", "魏军火箭命中 土车", "昨夜 土车 持续燃烧". Fix this at the template or helper level, for all of them, and add a test that no zh report string has a space next to a
   CJK character.
5. **Wording**: a unit thrown off the wall says "退到城下", not a wall run's name, since it is on the ground: "王平因士气过低被打下城，退到城下。"

Apply all of this to both sides' reports. Wei's is the worse of the two: see `.artifacts/siege/screens/wei-day2.png`, where day 2 runs off the bottom of the screen with seven or more items, including two separate "raised a ladder"
lines, two "covered" lines, and the same counter text repeated. Merge those by kind ("蜀军在南墙东西两段都架起了云梯"), and let Wei's cap apply too. The panel must never need scrolling at 1280×720 with the cap in place.

## Smaller review items

- **Preparations tab**: it still lists empty runs such as "North wall, west run · 0 troops". Package M's Defence tab skips quiet runs (see the `quiet` check in `SiegeApp.tsx`). Share that logic.
- **Side selection**: `wei-card.png` shows the start page with the Chencang card below the fold, so the two side buttons do not appear in it. Scroll the card into view for the screenshot. Check whether the sticky "Playtest fixtures / 新战役" bar can
  cover the side buttons when the card is scrolled to the bottom of the page, and if it can, fix it within the siege card's own layout, without changing `src/v03` beyond the existing route parser.
- **Wei's late game**: package N reported that in two automated continuations, seed 1 had no enabled direct actions (excluding movement, orders and standby) on days 9–12, and seed 228 on days 10–11. Look at why. If Wei's units have simply retreated to the
  courtyard and are waiting, that is fine, so say so. But if a unit in reach of the enemy cannot do anything useful, or the defender's retreat is premature so that the walls are abandoned while still holdable, say what you would change. Fix it if it is a small AI
  or command bug, and report it if it is a design question.

## Defender AI: stop wasting torches

In that game the defender chose 举火 every night from day 5 to day 12, gave up its morale recovery eight times, and caught nothing, because the attacker correctly avoids a night assault after seeing torches. So the night order
stopped being a decision. Change the §6.1 cascade so that after a night of torches that caught nothing, the defender does not choose torches again for at least two nights, and falls through to the other options (sortie, repair,
hold fast, rally). Deterministic, and with no hidden information. Then rerun `node tools/siege-sim.mjs 200 --strict` and report the table against plan §6.4. This helps Wei a little, so check that the order `brute < careful < anyPrice` still holds and that `careful` has not dropped far. You may retune within the J2 and J3 bounds to restore the §6.4 numbers. If they move by more than 5 points, report why.

## Package O's own list (plan §11)

6. Both sides have one complete end-to-end game. S8-08's event card is reached. Fonts regenerated from local sources.
7. `docs/siege/00-progress.md` updated to v0.2: where things are, branches and commits, what changed from v0.1, commands, known issues. It is the first thing read on a new machine, and its current text describes v0.1. Keep its structure.
8. A short player guide section in the progress document: how each side plays, in plain Chinese, in a few lines each.
9. `docs/siege/03-chencang-v0.2-plan.md` §12: tick what is demonstrably done, and leave unticked what needs the user's playtest (30-minute game, approval of each side).
10. `npx prettier --check src/siege tests/siege tests/e2e-siege tools docs/siege` passes, including generated JSON. Do not hand-edit generated files; fix the generator if needed.
11. Report any remaining v0.1 text, tests or code paths that no longer apply (for example, twenty-day wording, or `competent`).

## Constraints

Do not touch `src/v03` except the route parser from package N. No `git commit`. Your sandbox cannot start Chromium: write specs, and the planner runs them. Keep assertions on behaviour and text, not pixels.

## Checks to run and report

`npx vitest run tests/siege`, `npx vitest run` for the rest of the repo (report any failures, and whether they exist at `main` too; the v0.3 performance tests are known to fail on this machine), `npx tsc --noEmit -p .`,
`npx vite build`, `node tools/siege-sim.mjs 200 --strict`, and `--trace` for one game on each method. Say honestly what is still weak.
