import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const configured = process.env.PUBLIC_WORKER_ORIGIN ?? 'https://tour-rescue-api.oli-struska.workers.dev';
const origin = new URL(configured);
if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password
    || origin.search || origin.hash || origin.pathname !== '/'
    || (origin.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(origin.hostname))) {
  throw new Error('PUBLIC_WORKER_ORIGIN must be an HTTPS origin (HTTP localhost for dev), with no path, credentials or query.');
}
await rm(new URL('./dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
const built = await build({
  absWorkingDir: root,
  entryPoints: { app: 'web2/src/main.ts' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outdir: 'web2/dist',
  minify: true,
  metafile: true,
  legalComments: 'eof',
  define: { __WORKER_ORIGIN__: JSON.stringify(origin.origin) },
});
await writeFile(new URL('./dist/index.html', import.meta.url), await readFile(new URL('./index.html', import.meta.url)));
await writeFile(new URL('./dist/404.html', import.meta.url), await readFile(new URL('../web/404.html', import.meta.url)));
await writeFile(new URL('./dist/_headers', import.meta.url), \`/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' \${origin.origin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: public, max-age=0, must-revalidate
\`);
for (const [path, output] of Object.entries(built.metafile.outputs)) console.log(\`\${path}: \${(output.bytes / 1024).toFixed(1)} kB\`);
console.log(\`Public Worker origin: \${origin.origin} (v2 preview only; existing deploy unchanged)\`);
