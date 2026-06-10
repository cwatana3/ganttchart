import { describe, it, expect } from 'vitest';
import {
  isWorkingDay,
  addWorkingDays,
  countWorkingDays,
  getWorkingDaysBetween,
} from './calendar';
import type { Calendar } from '../types';

const defaultCalendar: Calendar = {
  workingDays: [1, 2, 3, 4, 5], // 月-金
  holidays: [],
};

const calendarWithHolidays: Calendar = {
  workingDays: [1, 2, 3, 4, 5],
  holidays: ['2026-06-15', '2026-06-16'],
};

describe('isWorkingDay', () => {
  it('returns true for Monday (2026-06-08)', () => {
    expect(isWorkingDay('2026-06-08', defaultCalendar)).toBe(true);
  });

  it('returns false for Saturday (2026-06-13)', () => {
    expect(isWorkingDay('2026-06-13', defaultCalendar)).toBe(false);
  });

  it('returns false for Sunday (2026-06-14)', () => {
    expect(isWorkingDay('2026-06-14', defaultCalendar)).toBe(false);
  });

  it('returns false for holiday', () => {
    expect(isWorkingDay('2026-06-15', calendarWithHolidays)).toBe(false);
  });
});

describe('addWorkingDays', () => {
  it('adds 1 working day (Monday to Tuesday)', () => {
    expect(addWorkingDays('2026-06-08', 1, defaultCalendar)).toBe('2026-06-09');
  });

  it('skips weekend when adding 5 days from Monday', () => {
    expect(addWorkingDays('2026-06-08', 5, defaultCalendar)).toBe('2026-06-15');
  });

  it('skips holidays', () => {
    expect(addWorkingDays('2026-06-12', 2, calendarWithHolidays)).toBe('2026-06-18');
  });

  it('returns same date for duration 0', () => {
    expect(addWorkingDays('2026-06-08', 0, defaultCalendar)).toBe('2026-06-08');
  });
});

describe('countWorkingDays', () => {
  it('counts 5 working days in a full week', () => {
    expect(countWorkingDays('2026-06-08', '2026-06-14', defaultCalendar)).toBe(5);
  });

  it('counts 0 for same start and end', () => {
    expect(countWorkingDays('2026-06-08', '2026-06-08', defaultCalendar)).toBe(0);
  });

  it('skips holidays in count', () => {
    expect(countWorkingDays('2026-06-15', '2026-06-17', calendarWithHolidays)).toBe(1);
  });
});

describe('getWorkingDaysBetween', () => {
  it('returns date strings for working days in range', () => {
    const days = getWorkingDaysBetween('2026-06-08', '2026-06-10', defaultCalendar);
    expect(days).toEqual(['2026-06-08', '2026-06-09', '2026-06-10']);
  });
});
