import './pwa.css';
interface InstallPrompt extends Event {
 prompt():Promise<void>;
 readonly userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
const DISMISSED='tour-rescue:install-dismissed:v1';
let initialized=false;
/** Native installation requires a user gesture; Safari gets honest system-menu guidance. */
export function initPwa():void {
 if(initialized)return;initialized=true;
 let deferred:InstallPrompt|null=null;
 let installed=matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const mobile=ios||/Android|Mobile/.test(navigator.userAgent);
 let autoShown=false,returnFocus:HTMLElement|null=null;
 const dismissed=()=>{try{return localStorage.getItem(DISMISSED)==='1';}catch{return false;}};
 const dialog=document.createElement('dialog');dialog.className='pwa-install-dialog';
 dialog.setAttribute('aria-labelledby','pwa-install-title');dialog.setAttribute('aria-describedby','pwa-install-description');
 dialog.innerHTML='<button type="button" class="pwa-install-close" aria-label="Close installation prompt">×</button>'+
   '<img src="/assets/pwa-192.png" width="56" height="56" alt="">'+
   '<p class="pwa-install-eyebrow">YOUR MOBILE TOUR DESK</p><h2 id="pwa-install-title">Keep Tour Rescue one tap away.</h2>'+
   '<p id="pwa-install-description">Add it to your home screen. The sample rescue works offline; live research needs a connection.</p>'+
   '<ol class="pwa-install-help" hidden></ol><p class="pwa-install-status" role="status"></p>'+
   '<button type="button" class="pwa-install-primary">Install Tour Rescue</button>';
 document.body.append(dialog);
 const primary=dialog.querySelector<HTMLButtonElement>('.pwa-install-primary')!;
 const help=dialog.querySelector<HTMLOListElement>('.pwa-install-help')!;
 const status=dialog.querySelector<HTMLElement>('.pwa-install-status')!;
 function refreshInstalled(){if(installed)document.querySelectorAll<HTMLElement>('[data-install-app]').forEach(button=>{if(button.textContent!=='App installed')button.textContent='App installed';});}
 function close(){try{localStorage.setItem(DISMISSED,'1');}catch{}dialog.close();returnFocus?.focus({preventScroll:true});}
 function guidance(){
   help.innerHTML=ios?'<li>Open this page in Safari and tap <strong>Share</strong>.</li><li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>':
     '<li>Open your browser menu.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong> and confirm.</li>';
   help.hidden=false;primary.textContent='Got it';primary.dataset.help='true';
   status.textContent=ios?'Safari uses its Share menu to install apps.':'If the install option is unavailable, open this page in Chrome, Edge or Safari.';
 }
 function open(){
   if(installed||dialog.open)return;
   returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
   help.hidden=true;status.textContent='';delete primary.dataset.help;primary.textContent='Install Tour Rescue';
   dialog.showModal();primary.focus();
 }
 async function install(){
   if(primary.dataset.help){close();return;}
   if(!deferred){guidance();return;}
   const prompt=deferred;deferred=null;primary.disabled=true;
   try{await prompt.prompt();await prompt.userChoice;close();}
   catch{status.textContent='The browser could not open installation. Use its menu instead.';guidance();}
   finally{primary.disabled=false;}
 }
 dialog.querySelector('.pwa-install-close')!.addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 primary.addEventListener('click',()=>{void install();});
 document.addEventListener('click',event=>{
   const target=event.target instanceof Element?event.target.closest<HTMLElement>('[data-install-app]'):null;
   if(target){event.preventDefault();if(!installed)open();else target.textContent='App installed';}
 });
 function maybeOpen(){
   if(!mobile||autoShown||installed||dismissed()||document.querySelector('.guided-tour-layer:not([hidden])'))return;
   autoShown=true;open();
 }
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event as InstallPrompt;maybeOpen();});
 window.addEventListener('appinstalled',()=>{installed=true;deferred=null;if(dialog.open)close();document.querySelectorAll<HTMLElement>('[data-install-app]').forEach(button=>button.textContent='App installed');});
 window.addEventListener('tour-rescue:screen-rendered',refreshInstalled);refreshInstalled();
 if('serviceWorker' in navigator && (location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))){
   void navigator.serviceWorker.register('/app/sw.js',{scope:'/app/',updateViaCache:'none'}).catch(()=>{ /* Normal online app still works; never claim offline readiness. */ });
 }
 window.setTimeout(maybeOpen,1500);
}
