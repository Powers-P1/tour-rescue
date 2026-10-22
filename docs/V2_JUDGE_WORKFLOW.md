# V2 judging workflow

The deployed frontend is built from `web2/` using `npm run web:build`; `web/dist` is generated output. The current branch includes the production fixes from PR24, which was still open when this work started from main405b72d.

## P0: recommendation reversal

Open `/judges/` and choose **Try350 →354.1km**, or open `/app/#simulation`. Expand **Adjust extra-distance preference**, enter354.1 and recheck. The before/after summary shows **Nuremberg → Frankfurt am Main**. A separately labelled route remains the manually reviewed alternative until **Review the recommended option** is chosen. The experiment changes the additional-distance cap only; daily driving and all four confirmed shows remain unchanged. **Download this what-if audit** exports the recalculated threshold and decision.

## P0: explicit research acceptance

Open `/app/#ai`. Choose either saved scenario and replay it. **Accept into comparison** revalidates the proposal against the current comparison, replaces its A/B card and preserves the other card and confirmed shows. It does not send a message or book a venue. Incomplete or cancelled sessions cannot be accepted. Live/demo or evidence-context mismatches fail without changing the comparison.

Review the accepted card and its evidence. The audit download becomes a `tour-rescue.ai-audit.v1` envelope containing the current decision, acceptance records and supplying session sources. Sources remain available after further research or a what-if. Unknown booking facts remain unknown. A fresh successful Qloo run starts a new evidence context and clears old acceptances.

## Evidence, guide, exports and PWA

The v2 Evidence screen shows independently scaled fit/additional-kilometre axes, the control decision and its reason, and every comparison-artist omission with a reason. Unknown coordinates are omitted from the plot. Tag Bridge accepts at most three shared, sourced tags; the current API does not return verified tags, so it displays UNKNOWN and never affects ranking.

The explicit six-step guide covers cancellation, three options, the breakpoint, evidence, exports and optional AI. Keyboard navigation, Escape/Skip, progress and restoration of the previous comparison are supported. Both `corridor-repair` and `evidence-gaps` saved AI scenarios are available.

Promoter drafts include extra kilometres, comparison artists, sensitivity and booking limitations. A4 print and the existing 1680×2376 canvas PNG use the current decision, including a what-if or accepted proposal.

The mobile-first jury entry offers installation with a dismissible dialog. Supporting browsers use their native install event; iOS gets Share → Add to Home Screen instructions. Standalone mode removes the invitation. The versioned service worker caches only public app-shell assets; APIs, session information and research are excluded. Offline sample rescue works, while live actions show an offline explanation. Updates preserve local profile data.

`/app/#live-preset` offers three explicit real-Qloo presets. Opening or choosing one makes no provider request. A fresh run reports coverage, the actual recommendation, the same-constraints no-taste result, control, omissions, timestamps and provenance. See [the measured live report](validation/live-qloo-2026-10-23.md).

## Validation and remaining scope

- 367 offline tests and strict core/Worker/browser type checking passed before the evidence/PWA follow-up; release checks are rerun for its final commit.
- `scripts/verify-judge-workflow.mjs` exercised the real v2 build at390 and1280px, including both AI fixtures, JSON downloads, the revised recommendation, preserved cards, promoter drafts and UNKNOWN venue facts. External provider traffic was blocked. Browser plugin not available; Playwright fallback.
- `scripts/verify-mobile-agent-surface.mjs` tests evidence, genuine PNG downloads, one-page A4 PDFs, all six guide steps and restoration at 390/1280px; install-hook behaviour, iOS guidance, standalone labels, offline rescue, API cache exclusion and a service-worker update preserving profile data. Browser plugin unavailable; Playwright fallback. Physical phone installation remains a separate manual check.
- Real Qloo and Sonnet evidence is recorded separately from offline fixtures. No booking availability was inferred and no message was sent to a promoter.
