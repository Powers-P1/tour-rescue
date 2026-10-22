/** Shared, entirely offline Germany map for landing, Command and Audience.
 * Coordinates are city centres, not routing geometry or venue locations.
 */
import cityCatalog from '../../fixtures/cities_de.json' with {type:'json'};
import { GERMANY_MAP_VIEWBOX, GERMANY_OUTLINE_PATH, projectGermany } from './germany-geography.ts';

export interface GeographicCity {
  readonly id:string;
  readonly name:string;
  readonly lat:number;
  readonly lon:number;
}
const extras: readonly GeographicCity[]=[
  // Independent public city-centre coordinates, not members of the demo's
  // 24-city scoring/routing catalogue. Never present as candidate venues.
  {id:'de-erfurt',name:'Erfurt',lat:50.9848,lon:11.0299},
  {id:'de-halle',name:'Halle (Saale)',lat:51.4828,lon:11.9697},
];
export const GERMANY_MAP_CITIES: readonly GeographicCity[] = [
  ...cityCatalog.cities.map(({id,name,lat,lon})=>({id,name,lat,lon})),
  ...extras,
];
const byId=new Map(GERMANY_MAP_CITIES.map(city=>[city.id,city]));
const byName=new Map(GERMANY_MAP_CITIES.map(city=>[city.name.toLowerCase(),city]));
byName.set('frankfurt',byId.get('de-frankfurt')!);
byName.set('halle',byId.get('de-halle')!);
const safe=(value:unknown)=>String(value??'').replace(/[&<>"']/g,ch=>
 ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]??ch);
const num=(value:number)=>Number(value.toFixed(2));
export const GEOGRAPHIC_KEY_IDS=[
  'de-hamburg','de-berlin','de-leipzig','de-dresden','de-erfurt','de-halle',
  'de-nuremberg','de-frankfurt','de-munich','de-cologne','de-dortmund',
] as const;

export interface GermanyMapOptions {
  /** Unique per mounted page for id/aria-describedby references. */
  readonly scope:'landing'|'command'|'audience';
  readonly from?:string;
  readonly cancelled?:string;
  readonly to?:string;
  /** These are route options supplied by the audited core, never inferred from taste. */
  readonly proposalIds?:readonly string[];
  readonly preferredProposalId?:string|null|undefined;
  readonly selectedCityId?:string|null;
  readonly routes?:boolean;
}
export function cityByName(name:string):GeographicCity|undefined {
  return byName.get(name.toLowerCase());
}
export function cityById(id:string):GeographicCity|undefined {
  return byId.get(id);
}
export const mapPoint=(city:GeographicCity):readonly [number,number]=>
  projectGermany(city.lon,city.lat);

const asCircle=(city:GeographicCity,kind:string,scope:string):string=>{
 const [x,y]=mapPoint(city);
 const isCanceled=kind==='cancelled';
 return '<g class="geo-city geo-city-'+kind+'" data-city-id="'+safe(city.id)+'">'+
  '<title>'+safe(city.name)+(isCanceled?' · Canceled':'')+'</title>'+
  '<circle cx="'+x+'" cy="'+y+'" r="'+(kind==='context'?3.5:6.5)+'"/>'+
  (isCanceled?'<path class="geo-cancel-cross" d="M'+num(x-4)+' '+num(y-4)+
    'L'+num(x+4)+' '+num(y+4)+' M'+num(x+4)+' '+num(y-4)+'L'+num(x-4)+' '+num(y+4)+'"/>':'')+
  '</g>';
};
/**
 * Displaced, linked marker badges are used only below 1100px; the geography
 * remains a centre-point map. These per-city placements keep tightly packed
 * Leipzig/Halle/Erfurt and Rhine-Ruhr dots distinguishable at 390px.
 * Numbers always come from GEOGRAPHIC_KEY_IDS, never the order of the DOM.
 */
const mobileNumberOffset:Readonly<Record<string,readonly [number,number]>>={
 'de-hamburg':[15,-28], 'de-berlin':[27,-12],
 'de-leipzig':[24,19], 'de-dresden':[36,33],
 'de-erfurt':[-32,17], 'de-halle':[-13,-36],
 'de-nuremberg':[29,17], 'de-frankfurt':[-29,27],
 'de-munich':[26,17], 'de-cologne':[-29,31], 'de-dortmund':[-35,-19],
};
/** Desktop labels use genuine city names at projected coordinates.
 * Short "Frankfurt" fits the map; the full "Frankfurt am Main" stays in the key.
 */
const desktopLabelPlacement:Readonly<Record<string,{
 readonly dx:number;readonly dy:number;readonly anchor:'start'|'end';
 readonly label?:string;
}>>={
 'de-hamburg':{dx:-13,dy:-24,anchor:'end'},
 'de-berlin':{dx:18,dy:-17,anchor:'start'},
 'de-leipzig':{dx:18,dy:26,anchor:'start'},
 'de-munich':{dx:17,dy:21,anchor:'start'},
 'de-cologne':{dx:-18,dy:31,anchor:'end'},
 'de-frankfurt':{dx:-18,dy:39,anchor:'end',label:'Frankfurt'},
 'de-nuremberg':{dx:20,dy:-12,anchor:'start'},
};
const curved=(a:GeographicCity,b:GeographicCity,bias:number)=>{
 const [x1,y1]=mapPoint(a),[x2,y2]=mapPoint(b);
 const mx=num((x1+x2)/2+bias),my=num((y1+y2)/2-8);
 return 'M'+x1+' '+y1+' Q'+mx+' '+my+' '+x2+' '+y2;
};
export function renderGermanyGeographicMap(opts:GermanyMapOptions):string {
 const from=cityByName(opts.from??'Berlin')??byId.get('de-berlin')!;
 const cancelled=cityByName(opts.cancelled??'Leipzig')??byId.get('de-leipzig')!;
 const to=cityByName(opts.to??'Munich')??byId.get('de-munich')!;
 const requestedIds=(opts.proposalIds??['de-nuremberg','de-frankfurt']);
 const proposals=[...new Set(requestedIds)].map(id=>byId.get(id)).filter((city):city is GeographicCity=>city!==undefined);
 const selected=opts.preferredProposalId??(proposals[0]?.id??null);
 const canceled=cancelled.id;
 const confirmed=new Set(['de-hamburg','de-berlin','de-munich','de-cologne',from.id,to.id]);
 const proposalSet=new Set(proposals.map(c=>c.id));
 const routes=opts.routes!==false;
 const [x1,y1]=mapPoint(from),[x2,y2]=mapPoint(cancelled),[x3,y3]=mapPoint(to);
 const current='M'+x1+' '+y1+'L'+x2+' '+y2+'L'+x3+' '+y3;
 const routePaths=routes?'<path class="geo-route-current" d="'+current+'"/>'+
    proposals.map((candidate,i)=>'<path class="geo-route-proposal'+
      (candidate.id===selected?' geo-route-selected':' geo-route-alternative')+
      '" data-route-candidate="'+safe(candidate.id)+'" d="'+
      curved(from,candidate,i===0?-20:23)+' '+curved(candidate,to,i===0?17:-23)+'"/>').join(''):'';
 const activeMarkers=GERMANY_MAP_CITIES.map(city=>{
    const kind=city.id===canceled?'cancelled':
      proposalSet.has(city.id)?'proposed':confirmed.has(city.id)?'confirmed':
      city.id===opts.selectedCityId?'selected':'context';
    return asCircle(city,kind,opts.scope);
 }).join('');
 const markerKind=(city:GeographicCity):string=>
   city.id===canceled?'cancelled':proposalSet.has(city.id)?'proposed':
   confirmed.has(city.id)?'confirmed':'context';
 // Stable, numbered callouts, one per corresponding HTML key entry. A short
 // leader connects the badge to the real city dot without moving that dot.
 const numbered=GEOGRAPHIC_KEY_IDS.map((cityId,i)=>{
   const city=byId.get(cityId)!;
   const [x,y]=mapPoint(city);
   const offset=mobileNumberOffset[cityId]??[24,-24];
   const cx=num(x+offset[0]!),cy=num(y+offset[1]!);
   const number=i+1;
   return '<g class="geo-number-callout geo-number-'+markerKind(city)+
     '" data-numbered-city="'+safe(cityId)+'" data-key-number="'+number+'" aria-hidden="true">'+
     '<path class="geo-number-leader" d="M'+x+' '+y+'L'+cx+' '+cy+'"/>'+
     '<circle class="geo-number-bubble" cx="'+cx+'" cy="'+cy+'" r="21"/>'+
     '<text x="'+cx+'" y="'+cy+'" text-anchor="middle" dominant-baseline="central">'+number+'</text></g>';
 }).join('');
 // Direct labels only for genuinely route-related points: four confirmed,
 // cancelled Leipzig and both candidate cities. Other city dots remain
 // grounded in the full key without a dense stack of SVG names.
 const directLabels=GERMANY_MAP_CITIES.filter(city=>markerKind(city)!=='context').map(city=>{
   const place=desktopLabelPlacement[city.id]??{dx:18,dy:-17,anchor:'start'};
   const [x,y]=mapPoint(city);
   const label='label' in place && typeof place.label==='string'?place.label:city.name;
   return '<g class="geo-direct-label geo-label-'+markerKind(city)+
     '" data-labelled-city="'+safe(city.id)+'" aria-hidden="true">'+
     '<text x="'+num(x+place.dx)+'" y="'+num(y+place.dy)+'" text-anchor="'+place.anchor+'">'+
     safe(label)+'</text></g>';
 }).join('');
 const marks=GEOGRAPHIC_KEY_IDS.map((cityId,i)=>{
    const city=byId.get(cityId)!;
    const kind=markerKind(city),number=i+1;
    return '<span class="geo-key-item" data-key-city="'+safe(cityId)+'" data-key-number="'+number+'">'+
      '<i class="geo-key-number geo-key-number-'+kind+'" aria-hidden="true">'+number+'</i>'+
      '<span>'+safe(city.name)+(kind==='cancelled'?' · Canceled':
         kind==='proposed'?' · Candidate':'')+'</span></span>';
 }).join('');
 const id=opts.scope;
 return '<div class="germany-map-geo" data-map-scope="'+id+'">'+
  '<svg class="germany-geo-svg" viewBox="'+GERMANY_MAP_VIEWBOX+'" preserveAspectRatio="xMidYMid meet" role="img"'+
     ' aria-labelledby="geo-title-'+id+'" aria-describedby="geo-key-'+id+'">'+
  '<title id="geo-title-'+id+'">Germany: accurate public-domain outline with city-centre coordinates, current tour route and unbooked alternatives</title>'+
  '<rect class="geo-background" width="640" height="455" rx="9"/>'+
  '<path class="geo-country-outline" d="'+GERMANY_OUTLINE_PATH+'"/>'+
  routePaths+'<g class="geo-city-markers">'+activeMarkers+'</g>'+
  '<g class="geo-numbered-markers">'+numbered+'</g>'+
  '<g class="geo-direct-labels">'+directLabels+'</g></svg>'+
  '<div class="geo-route-legend">'+
    '<span><i class="geo-line-current"></i> Solid: current plan</span>'+
    (routes?'<span><i class="geo-line-proposed"></i> Dashed: Proposed</span>':'<span>City-centre references</span>')+
  '</div>'+
  '<div id="geo-key-'+id+'" class="geo-city-key" aria-label="City names corresponding to the map locations">'+marks+'</div>'+
  '<p class="geo-provenance">Germany outline: Natural Earth 1:10m · WGS84 city-centre coordinates. '+
   'Proposals are not bookings and lines do not follow roads.</p>'+
  '</div>';
}
