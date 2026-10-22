/** Browser plugin not available: Playwright checks the deployed web2 build; providers blocked. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const base=process.env.BASE_URL??'http://127.0.0.1:4193';
const server=process.env.BASE_URL?null:spawn(process.execPath,['web2/serve.mjs','--deploy'],{env:{...process.env,PORT:'4193'},stdio:'ignore'});
const out=process.env.QA_OUTPUT??join(tmpdir(),'tour-rescue-judge-workflow');
let browser;const rows=[];
const action=(page,id)=>page.locator('[data-action="'+id+'"]:visible').first();
async function download(page,id){
 const pending=page.waitForEvent('download');await action(page,id).click();
 const file=await pending;return JSON.parse(await readFile(await file.path(),'utf8'));
}
try{
 for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 await mkdir(out,{recursive:true});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  const external=[],errors=[];
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():(external.push(r.request().url()),r.abort()));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/judges/');await page.getByRole('link',{name:'Try 350 → 354.1 km →',exact:true}).click();
  assert.equal(await page.locator('[data-recommendation=before]').innerText(),'Nuremberg');
  await page.locator('.sim-edit summary').click();await page.locator('#sim-cap').fill('354.1');await action(page,'sim-recheck').click();
  assert.equal(await page.locator('[data-recommendation=after]').innerText(),'Frankfurt am Main');
  assert.match(await page.locator('.sim-reviewed-option').innerText(),/Manually viewed alternative/);
  const whatIf=await download(page,'sim-audit');
  assert.equal(whatIf.replay.policy.maxAdditionalDistanceMetres,354100);
  assert.equal(whatIf.analysis.decision.recommendation.optionId,'detour-frankfurt');
  assert.equal(whatIf.replay.scenario.tour.shows.filter(s=>s.status==='confirmed').length,4);
  await page.screenshot({path:out+'/breakpoint-'+width+'.png',fullPage:true});
  await action(page,'sim-follow-recommendation').click();
  assert.match(await page.locator('.sim-itinerary h2').innerText(),/Frankfurt am Main/);
  await action(page,'sim-proposal').click();
  assert.match(await page.locator('#main .sheet-paper').innerText(),/Frankfurt am Main/);
  const exportedProposal=await download(page,'audit');assert.equal(exportedProposal.replay.policy.maxAdditionalDistanceMetres,354100);

  await page.goto(base+'/app/#ai');await action(page,'ai-replay').click();
  const first=page.locator('[data-action=ai-accept]').first();await first.click();
  assert.equal(await page.locator('.option-row').count(),3);
  assert.match(await page.locator('[data-id=detour-frankfurt]').innerText(),/Frankfurt/);
  await action(page,'review').click();await action(page,'toggle-evidence').click();
  assert.equal(await page.locator('.research-sources').count(),1);
  const accepted=await download(page,'audit');
  assert.equal(accepted.schemaVersion,'tour-rescue.ai-audit.v1');assert.equal(accepted.accepted.length,1);
  assert.ok(accepted.accepted[0].sourceIds.length>0);assert.ok(accepted.session.sources.length>0);
  assert.equal(accepted.decisionAudit.replay.scenario.tour.shows.filter(s=>s.status==='confirmed').length,4);
  await action(page,'prepare').click();assert.equal(await page.locator('#main .sheet-paper').count(),1);

  await page.goto(base+'/app/#ai');await page.locator('[data-action=ai-demo-scenario][data-id=evidence-gaps]').click();
  await action(page,'ai-replay').click();await page.locator('[data-action=ai-accept]').first().click();
  assert.equal(await page.locator('.option-row').count(),3);
  await action(page,'review').click();await action(page,'toggle-evidence').click();
  const gaps=await download(page,'audit');
  const venue=gaps.decisionAudit.replay.scenario.venues.find(v=>v.name==='Example Nuremberg room - unverified');
  assert.equal(venue.availability.status,'unknown');assert.equal(venue.fee.status,'unknown');assert.equal(venue.promoterTerms.status,'unknown');
  await page.screenshot({path:out+'/accepted-evidence-'+width+'.png',fullPage:true});
  assert.match(await page.title(),/Tour Rescue/);assert.ok((await page.locator('#main').innerText()).length>100);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  rows.push({width,breakpoint:'passed',acceptedAiWithSources:'passed',unknownBookingFacts:'passed',console:'passed'});await context.close();
 }
 await writeFile(out+'/report.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
}finally{await browser?.close();server?.kill();}
