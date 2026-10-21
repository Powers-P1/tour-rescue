import assert from 'node:assert/strict';
import test from 'node:test';
import { createDecisionAudit, replayDecisionAudit } from '../src/core/audit.ts';
import { germanyDemoInputs, syntheticQueryEvidence } from '../src/demo/germany.ts';
import {
  acceptAiProposal, analyzeAiDecision, createAiAuditEnvelope, generateAiDecisionAudit, getFitData, getRoadLegs,
  parseAiProposalDraft, parseAiSources, safeAiSourceUrl, validateAiProposal,
} from '../src/ai/tools.ts';
import type { AiDecisionContext, AiProposalDraft, AiSessionResult, AiSource } from '../src/ai/types.ts';

const stamp = '2026-10-21T12:00:00.000Z';
const later = '2026-10-21T12:05:00.000Z';
const inputs = germanyDemoInputs();
const base = createDecisionAudit({ ...inputs, runId: 'ai-tools-base', generatedAt: stamp, mode: 'demo',
  candidateSet: inputs.fitInput.candidateSet, queries: syntheticQueryEvidence([inputs.fitInput, inputs.controlFitInput], stamp) });
const meta = { runId: 'ai-tools-evaluation', generatedAt: later };
const source: AiSource = { id: 'source-1', title: 'Example venue calendar',
  url: 'https://example.org/venue/calendar', retrievedAt: stamp, kind: 'web-fetch', provenance: 'provider-tool',
  excerpt: 'No entry was supplied for the cancelled date.' };
const synthetic: AiSource = { ...source, kind: 'synthetic', provenance: 'synthetic', title: 'Fictional demo venue data' };
const draft: AiProposalDraft = { id: 'proposed-nuremberg', kind: 'replacement', cityId: 'de-nuremberg',
  venueName: 'Research lead in Nuremberg', reason: 'Inspect the corridor venue before contacting its booker.',
  sourceIds: ['source-1'], risks: ['Availability and fees are unconfirmed.'] };
const context: AiDecisionContext = { schemaVersion: 'tour-rescue.api-result.v1', mode: 'demo',
  scenarioId: base.scenarioId, artists: inputs.artists, audit: base };

function session(proposals: AiSessionResult['proposals']): AiSessionResult {
  const choices = proposals.length === 1 ? [...proposals, { ...proposals[0]!,
    draft: { ...proposals[0]!.draft, id: `${proposals[0]!.draft.id}-alternative`, venueName: 'Alternative room to investigate' } }] : proposals;
  return { schemaVersion: 'tour-rescue.ai-session.v1', sessionId: 'ai-tools-session', mode: 'demo',
    scenarioId: base.scenarioId, model: 'claude-sonnet-5-5', startedAt: stamp, completedAt: later,
    baseResult: context, sources: [source], proposals: choices, steps: [], warnings: [], stopReason: 'completed',
    usage: { inputTokens: 10, outputTokens: 20, modelCalls: 1, toolCalls: 1, webSearchCalls: 0, webFetchCalls: 1 } };
}

test('AI source links reject executable, private, credential and non-HTTPS URLs', () => {
  assert.equal(safeAiSourceUrl('https://venue.example.org/calendar?date=2026-11-14#events'), 'https://venue.example.org/calendar?date=2026-11-14#events');
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'http://example.org', 'https://user:pass@example.org',
    'https://localhost/calendar', 'https://a.local', 'https://a.internal', 'https://127.0.0.1/', 'https://2130706433/',
    'https://[::1]/', 'https://example.org:8443', 'https://example.org\n/']) assert.equal(safeAiSourceUrl(url), undefined, url);
  assert.throws(() => parseAiSources([{ ...source, provenance: 'synthetic' }]));
  assert.throws(() => parseAiSources([source, source]));
  assert.throws(() => parseAiSources([{ ...source, excerpt: 'x'.repeat(801) }]));
  assert.throws(() => parseAiSources([{ ...source, retrievedAt: '2026-02-30T12:00:00Z' }]));
  assert.deepEqual(parseAiSources([source]), [source]);
});

test('AI draft parsing excludes model-supplied PASS, booking facts, schedules, numeric fit and distances', () => {
  assert.deepEqual(parseAiProposalDraft(draft), draft);
  for (const field of ['status', 'fit', 'availability', 'fee', 'schedule', 'distanceMetres']) {
    assert.throws(() => parseAiProposalDraft({ ...draft, [field]: 'PASS' }), /unsupported/);
  }
  assert.throws(() => parseAiProposalDraft({ ...draft, sourceIds: [] }));
  assert.throws(() => parseAiProposalDraft({ ...draft, sourceIds: ['source-1', 'source-1'] }));
  assert.throws(() => parseAiProposalDraft({ ...draft, kind: 'day-off' }));
});

test('pure fit and road tools retain the frozen universe, normalized percentiles and directed evidence', () => {
  const fit = getFitData(base);
  assert.equal(fit.cities.length, 24);
  assert.deepEqual(fit.candidateSet, base.frozenCandidateSet);
  assert.deepEqual(fit.cities.find(city => city.id === 'de-nuremberg')?.fitIndex, { status: 'known', value: 25 });
  assert.equal(fit.profiles.status, 'known');
  const roads = getRoadLegs(base, { fromCityIds: ['de-berlin', 'de-nuremberg'], toCityIds: ['de-nuremberg', 'de-berlin'] });
  assert.equal(roads.directed, true);
  assert.equal(roads.legs.length, 4);
  assert.deepEqual(roads.legs.find(leg => leg.fromCityId === 'de-berlin' && leg.toCityId === 'de-nuremberg')?.travel,
    base.replay.scenario.roadMatrix.legs.find(leg => leg.fromCityId === 'de-berlin' && leg.toCityId === 'de-nuremberg')?.travel);
  assert.throws(() => getRoadLegs(base, { fromCityIds: ['outside-universe'], toCityIds: ['de-berlin'] }), /frozen/);
  assert.throws(() => getRoadLegs(base, { fromCityIds: [], toCityIds: ['de-berlin'] }));
});

test('a researched calendar never fills venue facts and every original commitment remains locked', () => {
  const copy = JSON.stringify(base);
  const result = validateAiProposal(base, draft, [source], meta);
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.option.routingStatus, 'PASS');
  assert.equal(result.option.venueStatus, 'UNKNOWN');
  assert.equal(result.option.venue.status, 'known');
  if (result.option.venue.status !== 'known') assert.fail();
  assert.equal(result.option.venue.value.availability.status, 'unknown');
  assert.equal(result.option.venue.value.fee.status, 'unknown');
  assert.equal(result.option.venue.value.capacityPeople.status, 'unknown');
  assert.equal(result.option.venue.value.promoterTerms.status, 'unknown');
  assert.equal(result.option.route.filter(show => show.status === 'proposed').length, 1);
  assert.deepEqual(result.option.route.filter(show => show.locked), base.replay.scenario.tour.shows.filter(show => show.locked));
  assert.deepEqual(result.audit.replay.candidateSet, base.replay.candidateSet);
  assert.deepEqual(result.audit.replay.fitInput, base.replay.fitInput);
  assert.deepEqual(result.audit.sourceTimestamps, base.sourceTimestamps);
  assert.deepEqual(replayDecisionAudit(result.audit), result.audit);
  assert.equal(JSON.stringify(base), copy);
});

test('invalid cities, fabricated source IDs, future sources and duplicate show-card cities are rejected', () => {
  assert.throws(() => validateAiProposal(base, { ...draft, cityId: 'de-erfurt' }, [source], meta), /frozen/);
  assert.throws(() => validateAiProposal(base, { ...draft, cityId: 'de-frankfurt' }, [source], meta), /other show card/);
  assert.throws(() => validateAiProposal(base, { ...draft, sourceIds: ['invented-source'] }, [source], meta), /unknown source/);
  assert.throws(() => validateAiProposal(base, draft, [{ ...source, retrievedAt: '2026-10-22T00:00:00Z' }], meta), /later/);
});

test('only exact labelled synthetic venue facts may be preserved, never live research assertions', () => {
  const fictional = { ...draft, venueName: 'Fictional Nuremberg venue' };
  assert.throws(() => validateAiProposal(base, fictional, [source], { ...meta, preserveSyntheticBookingFacts: true }), /fictional demo/);
  assert.throws(() => validateAiProposal(base, draft, [synthetic], { ...meta, preserveSyntheticBookingFacts: true }), /fictional demo/);
  const result = validateAiProposal(base, fictional, [synthetic], { ...meta, preserveSyntheticBookingFacts: true });
  assert.equal(result.status, 'PASS');
  assert.equal(result.option.venueStatus, 'PASS');
  const live = createDecisionAudit({ scenario: inputs.scenario, policy: inputs.policy, ranges: inputs.ranges,
    candidateSet: inputs.fitInput.candidateSet, queries: [], generatedAt: stamp, runId: 'missing-live-fit', mode: 'live' });
  assert.throws(() => validateAiProposal(live, fictional, [synthetic], meta), /synthetic research/);
  assert.throws(() => validateAiProposal(live, fictional, [source], { ...meta, preserveSyntheticBookingFacts: true }), /fictional demo/);
  assert.equal(validateAiProposal(live, fictional, [source], meta).option.venueStatus, 'UNKNOWN');
});

test('the proposal status includes independent preference gates as well as feasibility', () => {
  const result = validateAiProposal(base, { ...draft, id: 'proposed-frankfurt', kind: 'detour', cityId: 'de-frankfurt' }, [source], meta);
  assert.equal(result.option.routingStatus, 'PASS');
  assert.equal(result.option.status, 'UNKNOWN');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.audit.analysis.decision.options.find(row => row.optionId === result.option.id)!.checks.some(row => row.status === 'FAIL'));
});

test('acceptance ignores forged wire status, uses current thresholds and preserves the other card', () => {
  const checked = validateAiProposal(base, draft, [source], meta);
  const forged = { ...checked, status: 'PASS' as const, option: { ...checked.option, status: 'PASS' as const } };
  const current = createDecisionAudit({ scenario: base.replay.scenario, fitInput: inputs.fitInput, controlFitInput: inputs.controlFitInput,
    policy: { ...inputs.policy, minimumFitIndex: 30 }, ranges: inputs.ranges, candidateSet: inputs.fitInput.candidateSet,
    queries: base.queries, mode: 'demo', runId: 'threshold-changed', generatedAt: later });
  const accepted = acceptAiProposal(current, session([forged]), draft.id, { ...meta, runId: 'accepted' });
  assert.equal(accepted.optionId, 'replacement-nuremberg');
  assert.equal(accepted.audit.analysis.decision.options.find(row => row.optionId === accepted.optionId)?.status, 'FAIL');
  assert.equal(accepted.audit.replay.policy.minimumFitIndex, 30);
  assert.deepEqual(accepted.audit.replay.scenario.repairCandidates.find(row => row.kind === 'detour'),
    current.replay.scenario.repairCandidates.find(row => row.kind === 'detour'));
  assert.deepEqual(accepted.audit.replay.scenario.tour.shows, base.replay.scenario.tour.shows);
  assert.throws(() => acceptAiProposal(current, session([forged]), draft.id, { ...meta, generatedAt: stamp }), /precede/);
  for (const stopReason of ['incomplete', 'cancelled', 'provider-error', 'token-limit'] as const) {
    assert.throws(() => acceptAiProposal(current, { ...session([forged]), stopReason }, draft.id, meta), /completed session/);
  }
  assert.throws(() => acceptAiProposal(current, { ...session([forged]), proposals: [forged] }, draft.id, meta), /two to four/);
});

test('acceptance rejects a stale artist universe and duplicate other-card city without modifying current data', () => {
  const checked = validateAiProposal(base, draft, [source], meta);
  const research = session([checked]);
  const changed = createDecisionAudit({ scenario: base.replay.scenario, policy: inputs.policy, ranges: inputs.ranges,
    candidateSet: { ...inputs.fitInput.candidateSet, id: 'different-universe' }, queries: [],
    mode: 'demo', runId: 'changed-universe', generatedAt: later });
  assert.throws(() => acceptAiProposal(changed, research, draft.id, meta), /frozen evidence changed/);
  const conflicting = { ...research, proposals: [{ ...checked, draft: { ...draft, cityId: 'de-frankfurt' } }, research.proposals[1]!] };
  const before = JSON.stringify(base);
  assert.throws(() => acceptAiProposal(base, conflicting, draft.id, meta), /other show card/);
  assert.equal(JSON.stringify(base), before);
});

test('analysis and audit tools use the existing deterministic breakpoint and leave-one-out engine', () => {
  const result = generateAiDecisionAudit(base, meta);
  assert.equal(result.generatedAt, later);
  assert.deepEqual(analyzeAiDecision(base), base.analysis);
  assert.deepEqual(result.analysis.breakpoints, base.analysis.breakpoints);
  assert.equal(result.analysis.artistSensitivity.runs.length, 2);
  assert.deepEqual(result.queries, base.queries);
});

test('AI audit envelope retains research, acceptance and replay without changing the Qloo query contract', () => {
  const checked = validateAiProposal(base, draft, [source], meta);
  const research = session([checked]);
  const accepted = acceptAiProposal(base, research, draft.id, meta);
  const envelope = createAiAuditEnvelope(research, [accepted], accepted.audit, later);
  assert.equal(envelope.schemaVersion, 'tour-rescue.ai-audit.v1');
  assert.deepEqual(envelope.session.sources, [source]);
  assert.deepEqual(envelope.accepted[0]?.sourceIds, ['source-1']);
  assert.deepEqual(envelope.decisionAudit.queries, base.queries);
  assert.deepEqual(envelope.decisionAudit, replayDecisionAudit(envelope.decisionAudit));
  assert.throws(() => createAiAuditEnvelope({ ...research, mode: 'live' }, [], base, later), /contexts differ/);
  assert.throws(() => createAiAuditEnvelope(research, [{ ...accepted, sourceIds: ['invented'] }], accepted.audit, later), /unknown/);
});
