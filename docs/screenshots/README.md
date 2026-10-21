# Tour Rescue front v2 screenshot evidence

This folder describes the screenshot protocol. Actual browser PNGs and a JSON manifest are produced by **Front v2 visual evidence** GitHub Actions, uploaded as the `tour-rescue-v2-screenshots` artifact. They are not crops of the nine design boards, and they are not manually composed screenshots.

Local run with Node 24 and the Playwright browser binary installed:

```sh
npm ci
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
npm run web:build
node scripts/capture-v2.mjs
```

The script starts the static Pages preview server, captures the real landing, judges, mobile incident and desktop board flows, checks for page/console errors, duplicate IDs and horizontal overflow at 320, 375, 390, 768, 980, 1280 and 1536 pixels, then writes PNGs to `artifacts/screenshots/v2/`. The location is generated output, not checked into `git`.

Screenshots show the **sample scenario** by default, not a paid live Qloo/Claude session. Network access is required for the optional Unsplash editorial photography and hosted Google fonts; offline CSS/sans fallbacks remain legible. Screenshots do not prove provider access, promoter communication, supplier ordering or ticket sales. Production deployment and its live smoke test are separate maintainer steps.
