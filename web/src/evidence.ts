import type { ApiDecisionResult } from './data.ts';
import type { Recommendation } from '../../src/core/decision-types.ts';
import type { Knowledge } from '../../src/core/domain.ts';
import type { FitReport } from '../../src/core/fit-types.ts';
import type { CheckStatus, ConstraintCheck } from '../../src/core/travel-constraints.ts';
import { combineCheckStatuses } from '../../src/core/travel-constraints.ts';
import { fitDisplay, formatFit, optionLetter, optionTitle } from './presentation.ts';
import { renderFitMap, renderTagBridge } from './visuals.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function badge(status: CheckStatus): HTMLElement {
  return el('span', `status-badge status-${status.toLowerCase()}`, status);
}

function panel(title: string, subtitle?: string): HTMLElement {
  const value = el('section', 'panel evidence-panel');
  value.append(el('h3', 'panel-heading', title));
  if (subtitle !== undefined) value.append(el('p', 'muted evidence-subtitle', subtitle));
  return value;
}

function knowledge<T>(value: Knowledge<T>, format: (value: T) => string): string {
  return value.status === 'known' ? format(value.value) : `UNKNOWN: ${value.reason}`;
}

function recommendation(result: ApiDecisionResult, value: Recommendation): string {
  return value.status === 'recommended' ? optionTitle(result, value.optionId) :
    value.status === 'needs-evidence' ? 'UNKNOWN · more evidence needed' : 'No feasible option';
}

function artistName(result: ApiDecisionResult, id: string): string {
  const artist = [result.artists.target, ...result.artists.comparisons, result.artists.control].find(artist => artist.id === id);
  return artist?.name ?? id;
}

function fitFor(result: ApiDecisionResult, report: FitReport, optionId: string): string {
  const candidate = result.audit.replay.scenario.repairCandidates.find(candidate => candidate.id === optionId);
  if (candidate?.kind === 'day-off') return 'N/A';
  if (candidate === undefined) return 'UNKNOWN';
  const value = report.cities.find(city => city.cityId === candidate.cityId)?.value;
  return value?.status === 'known' ? formatFit(value.value) : 'UNKNOWN';
}

function sensitivityTable(result: ApiDecisionResult): HTMLElement {
  const audit = result.audit;
  const options = audit.analysis.repairs.options;
  const wrapper = el('div', 'evidence-table-scroll');
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'Fit and decision for each artist omission');
  const table = el('table', 'evidence-table');
  const caption = el('caption', 'evidence-table-caption', 'A, B and C are option labels. C has no proposed audience, so its cultural fit is N/A.');
  const head = el('thead');
  const headRow = el('tr');
  headRow.append(el('th', '', 'Artist omitted'));
  for (const option of options) {
    const heading = el('th', 'fit-cell', optionLetter(result, option.id));
    heading.title = optionTitle(result, option.id);
    headRow.append(heading);
  }
  headRow.append(el('th', '', 'Recommendation'));
  head.append(headRow);
  const body = el('tbody');
  const row = (label: string, scores: readonly string[], decision: Recommendation, outcome: string, className = ''): void => {
    const tr = el('tr', className);
    const name = el('th', '', label);
    name.scope = 'row';
    tr.append(name);
    scores.forEach(score => tr.append(el('td', 'fit-cell', score)));
    const summary = el('td', 'sensitivity-result');
    summary.append(el('strong', '', recommendation(result, decision)), el('span', 'muted', outcome));
    tr.append(summary);
    body.append(tr);
  };
  row('Full profile', options.map(fitDisplay), audit.analysis.decision.recommendation, 'Baseline', 'is-baseline');
  const outcomes = { retained: 'Unchanged', 'option-changed': 'Option changed', 'recommendation-withdrawn': 'Recommendation withdrawn',
    unresolved: 'UNKNOWN', 'not-comparable': 'Not comparable' };
  for (const run of audit.analysis.artistSensitivity.runs) {
    row(artistName(result, run.removed.artistId), options.map(option => fitFor(result, run.fitReport, option.id)), run.decision.recommendation, outcomes[run.outcome]);
  }
  if (audit.controlRun.status === 'known') {
    const control = audit.controlRun.value;
    row(`Control: ${artistName(result, control.targetArtistId)}`,
      options.map(option => { const match = control.repairs.options.find(value => value.id === option.id); return match === undefined ? 'UNKNOWN' : fitDisplay(match); }),
      control.decision.recommendation, 'Different target · separate run', 'is-control');
  } else {
    const tr = el('tr', 'is-control');
    tr.append(el('th', '', 'Control artist'));
    const td = el('td', 'muted', `UNKNOWN: ${audit.controlRun.reason}`);
    td.colSpan = options.length + 1;
    tr.append(td);
    body.append(tr);
  }
  table.append(caption, head, body);
  wrapper.append(table);
  return wrapper;
}

function sensitivitySummary(result: ApiDecisionResult): HTMLElement {
  const sensitivity = result.audit.analysis.artistSensitivity;
  const block = el('div', 'sensitivity-summary');
  const retained = sensitivity.summary.retainedRecommendationFraction;
  const heading = retained.status === 'known' ?
    `${sensitivity.summary.retainedRuns}/${sensitivity.summary.totalRuns} omissions retain the recommendation` :
    sensitivity.status === 'not-applicable' ? 'Leave-one-out is not applicable' : 'Leave-one-out: UNKNOWN';
  block.append(el('strong', '', heading), el('p', 'muted', sensitivity.reason),
    el('p', 'evidence-small', 'Each comparison artist is removed once. The target and city set stay fixed; survivor weights are renormalized proportionally. This is sensitivity, not a probability of success.'));
  if (retained.status === 'unknown') block.append(el('p', 'evidence-small', retained.reason));
  return block;
}

export function renderEvidence(result: ApiDecisionResult, selectedOptionId: string): HTMLElement {
  const layout = el('div', 'evidence-layout');
  layout.dataset.tour = 'evidence';
  layout.append(renderFitMap(result.audit));
  const right = el('div', 'evidence-stack');
  const sensitivity = panel('Leave one artist out', 'How much does the decision depend on each comparison?');
  sensitivity.append(sensitivityTable(result), sensitivitySummary(result));
  const fit = result.audit.analysis.repairs.fitReport;
  const profile = panel('What the fit index measures', `Selected option: ${optionTitle(result, selectedOptionId)}`);
  if (fit.status === 'known') {
    const profiles = fit.value.profiles;
    const target = profiles.find(profile => profile.role === 'target');
    const comparisons = profiles.filter(profile => profile.role === 'comparison');
    const targetWeight = target === undefined ? 'UNKNOWN' : `${formatFit(target.weight * 100)}%`;
    const comparisonWeight = formatFit(comparisons.reduce((total, profile) => total + profile.weight, 0) * 100);
    profile.append(el('p', 'evidence-explanation', `Baseline weights: target ${targetWeight}; comparisons ${comparisonWeight}% combined. Percentiles are calculated within the same frozen city set, then weighted.`));
    const list = el('ul', 'profile-weight-list');
    for (const item of profiles) {
      const row = el('li');
      row.append(el('span', '', artistName(result, item.artistId)), el('strong', '', `${formatFit(item.weight * 100)}%`));
      list.append(row);
    }
    profile.append(list);
    if (fit.value.warnings.length > 0) {
      const details = el('details', 'evidence-details');
      details.append(el('summary', '', `${fit.value.warnings.length} fit warning${fit.value.warnings.length === 1 ? '' : 's'}`));
      for (const warning of fit.value.warnings) details.append(el('p', 'evidence-small', `${warning.code}: ${warning.message}`));
      profile.append(details);
    }
  } else profile.append(el('p', 'evidence-explanation', `Fit UNKNOWN: ${fit.reason}`));
  profile.append(el('p', 'evidence-small', 'The index is relative cultural fit. It is not an audience count, ticket-sales forecast or booking confirmation.'));
  right.append(sensitivity, renderTagBridge(), profile);
  layout.append(right);
  return layout;
}

function timestamp(value: string): HTMLTimeElement {
  const time = el('time', 'audit-time');
  time.dateTime = value;
  time.title = value;
  time.textContent = `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))} UTC`;
  return time;
}

function evidenceDetails(value: Readonly<Record<string, unknown>>, label = 'Inspect recorded evidence'): HTMLDetailsElement {
  const details = el('details', 'evidence-details');
  details.append(el('summary', '', label), el('pre', 'evidence-json', JSON.stringify(value, null, 2)));
  return details;
}

function checkGroups(result: ApiDecisionResult, selectedOptionId: string): HTMLElement {
  const selected = result.audit.analysis.decision.options.find(option => option.optionId === selectedOptionId);
  const box = panel('Declared checks', `${optionTitle(result, selectedOptionId)} · feasibility and decision preferences`);
  if (selected === undefined) { box.append(badge('UNKNOWN'), el('p', 'muted', 'The selected option has no check trace.')); return box; }
  const tally = el('div', 'audit-check-tally');
  for (const status of ['PASS', 'FAIL', 'UNKNOWN'] as const) {
    const count = selected.checks.filter(check => check.status === status).length;
    const item = el('span');
    item.append(badge(status), ` ${count}`);
    tally.append(item);
  }
  box.append(tally);
  const groups: { label: string; matches: (check: ConstraintCheck) => boolean }[] = [
    { label: 'Locked commitments', matches: check => check.id === 'locked-commitments' },
    { label: 'Driving windows and road evidence', matches: check => check.id.startsWith('travel:') },
    { label: 'Market spacing', matches: check => check.id.startsWith('market-spacing:') },
    { label: 'Venue and fee', matches: check => check.id.startsWith('venue-') },
    { label: 'Decision preferences', matches: check => check.id.startsWith('decision:') },
  ];
  const assigned = new Set<string>();
  function group(label: string, checks: readonly ConstraintCheck[]): void {
    if (checks.length === 0) return;
    checks.forEach(check => assigned.add(check.id));
    const details = el('details', 'audit-check-group');
    details.open = label === 'Locked commitments' || checks.some(check => check.status !== 'PASS');
    const summary = el('summary');
    summary.append(el('span', '', `${label} (${checks.length})`), badge(combineCheckStatuses(checks)));
    details.append(summary);
    for (const check of checks) {
      const row = el('div', 'audit-check-row');
      const copy = el('div');
      copy.append(el('p', 'audit-check-message', check.message), el('code', 'audit-check-id', check.id), evidenceDetails(check.evidence));
      row.append(badge(check.status), copy);
      details.append(row);
    }
    box.append(details);
  }
  groups.forEach(value => group(value.label, selected.checks.filter(value.matches)));
  group('Other declared checks', selected.checks.filter(check => !assigned.has(check.id)));
  box.append(el('p', 'evidence-small', 'PASS applies to the supplied scenario. Venue capacity, promoter terms, live traffic and unpriced travel costs are not certified by these checks.'));
  return box;
}

function zeroGate(result: ApiDecisionResult): HTMLElement {
  const gate = result.audit.zeroViolationsGate;
  const card = panel('Zero violated constraints', 'Gate for the recommended option only');
  card.classList.add('zero-gate', `is-${gate.status.toLowerCase()}`);
  const heading = el('div', 'zero-gate-line');
  heading.append(badge(gate.status), el('strong', '', knowledge(gate.optionId, id => optionTitle(result, id))));
  const counts = el('div', 'zero-gate-counts');
  const failures = el('div');
  const unresolved = el('div');
  failures.append(el('strong', '', gate.violatedCheckCount.status === 'known' ? String(gate.violatedCheckCount.value) : 'UNKNOWN'), el('span', '', 'violated checks'));
  unresolved.append(el('strong', '', gate.unresolvedCheckCount.status === 'known' ? String(gate.unresolvedCheckCount.value) : 'UNKNOWN'), el('span', '', 'unresolved checks'));
  counts.append(failures, unresolved);
  card.append(heading, counts, el('p', 'evidence-small', gate.reason));
  return card;
}

function controlAndChanges(result: ApiDecisionResult, selectedOptionId: string): HTMLElement {
  const audit = result.audit;
  const card = panel('Control and stop changes', 'A separate artist tests whether taste evidence can change this decision.');
  const control = audit.controlRun;
  if (control.status === 'known') {
    const entry = el('div', 'audit-control-result');
    entry.append(el('strong', '', artistName(result, control.value.targetArtistId)),
      el('p', '', recommendation(result, control.value.decision.recommendation)),
      el('p', 'muted', knowledge(control.value.recommendedOptionChanged, changed => changed ? 'The control changes the recommended option.' : 'The control retains the recommended option.')));
    const gate = el('p', 'evidence-small');
    gate.append('Control gate: ', badge(control.value.zeroViolationsGate.status));
    entry.append(gate);
    card.append(entry);
  } else card.append(el('p', 'muted', `Control UNKNOWN: ${control.reason}`));
  const selected = audit.stopChanges.originalToOptions.find(option => option.optionId === selectedOptionId);
  if (selected !== undefined) {
    const group = el('div', 'audit-stop-changes');
    const heading = el('p', 'audit-change-heading');
    heading.append(el('strong', '', optionTitle(result, selectedOptionId)), badge(selected.lockedCommitments.status));
    group.append(heading, el('p', 'muted', `${selected.unchangedLockedShowIds.length} locked commitments unchanged. ${selected.changedStopCount} of ${selected.beforeStopCount} original stops changed; ${selected.afterStopCount} stops remain.`));
    for (const change of selected.changes) {
      const summary = el('p', 'evidence-small');
      const city = (value: typeof change.before): string => value.status === 'known' ?
        audit.replay.scenario.cities.find(city => city.id === value.value.cityId)?.name ?? value.value.cityId : 'absent';
      summary.textContent = `${change.showId}: ${city(change.before)} → ${city(change.after)} · ${change.kind}. Fields: ${change.changedFields.join(', ')}.`;
      group.append(summary);
    }
    card.append(group);
  }
  const changes = audit.stopChanges.recommendedBaselineToControl;
  card.append(el('p', 'evidence-small', knowledge(changes, value => `Recommended route vs control: ${value.changedStopCount} changed stop${value.changedStopCount === 1 ? '' : 's'} (${value.beforeStopCount} → ${value.afterStopCount} shows).`)));
  card.append(sensitivitySummary(result));
  return card;
}

function queryLog(result: ApiDecisionResult): HTMLElement {
  const audit = result.audit;
  const card = panel('Evidence log', result.mode === 'demo' ? 'Synthetic taste fixtures. No live Qloo request was made.' : 'Provider requests and cache reads retained from this run.');
  const generated = el('p', 'audit-generated');
  generated.append('Audit generated ', timestamp(audit.generatedAt));
  card.append(generated, el('p', 'audit-run-id', `Run ${audit.runId}`));
  const list = el('ol', 'query-log');
  for (const query of audit.queries) {
    const item = el('li');
    const header = el('div', 'query-heading');
    const source = query.source === 'synthetic' ? 'FIXTURE' : query.source === 'cache' ? 'CACHE' : 'LIVE';
    const name = query.operation === 'artist-search' ? `Artist search: ${query.parameters.query ?? 'UNKNOWN'}` :
      `Artist heatmap: ${artistName(result, query.parameters['signal.interests.entities'] ?? 'UNKNOWN')}`;
    header.append(el('span', `query-dot ${query.status === 'failed' ? 'is-failed' : ''}`), el('strong', '', name), el('span', 'query-source', source));
    item.append(header, el('p', 'evidence-small', `${query.status === 'success' ? query.source === 'synthetic' ? 'Evaluated' : 'Succeeded' : 'Failed'} · ${query.endpoint} · ${query.source === 'synthetic' ? 'No HTTP request' : `HTTP ${query.httpStatus.status === 'known' ? query.httpStatus.value : 'UNKNOWN'}`}`));
    const evaluated = el('p', 'evidence-small');
    evaluated.append('Completed ', timestamp(query.completedAt));
    item.append(evaluated);
    if (query.responseRecordedAt.status === 'known') {
      const acquired = el('p', 'evidence-small');
      acquired.append('Source acquired ', timestamp(query.responseRecordedAt.value));
      item.append(acquired);
    } else item.append(el('p', 'evidence-small', `Acquisition time UNKNOWN: ${query.responseRecordedAt.reason}`));
    item.append(evidenceDetails({ queryId: query.queryId, parameters: query.parameters, startedAt: query.startedAt, completedAt: query.completedAt,
      source: query.source, status: query.status, httpStatus: query.httpStatus, responseReference: query.responseReference,
      responseRecordedAt: query.responseRecordedAt, warnings: query.warnings }, 'Query, provenance and warnings'));
    list.append(item);
  }
  card.append(list);
  if (audit.queries.length === 0) card.append(el('p', 'muted', 'No query records are present.'));
  const road = audit.sourceTimestamps.road;
  const roadBlock = el('div', 'road-provenance');
  roadBlock.append(el('strong', '', 'OSRM · frozen directed road matrix'), el('p', 'evidence-small', `${road.matrixId} · ${road.method}`),
    el('p', 'evidence-small', `Source: ${road.source}`));
  const roadTime = el('p', 'evidence-small');
  roadTime.append('Recorded ');
  if (road.recordedAt.status === 'known') roadTime.append(timestamp(road.recordedAt.value.iso));
  else roadTime.append(`UNKNOWN: ${road.recordedAt.reason}`);
  roadBlock.append(roadTime, el('p', 'evidence-small', 'City-centre model; a snapshot is not a live-traffic or venue-arrival guarantee.'));
  card.append(roadBlock);
  return card;
}

function frozenCities(result: ApiDecisionResult): HTMLElement {
  const frozen = result.audit.frozenCandidateSet;
  const card = panel('Frozen city set', frozen.status === 'known' ? `${frozen.value.cityIds.length} cities · ${frozen.value.id}` : `UNKNOWN: ${frozen.reason}`);
  if (frozen.status === 'known') {
    const list = el('ul', 'frozen-city-list');
    for (const id of frozen.value.cityIds) list.append(el('li', '', result.audit.replay.scenario.cities.find(city => city.id === id)?.name ?? id));
    card.append(list, el('p', 'evidence-small', 'The same city universe is used for baseline, control and every artist omission.'));
  }
  return card;
}

function warningList(result: ApiDecisionResult): HTMLElement {
  const warnings = result.audit.warnings;
  const card = panel('Warnings and limitations', `${warnings.length} audit warning${warnings.length === 1 ? '' : 's'}`);
  if (warnings.length === 0) card.append(el('p', 'muted', 'No additional audit warnings were emitted.'));
  const list = el('ul', 'audit-warning-list');
  for (const warning of warnings) {
    const item = el('li');
    item.append(el('strong', '', warning.code), el('p', 'muted', warning.message));
    if (warning.queryId !== null) item.append(el('code', 'audit-check-id', warning.queryId));
    list.append(item);
  }
  if (warnings.length <= 4) card.append(list);
  else {
    const details = el('details', 'evidence-details');
    details.append(el('summary', '', `Read all ${warnings.length} warnings`), list);
    card.append(details);
  }
  card.append(el('p', 'evidence-small', 'Tag Bridge: UNKNOWN. No verified shared-tag evidence is supplied, and tags have no ranking bonus.'));
  return card;
}

export function renderAudit(result: ApiDecisionResult, selectedOptionId: string): HTMLElement {
  const layout = el('div', 'audit-layout');
  const left = el('div', 'evidence-stack');
  const right = el('div', 'evidence-stack');
  left.append(zeroGate(result), checkGroups(result, selectedOptionId), controlAndChanges(result, selectedOptionId));
  right.append(queryLog(result), frozenCities(result), warningList(result));
  layout.append(left, right);
  return layout;
}
