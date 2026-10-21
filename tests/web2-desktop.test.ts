import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoResult } from '../web/src/data.ts';
import { relativeFitLabel, projectAudience, projectSimulation, loadSimulation,
  saveSimulation, SIM_DRAFT_KEY, agencyTasks } from '../web2/src/desktop-model.ts';

test('audience displays audited core cities, not bitmap sample Erfurt',()=>{
  const demo=createDemoResult({generatedAt:'2026-10-21T12:00:00Z',runId:'audience-test'});
  const a=projectAudience(demo);
  assert.equal(a.source,'synthetic-taste-fixture');
  assert.equal(a.places.length,3);
  assert.deepEqual(a.places.slice(0,2).map(p=>p.cityId),['de-nuremberg','de-frankfurt']);
  assert.equal(a.fanCollectionEnabled,false);
  assert.ok(a.places.every(p=>p.lat>45 && p.lon>5));
  assert.equal(a.places[2]?.routeOptionId,null,'taste lead must not be sold as route-checked');
});
test('audience labels are relative indices, never listener counts or ticket forecasts',()=>{
  assert.equal(relativeFitLabel({status:'known',value:70}),'High relative fit');
  assert.equal(relativeFitLabel({status:'known',value:55}),'Moderate relative fit');
  assert.equal(relativeFitLabel({status:'unknown',reason:'no Qloo'}),'Unknown / To confirm');
});
test('what-if recomputes policy with core without changing four locked commitments',()=>{
  const base=createDemoResult({generatedAt:'2026-10-21T12:00:00Z',runId:'sim-baseline'});
  const before=base.audit.replay.scenario.tour.shows.filter(x=>x.status==='confirmed');
  const whatIf=projectSimulation(base,'detour-frankfurt',400);
  const after=whatIf.sourceResult.audit.replay.scenario.tour.shows.filter(x=>x.status==='confirmed');
  assert.deepEqual(after,before);
  assert.equal(base.audit.replay.policy.maxAdditionalDistanceMetres,350000);
  assert.equal(whatIf.sourceResult.audit.replay.policy.maxAdditionalDistanceMetres,400000);
  assert.equal(whatIf.status,'PROPOSED / NOT BOOKED');
  assert.equal(whatIf.checks.find(c=>c.id==='capacity')?.status,'UNKNOWN');
  assert.throws(()=>projectSimulation(base,'made-up-city',400));
  assert.throws(()=>projectSimulation(base,'replacement-nuremberg',600));
});
test('simulation draft stores small scoped preferences, not an audit or booking',()=>{
  const entries=new Map<string,string>();
  const storage={setItem:(k:string,v:string)=>entries.set(k,v),getItem:(k:string)=>entries.get(k)??null};
  const value={schemaVersion:'tour-rescue.web2-sim-draft.v1' as const,baseRunId:'run-7',
    optionId:'replacement-nuremberg',extraKm:350};
  saveSimulation(storage,value);
  assert.deepEqual(loadSimulation(storage,'run-7'),value);
  assert.equal(loadSimulation(storage,'different-Qloo-run'),null);
  assert.equal(JSON.parse(entries.get(SIM_DRAFT_KEY)!).sourceResult,undefined);
});
test('agency statuses and owners are explicitly synthetic and require local assignment',()=>{
  const tasks=agencyTasks();
  assert.equal(tasks.length,3);
  assert.equal(tasks[2]?.owner,'Unassigned');
  const edited=agencyTasks({presale:'Alex'});
  assert.equal(edited[2]?.owner,'Alex');
  assert.equal(tasks[2]?.owner,'Unassigned');
});
