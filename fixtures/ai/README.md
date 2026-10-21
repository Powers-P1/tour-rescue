# AI Rescue demonstration transcripts

These two files are **authored synthetic transcripts**, not recordings of an Anthropic response, a web search or a venue calendar. They keep the public demonstration available without spending tokens. The UI, session envelope and source records identify them as synthetic.

- `corridor-repair.json`: three fictional leads; the deterministic engine gives Nuremberg PASS, Frankfurt FAIL at the declared additional-distance cap, and Dresden PASS. Existing fictional venue facts may be retained only for the exact matching venue in the synthetic Germany scenario.
- `evidence-gaps.json`: two fictional research leads; both retain UNKNOWN availability and fees even though their routes pass. An absent calendar entry never proves a venue is available.

`src/ai/demo.ts` evaluates every draft through the current core, so these files do not contain hard-coded fit scores, travel metrics, decisions, breakpoint witnesses or PASS labels. The unchanged frozen 24-city universe, maintained directed OSRM matrix and synthetic Qloo-shaped percentiles remain the numeric inputs. All four original commitments remain locked.

Source links point to these public fixture files. Their runtime `retrievedAt` field describes local fixture evaluation; the warning and `provenance: "synthetic"` state that no page was retrieved. Token and provider-call usage is zero. Transcript event timestamps are also replay evaluation times.

Maintainers may later add an actual, sanitized recorded run, but it must have its own honest provenance, retrieval timestamps and sources. Never commit provider keys, private prompts, raw Qloo responses or an unredacted provider payload. A model claim of a fee or date-specific availability must not become a passed deterministic check.
