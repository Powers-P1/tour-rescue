# Final v2 review corrections - 23 October 2026

An independent review in the requested “Pomysł na hakaton Qloo” conversation identified two material navigation cases plus three smaller issues. They were reproduced against the deployed v2 and corrected locally on current main.

- Back/Forward now restores the audited workspace for that history entry, including the what-if source, recommendation, evidence, chosen proposal and accepted-research provenance. Moving from a 354.1 km Frankfurt audit to the comparison and back keeps the same run ID and policy. The bounded in-tab history does not copy private material into browser history state. If an audited context is no longer held (for example after reload), the app explicitly returns to the comparison rather than silently showing an older audit.
- A 0 km cap can recommend day off. That option now opens successfully, marks venue/fee checks as not applicable, keeps four confirmed shows locked and exports its actual audit. It does not offer a promoter booking draft.
- Whole-metre decimals such as 8.007 km survive binary floating-point conversion. Finer-than-metre values remain rejected.
- The install prompt does not cover an already-open Live dialog or guided tour.
- Private knowledge returned to the model must fit the exact twelve-record export bound. A thirteenth excerpt is withheld instead of being passed to the model and omitted from the audit.

Validation: 371 tests, strict types, Pages build and Worker dry-run. `scripts/verify-final-review.mjs` checks Back/Forward audit identity and day-off export at 390/1280, plus mobile dialog overlap; no page errors. The existing judging flow still passes both AI scenarios, explicit acceptance, sources, UNKNOWN booking facts and reversal. The evidence/PWA suite still passes the six-step guide/restoration, PNG/A4, offline/API-cache exclusion, simulated native install, iOS guidance and service-worker update with profile preservation. Physical OS installation remains a manual device check.

## Additional real agent knowledge evidence

Production session `47ddac2c-27e2-40d5-bb5f-a2bd2e70c194` used `search_tour_knowledge` with the editable band profile/rider, retained the acoustic-piano requirement as an unresolved booking risk, explicitly accepted a sourced proposal and saved an editable previous-decision memory. It used five model requests, ten client tools, one web search, 118,520 input / 3,436 output tokens, and the Worker's configured estimate USD 0.2814 (not a provider invoice). One live Qloo analysis and one live Sonnet session were started by that check; no venue was contacted or booked. Browser errors: zero.

The broader live-Qloo sample and its no-change results remain in [the live study](live-qloo-2026-10-23.md). No raw Qloo response or private rider text is published here. These tests establish functional paths, not measured booking outcomes or ticket sales.
