import type { DecisionAudit } from '../core/audit-types.ts';
import type { EvaluatedRepairOption } from '../core/repair-types.ts';
import type { CheckStatus } from '../core/travel-constraints.ts';
import type { KnowledgeRead, TourSkill } from './knowledge.ts';

/** Shared application contract. Provider credentials and raw Qloo responses never belong here. */
export interface AiDecisionContext {
  readonly schemaVersion: 'tour-rescue.api-result.v1';
  readonly mode: 'demo' | 'live';
  readonly scenarioId: string;
  readonly artists: {
    readonly target: { readonly id: string; readonly name?: string };
    readonly comparisons: readonly { readonly id: string; readonly name?: string }[];
    readonly control: { readonly id: string; readonly name?: string };
  };
  readonly audit: DecisionAudit;
}

/** Only source metadata and bounded excerpts are exported, never a provider page payload. */
export interface AiSource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly retrievedAt: string;
  readonly kind: 'web-search' | 'web-fetch' | 'synthetic';
  readonly provenance: 'provider-tool' | 'synthetic';
  readonly excerpt?: string;
}

/** A proposal can name a city and venue, but cannot assert numeric inputs or booking facts. */
export interface AiProposalDraft {
  readonly id: string;
  readonly kind: 'replacement' | 'detour';
  readonly cityId: string;
  readonly venueName: string;
  readonly reason: string;
  readonly sourceIds: readonly string[];
  readonly risks: readonly string[];
}

export interface AiValidatedProposal {
  readonly draft: AiProposalDraft;
  /** Includes the existing independent minimum-fit and extra-distance preference checks. */
  readonly status: CheckStatus;
  readonly option: EvaluatedRepairOption;
  readonly audit: DecisionAudit;
}

export interface AiStep {
  readonly sequence: number;
  readonly at: string;
  readonly type: 'status' | 'tool' | 'research' | 'validation' | 'warning' | 'complete';
  readonly message: string;
  readonly toolName?: string;
  readonly sourceIds?: readonly string[];
  readonly proposalId?: string;
}

export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly webSearchCalls: number;
  readonly webFetchCalls: number;
  /** Approximate USD estimate from list-price constants; see costBasis. Absent in older sessions and demos. */
  readonly estimatedCostUsd?: number;
  readonly costBasis?: string;
}

export type AiStopReason = 'completed' | 'step-limit' | 'token-limit' | 'tool-limit' | 'cancelled' | 'provider-error' | 'incomplete';

export interface AiSessionResult {
  readonly knowledgeReads?: readonly KnowledgeRead[];
  readonly skill?: TourSkill;
  readonly schemaVersion: 'tour-rescue.ai-session.v1';
  readonly sessionId: string;
  readonly mode: 'demo' | 'live';
  readonly scenarioId: string;
  readonly model: string;
  readonly startedAt: string;
  readonly completedAt: string;
  /** The frozen numeric context used for this research session. */
  readonly baseResult: AiDecisionContext;
  readonly steps: readonly AiStep[];
  readonly sources: readonly AiSource[];
  readonly proposals: readonly AiValidatedProposal[];
  readonly usage: AiUsage;
  readonly stopReason: AiStopReason;
  readonly warnings: readonly string[];
}

export interface AiEvaluationMetadata {
  readonly generatedAt: string;
  readonly runId: string;
  /** Trusted demo replay only: exact existing fictional venue facts may be retained. */
  readonly preserveSyntheticBookingFacts?: boolean;
}

export interface AiAcceptance {
  readonly schemaVersion: 'tour-rescue.ai-acceptance.v1';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly optionId: string;
  readonly acceptedAt: string;
  readonly sourceIds: readonly string[];
  readonly audit: DecisionAudit;
}

export interface AiAuditEnvelope {
  readonly schemaVersion: 'tour-rescue.ai-audit.v1';
  readonly generatedAt: string;
  readonly session: AiSessionResult;
  /** Older sessions still supplying one of the two current comparison cards. */
  readonly priorSessions: readonly AiSessionResult[];
  readonly accepted: readonly AiAcceptance[];
  /** Current deterministic comparison, including any later one-axis breakpoint change. */
  readonly decisionAudit: DecisionAudit;
}

/** NDJSON event records. No token-by-token model reasoning is exposed to the browser. */
export type AiStreamEvent =
  | { readonly type: 'step'; readonly step: AiStep }
  | { readonly type: 'result'; readonly result: AiSessionResult }
  | { readonly type: 'error'; readonly error: { readonly code: string; readonly message: string } };
