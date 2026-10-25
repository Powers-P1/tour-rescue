# Tour Rescue

[Jury demo](https://tour-rescue.pages.dev/judges/) · [Submission package](docs/SUBMISSION_PACKAGE.md) · [Release handoff](docs/HACKATHON_HANDOFF.md)

**The show’s off. The tour isn’t.** The band is already on the road and the crew still needs a plan. Tour Rescue helps tour managers and independent bookers compare their next move and prepare the next promoter conversation, using Qloo cultural-fit evidence alongside route checks.

**Status: deployed hackathon prototype.** Built for the Qloo Agentic Hackathon 2026 (submission deadline 30 Oct 2026, 23:45 EDT). It prepares the next promoter conversation; it does not confirm or book a show.

A booker or tour manager has a confirmed 5-date tour in one region and loses one date. Tour Rescue compares three repair options (replacement venue in another city, a detour, or a day off), keeps all confirmed shows feasible (dates, drive times, daily limits, minimum spacing), scores cities with a Qloo taste "fit index", and shows for every recommendation which single assumption or comparison artist would flip the choice. Every run produces a reproducible, downloadable decision audit.

The core is deterministic (pure TypeScript functions). The demo, live Qloo flow, breakpoint exploration and promoter sheet require no LLM. **AI Rescue (Pro)** adds bounded Claude Sonnet 5.5 research with source links; every proposal passes through the same checker and enters comparison only after explicit user acceptance.

The jury entry immediately identifies the mobile-first PWA. Install it on a phone, or use the complete desktop workflow. The offline public rescue shell excludes API responses and private research from its cache. See [the v2 judging path and validation](docs/V2_JUDGE_WORKFLOW.md) and [measured Qloo/Sonnet results](docs/validation/live-qloo-2026-10-23.md).

Private band knowledge is editable in the profile and Documents screens and persists on the current device. Live AI uses bounded lexical retrieval over that snapshot, records the excerpts used, and keeps them separate from verified public venue evidence. The two research procedures map to real tools. Notes never override hard constraints, and downloaded AI audits may contain the user's private excerpts. See [the AI contract](docs/AI_RESCUE.md).

**Tour SOS business hypothesis.** Agency subscription plans could be paired with fees or commissions on completed local services. This requires first building and onboarding a vetted local partner network for backline, repairs and urgent delivery. The current SOS flow is an offline sample with illustrative suppliers, prices and travel times; the partner network and payments still need to be built, and no service revenue is claimed. Willingness to pay and service economics remain untested.

## Documents

- [docs/BRIEF.md](docs/BRIEF.md): product brief, scope, architecture, acceptance criteria, plan
- [docs/QLOO_NOTES.md](docs/QLOO_NOTES.md): what is confirmed about the Qloo API, and what is still unknown
- [docs/PRD.md](docs/PRD.md): domain decisions, fit formula, acceptance boundaries and seven-PR roadmap
- [docs/API.md](docs/API.md): demo/live requests, audit replay and error semantics
- [docs/DEPLOY.md](docs/DEPLOY.md): Worker configuration, private quotas/cache and maintainer deployment commands
- [docs/AI_RESCUE.md](docs/AI_RESCUE.md): agent tools, source provenance, token/session bounds and AI audit contract
- [fixtures/README.md](fixtures/README.md): fixture naming for offline tests

## Licence

MIT, see [LICENSE](LICENSE).

## How to run

The core provides validated tour inputs, a pure cultural-fit index, three evaluated repair options, an explicit recommendation policy, bounded breakpoints, comparison-artist sensitivity and a replayable JSON audit. Install **Node 24** (see `.nvmrc`), then:

```sh
npm ci
npm run check
npm run web:build
npm run web:preview
```

`check` runs strict TypeScript checking for the core, Worker and browser, plus Node's built-in test runner. Tests use synthetic fixtures and injected HTTP/storage doubles; they need no Qloo key, Cloudflare account or LLM. There are no core or frontend runtime dependencies. `web:build` bundles the v2 landing page, judges page and application from `web2/` into `web/dist` with esbuild. GitHub Actions runs checks, local bundle builds, browser screenshot evidence and `worker:build` (Wrangler **without deploying**). `worker:dev` starts the optional local Worker and SQLite Durable Object.

Open **`http://localhost:4173`** for the landing page, or **`http://localhost:4173/app`** for the mobile-first rescue workspace: cancelled date, three options, a visible before/after breakpoint, evidence and promoter exports. Both evaluate the bundled synthetic fixture locally without a provider request. The landing table and exact **350 → 354.097 km** breakpoint come from the same core result as the app; this changes the extra-distance preference, not the daily-driving limit. Existing root hash links such as `/#options` forward to `/app#options`. Select an option and open its **Promoter sheet** for A4 print/Save PDF or a canvas PNG download. Demo includes two comparison artists; the third sheet slot is explicitly UNKNOWN.

Choose **Start the guided tour** on the landing page, in its judges section or in the app for six steps: cancelled date, option checks, the 354.1 km what-if, evidence, exports and optional AI research. It starts only on an explicit action, supports keyboard controls and **Esc / Skip**, and saves progress/completion in localStorage. Starting inside the app uses a temporary synthetic demo and restores the previous comparison on Skip or Finish; starting from the landing page leaves the explored demo open. See [DEPLOY](docs/DEPLOY.md#guided-tour-pr7) for storage and routing details.

**Rescue with AI (Pro)** opens two saved synthetic research transcripts without a key or network request. Live AI starts from a server-recorded live Qloo result, streams tool progress, and proposes 2–4 evidence-linked options. Accept a lead to replace its A/B comparison card and recalculate constraints, breakpoints and the audit. Researched venue availability and fees remain UNKNOWN. Saved demo transcripts are authored examples, not claimed recordings of Claude calls.

The **Try live** dialog uses the public Worker, searches real artist identities, and submits a target, zero to three comparisons and a distinct control. Qloo evidence can change; the Germany route and venue facts remain fictional. Failures and missing evidence remain visible without falling back to synthetic scores. `PUBLIC_WORKER_ORIGIN` configures the public API origin at build time; it is never a key. See [DEPLOY](docs/DEPLOY.md) for Pages settings, CORS, quotas and maintainer deployment.

If running `worker:dev`, `http://localhost:8787/api/demo` and `/api/demo/audit` expose the same labelled demo and JSON without a secret. `/health` describes both live switches and effective Qloo caps; `/do-check` exercises `UnitLedger`. Both live switches are enabled in the measured production Worker; local AI remains opt-in and requires its configured secret. See the single [PRD roadmap](docs/PRD.md).

## Repository layout

```text
src/core/        Validation, fit, travel, decisions, breakpoints, sensitivity and audit
src/qloo/        Verified Qloo contracts, bounded client and cell-to-city normalization
src/demo/        Shared Germany scenario builder and explicitly synthetic demo inputs
src/ai/          Pure proposal tools, AI evidence contracts and synthetic transcript replay
src/worker/      Pointer to the runtime implementation under worker/
src/web/         Pointer to the implemented frontend under web/
worker/         Edge API, SQLite UnitLedger, persistent quotas and private cache
web2/           Production v2: mobile/desktop workspace, judges entry, guided tour and PWA
web/            Legacy UI and shared pure/rendering components
web/dist/       Generated static Pages output (ignored by git)
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

Leave-one-artist-out removes **comparison artists only**, one at a time, keeping the target and city set fixed. Surviving weights are proportionally renormalized: 0.5/0.25/0.25 becomes 2/3 and 1/3, rather than resetting the scenario to 50/50. Every run retains removed-artist identity, before/after weights, fit provenance, decision and constraints in the audit. Unknown runs remain visible; a recovered result without a known baseline is not counted as a flip. The retained-recommendation fraction is available only when every requested omission is comparable. It is not statistical confidence.

## Audit and API contract

`createDecisionAudit` combines the decision analysis with the frozen city universe, projected request parameters, warnings, supplied timestamps, a different-target control, route changes and a **zero-violations gate**. The control changes only the target artist; all comparisons, weights, candidate cities, road facts and preferences stay fixed. The gate concerns the recommended option's declared checks. It reports UNKNOWN when there is no recommendation and never treats zero known failures as proof that unresolved checks passed.

`replayDecisionAudit` recomputes the results from the audit's versioned inputs. Replay contains **within-query percentiles with ties and missingness preserved**, not raw Qloo affinities or geohash payloads. Query acquisition times and response references survive cache hits; synthetic fixtures never claim an HTTP status or live recording time. The JSON also names unchanged locked shows and reports every added, removed or modified stop.

The fixed Germany API uses the same scenario builder as the tests. Demo artist affinities, venues, availability and fees are invented. Live mode replaces artist evidence with separate Qloo calls while keeping this explicitly synthetic booking scenario and the frozen OSRM matrix. It accepts resolved artist UUIDs and bounded preference changes, not arbitrary routes or Qloo query URLs. The target/comparison weights remain 50/50; up to three comparisons and one distinct control artist are supported. Search and live evaluation each count as one daily action.

Server-side calculation runs inside the existing SQLite `UnitLedger` Durable Object; the outer Worker bounds requests and forwards them. The frontend also runs the pure core for fixture demo, response replay verification and local what-if adjustments. Limits are persistent: **10 outgoing Qloo calls per rolling second**, **50,000 per UTC month**, and defaults of **150 live actions per UTC day** and **25 per daily client hash**. AI uses its separate daily session budget. Private cache hits skip provider quota but still count as live actions. Failed requests consume their reserved allowance. The Qloo key stays in `QLOO_API_KEY`; only allowlisted metadata and derived ranks reach public responses. See [API](docs/API.md) for schemas and failure behavior.

## Current evidence boundary

Public Qloo fixtures must be **synthetic**. Raw Qloo responses must not be published. The Germany road matrix is a separate maintainer-recorded OSRM model snapshot with its own source, timestamp and units. Qloo response shapes are checked against official documentation and the published official search harness, then exercised with invented values. `src/qloo/geo.ts` maps cells to the frozen cities; the adapter averages returned cell affinity per city before the core computes percentiles. An incomplete profile makes aggregate fit UNKNOWN; it never silently shrinks the city set.

Coverage for selected artists is recorded in each returned audit; missing city evidence remains **UNKNOWN**. The client caps each response at 8,000,000 bytes, 60,000 cells and 10 seconds, with no partial ranking on overflow. Maintainers run the deployed live probes; implementation tests use synthetic responses. The live key and raw probe data stay with maintainers. Existing `BRIEF.md` and `QLOO_NOTES.md` remain the source of product and probe requirements.

## Frontend evidence and design boundaries

The interface follows [docs/mockups](docs/mockups/README.md) with English copy and the README's logical corrections. It uses actual core outputs rather than the images' illustrative numbers. Feasibility and decision preferences have separate statuses; fit and additional kilometres are independent SVG axes. A day off has **N/A** fit and is not plotted as 50. Breakpoint controls expose the implemented extra-distance, minimum-fit and venue-fee axes, never a fabricated daily-driving breakpoint.

The Evidence view includes every comparison omission, all three options, the distinct control and the frozen city set. Tag Bridge requires matching returned tag IDs with provenance on both sides, is capped at three tags, and never enters scoring. Current API responses contain no verified tag evidence, so the card correctly displays **UNKNOWN** in demo and live. Raw Qloo responses are never included in the public fixture or browser bundle.

Map context uses a small [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) public-domain Germany outline and the maintained city coordinates. Connections are explicitly schematic; all road metrics come from OSRM. No map tile service or remote font is required. Every interactive screen supports keyboard navigation and responsive layouts; status text accompanies all status colours.

## Front-end v2 (PR-D)

The `tour-rescue` Pages project is **direct-upload**, not Git-integrated: it has no configured Cloudflare build command or automatic deploy on merge. The repository's **local** `npm run web:build` command produces `web/dist` from `web2/` for a separately authorised manual `wrangler pages deploy` upload:
`/` = new landing; `/judges/` = concise Qloo judges entry; `/app/` = the Tour Rescue workspace.
Launch the ready rescue case at `/app/#rescue`. No sign-in or Qloo call is needed for the visibly synthetic saved demo. Fresh live artist evidence is an explicit, rate-limited action. `npm run web:build` is the local v2 bundle step, not a Cloudflare build setting; `npm run web2:build` targets the isolated preview. To roll back, run `npm run web:legacy-build` and manually upload the resulting `web/dist` with Wrangler. Merges to `main` cannot deploy to this direct-upload Pages project.

The original `web/` files remain in the repository until post-launch acceptance. Review `docs/DEPLOY.md#front-v2-deployment-switch-pr-d` before any Cloudflare production deployment. Generated screenshots are uploaded as GitHub Actions artifacts, not substituted for manual reviewer confirmation. Public marketing uses two Unsplash-licensed editorial photos, credited in `web2/README.md`. The photo subjects are **not** claimed as the fictional Northbound band, supplier or tour manager.

## Germany offline map - real boundary

The front-end v2 Germany map uses a locally bundled, simplified **Natural Earth 1:10m public-domain** outline and WGS84 city-centre coordinates; it makes **no map-tile or external geography requests**. Inline SVG overlays draw the current Berlin–Leipzig–Munich plan as a solid connection and reviewed candidate alternatives as dashed curves (not road geometry). All actual drive checks continue to use the separately stored OSRM snapshot. See [web2/README.md](web2/README.md#germany-geographic-map-natural-earth-110m-public-domain) for data source, coordinates and licence.
