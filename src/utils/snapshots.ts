import type { Project } from '../types';

export interface SnapshotEntry {
  ts: number;
  project: Project;
}

export const SNAPSHOT_BUCKET_MS = 10 * 60 * 1000; // 10分
export const SNAPSHOT_MAX = 20;

/**
 * スナップショット配列に新しい世代を追加する（純関数）。
 * - 直近のスナップショットが同じ時間バケット（既定 10 分）なら置き換え、
 *   そうでなければ末尾に追加する
 * - 最大件数（既定 20）を超えたら古いものから捨てる
 * 配列は古い→新しい順。
 */
export function pushSnapshot(
  snaps: SnapshotEntry[],
  project: Project,
  now: number,
  bucketMs: number = SNAPSHOT_BUCKET_MS,
  max: number = SNAPSHOT_MAX,
): SnapshotEntry[] {
  const entry: SnapshotEntry = { ts: now, project };
  const bucket = Math.floor(now / bucketMs);
  const last = snaps[snaps.length - 1];

  let next: SnapshotEntry[];
  if (last && Math.floor(last.ts / bucketMs) === bucket) {
    next = [...snaps.slice(0, -1), entry];
  } else {
    next = [...snaps, entry];
  }

  if (next.length > max) {
    next = next.slice(next.length - max);
  }
  return next;
}
