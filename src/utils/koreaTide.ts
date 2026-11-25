import type { FishingWeatherData, MarineHourlyPoint } from './fishingRating';
import type { LatLng, SeaRegion } from './geo';
import { getKstParts } from './koreaTime';

export interface TideEvent {
  type: '만조' | '간조';
  timeLabel: string;
  heightCm: number;
  minutesFromMidnightKst: number;
}

export interface RecommendedFishingWindow {
  timeRange: string;
  title: string;
  rating: '최적' | '추천' | '보통' | '주의';
  badgeTone: 'excellent' | 'good' | 'moderate' | 'caution';
  reason: string;
  score: number;
}

export interface RegionalTideSummary {
  region: SeaRegion;
  multaeNumber: number;
  multaeName: string;
  tidalStrength: '강함 (대조기)' | '보통 (중조기)' | '약함 (소조기)';
  tidalRangeCm: number;
  currentPhaseText: string;
  tidePercent: number;
  highTides: TideEvent[];
  lowTides: TideEvent[];
  nextEventText: string;
  beginnerTideTip: string;
  bestTimeSummary: string;
  recommendedWindows: RecommendedFishingWindow[];
}

const SYNODIC_MONTH_MS = 29.530588853 * 24 * 60 * 60 * 1000;
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
const M2_HALF_PERIOD_MIN = 372.618; // ~6h 12.6m half tidal cycle (12h 25.2m full M2 period)

const MULTAE_LABELS = [
  '7물 (사리 시작)',
  '8물 (사리 · 최대 조류)',
  '9물 (한사리)',
  '10물 (중조기)',
  '11물 (어깨물)',
  '12물 (꺾임물)',
  '13물 (무시 전)',
  '14물 (조금)',
  '15물 (무시 · 잔잔함)',
  '1물 (초조)',
  '2물 (두물 · 초보 적기)',
  '3물 (서물 · 안정 조류)',
  '4물 (네물 · 황금 물때)',
  '5물 (중들물 · 입질 활발)',
  '6물 (예사리)',
] as const;

function getRegionalPhaseOffsetMinutes(coords: LatLng, region: SeaRegion): number {
  switch (region) {
    case '동해': {
      // East Sea high tide occurs earlier and micro-tide amplitude dominates
      const latAdj = (coords.lat - 36.5) * 18;
      return Math.round(140 + latAdj);
    }
    case '남해': {
      // South Sea propagates westward: Busan ~8:15, Yeosu ~9:05 on full/new moon
      const lngAdj = (129.2 - coords.lng) * 52;
      return Math.round(485 + lngAdj);
    }
    case '제주': {
      const lngAdj = (126.9 - coords.lng) * 40;
      return Math.round(545 + lngAdj);
    }
    case '서해':
    default: {
      // West Sea has significant northward tidal lag (Gunsan -> Boryeong -> Taean -> Incheon)
      const latAdj = (coords.lat - 35.0) * 56;
      return Math.round(620 + latAdj);
    }
  }
}

function getRegionalTidalAmplitudeCm(region: SeaRegion, springFactor: number, coords: LatLng): {
  baseLowCm: number;
  rangeCm: number;
} {
  // springFactor ranges 0 (neap / 조금) to 1 (spring / 사리)
  if (region === '동해') {
    const range = Math.round(16 + springFactor * 18);
    return { baseLowCm: 15, rangeCm: range };
  }
  if (region === '제주') {
    const range = Math.round(125 + springFactor * 135);
    return { baseLowCm: 35, rangeCm: range };
  }
  if (region === '남해') {
    const westBoost = Math.max(0, (129.1 - coords.lng) * 45);
    const range = Math.round(140 + westBoost + springFactor * (135 + westBoost * 0.4));
    return { baseLowCm: 40, rangeCm: range };
  }
  // 서해 (Incheon gets largest amplitude)
  const northBoost = Math.max(0, (coords.lat - 35.2) * 85);
  const range = Math.round(310 + northBoost + springFactor * (260 + northBoost * 0.6));
  return { baseLowCm: 65, rangeCm: range };
}

function formatMinutesAsHHMM(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const mm = String(wrapped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function getKstMidnightUtcMs(date: Date): number {
  const kst = getKstParts(date);
  return Date.UTC(Number(kst.year), Number(kst.month) - 1, Number(kst.day), 0, 0, 0) - 9 * 60 * 60 * 1000;
}

function findMatchingHourlyWeather(
  hourlySeries: MarineHourlyPoint[] | undefined,
  targetHourKst: number
): MarineHourlyPoint | null {
  if (!Array.isArray(hourlySeries) || hourlySeries.length === 0) return null;
  for (const pt of hourlySeries) {
    const m = pt.hourLabel.match(/^(\d+)/);
    if (m && Number(m[1]) === targetHourKst % 24) {
      return pt;
    }
  }
  return hourlySeries[0] ?? null;
}

/**
 * Dynamically calculates Korean regional tide cycle (물때), KST high/low tides,
 * current tide state, and weather+tide combined recommended fishing time windows
 * for the selected map location.
 */
export function calculateRegionalTideInfo(
  coords: LatLng,
  region: SeaRegion,
  now: Date = new Date(),
  weather?: FishingWeatherData | null
): RegionalTideSummary {
  const lunarAgeMs = (((now.getTime() - NEW_MOON_EPOCH_MS) % SYNODIC_MONTH_MS) + SYNODIC_MONTH_MS) % SYNODIC_MONTH_MS;
  const lunarAgeDays = lunarAgeMs / (24 * 60 * 60 * 1000);
  const cycleIndex = Math.floor(lunarAgeDays) % 15; // 0..14
  const multaeName = MULTAE_LABELS[cycleIndex];
  const multaeNumber = ((cycleIndex + 6) % 15) + 1;

  // Spring/neap tide factor: highest near 7~9물 (index 0..2, lunar days ~1, 16) and lowest near 14~15물/1물 (index 7..9)
  const springFactor = 0.5 + 0.5 * Math.cos((cycleIndex / 15) * 2 * Math.PI);
  const tidalStrength: RegionalTideSummary['tidalStrength'] =
    springFactor >= 0.68
      ? '강함 (대조기)'
      : springFactor >= 0.34
      ? '보통 (중조기)'
      : '약함 (소조기)';

  const kstParts = getKstParts(now);
  const currentMinutesKst = Number(kstParts.hour) * 60 + Number(kstParts.minute);
  const kstMidnightUtcMs = getKstMidnightUtcMs(now);

  // Cumulative lunar-day tidal progression (+49 min/day) from J2000 reference
  const daysSinceEpoch = (kstMidnightUtcMs - NEW_MOON_EPOCH_MS) / (24 * 60 * 60 * 1000);
  const lunitidalLagMinutes = getRegionalPhaseOffsetMinutes(coords, region);
  const m2PeriodMin = M2_HALF_PERIOD_MIN * 2;
  const firstHighPhase =
    (((daysSinceEpoch * 50.47 + lunitidalLagMinutes) % m2PeriodMin) + m2PeriodMin) % m2PeriodMin;

  const { baseLowCm, rangeCm } = getRegionalTidalAmplitudeCm(region, springFactor, coords);

  // Collect all high/low events overlapping today [0..1440 min KST]
  const eventsToday: TideEvent[] = [];
  for (let k = -1; k <= 3; k++) {
    const highMin = firstHighPhase + k * m2PeriodMin;
    if (highMin >= 0 && highMin < 1440) {
      eventsToday.push({
        type: '만조',
        timeLabel: formatMinutesAsHHMM(highMin),
        heightCm: baseLowCm + rangeCm,
        minutesFromMidnightKst: Math.round(highMin),
      });
    }
    const lowMin = highMin + M2_HALF_PERIOD_MIN;
    if (lowMin >= 0 && lowMin < 1440) {
      eventsToday.push({
        type: '간조',
        timeLabel: formatMinutesAsHHMM(lowMin),
        heightCm: baseLowCm,
        minutesFromMidnightKst: Math.round(lowMin),
      });
    }
  }
  eventsToday.sort((a, b) => a.minutesFromMidnightKst - b.minutesFromMidnightKst);

  const highTides = eventsToday.filter((e) => e.type === '만조');
  const lowTides = eventsToday.filter((e) => e.type === '간조');

  // Instantaneous tide curve state at currentMinutesKst
  const phaseRad = ((currentMinutesKst - firstHighPhase) / m2PeriodMin) * 2 * Math.PI;
  const normalizedHeight = 0.5 + 0.5 * Math.cos(phaseRad); // 1.0 = high tide, 0.0 = low tide
  const sinDerivative = -Math.sin(phaseRad); // >0 = rising(들물), <0 = falling(날물)
  const tidePercent = Math.round(normalizedHeight * 100);

  let currentPhaseText = '중들물';
  if (normalizedHeight >= 0.92) {
    currentPhaseText = '만조 정조';
  } else if (normalizedHeight <= 0.08) {
    currentPhaseText = '간조 정조';
  } else if (sinDerivative > 0) {
    currentPhaseText = normalizedHeight < 0.45 ? '초들물' : normalizedHeight < 0.8 ? '중들물' : '끝들물';
  } else {
    currentPhaseText = normalizedHeight > 0.55 ? '초날물' : normalizedHeight > 0.2 ? '중날물' : '끝날물';
  }

  // Find next tide event (including tomorrow's first if past last event today)
  let nextEvent = eventsToday.find((e) => e.minutesFromMidnightKst > currentMinutesKst);
  if (!nextEvent && eventsToday.length > 0) {
    nextEvent = {
      ...eventsToday[0],
      minutesFromMidnightKst: eventsToday[0].minutesFromMidnightKst + 1440,
    };
  }
  const diffMin = nextEvent ? nextEvent.minutesFromMidnightKst - currentMinutesKst : 120;
  const diffHrs = Math.floor(diffMin / 60);
  const diffRem = diffMin % 60;
  const nextEventText = nextEvent
    ? `다음 ${nextEvent.type} ${nextEvent.timeLabel} (${diffHrs > 0 ? `${diffHrs}시간 ` : ''}${diffRem}분 후)`
    : '물때 계산 중';

  let beginnerTideTip = '초들물~초날물 전환 시간대에 조류가 살아나 입질이 가장 활발합니다.';
  if (region === '동해') {
    beginnerTideTip =
      '동해는 조수간만의 차가 약 20~35cm로 작아 물때보다 해풍 방향과 너울(파고) 변화, 일출·일몰 시간대 확인이 중요합니다.';
  } else if (region === '서해' && springFactor >= 0.65) {
    beginnerTideTip =
      '서해 대조기(사리)에는 조차가 매우 커 들물 때 갯벌·낮은 방파제가 빠르게 잠기므로 만조 1시간 전 반드시 철수하세요.';
  } else if (springFactor < 0.35) {
    beginnerTideTip =
      '조류가 완만한 소조기(조금·무시)로 찌가 멀리 흐르지 않아 입문자가 채비를 제어하기에 가장 좋습니다.';
  }

  // Evaluate 2-hour windows over the next 16 hours KST to recommend best fishing times
  const curHour = Number(kstParts.hour);
  const candidateWindows: RecommendedFishingWindow[] = [];

  for (let offset = 0; offset <= 14; offset += 2) {
    const startH = (curHour + offset) % 24;
    const endH = (startH + 2) % 24;
    const midMinFromMidnight = currentMinutesKst + offset * 60 + 60;
    const midPhaseRad = ((midMinFromMidnight - firstHighPhase) / m2PeriodMin) * 2 * Math.PI;
    const midHeight = 0.5 + 0.5 * Math.cos(midPhaseRad);
    const midDeriv = -Math.sin(midPhaseRad);

    let score = 62;
    const reasons: string[] = [];

    // 1. Tide dynamics
    if (region === '동해') {
      if (midHeight >= 0.45 && midHeight <= 0.85) {
        score += 10;
        reasons.push('연안 수위 안정 구간');
      }
    } else if (Math.abs(midDeriv) >= 0.55) {
      score += 18;
      reasons.push(midDeriv > 0 ? '초·중들물 조류 활성기' : '초·중날물 피딩 타임');
    } else if (midHeight >= 0.88) {
      score += 10;
      reasons.push('만조 전후 수심 확보');
    } else {
      score += 4;
      reasons.push('물흐름 완만한 정조기');
    }

    // 2. Solar / feeding window
    if (startH >= 5 && startH <= 7) {
      score += 15;
      reasons.push('동트기 전후 황금 입질 시간');
    } else if (startH >= 16 && startH <= 18) {
      score += 14;
      reasons.push('해질녘 피딩 타임');
    } else if (startH >= 20 || startH <= 3) {
      score -= 4;
      reasons.push('야간 안전등·볼락/갈치 타임');
    }

    // 3. Weather impact from live forecast
    const hw = findMatchingHourlyWeather(weather?.hourlySeries, startH);
    const windMs = hw?.windSpeedMs ?? weather?.windSpeedMs ?? 3.5;
    const waveM = hw?.waveHeightM ?? weather?.waveHeightM ?? null;
    const rainProb = hw?.precipitationProb ?? weather?.precipitationProb ?? 0;

    if (windMs >= 10 || (waveM !== null && waveM >= 1.8) || rainProb >= 75) {
      score -= 35;
      reasons.push(`기상 악화 주의 (풍속 ${windMs.toFixed(1)}m/s)`);
    } else if (windMs >= 7 || (waveM !== null && waveM >= 1.2) || rainProb >= 50) {
      score -= 16;
      reasons.push(`바람 다소 강함 (${windMs.toFixed(1)}m/s)`);
    } else {
      score += 10;
      reasons.push(`잔잔한 바람 (${windMs.toFixed(1)}m/s)`);
    }

    const clampedScore = Math.max(20, Math.min(99, Math.round(score)));
    const rating: RecommendedFishingWindow['rating'] =
      clampedScore >= 82
        ? '최적'
        : clampedScore >= 68
        ? '추천'
        : clampedScore >= 52
        ? '보통'
        : '주의';
    const badgeTone: RecommendedFishingWindow['badgeTone'] =
      rating === '최적'
        ? 'excellent'
        : rating === '추천'
        ? 'good'
        : rating === '보통'
        ? 'moderate'
        : 'caution';

    const dayPrefix = curHour + offset >= 24 ? '내일 ' : offset === 0 ? '지금 ' : '오늘 ';
    const timeRange = `${dayPrefix}${String(startH).padStart(2, '0')}:00 ~ ${String(endH).padStart(2, '0')}:00`;
    const title =
      region === '동해'
        ? startH >= 5 && startH <= 8
          ? '일출 피딩 타임'
          : startH >= 16 && startH <= 19
          ? '일몰 피딩 타임'
          : '해황 안정 출조'
        : midDeriv > 0.35
        ? '들물 입질 피크'
        : midDeriv < -0.35
        ? '날물 입질 피크'
        : '정조 안전 시간대';

    candidateWindows.push({
      timeRange,
      title,
      rating,
      badgeTone,
      reason: reasons.slice(0, 2).join(' · '),
      score: clampedScore,
    });
  }

  const topWindows = [...candidateWindows]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const bestWindow = topWindows[0];
  const bestTimeSummary = bestWindow
    ? `${bestWindow.timeRange} (${bestWindow.title} · ${bestWindow.rating})`
    : '기상·물때 분석 중';

  return {
    region,
    multaeNumber,
    multaeName,
    tidalStrength,
    tidalRangeCm: rangeCm,
    currentPhaseText,
    tidePercent,
    highTides,
    lowTides,
    nextEventText,
    beginnerTideTip,
    bestTimeSummary,
    recommendedWindows: topWindows,
  };
}
