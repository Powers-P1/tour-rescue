# Tour Rescue: mobile and desktop completion

The current implementation follows the nine approved boards in `docs/mockups/v2/`.
The simplified mobile board **01**, rather than the rejected denser first concept,
defines the rescue hierarchy. This pass changes the frontend only; no Cloudflare
publication, promoter contact, supplier order or account permission is performed.

## Screen inventory and fidelity ledger

| Board | Implemented surface | Comparison and repairs |
| --- | --- | --- |
| 01 Mobile rescue | Today → three directions → review → promoter draft | One amber action, readable type, three bottom tabs on the home screens. Tabs disappear during rescue. Shorter rows bring the review action into the 390×844 viewport. Evidence follows the choice. Failed directions cannot prepare a proposal. |
| 02 Mobile SOS | Problem → two sample suppliers → quote → sample approval | Clear labels, preserved input, budget guard, one action per step. Error feedback is inline and cannot cover the retry button. Reopening SOS resumes the current sample request. |
| 03 Plan, decide, fans | Planner, band profile, economics, terms, public fan page | Natural-language brief survives profile editing. Profile persists on this device. Editable assumptions recalculate the show result and break-even. The public page uses local editorial imagery and never stores an email or records a vote. |
| 04 Desktop command | Overview, crew sheet, presale checklist, documents | Sidebar, incident strip, map/actions, three-stop strip. Map geography and expanded key remain available, while the full key is disclosed on demand. The main dashboard fits the 1536×1024 frame. |
| 05 Audience | Qloo fit, city selection, fan-request empty state, evidence | Separate source tabs, real coordinates and relative-fit circles. Mobile puts the city choice and action before the map. Discovery-only cities cannot silently become route-checked options. |
| 06 Simulation | Route/budget tabs, city change, assumption edit, local draft | Two desktop columns, locked existing dates, explicit unknowns. The extra-distance editor opens on demand and stays open after validation. Saving changes only a versioned local draft. |
| 07 Agency | Issue queue, all tours, assignment, team and documents | Table on desktop, stacked readable rows on mobile. Team and document navigation now open usable screens. Assignments remain illustrative and session-local. |
| 08 Product | Editorial hero, rescue, local SOS, agency and jury entry | Restored the split full-height image treatment, white headline, compact feature rhythm and warm agency band. Replaced remote photos/vector placeholders with local generated editorial assets. |
| 09 Judges | Ready rescue case, map/comparison, three steps, Qloo, evidence | A short path to the running case and MIT source. Scope, known limits and the breakpoint remain available under explicit disclosures, instead of overwhelming the entry view. |

### Shared checks against the boards

- **Palette:** graphite `#121A20`, surface `#1C2831`, amber `#F3B65B`, warm paper agency band. No new decorative colour system.
- **Type:** local variable Inter, including Latin Extended and its OFL licence. Body/control text remains readable; no shrinking the whole interface to force content into the frame.
- **Icons:** one 24px outline vocabulary for navigation, back, documents, tools and the route mark. Labels remain code-native and accessible.
- **Containers and spacing:** open shortlist rows and dividers on mobile; deliberate map/action and route/check panels on desktop. No extra dashboard metrics or decorative card grids.
- **Interaction:** screen transitions reset scroll and move focus to the new heading; same-screen updates retain keyboard focus and expanded disclosures. Browser Back/Forward follows the actual view. Skip-to-content does not change the route.
- **Imagery:** local WebP assets, without advertising poses or external stock-photo requests. Generated scenes are labelled as illustrations, not genuine staff, suppliers or recordings. See [asset provenance](mockups/v2/ASSETS.md).

### Deliberate differences from the image boards

The frozen, validated scenario remains **Leipzig 14 Nov**, **Nuremberg / Frankfurt /
day off**, with a **6h daily** limit. Illustrative Erfurt/Dresden/Halle, 12 Nov and
5h in the boards are not substituted for actual audit output. Qloo fit is relative
affinity, not ticket sales. Map lines are schematic connections over actual city
coordinates, not road geometry. Venue terms and availability remain unconfirmed.

The landing imagery follows Damian's later instruction for more ordinary, candid
working people and less polished advertising imagery. It therefore differs from
the woman using a phone in board 08. Extra sample/source wording is intentional:
it distinguishes the working core from illustrative extensions. The public
fan vote and SOS spend approval remain explicitly simulated.

## Validation

Use Node 24:

```sh
npm ci
npm run check
npm run web:build
npm run web2:build
```

Browser plugin not available in the implementation session. Manual interaction
was checked through the connected Edge browser; repeatable checks use Playwright:

```sh
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
node scripts/capture-v2.mjs
node scripts/verify-polish.mjs
node scripts/verify-germany-map.mjs
node scripts/verify-completion.mjs
```

The completion matrix covers **55 states × 3 viewports** (390×844, 1280×800,
1536×1024), plus narrow/tablet boundaries at 320, 375, 768, 980 and 1100px.
It exercises actual transitions, failures, budget rejection, document recovery,
editable economics, local draft reload, public fan isolation and browser history.
The map and keyboard suites remain in place. Provider traffic is blocked or
explicitly mocked in the completion suite; no paid calls are needed.

Set `QA_OUTPUT` to keep screenshots/manifests outside the checkout, and optionally
`PLAYWRIGHT_EXECUTABLE_PATH` to use an already installed Chromium. Default CI
evidence goes under ignored `artifacts/screenshots/v2/`. Each runner closes its
browser and stops its own preview server in `finally`.

Native-size visual comparisons use 1536×1024 for desktop app boards and
1024×1536 for the product/judges boards. Multi-phone boards are checked as
individual 390×844 app screens, without drawing fake phone bezels in the app.

## Boundaries

This is a completed frontend/demo pass, not supplier fulfilment or a full booking
platform. Live Qloo/Claude require explicit action and the existing configured
Worker. This pass does not certify current provider availability, native iOS /
Android behaviour, Safari, ticketing data, crew synchronization or external
documents. Profile persistence and simulation drafts are device-local; promoter
drafts and sample agency assignments are session-only.
