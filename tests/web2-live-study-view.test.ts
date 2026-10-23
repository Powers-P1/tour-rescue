import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionAudit } from '../src/core/audit.ts';
import { germanyDemoInputs } from '../src/demo/germany.ts';
import type { FitInput } from '../src/core/fit-types.ts';
import type { QueryEvidence } from '../src/core/evidence-types.ts';
import type { ApiDecisionResult } from '../worker/src/app.ts';
import { renderLiveStudyReport } from '../web2/src/live-study-view.ts';
import { projectLiveStudy } from '../web2/src/live-study.ts';

const stamp = '2026-10-23T16:18:00Z';
const known = <T>(value: T) => ({ status: 'known' as const, value });
/** Invented test evidence with recording references, not a provider request. */
function liveFixture(missingCity = false, withControl = true): ApiDecisionResult {
  const input = germanyDemoInputs();
  const recording = (fit: FitInput): FitInput => ({ ...fit, profiles: fit.profiles.map(profile => ({ ...profile,
    provenance: { kind: 'recording-reference', reference: 'test-only:' + profile.queryId,
      evidenceId: profile.queryId, recordedAt: stamp, normalizationVersion: 'test-only-v1' },
    observations: profile.observations.map(row => missingCity && profile.role === 'target' && row.cityId === 'de-nuremberg'
      ? { ...row, affinity: { status: 'unknown', reason: 'Test missing city evidence.' } } : row),
  })) });
  const fit = recording(input.fitInput), control = recording(input.controlFitInput);
  const profiles = [...fit.profiles, ...(withControl ? control.profiles.filter(profile => profile.role === 'target') : [])];
  const queries: QueryEvidence[] = profiles.map((profile, index) => ({
    queryId: profile.queryId, operation: 'artist-heatmap', endpoint: '/v2/insights',
    parameters: { 'filter.type': 'urn:heatmap', 'signal.interests.entities': profile.artistId,
      'filter.location': 'POLYGON((5 47,16 47,16 56,5 56,5 47))', 'output.heatmap.boundary': 'urn:geohash' },
    startedAt: stamp, completedAt: stamp, source: index === 0 ? 'live' : 'cache', status: 'success',
    httpStatus: known(200), responseReference: known(profile.queryId), responseRecordedAt: known(stamp), warnings: [],
  }));
  return { schemaVersion: 'tour-rescue.api-result.v1', mode: 'live', scenarioId: input.scenario.id,
    artists: input.artists, audit: createDecisionAudit({ scenario: input.scenario, policy: input.policy, ranges: input.ranges,
      candidateSet: fit.candidateSet, fitInput: fit, ...(withControl ? { controlFitInput: control } : {}),
      queries, generatedAt: stamp, runId: 'test-only-live-study', mode: 'live' }) };
}
const decode = (html: string) => html.replace(/&(amp|lt|gt|quot|#39);/g, (_match, entity: string) =>
  ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]!);

test('live summary shows actual city coverage and separate with/without-taste decisions, retaining closed technical data', () => {
  const result = liveFixture();
  const study = projectLiveStudy(result, 'worker-test');
  const html = renderLiveStudyReport(result, 'worker-test');
  assert.match(html, /24 frozen German cities/);
  assert.equal((html.match(/<strong>24\/24<\/strong>/g) ?? []).length, study.profiles.length);
  assert.match(html, /<dt>With Qloo<\/dt><dd>Nuremberg<\/dd>/);
  assert.match(html, /<dt>Without taste evidence<\/dt><dd>Needs evidence<\/dd>/);
  for (const artist of [result.artists.target, ...result.artists.comparisons, result.artists.control]) assert.ok(html.includes(artist.name!));
  assert.match(html, /Query provenance: [^<]*Live Qloo/);
  assert.match(html, /Query provenance: [^<]*Worker cache/);
  assert.match(html, /live-study-control[^]*?Day off · Different recommendation<\/span>/);
  assert.match(html, /<strong>Nuremberg<\/strong> · Unchanged<\/li>/);
  assert.match(html, /23 Oct 2026, 16:18 UTC/);
  const technical = html.match(/<details class="live-study-technical"><summary>[^]*?<pre class="live-study-report">([^]*?)<\/pre><\/details>/);
  assert.ok(technical, 'raw JSON is retained behind a closed details element');
  assert.deepEqual(JSON.parse(decode(technical[1]!)), study);
});

test('incomplete profiles and unavailable controls remain visible instead of being reported as complete or unchanged', () => {
  const result = liveFixture(true, false);
  const html = renderLiveStudyReport(result, 'worker-test');
  assert.match(html, /<strong>23\/24<\/strong>/);
  assert.match(html, /Control: [^]*?<\/strong><span>UNKNOWN:/);
  assert.match(html, /Needs evidence/);
  assert.doesNotMatch(html, /100%|confidence/i);
  const study = projectLiveStudy(result, 'worker-test');
  assert.equal(study.control.status, 'unknown');
  const omissions = html.match(/<ul class="live-study-omissions">([^]*?)<\/ul>/)?.[1] ?? '';
  assert.ok(study.artistOmissions.every(run => omissions.includes(run.outcome === 'not-comparable' ? 'Not comparable' : 'UNKNOWN')));
});

test('artist and version text is escaped and no-evidence reports do not invent profile counts', () => {
  const result = liveFixture();
  const input = germanyDemoInputs();
  const empty: ApiDecisionResult = { ...result,
    artists: { ...result.artists, target: { ...result.artists.target, name: '<script>test</script>' } },
    audit: createDecisionAudit({ scenario: input.scenario, candidateSet: input.fitInput.candidateSet,
      policy: input.policy, ranges: input.ranges, queries: [], generatedAt: stamp, runId: 'test-no-fit', mode: 'live' }) };
  const html = renderLiveStudyReport(empty, '<worker>');
  assert.match(html, /Coverage UNKNOWN/);
  assert.match(html, /&lt;script&gt;test&lt;\/script&gt;/);
  assert.match(html, /Worker &lt;worker&gt;/);
  assert.doesNotMatch(html, /<script>|<strong>24\/24<\/strong>/);
});
