/** Offline state/workflow QA. Browser plugin not available; repeatable Playwright fallback.
 * Provider traffic is blocked. No paid API calls, messages, dispatch or publication.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const port=4189, base='http://127.0.0.1:'+port;
const out=process.env.QA_OUTPUT ?? 'artifacts/screenshots/v2/completion';
const server=spawn(process.execPath,['web2/serve.mjs','--deploy'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let serverLog='',browser;
server.stdout.on('data',data=>serverLog+=data);
server.stderr.on('data',data=>serverLog+=data);
const rows=[],workflows=[];
const act=(page,id)=>page.locator('[data-action="'+id+'"]:visible').first();
const click=id=>async page=>{await act(page,id).click();};
const fill=(id,value)=>async page=>{await page.locator('#'+id).fill(value);};
const expand=selector=>async page=>{await page.locator(selector+' summary').click();};

const cases=[
 ['today','/app/',[]],['route','/app/#route',[]],['crew','/app/#crew',[]],
 ['options','/app/#rescue',[]],['detail','/app/#rescue',[click('review')]],
 ['detail-evidence','/app/#rescue',[click('review'),click('toggle-evidence')]],
 ['failed-direction','/app/#rescue',[async p=>{await p.locator('[data-action="select-option"][data-id="detour-frankfurt"]').click();},click('review')]],
 ['day-off','/app/#rescue',[async p=>{await p.locator('[data-action="select-option"][data-id="day-off"]').click();},click('review')]],
 ['promoter','/app/#rescue',[click('review'),click('prepare')]],
 ['promoter-message','/app/#rescue',[click('review'),click('prepare'),click('review-message')]],
 ['live-setup','/app/#rescue',[click('open-live')]],
 ['live-failure','/app/#rescue',[async p=>{await p.route('**/api/live/search**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Unavailable"}'}));},click('open-live'),fill('live-query','Radiohead'),async p=>{await p.locator('#live-search button').click();await p.getByText(/Failed - previous decision kept/).waitFor();}]],
 ['sos-problem','/app/#sos',[]],['sos-options','/app/#sos',[click('sos-find')]],
 ['sos-quote','/app/#sos',[click('sos-find'),click('sos-quote')]],
 ['sos-over-budget','/app/#sos',[fill('sos-budget','1000000'),click('sos-find'),click('sos-quote')]],
 ['sos-approved','/app/#sos',[click('sos-find'),click('sos-quote'),click('sos-approve')]],
 ['sos-invalid','/app/#sos',[fill('sos-location',''),click('sos-find')]],
 ['planner','/app/#plan',[]],['planner-draft','/app/#plan',[click('plan-build')]],
 ['planner-invalid','/app/#plan',[fill('plan-brief',''),click('plan-build')]],
 ['profile','/app/#plan',[click('concept-profile')]],
 ['economics','/app/#economics',[]],['economics-inputs','/app/#economics',[click('econ-toggle')]],
 ['economics-invalid','/app/#economics',[click('econ-toggle'),fill('econ-min','200'),fill('econ-max','100'),click('econ-apply')]],
 ['economics-terms','/app/#economics',[click('econ-terms')]],
 ['fan','/app/#fan',[]],['fan-preview','/app/#fan',[click('fan-preview')]],
 ['ai-ready','/app/#ai',[]],['ai-results','/app/#ai',[click('ai-replay')]],
 ['ai-unavailable','/app/#ai',[click('ai-mode-live')]],
 ['audience','/app/#audience',[]],['audience-fans','/app/#audience',[click('audience-fans')]],
 ['audience-evidence','/app/#audience',[click('audience-evidence')]],
 ['simulation','/app/#simulation',[]],['simulation-budget','/app/#simulation',[click('sim-budget-tab')]],
 ['simulation-edit','/app/#simulation',[expand('.sim-edit')]],
 ['simulation-failed','/app/#simulation',[expand('.sim-edit'),fill('sim-cap','0'),click('sim-recheck')]],
 ['simulation-invalid','/app/#simulation',[expand('.sim-edit'),fill('sim-cap','-1'),click('sim-recheck')]],
 ['simulation-saved','/app/#simulation',[click('sim-save')]],
 ['agency','/app/#agency',[]],['agency-all','/app/#agency',[click('agency-all')]],
 ['agency-assignment','/app/#agency',[click('agency-assign')]],
 ['team','/app/#team',[]],['documents-empty','/app/#documents',[]],
 ['documents-draft','/app/#rescue',[click('review'),click('prepare'),async p=>{await p.goto(base+'/app/#documents');}]],
 ['presale','/app/#presale',[]],['landing','/',[]],['judges','/judges/',[]],['404','/404.html',[]],
 ['map-key','/app/',[async p=>{
   if(p.viewportSize().width<980){await act(p,'tab-route').click();await act(p,'concept-audience').click();await p.locator('.taste-map-wrap .map-reference-details summary').click();}
   else await p.locator('.route-map .map-reference-details summary').click();
 }]],
 ['landing-map-key','/',[expand('.journey-diagram .map-reference-details')]],
 ['audience-map-source','/app/#audience',[expand('.taste-map-wrap .map-reference-details')]],
 ['judges-scope','/judges/',[async p=>{await p.locator('.judge-optional summary').first().click();}]],
 ['judges-challenge','/judges/',[async p=>{await p.getByRole('link',{name:'Try 350 → 354.1 km →',exact:true}).click();}]],
];
async function open(path,viewport) {
 const context=await browser.newContext({viewport,deviceScaleFactor:1});
 const external=[];
 await context.route('**/*',route=>{
  if(new URL(route.request().url()).origin===base)return route.continue();
  external.push(route.request().url());return route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('503 (Service Unavailable)'))errors.push(m.text());});
 assert.equal((await page.goto(base+path,{waitUntil:'domcontentloaded'}))?.status(),200);
 await page.locator('h1').first().waitFor({state:'visible'});
 return {context,page,errors,external};
}
async function health(page,errors,external) {
 await page.evaluate(()=>document.fonts.ready);
 // Actions rebuild the DOM; an eager local image can still be loading even
 // when the previous copy was ready. Wait for completion, then reject errors.
 await page.waitForFunction(()=>[...document.images]
  .filter(img=>img.loading!=='lazy'&&!img.closest('details:not([open])'))
  .every(img=>img.complete),null,{timeout:10000});
 assert.match(await page.title(),/Tour Rescue/);
 const layout=await page.evaluate(()=>{
  const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);
  return {overflow:document.documentElement.scrollWidth-innerWidth,duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i),font:document.fonts.check('400 16px Inter'),heading:document.querySelector('h1')?.textContent,broken:[...document.images].filter(i=>i.loading!=='lazy'&&(!i.complete||!i.naturalWidth)).map(i=>i.src)};
 });
 assert.ok(layout.overflow<=2,JSON.stringify(layout));assert.deepEqual(layout.duplicates,[]);
 assert.ok(layout.font&&layout.heading?.trim(),JSON.stringify(layout));assert.deepEqual(layout.broken,[]);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 return layout;
}
try {
 for(let i=0;i<60;i++){try{if((await fetch(base)).status===200)break;}catch{}if(server.exitCode!==null)throw Error(serverLog);await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 await mkdir(out,{recursive:true});
 for(const [width,height] of [[390,844],[1280,800],[1536,1024]]) {
  for(const [name,path,steps] of cases) {
   const {context,page,errors,external}=await open(path,{width,height});
   try {
    for(const step of steps)await step(page);
    // Inspect actual resulting scroll first; then collect a comparable entry screenshot.
    if(['detail','sos-options','promoter','planner-draft'].includes(name))assert.ok(await page.evaluate(()=>scrollY)<5,'New screen did not reset scroll: '+name);
    if(name==='sos-over-budget')assert.equal(await act(page,'sos-approve').isEnabled(),false);
    if(name==='failed-direction')assert.equal(await act(page,'prepare').count(),0);
    if(name==='day-off')assert.equal(await act(page,'prepare').count(),0);
    if(name==='sos-approved')assert.match(await page.locator('#main').innerText(),/Not ordered/);
    if(name==='simulation-invalid')assert.match(await page.locator('[role="alert"]').innerText(),/Invalid distance/);
    if(name==='economics-invalid')assert.match(await page.locator('[role="alert"]').innerText(),/whole numbers/);
    if(name==='ai-unavailable')assert.equal(await act(page,'ai-run-live').isEnabled(),false);
    if(name==='fan-preview')assert.match(await page.locator('#main').innerText(),/interest was not recorded/);
    const layout=await health(page,errors,external);
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:join(out,name+'-'+width+'.png'),fullPage:false,animations:'disabled'});
    await page.screenshot({path:join(out,name+'-'+width+'-full.png'),fullPage:true,animations:'disabled'});
    rows.push({state:name,viewport:width+'x'+height,heading:layout.heading,consoleErrors:0,externalRequests:0});
   } catch(e) {throw new Error(name+'/'+width+': '+e.message,{cause:e});}
   finally{await context.close();}
  }
  console.log('Verified '+cases.length+' states at '+width+'x'+height);
 }
 async function flow(name,run) {
  const opened=await open('/app/',{width:390,height:844});
  try{await run(opened.page);await health(opened.page,opened.errors,opened.external);workflows.push(name);console.log('PASS '+name);}
  finally{await opened.context.close();}
 }
 await flow('Rescue → proposal → browser Back retains the selected direction',async p=>{
  await act(p,'rescue').click();await act(p,'review').click();await act(p,'prepare').click();
  assert.equal(new URL(p.url()).hash,'#draft');
  await p.goBack();assert.match(await p.locator('h1').innerText(),/Nuremberg/);
  await p.goBack();assert.match(await p.locator('h1').innerText(),/Three ways/);
  await p.goForward();assert.match(await p.locator('h1').innerText(),/Nuremberg/);
  await p.goForward();await act(p,'back').click();assert.match(await p.locator('h1').innerText(),/Nuremberg/);
 });
 await flow('Planner text survives profile editing and is saved locally',async p=>{
  await act(p,'tab-route').click();await act(p,'open-plan').click();
  await p.locator('#plan-brief').fill('8 shows in Germany, no Mondays.');
  await act(p,'concept-profile').click();await p.locator('#band-profile').fill('Trio. No night drives.');
  await act(p,'profile-save').click();assert.equal(await p.locator('#plan-brief').inputValue(),'8 shows in Germany, no Mondays.');
  await p.reload();await act(p,'concept-profile').click();assert.equal(await p.locator('#band-profile').inputValue(),'Trio. No night drives.');
 });
 await flow('SOS inputs survive errors, option review and return',async p=>{
  await act(p,'sos').click();await p.locator('#sos-problem').fill('22-inch head, fitting by 16:00.');
  await p.locator('#sos-location').fill('');await act(p,'sos-find').click();
  assert.equal(await p.locator('#sos-problem').inputValue(),'22-inch head, fitting by 16:00.');
  await p.locator('#sos-location').fill('Ho Chi Minh City');await act(p,'sos-find').click();
  await act(p,'sos-quote').click();await act(p,'back').click();await act(p,'back').click();
  assert.equal(await p.locator('#sos-problem').inputValue(),'22-inch head, fitting by 16:00.');
  await act(p,'back').click();await act(p,'sos').click();assert.equal(await p.locator('#sos-problem').inputValue(),'22-inch head, fitting by 16:00.');
 });
 await flow('Economics recalculates user assumptions without a forecast',async p=>{
  await act(p,'tab-route').click();await act(p,'open-economics').click();await act(p,'econ-toggle').click();
  await p.locator('#econ-costs').fill('1400');await act(p,'econ-apply').click();
  assert.match(await p.locator('.economics-result').innerText(),/\+€280 to \+€1120/);
  assert.match(await p.locator('#main').innerText(),/100 tickets/);
 });
 await flow('Simulation saves only the local draft; failed alternative stays rejected',async p=>{
  await act(p,'tab-route').click();await act(p,'open-sim').click();
  await p.locator('.sim-edit summary').click();await p.locator('#sim-cap').fill('0');await act(p,'sim-recheck').click();
  assert.equal(await p.locator('.sim-edit').getAttribute('open'),'');assert.equal(await act(p,'sim-proposal').count(),0);
  await act(p,'sim-save').click();await p.reload();assert.match(await p.locator('.sim-distance-status').innerText(),/0 km/);
 });
 await flow('Documents recover the session draft and download valid audit JSON',async p=>{
  await act(p,'rescue').click();await act(p,'review').click();await act(p,'prepare').click();
  await p.goto(base+'/app/#documents');await act(p,'document-proposal').click();assert.match(await p.locator('#main').innerText(),/Not sent/i);
  const download=p.waitForEvent('download');await act(p,'audit').click();assert.match((await download).suggestedFilename(),/\.json$/);
  await act(p,'back').click();assert.match(await p.locator('h1').innerText(),/Your documents/);
 });
 await flow('Public fan preview has no private navigation or stored email',async p=>{
  await p.goto(base+'/app/#fan');await p.locator('#fan-email').fill('demo@example.test');await act(p,'fan-preview').click();
  assert.equal(await p.locator('.sidebar,.mobile-tabs,[data-action="sos"]').count(),0);
  assert.equal(await p.evaluate(()=>JSON.stringify({...localStorage}).includes('demo@example.test')),false);
 });
 // Extra narrow/tablet boundaries, including the desktop shell switch.
 for(const width of [320,375,768,980,1100])for(const path of ['/','/judges/','/app/','/app/#rescue','/app/#audience','/app/#simulation','/app/#agency']){
  const {context,page,errors,external}=await open(path,{width,height:844});try{await health(page,errors,external);}finally{await context.close();}
 }
 await writeFile(join(out,'manifest.json'),JSON.stringify({browser:'Chromium / Playwright; Browser plugin not available',capturedAt:new Date().toISOString(),states:rows,workflows,additionalResponsiveChecks:35},null,2));
 console.log('PASS: '+rows.length+' state checks, '+workflows.length+' workflows, 35 responsive checks.');
} finally {await browser?.close();server.kill('SIGTERM');}
