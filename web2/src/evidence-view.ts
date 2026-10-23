import type { ApiDecisionResult } from '../../worker/src/app.ts';
import { sensitivitySummary, sensitivityTable } from '../../web/src/evidence.ts';
import { renderFitScatter, renderTagBridge } from '../../web/src/visuals.ts';
import type { TagBridgeInput } from '../../web/src/visual-model.ts';

export { recommendationName } from './recommendation-name.ts';
/** Reuse measured axes and sourced-tag rules; no coordinates or tags are inferred. */
export function mountEvidence(root:HTMLElement,result:ApiDecisionResult,selectedId:string,tags?:TagBridgeInput):void {
 root.querySelector('[data-evidence-scatter]')?.append(renderFitScatter(result.audit,selectedId));
 root.querySelector('[data-evidence-sensitivity]')?.append(sensitivitySummary(result),sensitivityTable(result));
 root.querySelector('[data-evidence-tags]')?.append(renderTagBridge(tags));
}
