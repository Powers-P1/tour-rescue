# AI Rescue (Pro) - PR6

AI Rescue investigates leads for the cancelled date, then asks the booker to **accept a proposal into comparison**. It does not book, contact venues, move locked shows, edit road measurements, or set a check to PASS. The original five-screen deterministic workflow remains available without an LLM.

## Flow and evidence

Open **Rescue with AI (Pro)** (`#ai`). Saved demo replays two bundled, explicitly **authored synthetic transcripts**: `corridor-repair` (three proposals with different gate outcomes) and `evidence-gaps` (two leads whose booking evidence is missing). Their messages are fixtures, not recordings of Claude or web requests. Demo uses no provider and consumes no daily AI sessions. Synthetic source timestamps describe local fixture evaluation.

For live research, first load a live Qloo result through **Try live**. The Worker saves its rank-only replay and query evidence in the existing bounded private cache, associated with the server-derived daily client hash. AI receives the original run ID and bounded current preferences. The browser cannot submit its own affinity vectors, road matrix, tool URLs, model ID, availability or fees. Context expires after six hours, may be evicted at cache capacity, and becomes inaccessible when the daily client identity changes. Refresh Qloo when asked; there is no fallback to synthetic fit.

The Worker runs `claude-sonnet-5-5` using the Anthropic Messages API. Claude chooses tools and research steps. The browser receives a stream of tool progress summaries, followed by a result containing two to four proposals, source links, deterministic checks, usage and stop reason. Private model thinking and raw page/Qloo payloads are not streamed. An incomplete, interrupted or failed session may expose checked leads for review but cannot be accepted into comparison.

Each draft can supply only an ID, replacement/detour slot, frozen city ID, venue name, explanation, source IDs and risks. The pure validator rebuilds the scenario and calls the existing repair, decision, breakpoint, omission and audit functions. The cancelled slot's schedule and all four locked shows remain identical. The 24-city universe and directed OSRM snapshot never expand implicitly. A proposal cannot reuse the other show card's city, overwrite its venue, or replace day off.

Live researched venues always have **UNKNOWN availability, fee, capacity and promoter terms**. An empty calendar is not evidence that a room can be hired. A listed event or festival, public holiday or weather page is a lead for investigation; it does not automatically change the numeric constraints. The explanation is a model synthesis linked to retrieved pages, not independently verified fact. Weather outside a reliable forecast window stays unresolved. Only the exact labelled fictional venue in a synthetic transcript can retain its fixture booking facts.

Acceptance reruns the checker against the current cards and thresholds, including after a local what-if. Accepting two proposals replaces the corresponding A/B slots; C remains day off. Accepting a second proposal for the same slot replaces that card explicitly. A collision with the other city produces an error and leaves the comparison untouched. Starting another research context requires a fresh live result. Switching from live comparison to a saved demo is labelled and replaces the comparison with demo evidence.

## Code boundaries

| Location | Responsibility |
|---|---|
| `src/ai/types.ts` | Versioned proposal, source, stream, session, acceptance and audit envelope contracts |
| `src/ai/tools.ts` | Pure fit/road readers, proposal validation, decision/audit wrappers and explicit acceptance |
| `src/ai/demo.ts`, `fixtures/ai/` | Two authored synthetic transcripts; all statuses recalculated |
| `worker/src/ai-provider.ts` | Bounded Messages HTTP client; exact model, secret header, safe errors |
| `worker/src/ai-agent.ts` | Tool-selection loop, source registry, cumulative budgets and progress |
| `worker/src/ai-routes.ts` | Private baseline retrieval, daily reservation and NDJSON response |
| `worker/src/ledger.ts` | Existing transactional UnitLedger state plus separate AI counters |
| `web/src/ai-client.ts`, `ai-view.ts` | Stream validation, replay verification, research view and acceptance callback |

Client tools are `get_fit_data`, `get_road_legs` (at most 6 by 6 directed legs), `get_sources`, `validate_option`, `analyze_decision`, `generate_audit`, and `submit_proposals`. The latter validates every submitted draft again. Tool input is runtime-checked; an LLM-provided PASS or numerical field is unsupported input. Research uses Anthropic's basic `web_search_20250305` and `web_fetch_20250910` server tools. There is no arbitrary-URL fetcher on the Worker and no extra search-provider secret.

The source registry accepts metadata only from matching native server tool results, not links invented in model prose. It keeps public HTTPS URLs, titles, retrieval timestamps, tool kind and provenance; at most 32 sources. Pages are untrusted data. Tool/system instructions prohibit following page instructions, contacting anyone or treating cultural fit as ticket demand. Source registration proves a provider returned the URL, not that every claim in the proposal is true.

## Bounds

| Bound | Production default / maximum |
|---|---|
| AI sessions per UTC day | 40 global, 5 per daily client hash (`AI_DAILY_CAP`, `AI_CLIENT_CAP`); hard ceilings 200 / 20 |
| Messages requests per session | 6, no automatic retries |
| Generated output per session | **8,000 tokens** cumulatively, including thinking/tool output counted by Anthropic; each request at most 1,500 and the remaining allowance |
| Input usage stop | Stop further calls when reported cumulative input reaches `AI_MAX_INPUT_TOKENS` (default 150,000, ceiling 400,000); checked after each response. At 80% of the step, output or input budget the next request adds a FINALIZE NOW instruction so the session ends with `submit_proposals` |
| Deterministic/client tool calls | 24 per session |
| Web calls | At most one search and one fetch per Messages request, hence at most 6 searches and 6 fetches per session |
| Fetched context | `max_content_tokens: 1000` per page fetch; replayed context keeps at most 6 search results (each at most 1,500 characters, larger ones are dropped) and 4,000 characters of fetched text; the source registry keeps every link |
| Time | 90 seconds per session; 40 seconds per Messages request, including body download |
| HTTP payloads | 16 KiB public request; 128 KiB Messages request; 512 KiB Messages response; browser stream capped at 8 MiB |

The output token allowance is a hard generation bound enforced before each request. The input threshold is **not a hard pre-billing ceiling**: provider-operated research can add input during a request. Anthropic's token-count endpoint does not accept these web tools and its task budget is advisory. The native fetched-content token limit covers text, not PDFs; the prompt requests text/HTML, but that instruction is not a hard billing guard. Actual input/output and search/fetch usage are recorded. The step, time, body, fetched-content and daily-session bounds further restrict spend, but this implementation does not claim an exact dollar ceiling. A provider request that fails before returning usage can incur cost whose exact token count is UNKNOWN.

Daily counters are reserved atomically before the paid stream starts. Failed or cancelled sessions remain counted. AI quotas are separate from the existing Qloo search/evaluation and upstream quotas. There is no refund/retry loophole. The same `UnitLedger` binding, named instance and SQLite migration `v1` remain in use; no migration or KV binding is added. Keys and raw IPs never enter results, transcripts, source URLs or logs.

## Audits and comparison

`tour-rescue.decision-audit.v1` stays backward compatible. AI JSON uses a separate `tour-rescue.ai-audit.v1` envelope containing the research session, bounded source metadata, the acceptances for the current A/B cards and the current deterministic `decisionAudit`. Each acceptance retains its own recalculated audit and session identity. When two different sessions supplied the current cards, `priorSessions` retains the other session and its source registry; accepting a new lead cannot silently reset the other card. Replacing the same card removes its obsolete acceptance from this current-state export. At most two contributing sessions are retained. Downloading the main audit after acceptance includes this envelope; ordinary comparisons still download the original v1 audit. The research view also exports its session for review before acceptance.

Breakpoints retain their original three axes and integer resolution. No daily-driving axis, blended fit/kilometres score or assumed booking confirmation is introduced. Unknown fees/availability may correctly make a recommendation and its breakpoint not applicable. The control artist, leave-one-comparison-out, route change report and zero-violations gate remain present in the nested decision audit.

## Provider contract and maintainer probe

The integration follows Anthropic's official [Sonnet 5.5 changes](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5), [web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [web fetch](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool), and [token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting). It uses `thinking: {type: 'between_tools'}`, `tool_choice: {type: 'auto'}` and append-only continuation with stable tools. It handles native research results, `pause_turn`, client tool calls, truncation and refusal without changing models silently.

Live Anthropic access, web-tool enablement, real citation coverage and latency from the deployed Worker are **UNKNOWN until the maintainer probe**. No real secret or paid Anthropic request was used during implementation. Enable `LIVE_ENABLED` and `AI_ENABLED` with both existing secrets, load a live Qloo decision, then run AI Rescue once. Verify real source links, exact model, usage, incomplete-result handling, explicit acceptance and exported audit. A model/account error must remain visible; it must not fall back to a different Claude model or demo.

“Pro” labels the proposed product tier. PR6 implements a quota-limited public demo, not billing, entitlement checks or a checkout.

## Cost accounting

Each session reports input/output tokens and an `estimatedCostUsd` with its `costBasis`. The estimate is approximate: Sonnet 5.5 list price $2 / $10 per million input / output tokens and $10 per 1,000 searches (Anthropic pricing page, checked 2026-10-21), all input at the base rate. `/health` shows `aiToday` (reserved and recorded sessions, tokens, estimated USD for the UTC day); sessions that fail without reporting usage add nothing, so the figure can understate.
