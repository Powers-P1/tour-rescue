# Tour Rescue: product brief

## Decision

Entry for the Qloo Agentic Hackathon 2026. A booker or tour manager has a confirmed tour (5 dates in one region) and loses one date. The agent compares three repair options: a replacement venue in another city, a detour, or a day off. It keeps every confirmed show feasible (dates, drive times, daily driving limits, minimum spacing between nearby markets). Cities are scored with a Qloo taste "fit index". Every recommendation carries a "breakpoint". Every run produces a reproducible decision audit.

## MVP scope

- One region, one existing tour of 5 dates, one lost date, exactly 3 repair options.
- Venue availability, capacity, fees and promoter terms are inputs supplied by the user or marked UNKNOWN. Qloo supplies only cultural fit.
- If no option is feasible, the agent says so explicitly.

## Definitions

- **Fit index**: for a city, a percentile of Qloo affinity (heatmap and insights for the artist plus comparison artists) within a frozen candidate set of cities. It is not a forecast of ticket sales or audience size. Kilometres are shown separately and never folded into the index.
- **Breakpoint**: for each recommendation, the single change (one assumption, such as a cost threshold, or one comparison artist) that flips the recommended option, or "none found".
- **Decision audit**: downloadable JSON containing the frozen city set, every logged query and warning, a control run with a different artist, leave-one-artist-out results, per-option constraint checks, and the gate "zero violated constraints".

## Architecture

- Front-end: Cloudflare Pages (static).
- API: Cloudflare Worker. The Qloo key is a Worker secret, never in the client. Rate limiting per IP and a daily cap; KV cache for Qloo responses.
- `src/core`: deterministic pure functions (feasibility, option generation, scoring, breakpoint, audit). No network access.
- `src/qloo`: thin Qloo client, recorded fixtures under `fixtures/` for offline tests.
- LLM: optional short summary; a template fallback is always available and the demo works without any LLM.

## Constraints

- Free tier only (Cloudflare Pages, Workers, KV).
- No key in the client. Rate limit and kill switch.
- The public demo must stay up, free and without login until 16 Nov 2026.
- Open source, MIT.

## Division of labour

ChatGPT/Codex writes code via pull requests. The OK Agency side runs live Qloo probes with the key, records fixtures, deploys, reviews and merges.

## Acceptance criteria

1. The offline test suite passes on fixtures, with no network and no key.
2. The demo scenario works end to end without an LLM.
3. The audit JSON is downloadable from the UI.
4. Zero violated constraints in every recommended option; infeasibility is reported honestly.
5. Control run (different artist) and leave-one-artist-out are part of the audit.

## 7-day plan

| Date | Milestone |
|---|---|
| 22 Oct | Repo skeleton, types, constraint model; live contract probe results; first PR |
| 23 Oct | Core: feasibility, 3 options, fit index, tests on fixtures |
| 24 Oct | Breakpoint and audit; Worker with proxy, cache, rate limit |
| 25 Oct | Front-end: scenario input, options comparison, map |
| 26 Oct | Audit download, optional LLM summary with template fallback |
| 27 Oct | Deploy to Cloudflare, README in English, screenshots, review |
| 28 Oct | Incognito test, submission text; buffer |
