/** Browser regression for v2 polish. No production calls or provider requests. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const port=4175;
const origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['web2/serve.mjs','--deploy'],{
  env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe'],
});
let output='';
server.stdout.on('data',chunk=>{output+=chunk.toString();});
server.stderr.on('data',chunk=>{output+=chunk.toString();});
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function ready(){
 for(let i=0;i<70;i++){
  if(server.exitCode!==null)throw new Error('Preview failed: '+output);
  try{
   if((await fetch(origin+'/',{signal:AbortSignal.timeout(500)})).status===200)return;
  }catch{/** Server warming up. */}
  await pause(180);
 }
 throw new Error('Static preview did not start: '+output);
}
let browser;
let assertions=0;
function check(ok,description,detail){
 if(!ok)throw new Error(description+(detail===undefined?'':': '+JSON.stringify(detail)));
 assertions++;
}
async function open(path,width=1280,height=844){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',err=>errors.push('JS: '+err.message));
 page.on('console',msg=>{if(msg.type()==='error')errors.push('Console: '+msg.text());});
 const res=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:30000});
 check(res?.status()===200,'Unexpected status '+path,res?.status());
 await page.locator('h1').first().waitFor({state:'visible',timeout:12000});
 // Reject console/CSP errors on the route as soon as it becomes interactive.
 check(errors.length===0,'Console/CSP failure '+path,errors);
 return page;
}
async function groups(page,label,expected){
 const report=await page.evaluate(()=>{
  const visible=e=>e.getClientRects().length>0;
  return [...document.querySelectorAll('[role="tablist"],[role="radiogroup"]')]
   .filter(visible).map(group=>{
    const kind=group.getAttribute('role');
    const selectors=kind==='tablist'?'[role="tab"]':'[role="radio"]';
    const children=[...group.querySelectorAll(selectors)].filter(visible);
    const selected=children.filter(node=>
      node.getAttribute(kind==='tablist'?'aria-selected':'aria-checked')==='true');
    const refs=children.map(node=>{
      const id=node.getAttribute('aria-controls');
      const target=id?document.getElementById(id):null;
      return {
        id,linked:Boolean(target),
        role:target?.getAttribute('role'),
        labelled:target?.getAttribute('aria-labelledby')===node.id,
      };
    });
    return {kind,count:children.length,selected:selected.length,
      tabStops:children.filter(node=>node.getAttribute('tabindex')==='0').length,
      refs};
   });
 });
 check(report.length===expected.length,label+' group count',report);
 for(let i=0;i<expected.length;i++){
  const part=report[i];
  check(part.kind===expected[i],label+' group kind',part);
  check(part.count>=2,label+' missing alternatives',part);
  check(part.selected===1&&part.tabStops===1,label+' roving index invalid',part);
  for(const ref of part.refs){
    check(ref.linked,label+' missing aria-controls target',ref);
    if(part.kind==='tablist')
      check(ref.role==='tabpanel'&&ref.labelled,label+' invalid tab->tabpanel label',ref);
  }
 }
}
async function focusMatchesSelected(page,role,label){
 const report=await page.evaluate(role=>{
  const selected=document.querySelector('[role="'+role+'"]['+
    (role==='tab'?'aria-selected':'aria-checked')+'="true"]');
  const active=document.activeElement;
  const target=selected?.getAttribute('aria-controls');
  return {selected: selected?.getAttribute('data-action'),active:active?.getAttribute('data-action'),
    selectedId:selected?.getAttribute('data-id'),activeId:active?.getAttribute('data-id'),
    inBody:active===document.body,ref:Boolean(target&&document.getElementById(target)),
    tabindex:selected?.getAttribute('tabindex')};
 },role);
 check(!report.inBody&&report.ref&&report.tabindex==='0'&&
    report.active===report.selected&&report.activeId===report.selectedId,
   label+' focus differs from chosen '+role,report);
}
try{
 await ready();
 browser=await chromium.launch({headless:true});
 // City-name labels at every desktop width where original SVG text shrunk.
 for(const width of [980,1024,1100,1279]){
  const page=await open('/app/#audience',width,800);
  const report=await page.evaluate(()=>{
    const key=document.getElementById('taste-map-key');
    const svg=document.querySelector('.taste-map-label');
    const map=document.querySelector('.taste-map');
    return {
      visible:Boolean(key?.getClientRects().length),
      names:[...key?.querySelectorAll('span')??[]].map(span=>({
        text:span.textContent?.trim(),font:parseFloat(getComputedStyle(span).fontSize),
        visible:Boolean(span.getClientRects().length)})),
      svgVisible:Boolean(svg?.getClientRects().length),
      svgKey:map?.getAttribute('aria-describedby'),
      overflow:document.documentElement.scrollWidth-innerWidth,
    };
  });
  check(report.visible&&!report.svgVisible&&report.svgKey==='taste-map-key'&&
    report.names.length>=5&&report.names.every(row=>row.visible&&row.font>=14)&&
    report.overflow<=2,'City labels at '+width+'px',report);
  await page.close();
 }
 // All tab lists: Left/Right arrows, Home/End, wrap, selected panel ARIA.
 for(const path of ['/app/#audience','/app/#simulation','/app/#agency']){
  const page=await open(path);
  const expected=path.includes('audience')?['tablist','radiogroup']:['tablist'];
  await groups(page,path,expected);
  await page.locator('[role="tab"][aria-selected="true"]').focus();
  const all=page.locator('[role="tab"]');
  await page.keyboard.press('End');
  check(await all.last().getAttribute('aria-selected')==='true',path+' End tab');
  await focusMatchesSelected(page,'tab',path+' End');
  await page.keyboard.press('Home');
  check(await all.first().getAttribute('aria-selected')==='true',path+' Home tab');
  await focusMatchesSelected(page,'tab',path+' Home');
  await page.keyboard.press('ArrowLeft');
  check(await all.last().getAttribute('aria-selected')==='true',path+' left wrap');
  await focusMatchesSelected(page,'tab',path+' ArrowLeft');
  await page.keyboard.press('ArrowRight');
  check(await all.first().getAttribute('aria-selected')==='true',path+' right wrap');
  await groups(page,path+' after arrows',expected);
  await page.close();
 }
 // All radio groups: Audience cities, Rescue options and example SOS suppliers.
 for(const config of [
  {path:'/app/#audience',action:null,ref:'audience-city-detail',kinds:['tablist','radiogroup']},
  {path:'/app/#rescue',action:null,ref:'rescue-choice-summary',kinds:['radiogroup']},
  {path:'/app/#sos',action:'sos-find',ref:'sos-choice-summary',kinds:['radiogroup']},
 ]){
  const page=await open(config.path,390,844);
  if(config.action)await page.locator('[data-action="'+config.action+'"]').click();
  await groups(page,config.path,config.kinds);
  await page.locator('[role="radio"][aria-checked="true"]').focus();
  for(const key of ['ArrowDown','End','Home','ArrowUp']){
    await page.keyboard.press(key);
    await focusMatchesSelected(page,'radio',config.path+' '+key);
    const chosen=page.locator('[role="radio"][aria-checked="true"]');
    check(await chosen.getAttribute('aria-controls')===config.ref,
       config.path+' radio controls after '+key);
  }
  await groups(page,config.path+' after radio arrows',config.kinds);
  if(config.action){
    const text=await page.locator('#sos-choice-summary').textContent();
    check(text?.includes('Saigon Stage Supply'), 'SOS selected-supplier summary',text);
  }
  await page.close();
 }
 // Mobile feature pages: no second Back; desktop has one different Back.
 for(const path of ['/app/#audience','/app/#simulation','/app/#agency']){
  for(const width of [320,390,768,979,980,1280]){
    const page=await open(path,width);
    const result=await page.evaluate(()=>{
      const visible=e=>e.getClientRects().length>0;
      return {
        backs:[...document.querySelectorAll('[data-action="feature-back"]')].filter(visible).length,
        mobileVisible:Boolean(document.querySelector('.feature-mobile-top [data-action="feature-back"]')?.getClientRects().length),
        overflow:document.documentElement.scrollWidth-innerWidth,
      };
    });
    check(result.backs===1&&result.mobileVisible===(width<980)&&result.overflow<=2,
       'Responsive Back '+path+' '+width,result);
    await page.close();
  }
 }
 // Hero caption never intersects the overlaid decorative phone mockup.
 for(const width of [320,390,768,1280,1536]){
  const page=await open('/',width);
  const r=await page.evaluate(()=>{
    const fig=document.querySelector('.hero-picture')?.getBoundingClientRect();
    const caption=document.querySelector('.hero-picture figcaption')?.getBoundingClientRect();
    const phone=document.querySelector('.phone-preview')?.getBoundingClientRect();
    if(!fig||!caption||!phone)return {present:false};
    const intersection=Math.max(0,Math.min(caption.right,phone.right)-Math.max(caption.left,phone.left))*
      Math.max(0,Math.min(caption.bottom,phone.bottom)-Math.max(caption.top,phone.top));
    return {present:true,inside:caption.left>=fig.left&&caption.right<=fig.right&&
      caption.top>=fig.top&&caption.bottom<=fig.bottom,intersection,
      text:document.querySelector('.hero-picture figcaption')?.textContent?.trim()};
  });
  check(r.present&&r.inside&&r.intersection===0&&r.text==='Backstage scene · illustrative',
    'Caption overlaps phone at '+width,r);
  await page.close();
 }
 // The Judges page includes the openly described technical and product limits.
 for(const width of [390,1280]){
  const page=await open('/judges/',width);
  const limits=page.locator('#known-limits');
  const text=await limits.textContent();
  check(await limits.isVisible()&&(await limits.locator('h3').count())===5&&
    text?.includes('Live Qloo has quotas')&&text?.includes('A proposal is not a confirmation'),
    'Judges Known limits at '+width);
  await page.close();
 }
 console.log('Polish browser checks passed; assertions: '+assertions);
}finally{
 await browser?.close();
 server.kill('SIGTERM');
}
