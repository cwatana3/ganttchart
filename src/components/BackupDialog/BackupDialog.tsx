import { useEffect, useState } from 'react';
import { useProject } from '../../store/ProjectContext';
import { loadSnapshots } from '../../utils/projectStore';
import type { SnapshotEntry } from '../../utils/snapshots';
import styles from '../CalendarSettings/CalendarSettings.module.css';

interface BackupDialogProps {
  onClose: () => void;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BackupDialog({ onClose }: BackupDialogProps) {
  const { activeProjectId, dispatch, setSelectedTaskIds } = useProject();
  const [snaps, setSnaps] = useState<SnapshotEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    loadSnapshots(activeProjectId).then(s => {
      if (active) setSnaps(s);
    });
    return () => { active = false; };
  }, [activeProjectId]);

  const handleRestore = (entry: SnapshotEntry) => {
    if (confirm(`${formatTs(entry.ts)} 時点の状態に復元しますか？現在の編集内容は上書きされます。`)) {
      dispatch({ type: 'LOAD_PROJECT', project: entry.project });
      setSelectedTaskIds([]);
      onClose();
    }
  };

  // 新しい世代を上に表示
  const ordered = snaps ? [...snaps].reverse() : [];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>バックアップ世代</h2>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>復元ポイント（最大20世代・10分間隔）</div>
          {snaps === null ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>読み込み中…</div>
          ) : ordered.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              まだバックアップがありません。編集すると自動的に記録されます。
            </div>
          ) : (
            <div className={styles.holidayList} style={{ maxHeight: 260 }}>
              {ordered.map((entry, i) => (
                <div key={entry.ts} className={styles.holidayItem}>
                  <span>
                    {formatTs(entry.ts)}
                    {i === 0 && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>（最新）</span>}
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                      {entry.project.tasks.length}件
                    </span>
                  </span>
                  <button className={styles.addButton} onClick={() => handleRestore(entry)}>
                    復元
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.closeButton} onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
