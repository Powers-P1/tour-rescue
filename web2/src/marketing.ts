import { brand, icon } from './icons.ts';
import type { PublicSiteModel } from './marketing-model.ts';
import { renderGermanyGeographicMap } from './germany-map.ts';
import { renderRecordedQlooStudy } from './live-study-view.ts';
import { PUBLIC_REPOSITORY, PUBLIC_LICENSE, PUBLIC_API_DOCS, PUBLIC_AGENT_DOCS, publicOptionStatus, linkedEvidence } from './marketing-model.ts';

const escape=(v:unknown):string=>String(v??'').replace(/[&<>"']/g,x=>
 ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[x]??x);
const ext=(href:string,label:string,className='')=>'<a'+(className?' class="'+escape(className)+'"':'')+
  ' target="_blank" rel="noopener noreferrer" href="'+escape(href)+'">'+escape(label)+'</a>';
const link=(href:string,label:string,cls='text-link')=>'<a class="'+cls+'" href="'+escape(href)+'">'+escape(label)+'</a>';
const badge=(message:string,variant='neutral')=>'<span class="m-badge m-badge-'+variant+'">'+escape(message)+'</span>';
const wordmark='<a class="site-brand" href="/">'+brand()+'</a>';
const heroPhoto='/assets/touring-backstage-v2.webp';
const drumPhoto='/assets/touring-drum-v2.webp';

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

function journeyDiagram(model:PublicSiteModel,compact=false):string {
 const recommended=model.landing.recommendedOptionId;
 const recId=recommended.status==='known'?recommended.value:null;
 const option=model.rescue.options.find(o=>o.id===recId && o.kind!=='day-off') ??
   model.rescue.options.find(o=>o.kind!=='day-off');
 const proposalIds=model.rescue.options.filter(o=>o.kind!=='day-off'&&o.cityId)
   .map(o=>o.cityId!);
 const city=option?.cityName??'Proposed city';
 return '<div class="journey-diagram'+(compact?' journey-compact':'')+'">'+
   '<div class="journey-meta">'+badge('Germany · real outline')+
   '<span>City centres · geographic context</span></div>'+
   renderGermanyGeographicMap({
     scope:'landing',from:model.rescue.fromCity,cancelled:model.rescue.cancelledCity,
     to:model.rescue.toCity,proposalIds,preferredProposalId:option?.cityId,
   })+
   '<p class="diagram-caption">'+escape(city)+
   ' is a candidate, not a booked venue. Road checks use a separate OSRM snapshot.</p></div>';
}
function miniaturePhone(model:PublicSiteModel):string {
 return '<div class="phone-preview" aria-label="Illustrative mobile Today view">'+
  '<div class="phone-top">TOUR RESCUE <span class="turn">↱</span> <span>SOS</span></div>'+
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
  '<div class="judge-example-body"><div class="judge-map-preview">'+renderGermanyGeographicMap({scope:'audience',from:model.rescue.fromCity,cancelled:model.rescue.cancelledCity,to:model.rescue.toCity,proposalIds:model.rescue.options.filter(o=>o.cityId).map(o=>o.cityId!),preferredProposalId:model.rescue.options.find(o=>o.recommended)?.cityId})+'</div><div class="example-options">'+cards.map(row=>
  '<div class="example-option"><div><strong>'+escape(row.cityName)+'</strong>'+
    '<span>'+escape(row.kind==='day-off'?'Rest day':row.fitText+' relative fit')+'</span></div>'+
    badge(publicOptionStatus(row.decisionStatus),
      row.decisionStatus==='PASS'?'ok':row.decisionStatus==='FAIL'?'fail':'unknown')+'</div>').join('')+
   '</div></div><p class="example-disclosure">✓ Recorded road snapshot · ? Venue terms not verified · no bookings</p></div>';
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
 const round=point.beforeMetres.status==='known'&&point.afterMetres.value<point.beforeMetres.value?Math.floor:Math.ceil;
 const recheckKm=round(point.afterMetres.value/100)/10;
 return '<div class="breakpoint-note" data-evidence-kind="synthetic"><span>Synthetic sensitivity example</span>'+
  '<strong>'+escape(point.beforeText)+' → '+escape(recheckKm)+' km</strong>'+
  '<p>From '+escape(point.beforeCity)+' to '+escape(point.afterCity)+
  '. Only the additional-distance cap changes; the six-hour driving limit stays fixed. Exact computed breakpoint: '+escape(point.afterText)+'. This is a synthetic constraint experiment, separate from the recorded Qloo study.</p></div>';
}
export function landingMarkup(model:PublicSiteModel):string{
 return header(false)+
 '<main id="main-content">'+
 '<section class="site-hero site-shell"><div class="hero-copy">'+
 '<h1>A canceled date.<span>A way forward.</span></h1>'+
 '<p class="hero-deck">For tour managers and bookers: compare the options after a cancellation and prepare the next promoter conversation.</p>'+
 '<div class="hero-actions">'+link(model.appHref,'Rescue a sample date →','m-button')+
 link('#how-it-works','Explore the product ↗')+'</div>'+
 '<p class="mini-disclosure">ⓘ Sample tour · No sign-up to explore · Never a booked show</p></div>'+
 '<div class="hero-visual"><figure class="hero-picture" role="img" aria-label="Illustrative backstage loading scene with a parked van and road cases">'+
 '<img src="'+heroPhoto+'" alt="AI-generated illustration of a working crew loading a worn road case into a touring van" width="1200" height="900" fetchpriority="high"/>'+
 '<figcaption>Backstage scene · AI illustration</figcaption></figure>'+
 miniaturePhone(model)+'</div></section>'+
 '<section id="how-it-works" class="landing-section site-shell rescue-section"><div class="landing-map">'+
 journeyDiagram(model)+'</div><div class="section-copy"><p class="eyebrow">01 / DATE RESCUE · CORE</p>'+
 '<h2>Three directions.<span>One next move.</span></h2>'+
 '<p>Compare cultural fit and realistic travel. Pick a direction. Prepare a one-page proposal for the promoter.</p>'+
 '<div class="line-facts"><p>'+icon('people')+'<strong>Taste fit · Qloo</strong></p><p>'+icon('route')+'<strong>Road and timing checks</strong></p><p>'+icon('document')+'<strong>Draft outreach, ready to review</strong></p></div>'+
 link(model.appHref,'Explore the rescue →','text-amber')+
 '<p class="mini-disclosure">The demo uses synthetic taste profiles and a frozen OSRM matrix. Fresh Qloo is a separate action.</p></div></section>'+
 '<section id="local-sos" class="sos-section"><div class="site-shell sos-grid">'+
 '<div class="section-copy"><p class="eyebrow">02 / LOCAL SOS · SAMPLE</p><h2>Broken gear.<span>Local help.</span></h2>'+
 '<p>Say what happened, where you are and when it is needed. Review a concrete scope, arrival estimate and price before approving any spend.</p>'+
 link('/app/#sos','See a sample local rescue →','text-amber')+
 '<p class="mini-disclosure">No supplier is contacted. Quote and travel values are fictional.</p></div>'+
 '<figure class="sos-photo" role="img" aria-label="Illustrative drum fitting, not a real supplier visit"><img src="'+drumPhoto+'" alt="AI-generated illustration of a drum technician working on a bass drum" loading="lazy" width="1200" height="760"/>'+
 '<figcaption>AI illustration · not the sample supplier</figcaption>'+
 '<div class="sos-card"><small>SAMPLE QUOTE · NOT RECEIVED</small><h3>Ready to review.</h3><p>Minh Backline</p>'+
 '<div><strong>22-inch head + fitting</strong><span>Today, 15:40 · estimate</span></div>'+
 '<strong class="sos-money">1,800,000 VND</strong>'+
 '<span class="phone-button">Preview approval →</span></div></figure></div></section>'+
 '<section id="for-agencies" class="agency-band"><div class="site-shell agency-band-inner">'+
 '<div><p class="eyebrow">03 / AGENCY · SAMPLE WORKSPACE</p><h2>One calm desk.<span>Every tour.</span></h2></div>'+
 '<div><p>A clear queue of decisions, a named owner and venue-local deadlines. Switch from agency view to the artist in one step.</p>'+
 link('/app/#agency','Explore the sample agency workspace →')+'</div></div></section>'+
 '<section class="landing-judges-promo site-shell"><p class="eyebrow">FOR HACKATHON JUDGES</p>'+
 '<h2>Open the demo.<span>Try to overturn it.</span></h2><p>A short, reproducible route from cancellation to checked proposal.</p>'+
 link(model.judgesHref,'Judges · Start here ↗','m-button')+'</section>'+
 '</main>'+footer(false);
}
function knownLimitsSection():string {
  const limits=[
    ['Taste fit is not attendance',
      'Relative cultural affinity is not a count of listeners, sold tickets or forecast revenue.'],
    ['Live Qloo has quotas and possible evidence gaps',
      'Live mode needs resolved artist identities, a properly configured Worker and available provider evidence. Searches and evaluations consume bounded quotas; incomplete city coverage stays UNKNOWN, not zero.'],
    ['City mapping and reference weights are application-owned',
      'Heatmap-to-city normalization and combining reference artists are our methods, not venue signals from Qloo. One influential comparison artist can change a ranking; review the source audit and sensitivity checks.'],
    ['Road and booking evidence have separate limits',
      'The default OSRM matrix is a frozen driving snapshot, not live traffic. Room capacity, availability, fees and contracts still require independent confirmation.'],
    ['A proposal is not a confirmation',
      'The saved default uses synthetic profiles. Promoter sheets and local SOS approval previews neither book nor contact anyone. Live AI suggestions remain subject to deterministic checks and human review.'],
  ] as const;
  return '<section id="known-limits" class="judge-limits"><div class="site-shell">'+
    '<div class="section-title"><p class="eyebrow">BOUNDARIES & UNKNOWNS</p>'+
    '<h2>Known limits.</h2><p>What this demonstrator establishes - and what remains unverified.</p></div>'+
    '<div class="judge-limits-grid">'+limits.map(([heading,detail])=>
      '<article><h3>'+escape(heading)+'</h3><p>'+escape(detail)+'</p></article>').join('')+
    '</div></div></section>';
}
export function judgesMarkup(model:PublicSiteModel):string{
 const evidence=linkedEvidence(model);
 return header(true)+
 '<main id="main-content">'+
 '<section class="judges-hero site-shell"><div class="judge-copy">'+
 '<p class="eyebrow">MOBILE FIRST · INSTALLABLE APP · NO SIGN-IN</p>'+
 '<h1>Leipzig canceled.<span>Keep the tour moving.</span></h1>'+
 '<p>For a tour manager or booker after a cancellation: compare three directions, inspect constraints and evidence, and prepare a brief for the next promoter conversation.</p>'+
 '<div class="hero-actions">'+link(model.appHref,'Rescue Leipzig →','m-button')+
 '<button type="button" class="m-button m-button-quiet" data-install-app>Install Tour Rescue</button></div>'+
 '<p class="mini-disclosure">Add it to your home screen. Sample rescue works offline; live Qloo and AI need a connection. '+ext(PUBLIC_REPOSITORY,'Public source & licence ↗','judges-external-link')+'</p>'+
 '<p class="mini-disclosure">ⓘ '+escape(model.rescue.cancelledDate)+
  ' · Synthetic taste fixture · Frozen OSRM · Not a booking</p>'+
 link('#walkthrough','Watch the 100-second walkthrough','text-amber')+'</div>'+proposalPreview(model)+'</section>'+
 '<section id="steps" class="site-shell judge-steps">'+
 '<div class="section-title"><p class="eyebrow">THE CASE</p><h2>One clear path.</h2></div>'+
 '<div class="judge-step-columns"><article><span>01 / ↗</span><h3>Open the canceled date</h3>'+
 '<p>Start from the Berlin–Munich gap.</p></article>'+
 '<article><span>02 / ◇</span><h3>Compare feasible directions</h3>'+
 '<p>Review relative cultural fit, roads and unknown constraints.</p></article>'+
 '<article><span>03 / ↔</span><h3>Change one assumption</h3><p>Synthetic sensitivity example: change only the additional-distance cap. Nuremberg → Frankfurt.</p></article>'+
 '<article><span>04 / ◇</span><h3>Inspect the evidence</h3><p>Compare the recorded three-artist Qloo study, controls and omissions. Booking unknowns stay visible.</p></article>'+
 '<article><span>05 / ▤</span><h3>Take the promoter draft</h3><p>Matching audit, A4 print and PNG. Nothing is booked or sent.</p></article></div>'+
 link('/app/?tour=start#rescue','Start the six-step guided demo →','text-amber')+'</section>'+
 '<section class="judge-last site-shell"><p class="eyebrow">CAN YOU CHANGE THE OUTCOME?</p>'+
 '<h2>Change one assumption.</h2>'+breakpoint(model)+
 link('/app/#simulation','Try 350 → 354.1 km →','m-button')+'</section>'+
 '<section id="why-qloo" class="judge-why"><div class="site-shell">'+
 '<div class="section-title"><p class="eyebrow">PROVENANCE BY DESIGN</p><h2>How cultural evidence informs the shortlist.</h2></div>'+
 '<div class="why-columns"><article><p>01 / CULTURAL FIT</p><h3>Where taste fits.</h3>'+
 '<span>Qloo heatmaps provide relative taste affinity for real resolved artist references in live mode.</span></article>'+
 '<article><p>02 / HARD CONSTRAINTS</p><h3>What can work.</h3>'+
 '<span>Directed OSRM road data and explicit daily, arrival and spacing rules; missing venue evidence remains UNKNOWN.</span></article>'+
 '<article><p>03 / AGENT WORKFLOW</p><h3>What happens next.</h3>'+
 '<span>Claude researches leads through the Worker; the same deterministic validator rechecks them before human acceptance.</span></article></div>'+
 '<div class="logic-flow"><span>Taste evidence + route checks</span><b>→</b><span>Audited directions</span><b>→</b><span>Draft for a promoter</span></div>'+
 '<p class="mini-disclosure">ⓘ Cultural fit is neither a listener count nor a ticket-sales forecast. No model confirms room availability.</p>'+renderRecordedQlooStudy()+'</div></section>'+
 '<section id="evidence" class="site-shell judges-proof"><div class="section-title">'+
 '<p class="eyebrow">OPEN EVIDENCE</p><h2>Inspect the evidence.</h2>'+
 '<p>No hidden API key or fabricated live result is needed to reproduce the default demo.</p></div>'+
 '<div class="evidence-rows">'+evidence.map(e=>'<a href="'+escape(e.href)+'"'+
   (e.href.startsWith('https://')?' target="_blank" rel="noopener noreferrer"':'')+'>'+
   '<strong>'+escape(e.label)+'</strong><span>'+escape(e.detail)+'</span><b>↗</b></a>').join('')+'</div>'+
 '<div class="judge-tools"><button type="button" id="download-synthetic-audit" class="m-button m-button-quiet">Download saved demo audit ↓</button>'+
 link('/app/#evidence','Inspect sensitivity & control','text-link')+
 link('/app/#ai','Try both agent scenarios','text-link')+
 link('/app/#live-preset','Run a real Qloo preset','text-link')+
 ext(PUBLIC_AGENT_DOCS,'Agent contract ↗','judges-external-link')+'</div>'+
 '<p class="mini-disclosure">Saved demo is generated from openly available, explicitly synthetic artist inputs; a fresh Qloo evaluation requires a separate user action and a live Worker.</p>'+
 '</section>'+
 '<section id="walkthrough" class="judge-walkthrough site-shell" aria-labelledby="walkthrough-title">'+
 '<p class="eyebrow">OPTIONAL PRESENTATION</p><h2 id="walkthrough-title">Keep the tour moving.</h2>'+
 '<p>A 100-second walkthrough of the actual interface. The synthetic rescue and saved AI replay are labelled separately from recorded live Qloo evidence. Motion and device frames are edited for this presentation.</p>'+
 '<video controls playsinline preload="metadata" width="1920" height="1080" poster="/video/tour-rescue-final-v2-poster.jpg" aria-label="Tour Rescue 100-second walkthrough">'+
 '<source src="/video/tour-rescue-final-v2.mp4" type="video/mp4" />'+
 '<track kind="captions" src="/video/tour-rescue-final-v2.en.vtt" srclang="en" label="English" default />'+
 '<a href="/video/tour-rescue-final-v2.mp4">Download the walkthrough</a></video>'+
 '<p>'+link('/video/transcript.txt','Read the English transcript')+' · '+link('/video/tour-rescue-final-v2.en.vtt','English captions (VTT)')+' · '+link('/video/tour-rescue-final-v2.en.srt','English subtitles (SRT)')+'</p></section>'+
 '<section class="site-shell judge-walkthrough"><p class="eyebrow">OPTIONAL EXTENSION · SAMPLE</p><h2>When the guitar breaks. Or the delivery never comes.</h2><p>Tour SOS shows the incident → supplier options → budget review workflow. The current guided example is a damaged drum head in Ho Chi Minh City. Suppliers, prices and response times are illustrative. It does not confirm a real technician or delivery is available, contact anyone or place an order.</p>'+link('/app/?learn=sos#sos','Explore the guided Tour SOS sample →','m-button m-button-quiet')+'</section>'+
 '<details class="judge-optional site-shell"><summary>Scope and known limits</summary>'+knownLimitsSection()+
 scopeTable()+'</details>'+
 '</main>'+footer(true);
}
