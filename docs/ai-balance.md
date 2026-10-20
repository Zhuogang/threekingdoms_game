# Rival policy and monthly report validation — v0.1

Updated October 19, 2026. The comparison uses the preserved pre-change engine and the final
v0.1 campaign policy. It does not use the deleted Baye reference folder.

## Shipped behavior

Rival aggression changes willingness to start wars against every rival, including other AI
factions. The final defending-troop multipliers are **Cautious 2.00, Balanced 1.35, Aggressive
0.90**. The strict comparison remains:

```text
sum(attacking troops × (0.6 + officer force / 100))
  > defending troops × multiplier + city defense × 7 + 300
```

These are heuristic weights, not probabilities of victory. Combat, resource income, the player's
march rules, and tactical intelligence receive no preset bonuses. Existing deterministic target
ordering, alliances, commander eligibility, opening-turn restrictions, and domestic priorities
remain in force.

All presets share two departure safeguards. AI mustering draws only reserves above 500 and never
removes previously assigned troops to manufacture that floor. An AI march requires at least 500
source reserves and enough remaining food for one current upkeep after ordinary march costs.
Upkeep conservatively includes the departing troops. These checks do not guarantee that later
combat or events cannot cause shortages.

The setting belongs to the saved campaign. Valid planning-phase changes affect the next End
Month, use the existing autosave path, and preserve RNG, committed orders, resources, and player
command statistics. An old save defaults to Balanced; an explicitly invalid value is rejected.

Monthly reports accumulate structured battle outcomes, alliance expirations, and successful
border recruitment. They retain the resolved month's date and persist through interrupted
battles. A legacy midbattle save collects only subsequent observations and marks the report as
partial. Reports retain at most 128 events, preserve deterministic ordering/deduplication keys,
and disclose omitted records. Neither reporting nor diagnostic observation consumes RNG or the
gameplay ID counter.

## Reproducible verification

The unit suite includes a correctness matrix of six player factions × three presets × seeds
190 and 641: **36 runs**, up to twelve months each. Every accepted command and battle
interruption is validated. Campaign saves and interrupted battles are round-tripped through the
actual codec and compared deeply against uninterrupted execution. The queue guard fails after
60 battle resolutions; it never silently truncates a run.

Run the full balance matrix with:

```sh
node tools/ai-diagnostics.mjs
```

This uses the existing build-tool dependency and writes ignored raw output to
`.artifacts/ai-diagnostics/current.json`. `DIAGNOSTIC_MONTHS` can shorten a local smoke run to
1–24 months; its default is 24. The fixed complete matrix is six factions × three presets × seeds
1001 through 1010: **180 runs**. The player issues only End Month and auto-resolves player
battles. Each observer-enabled command is compared deeply with the same command without an
observer, proving the instrumentation has no gameplay effect.

For this implementation, `--baseline` additionally ran 60 campaigns against the M0 snapshot at
`.artifacts/baseline-engine`. That flag requires the captured pre-change snapshot; ordinary
current diagnostics run from the checkout alone. The snapshot receives asserted observational
insertions only, and every observed result is checked against an unobserved execution. Baseline
policy remains its original 1.35 threshold with no new safeguards. In the JSON,
`configuredMultipliers` describes the frozen-candidate comparison table; the baseline still has
only its original Balanced policy.

Durable raw per-run evidence:

- [Pre-change baseline: 60 runs](ai-diagnostics/baseline.json)
- [Initial proposed presets: 180 runs](ai-diagnostics/initial-presets.json)
- [Final tuned presets: 180 runs](ai-diagnostics/final-presets.json)

## Tuning decision

The initial multipliers 1.60 / 1.35 / 1.10 produced first-year attack rates of 79.54 / 82.60 /
90.50 per 100 active rival-faction months. Adjacent increases were only 3.84% and 9.56%, below
the plan's 10% review trigger. Only the outer multipliers were widened; Balanced remains 1.35
and common safeguards are unchanged. The identical matrix was then rerun.

| Metric                                              |   Baseline |   Cautious |   Balanced | Aggressive |
| --------------------------------------------------- | ---------: | ---------: | ---------: | ---------: |
| Runs                                                |         60 |         60 |         60 |         60 |
| First-year AI attacks / 100 rival months            |     156.36 |      72.68 |      82.60 |      94.29 |
| Full observed AI attacks / 100 rival months         |     161.96 |      79.25 |      86.78 |      94.95 |
| Median turn of first successful AI march            |          1 |          1 |          1 |          1 |
| Runs without an AI march                            |          0 |          0 |          0 |          0 |
| AI provision-shortage executions                    | 0 / 25,606 | 0 / 30,271 | 0 / 25,583 | 0 / 25,738 |
| Campaigns ended before 24 months                    |         14 |          2 |         15 |         14 |
| Campaigns ending by the final observation           |         14 |          2 |         15 |         15 |
| Preferred willing attacks blocked by reserve floor  |        N/A |      3,352 |      3,492 |      4,215 |
| Preferred willing attacks blocked by food safeguard |        N/A |          0 |          0 |          0 |
| Source-city safeguard overlap                       |        N/A |          0 |          0 |          0 |

The final adjacent first-year increases are **13.64%** and **14.15%**. All three policies still
attack weak opportunities early: Cautious means fewer qualifying wars, not a grace period or a
promise of peace. Attack rates can exceed 100 because a rival can issue orders from several
cities during one month. Successful march orders are distinct from later completed battles:
armies may stand down or lose their source before resolving. Raw results retain those counts.

The shortage review trigger did not fire in this matrix. The food safeguard's zero blocks here
does not establish that it is unnecessary: exact insufficient/sufficient food boundary fixtures
cover it independently.

Among Balanced runs still observed at month six, 3 of 255 initially active rival factions had
been eliminated (51 campaigns remained observable; nine player campaigns had already ended).
This is below the 50% review trigger. Early-ending campaigns are not extended to later
checkpoints. The raw data includes observed-run and denominator counts at months 6, 12, and 24.

Frozen candidate snapshots are also evaluated under all three final multipliers without
rerunning their worlds. For the Balanced trajectories, 10,597 / 32,325 candidate snapshots meet
Cautious willingness, 15,141 meet Balanced, and 21,015 meet Aggressive. This comparison holds
the candidates fixed; complete campaigns diverge in ownership and available opportunities.

**Decision:** retain 2.00 / 1.35 / 0.90 for this v0.1 update. The measured separation and bounded
state checks pass the specified technical gates. Passive simulations are diagnostics, not proof
that the campaigns are enjoyable or equally difficult. Human play feedback remains necessary.

## Compatibility and report checks

Focused tests cover strict threshold equality, all willingness bands, 499/500 source reserves,
mustering near the reserve floor, exact food sufficiency, invalid setting commands, and actual
next-month AI use of a changed setting. Existing player command validations remain covered.

Report tests cover immediate captures, successful defenses, two queued battles with reload,
legacy partial history, December/year rollover, actual recruitment gains and aggregation,
priority and tie ordering, truncation/deduplication, empty/finished campaigns, stood-down orders,
and malformed imports. A reporting-disabled observation comparison preserves all gameplay fields
and RNG. The existing save envelope version, ruleset, database, and slot keys are unchanged.
