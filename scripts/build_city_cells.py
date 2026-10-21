#!/usr/bin/env python3
"""Build fixtures/geo/city_cells_de.json: geohash cells per scenario city.

Geometry only: reads fixtures/cities_de.json, enumerates geohash cells whose
CENTRE lies within a radius of each city centre (haversine), and writes the
cell->city index. No Qloo data and no network access are used.

Tie rule: a cell that falls inside the radius of several cities is assigned to
the city with the NEAREST centre; an exact distance tie (to 1 m) goes to the
alphabetically first cityId. Each cell therefore belongs to at most one city,
and cities[].cells lists only the cells assigned to that city.

Usage: python scripts/build_city_cells.py [--precision 5] [--radius-km 15]
         [--override de-berlin=20 ...] [--dry-run] [--self-test]
"""
import argparse, datetime, json, math, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
B32 = "0123456789bcdefghjkmnpqrstuvwxyz"
DEFAULT_PRECISION = 5  # observed cell length, see docs/QLOO_NOTES.md
DEFAULT_RADIUS_KM = 15.0
DEFAULT_OVERRIDES = {"de-berlin": 20.0, "de-hamburg": 20.0, "de-munich": 20.0}
EARTH_KM = 6371.0088


def encode(lat, lon, precision):
    lat_r, lon_r = [-90.0, 90.0], [-180.0, 180.0]
    out, bits, ch, even = [], 0, 0, True
    while len(out) < precision:
        rng, val = (lon_r, lon) if even else (lat_r, lat)
        mid = (rng[0] + rng[1]) / 2
        ch <<= 1
        if val >= mid:
            ch |= 1
            rng[0] = mid
        else:
            rng[1] = mid
        even = not even
        bits += 1
        if bits == 5:
            out.append(B32[ch])
            bits, ch = 0, 0
    return "".join(out)


def decode_bbox(gh):
    lat_r, lon_r = [-90.0, 90.0], [-180.0, 180.0]
    even = True
    for c in gh:
        v = B32.index(c)
        for i in range(4, -1, -1):
            rng = lon_r if even else lat_r
            mid = (rng[0] + rng[1]) / 2
            if (v >> i) & 1:
                rng[0] = mid
            else:
                rng[1] = mid
            even = not even
    return lat_r[0], lat_r[1], lon_r[0], lon_r[1]


def decode(gh):
    s, n, w, e = decode_bbox(gh)
    return (s + n) / 2, (w + e) / 2


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def cells_within(lat, lon, radius_km, precision):
    """All cells of `precision` whose centre is within radius_km of (lat, lon)."""
    s, n, w, e = decode_bbox(encode(lat, lon, precision))
    dlat, dlon = n - s, e - w
    span_lat = radius_km / 111.0 + dlat
    span_lon = radius_km / (111.320 * math.cos(math.radians(lat))) + dlon
    found, seen = {}, set()
    y = lat - span_lat
    while y <= lat + span_lat:
        x = lon - span_lon
        while x <= lon + span_lon:
            gh = encode(min(max(y, -89.999999), 89.999999), x, precision)
            if gh not in seen:
                seen.add(gh)
                clat, clon = decode(gh)
                d = haversine_km(lat, lon, clat, clon)
                if d <= radius_km:
                    found[gh] = d
            x += dlon / 2
        y += dlat / 2
    return found


def build(cities, precision, radius_km, overrides):
    cand = {}  # cell -> list of (distance_m, cityId)
    for c in cities:
        r = overrides.get(c["id"], radius_km)
        for gh, d in cells_within(c["lat"], c["lon"], r, precision).items():
            cand.setdefault(gh, []).append((round(d * 1000), c["id"]))
    index, contested = {}, 0
    for gh, lst in cand.items():
        lst.sort()  # nearest centre first, then cityId
        if len(lst) > 1:
            contested += 1
        index[gh] = lst[0][1]
    out = []
    for c in cities:
        cells = sorted(g for g, cid in index.items() if cid == c["id"])
        out.append({"cityId": c["id"], "name": c["name"], "lat": c["lat"], "lon": c["lon"],
                    "radiusKm": overrides.get(c["id"], radius_km), "cells": cells})
    return out, dict(sorted(index.items())), contested


def self_test():
    known = [(42.6, -5.6, "ezs42"), (57.64911, 10.40744, "u4pruydqqvj"), (-25.382708, -49.265506, "6gkzwgjzn820")]
    for lat, lon, gh in known:
        assert encode(lat, lon, len(gh)) == gh, (lat, lon, gh, encode(lat, lon, len(gh)))
    assert encode(52.52, 13.405, 5).startswith("u33d"), encode(52.52, 13.405, 5)
    for lat, lon in [(52.52, 13.405), (48.1375, 11.575), (53.55, 10.0), (-33.8688, 151.2093), (0.0, 0.0)]:
        for p in (4, 5, 6):
            gh = encode(lat, lon, p)
            s, n, w, e = decode_bbox(gh)
            assert s <= lat <= n and w <= lon <= e, (lat, lon, gh)
            clat, clon = decode(gh)
            assert encode(clat, clon, p) == gh, (gh, clat, clon)
    assert abs(haversine_km(52.52, 13.405, 48.1375, 11.575) - 504) < 5
    print("self-test ok: 3 reference hashes, Berlin prefix u33d, 15 roundtrips, haversine sanity")


def parse_overrides(items):
    o = dict(DEFAULT_OVERRIDES)
    for it in items or []:
        k, v = it.split("=", 1)
        o[k.strip()] = float(v)
    return o


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--precision", type=int, default=DEFAULT_PRECISION)
    ap.add_argument("--radius-km", type=float, default=DEFAULT_RADIUS_KM)
    ap.add_argument("--override", action="append", help="cityId=km (default Berlin/Hamburg/Munich 20)")
    ap.add_argument("--generated-at", help="ISO timestamp (default: now, UTC)")
    ap.add_argument("--out", default="fixtures/geo/city_cells_de.json")
    ap.add_argument("--dry-run", action="store_true", help="print the summary, write nothing")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    self_test()
    if a.self_test:
        return
    if not 1 <= a.precision <= 8:
        sys.exit("precision must be 1..8")
    cities = json.loads((ROOT / "fixtures/cities_de.json").read_text(encoding="utf-8"))["cities"]
    overrides = parse_overrides(a.override)
    out, index, contested = build(cities, a.precision, a.radius_km, overrides)
    counts = sorted(len(c["cells"]) for c in out)
    print(f"precision={a.precision} radius_km={a.radius_km} overrides={overrides}")
    print(f"cities={len(out)} cells={len(index)} contested={contested} "
          f"per-city min/median/max={counts[0]}/{counts[len(counts)//2]}/{counts[-1]}")
    for c in out:
        print(f"  {c['cityId']:<16} {len(c['cells']):>4}")
    if a.dry_run:
        print("DRY RUN: nothing written")
        return
    doc = {
        "metadata": {
            "method": "geohash cells whose centre lies within radiusKm (haversine) of the city centre; "
                      "cell shared by several cities goes to the nearest centre, exact tie to alphabetical cityId",
            "precision": a.precision,
            "radius_km": a.radius_km,
            "radius_overrides_km": overrides,
            "generated_at": a.generated_at or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "fixtures/cities_de.json + geometry only, no Qloo data",
            "contested_cells": contested,
        },
        "cities": out,
        "index": index,
    }
    p = ROOT / a.out
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {p.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
