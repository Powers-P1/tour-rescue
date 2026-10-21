# Fixtures

Recorded API responses used by the offline test suite. None are committed yet.

Naming: `fixtures/<source>/<endpoint>__<subject>__<variant>.json`, for example
`fixtures/synthetic/insights-heatmap__artist-a__region-pl__take50.json`.

- `<source>`: `qloo` (recorded live responses) or `synthetic` (hand-written, schema-compatible).
- Each fixture has a sibling `<name>.meta.json` with: request path and query (never the API key), recording date, HTTP status, latency in ms, warnings returned by the API.
- Recordings are made by the maintainers with a live key. The key must never appear in a fixture.
- The Qloo developer guide restricts publishing Qloo responses in public repositories, so until that is clarified only `synthetic` fixtures (schema-compatible, hand-written) are committed here.
