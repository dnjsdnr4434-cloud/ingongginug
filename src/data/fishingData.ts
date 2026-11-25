import type { SeaRegion } from '../utils/geo';

export interface FishSpecies {
  id: string;
  name: string;
  scientificName: string;
  image: string;
  habitat: string;
  edible: boolean;
  toxicity: string;
  fishingBan: string;
  features: string;
}

export interface FishingSpot {
  id: string;
  name: string;
  region: SeaRegion;
  location: string;
  lat: number;
  lng: number;
  description: string;
  targetFish: string[];
  difficulty: '초급' | '중급' | '상급';
  safetyNote: string;
  facilities: string[];
}

export interface CatchLog {
  id: string;
  speciesName: string;
  userConfirmedName?: string;
  date: string;
  location: string;
  size: number;
  released: boolean;
  memo: string;
  photoUrl?: string;
  aiConfidence?: number;
}

export const INITIAL_FISH_ENCYCLOPEDIA: FishSpecies[] = [
  {
    id: 'fish_red_seabream',
    name: '참돔',
    scientificName: 'Pagrus major',
    image: '/images/red-seabream.jpg',
    habitat: '남해·제주·서해 남부 암초대 및 수심 20~80m 연안',
    edible: true,
    toxicity: '독성 없음',
    fishingBan: '금지체장 24cm 이하 (감성돔 25cm) · 지역별 포획 기준 준수',
    features: '선홍빛 체색에 등쪽에 푸른 점무늬가 선명하며 꼬리지느러미 끝이 검다.',
  },
  {
    id: 'fish_olive_flounder',
    name: '넙치 (광어)',
    scientificName: 'Paralichthys olivaceus',
    image: '/images/olive-flounder.jpg',
    habitat: '전국 연안 모래·펄 바닥 (수심 10~60m)',
    edible: true,
    toxicity: '독성 없음',
    fishingBan: '금지체장 35cm 이하 연중 포획 금지',
    features: '눈이 몸의 왼쪽에 몰려 있으며 입이 크고 날카로운 이빨이 있다.',
  },
  {
    id: 'fish_rockfish',
    name: '조피볼락 (우럭)',
    scientificName: 'Sebastes schlegelii',
    image: '/images/deep-ocean-hero.jpg',
    habitat: '전국 방파제·어초·암초 연안',
    edible: true,
    toxicity: '독성 없음 (등지느러미 가시 주의)',
    fishingBan: '금지체장 23cm 이하 연중 포획 금지',
    features: '어두운 흑갈색 바탕에 불규칙한 무늬가 있고 눈 아래 2줄의 어두운 띠가 있다.',
  },
  {
    id: 'fish_black_seabream',
    name: '감성돔',
    scientificName: 'Acanthopagrus schlegelii',
    image: '/images/red-seabream.jpg',
    habitat: '서해·남해·동해 연안 방파제·갯바위·기수역',
    edible: true,
    toxicity: '독성 없음',
    fishingBan: '금어기 5월 1일 ~ 5월 31일 · 금지체장 25cm 이하',
    features: '은빛을 띤 흑회색 몸통에 날카로운 등지느러미 극조가 발달했다.',
  },
  {
    id: 'fish_greenling',
    name: '쥐노래미 (놀래미)',
    scientificName: 'Hexagrammos otakii',
    image: '/images/deep-ocean-hero.jpg',
    habitat: '전국 방파제·갯바위·연안 암초 바닥',
    edible: true,
    toxicity: '독성 없음',
    fishingBan: '금어기 11월 1일 ~ 12월 31일 · 금지체장 20cm 이하',
    features: '몸 옆면에 측선 5줄이 있으며 꼬리지느러미 뒷가장자리가 둥글거나 일직선이다.',
  },
  {
    id: 'fish_mackerel',
    name: '고등어',
    scientificName: 'Scomber japonicus',
    image: '/images/deep-ocean-hero.jpg',
    habitat: '동해·남해·제주 표층 및 연안 방파제 회유',
    edible: true,
    toxicity: '독성 없음 (신선도 저하 시 히스타민 주의)',
    fishingBan: '금어기 4~6월 중 1개월(수산자원관리법 기준) · 금지체장 21cm 이하',
    features: '등쪽에 청록색 물결무늬가 있고 배쪽은 은백색이다.',
  },
  {
    id: 'fish_puffer',
    name: '황복 · 복어류',
    scientificName: 'Takifugu obscurus',
    image: '/images/deep-ocean-hero.jpg',
    habitat: '서해·남해 하구 및 연안',
    edible: false,
    toxicity: '치명적 맹독 (테트로도톡신 - 일반인 자가 손질·섭취 절대 금지)',
    fishingBan: '전문 복어조리기능사 외 섭취 금지 대상',
    features: '위협을 받으면 배를 부풀리며 비늘이 없고 이빨이 부리처럼 융합되어 있다.',
  },
  {
    id: 'fish_lionfish',
    name: '쏠배감펭',
    scientificName: 'Pterois lunulata',
    image: '/images/deep-ocean-hero.jpg',
    habitat: '제주·남해 연안 암초대 및 항포구',
    edible: false,
    toxicity: '등·배·뒷지느러미 가시에 강한 신경독 보유 (맨손 접촉 금지)',
    fishingBan: '독성 주의 어종 (집게로 바늘 제거 후 방생 권장)',
    features: '화려한 적갈색 세로 줄무늬와 부채처럼 길게 뻗은 가슴·등지느러미가 특징.',
  },
];

export const INITIAL_FISHING_SPOTS: FishingSpot[] = [
  {
    id: 'spot_haeundae_mipo',
    name: '부산 미포 방파제 · 해운대 연안',
    region: '남해',
    location: '부산광역시 해운대구 중동 미포항 일대',
    lat: 35.1587,
    lng: 129.1704,
    description: '산책로와 난간이 정비되어 있어 가족·초보 낚시인이 원투·찌낚시를 안전하게 즐기기 좋은 항만 포인트.',
    targetFish: ['전갱이', '고등어', '볼락', '감성돔'],
    difficulty: '초급',
    safetyNote: '안전 난간 구간 위주 이용, 외항 테트라포드 진입 금지',
    facilities: ['공영주차장', '화장실', '낚시점', '편의점'],
  },
  {
    id: 'spot_gijang_daebyeon',
    name: '부산 기장 대변항 방파제',
    region: '남해',
    location: '부산광역시 기장군 기장읍 대변리',
    lat: 35.2266,
    lng: 129.2283,
    description: '수심이 적당하고 내항 파도가 잔잔해 생활낚시 대상어가 연중 잘 낚이는 대표 포인트.',
    targetFish: ['고등어', '학꽁치', '망상어', '우럭'],
    difficulty: '초급',
    safetyNote: '내항 안벽 안전선 준수 및 구명조끼 착용 필수',
    facilities: ['주차장', '화장실', '수산시장'],
  },
  {
    id: 'spot_yeosu_dolsan',
    name: '여수 돌산대교 수변공원 연안',
    region: '남해',
    location: '전라남도 여수시 돌산읍 우두리',
    lat: 34.7311,
    lng: 127.7347,
    description: '가로등과 보행 데크가 잘 갖춰진 수변 공원형 포인트로 초보자 야간 볼락·갈치 낚시 인기가 높음.',
    targetFish: ['볼락', '전갱이', '감성돔', '풀치'],
    difficulty: '초급',
    safetyNote: '조류 소통이 빠른 구간이므로 안전 난간 안쪽에서 캐스팅',
    facilities: ['공원주차장', '공중화장실', '가로등', '카페'],
  },
  {
    id: 'spot_tongyeong_sanyang',
    name: '통영 삼덕항 방파제',
    region: '남해',
    location: '경상남도 통영시 산양읍 삼덕리',
    lat: 34.8039,
    lng: 128.3822,
    description: '조수간만의 영향이 고르게 작용하며 초보자도 가벼운 채비로 다양한 어종을 노릴 수 있는 항구 포인트.',
    targetFish: ['호래기', '볼락', '감성돔', '고등어'],
    difficulty: '초급',
    safetyNote: '선박 입출항 항로 방향 원투 투척 금지',
    facilities: ['항만주차장', '화장실', '매점'],
  },
  {
    id: 'spot_incheon_yeonan',
    name: '인천 영종도 구읍뱃터 · 연안부두 친수공원',
    region: '서해',
    location: '인천광역시 중구 중산동 구읍뱃터 일원',
    lat: 37.4902,
    lng: 126.5829,
    description: '수도권에서 접근성이 뛰어난 서해 친수 데크·해변 공원으로 망둥어·우럭 생활낚시에 적합.',
    targetFish: ['우럭', '망둥어', '삼치', '숭어'],
    difficulty: '초급',
    safetyNote: '서해 조수간만 차가 크므로 갯벌·저지대 접근 금지',
    facilities: ['주차장', '화장실', '편의점', '음식점'],
  },
  {
    id: 'spot_taean_sinjin',
    name: '충남 태안 안흥항 · 신진도 낚시데크',
    region: '서해',
    location: '충청남도 태안군 근흥면 신진도리',
    lat: 36.6805,
    lng: 126.1342,
    description: '서해 대표 생활낚시 항구로 우럭·광어·주꾸미 시즌에 초보 낚시인이 많이 찾는 안전 권역.',
    targetFish: ['우럭', '놀래미', '광어', '주꾸미'],
    difficulty: '초급',
    safetyNote: '조류와 간조 시간 확인 후 낚시 자리 선택',
    facilities: ['공영주차장', '화장실', '낚시마트'],
  },
  {
    id: 'spot_gunsan_bieung',
    name: '군산 비응항 해넘이 방파제',
    region: '서해',
    location: '전북특별자치도 군산시 비응도동',
    lat: 35.9393,
    lng: 126.5293,
    description: '차량 접근이 편하고 낚시 전용 데크와 가로등이 정비된 서해 중남부 입문자 인기 포인트.',
    targetFish: ['우럭', '삼치', '학꽁치', '갈치'],
    difficulty: '초급',
    safetyNote: '강풍 시 외항 쪽 진입 자제, 내항 이용 권장',
    facilities: ['주차장', '화장실', '편의점'],
  },
  {
    id: 'spot_sokcho_jangsa',
    name: '속초 영금정 · 장사항 방파제',
    region: '동해',
    location: '강원특별자치도 속초시 장사동',
    lat: 38.2255,
    lng: 128.5919,
    description: '동해 청정 수역에서 가자미·임연수·황어를 노릴 수 있으며 산책 공원과 인접해 쾌적함.',
    targetFish: ['가자미', '황어', '쥐노래미', '고등어'],
    difficulty: '초급',
    safetyNote: '동해 너울성 파도 예보 시 즉시 철수',
    facilities: ['주차장', '화장실', '공원'],
  },
  {
    id: 'spot_gangneung_jumunjin',
    name: '강릉 주문진항 북방파제',
    region: '동해',
    location: '강원특별자치도 강릉시 주문진읍 주문리',
    lat: 37.8938,
    lng: 128.8312,
    description: '동해안 대표 생활낚시 항구로 계절별 고등어·무늬오징어·가자미 입질이 활발한 곳.',
    targetFish: ['가자미', '고등어', '학꽁치', '우럭'],
    difficulty: '초급',
    safetyNote: '미끄럼 방지 낚시화 및 구명조끼 착용 필수',
    facilities: ['어시장 주차장', '화장실', '편의점'],
  },
  {
    id: 'spot_pohang_yeongil',
    name: '포항 영일대 해상누각 · 구룡포항',
    region: '동해',
    location: '경상북도 포항시 북구 두호동 일원',
    lat: 36.0596,
    lng: 129.3814,
    description: '해수욕장 산책로와 항구 방파제가 연결되어 접근성과 편의시설이 우수한 동해 남부 포인트.',
    targetFish: ['고등어', '전갱이', '볼락', '가자미'],
    difficulty: '초급',
    safetyNote: '수영객·산책객 주변 캐스팅 각도 안전 확인',
    facilities: ['공영주차장', '화장실', '조명', '카페'],
  },
  {
    id: 'spot_jeju_aewol',
    name: '제주 애월항 · 한담 수변공원',
    region: '제주',
    location: '제주특별자치도 제주시 애월읍 애월리',
    lat: 33.4658,
    lng: 126.3145,
    description: '맑은 제주 바다에서 벵에돔·한치·전갱이를 공략할 수 있는 접근성 좋은 항구 포인트.',
    targetFish: ['전갱이', '벵에돔', '한치', '무늬오징어'],
    difficulty: '초급',
    safetyNote: '독성 어종(독가시치·쏠배감펭) 주의, 집게 지참 권장',
    facilities: ['주차장', '화장실', '편의점'],
  },
  {
    id: 'spot_jeju_seogwipo',
    name: '제주 서귀포항 · 새연교 수변',
    region: '제주',
    location: '제주특별자치도 서귀포시 서홍동',
    lat: 33.2371,
    lng: 126.5612,
    description: '새연교 산책로와 인접해 수심과 물색이 안정적이며 초보자 루어·찌낚시에 좋은 포인트.',
    targetFish: ['고등어', '한치', '벵에돔', '볼락'],
    difficulty: '초급',
    safetyNote: '선박 계류 구역 및 출입 제한 표지판 준수',
    facilities: ['공영주차장', '공중화장실', '조명'],
  },
];

export const INITIAL_CATCH_LOGS: CatchLog[] = [
  {
    id: 'log_init_1',
    speciesName: '참돔',
    userConfirmedName: '참돔 (36cm)',
    date: '2026-11-20',
    location: '부산 미포 방파제 · 해운대 연안',
    size: 36,
    released: false,
    memo: '오전 들물 타이밍에 크릴 미끼 찌낚시로 입질 확인. 금지체장 초과 개체로 신선 보관.',
    photoUrl: '/images/red-seabream.jpg',
    aiConfidence: 95,
  },
  {
    id: 'log_init_2',
    speciesName: '넙치 (광어)',
    userConfirmedName: '광어 치어',
    date: '2026-11-18',
    location: '태안 신진도 낚시데크',
    size: 28,
    released: true,
    memo: '금지체장(35cm 이하) 미달 개체라 젖은 손으로 바늘을 빼고 즉시 바다로 방생.',
    photoUrl: '/images/olive-flounder.jpg',
    aiConfidence: 93,
  },
];
