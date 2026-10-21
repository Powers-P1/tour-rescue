# Tour Rescue v2 - PR-A preview

This directory is the **new**, independent mobile-first front end. It does **not** replace or deploy \`web/\`; the deployment switch is PR-D.

## Development

From the repo root (Node 24; \`npm ci\`):

\`\`\`sh
npm run check
npm run web2:build
npm run web2:dev
\`\`\`

Open \`http://localhost:4174/\`. Override the Worker endpoint at build time with \`PUBLIC_WORKER_ORIGIN=https://your-worker.example npm run web2:build\`. The Worker must allow this browser origin in its own CORS setting. The default production Worker origin is the same as the old \`web/\` build. Google Fonts use fallbacks if offline.

## Scope and truthfulness

- Mobile board **01**: Today → checked directions → detail → promoter draft. Navigation is Today, Route and Crew. Focused rescue hides bottom tabs while leaving Back and SOS. Crew has a visibly **sample** day-sheet preview. SOS is an explicitly **not implemented** entry for PR-B.
- Desktop board **04**: sidebar, one incident, simplified map, three actions and a locked/cancelled dates strip. The diagram is a **schematic**, not a routing source. Current plan uses a solid stroke; a proposed show uses a dashed amber stroke and the word "Proposed".
- Source-backed default: \`createDemoResult()\` invokes the existing deterministic core with synthetic Qloo-shaped fit input, recorded OSRM snapshot and original frozen scenario. A separate explicit **Run fresh Qloo evidence** flow resolves real artist entity IDs via \`POST /api/live/search\`, then calls the Worker \`POST /api/live\`. The returned audit is recomputed with \`replayDecisionAudit\` and is the only input to v2 option labels and road figures.
- After selecting an option, the one-page promoter PDF is a browser **Print / save to PDF** document built from \`buildPromoterModel\`, which reuses the existing audit. Message composition/copy cannot mark a proposal "Sent". No venue booking, availability or promoter acceptance is asserted.
- An error in live search or evaluation preserves the prior decision and reports the error. A failed live Qloo run never silently falls back to demo evidence. The original \`web/\` app and Worker remain intact.
- The state reducer includes all phases from \`new\` through \`confirmed / rejected / stale\`, but only up to \`draft\` is reachable through v2 PR-A. \`sent\` requires an external delivery reference; a response requires a reply reference. The latter phases are tested rather than mocked as completed actions.

### Known design deviations, not hidden

The provided visual board has **Leipzig 12 Nov between Berlin 11 and Munich 13** and names **Erfurt, Dresden, Halle** with a **5h** limit. The actual Worker currently exposes **Leipzig 14 Nov**, **Nuremberg, Frankfurt, day off**, a **6h daily** limit and five immutable stops. For PR-A v2 displays **actual evaluated core candidates, dates and checks**, not the illustrative numbers on the bitmap. Harmonizing the Worker scenario with the new board requires a separate core contract change and fresh fixtures/tests; inventing a Qloo result or relabeling its options would make the judges' evidence false.

The board 04 map is schematic for quick context, with a visible description. "Northbound", next load-in at 16:00 and crew snippets are editorial **sample** workspace content, not booked shows or ticketing results. The old core tour name and date/route are projected transparently. All audience, agency, SOS, planner, fan and finance features remain for PR-B/C; landing/judges pages and deployment switch remain for PR-D.

## Review

Run tests \`tests/web2-state.test.ts\` and \`tests/web2-model.test.ts\`. Check at 390x844, 375px and a 1536px desktop. Verify tab order, labels and keyboard focus, option selection, that evidence expands only on demand, live role selection and failure handling, the PDF print page, and that no "Sent" state appears after drafting/copying.
