import catalogue from '../../fixtures/cities_de.json' with { type: 'json' };
import type { DecisionAudit } from '../../src/core/audit-types.ts';
import type { CheckStatus } from '../../src/core/travel-constraints.ts';
import type { Knowledge } from '../../src/core/domain.ts';

export interface ScatterPoint {
  readonly optionId: string;
  readonly letter: string;
  readonly name: string;
  readonly extraMetres: number;
  readonly fit: number;
  readonly decisionStatus: CheckStatus;
  readonly recommended: boolean;
}

export interface UnplottedOption {
  readonly optionId: string;
  readonly letter: string;
  readonly name: string;
  readonly reason: string;
  readonly extraMetres: Knowledge<number>;
}

export function optionName(audit: DecisionAudit, optionId: string): string {
  const candidate = audit.replay.scenario.repairCandidates.find(value => value.id === optionId);
  if (candidate === undefined) return optionId;
  if (candidate.kind === 'day-off') return 'Day off';
  return audit.replay.scenario.cities.find(city => city.id === candidate.cityId)?.name ?? candidate.cityId;
}

/** Day off is not a measured city, and incomplete axes cannot be represented as zero. */
export function scatterModel(audit: DecisionAudit): {
  points: ScatterPoint[]; unplotted: UnplottedOption[]; minKm: number; maxKm: number;
} {
  const points: ScatterPoint[] = [];
  const unplotted: UnplottedOption[] = [];
  audit.analysis.repairs.options.forEach((option, index) => {
    const shared = { optionId: option.id, letter: String.fromCharCode(65 + index), name: optionName(audit, option.id) };
    if (option.kind === 'day-off' || option.fit.status !== 'known' || option.additionalDistanceMetres.status !== 'known') {
      const reason = option.kind === 'day-off' ? 'Fit is not applicable: no new show or audience is proposed.' :
        [option.fit.status === 'unknown' ? `Fit UNKNOWN: ${option.fit.reason}` : '',
          option.additionalDistanceMetres.status === 'unknown' ? `Extra distance UNKNOWN: ${option.additionalDistanceMetres.reason}` : '']
          .filter(Boolean).join(' ');
      unplotted.push({ ...shared, reason, extraMetres: option.additionalDistanceMetres });
      return;
    }
    const recommendation = audit.analysis.decision.recommendation;
    points.push({ ...shared, extraMetres: option.additionalDistanceMetres.value, fit: option.fit.value,
      decisionStatus: audit.analysis.decision.options.find(value => value.optionId === option.id)?.status ?? 'UNKNOWN',
      recommended: recommendation.status === 'recommended' && recommendation.optionId === option.id });
  });
  const xs = points.map(point => point.extraMetres / 1000);
  return { points, unplotted, minKm: Math.floor(Math.min(0, ...xs) / 50) * 50,
    maxKm: Math.ceil(Math.max(100, ...xs) / 50) * 50 };
}

export interface MapCity {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly fit: Knowledge<number>;
}

/** Coordinates are visual context only: all travel decisions use the directed road matrix. */
export function fitMapCities(audit: DecisionAudit): MapCity[] {
  const candidates = audit.frozenCandidateSet;
  if (candidates.status !== 'known') return [];
  const fit = audit.analysis.repairs.fitReport;
  return candidates.value.cityIds.flatMap(id => {
    const city = catalogue.cities.find(city => city.id === id);
    if (city === undefined) return [];
    return [{ id, name: city.name, lat: city.lat, lon: city.lon,
      fit: fit.status === 'known' ? fit.value.cities.find(value => value.cityId === id)?.value ??
        { status: 'unknown' as const, reason: 'No fit value exists for this frozen city.' } : fit }];
  });
}

export function cityCoordinates(id: string): { lat: number; lon: number } | undefined {
  return catalogue.cities.find(city => city.id === id);
}

/** Equal-area accuracy is not needed here; this fixed local projection is only a backdrop. */
export function projectCity(lon: number, lat: number): { x: number; y: number } {
  return { x: (lon - 5.4) * 54, y: (55.4 - lat) * 82 };
}

export interface TagProvenance {
  readonly queryId: string;
  readonly reference: string;
  readonly source: 'live' | 'cache' | 'synthetic';
  readonly recordedAt: Knowledge<string>;
}
export interface SourcedTag {
  readonly id: string;
  readonly label: string;
  readonly provenance: TagProvenance;
}
export interface TagBridgeInput {
  readonly left: { readonly label: string; readonly tags: readonly SourcedTag[] };
  readonly right: { readonly label: string; readonly tags: readonly SourcedTag[] };
}
export interface CommonTag {
  readonly id: string;
  readonly label: string;
  readonly left: TagProvenance;
  readonly right: TagProvenance;
}

/** Identity-based intersection, never a guessed textual match or a ranking input. */
export function commonSourcedTags(input?: TagBridgeInput): Knowledge<readonly CommonTag[]> {
  if (input === undefined) return { status: 'unknown', reason: 'No verified common-tag evidence is supplied by this run.' };
  const hasSource = (tag: SourcedTag): boolean => tag.id.trim().length > 0 && tag.label.trim().length > 0 &&
    tag.provenance.queryId.trim().length > 0 && tag.provenance.reference.trim().length > 0;
  const right = new Map(input.right.tags.filter(hasSource).map(tag => [tag.id, tag]));
  const seen = new Set<string>();
  const matches: CommonTag[] = [];
  for (const tag of input.left.tags) {
    const counterpart = right.get(tag.id);
    if (!hasSource(tag) || counterpart === undefined || seen.has(tag.id)) continue;
    seen.add(tag.id);
    matches.push({ id: tag.id, label: tag.label, left: tag.provenance, right: counterpart.provenance });
    if (matches.length === 3) break;
  }
  if (matches.length === 0) return { status: 'unknown', reason: 'The supplied evidence contains no shared tag IDs with provenance on both sides.' };
  return { status: 'known', value: matches };
}
