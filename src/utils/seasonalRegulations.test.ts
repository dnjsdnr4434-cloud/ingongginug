import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentSeasonalRegulations } from './seasonalRegulations';

test('getCurrentSeasonalRegulations in November shows active Nov bans and excludes May/July summer bans', () => {
  // 2026-11-23 12:00 KST (UTC+9 -> 03:00Z)
  const novDate = new Date('2026-11-23T03:00:00Z');
  const summary = getCurrentSeasonalRegulations(novDate);

  assert.equal(summary.kstMonth, 11);
  assert.equal(summary.kstDay, 23);

  const banNames = summary.activeFishingBans.map((b) => b.speciesName);
  assert.ok(banNames.includes('쥐노래미 (놀래미)'), 'November should include 쥐노래미 closed season');
  assert.ok(banNames.includes('연어'), 'November should include 연어 closed season');
  assert.ok(banNames.includes('대게'), 'November should include 대게 closed season');
  assert.ok(banNames.includes('명태'), 'Year-round 명태 ban should always appear');

  assert.ok(!banNames.includes('주꾸미'), 'November must NOT include May-Aug 주꾸미 ban');
  assert.ok(!banNames.includes('돌돔'), 'November must NOT include May-Jun 돌돔 ban');
  assert.ok(!banNames.includes('갈치'), 'November must NOT include July 갈치 ban');

  const sizeNames = summary.seasonalMinimumSizes.map((s) => s.speciesName);
  assert.ok(sizeNames.includes('조피볼락 (우럭)'), 'November coastal fishing includes 우럭 minimum size');
  assert.ok(sizeNames.includes('감성돔'), 'November coastal fishing includes 감성돔 minimum size');
  assert.ok(!sizeNames.includes('쥐노래미 (놀래미)'), '쥐노래미 is already listed in closed season bans');
});

test('getCurrentSeasonalRegulations in May shows spring closed seasons and excludes Nov bans', () => {
  const mayDate = new Date('2026-05-20T03:00:00Z');
  const summary = getCurrentSeasonalRegulations(mayDate);

  assert.equal(summary.kstMonth, 5);
  const banNames = summary.activeFishingBans.map((b) => b.speciesName);
  assert.ok(banNames.includes('감성돔'));
  assert.ok(banNames.includes('돌돔'));
  assert.ok(banNames.includes('주꾸미'));
  assert.ok(!banNames.includes('쥐노래미 (놀래미)'));
  assert.ok(!banNames.includes('연어'));
});
