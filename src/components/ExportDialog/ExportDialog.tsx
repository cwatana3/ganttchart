import { useMemo, useState, type ReactNode } from 'react';
import { useProject } from '../../store/ProjectContext';
import { useTheme } from '../../store/ThemeContext';
import { exportToSVG, exportToPNG, printGantt, type ExportDateRange, type PaperSize } from '../../utils/export';
import styles from './ExportDialog.module.css';

type Format = 'svg' | 'png' | 'print';
type Orientation = 'auto' | 'landscape' | 'portrait';

interface ExportDialogProps {
  onClose: () => void;
}

// ── アイコン（currentColor）──────────────────────────────────
function Svg({ size = 22, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function formatIcon(format: Format, size = 22): ReactNode {
  switch (format) {
    case 'svg':
      return <Svg size={size}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></Svg>;
    case 'png':
      return <Svg size={size}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></Svg>;
    case 'print':
      return <Svg size={size}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></Svg>;
  }
}

const FORMATS: { val: Format; label: string }[] = [
  { val: 'svg', label: 'SVG' },
  { val: 'png', label: 'PNG' },
  { val: 'print', label: '印刷' },
];

const PAPERS: { val: PaperSize; label: string }[] = [
  { val: 'A4', label: 'A4' },
  { val: 'A3', label: 'A3' },
  { val: 'Letter', label: 'レター' },
];

const ORIENTATIONS: { val: Orientation; label: string }[] = [
  { val: 'auto', label: '自動' },
  { val: 'landscape', label: '横' },
  { val: 'portrait', label: '縦' },
];

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

  // 印刷オプション
  const [fitToPage, setFitToPage] = useState(true);
  const [paper, setPaper] = useState<PaperSize>('A4');
  const [orientation, setOrientation] = useState<Orientation>('auto');

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
      printGantt(project, light, viewMode, showCriticalPath, range, { fitToPage, paper, orientation });
    }
    onClose();
  };

  const orientLabel = ORIENTATIONS.find(o => o.val === orientation)!.label;
  const printSummary = `${paper}・向き${orientLabel}・${fitToPage ? '1ページに収める' : '等倍'}`;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>エクスポート</h2>
        <p className={styles.subtitle}>ガント図を画像として書き出すか、印刷します。</p>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>形式</div>
          <div className={styles.formatGrid}>
            {FORMATS.map(({ val, label }) => (
              <button
                key={val}
                className={`${styles.formatCard} ${format === val ? styles.cardActive : ''}`}
                onClick={() => setFormat(val)}
              >
                <span className={styles.ficon}>{formatIcon(val)}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>期間</div>
          <div className={styles.segment}>
            <button
              className={`${styles.segmentBtn} ${!useRange ? styles.segActive : ''}`}
              onClick={() => setUseRange(false)}
            >
              全体
            </button>
            <button
              className={`${styles.segmentBtn} ${useRange ? styles.segActive : ''}`}
              onClick={() => setUseRange(true)}
            >
              範囲指定
            </button>
          </div>
          {useRange && (
            <div className={styles.dateRow}>
              <input
                type="date"
                className={styles.dateInput}
                value={start}
                onChange={e => setStart(e.target.value)}
              />
              <span className={styles.tilde}>〜</span>
              <input
                type="date"
                className={styles.dateInput}
                value={end}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
          )}
        </div>

        {format === 'print' && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>印刷レイアウト</div>
            <div className={styles.subPanel}>
              <div className={styles.optRow}>
                <span className={styles.optLabel}>倍率</span>
                <div className={styles.segment}>
                  <button
                    className={`${styles.segmentBtn} ${fitToPage ? styles.segActive : ''}`}
                    onClick={() => setFitToPage(true)}
                  >
                    1ページに収める
                  </button>
                  <button
                    className={`${styles.segmentBtn} ${!fitToPage ? styles.segActive : ''}`}
                    onClick={() => setFitToPage(false)}
                  >
                    等倍
                  </button>
                </div>
              </div>
              <div className={styles.optRow}>
                <span className={styles.optLabel}>用紙</span>
                <div className={styles.segment}>
                  {PAPERS.map(({ val, label }) => (
                    <button
                      key={val}
                      className={`${styles.segmentBtn} ${paper === val ? styles.segActive : ''}`}
                      onClick={() => setPaper(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.optRow}>
                <span className={styles.optLabel}>向き</span>
                <div className={styles.segment}>
                  {ORIENTATIONS.map(({ val, label }) => (
                    <button
                      key={val}
                      className={`${styles.segmentBtn} ${orientation === val ? styles.segActive : ''}`}
                      onClick={() => setOrientation(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.summary}>
                出力: <b>{printSummary}</b>
              </div>
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.closeButton} onClick={onClose}>キャンセル</button>
          <button className={styles.primaryButton} onClick={handleExport}>
            <span className={styles.ficon}>{formatIcon(format, 16)}</span>
            {format === 'print' ? '印刷する' : '書き出す'}
          </button>
        </div>
      </div>
    </div>
  );
}
