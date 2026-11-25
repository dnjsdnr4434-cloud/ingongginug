export interface FishSpecies {
  id: string;
  name: string;
  scientificName: string;
  category: '도미류' | '농어/볼락류' | '저서어류' | '회유어류' | '두족류' | '기타/주의';
  averageSize: string;
  habitat: string;
  features: string;
  edible: boolean;
  toxicity: string;
  fishingBan: string;
  recipe: string;
  isProtected: boolean;
  image: string;
}

export interface FishingSpot {
  id: string;
  region: '동해' | '서해' | '남해' | '제주';
  name: string;
  location: string;
  targetFish: string[];
  depth: string;
  bestSeason: string;
  tips: string;
  lat: number;
  lng: number;
}

export interface CatchLog {
  id: string;
  speciesName: string;
  userConfirmedName: string;
  date: string;
  location: string;
  size: number; // cm
  released: boolean;
  memo: string;
  photoUrl?: string;
  aiConfidence?: number;
}

export const INITIAL_FISH_ENCYCLOPEDIA: FishSpecies[] = [
  {
    id: 'f1',
    name: '참돔 (Red Seabream)',
    scientificName: 'Pagrus major',
    category: '도미류',
    averageSize: '30cm ~ 60cm',
    habitat: '수심 30~100m의 모래 및 암반 지역',
    features: '체색은 선명한 홍색이며 몸에 푸른빛의 작은 반점이 산재해 있습니다. 등지느러미가 길고 날카롭습니다.',
    edible: true,
    toxicity: '독성 없음',
    fishingBan: '금어기 없음 (일부 지자체 자율 조절)',
    recipe: '껍질을 살짝 데친 돔마츠카와(숙성회), 소금구이, 맑은 지리탕이 일품입니다.',
    isProtected: false,
    image: '/images/red-seabream.jpg'
  },
  {
    id: 'f2',
    name: '감성돔 (Black Porgy)',
    scientificName: 'Acanthopagrus schlegelii',
    category: '도미류',
    averageSize: '25cm ~ 50cm',
    habitat: '연안 암반 지대, 갯바위, 방파제 주변',
    features: '전체적으로 은회색 또는 흑색을 띠며 입이 뾰족하고 강한 이빨을 가졌습니다.',
    edible: true,
    toxicity: '독성 없음',
    fishingBan: '금어기: 5/1 ~ 5/31 (일부 지역)',
    recipe: '쫄깃한 식감의 활어회, 매콤 칼칼한 매운탕, 굽기 요리에 적합합니다.',
    isProtected: false,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Acanthopagrus_schlegelii_by_OpenCage.jpg/640px-Acanthopagrus_schlegelii_by_OpenCage.jpg'
  },
  {
    id: 'f3',
    name: '넙치 / 광어 (Olive Flounder)',
    scientificName: 'Paralichthys olivaceus',
    category: '저서어류',
    averageSize: '40cm ~ 80cm',
    habitat: '모래 바닥 및 사니질 지대',
    features: '두 눈이 왼쪽에 몰려 있으며 몸이 납작합니다. 보호색 능력이 뛰어납니다.',
    edible: true,
    toxicity: '독성 없음',
    fishingBan: '금어기: 5/1 ~ 5/31, 금지체장: 35cm 이하 포획 금지',
    recipe: '국민 횟감 1순위. 광어회, 초밥, 미역국, 튀김',
    isProtected: false,
    image: '/images/olive-flounder.jpg'
  },
  {
    id: 'f4',
    name: '조피볼락 / 우럭 (Rockfish)',
    scientificName: 'Sebastes schlegelii',
    category: '농어/볼락류',
    averageSize: '25cm ~ 45cm',
    habitat: '암초 지대, 방파제 테트라포드(TTP)',
    features: '머리에 강한 가시가 있으며 입이 크고 암갈색 또는 흑갈색 무늬가 있습니다.',
    edible: true,
    toxicity: '독성 없음',
    fishingBan: '금어기 없음',
    recipe: '우럭 매운탕의 절대 강자! 찜, 구이, 통우럭탕',
    isProtected: false,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Sebastes_schlegelii_2012_G1.jpg/640px-Sebastes_schlegelii_2012_G1.jpg'
  },
  {
    id: 'f5',
    name: '졸복 (Pufferfish)',
    scientificName: 'Takifugu vermicularis',
    category: '기타/주의',
    averageSize: '15cm ~ 25cm',
    habitat: '연안 모래 및 모래갯벌 지역',
    features: '몸에 작은 돌기가 있으며 위협을 느끼면 물이나 공기를 마셔 몸을 부풀립니다.',
    edible: true,
    toxicity: '맹독 주의 (내장, 난소, 껍질에 테트로도톡신 함유 - 전문 자격 소지자만 손질 필수)',
    fishingBan: '금어기 없음',
    recipe: '반드시 복어 전문 조리사 면허 소지자가 내장을 완벽히 제거한 후 맑은탕(지리)으로 조리해야 합니다. 일반인 자가 손질 절대 금지!',
    isProtected: false,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Takifugu_niphobles_in_Toba_Aquarium.jpg/640px-Takifugu_niphobles_in_Toba_Aquarium.jpg'
  },
  {
    id: 'f6',
    name: '돌돔 (Striped Beakfish)',
    scientificName: 'Oplegnathus fasciatus',
    category: '도미류',
    averageSize: '30cm ~ 50cm',
    habitat: '거친 갯바위 및 수중 암초',
    features: '주둥이가 새의 부리처럼 단단하며 검은색 7줄의 수직 줄무늬가 특징입니다. (대물은 단색으로 변함)',
    edible: true,
    toxicity: '독성 없음',
    fishingBan: '금어기: 5/1 ~ 6/30, 금지체장: 24cm 이하 금지',
    recipe: '최고급 횟감. 단단한 살집과 고소한 감칠맛, 돌돔 껍질회 및 맑은탕',
    isProtected: false,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Oplegnathus_fasciatus_Toba.jpg/640px-Oplegnathus_fasciatus_Toba.jpg'
  },
  {
    id: 'f7',
    name: '고등어 (Chub Mackerel)',
    scientificName: 'Scomber japonicus',
    category: '회유어류',
    averageSize: '25cm ~ 40cm',
    habitat: '외해 및 연안 표층을 무리지어 회유',
    features: '등쪽에 물결 모양의 청록색 불규칙한 무늬가 있으며 방추형의 날렵한 체형입니다.',
    edible: true,
    toxicity: '부패 시 히스타민 식중독 주의 (신선할 때 즉시 섭취)',
    fishingBan: '금어기: 4/1 ~ 5/31 (대형선망 등), 금지체장: 21cm 이하 금지',
    recipe: '고등어 묵은지조림, 바삭한 소금구이, 제철 고등어회',
    isProtected: false,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Scomber_japonicus_in_aquarium.jpg/640px-Scomber_japonicus_in_aquarium.jpg'
  },
  {
    id: 'f8',
    name: '남방해마 (Seahorse)',
    scientificName: 'Hippocampus kuda',
    category: '기타/주의',
    averageSize: '10cm ~ 15cm',
    habitat: '해초류가 우거진 연안 및 산호초',
    features: '말을 닮은 머리와 꼿꼿한 직립 자세, 말려있는 꼬리를 가졌습니다.',
    edible: false,
    toxicity: '식용 불가',
    fishingBan: '해양보호생물 지정종 (포획 및 포획 시 즉시 방생 필수)',
    recipe: '포획 금지 및 해양보호생물입니다. 식용할 수 없으며 발견 시 즉시 바다로 돌려보내야 합니다.',
    isProtected: true,
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Hippocampus_kuda_2.jpg/640px-Hippocampus_kuda_2.jpg'
  }
];

export const INITIAL_FISHING_SPOTS: FishingSpot[] = [
  {
    id: 's1',
    region: '동해',
    name: '속초 대포항 방파제',
    location: '강원 속초시 대포동',
    targetFish: ['우럭', '놀래미', '고등어', '오징어'],
    depth: '5m ~ 12m',
    bestSeason: '가을 ~ 초겨울',
    tips: '테트라포드 안전사고 주의. 원투낚시 및 루어낚시(메탈지그)에 활발한 입질.',
    lat: 38.1731,
    lng: 128.6111
  },
  {
    id: 's5',
    region: '동해',
    name: '강릉 주문진항 방파제',
    location: '강원 강릉시 주문진읍',
    targetFish: ['가자미', '학꽁치', '방어', '도다리'],
    depth: '6m ~ 14m',
    bestSeason: '봄, 가을',
    tips: '방파제 외항 쪽 조류 소통이 원활하여 찌낚시와 원투낚시 모두 인기가 높습니다.',
    lat: 37.8936,
    lng: 128.8312
  },
  {
    id: 's2',
    region: '서해',
    name: '태안 안면도 오천항 갯바위',
    location: '충남 태안군 안면읍',
    targetFish: ['광어', '우럭', '주꾸미', '갑오징어'],
    depth: '4m ~ 15m',
    bestSeason: '봄, 가을 (산란기 및 주꾸미 시즌)',
    tips: '물때(조류의 세기)에 따라 조과의 차이가 큼. 3물~5물이 낚시하기 가장 좋음.',
    lat: 36.4408,
    lng: 126.5194
  },
  {
    id: 's6',
    region: '서해',
    name: '인천 영흥도 진두항 방파제',
    location: '인천 옹진군 영흥면',
    targetFish: ['우럭', '광어', '망둥어', '삼치'],
    depth: '5m ~ 13m',
    bestSeason: '봄 ~ 늦가을',
    tips: '수도권 접근성이 뛰어나며 들물 시간대 방파제 끝단에서 조황이 좋습니다.',
    lat: 37.2569,
    lng: 126.4981
  },
  {
    id: 's3',
    region: '남해',
    name: '여수 거문도 갯바위',
    location: '전남 여수시 삼산면 거문리',
    targetFish: ['참돔', '감성돔', '돌돔', '벵에돔'],
    depth: '10m ~ 30m',
    bestSeason: '가을 ~ 봄',
    tips: '대물 감성돔과 참돔의 성지. 구멍찌 낚시와 릴 찌낚시 채비 필수.',
    lat: 34.0258,
    lng: 127.3052
  },
  {
    id: 's7',
    region: '남해',
    name: '부산 태종대·영도 갯바위',
    location: '부산 영도구 동삼동',
    targetFish: ['감성돔', '볼락', '고등어', '전갱이'],
    depth: '8m ~ 20m',
    bestSeason: '가을 ~ 겨울',
    tips: '수심이 깊고 조류가 살아있어 밤 볼락 루어와 찌낚시가 잘 됩니다.',
    lat: 35.0518,
    lng: 129.0875
  },
  {
    id: 's4',
    region: '제주',
    name: '제주시 차귀도 선상·갯바위 포인트',
    location: '제주시 한경면 고산리 앞바다',
    targetFish: ['참돔', '다금바리', '붉바리', '한치'],
    depth: '20m ~ 50m',
    bestSeason: '연중 (여름 한치, 가을 참돔)',
    tips: '조류가 강하므로 무거운 봉돌과 전용 선상 채비 준비.',
    lat: 33.3114,
    lng: 126.1462
  },
  {
    id: 's8',
    region: '제주',
    name: '서귀포 모슬포항 방파제',
    location: '제주 서귀포시 대정읍',
    targetFish: ['방어', '부시리', '벵에돔', '무늬오징어'],
    depth: '8m ~ 18m',
    bestSeason: '가을 ~ 겨울 (방어 시즌)',
    tips: '제주 남부 대표 포인트. 에깅 및 찌낚시로 벵에돔과 무늬오징어를 노리기 좋습니다.',
    lat: 33.2165,
    lng: 126.2512
  },
  {
    id: 's9',
    region: '남해',
    name: '부산 해운대 미포·청사포 방파제',
    location: '부산 해운대구 중동',
    targetFish: ['전갱이', '고등어', '볼락', '학꽁치'],
    depth: '4m ~ 9m',
    bestSeason: '봄 ~ 늦가을',
    tips: '발판이 평탄한 내항 구역과 가로등 주변 야간 볼락·전갱이 생활낚시 입문 추천 포인트.',
    lat: 35.1589,
    lng: 129.1708
  },
  {
    id: 's10',
    region: '남해',
    name: '부산 기장 대변항 방파제',
    location: '부산 기장군 기장읍',
    targetFish: ['고등어', '전갱이', '감성돔', '망상어'],
    depth: '5m ~ 11m',
    bestSeason: '사계절 (가을 고등어 시즌)',
    tips: '주차와 편의시설이 가깝고 방파제 내항 쪽 발판이 넓어 초보자 가족 출조지로 좋습니다.',
    lat: 35.2229,
    lng: 129.2314
  },
  {
    id: 's11',
    region: '남해',
    name: '거제 지세포항 방파제·해양공원',
    location: '경남 거제시 일운면',
    targetFish: ['전갱이', '감성돔', '볼락', '무늬오징어'],
    depth: '5m ~ 12m',
    bestSeason: '봄 ~ 겨울',
    tips: '방파제 내항과 수변 데크가 안전하게 정비되어 있어 초보 원투·찌낚시에 좋습니다.',
    lat: 34.8321,
    lng: 128.7046
  },
  {
    id: 's12',
    region: '남해',
    name: '통영 강구안·삼덕항 방파제',
    location: '경남 통영시 산양읍',
    targetFish: ['볼락', '호래기', '전갱이', '감성돔'],
    depth: '4m ~ 10m',
    bestSeason: '가을 ~ 봄',
    tips: '잔잔한 내만 항구 포인트로 바람 영향을 덜 받아 초보자가 가볍게 즐기기 좋습니다.',
    lat: 34.7988,
    lng: 128.3782
  },
  {
    id: 's13',
    region: '남해',
    name: '여수 종포·소호동 해양공원 선착장',
    location: '전남 여수시 종화동',
    targetFish: ['갈치', '갑오징어', '볼락', '전갱이'],
    depth: '4m ~ 9m',
    bestSeason: '여름 ~ 늦가을',
    tips: '조명과 안전 난간이 잘 갖춰진 야간 생활낚시·루어 입문 명소입니다.',
    lat: 34.7388,
    lng: 127.7429
  },
  {
    id: 's14',
    region: '서해',
    name: '인천 월미도·소래포구 친수 선착장',
    location: '인천 중구 북성동',
    targetFish: ['망둥어', '우럭', '숭어', '삼치'],
    depth: '4m ~ 10m',
    bestSeason: '봄 ~ 가을',
    tips: '안전 난간이 설치된 수변 데크 구간이 있어 수도권 초보 낚시인의 원투·릴찌 입문에 좋습니다.',
    lat: 37.4754,
    lng: 126.5972
  },
  {
    id: 's15',
    region: '서해',
    name: '시흥 오이도 방파제·빨강등대 선착장',
    location: '경기도 시흥시 정왕동',
    targetFish: ['망둥어', '우럭', '숭어', '쭈꾸미'],
    depth: '3m ~ 8m',
    bestSeason: '봄 ~ 가을',
    tips: '들물 전후 2시간이 핵심 입질 시간대이며 간조 시 갯벌 진입은 피하세요.',
    lat: 37.3455,
    lng: 126.6873
  },
  {
    id: 's16',
    region: '서해',
    name: '화성 궁평항 피싱피어 낚시공원',
    location: '경기도 화성시 서신면',
    targetFish: ['망둥어', '우럭', '숭어', '보리멸'],
    depth: '3m ~ 7m',
    bestSeason: '봄 ~ 늦가을',
    tips: '바다 위로 뻗은 안전 난간형 낚시 데크로 어린이·초보자도 안전하게 원투를 즐길 수 있습니다.',
    lat: 37.1149,
    lng: 126.6789
  },
  {
    id: 's17',
    region: '서해',
    name: '보령 대천항 방파제',
    location: '충남 보령시 신흑동',
    targetFish: ['우럭', '광어', '주꾸미', '갑오징어'],
    depth: '5m ~ 11m',
    bestSeason: '봄, 가을',
    tips: '방파제 내항 측 발판이 평탄하며 조류가 약한 조금·무시 물때가 초보자에게 유리합니다.',
    lat: 36.3274,
    lng: 126.5048
  },
  {
    id: 's18',
    region: '서해',
    name: '군산 비응항 방파제·낚시공원',
    location: '전북 군산시 비응도동',
    targetFish: ['우럭', '갑오징어', '삼치', '전갱이'],
    depth: '5m ~ 13m',
    bestSeason: '여름 ~ 늦가을',
    tips: '주차장과 방파제가 바로 인접해 접근성이 우수하며 카드채비·원투 모두 잘 됩니다.',
    lat: 35.9412,
    lng: 126.5269
  },
  {
    id: 's19',
    region: '동해',
    name: '양양 남애항 방파제',
    location: '강원 양양군 현남면',
    targetFish: ['가자미', '우럭', '놀래미', '학꽁치'],
    depth: '5m ~ 10m',
    bestSeason: '봄 ~ 가을',
    tips: '수심이 완만하고 항내 물이 맑아 갯지렁이 원투와 가벼운 민장대 낚시에 적합합니다.',
    lat: 37.9445,
    lng: 128.7875
  },
  {
    id: 's20',
    region: '동해',
    name: '삼척 임원항 방파제',
    location: '강원 삼척시 원덕읍',
    targetFish: ['우럭', '고등어', '학꽁치', '무늬오징어'],
    depth: '6m ~ 12m',
    bestSeason: '여름 ~ 초겨울',
    tips: '동해 남부 대표 생활낚시 항구로 방파제 내항 쪽에서 초보도 안정적으로 낚시할 수 있습니다.',
    lat: 37.2278,
    lng: 129.3452
  },
  {
    id: 's21',
    region: '동해',
    name: '포항 구룡포항·영일대 방파제',
    location: '경북 포항시 남구 구룡포읍',
    targetFish: ['고등어', '전갱이', '볼락', '학꽁치'],
    depth: '5m ~ 12m',
    bestSeason: '사계절',
    tips: '항내 석축과 방파제가 넓어 가족 단위 생활낚시 및 카드채비 입문에 인기입니다.',
    lat: 35.9899,
    lng: 129.5586
  },
  {
    id: 's22',
    region: '제주',
    name: '제주시 탑동·사라봉 방파제',
    location: '제주 제주시 건입동',
    targetFish: ['한치', '전갱이', '고등어', '벵에돔'],
    depth: '5m ~ 11m',
    bestSeason: '여름 ~ 겨울',
    tips: '공항·시내 접근성이 뛰어나고 가로등이 밝아 초보자 야간 생활낚시로 추천합니다.',
    lat: 33.5194,
    lng: 126.5297
  },
  {
    id: 's23',
    region: '제주',
    name: '서귀포 성산포항 방파제',
    location: '제주 서귀포시 성산읍',
    targetFish: ['무늬오징어', '전갱이', '고등어', '독가시치'],
    depth: '6m ~ 14m',
    bestSeason: '가을 ~ 봄',
    tips: '성산일출봉 조망이 뛰어난 항구 내항 포인트로 초보 에깅·찌낚시 입문에 좋습니다.',
    lat: 33.4733,
    lng: 126.9317
  }
];

export const INITIAL_CATCH_LOGS: CatchLog[] = [
  {
    id: 'cl1',
    speciesName: '참돔 (Red Seabream)',
    userConfirmedName: '참돔',
    date: '2026-10-14',
    location: '여수 거문도 갯바위',
    size: 42,
    released: false,
    memo: '아침 찬바람 불 때 릴 찌낚시로 올린 멋진 42cm 참돔! 손맛 최고.',
    aiConfidence: 98,
    photoUrl: '/images/red-seabream.jpg'
  },
  {
    id: 'cl2',
    speciesName: '넙치 / 광어 (Olive Flounder)',
    userConfirmedName: '광어',
    date: '2026-11-02',
    location: '태안 안면도',
    size: 38,
    released: false,
    memo: '다운샷 웜 채비로 바닥을 쿵쿵 찍다가 덜컥 물어준 고마운 광어.',
    aiConfidence: 95,
    photoUrl: '/images/olive-flounder.jpg'
  }
];
