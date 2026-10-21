# Deploy (Cloudflare free tier)

`web/` remains the maintainer-supplied static placeholder until PR5. PR4 extends `worker/` with demo/live decisions, a JSON audit and private state in the existing SQLite Durable Object. Wrangler is a pinned-by-lockfile local development dependency. Deployment and secrets are handled by maintainers; opening this PR does not deploy it.

## Local checks

```sh
npm ci
npm run check
npm run worker:build
npm run worker:dev
```

`worker:build` invokes Wrangler with `--dry-run`; no Cloudflare account or provider key is required. The default local API serves `/health`, `/do-check`, `/api/demo` and `/api/demo/audit`. Live is disabled. The pure/client/API tests use synthetic evidence and mocked provider requests. A separate local workerd/SQLite smoke check during PR4 verified the actual built entry point, DO binding, demo, audit attachment and disabled live path without a Qloo key.

## Existing URLs and deploy commands

- Front: [tour-rescue.pages.dev](https://tour-rescue.pages.dev)
- API: [tour-rescue-api.oli-struska.workers.dev](https://tour-rescue-api.oli-struska.workers.dev)

These are the maintainer's existing targets, not a claim that this branch has been deployed. `/health` reports the version and live switch; `/do-check` performs a read through the DO binding and fails if the storage cannot be reached.

Export `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the maintainer shell; do not put either in `wrangler.toml` or commit them. From the repository root:

```sh
npx wrangler deploy --config worker/wrangler.toml
npx wrangler pages deploy web --project-name tour-rescue --branch main --force
```

The Pages project already exists. The original setup used `POST /accounts/{account_id}/pages/projects` with `{"name":"tour-rescue","production_branch":"main"}` because that Wrangler version's project-creation command failed in the maintainer environment. No project recreation is needed for this PR.

## Existing Durable Object and private state

`UnitLedger` keeps its existing SQLite class/binding and migration `v1`. Do **not** change or replay that migration. This PR adds namespaced key-value state using the existing storage API; it does not add a DO class or schema migration. The old skeleton's state can remain untouched. All edge requests use the same named instance, `tour-rescue-global-v1`, so concurrent requests share one transactional quota ledger.

Heavy deterministic decision, breakpoint and audit calculation runs inside the DO. The outer Worker only checks routes, bounds small inputs, derives the daily client hash and forwards the response. The same DO stores private validated Qloo projections and response references with a six-hour TTL. No new KV namespace is required. Cache defaults are 128 entries and 512 KiB per entry; expired entries are removed on access, and the oldest write is evicted at capacity. Oversized valid values skip caching. Public audit responses have `Cache-Control: no-store` and contain derived percentiles, not raw Qloo cells.

The HTTP DO class is exported without a `cloudflare:workers` base-class import; this has been checked in the actual bundled workerd runtime with SQLite, not only a TypeScript double. See Cloudflare's [HTTP stub pattern](https://developers.cloudflare.com/durable-objects/best-practices/create-durable-object-stubs-and-send-requests/) and [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) for the platform contracts.

## Qloo secret and live switch

```sh
npx wrangler secret put QLOO_API_KEY --config worker/wrangler.toml
```

The secret is read only in Worker code as `env.QLOO_API_KEY`, used in the upstream `X-Api-Key` header and the server's daily client hash. It is never returned, placed in a query string, committed, or sent to Pages. For private local development, `worker/.dev.vars` is git-ignored. Keep the real key and raw probes outside public fixtures.

`worker/wrangler.toml` defaults:

| Variable | Default | Meaning |
|---|---|---|
| `LIVE_ENABLED` | `"false"` | Both this exact string set to `"true"` and a nonempty secret are required for live mode. |
| `ALLOWED_ORIGIN` | `"https://tour-rescue.pages.dev"` | Exact browser origin. A local HTTP origin is permitted only for localhost/127.0.0.1. |
| `DAILY_LIVE_LIMIT` | `"30"` | Global live actions per UTC day; lower values allowed. |
| `DAILY_PER_IP_LIMIT` | `"10"` | Actions per server-derived daily client hash; lower values allowed. |
| `QLOO_MONTHLY_LIMIT` | `"50000"` | Outgoing provider attempts per UTC month; lower values allowed. |

Search and evaluation each consume one daily action, including cache hits. Invalid requests rejected before reservation consume none. Failed provider attempts are not refunded. Provider calls also share a rolling 10-per-second cap; cache hits skip these provider counters. Quota checks and increments occur in one transaction. No raw IP is stored: only a keyed, daily rotating hash is retained in the current day's quota state. Live requests need Cloudflare's trusted `CF-Connecting-IP`; a missing address fails closed, including in a local proxy that does not supply it.

Daily/monthly boundaries are UTC **application policy**. Qloo's exact provider reset window and remaining-budget header semantics are UNKNOWN, and other tools using the same key are outside this ledger. Set a lower monthly allowance if maintainers also use that key. A provider 429 remains visible even when the application has quota left. Restoring or deleting the DO's stored counters is not a quota reset mechanism.

For the first deployed live check, maintainers set the secret and enable the switch, resolve real artist IDs through `/api/live/search`, then submit the bounded example in [API](API.md). Check the returned query sources/timestamps and city completeness rather than accepting HTTP 200 alone: evaluation returns a valid UNKNOWN audit when Qloo fails. Direct provider access from deployed Cloudflare and full heatmap coverage remain UNKNOWN until this check is performed. Turning the switch off blocks both live endpoints immediately after the configuration deployment; demo stays available.

## Worker secret names

Secrets set on `tour-rescue-api` (names only): `QLOO_API_KEY` (live Qloo requests), `ANTHROPIC_API_KEY` (reserved for the future AI mode; unused by the current code). Neither is in `wrangler.toml` or the repository.

## Platform budgets

Cloudflare documents separate [Worker limits](https://developers.cloudflare.com/workers/platform/limits/) and [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/). The free outer Worker has a 10 ms CPU budget; putting core calculation inside the DO avoids depending on that small budget. SQLite-backed DOs are the backend supported on the free plan. The private cache and small demo memoization reduce repeated provider and computation work, but provider quotas do not exempt requests from Cloudflare platform limits. Local smoke checks establish runtime compatibility, not measured production capacity.
