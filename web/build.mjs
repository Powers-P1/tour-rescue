import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const configured = process.env.PUBLIC_WORKER_ORIGIN ?? 'https://tour-rescue-api.oli-struska.workers.dev';
const origin = new URL(configured);
if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash
    || origin.pathname !== '/' || (origin.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(origin.hostname))) {
  throw new Error('PUBLIC_WORKER_ORIGIN must be an HTTPS origin (or HTTP localhost for development), without credentials or a path.');
}
// Only generated output is removed; a failed build cannot leave an older app shell behind.
await rm(new URL('./dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('./dist/app/', import.meta.url), { recursive: true });
const result = await build({
  absWorkingDir: root, entryPoints: { app: 'web/src/main.ts', landing: 'web/src/landing-entry.ts' }, bundle: true, format: 'esm',
  platform: 'browser', target: ['es2022'], outdir: 'web/dist', minify: true,
  sourcemap: false, metafile: true, legalComments: 'eof',
  define: { __WORKER_ORIGIN__: JSON.stringify(origin.origin) },
});
await writeFile(new URL('./dist/index.html', import.meta.url), await readFile(new URL('./index.html', import.meta.url)));
await writeFile(new URL('./dist/app/index.html', import.meta.url), await readFile(new URL('./app.html', import.meta.url)));
// A top-level 404 prevents Cloudflare Pages from treating all unknown paths as the root SPA.
await writeFile(new URL('./dist/404.html', import.meta.url), await readFile(new URL('./404.html', import.meta.url)));
await writeFile(new URL('./dist/_headers', import.meta.url), `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${origin.origin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: public, max-age=0, must-revalidate
`);
for (const [file, output] of Object.entries(result.metafile.outputs)) {
  console.log(`${file}: ${(output.bytes / 1024).toFixed(1)} kB`);
}
console.log(`Public Worker origin: ${origin.origin}`);
