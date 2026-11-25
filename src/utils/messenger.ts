import type { SeaRegion } from './geo';

export const MAX_DISPLAY_NAME_LEN = 50;
export const MAX_PHOTO_URL_LEN = 500;
export const MAX_ROOM_TITLE_LEN = 60;
export const MAX_ROOM_DESC_LEN = 200;
export const MAX_MESSAGE_TEXT_LEN = 1000;
export const MAX_PREVIEW_LEN = 300;
export const MAX_SPOT_NAME_LEN = 100;

export interface ChatUserSummary {
  uid: string;
  displayName: string;
  photoURL: string;
  favoriteRegion?: '전체' | SeaRegion;
}

export interface DefaultOpenRoomSeed {
  roomId: string;
  title: string;
  region: '전체' | SeaRegion;
  description: string;
  welcomeMessage: string;
}

export const DEFAULT_OPEN_ROOMS: DefaultOpenRoomSeed[] = [
  {
    roomId: 'open_beginner_nationwide',
    title: '초보 낚시인 안전·포인트 질문방',
    region: '전체',
    description: '방파제·낚시공원 추천, 채비 선택, 구명조끼 안전 수칙 등 초보자 누구나 편하게 묻고 답하는 오픈채팅입니다.',
    welcomeMessage: '환영합니다! 오늘 출조 예정 포인트나 초보자 채비 궁금증을 자유롭게 공유해 주세요.',
  },
  {
    roomId: 'open_busan_namhae_live',
    title: '남해·부산 실시간 조황 공유방',
    region: '남해',
    description: '부산·거제·통영·여수 해역의 물때, 미끼 반응, 방생 캠페인을 나누는 공개 방입니다.',
    welcomeMessage: '남해권 출조 정보 및 오늘 잡힌 어종·수온 소식을 나눠주세요!',
  },
  {
    roomId: 'open_east_west_jeju_club',
    title: '동해·서해·제주 원정 정보방',
    region: '동해',
    description: '동해 방파제, 서해 루어/쭈꾸미, 제주 갯바위·방파제 출조 정보를 교류합니다.',
    welcomeMessage: '동해·서해·제주 낚시 포인트 최신 상황과 금어기 유의사항을 공유해요.',
  },
];

export function truncateToLength(value: string, maxLen: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
}

export function sanitizeMessageText(raw: string): string {
  return truncateToLength(raw, MAX_MESSAGE_TEXT_LEN);
}

export function buildDmThreadId(uidA: string, uidB: string): string {
  const a = uidA.trim();
  const b = uidB.trim();
  if (!a || !b || a === b) {
    throw new Error('1:1 개인 메시지를 위해서는 서로 다른 두 사용자 UID가 필요합니다.');
  }
  const [first, second] = a < b ? [a, b] : [b, a];
  const threadId = `${first}__${second}`;
  if (threadId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(threadId)) {
    throw new Error('유효하지 않은 대화방 ID 형식입니다.');
  }
  return threadId;
}

export function sortParticipantPair<T extends { uid: string }>(u1: T, u2: T): [T, T] {
  return u1.uid < u2.uid ? [u1, u2] : [u2, u1];
}

export function validateNewOpenRoomInput(
  title: string,
  description: string
): { valid: boolean; error?: string; cleanTitle: string; cleanDescription: string } {
  const cleanTitle = truncateToLength(title, MAX_ROOM_TITLE_LEN);
  const cleanDescription = truncateToLength(description, MAX_ROOM_DESC_LEN);

  if (cleanTitle.length < 2) {
    return {
      valid: false,
      error: '오픈채팅방 이름은 2자 이상 입력해주세요.',
      cleanTitle,
      cleanDescription,
    };
  }
  if (cleanDescription.length < 1) {
    return {
      valid: false,
      error: '오픈채팅방 소개를 입력해주세요.',
      cleanTitle,
      cleanDescription,
    };
  }
  return {
    valid: true,
    cleanTitle,
    cleanDescription,
  };
}

export const MAX_NICKNAME_LEN = 20;
export const MIN_NICKNAME_LEN = 2;

export function validateNicknameInput(raw: string): {
  valid: boolean;
  error?: string;
  cleanNickname: string;
} {
  const cleanNickname = truncateToLength(raw, MAX_DISPLAY_NAME_LEN);
  if (cleanNickname.length < MIN_NICKNAME_LEN) {
    return {
      valid: false,
      error: `닉네임은 ${MIN_NICKNAME_LEN}자 이상 입력해 주세요.`,
      cleanNickname,
    };
  }
  if (cleanNickname.length > MAX_NICKNAME_LEN) {
    return {
      valid: false,
      error: `닉네임은 ${MAX_NICKNAME_LEN}자 이하로 입력해 주세요.`,
      cleanNickname: cleanNickname.slice(0, MAX_NICKNAME_LEN),
    };
  }
  return {
    valid: true,
    cleanNickname,
  };
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validatePrivateInviteCode(raw: string): {
  valid: boolean;
  error?: string;
  code: string;
} {
  const code = normalizeInviteCode(raw);
  if (code.length < 4 || code.length > 20) {
    return {
      valid: false,
      error: '비공개 방 초대 코드는 4~20자로 입력해 주세요.',
      code,
    };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
    return {
      valid: false,
      error: '초대 코드는 영문, 숫자, -, _만 사용할 수 있습니다.',
      code,
    };
  }
  return { valid: true, code };
}

export function generateInviteCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const ROOM_HIDDEN_PREVIEW_TEXT = '방에 참여한 사람만 메시지 내용을 확인할 수 있습니다.';
export const ROOM_UPDATED_STATUS_TEXT = '새 메시지가 등록되었습니다 (참여자 전용 열람)';

export const BEGINNER_CHAT_PROMPTS: string[] = [
  '초보자인데 오늘 이 근방 안전한 방파제 포인트 추천 부탁드려요!',
  '방파제 원투/찌낚시 미끼는 어떤 게 잘 먹힐까요?',
  '방금 잡은 물고기 방생 기준이나 손질 팁 아시는 분 계신가요?',
];

const PROFANITY_REGEX = new RegExp(
  [
    // Korean explicit profanity & variations (carefully scoped to avoid fishing terms like 조기, 새우, 개불, 보였, 먹였, 미친 손맛)
    '씨[\\s\\-_.*]*발(?:놈|년|넘|새끼|것)?',
    '시[\\s\\-_.*]*발(?:놈|년|넘|새끼|것)?',
    '씨[\\s\\-_.*]*빨(?:놈|년)?',
    '씨[\\s\\-_.*]*팔',
    '시[\\s\\-_.*]*팔',
    '씨[\\s\\-_.*]*바(?:랄|놈|년)?',
    'ㅆㅂ',
    'ㅅㅂ',
    'ㅄ',
    'ㅂㅅ',
    'ㅈㄹ',
    'ㅁㅊ',
    '병[\\s\\-_.*]*신(?:아|놈|년|같)?',
    '지[\\s\\-_.*]*랄(?:하네|맞|염병|이네)?',
    '개[\\s\\-_.*]*새[\\s\\-_.*]*끼',
    '새[\\s\\-_.*]*끼(?:야|들|가)?',
    '개[\\s\\-_.*]*색(?:기|히)?',
    '개[\\s\\-_.*]*같(?:은|네|이)',
    '개[\\s\\-_.*]*소리',
    '미친[\\s\\-_.*]*(?:놈|년|새끼|짓|것)',
    '존[\\s\\-_.*]*나',
    '졸[\\s\\-_.*]*라',
    '좆(?:같|까|밥|만)?',
    '엿[\\s\\-_.*]*(?:먹어|먹으라|같)',
    '닥[\\s\\-_.*]*쳐',
    '꺼[\\s\\-_.*]*져',
    '호[\\s\\-_.*]*로[\\s\\-_.*]*(?:새끼|자식|놈)',
    '느[\\s\\-_.*]*금[\\s\\-_.*]*마',
    '니[\\s\\-_.*]*애[\\s\\-_.*]*미',
    '엠[\\s\\-_.*]*창',
    '썅(?:놈|년)?',
    '염[\\s\\-_.*]*병(?:할)?',
    '걸[\\s\\-_.*]*레[\\s\\-_.*]*(?:같은|년)',
    '창[\\s\\-_.*]*녀',
    '쓰[\\s\\-_.*]*레[\\s\\-_.*]*기[\\s\\-_.*]*같',
    // English profanity (word-bounded)
    '\\bfuck(?:ing|ed|er|ers|s)?\\b',
    '\\bshit(?:ty|ting|s)?\\b',
    '\\bbitch(?:es|y)?\\b',
    '\\basshole(?:s)?\\b',
    '\\bbastard(?:s)?\\b',
    '\\bcunt(?:s)?\\b',
    '\\bdick(?:head|s)?\\b',
  ].join('|'),
  'gi'
);

export function maskProfanity(raw: string): { masked: string; hasProfanity: boolean } {
  if (!raw) return { masked: '', hasProfanity: false };
  let hasProfanity = false;
  const masked = raw.replace(PROFANITY_REGEX, (matched) => {
    hasProfanity = true;
    return '*'.repeat(Math.max(1, matched.length));
  });
  return { masked, hasProfanity };
}

export function maskProfanityText(raw: string): string {
  return maskProfanity(raw).masked;
}

export function sanitizeAndMaskMessageText(raw: string): {
  text: string;
  hadProfanity: boolean;
} {
  const sanitized = sanitizeMessageText(raw);
  const { masked, hasProfanity } = maskProfanity(sanitized);
  return {
    text: truncateToLength(masked, MAX_MESSAGE_TEXT_LEN),
    hadProfanity: hasProfanity,
  };
}

export function canDeleteRoom(roomCreatedBy: string, currentUid?: string | null): boolean {
  return Boolean(currentUid && roomCreatedBy && roomCreatedBy === currentUid);
}

export function canReadRoomMessages(
  isJoinedMember: boolean,
  currentUid?: string | null
): boolean {
  return Boolean(currentUid && isJoinedMember);
}

export function canDeleteRoomMessage(
  senderId: string,
  roomCreatedBy: string,
  currentUid?: string | null
): boolean {
  if (!currentUid) return false;
  return senderId === currentUid || roomCreatedBy === currentUid;
}

export function canDeleteDmMessage(
  senderId: string,
  participantUids: string[],
  currentUid?: string | null
): boolean {
  if (!currentUid) return false;
  return senderId === currentUid && participantUids.includes(currentUid);
}


