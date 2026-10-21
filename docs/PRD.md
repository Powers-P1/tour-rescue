# Tour Rescue: PRD

## Product decision

A booker has a five-date tour in one region and one cancelled show. Tour Rescue compares exactly three ways to repair that gap: a replacement, a detour, or a day off. All four surviving shows remain locked. The useful output is a decision about what the booker should investigate next, with the assumptions and constraints visible.

Qloo contributes cultural fit. It does not establish ticket demand, fan counts, attendance, venue capacity, availability, fees, or promoter intent. The application must never turn a fit index into a commercial forecast.

The MVP supports one lost date in one existing tour. It does not create an unrestricted tour from scratch, move confirmed shows, book venues, send outreach, sell tickets, or claim that a candidate venue has agreed to a show.

## User and workflow

The primary user is an independent artist's booker or tour manager. They supply the existing five dates, one cancellation, arrival and departure windows, a daily driving limit, a market-spacing policy, and any known budget or booking facts.

1. Open the labelled example or supply an eligible tour.
2. Confirm the cancelled date and the four locked dates.
3. Inspect the frozen candidate cities and artist profiles used for cultural fit.
4. Compare the three repair options, including every failed or unresolved constraint.
5. Inspect the single-assumption breakpoint and the comparison-artist sensitivity results.
6. Download the decision audit and use it to check availability or negotiate terms outside the app.

If no option satisfies the constraints, the product says so. An unknown required fact is not a passed check. A route may pass the driving checks while its venue remains unverified; the UI must distinguish those states before calling an option bookable or recommended.

## Scope clarification: replacement versus detour

In PR2, **replacement** and **detour** are explicit booker-supplied labels for two nominated candidate venues/cities. Replacement is the intended corridor alternative; detour is the alternate corridor choice. The engine computes their travel burden but does not invent a geographic corridor or claim to discover optimal candidates. Both use the cancelled slot's schedule and preserve every locked show. **Day off** removes the cancelled performance and preserves travel to the next locked show.

The candidates must use different cities and venues from each other, and cannot reuse the cancelled venue. A replacement venue in the original city is structurally allowed. Their ordering in the result is replacement, detour, day-off; it is not a ranking.

Market spacing covers **all pairs of retained shows**, including locked shows. The policy uses the **smaller of the two directed road distances**. Either supplied direction below the threshold proves a model violation; both must be known and above the threshold for a pass. Missing directions are unknown, never replaced by the reverse or a straight-line estimate. A zero threshold explicitly disables this restriction.

## Domain contract

`src/core/domain.ts` is an application model, not a representation of a confirmed live Qloo response.

| Concept | Contract |
|---|---|
| Existing tour | Exactly five dated shows, exactly one cancelled; every other show is confirmed and locked. The runtime parser validates these conditions. |
| Identity | City, venue and show IDs are local application identifiers. A Qloo entity ID is separate and remains `UNKNOWN` until resolved. |
| Time | Every instant carries an ISO 8601 string with an explicit numeric offset and an IANA time zone. The offset must agree with the zone. No `Date` objects occur in the domain. |
| Schedule | Arrival deadline, performance start, performance end and earliest departure are explicit. The parser validates ordering and reference integrity; replacement schedules preserve the cancelled instants and zones. |
| Quantities | Distances are integer metres, durations integer seconds, monetary values integer minor units plus a currency code. No silent currency conversion. |
| Evidence | `Knowledge<T>` is either `{ status: "known", value: T }` or `{ status: "unknown", reason: string }`. A reason must explain missing evidence. Known means supplied data, not independently verified truth. |
| Venue facts | Availability is date-specific. Capacity, fees and promoter terms remain unknown until supplied by the booker. Cultural fit cannot fill these fields. |
| Road matrix | Directed legs with a source, method, recording status and quality of `recorded-road` or `estimate`. A missing direction is unknown even when its reverse exists. |
| Repair candidates | Candidate inputs with kinds `replacement`, `detour` or `day-off`; they are not approved bookings or completed constraint results. |

The default production routing input is a **frozen directed OSRM road matrix supplied by maintainers**. PR1 does not fetch it. Recorded distances describe the recording and do not guarantee future traffic conditions. Estimates stay labelled; a successful check against an estimate is conditional, not verified driving feasibility. Haversine distances may be shown only as an illustration and must never replace missing road measurements.

## Cultural fit specification

Fit is calculated separately from travel, cost and constraints. Its input is a frozen city set and one complete, comparable profile per selected artist. A profile must contain exactly one usable finite affinity value for every candidate city. Values within a profile must come from a comparable collection context; unrelated per-city queries must not be stitched into a ranking. The live normalization contract is currently **UNKNOWN**.

For a city within one artist profile of `n >= 2` cities:

```text
percentile = 100 * (less + (equal - 1) / 2) / (n - 1)
```

`less` counts cities with lower affinity; `equal` includes the city itself and all exact ties. All-tied profiles score 50, retain their assigned weight and emit a warning because they do not distinguish cities. The neutral value 50 is a ranking convention, not measured quality. A singleton set is `UNKNOWN`; it cannot demonstrate relative fit.

The scenario entry point enforces the agreed policy: the main artist has 50% of the aggregate weight and comparison artists share the other 50% equally. With no comparison artists the main artist has 100%. The generic `parseFitInput`/`computeFitIndex` functions still accept explicit positive weights summing to 1 within `1e-12`, preserving the later leave-one-out/sensitivity path. These are our modelling weights, not Qloo per-entity weights or learned confidence values. An incomplete included profile makes the aggregate `UNKNOWN`; the system never silently drops it, redistributes its weight or applies hidden per-city reweighting. Missing data is not zero affinity.

The displayed index is relative to the frozen candidate set. It is neither a probability nor a measure that can be compared across different city sets. No kilometres, costs, demographics or invented ticket forecasts are folded into it.

The `weighted-midrank-v1` aggregate uses weighted integer doubled-rank numerators followed by one common division. Final indices are canonicalized to 12 decimal places to avoid floating-point artefacts creating false winners or hiding a flat aggregate. Raw affinities are never rounded or compared with an arbitrary epsilon before ranking.

## PR2 checks and model limits

`evaluateRepairOptions(scenario, fitInput?)` validates inputs before generating the three routes. Confirmed stops keep their IDs, cities, venues, complete schedules and relative order. The proposed performance has status `proposed` and `locked: false`; it never becomes a fictitious confirmed booking. Every failed or unresolved option remains in the output.

`PASS`, `FAIL` and `UNKNOWN` describe checks against supplied data. Aggregation is **FAIL > UNKNOWN > PASS**. A known failing constraint is not hidden by unrelated missing evidence. An estimated road leg may produce a conditional numeric failure while its evidence check remains unknown; this is model infeasibility, not a verified claim about future traffic.

The scheduler greedily allocates driving at the earliest available time between the prior show's `departAfter` and the next show's `arriveBy`, sharing one driving budget across all legs in each calendar day of `drivingDayTimeZone`. It can pause until the next local day and split a long leg across days. A leg longer than the daily limit is not automatically impossible when its window spans several days. Calendar boundaries follow the declared IANA zone, including DST. This models flexible stops along a leg, not actual rest-stop locations, traffic, breaks or driver-rest regulations.

`recorded-road` means a retained road-model response, including the maintained OSRM free-flow snapshot. It does not guarantee future travel time. Hand-written road estimates have an `UNKNOWN` evidence check even when their arithmetic passes. Labelling a `manual-estimate` or `synthetic-fixture` matrix's legs as `recorded-road` is a rejected contradiction. A road-model snapshot with an unknown recording timestamp remains valid input but its road evidence is unknown. Missing legs or unknown durations never acquire invented values.

`routingStatus` combines commitment and travel/spacing checks. `venueStatus` checks the proposed venue's supplied availability for the exact performance date in the **venue city's IANA zone**, and its fee against the stated additional-budget ceiling. The schedule may display an equivalent instant in another zone; it does not change the venue's calendar. Another availability date or zone is not evidence for this performance. Currency mismatch is unknown; no conversion is assumed. A fee equal to the ceiling passes, and one exceeding it fails. This is a **venue-fee-only bound**, not a full budget: fuel, accommodation, cancellation costs, lost revenue and other unpriced costs are excluded. Capacity and promoter terms remain explicit evidence because the input supplies neither an attendance requirement nor an agreement validator.

The combined `status` covers these declared checks only. Passing IDs are not recommendations or confirmed bookings. If all options fail, `decisionState` is `no-feasible-option`; if none passes and at least one remains unknown, it is `needs-evidence`. PR3 supplies the actual choice and breakpoint policy.

Distance/time deltas use the **day-off route** (all four surviving shows) as baseline, under the same constraints and directed matrix. Deltas may be signed and are never clamped or folded into fit. The day-off delta from itself is zero by identity even when its absolute distance is unknown; other missing totals yield unknown deltas. Day off has no performance market, hence no fit score. A candidate outside the supplied frozen fit set has unknown fit; a fit set containing unknown scenario cities is rejected.

The synthetic Germany integration uses the maintained 24-city road matrix and heatmap-shaped fixture. The synthetic adapter reads application-added `cityId` values, not geohash-to-city inference, and rejects inputs lacking explicit synthetic/publication flags. No raw Qloo data is added to the public repository. The original five-date Polish fixture remains deliberately sparse and unverified, so its feasibility is correctly unknown.

## Architecture and delivery boundaries

The core is deterministic, dependency-light TypeScript with no network access. PR2 adds scenario validation, directed-road constraints and option evaluation. Later PRs add breakpoint search, audit generation and a thin server-side adapter for verified Qloo contracts. Maintainers supplied geometry-only cell-to-city mapping separately; the complete live normalization contract and verified scenario coverage remain **UNKNOWN**. Raw Qloo responses must not be published; public Qloo fixtures are synthetic.

The eventual public UI is static on Cloudflare Pages. A Worker owns the Qloo secret, bounded calls, per-IP limits, a daily cap, a kill switch and private response caching. Real response data must not be committed to the public repository. Public offline fixtures are hand-written and explicitly synthetic. The application must remain available free of charge without login through 16 November 2026.

An LLM may summarize already computed evidence. It cannot invent entities, fill missing values, decide whether constraints passed or change numeric results. A template summary provides the complete workflow without an LLM.

## Five-PR roadmap

| PR | Deliverable | Acceptance boundary |
|---|---|---|
| 1 | Repository skeleton, domain types, fit index, synthetic normalized scenario and focused offline tests | No network or key needed; synthetic provenance explicit; fit edge cases covered. No route-feasibility claim yet. |
| 2 | Runtime input validation, locked-date constraints, directed-road checks and exactly three repair options | Preserve every locked commitment; reject invalid inputs; keep failed and unknown checks distinct. Settle corridor and spacing policies. |
| 3 | Breakpoint and sensitivity engine | Report the bounded one-assumption change that flips the decision, or an honest none-found/unknown result. Use deterministic fixtures. |
| 4 | Reproducible audit, control artist and leave-one-artist-out runs, verified Qloo client and Worker | Logged parameters omit secrets; data provenance and unresolved checks survive export; limits and kill switch work. |
| 5 | Front-end comparison, audit download and Cloudflare configuration | Usable responsive flow and labelled offline fallback; maintainers run live probes, review, deploy and merge. |

The five PRs are reviewable increments within the brief's seven-day build window. Maintainers supply real Qloo recordings and the OSRM freeze, review the contract assumptions, and perform deployment. PR1 does not promise a live integration or a deployed service.

## Synthetic scenario

`fixtures/synthetic/tour__five-dates__one-cancelled.json` is a small application-level example: five Polish dates, the middle Warsaw show cancelled, four immutable dates, Radom as the labelled replacement, Kielce as the labelled detour, and a day-off candidate.

City names are real geographic labels; all venues, scheduling, booking circumstances and road measurements are invented. Every road leg has quality `estimate`. The matrix includes a reverse direction with a different value so consumers cannot safely assume symmetry. Missing directions are deliberately not filled. All Qloo IDs and venue facts remain unknown.

Its sibling metadata records that there was no HTTP request, API response, status, latency or recording time. The fixture exercises application structure; it is **not** a Qloo schema sample, live probe result, verified route or claim of venue availability.

## Meaning of success

The completed MVP exposes a usable repair decision whose arithmetic can be reproduced, whose locked dates survive, and whose unknowns are visible. The audit's zero-violations gate must not turn unknown mandatory constraints into passes. Real-world demand, revenue and bookings are outside what this demo can establish.
