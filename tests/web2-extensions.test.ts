import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEconomics, SAMPLE_ECONOMICS, SAMPLE_PLAN_BRIEF, SAMPLE_SUPPLIERS,
  initialSosSample, selectedSupplier, summarizePlanBrief, transitionSosSample } from '../web2/src/extension-state.ts';

test('SOS sample has two explicitly fictitious suppliers and never creates a real booking', () => {
  assert.equal(SAMPLE_SUPPLIERS.length, 2);
  assert.ok(SAMPLE_SUPPLIERS.every(s => s.source === 'illustrative-sample'));
  let state = transitionSosSample(initialSosSample(), { type: 'find-sample-options' });
  state = transitionSosSample(state, { type: 'choose-sample-supplier', id: 'saigon-stage-supply' });
  assert.equal(selectedSupplier(state).estimateVnd, 1_950_000);
  state = transitionSosSample(state, { type: 'review-sample-quote' });
  assert.equal(state.sampleApproval, false);
  state = transitionSosSample(state, { type: 'preview-approval' });
  assert.equal(state.stage, 'preview-approved');
  assert.equal(state.sampleApproval, true);
  assert.equal(transitionSosSample(state, { type: 'back' }).sampleApproval, false);
});
test('SOS cannot approve sample spend over cap or without reviewing', () => {
  let state = initialSosSample();
  assert.throws(() => transitionSosSample(state, { type: 'preview-approval' }));
  state = transitionSosSample(state, { type: 'edit-problem', problem: 'head', location: 'HCMC',
    requiredLocal: '16:00 ICT', budgetCapVnd: 100_000 });
  state = transitionSosSample(state, { type: 'find-sample-options' });
  state = transitionSosSample(state, { type: 'review-sample-quote' });
  assert.throws(() => transitionSosSample(state, { type: 'preview-approval' }));
});
test('sample NL planner reads explicit constraints without touching core tour', () => {
  const summary = summarizePlanBrief(SAMPLE_PLAN_BRIEF);
  assert.equal(summary.kind, 'unverified-draft');
  assert.equal(summary.showCount, 12);
  assert.equal(summary.drivingHourCap, 4);
  assert.equal(summary.region, 'Germany + Poland');
  assert.equal(summary.venuePeople, '300–600 people');
  assert.equal(summary.avoidMondays, true);
  assert.equal(summarizePlanBrief('Keep it flexible').drivingHourCap, null);
});
test('economics do not turn taste into ticket predictions', () => {
  const verdict = evaluateEconomics(SAMPLE_ECONOMICS);
  assert.deepEqual(verdict, { lowEur: -420, highEur: 420, breakEvenTickets: 150, verdict: 'Close call' });
  assert.throws(() => evaluateEconomics({ ...SAMPLE_ECONOMICS, artistShare: 1.3 }));
});
