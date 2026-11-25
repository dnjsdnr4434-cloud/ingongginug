import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getKstIsoDate,
  formatKstDateTime,
  formatKstTimeShort,
  getKstFishingWindowLabel,
} from './koreaTime';

test('getKstIsoDate converts UTC timestamp across midnight to Asia/Seoul date', () => {
  // 2026-11-21 16:30:00 UTC is 2026-11-22 01:30:00 KST (UTC+9)
  const utcEvening = new Date('2026-11-21T16:30:00Z');
  assert.equal(getKstIsoDate(utcEvening), '2026-11-22');

  // 2026-11-21 05:00:00 UTC is 2026-11-21 14:00:00 KST
  const utcMorning = new Date('2026-11-21T05:00:00Z');
  assert.equal(getKstIsoDate(utcMorning), '2026-11-21');
});

test('formatKstDateTime formats full Korean KST date and weekday', () => {
  // 2026-11-21T11:18:30Z -> 2026-11-21 20:18:30 KST (Saturday / 토)
  const sample = new Date('2026-11-21T11:18:30Z');
  assert.equal(formatKstDateTime(sample), '2026년 11월 21일 (토) 20:18:30 KST');
  assert.equal(formatKstTimeShort(sample), '20:18 KST');
});

test('getKstFishingWindowLabel returns appropriate Korean advisory by KST hour', () => {
  // 06:00 KST = 21:00 UTC previous day
  const dawn = new Date('2026-11-20T21:00:00Z');
  assert.match(getKstFishingWindowLabel(dawn), /새벽~오전/);

  // 18:00 KST = 09:00 UTC
  const sunset = new Date('2026-11-21T09:00:00Z');
  assert.match(getKstFishingWindowLabel(sunset), /해질녘/);
});
