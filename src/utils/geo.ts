export interface LatLng {
  lat: number;
  lng: number;
}

export type SeaRegion = '동해' | '서해' | '남해' | '제주';
export type LocationSource = 'default' | 'device-ip' | 'gps' | 'map-click' | 'spot';

export interface DetailedAddressInfo {
  formattedAddress: string;
  shortLabel: string;
  province?: string;
  cityOrCounty?: string;
  districtOrTown?: string;
  roadAddress?: string;
  poiName?: string;
  postcode?: string;
}

export interface LiveGpsMetrics {
  accuracyM: number | null;
  speedMs: number | null;
  headingDeg: number | null;
  updatedAtMs: number;
}

export const DEFAULT_KOREA_CENTER: LatLng = { lat: 35.1587, lng: 129.1704 };

export function calculateDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function findNearestFishingSpot<T extends { lat: number; lng: number }>(
  coords: LatLng,
  spots: T[]
): { spot: T; distanceKm: number } | null {
  if (!Array.isArray(spots) || spots.length === 0) return null;
  let bestSpot = spots[0];
  let bestDist = calculateDistanceKm(coords, bestSpot);
  for (let i = 1; i < spots.length; i++) {
    const d = calculateDistanceKm(coords, spots[i]);
    if (d < bestDist) {
      bestDist = d;
      bestSpot = spots[i];
    }
  }
  return { spot: bestSpot, distanceKm: bestDist };
}

export function inferKoreaSeaRegion(coords: LatLng): SeaRegion {
  if (coords.lat <= 33.9) return '제주';
  if (coords.lat < 35.35 && coords.lng >= 126.2 && coords.lng <= 129.35) return '남해';
  if (coords.lng >= 128.45 && coords.lat >= 35.25) return '동해';
  if (coords.lng < 127.1) return '서해';
  if (coords.lat >= 36.2) return '동해';
  return '남해';
}

export function isInKoreaBounds(coords: LatLng): boolean {
  return coords.lat >= 32.8 && coords.lat <= 38.9 && coords.lng >= 124.5 && coords.lng <= 132.1;
}

export function isBrowserInKoreaTimezone(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz === 'Asia/Seoul' || tz === 'ROK';
  } catch {
    return false;
  }
}

function isPrivateOrLocalIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '').trim();
  if (!clean) return true;
  if (
    clean === '::1' ||
    clean === 'localhost' ||
    clean.startsWith('127.') ||
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    clean.startsWith('169.254.') ||
    clean.startsWith('fc') ||
    clean.startsWith('fd') ||
    clean.startsWith('fe80:')
  ) {
    return true;
  }
  const match172 = clean.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function extractClientIpFromHeader(
  headerValue: string | string[] | undefined,
  remoteAddress?: string
): string | null {
  const rawList: string[] = [];
  if (Array.isArray(headerValue)) {
    for (const v of headerValue) {
      if (typeof v === 'string') rawList.push(...v.split(','));
    }
  } else if (typeof headerValue === 'string') {
    rawList.push(...headerValue.split(','));
  }
  if (typeof remoteAddress === 'string') {
    rawList.push(remoteAddress);
  }

  for (const candidate of rawList) {
    const cleaned = candidate.trim().replace(/^::ffff:/i, '');
    if (cleaned && !isPrivateOrLocalIp(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

export function shouldApplyAutoDeviceLocation(
  currentSource: LocationSource,
  incomingSource: 'device-ip' | 'gps',
  force: boolean
): boolean {
  if (force) return true;
  if (currentSource === 'map-click' || currentSource === 'spot') return false;
  if (currentSource === 'gps' && incomingSource === 'device-ip') return false;
  return true;
}

export function shouldRefreshLocationData(
  lastCoords: LatLng | null,
  nextCoords: LatLng,
  lastUpdatedAtMs: number,
  nowMs: number,
  minDistanceKm: number,
  minIntervalMs: number
): boolean {
  if (!lastCoords) return true;
  if (nowMs - lastUpdatedAtMs < minIntervalMs) {
    return calculateDistanceKm(lastCoords, nextCoords) >= minDistanceKm * 2;
  }
  return calculateDistanceKm(lastCoords, nextCoords) >= minDistanceKm;
}

export function shouldAcceptGpsReading(
  lastCoords: LatLng | null,
  lastAccuracyM: number | null,
  lastUpdatedAtMs: number,
  nextCoords: LatLng,
  nextAccuracyM: number | null,
  nowMs: number
): boolean {
  if (!lastCoords) return true;
  const distM = calculateDistanceKm(lastCoords, nextCoords) * 1000;
  const elapsedMs = nowMs - lastUpdatedAtMs;

  if (
    lastAccuracyM !== null &&
    nextAccuracyM !== null &&
    lastAccuracyM <= 80 &&
    nextAccuracyM > 800 &&
    elapsedMs < 30000
  ) {
    return false;
  }

  if (
    lastAccuracyM !== null &&
    nextAccuracyM !== null &&
    nextAccuracyM <= lastAccuracyM * 0.65
  ) {
    return true;
  }

  if (distM >= 15) return true;
  return elapsedMs >= 10000;
}

export function formatDeviceLocationLabel(payload: {
  city?: string;
  region?: string;
  district?: string;
  formattedAddress?: string;
  shortLabel?: string;
}): { label: string; address: string } {
  const short =
    payload.shortLabel ||
    [payload.region, payload.city, payload.district].filter(Boolean).slice(0, 2).join(' ') ||
    '접속 기기 연안';
  const addr =
    payload.formattedAddress ||
    [payload.region, payload.city, payload.district].filter(Boolean).join(' ') ||
    short;
  return {
    label: `${short} (접속 기기)`,
    address: addr,
  };
}

export function formatSpeedKmh(speedMs: number | null | undefined): string {
  if (typeof speedMs !== 'number' || !Number.isFinite(speedMs) || speedMs < 0.3) {
    return '정지/보행 대기';
  }
  return `${(speedMs * 3.6).toFixed(1)} km/h`;
}

export function formatAccuracyLabel(accuracyM: number | null | undefined): string {
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM)) {
    return '측정 중';
  }
  if (accuracyM >= 1000) {
    return `약 ${(accuracyM / 1000).toFixed(1)}km`;
  }
  return `±${Math.round(accuracyM)}m`;
}

export function getAccuracyQualityInfo(accuracyM: number | null | undefined): {
  tier: 'high' | 'medium' | 'low';
  label: string;
} {
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM)) {
    return { tier: 'medium', label: '위치 확인 중' };
  }
  if (accuracyM <= 40) {
    return { tier: 'high', label: `초정밀 GPS (±${Math.round(accuracyM)}m)` };
  }
  if (accuracyM <= 200) {
    return { tier: 'medium', label: `표준 GPS (±${Math.round(accuracyM)}m)` };
  }
  return { tier: 'low', label: `광역 네트워크 위치 (${formatAccuracyLabel(accuracyM)})` };
}

export function buildDetailedKoreanAddress(
  addrObj: Record<string, any> | null | undefined,
  displayName: string = '',
  poiName: string = ''
): DetailedAddressInfo {
  const a = addrObj || {};
  const province = a.province || a.state || a.city || '';
  const cityOrCounty = a.city && a.city !== province ? a.city : a.county || '';
  const districtOrTown =
    a.borough || a.city_district || a.suburb || a.town || a.village || a.neighbourhood || '';
  const roadPart = [a.road, a.house_number].filter(Boolean).join(' ');

  const ordered = [province, cityOrCounty, districtOrTown, roadPart].filter(
    (part, idx, arr) => Boolean(part) && arr.indexOf(part) === idx
  );
  const formattedAddress =
    ordered.length > 0 ? ordered.join(' ') : displayName.split(',').slice(0, 3).reverse().join(' ').trim();
  const shortParts = [cityOrCounty || province, districtOrTown || poiName].filter(Boolean);
  const shortLabel =
    shortParts.length > 0 ? shortParts.join(' ') : formattedAddress.split(' ').slice(0, 2).join(' ');

  return {
    formattedAddress: formattedAddress || displayName,
    shortLabel: shortLabel || poiName || '대한민국',
    province: province || undefined,
    cityOrCounty: cityOrCounty || undefined,
    districtOrTown: districtOrTown || undefined,
    roadAddress: roadPart || undefined,
    poiName: poiName || undefined,
    postcode: typeof a.postcode === 'string' ? a.postcode : undefined,
  };
}
