import type { ApiDecisionResult } from '../../worker/src/app.ts';
/** Export the audit behind the visible result, not a previous comparison. */
export function auditExport(result:ApiDecisionResult,kind:'baseline'|'what-if'='baseline'):
{readonly filename:string;readonly content:string}{
 const run=result.audit.runId.replace(/[^a-z0-9-]/gi,'_');
 const cap=result.audit.replay.policy.maxAdditionalDistanceMetres/1000;
 const suffix=kind==='what-if'?'-what-if-'+String(cap).replace('.','_')+'km':'';
 return {filename:'tour-rescue-'+result.mode+'-'+run+suffix+'-audit.json',
   content:JSON.stringify(result.audit,null,2)};
}
