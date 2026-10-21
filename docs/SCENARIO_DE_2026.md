# Demo scenario: Germany, November 2026

Fictional data throughout. The act, venues and dates are invented for the demo; nothing here is a real booking.

## Act and tour

"The Harbour Lights" is a placeholder mid-popularity touring act (indie rock, club and small-hall level). Real Qloo entity ids for the act and for its comparison artists are resolved at runtime through `/search`; no id is stored in the repo.

Region: Germany. Nine days, five dates:

| Day | Date | City | Status |
|---|---|---|---|
| 1 | Tue 10 Nov | Hamburg | confirmed, locked |
| 3 | Thu 12 Nov | Berlin | confirmed, locked |
| 5 | Sat 14 Nov | Leipzig | **cancelled** (venue closed) |
| 7 | Mon 16 Nov | Munich | confirmed, locked |
| 9 | Wed 18 Nov | Cologne | confirmed, locked |

The loss of Leipzig leaves the 14 Nov slot empty. The agent compares three repairs: a replacement city on or near the route, a detour, or a day off.

## Constraints

- Maximum 6 h of driving per day (OSRM free-flow time, no breaks or traffic).
- Earliest departure is after the show: 23:00 local (the `departAfter` field in the PR1 schema).
- Minimum spacing of 150 km between two shows in nearby markets, to avoid splitting the audience.
- Confirmed shows are never moved.

Tight legs by design: Berlin to Munich is about 5 h 54 min and Munich to Cologne about 5 h 41 min, so little slack remains for a replacement stop.

## Frozen data

- `fixtures/cities_de.json`: 24 candidate cities (name, lat/lon, rounded population). Coordinates from English Wikipedia via the MediaWiki API, retrieved 2026-10-21; populations approximate, rounded to 10,000.
- `fixtures/osrm_matrix_de.json`: directional 24x24 driving durations (s) and distances (m) from the public OSRM demo server, built by `scripts/build_osrm_matrix.py` (one request). Free-flow estimates, OpenStreetMap data (ODbL).
- `fixtures/qloo/heatmap_de_synthetic.json`: synthetic heatmap-shaped values for the main act and two comparison acts. Not Qloo data.

The live demo replaces the synthetic heatmap with cached Qloo queries made by the Worker; the candidate set and matrix stay frozen.
