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

The core provides validated tour inputs, a pure cultural-fit index and three evaluated repair options. Install **Node 24** (see `.nvmrc`), then:

```sh
npm ci
npm run check
```

`check` runs strict TypeScript checking and Node's built-in test runner. After installing the three development packages, checks need no network, Qloo key, Cloudflare account or LLM. There are no runtime dependencies. GitHub Actions runs the same checks on pull requests.

The frontend and Worker are planned increments; `npm run dev` is not available yet. There is no live Qloo integration in PR2.

## Repository layout

```text
src/core/        Scenario/time validation, fit index, directed travel and repair options
src/qloo/        Normalization boundary; client awaits a verified response contract
src/worker/      Worker API boundary (PR4)
src/web/         Cloudflare Pages UI boundary (PR5)
fixtures/       Synthetic Qloo examples and a maintained OSRM Germany snapshot
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

Raw affinities from different queries are never averaged. Exact ties use average rank. Flat profiles contribute 50 and emit a warning. Singletons or any incomplete artist profile yield `unknown` aggregate results. Missing evidence must be represented explicitly; missing rows, duplicate IDs and non-finite numbers are rejected. Unknown does not mean zero. See the [PRD](docs/PRD.md) for the formula and scenario weights.

`parseScenarioFitInput` and `computeScenarioFitIndex` enforce the agreed scenario policy: target **0.5**, comparisons **0.5 / count**, or target **1** when no comparisons are supplied. The generic fit parser/calculator still accepts other valid sum-to-one weights for later sensitivity runs.

## Repair-options contract

```ts
import { readFileSync } from 'node:fs';
import { evaluateRepairOptions } from './src/core/index.ts';

const scenario = JSON.parse(readFileSync(
  'fixtures/synthetic/tour__five-dates__one-cancelled.json', 'utf8',
));
const report = evaluateRepairOptions(scenario); // Optional second argument: normalized FitInput.
```

The input must have five ordered dates, one cancellation, four locked commitments and exactly one candidate of each kind. The parser checks IDs, references, integer units, date-specific evidence and ISO offsets against IANA zones. `evaluateRepairOptions` preserves each confirmed show exactly and returns **replacement, detour, day-off**, including failed and unresolved options. A replacement performance has status `proposed`, never `confirmed`.

Checks use **PASS / FAIL / UNKNOWN**; a failure dominates unknown evidence. Routing and venue checks are reported separately. `passingOptionIds` means all declared checks passed under the supplied inputs, **not** that a booking is agreed or that the product has selected a winner. A day off has no fit score. Fit and signed additional metres remain separate, with the day-off route as the distance baseline.

Driving uses each directed matrix leg and the complete window from `departAfter` to the next `arriveBy`. It can be split across local calendar days; daily budgets are shared across legs and respect daylight-saving boundaries. Market spacing checks every retained show pair using the smaller of both directed distances. Missing directions remain unknown. The model does not include traffic, driving breaks or overnight locations. The budget check covers only a supplied venue fee; capacity and promoter terms remain evidence rather than invented requirements. See [PRD](docs/PRD.md#pr2-checks-and-model-limits).

`parseOsrmMatrix` imports the maintained frozen Germany matrix without fetching anything or assuming symmetry. `parseSyntheticHeatmapFitInput` is restricted to the explicitly synthetic heatmap fixture, whose `cityId` is an application annotation. It is **not** a live Qloo response parser. Integration tests assemble the five German dates from [SCENARIO_DE_2026](docs/SCENARIO_DE_2026.md) and exercise both maintained fixtures; the original Polish five-date fixture is tested too.

## Current evidence boundary

Public Qloo fixtures must be **synthetic**. Raw Qloo responses must not be published. The Germany road matrix is a separate maintainer-recorded OSRM model snapshot with its own source, timestamp and units. Maintainers also supplied geometry-only cell-to-city mapping in `src/qloo/geo.ts`; the complete live normalization contract, verified scenario coverage and Worker access remain **UNKNOWN**. The live key and probe data stay with maintainers. Existing `BRIEF.md` and `QLOO_NOTES.md` remain the source of product and probe requirements.
