import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemoResult, recomputeResult } from '../web/src/data.ts';
import { publicSiteModel, publicOptionStatus, linkedEvidence } from '../web2/src/marketing-model.ts';
import { landingMarkup, judgesMarkup } from '../web2/src/marketing.ts';
import { RECORDED_QLOO_STUDY } from '../web2/src/live-study.ts';
import { renderRecordedQlooStudy } from '../web2/src/live-study-view.ts';
test('public site uses exact frozen case and cannot promote synthetic taste to live',()=>{
 const result=createDemoResult({runId:'public-test',generatedAt:'2026-10-21T12:00:00Z'});
 const site=publicSiteModel(result);
 assert.equal(site.original.audit.runId,result.audit.runId);
 assert.equal(site.rescue.cancelledCity,'Leipzig');
 assert.equal(site.rescue.cancelledDate,'14 Nov 2026');
 assert.deepEqual(site.rescue.options.map(o=>o.id),['replacement-nuremberg','detour-frankfurt','day-off']);
 assert.match(site.sourceLabel,/Synthetic/);
 assert.throws(()=>publicSiteModel({...result,mode:'live'}));
});
test('judge evidence declares synthetic source and links public MIT licence',()=>{
 const site=publicSiteModel();
 assert.match(linkedEvidence(site)[0]!.detail,/Synthetic fixture/);
 assert.match(linkedEvidence(site)[2]!.href,/LICENSE$/);
 assert.equal(publicOptionStatus('UNKNOWN'),'? UNKNOWN');
});

test('recorded study summary agrees with the published report, including unchanged controls and omissions',()=>{
 const report=readFileSync(new URL('../docs/validation/live-qloo-2026-10-23.md',import.meta.url),'utf8');
 const rows=report.split(/\r?\n/).filter(row=>/^\| (Radiohead|Arctic Monkeys|Dua Lipa) \|/.test(row))
   .map(row=>row.split('|').slice(1,-1).map(value=>value.trim()));
 assert.equal(rows.length,RECORDED_QLOO_STUDY.runs.length);
 for(const run of RECORDED_QLOO_STUDY.runs){
   const row=rows.find(row=>row[0]===run.target)!;
   assert.deepEqual(row,[run.target,run.comparisons.join(', '),run.control,
     run.coverage+'/'+RECORDED_QLOO_STUDY.cityCount,run.recommendation,
     run.controlChanged?'Yes':'No',run.omissionsChanged?'Yes':'Neither']);
   assert.ok(report.includes(run.runId));
 }
 for(const fact of [RECORDED_QLOO_STUDY.candidateSetId,RECORDED_QLOO_STUDY.baseRevision,
   RECORDED_QLOO_STUDY.workerVersion,RECORDED_QLOO_STUDY.appVersion])assert.ok(report.includes(fact),fact);
 assert.ok(report.includes(RECORDED_QLOO_STUDY.maxAdditionalDistanceMetres.toLocaleString('en-GB')+' m'));
 assert.ok(report.includes('minimum fit '+RECORDED_QLOO_STUDY.minimumFit));
 assert.ok(report.includes('22 October 2026, 22:17–22:19 UTC'));
 const summary=renderRecordedQlooStudy();
 assert.equal((summary.match(/<dt>/g)??[]).length,rows.length);
 assert.doesNotMatch(summary,/<details|<pre|354\.1/,'the historical results are visible and contain no synthetic flip or raw payload');
 for(const run of RECORDED_QLOO_STUDY.runs)assert.ok(summary.includes('<dt>'+run.target+'</dt>'));
 assert.ok(summary.includes('href="'+RECORDED_QLOO_STUDY.reportUrl+'"'));
 assert.match(summary,/Needs evidence in all three runs/);
 assert.ok(summary.includes('datetime="'+RECORDED_QLOO_STUDY.measuredFrom+'"'));
 assert.ok(summary.includes('datetime="'+RECORDED_QLOO_STUDY.measuredTo+'"'));
});

test('judges separate a computed synthetic breakpoint from recorded real outcomes and name the next human action',()=>{
 const site=publicSiteModel();
 const html=judgesMarkup(site);
 const synthetic=html.match(/<div class="breakpoint-note"[^]*?<\/div>/)?.[0]??'';
 assert.match(synthetic,/data-evidence-kind="synthetic"/);
 assert.match(synthetic,/Synthetic sensitivity example/);
 assert.ok(synthetic.includes(site.landing.breakpoint.beforeText));
 assert.ok(synthetic.includes(site.landing.breakpoint.afterText));
 assert.match(synthetic,/Only the additional-distance cap changes/);
 assert.match(html,/data-evidence-kind="recorded-live"/);
 assert.match(html,/3 artists tested · winner unchanged at 350 km/);
 assert.doesNotMatch(html,/Why Qloo changes the decision/);
 const hero=html.match(/<section class="judges-hero[^]*?<\/section>/)?.[0]??'';
 assert.match(hero,/tour manager or booker/);
 assert.match(hero,/next promoter conversation/);
 assert.match(landingMarkup(site),/tour managers and bookers/);
});

test('rounding a displayed synthetic recheck preserves the witnessed outcome in either threshold direction',()=>{
 const base=createDemoResult({runId:'public-recheck-rounding',generatedAt:'2026-10-21T12:00:00Z'});
 for(const cap of [350000,400000]){
   const site=publicSiteModel(recomputeResult(base,{maxAdditionalDistanceMetres:cap}));
   const point=site.landing.breakpoint;
   assert.equal(point.status,'found');
   const html=judgesMarkup(site);
   const value=html.match(/class="breakpoint-note"[^]*?<strong>[^<]* → ([\d,.]+) km<\/strong>/)?.[1];
   assert.ok(value);
   const revised=publicSiteModel(recomputeResult(site.original,{maxAdditionalDistanceMetres:Number(value.replaceAll(',',''))*1000}));
   const winner=revised.rescue.options.find(option=>option.recommended);
   assert.equal(winner?.cityName,point.afterCity);
 }
});
