import { createDecisionAudit, replayDecisionAudit } from '../core/audit.ts';
import type { DecisionAudit } from '../core/audit-types.ts';
import type { Knowledge, TourScenario, Venue } from '../core/domain.ts';
import type {
  AiAcceptance, AiAuditEnvelope, AiEvaluationMetadata, AiProposalDraft, AiSessionResult, AiSource,
  AiValidatedProposal,
} from './types.ts';

const unknown = (reason: string): Knowledge<never> => ({ status: 'unknown', reason });
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;

export class AiInputError extends Error {
  constructor(message: string) { super(message); this.name = 'AiInputError'; }
}

function object(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !fields.includes(key))) {
    throw new AiInputError(`${label} contains unsupported fields or is not an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new AiInputError(`${label} must be nonempty bounded plain text.`);
  }
  return value.trim();
}

function id(value: unknown, label: string): string {
  const result = text(value, label, 80);
  if (!ID.test(result)) throw new AiInputError(`${label} must be a short application identifier.`);
  return result;
}

function strings(value: unknown, label: string, maximum: number, itemMaximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new AiInputError(`${label} exceeds its item limit.`);
  return value.map(item => text(item, label, itemMaximum));
}

function instant(value: unknown, label: string): string {
  const result = text(value, label, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(result);
  if (match === null || !Number.isFinite(Date.parse(result))) throw new AiInputError(`${label} must be an ISO instant with an offset.`);
  const calendar = match.slice(1, 7).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(calendar[0]!, calendar[1]! - 1, calendar[2]!);
  date.setUTCHours(calendar[3]!, calendar[4]!, calendar[5]!, 0);
  if ([date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .some((part, index) => part !== calendar[index]) || Number(match[7] ?? 0) > 23 || Number(match[8] ?? 0) > 59) {
    throw new AiInputError(`${label} contains an invalid calendar date or time.`);
  }
  return result;
}

/** Link-only validator; this module never fetches a URL. IP/private/local and credential URLs are excluded. */
export function safeAiSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== ''
        || !host.includes('.') || host.endsWith('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)
        || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
        || !/^[a-z0-9.-]+$/.test(host) || host.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))) return undefined;
    return url.href;
  } catch { return undefined; }
}

/** Only registered provider results (or labelled fixtures) may be used as proposal references. */
export function parseAiSources(value: unknown): AiSource[] {
  if (!Array.isArray(value) || value.length > 32) throw new AiInputError('At most 32 source records are allowed.');
  const seen = new Set<string>();
  return value.map(raw => {
    const row = object(raw, ['id', 'title', 'url', 'retrievedAt', 'kind', 'provenance', 'excerpt'], 'Source');
    const sourceId = id(row.id, 'Source ID');
    if (seen.has(sourceId)) throw new AiInputError('Source IDs must be unique.');
    seen.add(sourceId);
    const url = safeAiSourceUrl(row.url);
    if (url === undefined) throw new AiInputError('A source must use a public HTTPS URL without credentials.');
    if (row.kind !== 'web-search' && row.kind !== 'web-fetch' && row.kind !== 'synthetic') throw new AiInputError('Unsupported source kind.');
    const provenance = row.kind === 'synthetic' ? 'synthetic' as const : 'provider-tool' as const;
    if (row.provenance !== provenance) throw new AiInputError('Source kind and provenance disagree.');
    return { id: sourceId, title: text(row.title, 'Source title', 300), url,
      retrievedAt: instant(row.retrievedAt, 'Source retrieval time'), kind: row.kind, provenance,
      ...(row.excerpt === undefined ? {} : { excerpt: text(row.excerpt, 'Source excerpt', 800) }) };
  });
}

/** Reject assertions such as availability, fees, fit, status, schedules or new road values from a model. */
export function parseAiProposalDraft(value: unknown): AiProposalDraft {
  const row = object(value, ['id', 'kind', 'cityId', 'venueName', 'reason', 'sourceIds', 'risks'], 'Proposal');
  if (row.kind !== 'replacement' && row.kind !== 'detour') throw new AiInputError('A proposal must target the replacement or detour card.');
  const sourceIds = strings(row.sourceIds, 'Proposal sources', 8, 80).map(value => id(value, 'Source ID'));
  if (sourceIds.length === 0 || new Set(sourceIds).size !== sourceIds.length) throw new AiInputError('A proposal needs one to eight distinct registered source IDs.');
  return { id: id(row.id, 'Proposal ID'), kind: row.kind, cityId: id(row.cityId, 'City ID'),
    venueName: text(row.venueName, 'Venue name', 180), reason: text(row.reason, 'Proposal reason', 1200),
    sourceIds, risks: strings(row.risks, 'Proposal risks', 8, 500) };
}

function rebuild(base: DecisionAudit, scenario: TourScenario, meta: AiEvaluationMetadata): DecisionAudit {
  const generatedAt = instant(meta.generatedAt, 'Evaluation time');
  if (Date.parse(generatedAt) < Date.parse(base.generatedAt)) throw new AiInputError('Evaluation cannot precede the current comparison.');
  const replay = base.replay;
  return createDecisionAudit({ scenario, policy: replay.policy, ranges: replay.ranges,
    ...(replay.candidateSet.status === 'known' ? { candidateSet: replay.candidateSet.value } : {}),
    ...(replay.fitInput.status === 'known' ? { fitInput: replay.fitInput.value } : {}),
    ...(replay.controlFitInput.status === 'known' ? { controlFitInput: replay.controlFitInput.value } : {}),
    ...(base.controlRun.status === 'unknown' ? { controlUnavailableReason: base.controlRun.reason } : {}),
    queries: base.queries, mode: base.mode, runId: text(meta.runId, 'Run ID', 256), generatedAt });
}

/** These are the app's percentiles over the unchanged city universe, not raw Qloo vectors or demand. */
export function getFitData(base: DecisionAudit) {
  const audit = replayDecisionAudit(base);
  const report = audit.analysis.repairs.fitReport;
  return {
    representation: 'within-query-percentiles-preserving-missingness' as const,
    candidateSet: audit.frozenCandidateSet,
    cities: audit.replay.scenario.cities.filter(city => audit.frozenCandidateSet.status === 'known'
      && audit.frozenCandidateSet.value.cityIds.includes(city.id)).map(city => ({ id: city.id, name: city.name,
      fitIndex: report.status === 'known' ? report.value.cities.find(row => row.cityId === city.id)?.value
        ?? unknown('No fit for this frozen city.') : report })),
    profiles: report.status === 'known' ? { status: 'known' as const, value: report.value.profiles } : report,
    interpretation: 'Relative cultural fit only; not attendance, ticket demand, availability, fees or a forecast.',
  };
}

/** A bounded, directional matrix projection. Missing A→B is never substituted with B→A. */
export function getRoadLegs(base: DecisionAudit, selection: { readonly fromCityIds: readonly string[]; readonly toCityIds: readonly string[] }) {
  const audit = replayDecisionAudit(base);
  const row = object(selection, ['fromCityIds', 'toCityIds'], 'Road selection');
  const from = strings(row.fromCityIds, 'Origin cities', 6, 80);
  const to = strings(row.toCityIds, 'Destination cities', 6, 80);
  if (from.length === 0 || to.length === 0 || new Set(from).size !== from.length || new Set(to).size !== to.length) {
    throw new AiInputError('Select one to six distinct origins and destinations.');
  }
  const frozen = audit.frozenCandidateSet;
  if (frozen.status !== 'known' || [...from, ...to].some(cityId => !frozen.value.cityIds.includes(cityId))) {
    throw new AiInputError('Road lookup is restricted to the frozen candidate cities.');
  }
  const matrix = audit.replay.scenario.roadMatrix;
  return { matrixId: matrix.id, directed: true as const, provenance: matrix.provenance,
    legs: from.flatMap(fromCityId => to.map(toCityId => {
      const leg = matrix.legs.find(leg => leg.fromCityId === fromCityId && leg.toCityId === toCityId);
      return { fromCityId, toCityId, quality: leg?.quality ?? 'missing',
        travel: leg?.travel ?? unknown('This directed road leg is missing; its reverse is not a substitute.') };
    })) };
}

/** Pure model boundary. Numeric checks and booking facts cannot be supplied by the proposal. */
export function validateAiProposal(base: DecisionAudit, rawDraft: unknown, rawSources: readonly AiSource[], meta: AiEvaluationMetadata): AiValidatedProposal {
  const audit = replayDecisionAudit(base);
  const draft = parseAiProposalDraft(rawDraft);
  const sources = parseAiSources(rawSources);
  const referenced = draft.sourceIds.map(sourceId => {
    const source = sources.find(source => source.id === sourceId);
    if (source === undefined) throw new AiInputError(`Proposal refers to unknown source ${sourceId}.`);
    if (Date.parse(source.retrievedAt) > Date.parse(meta.generatedAt)) throw new AiInputError('Source retrieval cannot be later than evaluation.');
    return source;
  });
  if (audit.mode === 'live' && referenced.some(source => source.provenance !== 'provider-tool')) {
    throw new AiInputError('Live proposals cannot cite synthetic research.');
  }
  const scenario = audit.replay.scenario;
  if (audit.frozenCandidateSet.status !== 'known' || !audit.frozenCandidateSet.value.cityIds.includes(draft.cityId)) {
    throw new AiInputError('A proposal must use a city in the unchanged frozen candidate set.');
  }
  const target = scenario.repairCandidates.find(candidate => candidate.kind === draft.kind)!;
  if (target.kind === 'day-off') throw new AiInputError('A researched venue cannot overwrite day off.');
  if (scenario.repairCandidates.some(candidate => candidate.kind !== 'day-off' && candidate.kind !== draft.kind && candidate.cityId === draft.cityId)) {
    throw new AiInputError('That city is already on the other show card. Choose a distinct city; the other card is unchanged.');
  }
  const cancelled = scenario.tour.shows.find(show => show.status === 'cancelled')!;
  const existingFixtureVenue = scenario.venues.find(venue => venue.cityId === draft.cityId && venue.name === draft.venueName
    && venue.id === `venue-${draft.cityId}` && venue.id !== cancelled.venueId);
  const preserveFixture = meta.preserveSyntheticBookingFacts === true && audit.mode === 'demo'
    && scenario.dataKind === 'synthetic' && referenced.every(source => source.provenance === 'synthetic')
    && existingFixtureVenue !== undefined && existingFixtureVenue.name.startsWith('Fictional ');
  if (meta.preserveSyntheticBookingFacts === true && !preserveFixture) {
    throw new AiInputError('Only the exact labelled fictional demo venue can retain synthetic booking facts.');
  }
  const venueId = preserveFixture ? existingFixtureVenue!.id : `ai-venue-${draft.id}`;
  if (!preserveFixture && scenario.tour.shows.some(show => show.venueId === venueId)) {
    throw new AiInputError('A proposal cannot overwrite an original venue.');
  }
  if (!preserveFixture && scenario.repairCandidates.some(candidate => candidate.kind !== 'day-off'
    && candidate.kind !== draft.kind && candidate.venueId === venueId)) throw new AiInputError('Proposal venue ID collides with the other show card.');
  const venue: Venue = preserveFixture ? existingFixtureVenue! : {
    id: venueId, cityId: draft.cityId, name: draft.venueName,
    qlooEntityId: unknown('This researched venue has no verified Qloo identity.'),
    availability: unknown('Public web research is not date-specific booking confirmation. Contact the venue; an empty calendar is not proof of availability.'),
    capacityPeople: unknown('Capacity was not independently supplied and validated.'),
    fee: unknown('No venue fee was confirmed by the booker; research cannot invent a fee.'),
    promoterTerms: unknown('No promoter agreement was supplied.'),
  };
  const changed: TourScenario = { ...scenario,
    venues: preserveFixture ? scenario.venues : [...scenario.venues.filter(row => row.id !== venueId), venue],
    repairCandidates: scenario.repairCandidates.map(candidate => candidate.kind === draft.kind
      ? { ...target, cityId: draft.cityId, venueId, cancelledShowId: cancelled.id, schedule: cancelled.schedule } : candidate) };
  const proposalAudit = rebuild(audit, changed, meta);
  const option = proposalAudit.analysis.repairs.options.find(option => option.id === target.id)!;
  const evaluated = proposalAudit.analysis.decision.options.find(option => option.optionId === target.id)!;
  return { draft, status: evaluated.status, option, audit: proposalAudit };
}

export function analyzeAiDecision(base: DecisionAudit) { return replayDecisionAudit(base).analysis; }

export function generateAiDecisionAudit(base: DecisionAudit, meta: AiEvaluationMetadata): DecisionAudit {
  const audit = replayDecisionAudit(base);
  return rebuild(audit, audit.replay.scenario, meta);
}

/** Explicit user acceptance rechecks against today's cards and thresholds, never a stale model result. */
export function acceptAiProposal(current: DecisionAudit, session: AiSessionResult, proposalId: string,
  meta: Pick<AiEvaluationMetadata, 'generatedAt' | 'runId'>): AiAcceptance {
  if (session.stopReason !== 'completed' || session.proposals.length < 2 || session.proposals.length > 4) {
    throw new AiInputError('Only a completed session with two to four checked proposals can be accepted.');
  }
  if (session.schemaVersion !== 'tour-rescue.ai-session.v1' || session.scenarioId !== current.scenarioId
      || session.baseResult.scenarioId !== current.scenarioId || session.mode !== current.mode) {
    throw new AiInputError('The research session belongs to a different comparison context.');
  }
  if (Date.parse(instant(meta.generatedAt, 'Acceptance time')) < Date.parse(instant(session.completedAt, 'Session completion time'))) {
    throw new AiInputError('Acceptance cannot precede session completion.');
  }
  const base = replayDecisionAudit(session.baseResult.audit);
  const currentAudit = replayDecisionAudit(current);
  // User thresholds may change, but evidence identity, locked tour and universe may not.
  if (JSON.stringify(base.replay.scenario.tour.shows) !== JSON.stringify(currentAudit.replay.scenario.tour.shows)
      || JSON.stringify(base.replay.scenario.roadMatrix) !== JSON.stringify(currentAudit.replay.scenario.roadMatrix)
      || JSON.stringify(base.replay.candidateSet) !== JSON.stringify(currentAudit.replay.candidateSet)
      || JSON.stringify(base.replay.fitInput) !== JSON.stringify(currentAudit.replay.fitInput)
      || JSON.stringify(base.replay.controlFitInput) !== JSON.stringify(currentAudit.replay.controlFitInput)) {
    throw new AiInputError('The tour or frozen evidence changed. Start a new research session.');
  }
  const matches = session.proposals.filter(proposal => proposal.draft.id === proposalId);
  if (matches.length !== 1) throw new AiInputError('Select one unique proposal from this session.');
  const draft = matches[0]!.draft;
  const preservedDemo = session.mode === 'demo' && session.model === 'synthetic-transcript'
    && draft.venueName.startsWith('Fictional ') && session.sources.filter(source => draft.sourceIds.includes(source.id))
      .every(source => source.provenance === 'synthetic');
  const checked = validateAiProposal(currentAudit, draft, session.sources, { ...meta,
    ...(preservedDemo ? { preserveSyntheticBookingFacts: true } : {}) });
  return { schemaVersion: 'tour-rescue.ai-acceptance.v1', sessionId: session.sessionId, proposalId: draft.id, optionId: checked.option.id,
    acceptedAt: checked.audit.generatedAt, sourceIds: [...checked.draft.sourceIds], audit: checked.audit };
}

/** A separate envelope keeps Qloo-only query logs and the PR4 audit contract backwards compatible. */
export function createAiAuditEnvelope(session: AiSessionResult, accepted: readonly AiAcceptance[], current: DecisionAudit,
  generatedAt: string, priorSessions: readonly AiSessionResult[] = []): AiAuditEnvelope {
  const stamp = instant(generatedAt, 'Audit export time');
  if (Date.parse(stamp) < Date.parse(current.generatedAt)) throw new AiInputError('Export time cannot precede the current decision.');
  if (session.scenarioId !== current.scenarioId || session.mode !== current.mode) throw new AiInputError('Session and comparison contexts differ.');
  const sessions = new Map<string, AiSessionResult>([[session.sessionId, session]]);
  for (const prior of priorSessions) {
    const duplicate = sessions.get(prior.sessionId);
    if (duplicate !== undefined && JSON.stringify(duplicate) !== JSON.stringify(prior)) {
      throw new AiInputError('One session ID cannot identify different research records.');
    }
    sessions.set(prior.sessionId, prior);
  }
  if (sessions.size > 2 || accepted.length > 2 || new Set(accepted.map(row => row.optionId)).size !== accepted.length) {
    throw new AiInputError('Export the current two show cards and at most two supplying research sessions.');
  }
  for (const research of sessions.values()) {
    if (research.schemaVersion !== 'tour-rescue.ai-session.v1' || research.scenarioId !== current.scenarioId
        || research.mode !== current.mode) throw new AiInputError('Research sessions must belong to the current comparison context.');
    parseAiSources(research.sources);
  }
  const decisionAudit = replayDecisionAudit(current);
  const acceptedRecords = accepted.map(row => {
    const research = sessions.get(row.sessionId);
    const proposal = research?.proposals.find(proposal => proposal.draft.id === row.proposalId);
    if (row.schemaVersion !== 'tour-rescue.ai-acceptance.v1' || research === undefined || proposal === undefined
        || JSON.stringify(row.sourceIds) !== JSON.stringify(proposal.draft.sourceIds)
        || row.sourceIds.some(sourceId => !research.sources.some(source => source.id === sourceId))) {
      throw new AiInputError('An acceptance contains an unknown session, proposal or source.');
    }
    const acceptedAt = instant(row.acceptedAt, 'Acceptance time');
    if (Date.parse(acceptedAt) < Date.parse(research.completedAt) || Date.parse(acceptedAt) > Date.parse(stamp)
        || row.audit.generatedAt !== acceptedAt) throw new AiInputError('Acceptance timestamps do not match the research and decision record.');
    const audit = replayDecisionAudit(row.audit);
    const previous = audit.replay.scenario.repairCandidates.find(candidate => candidate.id === row.optionId);
    const present = decisionAudit.replay.scenario.repairCandidates.find(candidate => candidate.id === row.optionId);
    if (previous === undefined || present === undefined || previous.kind === 'day-off' || present.kind === 'day-off'
        || previous.kind !== proposal.draft.kind || previous.cityId !== proposal.draft.cityId
        || JSON.stringify(previous) !== JSON.stringify(present)) {
      throw new AiInputError('An acceptance no longer describes its current comparison card.');
    }
    const previousVenue = audit.replay.scenario.venues.find(venue => venue.id === previous.venueId);
    const presentVenue = decisionAudit.replay.scenario.venues.find(venue => venue.id === present.venueId);
    if (previousVenue?.name !== proposal.draft.venueName || JSON.stringify(previousVenue) !== JSON.stringify(presentVenue)) {
      throw new AiInputError('An acceptance no longer describes the current venue evidence.');
    }
    return { ...row, audit };
  });
  const supplyingIds = new Set(accepted.map(row => row.sessionId));
  return { schemaVersion: 'tour-rescue.ai-audit.v1', generatedAt: stamp, session,
    priorSessions: [...sessions.values()].filter(research => research.sessionId !== session.sessionId && supplyingIds.has(research.sessionId)),
    accepted: acceptedRecords, decisionAudit };
}
