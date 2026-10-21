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

- ~~Exact literal of boundary~~ resolved: `urn:geohash` or `urn:entity:locality`; city names must be derived from locality `disambiguation` or point-in-polygon.
- Heatmap coverage for mid-popularity and small artists.
- ~~Repeatability~~ resolved: identical.
- Whether `signal.location` is honoured for `urn:entity:artist`.
- Per-entity weights through GET: not supported (single weight only).
- Rate-limit headers and actual limits for the key.
- Analysis/Compare, Trending and Demographic Insights paths (described in the overview, no path found).
- Whether the key works from Cloudflare Workers directly (an official kit mentions a Node harness).
- Tag ID for concert venues.

## Live probe findings (2026-10-21, behaviour only; no Qloo data published)

- Rate limits from headers: 10 requests/second, 50,000/month.
- `output.heatmap.boundary` accepts only `urn:geohash` or `urn:entity:locality` ("city" returns 400). `take` is ignored by the heatmap.
- Geohash cells are 5 characters (about 5 km); `affinity` is min-max normalised to 0..1 per query. Number of cells grows with artist popularity (global act thousands, mid-level hundreds, small act tens for a country-sized region). Latency about 1-2 s.
- Locality output returns districts with a `disambiguation` string (e.g. "Mitte, Berlin, Deutschland"), no city field; payload can reach hundreds of MB for a global act (take ignored), so cache it and restrict the area.
- Identical queries return identical results.
- With several artists in `signal.interests.entities`, a very popular comparison artist dominates the result (rank correlation 0.99 with that artist alone). Leave-one-artist-out is therefore required.
- `signal.interests.entities.weight` takes one positive number or very_low..very_high, not a list.
