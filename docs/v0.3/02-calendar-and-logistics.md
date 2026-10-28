# Daily calendar, journeys and logistics

Current reference checked October 28, 2026. [Player guide](player-guide.md) · [Governance/orders](03-governors-and-authority.md) · [Wounded rules](09-wounded-retreat-and-captivity-design.md) · [Original design brief](history/design/02-calendar-and-logistics.md).

## Implemented behavior

- One absolute day drives campaign date, journeys, deadlines, battle days, monthly settlement and saved continuation. Months have 30 days; years have 360.
- One-day, ten-day and next-event commands use the same daily engine. Due reports/events and month boundaries can stop advancement early. Reading, switching language and camera changes never advance time.
- The daily cursor records pending/completed battles so each player battle submits once and the global date advances once. NPC-only battles are automatic; they do not require a player turn. Save/reload retains the cursor.
- Journeys carry officers/troops, food and cargo on versioned route snapshots. Departure, arrival, return and safe redirection are real states. Battle-created returns begin moving no earlier than the next strategic day.
- Approved orders reserve stock; dispatch debits it; delivery credits it on arrival. Repeated confirmation cannot duplicate a party. Undelivered cargo remains accounted for through capacity/return handling instead of silently vanishing.
- Daily food uses a fixed-point remainder, including small forces. City troop-service responsibility accumulates over actual service days for monthly accounting. A unit cannot simultaneously be in city, travel and battle rosters.

## City work and officer travel

Work budgets refresh to two points every ten actual game days; month-end income, appointment handovers and monthly search/first-assignment limits remain monthly. Unused work does not accumulate, and event-stopped advances count only elapsed days.

Ordinary officer transfers use a separate `transfer` journey kind through the existing route, provisions, saved-travel and arrival engine. They carry the whole selected healthy/wounded contingent, debit ready source garrison soldiers and outbound/possible-return food once, pause recovery/reorganization while travelling, and station officers immediately on arrival. Governor appointments share retained-contingent travel but wait for the legal office handover. Both preserve spent work and troop XP/type.

After a battlefield resolves, other manual fields stay available. When all surviving fields have submitted, Advance 1 day can finish the shared date once; closing a report and reading governance choices do not themselves advance time.

## Travel and provision defaults

Baseline speeds in `calendar/index.ts`: plain 20 km/day, hill 15, mountain 10. Solo-officer or all-cavalry parties can use light-party modifiers only without wounded; heavy supply trains cap speed according to terrain. Mixed composition, terrain segments and fixed delays determine ETA; do not multiply a road-detour estimate into speed a second time.

Current prototype food rates are city 0.004, travel 0.008 and battle 0.04 per soldier/day. They are design settings, not historical facts or a final balance claim. Previews account for travel/battle/return needs where applicable; cargo food and the party's own rations are distinct ledger roles.

Destination capture, source loss, active battles, capacity and route changes use explicit waiting/return/redirect paths with reports. Coverage of specific paths does not establish every hypothetical sequence; retain an exported save for a newly discovered case.

## Source, completed repairs and evidence

The personnel day snapshot freezes full-day treatment/reorganization eligibility separately from the battle cursor. Supplied city wounded heal 10% per city/type group with stable proportional allocation, once at day close before monthly settlement. Travel, field participants and outside waiting do not heal; same-day arrivals start on the next full day. Rear sources preserve their own XP and rejoin only under shared availability/capacity checks. Recruitment from captivity locks the army for ten supplied city days.

All physical military personnel consume food: healthy, wounded, ordinary reserves, rear sources and captives. Cavalry counts twice. Captives owe food to their holder, without own-army wages. Each day's city, journey and field responsibility is counted once through splits and transfers; city service remains accumulated for month-end. Battle settlement charges its final day once before distributing remaining food. Opening a battle allocates field and rear budgets rather than emptying the entire city store; retained rear personnel can still heal during the field battle.

Retreat/refuge and release routes explicitly use the moving house's access from the contested/holding city. Battle and prisoner returns depart no earlier than the next day. Released armies receive only food actually available in the holding city, capped at the route budget. Busy friendly destinations wait outside without automatic reinforcement; destination loss can redirect them without rerolling capture. Disbanding reduces future upkeep but never erases already accumulated service days.

Sources: [calendar/index.ts](../../src/v03/calendar/index.ts), [day-resolution.ts](../../src/v03/calendar/day-resolution.ts), [engine.ts](../../src/v03/engine.ts), governance services/orders and shared state.

F01–F05 fixed small-party ration loss, early/duplicate loot credit, discarded full-store cargo, advancement past boundaries and same-day return movement. RV01 fixed the separate UI clock lock during NPC-only battles. These findings are closed with regressions, not current to-do items.

Tests include `geography-calendar.test.ts`, `calendar/day-resolution.test.ts`, `engine.integration.test.ts`, `engine.rival-dispatch.test.ts` and the RV browser cases. [Recorded validation](evidence/rv-implementation-2026-10-21/README.md) and [campaign diagnostics](evidence/README.md) describe their limits. Human long-session and low-end checks remain open.
