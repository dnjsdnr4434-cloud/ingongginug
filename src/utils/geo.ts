import type { FishingSpot } from '../data/fishingData';

export interface LatLng {
  lat: number;
  lng: number;
}

export type SeaRegion = '동해' | '서해' | '남해' | '제주';

export type LocationSource = 'gps' | 'device-ip' | 'spot' | 'map-click' | 'default';

export const DEFAULT_KOREA_CENTER: LatLng = {
  lat: 35.1587, // Busan Haeundae coast fallback when all device location lookups fail
  lng: 129.1604,
};

/**
 * Checks whether an IP string is a public IPv4/IPv6 address suitable for IP geolocation.
 */
export function isPublicClientIp(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^::ffff:/i, '');
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return false;
  if (/^10\./.test(ip)) return false;
  if (/^192\.168\./.test(ip)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
  if (/^169\.254\./.test(ip)) return false;
  if (/^(fc|fd|fe80)/i.test(ip)) return false;
  return /^[0-9a-fA-F.:]+$/.test(ip);
}

/**
 * Extracts the first public client IP from X-Forwarded-For or socket address.
 */
export function extractClientIpFromHeader(
  forwardedFor: string | string[] | undefined,
  remoteAddr?: string
): string {
  const candidates: string[] = [];
  if (Array.isArray(forwardedFor)) {
    for (const entry of forwardedFor) {
      candidates.push(...entry.split(','));
    }
  } else if (typeof forwardedFor === 'string') {
    candidates.push(...forwardedFor.split(','));
  }
  if (remoteAddr) {
    candidates.push(remoteAddr);
  }

  for (const raw of candidates) {
    const cleaned = raw.trim().replace(/^::ffff:/i, '');
    if (isPublicClientIp(cleaned)) {
      return cleaned;
    }
  }
  return '';
}

/**
 * Determines whether an automatic device location update (GPS or Device IP) should apply
 * without overwriting explicit manual user map/spot selections.
 */
export function shouldApplyAutoDeviceLocation(
  currentSource: LocationSource,
  nextSource: 'gps' | 'device-ip',
  force: boolean = false
): boolean {
  if (force) return true;
  if (currentSource === 'spot' || currentSource === 'map-click') {
    return false;
  }
  if (currentSource === 'gps' && nextSource === 'device-ip') {
    return false;
  }
  return true;
}

export function formatDeviceLocationLabel(info: {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
}): { label: string; address: string } {
  const city = (info.city || '').trim();
  const region = (info.region || '').trim();
  const country = (info.country || '').trim();

  const primary = city || region || country || '접속 기기';
  const fullParts = [country, region !== city ? region : '', city].filter(Boolean);

  return {
    label: `${primary} (접속 기기 위치)`,
    address: fullParts.length > 0 ? fullParts.join(' ') : '접속 기기 네트워크 위치',
  };
}

/**
 * Haversine distance in kilometers between two coordinates.
 */
export function calculateDistanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Finds the closest fishing spot and its distance in km from a coordinate.
 */
export function findNearestFishingSpot(
  coords: LatLng,
  spots: FishingSpot[]
): { spot: FishingSpot; distanceKm: number } | null {
  if (spots.length === 0) return null;
  let bestSpot = spots[0];
  let bestDist = calculateDistanceKm(coords, { lat: spots[0].lat, lng: spots[0].lng });

  for (let i = 1; i < spots.length; i++) {
    const dist = calculateDistanceKm(coords, { lat: spots[i].lat, lng: spots[i].lng });
    if (dist < bestDist) {
      bestDist = dist;
      bestSpot = spots[i];
    }
  }

  return { spot: bestSpot, distanceKm: Math.round(bestDist * 10) / 10 };
}

/**
 * Infers the nearest Korean sea region (동해/서해/남해/제주) from coordinates.
 */
export function inferKoreaSeaRegion(coords: LatLng): SeaRegion {
  if (coords.lat < 33.85 && coords.lng >= 125.8 && coords.lng <= 127.3) {
    return '제주';
  }
  if (coords.lat < 35.25 && coords.lng < 129.35) {
    return '남해';
  }
  if (coords.lng >= 128.1) {
    return '동해';
  }
  return '서해';
}

export function isInKoreaBounds(coords: LatLng): boolean {
  return (
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= 32.5 &&
    coords.lat <= 39.2 &&
    coords.lng >= 124.0 &&
    coords.lng <= 132.0
  );
}

export function isBrowserInKoreaTimezone(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Seoul';
  } catch {
    return false;
  }
}

export interface LiveGpsMetrics {
  accuracyM: number | null;
  speedMs: number | null;
  headingDeg: number | null;
  updatedAtMs: number;
}

export interface DetailedAddressInfo {
  formattedAddress: string;
  shortLabel: string;
  sido: string;
  sigungu: string;
  dong: string;
  road: string;
  postcode: string;
  poiName: string;
}

export function formatSpeedKmh(speedMs?: number | null): string {
  if (typeof speedMs !== 'number' || !Number.isFinite(speedMs) || speedMs < 0.3) {
    return '정지 상태';
  }
  const kmh = Math.round(speedMs * 3.6 * 10) / 10;
  return `${kmh} km/h 이동 중`;
}

export function formatAccuracyLabel(accuracyM?: number | null): string {
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM <= 0) {
    return '정밀도 확인 중';
  }
  if (accuracyM >= 1000) {
    return `±${(accuracyM / 1000).toFixed(1)}km`;
  }
  return `±${Math.round(accuracyM)}m`;
}

export function shouldRefreshLocationData(
  prevCoords: LatLng | null,
  nextCoords: LatLng,
  prevUpdatedMs: number,
  nowMs: number,
  minDistanceKm: number,
  minIntervalMs: number
): boolean {
  if (!prevCoords || prevUpdatedMs <= 0) return true;
  if (nowMs - prevUpdatedMs < minIntervalMs) return false;
  return calculateDistanceKm(prevCoords, nextCoords) >= minDistanceKm;
}

/**
 * Filters noisy GPS readings and prioritizes higher-accuracy fixes.
 * - Rejects NaN or (0,0) null-island coordinates.
 * - Always accepts an upgrade when accuracy improves meaningfully.
 * - Rejects sudden coarse cell-tower spikes when a recent accurate GPS lock already exists.
 */
export function shouldAcceptGpsReading(
  prevCoords: LatLng | null,
  prevAccuracyM: number | null,
  prevUpdatedMs: number,
  nextCoords: LatLng,
  nextAccuracyM: number | null,
  nextUpdatedMs: number
): boolean {
  if (
    !Number.isFinite(nextCoords.lat) ||
    !Number.isFinite(nextCoords.lng) ||
    (Math.abs(nextCoords.lat) < 0.001 && Math.abs(nextCoords.lng) < 0.001)
  ) {
    return false;
  }
  if (!prevCoords || prevUpdatedMs <= 0) return true;

  const hasPrevAcc = typeof prevAccuracyM === 'number' && Number.isFinite(prevAccuracyM) && prevAccuracyM > 0;
  const hasNextAcc = typeof nextAccuracyM === 'number' && Number.isFinite(nextAccuracyM) && nextAccuracyM > 0;

  if (hasPrevAcc && hasNextAcc) {
    // Reject coarse cell-tower/IP jumps when we already have an accurate recent fix (< 60s old)
    const ageMs = Math.max(0, nextUpdatedMs - prevUpdatedMs);
    if (prevAccuracyM <= 80 && ageMs < 60000 && nextAccuracyM > Math.max(400, prevAccuracyM * 4)) {
      return false;
    }
    // Accept immediately if precision improved significantly
    if (nextAccuracyM <= prevAccuracyM * 0.75 || (prevAccuracyM > 150 && nextAccuracyM <= 120)) {
      return true;
    }
  }

  const movedMeters = calculateDistanceKm(prevCoords, nextCoords) * 1000;
  if (movedMeters >= 10) return true;
  if (hasNextAcc && nextAccuracyM <= 50) return true;
  return false;
}

export function getAccuracyQualityInfo(accuracyM?: number | null): {
  tier: 'high' | 'medium' | 'low';
  label: string;
} {
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM <= 0) {
    return { tier: 'low', label: '위치 정밀도 확인 중' };
  }
  if (accuracyM <= 30) {
    return { tier: 'high', label: `초정밀 GPS (±${Math.round(accuracyM)}m)` };
  }
  if (accuracyM <= 120) {
    return { tier: 'medium', label: `정밀 양호 (±${Math.round(accuracyM)}m)` };
  }
  return { tier: 'low', label: `대략적 위치 (${formatAccuracyLabel(accuracyM)})` };
}

export function buildDetailedKoreanAddress(
  rawAddress: Record<string, string | undefined> | undefined,
  displayName: string = '',
  fallbackName: string = ''
): DetailedAddressInfo {
  const addr = rawAddress || {};
  const sido = (addr.province || addr.state || addr.city || '').trim();
  const sigunguRaw = (
    addr.borough ||
    addr.county ||
    addr.city_district ||
    (addr.city && addr.city !== sido ? addr.city : '') ||
    addr.town ||
    ''
  ).trim();
  const sigungu = sigunguRaw && sigunguRaw !== sido ? sigunguRaw : '';
  const dong = (
    addr.quarter ||
    addr.neighbourhood ||
    addr.suburb ||
    addr.village ||
    addr.hamlet ||
    ''
  ).trim();
  const road = [addr.road, addr.house_number].filter(Boolean).join(' ').trim();
  const postcode = (addr.postcode || '').trim();
  const poiName = (
    fallbackName ||
    addr.leisure ||
    addr.natural ||
    addr.tourism ||
    addr.amenity ||
    addr.man_made ||
    addr.harbour ||
    ''
  ).trim();

  const orderedParts: string[] = [];
  for (const part of [sido, sigungu, dong, road]) {
    if (part && !orderedParts.includes(part)) {
      orderedParts.push(part);
    }
  }

  let formattedAddress = orderedParts.join(' ');
  if (poiName && !formattedAddress.includes(poiName)) {
    formattedAddress = formattedAddress ? `${formattedAddress} (${poiName})` : poiName;
  }
  if (!formattedAddress) {
    formattedAddress = displayName.trim();
  }

  const shortParts = [sigungu || sido, dong || poiName || road].filter(Boolean);
  const shortLabel =
    poiName && sigungu
      ? `${sigungu} ${poiName}`
      : shortParts.length > 0
      ? shortParts.join(' ')
      : formattedAddress || '현재 위치';

  return {
    formattedAddress,
    shortLabel,
    sido,
    sigungu,
    dong,
    road,
    postcode,
    poiName,
  };
}
