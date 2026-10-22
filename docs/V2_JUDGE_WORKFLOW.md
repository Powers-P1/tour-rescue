# V2 judging workflow

The deployed frontend is built from `web2/` using `npm run web:build`; `web/dist` is generated output. The current branch includes the production fixes from PR24, which was still open when this work started from main405b72d.

## P0: recommendation reversal

Open `/judges/` and choose **Try350 →354.1km**, or open `/app/#simulation`. Expand **Adjust extra-distance preference**, enter354.1 and recheck. The before/after summary shows **Nuremberg → Frankfurt am Main**. A separately labelled route remains the manually reviewed alternative until **Review the recommended option** is chosen. The experiment changes the additional-distance cap only; daily driving and all four confirmed shows remain unchanged. **Download this what-if audit** exports the recalculated threshold and decision.

## P0: explicit research acceptance

Open `/app/#ai`. Choose either saved scenario and replay it. **Accept into comparison** revalidates the proposal against the current comparison, replaces its A/B card and preserves the other card and confirmed shows. It does not send a message or book a venue. Incomplete or cancelled sessions cannot be accepted. Live/demo or evidence-context mismatches fail without changing the comparison.

Review the accepted card and its evidence. The audit download becomes a `tour-rescue.ai-audit.v1` envelope containing the current decision, acceptance records and supplying session sources. Sources remain available after further research or a what-if. Unknown booking facts remain unknown. A fresh successful Qloo run starts a new evidence context and clears old acceptances.

## Validation and remaining scope

-367 offline tests and strict core/Worker/browser type checking passed.
- `scripts/verify-judge-workflow.mjs` exercised the real v2 build at390 and1280px, including both AI fixtures, JSON downloads, the revised recommendation, preserved cards, promoter drafts and UNKNOWN venue facts. External provider traffic was blocked. Browser plugin not available; Playwright fallback.
- The P0 browser checks are included in CI. No new live AI call or deployment was made by this PR.
- Follow-up: visible sensitivity/control evidence, Tag Bridge/scatter, six-step guidance, complete A4/PNG export, representative live-Qloo report and mobile-first PWA installation.
