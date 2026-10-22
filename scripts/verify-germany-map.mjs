/** Chromium-only, offline/CSP map geometry regression for PR Germany outline.
 * Tests two real 1280/390 breakpoints and guards the absence of SVG labels
 * shrinking to unreadable physical pixels.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port=4187,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['web2/serve.mjs','--deploy'],{
 env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']
});
let out='';
server.stdout.on('data',chunk=>out+=String(chunk));
server.stderr.on('data',chunk=>out+=String(chunk));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){
 for(let tries=0;tries<60;tries++){
  if(server.exitCode!==null)throw new Error('Map preview unavailable: '+out);
  try{if((await fetch(base+'/',{signal:AbortSignal.timeout(500)})).status===200)return;}
  catch{/** Preview starts asynchronously. */}
  await pause(150);
 }
 throw new Error('Map preview startup timed out: '+out);
}
let browser,assertions=0;
function ok(value,message,extra){
 if(!value)throw new Error(message+(extra===undefined?'':': '+JSON.stringify(extra)));
 assertions++;
}
async function open(path,width){
 const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',err=>errors.push('pageerror: '+err.message));
 page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text());});
 const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
 ok(response?.status()===200,'Unexpected HTTP '+path,response?.status());
 await page.locator('h1').first().waitFor({state:'visible',timeout:12000});
 await page.evaluate(async()=>document.fonts?.ready);
 ok(!errors.length,'CSP/browser errors '+path+'/'+width,errors);
 return page;
}
async function evaluateMap(page,context,width){
 const locator=page.locator('[data-map-scope="'+context+'"]');
 ok(await locator.count()===1,'Map not present: '+context+'/'+width);
 const result=await locator.evaluate(element=>{
  const visible=e=>e.getClientRects().length>0;
  const svg=element.querySelector('svg');
  const country=element.querySelector('.geo-country-outline');
  const allPins=[...element.querySelectorAll('.geo-city[data-city-id]')];
  const names=[...element.querySelectorAll('.geo-city-key .geo-key-item')];
  const bounds=country?.getBBox();
  const overlapping=[];
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
    const a=names[i].getBoundingClientRect(),b=names[j].getBoundingClientRect();
    const horiz=Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const vert=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if(horiz>2&&vert>2)overlapping.push([i,j,horiz,vert]);
  }
  const entries=names.map(n=>({text:n.textContent?.trim(),
    font:parseFloat(getComputedStyle(n.querySelector('span')??n).fontSize),
    visible:visible(n)}));
  const paths=[...element.querySelectorAll('[data-route-candidate]')];
  return {
    outlineLength:country?.getAttribute('d')?.length??0,
    bbox:bounds?{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}:null,
    pinIds:allPins.map(x=>x.getAttribute('data-city-id')),
    current:Boolean(element.querySelector('.geo-route-current')),
    options:paths.map(x=>x.getAttribute('data-route-candidate')),
    cancelled:element.querySelector('.geo-city-cancelled')?.getAttribute('data-city-id'),
    canceledCross:Boolean(element.querySelector('.geo-cancel-cross')),
    entries,overlapping,
    mapSVG:svg?.getAttribute('viewBox'),
    overflow:document.documentElement.scrollWidth-window.innerWidth,
  };
 });
 ok(result.outlineLength>4000&&result.bbox?.width>270&&result.bbox?.height>360,
   'Not a recognizable, detailed German outline '+context+'/'+width,result);
 ok(result.pinIds.length===26,'Missing city anchors '+context+'/'+width,result.pinIds);
 for(const id of ['de-hamburg','de-berlin','de-leipzig','de-dresden',
   'de-erfurt','de-halle','de-nuremberg','de-frankfurt','de-munich','de-cologne','de-dortmund'])
  ok(result.pinIds.includes(id),'Missing city '+id+' '+context+'/'+width);
 ok(result.current&&result.options.length===2&&
   result.options.includes('de-nuremberg')&&result.options.includes('de-frankfurt'),
   'Real-coordinate routes missing '+context+'/'+width,result.options);
 ok(result.cancelled==='de-leipzig'&&result.canceledCross,
   'Leipzig cancel marker missing '+context+'/'+width,result);
 ok(result.entries.length===11&&result.entries.every(row=>row.visible&&row.font>=14),
   'Map city labels unreadable '+context+'/'+width,result.entries);
 ok(!result.overlapping.length,'City HTML key labels overlap '+context+'/'+width,result.overlapping);
 ok(result.overflow<=2,'Horizontal overflow '+context+'/'+width,result.overflow);
 return result;
}
try{
 await ready();
 browser=await chromium.launch({headless:true});
 for(const width of [1280,390]){
  const page=await open('/',width);
  await evaluateMap(page,'landing',width);
  const caption=await page.locator('.diagram-caption').first().textContent();
  ok(caption?.trim()==='Nuremberg is a candidate, not a booked venue. Road checks use a separate OSRM snapshot.',
     'Honest caption altered '+width,caption);
  await page.close();
 }
 {
  const page=await open('/app/',1280);
  await evaluateMap(page,'command',1280);
  await page.close();
 }
 for(const width of [1280,390]){
  const page=await open('/app/#audience',width);
  const result=await page.evaluate(()=>{
    const map=document.querySelector('.taste-map');
    const path=map?.querySelector('.geo-country-outline');
    const keys=[...document.querySelectorAll('.taste-map-key,.taste-mobile-key span,.taste-geographic-key span')]
      .filter(node=>node.getClientRects().length>0);
    const bbox=path?.getBBox();
    return {outline:path?.getAttribute('d')?.length??0,
      bbox:bbox?{w:bbox.width,h:bbox.height}:null,
      visibleCityLabels:keys.map(el=>({name:el.textContent?.trim(),font:parseFloat(getComputedStyle(el).fontSize)})),
      allDots:map?.querySelectorAll('circle').length??0,
      overflow:document.documentElement.scrollWidth-innerWidth,
    };
  });
  ok(result.outline>4000&&result.bbox?.w>270&&result.visibleCityLabels.every(x=>x.font>=14)
    &&result.allDots>=26&&result.overflow<=2,
    'Audience map boundary or labels invalid '+width,result);
  await page.close();
 }
 console.log('Germany outline Playwright PASS: '+assertions+' assertions at 1280/390 px; offline inline SVG and 26 real city positions.');
}finally{
 await browser?.close();
 server.kill('SIGTERM');
}
