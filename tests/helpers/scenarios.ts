import { readFileSync } from 'node:fs';
import type { TourScenario } from '../../src/core/domain.ts';
import { parseTourScenario } from '../../src/core/parse-scenario.ts';
import { createGermanyScenario } from '../../src/demo/germany.ts';

export type Mutable<T> = { -readonly [P in keyof T]: Mutable<T[P]> };

export function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8'));
}

export function polishScenario(): Mutable<TourScenario> {
  return parseTourScenario(fixture('synthetic/tour__five-dates__one-cancelled.json')) as Mutable<TourScenario>;
}

/** Shared demo assembly; each call returns a fresh validated scenario. */
export function germanyScenario(): Mutable<TourScenario> {
  return createGermanyScenario() as Mutable<TourScenario>;
}

export function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
}
