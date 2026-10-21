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

## Mapping cells to cities

Geohash cells (and districts) are not cities, so the project maps them with its own geometry. This section describes our method only; it makes no claim about the content of Qloo responses.

- `scripts/build_city_cells.py` reads `fixtures/cities_de.json` and, with an own geohash encoder/decoder (stdlib only, self-tested), lists every cell of precision 5 whose centre lies within 15 km (20 km for Berlin, Hamburg and Munich) of a city centre. Output: `fixtures/geo/city_cells_de.json` (`cities[].cells` plus a `cell -> cityId` `index`). Inputs are our own city coordinates; no Qloo data is read or published.
- Tie rule: a cell inside the radius of several cities goes to the nearest centre (exact tie: alphabetically first `cityId`), so each cell has at most one city. This matters in the Ruhr area, where the radii overlap.
- `src/qloo/geo.ts`: `cellToCity` resolves a longer geohash by truncating to the fixture precision and a shorter one only if all cells under that prefix belong to one city; otherwise null. `aggregateCellsByCity` returns sum, mean and count per city; a city with no cells or no entries is `unknown`, never zero. Unmapped entries are counted, not assigned.
- Limits: precision 5 is the length our probes observed, not a documented guarantee, so the fixture precision is configurable. Cell centre within a circle is an approximation of the urban area, not an administrative boundary; cells of neighbouring towns inside the radius are attributed to the nearest scenario city, and cities outside the 24 are unmapped. Locality (district) output is not handled here: it would need `disambiguation` parsing or point-in-polygon, which is not implemented.
