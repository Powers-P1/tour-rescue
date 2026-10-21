# Tour Rescue: product brief

## Decision

Entry for the Qloo Agentic Hackathon 2026. A booker or tour manager has a confirmed tour (5 dates in one region) and loses one date. The agent compares three repair options: a replacement venue in another city, a detour, or a day off. It keeps every confirmed show feasible (dates, drive times, daily driving limits, minimum spacing between nearby markets). Cities are scored with a Qloo taste "fit index". Every recommendation carries a "breakpoint". Every run produces a reproducible decision audit.

## MVP scope

- One region, one existing tour of 5 dates, one lost date, exactly 3 repair options.
- Venue availability, capacity, fees and promoter terms are inputs supplied by the user or marked UNKNOWN. Qloo supplies only cultural fit.
- If no option is feasible, the agent says so explicitly.
- Promoter one-pager for the chosen option: a printable single A4 page that the booker sends to the venue or promoter. It is built in the browser (HTML print stylesheet; optional PNG export via canvas), with no server and no LLM. It shows the artist, proposed city and date, a venue placeholder, the fit index with the three comparison artists and a leave-one-out note, extra kilometres and drive time against the limit, constraint status (PASS, FAIL or UNKNOWN), top risks, data sources (Qloo taste data, OSRM) and a generation timestamp.

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
6. The promoter one-pager prints on one A4 page with every field listed in the MVP scope. Its constraint statuses match the audit, UNKNOWN is never shown as PASS, and no raw Qloo response data appears in it.

## AI Rescue mode (Pro tier), PR6
Principle: AI proposes, the deterministic core verifies. The constraint checker, breakpoints and audit stay deterministic; an agent does the research.

- Agent: Claude Sonnet 5.5 (`claude-sonnet-5-5`) via our Cloudflare Worker; the API key is a Worker secret `ANTHROPIC_API_KEY`. Premium may use Claude Opus 5.5 (`claude-opus-5-5`).
- Tools: Qloo fit data (our normalised percentiles), OSRM matrix, web search and fetch (venue availability and calendars, festival clashes, public holidays, weather), the deterministic constraint checker and the audit generator.
- Flow: the agent researches the cancelled date's region, proposes repair options with evidence and links; each option is validated by the deterministic checker (PASS / FAIL / UNKNOWN); breakpoints are computed deterministically; the audit records the sources.
- Guardrails: the agent cannot mark a constraint PASS (only the checker can); missing facts stay UNKNOWN; every claim carries a source link.
- Demo: limited live sessions per day, saved transcripts for offline mode. Product: paid tier.
- Plan: PR6 after PR5. PR4 exposes the checker and audit as pure typed tools for the agent.

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
