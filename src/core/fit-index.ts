import type { Knowledge } from './domain.ts';
import type { CityIndex, FitInput, FitReport, FitWarning, ProfilePercentiles } from './fit-types.ts';
import { parseFitInput } from './parse-fit-input.ts';

const known = <T>(value: T): Knowledge<T> => ({ status: 'known', value });
const unknown = (reason: string): Knowledge<never> => ({ status: 'unknown', reason });
const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/**
 * Pure, deterministic cultural-fit index. No time, randomness, I/O or ticket-sales inference.
 * Each profile is ranked independently; cross-query raw affinity is never averaged.
 */
export function computeFitIndex(value: FitInput): FitReport {
  const input = parseFitInput(value);
  const cityIds = [...input.candidateSet.cityIds].sort(compareIds);
  const sortedProfiles = [...input.profiles].sort((a, b) => compareIds(a.queryId, b.queryId));
  const warnings: FitWarning[] = [];
  const doubledRanks = new Map<string, readonly number[]>();
  const count = cityIds.length;
  if (count < 2) {
    warnings.push({ code: 'INSUFFICIENT_CANDIDATES', queryId: null, message: 'At least two frozen cities are needed for a rank index.' });
  }

  const profiles: ProfilePercentiles[] = sortedProfiles.map(profile => {
    const observations = new Map(profile.observations.map(row => [row.cityId, row.affinity]));
    const missing = cityIds.filter(cityId => observations.get(cityId)?.status !== 'known');
    let unavailableReason: string | null = null;
    if (missing.length > 0) {
      unavailableReason = `Profile ${profile.queryId} has unknown affinity for: ${missing.join(', ')}. The frozen universe is not reduced.`;
      warnings.push({ code: 'INCOMPLETE_PROFILE', queryId: profile.queryId, message: unavailableReason });
    } else if (count < 2) {
      unavailableReason = 'A singleton candidate set has no comparative percentile.';
    }

    let informative: Knowledge<boolean>;
    let percentiles: CityIndex[];
    if (unavailableReason !== null) {
      informative = unknown(unavailableReason);
      percentiles = cityIds.map(cityId => ({ cityId, value: unknown(unavailableReason) }));
    } else {
      const scores = cityIds.map(cityId => {
        const observation = observations.get(cityId);
        // This is an internal invariant after validation and the completeness gate.
        if (observation?.status !== 'known') throw new Error('Complete profile invariant violated');
        return { cityId, score: observation.value };
      });
      const flat = scores.every(row => row.score === scores[0]?.score);
      informative = known(!flat);
      if (flat) {
        warnings.push({ code: 'FLAT_PROFILE', queryId: profile.queryId, message: 'All affinities tie. This profile contributes 50 to every city; its weight is retained.' });
      }
      const ranks = scores.map(row => {
        const lower = scores.filter(other => other.score < row.score).length;
        const equal = scores.filter(other => other.score === row.score).length;
        return 2 * lower + equal - 1;
      });
      doubledRanks.set(profile.queryId, ranks);
      percentiles = scores.map((row, index) => ({
        cityId: row.cityId, value: known(100 * ranks[index]! / (2 * (count - 1))),
      }));
    }
    return {
      queryId: profile.queryId, artistId: profile.artistId, role: profile.role,
      weight: profile.weight, provenance: profile.provenance, informative, percentiles,
    };
  });

  const incomplete = profiles.some(profile => profile.informative.status === 'unknown');
  const weightSum = profiles.reduce((sum, profile) => sum + profile.weight, 0);
  const cities: CityIndex[] = cityIds.map((cityId, index) => {
    if (incomplete) {
      return { cityId, value: unknown('At least one profile cannot be ranked over the full frozen universe. No artist weights were redistributed.') };
    }
    let weightedRanks = 0;
    for (const profile of profiles) {
      const rank = doubledRanks.get(profile.queryId)?.[index];
      if (rank === undefined) throw new Error('Complete rank invariant violated');
      weightedRanks += profile.weight * rank;
    }
    // Divide once after aggregating integer ranks to avoid artificial fit advantages.
    // Input weights sum to 1; their denominator only compensates floating-point error.
    const aggregate = 100 * weightedRanks / (2 * (count - 1) * weightSum);
    // v1 canonical precision applies only to the final index, never raw-affinity ties.
    return { cityId, value: known(Math.min(100, Math.max(0, Math.round(aggregate * 1e12) / 1e12))) };
  });
  const first = cities[0]?.value;
  if (first?.status === 'known' && cities.every(city => city.value.status === 'known' && city.value.value === first.value)) {
    warnings.push({ code: 'FLAT_AGGREGATE', queryId: null, message: 'The combined model does not distinguish cities. Use constraints and explicit tie-breaking, not an invented fit advantage.' });
  }
  return {
    schemaVersion: 'tour-rescue.fit-report.v1', method: 'weighted-midrank-v1',
    candidateSet: { id: input.candidateSet.id, cityIds }, profiles, cities, warnings,
  };
}
