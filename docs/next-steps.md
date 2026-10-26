# Current next steps · v0.3

Updated October 22, 2026. Branch `hegemony_of_the_three_kindoms_v0.3`, implementation `1e02e65`. [Overview](v0.3/README.md) · [How to play](v0.3/player-guide.md) · [Current status](v0.3/implementation-status.md) · [Implementation handoff](v0.3/implementation-plan.md).

## Completed

- [x] Core geography, daily travel/logistics, governor autonomy/orders, water-capable battles (now 48×32 painted battlefields), diplomacy/endings, v3 saves and bilingual Wiki integrated.
- [x] Initial F01–F08 defects and follow-up RV01–RV10 repaired/implemented with regressions. [Per-task ledger](v0.3/playability-review-and-todo.md#rv-completion-ledger).
- [x] RV validation recorded October 21: 668 passed/one skip; 34 browser cases plus six affected-case reruns; build/typecheck, production, tactical performance, formatting and portrait checks pass.
- [x] Strategic diagnostic miss and rejected tuning trials documented; user accepted the miss and retained the conservative one-front rival policy.
- [x] Current-version docs separated from old designs/versions; branch naming, feature inventory, player/developer guidance and archive navigation clarified October 22. This is documentation validation, not another gameplay run.

## Open now

- [x] **V/I/Q — development eligibility:** shared cap 500, direct and governor eligibility, retained save scale and short-run economy checks. See the [playability implementation](v0.3/playability-implementation.md).
- [ ] **Player:** four campaign sessions, each 12 months and at least three manual battles. Vary house/scenario; report friction and defects with exported saves.
- [ ] **Player:** real low-end-machine check, covering startup, campaign map, one 48×32 battle, camera/minimap and a long resolution.
- [ ] **Player → A/R/Q:** specific art notes, targeted revisions, runtime review and approval. Seven active generated assets and an inactive paper alternative remain draft. [Workflow](v0.3/06-imagegen-and-artwork.md#next-revision-steps).
- [ ] **Deferred by user:** push/PR/remote CI. No remote publication or CI pass is claimed.

No RV coding task remains open. The development-limit mismatch is repaired in the playability implementation; other new defects should be reproduced and scoped before implementation. Geography uncertainty, narrow AI progression and incomplete dedicated art variants are visible limitations; they are not authorization for a large redesign.

## Player test record

Copy this for each session or issue:

```text
Session / issue ID:
Date, game implementation/commit:
Scenario / house / language:
Browser / OS / device / viewport / zoom:
Starting and ending in-game date:
Campaign months played / manual battles completed:
Exported save before the issue:
Steps to reproduce:
Expected / actual result:
Screenshot or exact message:
Did save/reload change the result?
Pacing/readability/art observations:
Open issue, accepted limitation, or pass:
```

Include at least one long march, resource delivery/shortfall decision, governor transfer across a month boundary, water/shore attack and tactic, multiple-battle day submission if encountered, and export/import/reload. For hardware, record actual specs and observed loading/input/day-resolution responsiveness. For artwork, specify map/region, Fit/working zoom, unit overlap or label/terrain confusion rather than an unspecific request for better art.

## Historical decisions

[v0.2 completion/deferrals](archive/v0.2/next-steps.md) retain that version's balance exceptions, approved portrait/profiles and human-gate deferral. They do **not** waive v0.3 playtests, hardware or art approval. [Earlier versions](archive/README.md) and [v0.3 design/audit history](v0.3/history/README.md) preserve rationale without duplicating the active to-do list.
