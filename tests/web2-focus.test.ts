import test from 'node:test';
import assert from 'node:assert/strict';
import { hadMountedScreen, selectFocusTarget } from '../web2/src/focus-policy.ts';

test('public fan screen qualifies for focus restoration without private app layout', () => {
  const publicPage = { querySelector: (selector: string) => selector === '#main' ? { id: 'main' } : null };
  assert.equal(hadMountedScreen(publicPage), true);
  assert.equal(publicPage.querySelector('.app-layout'), null);
});

test('fan action focus survives DOM replacement; missing action falls back to heading', () => {
  let active = '';
  const actions = [
    { action: 'fan-preview', focus() { active = 'fan-preview'; } },
    { action: 'close-fan', focus() { active = 'close-fan'; } },
  ];
  const find = (key: string) => selectFocusTarget({ action: key }, actions, item => ({ action: item.action }));
  const vote = find('fan-preview');
  assert.ok(vote);
  vote.focus();
  assert.equal(active, 'fan-preview');
  find('close-fan')?.focus();
  assert.equal(active, 'close-fan');
  // Back to private tour has no old fan action: renderer must focus the new page heading.
  assert.equal(find('back-to-tour-absent'), undefined);
});
