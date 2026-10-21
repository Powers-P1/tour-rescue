import type { AffinityProfile, CandidateSet, FitInput } from './fit-types.ts';
import type { Knowledge, TourScenario } from './domain.ts';
import type { DecisionReport } from './decision-types.ts';
import type { RepairReport } from './repair-types.ts';
import type { EvidenceWarning, QueryEvidence } from './evidence-types.ts';
import type {
  AuditStop, ControlAuditRun, CreateDecisionAuditInput, DecisionAudit, OptionStopChanges,
  RouteChangeReport, StopChange, ZeroViolationsGate,
} from './audit-types.ts';
import { parseTourScenario } from './parse-scenario.ts';
import { parseScenarioFitInput } from './scenario-fit.ts';
import { analyzeTourDecision, evaluateTourDecision } from './decision-analysis.ts';
import { checkLockedCommitments } from './repair-options.ts';

const known = <T>(value: T): Knowledge<T> => ({ status: 'known', value });
const unknown = (reason: string): Knowledge<never> => ({ status: 'unknown', reason });
const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export class AuditInputError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'AuditInputError';
  }
}

function text(value: unknown, path: string, maximum = 4096): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    throw new AuditInputError(path, `must be a nonempty string of at most ${maximum} characters`);
  }
  return value;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AuditInputError(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

/** ISO instants may use Z or an explicit offset; no date rollover or local-time default. */
function instant(value: unknown, path: string): string {
  const input = text(value, path, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(input);
  if (match === null) throw new AuditInputError(path, 'must be an ISO instant with an explicit offset');
  const values = match.slice(1, 7).map(Number);
  const [year, month, day, hour, minute, second] = values as [number, number, number, number, number, number];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if ([date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .some((part, index) => part !== values[index]) || Number(match[10] ?? 0) > 23 || Number(match[11] ?? 0) > 59
    || !Number.isFinite(Date.parse(input))) {
    throw new AuditInputError(path, 'contains an invalid calendar date, clock time or offset');
  }
  return input;
}

function knowledge<T>(value: unknown, path: string, parse: (value: unknown, path: string) => T): Knowledge<T> {
  const input = object(value, path);
  if (input.status === 'unknown') return unknown(text(input.reason, `${path}.reason`));
  if (input.status !== 'known') throw new AuditInputError(path, 'must be known or unknown');
  return known(parse(input.value, `${path}.value`));
}

/** Project an application-built trace, never copy headers, arbitrary URLs or response payloads. */
function queryLog(values: readonly QueryEvidence[], generatedAt: string): QueryEvidence[] {
  if (!Array.isArray(values) || values.length > 100) throw new AuditInputError('queries', 'must be an array of at most 100 request records');
  const seen = new Set<string>();
  return values.map((raw, index): QueryEvidence => {
    const path = `queries[${index}]`;
    const value = object(raw, path);
    const queryId = text(value.queryId, `${path}.queryId`, 256);
    if (seen.has(queryId)) throw new AuditInputError(path, 'duplicate query ID');
    seen.add(queryId);
    const operation = value.operation;
    if (operation !== 'artist-search' && operation !== 'artist-heatmap') throw new AuditInputError(path, 'unsupported operation');
    const endpoint = operation === 'artist-search' ? '/search' as const : '/v2/insights' as const;
    if (value.endpoint !== endpoint) throw new AuditInputError(path, 'endpoint does not match the operation');
    const rawParameters = object(value.parameters, `${path}.parameters`);
    const allowed = operation === 'artist-search' ? ['query', 'types', 'take'] :
      ['filter.type', 'signal.interests.entities', 'filter.location', 'output.heatmap.boundary'];
    if (Object.keys(rawParameters).some(key => !allowed.includes(key))) {
      throw new AuditInputError(`${path}.parameters`, 'contains an unapproved parameter; no headers, keys or heatmap take are permitted');
    }
    const parameters = Object.fromEntries(Object.keys(rawParameters).sort(compareIds)
      .map(key => [key, text(rawParameters[key], `${path}.parameters.${key}`)]));
    if (operation === 'artist-search') {
      if (parameters.types !== 'urn:entity:artist' || !parameters.query) throw new AuditInputError(path, 'artist search requires query and types');
      if (parameters.take !== undefined && !/^(?:[1-9]|[1-4]\d|50)$/.test(parameters.take)) throw new AuditInputError(path, 'invalid search result bound');
    } else if (parameters['filter.type'] !== 'urn:heatmap' || parameters['output.heatmap.boundary'] !== 'urn:geohash'
      || !parameters['filter.location'] || !parameters['signal.interests.entities'] || parameters['signal.interests.entities'].includes(',')) {
      throw new AuditInputError(path, 'heatmap requires one artist, a region and urn:geohash');
    }
    const startedAt = instant(value.startedAt, `${path}.startedAt`);
    const completedAt = instant(value.completedAt, `${path}.completedAt`);
    if (Date.parse(startedAt) > Date.parse(completedAt) || Date.parse(completedAt) > Date.parse(generatedAt)) {
      throw new AuditInputError(path, 'request times must be ordered and no later than audit generation');
    }
    const source = value.source;
    if (source !== 'live' && source !== 'cache' && source !== 'synthetic') throw new AuditInputError(path, 'invalid source');
    const status = value.status;
    if (status !== 'success' && status !== 'failed') throw new AuditInputError(path, 'invalid request status');
    const httpStatus = knowledge(value.httpStatus, `${path}.httpStatus`, (value, path) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 100 || value > 599) throw new AuditInputError(path, 'must be an HTTP status');
      return value;
    });
    const responseReference = knowledge(value.responseReference, `${path}.responseReference`, text);
    const responseRecordedAt = knowledge(value.responseRecordedAt, `${path}.responseRecordedAt`, instant);
    if (source === 'synthetic' && (httpStatus.status === 'known' || responseRecordedAt.status === 'known')) {
      throw new AuditInputError(path, 'synthetic evidence cannot claim an HTTP status or live acquisition timestamp');
    }
    if (responseRecordedAt.status === 'known' && Date.parse(responseRecordedAt.value) > Date.parse(completedAt)) {
      throw new AuditInputError(path, 'source recording cannot be later than the completed request');
    }
    if (source !== 'synthetic' && status === 'success' && (responseReference.status !== 'known' || responseRecordedAt.status !== 'known'
      || (httpStatus.status === 'known' && (httpStatus.value < 200 || httpStatus.value >= 300)))) {
      throw new AuditInputError(path, 'successful live/cache evidence needs a recording reference and timestamp');
    }
    if (status === 'failed' && (responseReference.status === 'known' || responseRecordedAt.status === 'known')) {
      throw new AuditInputError(path, 'a failed request must not claim a successful response recording');
    }
    if (!Array.isArray(value.warnings)) throw new AuditInputError(`${path}.warnings`, 'must be an array');
    const warnings: EvidenceWarning[] = value.warnings.map((warning, i) => {
      const item = object(warning, `${path}.warnings[${i}]`);
      const warningQueryId = item.queryId === null ? null : text(item.queryId, `${path}.warnings[${i}].queryId`, 256);
      if (warningQueryId !== null && warningQueryId !== queryId) throw new AuditInputError(path, 'warning belongs to another query');
      return { code: text(item.code, `${path}.warnings[${i}].code`, 100),
        message: text(item.message, `${path}.warnings[${i}].message`), queryId: warningQueryId };
    });
    return { queryId, operation, endpoint, parameters, startedAt, completedAt, source, status,
      httpStatus, responseReference, responseRecordedAt, warnings };
  }).sort((a, b) => compareIds(a.queryId, b.queryId));
}

function canonicalProfile(profile: AffinityProfile): AffinityProfile {
  return { ...profile, observations: [...profile.observations].sort((a, b) => compareIds(a.cityId, b.cityId)) };
}

function candidateSet(value: unknown, scenario: TourScenario): CandidateSet {
  const input = object(value, 'candidateSet');
  const id = text(input.id, 'candidateSet.id', 256);
  if (!Array.isArray(input.cityIds) || input.cityIds.length === 0) throw new AuditInputError('candidateSet.cityIds', 'must be a nonempty city array');
  const cityIds = input.cityIds.map((value, index) => text(value, `candidateSet.cityIds[${index}]`, 256)).sort(compareIds);
  if (new Set(cityIds).size !== cityIds.length || cityIds.some(id => !scenario.cities.some(city => city.id === id))) {
    throw new AuditInputError('candidateSet.cityIds', 'must be unique known scenario cities');
  }
  return { id, cityIds };
}

function validateControl(baseline: FitInput, control: FitInput): void {
  if (baseline.candidateSet.id !== control.candidateSet.id ||
    JSON.stringify([...baseline.candidateSet.cityIds].sort(compareIds)) !== JSON.stringify([...control.candidateSet.cityIds].sort(compareIds))) {
    throw new AuditInputError('controlFitInput.candidateSet', 'must preserve the frozen baseline city set');
  }
  const target = baseline.profiles.find(profile => profile.role === 'target')!;
  const changed = control.profiles.find(profile => profile.role === 'target')!;
  if (target.artistId === changed.artistId || target.queryId === changed.queryId) {
    throw new AuditInputError('controlFitInput', 'control must use a different target artist and query');
  }
  if (target.weight !== changed.weight) throw new AuditInputError('controlFitInput', 'must preserve the target model weight');
  const comparisons = (input: FitInput) => input.profiles.filter(profile => profile.role === 'comparison')
    .map(canonicalProfile).sort((a, b) => compareIds(a.queryId, b.queryId));
  if (JSON.stringify(comparisons(baseline)) !== JSON.stringify(comparisons(control))) {
    throw new AuditInputError('controlFitInput', 'must preserve every comparison artist, observation, weight and provenance');
  }
}

function linkProfiles(inputs: readonly FitInput[], queries: readonly QueryEvidence[], mode: 'demo' | 'live'): AffinityProfile[] {
  const profiles = new Map<string, AffinityProfile>();
  const heatmapRegions = new Set<string>();
  for (const input of inputs) for (const profile of input.profiles) {
    const previous = profiles.get(profile.queryId);
    if (previous !== undefined && JSON.stringify(canonicalProfile(previous)) !== JSON.stringify(canonicalProfile(profile))) {
      throw new AuditInputError('queries', 'one query ID cannot represent different artist evidence');
    }
    profiles.set(profile.queryId, profile);
    const query = queries.find(query => query.queryId === profile.queryId);
    if (query === undefined || query.operation !== 'artist-heatmap' || query.status !== 'success') {
      throw new AuditInputError('queries', `profile ${profile.queryId} requires a successful artist-heatmap record`);
    }
    if (query.parameters['signal.interests.entities'] !== profile.artistId) throw new AuditInputError('queries', 'profile artist does not match its logged query');
    heatmapRegions.add(query.parameters['filter.location']!);
    if (profile.provenance.kind === 'synthetic') {
      if (mode !== 'demo' || query.source !== 'synthetic') throw new AuditInputError('queries', 'synthetic profiles require explicitly synthetic demo records');
    } else {
      if (query.source === 'synthetic' || query.responseReference.status !== 'known' || query.responseRecordedAt.status !== 'known'
        || query.responseReference.value !== profile.provenance.evidenceId || query.responseRecordedAt.value !== profile.provenance.recordedAt) {
        throw new AuditInputError('queries', 'recording provenance must match the logged response identity and acquisition time');
      }
    }
  }
  if (heatmapRegions.size > 1) throw new AuditInputError('queries', 'artist profiles must share the same frozen query region');
  return [...profiles.values()].sort((a, b) => compareIds(a.queryId, b.queryId));
}

/** A nonempty list of passing checks is required; no recommendation is not a vacuous success. */
export function evaluateZeroViolationsGate(decision: DecisionReport): ZeroViolationsGate {
  const base = { scope: 'recommended-option-declared-checks' as const };
  const recommendation = decision.recommendation;
  if (recommendation.status !== 'recommended') return {
    ...base, status: 'UNKNOWN', optionId: unknown('No option is recommended.'),
    violatedCheckCount: unknown('There is no recommended option to certify.'),
    unresolvedCheckCount: unknown('There is no recommended option to certify.'),
    failedCheckIds: [], unknownCheckIds: [], reason: 'No recommendation exists; zero violations is not asserted.',
  };
  const matches = decision.options.filter(option => option.optionId === recommendation.optionId);
  const option = matches[0];
  if (matches.length !== 1 || option === undefined || option.checks.length === 0) return {
    ...base, status: 'FAIL', optionId: known(recommendation.optionId),
    violatedCheckCount: unknown('The recommendation has no unique, nonempty check trace.'),
    unresolvedCheckCount: unknown('The recommendation has no unique, nonempty check trace.'),
    failedCheckIds: [], unknownCheckIds: [], reason: 'A recommendation without a unique, nonempty check trace cannot pass.',
  };
  const failedCheckIds = option.checks.filter(check => check.status === 'FAIL').map(check => check.id);
  const unknownCheckIds = option.checks.filter(check => check.status === 'UNKNOWN').map(check => check.id);
  const invalid = option.checks.some(check => !['PASS', 'FAIL', 'UNKNOWN'].includes(check.status));
  const status = failedCheckIds.length > 0 || option.status === 'FAIL' || invalid ? 'FAIL' :
    unknownCheckIds.length > 0 || option.status !== 'PASS' ? 'UNKNOWN' : 'PASS';
  return {
    ...base, status, optionId: known(recommendation.optionId),
    violatedCheckCount: known(failedCheckIds.length), unresolvedCheckCount: known(unknownCheckIds.length),
    failedCheckIds, unknownCheckIds,
    reason: status === 'PASS' ? 'Every declared feasibility and preference check for the recommended option passes under the supplied inputs; this is not a booking confirmation.' :
      status === 'FAIL' ? 'The recommended option has a violated or inconsistent declared check.' :
        'Required evidence remains unresolved; zero known failures does not mean all checks passed.',
  };
}

function routeChanges(before: readonly AuditStop[], after: readonly AuditStop[]): RouteChangeReport {
  const beforeById = new Map(before.map(stop => [stop.id, stop]));
  const afterById = new Map(after.map(stop => [stop.id, stop]));
  const ids = [...new Set([...before.map(stop => stop.id), ...after.map(stop => stop.id)])];
  const changes: StopChange[] = [];
  for (const id of ids) {
    const old = beforeById.get(id);
    const next = afterById.get(id);
    if (old === undefined) changes.push({ showId: id, kind: 'added', before: unknown('This stop was absent from the earlier route.'), after: known(next!), changedFields: ['presence'] });
    else if (next === undefined) changes.push({ showId: id, kind: 'removed', before: known(old), after: unknown('This stop is absent from the later route.'), changedFields: ['presence'] });
    else {
      const fields = ['cityId', 'venueId', 'status', 'locked'] as const;
      const changedFields: string[] = fields.filter(field => old[field] !== next[field]);
      for (const field of ['arriveBy', 'startsAt', 'endsAt', 'departAfter'] as const) {
        if (old.schedule[field].iso !== next.schedule[field].iso || old.schedule[field].timeZone !== next.schedule[field].timeZone) {
          changedFields.push(`schedule.${field}`);
        }
      }
      if (before.filter(stop => afterById.has(stop.id)).findIndex(stop => stop.id === id)
          !== after.filter(stop => beforeById.has(stop.id)).findIndex(stop => stop.id === id)) changedFields.push('relativeOrder');
      if (changedFields.length > 0) changes.push({ showId: id, kind: 'modified', before: known(old), after: known(next), changedFields });
    }
  }
  return { beforeStopCount: before.length, afterStopCount: after.length, changedStopCount: changes.length, changes };
}

function optionStopChanges(scenario: TourScenario, repairs: RepairReport): OptionStopChanges[] {
  return repairs.options.map(option => {
    const changes = routeChanges(scenario.tour.shows, option.route);
    const changedIds = new Set(changes.changes.map(change => change.showId));
    return { optionId: option.id, ...changes,
      unchangedLockedShowIds: scenario.tour.shows.filter(show => show.locked && !changedIds.has(show.id)).map(show => show.id),
      lockedCommitments: checkLockedCommitments(scenario.tour, option.route) };
  });
}

/** Rank surrogates preserve ties and missingness without disclosing query-local raw scores. */
function replayFit(input: FitInput): FitInput {
  return {
    schemaVersion: input.schemaVersion,
    candidateSet: { id: input.candidateSet.id, cityIds: [...input.candidateSet.cityIds].sort(compareIds) },
    profiles: [...input.profiles].sort((a, b) => compareIds(a.queryId, b.queryId)).map(profile => {
      const scores = profile.observations.flatMap(row => row.affinity.status === 'known' ? [row.affinity.value] : []);
      return { ...profile, observations: [...profile.observations].sort((a, b) => compareIds(a.cityId, b.cityId)).map(row => {
        if (row.affinity.status === 'unknown') return { ...row };
        const score = row.affinity.value;
        const lower = scores.filter(other => other < score).length;
        const equal = scores.filter(other => other === score).length;
        return { cityId: row.cityId, affinity: known(scores.length < 2 ? 50 : 100 * (2 * lower + equal - 1) / (2 * (scores.length - 1))) };
      }) };
    }),
  };
}

/** Build a complete, reproducible audit from validated inputs, never from a browser-supplied result. */
export function createDecisionAudit(input: CreateDecisionAuditInput): DecisionAudit {
  const runId = text(input.runId, 'runId', 256);
  const generatedAt = instant(input.generatedAt, 'generatedAt');
  if (input.mode !== 'demo' && input.mode !== 'live') throw new AuditInputError('mode', 'must be demo or live');
  const scenario = parseTourScenario(input.scenario);
  const fit = input.fitInput === undefined ? undefined : parseScenarioFitInput(input.fitInput);
  const declaredSet = input.candidateSet === undefined ? undefined : candidateSet(input.candidateSet, scenario);
  if (declaredSet !== undefined && fit !== undefined && (declaredSet.id !== fit.candidateSet.id
    || JSON.stringify(declaredSet.cityIds) !== JSON.stringify([...fit.candidateSet.cityIds].sort(compareIds)))) {
    throw new AuditInputError('candidateSet', 'must match the normalized fit input frozen universe');
  }
  const control = input.controlFitInput === undefined ? undefined : parseScenarioFitInput(input.controlFitInput);
  if (control !== undefined && fit === undefined) throw new AuditInputError('controlFitInput', 'requires a baseline fit input for a controlled comparison');
  if (fit !== undefined && control !== undefined) validateControl(fit, control);
  const queries = queryLog(input.queries, generatedAt);
  if (queries.some(query => input.mode === 'demo' ? query.source !== 'synthetic' : query.source === 'synthetic')) {
    throw new AuditInputError('mode', 'demo uses explicitly synthetic query evidence; live uses live or cached evidence');
  }
  const profiles = linkProfiles([...(fit === undefined ? [] : [fit]), ...(control === undefined ? [] : [control])], queries, input.mode);
  const analysis = analyzeTourDecision(scenario, fit, input.policy, input.ranges);
  let controlRun: Knowledge<ControlAuditRun> = unknown(input.controlUnavailableReason === undefined
    ? 'A different-target control profile was not supplied.' : text(input.controlUnavailableReason, 'controlUnavailableReason'));
  let selectedChanges: Knowledge<RouteChangeReport> = unknown('A known recommendation is required in both the baseline and control runs.');
  if (control !== undefined) {
    const result = evaluateTourDecision(scenario, control, analysis.decision.policy);
    const before = analysis.decision.recommendation;
    const after = result.decision.recommendation;
    const changed = before.status === 'recommended' && after.status === 'recommended'
      ? known(before.optionId !== after.optionId) : unknown('Both runs need a recommendation before a changed option can be established.');
    controlRun = known({ targetArtistId: control.profiles.find(profile => profile.role === 'target')!.artistId,
      ...result, zeroViolationsGate: evaluateZeroViolationsGate(result.decision), recommendedOptionChanged: changed });
    if (before.status === 'recommended' && after.status === 'recommended') {
      selectedChanges = known(routeChanges(analysis.repairs.options.find(option => option.id === before.optionId)!.route,
        result.repairs.options.find(option => option.id === after.optionId)!.route));
    }
  }
  const warnings: EvidenceWarning[] = queries.flatMap(query => query.warnings);
  if (analysis.repairs.fitReport.status === 'known') warnings.push(...analysis.repairs.fitReport.value.warnings);
  for (const run of analysis.artistSensitivity.runs) warnings.push(...run.fitReport.warnings);
  if (controlRun.status === 'known' && controlRun.value.repairs.fitReport.status === 'known') warnings.push(...controlRun.value.repairs.fitReport.value.warnings);
  if (controlRun.status === 'unknown') warnings.push({ code: 'CONTROL_UNAVAILABLE', message: controlRun.reason, queryId: null });
  if (fit === undefined) warnings.push({ code: 'FIT_UNAVAILABLE', message: 'No complete set of normalized artist profiles was supplied; cultural fit remains UNKNOWN.', queryId: null });
  const uniqueWarnings = [...new Map(warnings.map(warning => [JSON.stringify(warning), warning])).values()];
  const frozenCandidateSet = analysis.repairs.fitReport.status === 'known' ? known(analysis.repairs.fitReport.value.candidateSet)
    : declaredSet === undefined ? unknown('No declared or normalized fit candidate set was supplied.') : known(declaredSet);
  return {
    schemaVersion: 'tour-rescue.decision-audit.v1', runId, generatedAt, mode: input.mode,
    scenarioId: scenario.id, scenarioDataKind: scenario.dataKind,
    frozenCandidateSet,
    queries, warnings: uniqueWarnings,
    sourceTimestamps: {
      road: { matrixId: scenario.roadMatrix.id, source: scenario.roadMatrix.provenance.source,
        method: scenario.roadMatrix.provenance.method, recordedAt: scenario.roadMatrix.provenance.recordedAt },
      qloo: profiles.map(profile => {
        const query = queries.find(query => query.queryId === profile.queryId)!;
        return { queryId: profile.queryId, artistId: profile.artistId, source: query.source,
          responseReference: query.responseReference, recordedAt: query.responseRecordedAt };
      }),
    },
    analysis, controlRun,
    stopChanges: { originalToOptions: optionStopChanges(scenario, analysis.repairs), recommendedBaselineToControl: selectedChanges },
    zeroViolationsGate: evaluateZeroViolationsGate(analysis.decision),
    replay: {
      schemaVersion: 'tour-rescue.rank-replay.v1', fitRepresentation: 'within-query-percentiles-preserving-missingness',
      scenario, candidateSet: frozenCandidateSet, policy: analysis.decision.policy, ranges: analysis.breakpoints.ranges,
      fitInput: fit === undefined ? unknown('No normalized baseline fit input was supplied.') : known(replayFit(fit)),
      controlFitInput: control === undefined ? unknown('No normalized control fit input was supplied.') : known(replayFit(control)),
    },
  };
}

/** Re-run only the deterministic calculation; no source is fetched or refreshed. */
export function replayDecisionAudit(audit: DecisionAudit): DecisionAudit {
  if (audit.schemaVersion !== 'tour-rescue.decision-audit.v1' || audit.replay.schemaVersion !== 'tour-rescue.rank-replay.v1'
    || audit.replay.fitRepresentation !== 'within-query-percentiles-preserving-missingness') {
    throw new AuditInputError('audit', 'unsupported audit or replay schema');
  }
  return createDecisionAudit({
    scenario: audit.replay.scenario, policy: audit.replay.policy, ranges: audit.replay.ranges,
    ...(audit.replay.candidateSet.status === 'known' ? { candidateSet: audit.replay.candidateSet.value } : {}),
    ...(audit.replay.fitInput.status === 'known' ? { fitInput: audit.replay.fitInput.value } : {}),
    ...(audit.replay.controlFitInput.status === 'known' ? { controlFitInput: audit.replay.controlFitInput.value } : {}),
    ...(audit.controlRun.status === 'unknown' ? { controlUnavailableReason: audit.controlRun.reason } : {}),
    queries: audit.queries, generatedAt: audit.generatedAt, runId: audit.runId, mode: audit.mode,
  });
}
