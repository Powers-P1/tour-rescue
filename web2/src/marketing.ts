import type { PublicSiteModel } from './marketing-model.ts';
import { PUBLIC_REPOSITORY, PUBLIC_LICENSE, PUBLIC_API_DOCS, PUBLIC_AGENT_DOCS, publicOptionStatus, linkedEvidence } from './marketing-model.ts';

const escape=(v:unknown):string=>String(v??'').replace(/[&<>"']/g,x=>
 ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[x]??x);
const ext=(href:string,label:string)=>'<a target="_blank" rel="noopener noreferrer" href="'+escape(href)+'">'+escape(label)+'</a>';
const link=(href:string,label:string,cls='text-link')=>'<a class="'+cls+'" href="'+escape(href)+'">'+escape(label)+'</a>';
const badge=(message:string,variant='neutral')=>'<span class="m-badge m-badge-'+variant+'">'+escape(message)+'</span>';
const wordmark='<a class="site-brand" href="/"><span class="site-brand-arrow" aria-hidden="true">↱</span> TOUR RESCUE</a>';
const heroPhoto='https://images.unsplash.com/photo-1670482204474-acdc61c4cd75?auto=format&fit=crop&w=1350&q=82';
const drumPhoto='https://images.unsplash.com/photo-1599594407616-af1c058be616?auto=format&fit=crop&w=1250&q=82';

function header(judges:boolean):string {
 if(judges) return '<div class="judges-utility"><span>Qloo Agentic Hackathon</span><strong>Judges · Start here</strong></div>'+
   '<header class="site-header"><div class="site-shell site-navline">'+wordmark+
   '<nav aria-label="Judges navigation">'+
   link('/app/#rescue','Try the rescue')+link('#why-qloo','Why Qloo')+
   link('#evidence','Source & license')+'</nav></div></header>';
 return '<header class="site-header"><div class="site-shell site-navline">'+wordmark+
   '<nav aria-label="Product navigation">'+link('#how-it-works','How it works')+
   link('#for-agencies','For agencies')+link('/judges/','Judges · Start here ↗','judges-nav')+
   link('/app/#rescue','Try the rescue demo','m-button small')+'</nav></div></header>';
}
function footer(judges:boolean):string {
 return '<footer class="site-footer"><div class="site-shell"><div class="footer-inner">'+wordmark+
  '<nav aria-label="Footer navigation">'+link('/','Product')+
  link('/app/#rescue','For artists')+link('/app/#agency','For agencies')+
  link('/judges/','For judges')+ext(PUBLIC_REPOSITORY,'Public code ↗')+'</nav></div>'+
  '<p>© 2026 Tour Rescue · MIT licence · '+
  (judges?'Demo evidence and source code are inspectable.':
   'Taste affinity is not ticket sales. No booking is made by opening a draft.')+
  '</p></div></footer>';
}

function journeyDiagram(model:PublicSiteModel, compact=false):string {
 const recommendationId=model.landing.recommendedOptionId;
 const recommendation=recommendationId.status==='known'
   ? model.rescue.options.find(row=>row.id===recommendationId.value) : undefined;
 const pivot=recommendation?.kind!=='day-off'&&recommendation?recommendation:model.rescue.options.find(x=>x.kind!=='day-off');
 const city=pivot?.cityName??'Proposed city';
 const proposedLine=pivot?
   '<path d="M 394 78 Q 228 126 235 218 Q 202 270 331 378" stroke="#F3B65B" stroke-width="4" stroke-dasharray="9 8" fill="none"/>':'';
 return '<div class="journey-diagram'+(compact?' journey-compact':'')+'">'+
   '<div class="journey-meta">'+badge('Schematic geography · demo')+
   '<span>Solid: current route &nbsp; · &nbsp; Dashed: Proposed</span></div>'+
   '<svg viewBox="0 0 570 445" role="img" aria-label="Illustrative route from Berlin via cancelled Leipzig to Munich, and a proposed alternate direction">'+
   '<path fill="#22323A" stroke="#435965" stroke-width="2" d="M204 20 L370 25 483 93 490 192 447 247 451 340 384 418 312 431 237 386 191 304 139 265 150 150 170 70Z"/>'+
   '<path d="M 394 78 L 366 182 L 331 378" stroke="#B5C3CC" stroke-width="3.3" fill="none"/>'+proposedLine+
   '<circle cx="394" cy="78" r="7" fill="#F4F6F8"/><circle cx="331" cy="378" r="7" fill="#F4F6F8"/>'+
   '<circle cx="366" cy="182" r="8" fill="#E78B82"/><path d="M361 177l10 10m0-10l-10 10" stroke="#121A20" stroke-width="2"/>'+
   '<circle cx="235" cy="218" r="8" fill="#F3B65B"/>'+
   '<g font-size="17" font-weight="650" font-family="Inter,system-ui" fill="#F4F6F8">'+
   '<text x="409" y="68">Berlin</text><text x="378" y="208" fill="#E78B82">Leipzig · Canceled</text>'+
   '<text x="346" y="407">Munich</text><text x="223" y="194" fill="#F3B65B" text-anchor="end">'+escape(city)+'</text></g>'+
   '</svg><p class="diagram-caption">'+escape(city)+' is a candidate, <strong>not</strong> a booked venue. Road checks use a separate OSRM snapshot.</p></div>';
}
function miniaturePhone(model:PublicSiteModel):string {
 return '<div class="phone-preview" aria-label="Illustrative mobile Today view">'+
  '<div class="phone-top"><span class="turn">↱</span> TOUR RESCUE <span>SOS</span></div>'+
  '<small>'+escape(model.rescue.title)+' · sample</small><h3>Here’s the plan.</h3>'+
  '<div class="phone-alert"><small>! NEEDS A DECISION</small>'+
  '<strong>'+escape(model.rescue.cancelledCity)+' canceled.</strong>'+
  '<span>'+escape(model.rescue.cancelledDate)+'</span>'+
  '<div class="phone-button">Rescue this date →</div></div>'+
  '<div class="phone-next"><small>Next up</small><strong>16:00</strong><span>Load-in · sample</span></div>'+
  '</div>';
}
function proposalPreview(model:PublicSiteModel):string {
 const cards=model.landing.options;
 return '<div class="judges-example" aria-label="Illustrative option comparison from the maintained synthetic core">'+
  '<div class="example-top"><small>FROZEN GERMANY SAMPLE</small><h3>Three ways forward.</h3><p>'+
  escape(model.rescue.fromCity)+' → '+escape(model.rescue.cancelledCity)+' → '+escape(model.rescue.toCity)+'</p></div>'+
  '<div class="example-options">'+cards.map(row=>
  '<div class="example-option"><div><strong>'+escape(row.cityName)+'</strong>'+
    '<span>'+escape(row.kind==='day-off'?'Rest day':row.fitText+' relative fit')+'</span></div>'+
    badge(publicOptionStatus(row.decisionStatus),
      row.decisionStatus==='PASS'?'ok':row.decisionStatus==='FAIL'?'fail':'unknown')+'</div>').join('')+
   '</div><p class="example-disclosure">✓ Recorded road snapshot · ? Venue terms not verified · no bookings</p></div>';
}
function scopeTable():string {
 const implemented=[
  ['Audited rescue','Deterministic comparisons and venue/route status; one-page promoter draft'],
  ['Qloo research','Worker artist-ID search, taste evidence and bounded Claude agent (when enabled)'],
  ['Reproducible evidence','Audit JSON, source/provenance, constraints and breakpoint analysis'],
 ];
 const concepts=[
  ['Local SOS','Two illustrative suppliers; no search, dispatch or paid order'],
  ['Planner & economics','Sample assumptions; no unrestricted tour optimizer or sales forecast'],
  ['Fans & agency','No collected declarations or connected team/booking service'],
 ];
 const section=(rows:string[][],label:string,state:string)=>
  '<div class="scope-half"><h3>'+label+'</h3>'+rows.map(([name,description])=>
   '<div class="scope-row"><div>'+badge(state,state==='Implemented'?'ok':'unknown')+
   '<strong>'+name+'</strong></div><p>'+description+'</p></div>').join('')+'</div>';
 return '<section id="scope" class="scope-section site-shell"><div class="section-title">'+
  '<p class="eyebrow">IMPLEMENTED VS CONCEPT</p><h2>What you can actually test.</h2>'+
  '<p>Features are described by their current implementation, not by mockup intent.</p></div>'+
  '<div class="scope-grid">'+section(implemented,'Running core & checked integrations','Implemented')+
  section(concepts,'Illustrative extensions','Sample concept')+'</div></section>';
}
function breakpoint(model:PublicSiteModel):string{
 const point=model.landing.breakpoint;
 if(point.status!=='found'||point.afterMetres.status!=='known')
  return '<p class="muted">What could change this choice: '+escape(point.reason)+'.</p>';
 return '<div class="breakpoint-note"><span>Single-assumption breakpoint</span>'+
  '<strong>'+escape(point.beforeText)+' → '+escape(point.afterText)+'</strong>'+
  '<p>From '+escape(point.beforeCity)+' to '+escape(point.afterCity)+
  '. Changes only the allowed extra distance, not the six-hour driving limit.</p></div>';
}
function cards(model:PublicSiteModel):string{
 return '<div class="proof-options">'+model.landing.options.map(x=>
   '<div><span>'+escape(x.letter)+'</span><strong>'+escape(x.cityName)+'</strong>'+
   badge(publicOptionStatus(x.decisionStatus),
     x.decisionStatus==='PASS'?'ok':x.decisionStatus==='FAIL'?'fail':'unknown')+
   '<small>'+escape(x.note)+'</small></div>').join('')+'</div>';
}
export function landingMarkup(model:PublicSiteModel):string{
 return header(false)+
 '<main id="main-content">'+
 '<section class="site-hero site-shell"><div class="hero-copy">'+
 '<p class="eyebrow">A CALMER WAY THROUGH THE CRISIS</p>'+
 '<h1>A canceled date.<span>A way forward.</span></h1>'+
 '<p class="hero-deck">Plan where your audience fits. Rescue the show when the route, people or gear let you down.</p>'+
 '<div class="hero-actions">'+link(model.appHref,'Rescue a sample date →','m-button')+
 link('#how-it-works','Explore the product ↗')+'</div>'+
 '<p class="mini-disclosure">ⓘ Sample tour · No sign-up to explore · Never a booked show</p></div>'+
 '<div class="hero-visual"><figure class="hero-picture" role="img" aria-label="Illustrative backstage loading scene with a parked van and road cases">'+
 '<img src="'+heroPhoto+'" alt="Photograph of a production team behind the scenes, illustrative of backstage work" width="1200" height="900" fetchpriority="high"/>'+
 '<figcaption>Backstage illustration · editorial photo when available</figcaption></figure>'+
 miniaturePhone(model)+'</div></section>'+
 '<section id="how-it-works" class="landing-section site-shell rescue-section"><div class="landing-map">'+
 journeyDiagram(model)+'</div><div class="section-copy"><p class="eyebrow">01 / DATE RESCUE · CORE</p>'+
 '<h2>Three directions.<span>One next move.</span></h2>'+
 '<p>Compare cultural fit and realistic travel. Pick a direction. Prepare a one-page proposal for the promoter.</p>'+
 '<div class="line-facts"><p>↗ Taste fit · Qloo</p><p>↗ Road and timing checks</p><p>↗ Draft outreach, ready to review</p></div>'+
 link(model.appHref,'Explore the rescue →','text-amber')+
 '<p class="mini-disclosure">The demo uses synthetic taste profiles and a frozen OSRM matrix. Fresh Qloo is a separate action.</p></div></section>'+
 '<section id="local-sos" class="sos-section"><div class="site-shell sos-grid">'+
 '<div class="section-copy"><p class="eyebrow">02 / LOCAL SOS · SAMPLE</p><h2>Broken gear.<span>Local help.</span></h2>'+
 '<p>Say what happened, where you are and when it is needed. Review a concrete scope, arrival estimate and price before approving any spend.</p>'+
 link('/app/#sos','See a sample local rescue →','text-amber')+
 '<p class="mini-disclosure">No supplier is contacted. Quote and travel values are fictional.</p></div>'+
 '<figure class="sos-photo" role="img" aria-label="Illustrative drum fitting, not a real supplier visit"><img src="'+drumPhoto+'" alt="Editorial photograph of a drummer adjusting a drum in a rehearsal setting" loading="lazy" width="1200" height="760"/>'+
 '<figcaption>Illustrative drum setup · not the sample supplier</figcaption>'+
 '<div class="sos-card"><small>SAMPLE QUOTE · NOT RECEIVED</small><h3>Ready to review.</h3><p>Minh Backline</p>'+
 '<div><strong>22-inch head + fitting</strong><span>Today, 15:40 · estimate</span></div>'+
 '<strong class="sos-money">1,800,000 VND</strong>'+
 '<span class="phone-button">Preview approval →</span></div></figure></div></section>'+
 '<section id="for-agencies" class="agency-band"><div class="site-shell agency-band-inner">'+
 '<div><p class="eyebrow">03 / AGENCY · SAMPLE WORKSPACE</p><h2>One calm desk.<span>Every tour.</span></h2></div>'+
 '<div><p>A clear queue of decisions, a named owner and venue-local deadlines. Switch from agency view to the artist in one step.</p>'+
 link('/app/#agency','Explore the sample agency workspace →')+'</div></div></section>'+
 '<section class="site-shell landing-proof"><div class="section-title"><p class="eyebrow">DEMO EVIDENCE</p>'+
 '<h2>A decision you can challenge.</h2><p>These are computed by the same frozen core used inside the app.</p></div>'+
 cards(model)+breakpoint(model)+'</section>'+
 '<section class="landing-judges-promo site-shell"><p class="eyebrow">FOR HACKATHON JUDGES</p>'+
 '<h2>Open the demo.<span>Try to overturn it.</span></h2><p>A short, reproducible route from cancellation to checked proposal.</p>'+
 link(model.judgesHref,'Judges · Start here ↗','m-button')+'</section>'+
 '</main>'+footer(false);
}
export function judgesMarkup(model:PublicSiteModel):string{
 const evidence=linkedEvidence(model);
 return header(true)+
 '<main id="main-content">'+
 '<section class="judges-hero site-shell"><div class="judge-copy">'+
 '<p class="eyebrow">READY-TO-OPEN DEMO · NO SIGN-IN</p>'+
 '<h1>Leipzig canceled.<span>Keep the tour moving.</span></h1>'+
 '<p>A tour-rescue agent that combines cultural fit, road constraints and a promoter-ready plan.</p>'+
 '<div class="hero-actions">'+link(model.appHref,'Rescue Leipzig →','m-button')+
 ext(PUBLIC_REPOSITORY,'Public source & licence ↗')+'</div>'+
 '<p class="mini-disclosure">ⓘ '+escape(model.rescue.cancelledDate)+
  ' · Synthetic taste fixture · Frozen OSRM · Not a booking</p></div>'+proposalPreview(model)+'</section>'+
 '<section id="steps" class="site-shell judge-steps">'+
 '<div class="section-title"><p class="eyebrow">THE CASE</p><h2>One rescue. Three steps.</h2></div>'+
 '<div class="judge-step-columns"><article><span>01 / ↗</span><h3>Open the canceled date</h3>'+
 '<p>Start from the Berlin–Munich gap.</p></article>'+
 '<article><span>02 / ◇</span><h3>Compare feasible directions</h3>'+
 '<p>Review relative cultural fit, roads and unknown constraints.</p></article>'+
 '<article><span>03 / ▤</span><h3>Review the proposal</h3>'+
 '<p>A one-page promoter draft, not a booked date or sent email.</p></article></div>'+
 link(model.appHref,'Open the guided case →','text-amber')+'</section>'+
 '<section id="why-qloo" class="judge-why"><div class="site-shell">'+
 '<div class="section-title"><p class="eyebrow">PROVENANCE BY DESIGN</p><h2>Why Qloo changes the decision.</h2></div>'+
 '<div class="why-columns"><article><p>01 / CULTURAL FIT</p><h3>Where taste fits.</h3>'+
 '<span>Qloo heatmaps provide relative taste affinity for real resolved artist references in live mode.</span></article>'+
 '<article><p>02 / HARD CONSTRAINTS</p><h3>What can work.</h3>'+
 '<span>Directed OSRM road data and explicit daily, arrival and spacing rules; missing venue evidence remains UNKNOWN.</span></article>'+
 '<article><p>03 / AGENT WORKFLOW</p><h3>What happens next.</h3>'+
 '<span>Claude researches leads through the Worker; the same deterministic validator rechecks them before human acceptance.</span></article></div>'+
 '<div class="logic-flow"><span>Taste evidence + route checks</span><b>→</b><span>Audited directions</span><b>→</b><span>Draft for a promoter</span></div>'+
 '<p class="mini-disclosure">ⓘ Cultural fit is neither a listener count nor a ticket-sales forecast. No model confirms room availability.</p></div></section>'+
 '<section id="evidence" class="site-shell judges-proof"><div class="section-title">'+
 '<p class="eyebrow">OPEN EVIDENCE</p><h2>Inspect the evidence.</h2>'+
 '<p>No hidden API key or fabricated live result is needed to reproduce the default demo.</p></div>'+
 '<div class="evidence-rows">'+evidence.map(e=>'<a href="'+escape(e.href)+'"'+
   (e.href.startsWith('https://')?' target="_blank" rel="noopener noreferrer"':'')+'>'+
   '<strong>'+escape(e.label)+'</strong><span>'+escape(e.detail)+'</span><b>↗</b></a>').join('')+'</div>'+
 '<div class="judge-tools"><button type="button" id="download-synthetic-audit" class="m-button m-button-quiet">Download saved demo audit ↓</button>'+
 link('/app/#rescue','Open app · then explicitly run live Qloo','text-link')+
 ext(PUBLIC_AGENT_DOCS,'Agent contract ↗')+'</div>'+
 '<p class="mini-disclosure">Saved demo is generated from openly available, explicitly synthetic artist inputs; a fresh Qloo evaluation requires a separate user action and a live Worker.</p>'+
 '</section>'+
 scopeTable()+
 '<section class="site-shell judge-last"><p class="eyebrow">CAN YOU CHANGE THE OUTCOME?</p>'+
 '<h2>Change one assumption.</h2>'+breakpoint(model)+
 link(model.appHref,'Try the rescue demo →','m-button')+'</section>'+
 '</main>'+footer(true);
}
