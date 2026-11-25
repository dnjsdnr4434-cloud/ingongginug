export interface MarineHourlyPoint {
  time: string;
  hourLabel: string;
  temperatureC: number;
  weatherCode: number;
  windSpeedMs: number;
  windGustsMs: number | null;
  windDirectionDeg: number;
  precipitationProb: number | null;
  waveHeightM: number | null;
  seaSurfaceTempC: number | null;
}

export interface FishingWeatherData {
  temperatureC: number;
  weatherCode: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  windGustsMs?: number | null;
  precipitationMm: number;
  precipitationProb?: number | null;
  waveHeightM: number | null;
  wavePeriodSec?: number | null;
  waveDirectionDeg?: number | null;
  seaSurfaceTempC?: number | null;
  isLive: boolean;
  observedAt?: string;
  observedAtKst?: string;
  kstHour?: number;
  modelLabel?: string;
  marineReferenceLabel?: string;
  hourlySeries?: MarineHourlyPoint[];
}

export interface BeginnerFishingRating {
  stars: number; // 1.0 to 5.0 in 0.5 increments
  label: string;
  summary: string;
  weatherText: string;
  windDirectionText: string;
  tone: 'excellent' | 'good' | 'moderate' | 'caution' | 'danger';
}

export interface SeaTemperatureAssessment {
  zoneLabel: string;
  targetSpeciesHint: string;
  tone: 'cold' | 'cool' | 'optimal' | 'warm' | 'unknown';
  percentScale: number; // 0..100 across 4°C..30°C
}

export interface GaugeLevelAssessment {
  label: string;
  advice: string;
  tone: 'calm' | 'moderate' | 'caution' | 'danger' | 'unknown';
  percentScale: number; // 0..100
}

export interface ChartSvgPoint {
  index: number;
  x: number;
  y: number;
  value: number;
}

export function describeWeatherCode(code: number): string {
  if (code === 0) return '맑음';
  if (code === 1 || code === 2) return '구름 조금';
  if (code === 3) return '흐림';
  if (code === 45 || code === 48) return '안개';
  if (code >= 51 && code <= 57) return '이슬비';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return '비';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '눈';
  if (code >= 95) return '뇌우 · 돌풍';
  return '구름 많음';
}

export function describeWindDirection(deg: number): string {
  const dirs = ['북풍', '북동풍', '동풍', '남동풍', '남풍', '남서풍', '서풍', '북서풍'];
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return dirs[idx];
}

export function formatKstHourLabel(isoTime: string): string {
  const match = isoTime.match(/T(\d{2}):/);
  if (match) {
    return `${Number(match[1])}시`;
  }
  return isoTime.slice(0, 5) || '--시';
}

export function assessSeaTemperature(tempC: number | null | undefined): SeaTemperatureAssessment {
  if (tempC === null || tempC === undefined || !Number.isFinite(tempC)) {
    return {
      zoneLabel: '연안 수온 관측 없음',
      targetSpeciesHint: '내륙 좌표이거나 표층 수온 데이터가 제공되지 않는 해역입니다',
      tone: 'unknown',
      percentScale: 0,
    };
  }

  const percentScale = Math.max(0, Math.min(100, ((tempC - 4) / (30 - 4)) * 100));

  if (tempC < 10) {
    return {
      zoneLabel: '저수온기 (활성 저하)',
      targetSpeciesHint: '우럭 · 볼락 · 도다리 등 바닥층 어종 위주, 느린 액션 권장',
      tone: 'cold',
      percentScale,
    };
  }
  if (tempC < 15) {
    return {
      zoneLabel: '선선한 적온 (초겨울·봄)',
      targetSpeciesHint: '감성돔 · 우럭 · 노래미 · 학공치 입질 활발',
      tone: 'cool',
      percentScale,
    };
  }
  if (tempC <= 23) {
    return {
      zoneLabel: '황금 수온대 (최적 활성)',
      targetSpeciesHint: '참돔 · 감성돔 · 고등어 · 전갱이 · 무늬오징어 등 전 어종 호조',
      tone: 'optimal',
      percentScale,
    };
  }
  return {
    zoneLabel: '고수온기 (심층 이동)',
    targetSpeciesHint: '새벽·야간 및 수심 깊은 곳 위주 공략, 벵에돔·전갱이·갈치',
    tone: 'warm',
    percentScale,
  };
}

export function assessWindLevel(
  windMs: number,
  gustMs?: number | null
): GaugeLevelAssessment {
  const effective = Math.max(0, Number.isFinite(windMs) ? windMs : 0);
  const percentScale = Math.max(0, Math.min(100, (effective / 15) * 100));
  const hasHighGust = typeof gustMs === 'number' && Number.isFinite(gustMs) && gustMs >= 12;

  if (effective < 3.5 && !hasHighGust) {
    return {
      label: '잔잔함',
      advice: '찌·루어 캐스팅이 정확해 초보자도 편안한 풍속입니다',
      tone: 'calm',
      percentScale,
    };
  }
  if (effective < 6.0 && !hasHighGust) {
    return {
      label: '약풍',
      advice: '가벼운 너울이 생길 수 있으나 원투·민장대 모두 무난합니다',
      tone: 'calm',
      percentScale,
    };
  }
  if (effective < 9.0) {
    return {
      label: '보통~강한 바람',
      advice: '무거운 봉돌·지그헤드를 쓰고 바람을 등지는 내항을 고르세요',
      tone: 'moderate',
      percentScale,
    };
  }
  if (effective < 12.0) {
    return {
      label: '강풍 주의',
      advice: '원줄 날림이 심해 테트라포드·방파제 외항 진입을 피하세요',
      tone: 'caution',
      percentScale,
    };
  }
  return {
    label: '돌풍·강풍 위험',
    advice: '연안 출조를 중단하고 안전한 실내로 이동하세요',
    tone: 'danger',
    percentScale,
  };
}

export function assessWaveLevel(waveM: number | null | undefined): GaugeLevelAssessment {
  if (waveM === null || waveM === undefined || !Number.isFinite(waveM)) {
    return {
      label: '관측 없음',
      advice: '내륙 지점이거나 해상 파고 격자 범위 밖입니다',
      tone: 'unknown',
      percentScale: 0,
    };
  }

  const safeWave = Math.max(0, waveM);
  const percentScale = Math.max(0, Math.min(100, (safeWave / 2.5) * 100));

  if (safeWave < 0.5) {
    return {
      label: '장판·잔잔함',
      advice: '너울이 거의 없어 가족·초보 방파제 낚시에 최적입니다',
      tone: 'calm',
      percentScale,
    };
  }
  if (safeWave < 1.0) {
    return {
      label: '잔물결',
      advice: '적당한 물 흐름이 형성되어 입질이 살아나기 좋은 파고입니다',
      tone: 'calm',
      percentScale,
    };
  }
  if (safeWave < 1.5) {
    return {
      label: '약간 높음',
      advice: '방파제 외항 월파에 주의하고 난간 안쪽 포인트를 이용하세요',
      tone: 'moderate',
      percentScale,
    };
  }
  if (safeWave < 2.0) {
    return {
      label: '높은 파도',
      advice: '갯바위·낮은 방파제는 위험하니 출조를 자제하세요',
      tone: 'caution',
      percentScale,
    };
  }
  return {
    label: '풍랑 주의',
    advice: '해안 접근을 금지해야 하는 위험 파고입니다',
    tone: 'danger',
    percentScale,
  };
}

export function buildChartPoints(
  values: Array<number | null | undefined>,
  width: number,
  height: number,
  minVal: number,
  maxVal: number,
  padding: { top: number; right: number; bottom: number; left: number } = {
    top: 14,
    right: 16,
    bottom: 24,
    left: 34,
  }
): ChartSvgPoint[] {
  const count = values.length;
  if (count === 0) return [];

  const usableW = Math.max(1, width - padding.left - padding.right);
  const usableH = Math.max(1, height - padding.top - padding.bottom);
  const span = maxVal > minVal ? maxVal - minVal : 1;

  const points: ChartSvgPoint[] = [];
  for (let i = 0; i < count; i++) {
    const raw = values[i];
    if (raw === null || raw === undefined || !Number.isFinite(raw)) continue;
    const x =
      count === 1
        ? padding.left + usableW / 2
        : padding.left + (i / (count - 1)) * usableW;
    const ratio = Math.max(0, Math.min(1, (raw - minVal) / span));
    const y = padding.top + (1 - ratio) * usableH;
    points.push({
      index: i,
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      value: raw,
    });
  }
  return points;
}

export function createExampleHourlySeries(
  base: Pick<
    FishingWeatherData,
    'temperatureC' | 'weatherCode' | 'windSpeedMs' | 'windDirectionDeg' | 'waveHeightM' | 'seaSurfaceTempC'
  >,
  startHourKst: number = 9
): MarineHourlyPoint[] {
  const windOffsets = [-0.4, -0.2, 0, 0.3, 0.6, 0.8, 0.5, 0.2, -0.1, -0.3, -0.5, -0.4];
  const tempOffsets = [-1.2, -0.6, 0, 0.8, 1.4, 1.8, 1.5, 0.9, 0.2, -0.5, -1.0, -1.5];
  const waveOffsets = [-0.08, -0.05, 0, 0.06, 0.12, 0.14, 0.1, 0.05, 0, -0.04, -0.06, -0.05];

  return Array.from({ length: 12 }, (_, idx) => {
    const hour = (startHourKst + idx) % 24;
    const hourStr = String(hour).padStart(2, '0');
    const wind = Math.max(0.5, Number((base.windSpeedMs + windOffsets[idx]).toFixed(1)));
    const temp = Number((base.temperatureC + tempOffsets[idx]).toFixed(1));
    const wave =
      base.waveHeightM !== null
        ? Math.max(0.1, Number((base.waveHeightM + waveOffsets[idx]).toFixed(2)))
        : null;
    const sst =
      typeof base.seaSurfaceTempC === 'number'
        ? Number((base.seaSurfaceTempC + (idx >= 3 && idx <= 7 ? 0.2 : 0)).toFixed(1))
        : null;

    return {
      time: `2026-01-01T${hourStr}:00`,
      hourLabel: `${hour}시`,
      temperatureC: temp,
      weatherCode: base.weatherCode,
      windSpeedMs: wind,
      windGustsMs: Number((wind * 1.35).toFixed(1)),
      windDirectionDeg: (base.windDirectionDeg + idx * 5) % 360,
      precipitationProb: base.weatherCode >= 51 ? 60 : 10,
      waveHeightM: wave,
      seaSurfaceTempC: sst,
    };
  });
}

export function calculateBeginnerFishingRating(
  weather: FishingWeatherData
): BeginnerFishingRating {
  let score = 5.0;
  const reasons: string[] = [];

  // 1. Wind speed impact (beginners are vulnerable to strong gusts)
  if (weather.windSpeedMs >= 11) {
    score -= 3.2;
    reasons.push(`강풍(${weather.windSpeedMs.toFixed(1)}m/s)으로 채비 투척과 안전 확보가 어렵습니다`);
  } else if (weather.windSpeedMs >= 8) {
    score -= 2.0;
    reasons.push(`바람(${weather.windSpeedMs.toFixed(1)}m/s)이 강해 바람을 등지는 방파제 내항만 권장됩니다`);
  } else if (weather.windSpeedMs >= 5.5) {
    score -= 1.0;
    reasons.push(`약간의 바람(${weather.windSpeedMs.toFixed(1)}m/s)이 있어 무거운 봉돌 채비가 유리합니다`);
  } else {
    reasons.push(`바람(${weather.windSpeedMs.toFixed(1)}m/s)이 잔잔하고`);
  }

  // 2. Wave height impact (when marine data is available)
  if (weather.waveHeightM !== null && Number.isFinite(weather.waveHeightM)) {
    if (weather.waveHeightM >= 2.0) {
      score -= 3.0;
      reasons.push(`파고(${weather.waveHeightM.toFixed(1)}m)가 높아 출조를 피해야 합니다`);
    } else if (weather.waveHeightM >= 1.3) {
      score -= 1.6;
      reasons.push(`파도(${weather.waveHeightM.toFixed(1)}m)가 다소 높아 안전 난간이 있는 곳만 추천합니다`);
    } else if (weather.waveHeightM >= 0.9) {
      score -= 0.6;
    } else {
      reasons.push(`파고(${weather.waveHeightM.toFixed(1)}m)도 안정적입니다`);
    }
  }

  // 3. Weather code & precipitation impact
  const weatherText = describeWeatherCode(weather.weatherCode);
  if (weather.weatherCode >= 95) {
    score = 1.0;
    reasons.unshift('낙뢰·돌풍 위험이 있어 즉시 출조를 중단하세요');
  } else if (
    weather.precipitationMm >= 3 ||
    (weather.weatherCode >= 63 && weather.weatherCode <= 67) ||
    weather.weatherCode >= 81
  ) {
    score -= 1.8;
    reasons.push('비로 인해 발판이 미끄러우니 주의하세요');
  } else if (weather.precipitationMm > 0 || weather.weatherCode >= 51) {
    score -= 0.9;
    reasons.push('약한 강수가 있어 미끄럼 방지 신발과 우의가 필요합니다');
  } else if (weather.weatherCode === 45 || weather.weatherCode === 48) {
    score -= 0.8;
    reasons.push('해무로 시야가 좁으니 안전 거리 유지가 필요합니다');
  }

  // 4. Temperature comfort for beginners
  if (weather.temperatureC <= 1 || weather.temperatureC >= 34) {
    score -= 0.5;
  }

  // Clamp 1.0..5.0 and round to nearest 0.5 star
  const clamped = Math.max(1.0, Math.min(5.0, score));
  const stars = Math.round(clamped * 2) / 2;

  let label = '매우 추천 · 초보자 출조 최적';
  let tone: BeginnerFishingRating['tone'] = 'excellent';

  if (stars >= 4.5) {
    label = '매우 추천 · 초보자 출조 최적';
    tone = 'excellent';
  } else if (stars >= 3.5) {
    label = '추천 · 무난한 바다낚시 날씨';
    tone = 'good';
  } else if (stars >= 2.5) {
    label = '보통 · 평탄한 방파제 내항 권장';
    tone = 'moderate';
  } else if (stars >= 1.5) {
    label = '주의 · 안전시설 갖춘 포인트만';
    tone = 'caution';
  } else {
    label = '출조 자제 · 악천후 위험';
    tone = 'danger';
  }

  return {
    stars,
    label,
    summary: reasons.join(' · '),
    weatherText,
    windDirectionText: describeWindDirection(weather.windDirectionDeg),
    tone,
  };
}

export interface KoreaWeatherStation {
  name: string;
  lat: number;
  lng: number;
  isCoastal: boolean;
  baseWaveM: number | null;
}

export const KOREA_WEATHER_STATIONS: KoreaWeatherStation[] = [
  { name: '서울', lat: 37.5665, lng: 126.978, isCoastal: false, baseWaveM: null },
  { name: '인천', lat: 37.4563, lng: 126.7052, isCoastal: true, baseWaveM: 0.4 },
  { name: '수원', lat: 37.2636, lng: 127.0286, isCoastal: false, baseWaveM: null },
  { name: '춘천', lat: 37.8813, lng: 127.7298, isCoastal: false, baseWaveM: null },
  { name: '속초', lat: 38.2045, lng: 128.5912, isCoastal: true, baseWaveM: 0.6 },
  { name: '강릉', lat: 37.7519, lng: 128.8761, isCoastal: true, baseWaveM: 0.6 },
  { name: '태안', lat: 36.7456, lng: 126.2981, isCoastal: true, baseWaveM: 0.5 },
  { name: '보령', lat: 36.3335, lng: 126.6128, isCoastal: true, baseWaveM: 0.5 },
  { name: '대전', lat: 36.3504, lng: 127.3845, isCoastal: false, baseWaveM: null },
  { name: '청주', lat: 36.6424, lng: 127.489, isCoastal: false, baseWaveM: null },
  { name: '군산', lat: 35.9677, lng: 126.7366, isCoastal: true, baseWaveM: 0.5 },
  { name: '전주', lat: 35.8242, lng: 127.148, isCoastal: false, baseWaveM: null },
  { name: '광주', lat: 35.1595, lng: 126.8526, isCoastal: false, baseWaveM: null },
  { name: '목포', lat: 34.8118, lng: 126.3922, isCoastal: true, baseWaveM: 0.5 },
  { name: '여수', lat: 34.7604, lng: 127.6622, isCoastal: true, baseWaveM: 0.5 },
  { name: '통영', lat: 34.8544, lng: 128.4331, isCoastal: true, baseWaveM: 0.4 },
  { name: '창원', lat: 35.2279, lng: 128.6811, isCoastal: true, baseWaveM: 0.3 },
  { name: '부산', lat: 35.1587, lng: 129.1604, isCoastal: true, baseWaveM: 0.5 },
  { name: '울산', lat: 35.5384, lng: 129.3114, isCoastal: true, baseWaveM: 0.6 },
  { name: '포항', lat: 36.019, lng: 129.3435, isCoastal: true, baseWaveM: 0.6 },
  { name: '대구', lat: 35.8714, lng: 128.6014, isCoastal: false, baseWaveM: null },
  { name: '제주', lat: 33.4996, lng: 126.5312, isCoastal: true, baseWaveM: 0.7 },
  { name: '서귀포', lat: 33.2541, lng: 126.56, isCoastal: true, baseWaveM: 0.7 },
];

function stationDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function getSortedNearestWeatherStations(coords: {
  lat: number;
  lng: number;
}): Array<KoreaWeatherStation & { distanceKm: number }> {
  return KOREA_WEATHER_STATIONS.map((station) => ({
    ...station,
    distanceKm: stationDistanceKm(coords, station),
  })).sort((a, b) => a.distanceKm - b.distanceKm);
}

export function buildNearestStationFallbackWeather(
  coords: { lat: number; lng: number },
  nowDate: Date = new Date()
): FishingWeatherData {
  const sorted = getSortedNearestWeatherStations(coords);
  const nearest = sorted[0];
  const nearestCoastal = sorted.find((s) => s.isCoastal) ?? nearest;

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(nowDate)) {
    parts[p.type] = p.value;
  }
  const month = Number(parts.month || '5');
  const hour = Number(parts.hour === '24' ? '0' : parts.hour || '12');
  const hourStr = String(hour).padStart(2, '0');
  const displayKst = `${parts.year || '2026'}년 ${month}월 ${Number(parts.day || '1')}일 ${hourStr}:${parts.minute || '00'} KST`;

  // Seasonal baseline by KST month (1..12) + gentle latitude/diurnal curve
  const monthlyMeanTempC = [1.5, 3.5, 8.5, 14.0, 18.8, 22.8, 26.2, 27.2, 22.8, 16.8, 10.2, 3.8];
  const monthlySstC = [9.5, 9.0, 10.5, 13.0, 16.0, 19.5, 23.0, 25.0, 23.0, 19.5, 15.5, 11.8];
  const mIdx = Math.max(0, Math.min(11, month - 1));
  const latBonus = (36.5 - nearest.lat) * 0.9;
  const diurnalOffset = Math.sin(((hour - 9) / 24) * 2 * Math.PI) * 2.8;
  const temperatureC = Number((monthlyMeanTempC[mIdx] + latBonus + diurnalOffset).toFixed(1));
  const seaSurfaceTempC = Number((monthlySstC[mIdx] + (35.5 - nearestCoastal.lat) * 0.7).toFixed(1));

  const windSpeedMs = nearest.isCoastal ? 3.4 : 2.6;
  const windDirectionDeg = month >= 11 || month <= 3 ? 315 : month >= 6 && month <= 8 ? 180 : 225;
  const waveHeightM = nearestCoastal.baseWaveM ?? 0.5;
  const distKmRounded = Math.max(1, Math.round(nearest.distanceKm));
  const coastalDistRounded = Math.max(1, Math.round(nearestCoastal.distanceKm));

  const base = {
    temperatureC,
    weatherCode: 1,
    windSpeedMs,
    windDirectionDeg,
    windGustsMs: Number((windSpeedMs * 1.35).toFixed(1)),
    precipitationMm: 0,
    precipitationProb: 10,
    waveHeightM,
    wavePeriodSec: 4.5,
    waveDirectionDeg: 180,
    seaSurfaceTempC,
    isLive: false,
    observedAt: `${parts.year || '2026'}-${parts.month || '05'}-${parts.day || '01'}T${hourStr}:00`,
    observedAtKst: displayKst,
    kstHour: hour,
    modelLabel:
      distKmRounded <= 5
        ? `${nearest.name} 권역 KST 기상 기준`
        : `인근 ${nearest.name} (약 ${distKmRounded}km) KST 기상 기준`,
    marineReferenceLabel:
      nearest.distanceKm <= 8 && nearest.isCoastal
        ? '현위치 연안'
        : `가까운 ${nearestCoastal.name} 해역 (약 ${coastalDistRounded}km)`,
  };

  return {
    ...base,
    hourlySeries: createExampleHourlySeries(base, hour),
  };
}

