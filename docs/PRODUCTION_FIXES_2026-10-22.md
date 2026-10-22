# Production follow-up, 22 October 2026

Prepared from Damian's production issue list. Deployment status and rollback IDs must be reconciled with K16/DEPLOY_2026-10-22.md on DESKTOP before publication. This document is not a deployment receipt.

- The geographic city key starts open below1100 px wherever numbered map markers are used. Crossing the breakpoint updates it. Other disclosures, including simulation inputs, retain their existing behaviour.
- Browser Back/Forward restores each SOS stage, the request, budget and selected supplier. A validated history snapshot is required to restore an explicit, affordable sample approval; an URL alone cannot invent approval.
- Jury labels remain at least14 px, including compact badges, the example label and map legend. Disclosure summaries are at least48 px tall, including the public map source control that previously relied on a native-height summary.

Validation: `npm run check` (364 tests); `scripts/verify-production-fixes.mjs` at375/768/980/1099/1100/1440, including SOS browser navigation in both directions; `scripts/verify-completion.mjs` (165 state checks,7 workflows,35 additional responsive checks). Provider requests are blocked in browser tests.

Deploy `web/dist` to the existing `v2-preview` branch first. Verify the targeted checks against that URL before production. No Tour Rescue Worker change is required.
