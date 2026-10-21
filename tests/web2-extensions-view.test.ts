import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSosSample, SAMPLE_PLAN_BRIEF, summarizePlanBrief } from '../web2/src/extension-state.ts';
import { renderExtension } from '../web2/src/extension-views.ts';
import type { ExtensionContext } from '../web2/src/extension-views.ts';

const defaults: ExtensionContext = {
  tabs: '', sos: initialSosSample(), planBrief: SAMPLE_PLAN_BRIEF,
  planSummary: summarizePlanBrief(SAMPLE_PLAN_BRIEF), showAssumptions: false,
  fanPreviewed: false, aiBusy: false, aiNotice: '', aiMode: 'demo',
  aiSteps: [], aiSession: null, sourceMode: 'demo',
};

test('SOS mockup exposes a real input label, a two-option radio group and an unbooked quote', () => {
  const form = renderExtension('sos-problem', defaults);
  const choices = renderExtension('sos-options', defaults);
  const quote = renderExtension('sos-quote', defaults);
  assert.match(form, /label for="sos-problem"/);
  assert.match(form, /sos-budget/);
  assert.equal((choices.match(/data-action="sos-select"/g) ?? []).length, 2);
  assert.match(choices, /fictional estimates/i);
  assert.match(quote, /NOT RECEIVED/);
  assert.match(quote, /Nothing will be booked/);
});

test('fan page has no manager tabs, SOS control, or pretend recorded vote', () => {
  const fan = renderExtension('fan', defaults);
  assert.match(fan, /Email for updates/);
  assert.doesNotMatch(fan, /data-action="sos"|mobile-tabs/);
  assert.match(fan, /No mailing list, tracking or ticketing backend/);
  const after = renderExtension('fan', { ...defaults, fanPreviewed: true });
  assert.match(after, /interest was not recorded/i);
});

test('economics shows assumptions on demand; agent demo discloses synthetic origin', () => {
  const econ = renderExtension('economics', defaults);
  assert.match(econ, /−€420 to \+€420/);
  assert.match(econ, /150 tickets/);
  assert.doesNotMatch(econ, /Fixed costs/);
  assert.match(renderExtension('economics', { ...defaults, showAssumptions: true }), /Fixed costs/);
  const agent = renderExtension('ai', defaults);
  assert.match(agent, /Saved, authored research transcript/);
  assert.doesNotMatch(agent, /Start live AI research →/);
  assert.match(renderExtension('ai', { ...defaults, aiMode: 'live', sourceMode: 'live', aiBusy: true }), /Stop research/);
});

test('planner draft surfaces each unverified corridor and the four weak-link checks', () => {
  const html = renderExtension('plan-preview', defaults);
  assert.match(html, /Weak links/);
  assert.equal((html.match(/\? To confirm/g) ?? []).length, 3);
  for (const item of ['Germany', 'Border transfer', 'Poland', 'Venues and room availability',
    'Dates and schedule windows', 'No-Mondays rule not yet validated', 'road feasibility not checked']) {
    assert.ok(html.includes(item), item);
  }
});
test('agent status contains an icon and an explicit text label', () => {
  assert.match(renderExtension('ai', { ...defaults, aiNotice: '× Failed - existing decision kept.' }),
    /× Failed - existing decision kept/);
  assert.match(renderExtension('ai', { ...defaults, aiNotice: '◷ Research in progress' }),
    /◷ Research in progress/);
});
