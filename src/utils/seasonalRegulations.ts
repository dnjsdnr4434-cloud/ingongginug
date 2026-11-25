import { getKstParts } from './koreaTime';

export interface ActiveFishingBan {
  id: string;
  speciesName: string;
  banPeriodLabel: string;
  months: number[];
  note: string;
  minLengthLabel?: string;
}

export interface SeasonalMinimumSize {
  id: string;
  speciesName: string;
  minLengthCm: number;
  reason: string;
}

export interface MarineSafetyRule {
  id: string;
  title: string;
  detail: string;
  priority: 'critical' | 'normal';
}

export interface SeasonalRegulationsSummary {
  kstMonth: number;
  kstDay: number;
  seasonLabel: string;
  activeFishingBans: ActiveFishingBan[];
  seasonalMinimumSizes: SeasonalMinimumSize[];
  protectedSpecies: Array<{ name: string; action: string }>;
  safetyRules: MarineSafetyRule[];
}

const ALL_SEASONAL_BANS: ActiveFishingBan[] = [
  {
    id: 'ban_greenling',
    speciesName: '쥐노래미 (놀래미)',
    banPeriodLabel: '11.1 ~ 12.31',
    months: [11, 12],
    note: '겨울 산란기 보호를 위해 11~12월 전면 포획 금지',
    minLengthLabel: '금지체장 20cm 이하',
  },
  {
    id: 'ban_cod',
    speciesName: '대구',
    banPeriodLabel: '1.16 ~ 2.15',
    months: [1, 2],
    note: '동·남해 겨울 산란기 어미 보호 금어기',
    minLengthLabel: '금지체장 35cm 이하',
  },
  {
    id: 'ban_octopus',
    speciesName: '주꾸미',
    banPeriodLabel: '5.11 ~ 8.31',
    months: [5, 6, 7, 8],
    note: '봄~여름 산란·성장기 포획 전면 금지',
  },
  {
    id: 'ban_black_seabream',
    speciesName: '감성돔',
    banPeriodLabel: '5.1 ~ 5.31',
    months: [5],
    note: '5월 산란기 보호를 위한 전 해역 금어기',
    minLengthLabel: '금지체장 25cm 이하',
  },
  {
    id: 'ban_rock_bream',
    speciesName: '돌돔',
    banPeriodLabel: '5.1 ~ 6.30',
    months: [5, 6],
    note: '초여름 산란 어군 보호 금어기',
    minLengthLabel: '금지체장 24cm 이하',
  },
  {
    id: 'ban_hairtail',
    speciesName: '갈치',
    banPeriodLabel: '7.1 ~ 7.31',
    months: [7],
    note: '7월 여름 산란기 금어기',
    minLengthLabel: '항문장 18cm 이하',
  },
  {
    id: 'ban_mackerel',
    speciesName: '고등어',
    banPeriodLabel: '4~6월 지정 1개월',
    months: [4, 5, 6],
    note: '봄철 산란기 업종별·해역별 지정 금어기 확인 필수',
    minLengthLabel: '금지체장 21cm 이하',
  },
  {
    id: 'ban_horse_mackerel',
    speciesName: '삼치',
    banPeriodLabel: '5.1 ~ 5.31',
    months: [5],
    note: '봄철 연안 회유 산란기 포획 금지',
    minLengthLabel: '금지체장 35cm 이하',
  },
  {
    id: 'ban_blue_crab',
    speciesName: '꽃게',
    banPeriodLabel: '6.21 ~ 8.20',
    months: [6, 7, 8],
    note: '서해 꽃게 산란기 포획 금지 (연중 외포란 암컷 금지)',
    minLengthLabel: '갑장 6.4cm 이하',
  },
  {
    id: 'ban_halfbeak',
    speciesName: '학꽁치',
    banPeriodLabel: '3.1 ~ 4.30',
    months: [3, 4],
    note: '봄철 연안 산란 어군 보호 구간 확인 필요',
  },
  {
    id: 'ban_sandfish',
    speciesName: '도루묵',
    banPeriodLabel: '1.1 ~ 1.31',
    months: [1],
    note: '동해안 어족자원 보호 기간',
    minLengthLabel: '금지체장 11cm 이하',
  },
  {
    id: 'ban_pollack',
    speciesName: '명태',
    banPeriodLabel: '1.1 ~ 12.31 (연중)',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    note: '연중 전 국민 포획 금지 대상 어종',
  },
];

const MINIMUM_SIZES: SeasonalMinimumSize[] = [
  {
    id: 'size_flounder',
    speciesName: '넙치 (광어)',
    minLengthCm: 35,
    reason: '방파제·선상에서 가장 흔히 잡히는 치어 방생 핵심 대상',
  },
  {
    id: 'size_seabream',
    speciesName: '감성돔',
    minLengthCm: 25,
    reason: '방파제 찌낚시 다빈도 혼획 어종 (살려서 방생 권장)',
  },
  {
    id: 'size_red_seabream',
    speciesName: '참돔',
    minLengthCm: 24,
    reason: '연안 유입 소형 상사리 개체 방생 필수',
  },
  {
    id: 'size_rockfish',
    speciesName: '조피볼락 (우럭)',
    minLengthCm: 23,
    reason: '초보 낚시인 생활낚시 어종 중 치어 혼획 빈도가 높음',
  },
  {
    id: 'size_greenling',
    speciesName: '쥐노래미',
    minLengthCm: 20,
    reason: '겨울 금어기(11~12월) 및 체장 규정 동시 적용 대상',
  },
];

export function getCurrentSeasonalRegulations(now: Date = new Date()): SeasonalRegulationsSummary {
  const kst = getKstParts(now);
  const month = kst.monthNum;
  const day = kst.dayNum;

  const seasonLabel =
    month >= 3 && month <= 5
      ? '봄철 산란기'
      : month >= 6 && month <= 8
      ? '여름철 고수온기'
      : month >= 9 && month <= 11
      ? '가을철 성어기'
      : '겨울철 저수온기';

  const activeFishingBans = ALL_SEASONAL_BANS.filter((item) => item.months.includes(month));

  return {
    kstMonth: month,
    kstDay: day,
    seasonLabel,
    activeFishingBans,
    seasonalMinimumSizes: MINIMUM_SIZES,
    protectedSpecies: [
      { name: '해마 · 남방해마 · 바다거북', action: '해양보호생물 - 발견 즉시 물속에서 조심스럽게 방생' },
      { name: '점박이물범 · 나팔고둥', action: '채취·포획 엄격 금지 (위반 시 처벌 대상)' },
    ],
    safetyRules: [
      {
        id: 'safety_pfd',
        title: '구명조끼 상시 착용 및 미끄럼 방지화',
        detail: '방파제·갯바위에서는 날씨와 관계없이 구명조끼를 착용하고 젖은 이끼 구역을 피하세요.',
        priority: 'critical',
      },
      {
        id: 'safety_tetrapod',
        title: '테트라포드(삼발이) 진입 자제',
        detail: '추락 시 자력 탈출이 매우 어려우므로 난간이 설치된 내항 방파제와 낚시공원을 이용하세요.',
        priority: 'critical',
      },
      {
        id: 'safety_tide_weather',
        title: '들물 고립·기상특보 시 즉시 철수',
        detail: '파고 1.5m 이상 또는 풍속 10m/s 초과 예보 시 출조를 중단하고 안전한 곳으로 이동하세요.',
        priority: 'normal',
      },
    ],
  };
}
