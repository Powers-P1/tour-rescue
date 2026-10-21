#!/usr/bin/env python3
"""Regenerate fixtures/osrm_matrix_de.json from fixtures/cities_de.json.

Uses the public OSRM demo server (no key, no paid API), one request for <=25
coordinates, with a User-Agent header. Durations in seconds and distances in
metres are rounded to integers and stay directional (A->B != B->A).
Usage: python scripts/build_osrm_matrix.py [--dry-run] [--base URL]
"""
import argparse, datetime, json, pathlib, sys, time, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://router.project-osrm.org"
UA = "tour-rescue-fixture-builder/1.0 (+https://github.com/Powers-P1/tour-rescue)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print the request URL and exit, no network")
    ap.add_argument("--base", default=BASE)
    a = ap.parse_args()
    cities = json.loads((ROOT / "fixtures/cities_de.json").read_text(encoding="utf-8"))["cities"]
    if len(cities) > 25:
        sys.exit("more than 25 coordinates: split into several requests")
    coords = ";".join(f"{c['lon']:.4f},{c['lat']:.4f}" for c in cities)  # OSRM order: lon,lat
    url = f"{a.base}/table/v1/driving/{coords}?annotations=duration,distance"
    if a.dry_run:
        print(f"DRY RUN: {len(cities)} coordinates, 1 request\n{url}")
        return
    time.sleep(1)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
    except (urllib.error.URLError, TimeoutError) as e:
        sys.exit(f"OSRM request failed: {e}. Fixture not written (TODO: retry or use a self-hosted OSRM).")
    if data.get("code") != "Ok":
        sys.exit(f"OSRM returned code {data.get('code')}: {data.get('message')}")
    rnd = lambda m: [[None if v is None else int(round(v)) for v in row] for row in m]
    out = {
        "schemaVersion": 1,
        "id": "osrm-matrix-de-v1",
        "dataKind": "derived-routing",
        "metadata": {
            "source": "OSRM public demo server, table service, profile driving (OpenStreetMap data, ODbL)",
            "endpoint": f"{a.base}/table/v1/driving/{{lon,lat;...}}?annotations=duration,distance",
            "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "osrm_version": data.get("version"),
            "coordinate_order": "lon,lat in request; indices follow fixtures/cities_de.json city order",
            "units": {"durations": "seconds (integer)", "distances": "metres (integer)"},
            "directional": True,
            "note": "Free-flow driving estimates without traffic, breaks or tolls; not a guarantee of feasibility.",
        },
        "cityIds": [c["id"] for c in cities],
        "durations": rnd(data["durations"]),
        "distances": rnd(data["distances"]),
    }
    p = ROOT / "fixtures/osrm_matrix_de.json"
    p.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {p} ({len(cities)}x{len(cities)})")


if __name__ == "__main__":
    main()
