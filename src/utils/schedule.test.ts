import { describe, it, expect } from 'vitest';
import { shiftWorkingDays, constraintDate, isDepViolated } from './schedule';
import type { Calendar, Task, DependencyRef } from '../types';

// 2026-06-08 (月) 〜 2026-06-12 (金) が平日の週
const calendar: Calendar = { workingDays: [1, 2, 3, 4, 5], holidays: [] };

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    name: overrides.id,
    startDate: '2026-06-08',
    endDate: '2026-06-12',
    duration: 4,
    parentId: null,
    isMilestone: false,
    progress: 0,
    collapsed: false,
    assignee: '',
    ...overrides,
  };
}

describe('shiftWorkingDays', () => {
  it('offset 0 はそのまま返す', () => {
    expect(shiftWorkingDays('2026-06-10', 0, calendar)).toBe('2026-06-10');
  });

  it('正の offset は addWorkingDays と同じ（土日スキップ）', () => {
    // 金曜 + 1稼働日 = 月曜
    expect(shiftWorkingDays('2026-06-12', 1, calendar)).toBe('2026-06-15');
    expect(shiftWorkingDays('2026-06-10', 2, calendar)).toBe('2026-06-12');
  });

  it('負の offset は過去方向に稼働日を数える', () => {
    // 月曜 - 1稼働日 = 前の金曜
    expect(shiftWorkingDays('2026-06-15', -1, calendar)).toBe('2026-06-12');
    expect(shiftWorkingDays('2026-06-12', -2, calendar)).toBe('2026-06-10');
  });

  it('祝日もスキップする', () => {
    const cal: Calendar = { workingDays: [1, 2, 3, 4, 5], holidays: ['2026-06-11'] };
    expect(shiftWorkingDays('2026-06-10', 1, cal)).toBe('2026-06-12');
    expect(shiftWorkingDays('2026-06-12', -1, cal)).toBe('2026-06-10');
  });
});

describe('constraintDate', () => {
  const pred = makeTask({ id: 'p', startDate: '2026-06-08', endDate: '2026-06-12' });

  it('FS は先行の endDate 基準', () => {
    const ref: DependencyRef = { id: 'p', type: 'FS', lag: 0 };
    expect(constraintDate(ref, pred, calendar)).toBe('2026-06-12');
  });

  it('SS は先行の startDate 基準', () => {
    const ref: DependencyRef = { id: 'p', type: 'SS', lag: 0 };
    expect(constraintDate(ref, pred, calendar)).toBe('2026-06-08');
  });

  it('ラグを稼働日で加算する', () => {
    const ref: DependencyRef = { id: 'p', type: 'FS', lag: 2 };
    // 金曜 + 2稼働日 = 火曜
    expect(constraintDate(ref, pred, calendar)).toBe('2026-06-16');
  });

  it('負のラグは前倒しする', () => {
    const ref: DependencyRef = { id: 'p', type: 'FS', lag: -1 };
    expect(constraintDate(ref, pred, calendar)).toBe('2026-06-11');
  });
});

describe('isDepViolated', () => {
  const pred = makeTask({ id: 'p', startDate: '2026-06-08', endDate: '2026-06-12' });

  it('FS: 後続の開始が先行の終了以降なら違反なし', () => {
    const succ = makeTask({ id: 's', startDate: '2026-06-12', endDate: '2026-06-17' });
    expect(isDepViolated(succ, pred, { id: 'p', type: 'FS', lag: 0 }, calendar)).toBe(false);
  });

  it('FS: 後続の開始が先行の終了より前なら違反', () => {
    const succ = makeTask({ id: 's', startDate: '2026-06-10', endDate: '2026-06-16' });
    expect(isDepViolated(succ, pred, { id: 'p', type: 'FS', lag: 0 }, calendar)).toBe(true);
  });

  it('SS: 後続の開始と先行の開始を比較する', () => {
    const early = makeTask({ id: 's', startDate: '2026-06-05', endDate: '2026-06-10' });
    const ok = makeTask({ id: 's', startDate: '2026-06-08', endDate: '2026-06-12' });
    expect(isDepViolated(early, pred, { id: 'p', type: 'SS', lag: 0 }, calendar)).toBe(true);
    expect(isDepViolated(ok, pred, { id: 'p', type: 'SS', lag: 0 }, calendar)).toBe(false);
  });

  it('FF: 後続の終了と先行の終了を比較する', () => {
    const early = makeTask({ id: 's', startDate: '2026-06-05', endDate: '2026-06-10' });
    const ok = makeTask({ id: 's', startDate: '2026-06-08', endDate: '2026-06-12' });
    expect(isDepViolated(early, pred, { id: 'p', type: 'FF', lag: 0 }, calendar)).toBe(true);
    expect(isDepViolated(ok, pred, { id: 'p', type: 'FF', lag: 0 }, calendar)).toBe(false);
  });

  it('SF: 後続の終了と先行の開始を比較する', () => {
    const early = makeTask({ id: 's', startDate: '2026-06-01', endDate: '2026-06-05' });
    const ok = makeTask({ id: 's', startDate: '2026-06-05', endDate: '2026-06-08' });
    expect(isDepViolated(early, pred, { id: 'p', type: 'SF', lag: 0 }, calendar)).toBe(true);
    expect(isDepViolated(ok, pred, { id: 'p', type: 'SF', lag: 0 }, calendar)).toBe(false);
  });

  it('ラグ付き FS: ラグぶん遅らせないと違反', () => {
    const succ = makeTask({ id: 's', startDate: '2026-06-15', endDate: '2026-06-19' });
    expect(isDepViolated(succ, pred, { id: 'p', type: 'FS', lag: 2 }, calendar)).toBe(true);
    const succOk = makeTask({ id: 's', startDate: '2026-06-16', endDate: '2026-06-19' });
    expect(isDepViolated(succOk, pred, { id: 'p', type: 'FS', lag: 2 }, calendar)).toBe(false);
  });
});
