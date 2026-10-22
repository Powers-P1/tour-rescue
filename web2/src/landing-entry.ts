import './marketing.css';
import './germany-map.css';
import './marketing-completion.css';
import { publicSiteModel } from './marketing-model.ts';
import { landingMarkup } from './marketing.ts';
import { setMapKeyDefaults } from './map-disclosure.ts';
import { initPwa } from './pwa.ts';
/** Preserve older root app hash links without claiming an old tour UI exists. */
const legacyHashes=new Set(['route','options','breakpoint','evidence','audit','promoter','ai','fan']);
const current=window.location.hash.slice(1);
if(legacyHashes.has(current)){
  window.location.replace('/app/#'+(current==='fan'?'fan':'rescue'));
}else{
  const root=document.getElementById('site-root');
  if(root){
    try{root.className='product-site';root.innerHTML=landingMarkup(publicSiteModel());
    initPwa();
    setMapKeyDefaults(root);
    window.matchMedia('(max-width: 1099px)').addEventListener('change',()=>setMapKeyDefaults(root));
    // A blocked editorial photo must not hide the original local illustration.
    for(const photo of document.querySelectorAll<HTMLImageElement>('.hero-picture img, .sos-photo img')){
      const ready=()=>{if(photo.naturalWidth>0)photo.classList.add('photo-ready');};
      if(photo.complete)ready();else photo.addEventListener('load',ready,{once:true});
    }}
    catch{
      root.innerHTML='<main class="site-shell"><h1>Tour Rescue</h1><p>The saved preview could not load.</p>'+
        '<p><a href="/app/">Open the rescue workspace</a> · <a href="/judges/">Judges, start here</a></p></main>';
    }
  }
}
