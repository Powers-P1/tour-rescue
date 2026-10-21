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
