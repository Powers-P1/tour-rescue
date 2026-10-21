import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExtraDistanceKm } from '../web2/src/simulation-input.ts';
import { createDemoResult, recomputeResult } from '../web/src/data.ts';
import { auditExport } from '../web2/src/audit-download.ts';

test('no empty/non-numeric input can silently convert to zero kilometres',()=>{
 for(const raw of ['',' ','abc','NaN','Infinity','1e3','-1','500.001','0.0005'])
   assert.throws(()=>parseExtraDistanceKm(raw),raw);
 assert.equal(parseExtraDistanceKm('0'),0);
 assert.equal(parseExtraDistanceKm('100.125'),100.125);
});
test('download uses the what-if decision audit rather than the old cap',()=>{
 const base=createDemoResult({runId:'audit-test',generatedAt:'2026-10-21T12:00:00Z'});
 const revised=recomputeResult(base,{maxAdditionalDistanceMetres:100000},
   {runId:'recheck',generatedAt:'2026-10-21T13:00:00Z'});
 const downloaded=auditExport(revised,'what-if');
 assert.match(downloaded.filename,/what-if-100km/);
 assert.equal(JSON.parse(downloaded.content).replay.policy.maxAdditionalDistanceMetres,100000);
 assert.equal(base.audit.replay.policy.maxAdditionalDistanceMetres,350000);
});
