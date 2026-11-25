import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRegionalTideInfo } from './koreaTide';

test('calculateRegionalTideInfo adapts tidal range and high/low tide counts to Korean sea region', () => {
  const fixedNow = new Date('2026-11-25T03:00:00Z'); // 12:00 KST

  const westCoast = calculateRegionalTideInfo({ lat: 37.4563, lng: 126.5972 }, '서해', fixedNow);
  const eastCoast = calculateRegionalTideInfo({ lat: 37.772, lng: 128.948 }, '동해', fixedNow);
  const southCoast = calculateRegionalTideInfo({ lat: 35.1587, lng: 129.1604 }, '남해', fixedNow);

  assert.ok(westCoast.tidalRangeCm > southCoast.tidalRangeCm);
  assert.ok(southCoast.tidalRangeCm > eastCoast.tidalRangeCm);
  assert.ok(eastCoast.tidalRangeCm <= 45);
  assert.ok(westCoast.highTides.length >= 1);
  assert.ok(westCoast.lowTides.length >= 1);
  assert.ok(westCoast.multaeNumber >= 1 && westCoast.multaeNumber <= 15);
  assert.equal(westCoast.recommendedWindows.length, 3);
});

test('calculateRegionalTideInfo lowers recommendation scores under gale-force weather', () => {
  const fixedNow = new Date('2026-11-25T03:00:00Z');
  const stormy = calculateRegionalTideInfo(
    { lat: 35.1587, lng: 129.1604 },
    '남해',
    fixedNow,
    {
      temperatureC: 12,
      weatherCode: 63,
      windSpeedMs: 13.5,
      windDirectionDeg: 45,
      precipitationMm: 5,
      precipitationProb: 90,
      waveHeightM: 2.4,
      isLive: true,
    }
  );

  assert.ok(stormy.recommendedWindows[0].score < 68);
  assert.equal(stormy.recommendedWindows[0].rating === '최적', false);
});
