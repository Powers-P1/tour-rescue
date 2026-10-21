import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTimeZone, epochSeconds, localDateAt, nextLocalMidnight, parseZonedDateTime } from '../src/core/time.ts';

test('repeated time calculations retain independent zone, DST and historical calendar semantics after zone churn', () => {
  const spring = { iso: '2026-03-29T00:00:00+01:00', timeZone: 'Europe/Warsaw' };
  const autumn = { iso: '2026-10-25T00:00:00+02:00', timeZone: 'Europe/Warsaw' };
  const yearZero = { iso: '0000-01-01T00:00:00+00:00', timeZone: 'Etc/UTC' };
  const run = () => {
    const springEpoch = epochSeconds(spring);
    const autumnEpoch = epochSeconds(autumn);
    assert.equal(nextLocalMidnight(springEpoch, spring.timeZone) - springEpoch, 23 * 3600);
    assert.equal(nextLocalMidnight(autumnEpoch, autumn.timeZone) - autumnEpoch, 25 * 3600);
    assert.equal(localDateAt(springEpoch, 'Europe/Warsaw'), '2026-03-29');
    assert.equal(localDateAt(springEpoch, 'America/New_York'), '2026-03-28');
    assert.equal(localDateAt(epochSeconds(yearZero), yearZero.timeZone), '0000-01-01');
    assert.deepEqual(parseZonedDateTime(spring), spring);
    assert.throws(() => parseZonedDateTime({ ...spring, iso: '2026-03-29T02:30:00+01:00' }), /including DST/);
  };
  run();
  // More distinct valid zones than retained formatters exercises eviction without
  // depending on cache internals or a machine-specific timing/memory threshold.
  const zones = Intl.supportedValuesOf('timeZone').slice(0, 40);
  assert.equal(zones.length, 40);
  for (const zone of zones) {
    assertTimeZone(zone);
    assert.match(localDateAt(1_800_000_000, zone), /^\d{4}-\d{2}-\d{2}$/);
  }
  run();
});

test('invalid-zone errors retain the individual caller path before and after valid lookups', () => {
  assertTimeZone('Europe/Berlin', 'valid.first');
  assert.throws(() => assertTimeZone('NoSuch/Zone', 'first.timeZone'), /^ScenarioInputError: first\.timeZone: must be a valid IANA time-zone identifier$/);
  assertTimeZone('Europe/Berlin', 'valid.second');
  assert.throws(() => assertTimeZone('NoSuch/Zone', 'second.timeZone'), /^ScenarioInputError: second\.timeZone: must be a valid IANA time-zone identifier$/);
  assert.throws(() => assertTimeZone('+01:00', 'numeric.timeZone'), /numeric\.timeZone:.*not a numeric offset/);
  assert.throws(() => parseZonedDateTime({ iso: '2026-10-21T12:00:00+00:00', timeZone: 'NoSuch/Zone' }, 'show.arriveBy'), /show\.arriveBy\.timeZone:/);
});
