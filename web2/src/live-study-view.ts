import type { ApiDecisionResult } from '../../worker/src/app.ts';
import type { Recommendation } from '../../src/core/decision-types.ts';
import { optionName } from '../../web/src/visual-model.ts';
import { projectLiveStudy, RECORDED_QLOO_STUDY } from './live-study.ts';

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

/** A visible historical result, separate from the current audit and synthetic experiment. */
export function renderRecordedQlooStudy(): string {
  const study = RECORDED_QLOO_STUDY;
  return '<section class="recorded-qloo-study" aria-labelledby="recorded-study-title" data-evidence-kind="recorded-live">'+
    '<h2 id="recorded-study-title">Real Qloo study</h2><p><strong>'+study.runs.length+
    ' artists tested · winner unchanged at '+study.maxAdditionalDistanceMetres/1000+' km</strong></p>'+
    '<dl class="recorded-study-results">'+study.runs.map(run=>'<div><dt>'+esc(run.target)+'</dt><dd><strong>'+esc(run.recommendation)+
      '</strong> · '+run.coverage+'/'+study.cityCount+' cities per selected profile</dd><dd>Control: '+esc(run.control)+
      ' · '+(run.controlChanged?'changed':'unchanged')+'; both comparison omissions '+(run.omissionsChanged?'changed':'unchanged')+'.</dd></div>').join('')+'</dl>'+
    '<p>Same frozen '+esc(study.candidateSetId)+' cities, OSRM snapshot, minimum fit '+study.minimumFit+
    ' and synthetic booking scenario; four confirmed shows stayed locked. Removing taste evidence returned Needs evidence in all three runs. These runs did not demonstrate an artist-specific change of winning city.</p>'+
    '<p class="recorded-study-meta">Measured <time datetime="'+study.measuredFrom+'">22 Oct 2026, 22:17</time>–<time datetime="'+study.measuredTo+'">22:19 UTC</time> (23 Oct in Warsaw). '+
    'Candidate frontend tested on the production Pages origin through local browser interception → existing Worker; live Qloo and private Worker-cache evidence, with no synthetic affinity substitution. Candidate '+esc(study.appVersion)+
    ' / '+esc(study.baseRevision)+'; Worker '+esc(study.workerVersion)+'.</p>'+
    '<p>Cultural fit is evidence, not a demand forecast. Venue availability, fees and terms still need human confirmation.</p>'+
    '<a href="'+esc(study.reportUrl)+'" target="_blank" rel="noopener noreferrer">Read the recorded study and provenance ↗</a></section>';
}

/** Present the existing study; retain its complete data in a closed disclosure. */
export function renderLiveStudyReport(result: ApiDecisionResult, workerVersion: string): string {
  const study = projectLiveStudy(result, workerVersion);
  const artists = [study.artists.target, ...study.artists.comparisons, study.artists.control];
  const artistName = (id: string) => {
    const artist = artists.find(row => row.id.toLowerCase() === id.toLowerCase());
    return artist?.name?.trim() || id;
  };
  const decisionName = (decision: Recommendation): string => decision.status === 'recommended'
    ? optionName(result.audit, decision.optionId)
    : decision.status === 'needs-evidence' ? 'Needs evidence' : 'No feasible option';
  const outcomeLabels = {
    retained: 'Unchanged', 'option-changed': 'Different recommendation',
    'recommendation-withdrawn': 'Recommendation withdrawn', unresolved: 'UNKNOWN',
    'not-comparable': 'Not comparable',
  };
  const profiles = [...study.profiles].sort((a, b) => Number(b.role === 'target') - Number(a.role === 'target'));
  const coverage = profiles.length
    ? '<ul class="live-study-coverage">' + profiles.map(profile => '<li><span>' +
      esc(artistName(profile.artistId)) + ' <span class="muted">(' + esc(profile.role) + ')</span></span>' +
      '<strong>' + profile.knownCities + '/' + profile.totalCities + '</strong></li>').join('') + '</ul>'
    : '<p class="live-study-note">Coverage UNKNOWN. ' + esc(study.fitUnknownReason ?? 'No profile evidence is available.') + '</p>';
  const control = study.control;
  const controlSummary = control.status === 'known'
    ? esc(decisionName(control.recommendation)) + ' · ' + (control.changed.status === 'known'
      ? (control.changed.value ? 'Different recommendation' : 'Unchanged')
      : 'UNKNOWN: ' + esc(control.changed.reason))
    : 'UNKNOWN: ' + esc(control.reason);
  const omissions = study.artistOmissions.length
    ? '<ul class="live-study-omissions">' + study.artistOmissions.map(run => '<li>Without ' +
      esc(artistName(run.artistId)) + ': <strong>' + esc(decisionName(run.recommendation)) + '</strong> · ' +
      esc(outcomeLabels[run.outcome]) +
      (run.outcome === 'unresolved' || run.outcome === 'not-comparable' ? ' · ' + esc(run.reason) : '') + '</li>').join('') + '</ul>'
    : '<p class="live-study-note">Artist omissions UNKNOWN: no comparable runs are available.</p>';
  const provenanceNames = { live: 'Live Qloo', cache: 'Worker cache', synthetic: 'Synthetic fixture' };
  const provenance = [...new Set(study.sources.map(source => provenanceNames[source.source] +
    (source.status === 'failed' ? ' (failed)' : '')))].join(' · ') || 'UNKNOWN';
  const evaluated = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false,
  }).format(new Date(study.evaluatedAt)) + ' UTC';

  return '<details class="evidence-disclosure"><summary>Live-Qloo completeness report</summary>' +
    '<div class="live-study-summary"><p class="live-study-artists"><strong>Target: ' + esc(artistName(study.artists.target.id)) + '</strong>' +
    '<span>Compared with: ' + esc(study.artists.comparisons.map(artist => artistName(artist.id)).join(' · ')) + '</span></p>' +
    '<p class="live-study-universe">' + (study.frozenCities.status === 'known'
      ? '<strong>' + study.frozenCities.value.cityIds.length + ' frozen German cities</strong> · cities with evidence'
      : 'Frozen cities UNKNOWN: ' + esc(study.frozenCities.reason)) + '</p>' + coverage +
    '<dl class="live-study-decisions"><div><dt>With Qloo</dt><dd>' + esc(study.recommendation.name) + '</dd></div>' +
    '<div><dt>Without taste evidence</dt><dd>' + esc(decisionName(study.withoutTaste)) + '</dd></div></dl>' +
    '<p class="live-study-note">Same tour and constraints; only taste evidence is removed.</p>' +
    '<p class="live-study-control"><strong>Control: ' + esc(artistName(study.artists.control.id)) + '</strong><span>' + controlSummary + '</span></p>' +
    '<h3>Leave one comparison out</h3>' + omissions +
    '<p class="live-study-meta">Evaluated <time datetime="' + esc(study.evaluatedAt) + '">' + esc(evaluated) + '</time><br>' +
    'App ' + esc(study.appVersion) + ' · Worker ' + esc(study.workerVersion) + '<br>Query provenance: ' + esc(provenance) + '</p>' +
    '<p class="live-study-note">Sample tour and booking facts. Missing evidence stays UNKNOWN; cultural fit does not predict attendance.</p>' +
    '<details class="live-study-technical"><summary>Technical JSON and source timestamps</summary><pre class="live-study-report">' +
    esc(JSON.stringify(study, null, 2)) + '</pre></details></div></details>';
}
