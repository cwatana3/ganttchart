import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import styles from './SplitPane.module.css';

const STORAGE_KEY = 'gannt-split-width';

function loadLeftWidth(defaultValue: number): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {}
  return defaultValue;
}

function saveLeftWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {}
}

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  scrollRef?: React.RefObject<HTMLDivElement>;
}

export function SplitPane({
  left,
  right,
  defaultLeftWidth = 480,
  minLeftWidth = 200,
  scrollRef,
}: SplitPaneProps) {
  const [leftWidth, setLeftWidth] = useState(() => loadLeftWidth(defaultLeftWidth));
  const dragging = useRef(false);

  useEffect(() => {
    saveLeftWidth(leftWidth);
  }, [leftWidth]);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      setLeftWidth(Math.max(minLeftWidth, Math.min(newWidth, rect.width - 200)));
    };

    const onMouseUp = () => {
      dragging.current = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [minLeftWidth]);

  // Scroll sync between left pane and Gantt scroll area
  useEffect(() => {
    const leftEl = leftRef.current;
    const scrollEl = scrollRef?.current;
    if (!leftEl || !scrollEl) return;

    const syncRight = () => {
      if (syncing.current) return;
      syncing.current = true;
      scrollEl.scrollTop = leftEl.scrollTop;
      syncing.current = false;
    };

    const syncLeft = () => {
      if (syncing.current) return;
      syncing.current = true;
      leftEl.scrollTop = scrollEl.scrollTop;
      syncing.current = false;
    };

    leftEl.addEventListener('scroll', syncRight, { passive: true });
    scrollEl.addEventListener('scroll', syncLeft, { passive: true });

    return () => {
      leftEl.removeEventListener('scroll', syncRight);
      scrollEl.removeEventListener('scroll', syncLeft);
    };
  }, [scrollRef?.current]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.left} ref={leftRef} style={{ width: leftWidth, flexShrink: 0 }}>
        {left}
      </div>
      <div className={styles.divider} onMouseDown={onMouseDown} />
      <div className={styles.right} ref={rightRef}>
        {right}
      </div>
    </div>
  );
}
