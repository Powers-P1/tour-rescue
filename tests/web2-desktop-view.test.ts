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
 agencyOwners:{},assigningTask:null,proposedOwner:'Alex',agencyNotice:'',
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
 assert.match(html,/What if: Nuremberg/);
 assert.match(html,/PROPOSED/i);
 assert.match(html,/Unknown \/ To confirm/);
 assert.match(html,/Save draft scenario/);
 assert.match(html,/Current plan:/);
 const budget=renderDesktopFeature('simulation',{...base,simulationTab:'budget'});
 assert.match(budget,/Actual venue terms/);
 assert.match(budget,/not derivable from Qloo affinity/);
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
