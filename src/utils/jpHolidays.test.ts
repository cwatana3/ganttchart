import { describe, it, expect } from 'vitest';
import { japaneseHolidays, japaneseHolidaysInRange } from './jpHolidays';

describe('japaneseHolidays', () => {
  it('2026年の主要な祝日を含む', () => {
    const map = new Map(japaneseHolidays(2026).map(h => [h.date, h.name]));
    expect(map.get('2026-01-01')).toBe('元日');
    expect(map.get('2026-01-12')).toBe('成人の日'); // 1月第2月曜
    expect(map.get('2026-02-11')).toBe('建国記念の日');
    expect(map.get('2026-02-23')).toBe('天皇誕生日');
    expect(map.get('2026-03-20')).toBe('春分の日');
    expect(map.get('2026-04-29')).toBe('昭和の日');
    expect(map.get('2026-05-03')).toBe('憲法記念日');
    expect(map.get('2026-05-04')).toBe('みどりの日');
    expect(map.get('2026-05-05')).toBe('こどもの日');
    expect(map.get('2026-07-20')).toBe('海の日'); // 7月第3月曜
    expect(map.get('2026-08-11')).toBe('山の日');
    expect(map.get('2026-09-21')).toBe('敬老の日'); // 9月第3月曜
    expect(map.get('2026-09-23')).toBe('秋分の日');
    expect(map.get('2026-10-12')).toBe('スポーツの日'); // 10月第2月曜
    expect(map.get('2026-11-03')).toBe('文化の日');
    expect(map.get('2026-11-23')).toBe('勤労感謝の日');
  });

  it('2026年の振替休日（5/3が日曜→5/6）を含む', () => {
    const map = new Map(japaneseHolidays(2026).map(h => [h.date, h.name]));
    expect(map.get('2026-05-06')).toBe('振替休日');
  });

  it('2026年の国民の休日（9/22）を含む', () => {
    const map = new Map(japaneseHolidays(2026).map(h => [h.date, h.name]));
    expect(map.get('2026-09-22')).toBe('国民の休日');
  });

  it('日付は昇順でソートされている', () => {
    const dates = japaneseHolidays(2026).map(h => h.date);
    const sorted = [...dates].sort((a, b) => a.localeCompare(b));
    expect(dates).toEqual(sorted);
  });

  it('範囲指定で複数年をまとめて返す', () => {
    const list = japaneseHolidaysInRange(2026, 2028);
    expect(list.some(h => h.date.startsWith('2026'))).toBe(true);
    expect(list.some(h => h.date.startsWith('2027'))).toBe(true);
    expect(list.some(h => h.date.startsWith('2028'))).toBe(true);
  });
});
