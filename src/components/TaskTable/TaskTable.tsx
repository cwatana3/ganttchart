import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useProject } from '../../store/ProjectContext';
import { getVisibleTasks, getDepth, getDescendants } from '../../utils/taskTree';
import { TaskRow } from './TaskRow';
import styles from './TaskTable.module.css';

const MIN_COL_WIDTH = 40;
const STORAGE_KEY = 'gannt-column-widths';

interface ColWidths {
  name: number;
  duration: number;
  startDate: number;
  endDate: number;
  assignee: number;
}

function loadManualWidths(): Partial<ColWidths> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
}

function saveManualWidths(widths: Partial<ColWidths>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {}
}

let measureEl: HTMLSpanElement | null = null;
function measureTextWidth(text: string, fontSize: number): number {
  if (!measureEl) {
    measureEl = document.createElement('span');
    measureEl.style.position = 'absolute';
    measureEl.style.visibility = 'hidden';
    measureEl.style.whiteSpace = 'nowrap';
    measureEl.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    document.body.appendChild(measureEl);
  }
  measureEl.style.fontSize = `${fontSize}px`;
  measureEl.textContent = text;
  return measureEl.getBoundingClientRect().width;
}

export function TaskTable() {
  const { project, dispatch, selectedTaskId, setSelectedTaskId } = useProject();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside'>('after');
  const [manualWidths, setManualWidths] = useState<Partial<ColWidths>>(loadManualWidths);
  const [resizing, setResizing] = useState<string | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const visibleTasks = getVisibleTasks(project.tasks);

  // Auto-calculate column widths based on content
  const effectiveColWidths = useMemo((): ColWidths => {
    // 1. Name column auto-width
    let autoName = measureTextWidth('タスク名', 11);
    for (const task of visibleTasks) {
      const indent = '  '.repeat(getDepth(task.id, project.tasks));
      const prefix = task.isMilestone ? '◆ ' : indent + (indent ? '├ ' : '');
      const text = prefix + task.name;
      autoName = Math.max(autoName, measureTextWidth(text, 13));
    }
    autoName = Math.min(500, Math.max(120, autoName + 24));

    // 2. Duration column auto-width
    let autoDuration = measureTextWidth('期間', 11);
    for (const task of visibleTasks) {
      const text = `${task.duration}日`;
      autoDuration = Math.max(autoDuration, measureTextWidth(text, 13));
    }
    autoDuration = Math.max(60, autoDuration + 24);

    // 3. StartDate column auto-width
    let autoStart = measureTextWidth('開始日', 11);
    for (const task of visibleTasks) {
      autoStart = Math.max(autoStart, measureTextWidth(task.startDate, 13));
    }
    autoStart = Math.max(80, autoStart + 24);

    // 4. EndDate column auto-width
    let autoEnd = measureTextWidth('終了日', 11);
    for (const task of visibleTasks) {
      autoEnd = Math.max(autoEnd, measureTextWidth(task.endDate, 13));
    }
    autoEnd = Math.max(80, autoEnd + 24);

    // 5. Assignee column auto-width
    let autoAssignee = measureTextWidth('担当者', 11);
    for (const task of visibleTasks) {
      autoAssignee = Math.max(autoAssignee, measureTextWidth(task.assignee || '-', 13));
    }
    autoAssignee = Math.max(80, autoAssignee + 24);

    return {
      name: manualWidths.name ?? autoName,
      duration: manualWidths.duration ?? autoDuration,
      startDate: manualWidths.startDate ?? autoStart,
      endDate: manualWidths.endDate ?? autoEnd,
      assignee: manualWidths.assignee ?? autoAssignee,
    };
  }, [visibleTasks, project.tasks, manualWidths]);

  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id === draggedId) return;

    if (draggedId) {
      const descendants = getDescendants(draggedId, project.tasks);
      if (descendants.some(t => t.id === id)) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
    }

    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    let pos: 'before' | 'after' | 'inside';
    if (relY < rect.height * 0.25) {
      pos = 'before';
    } else if (relY > rect.height * 0.75) {
      pos = 'after';
    } else {
      pos = 'inside';
    }
    setDropTargetId(id);
    setDropPosition(pos);
  }, [draggedId, project.tasks]);

  const handleDrop = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedId && draggedId !== id) {
      dispatch({ type: 'REORDER_TASK', id: draggedId, targetId: id, position: dropPosition });
    }
    setDraggedId(null);
    setDropTargetId(null);
  }, [draggedId, dropPosition, dispatch]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
  }, []);

  const handleDragLeave = useCallback(() => {}, []);

  // Column resize
  const startResize = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = effectiveColWidths[col as keyof ColWidths];
    setResizing(col);
  };

  const resetColumnWidth = (col: keyof ColWidths) => {
    setManualWidths(prev => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
  };

  useEffect(() => {
    if (!resizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartXRef.current;
      const newWidth = Math.max(MIN_COL_WIDTH, resizeStartWidthRef.current + delta);
      setManualWidths(prev => ({ ...prev, [resizing]: newWidth }));
    };

    const onMouseUp = () => setResizing(null);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [resizing]);

  const getColStyle = (col: keyof ColWidths): React.CSSProperties | undefined => {
    return { width: effectiveColWidths[col], minWidth: effectiveColWidths[col] };
  };

  useEffect(() => {
    saveManualWidths(manualWidths);
  }, [manualWidths]);

  return (
    <table className={styles.table} ref={tableRef}>
      <thead>
        <tr className={styles.headerRow}>
          <th className={styles.headerCell} data-col="name" style={getColStyle('name')}>
            タスク名
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('name', e)}
              onDoubleClick={() => resetColumnWidth('name')}
              title="ダブルクリックで自動調整"
            />
          </th>
          <th className={styles.headerCell} data-col="duration" style={getColStyle('duration')}>
            期間
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('duration', e)}
              onDoubleClick={() => resetColumnWidth('duration')}
              title="ダブルクリックで自動調整"
            />
          </th>
          <th className={styles.headerCell} data-col="startDate" style={getColStyle('startDate')}>
            開始日
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('startDate', e)}
              onDoubleClick={() => resetColumnWidth('startDate')}
              title="ダブルクリックで自動調整"
            />
          </th>
          <th className={styles.headerCell} data-col="endDate" style={getColStyle('endDate')}>
            終了日
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('endDate', e)}
              onDoubleClick={() => resetColumnWidth('endDate')}
              title="ダブルクリックで自動調整"
            />
          </th>
          <th className={styles.headerCell} data-col="assignee" style={getColStyle('assignee')}>
            担当者
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('assignee', e)}
              onDoubleClick={() => resetColumnWidth('assignee')}
              title="ダブルクリックで自動調整"
            />
          </th>
        </tr>
      </thead>
      <tbody>
        {visibleTasks.map((task) => {
          const showDropBefore = dropTargetId === task.id && dropPosition === 'before';
          const showDropAfter = dropTargetId === task.id && dropPosition === 'after';
          const showDropInside = dropTargetId === task.id && dropPosition === 'inside';

          return (
            <TaskRow
              key={task.id}
              task={task}
              isSelected={task.id === selectedTaskId}
              isDragged={task.id === draggedId}
              showDropBefore={showDropBefore}
              showDropAfter={showDropAfter}
              showDropInside={showDropInside}
              colWidths={effectiveColWidths}
              onSelect={setSelectedTaskId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onDragLeave={handleDragLeave}
            />
          );
        })}
      </tbody>
      <tfoot>
        <tr style={{ height: 50 }}><td colSpan={5} /></tr>
      </tfoot>
    </table>
  );
}
