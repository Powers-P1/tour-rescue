import type { ApiDecisionResult } from '../../worker/src/app.ts';
import { optionName } from '../../web/src/visual-model.ts';
import { sensitivitySummary, sensitivityTable } from '../../web/src/evidence.ts';
import { renderFitScatter, renderTagBridge } from '../../web/src/visuals.ts';
import type { TagBridgeInput } from '../../web/src/visual-model.ts';

export function recommendationName(result:ApiDecisionResult):string {
 const rec=result.audit.analysis.decision.recommendation;
 return rec.status==='recommended'?optionName(result.audit,rec.optionId):
   rec.status==='needs-evidence'?'UNKNOWN · more evidence needed':'No feasible option';
}
/** Reuse measured axes and sourced-tag rules; no coordinates or tags are inferred. */
export function mountEvidence(root:HTMLElement,result:ApiDecisionResult,selectedId:string,tags?:TagBridgeInput):void {
 root.querySelector('[data-evidence-scatter]')?.append(renderFitScatter(result.audit,selectedId));
 root.querySelector('[data-evidence-sensitivity]')?.append(sensitivitySummary(result),sensitivityTable(result));
 root.querySelector('[data-evidence-tags]')?.append(renderTagBridge(tags));
}
