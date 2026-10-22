// Browser plugin unavailable; repeatable Playwright regression checks, no provider calls.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL??'http://127.0.0.1:4191';
const server=process.env.BASE_URL?null:spawn(process.execPath,['web2/serve.mjs','--deploy'],{env:{...process.env,PORT:'4191'},stdio:'ignore'});
const out=process.env.QA_OUTPUT??'artifacts/screenshots/production-fixes';await mkdir(out,{recursive:true});
let browser;const rows=[];
try{
 for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 for(const width of [375,768,980,1099,1100,1280,1440]){
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  for(const path of width>=980?['/app/','/']:['/']){
   await page.goto(base+path);await page.locator('.map-reference-details').first().waitFor({state:'attached'});
   const details=page.locator('.map-reference-details').first();
   assert.equal(await details.evaluate(d=>d.open),width<1100,path+' map key at '+width);
   if(await details.isVisible()){
    if(width<1100)assert.equal(await details.locator('.geo-key-item:visible').count(),11);
    assert.ok(await details.locator('summary').evaluate(e=>e.getBoundingClientRect().height)>=48);
   }
  }
  await page.setViewportSize({width:width<1100?1200:980,height:900});
  await page.waitForFunction(()=>document.querySelector('.map-reference-details')?.open===(innerWidth<1100));
  assert.equal(await page.locator('.map-reference-details').first().evaluate(d=>d.open),width>=1100,'resize updates map key');
  await page.setViewportSize({width,height:900});
  await page.goto(base+'/judges/');
  for(const details of await page.locator('details:visible').all())if(!await details.evaluate(d=>d.open))await details.locator('summary').click();
  const small=await page.evaluate(()=>[...document.querySelectorAll('#judges-root *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden'&&parseFloat(getComputedStyle(e).fontSize)<14).map(e=>({text:e.textContent.slice(0,100),font:getComputedStyle(e).fontSize,cls:e.className})));
  assert.deepEqual(small,[],'judge text below 14px at '+width+': '+JSON.stringify(small));
  const svgLabels=await page.locator('.judge-map-preview .geo-direct-label text:visible').evaluateAll(es=>es.map(e=>parseFloat(getComputedStyle(e).fontSize)*Math.hypot(e.getScreenCTM().a,e.getScreenCTM().b)));
  assert.ok(svgLabels.every(size=>size>=14),'Scaled jury labels below14px: '+JSON.stringify(svgLabels));
  for(const summary of await page.locator('summary:visible').all())assert.ok(await summary.evaluate(e=>e.getBoundingClientRect().height)>=48);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow');
  await page.screenshot({path:out+'/judges-'+width+'.png',fullPage:true});
  await page.goto(base+'/app/#sos');
  await page.locator('#sos-problem').fill('Replace the broken kick drum head.');
  await page.locator('#sos-location').fill('Test venue, Ho Chi Minh City');
  await page.locator('#sos-budget').fill('2100000');
  const action=name=>page.locator('[data-action="'+name+'"]:visible').first();
  await action('sos-find').click();
  await page.locator('[data-action=sos-select][data-id=saigon-stage-supply]').click();
  await action('sos-quote').click();await action('sos-approve').click();
  for(const stage of ['sos-quote','sos-options','sos']){
   await page.goBack();await page.waitForURL('**/#'+stage);
   if(stage==='sos')assert.equal(await page.locator('#sos-location').inputValue(),'Test venue, Ho Chi Minh City');
   else assert.ok(await page.locator('main').innerText().then(t=>t.includes('Saigon Stage Supply')));
   assert.equal(await page.evaluate(()=>history.state.sos.stage),stage==='sos'?'problem':stage.slice(4));
  }
  for(const stage of ['sos-options','sos-quote','sos-approved']){
   await page.goForward();await page.waitForURL('**/#'+stage);
   assert.equal(await page.evaluate(()=>history.state.sos.stage),stage==='sos-approved'?'preview-approved':stage.slice(4));
  }
  await page.screenshot({path:out+'/sos-'+width+'.png',fullPage:true});
  rows.push({width,mapDefault:'passed',judgeLabels:'passed',summaryTargets:'passed',sosHistory:'passed'});
  await page.close();
 }
 await writeFile(out+'/report.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
}finally{await browser?.close();server?.kill();}
