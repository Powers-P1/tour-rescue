import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoResult } from '../web/src/data.ts';
import { projectRescue, UNKNOWN, duration } from '../web2/src/model.ts';

test('PR-A projection is computed from the maintained core, not board numbers', () => {
  const demo = createDemoResult({ runId: 'web2-test', generatedAt: '2026-10-21T12:00:00.000Z' });
  const view = projectRescue(demo);
  const fromCore = demo.audit.replay.scenario;
  assert.equal(view.mode, 'demo');
  assert.equal(view.runId, demo.audit.runId);
  assert.equal(view.options.length, 3);
  assert.deepEqual(view.options.map(option => option.id), fromCore.repairCandidates.map(candidate => candidate.id));
  assert.equal(view.cancelledCity, 'Leipzig');
  assert.match(view.sourceMessage, /synthetic taste data/);
  assert.equal(view.options[2]?.kind, 'day-off');
  assert.equal(view.options[2]?.relativeFit, 'N/A - no show');
});

test('unknown driving evidence remains unknown, not a fabricated zero', () => {
  assert.equal(duration({ status: 'unknown', reason: 'Missing leg' }), UNKNOWN);
  assert.equal(duration({ status: 'known', value: 12_600 }), '3h 30m');
  assert.equal(duration({ status: 'known', value: 0 }), '0m');
});

test('Frankfurt cannot advertise a passing outcome when extra distance fails', () => {
  const demo = createDemoResult({ runId: 'frankfurt-test', generatedAt: '2026-10-21T12:00:00.000Z' });
  const view = projectRescue(demo);
  const frankfurt = view.options.find(option => option.id === 'detour-frankfurt');
  assert.ok(frankfurt);
  const failedExtraDistance = frankfurt.checks.some(check => check.id === 'decision:additional-distance' && check.status === 'FAIL');
  assert.equal(failedExtraDistance, true, 'Fixture should expose the extra-distance failure');
  assert.equal(frankfurt.decisionCheck, 'FAIL');
  assert.match(frankfurt.reason, /extra distance exceeds your cap/i);
  assert.doesNotMatch(frankfurt.reason, /taste fit meets threshold/i);
});
