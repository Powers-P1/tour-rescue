/** Capture the real v2 Pages output; never use or edit design-board crops. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const port=4173;
const origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['web2/serve.mjs','--deploy'],{
 env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe'],
});
let transcript='';
server.stdout.on('data',chunk=>{transcript+=chunk.toString();});
server.stderr.on('data',chunk=>{transcript+=chunk.toString();});
async function ready(){
 for(let i=0;i<50;i++){
  if(server.exitCode!==null)throw new Error('Preview server exited. '+transcript);
  try{
   const response=await fetch(origin+'/',{signal:AbortSignal.timeout(600)});
   if(response.status===200)return;
  }catch{/* starting */}
  await new Promise(done=>setTimeout(done,220));
 }
 throw new Error('Preview server did not start. '+transcript);
}
const out='artifacts/screenshots/v2';
await mkdir(out,{recursive:true});
let browser;
const rows=[];
try{
 await ready();
 browser=await chromium.launch({headless:true});
 const shots=[
  {name:'08-landing-desktop.png',path:'/',width:1536,height:1024},
  {name:'08-landing-mobile.png',path:'/',width:390,height:844},
  {name:'09-judges-desktop.png',path:'/judges/',width:1536,height:1024},
  {name:'09-judges-mobile.png',path:'/judges/',width:390,height:844},
  {name:'404-desktop.png',path:'/404.html',width:1280,height:800},
  {name:'404-mobile.png',path:'/404.html',width:390,height:844},
  {name:'01-today-mobile.png',path:'/app/',width:390,height:844},
  {name:'01-rescue-options-mobile.png',path:'/app/#rescue',width:390,height:844},
  {name:'04-command-desktop.png',path:'/app/',width:1536,height:1024},
  {name:'05-audience-desktop.png',path:'/app/#audience',width:1536,height:1024},
  {name:'06-simulation-desktop.png',path:'/app/#simulation',width:1536,height:1024},
  {name:'07-agency-desktop.png',path:'/app/#agency',width:1536,height:1024},
 ];
 for(const shot of shots){
   const page=await browser.newPage({viewport:{width:shot.width,height:shot.height},deviceScaleFactor:1});
   const errors=[];
   page.on('pageerror',error=>errors.push('JS: '+error.message));
   page.on('console',msg=>{if(msg.type()==='error')errors.push('Console: '+msg.text());});
   const response=await page.goto(origin+shot.path,{waitUntil:'domcontentloaded',timeout:30000});
   if(response?.status()!==200)throw new Error(shot.name+' got HTTP '+response?.status());
   await page.locator('h1').first().waitFor({state:'visible',timeout:15000});
   await page.evaluate(async()=>{
     if(document.fonts?.ready)await Promise.race([
       document.fonts.ready,
       new Promise(resolve=>setTimeout(resolve,2000)),
     ]);
   });
   if(shot.path.includes('/app/#rescue'))await page.locator('[data-action="select-option"]').first().waitFor();
   if(shot.path==='/404.html'){
     const report=await page.evaluate(()=>{
       const links=[...document.querySelectorAll('.not-found-links a')].map(a=>{
         const style=getComputedStyle(a);
         return {label:a.textContent?.trim(),height:a.getBoundingClientRect().height,
           color:style.color,underline:style.textDecorationLine,display:style.display};
       });
       const main=document.querySelector('.not-found-page');
       return {links,mainTop:main?.getBoundingClientRect().top ?? 0,
         inlineStyles:document.querySelectorAll('[style]').length};
     });
     if(report.links.length!==3||report.links.some(link=>link.height<48||
         !link.underline.includes('underline')||link.display!=='inline-flex')||
         report.mainTop<50||report.inlineStyles!==0)
       throw new Error(shot.name+' has inaccessible 404 recovery or inline style: '+JSON.stringify(report));
   }
   if(shot.path==='/judges/'){
     const targets=await page.locator('.judges-external-link').evaluateAll(anchors=>
       anchors.map(anchor=>({text:anchor.textContent?.trim(),
         height:anchor.getBoundingClientRect().height,
         display:getComputedStyle(anchor).display})));
     if(targets.length!==2||targets.some(link=>link.height<48||link.display!=='inline-flex'))
       throw new Error(shot.name+' has undersized public-source/agent-contract links: '+JSON.stringify(targets));
   }
   const layout=await page.evaluate(()=>{
     const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);
     return {width:document.documentElement.scrollWidth,viewport:window.innerWidth,
       duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i)};
   });
   if(layout.width>layout.viewport+2||layout.duplicates.length||errors.length)
     throw new Error(shot.name+': '+JSON.stringify({layout,errors}));
   await page.screenshot({path:join(out,shot.name),fullPage:true,animations:'disabled'});
   rows.push({file:shot.name,path:shot.path,viewport:shot.width+'x'+shot.height,
     documentWidth:layout.width,errors:errors.length});
   await page.close();
 }
 // Capture the decision flows, not just their entry screens.
 const flows=[
   {name:'01-rescue-detail-mobile.png',start:'/app/#rescue',width:390,height:844,clicks:['review']},
   {name:'01-promoter-mobile.png',start:'/app/#rescue',width:390,height:844,clicks:['review','prepare']},
   {name:'01-promoter-desktop.png',start:'/app/#rescue',width:1536,height:1024,clicks:['review','prepare']},
   {name:'02-sos-problem-mobile.png',start:'/app/#sos',width:390,height:844,clicks:[]},
   {name:'02-sos-options-mobile.png',start:'/app/#sos',width:390,height:844,clicks:['sos-find']},
   {name:'02-sos-quote-mobile.png',start:'/app/#sos',width:390,height:844,clicks:['sos-find','sos-quote']},
   {name:'03-planner-mobile.png',start:'/app/',width:390,height:844,clicks:['tab-route','open-plan']},
   {name:'03-planner-draft-mobile.png',start:'/app/',width:390,height:844,clicks:['tab-route','open-plan','plan-build']},
   {name:'03-economics-mobile.png',start:'/app/',width:390,height:844,clicks:['tab-route','open-economics']},
   {name:'03-fan-mobile.png',start:'/app/#fan',width:390,height:844,clicks:[]},
 ];
 for(const flow of flows){
   const page=await browser.newPage({viewport:{width:flow.width,height:flow.height},deviceScaleFactor:1});
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
   await page.goto(origin+flow.start,{waitUntil:'domcontentloaded',timeout:30000});
   await page.locator('h1').first().waitFor({state:'visible'});
   for(const action of flow.clicks){
     const control=page.locator('[data-action="'+action+'"]').first();
     await control.waitFor({state:'visible',timeout:10000});
     await control.click();
   }
   if(flow.name==='01-promoter-desktop.png'){
     const back=page.locator('.desktop-proposal-back');
     if(!await back.isVisible())throw new Error('Desktop promoter draft has no visible Back button');
   }
   const size=await page.evaluate(()=>{
     const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);
     return {documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,
       duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i)};
   });
   if(size.documentWidth>size.viewport+2||size.duplicates.length||errors.length)
     throw new Error(flow.name+' failed browser checks: '+JSON.stringify({size,errors}));
   await page.screenshot({path:join(out,flow.name),fullPage:true,animations:'disabled'});
   rows.push({file:flow.name,path:flow.start,viewport:flow.width+'x'+flow.height,
     documentWidth:size.documentWidth,errors:errors.length,actions:flow.clicks});
   await page.close();
 }
 // PR-D nonblocking visual/a11y regressions in real Chromium.
 const openApp=async(path,width=1280,height=800)=>{
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:30000});
   if(response?.status()!==200)throw new Error('App path did not respond: '+path);
   await page.locator('h1').first().waitFor({state:'visible',timeout:12000});
   return page;
 };
 for(const width of [980,1024,1100,1279]){
   const page=await openApp('/app/#audience',width,800);
   const labels=await page.evaluate(()=>{
     const el=document.querySelector('.taste-mobile-key');
     const svg=document.querySelector('.taste-map-label');
     return {
       visible:Boolean(el&&el.getClientRects().length),
       fontSize:el?parseFloat(getComputedStyle(el).fontSize):0,
       svgVisible:Boolean(svg&&svg.getClientRects().length&&getComputedStyle(svg).display!=='none'),
       content:el?.textContent??'',
       overflow:document.documentElement.scrollWidth-innerWidth,
     };
   });
   if(!labels.visible||labels.fontSize<14||labels.svgVisible||
       !/Nuremberg|Frankfurt/.test(labels.content)||labels.overflow>2)
     throw new Error('Mid-desktop city labels inaccessible at '+width+': '+JSON.stringify(labels));
   await page.locator('[data-action="feature-back"]').first().waitFor({state:'visible'});
   if(width===1100){
     await page.screenshot({path:join(out,'05-audience-1100px.png'),fullPage:true,animations:'disabled'});
     rows.push({file:'05-audience-1100px.png',path:'/app/#audience',viewport:'1100x800',
       documentWidth:width,errors:0,notes:'15px HTML map key replaces scaled SVG city labels'});
   }
   await page.close();
 }
 // Validate tab panels, roving arrow behavior, real focus and selected city details.
 {
   const page=await openApp('/app/#audience');
   const qloo=page.locator('[data-action="audience-qloo"]');
   await qloo.focus();
   await page.keyboard.press('ArrowRight');
   if(await page.locator('[data-action="audience-fans"]').getAttribute('aria-selected')!=='true')
     throw new Error('Audience ArrowRight did not activate Fan requests');
   let state=await page.evaluate(()=>{
     const active=document.activeElement;
     return {action:active?.getAttribute('data-action'),
       hasPanel:Boolean(document.getElementById('audience-panel-fans')),
       controlled:active?.getAttribute('aria-controls')};
   });
   if(state.action!=='audience-fans'||state.controlled!=='audience-panel-fans'||!state.hasPanel)
     throw new Error('Audience tabs lost roving focus or aria-controls: '+JSON.stringify(state));
   await page.keyboard.press('ArrowLeft');
   if(await qloo.getAttribute('aria-selected')!=='true')
     throw new Error('Audience ArrowLeft did not reactivate Qloo');
   const first=page.locator('[data-action="audience-select"][aria-checked="true"]');
   await first.focus();
   await page.keyboard.press('ArrowDown');
   state=await page.evaluate(()=>{
     const checked=[...document.querySelectorAll('[data-action="audience-select"][aria-checked="true"]')];
     const active=document.activeElement;
     return {count:checked.length,focused:active?.getAttribute('data-id'),
       checked:checked[0]?.getAttribute('data-id'),
       controlled:active?.getAttribute('aria-controls'),
       detail:Boolean(document.getElementById('audience-city-detail'))};
   });
   if(state.count!==1||state.focused!==state.checked||state.controlled!=='audience-city-detail'||!state.detail)
     throw new Error('Audience radio arrow/focus was invalid: '+JSON.stringify(state));
   await page.close();
 }
 // Route and agency tabs also need real connected panels and roving focus.
 for(const [path,nextAction,firstAction] of [
   ['/app/#simulation','sim-budget-tab','sim-route-tab'],
   ['/app/#agency','agency-all','agency-attention'],
 ]){
   const page=await openApp(path);
   await page.locator('[data-action="'+firstAction+'"]').focus();
   await page.keyboard.press('ArrowRight');
   const active=await page.evaluate(()=>({
     action:document.activeElement?.getAttribute('data-action'),
     panelId:document.activeElement?.getAttribute('aria-controls'),
   }));
   const chosen=page.locator('[role="tab"][data-action="'+nextAction+'"]');
   if(active.action!==nextAction||!active.panelId||
     await chosen.getAttribute('aria-selected')!=='true'||
     await page.locator('[id="'+active.panelId+'"]').count()!==1)
     throw new Error('Tab panel keyboard/ARIA mismatch: '+path+' '+JSON.stringify(active));
   await page.close();
 }
 // Verify true Back controls at sizes where the mobile header is hidden.
 for(const path of ['/app/#audience','/app/#agency']){
   for(const width of [980,1280]){
     const page=await openApp(path,width,800);
     if(!await page.locator('.feature-head-actions [data-action="feature-back"]').isVisible())
       throw new Error('No desktop Back action at '+path+' / '+width);
     await page.close();
   }
 }
 {
   const page=await openApp('/app/#rescue',1280,800);
   await page.locator('[data-action="review"]').click();
   await page.locator('[data-action="prepare"]').click();
   if(!await page.locator('.desktop-proposal-back').isVisible())
     throw new Error('Desktop promoter draft has no Back');
   await page.close();
 }
 // The recheck status must be inline (no fixed toast covering the Extra-distance row).
 {
   const page=await openApp('/app/#simulation',1280,800);
   await page.locator('#sim-cap').fill('100');
   await page.locator('[data-action="sim-recheck"]').click();
   if(await page.locator('p.toast').count()!==0)
     throw new Error('Recheck feedback still overlays the Extra-distance row');
   const inline=page.locator('.sim-distance-status .feature-action-notice');
   if(!await inline.isVisible()||!(await inline.textContent())?.includes('Recalculated'))
     throw new Error('Simulation decision status not displayed inline');
   await page.screenshot({path:join(out,'06-simulation-recheck-1280.png'),fullPage:true,animations:'disabled'});
   rows.push({file:'06-simulation-recheck-1280.png',path:'/app/#simulation',viewport:'1280x800',
     documentWidth:1280,errors:0,actions:['sim-recheck']});
   await page.close();
 }
 {
   const page=await openApp('/app/#agency',1280,800);
   const statuses=(await page.locator('.agency-issue-status').allTextContents()).join(' / ');
   if(!/● Needs local help/.test(statuses)||!/× Canceled/.test(statuses)||!/● Needs owner/.test(statuses))
     throw new Error('Agency sample issue statuses missing icon+text: '+statuses);
   await page.close();
 }
 {
   const page=await openApp('/app/',1280,800);
   await page.locator('[data-action="tab-route"]').click();
   await page.locator('[data-action="open-ai"]').click();
   await page.locator('[data-action="ai-mode-live"]').click();
   const text=await page.locator('.intro').textContent();
   if(!text?.includes('ⓘ Unavailable - run fresh Qloo first'))
     throw new Error('Live-agent setup unavailable text lacks icon');
   await page.close();
 }
 // Regression: the promoter draft Back must never move keyboard focus to BODY
 // via its hidden mobile-only twin. Review also exposes a visible desktop Back.
 for(const width of [980,1280,1536]){
   const page=await browser.newPage({viewport:{width,height:800}});
   const problems=[];
   page.on('pageerror',error=>problems.push(error.message));
   await page.goto(origin+'/app/#rescue',{waitUntil:'domcontentloaded',timeout:30000});
   await page.locator('[data-action="review"]').waitFor({state:'visible'});
   await page.locator('[data-action="review"]').click();
   await page.locator('[data-action="prepare"]').click();
   const draftBack=page.locator('.desktop-proposal-back');
   if(!await draftBack.isVisible())
     throw new Error('Desktop proposal Back hidden at '+width);
   await draftBack.focus();
   await draftBack.click();
   const reviewBack=page.locator('.desktop-review-back');
   if(!await reviewBack.isVisible())
     throw new Error('Desktop Review has no visible Back at '+width);
   const state=await page.evaluate(()=>{
     const node=document.activeElement;
     return {tag:node?.tagName,action:node?.getAttribute('data-action'),
       visible:Boolean(node&&node instanceof HTMLElement&&node.getClientRects().length>0),
       reviewHeading:document.querySelector('#main h1')?.textContent??''};
   });
   if(!state.visible||state.tag==='BODY'||!state.reviewHeading.trim()||problems.length)
     throw new Error('Draft->Review keyboard focus lost at '+width+': '+JSON.stringify({state,problems}));
   await reviewBack.click();
   const next=await page.evaluate(()=>document.activeElement?.tagName);
   if(next==='BODY')throw new Error('Review->options keyboard focus lost at '+width);
   await page.close();
 }
 // Check mobile/tablet breakpoints on the actual landing and judges DOM.
 for(const path of ['/','/judges/']){
  for(const width of [320,375,390,768,980,1280,1536]){
   const page=await browser.newPage({viewport:{width,height:844}});
   await page.goto(origin+path,{waitUntil:'domcontentloaded'});
   const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,
     width:window.innerWidth}));
   if(metrics.scroll>metrics.width+2)
     throw new Error('Horizontal overflow at '+path+' '+width+': '+JSON.stringify(metrics));
   await page.close();
  }
 }
 await writeFile(join(out,'manifest.json'),JSON.stringify({
  version:'Tour Rescue front v2',builtFrom:'web/dist',capturedAt:new Date().toISOString(),
  notes:'Real browser screenshots of the built UI; mockup board crops are not used. External editorial photos require network.',
  screenshots:rows,
 },null,2)+'\n');
 console.log('Captured '+rows.length+' screenshots and checked 14 additional responsive widths.');
}finally{
 await browser?.close();
 server.kill('SIGTERM');
}
