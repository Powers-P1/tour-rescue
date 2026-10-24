import type { ApiDecisionResult } from '../../worker/src/app.ts';
import { createDecisionAudit } from '../../src/core/audit.ts';
import { recommendationName } from './recommendation-name.ts';
export const V2_RELEASE='web2-2026-10-23';
/** Published summary only, transcribed from the linked validation report; no provider payloads. */
export const RECORDED_QLOO_STUDY = {
 reportUrl:'https://github.com/Powers-P1/tour-rescue/blob/main/docs/validation/live-qloo-2026-10-23.md',
 measuredFrom:'2026-10-22T22:17:00Z',measuredTo:'2026-10-22T22:19:00Z',
 appVersion:'web2-2026-10-23',baseRevision:'e063b0e',workerVersion:'0.6.0-pr6',
 candidateSetId:'cities-de-v1',cityCount:24,maxAdditionalDistanceMetres:350000,minimumFit:20,
 runs:[
  {target:'Radiohead',comparisons:['The National','Arctic Monkeys'],control:'Dua Lipa',
   coverage:24,recommendation:'Nuremberg',controlChanged:false,omissionsChanged:false,
   runId:'0ac280d0-abbc-42ac-837a-ea6054dca6f0'},
  {target:'Arctic Monkeys',comparisons:['Radiohead','The National'],control:'Dua Lipa',
   coverage:24,recommendation:'Nuremberg',controlChanged:false,omissionsChanged:false,
   runId:'fedb9749-7401-4b51-be8f-92ca37b7e9e6'},
  {target:'Dua Lipa',comparisons:['Radiohead','The National'],control:'Arctic Monkeys',
   coverage:24,recommendation:'Nuremberg',controlChanged:false,omissionsChanged:false,
   runId:'7dc0c2de-670c-47f6-b453-869a10c37d43'},
 ],
} as const;
/** Derived coverage and decisions only. Never export raw provider responses or affinities. */
export function projectLiveStudy(result:ApiDecisionResult,workerVersion:string){
 if(result.mode!=='live'||result.audit.mode!=='live')throw new TypeError('A live study requires a genuine live result.');
 const audit=result.audit,fit=audit.replay.fitInput;
 const noTaste=createDecisionAudit({scenario:audit.replay.scenario,candidateSet:audit.replay.candidateSet.status==='known'?audit.replay.candidateSet.value:undefined,
   policy:audit.replay.policy,ranges:audit.replay.ranges,queries:[],generatedAt:audit.generatedAt,runId:audit.runId+':no-taste',mode:'live'});
 const signature=(value:typeof audit.analysis.decision.recommendation)=>value.status==='recommended'?value.optionId:value.status;
 const control=audit.controlRun;
 return {appVersion:V2_RELEASE,workerVersion,evaluatedAt:audit.generatedAt,runId:audit.runId,artists:result.artists,
  frozenCities:audit.frozenCandidateSet,policy:audit.replay.policy,
  profiles:fit.status==='known'?fit.value.profiles.map(profile=>({artistId:profile.artistId,role:profile.role,
    knownCities:profile.observations.filter(row=>row.affinity.status==='known').length,
    totalCities:profile.observations.length,
    missingCityIds:profile.observations.filter(row=>row.affinity.status==='unknown').map(row=>row.cityId)})):[],
  fitStatus:fit.status,fitUnknownReason:fit.status==='unknown'?fit.reason:null,
  recommendation:{...audit.analysis.decision.recommendation,name:recommendationName(result)},
  withoutTaste:{...noTaste.analysis.decision.recommendation,changesDecision:signature(noTaste.analysis.decision.recommendation)!==signature(audit.analysis.decision.recommendation)},
  control:control.status==='known'?{status:'known' as const,recommendation:control.value.decision.recommendation,
    changed:control.value.recommendedOptionChanged,gate:control.value.zeroViolationsGate.status}:{status:'unknown' as const,reason:control.reason},
  artistOmissions:audit.analysis.artistSensitivity.runs.map(row=>({artistId:row.removed.artistId,outcome:row.outcome,reason:row.reason,recommendation:row.decision.recommendation})),
  sources:audit.queries.map(query=>({queryId:query.queryId,parameters:query.parameters,operation:query.operation,source:query.source,status:query.status,recordedAt:query.responseRecordedAt})),
  limits:['Frozen Germany city set and city-centre OSRM snapshot.','Bookings and venue facts remain a sample scenario.','Incomplete evidence is UNKNOWN; no synthetic values replace missing data.','Different-artist and no-taste comparisons keep the same constraints; a lack of change is reported.']};
}
