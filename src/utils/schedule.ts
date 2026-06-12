import { addDays } from 'date-fns';
import type { Calendar, DependencyRef, Task } from '../types';
import { addWorkingDays, fromDate, isWorkingDay, toDate } from './calendar';

/**
 * dateStr から offset 稼働日だけ移動した日付を返す。
 * 正の offset は addWorkingDays と同じ（dateStr 自体は数えない）。
 * 負の offset は過去方向に稼働日を数えて戻る。
 */
export function shiftWorkingDays(dateStr: string, offset: number, calendar: Calendar): string {
  if (offset >= 0) return addWorkingDays(dateStr, offset, calendar);

  let current = toDate(dateStr);
  let remaining = -offset;
  let guard = 0;
  while (remaining > 0 && guard < 3660) {
    current = addDays(current, -1);
    if (isWorkingDay(fromDate(current), calendar)) remaining--;
    guard++;
  }
  return fromDate(current);
}

/**
 * 依存制約から後続タスク側に要求される最早日付を返す。
 * - FS/FF: 先行の endDate 基準、SS/SF: 先行の startDate 基準
 * - lag は稼働日数（負も可）
 */
export function constraintDate(ref: DependencyRef, pred: Task, calendar: Calendar): string {
  const base = ref.type[0] === 'F' ? pred.endDate : pred.startDate;
  return shiftWorkingDays(base, ref.lag, calendar);
}

/**
 * 後続タスクが依存制約に違反しているか。
 * FS/SS は後続の startDate、FF/SF は後続の endDate と比較する。
 * (yyyy-MM-dd 文字列は辞書順比較で日付比較になる)
 */
export function isDepViolated(succ: Task, pred: Task, ref: DependencyRef, calendar: Calendar): boolean {
  const required = constraintDate(ref, pred, calendar);
  const actual = ref.type[1] === 'S' ? succ.startDate : succ.endDate;
  return actual < required;
}
