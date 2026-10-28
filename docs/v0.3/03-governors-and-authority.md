# Governors, city work and officer transfers

Current reference checked October 28, 2026 against the working tree. [Player guide](player-guide.md) · [Calendar/logistics](02-calendar-and-logistics.md) · [Original design brief](history/design/03-governors-and-authority.md).

## Authority and appointments

The ruler's capital permits direct city work. Other friendly cities use formal governors or local stewards; ordinary commands cannot bypass that authority. Players can view stocks, request resources, order campaigns, transfer ordinary officers, return contingents, appoint/dismiss governors and command participating armies.

Ordinary appointments and dismissals take effect at a monthly boundary. A cross-city candidate carries their healthy and wounded contingent, with troop type, XP and reorganization retained. Departure debits ready garrison soldiers and outbound/possible-return provisions. Treatment and reorganization pause in transit; office changes at a legal boundary after arrival. Existing authority remains until handover. Taking office never requires clearing the contingent.

Choosing the ruler requests personal rule: the effective appointment also moves the ruler's capital and returns the old capital to local governance. Travel or a pending appointment alone does not move the capital. Appointments, dismissals and capital changes preserve spent city work points and resource commitments.

After a conquest report, choose personal rule, a governor or Decide later. The ruler must be present for immediate personal rule. A local victorious officer can govern the new city immediately with their contingent; remote candidates follow travel and monthly handover. Deferred decisions remain in the Inbox across reloads. Lost candidates, replacement, destination loss and late arrival use the existing cancellation/return/rescheduling paths.

## Ordinary officer transfers

Open **Source city → City affairs → Transfer officers**, check one or more ordinary officers and choose a different friendly city. Both capital and autonomous cities expose this entry. The preview gives headcount, healthy/wounded soldiers, route days and provisions; dispatch creates one travelling party and debits food once. Arrival stations them directly without an office change or monthly wait.

Transfers use no work points and preserve troop type, XP, wounded and reorganization. Zero-troop officers may travel. Rulers, serving governors, pending appointees, unavailable officers and officers reserved for approved orders are rejected. Contested source/destination cities, unusable routes and insufficient unreserved food/troops block the whole group without partial effects. Each party respects the existing saved-journey limit of 100 officers.

**Marches & orders** shows travelling groups, including redirected returns. Destination loss and capacity/battle waits use the common journey engine. This entry changes physical stationing; it does not appoint or dismiss a governor.

## Work points and city actions

Each owned city refreshes to **2 work points every 10 actual game days** (days 11 and 21, then the next month's day 1). Unused points do not accumulate. Officer count does not set the quota, though work still needs an eligible living local executor. Advancing ten days and advancing one day ten times use the same clock; early event stops count only elapsed days.

Troop assignment, contingent returns, rewards, fine arms and ordinary transfers use no work points. Other city work retains its one-point cost. Rewards cost 100 gold per recipient; fine arms cost 180. Feasts, rewards and equipment support group selection, shared authoritative eligibility, exact total costs and atomic confirmation. A feast costs one point for the whole selected group, with up to +8 loyalty each; reward gives up to +15 loyalty, arms up to +5 force capped at 105.

Development costs 80 gold and one point, with up to +20 farming or +10 commerce, capped at 500. Existing higher values stay intact. Training checks XP and force independently and rejects only when neither can improve; previews include actual capped gains. Recruitment adds same-type reserve; assignment sets the selected officer's final healthy troop count. City loyalty modifies tax by `0.8 + loyalty / 500` after the original base-tax rounding; food and recruitment formulas retain their rules.

Autonomous governors and NPC capitals share these costs and the ten-day refresh. Economy, appointment handovers, search limits and first-assignment counters remain monthly. Autonomous reinforcement covers ordinary stationed officers while protecting reserves, wounds, reorganization, pending appointments and approved orders. Reward/feast consideration requires officer loyalty below 55. More elaborate multi-city coordination and future-budget simulation remain outside the planner.

## Orders and reservations

Resource requests target friendly cities; campaign plans select Capture, Raid or Sack. Previews expose executable amounts, gaps, garrison/supply constraints, routes and dates. Governor plans retain accept/reduce/wait/cancel and authoritative re-evaluation; capital marches send chosen whole officer forces directly. Approved stock remains reserved until dispatch, then travels and credits only on delivery. Recall is a safe-return request while the journey permits it, never teleportation from an active battle.

## Authoritative sources and checks

Use [city-actions.ts](../../src/v03/governance/city-actions.ts), [authority.ts](../../src/v03/governance/authority.ts), [appointments.ts](../../src/v03/governance/appointments.ts), [officer-transfer.ts](../../src/v03/governance/officer-transfer.ts), [autonomy.ts](../../src/v03/governance/autonomy.ts), [orders.ts](../../src/v03/governance/orders.ts) and [engine.ts](../../src/v03/engine.ts). UI previews consume these rules rather than a second cost model.

Focused regressions cover [group actions](../../tests/v03/governance/officer-group-actions.test.ts), [ordinary transfer](../../tests/v03/governance/officer-transfer.test.ts), [appointment/conquest handover](../../tests/v03/governance/conquest-transfer.test.ts), [work periods](../../tests/v03/governance/work-periods.test.ts) and their browser flows. See [current status](implementation-status.md) for actual validation scope; long player campaigns remain an acceptance task.
