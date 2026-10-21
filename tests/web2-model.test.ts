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
