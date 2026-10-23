import type { ApiDecisionResult } from '../../worker/src/app.ts';
import { optionName } from '../../web/src/visual-model.ts';

export function recommendationName(result: ApiDecisionResult): string {
  const rec = result.audit.analysis.decision.recommendation;
  return rec.status === 'recommended' ? optionName(result.audit, rec.optionId)
    : rec.status === 'needs-evidence' ? 'UNKNOWN · more evidence needed' : 'No feasible option';
}
