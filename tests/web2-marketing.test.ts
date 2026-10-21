import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoResult } from '../web/src/data.ts';
import { publicSiteModel, publicOptionStatus, linkedEvidence } from '../web2/src/marketing-model.ts';
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
