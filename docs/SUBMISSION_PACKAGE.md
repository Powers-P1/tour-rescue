# Tour Rescue — copy-ready submission package

Prepared 24 October and updated 26 October 2026. The [handoff](HACKATHON_HANDOFF.md) and [publication receipt](validation/publication-2026-10-26.md) record the completed release and owner actions. The [Tour Rescue entry](https://devpost.com/software/tour-rescue) remains **SUBMITTED, 5/5 steps complete**, submission **1259533**. Its public video embed now uses the published final-v4 film; the older YouTube film is private.

## Submission fields

- Project: **Tour Rescue**
- Tagline: **The show’s off. The tour isn’t. Mobile-first help for tour managers: three checked options and a clear brief for the next promoter call.**
- Demo: https://tour-rescue.pages.dev/judges/
- App: https://tour-rescue.pages.dev/app/#rescue
- Guided judging path: https://tour-rescue.pages.dev/app/?tour=start#rescue
- Direct sensitivity experiment: https://tour-rescue.pages.dev/app/#breakpoint
- Public source: https://github.com/Powers-P1/tour-rescue
- Licence: MIT, detectable in the repository About area.
- Two-minute final-v4 film: [website player](https://tour-rescue.pages.dev/judges/#walkthrough) and [YouTube](https://youtu.be/uwiPr3YNfNA), also verified in the current public Devpost embed. The [100-second final-v2 package](demo/final-v2/README.md) remains archived; its older YouTube film is private.
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

Use Node 24 and `npm ci --ignore-scripts`, `npm run check`, `npm run web:build`, `npm run worker:build` for local verification. The 26 October source `2e57ab5`, merged to main as `e1e39ef`, passes **398 offline tests**, strict types, local/Pages builds, Worker dry build and complete core/visual CI. Public production QA passed at 390×844 and 1440×1000, including the actual film's hash, default captions, play/pause and seeks to 3.2/35/87/116 seconds. The Pages build comes from **web2/** into **web/dist**. Historical acceptance reports retain their original revision counts. Offline tests need no provider credential. Do not publish raw Qloo replies or private band excerpts in source.

## Judging criteria and evidence

| Criterion | Demonstrated evidence | Limit to keep explicit |
| --- | --- | --- |
| Technological implementation | Qloo normalization, frozen-city ranking, deterministic checks, control/omission analysis, agent tool loop and source-bearing acceptance | Qloo affinities are relative taste evidence, not demand or booking probabilities |
| Design | Mobile-first and desktop journey, action-gated tutorial, current-state exports | Physical PWA installation has not been certified on phones |
| Potential impact | A constrained shortlist and next promoter brief after a cancellation | No measured savings, booking uplift or paying users |
| Quality of the idea | Cultural evidence combined with route feasibility and explicit sensitivity | Recorded real winners remained unchanged in the small sample |

## Media, rights and final owner actions

The [final-v4 film package](demo/final-v4/README.md) contains the 120-second, 1920×1080/60 fps H.264/AAC publication derivative, 39-cue English VTT/SRT, narration transcript, poster, provenance and QA. The clean v/a file is **23,144,942 bytes**, SHA-256 `c9c6a5b8f3a25fc6d25093026567e57ec7cfe4e9fffe3f9da7b701a196c10d4f`, leaving space below the Pages 25 MiB file limit. Default native VTT supplies dialogue captions; there is no embedded subtitle stream or burned dialogue-caption layer.

The film uses actual responsive UI captures with edited presentation motion, alongside labelled AI-generated touring, gear and stage illustrations. It separates recorded real Qloo from the synthetic 350→354.1 km experiment and authored AI replay. The four-state Ho Chi Minh City SOS sample confirms no real supplier contact, order or payment. The proposed business model is agency subscriptions and completed-local-service fees, dependent on onboarding real partners. Music is SONTALK's “We Stay (Instrumental Version)”, supplied from the owner's existing Epidemic Sound subscription/trial; Mike narration uses Epidemic Sound Voices / ElevenLabs. Source clips, full music WAVs and voice recordings are not redistributed in this package. Retain the account/channel rights evidence; technical QA is not a rights certificate.

The website film and [current YouTube film](https://youtu.be/uwiPr3YNfNA) are published and Devpost's public embed has been replaced. YouTube received the higher-bitrate clean 120-second master with separately imported English SRT; the manual English (US) track is published and verified in the public player at 1080p60 HD. Its UI rounds the duration to 2:01. The website retains the smaller derivative above. The [final-v2 package](demo/final-v2/README.md) remains recoverable and unchanged; the older YouTube film was made private rather than permanently deleted. See the separate [publication receipt](validation/publication-2026-10-26.md).

The [official rules](https://qloo.devpost.com/rules), checked 24 October, require a working demo, English description and a public repository with an open-source licence visible in About. Video is optional. Maintain free judging access until the judging period ends: **5 November, 23:45 Eastern / 6 November, 05:45 Warsaw**. The entry was submitted on 24 October with Damian's explicit authorization; keep the receipt and maintain eligibility, representation and rights evidence. The submission deadline remains **30 October 2026, 23:45 EDT / 31 October, 04:45 Warsaw**. The authorized 26 October video update preserved the existing submitted state and did not repeat the final submission declarations.
