import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createDecisionAudit } from '../src/core/audit.ts';
import { germanyDemoInputs, syntheticQueryEvidence } from '../src/demo/germany.ts';
import type { ApiDecisionResult } from '../worker/src/app.ts';
import { buildPromoterModel, groupPromoterChecks } from '../web/src/promoter-model.ts';
import { createDemoResult } from '../web/src/data.ts';
import { projectSimulation } from '../web2/src/desktop-model.ts';
import { auditExport } from '../web2/src/audit-download.ts';
import { initialIncident, transitionIncident } from '../web2/src/state.ts';

// The browser renderer is typechecked by web/tsconfig.json. A dynamic URL keeps
// DOM globals out of the separate Node-only core typecheck while testing its real code.
const {createPromoterPng,installPromoterPrintSizing}: {
 createPromoterPng(result:ApiDecisionResult,optionId:string):Promise<Blob>;
 installPromoterPrintSizing(selector:string):void;
}=await import(new URL('../web/src/promoter.ts',import.meta.url).href);

const generatedAt = '2026-10-21T12:34:56.000Z';
const inputs = germanyDemoInputs();

function result(overrides: Partial<Parameters<typeof createDecisionAudit>[0]> = {}): ApiDecisionResult {
  const audit = createDecisionAudit({
    ...inputs, candidateSet: inputs.fitInput.candidateSet, generatedAt, mode: 'demo', runId: 'promoter-sheet-test',
    queries: syntheticQueryEvidence([inputs.fitInput, inputs.controlFitInput], generatedAt), ...overrides,
  });
  return { schemaVersion: 'tour-rescue.api-result.v1', mode: audit.mode, scenarioId: audit.scenarioId, artists: inputs.artists, audit };
}

test('promoter model uses the selected audited option, real fixture deltas and exactly three comparison slots', () => {
  const model = buildPromoterModel(result(), 'replacement-nuremberg');
  assert.equal(model.artist, 'The Harbour Lights');
  assert.equal(model.city, 'Nuremberg');
  assert.equal(model.date, 'Sat, 14 November 2026');
  assert.equal(model.fit, '25');
  assert.equal(model.extraDistance, '+18.368 km');
  assert.equal(model.extraDriving, '+27 min 29 s');
  assert.equal(model.maximumDailyDriving, '4 h 40 min 34 s');
  assert.equal(model.dailyDrivingLimit, '6 h');
  assert.equal(model.distanceLimit, '350 km');
  assert.equal(model.venueFee, 'EUR 500');
  assert.equal(model.venueFeeLimit, 'EUR 1,000');
  assert.equal(model.comparisons.length, 3);
  assert.deepEqual(model.comparisons[2], { slot: 3, name: 'UNKNOWN - no artist supplied', status: 'unknown' });
  assert.match(model.sensitivityNote, /1\/2 omissions retain.*1 change/);
  assert.equal(model.decisionStatus, 'PASS');
  assert.match(model.recommendation, /^Recommended/);
  assert.match(model.venue, /Venue to confirm/);
  assert.match(model.provenanceNote, /no venue is confirmed/);
});

test('promoter sheet distinguishes an excluded preference from routing feasibility and never borrows the winner gate', () => {
  const response = result();
  assert.equal(response.audit.analysis.repairs.options.find(option => option.id === 'detour-frankfurt')?.status, 'PASS');
  const model = buildPromoterModel(response, 'detour-frankfurt');
  assert.equal(model.city, 'Frankfurt am Main');
  assert.equal(model.fit, '58.7');
  assert.equal(model.decisionStatus, 'FAIL');
  assert.equal(model.recommendation, 'Excluded by current checks');
  assert.match(model.recommendationNote, /does not certify this alternative/);
  assert.equal(model.checkGroups.find(group => group.id === 'distance')?.status, 'FAIL');
  assert.equal(model.checkCounts.FAIL, 1);
  assert.ok(model.risks.some(risk => /additional road distance exceeds/.test(risk)));
});

test('day-off promoter sheet has no invented fit, venue fee or city', () => {
  const model = buildPromoterModel(result(), 'day-off');
  assert.equal(model.fit, 'N/A');
  assert.equal(model.venueFee, 'N/A');
  assert.equal(model.city, 'Day off - no performance city');
  assert.equal(model.extraDistance, '0 km');
  assert.equal(model.extraDriving, '0 s');
  assert.match(model.venue, /no venue required/);
  assert.match(model.fitNote, /no cultural-fit score/);
  assert.equal(model.recommendation, 'Selected alternative - not recommended');
});

test('promoter retains synthetic provenance, original source time and evaluation time separately', () => {
  const model = buildPromoterModel(result(), 'replacement-nuremberg');
  assert.equal(model.modeLabel, 'DEMO - synthetic taste data');
  assert.match(model.sourceLines[0]!, /no Qloo request or acquisition timestamp/);
  assert.match(model.sourceLines[1]!, /OSRM: osrm-matrix-de-v1; osrm-table; recorded 2026-10-21T09:14:14\+00:00/);
  assert.equal(model.generatedAt, generatedAt);
  assert.equal(model.runId, 'promoter-sheet-test');
  assert.ok(model.risks.some(risk => /UNKNOWN: capacity and promoter agreement/.test(risk)));
  assert.ok(model.risks.some(risk => /Booking facts are fictional/.test(risk)));
  assert.ok(model.risks.some(risk => /sensitive to a comparison artist/.test(risk)));
});

test('promoter unknown travel stays unknown instead of presenting partial daily allocations as a complete route', () => {
  const scenario = structuredClone(inputs.scenario);
  const changed = { ...scenario, roadMatrix: { ...scenario.roadMatrix,
    legs: scenario.roadMatrix.legs.filter(leg => !(leg.fromCityId === 'de-berlin' && leg.toCityId === 'de-nuremberg')),
  } };
  const response = result({ scenario: changed });
  const model = buildPromoterModel(response, 'replacement-nuremberg');
  assert.equal(model.maximumDailyDriving, 'UNKNOWN');
  assert.equal(model.extraDistance, 'UNKNOWN');
  assert.equal(model.extraDriving, 'UNKNOWN');
  assert.equal(model.decisionStatus, 'UNKNOWN');
  assert.equal(model.recommendation, 'Evidence needed - not recommended');
  assert.ok(model.checkCounts.UNKNOWN > 0);
  assert.ok(model.risks.some(risk => /UNKNOWN/.test(risk)));
});

test('every decision check is represented exactly once in promoter groups with FAIL and UNKNOWN precedence', () => {
  const response = result();
  for (const option of response.audit.analysis.decision.options) {
    const model = buildPromoterModel(response, option.optionId);
    assert.deepEqual(model.checkGroups.flatMap(group => group.checkIds).sort(), option.checks.map(check => check.id).sort());
    assert.equal(model.checkGroups.reduce((total, group) => total + group.checkIds.length, 0), model.checkCount);
    assert.equal(model.checkCounts.PASS + model.checkCounts.FAIL + model.checkCounts.UNKNOWN, model.checkCount);
  }
  const checks = [
    { id: 'travel:a:daily-driving', status: 'PASS' as const, message: '', evidence: {} },
    { id: 'travel:b:daily-driving', status: 'UNKNOWN' as const, message: '', evidence: {} },
  ];
  assert.equal(groupPromoterChecks(checks)[0]?.status, 'UNKNOWN');
  assert.equal(groupPromoterChecks([...checks, { id: 'travel:c:daily-driving', status: 'FAIL', message: '', evidence: {} }])[0]?.status, 'FAIL');
});

test('missing live fit and acquisition evidence remain explicit on the promoter sheet', () => {
  const queries = syntheticQueryEvidence([inputs.fitInput], generatedAt).map(query => ({
    ...query, source: 'live' as const, status: 'failed' as const,
    httpStatus: { status: 'known' as const, value: 429 },
    warnings: [],
  }));
  const response = result({ fitInput: undefined, controlFitInput: undefined, mode: 'live', queries });
  const model = buildPromoterModel(response, 'replacement-nuremberg');
  assert.equal(model.fit, 'UNKNOWN');
  assert.equal(model.decisionStatus, 'UNKNOWN');
  assert.match(model.sensitivityNote, /UNKNOWN/);
  assert.match(model.sourceLines[0]!, /Acquired: UNKNOWN/);
  assert.match(model.sourceLines[0]!, /3 query records \(3 failed\)/);
  assert.match(model.sourceLines[0]!, /fit UNKNOWN; no usable fit index/);
  assert.doesNotMatch(model.sourceLines[0]!, /derived within-query percentiles/);
  assert.equal(model.modeLabel, 'LIVE RUN - Qloo fit UNKNOWN');
});

test('infeasible baseline keeps the core leave-one-out reason even when comparison artists are present', () => {
  const scenario = { ...inputs.scenario, tour: { ...inputs.scenario.tour,
    constraints: { ...inputs.scenario.tour.constraints, maxDailyDrivingSeconds: 1 },
  } };
  const response = result({ scenario });
  assert.equal(response.audit.analysis.decision.recommendation.status, 'no-feasible-option');
  assert.equal(response.audit.analysis.artistSensitivity.status, 'not-applicable');
  assert.equal(response.artists.comparisons.length, 2);
  const model = buildPromoterModel(response, 'replacement-nuremberg');
  assert.match(model.sensitivityNote, /not applicable.*no baseline recommendation/);
  assert.doesNotMatch(model.sensitivityNote, /no comparison artist/i);
});

test('promoter rejects an option from a different audit instead of exporting a fallback', () => {
  assert.throws(() => buildPromoterModel(result(), 'unrelated-option'), /Select an option from the current audit/);
});

test('brief next steps preserve UNKNOWN confirmations and the distinct day-off action',()=>{
 const proposal=buildPromoterModel(result(),'replacement-nuremberg');
 assert.equal(proposal.kind,'replacement');
 assert.match(proposal.confirmationNote,/UNKNOWN/);
 assert.equal(proposal.nextSteps.length,4);
 assert.ok(proposal.nextSteps[0]!.includes(proposal.date));
 for(const subject of [/venue availability/,/capacity.*technical rider/,/fee.*contract terms/])
   assert.ok(proposal.nextSteps.some(step=>subject.test(step)&&/UNKNOWN/.test(step)));
 assert.ok(proposal.nextSteps.some(step=>/travel\/accommodation costs.*day off/.test(step)));
 const rest=buildPromoterModel(result(),'day-off');
 assert.equal(rest.kind,'day-off');
 assert.match(rest.confirmationNote,/N\/A/);
 assert.ok(rest.nextSteps.some(step=>/no performance venue or promoter fee/.test(step)));
 assert.ok(rest.nextSteps.some(step=>/crew.*four locked shows/.test(step)));
 assert.doesNotMatch(rest.nextSteps.join(' '),/external confirmation is UNKNOWN/);
});

test('v2 actual preview handler keeps the browsed candidate and current threshold in its brief and matching audit',()=>{
 const main=readFileSync(new URL('../web2/src/main.ts',import.meta.url),'utf8');
 const handlers=['previewSimulationProposal','defaultMessage','sheetHtml'].map(name=>{
   const match=main.match(new RegExp('function '+name+'\\([^]*?\\n\\}'));
   assert.ok(match,'missing actual handler '+name);return match[0];
 }).join('\n');
 const run=new Function('context','with(context){'+stripTypeScriptTypes(handlers)+
   '\npreviewSimulationProposal();return chosenProposal?sheetHtml(chosenProposal):null;}');
 const base=createDemoResult({generatedAt,runId:'brief-current-base'});
 const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>
   ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]!);
 for(const cap of [350,354.1])for(const optionId of ['replacement-nuremberg','detour-frankfurt','day-off']){
   const simulation=projectSimulation(base,optionId,cap);
   const downloaded:ApiDecisionResult[]=[];
   const context={simulationModel:simulation,proposalReturn:null,proposalSource:null as ApiDecisionResult|null,
     chosenProposal:null as ReturnType<typeof buildPromoterModel>|null,incident:initialIncident(),
     proposalFromSimulation:false,proposalMessage:'',reviewingMessage:true,screen:'simulation',notice:'',
     initialIncident,transitionIncident,buildPromoterModel,HTML:escape,render(){},
     downloadAudit(source:ApiDecisionResult){downloaded.push(source);}};
   const html=run(context) as string|null;
   if(optionId==='day-off'){
     assert.equal(html,null);assert.equal(downloaded[0],simulation.sourceResult);
     assert.equal(downloaded[0]!.audit.replay.policy.maxAdditionalDistanceMetres,cap*1000);
   }else if(simulation.verdict==='FAIL'){
     assert.equal(html,null);assert.equal(context.proposalSource,null);assert.match(context.notice,/fails declared checks/);
   }else{
     const sheet=context.chosenProposal!;
     assert.equal(sheet.optionId,optionId);assert.equal(context.proposalSource,simulation.sourceResult);
     assert.equal(sheet.distanceLimit,cap+' km');
     assert.equal(sheet.runId,simulation.sourceResult.audit.runId);
     assert.ok(html!.includes('<h1>'+escape(sheet.artist)+' - '+escape(sheet.city)+'</h1>'));
     assert.ok(html!.includes('distance cap '+cap+' km'));
     assert.ok(html!.includes(escape(sheet.confirmationNote)));
     for(const step of sheet.nextSteps)assert.ok(html!.includes('<li>'+escape(step)+'</li>'));
     assert.ok(context.proposalMessage.includes(sheet.city));assert.ok(context.proposalMessage.includes(sheet.date));
     const exported=JSON.parse(auditExport(context.proposalSource!,'what-if').content);
     assert.equal(exported.replay.policy.maxAdditionalDistanceMetres,cap*1000);
     assert.equal(exported.runId,sheet.runId);
     const recommendation=simulation.sourceResult.audit.analysis.decision.recommendation;
     assert.equal(recommendation.status,'recommended');
     if(recommendation.status==='recommended')assert.equal(sheet.recommendation.startsWith('Recommended'),recommendation.optionId===optionId);
     assert.deepEqual(simulation.sourceResult.audit.replay.scenario.tour.shows,base.audit.replay.scenario.tour.shows);
   }
 }
});

test('PNG exporter draws the same candidate, cap, unknowns and next-call questions as its current model',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 try{
   const base=createDemoResult({generatedAt,runId:'png-current-base'});
   for(const optionId of ['replacement-nuremberg','detour-frankfurt','day-off']){
     const source=projectSimulation(base,optionId,354.1).sourceResult;
     const sheet=buildPromoterModel(source,optionId),drawn:string[]=[];
     const context={font:'',measureText(text:string){return {width:text.length*6};},
       scale(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
       fillText(text:string){drawn.push(text);}};
     const canvas={width:0,height:0,getContext:()=>context,toBlob(callback:(blob:Blob)=>void){callback(new Blob(['test canvas'],{type:'image/png'}));}};
     Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas}});
     const png=await createPromoterPng(source,optionId);
     assert.equal(png.type,'image/png');assert.equal(canvas.width,1680);assert.equal(canvas.height,2376);
     const content=drawn.join(' ');
     for(const expected of [sheet.city,sheet.date,sheet.distanceLimit,sheet.runId,sheet.confirmationNote,...sheet.nextSteps])
       assert.ok(content.includes(expected),optionId+': '+expected);
     assert.match(content,/Nothing booked or sent/);
     if(optionId==='day-off')assert.doesNotMatch(content,/Booking confirmation: UNKNOWN|Next promoter conversation/);
   }
 }finally{
   if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');
 }
});

test('print sizing fits the complete v2 brief to one A4 sheet and clears the temporary scale',()=>{
 const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const handlers=new Map<string,()=>void>(),properties=new Map<string,string>();
 const page={offsetHeight:1600,getBoundingClientRect:()=>({height:1600}),style:{
   setProperty(name:string,value:string){properties.set(name,value);},removeProperty(name:string){properties.delete(name);}}};
 try{
   Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(name:string,handler:()=>void){handlers.set(name,handler);}}});
   Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelectorAll:()=>[{...page,offsetHeight:0},page]}});
   installPromoterPrintSizing('#print-area .sheet-paper');
   handlers.get('beforeprint')!();
   assert.equal(Number(properties.get('--promoter-print-scale')),(270*96/25.4)/1600);
   handlers.get('afterprint')!();assert.equal(properties.size,0);
 }finally{
   if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');
   if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');
 }
});
