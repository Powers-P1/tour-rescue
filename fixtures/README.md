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
- `tests/helpers/scenarios.ts` assembles the five dates documented in `docs/SCENARIO_DE_2026.md` with fictional venues and booking facts for integration tests, without duplicating the maintained matrices. These tests exercise the actual frozen road snapshot and synthetic fit data with no network access.

## Normalized fit contract

`schemaVersion` is `tour-rescue.fit-input.v1`. Each profile supplies its query ID, artist ID, role, model weight, candidate-set ID, provenance and exactly one observation for every frozen city. An observation is `{ "status": "known", "value": <finite number> }` or `{ "status": "unknown", "reason": "..." }` under `affinity`.

Use **one comparable query vector per artist**, not independent per-city queries stitched together. The adapter's raw field mapping, locality resolution and any cell aggregation remain UNKNOWN. A recording reference must name the immutable evidence, recording time and normalization version; a query ID alone does not identify one response. Record timestamps in ISO 8601 with an explicit offset. PR4 will validate the live capture metadata and query contract.
