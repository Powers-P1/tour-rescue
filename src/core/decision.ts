import type { Knowledge } from './domain.ts';
import type { DecisionOptionEvaluation, DecisionPolicy, DecisionReport, Recommendation } from './decision-types.ts';
import type { EvaluatedRepairOption, RepairReport } from './repair-types.ts';
import { combineCheckStatuses } from './travel-constraints.ts';
import type { CheckStatus, ConstraintCheck } from './travel-constraints.ts';

export class PolicyInputError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'PolicyInputError';
  }
}

const kinds = ['replacement', 'detour', 'day-off'] as const;
const statuses: readonly CheckStatus[] = ['PASS', 'FAIL', 'UNKNOWN'];

export function parseDecisionPolicy(value: unknown): DecisionPolicy {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PolicyInputError('policy', 'must be an object with explicit thresholds');
  }
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 'tour-rescue.decision-policy.v1') {
    throw new PolicyInputError('policy.schemaVersion', 'must be tour-rescue.decision-policy.v1');
  }
  const minimumFitIndex = input.minimumFitIndex;
  if (typeof minimumFitIndex !== 'number' || !Number.isInteger(minimumFitIndex)
      || minimumFitIndex < 0 || minimumFitIndex > 100) {
    throw new PolicyInputError('policy.minimumFitIndex', 'must be an integer fit-index point from 0 through 100');
  }
  const maxAdditionalDistanceMetres = input.maxAdditionalDistanceMetres;
  if (typeof maxAdditionalDistanceMetres !== 'number' || !Number.isSafeInteger(maxAdditionalDistanceMetres)
      || maxAdditionalDistanceMetres < 0) {
    throw new PolicyInputError('policy.maxAdditionalDistanceMetres', 'must be a non-negative safe integer number of metres');
  }
  return { schemaVersion: 'tour-rescue.decision-policy.v1', minimumFitIndex, maxAdditionalDistanceMetres };
}

function assertNumericEvidence(value: Knowledge<number>, path: string, isFit: boolean): void {
  if (value.status === 'unknown') {
    if (typeof value.reason !== 'string' || value.reason.trim().length === 0) {
      throw new TypeError(`${path}: unknown evidence requires a reason`);
    }
    return;
  }
  if (value.status !== 'known' || typeof value.value !== 'number' || !Number.isFinite(value.value)
      || (isFit ? value.value < 0 || value.value > 100 : !Number.isSafeInteger(value.value))) {
    throw new TypeError(`${path}: invalid ${isFit ? '0..100 fit index' : 'signed safe-integer metre value'}`);
  }
}

/** This is a consistency gate for core-produced reports, not a raw-route parser. */
function checkedOptions(report: RepairReport): readonly EvaluatedRepairOption[] {
  if (report.schemaVersion !== 'tour-rescue.repair-report.v1' || !Array.isArray(report.options)
      || report.options.length !== 3) {
    throw new TypeError('report: expected a repair report with exactly three options');
  }
  const options = Array.from(report.options);
  const ids = new Set<string>();
  const seenKinds = new Set<string>();
  for (const option of options) {
    if (option === undefined || typeof option.id !== 'string' || option.id.trim().length === 0
        || ids.has(option.id) || !kinds.includes(option.kind) || seenKinds.has(option.kind)) {
      throw new TypeError('report.options: option IDs and kinds must be present and unique');
    }
    ids.add(option.id);
    seenKinds.add(option.kind);
    if (!Array.isArray(option.checks) || option.checks.length === 0
        || Array.from(option.checks).some(check => check === null || typeof check !== 'object'
          || !('status' in check) || !statuses.includes(check.status as CheckStatus))) {
      throw new TypeError(`report.options.${option.id}.checks: expected nonempty PASS/FAIL/UNKNOWN checks`);
    }
    if (!statuses.includes(option.status) || !statuses.includes(option.routingStatus)
        || !statuses.includes(option.venueStatus) || combineCheckStatuses(option.checks) !== option.status
        || combineCheckStatuses([
          { id: 'routing', status: option.routingStatus, message: '', evidence: {} },
          { id: 'venue', status: option.venueStatus, message: '', evidence: {} },
        ]) !== option.status) {
      throw new TypeError(`report.options.${option.id}: status is inconsistent with its declared checks`);
    }
    if (option.kind !== 'day-off') {
      assertNumericEvidence(option.fit, `report.options.${option.id}.fit`, true);
      assertNumericEvidence(option.additionalDistanceMetres, `report.options.${option.id}.additionalDistanceMetres`, false);
    }
  }
  return kinds.map(kind => options.find(option => option.kind === kind)!);
}

function preferenceChecks(option: EvaluatedRepairOption, policy: DecisionPolicy): readonly ConstraintCheck[] {
  if (option.kind === 'day-off') return [];
  const fit = option.fit;
  const distance = option.additionalDistanceMetres;
  return [{
    id: 'decision:minimum-fit',
    status: fit.status === 'unknown' ? 'UNKNOWN' : fit.value >= policy.minimumFitIndex ? 'PASS' : 'FAIL',
    message: fit.status === 'unknown' ? fit.reason : fit.value >= policy.minimumFitIndex
      ? 'The fit index meets the declared minimum.' : 'The fit index is below the declared minimum.',
    evidence: { fit, minimumFitIndex: policy.minimumFitIndex, unit: 'fit-index-points', thresholdStep: 1 },
  }, {
    id: 'decision:additional-distance',
    status: distance.status === 'unknown' ? 'UNKNOWN'
      : distance.value <= policy.maxAdditionalDistanceMetres ? 'PASS' : 'FAIL',
    message: distance.status === 'unknown' ? distance.reason : distance.value <= policy.maxAdditionalDistanceMetres
      ? 'The additional road distance fits the declared cap.' : 'The additional road distance exceeds the declared cap.',
    evidence: { additionalDistanceMetres: distance, maxAdditionalDistanceMetres: policy.maxAdditionalDistanceMetres, unit: 'metres', thresholdStep: 1 },
  }];
}

/** Unicode code-point order is deterministic and independent of host locale. */
function compareIds(left: string, right: string): number {
  const a = Array.from(left, character => character.codePointAt(0)!);
  const b = Array.from(right, character => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function numeric(value: Knowledge<number>): number {
  if (value.status !== 'known') throw new Error('Eligible show must have known fit and additional distance.');
  return value.value;
}

/**
 * Fit-first choice after independent hard/preference gates. Missing required
 * evidence cannot win, disappear or justify a day-off recommendation.
 */
export function recommendRepair(report: RepairReport, policyValue: unknown): DecisionReport {
  const policy = parseDecisionPolicy(policyValue);
  const source = checkedOptions(report);
  const options: DecisionOptionEvaluation[] = source.map(option => {
    const checks = [...option.checks, ...preferenceChecks(option, policy)];
    return { optionId: option.id, kind: option.kind, status: combineCheckStatuses(checks), checks };
  });
  const passingIds = new Set(options.filter(option => option.kind !== 'day-off' && option.status === 'PASS')
    .map(option => option.optionId));
  const ranked = source.filter(option => passingIds.has(option.id)).sort((a, b) =>
    numeric(b.fit) - numeric(a.fit)
    || numeric(a.additionalDistanceMetres) - numeric(b.additionalDistanceMetres)
    || compareIds(a.id, b.id));
  let recommendation: Recommendation;
  let tieBreak: DecisionReport['tieBreak'] = 'not-applicable';
  const unresolvedShows = options.filter(option => option.kind !== 'day-off' && option.status === 'UNKNOWN');
  if (unresolvedShows.length > 0) {
    recommendation = {
      status: 'needs-evidence',
      reason: `Required evidence remains unresolved for otherwise viable show options: ${unresolvedShows.map(option => option.optionId).join(', ')}. No winner is asserted.`,
    };
  } else if (ranked.length > 0) {
    const winner = ranked[0]!;
    const next = ranked[1];
    tieBreak = next === undefined || numeric(winner.fit) !== numeric(next.fit) ? 'fit'
      : numeric(winner.additionalDistanceMetres) !== numeric(next.additionalDistanceMetres) ? 'additional-distance' : 'option-id';
    recommendation = {
      status: 'recommended', optionId: winner.id, kind: winner.kind,
      reason: tieBreak === 'fit' ? 'Highest fit among show options that pass all declared constraints and preference gates.'
        : tieBreak === 'additional-distance' ? 'Equal highest fit; the smaller additional road distance decides.'
          : 'Equal highest fit and additional distance; stable option-ID order decides, with no inferred quality advantage.',
    };
  } else {
    const dayOff = options.find(option => option.kind === 'day-off')!;
    if (dayOff.status === 'PASS') {
      recommendation = { status: 'recommended', optionId: dayOff.optionId, kind: 'day-off',
        reason: 'Both proposed shows are definitively excluded under the declared checks; the day-off route passes.' };
      tieBreak = 'day-off';
    } else {
      recommendation = dayOff.status === 'UNKNOWN' ? {
        status: 'needs-evidence', reason: 'Both proposed shows are excluded, but the day-off route still has unresolved required evidence.',
      } : {
        status: 'no-feasible-option', reason: 'Both proposed shows are excluded and the day-off route fails a declared constraint.',
      };
    }
  }
  return {
    schemaVersion: 'tour-rescue.decision-report.v1', policy, recommendation, options,
    rankedShowOptionIds: ranked.map(option => option.id), tieBreak,
  };
}
