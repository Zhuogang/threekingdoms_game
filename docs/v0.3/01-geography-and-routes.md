# Geography, road estimates and travel

Current reference checked October 22, 2026. [Player guide](player-guide.md) · [Calendar/logistics](02-calendar-and-logistics.md) · [Original research tables and citations](history/design/01-geography-and-routes.md).

## Included

The active geography data in [geography/index.ts](../../src/v03/geography/index.ts) defines **24 city anchors and 42 configured links** shared by the scenarios. Each route distinguishes anchor-to-anchor straight-line distance, estimated road distance/range, terrain profile and fixed delays. A party's actual arrival estimate is calculated separately from its saved route and composition.

| Example            | Straight line | Modeled road               | Nominal baseline |
| ------------------ | ------------- | -------------------------- | ---------------- |
| Hanzhong–Chang'an  | About 225 km  | 400–450 km; nominal 425 km | 33 days          |
| Chenliu–Xuchang    | About 90 km   | 100–120 km; nominal 110 km | 6 days           |
| Wancheng–Xiangyang | About 115 km  | 130–155 km; nominal 140 km | 7 days           |

These are baseline route estimates, not guarantees for every force. Configured segment speed, officer/light-cavalry composition, supply train and delays affect party ETA. There is no special 30-day minimum for Hanzhong–Chang'an.

The route UI displays distance, route cities and dates; journey progress uses the saved multi-hop route. Zoom and painted line length never alter travel time. Strategic routes remain configured connections; universal tactical water access does not permit arbitrary travel across rivers or seas.

## Research confidence and limits

The original [city anchor table](history/design/01-geography-and-routes.md#2-城市锚点先明确古城再画地图), [42-link audit](history/design/01-geography-and-routes.md#4-42-条现有边的首轮全量审计) and sources are preserved. Some locations are regional representative points, not excavated city gates. Five C-grade anchors have a [sensitivity report](evidence/anchor-sensitivity.md); it measures how anchor uncertainty changes straight-line distances, not the correctness of ancient roads or ETAs.

Most road distances are terrain-informed estimates. Source-certified ancient road polylines, historical Yellow River/lake-shore reconstruction and directional ferry capacity are not complete. Map river/ridge overlays are generalized and explicitly illustrative. Do not advertise the atlas or battlefields as a surveyed reconstruction of 190 CE geography.

Current source: `geography/index.ts`, `geography/illustration.ts`, `calendar/index.ts` and `governance/services.ts`. Regression coverage includes `tests/v03/geography-calendar.test.ts` and rendering/campaign-party tests. Better-sourced future geography should update data, explanations and tests together; it is not an automatic requirement to add new systems in this candidate.
