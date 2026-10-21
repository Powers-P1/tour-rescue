import corridor from '../../fixtures/ai/corridor-repair.json' with { type: 'json' };
import gaps from '../../fixtures/ai/evidence-gaps.json' with { type: 'json' };
import { createDecisionAudit } from '../core/audit.ts';
import { germanyDemoInputs, syntheticQueryEvidence } from '../demo/germany.ts';
import { AiInputError, parseAiSources, validateAiProposal } from './tools.ts';
import type { AiDecisionContext, AiSessionResult, AiStep } from './types.ts';

export const AI_DEMO_SCENARIOS = [
  { id: 'corridor-repair', title: corridor.title, description: corridor.description },
  { id: 'evidence-gaps', title: gaps.title, description: gaps.description },
] as const;

export type AiDemoScenarioId = typeof AI_DEMO_SCENARIOS[number]['id'];

/** Saved, authored transcripts are explicit fixtures, never advertised as recordings of Claude. */
export function createAiDemoSession(id: AiDemoScenarioId,
  meta: { readonly generatedAt?: string; readonly sessionId?: string } = {}): AiSessionResult {
  const fixture = id === 'corridor-repair' ? corridor : id === 'evidence-gaps' ? gaps : undefined;
  if (fixture === undefined) throw new AiInputError('Unknown AI demo scenario.');
  const generatedAt = meta.generatedAt ?? new Date().toISOString();
  const sessionId = meta.sessionId ?? `ai-demo-${id}-${crypto.randomUUID()}`;
  const input = germanyDemoInputs();
  const baseResult: AiDecisionContext = { schemaVersion: 'tour-rescue.api-result.v1', mode: 'demo',
    scenarioId: input.scenario.id, artists: input.artists,
    audit: createDecisionAudit({ ...input, generatedAt, runId: `${sessionId}:base`, mode: 'demo',
      candidateSet: input.fitInput.candidateSet,
      queries: syntheticQueryEvidence([input.fitInput, input.controlFitInput], generatedAt) }) };
  const sources = parseAiSources(fixture.sources.map(source => ({
    id: source.id, title: source.title,
    url: `https://github.com/Powers-P1/tour-rescue/blob/main/${source.path}`,
    // For synthetic evidence this is local evaluation time, not a claimed HTTP acquisition.
    retrievedAt: generatedAt, kind: 'synthetic', provenance: 'synthetic', excerpt: source.excerpt,
  })));
  const proposals = fixture.proposals.map((draft, index) => validateAiProposal(baseResult.audit, draft, sources, {
    generatedAt, runId: `${sessionId}:proposal:${index + 1}`,
    ...(fixture.preserveSyntheticBookingFacts ? { preserveSyntheticBookingFacts: true } : {}),
  }));
  const steps: AiStep[] = fixture.steps.map((step, index) => ({ sequence: index + 1, at: generatedAt,
    type: step.type as AiStep['type'], message: step.message,
    ...('toolName' in step ? { toolName: step.toolName } : {}),
    ...('sourceIds' in step ? { sourceIds: step.sourceIds } : {}),
  }));
  for (const proposal of proposals) steps.push({ sequence: steps.length + 1, at: generatedAt,
    type: 'validation', toolName: 'validate_option', proposalId: proposal.draft.id,
    message: `${proposal.draft.venueName}: ${proposal.status}. Status comes from the deterministic checks and declared preferences.` });
  steps.push({ sequence: steps.length + 1, at: generatedAt, type: 'complete',
    message: `${proposals.length} proposals checked. Select a lead and accept it into comparison; no booking or outreach is performed.` });
  return { schemaVersion: 'tour-rescue.ai-session.v1', sessionId, mode: 'demo', scenarioId: input.scenario.id,
    model: 'synthetic-transcript', startedAt: generatedAt, completedAt: generatedAt, baseResult,
    steps, sources, proposals,
    usage: { inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 0, webSearchCalls: 0, webFetchCalls: 0 },
    stopReason: 'completed', warnings: [
      'Authored synthetic transcript: no Anthropic request or web retrieval was recorded. Source timestamps describe local fixture evaluation.',
      'Qloo-shaped taste and venue facts in this demonstration are fictional. OSRM is the maintained frozen road snapshot.',
      'Accepting a lead changes a comparison card only. Availability, agreements, ticket demand and unpriced costs are not established.',
    ] };
}
