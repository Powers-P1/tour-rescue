import type { ApiDecisionResult } from '../../worker/src/app.ts';
import { createDecisionAudit } from '../../src/core/audit.ts';
import { recommendationName } from './evidence-view.ts';
export const V2_RELEASE='web2-2026-10-23';
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
  control:control.status==='known'?{status:'known',recommendation:control.value.decision.recommendation,
    changed:control.value.recommendedOptionChanged,gate:control.value.zeroViolationsGate.status}:{status:'unknown',reason:control.reason},
  artistOmissions:audit.analysis.artistSensitivity.runs.map(row=>({artistId:row.removed.artistId,outcome:row.outcome,reason:row.reason,recommendation:row.decision.recommendation})),
  sources:audit.queries.map(query=>({queryId:query.queryId,parameters:query.parameters,operation:query.operation,source:query.source,status:query.status,recordedAt:query.responseRecordedAt})),
  limits:['Frozen Germany city set and city-centre OSRM snapshot.','Bookings and venue facts remain a sample scenario.','Incomplete evidence is UNKNOWN; no synthetic values replace missing data.','Different-artist and no-taste comparisons keep the same constraints; a lack of change is reported.']};
}
