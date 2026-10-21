import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemoResult } from '../web/src/data.ts';
import { projectAudience, projectSimulation } from '../web2/src/desktop-model.ts';
import { projectRescue } from '../web2/src/model.ts';
import { renderDesktopFeature } from '../web2/src/desktop-views.ts';
import type { DesktopViewContext } from '../web2/src/desktop-views.ts';
import { renderExtension } from '../web2/src/extension-views.ts';
import type { ExtensionContext } from '../web2/src/extension-views.ts';
import { initialSosSample, SAMPLE_PLAN_BRIEF, summarizePlanBrief } from '../web2/src/extension-state.ts';
import { landingMarkup, judgesMarkup } from '../web2/src/marketing.ts';
import { publicSiteModel } from '../web2/src/marketing-model.ts';

const read = (file: string) => readFileSync(new URL('../'+file, import.meta.url),'utf8');
const demo=createDemoResult({generatedAt:'2026-10-21T12:00:00.000Z',runId:'polish-test'});
const audience=projectAudience(demo);
const views: DesktopViewContext={
 projection:projectRescue(demo), audience, audienceSource:'qloo',
 selectedAudienceCityId:audience.places[0]!.cityId, audienceEvidenceOpen:false,mapZoom:1,
 simulation:projectSimulation(demo,'replacement-nuremberg',350),
 simulationTab:'route',simulationCapDraft:null,simulationCapError:'',
 savedDraft:false,changeCityOpen:false,agencyFilter:'attention',
 agencyOwners:{},assigningTask:null,proposedOwner:'Alex',agencyNotice:'',actionNotice:'',
};
const extensions:ExtensionContext={
 tabs:'',sos:initialSosSample(),planBrief:SAMPLE_PLAN_BRIEF,
 planSummary:summarizePlanBrief(SAMPLE_PLAN_BRIEF),showAssumptions:false,
 fanPreviewed:false,aiBusy:false,aiNotice:'',aiMode:'demo',
 aiSteps:[],aiSession:null,sourceMode:'demo',
};
const site=publicSiteModel(demo);

test('mid-desktop map labels use an ARIA-linked 15px HTML key for named cities',()=>{
 const page=renderDesktopFeature('audience',views);
 assert.match(page,/id="taste-map-key" class="taste-mobile-key"/);
 assert.match(page,/aria-describedby="taste-map-key"/);
 for(const place of audience.places)assert.ok(page.includes(place.name));
 const css=read('web2/src/desktop.css');
 assert.match(css,/@media\s*\(min-width:980px\)\s*and\s*\(max-width:1279px\)/);
 assert.match(css,/\.taste-map-wrap \.taste-mobile-key\{display:flex;font-size:15px/);
});

test('mobile feature header hides duplicate desktop Back while retaining desktop Back',()=>{
 for(const screen of ['audience','simulation','agency'] as const){
   assert.match(renderDesktopFeature(screen,views),/data-action="feature-back"/);
 }
 const css=read('web2/src/desktop.css');
 assert.match(css,/@media\s*\(max-width:979px\)\s*\{[\s\S]*?\.feature-head-actions \.feature-back\{display:none!important\}/);
 assert.match(read('web2/src/main.ts'),/class="feature-mobile-top"/);
});

test('hero caption is short and pinned above the phone overlay',()=>{
 const page=landingMarkup(site);
 assert.match(page,/Backstage scene · illustrative/);
 assert.doesNotMatch(page,/Backstage illustration · editorial photo when available/);
 const css=read('web2/src/marketing.css');
 assert.match(css,/\.hero-picture figcaption\s*\{[\s\S]*?top:12px;bottom:auto/);
});

test('judges name concrete limits without live-ticket or booking claims',()=>{
 const html=judgesMarkup(site);
 assert.match(html,/id="known-limits"/);
 assert.match(html,/Known limits\./);
 for(const phrase of [
   'Taste fit is not attendance',
   'Live Qloo has quotas and possible evidence gaps',
   'City mapping and reference weights are application-owned',
   'Road and booking evidence have separate limits',
   'A proposal is not a confirmation',
   'synthetic profiles','UNKNOWN',
 ])assert.ok(html.includes(phrase),phrase);
 const css=read('web2/src/marketing.css');
 assert.match(css,/\.judge-limits-grid/);
});

test('all tabs and radio groups expose ARIA controls and a single roving Tab target',()=>{
 for(const screen of ['audience','simulation','agency'] as const){
   const html=renderDesktopFeature(screen,views);
   const tabs=[...html.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"[^>]*tabindex="([^"]+)"/g)];
   assert.equal(tabs.length,2,screen);
   assert.equal(tabs.filter(x=>x[2]==='0').length,1,screen);
   for(const [,id] of tabs){
     assert.ok(html.includes('id="'+id+'" role="tabpanel"'),screen+' missing panel '+id);
   }
 }
 const city=renderDesktopFeature('audience',views);
 assert.match(city,/role="radiogroup"/);
 assert.equal((city.match(/role="radio"[^>]*aria-controls="audience-city-detail"/g)??[]).length,audience.places.length);
 assert.match(city,/id="audience-city-detail"/);
 const sos=renderExtension('sos-options',extensions);
 assert.equal((sos.match(/role="radio"[^>]*aria-controls="sos-choice-summary"/g)??[]).length,2);
 assert.match(sos,/id="sos-choice-summary"/);
 const main=read('web2/src/main.ts');
 assert.match(main,/role="radiogroup" aria-labelledby="rescue-options-legend"/);
 assert.match(main,/aria-controls="rescue-choice-summary"/);
 assert.match(main,/id="rescue-choice-summary"/);
 assert.match(main,/nextRovingIndex\(event\.key/);
});
