# Mockups v2 (21 Oct 2026): the visual and UX reference for the front-end rebuild

Decision (Damian, 21 Oct): the current web app is replaced by a new front end built from scratch that reproduces these boards faithfully. Binding documents in this folder: `TourRescue-UX-brief.txt` (product and UX brief, Polish; rules on data sources, route validation, SOS, planning, economics, agency, fans, judges), `TourRescue-design-tokens.json` (colours, typography, spacing, navigation), `TourRescue-prompts.txt` (exact copy and layout of every board). UI language: English (the boards are English).

| Board | Screens | Flow |
|---|---|---|
| 01 Mobile Rescue v2 | Today ("Here's the plan." incident card "Leipzig canceled. Rescue this date", Next up 16:00 Load-in, "Open today's sheet"), Three ways forward (Erfurt / Dresden / Halle with reason and two drives), Erfurt details (travel, audience fit, why, "Venue and date still to confirm", "Prepare promoter proposal", "See evidence & assumptions") | Rescue a date (hackathon priority, real Qloo + routing) |
| 02 Mobile SOS | problem → short provider list → one concrete spend approval | Local SOS (designed extension; demo on sample data) |
| 03 Mobile Plan / Decide / Fans | planner from one natural-language brief, economics verdict with range and threshold, public "I'd come to this show" | Planning, economics, fans (extension) |
| 04 Desktop Command | single-tour overview: incident bar, next three stops map (solid = current plan, dashed = proposal), "What needs you.", dates strip | Tour control centre |
| 05 Desktop Audience | taste map and separate fan declarations | Audience |
| 06 Desktop Simulation | replacement-date variant, rules, save draft | What-if |
| 07 Desktop Agency | queue of issues across artists with owner and local deadline | Agency |
| 08 Landing | product page: two problems (cancelled date, local failure), crew photography | Landing |
| 09 Judges | dedicated English jury entry starting from the ready case "Leipzig canceled", real demo, Qloo evidence, repository | Judges |

Implementation rules (from the brief):
- One problem and one primary action per rescue screen; details after the choice; never shrink text to fit more. Touch targets >= 48 px, body 16-18 px, state labels with icon and text (colour alone is not a message). During a rescue on mobile hide the bottom tabs; keep back, context and SOS. Base app tabs: Today, Route, Crew.
- The rescue scenario must run on real data: cancelled Leipzig between Berlin and Munich → Qloo cultural fit for real resolved entities → route and constraint validation (5 h limit in the sample) → at most three sensible directions → chosen city → one-page promoter proposal. Choosing a city confirms neither venue, date nor fee; unknown data shows as "Unknown / To confirm", never as green. Proposal map segments are dashed and labelled Proposed. Promoter sending and replies are shown only when they really happened.
- Data provenance is explicit: Qloo = relative cultural affinity; fan declarations = separate own source; sales = ticketing integration or entered by an authorised person; drives = routing service, never Qloo. The PNG maps and amounts are sample values, not API results. Keep the evidence for judges (sources, region, parameters, validation) without secrets.
- Economics: verdict, range and break-even on the main screen; sample: 20 EUR ticket, 70 % artist share, 2 100 EUR costs, 120-180 attendance assumed by the user → −420 to +420 EUR, threshold 150 tickets. A scenario from assumptions, not a forecast from Qloo.
- Judges page: implemented scope and concept scope must be distinguished according to the real state on submission day; the default short path may use clearly labelled saved data; a fresh query is a separate, explicit action. Mockups are never passed off as Qloo output.
- Hackathon facts (checked 21 Oct): public hosted demo, real agentic Qloo integration, public repo with code, assets and instructions, recognised open-source licence visible in About (MIT in this repo), English materials; video optional; deadline 30 Oct 2026 23:45 EDT (31 Oct 04:45 Warsaw), internal 29 Oct.
