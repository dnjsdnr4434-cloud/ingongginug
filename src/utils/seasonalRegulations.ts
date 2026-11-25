import { getKstParts } from './koreaTime';

export interface FishingBanRule {
  id: string;
  speciesName: string;
  banPeriodLabel: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  minLengthLabel?: string;
  note: string;
  isYearRound?: boolean;
}

export interface MinimumSizeRule {
  id: string;
  speciesName: string;
  minLengthCm: number;
  measureNote: string;
  peakMonths: number[]; // Months (1..12) when this species is commonly caught along Korean coasts
  reason: string;
}

export interface ProtectedSpeciesSummary {
  name: string;
  action: string;
}

export interface MarineSafetyRule {
  id: string;
  title: string;
  detail: string;
  priority: 'critical' | 'high' | 'normal';
}

export const STATUTORY_FISHING_BANS: FishingBanRule[] = [
  {
    id: 'ban_myeongtae',
    speciesName: '명태',
    banPeriodLabel: '연중 (1/1 ~ 12/31)',
    startMonth: 1,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
    note: '수산자원 회복을 위해 연중 포획 전면 금지 (크기 무관 즉시 방생)',
    isYearRound: true,
  },
  {
    id: 'ban_jwinoraemi',
    speciesName: '쥐노래미 (놀래미)',
    banPeriodLabel: '11/1 ~ 12/31',
    startMonth: 11,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
    minLengthLabel: '20cm 이하 금지',
    note: '겨울 산란기 금어기 중 · 방파제/갯바위에서 낚이면 즉시 방생하세요',
  },
  {
    id: 'ban_yeoneo',
    speciesName: '연어',
    banPeriodLabel: '10/1 ~ 11/30',
    startMonth: 10,
    startDay: 1,
    endMonth: 11,
    endDay: 30,
    note: '회귀 산란기 보호를 위해 하천·연안 포획 전면 금지',
  },
  {
    id: 'ban_daege',
    speciesName: '대게',
    banPeriodLabel: '6/1 ~ 11/30',
    startMonth: 6,
    startDay: 1,
    endMonth: 11,
    endDay: 30,
    minLengthLabel: '갑장 9cm 이하·암컷 연중 금지',
    note: '동해권 가을~초겨울 포획 금지 기간 (암컷 빵게는 연중 포획 금지)',
  },
  {
    id: 'ban_daegu',
    speciesName: '대구',
    banPeriodLabel: '1/16 ~ 2/15',
    startMonth: 1,
    startDay: 16,
    endMonth: 2,
    endDay: 15,
    minLengthLabel: '35cm 이하 금지',
    note: '겨울 산란기 금어기',
  },
  {
    id: 'ban_ojingeo',
    speciesName: '살오징어',
    banPeriodLabel: '4/1 ~ 5/31',
    startMonth: 4,
    startDay: 1,
    endMonth: 5,
    endDay: 31,
    minLengthLabel: '외투장 15cm 이하 금지',
    note: '봄철 산란기 보호 기간',
  },
  {
    id: 'ban_gamsungdom',
    speciesName: '감성돔',
    banPeriodLabel: '5/1 ~ 5/31',
    startMonth: 5,
    startDay: 1,
    endMonth: 5,
    endDay: 31,
    minLengthLabel: '25cm 이하 금지',
    note: '봄 산란기 금어기 (금지체장 25cm는 연중 적용)',
  },
  {
    id: 'ban_doldom',
    speciesName: '돌돔',
    banPeriodLabel: '5/1 ~ 6/30',
    startMonth: 5,
    startDay: 1,
    endMonth: 6,
    endDay: 30,
    minLengthLabel: '24cm 이하 금지',
    note: '초여름 산란기 금어기 (금지체장 24cm는 연중 적용)',
  },
  {
    id: 'ban_samchi',
    speciesName: '삼치',
    banPeriodLabel: '5/1 ~ 5/31',
    startMonth: 5,
    startDay: 1,
    endMonth: 5,
    endDay: 31,
    note: '산란기 포획 금지',
  },
  {
    id: 'ban_jjugumi',
    speciesName: '주꾸미',
    banPeriodLabel: '5/11 ~ 8/31',
    startMonth: 5,
    startDay: 11,
    endMonth: 8,
    endDay: 31,
    note: '산란기 및 어린 개체 보호 기간',
  },
  {
    id: 'ban_muneo',
    speciesName: '참문어',
    banPeriodLabel: '5/16 ~ 6/30',
    startMonth: 5,
    startDay: 16,
    endMonth: 6,
    endDay: 30,
    note: '지자체별 고시 기간 확인 필요',
  },
  {
    id: 'ban_nakji',
    speciesName: '낙지',
    banPeriodLabel: '6/1 ~ 6/30',
    startMonth: 6,
    startDay: 1,
    endMonth: 6,
    endDay: 30,
    note: '산란기 보호 기간 (시도별 5~7월 상이)',
  },
  {
    id: 'ban_kkotge',
    speciesName: '꽃게',
    banPeriodLabel: '6/21 ~ 8/20',
    startMonth: 6,
    startDay: 21,
    endMonth: 8,
    endDay: 20,
    minLengthLabel: '갑장 6.4cm 이하·외포란 암컷 연중 금지',
    note: '여름철 산란기 보호 기간',
  },
  {
    id: 'ban_galchi',
    speciesName: '갈치',
    banPeriodLabel: '7/1 ~ 7/31',
    startMonth: 7,
    startDay: 1,
    endMonth: 7,
    endDay: 31,
    minLengthLabel: '항문장 18cm 이하 금지',
    note: '여름철 산란기 보호 기간',
  },
  {
    id: 'ban_okdom',
    speciesName: '옥돔',
    banPeriodLabel: '7/21 ~ 8/20',
    startMonth: 7,
    startDay: 21,
    endMonth: 8,
    endDay: 20,
    minLengthLabel: '24cm 이하 금지',
    note: '제주·남해 옥돔 산란기 보호 기간',
  },
];

export const SEASONAL_MINIMUM_SIZE_RULES: MinimumSizeRule[] = [
  {
    id: 'size_ureok',
    speciesName: '조피볼락 (우럭)',
    minLengthCm: 23,
    measureNote: '23cm 이하 연중 포획 금지 (전장)',
    peakMonths: [1, 2, 3, 4, 9, 10, 11, 12],
    reason: '방파제·선상에서 어린 우럭 혼획이 매우 잦아 줄자 확인 필수',
  },
  {
    id: 'size_gwangeo',
    speciesName: '넙치 (광어)',
    minLengthCm: 35,
    measureNote: '35cm 이하 연중 포획 금지 (전장)',
    peakMonths: [4, 5, 6, 9, 10, 11],
    reason: '서해·남해 루어 및 원투낚시에서 치어 방생 규정 준수 필요',
  },
  {
    id: 'size_gamsungdom',
    speciesName: '감성돔',
    minLengthCm: 25,
    measureNote: '25cm 이하 연중 포획 금지 (전장)',
    peakMonths: [1, 2, 3, 9, 10, 11, 12],
    reason: '가을~겨울 감성돔 시즌에 25cm 미만 어린 개체 방생 필수',
  },
  {
    id: 'size_chamdom',
    speciesName: '참돔',
    minLengthCm: 24,
    measureNote: '24cm 이하 연중 포획 금지 (전장)',
    peakMonths: [5, 6, 7, 8, 9, 10, 11],
    reason: '선상·갯바위 낚시 시 상사리급 치어(24cm 이하) 즉시 방생',
  },
  {
    id: 'size_bollak',
    speciesName: '볼락',
    minLengthCm: 15,
    measureNote: '15cm 이하 연중 포획 금지 (전장)',
    peakMonths: [1, 2, 3, 4, 11, 12],
    reason: '겨울·초봄 야간 방파제 루어 시 15cm 미만 치어 빈번',
  },
  {
    id: 'size_nongeo',
    speciesName: '농어',
    minLengthCm: 30,
    measureNote: '30cm 이하 연중 포획 금지 (전장)',
    peakMonths: [6, 7, 8, 9, 10, 11],
    reason: '깔따구(어린 농어) 남획 방지를 위해 30cm 이하 방생 필수',
  },
  {
    id: 'size_godeungeo',
    speciesName: '고등어',
    minLengthCm: 21,
    measureNote: '21cm 이하 연중 포획 금지 (전장)',
    peakMonths: [8, 9, 10, 11],
    reason: '가을 방파제 생활낚시에서 고도리(어린 고등어) 혼획 다수',
  },
  {
    id: 'size_jwinoraemi',
    speciesName: '쥐노래미 (놀래미)',
    minLengthCm: 20,
    measureNote: '20cm 이하 연중 포획 금지 (+ 11~12월 금어기)',
    peakMonths: [1, 2, 3, 4, 9, 10, 11, 12],
    reason: '금지체장 20cm 이하 준수 (11~12월에는 크기 무관 전체 방생)',
  },
  {
    id: 'size_doldom',
    speciesName: '돌돔',
    minLengthCm: 24,
    measureNote: '24cm 이하 연중 포획 금지 (전장)',
    peakMonths: [6, 7, 8, 9, 10],
    reason: '여름·초가을 방파제에서 줄돔(어린 돌돔) 혼획 매우 잦음',
  },
  {
    id: 'size_munchi',
    speciesName: '문치가자미 (도다리)',
    minLengthCm: 20,
    measureNote: '20cm 이하 연중 포획 금지 (전장)',
    peakMonths: [2, 3, 4, 5, 11, 12],
    reason: '원투낚시에서 어린 도다리 혼획 시 즉시 방생 필요',
  },
];

export const MARINE_PROTECTED_SPECIES: ProtectedSpeciesSummary[] = [
  { name: '해마 · 남방해마 · 점해마', action: '크기·계절 무관 포획 전면 금지 (발견 즉시 젖은 손/도구로 방생)' },
  { name: '바다거북 · 상괭이 · 점박이물범', action: '포획·접근 금지 · 혼획/좌초 시 해양경찰(119/122) 신고' },
  { name: '나팔고둥 · 흰발농게 · 붉은발말똥게', action: '갯벌·조간대 채취 엄격 금지 (해양보호생물)' },
];

export const MARINE_SAFETY_RULES: MarineSafetyRule[] = [
  {
    id: 'safety_lifejacket',
    title: '구명조끼 · 미끄럼 방지 신발 필수 착용',
    detail: '방파제·테트라포드·갯바위는 해조류 이끼로 매우 미끄러워 추락 사고 위험이 높습니다. 물가 진입 전 구명조끼를 반드시 착용하세요.',
    priority: 'critical',
  },
  {
    id: 'safety_weather_tide',
    title: '만조 시간대 · 강풍 · 너울성 파도 시 즉시 철수',
    detail: '풍속 8~10m/s 이상 또는 파고 1.5m 이상이면 월파 위험이 큽니다. 들물·만조 1시간 전부터 갯바위·낮은 방파제 퇴로를 먼저 확인하세요.',
    priority: 'critical',
  },
  {
    id: 'safety_tetrapod',
    title: '테트라포드(삼발이) 단독 진입 금지',
    detail: '발을 헛디디면 구조가 어렵습니다. 초보자는 난간과 안전시설이 있는 낚시공원·내항 방파제를 이용하고 반드시 2인 이상 동행하세요.',
    priority: 'high',
  },
  {
    id: 'safety_toxic_fish',
    title: '미확인 어종·독성 가시 맨손 접촉 금지',
    detail: '쏠배감펭, 독가시치, 미역치, 복어류 등은 가시나 체내에 강한 독이 있으므로 피시그립·집게로 다루고, 이상 시 즉시 AI 어종 판별을 확인하세요.',
    priority: 'high',
  },
  {
    id: 'safety_leave_no_trace',
    title: '폐낚싯줄·바늘·쓰레기 되가져가기',
    detail: '버려진 낚싯줄과 납추는 해양생물을 다치게 합니다. 사용한 미끼 봉투와 끊어진 채비는 반드시 수거해 주세요.',
    priority: 'normal',
  },
];

function isMonthDayWithinRange(
  month: number,
  day: number,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number
): boolean {
  const current = month * 100 + day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;

  if (start <= end) {
    return current >= start && current <= end;
  }
  // Wrap-around across year boundary (e.g. Nov 15 ~ Feb 28)
  return current >= start || current <= end;
}

export interface SeasonalHomeSummary {
  kstMonth: number;
  kstDay: number;
  seasonLabel: string;
  activeFishingBans: FishingBanRule[];
  seasonalMinimumSizes: MinimumSizeRule[];
  protectedSpecies: ProtectedSpeciesSummary[];
  safetyRules: MarineSafetyRule[];
}

export function getSeasonLabelByMonth(month: number): string {
  if (month >= 3 && month <= 5) return '봄철';
  if (month >= 6 && month <= 8) return '여름철';
  if (month >= 9 && month <= 11) return '가을~초겨울';
  return '겨울철';
}

/**
 * Returns ONLY fishing bans and minimum-size regulations active/problematic
 * during the given Korea Standard Time date, plus marine safety rules.
 */
export function getCurrentSeasonalRegulations(date: Date = new Date()): SeasonalHomeSummary {
  const kst = getKstParts(date);
  const kstMonth = Number(kst.month);
  const kstDay = Number(kst.day);

  const activeFishingBans = STATUTORY_FISHING_BANS.filter((rule) =>
    isMonthDayWithinRange(
      kstMonth,
      kstDay,
      rule.startMonth,
      rule.startDay,
      rule.endMonth,
      rule.endDay
    )
  );

  // Exclude species already highlighted as closed-season bans when filtering or keep clear distinction
  const activeBanNames = new Set(activeFishingBans.map((b) => b.speciesName));
  const seasonalMinimumSizes = SEASONAL_MINIMUM_SIZE_RULES.filter(
    (rule) => rule.peakMonths.includes(kstMonth) && !activeBanNames.has(rule.speciesName)
  );

  return {
    kstMonth,
    kstDay,
    seasonLabel: getSeasonLabelByMonth(kstMonth),
    activeFishingBans,
    seasonalMinimumSizes,
    protectedSpecies: MARINE_PROTECTED_SPECIES,
    safetyRules: MARINE_SAFETY_RULES,
  };
}
