import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
/** Cache only the small public rescue shell. Worker APIs and research are always network-only. */
export async function buildPwa(dest){
 const assets=['/app/','/app.js','/app.css','/manifest.webmanifest',
  '/assets/pwa-192.png','/assets/pwa-512.png','/assets/pwa-180.png',
  '/assets/fonts/inter-latin-wght-normal.woff2','/assets/fonts/inter-latin-ext-wght-normal.woff2'];
 const hash=createHash('sha256');
 for(const asset of assets)hash.update(await readFile(new URL(asset==='/app/'?'app/index.html':asset.slice(1),dest)));
 const version=hash.digest('hex').slice(0,16);
 await writeFile(new URL('app/sw.js',dest),`// Generated public-shell cache. Never cache provider or API responses.
const CACHE='tour-rescue-shell-${version}';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('tour-rescue-shell-')&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||request.headers.has('Authorization')||!ASSETS.includes(url.pathname))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(()=>caches.match('/app/')));return;
 }
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))??fetch(request)));
});
`);
}
