# Fixtures

Offline evidence for the deterministic core. **No raw Qloo responses may be committed.** Files under `synthetic/` are hand-written examples of our application contract; the heatmap-shaped Germany fixture under `qloo/` also contains invented values. The OSRM snapshot is separate derived road-model data.

Naming: `fixtures/<source>/<endpoint>__<subject>__<variant>.json`, for example
`fixtures/synthetic/insights-heatmap__artist-a__region-pl__take50.json`.

- `<source>`: `qloo` (explicitly synthetic, response-shaped examples) or `synthetic` (hand-written, application-normalized).
- Each fixture has a sibling `<name>.meta.json` with: request path and query (never the API key), recording date, HTTP status, latency in ms, warnings returned by the API.
- Private live recordings are made by maintainers and stay outside this public repository. The key must never appear in a fixture.
- Only hand-written Qloo examples are committed. Similar field names do not make invented scores real API evidence.

For synthetic metadata, request path/status/latency/recording date are explicitly UNKNOWN or null: no request was made. Do not fabricate a successful HTTP status or timestamp. A `recording-reference` in normalized input does not grant permission to publish either raw data or values derived from it.

## PR1 fixtures

- `synthetic/fit__complete__three-cities.json`: three fictional artist profiles over the same three fictional cities, with hand-calculated expected indices in the metadata. The test suite additionally checks ties, missing evidence, transformed scores and invalid contracts.
- `synthetic/tour__five-dates__one-cancelled.json`: five-date route shape with one cancellation and three repair candidates. All venue facts are unverified and travel measurements are invented estimates. PR2 validates and evaluates this fixture; its missing evidence correctly leaves all three options UNKNOWN.

## Germany fixtures and PR2 integration

- `cities_de.json`: maintained 24-city reference catalogue.
- `osrm_matrix_de.json`: frozen directed 24x24 road-model response with metre/second integer matrices, provenance and timestamp. `parseOsrmMatrix` preserves direction and represents paired null cells as unknown.
- `qloo/heatmap_de_synthetic.json`: three invented artist vectors with synthetic/publication metadata. `cityId` is our annotation, not a Qloo response field. `parseSyntheticHeatmapFitInput` consumes only this explicitly synthetic format and applies the scenario 50/50 policy; it does not use `affinity_rank`, popularity or geohash to invent missing affinity.
- `src/demo/germany.ts` assembles the five dates documented in `docs/SCENARIO_DE_2026.md` with fictional venues and booking facts. Both the Worker demo and `tests/helpers/scenarios.ts` use this builder without duplicating the maintained matrices. Tests exercise the actual frozen road snapshot and synthetic fit data with no network access.

## PR3 decision fixture

`synthetic/decision__germany__policy.json` declares demonstration preferences and bounded search ranges for the same Germany scenario assembled in `tests/helpers/scenarios.ts`. It adds no Qloo observations. Its sibling metadata marks the absent API request explicitly.

At minimum fit 20 and a 350,000 m extra-distance cap, the invented artist/booking evidence selects Nuremberg. The fixture records independently tested changes to Frankfurt at a 354,097 m cap (+4,097 m), or to day off at minimum fit 26 / venue-fee ceiling EUR 499.99. These values demonstrate the deterministic rule, not audience demand or live venue availability. `tests/decision-analysis.test.ts` verifies the complete report, frozen commitments and the two comparison-artist omission runs.

## Normalized fit contract

`schemaVersion` is `tour-rescue.fit-input.v1`. Each profile supplies its query ID, artist ID, role, model weight, candidate-set ID, provenance and exactly one observation for every frozen city. An observation is `{ "status": "known", "value": <finite number> }` or `{ "status": "unknown", "reason": "..." }` under `affinity`.

Use **one comparable query vector per artist**, not independent per-city queries stitched together. PR4 checks the documented `results.heatmap` contract and maps returned geohash cells using the maintained geometry fixture. It uses mean affinity per mapped city, then the core computes within-query percentiles. Missing city evidence stays UNKNOWN. Locality output remains unsupported. A recording reference must name the immutable evidence, recording time and normalization version; a query ID alone does not identify one response. Record timestamps in ISO 8601 with an explicit offset. The audit checks these links and exports only percentile surrogates, not provider scores or cells.

## PR4 synthetic fixtures

- `synthetic/fit__germany__control.json`: a different fictional target over exactly the same 24 cities. Comparison profiles, weights, road facts and preferences remain unchanged. Its invented ranking makes the baseline Nuremberg choice change to day off under the existing demo policy. This demonstrates the isolated control and stop-change report, not measured artist demand. The fixture contains no API recording and its metadata says so.
- `qloo/contract_examples_synthetic.json`: hand-written search and geohash heatmap envelopes following the cited official contract sources. Names, UUIDs and scores are invented. These samples test shape validation, geometry mapping and transport error handling; they are not a live response or proof of complete Germany coverage.

The existing demo has two comparison profiles; the live API supports up to three. Additional comparison evidence must be supplied explicitly, never generated to fill a UI slot.
