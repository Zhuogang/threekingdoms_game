# Codex task P4 — once a unit has mounted, the next one goes straight up

Planned and validated by Claude; implemented by Codex. This is the user's decision after their second playtest, and they said: "现在我们都不考虑平衡". Implement the rule as specified, report what the simulation does, and **do not tune anything to compensate**.

## The rule

Today, mounting clears the cell's foothold (`gainWall` in `src/siege/rules/combat.ts`), so every following unit has to build 3 footholds again. New rule:

- **Mounting keeps the foothold at 3.** A stored 3 now means "the breach is open". It was only ever transient before, since reaching 3 always mounted and reset, so no new state field or save format change is needed. `save.ts` already accepts 0–3.
- **Going through an open breach takes one normal climb.** This already follows from `predictSiegeClimb` (`footholdAfter` 3, `wouldMount` true) and `gainWall`, once the reset is gone. It has no casualties and needs no build-up.
- **The top cell must still be empty.** A unit that has just mounted has `moved` and `acted` set, so it blocks the cell until the next day. That gives at most one unit per day through a ladder, with no extra rule.
- **A breach closes** in exactly these ways:
  1. **A living Wei unit stands on the cell** ("sealed"). Add `sealBreaches(state)` and call it in `applySiegeAction` next to `cancelOccupiedPreparations`. For each living Wei wall unit on a cell with foothold 3, call `changeFoothold(state, cell, 0, 'sealed', unit.id)`. A Wei unit on a cell with foothold 1 or 2 changes nothing, as today.
  2. **The unit is thrown off the wall from that cell.** Existing behaviour in `combat.ts`: keep it.
  3. **The position is gone**: the ladder raised there is wrecked or lost, and no filled wall foot lies directly south.
- **Night clean-up** (`day.ts`, the loop over `next.footholds`): a cell with foothold 3 survives the night with nobody at the base, as long as its position still exists (a usable ladder with `raisedAt` on that cell, or `isWallFoot(next, x, y + 1)`). When the position is gone, clear it with the existing `nightLadderDestroyed` / `nightPositionEmpty` reasons. Cells with foothold 1 or 2 keep today's rule exactly.

## AI

- `src/siege/ai/attacker.ts`: do not pay for an assault on an open breach. In the climb action, only pass `assault: true` when the top's foothold is below `T.footholdComplete`.
- `src/siege/ai/defender.ts` needs no change. `wallThreats` already gives raised ladder tops pressure, and the "cover the climbing cell" goal walks defenders onto empty tops, which now seals the breach. Add a test that proves it. If the test shows the defender never seals, stop and say so in your report; do not rewrite the AI.

## Interface

- **`climbGuide`**: add `breach: boolean` to `ready` (the top's foothold is 3) and to `allyAbove`. New sentences in `src/siege/i18n/zh.ts` and `en.ts`:
  - `ready` with a breach, ladder or wall foot alike. `climbBreachOpen`, zh: 缺口已打开：点「登城」直接上墙。 en: The breach is open. Climb to go straight onto the wall.
  - `allyAbove` with a breach, ladder or wall foot alike. `climbAllyAboveBreach`, zh: 上方被{name}占着：{name}沿城墙走开后，下一支一步上墙。 en: {name} holds the wall above. Once that unit moves along the wall, the next one goes straight up.
- **One click.** In `SiegeApp.tsx`, `command('climb')`: when the guide is `ready` with `breach`, act immediately with a plain `{ type: 'climb', unitId }` instead of opening the climb forecast. There is nothing to compare and nothing to confirm.
- **Walkthrough**: Shu step 4 also completes on a `wallGained` event for `next.infantryId`, because going through an open breach logs no foothold change. Without this the step could never finish.
- **Morning report** (`src/siege/ui/report.ts`, following the existing patterns): a `footholdChanged` event with reason `sealed` gets a line: zh: 魏军站回{cell}，缺口被封住。 en: Wei retook {cell} and sealed the breach. No coordinates: use the existing place-name helper. It applies to both sides, and for Shu it sorts as a threat.
- **Wei side**: add one sentence to the existing text that appears when Shu has mounted (the key whose zh starts 蜀军已登城): zh: 站回缺口那一格就能封住，否则后面的蜀军会一步上墙。 en: Stand on that breach cell to seal it, or more Shu will go straight up.
- **How to play**: add to `howFootholdBody` in both languages. zh: 登城后缺口保持打开：前一支走开，下一支一步上墙，一架云梯每天最多上一支；魏军站回这一格、把部队打下城，或云梯被毁，缺口才关上。 Write the English to match.
- **Rendering**: leave the foothold pips as they are. Three lit pips on an open breach is the right reading, and it persists while a unit stands on top.
- If a new glyph is missing, regenerate the font subset the way P did.

## Tests

- New `tests/siege/breach.test.ts`, driven through `applySiegeAction` and `endDay`:
  - Mounting leaves foothold 3 and logs `wallGained`.
  - While the first unit stands on the cell, a second unit's climb is rejected. After it moves along the wall the next day, one normal climb mounts the second unit with no casualties.
  - A third unit cannot use the same ladder that day.
  - A Wei unit moving onto the breach sets it to 0 with reason `sealed`, and the next climb is +1 again. A Wei unit on a cell with foothold 1 or 2 leaves it alone.
  - Foothold 3 survives a night with an empty base. Foothold 1 or 2 is still cleared.
  - A wrecked ladder clears it at night. A unit thrown off the wall clears it.
  - All of the above also hold for a filled wall foot route where they apply.
  - A save with foothold 3 round-trips.
  - The attacker AI never assaults an open breach. The defender AI, given a free unit in reach, walks onto an empty breach.
- `tests/siege/climbGuide.test.ts`: `breach` on `ready` and on `allyAbove`, and the new sentences in both locales.
- Walkthrough: step 4 completes when the infantry mounts through an open breach.
- `tests/e2e-siege/climb-guide.spec.ts`, 1280×720, zh and en, real clicks, with fixtures:
  - Foothold 3 on (18,16), the top empty, 王平 on (18,19): the context shows `climbBreachOpen`, and one click on 登城 puts him on the wall with no forecast panel.
  - 魏延 on top with foothold 3, 王平 on (18,19): the context shows `climbAllyAboveBreach` naming 魏延, and 登城 is grey.
  - No panel scrolls.
- Existing tests that assert the foothold is 0 after mounting describe the old rule: change them to the new one and list every test you changed, with the reason, in your report. Do not delete coverage.

## Constraints

- Do not touch `src/v03`, `src/siege/rules/tuning.ts` or generated art.
- Follow the surrounding style, and keep player-facing text free of coordinates.
- Your sandbox cannot start Chromium; the planner runs Playwright.
- Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege`, `npx vitest run tests/siege --maxWorkers=1`, and `node tools/siege-sim.mjs 200 --strict`. Include the simulation's whole table in your report. It will move, and it exits non-zero. Do not tune anything to chase it.
- Do not commit. Finish with a short report: what changed, which tests changed and why, the simulation table, and anything you could not verify.
