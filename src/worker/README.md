# Worker boundary

The runtime lives in [`worker/`](../../worker/), extending the maintainer-supplied `UnitLedger` SQLite Durable Object. `worker/src/router.ts` handles the edge request boundary; `app.ts` computes the demo/live audit inside the DO; `ledger.ts` persists quotas and private cache entries. The server-only Qloo adapter lives in `src/qloo/` and the pure calculations in `src/core/`.

Run `npm run worker:dev` from the repository root. The default configuration serves synthetic `/api/demo` and `/api/demo/audit` without a key and leaves live mode disabled. See [API](../../docs/API.md) and [DEPLOY](../../docs/DEPLOY.md) for request contracts and maintainer setup.
