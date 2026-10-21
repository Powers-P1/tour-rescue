# Deploy (Cloudflare free tier)

`web2/` contains the current TypeScript/HTML/CSS landing, judges page and Tour Rescue app; `web/` is retained as the legacy frontend for rollback. `npm run web:build` locally creates the deployable **`web/dist`** directory; it does not deploy. The `tour-rescue` Cloudflare Pages project is **direct-upload** (verified `source: null`, no Git integration or remote build command). Its contents change only after an explicit maintainer-run `wrangler pages deploy` upload. The existing `worker/` supplies live decisions, an audit and private SQLite Durable Object state; deploying the frontend never changes Worker configuration.

## Local checks

```sh
npm ci
npm run check
npm run web:build
npm run web:preview
# In a separate terminal, if testing the API locally:
npm run worker:dev
```

`worker:build` invokes Wrangler with `--dry-run`; no Cloudflare account or provider key is required. The default local API serves `/health`, `/do-check`, `/api/demo` and `/api/demo/audit`. Without secrets, live is unavailable. The pure/client/API tests use synthetic evidence and mocked provider requests. A separate local workerd/SQLite smoke check during PR4 verified the actual built entry point, DO binding, demo, audit attachment and disabled live path without a Qloo key.

## Pages build and local preview

Open `http://localhost:4173` for the landing page or `http://localhost:4173/app` for the app after `npm run web:preview`. `npm run web:dev` builds once and starts the same static preview; after edits, rebuild and reload. Both pages evaluate the bundled synthetic fixtures and deterministic core in the browser. They need no Worker, account, Qloo key, LLM or external font/map request. Loading the landing page does not initialize the app or contact providers.

The build emits physical `index.html` and `app/index.html` pages, with absolute `/landing.js`, `/landing.css`, `/app.js` and `/app.css` asset paths. `/index.html` is a landing alias; `/app`, `/app/` and `/app/index.html` resolve to the app (Pages can canonicalize the index paths). A top-level `404.html` prevents unknown paths from falling back to the landing page as a single-page app. The deployable output directory and Worker configuration stay unchanged; Pages itself runs no build command.

App hash routes are `#route`, `#options`, `#breakpoint`, `#evidence`, `#audit`, `#promoter` and `#ai`. Old root links such as `/#breakpoint` redirect to the fixed same-origin `/app#breakpoint`; landing anchors such as `#how-it-works`, `#the-decision`, `#judges` and `#faq` stay on the landing. Compatibility redirects retain only a single supported `tour=start` or `tour=resume` query. A root URL with that explicit tour request and no recognized app hash opens `/app?tour=start#route` (or `resume`); arbitrary destinations and other query parameters are not forwarded.

`PUBLIC_WORKER_ORIGIN` is the **public API origin**, not a secret. Its default is `https://tour-rescue-api.oli-struska.workers.dev`. To build against local development:

```sh
PUBLIC_WORKER_ORIGIN=http://localhost:8787 npm run web:build
npm run web:preview
```

Set the Worker's `ALLOWED_ORIGIN` to `http://localhost:4173` for that local session, or to the exact Pages origin for deployment. CORS remains enforced; the frontend does not proxy around it. Local live requests still need the trusted identity contract described below. No secrets belong in `PUBLIC_WORKER_ORIGIN`, HTML, browser storage or Pages environment variables. The build validates the origin and emits a matching `connect-src` policy in `web/dist/_headers`.

Cloudflare Pages is **not Git-integrated**: `tour-rescue` has a direct-upload source and no configured Cloudflare-side build command. Build locally or in CI with **Node 24** using `npm run web:build`, then use the resulting `web/dist` directory for an explicitly authorised `wrangler pages deploy` upload. `npm run check` validates core/Worker and browser TypeScript; GitHub Actions builds and captures screenshots but never deploys. The generated output remains git-ignored.

The Live dialog checks `/health`, then searches only on explicit submission and calls `/api/live` after users select distinct artist identities. Each search and evaluation consumes an action; there is no invented remaining-quota counter. Disabled mode, network/CORS failures, 429 and HTTP200 results with UNKNOWN evidence stay visible. No live failure silently switches to demo. Local breakpoint adjustments reuse the accepted rank-only audit and preserve query acquisition timestamps; they spend no provider quota.

The promoter view renders a single A4 sheet and exports a PNG through browser canvas. Print/Save PDF uses the browser print dialog (A4, portrait; disable browser headers/footers if enabled). The sheet states the selected option's own status, includes three comparator slots (UNKNOWN for absent slots), and labels all fixture booking facts as fictional. This is a proposal to investigate, not confirmation of venue availability. JSON audit and PNG downloads are generated in the browser; there is no document service.

## Guided tour (PR7)

**Start the guided tour** is available on the landing page, in its judges section and in the app. No coach marks open merely because a visitor loads a page or has saved progress. An explicit start/resume URL is consumed once and removed from the address bar. The six steps cover:

1. The cancelled date and **Rescue this date**.
2. The three options and PASS / FAIL / UNKNOWN checks.
3. Setting the **additional-travel** limit to **354.1 km** and applying it. The exact core breakpoint is **354.097 km**, from a 350 km baseline; the daily-driving limit is unchanged.
4. The map, leave-one-artist-out results and Tag Bridge.
5. Audit JSON and the selected option's A4 / PNG promoter sheet.
6. Optional **Rescue with AI (Pro)**, with saved demo research and no automatic live session.

The nonmodal coach marks have keyboard-operable Back / Next / Finish, **Focus highlighted area**, and **Esc / Skip** at every step. The versioned localStorage key `tour-rescue:guided-tour:v1` stores only step and status, including completion; it stores no artist, audit, provider or comparison data. Blocked storage falls back to progress for the current page session. Resuming a paused guide still requires an explicit button or URL action.

Starting within an existing app comparison keeps that workspace in memory, uses a separate synthetic demo for the guide, and restores the comparison and selected view on Skip or Finish. This snapshot does not survive a reload. Starting through the landing link keeps the explored demo on exit so the visitor can continue investigating it.

## Existing URLs and deploy commands

- Front: [tour-rescue.pages.dev](https://tour-rescue.pages.dev)
- API: [tour-rescue-api.oli-struska.workers.dev](https://tour-rescue-api.oli-struska.workers.dev)

These are the maintainer's existing targets, not a claim that this branch has been deployed. `/health` reports the version, live switches and effective Qloo caps; `/do-check` performs a read through the DO binding and fails if the storage cannot be reached.

Export `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the maintainer shell; do not put either in `wrangler.toml` or commit them. From the repository root:

```sh
npx wrangler deploy --config worker/wrangler.toml
npm run web:build
npx wrangler pages deploy web/dist --project-name tour-rescue --branch main
```

The Pages project already exists. The original setup used `POST /accounts/{account_id}/pages/projects` with `{"name":"tour-rescue","production_branch":"main"}` because that Wrangler version's project-creation command failed in the maintainer environment. No project recreation is needed for this PR.

## Existing Durable Object and private state

`UnitLedger` keeps its existing SQLite class/binding and migration `v1`. Do **not** change or replay that migration. PR4 added namespaced key-value state using the existing storage API; PR5 changes neither that state nor the class/migration. The old skeleton's state can remain untouched. All edge requests use the same named instance, `tour-rescue-global-v1`, so concurrent requests share one transactional quota ledger.

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
| `LIVE_ENABLED` | `"true"` | Both this exact string set to `"true"` and a nonempty secret are required for live mode. |
| `ALLOWED_ORIGIN` | `"https://tour-rescue.pages.dev"` | Exact browser origin. A local HTTP origin is permitted only for localhost/127.0.0.1. |
| `LIVE_DAILY_CAP` | `"150"` | Global live actions per UTC day; positive values up to 1000. |
| `LIVE_IP_CAP` | `"25"` | Actions per server-derived daily client hash; positive values up to 100. |
| `QLOO_MONTHLY_LIMIT` | `"50000"` | Outgoing provider attempts per UTC month; lower values allowed. |

The deprecated names `DAILY_LIVE_LIMIT` / `DAILY_PER_IP_LIMIT` remain fallbacks when the corresponding new cap is unset. Search and evaluation each consume one daily action, including cache hits. Invalid requests rejected before reservation consume none. Failed provider attempts are not refunded. Provider calls also share a rolling 10-per-second cap; cache hits skip these provider counters. Quota checks and increments occur in one transaction. No raw IP is stored: only a keyed, daily rotating hash is retained in the current day's quota state. Live requests need Cloudflare's trusted `CF-Connecting-IP`; a missing address fails closed, including in a local proxy that does not supply it.

Daily/monthly boundaries are UTC **application policy**. Qloo's exact provider reset window and remaining-budget header semantics are UNKNOWN, and other tools using the same key are outside this ledger. Set a lower monthly allowance if maintainers also use that key. A provider 429 remains visible even when the application has quota left. Restoring or deleting the DO's stored counters is not a quota reset mechanism.

For the first deployed live check, maintainers set the secret and enable the switch, resolve real artist IDs through `/api/live/search`, then submit the bounded example in [API](API.md). Check the returned query sources/timestamps and city completeness rather than accepting HTTP 200 alone: evaluation returns a valid UNKNOWN audit when Qloo fails. Direct provider access from deployed Cloudflare and full heatmap coverage remain UNKNOWN until this check is performed. Turning the switch off blocks both live endpoints immediately after the configuration deployment; demo stays available.

## Worker secret names

Secrets set on `tour-rescue-api` (names only): `QLOO_API_KEY` (live Qloo requests), `ANTHROPIC_API_KEY` (PR6 Claude Sonnet 5.5 Messages requests). Neither is in `wrangler.toml` or the repository.

## AI Rescue live switch (PR6)

The existing `ANTHROPIC_API_KEY` secret is used only by the Worker. Do not copy it to Pages. Enable both `LIVE_ENABLED="true"` and `AI_ENABLED="true"`; both provider secrets must be nonempty. `/health` adds `aiEnabled`. The default AI switch is false so deployment does not begin paid calls before maintainers enable the feature. No extra search API key is needed: search and page reads use Anthropic server tools. Anthropic web search must be enabled for the account; real account/model/tool access remains UNKNOWN until a live probe.

`AI_DAILY_CAP="40"` and `AI_CLIENT_CAP="5"` configure separate global/client AI sessions per UTC day (positive integers, hard ceilings 200/20; the old `DAILY_AI_*` names remain accepted). `AI_ENABLED="true"` is now the default in `wrangler.toml`; set it to "false" and redeploy to disable. A session is reserved in UnitLedger before any Anthropic call; failure/cancellation consumes it. PR6 adds namespaced AI quota state and rank-only context entries to the existing private cache. It changes no DO class, binding or migration. A saved context needs the same daily client identity and expires after six hours or cache eviction. Existing Qloo rate/monthly/daily limits are unchanged.

The browser route `#ai` replays two bundled synthetic transcripts without any network. To probe live: load **Try live**, open **Rescue with AI (Pro)**, select live research, verify streamed tool summaries and 2–4 source-linked checked proposals, then explicitly accept one. Check the cards, breakpoint outcomes and downloaded AI audit envelope. A 409 `AI_BASE_EXPIRED` means reload the live Qloo decision; a 429 carries Retry-After. Turning off `AI_ENABLED` prevents new paid sessions; the saved demo and deterministic app keep working.

The agent has six Messages requests, 8,000 cumulative output tokens, 24 client tool calls, at most six searches and six page reads, and a 90-second session deadline. The reported input-token stop (`AI_MAX_INPUT_TOKENS`, default 150,000) is checked after responses and is not a pre-billing hard cap for server-tool input. See [AI_RESCUE](AI_RESCUE.md) for exact bounds, official provider references and evidence limits. PR6 does not implement billing or product entitlements.

`enable_request_signal` and `request_signal_passthrough` are explicit [Cloudflare compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-requestsignal-for-incoming-requests). They allow cancellation to reach the Worker and its forwarded request. Cancellation during the quota transaction is checked again before calculation/provider work. The reservation remains counted, so disconnecting does not reopen the allowance.

## Platform budgets

Cloudflare documents separate [Worker limits](https://developers.cloudflare.com/workers/platform/limits/) and [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/). The free outer Worker has a 10 ms CPU budget; putting core calculation inside the DO avoids depending on that small budget. SQLite-backed DOs are the backend supported on the free plan. The private cache and small demo memoization reduce repeated provider and computation work, but provider quotas do not exempt requests from Cloudflare platform limits. Local smoke checks establish runtime compatibility, not measured production capacity.

## Front v2 deployment switch (PR-D)

The existing `tour-rescue` Cloudflare Pages project is **direct-upload**, with `source: null`, no Git repository connection and no Cloudflare-side build command. The repository-level `npm run web:build` builds the **new** `web2/` frontend locally into **`web/dist`**, without changing Pages until a maintainer deliberately uploads it. The legacy `web/` source remains available; `npm run web:legacy-build` creates the legacy bundle in `web/dist` for a manual rollback upload. `npm run web2:build` still targets isolated `web2/dist` for local preview. No Cloudflare dashboard build setting or Git integration must be modified.

The v2 output has `/index.html` (product landing, board 08), `/app/index.html` (interactive Tour Rescue), `/judges/index.html` (judges page, board 09) and a strict `404.html`. All pages share the graphite/amber tokens. The judges header explicitly says **Judges · Start here** above the fold. Primary judge CTA opens `/app/#rescue` (precomputed synthetic decision); live Qloo/AI research remains a separate user action. The default landing and judges pages compute the synthetic decision directly from the maintained core; no provider request is made just to load either page.

The Worker URL/CORS origin, secrets, Durable Object, quota limits and live switches **do not change** during the front-end switch. The original Cloudflare Pages origin (`https://tour-rescue.pages.dev`) remains the origin required in `ALLOWED_ORIGIN`. `PUBLIC_WORKER_ORIGIN` is still a public origin, never an API key. New CSP allows Google Fonts and two explicitly attributed Unsplash editorial photographs; no external fonts/photo is required for the app core to function.

**Manual deployment (only after review/merge and maintainer authorisation):**

```sh
npm ci
npm run check
npm run web:build
npm run web:preview
# Inspect /, /judges/, /app/#rescue in local preview.
npx wrangler pages deploy web/dist --project-name tour-rescue --branch main
```

**Merging or pushing to GitHub cannot deploy this Pages project.** Its direct-upload configuration has no Git trigger, and neither CI workflow deploys it. Only an explicitly authorised maintainer upload using `npx wrangler pages deploy web/dist --project-name tour-rescue --branch main` changes production. Do not claim public v2 availability until that upload and a hosted smoke test succeed. For rollback, run `npm run web:legacy-build` to rebuild the old `web/` site into `web/dist`, then manually upload that directory using the same Wrangler command. Restore v2 by running `npm run web:build` and manually uploading again. A rollback requires no package.json or Cloudflare build setting changes.

### Screenshot evidence
The `visual-v2.yml` workflow builds the actual `web/dist` output, captures desktop/mobile screenshots from a local static preview with Playwright, and uploads an Actions artifact called `tour-rescue-v2-screenshots`. It does not perform Cloudflare production deployment. The capture script also checks for console/CSP errors, horizontal overflow and duplicate IDs at the specified viewports.
