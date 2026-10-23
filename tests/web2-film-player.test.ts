import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { judgesMarkup } from '../web2/src/marketing.ts';
import { publicSiteModel } from '../web2/src/marketing-model.ts';

test('jury player builds the exact final film with captions/transcript and leaves video outside the PWA cache',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 await promisify(execFile)(process.execPath,['web2/build.mjs'],{cwd:root,timeout:30000});
 const canonical=new URL('../docs/demo/final-v2/',import.meta.url);
 const published=new URL('../web2/dist/video/',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('manifest.json',canonical),'utf8'));
 const expectedSha='9d5e25ece393070f3ab889e4cb2a41c8549259473b449d06e4863725d2413bb2';
 assert.equal(manifest.sha256,expectedSha);
 assert.deepEqual((await readdir(published)).sort(),[
  'tour-rescue-final-v2-poster.jpg','tour-rescue-final-v2.en.srt','tour-rescue-final-v2.en.vtt','tour-rescue-final-v2.mp4','transcript.txt',
 ]);
 for(const [source,target] of [
  ['TourRescue-jury-final-v2.mp4','tour-rescue-final-v2.mp4'],
  ['poster.jpg','tour-rescue-final-v2-poster.jpg'],
  ['captions.en.vtt','tour-rescue-final-v2.en.vtt'],['narration.txt','transcript.txt'],
 ]){
  const bytes=await readFile(new URL(source!,canonical));
  assert.deepEqual(await readFile(new URL(target!,published)),bytes,target);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files.find((f:{name:string})=>f.name===source).sha256);
 }
 assert.equal(createHash('sha256').update(await readFile(new URL('tour-rescue-final-v2.mp4',published))).digest('hex'),expectedSha);
 const html=judgesMarkup(publicSiteModel());
 assert.equal((html.match(/href="#walkthrough"/g)??[]).length,1);
 const video=html.match(/<video\b[^>]*>[\s\S]*?<\/video>/)?.[0]??'';
 assert.match(video,/controls playsinline preload="metadata"/);
 assert.match(video,/poster="\/video\/tour-rescue-final-v2-poster\.jpg"/);
 assert.match(video,/src="\/video\/tour-rescue-final-v2\.mp4" type="video\/mp4"/);
 assert.match(video,/kind="captions"[^>]+srclang="en"[^>]+default/);
 assert.doesNotMatch(video,/\b(?:autoplay|loop)\b/);
 assert.match(html,/href="\/video\/transcript\.txt"/);
 assert.match(html,/OPTIONAL PRESENTATION/);assert.match(html,/recorded live Qloo evidence/);
 assert.match(html,/Motion and device frames are edited/);
 const vtt=await readFile(new URL('tour-rescue-final-v2.en.vtt',published),'utf8');
 assert.match(vtt,/^WEBVTT/);
 const stamp=(s:string)=>s.split(':').reduce((sum,n)=>sum*60+Number(n),0);
 const cues=[...vtt.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})/g)];
 assert.equal(cues.length,22);let previous=0;
 for(const [,a,b] of cues){const start=stamp(a!),end=stamp(b!);assert.ok(start>=previous&&end>start&&end<=100);previous=end;}
 assert.doesNotMatch(await readFile(new URL('../web2/dist/app/sw.js',import.meta.url),'utf8'),/\/video\//);
 assert.deepEqual((await readdir(new URL('../docs/demo/',import.meta.url),{recursive:true})).filter(p=>p.endsWith('.mp4')).map(p=>p.replaceAll('\\','/')),['final-v2/TourRescue-jury-final-v2.mp4']);
 const css=await readFile(new URL('../web2/src/marketing-completion.css',import.meta.url),'utf8');
 assert.match(css,/max-width:960px/);assert.match(css,/aspect-ratio:16\/9/);
});
