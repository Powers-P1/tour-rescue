import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoResult, recomputeResult } from '../web/src/data.ts';
import { createAiDemoSession } from '../src/ai/demo.ts';
import { acceptResearchIntoComparison, emptyResearch } from '../web2/src/research-comparison.ts';
import { loadSimulation, saveSimulation, simulationDraftScope } from '../web2/src/desktop-model.ts';
import { createWorkspaceHistory, isWorkspaceHistoryKey, canonicalWorkspaceHash, workspaceScreenHash } from '../web2/src/workspace-history.ts';

const stamp = '2026-10-23T00:00:00Z';
const storage = () => {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); } };
};

test('a saved default demo preference survives reload only for the same audited inputs', () => {
  const base = createDemoResult({ generatedAt: stamp, runId: 'before-reload' });
  const reload = createDemoResult({ generatedAt: '2026-10-23T00:02:00Z', runId: 'after-reload' });
  const device = storage();
  const draft = { schemaVersion: 'tour-rescue.web2-sim-draft.v1' as const,
    baseRunId: simulationDraftScope(base), optionId: 'day-off', extraKm: 0 };
  saveSimulation(device, draft);
  assert.deepEqual(loadSimulation(device, simulationDraftScope(reload)), draft);
  const differentPolicy = recomputeResult(reload, { maxAdditionalDistanceMetres: 354100 });
  assert.equal(loadSimulation(device, simulationDraftScope(differentPolicy)), null);
  saveSimulation(device, { ...draft, baseRunId: 'demo:' + base.scenarioId });
  assert.equal(loadSimulation(device, simulationDraftScope(reload)), null, 'an older unscoped draft cannot claim this context');
});

test('accepted demo research cannot lend its saved draft to the default comparison after reload', () => {
  const base = createDemoResult({ generatedAt: stamp, runId: 'base' });
  const session = createAiDemoSession('corridor-repair', { generatedAt: stamp });
  const accepted = acceptResearchIntoComparison(base, session, session.proposals[0]!.draft.id, emptyResearch(),
    { generatedAt: '2026-10-23T00:01:00Z', runId: 'accepted' });
  const device = storage();
  const scope = simulationDraftScope(accepted.result, accepted.history.accepted.length > 0);
  const draft = { schemaVersion: 'tour-rescue.web2-sim-draft.v1' as const,
    baseRunId: scope, optionId: accepted.acceptance.optionId, extraKm: 354.1 };
  saveSimulation(device, draft);
  assert.deepEqual(loadSimulation(device, simulationDraftScope(accepted.result, true)), draft);
  const reload = createDemoResult({ generatedAt: '2026-10-23T00:02:00Z', runId: 'reloaded-base' });
  assert.equal(loadSimulation(device, simulationDraftScope(reload)), null);
  assert.deepEqual(accepted.result.audit.replay, reload.audit.replay, 'acceptance can add research provenance without changing route facts');
  assert.notEqual(scope, simulationDraftScope(reload), 'even identical route facts cannot restore the missing acceptance and sources');
  const gaps = createAiDemoSession('evidence-gaps', { generatedAt: stamp });
  const changed = acceptResearchIntoComparison(base, gaps, gaps.proposals[0]!.draft.id, emptyResearch(),
    { generatedAt: '2026-10-23T00:01:00Z', runId: 'changed-venue-evidence' });
  assert.notEqual(simulationDraftScope(changed.result), simulationDraftScope(reload), 'changed venue evidence also scopes an unaccepted replay differently');
  const anotherLiveRun = { ...base, mode: 'live' as const, audit: { ...base.audit, runId: 'live-other' } };
  assert.equal(simulationDraftScope(anotherLiveRun), 'live-other');
  assert.equal(loadSimulation(device, simulationDraftScope(anotherLiveRun)), null);
});

test('an old document history entry cannot resolve to a new comparison after reload', () => {
  const oldDocument = createWorkspaceHistory<{ screen: string; cap: number; runId: string }>('old-document');
  const oldKey = oldDocument.remember(undefined, { screen: 'simulation', cap: 354.1, runId: 'accepted' });
  const newDocument = createWorkspaceHistory<{ screen: string; cap: number; runId: string }>('new-document');
  const newKey = newDocument.remember(oldKey, { screen: 'simulation', cap: 350, runId: 'default' });
  assert.notEqual(newKey, oldKey);
  assert.equal(newDocument.get(oldKey), undefined);
  assert.equal(newDocument.get(1), undefined, 'legacy numeric IDs cannot resolve in a fresh registry');
  assert.equal(isWorkspaceHistoryKey(oldKey), true);
  assert.equal(isWorkspaceHistoryKey(1), true, 'legacy entries still take the expired-context fallback');
  assert.equal(isWorkspaceHistoryKey(undefined), false);
});

test('Back and Forward within this document retain the exact decision and bounded snapshots', () => {
  const history = createWorkspaceHistory<{ screen: string; cap: number; optionId: string }>('tab');
  const first = history.remember(undefined, { screen: 'simulation', cap: 354.1, optionId: 'detour-frankfurt' });
  const evidence = history.remember(undefined, { screen: 'evidence', cap: 354.1, optionId: 'detour-frankfurt' });
  assert.deepEqual(history.get(first), { screen: 'simulation', cap: 354.1, optionId: 'detour-frankfurt' });
  assert.equal(history.remember(first, { screen: 'simulation', cap: 400, optionId: 'replacement-nuremberg' }), first);
  assert.deepEqual(history.get(evidence), { screen: 'evidence', cap: 354.1, optionId: 'detour-frankfurt' });
  assert.notEqual(history.remember(evidence, { screen: 'draft', cap: 400, optionId: 'replacement-nuremberg' }), evidence);
  for (let count = 0; count < 120; count++) history.remember(undefined, { screen: 'route', cap: count, optionId: '' });
  assert.equal(history.get(first), undefined);
});

test('legacy hash aliases identify the same audited screen before history lookup', () => {
  const history = createWorkspaceHistory<{ screen: string; cap: number }>('aliases');
  for (const [alias, screen] of [['breakpoint', 'simulation'], ['audit', 'evidence'], ['options', 'options']] as const) {
    const key = history.remember(undefined, { screen, cap: 354.1 });
    assert.equal(canonicalWorkspaceHash(alias), workspaceScreenHash(history.get(key)!.screen));
  }
  assert.equal(canonicalWorkspaceHash('detail'), 'detail');
  assert.equal(workspaceScreenHash('today'), '');
});
