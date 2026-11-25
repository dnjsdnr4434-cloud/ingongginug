import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDetailedKoreanAddress,
  calculateDistanceKm,
  extractClientIpFromHeader,
  findNearestFishingSpot,
  formatAccuracyLabel,
  formatDeviceLocationLabel,
  formatSpeedKmh,
  getAccuracyQualityInfo,
  inferKoreaSeaRegion,
  isPublicClientIp,
  shouldAcceptGpsReading,
  shouldApplyAutoDeviceLocation,
  shouldRefreshLocationData,
} from './geo';
import { INITIAL_FISHING_SPOTS } from '../data/fishingData';

test('calculateDistanceKm computes accurate distance between Seoul and Busan', () => {
  const seoul = { lat: 37.5665, lng: 126.978 };
  const busan = { lat: 35.1796, lng: 129.0756 };
  const dist = calculateDistanceKm(seoul, busan);
  assert.ok(dist > 310 && dist < 340, `Expected ~325km, got ${dist}`);
});

test('findNearestFishingSpot returns the closest spot in dataset', () => {
  const nearSokcho = { lat: 38.17, lng: 128.58 };
  const result = findNearestFishingSpot(nearSokcho, INITIAL_FISHING_SPOTS);
  assert.ok(result !== null);
  assert.equal(result.spot.region, '동해');
  assert.ok(result.distanceKm < 10);
});

test('inferKoreaSeaRegion classifies East, West, South, and Jeju coordinates', () => {
  assert.equal(inferKoreaSeaRegion({ lat: 33.3, lng: 126.5 }), '제주');
  assert.equal(inferKoreaSeaRegion({ lat: 34.7, lng: 127.7 }), '남해');
  assert.equal(inferKoreaSeaRegion({ lat: 37.7, lng: 128.9 }), '동해');
  assert.equal(inferKoreaSeaRegion({ lat: 36.8, lng: 126.3 }), '서해');
});

test('extractClientIpFromHeader ignores loopback/private IPs and returns first public IP', () => {
  assert.equal(isPublicClientIp('127.0.0.1'), false);
  assert.equal(isPublicClientIp('192.168.0.10'), false);
  assert.equal(isPublicClientIp('172.18.0.2'), false);
  assert.equal(isPublicClientIp('211.234.12.5'), true);

  assert.equal(
    extractClientIpFromHeader('10.0.0.1, 211.234.12.5, 34.64.10.2', '127.0.0.1'),
    '211.234.12.5'
  );
  assert.equal(extractClientIpFromHeader(undefined, '::ffff:127.0.0.1'), '');
});

test('shouldApplyAutoDeviceLocation preserves manual selections unless forced', () => {
  assert.equal(shouldApplyAutoDeviceLocation('default', 'device-ip'), true);
  assert.equal(shouldApplyAutoDeviceLocation('device-ip', 'gps'), true);
  assert.equal(shouldApplyAutoDeviceLocation('gps', 'device-ip'), false);
  assert.equal(shouldApplyAutoDeviceLocation('spot', 'device-ip'), false);
  assert.equal(shouldApplyAutoDeviceLocation('map-click', 'gps'), false);
  assert.equal(shouldApplyAutoDeviceLocation('map-click', 'gps', true), true);
});

test('formatDeviceLocationLabel formats clean Korean device labels', () => {
  const formatted = formatDeviceLocationLabel({
    city: '서울',
    region: '서울특별시',
    country: '대한민국',
  });
  assert.equal(formatted.label, '서울 (접속 기기 위치)');
  assert.equal(formatted.address, '대한민국 서울특별시 서울');
});

test('formatSpeedKmh and formatAccuracyLabel format real-time telemetry cleanly', () => {
  assert.equal(formatSpeedKmh(null), '정지 상태');
  assert.equal(formatSpeedKmh(0.1), '정지 상태');
  assert.equal(formatSpeedKmh(5), '18 km/h 이동 중');

  assert.equal(formatAccuracyLabel(null), '정밀도 확인 중');
  assert.equal(formatAccuracyLabel(14.6), '±15m');
  assert.equal(formatAccuracyLabel(1500), '±1.5km');
});

test('shouldRefreshLocationData throttles rapid minor jitter and triggers on real movement', () => {
  const origin = { lat: 35.1587, lng: 129.1604 };
  const slightJitter = { lat: 35.15875, lng: 129.16045 };
  const movedFar = { lat: 35.163, lng: 129.165 };

  assert.equal(shouldRefreshLocationData(null, origin, 0, 1000, 0.1, 10000), true);
  assert.equal(shouldRefreshLocationData(origin, movedFar, 1000, 5000, 0.1, 10000), false);
  assert.equal(shouldRefreshLocationData(origin, slightJitter, 1000, 20000, 0.1, 10000), false);
  assert.equal(shouldRefreshLocationData(origin, movedFar, 1000, 20000, 0.1, 10000), true);
});

test('shouldAcceptGpsReading rejects coarse cell-tower spikes and accepts precision upgrades', () => {
  const p1 = { lat: 35.1587, lng: 129.1604 };
  const p2SameClose = { lat: 35.15874, lng: 129.16044 };
  const coarseSpike = { lat: 35.17, lng: 129.18 };

  // Upgrade from 1200m IP/WiFi fix to 18m GPS fix even if coords barely moved
  assert.equal(shouldAcceptGpsReading(p1, 1200, 1000, p2SameClose, 18, 3000), true);
  // Reject 2000m noisy cell-tower spike right after a 18m GPS lock
  assert.equal(shouldAcceptGpsReading(p1, 18, 1000, coarseSpike, 2000, 5000), false);
  // Reject null-island (0,0)
  assert.equal(shouldAcceptGpsReading(null, null, 0, { lat: 0, lng: 0 }, 10, 1000), false);

  assert.equal(getAccuracyQualityInfo(12).tier, 'high');
  assert.equal(getAccuracyQualityInfo(75).tier, 'medium');
  assert.equal(getAccuracyQualityInfo(850).tier, 'low');
});

test('buildDetailedKoreanAddress structures Korean administrative and POI fields', () => {
  const result = buildDetailedKoreanAddress(
    {
      city: '부산광역시',
      borough: '해운대구',
      quarter: '우1동',
      road: '해운대해변로209번길',
      postcode: '48093',
    },
    '',
    '해운대 해수욕장'
  );
  assert.equal(
    result.formattedAddress,
    '부산광역시 해운대구 우1동 해운대해변로209번길 (해운대 해수욕장)'
  );
  assert.equal(result.shortLabel, '해운대구 해운대 해수욕장');
  assert.equal(result.postcode, '48093');
});
