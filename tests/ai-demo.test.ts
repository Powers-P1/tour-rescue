import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_DEMO_SCENARIOS, createAiDemoSession } from '../src/ai/demo.ts';
import { acceptAiProposal, createAiAuditEnvelope } from '../src/ai/tools.ts';

const generatedAt = '2026-10-21T12:00:00.000Z';
const corridor = createAiDemoSession('corridor-repair', { generatedAt, sessionId: 'ai-demo-corridor-test' });
const gaps = createAiDemoSession('evidence-gaps', { generatedAt, sessionId: 'ai-demo-gaps-test' });

test('two saved synthetic transcripts require no provider call and never claim a recorded model session', () => {
  assert.equal(AI_DEMO_SCENARIOS.length, 2);
  for (const result of [corridor, gaps]) {
    assert.equal(result.mode, 'demo');
    assert.equal(result.model, 'synthetic-transcript');
    assert.equal(result.stopReason, 'completed');
    assert.ok(result.proposals.length >= 2 && result.proposals.length <= 4);
    assert.equal(Object.values(result.usage).reduce((sum, value) => sum + value, 0), 0);
    assert.ok(result.warnings.some(value => value.includes('no Anthropic request')));
    assert.ok(result.sources.every(source => source.kind === 'synthetic' && source.provenance === 'synthetic'));
    assert.ok(result.proposals.every(proposal => proposal.draft.sourceIds.every(id => result.sources.some(source => source.id === id))));
    assert.deepEqual(result.steps.map(step => step.sequence), result.steps.map((_, index) => index + 1));
    assert.equal(result.steps.at(-1)?.type, 'complete');
    for (const proposal of result.proposals) {
      assert.deepEqual(proposal.option.route.filter(show => show.locked), result.baseResult.audit.replay.scenario.tour.shows.filter(show => show.locked));
      assert.deepEqual(proposal.audit.frozenCandidateSet, result.baseResult.audit.frozenCandidateSet);
    }
  }
});

test('corridor transcript shows deterministic passing leads and a preference-rejected detour', () => {
  assert.deepEqual(corridor.proposals.map(proposal => proposal.status), ['PASS', 'FAIL', 'PASS']);
  const frankfurt = corridor.proposals.find(proposal => proposal.draft.cityId === 'de-frankfurt')!;
  assert.equal(frankfurt.option.routingStatus, 'PASS');
  assert.deepEqual(frankfurt.option.additionalDistanceMetres, { status: 'known', value: 354_097 });
  assert.equal(frankfurt.audit.replay.policy.maxAdditionalDistanceMetres, 350_000);
  const accepted = acceptAiProposal(corridor.baseResult.audit, corridor, 'demo-dresden', { generatedAt, runId: 'accept-demo-dresden' });
  assert.equal(accepted.audit.analysis.decision.options.find(row => row.optionId === accepted.optionId)?.status, 'PASS');
  const replacement = accepted.audit.replay.scenario.repairCandidates.find(row => row.kind === 'replacement');
  assert.ok(replacement !== undefined && replacement.kind === 'replacement');
  assert.equal(replacement.cityId, 'de-dresden');
});

test('evidence-gap transcript cannot promote an empty calendar to availability on acceptance', () => {
  assert.deepEqual(gaps.proposals.map(proposal => proposal.status), ['UNKNOWN', 'UNKNOWN']);
  const accepted = acceptAiProposal(gaps.baseResult.audit, gaps, 'demo-nuremberg-gap', { generatedAt, runId: 'accept-demo-gap' });
  assert.equal(accepted.audit.analysis.repairs.options.find(option => option.id === accepted.optionId)?.venueStatus, 'UNKNOWN');
  assert.equal(accepted.audit.analysis.decision.recommendation.status, 'needs-evidence');
  assert.equal(accepted.audit.zeroViolationsGate.status, 'UNKNOWN');
});

test('accepting a second-session card preserves the first card and both source records in a bounded audit', () => {
  const first = acceptAiProposal(corridor.baseResult.audit, corridor, 'demo-dresden', { generatedAt, runId: 'first-session-card-a' });
  const second = acceptAiProposal(first.audit, gaps, 'demo-stuttgart-gap', { generatedAt, runId: 'second-session-card-b' });
  assert.equal(first.sessionId, corridor.sessionId);
  assert.equal(second.sessionId, gaps.sessionId);
  const a = second.audit.replay.scenario.repairCandidates.find(row => row.kind === 'replacement');
  const b = second.audit.replay.scenario.repairCandidates.find(row => row.kind === 'detour');
  assert.ok(a?.kind === 'replacement' && b?.kind === 'detour');
  assert.equal(a.cityId, 'de-dresden');
  assert.equal(b.cityId, 'de-stuttgart');
  const envelope = createAiAuditEnvelope(gaps, [first, second], second.audit, generatedAt, [corridor, corridor, gaps]);
  assert.deepEqual(envelope.priorSessions.map(row => row.sessionId), [corridor.sessionId]);
  assert.equal(envelope.session.sessionId, gaps.sessionId);
  assert.deepEqual(envelope.accepted.map(row => row.sessionId), [corridor.sessionId, gaps.sessionId]);
  assert.throws(() => createAiAuditEnvelope(gaps, [first, second], second.audit, generatedAt), /unknown session/);
  assert.throws(() => createAiAuditEnvelope(gaps, [{ ...first, sessionId: gaps.sessionId }, second], second.audit, generatedAt, [corridor]), /unknown/);
  const replaced = acceptAiProposal(second.audit, corridor, 'demo-nuremberg', { generatedAt, runId: 'replace-first-card-a' });
  assert.throws(() => createAiAuditEnvelope(corridor, [first, second], replaced.audit, generatedAt, [gaps]), /current comparison card/);
  const current = createAiAuditEnvelope(corridor, [replaced, second], replaced.audit, generatedAt, [gaps]);
  assert.deepEqual(current.accepted.map(row => row.proposalId), ['demo-nuremberg', 'demo-stuttgart-gap']);
});
