export interface KstParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  weekday: string;
  isoDate: string;
  isoHourPrefix: string;
  monthNum: number;
  dayNum: number;
  hourNum: number;
}

const WEEKDAY_MAP: Record<string, string> = {
  Sun: '일',
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
};

export function getKstParts(date: Date = new Date()): KstParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const partsMap: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    partsMap[part.type] = part.value;
  }

  const year = partsMap.year || '2026';
  const month = partsMap.month || '01';
  const day = partsMap.day || '01';
  const rawHour = partsMap.hour === '24' ? '00' : partsMap.hour || '00';
  const minute = partsMap.minute || '00';
  const second = partsMap.second || '00';
  const weekday = WEEKDAY_MAP[partsMap.weekday || ''] || '';
  const isoDate = `${year}-${month}-${day}`;

  return {
    year,
    month,
    day,
    hour: rawHour,
    minute,
    second,
    weekday,
    isoDate,
    isoHourPrefix: `${isoDate}T${rawHour}`,
    monthNum: Number(month),
    dayNum: Number(day),
    hourNum: Number(rawHour),
  };
}

export function getKstIsoDate(date: Date = new Date()): string {
  return getKstParts(date).isoDate;
}

export function formatKstDateTime(date: Date = new Date()): string {
  const p = getKstParts(date);
  const wd = p.weekday ? ` (${p.weekday})` : '';
  return `${p.year}.${p.month}.${p.day}${wd} ${p.hour}:${p.minute}:${p.second}`;
}

export function formatKstTimeShort(date: Date = new Date()): string {
  const p = getKstParts(date);
  return `${p.hour}:${p.minute} KST`;
}

export function getKstFishingWindowLabel(date: Date = new Date()): string {
  const h = getKstParts(date).hourNum;
  if (h >= 5 && h < 8) return '해뜨는 여명 · 피딩 골든타임';
  if (h >= 8 && h < 12) return '오전 쾌적 출조 시간대';
  if (h >= 12 && h < 16) return '주간 햇빛·수온 안정 구간';
  if (h >= 16 && h < 19) return '해질녘 피딩 타임 · 시야 유의';
  if (h >= 19 && h < 23) return '야간 원투·볼락 타임 (안전등 필수)';
  return '심야 해안 안전 주의 시간대';
}
