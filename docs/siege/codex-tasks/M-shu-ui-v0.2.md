# Codex task M — the Shu interface for v0.2

Planned and validated by Claude; implemented by Codex. The specification is
[`docs/siege/03-chencang-v0.2-plan.md`](../03-chencang-v0.2-plan.md) §7.2, §7.3, §7.5, §7.6 and §11 row
M, on top of the rules (§5, including the §5.11 revision), the AIs and the v0.2 renderer. Where this
brief and the plan differ, this brief wins.

## Why

The playtester's complaints were that nothing happens, climbing looks impossible, and once the engines
burn there is nothing to try. The rules and renderer now answer those, but only if the player can see
them. The acceptance question for this package: **without reading any document, can a new player tell
what the enemy just prepared, how to answer it, how far up the wall they are, and why an attack is not
working?**

## Constraints

- No rule changes. If the UI needs a value the rules do not expose, add a read-only helper and say so.
- Every number on screen comes from `tuning.ts` or from rule observations. No numbers in text.
- All text in zh and en; the missing-key and font-coverage tests must pass. New Chinese requires
  regenerating the font subset with `tools/subset-fonts.py`, using the local sources in
  `.artifacts/font-sources` as earlier jobs did. If that fails, list the missing characters.
- Do not touch `src/v03`. No `git commit`. The Wei side (route, card, panels) is package N; do not start it, but
  do not hard-code Shu where `playerSide` is the natural source.
- Keep to the existing look: S6-05 paper, S6/S8 icons, the existing panel and button components. No new visual
  language. Dense panels must stay readable at 1280×720.

## Deliverables

1. **The day loop**: the player's phase → 结束本日 → `runDefenderTurn` with its replay → `endDay` → night replay
   (skippable) → act banner if any → morning report → the player's next phase. Replays run at twice v0.1's speed.
2. **Morning report** (§7.2): `src/siege/ui/report.ts`, a pure function from `state.log` and `state.preparations` to
   items of `{ code, icon, text, counter }`, covering last night and the enemy's phase. It lists everything in §7.2's
   Shu list, in cause-and-effect wording ("昨夜你夜攻，魏军举火，云梯被烧"). `SiegeMorningReport` is a paper panel opened
   at the start of each day, closed with 知道了, and reopened from a top-bar 晨报 button. Empty days say so plainly.
3. **Counter cards** (§7.2): the first time each enemy move lands, a dismissible card names the move and lists its
   answers, from the plan's §5.5 table. When an engine burns or is destroyed, the card lists **at least three** ways
   forward, and these must reflect what is actually possible now (for example "you have no ladders left" removes that
   line). Dismissals persist in the save's presentation data, as hints do.
4. **Unit card actions**: 压制 (archers and towers), 蒙皮 (infantry next to an engine), 堆土山 (infantry, earth cart), 攀爬
   (on a climbing position under an empty wall cell). Each shows why when disabled, using the rule's reason.
5. **Attack forecast**: an 强攻 checkbox at a climbing position, showing both sets: frontage, casualties, counterattack,
   foothold gain, and foothold after ("立足 +2 → 3/3 登城"). The uphill modifier is shown. Hovering blinks the wall cell's
   foothold pips. A climb on an empty cell has the same checkbox (`predictSiegeClimb`): free at +1, or an assault at +2 with its
   casualties and morale. When a mounted unit is thrown off the wall (`thrownOffWall`), the report says so and says what to do next.
   Explain in the how-to-play panel that the courtyard must be cleared of Wei units to count.
6. **军令**: 夜攻 added to orders; the card explains that the result is unknown until the morning.
7. **城防 panel** (§7.3): one row per wall run: defenders, a pressure bar, icons for its preparations, and footholds per
   cell. Selecting a row pans to it.
8. **Scoring screen** (§7.5): under the existing ending: tier name, score, parts, one line against history, and the
   extended summary table.
9. **How to play** (§7.6): a 招与拆 section with §5.5 in six lines, and 攀爬 and 立足 explained; all numbers from `tuning.ts`.
10. **Day-one walkthrough**, replacing the old one. Steps advance on real state changes: select a ladder → raise it → move
    an infantry unit onto the ladder's base → climb or attack (立足 1/3) → select an archer unit → suppress the wall above
    the ladder → end the day → (day 2) read the morning report → cover a ladder. 重看引导 still works.
11. **Keyboard**: a key that ends the turn for all units that have nothing to do; report it in the how-to-play panel.

## Tests

- `tests/siege/`: `report.ts` for each log code, both the text chosen and the counter; counter-card selection, including
  the engine-loss card's lines changing with what remains; walkthrough step derivation; scoring-screen data; every new
  how-to-play number traced to `tuning.ts`.
- `tests/e2e-siege/`: update `battle.spec.ts`, `howto.spec.ts` and `playthrough.spec.ts` to v0.2. Add `shu-v02.spec.ts`:
  from the Shu start through day 3: raise a ladder, climb or attack, suppress, end the day, three morning report items,
  cover, the assault forecast's two sets of numbers, night assault; then save, reload, and check the state is identical.
  Screenshots to `.artifacts/siege/screens/`: `report.png`, `counter-card.png`, `assault-forecast.png`, `defense-panel.png`,
  `score.png`, `walk-1.png`, `walk-4.png`. Your sandbox cannot start Chromium: write them, and the planner runs them.
  Since you cannot run them, keep their assertions about behaviour and text, not exact pixels. Earlier specs failed because
  Chromium's SVG bounding boxes include stroke widths and whole-image masks, and because selecting a unit reorders the map's layers.
  Use stable `data-testid`s for every new panel and button.

## Checks to run and report

`npx vitest run tests/siege`, `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege`,
`npx vite build`. Report interpretations, anything not done, and any place where a rule made the interface awkward.
