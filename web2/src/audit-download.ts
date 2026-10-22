import type { ApiDecisionResult } from '../../worker/src/app.ts';
import { comparisonAudit, emptyResearch } from './research-comparison.ts';
import type { ResearchHistory } from './research-comparison.ts';
/** Export the audit behind the visible result, not a previous comparison. */
export function auditExport(result:ApiDecisionResult,kind:'baseline'|'what-if'='baseline',research:ResearchHistory=emptyResearch()):
{readonly filename:string;readonly content:string}{
 const run=result.audit.runId.replace(/[^a-z0-9-]/gi,'_');
 const cap=result.audit.replay.policy.maxAdditionalDistanceMetres/1000;
 const suffix=kind==='what-if'?'-what-if-'+String(cap).replace('.','_')+'km':'';
 return {filename:'tour-rescue-'+result.mode+'-'+run+suffix+'-audit.json',
   content:JSON.stringify(comparisonAudit(result,research),null,2)};
}
