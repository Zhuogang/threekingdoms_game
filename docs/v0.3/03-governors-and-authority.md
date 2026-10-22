# Governors, authority, capital work and orders

Current reference checked October 22, 2026. [Player operations](player-guide.md) · [Original design brief](history/design/03-governors-and-authority.md) · [Decisions](00-decisions-and-contracts.md).

## Authority and appointments

The player directly administers the ruler's capital. Other owned cities use a formal governor or local stewards; the command boundary rejects direct micromanagement there. Players can request resources, order campaigns, appoint/dismiss governors and command their participating armies in battle.

Local appointment changes take effect at a monthly boundary. A cross-city candidate must first have zero troops, travel to the destination and reach the legal boundary. Original authority remains until handover. Pending replacements/dismissals persist through save/reload. Traveling candidates, troops, unavailable routes and other restrictions have shared UI eligibility reasons. Candidate loss, replacement, destination loss and late arrival have cancellation/return/rescheduling paths; repeated appointments do not grant extra work points or erase commitments.

## Capital work and autonomy

Monthly work points equal stationed living friendly officers, capped at three. Existing actions are loyalty/security, recruitment, assignment, search, training, feast, food trade, reward, fine arms and relief. Farming/commerce development controls also exist, but all starting cities have values above the current manual cap of 100, so they initially reject the action; [this scale mismatch needs review](../next-steps.md#open-now). [The player guide](player-guide.md#4-装备与本城经营) explains costs and controls.

`city-actions.ts` owns pure availability queries and authoritative execution. Buttons display the same work/stock/authority/commitment/cap reasons the command validates. Recruitment adds reserve; assignment sets a final officer troop count. Fine arms is an officer equipment upgrade, not a separate weapon inventory. Either training cap blocks training.

The monthly autonomy planner acts for non-direct cities within shared costs, staffing, stock reservations and safety priorities. It can reward/equip/relieve using the user-approved legacy rules. The player does not receive per-action control over governor work. More elaborate multi-city coordination and stochastic future-budget simulation are not implemented.

## Requests, campaign plans and recall

A supply request targets a friendly city. Campaign plans select Capture, Raid or Sack. Previews report requested/executable strength or cargo, shortfalls, garrison/supply constraints, route and earliest dates. Whole officer forces are selected up to requested strength; requests smaller than every available force can yield zero.

Accept, reduce, wait and cancel use authoritative reevaluation; stale plans and duplicate execution are rejected. Accepted resources remain reserved until dispatch, then travel and deliver. Legal outbound/waiting journeys can request return; an active battle cannot be teleported home. Reports expose capacity, route, ownership and timing issues. RV04 makes the complete player-owned order/report backlog reachable.

## Source and acceptance

Source: [governance](../../src/v03/governance/orders.ts), `authority.ts`, `appointments.ts`, `city-actions.ts`, `autonomy.ts`, `services.ts`, plus `engine.ts` and `App.tsx`.

RV05 exposes the already-supported incumbent transfer and correct appoint/replace/dismiss labels. RV07 adds reserve/population, officer attributes, shared eligibility and bilingual recruit→assign→march guidance. RV08 completes routine feedback. All are implemented; [RV evidence](evidence/rv-implementation-2026-10-21/README.md) includes actual transfer/dismissal and capital-flow UI checks. Boundary/cancellation, autonomy, authority and order transitions have focused domain tests. Human campaign acceptance remains open.
