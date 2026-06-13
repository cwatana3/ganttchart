import { describe, it, expect } from 'vitest';
import { pushSnapshot, SNAPSHOT_BUCKET_MS, type SnapshotEntry } from './snapshots';
import type { Project } from '../types';

function makeProject(name: string): Project {
  return { name, calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [] }, tasks: [] };
}

const T0 = 1_700_000_000_000; // 任意の基準時刻（10分境界に揃える）
const base = Math.floor(T0 / SNAPSHOT_BUCKET_MS) * SNAPSHOT_BUCKET_MS;

describe('pushSnapshot', () => {
  it('空配列に1件追加する', () => {
    const next = pushSnapshot([], makeProject('A'), base);
    expect(next).toHaveLength(1);
    expect(next[0].project.name).toBe('A');
  });

  it('同じ10分バケット内では末尾を置き換える', () => {
    let snaps: SnapshotEntry[] = [];
    snaps = pushSnapshot(snaps, makeProject('A'), base);
    snaps = pushSnapshot(snaps, makeProject('B'), base + 60_000); // +1分（同バケット）
    expect(snaps).toHaveLength(1);
    expect(snaps[0].project.name).toBe('B');
    expect(snaps[0].ts).toBe(base + 60_000);
  });

  it('別バケットでは新しい世代を追加する', () => {
    let snaps: SnapshotEntry[] = [];
    snaps = pushSnapshot(snaps, makeProject('A'), base);
    snaps = pushSnapshot(snaps, makeProject('B'), base + SNAPSHOT_BUCKET_MS); // +10分
    expect(snaps).toHaveLength(2);
    expect(snaps.map(s => s.project.name)).toEqual(['A', 'B']);
  });

  it('最大件数を超えたら古いものを捨てる', () => {
    let snaps: SnapshotEntry[] = [];
    for (let i = 0; i < 25; i++) {
      snaps = pushSnapshot(snaps, makeProject(`P${i}`), base + i * SNAPSHOT_BUCKET_MS, SNAPSHOT_BUCKET_MS, 20);
    }
    expect(snaps).toHaveLength(20);
    // 最古は P5（P0〜P4 が捨てられる）、最新は P24
    expect(snaps[0].project.name).toBe('P5');
    expect(snaps[snaps.length - 1].project.name).toBe('P24');
  });

  it('配列は古い→新しい順を保つ', () => {
    let snaps: SnapshotEntry[] = [];
    snaps = pushSnapshot(snaps, makeProject('A'), base);
    snaps = pushSnapshot(snaps, makeProject('B'), base + SNAPSHOT_BUCKET_MS);
    snaps = pushSnapshot(snaps, makeProject('C'), base + 2 * SNAPSHOT_BUCKET_MS);
    expect(snaps.map(s => s.ts)).toEqual([...snaps.map(s => s.ts)].sort((a, b) => a - b));
  });
});
