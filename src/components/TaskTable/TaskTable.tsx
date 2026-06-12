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
  dependencies: number;
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

let canvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, fontSize: number, fontFamily: string = 'var(--font-body)', fontWeight: string = 'normal'): number {
  if (!canvas) {
    canvas = document.createElement('canvas');
  }
  const context = canvas.getContext('2d');
  if (!context) return text.length * fontSize * 0.6; // fallback

  // Expand CSS variables to real fonts for precise measurement
  let realFamily = fontFamily;
  if (fontFamily.includes('var(--font-body)')) {
    realFamily = 'Inter, system-ui, -apple-system, sans-serif';
  } else if (fontFamily.includes('var(--font-header)')) {
    realFamily = 'Outfit, system-ui, -apple-system, sans-serif';
  }

  context.font = `${fontWeight} ${fontSize}px ${realFamily}`;
  return context.measureText(text).width;
}

export function TaskTable() {
  const { project, dispatch, selectedTaskIds, setSelectedTaskIds } = useProject();
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside'>('after');
  const [manualWidths, setManualWidths] = useState<Partial<ColWidths>>(loadManualWidths);
  const [resizing, setResizing] = useState<string | null>(null);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const visibleTasks = getVisibleTasks(project.tasks);

  const effectiveColWidths = useMemo((): ColWidths => {
    // 1. Name column auto-width
    let autoName = measureTextWidth('タスク名', 11.5, 'var(--font-header)', '700');
    for (const task of visibleTasks) {
      const depth = getDepth(task.id, project.tasks);
      const hasChildren = project.tasks.some(t => t.parentId === task.id);
      
      const nameW = measureTextWidth(task.name, 13, 'var(--font-body)', 'normal');
      const indentW = depth * 16;
      const toggleW = hasChildren ? 24 : 18;
      const milestoneW = task.isMilestone ? 24 : 0;
      
      const totalW = nameW + indentW + toggleW + milestoneW;
      autoName = Math.max(autoName, totalW);
    }
    autoName = Math.min(500, Math.max(120, autoName + 24 + 6)); // padding (24) + buffer (6)

    // 2. Duration column auto-width
    let autoDuration = measureTextWidth('期間', 11.5, 'var(--font-header)', '700');
    for (const task of visibleTasks) {
      const text = `${task.duration}日`;
      autoDuration = Math.max(autoDuration, measureTextWidth(text, 13, 'var(--font-body)', 'normal'));
    }
    autoDuration = Math.max(60, autoDuration + 24 + 6);

    // 3. StartDate column auto-width
    let autoStart = measureTextWidth('開始日', 11.5, 'var(--font-header)', '700');
    for (const task of visibleTasks) {
      autoStart = Math.max(autoStart, measureTextWidth(task.startDate, 13, 'var(--font-body)', 'normal'));
    }
    autoStart = Math.max(80, autoStart + 24 + 6);

    // 4. EndDate column auto-width
    let autoEnd = measureTextWidth('終了日', 11.5, 'var(--font-header)', '700');
    for (const task of visibleTasks) {
      autoEnd = Math.max(autoEnd, measureTextWidth(task.endDate, 13, 'var(--font-body)', 'normal'));
    }
    autoEnd = Math.max(80, autoEnd + 24 + 6);

    // 5. Assignee column auto-width
    let autoAssignee = measureTextWidth('担当者', 11.5, 'var(--font-header)', '700');
    for (const task of visibleTasks) {
      autoAssignee = Math.max(autoAssignee, measureTextWidth(task.assignee || '-', 13, 'var(--font-body)', 'normal'));
    }
    autoAssignee = Math.max(80, autoAssignee + 24 + 6);

    // 6. Predecessor column auto-width
    let autoDeps = measureTextWidth('先行', 11.5, 'var(--font-header)', '700');
    for (const task of visibleTasks) {
      if (task.dependencies && task.dependencies.length > 0) {
        const indices = task.dependencies
          .map(dId => {
            const idx = project.tasks.findIndex(t => t.id === dId);
            return idx !== -1 ? String(idx + 1) : '';
          })
          .filter(Boolean);
        const text = indices.join(', ');
        autoDeps = Math.max(autoDeps, measureTextWidth(text, 13, 'var(--font-body)', 'normal'));
      }
    }
    autoDeps = Math.max(60, autoDeps + 24 + 6);

    return {
      name: manualWidths.name ?? autoName,
      duration: manualWidths.duration ?? autoDuration,
      startDate: manualWidths.startDate ?? autoStart,
      endDate: manualWidths.endDate ?? autoEnd,
      assignee: manualWidths.assignee ?? autoAssignee,
      dependencies: manualWidths.dependencies ?? autoDeps,
    };
  }, [visibleTasks, project.tasks, manualWidths]);

  const handleSelect = useCallback((id: string, ctrlKey: boolean, shiftKey: boolean) => {
    if (shiftKey && lastClickedId) {
      const idx1 = visibleTasks.findIndex(t => t.id === lastClickedId);
      const idx2 = visibleTasks.findIndex(t => t.id === id);
      if (idx1 !== -1 && idx2 !== -1) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        const rangeIds = visibleTasks.slice(start, end + 1).map(t => t.id);
        setSelectedTaskIds(rangeIds);
        setLastClickedId(id);
        return;
      }
    }

    if (ctrlKey) {
      setSelectedTaskIds(prev => {
        if (prev.includes(id)) {
          return prev.filter(x => x !== id);
        } else {
          return [...prev, id];
        }
      });
      setLastClickedId(id);
    } else {
      setSelectedTaskIds([id]);
      setLastClickedId(id);
    }
  }, [visibleTasks, lastClickedId, setSelectedTaskIds]);

  const handleDragStart = useCallback((id: string) => {
    if (selectedTaskIds.includes(id)) {
      setDraggedIds(selectedTaskIds);
    } else {
      setSelectedTaskIds([id]);
      setDraggedIds([id]);
    }
  }, [selectedTaskIds, setSelectedTaskIds]);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedIds.includes(id)) return;

    if (draggedIds.length > 0) {
      const isDescendant = draggedIds.some(dId => {
        const descendants = getDescendants(dId, project.tasks);
        return descendants.some(t => t.id === id);
      });
      if (isDescendant) {
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
  }, [draggedIds, project.tasks]);

  const handleDrop = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIds.length > 0 && !draggedIds.includes(id)) {
      dispatch({ type: 'REORDER_TASKS', ids: draggedIds, targetId: id, position: dropPosition });
    }
    setDraggedIds([]);
    setDropTargetId(null);
  }, [draggedIds, dropPosition, dispatch]);

  const handleDragEnd = useCallback(() => {
    setDraggedIds([]);
    setDropTargetId(null);
  }, []);

  const handleDragLeave = useCallback(() => {}, []);

  // Column resize
  const startResize = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.detail >= 2) {
      resetColumnWidth(col as keyof ColWidths);
      return;
    }
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
          <th
            className={styles.headerCell}
            data-col="name"
            style={getColStyle('name')}
            onDoubleClick={() => resetColumnWidth('name')}
            title="ダブルクリックで自動調整"
          >
            タスク名
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('name', e)}
            />
          </th>
          <th
            className={styles.headerCell}
            data-col="duration"
            style={getColStyle('duration')}
            onDoubleClick={() => resetColumnWidth('duration')}
            title="ダブルクリックで自動調整"
          >
            期間
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('duration', e)}
            />
          </th>
          <th
            className={styles.headerCell}
            data-col="startDate"
            style={getColStyle('startDate')}
            onDoubleClick={() => resetColumnWidth('startDate')}
            title="ダブルクリックで自動調整"
          >
            開始日
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('startDate', e)}
            />
          </th>
          <th
            className={styles.headerCell}
            data-col="endDate"
            style={getColStyle('endDate')}
            onDoubleClick={() => resetColumnWidth('endDate')}
            title="ダブルクリックで自動調整"
          >
            終了日
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('endDate', e)}
            />
          </th>
          <th
            className={styles.headerCell}
            data-col="assignee"
            style={getColStyle('assignee')}
            onDoubleClick={() => resetColumnWidth('assignee')}
            title="ダブルクリックで自動調整"
          >
            担当者
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('assignee', e)}
            />
          </th>
          <th
            className={styles.headerCell}
            data-col="dependencies"
            style={getColStyle('dependencies')}
            onDoubleClick={() => resetColumnWidth('dependencies')}
            title="ダブルクリックで自動調整"
          >
            先行
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => startResize('dependencies', e)}
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
              isSelected={selectedTaskIds.includes(task.id)}
              isDragged={draggedIds.includes(task.id)}
              showDropBefore={showDropBefore}
              showDropAfter={showDropAfter}
              showDropInside={showDropInside}
              colWidths={effectiveColWidths}
              onSelect={handleSelect}
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
        <tr style={{ height: 50 }}><td colSpan={6} /></tr>
      </tfoot>
    </table>
  );
}
