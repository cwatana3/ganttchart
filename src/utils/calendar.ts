import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns';
import type { Calendar } from '../types';

export function toDate(dateStr: string): Date {
  return parseISO(dateStr);
}

export function fromDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function isWorkingDay(dateStr: string, calendar: Calendar): boolean {
  const date = toDate(dateStr);
  const dayOfWeek = getDay(date); // 0=日曜
  if (!calendar.workingDays.includes(dayOfWeek)) return false;
  if (calendar.holidays.includes(dateStr)) return false;
  return true;
}

/**
 * startDate から duration 稼働日だけ進めた日付を返す。
 * startDate 自体はカウントに含めない。
 * duration = 0 の場合は startDate をそのまま返す。
 */
export function addWorkingDays(startDateStr: string, duration: number, calendar: Calendar): string {
  if (duration <= 0) return startDateStr;

  let current = toDate(startDateStr);
  let remaining = duration;

  while (remaining > 0) {
    current = addDays(current, 1);
    if (isWorkingDay(fromDate(current), calendar)) {
      remaining--;
    }
  }

  return fromDate(current);
}

/**
 * startDateStr から endDateStr までの稼働日数を返す（start, end 含む）。
 * startDateStr と endDateStr が同じ場合は 0 を返す。
 * endDate が startDate より前の場合も 0 を返す。
 */
export function countWorkingDays(startDateStr: string, endDateStr: string, calendar: Calendar): number {
  const start = toDate(startDateStr);
  const end = toDate(endDateStr);
  const totalDays = differenceInCalendarDays(end, start);

  if (totalDays <= 0) return 0;

  let count = 0;
  let current = start;
  for (let i = 0; i < totalDays; i++) {
    current = addDays(current, 1);
    if (isWorkingDay(fromDate(current), calendar)) {
      count++;
    }
  }

  return count;
}

/**
 * startDateStr から endDateStr の間の稼働日一覧を文字列配列で返す。
 * startDate, endDate を含む。
 */
export function getWorkingDaysBetween(startDateStr: string, endDateStr: string, calendar: Calendar): string[] {
  const start = toDate(startDateStr);
  const end = toDate(endDateStr);
  const totalDays = differenceInCalendarDays(end, start);
  const result: string[] = [];

  let current = start;
  for (let i = 0; i <= totalDays; i++) {
    const dateStr = fromDate(current);
    if (isWorkingDay(dateStr, calendar)) {
      result.push(dateStr);
    }
    current = addDays(current, 1);
  }

  return result;
}
