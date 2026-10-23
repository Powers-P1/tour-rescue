# Tour Rescue — copy-ready submission package

Prepared 24 October 2026. The [handoff](HACKATHON_HANDOFF.md) records the release and owner actions. This is an English submission draft, not a submitted Devpost entry.

## Submission fields

- Project: **Tour Rescue**
- Tagline: **A cancelled show. A clear next call.**
- Demo: https://tour-rescue.pages.dev/judges/
- App: https://tour-rescue.pages.dev/app/#rescue
- Guided judging path: https://tour-rescue.pages.dev/app/?tour=start#rescue
- Direct sensitivity experiment: https://tour-rescue.pages.dev/app/#breakpoint
- Public source: https://github.com/Powers-P1/tour-rescue
- Licence: MIT, detectable in the repository About area.
- Optional 100-second presentation: https://tour-rescue.pages.dev/judges/#walkthrough
- Built with: Qloo API, Claude Sonnet 5.5, TypeScript, Cloudflare Pages and Workers, SQLite Durable Objects, an OSRM road snapshot, HTML Canvas and a scoped PWA service worker.

## Description

### Inspiration

When a concert falls through mid-tour, a tour manager needs a defensible shortlist for the next promoter conversation. A map can show nearby cities and a chat can suggest venues, but neither automatically preserves confirmed shows, checks the extra travel and exposes how weak evidence or a changed constraint affects the choice.

### What it does

Tour Rescue compares a replacement, a detour and a day off while keeping four confirmed shows fixed. Qloo supplies relative cultural-fit evidence over a frozen set of cities. A deterministic checker combines it with directed road evidence and declared constraints. The user sees the recommendation, what failed and which assumption could reverse the choice, then exports a promoter brief and a reproducible source-bearing audit.

The first journey is deliberately short: **cancelled show → three options → sensitivity experiment → evidence → promoter brief**. In the labelled synthetic example, increasing the **additional-distance cap** from 350 to 354.1 km changes Nuremberg to Frankfurt am Main. This does not change the daily-driving limit or any confirmed concert. The current recommendation and the manually inspected option are distinguished; exports follow the actual current state.

Optional AI Rescue researches leads using the current Qloo result, route evidence, public sources and retrieved private band notes. The user explicitly accepts a lead into comparison. The same checker runs again, preserves the other comparison card and carries accepted-source provenance into the audit. Unknown date availability, fees and room terms remain **UNKNOWN**. No promoter is contacted and no booking is made.

### How we built it

The pure TypeScript core separates evidence, constraints and recommendation policy. It ranks complete artist profiles within one fixed city universe, never averages raw affinities across queries and never replaces a missing value with a synthetic score. Comparison-artist omission, a distinct control artist, Tag Bridge and independent fit/distance axes help the user inspect the evidence without inventing demand forecasts.

The mobile-first PWA and desktop workspace use the same model. The six-step interactive guide waits for actual actions, supports keyboard use, Escape, pause and Skip, and restores the previous workspace after its temporary synthetic case. A4 print, canvas PNG and JSON exports stay tied to the selected option. Private local band notes are editable; task-specific lexical retrieval records which excerpts were used. A Worker keeps provider credentials out of the browser and bounds live usage.

### What we verified

The separately labelled [recorded Qloo study](validation/live-qloo-2026-10-23.md) used Radiohead, Arctic Monkeys and Dua Lipa over 24 frozen cities. Each selected profile had 24/24 coverage. All three retained Nuremberg at the same 350 km cap; neither control nor comparison omission changed the winning city. **These runs did not demonstrate an artist-specific winner change.** Removing taste evidence produced the application's needs-evidence gate; that is not a causal measurement of improved outcomes. The synthetic breakpoint is a separate reproducible experiment.

One measured live Sonnet session made five model requests, nine client-tool calls and one native web search. Explicit acceptance of a Kassel lead updated the comparison and exported its source provenance. The Worker estimated USD 0.3027 for that session; this is an estimate, not a billing invoice. The final release report records the exact offline tests, builds and browser checks. No new paid provider run is needed for the saved judging journey.

### Challenges and limits

The important challenge is giving a useful next action without pretending a cultural-fit rank proves ticket demand or that a researched venue is available. The promoter brief makes the next human confirmations explicit: date, room/rider suitability, fees/terms and cost assumptions. SOS, agency and planner remain labelled sample extensions; sample technicians, arrival times and quotes do not imply a real fulfilment network.

We have not measured revenue rescued, faster booking, tour-manager adoption or willingness to pay. Real venue confirmation, ticket demand, full transport optimization and payment/booking are outside this prototype. Physical Android/iPhone installation remains a separate manual check; responsive browser and PWA-hook tests are not physical-device validation.

### What's next

Observe a tour manager working through one real cancelled-date brief, compare the shortlist with their existing map/spreadsheet/contact workflow and record which evidence changed the next promoter conversation. Establish whether a per-tour or agency licence is worth paying for before extending the sample modules. This is a validation plan, not a completed customer study.

## Testing instructions

No sign-in or key is needed for the saved demo. Keep live research separate from the authored replay.

1. Open the judges page on mobile or desktop and choose the guided rescue. Review the cancelled date and the three options; the other four shows stay fixed.
2. Open the extra-distance experiment. Change 350 to **354.1 km**. Verify the visible before/after recommendation is **Nuremberg → Frankfurt am Main**, while the daily limit remains unchanged.
3. Inspect evidence, control and leave-one-comparison-artist-out results. Compare the separately labelled three-artist recorded live study; it reports unchanged winners rather than borrowing the synthetic reversal.
4. Export the current JSON audit and promoter document. Check the current threshold, selected city, additional kilometres, comparison artists, sensitivity note and outstanding confirmations. Print to A4 or download the canvas PNG.
5. Optionally open AI Rescue in saved-example mode, choose either corridor-repair or evidence-gaps, inspect sources and explicitly accept a checked lead. Revalidation updates one comparison card, preserves the other and includes accepted sources in the current audit. UNKNOWN availability and fees stay UNKNOWN. Cancellation or an error preserves the previous comparison.
6. Optionally explore the separate SOS tutorial. Its supplier approval is simulated and sends no contact or payment.

Use Node 24 and `npm ci --ignore-scripts`, `npm run check`, `npm run web:build`, `npm run worker:build` for local verification. The Pages build comes from **web2/** into **web/dist**. Offline tests need no provider credential. Do not publish raw Qloo replies or private band excerpts in source.

## Judging criteria and evidence

| Criterion | Demonstrated evidence | Limit to keep explicit |
| --- | --- | --- |
| Technological implementation | Qloo normalization, frozen-city ranking, deterministic checks, control/omission analysis, agent tool loop and source-bearing acceptance | Qloo affinities are relative taste evidence, not demand or booking probabilities |
| Design | Mobile-first and desktop journey, action-gated tutorial, current-state exports | Physical PWA installation has not been certified on phones |
| Potential impact | A constrained shortlist and next promoter brief after a cancellation | No measured savings, booking uplift or paying users |
| Quality of the idea | Cultural evidence combined with route feasibility and explicit sensitivity | Recorded real winners remained unchanged in the small sample |

## Media, rights and final owner actions

The approved [final-v2 film package](demo/final-v2/README.md) contains the 100-second H.264/AAC film, English narration, 22-cue VTT/SRT subtitles, poster, provenance and QA. Its SHA-256 is `9d5e25ece393070f3ab889e4cb2a41c8549259473b449d06e4863725d2413bb2`. It uses actual responsive app captures with edited presentation motion. It shows the core rescue journey; SOS is a separate extension, not an unshown claim about this film. No footage or soundtrack from reference videos was reused. Retain generation/account rights evidence.

The [official rules](https://qloo.devpost.com/rules), checked 24 October, require a working demo, English description and a public repository with an open-source licence visible in About. Video is optional. Maintain free judging access until the judging period ends: **5 November, 23:45 Eastern / 6 November, 05:45 Warsaw**. Damian must confirm eligibility, team representation and rights, then personally submit Devpost before **30 October 2026, 23:45 EDT / 31 October, 04:45 Warsaw** and retain the receipt. The internal target is 29 October. This package accepts no legal terms and submits nothing on the owner's behalf.
