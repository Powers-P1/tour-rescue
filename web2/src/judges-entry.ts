import './marketing.css';
import './germany-map.css';
import './marketing-completion.css';
import { publicSiteModel } from './marketing-model.ts';
import { judgesMarkup } from './marketing.ts';
import { auditExport } from './audit-download.ts';
import { setMapKeyDefaults } from './map-disclosure.ts';
import { initPwa } from './pwa.ts';

const root=document.getElementById('judges-root');
if(root){
  try{
    const model=publicSiteModel();
    root.innerHTML=judgesMarkup(model);
    initPwa();
    setMapKeyDefaults(root);
    window.matchMedia('(max-width: 1099px)').addEventListener('change',()=>setMapKeyDefaults(root));
    root.querySelector<HTMLButtonElement>('#download-synthetic-audit')?.addEventListener('click',()=>{
      const exported=auditExport(model.original);
      const blob=new Blob([exported.content],{type:'application/json'});
      const href=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=href;
      link.download=exported.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(href),1000);
    });
  }catch{
    root.innerHTML='<main class="site-shell"><h1>Tour Rescue for judges</h1>'+
      '<p>Saved evidence preview unavailable. The demo and source remain accessible.</p>'+
      '<p><a href="/app/#rescue">Open the rescue</a> · <a href="https://github.com/Powers-P1/tour-rescue">Public code</a></p></main>';
  }
}
