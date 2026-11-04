# Codex task P3 — the gold frame must always be clickable

Planned and validated by Claude; implemented by Codex. From the user's second playtest: "魏延登城后，我其他的部队就点不到云梯的金框了". They also said balance is not the concern right now: the operation itself feels wrong.

## What the planner reproduced with real clicks

Fixture: west ladder raised, 魏延 on the wall at (18,16), 王平 at (18,20) directly south of the ladder, 廖化 at (17,20). No 移动 pressed.

1. With 廖化 selected, click the centre of the gold frame on (18,19). Selection jumps to 王平 and nothing moves. `document.elementsFromPoint` at that point gives `select:shu-wangping`, then `reachable`: 王平's tall hit rect covers the frame.
2. With 王平 selected, the same click does nothing, because his own head covers the frame. This is the position the guide itself tells players to walk to ("先走近"), so the player is sent to a spot from which the frame cannot be clicked.
3. After pressing 移动 the click works, and 王平 reaches (18,19). The panel then says "金框还差 0 格，今天已移动：明天再走。", which is nonsense. The real reason is that 魏延 holds the top cell: `predictSiegeClimb` needs an empty top, and `climbGuide` only checks for enemies there.

## Changes

### 1. Click priority, `src/siege/render/SiegeMapView.tsx`, `onPointerUp`

Today: `green && (preferCells || !topSelect)`. Change to:

```ts
const framed =
  green &&
  tutorialCells.some((c) => `${c.x},${c.y},${c.level}` === green.getAttribute('data-cell'));
const ownBody = topSelect === selected && performance.now() - selectedAt.current >= DOUBLE_CLICK_MS;
if (green && (preferCells || !topSelect || framed || ownBody)) {
  /* onCell, as today */ return;
}
```

- **A gold frame that is also green always wins.** It is the cell the game told the player to go to.
- **The selected unit's own body never blocks its own green cell**, except during `DOUBLE_CLICK_MS = 500` after that unit became selected, so a double-click on a unit never spends its move. `selectedAt` is a ref updated in an effect on the `selected` prop.
- **Another unit's body over a plain green cell, without 移动 pressed, still selects that unit.** The player can reach that cell by clicking its upper half, which the body does not cover, or by pressing 移动. Keep this: it is how players switch units.
- The `deploy` path is unchanged.

### 2. Guide, `src/siege/ui/climbGuide.ts`

Add a kind, checked after `defenderAbove`, and applied to the chosen route as well as to the unit's current cell:

```ts
| { kind: 'allyAbove'; allyId: string; route: 'ladder' | 'wallFoot'; top: Cell; base: Cell; atBase: boolean }
```

- At a climbing position whose top holds a living Shu unit, return it with `atBase: true`.
- When the chosen route's top holds a living Shu unit, return it with `atBase: false`. The top is `raisedAt` for a ladder and the cell directly north for a wall foot.
- An unraised ladder has no top, so `ladderNotRaised` comes first for that route.
- The route choice itself does not change.
- Invariant, with a test: `walkToBase` is never returned with `steps === 0`.

Sentences, in `src/siege/i18n/zh.ts` and `en.ts`, as `climbAllyAbove`:

- zh: 梯顶被{name}占着：先让{name}沿城墙走开，才能继续攀爬。 Use the same sentence for a wall foot, replacing 梯顶 with 墙头 (`climbAllyAboveFoot`).
- en: {name} holds the top of the ladder. Move that unit along the wall, then climb. For a wall foot: {name} holds the wall above. Move that unit along the wall, then climb.

Keep the gold frame on `base`. The label in `SiegeApp.tsx` follows the route: 梯底 or 墙脚. If a new glyph is missing, regenerate the font subset the way P did.

## Tests

- `tests/siege/climbGuide.test.ts`: `allyAbove` at the base and on the way, for a ladder and for a wall foot; `defenderAbove` still wins over it; an unraised ladder still gives `ladderNotRaised`; the `walkToBase` invariant above; both sentences in both locales.
- `tests/e2e-siege/climb-guide.spec.ts`, 1280×720, in zh and en, real mouse clicks. Use a fixture like the one above, with no walkthrough running (`status: 'skipped'`), and `clickCell(page, 'reachable', ...)`, without pressing 移动 unless stated:
  - 廖化 selected: clicking the frame moves 廖化 onto (18,19). 王平 stays where he is.
  - 王平 selected, wait 600 ms: clicking the frame moves him onto (18,19), though his own head covers it. The context then shows the `allyAbove` sentence naming 魏延, and it does not contain "0".
  - 魏延 at his default (20,21), selected, wait 600 ms: clicking (20,20) moves him north. This replaces the old "without Move selects" case in the northern-cell test.
  - 姜维 selected, double-click 魏延's upper body at the centre of (20,20): 魏延 becomes selected and nothing moves (compare snapshots). (20,20) is not green for 姜维.
  - Keep "another infantry's upper body selects through a green cell without Move" and the fill-trench and wall-foot cases.
  - No panel scrolls (`expectNoPanelScroll`) with the new sentence.

## Constraints

Same as P. This is interface only: do not touch `src/siege/rules`, tuning, the AI, `src/v03` or generated art, and do not change what is legal. `climbGuide` stays read-only. Follow the surrounding style. Do not run the simulation, since no rule changes. Run `npx tsc --noEmit -p .`, `npx prettier --check src/siege tests/siege tests/e2e-siege docs/siege`, and `npx vitest run tests/siege --maxWorkers=1`. Your sandbox cannot start Chromium; the planner runs Playwright. Do not commit.
