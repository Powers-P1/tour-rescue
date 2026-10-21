import './marketing.css';
import { publicSiteModel } from './marketing-model.ts';
import { landingMarkup } from './marketing.ts';
/** Preserve older root app hash links without claiming an old tour UI exists. */
const legacyHashes=new Set(['route','options','breakpoint','evidence','audit','promoter','ai','fan']);
const current=window.location.hash.slice(1);
if(legacyHashes.has(current)){
  window.location.replace('/app/#'+(current==='fan'?'fan':'rescue'));
}else{
  const root=document.getElementById('site-root');
  if(root){
    try{root.innerHTML=landingMarkup(publicSiteModel());}
    catch{
      root.innerHTML='<main class="site-shell"><h1>Tour Rescue</h1><p>The saved preview could not load.</p>'+
        '<p><a href="/app/">Open the rescue workspace</a> · <a href="/judges/">Judges, start here</a></p></main>';
    }
  }
}
