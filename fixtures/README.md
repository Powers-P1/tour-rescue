# Fixtures

Offline evidence for the deterministic core. No recorded Qloo responses are committed yet. Current files under `synthetic/` are hand-written examples of **our application contract**, not validated examples of Qloo's raw response schema.

Naming: `fixtures/<source>/<endpoint>__<subject>__<variant>.json`, for example
`fixtures/synthetic/insights-heatmap__artist-a__region-pl__take50.json`.

- `<source>`: `qloo` (maintainer-approved recorded live responses) or `synthetic` (hand-written, application-normalized).
- Each fixture has a sibling `<name>.meta.json` with: request path and query (never the API key), recording date, HTTP status, latency in ms, warnings returned by the API.
- Recordings are made by the maintainers with a live key. The key must never appear in a fixture.
- The Qloo developer guide restricts publishing Qloo responses in public repositories, so until that is clarified only hand-written `synthetic` fixtures conforming to our application contract are committed here.

For synthetic metadata, request path/status/latency/recording date are explicitly UNKNOWN or null: no request was made. Do not fabricate a successful HTTP status or timestamp. A `recording-reference` in normalized input does not grant permission to publish either raw data or values derived from it.

## PR1 fixtures

- `synthetic/fit__complete__three-cities.json`: three fictional artist profiles over the same three fictional cities, with hand-calculated expected indices in the metadata. The test suite additionally checks ties, missing evidence, transformed scores and invalid contracts.
- `synthetic/tour__five-dates__one-cancelled.json`: five-date route shape with one cancellation and three repair candidates. All venue facts are unverified and travel measurements are invented estimates. Route feasibility is not implemented or demonstrated in PR1.

## Normalized fit contract

`schemaVersion` is `tour-rescue.fit-input.v1`. Each profile supplies its query ID, artist ID, role, model weight, candidate-set ID, provenance and exactly one observation for every frozen city. An observation is `{ "status": "known", "value": <finite number> }` or `{ "status": "unknown", "reason": "..." }` under `affinity`.

Use **one comparable query vector per artist**, not independent per-city queries stitched together. The adapter's raw field mapping, locality resolution and any cell aggregation remain UNKNOWN. A recording reference must name the immutable evidence, recording time and normalization version; a query ID alone does not identify one response. Record timestamps in ISO 8601 with an explicit offset. PR4 will validate the live capture metadata and query contract.
