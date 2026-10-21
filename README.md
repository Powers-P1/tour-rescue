# Tour Rescue

Qloo-powered agent that repairs a concert tour when one date falls through.

**Status: in development.** Built for the Qloo Agentic Hackathon 2026 (submission deadline 30 Oct 2026, 23:45 EDT).

A booker or tour manager has a confirmed 5-date tour in one region and loses one date. Tour Rescue compares three repair options (replacement venue in another city, a detour, or a day off), keeps all confirmed shows feasible (dates, drive times, daily limits, minimum spacing), scores cities with a Qloo taste "fit index", and shows for every recommendation which single assumption or comparison artist would flip the choice. Every run produces a reproducible, downloadable decision audit.

The core is deterministic (pure TypeScript functions). An LLM is optional and only writes a short summary; a template fallback is always available.

## Documents

- [docs/BRIEF.md](docs/BRIEF.md): product brief, scope, architecture, acceptance criteria, plan
- [docs/QLOO_NOTES.md](docs/QLOO_NOTES.md): what is confirmed about the Qloo API, and what is still unknown
- [docs/PRD.md](docs/PRD.md): domain decisions, fit formula, acceptance boundaries and five-PR roadmap
- [fixtures/README.md](fixtures/README.md): fixture naming for offline tests

## Licence

MIT, see [LICENSE](LICENSE).

## How to run

PR1 provides the domain model and a pure cultural-fit index. Install **Node 24** (see `.nvmrc`), then:

```sh
npm ci
npm run check
```

`check` runs strict TypeScript checking and Node's built-in test runner. After installing the three development packages, checks need no network, Qloo key, Cloudflare account or LLM. There are no runtime dependencies. GitHub Actions runs the same checks on pull requests.

The frontend and Worker are planned increments; `npm run dev` is not available yet. No route-feasibility engine or live Qloo integration is claimed by PR1.

## Repository layout

```text
src/core/        Pure domain types, fit input validation and fit-index calculation
src/qloo/        Normalization boundary; client awaits a verified response contract
src/worker/      Worker API boundary (PR4)
src/web/         Cloudflare Pages UI boundary (PR5)
fixtures/       Synthetic examples and metadata; approved live probes later
tests/          Offline arithmetic, invariance and contract checks
docs/           Existing brief, Qloo notes and implementation PRD
```

## Fit-index contract

`parseFitInput(unknown)` validates our application-owned normalized input. `computeFitIndex(input)` ranks each artist's complete affinity vector within the same frozen city set and combines the resulting 0–100 percentiles using declared weights. It validates input again when called directly. Neither function performs I/O or changes its inputs.

```ts
import { computeFitIndex, parseFitInput } from './src/core/index.ts';

const input = parseFitInput(JSON.parse(fixtureText));
const report = computeFitIndex(input);
```

The hand-written three-city fixture produces **25, 62.5, 62.5** with target/comparison weights **0.5/0.25/0.25**. These numbers demonstrate arithmetic only. They are not a real Qloo result, fan counts, attendance forecasts or probabilities.

Raw affinities from different queries are never averaged. Exact ties use average rank. Flat profiles contribute 50 and emit a warning. Singletons or any incomplete artist profile yield `unknown` aggregate results. Missing evidence must be represented explicitly; missing rows, duplicate IDs and non-finite numbers are rejected. Unknown does not mean zero. See the [PRD](docs/PRD.md) for the formula and proposed default weights.

## Current evidence boundary

All public fixtures in PR1 are labelled **synthetic**. The raw Qloo city heatmap schema, live coverage and adapter mapping remain **UNKNOWN**. A maintainer-supplied approved probe is required before implementing the raw response parser or claiming a working Qloo integration. The live key stays with maintainers. Existing `BRIEF.md` and `QLOO_NOTES.md` remain the source of product and probe requirements.
