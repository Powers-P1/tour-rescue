# Tour Rescue v2 - PR-A preview

This directory is the **new**, independent mobile-first front end. It does **not** replace or deploy `web/`; the deployment switch is PR-D.

## Development

From the repo root (Node 24; `npm ci`):

```sh
npm run check
npm run web2:build
npm run web2:dev
```

Open `http://localhost:4174/`. Override the Worker endpoint at build time with `PUBLIC_WORKER_ORIGIN=https://your-worker.example npm run web2:build`. The Worker must allow this browser origin in its own CORS setting. The default production Worker origin is the same as the old `web/` build. Google Fonts use fallbacks if offline.

## Scope and truthfulness

- Mobile board **01**: Today → checked directions → detail → promoter draft. Navigation is Today, Route and Crew. Focused rescue hides bottom tabs while leaving Back and SOS. Crew has a visibly **sample** day-sheet preview. SOS is an explicitly **not implemented** entry for PR-B.
- Desktop board **04**: sidebar, one incident, simplified map, three actions and a locked/cancelled dates strip. The diagram is a **schematic**, not a routing source. Current plan uses a solid stroke; a proposed show uses a dashed amber stroke and the word "Proposed".
- Source-backed default: `createDemoResult()` invokes the existing deterministic core with synthetic Qloo-shaped fit input, recorded OSRM snapshot and original frozen scenario. A separate explicit **Run fresh Qloo evidence** flow resolves real artist entity IDs via `POST /api/live/search`, then calls the Worker `POST /api/live`. The returned audit is recomputed with `replayDecisionAudit` and is the only input to v2 option labels and road figures.
- After selecting an option, the one-page promoter PDF is a browser **Print / save to PDF** document built from `buildPromoterModel`, which reuses the existing audit. Message composition/copy cannot mark a proposal "Sent". No venue booking, availability or promoter acceptance is asserted.
- An error in live search or evaluation preserves the prior decision and reports the error. A failed live Qloo run never silently falls back to demo evidence. The original `web/` app and Worker remain intact.
- The state reducer includes all phases from `new` through `confirmed / rejected / stale`, but only up to `draft` is reachable through v2 PR-A. `sent` requires an external delivery reference; a response requires a reply reference. The latter phases are tested rather than mocked as completed actions.

### Known design deviations, not hidden

The provided visual board has **Leipzig 12 Nov between Berlin 11 and Munich 13** and names **Erfurt, Dresden, Halle** with a **5h** limit. The actual Worker currently exposes **Leipzig 14 Nov**, **Nuremberg, Frankfurt, day off**, a **6h daily** limit and five immutable stops. For PR-A v2 displays **actual evaluated core candidates, dates and checks**, not the illustrative numbers on the bitmap. Harmonizing the Worker scenario with the new board requires a separate core contract change and fresh fixtures/tests; inventing a Qloo result or relabeling its options would make the judges' evidence false.

The board 04 map is schematic for quick context, with a visible description. "Northbound", next load-in at 16:00 and crew snippets are editorial **sample** workspace content, not booked shows or ticketing results. The old core tour name and date/route are projected transparently. All audience, agency, SOS, planner, fan and finance features remain for PR-B/C; landing/judges pages and deployment switch remain for PR-D.

## Review

Run tests `tests/web2-state.test.ts` and `tests/web2-model.test.ts`. Check at 390x844, 375px and a 1536px desktop. Verify tab order, labels and keyboard focus, option selection, that evidence expands only on demand, live role selection and failure handling, the PDF print page, and that no "Sent" state appears after drafting/copying.


## PR-B: sample extensions and AI agent hook (boards 02 and 03)

### Screens and actions
- **02-Mobile-SOS.png:** three focused steps from local incident form, to **two illustrative suppliers**, to an **illustrative quote** and optional **local sample spend approval preview**. All quantities and names are labelled synthetic. The preview does not contact, negotiate with, pay or dispatch a supplier. Budget cap is checked in pure state logic before the sample approval preview.
- **03-Mobile-Plan-Decide-Fans.png:** a prose-based sample tour brief and transparent extraction of declared constraints (no route built or bookings invented); sample economics generated mathematically from €20 × 70%, €2,100 cost and 120–180 assumed attendees; a public-style **/#fan** page for the sample band. Fan interactions are visual previews only; an optional email is never stored or transmitted. Qloo affinity remains separate from hypothetical ticket outcomes.
- The **Route** tab now opens a low-density workspace with explicit secondary links for Plan, Economics, Fan, and AI. One focused rescue action remains the top priority on Today.
- **AI hook:** reuse the existing `web/src/ai-client.ts` checked streaming parser for explicit server-side Claude research **only after a real Qloo Worker evaluation**. A separate saved fixture through `createAiDemoSession('corridor-repair')` is visibly synthetic. Research leads and deterministic pass/fail/unknown are displayed without automatic adoption, sending or booking.

### Visual follow-ups from PR-A review
- Proposed map segment uses a separate curved dashed path, with improved label anchors.
- Fixed mobile Today/Route bottom tabs and outlined day-sheet action; raised captions/badges from 13 to 14px.
- Tightened desktop command layout at 980–1390px; explicit live failure prefix and disabled Qloo explanation; improved day-off CTA.
- Retain existing core's **Leipzig 14 Nov**, **Nuremberg / Frankfurt / day off**, **6h** rather than art-board example labels.

### Known deviations from boards
1. Board 02 quote is **not obtained from a provider**; sample fixture only. Consequently CTA says “Review sample quote” and the supposed approval results in a local **simulation**, not an order or supplier confirmation. Inbound/outbound travel times are fictional.
2. Board 03 prose brief is **not an unrestricted optimizer** and never updates the frozen Germany core. It extracts some explicit terms and presents unverified slots; real route/availability require a future planner service.
3. Board 03 economic case is a user-input scenario, **not a Qloo ticket forecast**. The “Review terms” outcome is a checklist, not negotiated terms.
4. Board 03 fan photo is currently **SVG illustrative stage artwork** (clearly labelled) instead of a licensed backstage photo. Fan-interest storage, consent and email updates are not implemented. The UI makes no vote-count or capture claims.
5. Agent hook only connects live **tour rescue research** from the existing Worker, not local SOS supplier sourcing. Research output is not automatically accepted into comparison. The saved research mode is an authored synthetic transcript, never a Claude recording.
6. Desktop boards 05–07, landing board 08, judges board 09 and deploy switch remain PR-C/D scope.

### Tests
Pure tests in `tests/web2-extensions.test.ts` guard sample approval ordering and spending cap, explicit planner constraints, and the economic break-even/range. The original `npm run check` and separate `web2:build` remain mandatory. Browser-focus and responsive review are still recommended.

## PR-B review fixes after PR-A squash

Rebased B-only changes onto the merged `main` tree; old PR-A commits are not carried forward.
The public `#fan` screen participates in focus restoration through its `#main` element, and
keyboard focus policy has a CPU assertion for retained fan action targets.
The sample planner now displays three unverified corridor segments and explicit weak links.
AI progress / completion / failure use an icon plus text; evidence links have a 48px minimum target.

## PR-C - Desktop 05 Audience / 06 Simulation / 07 Agency

Desktop pages are rendered via the existing graphite/amber shell in `web2/`.
Board **05** has a Qloo cultural-fit map from the *current audited, frozen German candidate set*, with selectable nominated and discovery cities. Only nominated options can open checked route simulations. A separate Fan requests tab says no recorded declarations are available; it neither invents crowd sizes nor recycles Qloo data. Relative rank circles are schematic (no people tracking).

Board **06** uses `recomputeResult` from the existing pure core when a user adjusts the permitted extra-distance preference (0–500 km, metre increments). Locked shows remain unchanged, failed checks remain visible, venue/contract uncertainty remains UNKNOWN. Saving creates only a **device-local versioned draft** keyed to this evidence context; it never updates the live tour, a venue or a promoter. A promoter preview builds the same one-page draft from the actual simulation audit, without dispatch.

Board **07** shows three fictitious agency issues and a fourth issue-free sample tour. Owner assignment changes only in-memory display; opening the SOS / rescue cases returns to the already labelled existing demo flows. Local time zones are written explicitly. Share copies a **sample** overview rather than contacting the agency.

**Deviations from boards 05–07:** the screenshot map has designed Erfurt/Dresden/Halle regions but the frozen core nominates Nuremberg/Frankfurt (as approved), so cities and relative evidence come from actual audit instead. Fan requests have no collector and therefore a truthful empty state rather than fake declarations. The map uses fixture geography, not a rendered basemap. The 06 simulation may be FAIL/UNKNOWN under actual rules rather than artificially PASS and does not assume a 5-hour limit (actual 6h). The 07 sample agency is intentionally not a real connected task system. No deploy switch before PR-D.

## PR-D: public landing, judges page and Pages switch

- **08 Landing** at `/`: calm graphite/amber hero, editorial production photography and mobile incident inset, separate core rescue and fictional local SOS, warm paper agency band. Actual option labels/check status and optional breakpoint are projected from `createLandingModel(createDemoResult())`.
- **09 Judges** at `/judges/`: visible **Judges · Start here** utility header, one click to ready Leipzig example, computed three-way sample comparison, exact core evidence links, JSON audit export, separate implemented-vs-concept scope, public MIT source and Qloo+OSRM+agent limitations.
- Public Pages command `npm run web:build` produces `web/dist` using **v2**, without editing `web/` source or Cloudflare settings. `npm run web2:build` produces `web2/dist`. `npm run web:legacy-build` preserves rollback.
- Editorial photographs under the **Unsplash License**: behind-the-scenes film crew photo by Logan Ward (<https://unsplash.com/photos/EDZLyd6re_M>) and drummer adjusting a snare by Rogelio Gonzalez (<https://unsplash.com/photos/ZB-VdffP1UY>). These are contextual images; the exact ImageGen blue-hour touring van and repair shot are **not** available as clean licensed photo assets, so no false identity/location is implied.
- Main navigation links are real `/app/`, `/judges/`, GitHub repository, docs and audit actions. No checkout, sign-up or outbound promoter email.
- Existing root app hash links are redirected to the new ready demo. Public `#fan` opens the no-persistence sample artist page under `/app/#fan`.
- The illustrated Berlin-Leipzig-[Nuremberg/Frankfurt]-Munich corridor uses audited core values for chosen city and all option statuses; its SVG is a labelled *schematic*, not routed geodata.

### Design deviations

The static boards illustrate Leipzig 12 November and Erfurt/Dresden/Halle with 5-hour limits. Per maintainer decision, the deployed application and public landing use **the unchanged validated core**: Leipzig 14 November, Nuremberg/Frankfurt/day off, six-hour limit. The marketing photo has backstage production crew instead of a specifically staged van/tour manager and a real drummer adjusting a snare instead of the fictional 22-inch kick repair; photo licensing and representation are honest. SOS, agency, plan, fan features remain sample/demo-only. AI/Worker provider access is not proved by build-only screenshots. The judges page never marks synthetic artist evidence as a live Qloo recording.

### Offline artwork fallback

The two Unsplash editorial photographs are optional. Local vector illustrations in `web2/assets/` depict a parked tour van at a backstage loading door and a technician adjusting a drum head. If a screenshot runner or offline viewer cannot reach `images.unsplash.com`, these illustrations prevent blank photography panels. They are openly described as illustrations, not photos or genuine staff/suppliers.
