import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessSpotForBeginners,
  filterAndRankNearbySpots,
  formatDistanceLabel,
  isLikelyFishingSpotCandidate,
} from './nearbySpots';

const busanOrigin = { lat: 35.1587, lng: 129.1604 };

test('formatDistanceLabel formats meters under 1km and km above 1km', () => {
  assert.equal(formatDistanceLabel(0.45), '450m');
  assert.equal(formatDistanceLabel(2.34), '2.3km');
});

test('assessSpotForBeginners classifies managed fishing parks as very safe for beginners', () => {
  const park = assessSpotForBeginners(
    {
      id: 'p1',
      name: '해운대 바다낚시공원',
      address: '부산 해운대구',
      lat: 35.162,
      lng: 129.17,
      rating: 4.5,
      source: 'google_places',
    },
    busanOrigin
  );
  assert.equal(park.safetyLevel, '매우 안전');
  assert.equal(park.isBeginnerFriendly, true);
  assert.ok(park.distanceKm <= 5);
});

test('assessSpotForBeginners warns beginners away from rocky/tetrapod areas', () => {
  const rocky = assessSpotForBeginners(
    {
      id: 'p2',
      name: '외항 테트라포드 갯바위',
      address: '부산 영도구',
      lat: 35.15,
      lng: 129.15,
      source: 'google_places',
    },
    busanOrigin
  );
  assert.equal(rocky.safetyLevel, '주의 필요');
  assert.equal(rocky.isBeginnerFriendly, false);
});

test('filterAndRankNearbySpots excludes spots beyond 5km and prioritizes safe beginner spots', () => {
  const results = filterAndRankNearbySpots(
    [
      {
        id: 'far',
        name: '멀리 떨어진 낚시공원',
        address: '울산',
        lat: 35.5,
        lng: 129.4,
        source: 'google_places',
      },
      {
        id: 'rocky',
        name: '근처 갯바위 포인트',
        address: '부산',
        lat: 35.159,
        lng: 129.162,
        source: 'google_places',
      },
      {
        id: 'safe',
        name: '청사포 방파제 항구',
        address: '부산 해운대구',
        lat: 35.161,
        lng: 129.19,
        source: 'google_places',
      },
    ],
    busanOrigin,
    5,
    true
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'safe');
  assert.ok(results[0].distanceKm <= 5);
});

test('isLikelyFishingSpotCandidate filters out restaurants and parking lots while keeping breakwaters', () => {
  assert.equal(
    isLikelyFishingSpotCandidate({
      id: 'r1',
      name: '방파제횟집',
      address: '부산',
      lat: 35.159,
      lng: 129.162,
      types: ['restaurant', 'food'],
      source: 'google_places',
    }),
    false
  );
  assert.equal(
    isLikelyFishingSpotCandidate({
      id: 'p_lot',
      name: '수변공원공영주차장',
      address: '부산',
      lat: 35.155,
      lng: 129.131,
      types: ['parking'],
      source: 'google_places',
    }),
    false
  );
  assert.equal(
    isLikelyFishingSpotCandidate({
      id: 'bw1',
      name: '미포방파제',
      address: '부산 해운대구',
      lat: 35.158,
      lng: 129.169,
      types: ['marina', 'point_of_interest'],
      source: 'google_places',
    }),
    true
  );
});

test('filterAndRankNearbySpots strictly excludes fishing spots over 60 minutes by car', () => {
  const results = filterAndRankNearbySpots(
    [
      {
        id: 'near_25min',
        name: '기장 대변항 방파제',
        address: '부산 기장군',
        lat: 35.2229,
        lng: 129.2314,
        drivingMinutes: 25,
        drivingDistanceKm: 13.4,
        source: 'curated',
      },
      {
        id: 'over_limit_75min',
        name: '창원 마산항 방파제',
        address: '경남 창원시',
        lat: 35.19,
        lng: 128.58,
        drivingMinutes: 75,
        drivingDistanceKm: 58.2,
        source: 'curated',
      },
      {
        id: 'way_too_far',
        name: '서귀포 모슬포항 방파제',
        address: '제주 서귀포시',
        lat: 33.2165,
        lng: 126.2512,
        source: 'curated',
      },
    ],
    busanOrigin,
    65,
    false,
    60
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'near_25min');
  assert.equal(results[0].drivingLabel, '차로 약 25분');
});

test('filterAndRankNearbySpots accepts nearby parks as fallback and ranks formal fishing spots higher', () => {
  const seoulOrigin = { lat: 37.5665, lng: 126.978 };
  const results = filterAndRankNearbySpots(
    [
      {
        id: 'park_normal',
        name: '남산근린공원',
        address: '서울 중구',
        lat: 37.5512,
        lng: 126.9882,
        types: ['park'],
        drivingMinutes: 12,
        drivingDistanceKm: 3.1,
        source: 'osm_places',
      },
      {
        id: 'park_waterfront',
        name: '여의도 한강공원',
        address: '서울 영등포구',
        lat: 37.5283,
        lng: 126.9329,
        types: ['park'],
        drivingMinutes: 18,
        drivingDistanceKm: 6.5,
        source: 'osm_places',
      },
      {
        id: 'formal_spot',
        name: '서강 낚시터',
        address: '서울 마포구',
        lat: 37.547,
        lng: 126.93,
        types: ['fishing'],
        drivingMinutes: 20,
        drivingDistanceKm: 5.8,
        source: 'osm_places',
      },
      {
        id: 'kids_park_excluded',
        name: '햇살어린이공원',
        address: '서울 중구',
        lat: 37.565,
        lng: 126.979,
        types: ['park'],
        drivingMinutes: 5,
        source: 'osm_places',
      },
    ],
    seoulOrigin,
    65,
    false,
    60
  );

  assert.equal(results.length, 3);
  assert.equal(results[0].id, 'formal_spot');
  assert.ok(results.some((r) => r.id === 'park_waterfront' && r.categoryLabel.includes('수변 공원')));
  assert.ok(results.some((r) => r.id === 'park_normal' && r.categoryLabel.includes('주변 공원')));
  assert.ok(!results.some((r) => r.id === 'kids_park_excluded'));
});
