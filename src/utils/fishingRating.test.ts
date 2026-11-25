import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessSeaTemperature,
  assessWaveLevel,
  assessWindLevel,
  buildChartPoints,
  calculateBeginnerFishingRating,
  createExampleHourlySeries,
  describeWeatherCode,
  describeWindDirection,
  formatKstHourLabel,
} from './fishingRating';

test('describeWeatherCode and describeWindDirection map meteorological values to Korean', () => {
  assert.equal(describeWeatherCode(0), '맑음');
  assert.equal(describeWeatherCode(61), '비');
  assert.equal(describeWeatherCode(95), '뇌우 · 돌풍');
  assert.equal(describeWindDirection(0), '북풍');
  assert.equal(describeWindDirection(135), '남동풍');
  assert.equal(describeWindDirection(315), '북서풍');
});

test('calculateBeginnerFishingRating gives 5 stars on calm, clear, low-wave weather', () => {
  const result = calculateBeginnerFishingRating({
    temperatureC: 18,
    weatherCode: 0,
    windSpeedMs: 2.1,
    windDirectionDeg: 300,
    precipitationMm: 0,
    waveHeightM: 0.4,
    isLive: true,
  });

  assert.equal(result.stars, 5);
  assert.equal(result.tone, 'excellent');
});

test('calculateBeginnerFishingRating lowers stars cleanly on strong wind and high waves', () => {
  const rough = calculateBeginnerFishingRating({
    temperatureC: 14,
    weatherCode: 63,
    windSpeedMs: 11.5,
    windDirectionDeg: 45,
    precipitationMm: 4.0,
    waveHeightM: 2.2,
    isLive: true,
  });

  assert.equal(rough.stars, 1);
  assert.equal(rough.tone, 'danger');
});

test('calculateBeginnerFishingRating rounds to 0.5 star steps for moderate breeze', () => {
  const breezy = calculateBeginnerFishingRating({
    temperatureC: 16,
    weatherCode: 2,
    windSpeedMs: 6.2,
    windDirectionDeg: 270,
    precipitationMm: 0,
    waveHeightM: 1.0,
    isLive: true,
  });

  assert.equal(breezy.stars, 3.5);
  assert.equal(breezy.tone, 'good');
});

test('assessSeaTemperature classifies thermal zones and handles missing inland values', () => {
  const missing = assessSeaTemperature(null);
  assert.equal(missing.tone, 'unknown');
  assert.equal(missing.percentScale, 0);

  const optimal = assessSeaTemperature(18.5);
  assert.equal(optimal.tone, 'optimal');
  assert.match(optimal.zoneLabel, /황금 수온대/);
  assert.ok(optimal.percentScale > 40 && optimal.percentScale < 70);

  const cold = assessSeaTemperature(8.0);
  assert.equal(cold.tone, 'cold');
});

test('assessWindLevel and assessWaveLevel compute safety tiers and bounded percentages', () => {
  const calmWind = assessWindLevel(2.0, 3.1);
  assert.equal(calmWind.tone, 'calm');
  assert.ok(calmWind.percentScale > 0 && calmWind.percentScale < 25);

  const gustWarning = assessWindLevel(4.0, 13.0);
  assert.equal(gustWarning.tone, 'moderate');

  const dangerWave = assessWaveLevel(2.3);
  assert.equal(dangerWave.tone, 'danger');
  assert.ok(dangerWave.percentScale > 80);

  const unknownWave = assessWaveLevel(null);
  assert.equal(unknownWave.tone, 'unknown');
});

test('formatKstHourLabel, buildChartPoints, and createExampleHourlySeries produce valid chart coordinates', () => {
  assert.equal(formatKstHourLabel('2026-11-23T15:00'), '15시');

  const pts = buildChartPoints([0, 5, null, 10], 200, 100, 0, 10, {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
  });
  assert.equal(pts.length, 3);
  assert.equal(pts[0].x, 10);
  assert.equal(pts[0].y, 90);
  assert.equal(pts[2].x, 190);
  assert.equal(pts[2].y, 10);

  const series = createExampleHourlySeries(
    {
      temperatureC: 16,
      weatherCode: 0,
      windSpeedMs: 3.0,
      windDirectionDeg: 180,
      waveHeightM: 0.6,
      seaSurfaceTempC: 15.5,
    },
    10
  );
  assert.equal(series.length, 12);
  assert.equal(series[0].hourLabel, '10시');
  assert.equal(series[2].hourLabel, '12시');
});
