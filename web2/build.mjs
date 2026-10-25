import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildPwa } from './pwa-build.mjs';

// With --deploy keep the existing Cloudflare Pages contract:
// build command: npm run web:build, output directory: web/dist.
const deploy = process.argv.includes('--deploy');
const destUrl = deploy ? new URL('../web/dist/', import.meta.url) : new URL('./dist/', import.meta.url);
const outdir = deploy ? 'web/dist' : 'web2/dist';
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = new URL(process.env.PUBLIC_WORKER_ORIGIN ?? 'https://tour-rescue-api.oli-struska.workers.dev');
if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password ||
  origin.search || origin.hash || origin.pathname !== '/' ||
  (origin.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(origin.hostname))) {
  throw new Error('PUBLIC_WORKER_ORIGIN must be an HTTPS origin (HTTP localhost for dev), no credentials/path/query.');
}
// One canonical film source; only verified public playback assets enter dist.
const filmRoot = new URL('../docs/demo/final-v4/', import.meta.url);
const filmManifest = JSON.parse(await readFile(new URL('manifest.json', filmRoot), 'utf8'));
const filmSha = 'c9c6a5b8f3a25fc6d25093026567e57ec7cfe4e9fffe3f9da7b701a196c10d4f';
if (filmManifest.revision !== 'final-v4' || filmManifest.sha256 !== filmSha ||
    filmManifest.film !== 'TourRescue-jury-final-v4.mp4' || filmManifest.durationSeconds !== 120 ||
    filmManifest.width !== 1920 || filmManifest.height !== 1080 || filmManifest.fps !== 60 ||
    filmManifest.captionDelivery !== 'clean-picture-plus-native-vtt') throw new Error('Final v4 publication manifest is required.');
const filmAssets = await Promise.all([
  ['TourRescue-jury-final-v4.mp4', 'tour-rescue-final-v4.mp4'],
  ['poster.jpg', 'tour-rescue-final-v4-poster.jpg'],
  ['captions.en.vtt', 'tour-rescue-final-v4.en.vtt'],
  ['captions.en.srt', 'tour-rescue-final-v4.en.srt'],
  ['narration.txt', 'transcript.txt'],
].map(async ([source, target]) => {
  const bytes = await readFile(new URL(source, filmRoot));
  const expected = filmManifest.files.find(file => file.name === source);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (!expected || expected.bytes !== bytes.length || expected.sha256 !== hash ||
      (source === filmManifest.film && (hash !== filmSha || bytes.length > 24 * 1024 * 1024)))
    throw new Error('Final film asset hash mismatch: ' + source);
  return {target, bytes};
}));
await rm(destUrl, {recursive:true,force:true});
await mkdir(new URL('app/',destUrl),{recursive:true});
await mkdir(new URL('judges/',destUrl),{recursive:true});
await mkdir(new URL('assets/',destUrl),{recursive:true});
const built=await build({
  absWorkingDir:root,
  entryPoints:{
    landing:'web2/src/landing-entry.ts',
    judges:'web2/src/judges-entry.ts',
    app:'web2/src/main.ts',
  },
  bundle:true, format:'esm',platform:'browser',target:['es2022'],
  // Assets are copied explicitly into Pages root; esbuild must not resolve absolute public paths.
  external:['/assets/*'],
  outdir, minify:true,metafile:true,legalComments:'eof',
  define:{__WORKER_ORIGIN__:JSON.stringify(origin.origin)},
});
await Promise.all([
  writeFile(new URL('index.html',destUrl),await readFile(new URL('./landing.html',import.meta.url))),
  writeFile(new URL('app/index.html',destUrl),await readFile(new URL('./index.html',import.meta.url))),
  writeFile(new URL('judges/index.html',destUrl),await readFile(new URL('./judges.html',import.meta.url))),
  writeFile(new URL('404.html',destUrl),await readFile(new URL('./404.html',import.meta.url))),
  writeFile(new URL('assets/backstage-fallback.svg',destUrl),
    await readFile(new URL('./assets/backstage-fallback.svg',import.meta.url))),
  writeFile(new URL('assets/drum-fallback.svg',destUrl),
    await readFile(new URL('./assets/drum-fallback.svg',import.meta.url))),
]);
await cp(new URL('./assets/',import.meta.url), new URL('assets/',destUrl), {recursive:true});
await cp(new URL('./public/',import.meta.url),destUrl,{recursive:true});
await mkdir(new URL('video/',destUrl),{recursive:true});
for (const {target, bytes} of filmAssets) await writeFile(new URL('video/' + target,destUrl),bytes);
await buildPwa(destUrl);
await writeFile(new URL('_headers',destUrl),`/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; connect-src 'self' ${origin.origin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: public, max-age=0, must-revalidate
`);
for(const [path,meta] of Object.entries(built.metafile.outputs))
 console.log(`${path}: ${(meta.bytes/1024).toFixed(1)} kB`);
console.log(`Tour Rescue front v2 ${deploy?'Cloudflare Pages output':'local preview'}: ${outdir}; Worker: ${origin.origin}`);
