import type { AudienceModel, AudienceSource, AudiencePlace, SimulationModel, AgencyOwner } from './desktop-model.ts';
import { agencyTasks, AGENCY_FOURTH_TOUR } from './desktop-model.ts';
import type { RescueProjection } from './model.ts';
import { GERMANY_OUTLINE_PATH, projectGermany } from './germany-geography.ts';
import { GERMANY_MAP_CITIES, GEOGRAPHIC_KEY_IDS, cityById } from './germany-map.ts';

export type DesktopScreen = 'audience' | 'simulation' | 'agency';
/** A city's explanatory text is derived from the audited fit, never its position. */
export function audienceCityReason(city: AudiencePlace): string {
  if (city.routeOptionId) return 'Route-nominated candidate · '+city.relativeLabel+'.';
  if (city.fit.status==='unknown') return 'Taste evidence unresolved · no route checks.';
  return 'Highest available taste-only alternative · '+city.relativeLabel+' · no route checks.';
}
export const formatExtraKm=(value:number):string=>
 new Intl.NumberFormat('en-GB',{maximumFractionDigits:3}).format(value)+' km';
export const isDesktopScreen = (value:string):value is DesktopScreen =>
  value==='audience'||value==='simulation'||value==='agency';

export interface DesktopViewContext {
  readonly projection: RescueProjection;
  readonly audience: AudienceModel;
  readonly audienceSource:AudienceSource;
  readonly selectedAudienceCityId:string;
  readonly audienceEvidenceOpen:boolean;
  readonly mapZoom:number;
  readonly simulation:SimulationModel|null;
  readonly simulationTab:'route'|'budget';
  readonly simulationCapDraft:string|null;
  readonly simulationCapError:string;
  readonly savedDraft:boolean;
  readonly changeCityOpen:boolean;
  readonly agencyFilter:'attention'|'all';
  readonly agencyOwners:Readonly<Partial<Record<'drum'|'leipzig'|'presale',AgencyOwner>>>;
  readonly assigningTask:'drum'|'leipzig'|'presale'|null;
  readonly proposedOwner:AgencyOwner;
  readonly agencyNotice:string;
  readonly actionNotice:string;
}
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]??c);
const action=(label:string,id:string,main=false,disabled=false):string=>
  '<button type="button" class="'+(main?'primary-button':'text-button')+'" data-action="'+esc(id)+'"'+
  (disabled?' disabled':'')+'>'+esc(label)+'</button>';
const status=(v:'PASS'|'FAIL'|'UNKNOWN')=>'<span class="status status-'+
  (v==='PASS'?'good':v==='FAIL'?'danger':'unknown')+'">'+
  (v==='PASS'?'✓ Pass':v==='FAIL'?'× Fails check':'? Unknown / To confirm')+'</span>';
const fallback=(text:string)=>'<p class="tiny-label">ⓘ '+esc(text)+'</p>';
function titleRow(title:string,desc:string,badge:string,actionHtml=''):string{
 return '<header class="feature-header"><div><h1>'+esc(title)+'</h1><p class="muted">'+esc(desc)+'</p></div>'+
   '<div class="feature-head-actions"><span class="status">'+esc(badge)+'</span>'+
    '<button type="button" class="text-button feature-back" data-action="feature-back">← Back</button>'+
    actionHtml+'</div></header>';
}
const project=(lon:number,lat:number):readonly[number,number]=>projectGermany(lon,lat);
function tasteMap(ctx:DesktopViewContext):string{
 const p=ctx.audience.places;
 const selected=ctx.selectedAudienceCityId,zoom=ctx.mapZoom;
 const visibleIds=new Set(p.map(city=>city.cityId));
 const points=p.map((city,index)=>{
   const [x,y]=project(city.lon,city.lat);
   const known=city.fit.status==='known';
   const r=known?Math.round(17+(city.fit.value/100)*24):8;
   const opacity=known?(0.15+(city.fit.value/100)*0.24).toFixed(2):'0';
   return '<g><title>'+esc(city.name)+' · '+esc(city.relativeLabel)+'</title>'+
     '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="#F3B65B" opacity="'+opacity+'"/>'+
     (city.cityId===selected?'<circle cx="'+x+'" cy="'+y+'" r="'+(r+7)+'" fill="none" stroke="#F3B65B" stroke-width="2"/>':'')+
     '<circle cx="'+x+'" cy="'+y+'" r="6" fill="'+(known?'#F3B65B':'#AEBCC6')+'"/>'+
     '<text class="taste-map-mobile-number" x="'+x+'" y="'+(y-14)+'" text-anchor="middle">'+(index+1)+'</text></g>';
 }).join('');
 const anchors=['de-berlin','de-munich'].map(id=>{
   const city=cityById(id)!;
   const [x,y]=project(city.lon,city.lat);
   return '<circle cx="'+x+'" cy="'+y+'" r="4.5" fill="#AEBCC6">'+
     '<title>'+esc(city.name)+'</title></circle>';
 }).join('');
 const otherCities=GERMANY_MAP_CITIES.filter(city=>
   !visibleIds.has(city.id)&&city.id!=='de-berlin'&&city.id!=='de-munich')
 .map(city=>{
    const [x,y]=project(city.lon,city.lat);
    return '<circle cx="'+x+'" cy="'+y+'" r="2.2" fill="#8097A5" opacity=".55">'+
       '<title>'+esc(city.name)+' · geographic reference</title></circle>';
 }).join('');
 return '<div class="taste-map-wrap"><svg class="taste-map" viewBox="0 0 640 455" role="img"'+
   ' aria-describedby="taste-map-key"'+
   ' aria-label="Germany outline and real city-centre positions, with illustrative relative cultural-fit circles" preserveAspectRatio="xMidYMid meet">'+
   '<defs><clipPath id="taste-clip"><rect x="10" y="4" width="620" height="446" rx="14"/></clipPath></defs>'+
   '<g clip-path="url(#taste-clip)"><rect x="0" y="0" width="640" height="455" fill="#19262D"/>'+
   '<g transform="translate('+(320-320*zoom)+' '+(225-225*zoom)+') scale('+zoom+')">'+
   '<path class="geo-country-outline" d="'+GERMANY_OUTLINE_PATH+'"/>'+
   otherCities+anchors+points+'</g></g></svg>'+
   '<div id="taste-map-key" class="taste-mobile-key" aria-label="Cultural-fit city labels">'+
   p.map((city,i)=>'<span><b>'+(i+1)+'</b> '+esc(city.name)+'</span>').join('')+
   '<span>• Berlin</span><span>• Munich</span></div>'+
   '<details class="map-reference-details"><summary>Other cities &amp; map source</summary><div class="taste-geographic-key" aria-label="Other actual city-centre references">'+
   GEOGRAPHIC_KEY_IDS.filter(id=>!visibleIds.has(id)&&id!=='de-berlin'&&id!=='de-munich').map(id=>
     '<span>'+esc(cityById(id)!.name)+'</span>').join('')+'</div>'+
   fallback('Natural Earth 1:10m public-domain Germany outline. City centres use WGS84 coordinates; fit circles are not people or road data.')+'</details>'+
   '<div class="taste-map-bottom"><div><span>Relative cultural fit</span>'+
   '<div class="taste-scale" aria-hidden="true"><i></i><i></i><i></i><i></i></div>'+
   '<small>Low - High · within this candidate set</small></div>'+
   '<div class="map-zoom-actions"><button type="button" data-action="audience-zoom-out" aria-label="Zoom out">−</button>'+
   '<button type="button" data-action="audience-zoom-in" aria-label="Zoom in">+</button></div></div>'+
'</div>';
}
function audience(ctx:DesktopViewContext):string{
 const mode=ctx.audienceSource==='qloo';
 const places=ctx.audience.places;
 const selected=places.find(row=>row.cityId===ctx.selectedAudienceCityId)??places[0]!;
 const isLive=ctx.audience.source==='live-qloo-percentiles';
 return '<section class="feature-page audience-page">'+
   titleRow('Find your next audience.','Northbound · based on your selected taste references',
     isLive?'Live Qloo · sample tour':ctx.audience.source==='live-fit-unresolved'?'Live run · fit unknown':'Sample taste evidence',action('View sources →','audience-evidence'))+
   '<div class="feature-tabs" role="tablist" aria-label="Audience data source">'+
   '<button id="audience-tab-qloo" role="tab" type="button" data-action="audience-qloo" aria-selected="'+mode+'" aria-controls="audience-panel-qloo" tabindex="'+(mode?'0':'-1')+'">Cultural fit · Qloo</button>'+
   '<button id="audience-tab-fans" role="tab" type="button" data-action="audience-fans" aria-selected="'+(!mode)+'" aria-controls="audience-panel-fans" tabindex="'+(!mode?'0':'-1')+'">Fan requests</button></div>'+
   '<p class="audience-disclosure">'+(mode?'ⓘ Relative cultural affinity, not listener counts, ticket sales or predicted attendance.':
   'ⓘ Fan declarations would come from the separate voluntary fan service, never from Qloo.')+'</p>'+
   (ctx.actionNotice?'<p class="feature-action-notice" role="status">'+esc(ctx.actionNotice)+'</p>':'')+
   '<div id="audience-panel-'+(mode?'qloo':'fans')+'" role="tabpanel" tabindex="0" aria-labelledby="audience-tab-'+(mode?'qloo':'fans')+'">'+
   (mode?
   '<div class="audience-columns"><section><h2>Cultural fit by city</h2>'+tasteMap(ctx)+'</section>'+
   '<section class="audience-picks"><h2>Worth a closer look.</h2><div id="audience-cities" role="radiogroup" aria-orientation="vertical" aria-label="Cities for cultural-fit comparison">'+
   places.map(city=>'<button type="button" role="radio" aria-checked="'+(city.cityId===selected.cityId)+'" data-action="audience-select" data-id="'+esc(city.cityId)+
     '" aria-controls="audience-city-detail" tabindex="'+(city.cityId===selected.cityId?'0':'-1')+'" class="audience-city'+(city.cityId===selected.cityId?' selected':'')+'"><strong>'+esc(city.name)+'</strong>'+
     '<span>'+esc(city.relativeLabel)+(city.routeOptionId?' · route nominated':' · taste lead only')+'</span>'+
     '<small>'+esc(audienceCityReason(city))+
     '</small></button>').join('')+'</div>'+
   '<div id="audience-city-detail" class="audience-insight"><h3>What this tells you</h3>'+
   '<p><strong>'+esc(selected.name)+':</strong> '+esc(audienceCityReason(selected))+'</p>'+
   '<p>Where to investigate a show. Capacity, availability and travel still need independent checks.</p></div>'+
   action(selected.routeOptionId?'Try '+selected.name+' in a route →':'Route not checked for '+selected.name,
     'audience-try',true,!selected.routeOptionId)+
   action('Inspect the taste evidence →','audience-evidence')+
   fallback('Relative ranking only · '+(isLive?'real Qloo artist queries':ctx.audience.source==='live-fit-unresolved'?'live fit unresolved':'synthetic fixture')+' · venue bookings fictional.')+'</section></div>'
   :'<div class="fan-source-empty"><div class="fan-empty-mark">♡</div><h2>Fan requests are separate.</h2>'+
   '<p>No recorded fan declarations are available in this prototype. The public fan page is a visual preview: its button does not save votes or emails.</p>'+
   '<p class="soft-status">? Collection, consent and aggregation - Unknown / To confirm</p>'+
   action('Preview the public fan page →','open-fan',true)+
   fallback('No individual location tracking and no invented fan counts. Qloo ranks remain unchanged.')+'</div>')+
   '</div><div id="audience-panel-'+(mode?'fans':'qloo')+'" role="tabpanel" aria-labelledby="audience-tab-'+(mode?'fans':'qloo')+'" hidden></div>'+
   (ctx.audienceEvidenceOpen?'<div class="audience-evidence"><h3>Evidence provenance</h3><ul>'+
     ctx.projection.evidence.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>'+action('Download audit JSON ↓','audit')+'</div>':'')+
   '</section>';
}
function itineraryRow(date:string,city:string,state:string):string{
 return '<div class="sim-stop"><time>'+esc(date)+'</time><div><strong>'+esc(city)+'</strong>'+
   '<span>'+esc(state)+'</span></div></div>';
}
function simulation(ctx:DesktopViewContext):string{
 const s=ctx.simulation;
 if(!s)return '<section class="feature-page">'+titleRow('What-if simulation','Choose a checked route alternative.','Draft')+
   action('Open repair directions →','rescue',true)+'</section>';
 const pass=s.verdict==='PASS';
 const statusText=pass?'Fits declared checks (conditional).':s.verdict==='FAIL'?
   'Does not meet current limits.':'Needs more evidence.';
 const distanceEditor='<details class="sim-edit map-reference-details"><summary>Adjust extra-distance preference</summary><label for="sim-cap">What if extra distance were allowed up to (km)?</label>'+
   '<input type="text" id="sim-cap" inputmode="decimal" autocomplete="off" spellcheck="false" value="'+esc(ctx.simulationCapDraft ?? String(s.maxAdditionalDistanceKm))+'">'+
   (ctx.simulationCapError?'<p class="sim-input-error" role="alert">× Invalid distance cap: '+esc(ctx.simulationCapError)+'</p>':'')+
   action('Recheck one assumption →','sim-recheck')+'</details>';
 return '<section class="feature-page simulation-page">'+
   titleRow('What changes the recommendation?','Replace '+ctx.projection.cancelledCity+' on '+s.changedDate,'DRAFT SCENARIO',
     action('Close scenario →','sim-close'))+
   distanceEditor+
   '<section class="recommendation-change" aria-label="Recommendation before and after" aria-live="polite">'+
   '<div><span>Before · '+esc(formatExtraKm(s.originalDistanceCapKm))+' extra-distance cap</span><strong data-recommendation="before">'+esc(s.beforeRecommendation.name)+'</strong></div>'+
   '<span class="recommendation-arrow" aria-hidden="true">→</span>'+
   '<div><span>After · '+esc(formatExtraKm(s.maxAdditionalDistanceKm))+' extra-distance cap</span><strong data-recommendation="after">'+esc(s.afterRecommendation.name)+'</strong></div>'+
   '<p>'+esc(s.recommendationChanged?'Recommendation changed.':'Recommendation unchanged.')+' '+esc(s.afterRecommendation.reason)+'</p>'+
   '<p>Only the additional-distance cap changes. Daily driving stays at '+esc(s.maxDailyDriving)+'. Four confirmed shows stay locked.</p>'+
   action('Download this what-if audit ↓','sim-audit')+'</section>'+
   '<div class="feature-tabs" role="tablist" aria-label="Simulation scope">'+
   '<button id="simulation-tab-route" type="button" role="tab" data-action="sim-route-tab" aria-selected="'+(ctx.simulationTab==='route')+'" aria-controls="simulation-panel-route" tabindex="'+(ctx.simulationTab==='route'?'0':'-1')+'">Route</button>'+
   '<button id="simulation-tab-budget" type="button" role="tab" data-action="sim-budget-tab" aria-selected="'+(ctx.simulationTab==='budget')+'" aria-controls="simulation-panel-budget" tabindex="'+(ctx.simulationTab==='budget'?'0':'-1')+'">Budget · ? Needs review</button></div>'+
   '<p class="audience-disclosure">ⓘ Local draft only. The four confirmed shows and the original comparison remain unchanged.</p>'+
   '<div id="simulation-panel-'+ctx.simulationTab+'" role="tabpanel" aria-labelledby="simulation-tab-'+ctx.simulationTab+'" tabindex="0">'+
   (ctx.simulationTab==='route'?
   '<div class="sim-columns"><section class="sim-itinerary"><h2>Reviewing: '+esc(s.cityName)+'</h2>'+
   '<p class="sim-reviewed-option">'+(s.afterRecommendation.optionId===s.optionId?'This is the current recommendation.':'Manually viewed alternative. Current recommendation: '+esc(s.afterRecommendation.name)+'.')+'</p>'+
   (s.afterRecommendation.optionId && s.afterRecommendation.optionId!==s.optionId? action('Review the recommended option →','sim-follow-recommendation'):'')+
   '<p class="muted">Current plan: '+esc(s.baseline)+'</p>'+
   '<div class="sim-line">'+
    itineraryRow(s.fromDate,s.fromCity,'Existing locked date')+
    '<p class="sim-transfer">↝ '+esc(s.inbound)+' · frozen OSRM</p>'+
    itineraryRow(s.changedDate,s.cityName,'Proposed · not booked')+
    '<div class="sim-city-switch">'+action(ctx.changeCityOpen?'Hide alternatives ↑':'Change city →','sim-change-city')+
      (ctx.changeCityOpen?'<div class="sim-alternatives">'+ctx.projection.options.filter(o=>o.kind!=='day-off').map(o=>
        '<button type="button" data-action="sim-pick" data-id="'+esc(o.id)+'">'+esc(o.cityName)+'</button>').join('')+'</div>':'')+'</div>'+
    '<p class="sim-transfer">↝ '+esc(s.outbound)+' · frozen OSRM</p>'+
    itineraryRow(s.toDate,s.toCity,'Existing locked date')+'</div>'+
   '<div class="sim-totals"><div><span>Total tour driving</span><strong>'+esc(s.totalDriving)+'</strong></div>'+
    '<div><span>Versus day-off</span><strong>'+esc(s.difference)+'</strong></div></div></section>'+
   '<section class="sim-checks"><h2>'+esc(statusText)+'</h2>'+
   '<p class="muted">Results are audited against the existing '+esc(s.maxDailyDriving)+' daily limit and declared preferences.</p>'+
   '<div class="sim-check-list">'+s.checks.slice(0,3).map(check=>
      '<div><div><strong>'+esc(check.label)+'</strong>'+status(check.status)+'</div><p>'+esc(check.explanation)+'</p></div>').join('')+'</div>'+
   '<div class="sim-distance-status"><p class="soft-status">'+status(s.checks[3]?.status??'UNKNOWN')+
    ' Extra-distance preference · current cap '+esc(formatExtraKm(s.maxAdditionalDistanceKm))+'</p>'+
    (s.checks[3] && s.checks[3].status!=='PASS'
      ? '<p class="sim-failed-explanation" role="status">'+esc(s.checks[3].explanation)+'</p>':'')+
   (ctx.actionNotice?'<p class="feature-action-notice" role="status">'+esc(ctx.actionNotice)+'</p>':'')+'</div>'+
   '<div class="sim-final-action">'+action(ctx.savedDraft?'Save updated draft →':'Save draft scenario →','sim-save',true)+
   (ctx.savedDraft?'<p class="soft-status">✓ Saved on this device only - no tour, venue or booking updated.</p>':'')+
   action(s.verdict==='FAIL'?'View why it fails →':'Preview promoter proposal →',
     s.verdict==='FAIL'?'sim-evidence':'sim-proposal')+
   action('Inspect sensitivity & control →','sim-full-evidence')+
   fallback('Confirmed dates locked · proposed city remains unbooked · all missing facts stay Unknown / To confirm.')+
   '</div></section></div>'
   :'<div class="sim-budget"><h2>Budget needs a separate review.</h2>'+
   '<p class="muted">A city choice and route evidence cannot confirm a venue fee or sell tickets.</p>'+
   '<div class="sim-check-list"><div><strong>Declared extra-distance cap</strong><p>'+esc(formatExtraKm(s.maxAdditionalDistanceKm))+' · checked by the deterministic core</p></div>'+
   '<div><strong>Actual venue terms</strong><p>? Unknown / To confirm - core booking fields are synthetic</p></div>'+
   '<div><strong>Attendance and settlement</strong><p>? Unknown / To confirm - not derivable from Qloo affinity</p></div></div>'+
   action('Review sample economics →','open-economics',true)+
   fallback('The economics preview uses separate, labelled assumptions rather than observed ticket sales.')+'</div>')+
   '</div><div id="simulation-panel-'+(ctx.simulationTab==='route'?'budget':'route')+
   '" role="tabpanel" aria-labelledby="simulation-tab-'+(ctx.simulationTab==='route'?'budget':'route')+'" hidden></div>'+
   '</section>';
}
function agency(ctx:DesktopViewContext):string{
 const list=agencyTasks(ctx.agencyOwners),all=ctx.agencyFilter==='all';
 return '<section class="feature-page agency-page">'+
   titleRow('Your team’s next moves.','Agency overview · 4 fictional active tours','Sample agency',
     action('Share overview →','agency-share'))+
   '<div class="feature-tabs" role="tablist" aria-label="Agency queue">'+
   '<button id="agency-tab-attention" type="button" role="tab" data-action="agency-attention" aria-selected="'+(!all)+'" aria-controls="agency-panel-attention" tabindex="'+(!all?'0':'-1')+'">Needs attention 3</button>'+
   '<button id="agency-tab-all" type="button" role="tab" data-action="agency-all" aria-selected="'+all+'" aria-controls="agency-panel-all" tabindex="'+(all?'0':'-1')+'">All tours 4</button></div>'+
   '<p class="audience-disclosure">ⓘ Times are written in the venue-local zone; all names and incidents are fictional sample data.</p>'+
   '<div id="agency-panel-'+(all?'all':'attention')+'" role="tabpanel" aria-labelledby="agency-tab-'+(all?'all':'attention')+'" tabindex="0">'+
   '<div class="agency-header"><span>Artist</span><span>Needs a decision</span><span>Owner / deadline</span><span>Next action</span></div>'+
   '<div class="agency-queue">'+list.map(task=>
   '<section class="agency-row"><div class="agency-artist"><strong>'+esc(task.artist)+'</strong><span>'+esc(task.tour)+'</span></div>'+
   '<div class="agency-issue"><span class="agency-issue-status agency-issue-status-'+esc(task.id)+'">'+
     (task.id==='drum'?'● Needs local help':task.id==='leipzig'?'× Canceled':
       task.owner==='Unassigned'?'● Needs owner':'✓ Owner assigned')+'</span>'+
     '<strong>'+esc(task.issue)+'</strong><span>'+esc(task.detail)+'</span></div>'+
   '<div class="agency-owner"><strong>'+esc(task.owner==='Unassigned'?'? Unassigned':task.owner)+'</strong>'+
     '<span>'+esc(task.deadline)+'</span></div>'+
   '<div class="agency-action">'+action(task.action+' →',task.id==='drum'?'agency-sos':
      task.id==='leipzig'?'rescue':'agency-assign',task.id==='drum')+'</div></section>').join('')+'</div>'+
   (ctx.assigningTask?'<section class="agency-assignment"><h3>Assign sample owner for Night Ferry</h3>'+
      '<label for="agency-owner">Owner</label><select id="agency-owner">'+
      (['Unassigned','Marta','You','Alex'] as AgencyOwner[]).map(owner=>
        '<option value="'+esc(owner)+'"'+(owner===ctx.proposedOwner?' selected':'')+'>'+esc(owner)+'</option>').join('')+'</select>'+
      action('Save local assignment →','agency-owner-save',true)+
      fallback('Changes only the in-memory sample queue; no notification is sent.')+'</section>':'')+
   (all?'<div class="agency-fourth"><strong>'+esc(AGENCY_FOURTH_TOUR.name)+'</strong>'+
     '<span>✓ '+esc(AGENCY_FOURTH_TOUR.status)+'</span></div>':
     '<div class="agency-bottom"><p>✓ Fourth sample tour has no open items.</p>'+
       action('See all tours →','agency-all')+'</div>')+
   (ctx.agencyNotice?'<p class="soft-status" role="status">'+esc(ctx.agencyNotice)+'</p>':'')+
   fallback('Designed agency workspace · assignments and outreach do not persist to a remote service.')+
   '</div><div id="agency-panel-'+(all?'attention':'all')+
   '" role="tabpanel" aria-labelledby="agency-tab-'+(all?'attention':'all')+'" hidden></div>'+
   '</section>';
}
export function renderDesktopFeature(screen:DesktopScreen,ctx:DesktopViewContext):string{
 switch(screen){
 case 'audience':return audience(ctx);
 case 'simulation':return simulation(ctx);
 case 'agency':return agency(ctx);
 }
}
