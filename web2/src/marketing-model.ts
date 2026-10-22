import { createDemoResult } from '../../web/src/data.ts';
import type { ApiDecisionResult } from '../../web/src/data.ts';
import { createLandingModel } from '../../web/src/landing-model.ts';
import type { LandingModel } from '../../web/src/landing-model.ts';
import { projectRescue } from './model.ts';
import type { RescueProjection } from './model.ts';

export const PUBLIC_REPOSITORY='https://github.com/Powers-P1/tour-rescue';
export const PUBLIC_LICENSE=PUBLIC_REPOSITORY+'/blob/main/LICENSE';
export const PUBLIC_API_DOCS=PUBLIC_REPOSITORY+'/blob/main/docs/API.md';
export const PUBLIC_AGENT_DOCS=PUBLIC_REPOSITORY+'/blob/main/docs/AI_RESCUE.md';

/** Same original frozen synthetic evidence as the interactive app; never a fresh Qloo call. */
export interface PublicSiteModel {
  readonly original:ApiDecisionResult;
  readonly landing:LandingModel;
  readonly rescue:RescueProjection;
  readonly sourceLabel:'Synthetic taste fixture + frozen recorded OSRM';
  readonly appHref:'/app/#rescue';
  readonly judgesHref:'/judges/';
  readonly conceptFeatures:readonly string[];
}
export function publicSiteModel(result:ApiDecisionResult=createDemoResult()):PublicSiteModel {
  if(result.mode!=='demo')throw new TypeError('Public preview cannot masquerade as live Qloo evidence.');
  return { original:result,landing:createLandingModel(result),rescue:projectRescue(result),
    sourceLabel:'Synthetic taste fixture + frozen recorded OSRM',
    appHref:'/app/#rescue',judgesHref:'/judges/',
    conceptFeatures:['Local SOS: sample suppliers and approval preview',
      'Planner and economics: user-supplied assumptions and unverified itinerary',
      'Fan page: visual vote preview without storage',
      'Agency operations: fictional task queue and local owner changes'] };
}
export function publicOptionStatus(status:'PASS'|'FAIL'|'UNKNOWN') {
 return status==='PASS'?'✓ PASS':status==='FAIL'?'× FAIL':'? UNKNOWN';
}
export function linkedEvidence(model:PublicSiteModel):readonly {label:string;detail:string;href:string}[] {
 return [
  {label:'Taste evidence',detail:'Synthetic fixture by default; explicit live Qloo action in the app',href:PUBLIC_API_DOCS},
  {label:'Feasibility',detail:'Recorded OSRM model, constraints and unresolved booking facts',href:'/app/#evidence'},
  {label:'Public source & licence',detail:'MIT-licensed code, reproducible tests and setup',href:PUBLIC_LICENSE},
 ];
}
