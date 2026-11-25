import type { FishingSpot } from '../data/fishingData';
import { calculateDistanceKm, LatLng } from './geo';

export type SpotSafetyLevel = '매우 안전' | '양호' | '주의 필요';

export const MAX_DRIVING_MINUTES = 60;
export const MAX_DRIVING_STRAIGHT_KM = 65;

export interface NearbyPlaceCandidate {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types?: string[];
  primaryTypeLabel?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  drivingMinutes?: number;
  drivingDistanceKm?: number;
  source: 'google_places' | 'osm_places' | 'curated';
  curatedSpot?: FishingSpot;
}

export interface RecommendedNearbySpot {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number;
  distanceLabel: string;
  drivingMinutes: number;
  drivingDistanceKm: number;
  drivingLabel: string;
  categoryLabel: string;
  safetyLevel: SpotSafetyLevel;
  isBeginnerFriendly: boolean;
  beginnerScore: number;
  safetyNote: string;
  beginnerRigTip: string;
  targetFishHint: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri: string;
  source: 'google_places' | 'osm_places' | 'curated';
  curatedSpot?: FishingSpot;
}

export function formatDistanceLabel(distanceKm: number): string {
  if (distanceKm < 1) {
    const meters = Math.max(10, Math.round(distanceKm * 1000));
    return `${meters}m`;
  }
  return `${Math.round(distanceKm * 10) / 10}km`;
}

export function estimateDrivingMinutes(straightDistanceKm: number): number {
  const safeKm = Math.max(0, straightDistanceKm);
  const roadKm = safeKm * 1.3;
  const speedKmh = safeKm < 8 ? 32 : 50;
  return Math.max(3, Math.round((roadKm / speedKmh) * 60));
}

export function formatDrivingTimeLabel(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded === 60) return '차로 약 1시간';
  if (rounded > 60) {
    const hrs = Math.floor(rounded / 60);
    const rem = rounded % 60;
    return rem > 0 ? `차로 약 ${hrs}시간 ${rem}분` : `차로 약 ${hrs}시간`;
  }
  return `차로 약 ${rounded}분`;
}

export function assessSpotForBeginners(
  candidate: NearbyPlaceCandidate,
  origin: LatLng
): RecommendedNearbySpot {
  const distanceKm = Math.round(calculateDistanceKm(origin, { lat: candidate.lat, lng: candidate.lng }) * 100) / 100;
  const drivingMinutes =
    typeof candidate.drivingMinutes === 'number' && Number.isFinite(candidate.drivingMinutes) && candidate.drivingMinutes > 0
      ? Math.round(candidate.drivingMinutes)
      : estimateDrivingMinutes(distanceKm);
  const drivingDistanceKm =
    typeof candidate.drivingDistanceKm === 'number' && Number.isFinite(candidate.drivingDistanceKm) && candidate.drivingDistanceKm >= 0
      ? Math.round(candidate.drivingDistanceKm * 10) / 10
      : Math.round(distanceKm * 1.3 * 10) / 10;
  const drivingLabel = formatDrivingTimeLabel(drivingMinutes);
  const text = `${candidate.name} ${candidate.address} ${candidate.primaryTypeLabel || ''} ${(candidate.types || []).join(' ')}`.toLowerCase();

  let categoryLabel = candidate.primaryTypeLabel || '연안·수변 낚시 포인트';
  let safetyLevel: SpotSafetyLevel = '양호';
  let isBeginnerFriendly = true;
  let beginnerScore = 75;
  let safetyNote = '구명조끼 착용 및 미끄럼 방지 신발 착용 권장. 야간 출조 시 안전등을 꼭 휴대하세요.';
  let beginnerRigTip = '원투 낚시 또는 가벼운 묶음추 채비(갯지렁이/크릴 미끼) 추천';
  let targetFishHint = '망둥어, 놀래미, 전갱이, 우럭 등 연안 어종';

  const nameAndTypeText = `${candidate.name} ${candidate.primaryTypeLabel || ''} ${(candidate.types || []).join(' ')}`.toLowerCase();

  if (/테트라포드|갯바위|방파제 외항|절벽/.test(text)) {
    categoryLabel = '갯바위 / 테트라포드 구간';
    safetyLevel = '주의 필요';
    isBeginnerFriendly = false;
    beginnerScore = 35;
    safetyNote = '미끄럼·추락 위험이 있는 구간입니다. 초보자는 테트라포드 진입을 삼가고 평탄한 내항·데크 구간만 이용하세요.';
    beginnerRigTip = '초보자는 평탄한 항내 측 찌낚시 또는 안전 난간 구역 권장';
    targetFishHint = candidate.curatedSpot?.targetFish.join(', ') || '볼락, 우럭, 감성돔';
  } else if (/낚시공원|낚시터|좌대|낚시카페|실내낚시|체험/.test(text)) {
    categoryLabel = /카페|실내/.test(text) ? '실내·도심 체험 낚시터' : '관리형 안전 낚시터 / 공원';
    safetyLevel = '매우 안전';
    isBeginnerFriendly = true;
    beginnerScore = 98;
    safetyNote = '안전 난간·편의시설·주차 환경이 갖춰진 관리형 포인트로 입문자와 가족 단위 출조에 매우 적합합니다.';
    beginnerRigTip = '민장대 또는 짧은 루어대 · 현장에서 채비 대여/안내 가능';
    targetFishHint = candidate.curatedSpot?.targetFish.join(', ') || '우럭, 숭어, 고등어, 망둥어 (또는 관리 어종)';
  } else if (/선착장|부두|포구|항구|어항|[가-힣]{1,5}(?<!공)항(?:\s|$|[,.])|방파제|피어|pier|marina|harbor/.test(nameAndTypeText)) {
    categoryLabel = '항구 · 방파제 내항 포인트';
    safetyLevel = '양호';
    isBeginnerFriendly = true;
    beginnerScore = 88;
    safetyNote = '발판이 비교적 평탄한 항내·선착장 구역 위주로 자리 잡으세요. 어선 입출항 경로와 밧줄 주변은 피해야 합니다.';
    beginnerRigTip = '2.4~3.6m 원투대 + 묶음추 채비 또는 카드채비(전갱이/고등어)';
    targetFishHint = candidate.curatedSpot?.targetFish.join(', ') || '고등어, 전갱이, 망둥어, 우럭, 보리멸';
  } else if (/해수욕장|백사장|해변/.test(text)) {
    categoryLabel = '해변 · 백사장 낚시 포인트';
    safetyLevel = '매우 안전';
    isBeginnerFriendly = true;
    beginnerScore = 86;
    safetyNote = '경사가 완만하고 발판이 안정적이지만 해수욕장 개장 시간 및 낚시 금지 구역 안내판을 먼저 확인하세요.';
    beginnerRigTip = '모래밭 원투 낚시(청갯지렁이) · 낚시 가능 구역 확인 필수';
    targetFishHint = '보리멸, 도다리, 망둥어, 백조기';
  } else if (/해양공원|수변공원|호수공원|강변공원|한강공원|근린공원|시민공원|공원|유원지|park|recreation/.test(text)) {
    categoryLabel = /수변|호수|강변|한강|해양|천/.test(text)
      ? '주변 수변 공원 · 워터프론트'
      : '주변 공원 · 야외 힐링 쉼터';
    safetyLevel = '매우 안전';
    isBeginnerFriendly = true;
    beginnerScore = /수변|호수|강변|한강|해양/.test(text) ? 74 : 66;
    safetyNote =
      '인근 낚시터가 적은 지역의 안전 공원·수변 공간입니다. 현장 표지판에서 낚시 허용 구간 여부를 확인한 뒤 산책·가벼운 릴링 연습 장소로 활용하세요.';
    beginnerRigTip = '낚시 허용 구역 확인 필수 · 가족 쉼터 및 캐스팅 감각 연습 적합';
    targetFishHint = /수변|호수|강변|한강|해양/.test(text)
      ? '허용 구간 확인 후 망둥어·민물 어종 또는 수변 관람'
      : '도심·근교 공원 산책 및 낚시 출조 전 휴식 거점';
  }

  if (candidate.curatedSpot) {
    targetFishHint = candidate.curatedSpot.targetFish.join(', ');
    if (candidate.curatedSpot.tips) {
      beginnerRigTip = candidate.curatedSpot.tips;
    }
  }

  if (candidate.rating && candidate.rating >= 4.2) {
    beginnerScore += 5;
  }

  const googleMapsUri =
    candidate.googleMapsUri ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${candidate.lat},${candidate.lng}`)}`;

  return {
    id: candidate.id,
    name: candidate.name,
    address: candidate.address,
    lat: candidate.lat,
    lng: candidate.lng,
    distanceKm: Math.round(distanceKm * 10) / 10,
    distanceLabel: formatDistanceLabel(distanceKm),
    drivingMinutes,
    drivingDistanceKm,
    drivingLabel,
    categoryLabel,
    safetyLevel,
    isBeginnerFriendly,
    beginnerScore,
    safetyNote,
    beginnerRigTip,
    targetFishHint,
    rating: candidate.rating,
    userRatingCount: candidate.userRatingCount,
    googleMapsUri,
    source: candidate.source,
    curatedSpot: candidate.curatedSpot,
  };
}

const EXCLUDED_PLACE_TYPES = new Set([
  'restaurant',
  'seafood_restaurant',
  'korean_restaurant',
  'cafe',
  'bakery',
  'bar',
  'meal_takeaway',
  'lodging',
  'hotel',
  'motel',
  'parking',
  'supermarket',
  'convenience_store',
  'grocery_store',
  'shopping_mall',
  'bus_stop',
  'transit_stop',
  'subway_station',
  'real_estate_agency',
  'school',
  'hospital',
]);

const EXCLUDED_NAME_REGEX =
  /횟집|칼제비|식당|맛집|주점|포차|주차장|공영주차|어린이공원|유람선|요트|투어|렌트|슈퍼|마트|낚시점|낚시방|낚시마트|용품|어시장|수산|펜션|모텔|호텔|민박|빌라|아파트|부동산|한강버스|임해행정|office|sashimi|market|tour|yacht|1982|스튜디오/i;

export function isLikelyFishingSpotCandidate(candidate: NearbyPlaceCandidate): boolean {
  if (candidate.source === 'curated') return true;
  const name = candidate.name || '';
  if (EXCLUDED_NAME_REGEX.test(name)) {
    return false;
  }
  const types = (candidate.types || []).map((t) => t.toLowerCase());
  const isExplicitFishingOrPark =
    /낚시터|낚시공원|유료낚시|좌대|방파제|선착장|항구|포구|공원|수변|유원지/.test(name) ||
    types.some((t) => t === 'park' || t === 'recreation_ground' || t === 'nature_reserve');
  if (types.some((t) => EXCLUDED_PLACE_TYPES.has(t))) {
    if (!isExplicitFishingOrPark) {
      return false;
    }
    if (types.some((t) => t === 'restaurant' || t === 'cafe' || t === 'food' || t === 'seafood_restaurant' || t === 'parking')) {
      return false;
    }
  }
  return true;
}

export function filterAndRankNearbySpots(
  candidates: NearbyPlaceCandidate[],
  origin: LatLng,
  maxRadiusKm = MAX_DRIVING_STRAIGHT_KM,
  onlyBeginnerFriendly = false,
  maxDrivingMinutes = MAX_DRIVING_MINUTES
): RecommendedNearbySpot[] {
  const deduped: RecommendedNearbySpot[] = [];

  for (const candidate of candidates) {
    if (!isLikelyFishingSpotCandidate(candidate)) continue;
    const assessed = assessSpotForBeginners(candidate, origin);
    if (assessed.distanceKm > maxRadiusKm) continue;
    if (assessed.drivingMinutes > maxDrivingMinutes) continue;
    if (onlyBeginnerFriendly && !assessed.isBeginnerFriendly) continue;

    const normName = assessed.name.replace(/\s+/g, '').toLowerCase();
    const isDuplicate = deduped.some((existing) => {
      const sameName = existing.name.replace(/\s+/g, '').toLowerCase() === normName;
      const veryClose =
        calculateDistanceKm({ lat: existing.lat, lng: existing.lng }, { lat: assessed.lat, lng: assessed.lng }) < 0.08;
      return sameName || veryClose;
    });

    if (!isDuplicate) {
      deduped.push(assessed);
    }
  }

  return deduped.sort((a, b) => {
    if (a.isBeginnerFriendly !== b.isBeginnerFriendly) {
      return a.isBeginnerFriendly ? -1 : 1;
    }
    const aIsParkOnly = a.categoryLabel.includes('주변 공원') || a.categoryLabel.includes('주변 수변 공원');
    const bIsParkOnly = b.categoryLabel.includes('주변 공원') || b.categoryLabel.includes('주변 수변 공원');
    if (aIsParkOnly !== bIsParkOnly) {
      return aIsParkOnly ? 1 : -1;
    }
    if (Math.abs(a.drivingMinutes - b.drivingMinutes) >= 10) {
      return a.drivingMinutes - b.drivingMinutes;
    }
    if (b.beginnerScore !== a.beginnerScore) {
      return b.beginnerScore - a.beginnerScore;
    }
    return a.drivingMinutes - b.drivingMinutes;
  });
}
