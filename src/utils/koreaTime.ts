const KST_TIMEZONE = 'Asia/Seoul';

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface KstParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  weekday: string;
}

export function getKstParts(date: Date = new Date()): KstParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: KST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  // Handle midnight hour formatting edge case ("24" in some engines)
  const rawHour = lookup.hour === '24' ? '00' : (lookup.hour ?? '00');

  const weekdayMap: Record<string, string> = {
    Sun: WEEKDAYS_KO[0],
    Mon: WEEKDAYS_KO[1],
    Tue: WEEKDAYS_KO[2],
    Wed: WEEKDAYS_KO[3],
    Thu: WEEKDAYS_KO[4],
    Fri: WEEKDAYS_KO[5],
    Sat: WEEKDAYS_KO[6],
  };

  return {
    year: lookup.year ?? '2026',
    month: lookup.month ?? '01',
    day: lookup.day ?? '01',
    hour: rawHour,
    minute: lookup.minute ?? '00',
    second: lookup.second ?? '00',
    weekday: weekdayMap[lookup.weekday ?? ''] ?? '일',
  };
}

/**
 * Returns YYYY-MM-DD in Korea Standard Time (Asia/Seoul).
 */
export function getKstIsoDate(date: Date = new Date()): string {
  const p = getKstParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Returns human-readable Korean date + time string in KST.
 * e.g. "2026년 11월 21일 (토) 20:18:30 KST"
 */
export function formatKstDateTime(date: Date = new Date()): string {
  const p = getKstParts(date);
  return `${p.year}년 ${Number(p.month)}월 ${Number(p.day)}일 (${p.weekday}) ${p.hour}:${p.minute}:${p.second} KST`;
}

/**
 * Returns compact HH:mm KST string.
 */
export function formatKstTimeShort(date: Date = new Date()): string {
  const p = getKstParts(date);
  return `${p.hour}:${p.minute} KST`;
}

/**
 * Returns fishing time-of-day advisory in KST.
 */
export function getKstFishingWindowLabel(date: Date = new Date()): string {
  const hour = Number(getKstParts(date).hour);
  if (hour >= 5 && hour < 9) return '새벽~오전 물때 (동트기 전후 피딩 타임)';
  if (hour >= 9 && hour < 16) return '주간 낚시 시간대 (조류 및 수심 공략)';
  if (hour >= 16 && hour < 20) return '해질녘 피딩 타임 (노을 입질 집중)';
  return '야간 낚시 시간대 (안전등·구명조끼 필수)';
}
