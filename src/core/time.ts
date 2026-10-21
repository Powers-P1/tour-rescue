import type { ZonedDateTime } from './domain.ts';

export class ScenarioInputError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ScenarioInputError';
  }
}

const ISO_WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/;
const IANA_NAME = /^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/;
// Intl formatters own comparatively expensive native ICU state. A decision audit
// revisits the same zones thousands of times; retain only a small bounded set.
// These private instances never leave this module or cache calculation results.
const FORMATTER_CACHE_LIMIT = 32;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

type CalendarParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function assertTimeZone(value: string, path = 'timeZone'): void {
  formatter(value, path);
}

function formatter(timeZone: string, path = 'timeZone'): Intl.DateTimeFormat {
  if (typeof timeZone !== 'string' || !IANA_NAME.test(timeZone)) {
    throw new ScenarioInputError(path, 'must be a valid IANA time-zone identifier, not a numeric offset');
  }
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) {
    // Refresh insertion order so commonly reused tour zones survive eviction.
    formatterCache.delete(timeZone);
    formatterCache.set(timeZone, cached);
    return cached;
  }
  let created: Intl.DateTimeFormat;
  try {
    created = new Intl.DateTimeFormat('en-GB', {
      timeZone, calendar: 'gregory', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit', era: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch {
    // Invalid zones are never retained: each caller keeps its own error path.
    throw new ScenarioInputError(path, 'must be a valid IANA time-zone identifier');
  }
  if (formatterCache.size >= FORMATTER_CACHE_LIMIT) formatterCache.delete(formatterCache.keys().next().value!);
  formatterCache.set(timeZone, created);
  return created;
}

function assertEpoch(value: number, path = 'epochSeconds'): void {
  if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value * 1000).getTime())) {
    throw new ScenarioInputError(path, 'must be an integer number of seconds in the supported calendar range');
  }
}

function partsAt(value: number, format: Intl.DateTimeFormat): CalendarParts {
  assertEpoch(value);
  const parts = Object.fromEntries(format.formatToParts(new Date(value * 1000))
    .map(part => [part.type, part.value]));
  const displayedYear = Number(parts.year);
  return {
    year: parts.era === 'BC' ? 1 - displayedYear : displayedYear,
    month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

function dateKey(parts: CalendarParts): string {
  if (parts.year < 0 || parts.year > 9999) {
    throw new ScenarioInputError('epochSeconds', 'local date must have a four-digit non-negative ISO year');
  }
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function checkedInstant(value: unknown, path: string): ZonedDateTime & { epoch: number } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ScenarioInputError(path, 'must be an object with iso and timeZone');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.iso !== 'string') throw new ScenarioInputError(`${path}.iso`, 'must be a string');
  if (typeof record.timeZone !== 'string') throw new ScenarioInputError(`${path}.timeZone`, 'must be a string');
  assertTimeZone(record.timeZone, `${path}.timeZone`);
  const match = ISO_WITH_OFFSET.exec(record.iso);
  if (match === null) {
    throw new ScenarioInputError(`${path}.iso`, 'must use YYYY-MM-DDTHH:mm:ss with an explicit numeric ±HH:mm offset');
  }
  const wall: CalendarParts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6]),
  };
  const offsetHours = Number(match[8]);
  const offsetMinutes = Number(match[9]);
  if (offsetHours > 23 || offsetMinutes > 59) {
    throw new ScenarioInputError(`${path}.iso`, 'contains an invalid numeric offset');
  }
  // setUTCFullYear preserves years 0000..0099, unlike Date.UTC's 1900-year adjustment.
  const calendar = new Date(0);
  calendar.setUTCFullYear(wall.year, wall.month - 1, wall.day);
  calendar.setUTCHours(wall.hour, wall.minute, wall.second, 0);
  if (calendar.getUTCFullYear() !== wall.year || calendar.getUTCMonth() + 1 !== wall.month
      || calendar.getUTCDate() !== wall.day || calendar.getUTCHours() !== wall.hour
      || calendar.getUTCMinutes() !== wall.minute || calendar.getUTCSeconds() !== wall.second) {
    throw new ScenarioInputError(`${path}.iso`, 'contains an invalid calendar date or time; rollover is not allowed');
  }
  const sign = match[7] === '-' ? -1 : 1;
  const epoch = calendar.getTime() / 1000 - sign * (offsetHours * 3600 + offsetMinutes * 60);
  const actual = partsAt(epoch, formatter(record.timeZone));
  if (Object.keys(wall).some(key => actual[key as keyof CalendarParts] !== wall[key as keyof CalendarParts])) {
    throw new ScenarioInputError(`${path}.iso`, 'numeric offset or local time does not match the IANA zone (including DST)');
  }
  return { iso: record.iso, timeZone: record.timeZone, epoch };
}

/** Validate a real wall-clock instant without relying on the host's local zone. */
export function parseZonedDateTime(value: unknown, path = 'instant'): ZonedDateTime {
  const result = checkedInstant(value, path);
  return { iso: result.iso, timeZone: result.timeZone };
}

export function epochSeconds(instant: ZonedDateTime): number {
  return checkedInstant(instant, 'instant').epoch;
}

export function localDateAt(value: number, timeZone: string): string {
  return dateKey(partsAt(value, formatter(timeZone)));
}

/**
 * Next local calendar-day boundary, strictly after the supplied instant.
 * DST may make a day 23 or 25 hours (or shift its first valid time past 00:00).
 * Inspect the calendar boundary instead of assuming a day is 86,400 seconds.
 */
export function nextLocalMidnight(value: number, timeZone: string): number {
  assertEpoch(value);
  const format = formatter(timeZone);
  const initialDate = dateKey(partsAt(value, format));
  const dateAt = (epoch: number): string => dateKey(partsAt(epoch, format));
  let lower = value;
  // Hourly bracketing also covers historical skipped dates and very long days.
  for (let hour = 0; hour < 72; hour += 1) {
    let upper = lower + 3600;
    if (dateAt(upper) !== initialDate) {
      while (upper - lower > 1) {
        const middle = Math.floor((lower + upper) / 2);
        if (dateAt(middle) === initialDate) lower = middle;
        else upper = middle;
      }
      return upper;
    }
    lower = upper;
  }
  throw new ScenarioInputError('epochSeconds', 'could not find the next local day boundary within 72 hours');
}
