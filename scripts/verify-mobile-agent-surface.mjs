/** Browser plugin not available. Offline Playwright proof of v2 evidence, exports, guide and PWA. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
const base=process.env.BASE_URL??'http://127.0.0.1:4194';
const server=process.env.BASE_URL?null:spawn(process.execPath,['web2/serve.mjs','--deploy'],{env:{...process.env,PORT:'4194'},stdio:'ignore'});
const out=process.env.QA_OUTPUT??join(tmpdir(),'tour-rescue-mobile-agent');let browser;const checks=[];
const launch={headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})};
const act=(p,id)=>p.locator('[data-action="'+id+'"]:visible').first();
async function downloaded(p,id){const pending=p.waitForEvent('download');await act(p,id).click();const d=await pending;return {bytes:await readFile(await d.path()),name:d.suggestedFilename()};}
async function centerHit(page,control,label){
 let result,previous,stable=0;
 for(let attempt=0;attempt<30;attempt++){
  result=await control.evaluate(node=>{
   const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
   return {clear:r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&!!hit&&node.contains(hit),x,y,
    rect:{x:r.left,y:r.top,width:r.width,height:r.height},hit:hit?.textContent?.slice(0,100)};
  });
  stable=result.clear&&previous?.clear&&Object.keys(result.rect).every(key=>Math.abs(result.rect[key]-previous.rect[key])<.5)?stable+1:0;
  if(stable>=2)return result;
  previous=result;
  await page.waitForTimeout(50);
 }
 assert.ok(stable>=2,label+': '+JSON.stringify(result));
}
try{
 for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 await mkdir(out,{recursive:true});browser=await chromium.launch(launch);
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:900},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base+'/app/#simulation');await page.locator('.sim-edit summary').click();
  await page.locator('#sim-cap').fill('354.1');await act(page,'sim-recheck').click();await act(page,'sim-follow-recommendation').click();await act(page,'sim-full-evidence').click();
  assert.match(await page.locator('.decision-evidence').innerText(),/Frankfurt am Main/);
  assert.equal(await page.locator('.fit-scatter svg .scatter-point').count(),2);
  assert.ok(await page.locator('.sensitivity-result').count()>=4);
  assert.match(await page.locator('.control-evidence').innerText(),/Control artist/);
  await page.getByText('Tag Bridge · sourced tags only',{exact:true}).click();assert.equal(await page.locator('.tag-state').innerText(),'UNKNOWN');
  await page.screenshot({path:join(out,'evidence-'+width+'.png'),fullPage:true});
  await act(page,'evidence-proposal').click();
  const text=await page.locator('#main .sheet-paper').innerText();assert.match(text,/additional distance/);assert.match(text,/Comparison artists & sensitivity/);assert.match(text,/Leave one artist out/);
  const png=await downloaded(page,'download-sheet-png');assert.equal(png.bytes.subarray(1,4).toString(),'PNG');assert.equal(png.bytes.readUInt32BE(16),1680);assert.equal(png.bytes.readUInt32BE(20),2376);
  await writeFile(join(out,'promoter-'+width+'.png'),png.bytes);
  await page.pdf({path:join(out,'promoter-'+width+'.pdf'),preferCSSPageSize:true,printBackground:true});
  await page.goto(base+'/app/#ai');await act(page,'ai-replay').click();await page.locator('[data-action=ai-accept]').first().click();
  await act(page,'open-evidence').click();const before=JSON.parse((await downloaded(page,'audit')).bytes);
  await page.evaluate(()=>{location.hash='rescue';});await act(page,'start-guide').click();
  for(let step=1;step<=6;step++){
    await page.locator('.guided-tour-layer[data-step="'+step+'"]').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.activeElement?.classList.contains('guided-tour-card'));
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),String(step));
    const next=page.getByRole('button',{name:step===6?'Finish tour':'Next',exact:true});
    assert.equal(await next.isEnabled(),false,'step needs an actual outcome');
    if(step===1){
      if(width===390){
       await page.getByRole('button',{name:'Minimize guided tour',exact:true}).click();
       await centerHit(page,act(page,'rescue'),'compact guide leaves Rescue reachable');
       const card=await page.locator('.guided-tour-card').boundingBox(),nav=await page.locator('.home-view .mobile-tabs').boundingBox();
       assert.ok(card&&nav&&card.y+card.height<nav.y,'compact guide docks above fixed mobile navigation');
       await page.getByRole('button',{name:'Expand guided tour',exact:true}).click();
      }
      await act(page,'rescue').click();
    }
    if(step===2)await act(page,'review').click();
    if(step===3){
      await page.locator('.sim-edit summary').click();await page.locator('#sim-cap').fill('354.1');
      if(width===390){
       assert.equal(await page.locator('.guided-tour-card.is-compact').count(),0,'regression uses the expanded card');
       await centerHit(page,act(page,'sim-recheck'),'step 3 after fill: expanded guide leaves Recheck center reachable');
       await page.screenshot({path:join(out,'guide-step3-expanded-390.png')});
      }
      await act(page,'sim-recheck').click();
      assert.equal(await page.locator('[data-recommendation=after]').innerText(),'Frankfurt am Main');
    }
    if(step===4){
      const sources=page.locator('.evidence-disclosure').filter({has:page.locator('summary',{hasText:'Sources & limitations'})});
      if(width===390){
       assert.equal(await page.locator('.guided-tour-card.is-compact').count(),0,'sources regression uses the expanded card');
       await centerHit(page,page.locator('.evidence-disclosure:has([data-evidence-tags]) > summary'),'step 4 Tag Bridge is reachable before scrolling');
       await page.mouse.move(8,400);await page.mouse.wheel(0,180);
       let center;
       try{center=await centerHit(page,sources.locator('summary'),'step 4 expanded guide leaves Sources & limitations center reachable');}
       finally{await page.screenshot({path:join(out,'guide-step4-expanded-390.png')});}
       await page.mouse.click(center.x,center.y);
      }else await sources.locator('summary').click();
      await sources.locator('ul').waitFor({state:'visible'});
      await page.waitForFunction(()=>!document.querySelector('.guided-tour-actions .button-primary')?.disabled);
      assert.ok(await next.isEnabled(),'opening Sources & limitations satisfies the evidence objective');
      if(width===390){
       const before=await page.evaluate(()=>scrollY);
       await page.mouse.move(8,400);await page.mouse.wheel(0,180);
       await page.waitForFunction(before=>scrollY>before+90,before);
       const first=sources.locator('ul > li').first();
       await centerHit(page,first,'opened source text stays readable after ordinary wheel scrolling');
       const readable=await first.evaluate(node=>{
        const r=node.getBoundingClientRect(),coach=document.querySelector('.guided-tour-card').getBoundingClientRect();
        return r.bottom<=coach.top||r.top>=coach.bottom;
       });
       assert.ok(readable,'the whole first source entry is outside the expanded coach');
      }
      if(width===390)await page.screenshot({path:join(out,'guide-step4-sources-open-390.png')});
      await page.locator('details').filter({hasText:'Tag Bridge · sourced tags only'}).locator('summary').first().click();
      await page.locator('.tag-state').waitFor({state:'visible'});
    }
    if(step===5){
      await downloaded(page,'audit');
      if(width===390){
       await page.getByRole('button',{name:'Minimize guided tour',exact:true}).click();
       await centerHit(page,act(page,'evidence-proposal'),'step 5 compact guide leaves adjacent promoter action center reachable');
       await page.screenshot({path:join(out,'guide-step5-compact-390.png')});
       await act(page,'evidence-proposal').click();
       await page.locator('#main .sheet-paper').waitFor({state:'visible'});
       assert.match(await page.locator('#main .sheet-paper').innerText(),/Frankfurt am Main/);
       await act(page,'back').click();await page.locator('.decision-evidence').waitFor({state:'visible'});
       await page.getByRole('button',{name:'Expand guided tour',exact:true}).click();
      }
    }
    if(step===6){
      if(width===390)await centerHit(page,act(page,'ai-replay'),'step 6 expanded guide leaves Replay center reachable');
      await act(page,'ai-replay').click();
      if(width===390){
       await centerHit(page,page.locator('[data-action=ai-accept]').first(),'step 6 expanded guide leaves Accept center reachable');
       await page.screenshot({path:join(out,'guide-step6-expanded-390.png')});
      }
      await page.locator('[data-action=ai-accept]').first().click();
    }
    await page.getByRole('button',{name:step===6?'Finish tour':'Next',exact:true}).click();
  }
  assert.equal(await page.locator('.guided-tour-layer:visible').count(),0);
  await act(page,'open-evidence').click();const after=JSON.parse((await downloaded(page,'audit')).bytes);assert.deepEqual(after.decisionAudit,before.decisionAudit);assert.deepEqual(after.accepted,before.accepted);
  await page.evaluate(()=>{location.hash='rescue';});await act(page,'start-guide').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.guided-tour-layer:visible').count(),0);
  await page.evaluate(()=>{location.hash='documents';});await page.locator('#knowledge-title').fill('Our technical rider');await page.locator('#knowledge-text').fill('We need a piano. Prefer daylight driving.');await act(page,'knowledge-save').click();
  await page.reload();await page.locator('.tour-knowledge article').filter({hasText:'Our technical rider'}).waitFor();await page.locator('.tour-knowledge article').filter({hasText:'Our technical rider'}).locator('[data-action=knowledge-edit]').click();await page.locator('#knowledge-text').fill('Updated: acoustic piano only.');await act(page,'knowledge-save').click();assert.match(await page.locator('.tour-knowledge').innerText(),/Updated: acoustic piano only/);
  await page.locator('.tour-knowledge article').filter({hasText:'Our technical rider'}).locator('[data-action=knowledge-delete]').click();assert.equal(await page.locator('.tour-knowledge article').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  checks.push({width,evidence:'passed',png:'passed',printPdf:'generated',sixStepGuide:'passed',escapeAndRestore:'passed',
   ...(width===390?{expandedRecheckCenterHit:'passed',expandedSourcesCenterClick:'passed',expandedSourcesReading:'passed',compactPromoterCenterClick:'passed',compactAboveFixedNav:'passed',
    expandedReplayAndAcceptCenterHit:'passed'}:{})});await context.close();
 }
 // Android native-prompt hook, close affordance and dismissal across reload.
 const android=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'});
 const mobile=await android.newPage();await mobile.goto(base+'/judges/');await mobile.locator('.pwa-install-dialog[open]').waitFor();
 assert.ok(await mobile.getByRole('button',{name:'Close installation prompt'}).evaluate(e=>e.getBoundingClientRect().height)>=48);
 await mobile.screenshot({path:join(out,'install-android.png')});await mobile.getByRole('button',{name:'Close installation prompt'}).click();await mobile.reload();await mobile.waitForTimeout(1800);assert.equal(await mobile.locator('.pwa-install-dialog[open]').count(),0);
 await mobile.evaluate(()=>{window.promptCount=0;const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.promptCount++;};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e);});
 await mobile.locator('[data-install-app]').first().click();await mobile.locator('.pwa-install-primary').click();assert.equal(await mobile.evaluate(()=>window.promptCount),1);assert.equal(await mobile.locator('.pwa-install-dialog[open]').count(),0);
 await android.close();
 const standalone=await browser.newContext();await standalone.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=q=>q==='(display-mode: standalone)'?{...original(q),matches:true}:original(q);});
 const installed=await standalone.newPage();await installed.goto(base+'/app/#rescue');assert.equal(await installed.locator('[data-install-app]').first().innerText(),'App installed');await installed.evaluate(()=>{location.hash='evidence';});await installed.evaluate(()=>{location.hash='rescue';});assert.equal(await installed.locator('[data-install-app]').first().innerText(),'App installed');await standalone.close();
 const safari=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 const ios=await safari.newPage();await ios.goto(base+'/judges/');await ios.locator('.pwa-install-dialog[open]').waitFor();await ios.locator('.pwa-install-primary').click();assert.match(await ios.locator('.pwa-install-help').innerText(),/Share[\s\S]*Add to Home Screen/);await ios.screenshot({path:join(out,'install-ios-guidance.png')});await safari.close();
 const offline=await browser.newContext();const op=await offline.newPage();await op.goto(base+'/app/#rescue');await op.evaluate(()=>navigator.serviceWorker.ready);await op.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await op.evaluate(()=>localStorage.setItem('tour-rescue.band-profile.v1','Personal test profile, preserved across reload'));
 const keys=await op.evaluate(async()=>{const all=[];for(const k of await caches.keys())for(const r of await(await caches.open(k)).keys())all.push(new URL(r.url).pathname);return all;});
 assert.ok(keys.includes('/app.js'));assert.ok(keys.every(k=>!k.startsWith('/api/')));
 await offline.setOffline(true);await op.reload();await op.locator('.option-row').first().waitFor();await op.evaluate(()=>{location.hash='live-preset';});assert.match(await op.locator('.live-notice').innerText(),/Offline/);assert.equal(await act(op,'run-live-preset').isDisabled(),true);
 assert.equal(await op.evaluate(()=>localStorage.getItem('tour-rescue.band-profile.v1')),'Personal test profile, preserved across reload');
 await offline.setOffline(false);
 if(!process.env.BASE_URL){
  const swPath='web/dist/app/sw.js',original=await readFile(swPath,'utf8');
  try{
   await writeFile(swPath,original.replace(/tour-rescue-shell-([a-f0-9]+)/,'tour-rescue-shell-qa-update-$1'));
   await op.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await r.update();await new Promise((resolve,reject)=>{if(r.waiting)return resolve();const end=setTimeout(()=>reject(new Error('No waiting service worker')),15000);const tick=setInterval(()=>{if(r.waiting){clearInterval(tick);clearTimeout(end);resolve();}},100);});});
   await op.close();const next=await offline.newPage();await next.goto(base+'/app/#rescue');await next.waitForFunction(async()=>!(await caches.keys()).some(k=>k.startsWith('tour-rescue-shell-')&&!k.includes('qa-update')));
   assert.equal(await next.evaluate(()=>localStorage.getItem('tour-rescue.band-profile.v1')),'Personal test profile, preserved across reload');
  }finally{await writeFile(swPath,original);}
 }
 await offline.close();
 checks.push({androidPromptHook:'passed (simulated native event)',standaloneLabels:'passed',ios:'guidance verified; physical OS install not tested',offlineRescue:'passed',apiCacheExclusion:'passed',serviceWorkerUpdate:'local update preserves profile'});
 await writeFile(join(out,'report.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
}finally{await browser?.close();server?.kill();}
