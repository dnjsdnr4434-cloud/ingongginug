export const MAX_DISPLAY_NAME_LEN = 50;
export const MAX_NICKNAME_LEN = 20;
export const MAX_PHOTO_URL_LEN = 500;
export const MAX_MESSAGE_LEN = 1000;

export function truncateToLength(text: string, maxLen: number): string {
  const clean = (text || '').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trim();
}

export function sortParticipantPair(uidA: string, uidB: string): [string, string] {
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

export function buildDmThreadId(uidA: string, uidB: string): string {
  const a = (uidA || '').trim();
  const b = (uidB || '').trim();
  if (!a || !b || a === b) {
    throw new Error('서로 다른 두 사용자 UID가 필요합니다.');
  }
  const [first, second] = sortParticipantPair(a, b);
  return `${first}__${second}`.slice(0, 128);
}

export function sanitizeMessageText(rawText: string): string {
  const clean = (rawText || '').trim();
  if (!clean) return '';
  return clean.slice(0, MAX_MESSAGE_LEN);
}

export function validateNicknameInput(raw: string): {
  valid: boolean;
  cleanNickname: string;
  error?: string;
} {
  const clean = (raw || '').trim().replace(/\s+/g, ' ');
  if (clean.length < 2) {
    return { valid: false, cleanNickname: clean, error: '닉네임은 최소 2자 이상 입력해 주세요.' };
  }
  if (clean.length > MAX_NICKNAME_LEN) {
    return {
      valid: false,
      cleanNickname: clean.slice(0, MAX_NICKNAME_LEN),
      error: `닉네임은 최대 ${MAX_NICKNAME_LEN}자까지 입력할 수 있습니다.`,
    };
  }
  return { valid: true, cleanNickname: clean };
}

export function validateNewOpenRoomInput(
  title: string,
  description: string
): { valid: boolean; cleanTitle: string; cleanDescription: string; error?: string } {
  const cleanTitle = truncateToLength(title, 60);
  const cleanDescription = truncateToLength(description || '바다낚시 정보 공유방', 200);
  if (cleanTitle.length < 2) {
    return {
      valid: false,
      cleanTitle,
      cleanDescription,
      error: '채팅방 제목은 2자 이상 입력해 주세요.',
    };
  }
  return { valid: true, cleanTitle, cleanDescription };
}

export function validatePrivateInviteCode(raw: string): {
  valid: boolean;
  code: string;
  error?: string;
} {
  const code = (raw || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,20}$/.test(code)) {
    return {
      valid: false,
      code,
      error: '초대 코드는 4~20자의 영문 대문자·숫자·하이픈만 사용할 수 있습니다.',
    };
  }
  return { valid: true, code };
}

export function generateInviteCode(length: number = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const BAD_WORDS = [
  '씨발',
  '시발',
  '병신',
  '개새끼',
  '존나',
  '미친놈',
  'fuck',
  'shit',
  'bitch',
  'asshole',
];

export function maskProfanity(text: string): {
  maskedText: string;
  hasProfanity: boolean;
} {
  let out = text || '';
  let found = false;
  for (const word of BAD_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    if (regex.test(out)) {
      found = true;
      out = out.replace(regex, (m) => '*'.repeat(m.length));
    }
  }
  return { maskedText: out, hasProfanity: found };
}
