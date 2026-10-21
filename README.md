# Tour Rescue

Qloo-powered agent that repairs a concert tour when one date falls through.

**Status: in development.** Built for the Qloo Agentic Hackathon 2026 (submission deadline 30 Oct 2026, 23:45 EDT).

A booker or tour manager has a confirmed 5-date tour in one region and loses one date. Tour Rescue compares three repair options (replacement venue in another city, a detour, or a day off), keeps all confirmed shows feasible (dates, drive times, daily limits, minimum spacing), scores cities with a Qloo taste "fit index", and shows for every recommendation which single assumption or comparison artist would flip the choice. Every run produces a reproducible, downloadable decision audit.

The core is deterministic (pure TypeScript functions). An LLM is optional and only writes a short summary; a template fallback is always available.

## Documents

- [docs/BRIEF.md](docs/BRIEF.md): product brief, scope, architecture, acceptance criteria, plan
- [docs/QLOO_NOTES.md](docs/QLOO_NOTES.md): what is confirmed about the Qloo API, and what is still unknown
- [docs/PRD.md](docs/PRD.md): domain decisions, fit formula, acceptance boundaries and five-PR roadmap
- [docs/DEPLOY.md](docs/DEPLOY.md): maintainer-supplied Pages/Worker skeleton and deployment commands
- [fixtures/README.md](fixtures/README.md): fixture naming for offline tests

## Licence

MIT, see [LICENSE](LICENSE).

## How to run

The core provides validated tour inputs, a pure cultural-fit index, three evaluated repair options, an explicit recommendation policy, bounded breakpoints and comparison-artist sensitivity. Install **Node 24** (see `.nvmrc`), then:

```sh
npm ci
npm run check
```

`check` runs strict TypeScript checking and Node's built-in test runner. After installing development dependencies, core checks need no network, Qloo key, Cloudflare account or LLM. There are no core runtime dependencies. GitHub Actions runs the same checks on pull requests.

Maintainers supplied a Pages placeholder and Worker health/Durable Object skeleton. The comparison UI and decision API are planned increments; `npm run dev` is not available yet. There is no live Qloo integration in PR3.

## Repository layout

```text
src/core/        Validation, fit, directed travel, decisions, breakpoints and sensitivity
src/qloo/        Normalization boundary; client awaits a verified response contract
src/worker/      Planned decision API boundary (PR4)
src/web/         Planned comparison UI boundary (PR5)
worker/         Maintained Worker health/Durable Object skeleton
web/            Maintained Pages placeholder
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

`parseScenarioFitInput` and `computeScenarioFitIndex` enforce the agreed scenario policy: target **0.5**, comparisons **0.5 / count**, or target **1** when no comparisons are supplied. The generic fit parser/calculator still accepts other valid sum-to-one weights for sensitivity runs.

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

## Recommendation, breakpoint and sensitivity contract

`evaluateTourDecision(scenario, fitInput, policy)` adds a recommendation to the unchanged three-option feasibility report. `analyzeTourDecision(scenario, fitInput, policy, ranges)` additionally returns bounded numeric breakpoints and comparison-artist omissions in a JSON-serializable `tour-rescue.decision-analysis.v1` report. Pass `undefined` for absent fit; no fit is fabricated. All entry points are pure and perform no I/O.

Policy `tour-rescue.decision-policy.v1` requires explicit `minimumFitIndex` (integer 0–100) and `maxAdditionalDistanceMetres` (nonnegative integer). There are no implicit preferences. A show must pass all original constraints and both preference gates. Eligible shows rank by **fit descending, extra metres ascending, then Unicode code-point option-ID order**. Fit and travel remain independent. An otherwise viable UNKNOWN show prevents asserting a winner. Day off is recommended only when both shows are definitively excluded and the day-off route passes. A recommendation identifies an option to investigate; it does not confirm a booking.

Ranges use `tour-rescue.breakpoint-ranges.v1`, with explicit `{ minimum, maximum }` for `maxAdditionalDistanceMetres`, `minimumFitIndex` and `additionalBudgetMinorUnits`. Each known baseline must lie within its range. Every axis changes one scalar only, at resolution **1 metre, 1 fit point or 1 minor currency unit**; budget currency stays fixed. The search checks the exact decision boundaries, not a heuristic sampling grid. Results include `found`, `not-found`, `unknown` or `not-applicable`, bounds, checked values and a full decision witness. A known loss of all feasible options is labelled `recommendation-withdrawn`. An unresolved outcome is not a witnessed flip or a successful stability result. No global “smallest change” is claimed across unlike units.

The [synthetic Germany policy](fixtures/synthetic/decision__germany__policy.json) starts at minimum fit 20 and a 350,000 m extra-distance cap. Its invented artist/booking evidence and maintained road model reproduce:

| Single changed preference | First reversing value within the declared range | Result |
|---|---|---|
| Extra-distance cap | 354,097 m, **+4,097 m** | Nuremberg → Frankfurt |
| Minimum fit | 26, +6 points | Nuremberg → day off |
| Venue-fee budget | EUR 499.99, from EUR 1,000.00 | Nuremberg → day off |

These are arithmetic examples, not measured Qloo demand or actual booking advice. The complete example is covered by `tests/decision-analysis.test.ts`.

Leave-one-artist-out removes **comparison artists only**, one at a time, keeping the target and city set fixed. Surviving weights are proportionally renormalized: 0.5/0.25/0.25 becomes 2/3 and 1/3, rather than resetting the scenario to 50/50. Every run retains removed-artist identity, before/after weights, fit provenance, decision and constraints for PR4. Unknown runs remain visible; a recovered result without a known baseline is not counted as a flip. The retained-recommendation fraction is available only when every requested omission is comparable. It is not statistical confidence. The different-target control run and downloadable audit remain PR4 work.

## Current evidence boundary

Public Qloo fixtures must be **synthetic**. Raw Qloo responses must not be published. The Germany road matrix is a separate maintainer-recorded OSRM model snapshot with its own source, timestamp and units. Maintainers also supplied geometry-only cell-to-city mapping in `src/qloo/geo.ts`; the complete live normalization contract, verified scenario coverage and Worker access remain **UNKNOWN**. The live key and probe data stay with maintainers. Existing `BRIEF.md` and `QLOO_NOTES.md` remain the source of product and probe requirements.
