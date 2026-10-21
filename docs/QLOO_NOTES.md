# Qloo API notes

Sources: Qloo hackathon developer guide and docs.qloo.com (read 2026-10-15 and 2026-10-21), plus two independent reviews of the plan. Contract checks against the live API will be added below as they are done.

## Confirmed by documentation

- Base URL: `https://hackathon.api.qloo.com`. Header: `X-Api-Key`. Only documented endpoints are allowed (not `/recs` or `/recommendations`).
- `GET /search?query=...&types=urn:entity:artist` resolves a name to an entity ID.
- `GET /v2/tags` lists tag IDs. Tags and audiences must use IDs from `/v2/tags` and `/search`.
- `GET /v2/insights` is GET only, parameters in the query string. Unknown parameters are silently ignored (an empty result may mean a typo).
- Parameters used: `filter.type` (`urn:entity:artist`, `urn:entity:place`, `urn:heatmap`), `signal.interests.entities` (IDs, comma-separated), `signal.interests.entities.weight` (one shared weight), `filter.location` (WKT), `filter.location.query` plus `filter.location.radius` (e.g. 15000 metres), `filter.tags`, `output.heatmap.boundary` (default geohash; other options city or neighborhood), `take` (max 50), `feature.explainability`.
- Affinity scores are normalised per query; do not compare raw scores across queries. Compare ranks or percentiles within one frozen candidate set.
- Server-side caching is allowed; publishing Qloo responses in a public repo is restricted.
- Request limits are not given as numbers; increases are requested through the sponsor's Discord.

## UNKNOWN (to be settled by live probes)

- Exact literal and output shape of `output.heatmap.boundary` for cities, and whether it works with a region-scale `filter.location`.
- Heatmap coverage for mid-popularity and small artists.
- Repeatability of identical queries.
- Whether `signal.location` is honoured for `urn:entity:artist`.
- Per-entity weights through GET (only a shared weight is documented).
- Rate-limit headers and actual limits for the key.
- Analysis/Compare, Trending and Demographic Insights paths (described in the overview, no path found).
- Whether the key works from Cloudflare Workers directly (an official kit mentions a Node harness).
- Tag ID for concert venues.
