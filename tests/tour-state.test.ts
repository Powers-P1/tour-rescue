import assert from 'node:assert/strict';
import test from 'node:test';
import { TOUR_STORAGE_KEY, initialTourProgress, loadTourProgress, parseTourProgress, saveTourProgress,
  transitionTourProgress } from '../web/src/tour-state.ts';
import type { TourStepIndex, TourStorage } from '../web/src/tour-state.ts';

test('guided tour progress is versioned, bounded and accepts only consistent completion', () => {
  const saved = { schemaVersion: 'tour-rescue.guided-tour.v1', step: 3, status: 'paused' } as const;
  assert.deepEqual(parseTourProgress(saved), saved);
  for (const invalid of [null, [], '3', { ...saved, schemaVersion: 'future' },
    { ...saved, step: -1 }, { ...saved, step: 6 }, { ...saved, step: 2.5 },
    { ...saved, step: '3' }, { ...saved, status: 'completed' }, { ...saved, status: 'not-started' },
    { ...saved, status: 'invented' }, { ...saved, audit: 'private data' }]) {
    assert.deepEqual(parseTourProgress(invalid), initialTourProgress());
  }
  assert.deepEqual(parseTourProgress({ ...saved, step: 5, status: 'completed' }),
    { schemaVersion: 'tour-rescue.guided-tour.v1', step: 5, status: 'completed' });
});

test('skip retains progress for explicit resume and final completion requires a separate action', () => {
  let state = transitionTourProgress(initialTourProgress(), { type: 'start' });
  state = transitionTourProgress(state, { type: 'back' });
  assert.equal(state.step, 0);
  state = transitionTourProgress(state, { type: 'go-to', step: 2 });
  state = transitionTourProgress(state, { type: 'skip' });
  assert.equal(state.status, 'paused');
  assert.equal(state.step, 2);
  state = transitionTourProgress(state, { type: 'resume' });
  assert.equal(state.step, 2);
  assert.equal(state.status, 'in-progress');
  assert.throws(() => transitionTourProgress(state, { type: 'complete' }), RangeError);
  for (let n = 0; n < 8; n += 1) state = transitionTourProgress(state, { type: 'next' });
  assert.equal(state.step, 5);
  assert.equal(state.status, 'in-progress');
  state = transitionTourProgress(state, { type: 'complete' });
  assert.equal(state.status, 'completed');
  assert.equal(transitionTourProgress(state, { type: 'resume' }).step, 0);
  assert.equal(transitionTourProgress(state, { type: 'start' }).step, 0);
  assert.throws(() => transitionTourProgress(state, { type: 'go-to', step: 9 as TourStepIndex }), RangeError);
});

test('storage saves only tutorial progress and never starts a saved session automatically', () => {
  const entries = new Map<string, string>();
  const storage: TourStorage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } };
  const state = transitionTourProgress(initialTourProgress(), { type: 'go-to', step: 4 });
  assert.equal(saveTourProgress(state, storage), true);
  assert.equal(entries.size, 1);
  assert.deepEqual(JSON.parse(entries.get(TOUR_STORAGE_KEY)!), state);
  assert.deepEqual(loadTourProgress(storage), state);
  const parsed = loadTourProgress(storage);
  assert.notEqual(parsed, state);
  // Saved progress alone is not an instruction to mount a coach or make any request.
  assert.equal(parsed.status, 'in-progress');
  assert.equal(parsed.step, 4);
});

test('blocked, corrupt and oversized storage leave the walkthrough usable without persistence', () => {
  const blocked: TourStorage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  assert.deepEqual(loadTourProgress(blocked), initialTourProgress());
  assert.equal(saveTourProgress(initialTourProgress(), blocked), false);
  assert.equal(saveTourProgress(initialTourProgress()), false);
  assert.deepEqual(loadTourProgress(), initialTourProgress());
  for (const raw of ['{broken', 'null', 'x'.repeat(513), JSON.stringify({ schemaVersion: 'future' })]) {
    assert.deepEqual(loadTourProgress({ getItem: () => raw, setItem() {} }), initialTourProgress());
  }
});
