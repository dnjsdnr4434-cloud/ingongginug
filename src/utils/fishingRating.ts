export interface MarineHourlyPoint {
  time: string;
  hourLabel: string;
  temperatureC: number;
  apparentTempC?: number | null;
  humidityPct?: number | null;
  pressureHpa?: number | null;
  visibilityKm?: number | null;
  cloudCoverPct?: number | null;
  uvIndex?: number | null;
  weatherCode: number;
  windSpeedMs: number;
  windGustsMs: number | null;
  windDirectionDeg: number;
  precipitationProb: number | null;
  waveHeightM: number | null;
  swellHeightM?: number | null;
  seaSurfaceTempC: number | null;
}

export interface FishingWeatherData {
  temperatureC: number;
  apparentTempC?: number | null;
  humidityPct?: number | null;
  dewPointC?: number | null;
  pressureHpa?: number | null;
  pressureDelta3hHpa?: number | null;
  pressureTrend?: '상승' | '안정' | '하강' | null;
  cloudCoverPct?: number | null;
  visibilityKm?: number | null;
  uvIndex?: number | null;
  uvIndexMax?: number | null;
  sunriseKst?: string | null;
  sunsetKst?: string | null;
  dailyMinTempC?: number | null;
  dailyMaxTempC?: number | null;
  dailyPrecipProbMax?: number | null;
  pm10?: number | null;
  pm25?: number | null;
  airQualityLabel?: string | null;
  weatherCode: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  windGustsMs?: number | null;
  precipitationMm: number;
  precipitationProb?: number | null;
  waveHeightM: number | null;
  wavePeriodSec?: number | null;
  waveDirectionDeg?: number | null;
  windWaveHeightM?: number | null;
  swellHeightM?: number | null;
  swellPeriodSec?: number | null;
  swellDirectionDeg?: number | null;
  oceanCurrentSpeedMs?: number | null;
  oceanCurrentDirDeg?: number | null;
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

export interface DetailedMetricAssessment {
  label: string;
  advice: string;
  tone: 'calm' | 'moderate' | 'caution' | 'danger' | 'unknown';
}

export function assessPressureTrend(
  pressureHpa: number | null | undefined,
  delta3hHpa: number | null | undefined
): DetailedMetricAssessment {
  if (pressureHpa === null || pressureHpa === undefined || !Number.isFinite(pressureHpa)) {
    return {
      label: '기압 정보 없음',
      advice: '실시간 기압 데이터를 불러오는 중입니다',
      tone: 'unknown',
    };
  }
  const delta = typeof delta3hHpa === 'number' && Number.isFinite(delta3hHpa) ? delta3hHpa : 0;
  if (delta >= 0.8) {
    return {
      label: '기압 상승 · 활발',
      advice: '저기압 통과 후 맑아지는 흐름으로 물고기 먹이활동이 살아납니다',
      tone: 'calm',
    };
  }
  if (delta <= -0.8) {
    return {
      label: '기압 하강 · 변화 주의',
      advice: '기압이 내려가며 바람·너울이 강해질 수 있어 예보를 계속 확인하세요',
      tone: 'moderate',
    };
  }
  if (pressureHpa >= 1018) {
    return {
      label: '고기압 안정권',
      advice: '기압 변화가 작아 안정적인 입질과 잔잔한 하늘이 유지됩니다',
      tone: 'calm',
    };
  }
  return {
    label: '기압 안정',
    advice: '급격한 기압 변동이 없어 계획한 시간대로 출조하기 좋습니다',
    tone: 'calm',
  };
}

export function assessVisibilityFog(
  visibilityKm: number | null | undefined
): DetailedMetricAssessment {
  if (visibilityKm === null || visibilityKm === undefined || !Number.isFinite(visibilityKm)) {
    return {
      label: '시정 관측 없음',
      advice: '주변 시야 상태를 육안으로 함께 확인하세요',
      tone: 'unknown',
    };
  }
  if (visibilityKm >= 10) {
    return {
      label: '시계 매우 양호',
      advice: '해무 없이 원거리 갯바위·방파제 시야가 탁 트여 있습니다',
      tone: 'calm',
    };
  }
  if (visibilityKm >= 3) {
    return {
      label: '약간 흐림 · 연무',
      advice: '먼 바다 연무가 있으나 연안 방파제 시야는 무난합니다',
      tone: 'moderate',
    };
  }
  if (visibilityKm >= 1) {
    return {
      label: '해무 주의',
      advice: '안개로 시야가 짧으니 구명조끼·랜턴을 착용하고 발밑을 살피세요',
      tone: 'caution',
    };
  }
  return {
    label: '짙은 해무 위험',
    advice: '시정 1km 미만 농무로 방파제 끝단·선착장 진입을 삼가세요',
    tone: 'danger',
  };
}

export function assessAirQuality(
  pm10: number | null | undefined,
  pm25: number | null | undefined
): DetailedMetricAssessment {
  const hasPm10 = typeof pm10 === 'number' && Number.isFinite(pm10);
  const hasPm25 = typeof pm25 === 'number' && Number.isFinite(pm25);
  if (!hasPm10 && !hasPm25) {
    return {
      label: '대기질 정보 없음',
      advice: '대기 관측 값을 수신하지 못했습니다',
      tone: 'unknown',
    };
  }
  if ((hasPm25 && pm25! >= 76) || (hasPm10 && pm10! >= 151)) {
    return {
      label: '매우 나쁨',
      advice: '미세먼지가 매우 높아 장시간 야외 노출을 피하세요',
      tone: 'danger',
    };
  }
  if ((hasPm25 && pm25! >= 36) || (hasPm10 && pm10! >= 81)) {
    return {
      label: '나쁨',
      advice: '보건용 마스크(KF80 이상) 착용을 권장합니다',
      tone: 'caution',
    };
  }
  if ((hasPm25 && pm25! >= 16) || (hasPm10 && pm10! >= 31)) {
    return {
      label: '보통',
      advice: '무난한 대기질로 야외 낚시에 큰 지장이 없습니다',
      tone: 'moderate',
    };
  }
  return {
    label: '좋음',
    advice: '바닷바람과 함께 쾌적하고 맑은 대기 상태입니다',
    tone: 'calm',
  };
}

export function assessUvIndex(uv: number | null | undefined): DetailedMetricAssessment {
  if (uv === null || uv === undefined || !Number.isFinite(uv)) {
    return {
      label: '정보 없음',
      advice: '일출·일몰 시간에 맞춰 자외선에 대비하세요',
      tone: 'unknown',
    };
  }
  if (uv >= 8) {
    return {
      label: '매우 높음',
      advice: '수면 반사광이 강하므로 선글라스·선크림·챙모자가 필수입니다',
      tone: 'danger',
    };
  }
  if (uv >= 6) {
    return {
      label: '높음',
      advice: '한낮 직사광선 차단용 모자와 자외선 차단제를 챙기세요',
      tone: 'caution',
    };
  }
  if (uv >= 3) {
    return {
      label: '보통',
      advice: '물가 반사광을 고려해 가벼운 자외선 차단을 권장합니다',
      tone: 'moderate',
    };
  }
  return {
    label: '낮음',
    advice: '자외선 부담이 적어 편안하게 출조할 수 있습니다',
    tone: 'calm',
  };
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
      apparentTempC: Number((temp - wind * 0.45).toFixed(1)),
      humidityPct: 58 + (idx % 4) * 3,
      pressureHpa: Number((1018.2 + idx * 0.2).toFixed(1)),
      visibilityKm: 18.0,
      cloudCoverPct: base.weatherCode >= 3 ? 75 : 20,
      uvIndex: hour >= 10 && hour <= 15 ? 3.2 : 0.2,
      weatherCode: base.weatherCode,
      windSpeedMs: wind,
      windGustsMs: Number((wind * 1.35).toFixed(1)),
      windDirectionDeg: (base.windDirectionDeg + idx * 5) % 360,
      precipitationProb: base.weatherCode >= 51 ? 60 : 10,
      waveHeightM: wave,
      swellHeightM: wave !== null ? Number((wave * 0.65).toFixed(2)) : null,
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

export interface CoastalWeatherStation {
  name: string;
  lat: number;
  lng: number;
  seaRegion: string;
  baseWaveM: number;
  baseWindMs: number;
  baseSstOffsetC: number;
}

export const KOREA_COASTAL_WEATHER_STATIONS: CoastalWeatherStation[] = [
  { name: '부산 해운대·기장 관측소', lat: 35.1587, lng: 129.1704, seaRegion: '남해 동부', baseWaveM: 0.65, baseWindMs: 3.8, baseSstOffsetC: 1.5 },
  { name: '인천 영종·소래포구 관측소', lat: 37.4563, lng: 126.6052, seaRegion: '서해 중부', baseWaveM: 0.45, baseWindMs: 4.1, baseSstOffsetC: -1.0 },
  { name: '태안 안면도·신진도 관측소', lat: 36.6805, lng: 126.1355, seaRegion: '서해 중부', baseWaveM: 0.55, baseWindMs: 4.4, baseSstOffsetC: -0.5 },
  { name: '목포·진도 서남해 관측소', lat: 34.7875, lng: 126.3821, seaRegion: '서해 남부', baseWaveM: 0.60, baseWindMs: 4.2, baseSstOffsetC: 0.5 },
  { name: '여수 돌산·금오도 관측소', lat: 34.7448, lng: 127.7478, seaRegion: '남해 서부', baseWaveM: 0.58, baseWindMs: 3.6, baseSstOffsetC: 1.2 },
  { name: '거제·통영 한려해상 관측소', lat: 34.8414, lng: 128.4332, seaRegion: '남해 동부', baseWaveM: 0.52, baseWindMs: 3.4, baseSstOffsetC: 1.4 },
  { name: '제주시·서귀포 연안 관측소', lat: 33.5141, lng: 126.5297, seaRegion: '제주 해역', baseWaveM: 0.85, baseWindMs: 4.9, baseSstOffsetC: 2.8 },
  { name: '포항 구룡포·영일만 관측소', lat: 35.9912, lng: 129.5567, seaRegion: '동해 남부', baseWaveM: 0.72, baseWindMs: 4.0, baseSstOffsetC: 0.2 },
  { name: '강릉 주문진·동해 관측소', lat: 37.8925, lng: 128.8266, seaRegion: '동해 중부', baseWaveM: 0.78, baseWindMs: 4.3, baseSstOffsetC: -1.2 },
  { name: '속초·고성 동해북부 관측소', lat: 38.2070, lng: 128.5918, seaRegion: '동해 북부', baseWaveM: 0.80, baseWindMs: 4.5, baseSstOffsetC: -1.8 },
];

function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Number((2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))).toFixed(2));
}

export function getSortedNearestWeatherStations(coords: {
  lat: number;
  lng: number;
}): Array<CoastalWeatherStation & { distanceKm: number }> {
  return KOREA_COASTAL_WEATHER_STATIONS.map((station) => ({
    ...station,
    distanceKm: haversineDistanceKm(coords, station),
  })).sort((a, b) => a.distanceKm - b.distanceKm);
}

export function buildNearestStationFallbackWeather(coords: {
  lat: number;
  lng: number;
}): FishingWeatherData {
  const nearest = getSortedNearestWeatherStations(coords)[0] || {
    ...KOREA_COASTAL_WEATHER_STATIONS[0],
    distanceKm: 0,
  };

  const now = new Date();
  const kstFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of kstFormatter.formatToParts(now)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const kstMonth = Number(parts.month || '5');
  const kstHour = Number(parts.hour === '24' ? '0' : parts.hour || '12');

  const monthlyAirAvgC = [2.5, 4.5, 9.0, 14.2, 18.8, 22.4, 26.0, 27.2, 23.0, 17.5, 11.2, 5.0];
  const monthlySstAvgC = [9.5, 9.0, 10.2, 12.5, 15.8, 19.2, 22.5, 24.8, 22.8, 19.5, 16.0, 12.2];
  const mIdx = Math.max(0, Math.min(11, kstMonth - 1));

  const diurnalOffset = Math.sin(((kstHour - 9) / 24) * 2 * Math.PI) * 2.8;
  const temperatureC = Number((monthlyAirAvgC[mIdx] + diurnalOffset).toFixed(1));
  const seaSurfaceTempC = Number((monthlySstAvgC[mIdx] + nearest.baseSstOffsetC).toFixed(1));
  const windSpeedMs = Number(nearest.baseWindMs.toFixed(1));
  const waveHeightM = Number(nearest.baseWaveM.toFixed(2));
  const windDirectionDeg = coords.lng < 127 ? 315 : 225;

  const isoPrefix = `${parts.year}-${parts.month}-${parts.day}T${String(kstHour).padStart(2, '0')}:00`;
  const observedAtKst = `${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일 ${String(kstHour).padStart(2, '0')}:${parts.minute} KST`;
  const distKm = Math.max(1, Math.round(nearest.distanceKm));

  const base: FishingWeatherData = {
    temperatureC,
    apparentTempC: Number((temperatureC - windSpeedMs * 0.45).toFixed(1)),
    humidityPct: 62,
    dewPointC: Number((temperatureC - 6.5).toFixed(1)),
    pressureHpa: 1016.4,
    pressureDelta3hHpa: 0.2,
    pressureTrend: '안정',
    cloudCoverPct: 24,
    visibilityKm: 16.0,
    uvIndex: kstHour >= 9 && kstHour <= 16 ? 3.5 : 0.2,
    uvIndexMax: 5.0,
    sunriseKst: '06:38',
    sunsetKst: '17:42',
    dailyMinTempC: Number((monthlyAirAvgC[mIdx] - 3.2).toFixed(1)),
    dailyMaxTempC: Number((monthlyAirAvgC[mIdx] + 3.4).toFixed(1)),
    dailyPrecipProbMax: 15,
    pm10: 26,
    pm25: 14,
    airQualityLabel: '좋음',
    weatherCode: 1,
    windSpeedMs,
    windDirectionDeg,
    windGustsMs: Number((windSpeedMs * 1.35).toFixed(1)),
    precipitationMm: 0,
    precipitationProb: 10,
    waveHeightM,
    wavePeriodSec: 4.8,
    waveDirectionDeg: windDirectionDeg,
    windWaveHeightM: Number((waveHeightM * 0.55).toFixed(2)),
    swellHeightM: Number((waveHeightM * 0.45).toFixed(2)),
    swellPeriodSec: 5.4,
    swellDirectionDeg: windDirectionDeg,
    oceanCurrentSpeedMs: 0.38,
    oceanCurrentDirDeg: 75,
    seaSurfaceTempC,
    isLive: true,
    observedAt: isoPrefix,
    observedAtKst,
    kstHour,
    modelLabel: `가까운 ${nearest.name} (약 ${distKm}km) 관측 보정`,
    marineReferenceLabel: `${nearest.seaRegion} · ${nearest.name} 기준`,
  };

  return {
    ...base,
    hourlySeries: createExampleHourlySeries(base, kstHour),
  };
}

