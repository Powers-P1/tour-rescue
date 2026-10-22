# Production follow-up, 22 October 2026

Completed from Damian's production issue list and K16/DEPLOY_2026-10-22.md on DESKTOP. Production rollback point before these fixes: `0e0d5150-ff3c-4c25-b922-25267494febb`; older landing fallback: `56a99fd2-e5a2-43c8-baef-800821352cc8`.

- The geographic city key starts open below1100 px wherever numbered map markers are used. Crossing the breakpoint updates it. Other disclosures, including simulation inputs, retain their existing behaviour.
- Browser Back/Forward restores each SOS stage, the request, budget and selected supplier. A validated history snapshot is required to restore an explicit, affordable sample approval; an URL alone cannot invent approval.
- Jury labels remain at least14 px, including compact badges, the example label and map legend. Disclosure summaries are at least48 px tall, including the public map source control that previously relied on a native-height summary.
- Jury SVG labels are tested at their actual scaled pixel size. The optional miniature map is omitted below1280 px in favour of the adjacent named options, and its desktop labels are enlarged.

Validation: `npm run check` (364 tests); `scripts/verify-production-fixes.mjs` at375/768/980/1099/1100/1280/1440, including SOS browser navigation in both directions; `scripts/verify-completion.mjs` (165 state checks,7 workflows,35 additional responsive checks). Provider requests are blocked in browser tests.

Deployment completed from `web/dist`, preview first, followed by production after hosted checks passed. No Tour Rescue Worker change was made.

- Tested source: `50af419d69edabcdaef1d58b9dfd97ba2c3dc1a3`.
- Preview: `https://63812605.tour-rescue.pages.dev`, alias `https://v2-preview.tour-rescue.pages.dev`.
- Production: `0f615047-8148-45fa-adb9-530e3107273c`, `https://tour-rescue.pages.dev`.
- Targeted browser checks passed on preview and production at all seven widths, including Back/Forward through every SOS stage and actual scaled SVG label sizes.
- Hosted verification covered all 82 public files across both projects. Application code and binary assets match the tested builds byte for byte. This project's font licence has identical text with Windows line endings.
