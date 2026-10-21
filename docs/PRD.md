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

Fit is calculated separately from travel, cost and constraints. Its input is a frozen city set and one complete, comparable profile per selected artist. A profile must contain exactly one usable finite affinity value for every candidate city. Values within a profile must come from a comparable collection context; unrelated per-city queries must not be stitched into a ranking. PR4 validates the documented geohash response shape, maps cells through `src/qloo/geo.ts` and uses mean returned-cell affinity per city. Missing city evidence remains UNKNOWN. Real completeness for selected artists and provider access from a deployed Worker remain **UNKNOWN** until maintainer probes.

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

## PR3 recommendation policy

`evaluateTourDecision` returns both the original repair report and a separate decision report. The scenario entry still enforces target/comparison weights of 50/50. `recommendRepair` consumes a core-produced repair report and an explicit `tour-rescue.decision-policy.v1` policy; its consistency checks do not replace the scenario parser for untrusted inputs.

The booker declares `minimumFitIndex` as an integer from 0 through 100 and `maxAdditionalDistanceMetres` as a nonnegative safe integer. A show must pass every original feasibility check, have fit greater than or equal to the minimum, and have additional metres less than or equal to the cap. Thresholds are inclusive. There is no conversion between fit and kilometres, hidden utility coefficient or default preference. A negative distance delta remains a saving and can pass a zero cap.

Passing shows rank by fit descending, additional metres ascending, then Unicode code-point option-ID order. The last tie-break creates reproducibility, not a quality claim. Any otherwise viable UNKNOWN show blocks a recommendation, including when another show is known to pass. A proven failure excludes a show despite unrelated unknown evidence. Day off wins only if both shows are definitively excluded and its original constraints pass; its fit remains not applicable. If the fallback is unresolved, the result is `needs-evidence`; if all options fail, it is `no-feasible-option`. A failing day-off route does not veto an independently passing show.

This is a policy for selecting the next option to investigate under declared inputs. The existing venue-fee-only budget scope and driving-model limits remain in force. Neither `recommended` nor PASS means the venue has agreed to a performance.

## PR3 bounded breakpoints

`analyzeNumericBreakpoints` accepts explicit bounds for three scalar axes: extra-distance cap, minimum fit and the existing venue-fee budget in its original currency. The `tour-rescue.breakpoint-ranges.v1` envelope requires all three `{ minimum, maximum }` ranges; known baselines must be inside them. Currency mismatch or an unknown budget is not silently resolved. No route, artist, city set, venue fact or second preference changes during a numeric counterfactual.

Search domains are integer metres, integer fit points and integer minor units. This resolution is part of the contract: a continuous fit threshold has no smallest real increase above an inclusive boundary, so the engine does not invent an epsilon breakpoint. It preserves the fractional fit scores themselves.

The `exact-critical-values-v1` method evaluates the baseline and range endpoints plus both sides of every gate: `distance - 1 / distance`, `floor(fit) / floor(fit) + 1`, and `fee - 1 / fee` for matching currencies. These values cover every decision-constant interval on each declared integer domain. The nearest reversing value is chosen within each axis; equal distances prefer the smaller counterfactual value. Metres, fit points and money are never compared as a common global minimum.

Each axis records bounds, resolution, baseline, checked values and one of:

- `found`: a different recommended option, or a known `recommendation-withdrawn` result. Its witness contains before/after values, signed delta and the complete resulting decision checks. If a closer or equally close counterfactual is unresolved, minimality is UNKNOWN even though the witness remains valid.
- `not-found`: no reversal exists within the declared bounds and resolution, with no unresolved counterfactual. This makes no claim outside the searched range or about other assumptions.
- `unknown`: an unresolved baseline/parameter or unresolved counterfactual prevents the applicable conclusion. Missing evidence never becomes a flip or proof of stability.
- `not-applicable`: no option was recommended at the baseline, so there is no recommendation to reverse.

Daily driving limits, market spacing, venue availability and target-artist identity are not searched by these three axes. Their checks remain fixed and visible. A result must always name its searched parameter and range.

## Comparison-artist sensitivity

`buildLeaveOneArtistOutInputs` and `computeLeaveOneArtistOutFits` omit each selected comparison artist once while retaining the target, frozen city universe and every surviving observation and provenance field. Survivor weights are divided by their actual sum; the scenario 50/50 rule is not reapplied inside an ablation. The before/after weights and removed query/artist IDs are recorded. These generic fit helpers still validate normalized inputs.

`analyzeTourDecision` attaches each ablated fit report to the unchanged baseline routes and feasibility evidence, then recomputes preference checks and ranking. Omission outcomes distinguish retained recommendation, changed option, recommendation withdrawn, unresolved and not comparable. If the baseline needs evidence, dropping an incomplete artist may recover a recommendation, but cannot establish a reversal of a previously known decision.

All requested omissions remain in the summary denominator. The retained-recommendation fraction is defined only for a nonempty set of wholly comparable runs; otherwise it is UNKNOWN. Target-only input is not applicable, not 100% stable. The fraction is an empirical property of these specified ablations, not a confidence interval or a probability of real-world success. PR4 places this evidence in the downloadable audit alongside the separate different-target control run.

The Germany example uses the explicit synthetic policy fixture: minimum fit 20, extra-distance cap 350,000 m, and venue-fee budget EUR 1,000.00. Its baseline selects Nuremberg. Raising only the cap to 354,097 m changes the selection to Frankfurt; raising only the fit floor to 26 or lowering only the budget to EUR 499.99 selects day off. One of two comparison omissions retains the baseline. These results illustrate the policy with invented affinity and booking facts; they are not evidence of actual audience demand.

## PR4 audit and delivery contract

`createDecisionAudit` validates and records the exact candidate set, query parameters and safe warnings, calculation and acquisition times, complete baseline analysis, comparison omissions, and a different-target control. Control validation requires identical comparison profiles and their provenance, model weights, candidate universe, route and preferences. It changes only the target artist. Failed or unavailable control evidence stays UNKNOWN and does not suppress a usable baseline.

Every original-to-option route change names the changed show and fields and lists unchanged locked commitments. Baseline-to-control stop changes require a recommendation in both runs; otherwise the difference is UNKNOWN. The zero-violations gate is scoped to the recommended option and all its declared feasibility/preference checks. No recommendation is UNKNOWN, not an empty PASS. A successful gate is a statement about supplied evidence and model constraints, not commercial feasibility or a confirmed booking.

The replay section exports within-query percentile surrogates, preserving exact order, ties and missingness. `replayDecisionAudit` reruns the core from these inputs; raw Qloo affinity vectors and geohash cells are not distributed. Every profile must link to its matching successful query and original acquisition reference/time. Synthetic inputs cannot masquerade as live responses. When acquisition fails before a fit input can be assembled, the known frozen city set and failed query log remain in the audit.

The API is restricted to the maintained Germany scenario. Demo runs without a key. Live accepts one resolved target, zero to three distinct comparisons and one different control plus bounded preferences; each artist is queried separately. Its booking facts remain explicitly fictional, even when artist evidence is live. Complete response contracts and error semantics are in [API](API.md).

## Architecture and delivery boundaries

The core is deterministic, dependency-light TypeScript with no network access. It includes scenario validation, directed-road constraints, option evaluation, recommendation, bounded breakpoint search, comparison-artist sensitivity and audit replay. The server-only Qloo adapter validates official documented shapes with synthetic test values. Maintainers supplied geometry-only cell-to-city mapping separately. Raw Qloo responses must not be published; public Qloo fixtures are synthetic.

The eventual public UI is static on Cloudflare Pages. The Worker bounds and validates incoming requests, then delegates calculation and private state to the existing SQLite `UnitLedger` Durable Object. The DO persists rate/monthly provider quotas, daily live and daily client-hash quotas, and a six-hour bounded private cache. Keeping these in the same existing DO avoids a second KV binding and non-atomic distributed quota checks. The secret is server-side `QLOO_API_KEY`; live mode is disabled by default. Real response data must not be committed to the public repository. Public offline fixtures are hand-written and explicitly synthetic. The application must remain available free of charge without login through 16 November 2026.

Except in the AI Rescue mode (PR6), an LLM may only summarize already computed evidence. It cannot invent entities, fill missing values, decide whether constraints passed or change numeric results. A template summary provides the complete workflow without an LLM. In PR6 the LLM agent researches and proposes, but the deterministic checker and audit decide; PR4 exposes them as pure typed tools.

## Seven-PR roadmap

| PR | Deliverable | Acceptance boundary |
|---|---|---|
| 1 | Repository skeleton, domain types, fit index, synthetic normalized scenario and focused offline tests | No network or key needed; synthetic provenance explicit; fit edge cases covered. No route-feasibility claim yet. |
| 2 | Runtime input validation, locked-date constraints, directed-road checks and exactly three repair options | Preserve every locked commitment; reject invalid inputs; keep failed and unknown checks distinct. Settle corridor and spacing policies. |
| 3 | Explicit recommendation policy, bounded breakpoint and comparison-artist sensitivity engine | Report a witnessed one-assumption change or an honest bounded not-found/unknown result; preserve constraints, city set and omission provenance. |
| 4 | Reproducible audit, different-target control run, sensitivity export, verified Qloo client and Worker | Logged parameters omit secrets; data provenance and unresolved checks survive export; limits and kill switch work. |
| 5 | Front-end comparison, independent fit/extra-distance axes, evidence cards, audit download, promoter one-pager (A4 print stylesheet, one page, optional browser canvas PNG) and Cloudflare Pages configuration | Usable responsive flow, labelled demo/live and offline-fallback state and a Tag Bridge with at most three sourced common tags or UNKNOWN; no tag bonus in ranking. One-pager uses the selected option and existing audit (artist, city/date, venue placeholder, fit, three comparison-artist slots and omission note, extra travel against limits, PASS/FAIL/UNKNOWN, risks, sources, timestamp) on one A4 page with statuses matching the audit; missing evidence stays UNKNOWN; no server rendering or LLM. Maintainers run live probes, review, deploy and merge. |
| 6 | AI Rescue mode (Pro tier) | Agent (Claude Sonnet 5.5 via Worker, key as secret `ANTHROPIC_API_KEY`; premium may use Claude Opus 5.5) with tools: Qloo fit data, OSRM matrix, web search/fetch, deterministic constraint checker, audit generator. Agent proposes options with evidence and links; every option validated PASS/FAIL/UNKNOWN by the checker; breakpoints deterministic; audit records sources. Demo: limited live sessions per day with saved transcripts; product: paid tier. The agent can never set a constraint to PASS. |
| 7 | Landing page at `/`, app at `/app`, and a six-step guided tour | Same Pages build; responsive English copy; demo table and exact breakpoint computed from the existing core; synthetic taste and recorded-road disclosures. Explicit start/resume, keyboard controls, Esc / Skip, local progress/completion and restoration of an existing app comparison after leaving the temporary demo. |

These are logical delivery increments, not GitHub pull-request numbers. The promoter sheet follows the comparison front end so it can reuse the selected option and the audit without delaying PR4. Maintainers supply private Qloo probes and the OSRM freeze, review contract assumptions, configure secrets, deploy and merge. No implementation PR claims a live probe or deployment that has not been performed.

## PR6 implementation boundary

The implemented **AI Rescue (Pro)** view researches a private server-recorded live Qloo context with the exact `claude-sonnet-5-5` model, or replays one of two explicitly authored synthetic transcripts without provider calls. It proposes 2–4 replacement/detour leads; each is deterministically checked and requires explicit acceptance to replace the corresponding comparison card. Day off, the frozen city set, directed road evidence and four locked shows stay fixed. Public venue research leaves booking facts UNKNOWN. An incomplete AI run cannot be accepted.

Research sources and acceptance history use a separate versioned envelope around the existing decision audit. The agent streams public tool summaries, has persistent daily session limits and bounded steps/output tokens/web calls/time. Exact contracts, limits and the unverified live-provider boundary are specified in [AI_RESCUE](AI_RESCUE.md). “Pro” names the proposed tier; billing is outside this PR.

## PR7 landing and guided tour boundary

The landing follows `docs/mockups/landing-v1.webp`: the lost-show problem, three-step workflow, decision table, breakpoint, evidence, judges' challenge, FAQ and demo links. Its route, option values, statuses and breakpoint are projected from the same frozen demo evaluation used by the app. The table distinguishes feasibility from preference gates and preserves N/A for day-off fit and UNKNOWN for missing evidence. The FAQ states that taste profiles and booking facts are synthetic, the OSRM matrix is recorded, live Qloo runs through the Worker, and fit is a relative taste index rather than a ticket forecast.

The showcased reversal raises only the extra-distance cap from **350,000 m to 354,097 m**, switching Nuremberg to Frankfurt. The guide asks users to apply **354.1 km**, just above that exact boundary. Neither the landing nor guide represents this as a daily-driving-limit breakpoint. If the computed result is unknown or no reversal exists in the checked range, the presentation must preserve that outcome.

The six coach marks cover the cancelled date, three options, extra-distance what-if, evidence, audit/promoter exports and optional AI research. They require explicit start/resume from the landing or app, support keyboard navigation and Esc / Skip, and store only versioned progress/completion in localStorage. An app-initiated guide uses a temporary synthetic workspace and restores the existing comparison on Skip or Finish; a landing-initiated guide keeps the explored demo open. Neither starts paid research automatically.

Both entry points build to `web/dist` without new runtime libraries. App aliases and old root hash links remain supported; unknown paths return a static 404. Routing and storage details are in [DEPLOY](DEPLOY.md). PR7 does not change the deterministic policy, Worker secrets or AI limits.

## Synthetic scenario

`fixtures/synthetic/tour__five-dates__one-cancelled.json` is a small application-level example: five Polish dates, the middle Warsaw show cancelled, four immutable dates, Radom as the labelled replacement, Kielce as the labelled detour, and a day-off candidate.

City names are real geographic labels; all venues, scheduling, booking circumstances and road measurements are invented. Every road leg has quality `estimate`. The matrix includes a reverse direction with a different value so consumers cannot safely assume symmetry. Missing directions are deliberately not filled. All Qloo IDs and venue facts remain unknown.

Its sibling metadata records that there was no HTTP request, API response, status, latency or recording time. The fixture exercises application structure; it is **not** a Qloo schema sample, live probe result, verified route or claim of venue availability.

## Meaning of success

The completed MVP exposes a usable repair decision whose arithmetic can be reproduced, whose locked dates survive, and whose unknowns are visible. The audit's zero-violations gate must not turn unknown mandatory constraints into passes. Real-world demand, revenue and bookings are outside what this demo can establish.
