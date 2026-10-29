# v0.4 player and hardware validation

Status: **not performed**. This is the review packet for the remaining [release gates](../implementation.md#54-human-and-release-checks), not validation evidence. Automated results and known tradeoffs are in the [implementation ledger](README.md#v04-09-integration-evaluation-in-progress).

## Build and preserve saves

Use the `v0.4` branch and record `git rev-parse HEAD` in each session record. Run `npm run build`, then `npm run preview`; open the local address printed by Vite. Use the production build for these sessions. The package/title and compatible save envelope still carry v0.3 identifiers while release acceptance is pending.

Use a separate browser profile, or export your existing campaign before starting another. The Campaign menu provides import/export. Export at the start and end of a session, before a major march, and before any surprising battle or arrival. Keep the original save when investigating a reload difference. The [player guide](../v0.3/player-guide.md) explains existing controls and commands; the in-game Wiki includes the changed status lifetimes.

## Four campaign sessions

Each session requires **12 campaign months and at least three manually commanded battles**. Auto-resolved battles do not satisfy that count. The suggestions below provide weak/strong openings, both scenarios and both languages; the player should make their own decisions. If a faction is eliminated early, retain the failed session as evidence and start another to complete the required duration. Do not discard the loss or count it as a completed twelve-month session.

| Session | Scenario / house | Suggested language | Decisions to examine                                                                                                           | Result  |
| ------- | ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| A       | 190 / Liu        | English            | Protect a small home force while preparing an affordable attack; judge whether an exposed city receives a believable response. | Pending |
| B       | 190 / Sun        | Chinese            | Prepare provisions, use a real shipment or officer transfer, and compare land/water tactical positions when encountered.       | Pending |
| C       | 200 / Cao        | English            | Manage a strong opening with several borders; compare the consequences of preparation and simultaneous commitments.            | Pending |
| D       | 200 / Ma         | Chinese            | Work with limited routes and officers; assess waiting, campaign feasibility, preservation and withdrawal.                      | Pending |

Across the sessions, include a ten-day city work refresh, a monthly bill, a long march, a resource-delivery or shortage decision, a governor handover, an ordinary officer transfer and export/import/reload. If multiple player battles share a day, submit each field and verify that the world date advances once. These continue the existing [playtest coverage](../v0.3/next-steps.md#player-test-record).

After each manual battle, account for starting troops, healthy/wounded survivors, officer fates, provisions, city ownership and any return journey. When possible, observe a Confuse effect consumed on the target's next eligible activation and an Inspired effect consumed on its next qualifying hit. Record what actually occurred; an unencountered case remains unobserved.

If a house loses its last city, distinguish an active recovery expedition from a stranded return. The latter surrenders at a hostile city only after the house has no cities, active campaigns or battles; officers retain their contingents in captivity. Note whether the report makes that outcome understandable. Do not force a loss merely to cover this case.

At the end of each session, answer with a specific example:

- Could you anticipate the risk from the information available to you?
- Did opponents respond to an exposed city or a real invasion?
- Did preparation lead to a credible campaign, or did a faction seem to wait without purpose?
- Was a failed attack understandable? Did an opponent appear to gain unexplained troops, food, work or authority?
- Did movement, tactics and withdrawal create useful choices? Did any action feel compulsory or repeatedly wasteful?
- Did a sound player plan receive a credible result? Which outcome felt foolish, unfair or inexplicably clever?

The diagnostic bot's poor openings and the tactical low-supply costs are findings to investigate, not expected player conclusions. Do not coach the player toward accepting or rejecting the AI.

## Session record

Copy once per session; attach additional issue records when needed.

```text
Session ID / player / date:
Implementation commit:
Scenario / house / language:
Browser / OS / device / viewport / zoom:
Starting and ending campaign dates:
Campaign months / manually commanded battles:
Starting and ending save filenames:

Decision and expected consequence:
Observed consequence and campaign date:
What visible information explained the result?
Save before the issue / reproduction steps:
Did reload change the result?
Pacing, clarity and tactical-choice observations:

Disposition: pending / issue to reproduce / accepted limitation / passed
Reviewer and rationale:
```

## Physical low-end device

Use an actual low-end machine and record its CPU, RAM, GPU, OS, browser/version, viewport and power mode. Browser CPU throttling and this repository's ARM test-container timings are separate measurements.

Use the same production build and record startup/loading, campaign-map input, one 48×32 battle, camera/minimap movement, a crowded battle turn and a late-campaign monthly resolution. Retain the save used for slow resolution. Record actual durations or a browser performance trace where possible, along with visible freezes, missed input, browser errors and whether repeating the action changes the result. There is no newly invented hardware pass threshold: the reviewer must state whether the observed responsiveness is acceptable and why.

```text
Device and build:
Save / scenario / campaign date:
Action / measured duration / repeated samples:
Input responsiveness and visible issues:
Trace or recording filename:
Disposition / reviewer / rationale:
```

## Artwork disposition

No v0.4 AI change grants art approval. Review the existing maps, portraits and unit presentation at Fit and working zoom, noting the map/region, overlapping units, unreadable labels or confusing terrain. Use the existing [art revision workflow](../v0.3/06-imagegen-and-artwork.md#next-revision-steps) for concrete feedback. Record explicit acceptance or remaining revisions separately from gameplay and hardware results.

All four sessions, the physical-device check and artwork disposition remain pending until their results are recorded. The packet itself does not complete any gate.
