import assert from 'node:assert/strict';
import test from 'node:test';
import { createDecisionAudit } from '../src/core/audit.ts';
import type { DecisionAudit } from '../src/core/audit-types.ts';
import { germanyDemoInputs, syntheticQueryEvidence } from '../src/demo/germany.ts';
import { commonSourcedTags, fitMapCities, scatterModel } from '../web/src/visual-model.ts';
import type { SourcedTag } from '../web/src/visual-model.ts';

function demo(): DecisionAudit {
  const input = germanyDemoInputs();
  const generatedAt = '2026-10-21T12:00:00.000Z';
  return createDecisionAudit({ ...input, generatedAt, runId: 'web-visuals-test', mode: 'demo',
    queries: syntheticQueryEvidence([input.fitInput, input.controlFitInput], generatedAt) });
}

test('scatter keeps fit and road deltas independent, including a failed preference gate', () => {
  const model = scatterModel(demo());
  assert.equal(model.points.length, 2);
  assert.equal(model.points[0]?.optionId, 'replacement-nuremberg');
  assert.equal(model.points[0]?.extraMetres, 18368);
  assert.equal(model.points[0]?.fit, 25);
  assert.equal(model.points[0]?.recommended, true);
  assert.equal(model.points[1]?.extraMetres, 354097);
  assert.equal(model.points[1]?.decisionStatus, 'FAIL');
  assert.equal(model.unplotted[0]?.optionId, 'day-off');
  assert.match(model.unplotted[0]?.reason ?? '', /not applicable/);
  assert.equal(model.minKm, 0);
  assert.ok(model.maxKm >= 354.097);
});

test('scatter never fabricates a coordinate when a directed road total is missing', () => {
  const audit = demo();
  const changed: DecisionAudit = { ...audit, analysis: { ...audit.analysis,
    repairs: { ...audit.analysis.repairs, options: audit.analysis.repairs.options.map(option => option.id === 'detour-frankfurt' ?
      { ...option, additionalDistanceMetres: { status: 'unknown', reason: 'Missing directed road leg.' } } : option) } } };
  const model = scatterModel(changed);
  assert.equal(model.points.length, 1);
  assert.match(model.unplotted.find(option => option.optionId === 'detour-frankfurt')?.reason ?? '', /Extra distance UNKNOWN/);
  assert.equal(model.unplotted.find(option => option.optionId === 'detour-frankfurt')?.extraMetres.status, 'unknown');
});

test('fit map respects the frozen set and carries missing fit without substituting a colour value', () => {
  const audit = demo();
  assert.equal(fitMapCities(audit).length, 24);
  assert.deepEqual(fitMapCities(audit).find(city => city.id === 'de-nuremberg')?.fit, { status: 'known', value: 25 });
  const unknown: DecisionAudit = { ...audit, analysis: { ...audit.analysis,
    repairs: { ...audit.analysis.repairs, fitReport: { status: 'unknown', reason: 'Provider unavailable.' } } } };
  assert.ok(fitMapCities(unknown).every(city => city.fit.status === 'unknown'));
  assert.deepEqual(fitMapCities({ ...audit, frozenCandidateSet: { status: 'unknown', reason: 'No frozen set.' } }), []);
});

function tag(id: string, label = id, reference = 'fixture:explicit-tag-evidence'): SourcedTag {
  return { id, label, provenance: { queryId: 'query-tags', reference, source: 'synthetic',
    recordedAt: { status: 'unknown', reason: 'Synthetic fixture has no acquisition time.' } } };
}

test('Tag Bridge requires shared IDs and provenance on both sides, caps at three and does not infer by label', () => {
  const input = {
    left: { label: 'Target', tags: [tag('a'),tag('a'),tag('b'),tag('c'),tag('d'),tag('unverified','Unverified','')] },
    right: { label: 'Comparison', tags: [tag('a'),tag('b'),tag('c'),tag('d'),tag('unverified')] },
  };
  const before = JSON.stringify(input);
  const result = commonSourcedTags(input);
  assert.equal(result.status, 'known');
  if (result.status === 'known') assert.deepEqual(result.value.map(tag => tag.id), ['a','b','c']);
  assert.equal(JSON.stringify(input), before);
  assert.equal(commonSourcedTags({ left: { label: 'A', tags: [tag('x','Indie')] },
    right: { label: 'B', tags: [tag('y','Indie')] } }).status, 'unknown');
  assert.equal(commonSourcedTags({ left: { label: 'A', tags: [tag('x','Indie','')] },
    right: { label: 'B', tags: [tag('x','Indie')] } }).status, 'unknown');
});

test('absent Tag Bridge evidence is UNKNOWN, never an empty claim of verified commonality', () => {
  assert.deepEqual(commonSourcedTags(), { status: 'unknown', reason: 'No verified common-tag evidence is supplied by this run.' });
});
