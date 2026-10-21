# Qloo server boundary

`createQlooClient` exposes two operations: `searchArtists({ queryId, query })` and `heatmap({ queryId, artistId, role, weight })`. The caller supplies the server secret, private cache, durable quota reservation, frozen candidate set, existing geometry mapping and one bounded rectangular region. The injectable `fetch` and clock let tests exercise the contract without a key or live API calls.

## Verified request and response contracts

- Fixed origin `https://hackathon.api.qloo.com`; GET only; `X-Api-Key` header; redirects are never followed (`redirect: 'manual'`; Workers do not support `'error'`, 3xx is an HTTP error). The key never appears in URLs, logs, returned data or fixtures.
- `/search` sends `query`, `types=urn:entity:artist`, `take=10`. The verified envelope is a direct `results` array. Rows need `entity_id`, `name` and an explicit artist marker in `subtype`, `type` or `types`. Only `{ id, name }` leaves the parser. It never chooses the first match for the caller.
- `/v2/insights` sends `filter.type=urn:heatmap`, `output.heatmap.boundary=urn:geohash`, the fixed `filter.location` WKT and **one** artist UUID in `signal.interests.entities`. It sends **no `take` and no entity weights**. Response rows are `results.heatmap[].location.geohash` and `query.affinity` / `query.popularity`, under `success: true`.
- Runtime validation rejects duplicate cells/artists, mixed cell resolutions, malformed fields and scores outside 0..1. Missing affinity is never replaced with rank, popularity or zero. A valid empty heatmap becomes unknown city evidence.

The heatmap envelope comes from Qloo's [published documentation](https://github.com/qloo/docs-public/blob/main/reference/heatmaps-use-case.md). Search parameters come from its [search reference](https://github.com/qloo/docs-public/blob/main/reference/get-search.md); the direct results array and entity fields were checked in the source of Qloo's published [`@qloo/qloo-harness@0.1.26`](https://www.npmjs.com/package/@qloo/qloo-harness/v/0.1.26), `dist/router.js` and `dist/resolution-provider.js`. These are contract checks, **not live integration verification**. Maintainer probe findings and remaining UNKNOWNs are in [QLOO_NOTES](../../docs/QLOO_NOTES.md).

## Normalization and missing evidence

`parseHeatmapResponse` extracts only validated cells. `normalizeHeatmapCells` takes that parsed list and uses `geo.ts` (`loadCityCells` / `aggregateCellsByCity`) to map cells into our frozen scenario cities. For each artist, a city's statistic is the **arithmetic mean affinity of its mapped returned cells**. Neither cell count nor popularity increases this statistic. This is a cultural-fit proxy, not audience size, ticket demand or estimated reach.

The resulting `AffinityProfile` includes every frozen city. Missing city evidence stays `unknown`; unmapped cells are counted in safe warnings and stay unassigned. The core's `computeFitIndex` then computes within-profile midrank percentiles and model weights. The client does not mix raw affinities across artist queries or enforce scenario-specific 50/50 weights, allowing the core's leave-one-artist-out reweighting. A shorter or longer geohash follows the existing geometry adapter; mixed resolution within one response is rejected because cells could overlap.

## Budgets, cache and audit evidence

Every cache miss must first pass the injected durable `beforeRequest()` reservation for the application budgets of 10 requests/second and 50,000/month. Failure of the ledger is fail-closed. Successful private cache hits consume no provider request. No automatic retries or speculative parallel fan-out happen inside this client.

Default transport bounds are 10 seconds through body download, 8,000,000 response bytes and 60,000 cells. Maintainers raised the byte/cell limits for popular artists during live tuning; see [QLOO_NOTES](../../docs/QLOO_NOTES.md). A caller may lower the byte cap; the timeout is capped at 15 seconds. Heatmap `take` is ignored by Qloo, so these limits and the bounded WKT region are the actual response safeguards. Oversized bodies are cancelled and rejected; partial data is never scored. These caps can make a dense artist query unusable, which remains an explicit failure until maintainers approve a different scenario or cap.

The private cache stores sanitized cells or search identities, warning counts, a response hash reference and original recording time; its default TTL is six hours, with a maximum of 24 hours. It does not store the secret, arbitrary provider warning/error text or the full raw response. Cache hits are revalidated and remapped against the current frozen city configuration. Private cache infrastructure failures are visible safe warnings; writes can fail without invalidating an otherwise verified response.

Every result has a typed success/error and `QueryEvidence`: exact allowlisted parameters, current request timestamps, live/cache source, status and original response hash/recording time. Cached evidence keeps that original provenance while warnings use the current query ID. Arbitrary exceptions and HTTP error bodies never enter results. Provider warnings are represented by counts and a fixed application message. Only stable allowlisted quota codes and bounded retry intervals are retained.

All public contract fixtures are explicitly synthetic and hand-written. Maintainers own live probes, publication clearance and deployment. Worker-to-Qloo access, real scenario coverage and provider reset-window semantics remain **UNKNOWN** until verified by their probes.
