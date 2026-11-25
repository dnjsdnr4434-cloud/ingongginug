import type { FishingWeatherData } from './fishingRating';
import type { LatLng, SeaRegion } from './geo';
import { getKstParts } from './koreaTime';

export interface TideEvent {
  hour: number;
  minute: number;
  timeLabel: string;
  heightCm: number;
}

export interface RecommendedFishingWindow {
  timeRange: string;
  title: string;
  reason: string;
  rating: string;
  score: number;
  badgeTone: 'excellent' | 'good' | 'caution';
}

export interface RegionalTideSummary {
  region: SeaRegion;
  multaeNumber: number;
  multaeName: string;
  tidalStrength: string;
  tidePercent: number;
  currentPhaseText: string;
  highTides: TideEvent[];
  lowTides: TideEvent[];
  bestTimeSummary: string;
  recommendedWindows: RecommendedFishingWindow[];
}

function formatHourMinute(totalMinutes: number): { hour: number; minute: number; label: string } {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return {
    hour,
    minute,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

function formatRange(startMin: number, durationMin: number): string {
  const s = formatHourMinute(startMin);
  const e = formatHourMinute(startMin + durationMin);
  return `${s.label} ~ ${e.label}`;
}

export function calculateRegionalTideInfo(
  coords: LatLng,
  region: SeaRegion,
  now: Date = new Date(),
  weather?: FishingWeatherData | null
): RegionalTideSummary {
  const kst = getKstParts(now);
  const [y, m, d] = [Number(kst.year), Number(kst.month), Number(kst.day)];
  const utcDayIdx = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);

  // Synodic lunar phase approximation aligned to Korean 15-day 물때 cycle
  const refNewMoonDay = Math.floor(Date.UTC(2026, 0, 19) / 86_400_000);
  const lunarAge = (((utcDayIdx - refNewMoonDay) % 29.53) + 29.53) % 29.53;
  const halfCycleDay = Math.floor(lunarAge % 14.765);
  const multaeNumber = ((halfCycleDay + 6) % 15) + 1;

  const multaeLabels: Record<number, { name: string; strength: string }> = {
    1: { name: '1물 (초사리 전)', strength: '약한 물살' },
    2: { name: '2물', strength: '조금 후 살아남' },
    3: { name: '3물', strength: '완만한 중물' },
    4: { name: '4물', strength: '낚시 안정 물때' },
    5: { name: '5물', strength: '적당히 흐르는 물' },
    6: { name: '6물', strength: '활발한 조류' },
    7: { name: '7물 (사리 전)', strength: '강한 조류' },
    8: { name: '8물 (사리)', strength: '최대 조차' },
    9: { name: '9물 (한사리)', strength: '강한 유속' },
    10: { name: '10물', strength: '조류 점차 완화' },
    11: { name: '11물', strength: '중간 물살' },
    12: { name: '12물', strength: '초보 추천 물때' },
    13: { name: '13물', strength: '완만한 물살' },
    14: { name: '14물 (무시)', strength: '조류 잔잔' },
    15: { name: '15물 (조금)', strength: '최소 조차' },
  };

  const regionOffsetMin =
    region === '서해' ? 190 : region === '남해' ? 65 : region === '제주' ? 40 : -35;
  const lngAdjust = Math.round((129.0 - coords.lng) * 14);
  const firstHighMin =
    (((Math.round((lunarAge * 50 + regionOffsetMin + lngAdjust) % 745) + 745) % 745) + 90) % 720;

  const baseRangeCm =
    region === '서해' ? 560 : region === '남해' ? 230 : region === '제주' ? 185 : 34;
  const springFactor = 0.55 + 0.45 * Math.cos(((multaeNumber - 8) / 7.5) * Math.PI);
  const amplitude = Math.round(baseRangeCm * springFactor);

  const highTides: TideEvent[] = [firstHighMin, firstHighMin + 745]
    .filter((mVal) => mVal < 1440)
    .map((mVal, idx) => {
      const f = formatHourMinute(mVal);
      return {
        hour: f.hour,
        minute: f.minute,
        timeLabel: f.label,
        heightCm: Math.round(amplitude * (idx === 0 ? 0.96 : 0.92)),
      };
    });

  const lowTides: TideEvent[] = [firstHighMin + 372, firstHighMin + 1117]
    .map((mVal) => ((mVal % 1440) + 1440) % 1440)
    .sort((a, b) => a - b)
    .map((mVal) => {
      const f = formatHourMinute(mVal);
      return {
        hour: f.hour,
        minute: f.minute,
        timeLabel: f.label,
        heightCm: Math.max(12, Math.round(amplitude * 0.14)),
      };
    });

  const nowMin = kst.hourNum * 60 + Number(kst.minute);
  const phaseAngle = ((nowMin - firstHighMin) / 745) * 2 * Math.PI;
  const tidePercent = Math.round(((Math.cos(phaseAngle) + 1) / 2) * 100);
  const sinVal = Math.sin(phaseAngle);
  const currentPhaseText =
    Math.abs(sinVal) < 0.22
      ? tidePercent > 60
        ? '만조 물돌이'
        : '간조 정조'
      : sinVal < 0
      ? '들물 진행'
      : '날물 진행';

  const windSpeed = weather?.windSpeedMs ?? 3.5;
  const waveHeight = weather?.waveHeightM ?? 0.5;
  const weatherPenalty =
    windSpeed >= 12 || waveHeight >= 2.2
      ? 35
      : windSpeed >= 9 || waveHeight >= 1.5
      ? 18
      : windSpeed >= 6.5 || waveHeight >= 1.0
      ? 8
      : 0;

  const mkScore = (base: number) => Math.max(25, Math.min(98, Math.round(base - weatherPenalty)));
  const toneOf = (score: number): RecommendedFishingWindow['badgeTone'] =>
    score >= 82 ? 'excellent' : score >= 65 ? 'good' : 'caution';
  const ratingOf = (score: number): string =>
    score >= 82 ? '최적' : score >= 65 ? '양호' : '주의';

  const w1Start = Math.max(0, firstHighMin - 90);
  const w2Start = (firstHighMin + 280) % 1440;
  const w3Start = (firstHighMin + 655) % 1440;

  const s1 = mkScore(92 - Math.abs(multaeNumber - 6) * 1.4);
  const s2 = mkScore(84);
  const s3 = mkScore(76);

  const recommendedWindows: RecommendedFishingWindow[] = [
    {
      timeRange: formatRange(w1Start, 150),
      title: '초들물~만조 전후 핵심 피딩',
      reason:
        weatherPenalty >= 18
          ? '강풍·높은 너울이 예보되어 방파제 내항 안전 구간만 이용하세요.'
          : `${region} 연안 조류가 살아나며 어종 입질이 가장 활발한 골든타임입니다.`,
      rating: ratingOf(s1),
      score: s1,
      badgeTone: toneOf(s1),
    },
    {
      timeRange: formatRange(w2Start, 120),
      title: '초날물 안정 구간',
      reason: '만조 직후 물흐름이 일정해져 원투낚시·민장대 초보자 채비 운영이 수월합니다.',
      rating: ratingOf(s2),
      score: s2,
      badgeTone: toneOf(s2),
    },
    {
      timeRange: formatRange(w3Start, 120),
      title: '2차 물돌이 교대 타임',
      reason: '수위 변화에 따라 연안 베이트피쉬 이동이 재개되는 보조 출조 추천 시간대입니다.',
      rating: ratingOf(s3),
      score: s3,
      badgeTone: toneOf(s3),
    },
  ];

  const mInfo = multaeLabels[multaeNumber] || multaeLabels[8];

  return {
    region,
    multaeNumber,
    multaeName: mInfo.name,
    tidalStrength: mInfo.strength,
    tidePercent,
    currentPhaseText,
    highTides,
    lowTides,
    bestTimeSummary: recommendedWindows[0].timeRange,
    recommendedWindows,
  };
}
