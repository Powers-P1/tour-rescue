import type { ApiDecisionResult } from '../../worker/src/app.ts';
import { acceptAiProposal, createAiAuditEnvelope } from '../../src/ai/tools.ts';
import type { AiAcceptance, AiSessionResult } from '../../src/ai/types.ts';

export interface ResearchHistory {
  readonly accepted: readonly AiAcceptance[];
  readonly sessions: readonly AiSessionResult[];
}
export const emptyResearch = (): ResearchHistory => ({ accepted: [], sessions: [] });

/** Acceptance is transactional: validation must finish before any UI state changes. */
export function acceptResearchIntoComparison(current: ApiDecisionResult, session: AiSessionResult,
  proposalId: string, history: ResearchHistory, meta: { generatedAt: string; runId: string }) {
  const acceptance = acceptAiProposal(current.audit, session, proposalId, meta);
  const accepted = [...history.accepted.filter(row => row.optionId !== acceptance.optionId), acceptance];
  const sessions = new Map(history.sessions.map(row => [row.sessionId, row]));
  sessions.set(session.sessionId, session);
  const nextHistory: ResearchHistory = { accepted,
    sessions: [...sessions.values()].filter(row => accepted.some(a => a.sessionId === row.sessionId)) };
  return { result: { ...current, audit: acceptance.audit }, history: nextHistory, acceptance };
}

/** Export the sessions still supplying the visible cards, even after cancelled/new research. */
export function comparisonAudit(result: ApiDecisionResult, history: ResearchHistory) {
  const session = history.sessions.at(-1);
  if (!session || !history.accepted.length) return result.audit;
  const generatedAt = new Date(Math.max(Date.now(), Date.parse(result.audit.generatedAt),
    ...history.accepted.map(row => Date.parse(row.acceptedAt)))).toISOString();
  return createAiAuditEnvelope(session, history.accepted, result.audit, generatedAt,
    history.sessions.filter(row => row.sessionId !== session.sessionId));
}
