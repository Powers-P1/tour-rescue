import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoResult } from '../web/src/data.ts';
import { projectRescue } from '../web2/src/model.ts';
import { projectAudience, projectSimulation } from '../web2/src/desktop-model.ts';
import { renderDesktopFeature } from '../web2/src/desktop-views.ts';
import type { DesktopViewContext } from '../web2/src/desktop-views.ts';

const demo=createDemoResult({generatedAt:'2026-10-21T12:00:00Z',runId:'desktop-views'});
const audience=projectAudience(demo);
const base:DesktopViewContext={
 projection:projectRescue(demo),audience,audienceSource:'qloo',
 selectedAudienceCityId:audience.places[0]!.cityId,audienceEvidenceOpen:false,mapZoom:1,
 simulation:projectSimulation(demo,'replacement-nuremberg',350),
 simulationTab:'route',simulationCapDraft:null,simulationCapError:'',savedDraft:false,changeCityOpen:false,agencyFilter:'attention',
 agencyOwners:{},assigningTask:null,proposedOwner:'Alex',agencyNotice:'',actionNotice:'',
};

test('board 05 renders audited source and never merges fan declarations with Qloo',()=>{
 const page=renderDesktopFeature('audience',base);
 assert.match(page,/Cultural fit · Qloo/);
 assert.match(page,/Relative cultural affinity, not listener counts/);
 assert.match(page,/Nuremberg/);
 assert.match(page,/Frankfurt am Main/);
 assert.match(page,/taste lead only/i);
 const fans=renderDesktopFeature('audience',{...base,audienceSource:'fans'});
 assert.match(fans,/No recorded fan declarations/);
 assert.doesNotMatch(fans,/class="taste-map"/);
 assert.match(fans,/no invented fan counts/i);
});

test('board 06 renders audited route + separate unknown booking checks',()=>{
 const html=renderDesktopFeature('simulation',base);
 assert.match(html,/What changes the recommendation/);
 assert.match(html,/data-recommendation="before">Nuremberg/);
 assert.match(html,/data-recommendation="after">Nuremberg/);
 assert.match(html,/PROPOSED/i);
 assert.match(html,/Unknown \/ To confirm/);
 assert.match(html,/Save draft scenario/);
 assert.match(html,/Current plan:/);
 const budget=renderDesktopFeature('simulation',{...base,simulationTab:'budget'});
 assert.match(budget,/Actual venue terms/);
 assert.match(budget,/not derivable from Qloo affinity/);
});

test('day-off labels extra-show distance and replacement legs not applicable without changing its audit',()=>{
 const simulation=projectSimulation(demo,'day-off',0);
 const audit=JSON.stringify(simulation.sourceResult.audit);
 const html=renderDesktopFeature('simulation',{...base,simulation});
 assert.equal((html.match(/<p class="sim-transfer">N\/A · no replacement leg<\/p>/g)??[]).length,2);
 const distance=html.match(/<div class="sim-distance-status">([^]*?)<\/div>/)?.[1]??'';
 assert.match(distance,/>N\/A<\/span> Extra-distance preference · no added show/);
 assert.doesNotMatch(distance,/UNKNOWN|No distance evidence available/i);
 assert.equal(simulation.verdict,'PASS');
 assert.equal(JSON.stringify(simulation.sourceResult.audit),audit);
 assert.match(renderDesktopFeature('simulation',base),/Unknown \/ To confirm/,'unresolved show facts stay unknown');
});

test('board 07 is explicitly synthetic, with three issues and one unassigned owner',()=>{
 const html=renderDesktopFeature('agency',base);
 assert.equal((html.match(/class="agency-row"/g)??[]).length,3);
 assert.match(html,/Paper Satellites/);
 assert.match(html,/Northbound/);
 assert.match(html,/Night Ferry/);
 assert.match(html,/\? Unassigned/);
 assert.match(html,/Sample agency/);
 const all=renderDesktopFeature('agency',{...base,agencyFilter:'all'});
 assert.match(all,/Glass Index/);
 assert.match(all,/No open items/);
});

test('audience row reason follows actual fit and route nomination, never slot order',()=>{
 const html=renderDesktopFeature('audience',base);
 assert.doesNotMatch(html,/Cultural lead in a checked repair slot/);
 for(const city of audience.places){
   assert.ok(html.includes(city.relativeLabel));
   assert.match(html,new RegExp(city.routeOptionId?'Route-nominated candidate':'Highest available taste-only alternative'));
 }
});
test('failed what-if shows core extra-distance explanation and retains invalid input',()=>{
 const s=projectSimulation(demo,'detour-frankfurt',100);
 const page=renderDesktopFeature('simulation',{...base,simulation:s,simulationCapDraft:'abc',simulationCapError:'Invalid number'});
 const check=s.checks.find(x=>x.id==='distance');
 assert.equal(check?.status,'FAIL');
 assert.ok(page.includes(check.explanation));
 assert.match(page,/value="abc"/);
 assert.match(page,/Invalid distance cap/);
});
test('mobile map provides numbered glyphs and an HTML key with city names',()=>{
 const html=renderDesktopFeature('audience',base);
 assert.match(html,/taste-map-mobile-number/);
 assert.match(html,/taste-mobile-key/);
});

test('all desktop tab controls point to existing tab panels; roving tab index is exclusive',()=>{
 for(const page of ['audience','simulation','agency'] as const){
   const html=renderDesktopFeature(page,base);
   const refs=[...html.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"/g)].map(m=>m[1]);
   assert.equal(refs.length,2,page);
   for(const id of refs) assert.ok(html.includes('id="'+id+'"'),page+' missing '+id);
   assert.equal((html.match(/role="tab"[^>]*tabindex="0"/g)??[]).length,1,page);
   assert.equal((html.match(/role="tab"[^>]*tabindex="-1"/g)??[]).length,1,page);
 }
 const audienceHtml=renderDesktopFeature('audience',base);
 assert.match(audienceHtml,/role="radio"[^>]*aria-controls="audience-city-detail"/);
 assert.match(audienceHtml,/id="audience-city-detail"/);
 assert.equal((audienceHtml.match(/role="radio"[^>]*tabindex="0"/g)??[]).length,1);
 const fan=renderDesktopFeature('audience',{...base,audienceSource:'fans'});
 assert.doesNotMatch(fan,/class="taste-map"/);
 assert.match(fan,/id="audience-panel-qloo"[^>]*hidden/);
});
test('each agency issue shows a truthful sample glyph and a text state',()=>{
 const html=renderDesktopFeature('agency',base);
 assert.match(html,/● Needs local help/);
 assert.match(html,/× Canceled/);
 assert.match(html,/● Needs owner/);
 const ownerSet=renderDesktopFeature('agency',{...base,agencyOwners:{presale:'Alex'}});
 assert.match(ownerSet,/✓ Owner assigned/);
});
test('recheck message is inline with extra-distance status rather than a fixed toast',()=>{
 const html=renderDesktopFeature('simulation',{...base,actionNotice:'× Recalculated. A declared check fails.'});
 assert.match(html,/sim-distance-status/);
 assert.match(html,/class="feature-action-notice" role="status"/);
 assert.match(html,/× Recalculated. A declared check fails/);
 assert.doesNotMatch(html,/class="toast"/);
});
