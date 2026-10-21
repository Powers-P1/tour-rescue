# Decision API and audit (PR4)

The API uses the frozen `germany-five-dates-v1` scenario: 24 candidate cities, five dates, one cancellation and three nominated options. All venue and booking facts are explicitly synthetic, including in **live** mode. Live mode changes the artist evidence; it does not verify a venue or create a booking. The directed OSRM snapshot keeps its original provenance.

## Routes

| Method and path | Result | Qloo access / daily action |
|---|---|---|
| `GET /health` | Edge version and `liveEnabled` | Neither |
| `GET /do-check` | Existing `UnitLedger` is reachable and its storage can be read | Neither |
| `GET /api/demo` | `tour-rescue.api-result.v1` with synthetic artists and the complete audit | Neither |
| `GET /api/demo/audit` | The same audit as an attachment | Neither |
| `POST /api/live/search` | Resolved artist IDs/names and projected search evidence | One daily action; provider quota on cache miss |
| `POST /api/live` | `tour-rescue.api-result.v1` with resolved IDs and a complete audit | One daily action; separate provider calls for target, comparisons and control on cache miss |

The edge accepts only the configured browser origin. Requests without an Origin header are permitted, so this is CORS configuration, not authentication. Every live action still requires Cloudflare's server-provided client address and consumes durable limits. The address is transformed into a keyed daily hash before it reaches the Durable Object and is never returned. Query-string parameters are not supported. JSON request bodies are capped at 16 KiB, including streamed bodies without a Content-Length.

### Demo

```sh
npm run worker:dev
curl http://localhost:8787/api/demo
curl http://localhost:8787/api/demo/audit --output demo-audit.json
```

No key is needed. A Durable Object instance holds the computed demo in memory, so repeated demo responses have the same run ID and generation time until that instance restarts. `generatedAt` is the calculation time; synthetic Qloo acquisition times remain UNKNOWN. A restart may generate a new run ID/time without changing the arithmetic.

### Artist search

```json
{"query":"artist name"}
```

POST this object to `/api/live/search`. Search takes 2–120 printable characters and asks Qloo for at most ten artist matches. The response contains `mode`, `artists: [{ id, name }]` and `queries`. Select the returned UUIDs for evaluation; names and invented demo IDs are not accepted as live artist identities. IDs are canonicalized to uppercase. Input fields other than `query` are rejected.

### Live evaluation

```json
{
  "scenarioId": "germany-five-dates-v1",
  "targetArtistId": "11111111-1111-4111-8111-111111111111",
  "comparisonArtistIds": [
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333"
  ],
  "controlArtistId": "44444444-4444-4444-8444-444444444444",
  "policy": {
    "schemaVersion": "tour-rescue.decision-policy.v1",
    "minimumFitIndex": 20,
    "maxAdditionalDistanceMetres": 350000
  },
  "additionalBudgetMinorUnits": 100000
}
```

These UUIDs illustrate syntax only; they are not resolved artists. The required fields are the target, an array of zero to three comparisons, and one control. All IDs must be distinct. The control replaces only the target in its separate run; it is not an extra comparison artist. With comparisons, the target has weight 0.5 and comparisons share 0.5 equally; without them, the target has weight 1. Leave-one-out removes comparisons only and proportionally renormalizes the surviving weights.

Omitted preferences use the explicitly documented demo policy above. Supplied preferences must carry the version and both thresholds: minimum fit is an integer 0–100; maximum extra distance is an integer 0–500,000 metres. The fee-only budget is integer EUR minor units from 0–150,000. Nulls are invalid. Breakpoint search uses the same fixed ranges, one changed value at a time. Arbitrary routes, cities, provider parameters, API URLs, currencies, fees and venue facts cannot be submitted through this MVP endpoint.

The result wrapper contains `schemaVersion`, `mode`, `scenarioId`, selected `artists` and `audit`. The browser can download its `audit` as JSON without making another provider request. The live wrapper includes UUIDs only; the UI can retain the names returned by search. `audit.scenarioDataKind` remains `synthetic` even when `mode` is `live`.

## What the audit proves

`tour-rescue.decision-audit.v1` records:

- `frozenCandidateSet`: the exact city universe, including when provider acquisition fails.
- `queries`: allowlisted endpoint/parameters, request start/end, live/cache/synthetic source, success/failure, known or unknown HTTP status, response reference/acquisition time and safe warnings. No secret headers, raw IPs or unrestricted upstream response text are included. A cache hit retains the original response acquisition time.
- `sourceTimestamps`: the road model's source/time and the linked artist evidence's acquisition times. Failed attempts remain in the query log even if no usable fit input can be built.
- `analysis`: all three options and their checks, the recommendation, numeric breakpoint witnesses or explicit bounded outcomes, and all comparison-artist omission runs.
- `controlRun`: the decision with a different target artist, keeping comparisons, weights, city set, route facts and preferences fixed. Without usable control evidence this is UNKNOWN.
- `stopChanges`: added, removed and modified show IDs, changed fields, preserved locked commitments, and the selected baseline/control route difference when both recommendations are known. `changedStopCount` counts changed show IDs; replacing one ID can mean one removal plus one addition, not one physical concert.
- `zeroViolationsGate`: PASS only when the recommended option has a nonempty, consistent trace of passing declared checks. A missing recommendation or unresolved required checks cannot pass. Other rejected options may still have FAIL checks; the gate is explicitly scoped to the recommended option.
- `replay`: validated scenario/preferences/ranges and within-query percentiles preserving original ties and missingness. This contains derived ranks, not raw Qloo affinity values, cell payloads or population estimates.

```ts
import { replayDecisionAudit } from '../src/core/index.ts';
const reproduced = replayDecisionAudit(savedAudit);
```

Replay recomputes rather than trusting the exported result fields. It does not call Qloo, update road data or establish a new booking fact. Response references are hashes for private evidence lookup, not provider signatures. The numeric baseline and control can be reproduced without distributing raw responses. The `affinity` fields in the replay's fit input are rank surrogates identified by `fitRepresentation`, not original provider values.

## Failure behavior and limits

Invalid requests return 400/413/415; unsupported methods return 405. An unapproved browser origin returns 403. A disabled live mode or missing trusted client address returns 503. An exhausted daily allowance returns 429 with Retry-After and causes no provider call. Search provider failures return 429 or 502 with a safe error and request trace. Internal storage/configuration failures return a generic 503, never an exception string.

A live **evaluation** whose Qloo request fails still returns HTTP 200 when a valid audit can be computed: the failed query is logged, required fit/recommendation become UNKNOWN, and the response never switches to synthetic artist data. If only the control fails, the baseline stays available and the control is UNKNOWN. Partial heatmaps retain every frozen city and explicit missing observations; there is no silent subset ranking. A failed required baseline acquisition prevents constructing a full baseline/leave-one-out fit input; the audit says why rather than inventing its provenance.

The private client sends GET `/v2/insights` with `filter.type=urn:heatmap`, one `signal.interests.entities` UUID, the fixed bounded WKT and `output.heatmap.boundary=urn:geohash`. It never sends heatmap `take`. At most two artist bodies are in flight at once. Each response is limited to 1,000,000 bytes, 5,000 cells and ten seconds, including download; exceeding a bound fails the complete query. Mean mapped-cell affinity is computed per city, then converted into within-query percentiles by the core. Coverage of all 24 cities for real selected artists is UNKNOWN until maintainers probe it.

The SQLite ledger persists provider ceilings of 10 calls per rolling second and 50,000 per UTC month; these limits cover calls made by this service, not other uses of the same provider key. Daily defaults are 30 live actions globally and 10 per keyed client hash. Search and evaluation both count, including cache hits. Failed attempts are not refunded. The private cache uses a six-hour TTL, up to 128 entries and at most 512 KiB per stored entry; an oversized valid response may be used without being cached. Raw provider projections remain server-side. See [DEPLOY](DEPLOY.md) for the live switch and maintainer smoke check.
