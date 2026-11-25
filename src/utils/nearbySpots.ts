import type { FishingSpot } from '../data/fishingData';
import { calculateDistanceKm, type LatLng } from './geo';

export const MAX_DRIVING_MINUTES = 60;
export const MAX_DRIVING_STRAIGHT_KM = 55;

export interface NearbyPlaceCandidate {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  source: 'curated' | 'osm' | 'google';
  categoryLabel?: string;
  curatedSpot?: FishingSpot;
  drivingMinutes?: number;
  drivingDistanceKm?: number;
}

export interface RecommendedNearbySpot {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number;
  drivingMinutes: number;
  drivingDistanceKm: number;
  source: 'curated' | 'osm' | 'google';
  categoryLabel: string;
  isBeginnerSafe: boolean;
  safetyLevel: '매우 안전' | '보통' | '주의 필요';
  safetyReason: string;
  isParkFallback: boolean;
  curatedSpot?: FishingSpot;
}

export function isLikelyFishingSpotCandidate(name: string, category?: string): boolean {
  const combined = `${name} ${category || ''}`.toLowerCase();
  const excludedKeywords = [
    '주차장',
    '식당',
    '카페',
    '모텔',
    '호텔',
    '편의점',
    '병원',
    '약국',
    '부동산',
    '주유소',
    '세차',
    '노래방',
  ];
  if (excludedKeywords.some((kw) => combined.includes(kw))) {
    return false;
  }
  const allowedKeywords = [
    '방파제',
    '낚시',
    '부두',
    '항',
    '포구',
    '선착장',
    '수변',
    '해변',
    '해수욕장',
    '공원',
    '유원지',
    '호수',
    '저수지',
    '하천',
    '방조제',
    '갯바위',
    '데크',
  ];
  return allowedKeywords.some((kw) => combined.includes(kw));
}

export function assessSpotForBeginners(
  name: string,
  curatedSpot?: FishingSpot
): {
  isBeginnerSafe: boolean;
  safetyLevel: '매우 안전' | '보통' | '주의 필요';
  safetyReason: string;
  isParkFallback: boolean;
} {
  const lower = name.toLowerCase();
  if (lower.includes('테트라포드') || lower.includes('갯바위') || lower.includes('절벽')) {
    return {
      isBeginnerSafe: false,
      safetyLevel: '주의 필요',
      safetyReason: '발판이 미끄럽고 추락 위험이 있어 초보자 단독 진입을 권장하지 않습니다.',
      isParkFallback: false,
    };
  }
  const isPark =
    lower.includes('공원') ||
    lower.includes('수변') ||
    lower.includes('친수') ||
    lower.includes('유원지');
  if (
    isPark ||
    lower.includes('낚시공원') ||
    lower.includes('데크') ||
    curatedSpot?.difficulty === '초급'
  ) {
    return {
      isBeginnerSafe: true,
      safetyLevel: '매우 안전',
      safetyReason: isPark
        ? '보행로·난간·편의시설이 정비된 인근 공원/수변 구역입니다 (방문 전 허용 구역 확인).'
        : '초보자 접근성이 좋고 난간·평지 등 안전 여건이 양호한 생활낚시 구역입니다.',
      isParkFallback: isPark && !lower.includes('낚시') && !curatedSpot,
    };
  }
  return {
    isBeginnerSafe: true,
    safetyLevel: '보통',
    safetyReason: '구명조끼 착용 및 내항 안전 구간 이용을 권장합니다.',
    isParkFallback: false,
  };
}

export function formatDistanceLabel(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.max(50, Math.round(distanceKm * 1000))}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
}

export function filterAndRankNearbySpots(
  candidates: NearbyPlaceCandidate[],
  origin: LatLng,
  maxStraightKm: number = MAX_DRIVING_STRAIGHT_KM,
  excludeParks: boolean = false,
  maxDrivingMinutes: number = MAX_DRIVING_MINUTES
): RecommendedNearbySpot[] {
  const dedup = new Map<string, RecommendedNearbySpot>();

  for (const cand of candidates) {
    if (!Number.isFinite(cand.lat) || !Number.isFinite(cand.lng)) continue;
    const distanceKm = calculateDistanceKm(origin, { lat: cand.lat, lng: cand.lng });
    if (distanceKm > maxStraightKm) continue;

    const estMinutes =
      typeof cand.drivingMinutes === 'number' && Number.isFinite(cand.drivingMinutes)
        ? cand.drivingMinutes
        : Math.max(3, Math.round((distanceKm / 42) * 60 + 5));
    const estDrivingKm =
      typeof cand.drivingDistanceKm === 'number' && Number.isFinite(cand.drivingDistanceKm)
        ? cand.drivingDistanceKm
        : Number((distanceKm * 1.25).toFixed(1));

    if (estMinutes > maxDrivingMinutes) continue;

    const safety = assessSpotForBeginners(cand.name, cand.curatedSpot);
    if (excludeParks && safety.isParkFallback) continue;

    const key = `${cand.name.replace(/\s+/g, '')}_${cand.lat.toFixed(2)}_${cand.lng.toFixed(2)}`;
    const existing = dedup.get(key);
    const nextItem: RecommendedNearbySpot = {
      id: cand.id,
      name: cand.name,
      address: cand.address || '',
      lat: cand.lat,
      lng: cand.lng,
      distanceKm,
      drivingMinutes: estMinutes,
      drivingDistanceKm: estDrivingKm,
      source: cand.source,
      categoryLabel: cand.categoryLabel || (cand.curatedSpot ? '검증 포인트' : safety.isParkFallback ? '주변 공원·수변' : '연안 포인트'),
      isBeginnerSafe: safety.isBeginnerSafe,
      safetyLevel: safety.safetyLevel,
      safetyReason: safety.safetyReason,
      isParkFallback: safety.isParkFallback,
      curatedSpot: cand.curatedSpot,
    };

    if (!existing || (cand.source === 'curated' && existing.source !== 'curated')) {
      dedup.set(key, nextItem);
    }
  }

  return Array.from(dedup.values())
    .sort((a, b) => {
      const score = (s: RecommendedNearbySpot) =>
        (s.curatedSpot ? 100 : 0) +
        (!s.isParkFallback ? 40 : 0) +
        (s.isBeginnerSafe ? 25 : -20) -
        s.drivingMinutes * 0.8;
      return score(b) - score(a);
    })
    .slice(0, 12);
}
