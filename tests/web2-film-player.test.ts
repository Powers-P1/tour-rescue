import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { RECORDED_QLOO_STUDY } from '../web2/src/live-study.ts';
import { judgesMarkup } from '../web2/src/marketing.ts';
import { publicSiteModel } from '../web2/src/marketing-model.ts';

test('jury player builds the clean final-v4 film with 39 captions, transcript and retained final-v2 archive',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 await promisify(execFile)(process.execPath,['web2/build.mjs'],{cwd:root,timeout:30000});
 // Execute the real built v2 entry point offline. Only the DOM surface is stubbed;
 // the model, recommendation, summary and markup code all run from the bundle.
 const stub=()=>({innerHTML:'',className:'',dataset:{},addEventListener(){},setAttribute(){},
   querySelector(selector:string){return selector==='[data-film-player]'?null:stub();},querySelectorAll(){return [];}});
 const judges=stub();
 const media=()=>({matches:false,addEventListener(){}});
 let requests=0;
 runInNewContext(await readFile(new URL('../web2/dist/judges.js',import.meta.url),'utf8'),{
   document:{getElementById:()=>judges,createElement:stub,querySelector:()=>null,querySelectorAll:()=>[],
     body:{append(){}},addEventListener(){}},
   window:{matchMedia:media,addEventListener(){},setTimeout(){}},matchMedia:media,
   navigator:{userAgent:'Offline bundle test',platform:'test',maxTouchPoints:0},
   localStorage:{getItem:()=>null},location:{protocol:'https:',hostname:'offline.test'},
   structuredClone,crypto:{randomUUID:()=> 'offline-bundle-test'},
   fetch(){requests++;throw new Error('Built preview must not request provider data.');},
 },{timeout:5000});
 assert.equal(requests,0);
 assert.doesNotMatch(judges.innerHTML,/Saved evidence preview unavailable/);
 const recorded=judges.innerHTML.match(/<section class="recorded-qloo-study"[^]*?<\/section>/)?.[0]??'';
 const synthetic=judges.innerHTML.match(/<div class="breakpoint-note"[^]*?<\/div>/)?.[0]??'';
 assert.match(recorded,/data-evidence-kind="recorded-live"/);
 assert.match(synthetic,/data-evidence-kind="synthetic"/);
 for(const run of RECORDED_QLOO_STUDY.runs){
   assert.ok(recorded.includes('<dt>'+run.target+'</dt>'));
   assert.ok(recorded.includes('<strong>'+run.recommendation+'</strong>'));
 }
 assert.equal((recorded.match(/24\/24/g)??[]).length,3);
 assert.equal((recorded.match(/both comparison omissions unchanged/g)??[]).length,3);
 assert.match(recorded,/winner unchanged at 350 km/);
 assert.doesNotMatch(recorded,/354\.1|Frankfurt/);
 assert.match(synthetic,/350[^]*?354\.1/);
 assert.match(synthetic,/Nuremberg[^]*?Frankfurt am Main/);
 assert.match(synthetic,/six-hour driving limit stays fixed/);
 assert.ok(recorded.includes(RECORDED_QLOO_STUDY.reportUrl));
 const canonical=new URL('../docs/demo/final-v4/',import.meta.url);
 const published=new URL('../web2/dist/video/',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('manifest.json',canonical),'utf8'));
 const expectedSha='c9c6a5b8f3a25fc6d25093026567e57ec7cfe4e9fffe3f9da7b701a196c10d4f';
 assert.equal(manifest.sha256,expectedSha);
 assert.equal(manifest.revision,'final-v4');
 assert.equal(manifest.durationSeconds,120);
 assert.equal(manifest.captionDelivery,'clean-picture-plus-native-vtt');
 assert.equal(manifest.captionCueCount,39);
 assert.equal(manifest.publicPlaybackPath,'/video/tour-rescue-final-v4.mp4');
 if(manifest.publicVideoUrl===null)assert.equal(manifest.publicVideoUrlStatus,'pending-owner-publication');
 else assert.ok(['youtu.be','www.youtube.com','youtube.com'].includes(new URL(manifest.publicVideoUrl).hostname));
 for(const file of manifest.files){
  const bytes=await readFile(new URL(file.name,canonical));
  assert.equal(bytes.length,file.bytes,file.name+' byte count');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.name+' hash');
 }
 assert.deepEqual((await readdir(canonical)).sort(),[...manifest.files.map((file:{name:string})=>file.name),'manifest.json'].sort());
 assert.deepEqual((await readdir(published)).sort(),[
  'tour-rescue-final-v4-poster.jpg','tour-rescue-final-v4.en.srt','tour-rescue-final-v4.en.vtt','tour-rescue-final-v4.mp4','transcript.txt',
 ]);
 for(const [source,target] of [
  ['TourRescue-jury-final-v4.mp4','tour-rescue-final-v4.mp4'],
  ['poster.jpg','tour-rescue-final-v4-poster.jpg'],
  ['captions.en.vtt','tour-rescue-final-v4.en.vtt'],['captions.en.srt','tour-rescue-final-v4.en.srt'],['narration.txt','transcript.txt'],
 ]){
  const bytes=await readFile(new URL(source!,canonical));
  assert.deepEqual(await readFile(new URL(target!,published)),bytes,target);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files.find((f:{name:string})=>f.name===source).sha256);
 }
 const film=await readFile(new URL('tour-rescue-final-v4.mp4',published));
 assert.equal(createHash('sha256').update(film).digest('hex'),expectedSha);
 assert.ok(film.length<=24*1024*1024,'publication asset leaves space below Pages 25MiB limit');
 const html=judgesMarkup(publicSiteModel());
 assert.equal((html.match(/href="#walkthrough"/g)??[]).length,1);
 const video=html.match(/<video\b[^>]*>[\s\S]*?<\/video>/)?.[0]??'';
 assert.match(video,/playsinline preload="none"/);
 assert.match(video,/poster="\/video\/tour-rescue-final-v4-poster\.jpg"/);
 assert.doesNotMatch(video,/<source|\ssrc="[^"]+\.mp4"/,'no eager native MP4 request before the user asks');
 assert.match(html,/data-film-src="\/video\/tour-rescue-final-v4\.mp4"/);
 assert.ok(html.includes('data-film-bytes="'+film.length+'"'));
 assert.match(html,/data-film-load[^>]*>Play the two-minute film \(23 MB\)/);
 assert.match(html,/data-film-cancel hidden>Cancel download/);
 assert.match(html,/data-film-status role="status"/);
 assert.match(html,/download="TourRescue-jury-final-v4.mp4"/);
 assert.match(video,/kind="captions"[^>]+srclang="en"[^>]+default/);
 assert.doesNotMatch(video,/\b(?:autoplay|loop)\b/);
 assert.match(html,/href="\/video\/transcript\.txt"/);
 assert.ok(html.includes('href="'+manifest.publicPlaybackPath+'"'));
 if(manifest.publicVideoUrl!==null)assert.ok(new URL(manifest.publicVideoUrl));
 assert.doesNotMatch(html,/PUBLIC_VIDEO_URL_PENDING|FINAL_V4_PUBLICATION_SHA256_PENDING/);
 assert.match(html,/Watch the two-minute film/);
 assert.doesNotMatch(html,/100-second|tour-rescue-final-v2\./);
 assert.match(html,/OPTIONAL PRESENTATION/);assert.match(html,/Recorded real Qloo evidence/);
 assert.match(html,/authored AI replay/);assert.match(html,/Tour SOS is a supplier sample: no contact, order or payment/);
 assert.match(html,/proposed business model requires real partners/);
 assert.match(html,/Motion and device frames are edited/);
 const vtt=await readFile(new URL('tour-rescue-final-v4.en.vtt',published),'utf8');
 assert.match(vtt,/^WEBVTT/);
 const stamp=(s:string)=>s.split(':').reduce((sum,n)=>sum*60+Number(n),0);
 const cues=[...vtt.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})/g)];
 assert.equal(cues.length,39);let previous=0;
 for(const [,a,b] of cues){const start=stamp(a!),end=stamp(b!);assert.ok(start>=previous&&end>start&&end<=120);previous=end;}
 assert.equal(previous,116.97);
 const spoken=vtt.trim().split(/\r?\n\r?\n/).slice(1).map(block=>block.split(/\r?\n/).slice(1).join(' '));
 const transcript=await readFile(new URL('transcript.txt',published),'utf8');
 for(const line of spoken)assert.ok(transcript.includes(line),line);
 assert.match(transcript,/authored replay/);assert.match(transcript,/Nothing is booked or paid/);
 assert.doesNotMatch(await readFile(new URL('../web2/dist/app/sw.js',import.meta.url),'utf8'),/\/video\//);
 const headers=await readFile(new URL('../web2/dist/_headers',import.meta.url),'utf8');
 assert.match(headers,/; media-src 'self' blob:;/);
 assert.doesNotMatch(headers,/script-src[^;]*blob:|connect-src[^;]*blob:/);
 assert.deepEqual((await readdir(new URL('../docs/demo/',import.meta.url),{recursive:true})).filter(p=>p.endsWith('.mp4')).map(p=>p.replaceAll('\\','/')).sort(),[
  'final-v2/TourRescue-jury-final-v2.mp4','final-v4/TourRescue-jury-final-v4.mp4']);
 const archived=await readFile(new URL('../docs/demo/final-v2/TourRescue-jury-final-v2.mp4',import.meta.url));
 assert.equal(createHash('sha256').update(archived).digest('hex'),'9d5e25ece393070f3ab889e4cb2a41c8549259473b449d06e4863725d2413bb2');
 const css=await readFile(new URL('../web2/src/marketing-completion.css',import.meta.url),'utf8');
 assert.match(css,/max-width:960px/);assert.match(css,/aspect-ratio:16\/9/);
});
