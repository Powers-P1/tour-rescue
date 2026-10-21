# Pages frontend

The implemented plain TypeScript/HTML/CSS app lives in [`web/`](../../web/). Run `npm run web:build` and `npm run web:preview`; deploy `web/dist` to Cloudflare Pages. The five-screen flow, evidence/audit views and A4/canvas PNG promoter sheet share the deterministic core. Demo runs locally from synthetic fixtures; live requests go only to the configured public Worker origin. See [DEPLOY](../../docs/DEPLOY.md) for configuration and secrets boundaries.
