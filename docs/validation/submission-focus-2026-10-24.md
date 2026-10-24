# Final judging-focus acceptance — 24 October 2026

The last independently reaccepted application revision is `2ad51339b5ae6c221a46dc8f8b227b7c45aecd46`, tested at immutable preview https://bd5051f8.tour-rescue.pages.dev. Earlier full acceptance used `09cb9ef` / https://0cf246e4.tour-rescue.pages.dev; `822511b` / https://814408dc.tour-rescue.pages.dev added the accurate daily-driving-limit label. [PR #34](https://github.com/Powers-P1/tour-rescue/pull/34) identifies that source history. The step 4 follow-up below changes guide assets; its independent reacceptance is pending.

## Result

The first judging journey is cancellation → three options → one changed assumption → evidence → the next promoter conversation. A visible recorded three-artist Qloo study reports unchanged winners at 350 km; it is separate from the synthetic 350→354.1 km Nuremberg→Frankfurt experiment. No real-demand or booking uplift is claimed. The selected option remains distinct from the current recommendation, and current-state audits/briefs retain that identity and threshold.

The HTML/A4/PNG brief shares explicit human confirmation questions for date, room/rider, fee/terms and added cost assumptions. A day-off brief remains a day off. AI acceptance, the other comparison card, accepted-source exports and UNKNOWN booking facts are preserved. Worker, account, secrets, routes, core and provider settings are unchanged.

## Checks

- **394/394 offline tests**, strict core/web/web2 types, Pages build and Worker dry-run pass: [core CI](https://github.com/Powers-P1/tour-rescue/actions/runs/40045098789).
- **Built-v2 browser CI passes**: [responsive/workflow CI](https://github.com/Powers-P1/tour-rescue/actions/runs/40045097023). Coverage includes both authored AI examples, explicit acceptance/source export, breakpoint, current-option state, Back/Forward, day off, saved reload, evidence/control/omissions, guide, PWA, PNG and one-page A4.
- Actual CUA acceptance covers mobile390 and desktop, before/after recommendation, preserved selected alternative, live-study separation, current-source briefs, saved AI, UNKNOWN and film/captions. Offline tests are not substituted for those actual UI checks.
- Both 390- and 1280-generated PDFs have one A4 page. Poppler rendering and the canvas PNG were inspected for text clipping, readable limitations and source/current-threshold content.
- Approved final-v2 MP4 is unchanged, SHA256 `9d5e25ece393070f3ab889e4cb2a41c8549259473b449d06e4863725d2413bb2`; VTT/SRT each contain22 cues. The optional film is now public on Damian's channel at https://youtu.be/PT3Iysktgn0, with prepared SRT and poster. Automated YouTube copyright checks reported no issues; no independent rights certification is implied.

Three independent simulated jury/investor conversations, including a separate Astra review, returned GO for the tested demonstration with no reproduced P0/P1. This is neither an official contest result nor customer validation. Full reports, exact production receipts and screenshots are in the owner submission kit.

## Reviewer P2 and regression

At390×844, the guide could cover Recheck after entering354.1 in step3, a neighboring promoter button after minimizing in step5, or Replay in step6. The compact mobile card now docks within the visual viewport above any visible fixed navigation. Expanded placement reserves room for the active goal and nearby focused control and moves controls into a clear area. The guide may scroll internally on short screens; focus, step gates, Escape and workspace restoration remain intact.

The real browser regression checks center hit-testing and ordinary, unforced clicks on Recheck after input, the adjacent promoter action after Minimize, Replay and Accept, then Finish/restoration. The independent targeted reacceptance repeats those previously blocked actions on the immutable final preview. Astra completed6/6 and closed P2; the other two reviewers confirmed the previously covered controls and complete flow. The complete review texts preserve their exact scopes.

### Step 4 source-control follow-up

At 390×844, ordinary 180 px wheel scrolling could put the center of “Sources & limitations” beneath the expanded coach even though Tag Bridge stayed clear. The coach now reserves a shared clear area for both evidence controls when they fit, or protects the visible source control after Tag Bridge leaves the viewport. A new geometry regression and the existing browser path cover this state. The browser waits for stable center geometry, clicks the actual center without force, checks that the source list opens and unlocks Next, then completes the remaining guide steps and restores the prior comparison.

Local verification for `codex/guide-evidence-clearance`: **395/395 offline tests**, strict core/web/web2 types, both frontend builds and the existing 390/1280 Playwright regression (Browser plugin unavailable). Evidence is outside the repository at `C:/Projekty/2026-10-24/tour-guide-evidence-clearance/`: `before/guide-step4-expanded-390.png`, `after/guide-step4-expanded-390.png` and `after/report.json`. This is local browser QA, not a new independent jury closure or a physical-phone check.

The independent follow-up confirmed the click/Next fix but identified remaining source-text obstruction. Once evidence is opened on mobile, the expanded coach now stays at the bottom and stops snapping the page back to the summary during ordinary scrolling. Explicit focus/reveal actions still work. The additional browser regression scrolls with a wheel, checks that scrolling is retained and verifies that the entire first source entry is clear of the expanded coach before completing the remaining steps. Root local verification uses an isolated installed Edge profile; its additional evidence is in `reading-after/` outside the repository. Exact final CI and the subsequent targeted review are recorded in the owner release kit; prior acceptance does not automatically certify this follow-up.

## Limits

No paid provider call was repeated. The earlier three real Qloo profiles retained Nuremberg, and their control/omission outcomes remain unchanged; the synthetic reversal is not repackaged as a real finding. The earlier live Sonnet acceptance receipt remains a dated observation, not a new test of this UI change.

Physical Android/iPhone installation, native software-keyboard behavior and a real booker's cancellation are unverified. SOS providers/quotes/arrival remain samples; nothing is booked, contacted or paid. Demand, costs, fees and availability need human confirmation. No revenue saved, adoption or willingness to pay was measured. Devpost eligibility, rights declarations and final submission remain the entrant's actions.
