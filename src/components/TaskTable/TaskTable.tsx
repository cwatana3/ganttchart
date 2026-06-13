import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useProject } from '../../store/ProjectContext';
import { getFilteredVisibleTasks, getDepth, getDescendants, getWbsMap } from '../../utils/taskTree';
import { formatDeps } from '../../utils/deps';
import { TaskRow } from './TaskRow';
import styles from './TaskTable.module.css';

const MIN_COL_WIDTH = 40;
const STORAGE_KEY = 'gannt-column-widths';

export interface ColWidths {
  rowNum: number;
  wbs: number;
  name: number;
  duration: number;
  startDate: number;
  endDate: number;
  progress: number;
  assignee: number;
  dependencies: number;
  notes: number;
}

const COLUMNS: { key: keyof ColWidths; label: string }[] = [
  { key: 'rowNum', label: '#' },
  { key: 'wbs', label: 'WBS' },
  { key: 'name', label: 'タスク名' },
  { key: 'duration', label: '期間' },
  { key: 'startDate', label: '開始日' },
  { key: 'endDate', label: '終了日' },
  { key: 'progress', label: '進捗' },
  { key: 'assignee', label: '担当者' },
  { key: 'dependencies', label: '先行' },
  { key: 'notes', label: 'メモ' },
];

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
  const { project, dispatch, selectedTaskIds, setSelectedTaskIds, filterText } = useProject();
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside'>('after');
  const [manualWidths, setManualWidths] = useState<Partial<ColWidths>>(loadManualWidths);
  const [resizing, setResizing] = useState<string | null>(null);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const visibleTasks = getFilteredVisibleTasks(project.tasks, filterText);

  const rowNumMap = useMemo(
    () => new Map(project.tasks.map((t, i) => [t.id, i + 1])),
    [project.tasks],
  );
  const wbsMap = useMemo(() => getWbsMap(project.tasks), [project.tasks]);

  const effectiveColWidths = useMemo((): ColWidths => {
    const headerW = (label: string) => measureTextWidth(label, 11.5, 'var(--font-header)', '700');
    const bodyW = (text: string) => measureTextWidth(text, 13, 'var(--font-body)', 'normal');

    // 1. Row number column
    let autoRowNum = headerW('#');
    autoRowNum = Math.max(autoRowNum, bodyW(String(project.tasks.length)));
    autoRowNum = Math.max(36, autoRowNum + 24);

    // 2. WBS column
    let autoWbs = headerW('WBS');
    for (const task of visibleTasks) {
      autoWbs = Math.max(autoWbs, bodyW(wbsMap.get(task.id) ?? ''));
    }
    autoWbs = Math.max(44, autoWbs + 24);

    // 3. Name column (indent + toggle + milestone icon aware)
    let autoName = headerW('タスク名');
    for (const task of visibleTasks) {
      const depth = getDepth(task.id, project.tasks);
      const hasChildren = project.tasks.some(t => t.parentId === task.id);

      const nameW = bodyW(task.name);
      const indentW = depth * 16;
      const toggleW = hasChildren ? 24 : 18;
      const milestoneW = task.isMilestone ? 24 : 0;

      autoName = Math.max(autoName, nameW + indentW + toggleW + milestoneW);
    }
    autoName = Math.min(500, Math.max(120, autoName + 24 + 6)); // padding (24) + buffer (6)

    // 4. Duration column
    let autoDuration = headerW('期間');
    for (const task of visibleTasks) {
      autoDuration = Math.max(autoDuration, bodyW(`${task.duration}日`));
    }
    autoDuration = Math.max(60, autoDuration + 24 + 6);

    // 5. StartDate column
    let autoStart = headerW('開始日');
    for (const task of visibleTasks) {
      autoStart = Math.max(autoStart, bodyW(task.startDate));
    }
    autoStart = Math.max(80, autoStart + 24 + 6);

    // 6. EndDate column
    let autoEnd = headerW('終了日');
    for (const task of visibleTasks) {
      autoEnd = Math.max(autoEnd, bodyW(task.endDate));
    }
    autoEnd = Math.max(80, autoEnd + 24 + 6);

    // 7. Progress column
    let autoProgress = headerW('進捗');
    autoProgress = Math.max(autoProgress, bodyW('100%'));
    autoProgress = Math.max(56, autoProgress + 24);

    // 8. Assignee column
    let autoAssignee = headerW('担当者');
    for (const task of visibleTasks) {
      autoAssignee = Math.max(autoAssignee, bodyW(task.assignee || '-'));
    }
    autoAssignee = Math.max(80, autoAssignee + 24 + 6);

    // 9. Predecessor column
    let autoDeps = headerW('先行');
    for (const task of visibleTasks) {
      const text = formatDeps(task, project.tasks);
      if (text) {
        autoDeps = Math.max(autoDeps, bodyW(text));
      }
    }
    autoDeps = Math.max(60, autoDeps + 24 + 6);

    // 10. Notes column (cap so long notes don't blow up the layout)
    let autoNotes = headerW('メモ');
    for (const task of visibleTasks) {
      if (task.notes) {
        autoNotes = Math.max(autoNotes, bodyW(task.notes));
      }
    }
    autoNotes = Math.min(240, Math.max(60, autoNotes + 24 + 6));

    return {
      rowNum: manualWidths.rowNum ?? autoRowNum,
      wbs: manualWidths.wbs ?? autoWbs,
      name: manualWidths.name ?? autoName,
      duration: manualWidths.duration ?? autoDuration,
      startDate: manualWidths.startDate ?? autoStart,
      endDate: manualWidths.endDate ?? autoEnd,
      progress: manualWidths.progress ?? autoProgress,
      assignee: manualWidths.assignee ?? autoAssignee,
      dependencies: manualWidths.dependencies ?? autoDeps,
      notes: manualWidths.notes ?? autoNotes,
    };
  }, [visibleTasks, project.tasks, manualWidths, wbsMap]);

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
          {COLUMNS.map(col => (
            <th
              key={col.key}
              className={styles.headerCell}
              data-col={col.key}
              style={getColStyle(col.key)}
              onDoubleClick={() => resetColumnWidth(col.key)}
              title="ダブルクリックで自動調整"
            >
              {col.label}
              <span
                className={styles.resizeHandle}
                onMouseDown={(e) => startResize(col.key, e)}
              />
            </th>
          ))}
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
              rowNumber={rowNumMap.get(task.id) ?? 0}
              wbs={wbsMap.get(task.id) ?? ''}
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
        <tr style={{ height: 50 }}><td colSpan={COLUMNS.length} /></tr>
      </tfoot>
    </table>
  );
}
