import { useMemo, useState } from 'react';
import { useProject } from '../../store/ProjectContext';
import { useTheme } from '../../store/ThemeContext';
import { exportToSVG, exportToPNG, printGantt, type ExportDateRange } from '../../utils/export';
import styles from '../CalendarSettings/CalendarSettings.module.css';

type Format = 'svg' | 'png' | 'print';

interface ExportDialogProps {
  onClose: () => void;
}

export function ExportDialog({ onClose }: ExportDialogProps) {
  const { project, viewMode, showCriticalPath } = useProject();
  const { light } = useTheme();

  // プロジェクト全体の期間（範囲指定のデフォルト）
  const span = useMemo(() => {
    let min = '';
    let max = '';
    for (const t of project.tasks) {
      if (!min || t.startDate < min) min = t.startDate;
      if (!max || t.endDate > max) max = t.endDate;
    }
    return { min, max };
  }, [project.tasks]);

  const [format, setFormat] = useState<Format>('svg');
  const [useRange, setUseRange] = useState(false);
  const [start, setStart] = useState(span.min);
  const [end, setEnd] = useState(span.max);

  const handleExport = async () => {
    const range: ExportDateRange | undefined = useRange
      ? { start: start || undefined, end: end || undefined }
      : undefined;
    if (format === 'svg') {
      exportToSVG(project, light, viewMode, showCriticalPath, range);
    } else if (format === 'png') {
      try {
        await exportToPNG(project, light, viewMode, showCriticalPath, 2, range);
      } catch {
        alert('PNGの書き出しに失敗しました');
      }
    } else {
      printGantt(project, light, viewMode, showCriticalPath, range);
    }
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>エクスポート</h2>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>形式</div>
          <div className={styles.dayGrid}>
            {([['svg', 'SVG'], ['png', 'PNG'], ['print', '印刷']] as const).map(([val, label]) => (
              <button
                key={val}
                className={`${styles.dayButton} ${format === val ? styles.active : ''}`}
                style={{ width: 'auto', padding: '0 16px' }}
                onClick={() => setFormat(val)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>期間</div>
          <div className={styles.dayGrid} style={{ marginBottom: 12 }}>
            <button
              className={`${styles.dayButton} ${!useRange ? styles.active : ''}`}
              style={{ width: 'auto', padding: '0 16px' }}
              onClick={() => setUseRange(false)}
            >
              全体
            </button>
            <button
              className={`${styles.dayButton} ${useRange ? styles.active : ''}`}
              style={{ width: 'auto', padding: '0 16px' }}
              onClick={() => setUseRange(true)}
            >
              範囲指定
            </button>
          </div>
          {useRange && (
            <div className={styles.addHolidayRow}>
              <input
                type="date"
                className={styles.dateInput}
                value={start}
                onChange={e => setStart(e.target.value)}
              />
              <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>〜</span>
              <input
                type="date"
                className={styles.dateInput}
                value={end}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.closeButton} onClick={onClose}>キャンセル</button>
          <button className={styles.addButton} onClick={handleExport}>エクスポート実行</button>
        </div>
      </div>
    </div>
  );
}
