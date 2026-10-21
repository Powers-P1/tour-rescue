# Deploy (Cloudflare free tier)

Placeholder skeleton: `web/` (static page) and `worker/` (API + Durable Object). Wrangler 4 is a local dev dependency.

## Auth
Export `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell. Never put them in `wrangler.toml` or commit them.

## Commands
```
npm ci
# one-time: create the Pages project (wrangler 4.151 delegates this to Workers
# and failed for us; the Pages API call works):
#   POST /accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects {"name":"tour-rescue","production_branch":"main"}
npx wrangler pages deploy web --project-name tour-rescue --branch main --force
cd worker && npx --prefix .. wrangler deploy
```

## URLs
- Front: https://tour-rescue.pages.dev
- API: https://tour-rescue-api.oli-struska.workers.dev (`/health` returns `{"ok":true,"version":...}`, `/do-check` exercises the Durable Object)

## Durable Object
`UnitLedger` uses the SQLite backend (`new_sqlite_classes` in migration `v1`), the only DO backend available on Workers Free. Add new classes or renames through new migration tags, never edit `v1`.

## Secrets (Qloo key)
```
cd worker && npx --prefix .. wrangler secret put QLOO_API_KEY
```
Read it in the Worker as `env.QLOO_API_KEY`. For local dev put it in `worker/.dev.vars` (git-ignored).

## Free-tier limits
Workers Free: 100,000 requests/day, 10 ms CPU per request. Durable Objects (SQLite): 100,000 requests/day and 100,000 row writes/day; operations fail after the limit until 00:00 UTC.
