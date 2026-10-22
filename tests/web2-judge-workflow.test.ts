import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoResult, recomputeResult } from '../web/src/data.ts';
import { projectSimulation } from '../web2/src/desktop-model.ts';
import { createAiDemoSession } from '../src/ai/demo.ts';
import { acceptResearchIntoComparison, emptyResearch } from '../web2/src/research-comparison.ts';
import { auditExport } from '../web2/src/audit-download.ts';

const stamp='2026-10-23T00:00:00Z';
test('v2 exposes Nuremberg → Frankfurt separately from the manually reviewed option',()=>{
  const base=createDemoResult({runId:'v2-breakpoint',generatedAt:stamp});
  const simulation=projectSimulation(base,'replacement-nuremberg',354.1);
  assert.equal(simulation.beforeRecommendation.name,'Nuremberg');
  assert.equal(simulation.afterRecommendation.name,'Frankfurt am Main');
  assert.equal(simulation.optionId,'replacement-nuremberg');
  assert.equal(simulation.recommendationChanged,true);
  assert.equal(simulation.sourceResult.audit.replay.policy.maxAdditionalDistanceMetres,354100);
  assert.deepEqual(simulation.sourceResult.audit.replay.scenario.tour.shows,base.audit.replay.scenario.tour.shows);
  assert.equal(simulation.sourceResult.audit.replay.scenario.tour.constraints.maxDailyDrivingSeconds,
    base.audit.replay.scenario.tour.constraints.maxDailyDrivingSeconds);
});

test('v2 accepts into the current policy, preserves the other card and exports sourcing after a what-if',()=>{
  const base=createDemoResult({generatedAt:stamp,runId:'v2-accept'});
  const current=recomputeResult(base,{maxAdditionalDistanceMetres:354100});
  const session=createAiDemoSession('corridor-repair',{generatedAt:stamp});
  const proposal=session.proposals[0]!;
  const other=current.audit.replay.scenario.repairCandidates.find(row=>row.kind!==proposal.draft.kind&&row.kind!=='day-off');
  const accepted=acceptResearchIntoComparison(current,session,proposal.draft.id,emptyResearch(),
    {generatedAt:'2026-10-23T00:01:00Z',runId:'v2-accepted'});
  assert.equal(accepted.result.audit.replay.policy.maxAdditionalDistanceMetres,354100);
  assert.deepEqual(accepted.result.audit.replay.scenario.tour.shows,current.audit.replay.scenario.tour.shows);
  assert.deepEqual(accepted.result.audit.replay.scenario.repairCandidates.find(row=>row.id===other?.id),other);
  const whatIf=recomputeResult(accepted.result,{maxAdditionalDistanceMetres:100000});
  const exported=JSON.parse(auditExport(whatIf,'what-if',accepted.history).content);
  assert.equal(exported.schemaVersion,'tour-rescue.ai-audit.v1');
  assert.equal(exported.decisionAudit.replay.policy.maxAdditionalDistanceMetres,100000);
  assert.deepEqual(exported.accepted[0].sourceIds,proposal.draft.sourceIds);
  assert.ok(exported.session.sources.every((source:{id:string})=>session.sources.some(row=>row.id===source.id)));
});

test('v2 preserves UNKNOWN booking evidence and cancelled research cannot mutate the comparison',()=>{
  const base=createDemoResult({generatedAt:stamp,runId:'v2-unknown'});
  const before=JSON.stringify(base);
  const session=createAiDemoSession('evidence-gaps',{generatedAt:stamp});
  const accepted=acceptResearchIntoComparison(base,session,session.proposals[0]!.draft.id,emptyResearch(),
    {generatedAt:'2026-10-23T00:01:00Z',runId:'v2-unknown-accepted'});
  const venue=accepted.result.audit.replay.scenario.venues.find(row=>row.name===session.proposals[0]!.draft.venueName)!;
  assert.equal(venue.availability.status,'unknown');assert.equal(venue.fee.status,'unknown');
  assert.equal(venue.promoterTerms.status,'unknown');
  assert.throws(()=>acceptResearchIntoComparison(base,{...session,stopReason:'cancelled'},session.proposals[0]!.draft.id,
    emptyResearch(),{generatedAt:'2026-10-23T00:01:00Z',runId:'cancelled'}));
  assert.equal(JSON.stringify(base),before);
});
