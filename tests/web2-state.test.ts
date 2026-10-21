import test from 'node:test';
import assert from 'node:assert/strict';
import { initialIncident, transitionIncident, isFocusedRescue } from '../web2/src/state.ts';

const now = '2026-10-21T19:00:00Z';
function ready() {
  const searching = transitionIncident(initialIncident(), { type: 'start-search' });
  return transitionIncident(searching, { type: 'proposals-ready', runId: 'audit-1', optionIds: ['a', 'b', 'c'] });
}

test('incident goes from new through audited options to draft without pretending to send', () => {
  const options = ready();
  const chosen = transitionIncident(options, { type: 'choose', optionId: 'a' });
  const draft = transitionIncident(chosen, { type: 'prepare-draft' });
  assert.equal(draft.phase, 'draft');
  assert.equal(draft.sentEvidence, null);
  assert.equal(draft.responseEvidence, null);
  assert.equal(isFocusedRescue(draft.phase), true);
  assert.equal(isFocusedRescue(initialIncident().phase), false);
});

test('cannot choose unvalidated cities or claim sent without a delivery reference', () => {
  assert.throws(() => transitionIncident(ready(), { type: 'choose', optionId: 'not-evaluated' }));
  const draft = transitionIncident(transitionIncident(ready(), { type: 'choose', optionId: 'a' }), { type: 'prepare-draft' });
  assert.throws(() => transitionIncident(draft, { type: 'record-sent', messageId: '', at: now }));
  assert.throws(() => transitionIncident(draft, { type: 'record-response', outcome: 'confirmed', reference: 'x', at: now }));
  assert.equal(transitionIncident(draft, { type: 'back-to-choice' }).phase, 'chosen');
});

test('sent, waiting, response and stale require real evidence and ordered phases', () => {
  const draft = transitionIncident(transitionIncident(ready(), { type: 'choose', optionId: 'b' }), { type: 'prepare-draft' });
  const sent = transitionIncident(draft, { type: 'record-sent', messageId: 'provider-ack-1', at: now });
  assert.equal(sent.phase, 'sent');
  const waiting = transitionIncident(sent, { type: 'await-response' });
  assert.equal(transitionIncident(waiting, { type: 'record-response', outcome: 'confirmed', reference: 'reply-1', at: now }).phase, 'confirmed');
  assert.equal(transitionIncident(waiting, { type: 'record-response', outcome: 'rejected', reference: 'reply-2', at: now }).phase, 'rejected');
  assert.equal(transitionIncident(waiting, { type: 'mark-stale', reference: 'date elapsed', at: now }).phase, 'stale');
  assert.throws(() => transitionIncident(waiting, { type: 'start-search' }));
});

test('invalid option lists are rejected and resetting clears all evidence', () => {
  const searching = transitionIncident(initialIncident(), { type: 'start-search' });
  assert.throws(() => transitionIncident(searching, { type: 'proposals-ready', runId: 'x', optionIds: ['a', 'a'] }));
  assert.throws(() => transitionIncident(searching, { type: 'proposals-ready', runId: 'x', optionIds: [] }));
  assert.equal(transitionIncident(ready(), { type: 'reset' }).phase, 'new');
  assert.deepEqual(transitionIncident(ready(), { type: 'reset' }), initialIncident());
});
